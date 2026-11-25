'use client';

import Link from 'next/link';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useBudget } from '@/lib/data';
import { fetchAll } from '@/lib/actions';
import { keywordOf, kindAllowed, norm, suggestCategory } from '@/lib/categorize';
import { addDays, daysBetween } from '@/lib/dates';
import { isPdf, parseBankFile, parsePdfLines, type ParsedRow } from '@/lib/parse';
import { extractPdfLines } from '@/lib/pdf';
import { eurSigned } from '@/lib/format';
import type { Tx } from '@/lib/types';

interface Row {
  date: string;
  label: string;
  amount: number;
  hash: string;
  catId: string | null;
  suggested: string | null;
}
interface Match {
  tx: Tx;
  row: Row;
}

/** Associe une ligne du relevé à une opération saisie à la main (même montant, dates proches). */
function findMatch(row: Row, cands: Tx[], used: Set<string>): Tx | null {
  let best: Tx | null = null;
  let bestScore = Infinity;
  for (const c of cands) {
    if (used.has(c.id)) continue;
    const dd = Math.abs(daysBetween(c.date, row.date));
    if (dd > 10) continue;
    if (c.amount > 0 !== row.amount > 0) continue;
    const sameAmount = Math.abs(c.amount - row.amount) < 0.005;
    let ok = sameAmount;
    if (!ok && c.recurring_id) {
      // charge récurrente dont le montant réel diffère un peu (EDF, téléphone…)
      const kw = keywordOf(c.label);
      ok = !!kw && norm(row.label).includes(kw);
    }
    if (!ok) continue;
    const score = dd + (sameAmount ? 0 : 5);
    if (score < bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

export default function ImportPage() {
  const { userId, categories, rules, catById, learn } = useBudget();
  const [step, setStep] = useState<'pick' | 'preview' | 'done'>('pick');
  const [rows, setRows] = useState<Row[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState({ added: 0, matched: 0, unclassified: 0 });

  async function onFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      let parsed: ParsedRow[];
      let pend = 0;
      if (isPdf(buf)) {
        const r = parsePdfLines(await extractPdfLines(buf));
        parsed = r.rows;
        pend = r.pending;
      } else parsed = parseBankFile(buf);
      setPending(pend);
      if (!parsed.length) {
        throw new Error(
          "Je n'ai trouvé aucune opération dans ce fichier. Vérifie que c'est bien la page « Opérations » du CIC (PDF), ou un export CSV / OFX.",
        );
      }
      // empreinte unique par ligne (le n° d'occurrence gère les vraies opérations identiques le même jour)
      const seen = new Map<string, number>();
      const all: Row[] = parsed.map((p) => {
        const key = `${p.date}|${p.amount.toFixed(2)}|${norm(p.label).replace(/\s+/g, ' ')}`;
        const n = (seen.get(key) ?? 0) + 1;
        seen.set(key, n);
        const sug = suggestCategory(p.label, p.amount, categories, rules);
        return { ...p, hash: `${key}|${n}`, catId: sug, suggested: sug };
      });

      const min = all.reduce((m, r) => (r.date < m ? r.date : m), all[0].date);
      const max = all.reduce((m, r) => (r.date > m ? r.date : m), all[0].date);

      // déjà importées ?
      const existing = await fetchAll<{ import_hash: string }>((from, to) =>
        supabase.from('budget_transactions').select('import_hash').not('import_hash', 'is', null).gte('date', min).lte('date', max).range(from, to),
      );
      const known = new Set(existing.map((e) => e.import_hash));
      const fresh = all.filter((r) => !known.has(r.hash));

      // opérations saisies à la main (ou prévues) pas encore pointées
      const cands = (
        await fetchAll<Tx>((from, to) =>
          supabase
            .from('budget_transactions')
            .select('*')
            .is('import_hash', null)
            .eq('checked', false)
            .gte('date', addDays(min, -10))
            .lte('date', addDays(max, 10))
            .range(from, to),
        )
      ).map((t) => ({ ...t, amount: Number(t.amount) }));

      const used = new Set<string>();
      const ms: Match[] = [];
      const news: Row[] = [];
      for (const r of [...fresh].sort((a, b) => a.date.localeCompare(b.date))) {
        const m = findMatch(r, cands, used);
        if (m) {
          used.add(m.id);
          ms.push({ tx: m, row: r });
        } else news.push(r);
      }
      news.sort((a, b) => (a.catId ? 1 : 0) - (b.catId ? 1 : 0) || b.date.localeCompare(a.date));
      setRows(news);
      setMatches(ms);
      setSkipped(all.length - fresh.length);
      setStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const toInsert = rows.map((r) => ({
        user_id: userId,
        date: r.date,
        label: r.label,
        amount: r.amount,
        category_id: r.catId,
        import_hash: r.hash,
        checked: true,
        source: 'import',
      }));
      for (let i = 0; i < toInsert.length; i += 200) {
        const { error: err } = await supabase
          .from('budget_transactions')
          .upsert(toInsert.slice(i, i + 200), { onConflict: 'user_id,import_hash', ignoreDuplicates: true });
        if (err) throw new Error(err.message);
      }
      await Promise.all(
        matches.map((m) =>
          supabase
            .from('budget_transactions')
            .update({
              import_hash: m.row.hash,
              checked: true,
              date: m.row.date,
              amount: m.row.amount,
              category_id: m.tx.category_id ?? m.row.catId,
            })
            .eq('id', m.tx.id),
        ),
      );
      // l'appli retient les catégories que j'ai choisies moi-même
      const changed = rows.filter((r) => r.catId && r.catId !== r.suggested);
      const seenKw = new Set<string>();
      for (const r of changed) {
        const kw = keywordOf(r.label);
        if (!kw || seenKw.has(kw)) continue;
        seenKw.add(kw);
        await learn(r.label, r.catId as string);
      }
      setResult({ added: rows.length, matched: matches.length, unclassified: rows.filter((r) => !r.catId).length });
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  const setCat = (hash: string, catId: string | null) => setRows(rows.map((r) => (r.hash === hash ? { ...r, catId } : r)));

  return (
    <>
      <div className="row between">
        <h1>Importer un relevé</h1>
        <Link href="/operations" className="small">Retour</Link>
      </div>

      {step === 'pick' && (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            Sur le site du <b>CIC</b>, dans la page <b>Opérations</b> de ton compte : enregistre la page en <b>PDF</b> (ou « Télécharger » en CSV / OFX si tu vois l&apos;option), puis dépose le fichier ici.
          </p>
          <p className="small muted">
            Les opérations déjà importées sont ignorées, et celles que tu as saisies toi-même sont automatiquement rapprochées (pointées), sans doublon.
          </p>
          <input
            type="file"
            accept=".pdf,.csv,.ofx,.qfx,.txt,application/pdf,text/csv"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          {busy && <p className="muted">Lecture du fichier…</p>}
          {error && <p className="error-text">{error}</p>}
        </div>
      )}

      {step === 'preview' && (
        <>
          <div className="card">
            <b>{rows.length}</b> nouvelle{rows.length > 1 ? 's' : ''} opération{rows.length > 1 ? 's' : ''}
            {matches.length > 0 && <> · <b>{matches.length}</b> rapprochée{matches.length > 1 ? 's' : ''} de tes saisies</>}
            {skipped > 0 && <> · {skipped} déjà importée{skipped > 1 ? 's' : ''}</>}
            {pending > 0 && (
              <p className="small muted" style={{ marginBottom: 0 }}>
                {pending} opération{pending > 1 ? 's' : ''} « en cours d&apos;enregistrement » ignorée{pending > 1 ? 's' : ''} : elle{pending > 1 ? 's' : ''} arrivera{pending > 1 ? 'ont' : ''} au prochain import, une fois enregistrée{pending > 1 ? 's' : ''} par la banque.
              </p>
            )}
            {rows.some((r) => !r.catId) && (
              <p className="small muted" style={{ marginBottom: 0 }}>
                Les lignes sans catégorie sont en haut : choisis-en une (elle sera mémorisée pour la prochaine fois) ou laisse vide, tu pourras classer plus tard.
              </p>
            )}
          </div>

          {rows.length > 0 && (
            <div className="card tight">
              <table className="import">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.hash}>
                      <td style={{ width: '55%' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</div>
                        <div className="small muted">{r.date.split('-').reverse().join('/')} · {eurSigned(r.amount)}</div>
                      </td>
                      <td>
                        <select value={r.catId ?? ''} onChange={(e) => setCat(r.hash, e.target.value || null)}>
                          <option value="">🏷️ À classer</option>
                          {categories
                            .filter((c) => kindAllowed(c.kind, r.amount > 0) || c.id === r.catId)
                            .map((c) => (
                              <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {matches.length > 0 && (
            <details className="card">
              <summary>Voir les {matches.length} opérations rapprochées</summary>
              {matches.map((m) => (
                <div key={m.tx.id} className="small" style={{ padding: '6px 0' }}>
                  ✔ {m.tx.label} ({catById(m.tx.category_id)?.name ?? 'à classer'}) ↔ {m.row.label} · {eurSigned(m.row.amount)}
                </div>
              ))}
            </details>
          )}

          {error && <p className="error-text">{error}</p>}
          <div className="row">
            <button className="btn ghost" onClick={() => setStep('pick')} disabled={busy}>Annuler</button>
            <button className="btn grow" onClick={confirm} disabled={busy || (rows.length === 0 && matches.length === 0)}>
              {busy ? 'Import…' : 'Importer'}
            </button>
          </div>
        </>
      )}

      {step === 'done' && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>✅ Import terminé</h2>
          <p>
            {result.added} opération{result.added > 1 ? 's' : ''} ajoutée{result.added > 1 ? 's' : ''}, {result.matched} rapprochée{result.matched > 1 ? 's' : ''} de tes saisies.
          </p>
          {result.unclassified > 0 && (
            <Link href="/operations?filter=unclassified" className="alert">🏷️ {result.unclassified} à classer</Link>
          )}
          <div className="row">
            <Link href="/bilan" className="btn ghost grow" style={{ textAlign: 'center' }}>Faire un bilan</Link>
            <Link href="/" className="btn grow" style={{ textAlign: 'center' }}>Accueil</Link>
          </div>
        </div>
      )}
    </>
  );
}
