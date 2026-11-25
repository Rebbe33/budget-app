export type Kind = 'variable' | 'fixe' | 'revenu';

export interface Category {
  id: string;
  name: string;
  emoji: string;
  kind: Kind;
  monthly_budget: number | null;
  sort: number;
}

export interface Tx {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  amount: number; // négatif = dépense, positif = revenu
  category_id: string | null;
  recurring_id: string | null;
  import_hash: string | null;
  checked: boolean;
  source: string;
}

export interface Rule {
  id: string;
  keyword: string;
  category_id: string;
}

export interface Recurring {
  id: string;
  label: string;
  amount: number; // signé
  category_id: string | null;
  day_of_month: number;
  active: boolean;
  generated_for: string | null;
}

export interface Settings {
  month_start_day: number;
  expected_income: number;
}

export interface Checkup {
  id: string;
  date: string;
  bank_balance: number;
  computed_balance: number | null;
  gap: number | null;
  note: string | null;
}

export interface Period {
  start: string;
  end: string;
  label: string;
  days: number;
  startDate: Date;
  endDate: Date;
}
