import type { Category, Period, Settings, Tx } from './types';
import { daysBetween } from './dates';

export interface EnvelopeStat {
  cat: Category;
  spent: number;
  budget: number | null;
}

export type Status = 'ok' | 'fast' | 'over';

export interface MonthStats {
  envelopes: EnvelopeStat[];
  unclassifiedSpent: number;
  unclassifiedCount: number;
  incomeReceived: number;
  incomeBase: number;
  fixedTotal: number;
  fixedDone: number;
  variableSpent: number;
  totalBudgets: number;
  available: number; // revenus - charges fixes
  reste: number; // reste à vivre
  daysLeft: number;
  perDay: number;
  status: Status;
  budgetOver: number; // dépassement des budgets (>0 si dépassé)
}

export function computeMonth(
  txs: Tx[],
  cats: Category[],
  settings: Settings,
  period: Period,
  today: string,
): MonthStats {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const spentBy = new Map<string, number>();
  let unclassifiedSpent = 0;
  let unclassifiedCount = 0;
  let incomeReceived = 0;
  let fixedTotal = 0;
  let fixedDone = 0;

  for (const tx of txs) {
    const past = tx.date <= today;
    const cat = tx.category_id ? byId.get(tx.category_id) : undefined;
    if (!cat) {
      unclassifiedCount++;
      if (past) {
        if (tx.amount > 0) incomeReceived += tx.amount;
        else unclassifiedSpent += -tx.amount;
      }
      continue;
    }
    if (cat.kind === 'revenu') {
      if (past) incomeReceived += tx.amount;
    } else if (cat.kind === 'fixe') {
      fixedTotal += -tx.amount;
      if (past) fixedDone += -tx.amount;
    } else if (past) {
      spentBy.set(cat.id, (spentBy.get(cat.id) ?? 0) - tx.amount);
    }
  }

  const envelopes: EnvelopeStat[] = cats
    .filter((c) => c.kind === 'variable')
    .map((cat) => ({ cat, spent: spentBy.get(cat.id) ?? 0, budget: cat.monthly_budget }));

  const variableSpent = envelopes.reduce((s, e) => s + e.spent, 0) + unclassifiedSpent;
  const totalBudgets = envelopes.reduce((s, e) => s + (e.budget ?? 0), 0);
  const incomeBase = Math.max(settings.expected_income, incomeReceived);
  const available = incomeBase - fixedTotal;
  const reste = available - variableSpent;

  const inPeriod = today >= period.start && today <= period.end;
  const daysLeft = today > period.end ? 0 : inPeriod ? daysBetween(today, period.end) + 1 : period.days;
  const perDay = daysLeft > 0 && reste > 0 ? reste / daysLeft : 0;

  const elapsed = today > period.end ? period.days : inPeriod ? daysBetween(period.start, today) + 1 : 0;
  const expectedNow = totalBudgets * (elapsed / period.days);
  const budgetOver = totalBudgets > 0 ? Math.max(0, variableSpent - totalBudgets) : 0;

  let status: Status = 'ok';
  if (reste < 0 || budgetOver > 0) status = 'over';
  else if (totalBudgets > 0 && inPeriod && variableSpent > expectedNow * 1.15 + 5) status = 'fast';

  return {
    envelopes,
    unclassifiedSpent,
    unclassifiedCount,
    incomeReceived,
    incomeBase,
    fixedTotal,
    fixedDone,
    variableSpent,
    totalBudgets,
    available,
    reste,
    daysLeft,
    perDay,
    status,
    budgetOver,
  };
}

/** Statut d'une enveloppe : couleur de la jauge. */
export function envelopeTone(spent: number, budget: number | null): 'ok' | 'warn' | 'over' | 'none' {
  if (!budget || budget <= 0) return 'none';
  const r = spent / budget;
  if (r > 1) return 'over';
  if (r >= 0.8) return 'warn';
  return 'ok';
}
