export function eur(n: number, digits = 2): string {
  const v = Math.abs(n) < 0.005 ? 0 : n;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
}

/** Montant avec signe explicite (+12,00 € / −12,00 €). */
export function eurSigned(n: number): string {
  if (Math.abs(n) < 0.005) return eur(0);
  return (n > 0 ? '+' : '−') + eur(Math.abs(n));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
