/**
 * 資料同步：畫面永遠先用手機上的那份（打開就有），背景再跟伺服器對。
 *
 * 新增／修改／刪除先改手機上的畫面（立刻看到），同時排進「待上傳」佇列依序送出；
 * 沒網路就留著，連上網、回到 app、或每 15 秒自動重送。新增的 id 由手機產生，
 * 伺服器看到同一個 id 不會重複新增，所以重送不怕重複。
 *
 * 幾條保命規則（都有測試：tests/store.test.ts）：
 * - 送出去過的動作（可能已經到伺服器、只是回應沒回來）不再跟後面的改動合併，
 *   後面的改動另外排隊送，不然「新增後馬上改金額」的改動會不見。
 * - 跟同一筆合併時找「最後一個」排隊的動作（刪 → 復原 → 再刪 才會是刪掉）。
 * - 抓資料（GET）期間如果自己的改動送到了伺服器，那份回應可能比改動舊：丟掉、重抓。
 * - 每送成功一個就把手機上的資料存起來（中途關 app 也不會少一筆）。
 * - 只有伺服器明確說「這筆資料不對」才丟掉（400/409/413/422、修改時 404）；
 *   其他錯誤（伺服器掛了、正在換版）都留著重送。
 */
import { useSyncExternalStore } from "react";
import { normalizeMeta } from "./analytics";
import { CURRENCY_SYMBOL, nowLocalIso } from "./format";
import type { Data, Meta, Txn } from "./types";

export interface TxnInput {
  id?: string;
  created_at?: string;
  date: string;
  person: string;
  type: string;
  category: string;
  item: string;
  amount: number;
  note: string;
  currency: string;
  split: string;
  source?: string;
  location?: string;
}

type Op =
  | { op: "add"; id: string; txn: TxnInput; sent?: boolean; tries?: number }
  | { op: "update"; id: string; txn: TxnInput; sent?: boolean; tries?: number; restore?: boolean }
  | { op: "delete"; id: string; sent?: boolean; tries?: number }
  | { op: "meta"; id: string; patch: Partial<Meta>; sent?: boolean; tries?: number };

export interface Snapshot {
  data: Data | null; // 已套上待上傳的變更
  pending: number;
  pendingIds: Set<string>;
  loading: boolean; // 第一次載入、手機上還沒有任何資料
  syncing: boolean;
  offline: boolean;
  lastSync: number | null;
  error: string | null; // 第一次載入失敗的原因
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const CACHE_KEY = "ledger.cache.v2";
const OUTBOX_KEY = "ledger.outbox.v2";
const TIMEOUT_MS = 12_000;
const RETRY_MS = 15_000;
const FAIL_NOTICE_AFTER = 5; // 同一個動作連續失敗幾次才跳提示

function load<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 私密瀏覽或空間滿了：不存也能用，只是下次打開要等網路 */
  }
}

export function newId(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

interface Reply {
  status: number;
  etag: string | null;
  json: unknown;
}

/** 送一個請求，連回應內容一起在時限內讀完（不然網路卡在一半，同步會整個卡住）。 */
async function request(method: string, url: string, body?: unknown,
  headers: Record<string, string> = {}): Promise<Reply> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const hdrs: Record<string, string> = { ...headers };
    if (method !== "GET") hdrs["X-Ledger"] = "1"; // 伺服器擋跨站偷改：會改資料的請求都要帶
    if (body !== undefined) hdrs["Content-Type"] = "application/json";
    const res = await fetch(url, {
      method,
      headers: hdrs,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: ctrl.signal,
    });
    const text = res.status === 304 ? "" : await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (res.status >= 400) {
      const j = json as { error?: string; detail?: { msg: string }[] } | null;
      const msg = j?.error ?? (Array.isArray(j?.detail) ? j!.detail!.map((d) => d.msg).join("；") : `HTTP ${res.status}`);
      throw new HttpError(res.status, msg);
    }
    if (res.status < 300 && json === null) {
      throw new HttpError(502, "伺服器回的不是記帳本的資料（是不是正在換版？）");
    }
    return { status: res.status, etag: res.headers.get("ETag"), json };
  } finally {
    clearTimeout(timer);
  }
}

/** 伺服器明確拒絕這筆資料（重送也沒用）→ 丟掉並告訴使用者；其他錯誤都留著重送。 */
function rejected(e: unknown, op: Op): boolean {
  if (!(e instanceof HttpError)) return false;
  if ([400, 409, 413, 422].includes(e.status)) return true;
  return e.status === 404 && op.op === "update";
}

