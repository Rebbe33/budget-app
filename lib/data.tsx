'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { getPeriod, recurringDate } from './dates';
import { keywordOf, norm } from './categorize';
import type { Category, Recurring, Rule, Settings } from './types';

interface BudgetCtx {
  userId: string;
  ready: boolean;
  error: string | null;
  categories: Category[];
  rules: Rule[];
  recurrings: Recurring[];
  settings: Settings;
  catById: (id: string | null | undefined) => Category | undefined;
  reload: () => Promise<void>;
  /** Apprend « ce libellé -> cette catégorie » et reclasse les opérations similaires restées sans catégorie. */
  learn: (label: string, categoryId: string) => Promise<void>;
}

const Ctx = createContext<BudgetCtx | null>(null);

export function useBudget(): BudgetCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useBudget doit être utilisé dans <BudgetProvider>');
  return c;
}

const SEED: { name: string; emoji: string; kind: Category['kind'] }[] = [
  { name: 'Courses', emoji: '🛒', kind: 'variable' },
  { name: 'Transports', emoji: '🚗', kind: 'variable' },
  { name: 'Animaux', emoji: '🐶', kind: 'variable' },
  { name: 'Sorties & resto', emoji: '🍽️', kind: 'variable' },
  { name: 'Santé', emoji: '💊', kind: 'variable' },
  { name: 'Loisirs', emoji: '🎨', kind: 'variable' },
  { name: 'Divers', emoji: '📦', kind: 'variable' },
  { name: 'Épargne', emoji: '🐷', kind: 'epargne' },
  { name: 'Logement & charges', emoji: '🏠', kind: 'fixe' },
  { name: 'Salaire', emoji: '💼', kind: 'revenu' },
  { name: 'Petits boulots', emoji: '💶', kind: 'revenu' },
];

const DEFAULT_SETTINGS: Settings = { month_start_day: 1, expected_income: 0 };

export function BudgetProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [recurrings, setRecurrings] = useState<Recurring[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(false);

  const fetchAll = useCallback(async () => {
    const [c, r, rec, s] = await Promise.all([
      supabase.from('budget_categories').select('*').order('sort').order('name'),
      supabase.from('budget_rules').select('*'),
      supabase.from('budget_recurrings').select('*').order('day_of_month'),
      supabase.from('budget_settings').select('*').maybeSingle(),
    ]);
    const err = c.error || r.error || rec.error || s.error;
    if (err) throw new Error(err.message);
    return { cats: c.data as Category[], rules: r.data as Rule[], rec: rec.data as Recurring[], settings: s.data as (Settings & { user_id: string }) | null };
  }, []);

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      let d = await fetchAll();

      if (!d.cats.length) {
        await supabase
          .from('budget_categories')
          .upsert(
            SEED.map((s, i) => ({ ...s, sort: i, user_id: userId })),
            { onConflict: 'user_id,name', ignoreDuplicates: true },
          );
      }
      if (!d.settings) {
        await supabase
          .from('budget_settings')
          .upsert({ user_id: userId, ...DEFAULT_SETTINGS }, { onConflict: 'user_id', ignoreDuplicates: true });
      }
      if (!d.cats.length || !d.settings) d = await fetchAll();

      // Catégorie « Épargne » (virements vers le Livret A…) : créée, ou convertie si tu l'avais déjà créée à la main
      if (d.cats.length && !d.cats.some((c) => c.kind === 'epargne')) {
        const named = d.cats.find((c) => norm(c.name) === 'epargne');
        if (named) await supabase.from('budget_categories').update({ kind: 'epargne' }).eq('id', named.id);
        else
          await supabase
            .from('budget_categories')
            .upsert({ user_id: userId, name: 'Épargne', emoji: '🐷', kind: 'epargne', sort: d.cats.length }, { onConflict: 'user_id,name', ignoreDuplicates: true });
        d = await fetchAll();
      }

      const st: Settings = d.settings
        ? { month_start_day: d.settings.month_start_day, expected_income: Number(d.settings.expected_income) }
        : DEFAULT_SETTINGS;

      // Génère les charges récurrentes de la période en cours (une seule fois par période)
      const p = getPeriod(0, st.month_start_day);
      const todo = d.rec.filter((r) => r.active && r.generated_for !== p.start);
      if (todo.length) {
        const rows = todo.flatMap((r) => {
          const date = recurringDate(r.day_of_month, p);
          return date
            ? [{ user_id: userId, date, label: r.label, amount: r.amount, category_id: r.category_id, recurring_id: r.id, source: 'recurring', checked: false }]
            : [];
        });
        if (rows.length) {
          await supabase.from('budget_transactions').upsert(rows, { onConflict: 'recurring_id,date', ignoreDuplicates: true });
        }
        await Promise.all(todo.map((r) => supabase.from('budget_recurrings').update({ generated_for: p.start }).eq('id', r.id)));
        d = { ...d, rec: d.rec.map((r) => (todo.some((t) => t.id === r.id) ? { ...r, generated_for: p.start } : r)) };
      }

      setCategories(d.cats.map((c) => ({ ...c, monthly_budget: c.monthly_budget === null ? null : Number(c.monthly_budget) })));
      setRules(d.rules);
      setRecurrings(d.rec.map((r) => ({ ...r, amount: Number(r.amount) })));
      setSettings(st);
      setError(null);
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      loading.current = false;
    }
  }, [fetchAll, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const catById = useCallback(
    (id: string | null | undefined) => (id ? categories.find((c) => c.id === id) : undefined),
    [categories],
  );

  const learn = useCallback(
    async (label: string, categoryId: string) => {
      const kw = keywordOf(label);
      if (!kw) return;
      await supabase
        .from('budget_rules')
        .upsert({ user_id: userId, keyword: kw, category_id: categoryId }, { onConflict: 'user_id,keyword' });
      // reclasse les opérations sans catégorie qui contiennent ce mot-clé
      const { data } = await supabase.from('budget_transactions').select('id,label').is('category_id', null).limit(1000);
      const ids = (data ?? []).filter((t) => norm(t.label).includes(kw)).map((t) => t.id);
      if (ids.length) await supabase.from('budget_transactions').update({ category_id: categoryId }).in('id', ids);
      const r = await supabase.from('budget_rules').select('*');
      if (r.data) setRules(r.data as Rule[]);
    },
    [userId],
  );

  const reload = useCallback(async () => {
    await load();
  }, [load]);

  if (error) {
    return (
      <div className="center error-box">
        <h2>Oups, la base ne répond pas</h2>
        <p>{error}</p>
        <p className="muted">
          Vérifie que tu as bien exécuté <code>supabase/schema.sql</code> dans le bon projet Supabase et que les variables
          d&apos;environnement sont renseignées.
        </p>
        <button className="btn" onClick={() => { setError(null); load(); }}>Réessayer</button>
      </div>
    );
  }
  if (!ready) return <div className="center">Chargement…</div>;

  return (
    <Ctx.Provider value={{ userId, ready, error, categories, rules, recurrings, settings, catById, reload, learn }}>
      {children}
    </Ctx.Provider>
  );
}
