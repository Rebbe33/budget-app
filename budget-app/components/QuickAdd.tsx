'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useBudget } from '@/lib/data';
import { parseQuick } from '@/lib/parse';
import { suggestCategory } from '@/lib/categorize';
import { addDays, todayISO } from '@/lib/dates';
import { eur } from '@/lib/format';
import { CatChips } from './ui';

/** Saisie en un seul champ : « 12,50 leclerc » ou « +80 petit boulot ». */
export default function QuickAdd({ onAdded }: { onAdded: () => void }) {
  const { userId, categories, rules, catById, learn } = useBudget();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [custom, setCustom] = useState(todayISO());
  const [explicit, setExplicit] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ id: string; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parsed = useMemo(() => parseQuick(text), [text]);
  const signed = parsed.amount === null ? 0 : parsed.income ? parsed.amount : -parsed.amount;
  const suggestion = useMemo(
    () => (parsed.amount !== null && parsed.label ? suggestCategory(parsed.label, signed, categories, rules) : null),
    [parsed, signed, categories, rules],
  );
  const effective = explicit ?? suggestion;

  // quand on change le texte, on repart de la suggestion automatique
  useEffect(() => {
    if (!text.trim()) setExplicit(null);
  }, [text]);

  const choices = categories.filter((c) => (parsed.income ? c.kind === 'revenu' : c.kind !== 'revenu'));
  const dateISO = mode === 'today' ? todayISO() : mode === 'yesterday' ? addDays(todayISO(), -1) : custom;

  async function save() {
    if (parsed.amount === null) {
      setError('Commence par le montant, par exemple « 12,50 leclerc ».');
      return;
    }
    setError(null);
    setSaving(true);
    const cat = catById(effective);
    const label = parsed.label || cat?.name || (parsed.income ? 'Revenu' : 'Dépense');
    const { data, error: err } = await supabase
      .from('budget_transactions')
      .insert({
        user_id: userId,
        date: dateISO,
        label,
        amount: signed,
        category_id: effective,
        source: 'manual',
        checked: false,
      })
      .select('id')
      .single();
    if (err || !data) {
      setSaving(false);
      setError(err?.message ?? 'Erreur');
      return;
    }
    // si j'ai corrigé / choisi moi-même la catégorie, l'appli s'en souvient
    if (explicit && explicit !== suggestion && parsed.label) await learn(parsed.label, explicit);
    setSaving(false);
    setLast({ id: data.id, text: `${signed > 0 ? '+' : '−'}${eur(parsed.amount)} · ${cat ? cat.name : 'à classer'}` });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLast(null), 7000);
    setText('');
    setExplicit(null);
    setMode('today');
    onAdded();
  }

  async function undo() {
    if (!last) return;
    await supabase.from('budget_transactions').delete().eq('id', last.id);
    setLast(null);
    onAdded();
  }

  return (
    <div className="card">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          className="quick-input"
          placeholder="12,50 leclerc   (ou +80 petit boulot)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          enterKeyHint="done"
        />

        {parsed.amount !== null && (
          <>
            <p className="small muted" style={{ margin: '10px 0 0' }}>
              {signed > 0 ? 'Revenu' : 'Dépense'} de <b>{eur(parsed.amount)}</b>
              {parsed.label ? ` · ${parsed.label}` : ''}
              {!effective && ' — choisis une catégorie (ou laisse vide pour classer plus tard)'}
            </p>
            <CatChips cats={choices} value={effective} suggested={suggestion} onChange={setExplicit} />
            <div className="seg">
              <button type="button" className={mode === 'today' ? 'on' : ''} onClick={() => setMode('today')}>Aujourd&apos;hui</button>
              <button type="button" className={mode === 'yesterday' ? 'on' : ''} onClick={() => setMode('yesterday')}>Hier</button>
              <button type="button" className={mode === 'custom' ? 'on' : ''} onClick={() => setMode('custom')}>Autre date</button>
            </div>
            {mode === 'custom' && (
              <input type="date" value={custom} max={todayISO()} onChange={(e) => setCustom(e.target.value)} style={{ marginBottom: 10 }} />
            )}
            <button className="btn block" disabled={saving}>{saving ? '…' : 'Ajouter'}</button>
          </>
        )}
        {error && <p className="error-text">{error}</p>}
      </form>

      {last && (
        <div className="toast">
          <span>✔ Ajouté : {last.text}</span>
          <button onClick={undo}>Annuler</button>
        </div>
      )}
    </div>
  );
}
