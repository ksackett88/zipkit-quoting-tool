-- =============================================================================
-- Who can delete a project (Kelsey 2026-10-21, replaces "admins only")
-- =============================================================================
-- Table: quotes (every portal project: quotes and contracts).
--   Admins (profiles.is_admin = true, via is_current_user_admin()) can delete
--   anything.
--   A rep can delete a project only if ALL of these are true:
--     - they created it .............. quotes.created_by = auth.uid()
--     - it isn't marked signed ........ quotes.config ->> 'signed_at' is empty
--     - no payments logged ............ quotes.payments is an empty list
--     - no invoices logged ............ quotes.invoices is an empty list
-- The portal shows the x button only on cards the person can delete; this
-- makes the database enforce the same rule.
--
-- NOT RUN. Kelsey runs it in Supabase -> SQL Editor -> New query -> Run.
-- Needs admin_migration.sql first (it creates is_current_user_admin()).
-- Safe to re-run, and safe whether or not the earlier "admins only" version
-- of this file was run.
--
-- Step 1 (look first), two queries:
--   select policyname, cmd, qual from pg_policies where tablename = 'quotes' and cmd in ('DELETE', 'ALL');
--   select column_name, data_type from information_schema.columns
--     where table_schema = 'public' and table_name = 'quotes'
--       and column_name in ('created_by', 'config', 'payments', 'invoices') order by column_name;
-- =============================================================================

-- Step 2: drop the old delete policies.
-- Kelsey's step 1 result (2026-10-21): one row, "delete own quotes", DELETE,
-- (auth.uid() = created_by).
drop policy if exists "delete own quotes"                   on quotes;
-- The earlier "admins only" version of this file, if it was run:
drop policy if exists "quotes_delete_admin_only"            on quotes;
-- Other names it has had in other setups (harmless if missing):
drop policy if exists "Users can delete own quotes"         on quotes;
drop policy if exists "quotes_delete_own"                   on quotes;
drop policy if exists "own_quotes_delete"                   on quotes;
drop policy if exists "quotes_delete_admin_or_own_unsigned" on quotes;

-- Step 3: admins delete anything; reps only their own unsigned projects with
-- no payments or invoices. (The CASE keeps a null or non-list value from
-- causing an error; it counts as "nothing logged".)
create policy "quotes_delete_admin_or_own_unsigned" on quotes
  for delete using (
    is_current_user_admin()
    or (
      created_by = auth.uid()
      and coalesce(config::jsonb ->> 'signed_at', '') = ''
      and (case when jsonb_typeof(payments::jsonb) = 'array' then jsonb_array_length(payments::jsonb) else 0 end) = 0
      and (case when jsonb_typeof(invoices::jsonb) = 'array' then jsonb_array_length(invoices::jsonb) else 0 end) = 0
    )
  );

-- Step 4 (confirm): this should list only quotes_delete_admin_or_own_unsigned.
--   select policyname, cmd from pg_policies where tablename = 'quotes' and cmd = 'DELETE';
