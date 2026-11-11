/** app 外框：底部分頁列（明細／總覽／＋／報表／設定）、記一筆畫面、第一次打開選「我是誰」。 */
import { useEffect, useMemo, useState } from "react";
import { Icon } from "./components/Icon";
import { Sheet, ToastHost, toast } from "./components/ui";
import { normalizeMeta } from "./lib/analytics";
import { todayLocal } from "./lib/format";
import { setPrefs, usePrefs } from "./lib/prefs";
import { store, useStore } from "./lib/store";
import type { Txn } from "./lib/types";
import { cx, personColor } from "./lib/ui";
import { Entry, type EntryTarget } from "./screens/Entry";
import { ListScreen } from "./screens/ListScreen";
import { Overview } from "./screens/Overview";
import { Reports } from "./screens/Reports";
import { Settings } from "./screens/Settings";
import { SyncBadge } from "./screens/Shared";

type Tab = "list" | "overview" | "reports" | "settings";

export default function App() {
  const snap = useStore();
  const prefs = usePrefs();
  const [tab, setTab] = useState<Tab>("list");
  const [entry, setEntry] = useState<EntryTarget | null>(prefs.launch === "entry" ? { mode: "new" } : null);
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
        <div className="text-5xl">💰</div>
        {snap.error ? (
          <>
            <div className="text-[17px] font-semibold">打不開記帳本</div>
            <div className="text-[14px] text-ink-2">{snap.error}</div>
            <button className="press mt-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-on-primary"
              onClick={() => void store.refresh()}>再試一次</button>
          </>
        ) : (
          <div className="text-[15px] text-ink-2">讀取帳本中…</div>
        )}
      </div>
    );
  }

  const meta = normalizeMeta(snap.data.meta);
  const needMe = !prefs.me || !meta.people.some((p) => p.id === prefs.me);
  const edit = (t: Txn) => setEntry({ mode: "edit", txn: t });
  const saved = (id: string) => {
    const t = store.getSnapshot().data?.transactions.find((x) => x.id === id);
    setEntry(null);
    if (t) setMonth(t.date.slice(0, 7));
    setTab("list");
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1800);
  };
  const header = <SyncBadge />;

  const tabs: { id: Tab | "add"; label: string; icon: "list" | "overview" | "plus" | "chart" | "settings" }[] = [
    { id: "list", label: "明細", icon: "list" },
    { id: "overview", label: "總覽", icon: "overview" },
    { id: "add", label: "記一筆", icon: "plus" },
    { id: "reports", label: "報表", icon: "chart" },
    { id: "settings", label: "設定", icon: "settings" },
  ];

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col">
      <main className="min-h-0 flex-1">
        {tab === "list" && <ListScreen month={month} setMonth={setMonth} range={range} onEdit={edit} flashId={flashId} header={header} />}
        {tab === "overview" && <Overview month={month} setMonth={setMonth} range={range} onEdit={edit} header={header} />}
        {tab === "reports" && <Reports month={month} setMonth={setMonth} range={range} onEdit={edit} header={header} />}
        {tab === "settings" && <Settings header={header} />}
      </main>

      <nav className="safe-b fixed inset-x-0 bottom-0 z-30 border-t border-line bg-[color-mix(in_oklab,var(--card)_92%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-[58px] max-w-xl items-stretch">
          {tabs.map((t) =>
            t.id === "add" ? (
              <div key={t.id} className="flex flex-1 items-center justify-center">
                <button aria-label="記一筆" onClick={() => setEntry({ mode: "new" })}
                  className="press flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary shadow-[0_4px_14px_rgba(0,0,0,0.25)]">
                  <Icon name="plus" size={26} strokeWidth={2.4} />
                </button>
              </div>
            ) : (
              <button key={t.id} onClick={() => setTab(t.id as Tab)} aria-current={tab === t.id ? "page" : undefined}
                className={cx("press flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px]",
                  tab === t.id ? "font-semibold text-ink" : "text-muted")}>
                <Icon name={t.icon} size={22} strokeWidth={tab === t.id ? 2.3 : 1.9} />
                {t.label}
              </button>
            ))}
        </div>
      </nav>

      {entry && !needMe && <Entry key={entry.mode === "edit" ? entry.txn.id : "new"} target={entry}
        onClose={() => setEntry(null)} onSaved={saved} />}

      <Sheet open={needMe} onClose={() => {}} dismissible={false} title="這支手機是誰的？">
        <div className="pb-1 text-[14px] text-ink-2">記帳時會預設是你付的。之後可以在「設定」改。</div>
        <div className="grid grid-cols-2 gap-3 py-3">
          {meta.people.map((p) => (
            <button key={p.id} onClick={() => setPrefs({ me: p.id })}
              className="press flex h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-card-2 text-[18px] font-semibold">
              <span className="h-4 w-4 rounded-full" style={{ background: personColor(meta, p.id) }} />
              {p.name}
            </button>
          ))}
        </div>
      </Sheet>

      <ToastHost bottom={entry ? 300 : 72} />
    </div>
  );
}
