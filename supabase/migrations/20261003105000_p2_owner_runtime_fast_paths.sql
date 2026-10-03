-- P2 Owner runtime performance fast paths.
-- Keep the existing UI contracts, but execute expensive aggregate reads behind
-- authenticated SECURITY DEFINER functions so RLS is checked once per request.

create index if not exists finance_journal_entries_sale_period_fast_idx
  on public.finance_journal_entries (brand_id, period_month, id)
  where source_type = 'sale' and status <> 'void';

create index if not exists finance_journal_entries_purchase_period_fast_idx
  on public.finance_journal_entries (brand_id, period_month, source_id, id)
  where source_type = 'purchase_expense' and status <> 'void';

create index if not exists finance_journal_lines_entry_account_fast_idx
  on public.finance_journal_lines (entry_id, account_code)
  include (credit);

create or replace function public.get_ui_dashboard_pack_v1(
  p_brand uuid,
  p_months integer default 18
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_from date;
  v_result jsonb;
begin
  if p_brand is null or auth.uid() is null or not private.same_brand(p_brand) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  v_from := (
    date_trunc('month', current_date)
    - make_interval(months => greatest(coalesce(p_months,18),1)-1)
  )::date;

  with
  sales_m as (
    select date_trunc('month',s.sold_at)::date period_month,
           count(*)::bigint sales_rows,
           coalesce(sum(s.total_amount),0)::numeric(18,2) sales_revenue
    from public.sales s
    where s.brand_id=p_brand and s.sold_at>=v_from
    group by 1
  ),
  sales_j as (
    select e.period_month,
           count(distinct e.id)::bigint journal_rows,
           coalesce(sum(l.credit),0)::numeric(18,2) journal_amount
    from public.finance_journal_entries e
    join public.finance_journal_lines l
      on l.entry_id=e.id and l.account_code='4000'
    where e.brand_id=p_brand and e.period_month>=v_from
      and e.source_type='sale' and e.status<>'void'
    group by e.period_month
  ),
  purchase_j as (
    select e.period_month,
           count(distinct e.id)::bigint purchase_rows,
           coalesce(sum(l.debit),0)::numeric(18,2) purchase_amount
    from public.finance_journal_entries e
    join public.finance_journal_lines l
      on l.entry_id=e.id and l.line_no=1
    where e.brand_id=p_brand and e.period_month>=v_from
      and e.source_type='purchase_expense' and e.status<>'void'
    group by e.period_month
  ),
  admin_base as materialized (
    select a.brand_id,a.purchase_id,a.purchase_date,a.total_amount
    from public.ui_administration_purchase_v1 a
    where a.brand_id=p_brand and a.purchase_date>=v_from
  ),
  admin_m as (
    select date_trunc('month',a.purchase_date)::date period_month,
           count(*)::bigint admin_rows,
           coalesce(sum(a.total_amount),0)::numeric(18,2) admin_amount
    from admin_base a
    group by 1
  ),
  admin_j as (
    select date_trunc('month',a.purchase_date)::date period_month,
           count(distinct e.id)::bigint journal_rows,
           coalesce(sum(l.debit),0)::numeric(18,2) journal_amount
    from admin_base a
    left join public.finance_journal_entries e
      on e.brand_id=a.brand_id and e.source_type='purchase_expense'
     and e.source_id=a.purchase_id and e.status<>'void'
    left join public.finance_journal_lines l
      on l.entry_id=e.id and l.line_no=1
    group by 1
  ),
  months as (
    select period_month from sales_m
    union select period_month from purchase_j
    union select period_month from admin_m
  ),
  r as (
    select m.period_month,
           coalesce(s.sales_rows,0)::bigint sales_rows,
           coalesce(s.sales_revenue,0)::numeric(18,2) sales_revenue,
           coalesce(pj.purchase_rows,0)::bigint purchase_rows,
           coalesce(pj.purchase_amount,0)::numeric(18,2) purchase_amount,
           coalesce(a.admin_rows,0)::bigint admin_rows,
           coalesce(a.admin_amount,0)::numeric(18,2) admin_amount,
           case when s.period_month is null then null
                else coalesce(s.sales_rows,0)=coalesce(sj.journal_rows,0)
                 and abs(coalesce(s.sales_revenue,0)-coalesce(sj.journal_amount,0))<0.01 end sales_sync_ok,
           case when pj.period_month is null then null else true end purchase_sync_ok,
           case when pj.period_month is null then null else 'POSTED_CANONICAL'::text end purchase_sync_state,
           case when a.period_month is null then null
                else coalesce(a.admin_rows,0)=coalesce(aj.journal_rows,0)
                 and abs(coalesce(a.admin_amount,0)-coalesce(aj.journal_amount,0))<0.01 end admin_sync_ok
    from months m
    left join sales_m s using(period_month)
    left join sales_j sj using(period_month)
    left join purchase_j pj using(period_month)
    left join admin_m a using(period_month)
    left join admin_j aj using(period_month)
  )
  select jsonb_build_object(
    'periods',coalesce((
      select jsonb_agg(jsonb_build_object(
        'period_start',period_month,
        'period_key',to_char(period_month,'YYYY-MM')
      ) order by period_month desc)
      from r
    ),'[]'::jsonb),
    'rows',coalesce((
      select jsonb_agg(jsonb_build_object(
        'period_month',period_month,
        'sales_rows',sales_rows,
        'sales_revenue',sales_revenue,
        'purchase_rows',purchase_rows,
        'purchase_amount',purchase_amount,
        'admin_rows',admin_rows,
        'admin_amount',admin_amount,
        'sales_sync_ok',sales_sync_ok,
        'purchase_sync_ok',purchase_sync_ok,
        'purchase_sync_state',purchase_sync_state,
        'admin_sync_ok',admin_sync_ok
      ) order by period_month desc)
      from r
    ),'[]'::jsonb)
  )
  into v_result;

  return v_result;
end
$function$;

revoke all on function public.get_ui_dashboard_pack_v1(uuid,integer) from public;
grant execute on function public.get_ui_dashboard_pack_v1(uuid,integer) to authenticated, service_role;

create or replace function private.get_ui_period_catalog_fast_v1(
  p_brand uuid,
  p_module text
)
returns table(
  period_start date,
  period_end date,
  period_key text,
  period_year integer,
  period_month_no integer
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  if p_brand is null or auth.uid() is null or not private.same_brand(p_brand) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if p_module='administrasi' then
    return query
      select x.period_start,
             (x.period_start + interval '1 month - 1 day')::date,
             to_char(x.period_start,'YYYY-MM'),
             extract(year from x.period_start)::integer,
             extract(month from x.period_start)::integer
      from (
        select distinct date_trunc('month',a.purchase_date)::date period_start
        from public.ui_administration_purchase_v1 a
        where a.brand_id=p_brand and a.purchase_date is not null
      ) x
      order by x.period_start desc;
  elsif p_module='stok' then
    return query
      select x.period_start,
             (x.period_start + interval '1 month - 1 day')::date,
             to_char(x.period_start,'YYYY-MM'),
             extract(year from x.period_start)::integer,
             extract(month from x.period_start)::integer
      from (
        select distinct s.month_start::date period_start
        from public.inventory_monthly_stock_p6_v1 s
        where s.brand_id=p_brand and s.month_start is not null
      ) x
      order by x.period_start desc;
  elsif p_module='pembelian' then
    return query
      select x.period_start,
             (x.period_start + interval '1 month - 1 day')::date,
             to_char(x.period_start,'YYYY-MM'),
             extract(year from x.period_start)::integer,
             extract(month from x.period_start)::integer
      from (
        select distinct p.period_month::date period_start
        from public.finance_purchase_expense_bridge_v1 p
        where p.brand_id=p_brand and p.period_month is not null
      ) x
      order by x.period_start desc;
  elsif p_module='dashboard' then
    return query
      select x.period_start,
             (x.period_start + interval '1 month - 1 day')::date,
             to_char(x.period_start,'YYYY-MM'),
             extract(year from x.period_start)::integer,
             extract(month from x.period_start)::integer
      from (
        select distinct date_trunc('month',s.sold_at)::date period_start
        from public.sales s
        where s.brand_id=p_brand
        union
        select distinct p.period_month::date
        from public.finance_purchase_expense_bridge_v1 p
        where p.brand_id=p_brand and p.period_month is not null
      ) x
      order by x.period_start desc;
  else
    raise exception 'unsupported module';
  end if;
end
$function$;

create or replace function public.get_ui_period_catalog_fast_v1(
  p_brand uuid,
  p_module text
)
returns table(
  period_start date,
  period_end date,
  period_key text,
  period_year integer,
  period_month_no integer
)
language sql
set search_path=''
as $function$
  select * from private.get_ui_period_catalog_fast_v1(p_brand,p_module);
$function$;

revoke all on function public.get_ui_period_catalog_fast_v1(uuid,text) from public;
grant execute on function public.get_ui_period_catalog_fast_v1(uuid,text) to authenticated, service_role;
