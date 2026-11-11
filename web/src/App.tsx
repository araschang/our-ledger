/** app 外框：毛玻璃分頁列（明細／總覽／＋／報表／設定）、記一筆卡片、第一次打開選「我是誰」。 */
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "./components/Icon";
import { BigButton, Dot, HudHost, Sheet, toast } from "./components/ui";
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
import { SyncButton } from "./screens/Shared";

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
        <img src="/icons/icon.svg" alt="" className="h-16 w-16 rounded-[15px]" />
        {snap.error ? (
          <>
            <div className="text-[20px] font-semibold">打不開記帳本</div>
            <div className="text-[15px] text-label-2">{snap.error}</div>
            <div className="mt-2 w-48"><BigButton onClick={() => void store.refresh()}>再試一次</BigButton></div>
          </>
        ) : (
          <div className="text-[15px] text-label-2">讀取帳本中…</div>
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
  const trailing = <SyncButton />;

  const tabs: { id: Tab | "add"; label: string; icon: IconName }[] = [
    { id: "list", label: "明細", icon: "list" },
    { id: "overview", label: "總覽", icon: "pie" },
    { id: "add", label: "記一筆", icon: "plus" },
    { id: "reports", label: "報表", icon: "chart" },
    { id: "settings", label: "設定", icon: "gear" },
  ];

  return (
    <>
      <div id="app-shell" className="relative mx-auto h-full max-w-xl bg-bg">
        <main className="h-full">
          {tab === "list" && <ListScreen month={month} setMonth={setMonth} range={range} onEdit={edit} flashId={flashId} trailing={trailing} />}
          {tab === "overview" && <Overview month={month} setMonth={setMonth} range={range} onEdit={edit} trailing={trailing} />}
          {tab === "reports" && <Reports month={month} setMonth={setMonth} range={range} onEdit={edit} trailing={trailing} />}
          {tab === "settings" && <Settings trailing={trailing} />}
        </main>

        <nav className="material hairline-t safe-b absolute inset-x-0 bottom-0 z-30">
          <div className="flex h-[50px] items-stretch">
            {tabs.map((t) =>
              t.id === "add" ? (
                <button key={t.id} aria-label="記一筆" onClick={() => setEntry({ mode: "new" })}
                  className="press flex flex-1 items-center justify-center">
                  <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-tint text-white">
                    <Icon name="plus" size={22} strokeWidth={2.8} />
                  </span>
                </button>
              ) : (
                <button key={t.id} onClick={() => setTab(t.id as Tab)} aria-current={tab === t.id ? "page" : undefined}
                  className={cx("flex flex-1 flex-col items-center justify-center gap-[3px] pt-1 text-[10px] font-medium",
                    tab === t.id ? "text-tint" : "text-gray")}>
                  <Icon name={t.icon} size={24} strokeWidth={tab === t.id ? 2.2 : 1.8} />
                  {t.label}
                </button>
              ))}
          </div>
        </nav>
      </div>

      {entry && !needMe && <Entry key={entry.mode === "edit" ? entry.txn.id : "new"} target={entry}
        onClose={() => setEntry(null)} onSaved={saved} />}

      <Sheet open={needMe} onClose={() => {}} dismissible={false} title="歡迎">
        <div className="flex flex-col items-center px-2 pt-2 text-center">
          <img src="/icons/icon.svg" alt="" className="h-16 w-16 rounded-[15px]" />
          <div className="mt-3 text-[22px] font-bold">這支手機是誰的？</div>
          <div className="mt-1 text-[15px] text-label-2">記帳時會預設是你付的，之後可以在「設定」改。</div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 pb-2">
          {meta.people.map((p) => (
            <button key={p.id} onClick={() => setPrefs({ me: p.id })}
              className="press flex h-[92px] flex-col items-center justify-center gap-2 rounded-[14px] bg-fill-3 text-[19px] font-semibold">
              <Dot color={personColor(meta, p.id)} size={14} />
              {p.name}
            </button>
          ))}
        </div>
      </Sheet>

      <HudHost />
    </>
  );
}
