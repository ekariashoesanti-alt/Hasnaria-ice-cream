update public.sale_items si
set product_id = p.id
from public.sales s, public.products p
where s.id = si.sale_id
  and p.brand_id = s.brand_id
  and p.name not like 'HASNARIA_%'
  and lower(btrim(p.name)) = lower(btrim(si.item_name))
  and si.product_id is distinct from p.id
  and s.brand_id = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid;

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

  select count(*), min(id)
    into v_count, v_product_id
  from public.products
  where brand_id = v_brand_id
    and name not like 'HASNARIA_%'
    and lower(btrim(name)) = lower(btrim(new.item_name));

  if v_count = 1 then
    new.product_id := v_product_id;
  end if;

  return new;
end;
$$;

revoke execute on function private.map_sale_item_product() from public, anon, authenticated;

drop trigger if exists trg_map_sale_item_product on public.sale_items;
create trigger trg_map_sale_item_product
before insert or update of item_name, sale_id, product_id
on public.sale_items
for each row
execute function private.map_sale_item_product();
