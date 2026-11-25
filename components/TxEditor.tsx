'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useBudget } from '@/lib/data';
import { parseNum } from '@/lib/parse';
import { kindAllowed } from '@/lib/categorize';
import { round2 } from '@/lib/format';
import type { Tx } from '@/lib/types';
import { CatChips, Sheet } from './ui';

export default function TxEditor({ tx, onClose, onSaved }: { tx: Tx; onClose: () => void; onSaved: () => void }) {
  const { categories, learn } = useBudget();
  const [income, setIncome] = useState(tx.amount > 0);
  const [amount, setAmount] = useState(String(Math.abs(tx.amount)).replace('.', ','));
  const [label, setLabel] = useState(tx.label);
  const [date, setDate] = useState(tx.date);
  const [cat, setCat] = useState<string | null>(tx.category_id);
  const [checked, setChecked] = useState(tx.checked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choices = categories.filter((c) => kindAllowed(c.kind, income));

  async function save() {
    const n = parseNum(amount);
    if (n === null || n <= 0) {
      setError('Montant invalide');
      return;
    }
    setBusy(true);
    const { error: err } = await supabase
      .from('budget_transactions')
      .update({ label: label.trim() || 'Opération', amount: round2(income ? n : -n), date, category_id: cat, checked })
      .eq('id', tx.id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    if (cat && cat !== tx.category_id) await learn(label, cat);
    setBusy(false);
    onSaved();
  }

  async function remove() {
    if (!confirm('Supprimer cette opération ?')) return;
    setBusy(true);
    await supabase.from('budget_transactions').delete().eq('id', tx.id);
    onSaved();
  }

  return (
    <Sheet title="Modifier l'opération" onClose={onClose}>
      <div className="seg">
        <button className={!income ? 'on' : ''} onClick={() => { setIncome(false); setCat(null); }}>Dépense</button>
        <button className={income ? 'on' : ''} onClick={() => { setIncome(true); setCat(null); }}>Revenu</button>
      </div>
      <label className="field">Montant (€)
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className="field">Libellé
        <input value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label className="field">Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="small muted">Catégorie</div>
      <CatChips cats={choices} value={cat} onChange={setCat} />
      <label className="row small" style={{ margin: '8px 0 14px' }}>
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        Pointée (je l&apos;ai vue sur mon relevé bancaire)
      </label>
      {error && <p className="error-text">{error}</p>}
      <div className="row">
        <button className="btn danger" onClick={remove} disabled={busy}>Supprimer</button>
        <button className="btn grow" onClick={save} disabled={busy}>Enregistrer</button>
      </div>
    </Sheet>
  );
}
