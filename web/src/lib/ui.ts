import type { Meta } from "./types";

/** 分類圖示（資料庫存純文字，畫面加圖示；沒列到的用 🏷️）。 */
export const CAT_EMOJI: Record<string, string> = {
  外食: "🍜", 買菜: "🥬", 居住: "🏠", 水電網路: "💡", 日用品: "🧻", 家具家電: "🛋️",
  交通: "🚗", 車貸保險: "🚙", 娛樂: "🎬", 美容: "💅", 衣服: "👗", 醫療: "🏥",
  寵物: "🐾", 訂閱: "📺", 運動: "🏸", 其他: "📦", 薪資: "💼", 獎金: "🎁", 投資: "📈",
  結清: "🤝",
};

export const catEmoji = (c: string) => CAT_EMOJI[c] ?? "🏷️";

export const SPLIT_LABEL: Record<string, string> = { half: "平分", own: "自己", advance: "代墊" };

/** 人的顏色：依設定裡的順序，第一位藍、第二位橘（圖表的第 1、2 色）。 */
export function personColor(meta: Meta, pid: string): string {
  const i = meta.people.findIndex((p) => p.id === pid);
  return i === 1 ? "var(--series-2)" : "var(--series-1)";
}

export function nameOf(meta: Meta, pid: string): string {
  return meta.people.find((p) => p.id === pid)?.name ?? pid;
}

export function otherOf(meta: Meta, pid: string): string {
  return meta.people.find((p) => p.id !== pid)?.id ?? pid;
}

export function cx(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(" ");
}
