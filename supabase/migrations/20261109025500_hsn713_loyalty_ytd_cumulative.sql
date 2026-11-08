-- HSN-713: cumulative customer Loyalty Jan–selected month based on current Majoo monthly snapshots.
-- Read-only additive RPC. Existing monthly RPC, imports, canonical sales and inventory are unchanged.
begin;

create or replace function public.get_loyalty_ytd_dashboard_v1(
  p_period_month date default null,
  p_search text default '',
  p_sort text default 'spend',
  p_limit integer default 6,
  p_offset integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_brand uuid;
  v_period date;
  v_year_start date;
  v_search text;
  v_digits text;
  v_out jsonb;
begin
  select u.brand_id into v_brand
  from public.user_profiles u
  where u.id=auth.uid() and u.status='active' and u.role='owner';
  if v_brand is null then
    raise exception 'Akses YTD Loyalty hanya untuk Owner aktif.' using errcode='42501';
  end if;

  v_period := coalesce(p_period_month,date_trunc('month',now() at time zone 'Asia/Jakarta')::date);
  if v_period<>date_trunc('month',v_period)::date
     or extract(year from v_period) not between 2020 and 2100 then
    raise exception 'Bulan akhir YTD tidak valid.';
  end if;
  if p_limit is null or p_limit not between 1 and 100
     or p_offset is null or p_offset not between 0 and 100000
     or coalesce(p_sort,'') not in ('spend','visits','recent','name')
     or length(coalesce(p_search,''))>100 then
    raise exception 'Parameter filter YTD tidak valid.';
  end if;
  v_year_start := make_date(extract(year from v_period)::int,1,1);
  v_search := lower(btrim(coalesce(p_search,'')));
  v_digits := regexp_replace(coalesce(p_search,''),'[^0-9]','','g');

  with
  months as (
    select g::date as month_date
    from pg_catalog.generate_series(v_year_start::timestamp,v_period::timestamp,interval '1 month') g
  ),
  current_batches as (
    select b.id,b.period_month,b.source_file,b.source_generated_at,b.imported_at
    from public.loyalty_import_batches b
    where b.brand_id=v_brand and b.is_current
      and b.period_month between v_year_start and v_period
  ),
  coverage as (
    select count(*)::int as expected_months,
      count(cb.id)::int as imported_months,
      coalesce(jsonb_agg(to_char(m.month_date,'YYYY-MM') order by m.month_date)
        filter (where cb.id is null),'[]'::jsonb) as missing_months,
      coalesce(jsonb_agg(to_char(m.month_date,'YYYY-MM') order by m.month_date)
        filter (where cb.id is not null),'[]'::jsonb) as loaded_months
    from months m left join current_batches cb on cb.period_month=m.month_date
  ),
  customer_totals as (
    select s.customer_id,
      (array_agg(s.source_name order by s.period_month desc,s.source_row))[1] as name,
      right(max(c.phone),4) as phone_last4,
      max(c.phone) as phone_search,
      sum(s.period_visits)::bigint as visits,
      sum(s.period_revenue)::numeric as revenue,
      max(s.last_visit_at) as last_visit_at,
      min(s.registration_date) as registration_date,
      (array_agg(s.registration_outlet order by s.period_month desc))[1] as registration_outlet
    from public.loyalty_customer_snapshots s
    join current_batches cb on cb.id=s.batch_id
    join public.customers c on c.id=s.customer_id and c.brand_id=v_brand
    where s.brand_id=v_brand
    group by s.customer_id
  ),
  summary as (
    select count(*)::int as customers,
      count(*) filter (where visits>=2)::int as repeat_customers,
      coalesce(sum(visits),0)::bigint as transactions,
      coalesce(sum(revenue),0)::numeric as revenue,
      coalesce(sum(revenue) filter (where visits>=2),0)::numeric as repeat_revenue
    from customer_totals
  ),
  groups as (
    select g.n, g.label,
      count(c.customer_id)::int as customers,
      coalesce(sum(c.revenue),0)::numeric as revenue
    from (values (1,'1'),(2,'2'),(3,'3+')) g(n,label)
    left join customer_totals c
      on (case when c.visits>=3 then 3 else c.visits end)=g.n
    group by g.n,g.label
  ),
  matching as (
    select c.*
    from customer_totals c
    where v_search='' or position(v_search in lower(c.name))>0
      or (v_digits<>'' and position(v_digits in regexp_replace(c.phone_search,'[^0-9]','','g'))>0)
  ),
  ranked as (
    select row_number() over (
       order by
         case when p_sort='spend' then revenue end desc nulls last,
         case when p_sort='visits' then visits end desc nulls last,
         case when p_sort='recent' then last_visit_at end desc nulls last,
         case when p_sort='name' then lower(name) end asc nulls last,
         lower(name),customer_id
      ) as item_rank,
      customer_id,name,phone_last4,visits,revenue,last_visit_at,registration_date,registration_outlet,
      case when visits>=3 then 'high_frequency'
        when visits=2 then 'repeat' else 'single' end as segment
    from matching
  ),
  page_rows as (
    select * from ranked
    where item_rank>p_offset and item_rank<=p_offset+p_limit
  )
  select jsonb_build_object(
    'status',case when (select customers from summary)>0 then 'ok' else 'empty' end,
    'scope','ytd',
    'period_month',v_period,
    'year_start',v_year_start,
    'batch',(
      select jsonb_build_object('period_month',b.period_month,'source_file',b.source_file,
        'source_generated_at',b.source_generated_at,'imported_at',b.imported_at)
      from current_batches b order by b.period_month desc limit 1
    ),
    'coverage',(
      select jsonb_build_object('expected_months',cov.expected_months,
        'imported_months',cov.imported_months,'missing_months',cov.missing_months,
        'loaded_months',cov.loaded_months,
        'complete',cov.expected_months=cov.imported_months)
      from coverage cov
    ),
    'summary',(
      select jsonb_build_object('customers',s.customers,'repeat_customers',s.repeat_customers,
        'transactions',s.transactions,'revenue',s.revenue,'repeat_revenue',s.repeat_revenue)
      from summary s
    ),
    'distribution',(
      select coalesce(jsonb_agg(jsonb_build_object('group',g.label,'customers',g.customers,
        'revenue',g.revenue) order by g.n),'[]'::jsonb)
      from groups g
    ),
    'matched_rows',(select count(*) from matching),
    'customers',(
      select coalesce(jsonb_agg(to_jsonb(p)-'item_rank' order by p.item_rank),'[]'::jsonb)
      from page_rows p
    )
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.get_loyalty_ytd_dashboard_v1(date,text,text,integer,integer)
  from public,anon,authenticated;
grant execute on function public.get_loyalty_ytd_dashboard_v1(date,text,text,integer,integer)
  to authenticated;

comment on function public.get_loyalty_ytd_dashboard_v1(date,text,text,integer,integer)
is 'Owner-only YTD unique customers, cumulative visits/revenue and missing-month coverage based only on current Majoo monthly batches. Does not post Sales, Stock or Finance.';

commit;
