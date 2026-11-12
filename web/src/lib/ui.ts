import type { IconName } from "../components/Icon";
import type { Meta } from "./types";

/** 分類的粉彩色系：每個分類一個圖示＋一個底色（圓形、墨色線條圖示）。固定支出都是紫、吃的是蜜桃色…… */
export type Hue = "peach" | "mint" | "lilac" | "butter" | "pink" | "sky" | "sand" | "gray";

const CAT: Record<string, { icon: IconName; hue: Hue }> = {
  外食: { icon: "utensils", hue: "peach" },
  買菜: { icon: "cart", hue: "mint" },
  居住: { icon: "house", hue: "lilac" },
  家用: { icon: "box", hue: "sand" },
  交通: { icon: "car", hue: "sky" },
  車貸保險: { icon: "shield", hue: "lilac" },
  娛樂: { icon: "ticket", hue: "pink" },
  運動: { icon: "activity", hue: "sky" },
  美容服飾: { icon: "sparkles", hue: "pink" },
  醫療: { icon: "cross", hue: "peach" },
  寵物: { icon: "paw", hue: "butter" },
  訂閱: { icon: "repeat", hue: "lilac" },
  旅行: { icon: "plane", hue: "butter" },
  其他: { icon: "dots", hue: "gray" },
  不算收支: { icon: "ban", hue: "gray" },
  薪資: { icon: "briefcase", hue: "mint" },
  獎金: { icon: "gift", hue: "butter" },
  投資: { icon: "trend", hue: "sky" },
  結清: { icon: "swap", hue: "gray" },
  // 2026-11 合併前的舊分類（以前的帳還是這些名字）
  水電網路: { icon: "bolt", hue: "lilac" },
  日用品: { icon: "box", hue: "sand" },
  家具家電: { icon: "sofa", hue: "sand" },
  美容: { icon: "sparkles", hue: "pink" },
  衣服: { icon: "shirt", hue: "pink" },
};
const SPARE: Hue[] = ["peach", "mint", "lilac", "butter", "pink", "sky", "sand"];

export function hueVar(h: Hue): string {
  return `var(--c-${h})`;
}

/** 新加的分類：依名字固定挑一個顏色（每次都一樣）。 */
export function catStyle(c: string): { icon: IconName; hue: Hue; bg: string } {
  if (CAT[c]) return { ...CAT[c], bg: hueVar(CAT[c].hue) };
  let h = 0;
  for (const ch of c) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  const hue = SPARE[h % SPARE.length];
  return { icon: "tag", hue, bg: hueVar(hue) };
}

export const SPLIT_LABEL: Record<string, string> = { half: "平分", own: "自己", advance: "代墊" };

/** 人的顏色：依設定裡的順序。深色用在點、長條；淺色（soft）用在頭像底色。 */
export function personColor(meta: Meta, pid: string): string {
  const i = meta.people.findIndex((p) => p.id === pid);
  return i === 1 ? "var(--person-2)" : "var(--person-1)";
}

export function personSoft(meta: Meta, pid: string): string {
  const i = meta.people.findIndex((p) => p.id === pid);
  return i === 1 ? "var(--person-2-soft)" : "var(--person-1-soft)";
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
