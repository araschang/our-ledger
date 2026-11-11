/**
 * 資料同步：畫面永遠先用手機上的那份（打開就有），背景再跟伺服器對。
 *
 * 新增／修改／刪除先改手機上的畫面（立刻看到），同時排進「待上傳」佇列依序送出；
 * 沒網路就留著，連上網、回到 app、或每 15 秒自動重送。新增的 id 由手機產生，
 * 伺服器看到同一個 id 不會重複新增，所以重送不怕重複。
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
}

type Op =
  | { op: "add"; id: string; txn: TxnInput }
  | { op: "update"; id: string; txn: TxnInput }
  | { op: "delete"; id: string }
  | { op: "meta"; id: string; patch: Partial<Meta> };

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

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const CACHE_KEY = "ledger.cache.v2";
const OUTBOX_KEY = "ledger.outbox.v2";

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

async function request(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const hdrs: Record<string, string> = { ...headers };
    if (method !== "GET") hdrs["X-Ledger"] = "1"; // 伺服器擋跨站偷改：會改資料的請求都要帶（DELETE 沒有 body 也要）
    if (body !== undefined) hdrs["Content-Type"] = "application/json";
    const res = await fetch(url, {
      method,
      headers: hdrs,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (res.status >= 400) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        msg = j.error ?? (Array.isArray(j.detail) ? j.detail.map((d: { msg: string }) => d.msg).join("；") : msg);
      } catch {
        /* 不是 JSON */
      }
      throw new HttpError(res.status, msg);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** 跟後端 lib/fx.lock_to_cad 一樣：非 CAD 的金額換成 CAD、原幣寫進備註（畫面先這樣顯示）。 */
function lockFx(t: TxnInput, rates: Record<string, number>): TxnInput {
  if (!t.currency || t.currency === "CAD") return { ...t, currency: "CAD" };
  const rate = rates[t.currency];
  if (!rate) return t;
  const sym = CURRENCY_SYMBOL[t.currency] ?? `${t.currency} `;
  const orig = `原幣 ${sym}${t.amount.toFixed(2)} @${rate.toFixed(4)}`;
  return { ...t, amount: Math.round(t.amount * rate * 100) / 100, currency: "CAD",
    note: t.note.trim() ? `${orig}｜${t.note.trim()}` : orig };
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
    location: old?.location ?? "",
  };
}

function upsert(list: Txn[], t: Txn): Txn[] {
  const i = list.findIndex((x) => x.id === t.id);
  if (i < 0) return [...list, t];
  const out = list.slice();
  out[i] = t;
  return out;
}

class Store {
  private server: Data | null;
  private etag: string | null;
  private outbox: Op[];
  private syncing = false;
  private offline = false;
  private lastSync: number | null = null;
  private error: string | null = null;
  private fetching: Promise<void> | null = null;
  private flushing = false;
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
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snap;

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
  /** 跟伺服器拿最新的（沒變的話伺服器回 304，幾乎不花流量）。 */
  refresh(): Promise<void> {
    if (this.fetching) return this.fetching;
    this.fetching = (async () => {
      this.syncing = true;
      this.emit();
      try {
        const res = await request("GET", "/api/data", undefined,
          this.etag && this.server ? { "If-None-Match": this.etag } : {});
        if (res.status !== 304) {
          const data = (await res.json()) as Data;
          this.server = { ...data, meta: normalizeMeta(data.meta) };
          this.etag = res.headers.get("ETag");
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
    })();
    return this.fetching;
  }

  // ---- 寫 -------------------------------------------------------------------
  private enqueue(op: Op) {
    // 同一筆還沒送出的變更合併掉，少送幾次（正在送的那一個不能動，不然新的改動會跟著被移掉）
    const i = this.outbox.findIndex((o) => o !== this.inflight && o.op !== "meta" && o.id === op.id);
    if (i >= 0 && op.op !== "meta") {
      const prev = this.outbox[i];
      if (op.op === "update" && (prev.op === "add" || prev.op === "update")) {
        this.outbox[i] = { ...prev, txn: op.txn };
      } else if (op.op === "delete" && prev.op === "add") {
        this.outbox.splice(i, 1); // 還沒上傳就刪掉：兩個都不用送
      } else if (op.op === "delete") {
        this.outbox[i] = op;
      } else {
        this.outbox.push(op);
      }
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
        currency: t.currency, split: t.split, source: t.source },
    });
  }

  saveMeta(patch: Partial<Meta>) {
    this.enqueue({ op: "meta", id: newId(), patch });
  }

  private async send(op: Op) {
    if (op.op === "add") {
      const res = await request("POST", "/api/transactions", { ...op.txn, id: op.id });
      return (await res.json()).txn as Txn;
    }
    if (op.op === "update") {
      const res = await request("PUT", `/api/transactions/${encodeURIComponent(op.id)}`, op.txn);
      return (await res.json()).txn as Txn;
    }
    if (op.op === "delete") {
      await request("DELETE", `/api/transactions/${encodeURIComponent(op.id)}`);
      return null;
    }
    const res = await request("PUT", "/api/meta", op.patch);
    return (await res.json()).meta as Meta;
  }

  /** 依序送出待上傳的變更。 */
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    let sent = 0;
    try {
      while (this.outbox.length) {
        const op = this.outbox[0];
        const drop = () => {
          const k = this.outbox.indexOf(op);
          if (k >= 0) this.outbox.splice(k, 1);
        };
        this.inflight = op;
        try {
          const result = await this.send(op);
          if (this.server) {
            if (op.op === "delete") {
              this.server = { ...this.server,
                transactions: this.server.transactions.filter((t) => t.id !== op.id) };
            } else if (op.op === "meta") {
              this.server = { ...this.server, meta: normalizeMeta(result as Meta) };
            } else {
              this.server = { ...this.server,
                transactions: upsert(this.server.transactions, result as Txn) };
            }
          }
          drop();
          sent += 1;
          this.offline = false;
        } catch (e) {
          if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 408
              && e.status !== 429) {
            // 伺服器說這筆不行（例如對方已經刪掉了）：丟掉，告訴使用者
            drop();
            this.notice(e.status === 404 ? "這筆已經被刪掉了，修改沒有存進去" : `有一筆沒存成功：${e.message}`);
            continue;
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
    } finally {
      this.flushing = false;
    }
    if (sent > 0 && this.outbox.length === 0) {
      this.etag = null; // 對方可能也改了東西：整包重抓一次
      this.persistServer();
      void this.refresh();
    }
  }

  private scheduleRetry() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, 15_000);
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
