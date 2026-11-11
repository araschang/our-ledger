import type { IconName } from "../components/Icon";
import type { Meta } from "./types";

/** 分類的圖示和顏色（iOS 設定 app 那種：彩色圓角方塊＋白色線條圖示）。顏色跟著分類，圖表也用同一個色。 */
const CAT: Record<string, { icon: IconName; color: string }> = {
  外食: { icon: "utensils", color: "orange" },
  買菜: { icon: "cart", color: "green" },
  居住: { icon: "house", color: "blue" },
  水電網路: { icon: "bolt", color: "yellow" },
  日用品: { icon: "box", color: "teal" },
  家具家電: { icon: "sofa", color: "brown" },
  交通: { icon: "car", color: "cyan" },
  車貸保險: { icon: "shield", color: "indigo" },
  娛樂: { icon: "ticket", color: "purple" },
  運動: { icon: "activity", color: "mint" },
  美容: { icon: "sparkles", color: "pink" },
  衣服: { icon: "shirt", color: "red" },
  醫療: { icon: "cross", color: "red" },
  寵物: { icon: "paw", color: "brown" },
  訂閱: { icon: "repeat", color: "purple" },
  其他: { icon: "dots", color: "gray" },
  薪資: { icon: "briefcase", color: "green" },
  獎金: { icon: "gift", color: "orange" },
  投資: { icon: "trend", color: "teal" },
  結清: { icon: "swap", color: "gray" },
  // 2026-11 精簡後的新分類
  家用: { icon: "box", color: "teal" },
  美容服飾: { icon: "sparkles", color: "pink" },
  旅行: { icon: "plane", color: "yellow" },
  不算收支: { icon: "ban", color: "gray" },
};
const SPARE = ["orange", "green", "blue", "teal", "indigo", "purple", "pink", "mint", "cyan", "brown", "yellow", "red"];

/** 新加的分類：依名字固定挑一個顏色（每次都一樣）。 */
export function catStyle(c: string): { icon: IconName; color: string } {
  if (CAT[c]) return { icon: CAT[c].icon, color: `var(--${CAT[c].color})` };
  let h = 0;
  for (const ch of c) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return { icon: "tag", color: `var(--${SPARE[h % SPARE.length]})` };
}

export const SPLIT_LABEL: Record<string, string> = { half: "平分", own: "自己", advance: "代墊" };

/** 人的顏色：依設定裡的順序，第一位藍、第二位橘。 */
export function personColor(meta: Meta, pid: string): string {
  const i = meta.people.findIndex((p) => p.id === pid);
  return i === 1 ? "var(--person-2)" : "var(--person-1)";
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
