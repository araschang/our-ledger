/**
 * app 外框。手機：底部浮起來的膠囊分頁列（明細／總覽／＋／報表／設定）。
 * 電腦（≥1024px）：左邊側欄（記一筆、選單、同步狀態），右邊是內容。第一次打開選「我是誰」。
 */
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "./components/Icon";
import { Avatar, BigButton, HudHost, Sheet, toast, useWide } from "./components/ui";
import { normalizeMeta } from "./lib/analytics";
import { todayLocal } from "./lib/format";
import { setPrefs, usePrefs } from "./lib/prefs";
import { store, useStore } from "./lib/store";
import type { Txn } from "./lib/types";
import { cx } from "./lib/ui";
import { Entry, type EntryTarget } from "./screens/Entry";
import { ListScreen } from "./screens/ListScreen";
import { Overview } from "./screens/Overview";
import { Reports } from "./screens/Reports";
import { Settings } from "./screens/Settings";
import { SyncButton } from "./screens/Shared";

type Tab = "list" | "overview" | "reports" | "settings";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "list", label: "明細", icon: "list" },
  { id: "overview", label: "總覽", icon: "pie" },
  { id: "reports", label: "報表", icon: "chart" },
  { id: "settings", label: "設定", icon: "gear" },
];

export default function App() {
  const snap = useStore();
  const prefs = usePrefs();
  const wide = useWide();
  const [tab, setTab] = useState<Tab>(() => (window.matchMedia("(min-width: 1024px)").matches ? "overview" : "list"));
  const [entry, setEntry] = useState<EntryTarget | null>(prefs.launch === "entry" && !wide ? { mode: "new" } : null);
  const [month, setMonth] = useState(todayLocal().slice(0, 7));
  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => store.onNotice((msg) => toast(msg, { tone: "error", ms: 5000 })), []);

  const range = useMemo<[string, string]>(() => {
    const now = todayLocal().slice(0, 7);
    const ms = (snap.data?.transactions ?? []).map((t) => t.date.slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m));
    const min = ms.length ? ms.reduce((a, b) => (a < b ? a : b)) : now;
    const max = ms.length ? ms.reduce((a, b) => (a > b ? a : b)) : now;
    return [min < now ? min : now, max > now ? max : now];
  }, [snap.data]);

  if (!snap.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <img src="/icons/icon.svg" alt="" className="h-16 w-16 rounded-[18px]" />
        {snap.error ? (
          <>
            <div className="text-[20px] font-extrabold">打不開記帳本</div>
            <div className="text-[15px] text-label-2">{snap.error}</div>
            <div className="mt-2 w-48"><BigButton onClick={() => void store.refresh()}>再試一次</BigButton></div>
          </>
        ) : (
          <div className="text-[15px] font-semibold text-label-2">讀取帳本中…</div>
        )}
      </div>
    );
  }

  const meta = normalizeMeta(snap.data.meta);
  const needMe = !prefs.me || !meta.people.some((p) => p.id === prefs.me);
  const edit = (t: Txn) => setEntry({ mode: "edit", txn: t });
  const add = () => setEntry({ mode: "new" });
  const saved = (id: string) => {
    const t = store.getSnapshot().data?.transactions.find((x) => x.id === id);
    setEntry(null);
    if (t) setMonth(t.date.slice(0, 7));
    setTab("list");
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1800);
  };
  const trailing = wide ? null : <SyncButton />;

  const screen = (
    <>
      {tab === "list" && <ListScreen month={month} setMonth={setMonth} range={range} onEdit={edit} flashId={flashId} trailing={trailing} />}
      {tab === "overview" && <Overview month={month} setMonth={setMonth} range={range} onEdit={edit} trailing={trailing} onAdd={add} />}
      {tab === "reports" && <Reports month={month} setMonth={setMonth} range={range} onEdit={edit} trailing={trailing} />}
      {tab === "settings" && <Settings trailing={trailing} />}
    </>
  );

  return (
    <>
      <div id="app-shell" className={cx("relative h-full bg-bg", wide ? "flex" : "mx-auto max-w-xl")}>
        {wide && (
          <aside className="h-full w-[256px] shrink-0 p-4 pr-0">
            <div className="card flex h-full flex-col p-4">
              <div className="flex items-center gap-3 px-1 pt-1 pb-5">
                <img src="/icons/icon.svg" alt="" className="h-11 w-11 rounded-[14px]" />
                <div className="min-w-0">
                  <div className="truncate text-[17px] font-black">我們的記帳本</div>
                  <div className="truncate text-[13px] text-label-2">{meta.people.map((p) => p.name).join(" & ")}</div>
                </div>
              </div>
              <button onClick={add}
                className="press mb-4 flex h-12 items-center justify-center gap-2 rounded-full bg-tint text-[16px] font-extrabold text-on-tint">
                <Icon name="plus" size={20} strokeWidth={2.8} />
                記一筆
                <kbd className="ml-1 rounded-md bg-[color-mix(in_oklab,var(--on-tint)_18%,transparent)] px-1.5 text-[12px] font-bold">N</kbd>
              </button>
              <nav aria-label="主選單" className="flex flex-col gap-1">
                {[TABS[1], TABS[0], TABS[2], TABS[3]].map((t) => (
                  <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
                    className={cx("press flex h-12 items-center gap-3 rounded-full px-4 text-left text-[16px]",
                      tab === t.id ? "bg-c-lilac font-black text-label" : "font-semibold text-label-2 hover:bg-fill-4")}>
                    <Icon name={t.icon} size={21} strokeWidth={tab === t.id ? 2.4 : 2} />
                    {t.label}
                  </button>
                ))}
              </nav>
              <div className="flex-1" />
              {prefs.me && (
                <div className="flex items-center gap-2.5 px-2 pb-2 text-[14px] text-label-2">
                  <Avatar meta={meta} pid={prefs.me} size={26} />
                  這台是 {meta.people.find((p) => p.id === prefs.me)?.name}
                </div>
              )}
              <SyncButton variant="row" />
            </div>
          </aside>
        )}

        <main className="relative h-full min-w-0 flex-1">{screen}</main>

        {!wide && (
          <nav aria-label="主選單" className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-4"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}>
            <div className="float pointer-events-auto mx-auto flex h-[66px] max-w-md items-center justify-around rounded-full bg-card px-1.5">
              {[TABS[0], TABS[1]].map((t) => <TabButton key={t.id} t={t} active={tab === t.id} onClick={() => setTab(t.id)} />)}
              <button aria-label="記一筆" onClick={add}
                className="press flex h-[52px] w-[52px] items-center justify-center rounded-full bg-tint text-on-tint">
                <Icon name="plus" size={26} strokeWidth={2.8} />
              </button>
              {[TABS[2], TABS[3]].map((t) => <TabButton key={t.id} t={t} active={tab === t.id} onClick={() => setTab(t.id)} />)}
            </div>
          </nav>
        )}
      </div>

      {wide && <AddShortcut onAdd={add} disabled={!!entry || needMe} />}

      {entry && !needMe && <Entry key={entry.mode === "edit" ? entry.txn.id : "new"} target={entry}
        onClose={() => setEntry(null)} onSaved={saved} />}

      <Sheet open={needMe} onClose={() => {}} dismissible={false} title="歡迎" wideWidth={440}>
        <div className="flex flex-col items-center px-2 pt-2 text-center">
          <img src="/icons/icon.svg" alt="" className="h-16 w-16 rounded-[18px]" />
          <div className="mt-3 text-[22px] font-black">{wide ? "這台電腦是誰在用？" : "這支手機是誰的？"}</div>
          <div className="mt-1 text-[15px] text-label-2">記帳時會預設是你付的，之後可以在「設定」改。</div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 pb-2">
          {meta.people.map((p) => (
            <button key={p.id} onClick={() => setPrefs({ me: p.id })}
              className="press flex h-[104px] flex-col items-center justify-center gap-2 rounded-[22px] bg-card-2 text-[19px] font-extrabold">
              <Avatar meta={meta} pid={p.id} size={40} />
              {p.name}
            </button>
          ))}
        </div>
      </Sheet>

      <HudHost />
    </>
  );
}

function TabButton({ t, active, onClick }: { t: (typeof TABS)[number]; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-current={active ? "page" : undefined}
      className={cx("flex w-[64px] flex-col items-center justify-center gap-[3px] text-[11px]",
        active ? "font-black text-label" : "font-semibold text-label-2")}>
      <span className={cx("flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150", active && "bg-c-lilac")}>
        <Icon name={t.icon} size={21} strokeWidth={active ? 2.4 : 2} />
      </span>
      {t.label}
    </button>
  );
}

/** 電腦版：按 N 記一筆（在輸入框裡打字時不算）。 */
function AddShortcut({ onAdd, disabled }: { onAdd: () => void; disabled: boolean }) {
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        onAdd();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAdd, disabled]);
  return null;
}