/** 跟後端 lib/fx.lock_to_cad 一樣：非 CAD 的金額換成 CAD、原幣寫進備註（畫面先這樣顯示）。 */
function lockFx(t: TxnInput, rates: Record<string, number>): TxnInput {
  if (!t.currency || t.currency === "CAD") return { ...t, currency: "CAD" };
  const rate = rates[t.currency];
  if (!rate) return t;
  const sym = CURRENCY_SYMBOL[t.currency] ?? `${t.currency} `;
  const orig = `原幣 ${sym}${t.amount.toFixed(2)} @${rate.toFixed(4)}`;
  // 只拿掉系統自己加的「原幣 US$10.00 @1.4000」前綴（使用者自己打的字不動）
  const note = t.note.trim().replace(/^原幣 (?:CA\$|US\$|NT\$|[A-Z]{3} )[\d,]+\.\d{2} @\d+\.\d{4}(?:｜|$)/, "").trim();
  return { ...t, amount: Math.round(t.amount * rate * 100) / 100, currency: "CAD",
    note: note ? `${orig}｜${note}` : orig };
}

function toTxn(t: TxnInput, rates: Record<string, number>, old?: Txn): Txn {
  const x = lockFx(t, rates);
  const settle = x.type === "settle";
  return {
    id: x.id!,
    created_at: x.created_at ?? old?.created_at ?? nowLocalIso(),
    date: x.date,
    person: x.person,
    type: x.type,
    category: settle ? "結清" : x.category,
    item: settle ? x.item || "結清" : x.item,
    amount: x.amount,
    note: x.note,
    source: x.source ?? old?.source ?? "app",
    currency: x.currency,
    split: x.type === "expense" ? x.split : "own",
    location: x.location ?? old?.location ?? "",
  };
}

function upsert(list: Txn[], t: Txn): Txn[] {
  const i = list.findIndex((x) => x.id === t.id);
  if (i < 0) return [...list, t];
  const out = list.slice();
  out[i] = t;
  return out;
}

