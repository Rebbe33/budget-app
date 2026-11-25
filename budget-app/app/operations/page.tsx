'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBudget } from '@/lib/data';
import { formatDay, getPeriod, todayISO } from '@/lib/dates';
import { fetchTxBetween } from '@/lib/actions';
import { norm } from '@/lib/categorize';
import { eur, eurSigned } from '@/lib/format';
import type { Tx } from '@/lib/types';
import TxEditor from '@/components/TxEditor';
import { MonthNav } from '@/components/ui';

type Filter = 'all' | 'unclassified' | 'unchecked';

export default function OperationsPage() {
  const { settings, catById, categories } = useBudget();
  const [offset, setOffset] = useState(0);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [edit, setEdit] = useState<Tx | null>(null);
  const [loaded, setLoaded] = useState(false);

  const period = useMemo(() => getPeriod(offset, settings.month_start_day), [offset, settings.month_start_day]);
  const today = todayISO();

  // filtres venant de l'URL (?filter=unclassified, ?cat=<id>)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const f = p.get('filter');
    if (f === 'unclassified' || f === 'unchecked') setFilter(f);
    const c = p.get('cat');
    if (c) setCatFilter(c);
  }, []);

  const refresh = useCallback(async () => {
    setTxs(await fetchTxBetween(period.start, period.end));
    setLoaded(true);
  }, [period.start, period.end]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const shown = useMemo(() => {
    const nq = norm(q.trim());
    return txs.filter((t) => {
      if (filter === 'unclassified' && t.category_id) return false;
      if (filter === 'unchecked' && t.checked) return false;
      if (catFilter && t.category_id !== catFilter) return false;
      if (nq && !norm(t.label).includes(nq)) return false;
      return true;
    });
  }, [txs, q, filter, catFilter]);

  const groups = useMemo(() => {
    const m = new Map<string, Tx[]>();
    for (const t of shown) m.set(t.date, [...(m.get(t.date) ?? []), t]);
    return [...m.entries()];
  }, [shown]);

  const totalIn = shown.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = shown.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const catName = catFilter ? catById(catFilter) : undefined;

  return (
    <>
      <div className="row between">
        <h1>Opérations</h1>
        <Link href="/import" className="btn ghost small">📥 Importer un relevé</Link>
      </div>

      <MonthNav label={period.label} onPrev={() => setOffset(offset - 1)} onNext={() => setOffset(offset + 1)} canNext={offset < 0} />

      <input placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>Toutes</button>
        <button className={`chip ${filter === 'unclassified' ? 'on' : ''}`} onClick={() => setFilter('unclassified')}>🏷️ À classer</button>
        <button className={`chip ${filter === 'unchecked' ? 'on' : ''}`} onClick={() => setFilter('unchecked')}>Non pointées</button>
        {catName && (
          <button className="chip on" onClick={() => setCatFilter(null)}>{catName.emoji} {catName.name} ✕</button>
        )}
      </div>
      {!catFilter && (
        <select value="" onChange={(e) => setCatFilter(e.target.value || null)} style={{ marginBottom: 8 }}>
          <option value="">Filtrer par catégorie…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
          ))}
        </select>
      )}

      <div className="row between small muted" style={{ margin: '6px 4px' }}>
        <span>Entrées : {eur(totalIn)}</span>
        <span>Sorties : {eur(-totalOut)}</span>
      </div>

      {loaded && groups.length === 0 && <p className="muted" style={{ textAlign: 'center', marginTop: 30 }}>Rien à afficher.</p>}

      {groups.map(([date, list]) => (
        <div key={date}>
          <div className="day">{formatDay(date)}</div>
          <div className="card tight">
            {list.map((t) => {
              const c = catById(t.category_id);
              return (
                <button key={t.id} className={`tx ${t.date > today ? 'planned' : ''}`} onClick={() => setEdit(t)}>
                  <span className="em">{c ? c.emoji : '🏷️'}</span>
                  <span className="grow">
                    <div className="lb">{t.label}</div>
                    <div className="ct">
                      {c ? c.name : 'À classer'}
                      {t.date > today && <span className="badge">prévue</span>}
                      {t.checked && <span className="badge ok">pointée</span>}
                    </div>
                  </span>
                  <span className={`am ${t.amount > 0 ? 'pos' : ''}`}>{eurSigned(t.amount)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {edit && (
        <TxEditor
          tx={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            refresh();
          }}
        />
      )}
    </>
  );
}
