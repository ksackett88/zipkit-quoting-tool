-- =============================================================================
-- ZipKit Sales Portal — payment_accounts (wire details out of the code)
-- =============================================================================
-- Wire / bank details used on invoices, one row per paying entity. Before this
-- migration they were hard-coded in ZipKit_Quoting_Tool.html and lib/supabase.js,
-- which are public on GitHub. Invoices now fetch them at generation time; if
-- the fetch fails (or the numbers are blank) the invoice says "Contact the
-- office for wire instructions" instead.
--
-- RUN ORDER: run sql/admin_migration.sql first (this file uses its
-- is_current_user_admin() function).
--
-- HOW TO RUN: Supabase → SQL Editor → New query → paste this file → Run.
-- Safe to re-run. Then do STEP 2 at the bottom: type the account and routing
-- numbers IN THE SUPABASE EDITOR ONLY. Never put them back in this file or
-- anywhere in the repo.
-- =============================================================================

-- 1. Table. Keyed by brand. Zip Kit Steel uses the 'zipkit' row (same entity).
create table if not exists payment_accounts (
  brand             text primary key,          -- 'zipkit' | 'mvp'
  account_name      text not null,
  account_number    text,                      -- filled in by hand in STEP 2
  routing_number    text,                      -- filled in by hand in STEP 2
  bank_name         text,
  bank_branch       text,
  bank_address      text[] default '{}',
  business_address  text[] default '{}',
  updated_at        timestamptz default now()
);

-- 2. Row-level security: any signed-in user can read; only admins can write.
alter table payment_accounts enable row level security;

drop policy if exists "payment_accounts_select_authenticated" on payment_accounts;
create policy "payment_accounts_select_authenticated" on payment_accounts
  for select to authenticated
  using (true);

drop policy if exists "payment_accounts_admin_insert" on payment_accounts;
create policy "payment_accounts_admin_insert" on payment_accounts
  for insert to authenticated
  with check (is_current_user_admin());

drop policy if exists "payment_accounts_admin_update" on payment_accounts;
create policy "payment_accounts_admin_update" on payment_accounts
  for update to authenticated
  using (is_current_user_admin())
  with check (is_current_user_admin());

drop policy if exists "payment_accounts_admin_delete" on payment_accounts;
create policy "payment_accounts_admin_delete" on payment_accounts
  for delete to authenticated
  using (is_current_user_admin());

-- Signed-out visitors get nothing.
revoke all on payment_accounts from anon;

-- 3. Seed the non-secret details (same values the code used before).
-- Account and routing numbers are left blank on purpose.
insert into payment_accounts (brand, account_name, bank_name, bank_branch, bank_address, business_address)
values
  ('zipkit', 'ZipKit USA LLC', 'Mountain America Credit Union', 'Royal Hunte Drive UT Branch',
     array['1701 Royal Hunte Dr.', 'Cedar City, UT 84720'],
     array['3665 W 2700 S', 'Cedar City, UT 84720']),
  ('mvp', 'Mountain Valley Prefab', 'Mountain America Credit Union', null,
     array[]::text[],
     array['3791 East 49th North', 'Idaho Falls, ID 83401'])
on conflict (brand) do nothing;

-- =============================================================================
-- STEP 2 — run separately, in the Supabase editor, after filling in the numbers.
-- Until this is done, invoices show "Contact the office for wire instructions".
-- =============================================================================
-- update payment_accounts set account_number = 'XXXXXXXX', routing_number = 'XXXXXXXXX', updated_at = now() where brand = 'zipkit';
-- update payment_accounts set account_number = 'XXXXXXXX', routing_number = 'XXXXXXXXX', updated_at = now() where brand = 'mvp';

-- Check (optional): shows which rows still need numbers, without printing them.
-- select brand, account_name, account_number is not null as has_account, routing_number is not null as has_routing from payment_accounts;