export class Store {
  private server: Data | null;
  private etag: string | null;
  private outbox: Op[];
  private syncing = false;
  private offline = false;
  private lastSync: number | null = null;
  private error: string | null = null;
  private fetching: Promise<void> | null = null;
  private refetchAfter = false;
  private opsDone = 0; // 送成功的動作數：抓資料期間有變，表示那份回應可能比較舊
  private flushing: Promise<void> | null = null;
  private flushAgain = false;
  private inflight: Op | null = null;
  private listeners = new Set<() => void>();
  private noticeFns = new Set<(msg: string) => void>();
  private snap: Snapshot;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const cached = load<{ data: Data; etag: string | null; at: number }>(CACHE_KEY);
    this.server = cached?.data ?? null;
    this.etag = cached?.etag ?? null;
    this.lastSync = cached?.at ?? null;
    this.outbox = load<Op[]>(OUTBOX_KEY) ?? [];
    this.snap = this.build();
  }

  // ---- 給 React 用 ----------------------------------------------------------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snap;

  /** 正在送或正在抓（測試用來等它做完）。 */
  get busy(): boolean {
    return this.flushing !== null || this.fetching !== null;
  }

  onNotice(fn: (msg: string) => void): () => void {
    this.noticeFns.add(fn);
    return () => {
      this.noticeFns.delete(fn);
    };
  }

  private notice(msg: string) {
    this.noticeFns.forEach((f) => f(msg));
  }

  private build(): Snapshot {
    let data = this.server;
    if (data) {
      let txns = data.transactions;
      let meta = data.meta;
      const rates = data.rates ?? { CAD: 1 };
      for (const op of this.outbox) {
        if (op.op === "add" || op.op === "update") {
          const old = txns.find((t) => t.id === op.id);
          txns = upsert(txns, toTxn({ ...op.txn, id: op.id }, rates, old));
        } else if (op.op === "delete") {
          txns = txns.filter((t) => t.id !== op.id);
        } else {
          meta = { ...meta, ...op.patch };
        }
      }
      data = { ...data, transactions: txns, meta: normalizeMeta(meta) };
    }
    return {
      data,
      pending: this.outbox.length,
      pendingIds: new Set(this.outbox.filter((o) => o.op !== "meta").map((o) => o.id)),
      loading: !this.server && !this.error,
      syncing: this.syncing,
      offline: this.offline,
      lastSync: this.lastSync,
      error: this.server ? null : this.error,
    };
  }

  private emit() {
    this.snap = this.build();
    this.listeners.forEach((f) => f());
  }

  private persistServer() {
    if (this.server) save(CACHE_KEY, { data: this.server, etag: this.etag, at: this.lastSync });
  }

  private persistOutbox() {
    save(OUTBOX_KEY, this.outbox);
  }

  // ---- 讀 -------------------------------------------------------------------
  /**
   * 跟伺服器拿最新的（沒變的話伺服器回 304，幾乎不花流量）。
   * force：已經在抓的話，抓完再抓一次（那一份可能比剛送到的改動舊）。
   */
  refresh(force = false): Promise<void> {
    if (this.fetching) {
      if (force) this.refetchAfter = true;
      return this.fetching;
    }
    this.fetching = (async () => {
      this.syncing = true;
      this.emit();
      const opsAtStart = this.opsDone;
      try {
        const res = await request("GET", "/api/data", undefined,
          this.etag && this.server ? { "If-None-Match": this.etag } : {});
        if (this.opsDone !== opsAtStart) {
          this.refetchAfter = true; // 抓的時候自己的改動剛送到：這份可能是舊的，不用
        } else if (res.status !== 304 && res.json) {
          const data = res.json as Data;
          this.server = { ...data, meta: normalizeMeta(data.meta) };
          this.etag = res.etag;
        }
        this.lastSync = Date.now();
        this.offline = false;
        this.error = null;
        this.persistServer();
      } catch (e) {
        this.offline = !(e instanceof HttpError);
        this.error = e instanceof HttpError ? `伺服器出錯：${e.message}` : "連不上記帳本（沒網路，或不在 tailnet 上）";
      } finally {
        this.syncing = false;
        this.fetching = null;
        this.emit();
      }
      if (this.refetchAfter) {
        this.refetchAfter = false;
        await this.refresh();
      }
    })();
    return this.fetching;
  }

  // ---- 寫 -------------------------------------------------------------------
  private enqueue(op: Op) {
    // 找同一筆「最後一個」排隊的動作；它還沒送出去過才合併（送出去過的可能已經到伺服器了，不能動）
    let i = -1;
    if (op.op !== "meta") {
      for (let k = this.outbox.length - 1; k >= 0; k--) {
        const o = this.outbox[k];
        if (o.op !== "meta" && o.id === op.id) {
          i = o.sent || o === this.inflight ? -1 : k;
          break;
        }
      }
    }
    const prev = i >= 0 ? this.outbox[i] : null;
    if (prev && op.op === "update" && (prev.op === "add" || prev.op === "update")) {
      // 合併改動，保留原本的建立時間
      this.outbox[i] = { ...prev, txn: { ...op.txn, created_at: prev.txn.created_at ?? op.txn.created_at } };
    } else if (prev && op.op === "delete" && prev.op === "add") {
      this.outbox.splice(i, 1); // 這次新增根本還沒送：一起取消
    } else if (prev && op.op === "delete" && prev.op === "update") {
      this.outbox[i] = op;
    } else if (prev && op.op === "delete" && prev.op === "delete") {
      /* 已經要刪了 */
    } else if (prev && op.op === "add" && prev.op === "delete") {
      // 刪除還沒送出就按了復原：伺服器上那筆還在，改成「改回復原的內容」；
      // 萬一送到時對方已經刪了（404），就改成新增回去（restore 標記）
      this.outbox[i] = { op: "update", id: op.id, txn: op.txn, restore: true };
    } else {
      this.outbox.push(op);
    }
    this.persistOutbox();
    this.emit();
    void this.flush();
  }

  add(t: TxnInput): string {
    const id = t.id ?? newId();
    this.enqueue({ op: "add", id, txn: { ...t, id, created_at: t.created_at ?? nowLocalIso() } });
    return id;
  }

  update(id: string, t: TxnInput) {
    this.enqueue({ op: "update", id, txn: { ...t, id } });
  }

  /** 刪除；回傳原本那筆，給「復原」用。 */
  remove(id: string): Txn | null {
    const old = this.snap.data?.transactions.find((t) => t.id === id) ?? null;
    this.enqueue({ op: "delete", id });
    return old;
  }

  /** 復原刪除：同一個 id、同一個建立時間加回去。 */
  restore(t: Txn) {
    this.enqueue({
      op: "add", id: t.id,
      txn: { id: t.id, created_at: t.created_at, date: t.date, person: t.person, type: t.type,
        category: t.category, item: t.item, amount: t.amount, note: t.note,
        currency: t.currency, split: t.split, source: t.source, location: t.location ?? "" },
    });
  }

  saveMeta(patch: Partial<Meta>) {
    this.enqueue({ op: "meta", id: newId(), patch });
  }

  private async send(op: Op): Promise<unknown> {
    if (op.op === "add") {
      return ((await request("POST", "/api/transactions", { ...op.txn, id: op.id })).json as { txn: Txn }).txn;
    }
    if (op.op === "update") {
      return ((await request("PUT", `/api/transactions/${encodeURIComponent(op.id)}`, op.txn)).json as { txn: Txn }).txn;
    }
    if (op.op === "delete") {
      await request("DELETE", `/api/transactions/${encodeURIComponent(op.id)}`);
      return null;
    }
    return ((await request("PUT", "/api/meta", op.patch)).json as { meta: Meta }).meta;
  }

  /**
   * 依序送出待上傳的變更。正在送的時候又被叫（新記了一筆、剛連上網、按了立刻同步），
   * 這一輪做完會馬上再跑一輪，不用等 15 秒後的重試。
   */
  flush(): Promise<void> {
    if (this.flushing) {
      this.flushAgain = true;
      return this.flushing;
    }
    this.flushing = (async () => {
      try {
        do {
          this.flushAgain = false;
          await this.flushOnce();
        } while (this.flushAgain && this.outbox.length);
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }

  private async flushOnce(): Promise<void> {
    let sent = 0;
    {
      while (this.outbox.length) {
        const op = this.outbox[0];
        const drop = () => {
          const k = this.outbox.indexOf(op);
          if (k >= 0) this.outbox.splice(k, 1);
        };
        // 先記下「送出去過」再送：之後就算沒收到回應，也不會再拿它來合併
        op.sent = true;
        this.inflight = op;
        this.persistOutbox();
        try {
          const result = await this.send(op);
          if (this.server) {
            if (op.op === "delete") {
              this.server = { ...this.server,
                transactions: this.server.transactions.filter((t) => t.id !== op.id) };
            } else if (op.op === "meta") {
              this.server = { ...this.server, meta: normalizeMeta(result as Meta) };
            } else {
              this.server = { ...this.server, transactions: upsert(this.server.transactions, result as Txn) };
            }
            this.etag = null; // 手機上這份已經跟伺服器的 ETag 不同了
          }
          drop();
          this.opsDone += 1;
          sent += 1;
          this.offline = false;
          this.persistServer();
        } catch (e) {
          if (e instanceof HttpError && e.status === 404 && op.op === "update" && op.restore) {
            // 復原時那筆已經被對方刪了：照復原的內容新增回去（同 id、同建立時間）
            const k = this.outbox.indexOf(op);
            if (k >= 0) this.outbox[k] = { op: "add", id: op.id, txn: op.txn };
            continue;
          }
          if (rejected(e, op)) {
            drop();
            this.notice(e instanceof HttpError && e.status === 404
              ? "這筆已經被刪掉了，修改沒有存進去"
              : `有一筆沒存成功：${(e as Error).message}`);
            continue;
          }
          op.tries = (op.tries ?? 0) + 1;
          if (op.tries === FAIL_NOTICE_AFTER) {
            this.notice(`有 ${this.outbox.length} 筆一直送不出去（${e instanceof HttpError ? e.message : "連不上"}），先留在手機上，會再試`);
          }
          this.offline = !(e instanceof HttpError);
          this.scheduleRetry();
          break;
        } finally {
          this.inflight = null;
          this.persistOutbox();
          this.emit();
        }
      }
    }
    if (sent > 0 && this.outbox.length === 0) void this.refresh(true); // 對方可能也改了東西
  }

  private scheduleRetry() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, RETRY_MS);
  }

  /** app 開起來時呼叫一次：先送待上傳的，再抓最新的；之後回到 app、連上網都會再同步。 */
  start() {
    void this.flush().then(() => this.refresh());
    const sync = () => {
      void this.flush();
      if (!this.lastSync || Date.now() - this.lastSync > 10_000) void this.refresh();
    };
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") sync();
    });
    setInterval(() => {
      if (document.visibilityState === "visible") void this.refresh();
    }, 60_000);
  }
}

export const store = new Store();

export function useStore(): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
