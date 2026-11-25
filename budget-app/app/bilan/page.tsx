'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useBudget } from '@/lib/data';
import { fetchAll, normTx } from '@/lib/actions';
import { parseNum } from '@/lib/parse';
import { todayISO } from '@/lib/dates';
import { eur, eurSigned, round2 } from '@/lib/format';
import type { Checkup, Tx } from '@/lib/types';

export default function BilanPage() {
  const { userId, categories, catById } = useBudget();
  const [checkups, setCheckups] = useState<Checkup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [balance, setBalance] = useState('');
  const [win, setWin] = useState<Tx[]>([]);
  const [addGap, setAddGap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const last = checkups[0];

  const loadCheckups = useCallback(async () => {
    const { data } = await supabase.from('budget_checkups').select('*').order('date', { ascending: false }).order('created_at', { ascending: false });
    setCheckups(
      ((data ?? []) as Checkup[]).map((c) => ({
        ...c,
        bank_balance: Number(c.bank_balance),
        computed_balance: c.computed_balance === null ? null : Number(c.computed_balance),
        gap: c.gap === null ? null : Number(c.gap),
      })),
    );
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadCheckups();
  }, [loadCheckups]);

  // opérations entre le dernier bilan (exclu) et la date choisie (incluse)
  const loadWindow = useCallback(async () => {
    if (!last) {
      setWin([]);
      return;
    }
    const rows = await fetchAll<Tx>((from, to) =>
      supabase
        .from('budget_transactions')
        .select('*')
        .gt('date', last.date)
        .lte('date', date)
        .order('date', { ascending: false })
        .range(from, to),
    );
    setWin(rows.map(normTx));
  }, [last, date]);

  useEffect(() => {
    loadWindow();
  }, [loadWindow]);

  const bank = parseNum(balance);
  const calc = useMemo(() => {
    if (!last) return null;
    const movement = win.reduce((s, t) => s + t.amount, 0);
    const unchecked = win.filter((t) => !t.checked);
    const uncheckedSum = unchecked.reduce((s, t) => s + t.amount, 0);
    const computed = last.bank_balance + movement;
    const gap = bank === null ? null : round2(bank - computed);
    const gapAfter = gap === null ? null : round2(gap + uncheckedSum); // écart une fois mises de côté les opérations pas encore passées
    return { movement, unchecked, uncheckedSum, computed, gap, gapAfter };
  }, [last, win, bank]);

  async function toggleChecked(t: Tx) {
    await supabase.from('budget_transactions').update({ checked: !t.checked }).eq('id', t.id);
    setWin(win.map((w) => (w.id === t.id ? { ...w, checked: !w.checked } : w)));
  }

  async function validate() {
    if (bank === null) {
      setMsg('Entre le solde affiché par ta banque.');
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from('budget_checkups').insert({
      user_id: userId,
      date,
      bank_balance: bank,
      computed_balance: calc ? round2(calc.computed) : null,
      gap: calc?.gap ?? null,
    });
    if (error) {
      setBusy(false);
      setMsg(error.message);
      return;
    }
    if (addGap && calc?.gapAfter && Math.abs(calc.gapAfter) >= 0.01) {
      const divers = categories.find((c) => c.name === 'Divers') ?? categories.find((c) => c.kind === 'variable');
      await supabase.from('budget_transactions').insert({
        user_id: userId,
        date,
        label: 'Écart du bilan (non saisi)',
        amount: calc.gapAfter,
        category_id: calc.gapAfter < 0 ? divers?.id ?? null : null,
        source: 'manual',
        checked: true,
      });
    }
    setBalance('');
    setAddGap(false);
    setBusy(false);
    await loadCheckups();
  }

  async function removeLast() {
    if (!last || !confirm('Supprimer le dernier bilan ?')) return;
    await supabase.from('budget_checkups').delete().eq('id', last.id);
    await loadCheckups();
  }

  const fmtDate = (s: string) => s.split('-').reverse().join('/');

  if (!loaded) return <div className="center">Chargement…</div>;

  return (
    <>
      <h1>Bilan</h1>

      {!last ? (
        <div className="card">
          <b>Premier bilan : on fixe le point de départ</b>
          <p className="small muted">
            Ouvre ton appli CIC, regarde le solde de ton compte et note-le ici. À partir de là, à chaque bilan je compare ce que mon
            calcul prévoit avec ce que la banque affiche vraiment.
          </p>
          <label className="field">Date du solde
            <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">Solde affiché par la banque (€)
            <input inputMode="decimal" placeholder="ex : 1 234,56" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </label>
          {msg && <p className="error-text">{msg}</p>}
          <button className="btn block" onClick={validate} disabled={busy}>Enregistrer le point de départ</button>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="small muted">Dernier bilan : {fmtDate(last.date)}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{eur(last.bank_balance)}</div>
            {last.gap !== null && Math.abs(last.gap) >= 1 && (
              <div className="small muted">Écart constaté à l&apos;époque : {eurSigned(last.gap)}</div>
            )}
          </div>

          <div className="card">
            <b>Nouveau bilan</b>
            <div className="spacer" />
            <label className="field">Date du solde
              <input type="date" value={date} min={last.date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">Solde affiché par la banque (€)
              <input inputMode="decimal" placeholder="ex : 1 234,56" value={balance} onChange={(e) => setBalance(e.target.value)} />
            </label>

            {calc && (
              <div className="small" style={{ marginBottom: 10 }}>
                <div className="row between"><span className="muted">Solde du dernier bilan</span><span>{eur(last.bank_balance)}</span></div>
                <div className="row between"><span className="muted">Mouvements saisis depuis ({win.length})</span><span>{eurSigned(calc.movement)}</span></div>
                <div className="row between"><b>Solde calculé</b><b>{eur(calc.computed)}</b></div>
              </div>
            )}

            {calc && calc.gap !== null && (
              <>
                {Math.abs(calc.gap) < 1 ? (
                  <div className="alert good">✅ Tout colle avec ta banque (écart {eurSigned(calc.gap)}).</div>
                ) : Math.abs(calc.gapAfter ?? 0) < 1 ? (
                  <div className="alert good">
                    ✅ L&apos;écart de {eurSigned(calc.gap)} s&apos;explique par {calc.unchecked.length} opération{calc.unchecked.length > 1 ? 's' : ''} saisie{calc.unchecked.length > 1 ? 's' : ''} qui n&apos;{calc.unchecked.length > 1 ? 'ont' : 'a'} pas encore été débitée{calc.unchecked.length > 1 ? 's' : ''} ({eurSigned(calc.uncheckedSum)}).
                  </div>
                ) : (
                  <div className="alert bad">
                    ⚠️ Écart de <b>{eurSigned(calc.gap)}</b>
                    {calc.unchecked.length > 0 && <> (<b>{eurSigned(calc.gapAfter ?? 0)}</b> une fois mises de côté les opérations pas encore débitées)</>}.
                    {(calc.gapAfter ?? 0) < 0
                      ? " Tu as dépensé plus que ce que j'ai noté : il manque sûrement des dépenses."
                      : " Il y a plus d'argent que prévu : un revenu non saisi, ou une dépense en double ?"}
                  </div>
                )}
                {Math.abs(calc.gapAfter ?? 0) >= 1 && (
                  <label className="row small" style={{ margin: '4px 0 12px' }}>
                    <input type="checkbox" checked={addGap} onChange={(e) => setAddGap(e.target.checked)} />
                    Ajouter cet écart ({eurSigned(calc.gapAfter ?? 0)}) dans mes opérations pour que mes chiffres restent justes
                  </label>
                )}
              </>
            )}

            {msg && <p className="error-text">{msg}</p>}
            <button className="btn block" onClick={validate} disabled={busy || bank === null}>Valider ce bilan</button>
          </div>

          {calc && win.length > 0 && (
            <>
              <h2>Opérations depuis le dernier bilan</h2>
              <p className="small muted" style={{ marginTop: -4 }}>
                Coche celles que tu vois bien passées sur ton compte. Celles qui restent décochées ne sont pas encore débitées (ou ont été oubliées).
              </p>
              <div className="card tight">
                {win.map((t) => {
                  const c = catById(t.category_id);
                  return (
                    <label key={t.id} className="tx" style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={t.checked} onChange={() => toggleChecked(t)} />
                      <span className="grow">
                        <div className="lb">{c?.emoji ?? '🏷️'} {t.label}</div>
                        <div className="ct">{fmtDate(t.date)}</div>
                      </span>
                      <span className={`am ${t.amount > 0 ? 'pos' : ''}`}>{eurSigned(t.amount)}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {checkups.length > 0 && (
            <>
              <h2>Historique des bilans</h2>
              <div className="card tight">
                {checkups.map((c) => (
                  <div key={c.id} className="tx" style={{ cursor: 'default' }}>
                    <span className="grow">
                      <div className="lb">{fmtDate(c.date)}</div>
                      <div className="ct">
                        {c.gap === null ? 'Point de départ' : Math.abs(c.gap) < 1 ? '✅ Tout collait' : `Écart ${eurSigned(c.gap)}`}
                      </div>
                    </span>
                    <span className="am">{eur(c.bank_balance)}</span>
                  </div>
                ))}
              </div>
              <button className="btn danger small" onClick={removeLast}>Supprimer le dernier bilan</button>
            </>
          )}
        </>
      )}
    </>
  );
}
