'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useBudget } from '@/lib/data';
import { downloadCSV, fetchAll, normTx, proposeBudgets } from '@/lib/actions';
import { getPeriod, recurringDate } from '@/lib/dates';
import { eur, round2 } from '@/lib/format';
import { parseNum } from '@/lib/parse';
import type { Category, Kind, Recurring, Tx } from '@/lib/types';
import { Sheet } from '@/components/ui';

const KIND_LABEL: Record<Kind, string> = { variable: 'Dépense variable', fixe: 'Charge fixe', revenu: 'Revenu' };

function CatRow({ cat, onChanged }: { cat: Category; onChanged: () => void }) {
  const [emoji, setEmoji] = useState(cat.emoji);
  const [name, setName] = useState(cat.name);
  const [budget, setBudget] = useState(cat.monthly_budget === null ? '' : String(cat.monthly_budget).replace('.', ','));

  async function save() {
    const b = budget.trim() === '' ? null : parseNum(budget);
    if (name.trim() === '') return;
    await supabase
      .from('budget_categories')
      .update({ emoji: emoji || '📦', name: name.trim(), monthly_budget: cat.kind === 'variable' ? b : null })
      .eq('id', cat.id);
    onChanged();
  }
  async function remove() {
    if (!confirm(`Supprimer « ${cat.name} » ? Ses opérations resteront, sans catégorie.`)) return;
    await supabase.from('budget_categories').delete().eq('id', cat.id);
    onChanged();
  }

  return (
    <div className="catrow">
      <input value={emoji} onChange={(e) => setEmoji(e.target.value)} onBlur={save} style={{ textAlign: 'center' }} maxLength={4} />
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} />
      {cat.kind === 'variable' ? (
        <input inputMode="decimal" placeholder="Budget €" value={budget} onChange={(e) => setBudget(e.target.value)} onBlur={save} />
      ) : (
        <span className="small muted">{KIND_LABEL[cat.kind]}</span>
      )}
      <button className="icon-btn" onClick={remove} aria-label="Supprimer">🗑</button>
    </div>
  );
}

function RecurringForm({ rec, onClose, onSaved }: { rec: Recurring | null; onClose: () => void; onSaved: () => void }) {
  const { userId, categories, settings } = useBudget();
  const [income, setIncome] = useState(rec ? rec.amount > 0 : false);
  const [label, setLabel] = useState(rec?.label ?? '');
  const [amount, setAmount] = useState(rec ? String(Math.abs(rec.amount)).replace('.', ',') : '');
  const [day, setDay] = useState(String(rec?.day_of_month ?? 1));
  const [cat, setCat] = useState<string>(rec?.category_id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choices = categories.filter((c) => (income ? c.kind === 'revenu' : c.kind !== 'revenu'));

  async function save() {
    const n = parseNum(amount);
    const d = Number(day);
    if (!label.trim() || n === null || n <= 0 || !(d >= 1 && d <= 31)) {
      setError('Libellé, montant et jour du mois sont nécessaires.');
      return;
    }
    setBusy(true);
    const signed = round2(income ? n : -n);
    const payload = { label: label.trim(), amount: signed, day_of_month: d, category_id: cat || null };
    if (rec) {
      await supabase.from('budget_recurrings').update(payload).eq('id', rec.id);
      // met à jour les opérations prévues non encore pointées de la période en cours
      const p = getPeriod(0, settings.month_start_day);
      const date = recurringDate(d, p);
      await supabase
        .from('budget_transactions')
        .update({ label: payload.label, amount: signed, category_id: payload.category_id, ...(date ? { date } : {}) })
        .eq('recurring_id', rec.id)
        .eq('checked', false)
        .gte('date', p.start);
    } else {
      const { error: err } = await supabase.from('budget_recurrings').insert({ ...payload, user_id: userId });
      if (err) {
        setBusy(false);
        setError(err.message);
        return;
      }
    }
    onSaved(); // le rechargement génère l'opération du mois en cours
  }

  async function remove() {
    if (!rec || !confirm('Supprimer cette charge récurrente ?')) return;
    setBusy(true);
    const p = getPeriod(0, settings.month_start_day);
    await supabase.from('budget_transactions').delete().eq('recurring_id', rec.id).eq('checked', false).gte('date', p.start);
    await supabase.from('budget_recurrings').delete().eq('id', rec.id);
    onSaved();
  }

  return (
    <Sheet title={rec ? 'Modifier' : 'Nouvelle charge / revenu récurrent'} onClose={onClose}>
      <div className="seg">
        <button className={!income ? 'on' : ''} onClick={() => { setIncome(false); setCat(''); }}>Dépense</button>
        <button className={income ? 'on' : ''} onClick={() => { setIncome(true); setCat(''); }}>Revenu</button>
      </div>
      <label className="field">Libellé
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Loyer, Netflix, assurance…" />
      </label>
      <label className="field">Montant (€)
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className="field">Jour du mois
        <input type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
      <label className="field">Catégorie
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">— aucune —</option>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>{c.emoji} {c.name} ({KIND_LABEL[c.kind]})</option>
          ))}
        </select>
      </label>
      {error && <p className="error-text">{error}</p>}
      <div className="row">
        {rec && <button className="btn danger" onClick={remove} disabled={busy}>Supprimer</button>}
        <button className="btn grow" onClick={save} disabled={busy}>Enregistrer</button>
      </div>
    </Sheet>
  );
}

