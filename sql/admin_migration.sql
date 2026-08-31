-- =============================================================================
-- ZipKit Sales Portal — Admin access migration
-- =============================================================================
-- One-time migration to let designated users (admins) see every rep's saved
-- projects in the portal. Paste the whole file into Supabase → SQL Editor →
-- New query → Run.  Safe to re-run.
--
-- After running:
--   • Any user with profiles.is_admin = true will see the "All projects" toggle
--     in the portal actions bar and can browse everyone's saved quotes /
--     contracts (still read-only from the client — no delete-anyone's-work
--     powers unless you also open UPDATE/DELETE policies).
--   • Non-admins keep their existing view (own rows only, RLS unchanged for
--     them).
-- =============================================================================

-- 1. Admin flag on profiles.
alter table profiles add column if not exists is_admin boolean default false;

-- 2. SECURITY DEFINER helper — checks the caller's admin flag without going
-- through the profiles RLS policy (which would cause infinite recursion when
-- the policy itself references profiles).
create or replace function is_current_user_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(is_admin, false) from profiles where id = auth.uid()
$$;

grant execute on function is_current_user_admin() to authenticated;

-- 3. Grant admins read access to every row in `quotes`.
-- Drop legacy policy names so this runs cleanly no matter what the original
-- Phase 1 policy was called.
drop policy if exists "Users can view own quotes"       on quotes;
drop policy if exists "quotes_select_own"               on quotes;
drop policy if exists "own_quotes_read"                 on quotes;
drop policy if exists "quotes_select_own_or_admin"      on quotes;

create policy "quotes_select_own_or_admin" on quotes
  for select using (
    auth.uid() = created_by
    or is_current_user_admin()
  );

-- 4. Grant admins read access to every row in `profiles` (so the portal can
-- display rep name / email next to each project card).
drop policy if exists "Users can view own profile"      on profiles;
drop policy if exists "profiles_select_own"             on profiles;
drop policy if exists "profiles_select_own_or_admin"    on profiles;

create policy "profiles_select_own_or_admin" on profiles
  for select using (
    auth.uid() = id
    or is_current_user_admin()
  );

-- 5. Seed admins. Adjust the email list to match who should have access.
update profiles set is_admin = true where email in (
  'kelsey@zipkithomes.com'
  -- add accountant / other admin emails on new lines, comma-separated:
  -- , 'accountant@zipkithomes.com'
);

-- 6. Quick check — shows admins after the update runs. Optional to keep.
-- select id, email, is_admin from profiles where is_admin = true;
