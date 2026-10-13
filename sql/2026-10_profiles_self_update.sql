-- =============================================================================
-- ZipKit Sales Portal — let each rep update their own name and phone
-- =============================================================================
-- The new quote tool (quote.html) asks a rep once for their name and phone and
-- saves them to their own `profiles` row (full_name, phone). They print on
-- every proposal and estimate.
--
-- Only needed if reps see "couldn't be saved to your profile" when they click
-- "Save my details". Their details still go on that quote either way.
--
-- Safe to re-run. Run sql/admin_migration.sql and sql/crit_fixes_migration.sql
-- first: the crit_fixes trigger already stops anyone (except admins) from
-- changing is_admin, so this policy can't be used to become an admin.
-- =============================================================================

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Check (optional): reps with a name and phone on file.
-- select p.full_name, p.phone, u.email from profiles p join auth.users u on u.id = p.id order by u.email;
