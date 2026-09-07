create or replace function public.client_roster_rows()
returns table(id uuid, name text)
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_is_owner boolean := false;
  v_brand constant uuid := 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid;
begin
  if v_uid is null then
    return;
  end if;

  select exists (
    select 1
    from public.user_profiles p
    where p.id = v_uid
      and p.brand_id = v_brand
      and p.role = 'owner'
      and p.status = 'active'
  ) into v_is_owner;

  if v_is_owner then
    return query
    select
      p.id,
      'HASNARIA_USER|' || p.id::text || '|' ||
      (case when p.status = 'active' then p.role else 'pending' end) || '|' ||
      coalesce(p.email, '') || '|' ||
      replace(coalesce(nullif(p.full_name, ''), nullif(regexp_replace(coalesce(p.display_name, ''), '^[^:]+::', ''), ''), split_part(coalesce(p.email, ''), '@', 1), 'User'), '|', '/')
    from public.user_profiles p
    where p.brand_id = v_brand
    order by case when p.id = v_uid then 0 else 1 end, lower(coalesce(p.full_name, p.email, p.id::text));
  else
    return query
    select
      p.id,
      'HASNARIA_USER|' || p.id::text || '|' ||
      (case when p.status = 'active' then p.role else 'pending' end) || '|' ||
      coalesce(p.email, '') || '|' ||
      replace(coalesce(nullif(p.full_name, ''), nullif(regexp_replace(coalesce(p.display_name, ''), '^[^:]+::', ''), ''), split_part(coalesce(p.email, ''), '@', 1), 'User'), '|', '/')
    from public.user_profiles p
    where p.id = v_uid
      and p.brand_id = v_brand;

    return query
    select
      '00000000-0000-0000-0000-000000000001'::uuid,
      'HASNARIA_USER|00000000-0000-0000-0000-000000000001|owner||Owner'::text;
  end if;
end;
$$;

revoke all on function public.client_roster_rows() from public, anon;
grant execute on function public.client_roster_rows() to authenticated;
