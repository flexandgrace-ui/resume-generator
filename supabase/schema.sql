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
