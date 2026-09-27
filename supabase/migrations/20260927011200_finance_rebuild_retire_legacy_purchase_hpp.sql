-- Align the canonical journal rebuild with the active management SOP.
-- Purchase value is posted only by reconcile_purchase_classification_v2 as expense;
-- Stock remains quantity-only and HPP/sale_cogs is retired from the active journal rebuild.

create or replace function private.rebuild_finance_journal_v1(p_brand uuid,p_from date,p_to date)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_deleted integer:=0;
  v_entries integer:=0;
  v_lines integer:=0;
  v_rc integer:=0;
begin
  if p_brand is null or p_from is null or p_to is null or p_from>p_to then
    raise exception 'Invalid journal rebuild range';
  end if;
  if not private.same_brand(p_brand) or not private.has_capability('settings.manage') then
    raise exception 'Owner permission required';
  end if;
  if exists(
    select 1 from public.accounting_periods ap
    where ap.brand_id=p_brand and ap.status='closed'
      and daterange(ap.period_start,ap.period_end,'[]') && daterange(p_from,p_to,'[]')
  ) then
    raise exception 'Closed accounting period overlaps rebuild range';
  end if;

  -- Only rebuild source types owned by this routine. Other accounting automation remains untouched.
  delete from public.finance_journal_entries e
  where e.brand_id=p_brand
    and e.auto_generated
    and e.entry_date between p_from and p_to
    and e.source_type in ('sale','expense','purchase','purchase_expense','sale_cogs');
  get diagnostics v_deleted=row_count;

  -- Sales: tender/cash/bank versus revenue. No sale_cogs/HPP entry is created.
  insert into public.finance_journal_entries(
    brand_id,entry_date,source_type,source_id,source_key,description,status,auto_generated,metadata
  )
  select s.brand_id,s.sold_at,'sale',s.id,'sale:'||s.id::text,'Penjualan '||s.sold_at::text,
    case when abs(s.total_amount-(coalesce(s.cash_amount,0)+coalesce(s.qris_amount,0)+coalesce(s.tf_amount,0)))<0.01 then 'posted' else 'provisional' end,
    true,jsonb_build_object('channel',s.channel,'transaction_count',s.transaction_count,'journal_policy','management_purchase_basis')
  from public.sales s
  where s.brand_id=p_brand and s.sold_at between p_from and p_to and s.total_amount>0;
  get diagnostics v_rc=row_count; v_entries:=v_entries+v_rc;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select e.id,e.brand_id,x.line_no,x.account_code,x.debit,x.credit,x.memo
  from public.finance_journal_entries e
  join public.sales s on e.source_type='sale' and e.source_id=s.id
  cross join lateral (values
    (1,'1000',greatest(coalesce(s.cash_amount,0),0)::numeric,0::numeric,'Kas penjualan'),
    (2,'1100',greatest(coalesce(s.qris_amount,0)+coalesce(s.tf_amount,0),0)::numeric,0::numeric,'Bank / QRIS / transfer'),
    (3,'1199',greatest(s.total_amount-(coalesce(s.cash_amount,0)+coalesce(s.qris_amount,0)+coalesce(s.tf_amount,0)),0)::numeric,0::numeric,'Penerimaan belum terklasifikasi'),
    (4,'2199',0::numeric,greatest((coalesce(s.cash_amount,0)+coalesce(s.qris_amount,0)+coalesce(s.tf_amount,0))-s.total_amount,0)::numeric,'Selisih tender'),
    (5,'4000',0::numeric,s.total_amount::numeric,'Pendapatan penjualan')
  ) x(line_no,account_code,debit,credit,memo)
  where e.brand_id=p_brand and e.entry_date between p_from and p_to
    and e.source_type='sale' and (x.debit>0 or x.credit>0);
  get diagnostics v_rc=row_count; v_lines:=v_lines+v_rc;

  -- Manual/standalone expenses only. Purchase-origin expenses are handled by the canonical Purchase reconciler.
  insert into public.finance_journal_entries(
    brand_id,entry_date,source_type,source_id,source_key,description,status,auto_generated,metadata
  )
  select e.brand_id,e.expense_date,'expense',e.id,'expense:'||e.id::text,
    coalesce(nullif(btrim(e.category),''),'Beban operasional'),
    'provisional',true,jsonb_build_object('category',e.category,'legacy_payment_account','unknown','journal_policy','management_purchase_basis')
  from public.expenses e
  where e.brand_id=p_brand and e.expense_date between p_from and p_to
    and e.status in ('recorded','approved') and e.source_history_id is null and e.amount>0;
  get diagnostics v_rc=row_count; v_entries:=v_entries+v_rc;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select j.id,j.brand_id,1,
    case when lower(coalesce(e.category,'')) ~ '(gaji|salary|wage|employee|karyawan|kepegawaian)' then '6200'
         when lower(coalesce(e.category,'')) ~ '(admin|atk|office|perizin|license|lisensi)' then '6100'
         when lower(coalesce(e.category,'')) ~ '(depres|penyusutan)' then '6300'
         when lower(coalesce(e.category,'')) ~ '(bunga|bank|finance|keuangan)' then '6400'
         when lower(coalesce(e.category,'')) ~ '(pajak|tax)' then '6500'
         else '6000' end,
    e.amount,0,coalesce(e.category,'Beban operasional')
  from public.finance_journal_entries j
  join public.expenses e on j.source_type='expense' and j.source_id=e.id
  where j.brand_id=p_brand and j.entry_date between p_from and p_to;
  get diagnostics v_rc=row_count; v_lines:=v_lines+v_rc;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select j.id,j.brand_id,2,'2190',0,e.amount,'Sumber pembayaran belum direkonsiliasi'
  from public.finance_journal_entries j
  join public.expenses e on j.source_type='expense' and j.source_id=e.id
  where j.brand_id=p_brand and j.entry_date between p_from and p_to;
  get diagnostics v_rc=row_count; v_lines:=v_lines+v_rc;

  if exists(
    select 1
    from public.finance_journal_entries e
    join public.finance_journal_lines l on l.entry_id=e.id
    where e.brand_id=p_brand and e.entry_date between p_from and p_to
      and e.source_type in ('sale','expense')
    group by e.id
    having abs(sum(l.debit)-sum(l.credit))>=0.01
  ) then
    raise exception 'Journal rebuild produced unbalanced entry';
  end if;

  return jsonb_build_object(
    'deleted_entries',v_deleted,
    'created_entries',v_entries,
    'created_lines',v_lines,
    'from',p_from,
    'to',p_to,
    'policy','management_purchase_basis',
    'purchase_value_policy','expense_via_purchase_reconciler',
    'stock_value_policy','quantity_only',
    'hpp_policy','retired'
  );
end;
$$;

-- Public wrapper stays the same contract: rebuild base sales/manual expenses, then canonical Purchase expenses.
create or replace function public.rebuild_finance_journal_v1(p_from date,p_to date)
returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_brand uuid := private.my_brand_id();
  v_base jsonb;
  v_purchase jsonb;
begin
  v_base := private.rebuild_finance_journal_v1(v_brand,p_from,p_to);
  v_purchase := private.reconcile_purchase_classification_v2(v_brand,p_from,p_to);
  return coalesce(v_base,'{}'::jsonb) || jsonb_build_object('purchase_alignment',v_purchase);
end;
$$;

grant execute on function public.rebuild_finance_journal_v1(date,date) to authenticated,service_role;
