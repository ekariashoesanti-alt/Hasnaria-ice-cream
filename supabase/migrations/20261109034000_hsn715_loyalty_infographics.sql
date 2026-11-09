-- HSN-715 · Owner only, read-only infographic sources. No changes to sales, stock, or customer imports.
begin;
create or replace function public.get_loyalty_infographics_v1(p_period_month date default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_brand uuid;
  v_period date;
  v_start date;
  v_result jsonb;
begin
  select u.brand_id into v_brand
  from public.user_profiles u
  where u.id=auth.uid() and u.role='owner' and u.status='active';
  if v_brand is null then
    raise exception 'Akses Loyalty hanya untuk Owner aktif.' using errcode='42501';
  end if;
  v_period:=coalesce(p_period_month,date_trunc('month',now() at time zone 'Asia/Jakarta')::date);
  if v_period<>date_trunc('month',v_period)::date
    or extract(year from v_period) not between 2020 and 2100 then
    raise exception 'Periode infografis tidak valid.';
  end if;
  v_start:=make_date(extract(year from v_period)::int,1,1);
  with
  selected_batches as (
    select b.id,b.period_month from public.loyalty_import_batches b
    where b.brand_id=v_brand and b.is_current
      and b.period_month between v_start and v_period
  ),
  month_axis as (
    select gs::date as month_date
    from pg_catalog.generate_series(v_start::timestamp,v_period::timestamp,interval '1 month') gs
  ),
  month_totals as (
    select sb.period_month as month_date,
      count(s.customer_id)::int as customers,
      coalesce(sum(s.period_visits),0)::bigint as visits,
      coalesce(sum(s.period_revenue),0)::numeric as revenue
    from selected_batches sb
    join public.loyalty_customer_snapshots s on s.batch_id=sb.id and s.brand_id=v_brand
    group by sb.period_month
  ),
  months as (
    select m.month_date,
      mt.month_date is not null as available,
      mt.customers,mt.visits,mt.revenue
    from month_axis m left join month_totals mt on mt.month_date=m.month_date
  ),
  customer_totals as (
    select s.customer_id,
      (array_agg(s.source_name order by s.period_month desc,s.source_row))[1] as name,
      right(max(c.phone),4) as phone_last4,
      sum(s.period_visits)::bigint as visits,
      sum(s.period_revenue)::numeric as revenue,
      max(s.last_visit_at) as last_visit_at
    from public.loyalty_customer_snapshots s
    join selected_batches sb on sb.id=s.batch_id
    join public.customers c on c.id=s.customer_id and c.brand_id=v_brand
    where s.brand_id=v_brand
    group by s.customer_id
  ),
  top_three as (
    select c.name,c.phone_last4,c.visits,c.revenue
    from customer_totals c
    order by c.visits desc,c.revenue desc,lower(c.name),c.customer_id
    limit 3
  )
  select jsonb_build_object(
    'period_month',v_period,
    'months', (select coalesce(jsonb_agg(jsonb_build_object(
      'month',to_char(month_date,'YYYY-MM'),
      'available',available,
      'customers',customers,
      'visits',visits,
      'revenue',revenue
    ) order by month_date),'[]'::jsonb) from months),
    'top_loyal',(select coalesce(jsonb_agg(to_jsonb(t) order by t.visits desc,t.revenue desc,lower(t.name)),'[]'::jsonb) from top_three t)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_loyalty_infographics_v1(date) from public,anon,authenticated;
grant execute on function public.get_loyalty_infographics_v1(date) to authenticated;
comment on function public.get_loyalty_infographics_v1(date)
  is 'Owner-only YTD monthly observed visit trend and top 3 returning customers; missing months null, no fabricated historic data.';
commit;
