import type { Period } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Nombre de jours entre a et b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

/**
 * Période budgétaire contenant `ref`, décalée de `offset` mois.
 * startDay = 1 -> mois calendaire. startDay = 5 -> du 5 au 4 du mois suivant.
 */
export function getPeriod(offset: number, startDay: number, ref: Date = new Date()): Period {
  const y = ref.getFullYear();
  let m = ref.getMonth();
  if (ref.getDate() < startDay) m -= 1;
  m += offset;
  const startDate = new Date(y, m, startDay);
  const endDate = new Date(y, m + 1, startDay - 1);
  const days = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  let label: string;
  if (startDay === 1) {
    label = startDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  } else {
    const f = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    label = `${f(startDate)} → ${f(endDate)}`;
  }
  return { start: toISO(startDate), end: toISO(endDate), label, days, startDate, endDate };
}

/** Date d'une charge récurrente (jour du mois) à l'intérieur de la période, ou null. */
export function recurringDate(dayOfMonth: number, p: Pick<Period, 'startDate' | 'endDate'>): string | null {
  for (let k = 0; k < 2; k++) {
    const base = new Date(p.startDate.getFullYear(), p.startDate.getMonth() + k, 1);
    const dim = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const d = new Date(base.getFullYear(), base.getMonth(), Math.min(dayOfMonth, dim));
    if (d >= p.startDate && d <= p.endDate) return toISO(d);
  }
  return null;
}

export function formatDay(s: string): string {
  const d = parseISO(s);
  const today = todayISO();
  if (s === today) return "Aujourd'hui";
  if (s === addDays(today, -1)) return 'Hier';
  if (s === addDays(today, 1)) return 'Demain';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
