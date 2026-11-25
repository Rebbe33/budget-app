import { supabase } from './supabase';
import { getPeriod, toISO } from './dates';
import type { Category, Settings, Tx } from './types';

/** Récupère toutes les lignes d'une requête, par pages de 1000 (limite de Supabase). */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function normTx(t: Tx): Tx {
  return { ...t, amount: Number(t.amount) };
}

/** Opérations entre deux dates (incluses). */
export async function fetchTxBetween(start: string, end: string): Promise<Tx[]> {
  const rows = await fetchAll<Tx>((from, to) =>
    supabase
      .from('budget_transactions')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to),
  );
  return rows.map(normTx);
}

/**
 * Propose un budget par catégorie variable : moyenne des 3 dernières périodes complètes,
 * arrondie aux 5 € supérieurs. Retourne le nombre de catégories mises à jour (0 = pas assez d'historique).
 */
export async function proposeBudgets(cats: Category[], settings: Settings): Promise<number> {
  const p1 = getPeriod(-1, settings.month_start_day);
  const p3 = getPeriod(-3, settings.month_start_day);
  const txs = await fetchTxBetween(p3.start, p1.end);
  const variableIds = new Set(cats.filter((c) => c.kind === 'variable').map((c) => c.id));
  const periodsWithData = new Set<number>();
  const totals = new Map<string, number>();
  for (const t of txs) {
    if (!t.category_id || !variableIds.has(t.category_id)) continue;
    totals.set(t.category_id, (totals.get(t.category_id) ?? 0) - t.amount);
    for (let k = -3; k <= -1; k++) {
      const p = getPeriod(k, settings.month_start_day);
      if (t.date >= p.start && t.date <= p.end) periodsWithData.add(k);
    }
  }
  const n = periodsWithData.size;
  if (n === 0) return 0;
  let updated = 0;
  for (const [id, total] of totals) {
    const avg = total / n;
    if (avg <= 0) continue;
    const budget = Math.ceil(avg / 5) * 5;
    await supabase.from('budget_categories').update({ monthly_budget: budget }).eq('id', id);
    updated++;
  }
  return updated;
}

export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export { toISO };
