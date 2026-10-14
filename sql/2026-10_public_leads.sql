-- ============================================================================
-- Public leads from "Quote your own project" ([zipkit_quote_public])
-- ============================================================================
-- NOT RUN YET. Kelsey runs this in the Supabase SQL Editor when the public
-- quoter is approved. Until then the WordPress plugin only emails leads
-- (WP Admin > Zip Kit Tools > "Save public leads to Supabase" stays off).
--
-- How leads get in: WordPress calls submit_public_lead() with the
-- publishable key. Nobody can insert into the table directly, read it, or
-- change it with that key. The function checks every field and refuses new
-- leads when more than 60 arrived in the last hour (a backstop; WordPress
-- also limits each visitor). Reps vet leads first; admins can read and update
-- them (is_current_user_admin() comes from admin_migration.sql, step 1).
--
-- Later: leads may go straight into Pipedrive. This table stays the record.
-- Safe to run more than once.
-- ============================================================================

create table if not exists public_leads (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  name           text not null,
  email          text not null,
  phone          text not null,
  timeline       text,
  state          text not null,
  product_type   text,
  product_id     text,
  product_name   text,
  homes          int,
  snow           text,
  assembly       text,
  estimate_start numeric(12,2),
  page           text,
  source         text not null default 'public_quoter',
  status         text not null default 'new',     -- new / contacted / qualified / closed (for reps)
  notes          text,
  constraint public_leads_sizes check (
    char_length(name) between 1 and 100 and char_length(email) between 3 and 200 and char_length(phone) between 7 and 30
    and char_length(state) = 2 and coalesce(char_length(timeline), 0) <= 60 and coalesce(char_length(product_name), 0) <= 120
    and coalesce(char_length(page), 0) <= 500 and (homes is null or homes between 1 and 50)
  )
);

create index if not exists public_leads_created_at on public_leads (created_at desc);

alter table public_leads enable row level security;

-- No direct access with the publishable (anon) key.
revoke all on public_leads from anon;

-- Admins read and work the leads.
drop policy if exists "public_leads_admin_select" on public_leads;
create policy "public_leads_admin_select" on public_leads
  for select to authenticated using (is_current_user_admin());
drop policy if exists "public_leads_admin_update" on public_leads;
create policy "public_leads_admin_update" on public_leads
  for update to authenticated using (is_current_user_admin()) with check (is_current_user_admin());

-- The only way in for the website.
create or replace function submit_public_lead(lead jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if (select count(*) from public_leads where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'too many leads this hour';
  end if;
  insert into public_leads (name, email, phone, timeline, state, product_type, product_id, product_name,
                            homes, snow, assembly, estimate_start, page)
  values (
    left(trim(lead->>'name'), 100), left(trim(lead->>'email'), 200), left(trim(lead->>'phone'), 30),
    left(lead->>'timeline', 60), upper(left(lead->>'state', 2)),
    left(lead->>'product_type', 20), left(lead->>'product_id', 60), left(lead->>'product_name', 120),
    nullif(lead->>'homes', '')::int, left(lead->>'snow', 20), left(lead->>'assembly', 20),
    nullif(lead->>'estimate_start', '')::numeric, left(lead->>'page', 500)
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function submit_public_lead(jsonb) from public;
grant execute on function submit_public_lead(jsonb) to anon, authenticated;

-- Check after running:
-- select id, created_at, name, state, product_name, status from public_leads order by created_at desc limit 20;
