create or replace function private.normalize_sale_item_list()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  names text[];
  skus text[];
  idx integer;
  item text;
  sku text;
begin
  if new.item_name is null or position(',' in new.item_name) = 0 then
    return new;
  end if;

  names := string_to_array(new.item_name, ',');
  if new.external_sku is not null
     and cardinality(string_to_array(new.external_sku, ',')) = cardinality(names) then
    skus := string_to_array(new.external_sku, ',');
  else
    skus := null;
  end if;

  for idx in 1..cardinality(names) loop
    item := btrim(names[idx]);
    if item = '' then
      continue;
    end if;
    sku := case when skus is null then null else nullif(btrim(skus[idx]), '') end;

    insert into public.sale_items
      (sale_id, product_id, item_name, external_sku, qty, unit_price, unit_cogs)
    values
      (new.sale_id, null, item, sku, 1, 0, 0);
  end loop;

  return null;
end;
$$;

revoke execute on function private.normalize_sale_item_list() from public, anon, authenticated;

drop trigger if exists trg_normalize_sale_item_list on public.sale_items;
create trigger trg_normalize_sale_item_list
before insert on public.sale_items
for each row
when (new.item_name is not null and position(',' in new.item_name) > 0)
execute function private.normalize_sale_item_list();

create or replace function private.normalize_daily_metric_sku()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  sku_token text;
begin
  select '⟦SKU:' || string_agg(
           replace(replace(replace(replace(display_name, '|', ' '), '=', ' '), '⟦', ' '), '⟧', ' ')
           || '=' || qty::text,
           '|' order by qty desc, display_name
         ) || '⟧'
    into sku_token
  from (
    select
      min(btrim(si.item_name)) as display_name,
      sum(si.qty)::bigint as qty
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where s.brand_id = new.brand_id
      and s.sold_at::date = new.metric_date
      and btrim(coalesce(si.item_name, '')) <> ''
    group by lower(btrim(si.item_name))
  ) q;

  if sku_token is not null then
    new.notes := btrim(
      regexp_replace(coalesce(new.notes, ''), '\s*⟦SKU:[^⟧]*⟧', '', 'g')
      || ' ' || sku_token
    );
  end if;

  return new;
end;
$$;

revoke execute on function private.normalize_daily_metric_sku() from public, anon, authenticated;

drop trigger if exists trg_normalize_daily_metric_sku on public.daily_metrics;
create trigger trg_normalize_daily_metric_sku
before insert or update of notes, cash_revenue, transactions, metric_date, brand_id
on public.daily_metrics
for each row
execute function private.normalize_daily_metric_sku();
