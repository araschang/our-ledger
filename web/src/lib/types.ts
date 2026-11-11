export type TxnType = "expense" | "income" | "settle";
export type Split = "half" | "own" | "advance";

/** 後端 /api/data 的一筆帳（跟資料庫欄位一樣）。 */
export interface Txn {
  id: string;
  created_at: string; // 溫哥華當地時間 ISO，沒有時區
  date: string; // YYYY-MM-DD
  person: string;
  type: TxnType | string;
  category: string;
  item: string;
  amount: number;
  note: string;
  location?: string;
  source: string;
  currency: string;
  split: Split | string;
  shared?: boolean;
}

export interface Person {
  id: string;
  name: string;
}

export interface Meta {
  people: Person[];
  categories: { expense: string[]; income: string[] };
  budgets?: Record<string, number>;
  fixed_categories?: string[];
}

export type Rates = Record<string, number>;

export interface Data {
  transactions: Txn[];
  meta: Meta;
  rates: Rates;
  rates_source?: string;
}

/** 統計用的一列：金額已換成 CAD，owner = 這筆實際算誰的（代墊歸對方）。 */
export interface Row {
  id: string;
  date: string;
  month: string;
  created: string;
  person: string;
  owner: string;
  type: string;
  category: string;
  item: string;
  amount: number;
  split: string;
  note: string;
  currency: string;
  txn: Txn;
}
