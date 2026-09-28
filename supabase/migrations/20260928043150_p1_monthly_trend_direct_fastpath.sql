create or replace function public.get_ui_monthly_trend_v1(p_brand uuid, p_limit integer default 12)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,12),24));
  v_rows jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required';
  end if;
  if p_brand is null or not private.same_brand(p_brand) then
    raise exception 'Brand access denied';
  end if;

  with
  pib as materialized (
    select p.id,p.brand_id,p.source_period,p.purchase_date,p.item_name,p.total_amount,
           p.payment_method,p.mapping_status,p.raw_data
    from public.purchase_inventory_bridge p
    where p.brand_id=p_brand
  ),
  sales_m as (
    select s.brand_id,
           date_trunc('month',s.sold_at)::date as mon,
           sum(s.total_amount)::numeric as sales_revenue,
           sum(coalesce(s.cash_amount,0)+coalesce(s.qris_amount,0)+coalesce(s.tf_amount,0))::numeric as known_cash_in
    from public.sales s
    where s.brand_id=p_brand
    group by s.brand_id,date_trunc('month',s.sold_at)::date
  ),
  purchase_rows as (
    select p.brand_id,
           date_trunc('month',coalesce(p.purchase_date,p.source_period)::timestamp)::date as mon,
           p.total_amount,
           case
             when coalesce(p.raw_data->>'analytics_group','')='Karyawan'
               or coalesce(p.raw_data->>'analytics_category','') ilike '%Karyawan%'
               or upper(coalesce(p.item_name,'')) ~ '(GAJI|KARYAWAN|SERAGAM|JAS HUJAN|MAKAN SIANG|TUNJANGAN|BONUS|LEMBUR)'
               then 'Beban Kepegawaian'
             when upper(coalesce(p.item_name,'')) ~ '(SERVIS|SERVICE|PERBAIK|MAINTENANCE|KEBERSIH|SABUN|TISSUE|DETERGEN|PLASTIK SAMPAH|PERALATAN|ALAT KECIL|LAMPU|REPAIR|LISTRIK|TOKEN|GAS|CUCI)'
               then 'Beban Pemeliharaan'
             when coalesce(p.raw_data->>'analytics_category','')=any(array['Makanan','Minuman','Ice Cream','Kemasan & Supplies'])
               then 'Beban Bahan Baku'
             else 'Beban Administrasi'
           end as expense_category
    from pib p
    where coalesce(p.total_amount,0)>0
      and coalesce(p.mapping_status,'')<>all(array['excluded','payment_candidate'])
  ),
  purchase_m as (
    select brand_id,mon,
           count(*)::bigint as purchase_rows,
           coalesce(sum(total_amount),0)::numeric as total_purchase_expense,
           coalesce(sum(total_amount) filter(where expense_category='Beban Administrasi'),0)::numeric as admin_expense,
           coalesce(sum(total_amount) filter(where expense_category='Beban Pemeliharaan'),0)::numeric as maintenance_expense,
           coalesce(sum(total_amount) filter(where expense_category='Beban Bahan Baku'),0)::numeric as raw_material_expense,
           coalesce(sum(total_amount) filter(where expense_category='Beban Kepegawaian'),0)::numeric as personnel_expense
    from purchase_rows
    group by brand_id,mon
  ),
  cash_base as (
    select p.brand_id,p.source_period as mon,
           coalesce(sum(coalesce(p.total_amount,0)) filter(
             where p.mapping_status=any(array['exact_name','inventory_alias','expense_candidate'])
               and upper(btrim(coalesce(p.payment_method,'')))='TUNAI'),0)::numeric as known_cash_out,
           coalesce(sum(coalesce(p.total_amount,0)) filter(
             where p.mapping_status=any(array['exact_name','inventory_alias','expense_candidate'])
               and upper(btrim(coalesce(p.payment_method,'')))=any(array['PAYLATER','UTANG RIA','TUNAI + UTANG RIA'])),0)::numeric as credit_or_mixed_purchase,
           coalesce(sum(coalesce(p.total_amount,0)) filter(
             where p.mapping_status=any(array['exact_name','inventory_alias','expense_candidate'])
               and upper(btrim(coalesce(p.payment_method,'')))<>all(array['TUNAI','PAYLATER','UTANG RIA','TUNAI + UTANG RIA'])),0)::numeric as payment_method_unknown,
           coalesce(sum(coalesce(p.total_amount,0)) filter(
             where p.mapping_status=any(array['unmatched','invalid_qty','ambiguous_inventory_name'])),0)::numeric as unclassified_purchase_amount
    from pib p
    group by p.brand_id,p.source_period
  ),
  source_fin as (
    select p.brand_id,p.source_period as mon,
           coalesce(sum(p.total_amount) filter(where r.source_history_id is null),0)::numeric as financing_unresolved,
           coalesce(sum(p.total_amount) filter(where r.resolution='liability_only'),0)::numeric as financing_liability_only
    from pib p
    left join public.financing_payment_resolutions r on r.source_history_id=p.id
    where p.mapping_status='payment_candidate'
    group by p.brand_id,p.source_period
  ),
  cash_fin as (
    select r.brand_id,
           date_trunc('month',r.cash_date::timestamp with time zone)::date as mon,
           coalesce(sum(r.cash_amount),0)::numeric as financing_cash_paid
    from public.financing_payment_resolutions r
    where r.brand_id=p_brand and r.resolution='cash_paid'
    group by r.brand_id,date_trunc('month',r.cash_date::timestamp with time zone)::date
  ),
  finance_m as (
    select e.brand_id,e.period_month as mon,
           coalesce(sum(l.credit-l.debit) filter(where a.account_type='REVENUE' and a.code<>'4000'),0)::numeric as other_income,
           coalesce(sum(l.debit-l.credit) filter(where a.code='6400'),0)::numeric as finance_expense,
           coalesce(sum(l.debit-l.credit) filter(where a.code='6500'),0)::numeric as tax_expense
    from public.finance_journal_entries e
    join public.finance_journal_lines l on l.entry_id=e.id and l.brand_id=e.brand_id
    join public.finance_accounts a on a.brand_id=e.brand_id and a.code=l.account_code
    where e.brand_id=p_brand and e.status<>'void'
    group by e.brand_id,e.period_month
  ),
  months_all as (
    select brand_id,mon from sales_m
    union select brand_id,mon from purchase_m
    union select brand_id,mon from cash_base
    union select brand_id,mon from source_fin
    union select brand_id,mon from cash_fin
    union select brand_id,mon from finance_m
  ),
  months as (
    select m.brand_id,m.mon
    from months_all m
    where m.brand_id=p_brand
    order by m.mon desc
    limit v_limit
  ),
  rows as (
    select m.brand_id,m.mon as month,
           0::bigint as review_rows,
           coalesce(f.tax_expense,0)::numeric as tax_expense,
           coalesce(f.other_income,0)::numeric as other_income,
           'purchase_expense_categories'::text as report_basis,
           coalesce(p.admin_expense,0)::numeric as admin_expense,
           coalesce(s.known_cash_in,0)::numeric as known_cash_in,
           coalesce(p.purchase_rows,0)::bigint as purchase_rows,
           0::numeric as review_amount,
           coalesce(s.sales_revenue,0)::numeric as sales_revenue,
           (coalesce(cb.known_cash_out,0)+coalesce(cf.financing_cash_paid,0))::numeric as known_cash_out,
           coalesce(f.finance_expense,0)::numeric as finance_expense,
           (coalesce(s.sales_revenue,0)+coalesce(f.other_income,0)-coalesce(p.total_purchase_expense,0)-coalesce(f.finance_expense,0)-coalesce(f.tax_expense,0))::numeric as profit_after_tax,
           coalesce(p.personnel_expense,0)::numeric as personnel_expense,
           (coalesce(s.sales_revenue,0)+coalesce(f.other_income,0)-coalesce(p.total_purchase_expense,0)-coalesce(f.finance_expense,0))::numeric as profit_before_tax,
           coalesce(cf.financing_cash_paid,0)::numeric as financing_cash_paid,
           coalesce(p.maintenance_expense,0)::numeric as maintenance_expense,
           case when coalesce(cb.unclassified_purchase_amount,0)>0
                     or coalesce(cb.payment_method_unknown,0)>0
                     or coalesce(sf.financing_unresolved,0)>0
                then 'partial' else 'classified' end::text as cashflow_data_status,
           coalesce(p.raw_material_expense,0)::numeric as raw_material_expense,
           coalesce(p.total_purchase_expense,0)::numeric as total_purchase_expense,
           (coalesce(s.known_cash_in,0)-coalesce(cb.known_cash_out,0)-coalesce(cf.financing_cash_paid,0))::numeric as net_known_cash_movement,
           coalesce(cb.credit_or_mixed_purchase,0)::numeric as credit_or_mixed_purchase,
           coalesce(sf.financing_liability_only,0)::numeric as financing_liability_only
    from months m
    left join sales_m s using(brand_id,mon)
    left join purchase_m p using(brand_id,mon)
    left join cash_base cb using(brand_id,mon)
    left join source_fin sf using(brand_id,mon)
    left join cash_fin cf using(brand_id,mon)
    left join finance_m f using(brand_id,mon)
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by month desc),'[]'::jsonb)
  into v_rows
  from rows;

  return coalesce(v_rows,'[]'::jsonb);
end;
$function$;

revoke all on function public.get_ui_monthly_trend_v1(uuid,integer) from public;
grant execute on function public.get_ui_monthly_trend_v1(uuid,integer) to authenticated,service_role;
