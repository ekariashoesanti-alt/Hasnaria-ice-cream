create or replace function private.map_sale_item_product()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_brand_id uuid;
  v_product_id uuid;
  v_count integer;
begin
  if new.product_id is not null or btrim(coalesce(new.item_name, '')) = '' then
    return new;
  end if;

  select brand_id into v_brand_id
  from public.sales
  where id = new.sale_id;

  if v_brand_id is null then
    return new;
  end if;

  select count(*) into v_count
  from public.products
  where brand_id = v_brand_id
    and name not like 'HASNARIA_%'
    and lower(btrim(name)) = lower(btrim(new.item_name));

  if v_count = 1 then
    select id into v_product_id
    from public.products
    where brand_id = v_brand_id
      and name not like 'HASNARIA_%'
      and lower(btrim(name)) = lower(btrim(new.item_name))
    limit 1;
    new.product_id := v_product_id;
  end if;

  return new;
end;
$$;

revoke execute on function private.map_sale_item_product() from public, anon, authenticated;