export default function ReglagesPage() {
  const { userId, categories, recurrings, settings, catById, reload } = useBudget();
  const [startDay, setStartDay] = useState(String(settings.month_start_day));
  const [income, setIncome] = useState(settings.expected_income ? String(settings.expected_income).replace('.', ',') : '');
  const [editRec, setEditRec] = useState<Recurring | null | undefined>(undefined); // undefined = fermé, null = nouveau
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<Kind>('variable');
  const [info, setInfo] = useState<string | null>(null);

  async function saveSettings(nextStart = startDay, nextIncome = income) {
    const inc = nextIncome.trim() === '' ? 0 : parseNum(nextIncome);
    if (inc === null) return;
    await supabase
      .from('budget_settings')
      .upsert({ user_id: userId, month_start_day: Number(nextStart), expected_income: inc }, { onConflict: 'user_id' });
    await reload();
  }

  async function addCategory() {
    const name = newName.trim();
    if (!name) return;
    const emoji = newKind === 'revenu' ? '💶' : newKind === 'fixe' ? '🏠' : '📦';
    const { error } = await supabase
      .from('budget_categories')
      .insert({ user_id: userId, name, emoji, kind: newKind, sort: categories.length });
    if (error) setInfo(error.message.includes('duplicate') ? 'Cette catégorie existe déjà.' : error.message);
    else {
      setNewName('');
      setInfo(null);
    }
    await reload();
  }

  async function propose() {
    const n = await proposeBudgets(categories, settings);
    setInfo(n === 0 ? "Pas encore assez d'historique pour proposer des budgets." : `${n} budgets mis à jour d'après tes 3 derniers mois.`);
    await reload();
  }

  async function exportAll() {
    const rows = (await fetchAll<Tx>((from, to) => supabase.from('budget_transactions').select('*').order('date').range(from, to))).map(normTx);
    downloadCSV('budget-operations.csv', [
      ['Date', 'Libellé', 'Montant', 'Catégorie', 'Pointée'],
      ...rows.map((t) => [t.date, t.label, String(t.amount).replace('.', ','), catById(t.category_id)?.name ?? '', t.checked ? 'oui' : 'non']),
    ]);
  }

  const groups: { kind: Kind; title: string }[] = [
    { kind: 'variable', title: 'Enveloppes (dépenses variables) — avec leur budget mensuel' },
    { kind: 'fixe', title: 'Charges fixes' },
    { kind: 'revenu', title: 'Revenus' },
  ];

  return (
    <>
      <h1>Réglages</h1>
      {info && <div className="alert good">{info}</div>}

      <div className="card">
        <b>Mon mois</b>
        <div className="spacer" />
        <label className="field">Revenu de base attendu chaque mois (€)
          <input
            inputMode="decimal"
            placeholder="ex : 1 400 (ton salaire fixe)"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            onBlur={() => saveSettings()}
          />
        </label>
        <p className="small muted" style={{ marginTop: -4 }}>
          Les petits boulots s&apos;ajoutent au fur et à mesure : si tu reçois plus que ce montant, c&apos;est le réel qui compte.
        </p>
        <label className="field">Mon mois commence le…
          <select
            value={startDay}
            onChange={(e) => {
              setStartDay(e.target.value);
              saveSettings(e.target.value, income);
            }}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d === 1 ? '1er du mois (mois calendaire)' : `${d} du mois (jour de paie, par exemple)`}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="card">
        <div className="row between">
          <b>Charges & revenus récurrents</b>
          <button className="btn ghost small" onClick={() => setEditRec(null)}>+ Ajouter</button>
        </div>
        <p className="small muted">Loyer, abonnements, assurances… ajoutés automatiquement chaque mois, tu n&apos;as rien à ressaisir.</p>
        {recurrings.length === 0 && <p className="muted small">Aucune pour l&apos;instant.</p>}
        {recurrings.map((r) => (
          <button key={r.id} className="tx" onClick={() => setEditRec(r)}>
            <span className="em">{catById(r.category_id)?.emoji ?? '🔁'}</span>
            <span className="grow">
              <div className="lb">{r.label}</div>
              <div className="ct">le {r.day_of_month} de chaque mois</div>
            </span>
            <span className={`am ${r.amount > 0 ? 'pos' : ''}`}>{eur(r.amount)}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="row between">
          <b>Catégories & budgets</b>
          <button className="btn ghost small" onClick={propose}>Proposer mes budgets</button>
        </div>
        {groups.map((g) => (
          <div key={g.kind}>
            <p className="small muted" style={{ margin: '14px 0 4px' }}>{g.title}</p>
            {categories.filter((c) => c.kind === g.kind).map((c) => (
              <CatRow key={`${c.id}-${c.name}-${c.monthly_budget}`} cat={c} onChanged={reload} />
            ))}
          </div>
        ))}
        <div className="spacer" />
        <div className="row">
          <input placeholder="Nouvelle catégorie" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as Kind)} style={{ width: 150 }}>
            <option value="variable">Variable</option>
            <option value="fixe">Fixe</option>
            <option value="revenu">Revenu</option>
          </select>
          <button className="btn small" onClick={addCategory}>OK</button>
        </div>
      </div>

      <div className="card">
        <b>Données</b>
        <div className="spacer" />
        <div className="row">
          <button className="btn ghost grow" onClick={exportAll}>📤 Exporter en CSV</button>
          <button className="btn danger grow" onClick={() => supabase.auth.signOut()}>Me déconnecter</button>
        </div>
      </div>

      {editRec !== undefined && (
        <RecurringForm
          rec={editRec}
          onClose={() => setEditRec(undefined)}
          onSaved={async () => {
            setEditRec(undefined);
            await reload();
          }}
        />
      )}
    </>
  );
}
