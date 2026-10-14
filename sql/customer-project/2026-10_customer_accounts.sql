-- ============================================================================
-- Customer accounts for "Quote your own project" ([zipkit_quote_public])
-- ============================================================================
-- NOT RUN YET. Run this in a SEPARATE Supabase project for customers (not the
-- sales project with quotes, invoices and payments), so a customer account can
-- never reach sales data. Then, in that project:
--   1. Authentication > Sign In / Providers > Email: on, "Confirm email" on.
--   2. Authentication > URL Configuration: add the quoter page URL(s) to
--      Redirect URLs (the email link returns there).
--   3. Authentication > Emails: brand the "Magic Link" email (it is the
--      sign-in link customers get).
--   4. Copy the project URL and the publishable key into WP Admin >
--      Zip Kit Tools > Customer Supabase URL / key.
--
-- Customers sign in with an email link, so every account has a verified
-- email. Each customer can read and change only their own rows. Staff read
-- everything in the Supabase dashboard. Later: leads may also go to Pipedrive.
-- Safe to run more than once.
-- ============================================================================

create table if not exists customer_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  name          text,
  phone         text,
  zip           text,
  brand         text,                 -- which site they signed up on (mvp, zipkit)
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  landing_page  text,
  constraint customer_profiles_sizes check (
    coalesce(char_length(name), 0) <= 100 and coalesce(char_length(phone), 0) <= 30 and coalesce(char_length(zip), 0) <= 10
    and coalesce(char_length(landing_page), 0) <= 300
  )
);

create table if not exists customer_quotes (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  brand           text not null,
  product_type    text,
  product_id      text,
  product_name    text,
  homes           int,
  snow            text,
  assembly        text,
  state           text,
  zip             text,
  timeline        text,
  estimate_start  numeric(12,2),
  estimate        jsonb,               -- the lines and notes the customer saw
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  landing_page    text,
  page            text,
  status          text not null default 'new',   -- new / contacted / qualified / closed (staff)
  constraint customer_quotes_sizes check (
    (homes is null or homes between 1 and 50) and coalesce(char_length(state), 0) <= 2 and coalesce(char_length(zip), 0) <= 10
  )
);
create index if not exists customer_quotes_created_at on customer_quotes (created_at desc);

alter table customer_profiles enable row level security;
alter table customer_quotes   enable row level security;

-- Profiles: each customer their own row.
drop policy if exists "customer_profiles_own_select" on customer_profiles;
create policy "customer_profiles_own_select" on customer_profiles for select to authenticated using (id = auth.uid());
drop policy if exists "customer_profiles_own_insert" on customer_profiles;
create policy "customer_profiles_own_insert" on customer_profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "customer_profiles_own_update" on customer_profiles;
create policy "customer_profiles_own_update" on customer_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Quotes: a customer adds and reads their own; status stays 'new' (staff change it in the dashboard).
drop policy if exists "customer_quotes_own_select" on customer_quotes;
create policy "customer_quotes_own_select" on customer_quotes for select to authenticated using (user_id = auth.uid());
drop policy if exists "customer_quotes_own_insert" on customer_quotes;
create policy "customer_quotes_own_insert" on customer_quotes for insert to authenticated with check (user_id = auth.uid() and status = 'new');

-- Nothing for signed-out visitors.
revoke all on customer_profiles from anon;
revoke all on customer_quotes   from anon;

-- Check after running:
-- select q.created_at, p.name, u.email, q.brand, q.product_name, q.state, q.zip, q.estimate_start, q.status
--   from customer_quotes q join auth.users u on u.id = q.user_id left join customer_profiles p on p.id = q.user_id
--   order by q.created_at desc limit 20;
