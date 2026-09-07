-- Hasnaria authority regression gate (read-only)
-- Run in CI against a disposable/staging DB with role fixtures.
-- Expected assertions:
-- 1) pending => no business rows
-- 2) active brand A => no brand B rows
-- 3) active brand A => can read own brand
-- 4) non-super owner cannot self-promote
-- 5) last active super admin cannot be deactivated
-- 6) last active owner per brand cannot be removed/demoted
--
-- This file is intentionally a SQL test specification; CI should execute each
-- case through authenticated sessions, not as postgres/service_role.

begin;

-- Verify helper functions exist and are SECURITY DEFINER.
do $$
declare r record;
begin
  select p.prosecdef into r
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='same_brand' and
        pg_get_function_identity_arguments(p.oid)='p_brand uuid';
  if coalesce(r.prosecdef,false) is not true then
    raise exception 'same_brand must be SECURITY DEFINER';
  end if;
end $$;

-- Verify the authority trigger exists.
do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname='user_profiles'
      and t.tgname='trg_guard_profile_authority'
      and not t.tgisinternal
  ) then
    raise exception 'authority trigger missing';
  end if;
end $$;

-- Verify critical policies are present.
do $$
declare missing int;
begin
  select count(*) into missing
  from (values
    ('brands','brand_read_own_brand'),
    ('user_profiles','profiles_read_own_or_owner'),
    ('user_profiles','profiles_update_own_or_owner')
  ) v(tablename,policyname)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename=v.tablename
      and p.policyname=v.policyname
  );
  if missing <> 0 then
    raise exception 'Critical authority policies missing: %', missing;
  end if;
end $$;

rollback;
