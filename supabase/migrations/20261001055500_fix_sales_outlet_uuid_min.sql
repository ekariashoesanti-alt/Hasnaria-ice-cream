-- Fix PostgreSQL UUID aggregation in sales outlet defaulting triggers.
-- PostgreSQL does not provide min(uuid); cast through text while preserving UUID result.

create or replace function private.default_and_guard_sale_outlet()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_count integer;
  v_outlet uuid;
begin
  if new.outlet_id is null then
    select count(*), min(id::text)::uuid
      into v_count, v_outlet
    from public.outlets
    where brand_id = new.brand_id and active;

    if v_count = 1 then
      new.outlet_id := v_outlet;
    end if;
  end if;

  if new.outlet_id is not null and not exists(
    select 1 from public.outlets o
    where o.id = new.outlet_id
      and o.brand_id = new.brand_id
      and o.active
  ) then
    raise exception 'Sale outlet belongs to another brand or is inactive';
  end if;

  return new;
end;
$$;

revoke execute on function private.default_and_guard_sale_outlet()
  from public, anon, authenticated;

create or replace function private.default_and_guard_sales_batch_outlet()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_count integer;
  v_outlet uuid;
begin
  if new.outlet_id is null then
    select count(*), min(id::text)::uuid
      into v_count, v_outlet
    from public.outlets
    where brand_id = new.brand_id and active;

    if v_count = 1 then
      new.outlet_id := v_outlet;
    end if;
  end if;

  if new.outlet_id is not null and not exists(
    select 1 from public.outlets o
    where o.id = new.outlet_id
      and o.brand_id = new.brand_id
      and o.active
  ) then
    raise exception 'Sales import batch outlet is invalid';
  end if;

  return new;
end;
$$;

revoke execute on function private.default_and_guard_sales_batch_outlet()
  from public, anon, authenticated;
