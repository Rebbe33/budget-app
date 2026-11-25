'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useBudget } from '@/lib/data';
import { addDays, getPeriod, todayISO } from '@/lib/dates';
import { fetchTxBetween, proposeBudgets } from '@/lib/actions';
import { computeMonth, envelopeTone } from '@/lib/stats';
import { eur } from '@/lib/format';
import type { Tx } from '@/lib/types';
import QuickAdd from '@/components/QuickAdd';
import { MonthNav } from '@/components/ui';

interface Balance {
  estimated: number;
  since: string;
}

export default function HomePage() {
  const { categories, settings, reload } = useBudget();
  const [offset, setOffset] = useState(0);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [balance, setBalance] = useState<Balance | null | undefined>(undefined); // undefined = chargement, null = pas de bilan

  const period = useMemo(() => getPeriod(offset, settings.month_start_day), [offset, settings.month_start_day]);
  const today = todayISO();

  // Solde estimé = solde du dernier bilan + opérations depuis ce bilan
  const loadBalance = useCallback(async () => {
    const { data } = await supabase.from('budget_checkups').select('date,bank_balance').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(1);
    const last = data?.[0];
    if (!last) {
      setBalance(null);
      return;
    }
    const since = await fetchTxBetween(addDays(last.date, 1), todayISO());
    setBalance({ estimated: Number(last.bank_balance) + since.reduce((s, t) => s + t.amount, 0), since: last.date });
  }, []);

  const refresh = useCallback(async () => {
    setTxs(await fetchTxBetween(period.start, period.end));
    setLoaded(true);
    loadBalance();
  }, [period.start, period.end, loadBalance]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const s = useMemo(() => computeMonth(txs, categories, settings, period, today), [txs, categories, settings, period, today]);
  const noBudgets = s.totalBudgets === 0;
  const isCurrent = offset === 0;
  const planned = s.totalBudgets > 0 || s.savingsPlanned > 0;

  async function propose() {
    const n = await proposeBudgets(categories, settings);
    if (n === 0) setInfo("Pas encore assez d'historique : fixe tes budgets à la main dans Réglages, ou reviens après un mois d'utilisation.");
    else setInfo(`${n} budgets proposés d'après tes 3 derniers mois. Tu peux les ajuster dans Réglages.`);
    await reload();
  }

  let message = '';
  if (!isCurrent) message = offset < 0 ? 'Bilan de la période' : '';
  else if (s.reste < 0) message = `Tu as dépassé de ${eur(-s.reste, 0)} ce que tu avais de disponible.`;
  else if (s.budgetOver > 0) message = `Budgets dépassés de ${eur(s.budgetOver, 0)} au total.`;
  else if (s.status === 'fast') message = 'Tu dépenses un peu plus vite que prévu ce mois-ci.';
  else if (s.daysLeft > 0) message = `≈ ${eur(s.perDay, 0)} par jour pendant ${s.daysLeft} jour${s.daysLeft > 1 ? 's' : ''}.`;

  return (
    <>
      <MonthNav
        label={period.label}
        onPrev={() => setOffset(offset - 1)}
        onNext={() => setOffset(offset + 1)}
        canNext={offset < 0}
      />

      {isCurrent && <QuickAdd onAdded={refresh} />}

      {s.unclassifiedCount > 0 && (
        <Link href="/operations?filter=unclassified" className="alert">
          🏷️ {s.unclassifiedCount} opération{s.unclassifiedCount > 1 ? 's' : ''} sans catégorie — touche pour les classer
        </Link>
      )}

      {loaded && (
        <>
          <div className={`hero ${s.status === 'ok' ? '' : s.status}`}>
            <div className="lbl">Reste à vivre</div>
            <div className="amt">{eur(s.reste, 0)}</div>
            <div className="sub">{message}</div>
          </div>

          {isCurrent && balance !== undefined && (
            <Link href="/bilan" className="card row between" style={{ color: 'inherit' }}>
              {balance === null ? (
                <span className="small">⚖️ Fais ton premier bilan pour suivre le solde de ton compte</span>
              ) : (
                <>
                  <span>
                    <span className="small muted">Solde estimé du compte</span>
                    <br />
                    <b style={{ fontSize: '1.2rem' }}>{eur(balance.estimated)}</b>
                  </span>
                  <span className="small muted right">d&apos;après ton bilan<br />du {balance.since.split('-').reverse().join('/')}</span>
                </>
              )}
            </Link>
          )}

          {planned && (
            <div className={`alert ${Math.abs(s.toAllocate) < 1 ? 'good' : s.toAllocate < 0 ? 'bad' : ''}`}>
              {Math.abs(s.toAllocate) < 1
                ? '✅ Tout ton argent est réparti entre tes enveloppes.'
                : s.toAllocate > 0
                  ? `💡 Il reste ${eur(s.toAllocate, 0)} à répartir : ils ne sont dans aucune enveloppe (ni épargne).`
                  : `⚠️ Tes enveloppes dépassent ce que tu touches de ${eur(-s.toAllocate, 0)}.`}{' '}
              <Link href="/reglages" style={{ textDecoration: 'underline', color: 'inherit' }}>Ajuster</Link>
            </div>
          )}

          <div className="grid2">
            <div className="stat">
              <div className="k">Revenus {s.incomeReceived < settings.expected_income ? '(attendus)' : 'reçus'}</div>
              <div className="v">{eur(s.incomeBase, 0)}</div>
            </div>
            <div className="stat">
              <div className="k">Charges fixes</div>
              <div className="v">{eur(s.fixedTotal, 0)}</div>
            </div>
            <div className="stat">
              <div className="k">Épargne {s.savedTotal > s.savingsPlanned ? 'mise de côté' : 'prévue'}</div>
              <div className="v">{eur(s.savingsReserve, 0)}</div>
            </div>
            <div className="stat">
              <div className="k">Déjà dépensé</div>
              <div className="v">{eur(s.variableSpent, 0)}{s.totalBudgets ? <span className="small muted"> / {eur(s.totalBudgets, 0)}</span> : null}</div>
            </div>
          </div>

          {settings.expected_income === 0 && s.incomeReceived === 0 && (
            <Link href="/reglages" className="alert">
              💡 Indique ce que tu touches (revenu de base) dans Réglages pour que le « reste à vivre » ait du sens.
            </Link>
          )}

          {noBudgets && isCurrent && (
            <div className="card">
              <b>Pas encore de budgets</b>
              <p className="small muted">
                Je peux te les proposer d&apos;après ce que tu dépenses d&apos;habitude (moyenne des 3 derniers mois), ou tu les fixes toi-même dans Réglages.
              </p>
              <button className="btn ghost small" onClick={propose}>Proposer mes budgets</button>
            </div>
          )}
          {info && <div className="alert good">{info}</div>}

          <h2>Mes enveloppes</h2>
          <div className="card tight">
            {s.envelopes.map(({ cat, spent, budget }) => {
              const tone = envelopeTone(spent, budget);
              const pct = budget ? Math.min(100, Math.max(0, (spent / budget) * 100)) : spent > 0 ? 100 : 0;
              return (
                <Link key={cat.id} href={`/operations?cat=${cat.id}`} className="env">
                  <div className="top">
                    <span>{cat.emoji} {cat.name}</span>
                    <span>
                      <b>{eur(spent, 0)}</b>
                      {budget ? <span className="muted"> / {eur(budget, 0)}</span> : null}
                    </span>
                  </div>
                  <div className={`bar ${tone}`}><i style={{ width: `${pct}%` }} /></div>
                  {budget ? (
                    <div className="sub">
                      {spent > budget ? `Dépassé de ${eur(spent - budget, 0)}` : `Il reste ${eur(budget - spent, 0)}`}
                    </div>
                  ) : (
                    <div className="sub">Pas de budget fixé</div>
                  )}
                </Link>
              );
            })}
            {s.unclassifiedSpent > 0 && (
              <Link href="/operations?filter=unclassified" className="env">
                <div className="top">
                  <span>🏷️ À classer</span>
                  <b>{eur(s.unclassifiedSpent, 0)}</b>
                </div>
              </Link>
            )}
          </div>

          {s.fixedTotal > 0 && (
            <p className="small muted" style={{ textAlign: 'center' }}>
              Charges fixes : {eur(s.fixedDone, 0)} déjà passées sur {eur(s.fixedTotal, 0)} prévues.
            </p>
          )}
        </>
      )}
    </>
  );
}
