'use client';

import type { Category } from '@/lib/types';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function MonthNav({ label, onPrev, onNext, canNext }: { label: string; onPrev: () => void; onNext: () => void; canNext: boolean }) {
  return (
    <div className="monthnav">
      <button className="icon-btn" onClick={onPrev} aria-label="Mois précédent">‹</button>
      <span className="m">{label}</span>
      <button className="icon-btn" onClick={onNext} disabled={!canNext} style={{ opacity: canNext ? 1 : 0.3 }} aria-label="Mois suivant">›</button>
    </div>
  );
}

export function CatChips({
  cats,
  value,
  suggested,
  onChange,
}: {
  cats: Category[];
  value: string | null;
  suggested?: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div className="chips">
      {cats.map((c) => (
        <button
          type="button"
          key={c.id}
          className={`chip ${value === c.id ? 'on' : ''} ${suggested === c.id ? 'suggest' : ''}`}
          onClick={() => onChange(c.id)}
        >
          {c.emoji} {c.name}
        </button>
      ))}
    </div>
  );
}
