do $$
begin
  create temporary table tmp_hasnaria_split_items on commit drop as
  select
    si.sale_id,
    case when cardinality(string_to_array(si.item_name, ',')) = 1 then si.product_id else null end as product_id,
    btrim(piece) as item_name,
    case
      when si.external_sku is not null
       and cardinality(string_to_array(si.external_sku, ',')) = cardinality(string_to_array(si.item_name, ','))
      then btrim((string_to_array(si.external_sku, ','))[ord])
      else null
    end as external_sku,
    case when cardinality(string_to_array(si.item_name, ',')) = 1 then si.qty else 1 end as qty,
    case when cardinality(string_to_array(si.item_name, ',')) = 1 then si.unit_price else 0 end as unit_price,
    case when cardinality(string_to_array(si.item_name, ',')) = 1 then si.unit_cogs else 0 end as unit_cogs
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  cross join lateral unnest(string_to_array(si.item_name, ',')) with ordinality as u(piece, ord)
  where s.brand_id = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
    and btrim(piece) <> '';

  delete from public.sale_items si
  using public.sales s
  where s.id = si.sale_id
    and s.brand_id = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid;

  insert into public.sale_items (sale_id, product_id, item_name, external_sku, qty, unit_price, unit_cogs)
  select sale_id, product_id, item_name, external_sku, qty, unit_price, unit_cogs
  from tmp_hasnaria_split_items;

  with day_name_counts as (
    select
      s.sold_at::date as metric_date,
      lower(btrim(si.item_name)) as item_key,
      min(btrim(si.item_name)) as display_name,
      sum(si.qty)::bigint as qty
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where s.brand_id = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
    group by s.sold_at::date, lower(btrim(si.item_name))
  ), day_tokens as (
    select
      metric_date,
      '⟦SKU:' || string_agg(
        replace(replace(replace(replace(display_name, '|', ' '), '=', ' '), '⟦', ' '), '⟧', ' ')
        || '=' || qty::text,
        '|' order by qty desc, display_name
      ) || '⟧' as sku_token
    from day_name_counts
    group by metric_date
  )
  update public.daily_metrics dm
  set notes = btrim(
    regexp_replace(coalesce(dm.notes, ''), '\s*⟦SKU:[^⟧]*⟧', '', 'g')
    || ' ' || dt.sku_token
  )
  from day_tokens dt
  where dm.brand_id = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
    and dm.metric_date = dt.metric_date;
end $$;
