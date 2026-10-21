-- =============================================================================
-- Only admins can delete projects (Kelsey 2026-10-20)
-- =============================================================================
-- The portal and the contract generator already hide Delete from reps. This
-- makes the database refuse it too, so a rep can't delete a quote or contract
-- some other way. Admins (profiles.is_admin = true) can delete any project.
--
-- NOT RUN. Kelsey runs it in Supabase -> SQL Editor -> New query -> Run.
-- Needs admin_migration.sql first (it creates is_current_user_admin()).
-- Safe to re-run.
--
-- Step 1 (look first): list the delete policies on quotes today.
--   select policyname, cmd, qual from pg_policies where tablename = 'quotes' and cmd in ('DELETE', 'ALL');
-- Any DELETE policy it lists that isn't dropped below must be dropped too
-- (Postgres allows a delete if ANY policy allows it). An 'ALL' policy covers
-- delete as well; if one exists, tell the developer before running this.
-- =============================================================================

-- Step 2: drop the old "delete your own rows" policy. Kelsey's step 1 result
-- (2026-10-21): one row, "delete own quotes", DELETE, (auth.uid() = created_by).
drop policy if exists "delete own quotes"              on quotes;
-- Other names it has had in other setups (harmless if missing):
drop policy if exists "Users can delete own quotes"    on quotes;
drop policy if exists "quotes_delete_own"              on quotes;
drop policy if exists "own_quotes_delete"              on quotes;
drop policy if exists "quotes_delete_admin_only"       on quotes;

-- Step 3: only admins may delete.
create policy "quotes_delete_admin_only" on quotes
  for delete using ( is_current_user_admin() );

-- Step 4 (check): this should list only quotes_delete_admin_only.
--   select policyname, cmd from pg_policies where tablename = 'quotes' and cmd = 'DELETE';
