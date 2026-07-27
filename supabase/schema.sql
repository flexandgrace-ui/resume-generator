-- Flex & Grace Resume Generator — license key usage limiting
-- Run this in the Supabase SQL editor for your project.

create table if not exists licenses (
  code text primary key,
  max_uses integer not null default 5,
  uses_remaining integer not null default 5,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- RLS is enabled with no policies, so anon/authenticated requests are
-- blocked outright. service_role bypasses RLS policy checks, but that
-- bypass doesn't substitute for a base Postgres GRANT — without one,
-- direct table access (e.g. an insert from the seed script, or the
-- plain select in verify-license.js) still fails with "permission
-- denied for table licenses". Grant it explicitly rather than relying
-- on this project's default privileges.
alter table licenses enable row level security;
grant usage on schema public to service_role;
grant select, insert, update, delete on licenses to service_role;

-- Atomically decrements uses_remaining by 1, guarded by uses_remaining > 0
-- so concurrent requests for the same code can never drive it negative.
create or replace function consume_license_use(p_code text)
returns table(uses_remaining integer, max_uses integer, success boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row licenses%rowtype;
begin
  update licenses
  set uses_remaining = licenses.uses_remaining - 1,
      last_used_at = now()
  where licenses.code = p_code and licenses.uses_remaining > 0
  returning * into updated_row;

  if updated_row.code is not null then
    return query select updated_row.uses_remaining, updated_row.max_uses, true;
  else
    return query
      select l.uses_remaining, l.max_uses, false
      from licenses l
      where l.code = p_code;
  end if;
end;
$$;

grant execute on function consume_license_use(text) to service_role;

-- Etsy auto-delivery: tracks which codes have already been handed out to a
-- buyer, separate from uses_remaining (which tracks generations left on a
-- code once it's in a customer's hands).
alter table licenses add column if not exists assigned boolean not null default false;
alter table licenses add column if not exists assigned_at timestamptz;

-- Speeds up "find the first unassigned code" lookups as the table grows.
create index if not exists licenses_unassigned_idx on licenses (created_at) where assigned = false;

-- Atomically claims the oldest unassigned code and marks it assigned.
-- Uses FOR UPDATE SKIP LOCKED so two concurrent callers can never be handed
-- the same code: each transaction locks a distinct unassigned row (skipping
-- rows already locked by other in-flight calls) before updating it.
create or replace function assign_next_license()
returns table(code text, assigned boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row licenses%rowtype;
begin
  update licenses
  set assigned = true,
      assigned_at = now()
  where licenses.code = (
    select l.code
    from licenses l
    where l.assigned = false
    order by l.created_at asc
    for update skip locked
    limit 1
  )
  returning * into updated_row;

  if updated_row.code is not null then
    return query select updated_row.code, true;
  else
    return query select null::text, false;
  end if;
end;
$$;

grant execute on function assign_next_license() to service_role;
