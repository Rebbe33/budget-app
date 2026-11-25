-- ============================================================
-- Budget app — schéma Supabase (toutes les tables préfixées budget_)
-- À coller dans Supabase > SQL Editor > Run (projet : celui de Vanya / bullet / sport)
-- Peut être relancé sans risque (idempotent).
-- ============================================================

-- Catégories (variable = enveloppe avec budget, fixe = charges fixes, revenu = entrées d'argent)
create table if not exists budget_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default '📦',
  kind text not null default 'variable',
  monthly_budget numeric(10,2),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- Types de catégories : variable (enveloppe), fixe, revenu, epargne (épargne / transferts entre comptes)
alter table budget_categories drop constraint if exists budget_categories_kind_check;
alter table budget_categories add constraint budget_categories_kind_check
  check (kind in ('variable','fixe','revenu','epargne'));

-- Règles apprises : un mot-clé du libellé -> une catégorie
create table if not exists budget_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  keyword text not null,
  category_id uuid not null references budget_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, keyword)
);

-- Charges / revenus récurrents (ajoutés automatiquement chaque mois)
create table if not exists budget_recurrings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null,
  amount numeric(10,2) not null,            -- négatif = dépense, positif = revenu
  category_id uuid references budget_categories(id) on delete set null,
  day_of_month int not null default 1 check (day_of_month between 1 and 31),
  active boolean not null default true,
  generated_for date,                        -- début de la période déjà générée
  created_at timestamptz not null default now()
);

-- Opérations
create table if not exists budget_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  label text not null,
  amount numeric(10,2) not null,            -- négatif = dépense, positif = revenu
  category_id uuid references budget_categories(id) on delete set null,
  recurring_id uuid references budget_recurrings(id) on delete set null,
  import_hash text,                          -- empreinte pour ne jamais importer deux fois la même ligne
  checked boolean not null default false,    -- « pointée » = vue sur le relevé bancaire
  source text not null default 'manual',     -- manual | import | recurring
  created_at timestamptz not null default now(),
  unique (user_id, import_hash),
  unique (recurring_id, date)
);
create index if not exists budget_transactions_user_date_idx on budget_transactions (user_id, date);

-- Réglages (une ligne par utilisateur)
create table if not exists budget_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  month_start_day int not null default 1 check (month_start_day between 1 and 28),
  expected_income numeric(10,2) not null default 0
);

-- Bilans (comparaison avec le solde réel du compte)
create table if not exists budget_checkups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  bank_balance numeric(12,2) not null,
  computed_balance numeric(12,2),
  gap numeric(12,2),
  note text,
  created_at timestamptz not null default now()
);

-- Sécurité : chaque utilisateur ne voit que ses propres lignes
do $$
declare t text;
begin
  foreach t in array array['budget_categories','budget_rules','budget_recurrings','budget_transactions','budget_settings','budget_checkups']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "own rows" on %I', t);
    execute format('create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
