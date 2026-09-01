-- =============================================================================
-- ZipKit Sales Portal — Critical fixes (post-review)
-- =============================================================================
-- Two independent fixes bundled together, both safe to re-run:
--
--   [1] Prevent any user from self-escalating to admin.
--       The prior admin migration added `profiles.is_admin` but relied on the
--       existing UPDATE policy — which typically allows a user to update their
--       own row. Nothing stopped them from setting `is_admin = true`.
--
--   [2] Server-side atomic append for the JSONB `payments` and `invoices`
--       arrays on `quotes`. Prior client code did read-modify-write, so two
--       concurrent adds (two tabs, double-click) could clobber each other.
--       New RPCs use the JSONB `||` operator inside a single UPDATE, so the
--       write is atomic at the row level.
--
-- Paste the whole file into Supabase → SQL Editor → New query → Run. Safe to
-- re-run — every statement is idempotent (CREATE OR REPLACE, DROP IF EXISTS).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- [1] Lock the is_admin column: only admins may change it.
-- ---------------------------------------------------------------------------
-- Approach: a BEFORE UPDATE trigger. On any UPDATE to profiles, if the row's
-- is_admin value would change AND the caller is NOT already an admin, reset
-- is_admin back to its old value. Effectively strips is_admin from the
-- payload for non-admin callers, silently and without breaking the write.
-- (Using a trigger instead of column-level RLS because Postgres RLS is
-- row-scoped, not column-scoped.)
create or replace function prevent_is_admin_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and not coalesce(is_current_user_admin(), false)
  then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

revoke execute on function prevent_is_admin_self_escalation() from public;

drop trigger if exists profiles_lock_is_admin on profiles;
create trigger profiles_lock_is_admin
  before update on profiles
  for each row execute function prevent_is_admin_self_escalation();


-- ---------------------------------------------------------------------------
-- [2] Atomic JSONB append for payments and invoices.
-- ---------------------------------------------------------------------------
-- Each RPC does a single UPDATE that appends to (or removes from) the JSONB
-- array atomically. No client-side read-modify-write. Returns the full
-- updated row as JSONB so the client can refresh its state in one round-trip.
--
-- SECURITY INVOKER (default) so RLS on `quotes` still applies — reps can only
-- mutate their own rows, admins can mutate all rows. Every RPC uses the RLS
-- check by touching `quotes` normally; no elevated privileges granted.

-- Append a payment. Server-side stamps id and date if the client omitted them.
create or replace function add_payment_atomic(quote_id uuid, payment jsonb)
returns setof quotes
language plpgsql
as $$
declare
  stamped jsonb := payment;
begin
  if stamped ? 'id' is not true or stamped ->> 'id' is null then
    stamped := stamped || jsonb_build_object('id',
      'pmt-' || extract(epoch from clock_timestamp())::bigint || '-' || substr(md5(random()::text), 1, 4));
  end if;
  if stamped ? 'date' is not true or stamped ->> 'date' is null then
    stamped := stamped || jsonb_build_object('date', to_char(current_date, 'YYYY-MM-DD'));
  end if;
  return query
    update quotes
      set payments = coalesce(payments, '[]'::jsonb) || jsonb_build_array(stamped)
      where id = quote_id
      returning *;
end;
$$;

-- Remove a payment by its id from the JSONB array.
create or replace function remove_payment_atomic(quote_id uuid, payment_id text)
returns setof quotes
language sql
as $$
  update quotes
    set payments = coalesce(
      (select jsonb_agg(p) from jsonb_array_elements(coalesce(payments, '[]'::jsonb)) p
        where p ->> 'id' <> payment_id),
      '[]'::jsonb)
    where id = quote_id
    returning *;
$$;

-- Same pair for invoices.
create or replace function add_invoice_atomic(quote_id uuid, invoice jsonb)
returns setof quotes
language plpgsql
as $$
declare
  stamped jsonb := invoice;
begin
  if stamped ? 'id' is not true or stamped ->> 'id' is null then
    stamped := stamped || jsonb_build_object('id',
      'inv-' || extract(epoch from clock_timestamp())::bigint || '-' || substr(md5(random()::text), 1, 4));
  end if;
  if stamped ? 'sent_date' is not true or stamped ->> 'sent_date' is null then
    stamped := stamped || jsonb_build_object('sent_date', to_char(current_date, 'YYYY-MM-DD'));
  end if;
  return query
    update quotes
      set invoices = coalesce(invoices, '[]'::jsonb) || jsonb_build_array(stamped)
      where id = quote_id
      returning *;
end;
$$;

create or replace function remove_invoice_atomic(quote_id uuid, invoice_id text)
returns setof quotes
language sql
as $$
  update quotes
    set invoices = coalesce(
      (select jsonb_agg(i) from jsonb_array_elements(coalesce(invoices, '[]'::jsonb)) i
        where i ->> 'id' <> invoice_id),
      '[]'::jsonb)
    where id = quote_id
    returning *;
$$;

-- Grant EXECUTE to authenticated only. Revoke from public first as
-- principle-of-least-privilege hygiene.
revoke execute on function add_payment_atomic(uuid, jsonb)     from public;
revoke execute on function remove_payment_atomic(uuid, text)   from public;
revoke execute on function add_invoice_atomic(uuid, jsonb)     from public;
revoke execute on function remove_invoice_atomic(uuid, text)   from public;

grant execute on function add_payment_atomic(uuid, jsonb)      to authenticated;
grant execute on function remove_payment_atomic(uuid, text)    to authenticated;
grant execute on function add_invoice_atomic(uuid, jsonb)      to authenticated;
grant execute on function remove_invoice_atomic(uuid, text)    to authenticated;


-- ---------------------------------------------------------------------------
-- Quick sanity checks (optional to keep). Uncomment to run.
-- ---------------------------------------------------------------------------
-- select proname, pg_get_functiondef(oid) from pg_proc where proname in (
--   'prevent_is_admin_self_escalation',
--   'add_payment_atomic',   'remove_payment_atomic',
--   'add_invoice_atomic',   'remove_invoice_atomic'
-- );
-- select tgname from pg_trigger where tgrelid = 'profiles'::regclass;
