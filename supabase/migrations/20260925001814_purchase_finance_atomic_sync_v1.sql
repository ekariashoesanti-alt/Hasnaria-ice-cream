-- Atomic Purchase canonical replacement + immediate Finance reconciliation.
-- Keeps the legacy browser path working during rollout; statement-level autosync is added separately.

create or replace function private.assert_purchase_period_open_v1(
  p_brand uuid,
  p_source_period date,
  p_effective_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date := coalesce(p_effective_date,p_source_period);
begin
  if p_brand is null or p_source_period is null then
    raise exception 'Purchase period is required';
  end if;
  if exists (
    select 1 from public.accounting_periods ap
    where ap.brand_id=p_brand and ap.status='closed'
      and (p_source_period between ap.period_start and ap.period_end
           or v_date between ap.period_start and ap.period_end)
  ) then
    raise exception 'Purchase period is closed in Finance';
  end if;
end;
$$;
revoke all on function private.assert_purchase_period_open_v1(uuid,date,date) from public,anon,authenticated;
grant execute on function private.assert_purchase_period_open_v1(uuid,date,date) to service_role;

create or replace function private.guard_purchase_period_open_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    perform private.assert_purchase_period_open_v1(old.brand_id,old.source_period,old.purchase_date);
  end if;
  if tg_op in ('INSERT','UPDATE') then
    perform private.assert_purchase_period_open_v1(new.brand_id,new.source_period,new.purchase_date);
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function private.guard_purchase_period_open_v1() from public,anon,authenticated;
grant execute on function private.guard_purchase_period_open_v1() to service_role;

drop trigger if exists offline_purchase_history_open_period_guard on public.offline_purchase_history;
create trigger offline_purchase_history_open_period_guard
before insert or update or delete on public.offline_purchase_history
for each row execute function private.guard_purchase_period_open_v1();

drop trigger if exists purchase_import_evidence_open_period_guard on public.purchase_import_evidence;
create trigger purchase_import_evidence_open_period_guard
before insert or update or delete on public.purchase_import_evidence
for each row execute function private.guard_purchase_period_open_v1();

create or replace function private.reconcile_purchase_classification_v2(
  p_brand uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_inventory_entries integer := 0;
  v_expense_entries integer := 0;
  v_lines integer := 0;
  v_rc integer := 0;
begin
  if p_brand is null or p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid Purchase reconciliation range';
  end if;
  if not private.same_brand(p_brand)
     or not (private.has_capability('settings.manage') or private.can_import_module('purchasing')) then
    raise exception 'Purchase Finance reconciliation permission required';
  end if;

  delete from public.finance_journal_entries e
  where e.brand_id=p_brand and e.auto_generated
    and e.entry_date between p_from and p_to
    and e.source_type in ('purchase','purchase_expense');
  get diagnostics v_deleted = row_count;

  insert into public.finance_journal_entries(
    brand_id,entry_date,source_type,source_id,source_key,description,status,auto_generated,metadata
  )
  select u.brand_id,u.effective_date,'purchase',u.source_history_id,
         'purchase:'||u.source_history_id::text,
         'Pembelian persediaan '||coalesce(u.item_name,'(tanpa nama)'),
         u.finance_status,true,
         jsonb_build_object(
           'accounting_treatment','inventory','analytics_group',u.analytics_group,
           'analytics_category',u.analytics_category,'payment_method',u.payment_method,
           'source','purchase_tab','reconciled_by','finance_purchase_canonical_rebuild_v2')
  from public.ui_purchase_accounting_v1 u
  where u.brand_id=p_brand and u.accounting_treatment='inventory'
    and u.finance_status in ('posted','provisional')
    and u.effective_date between p_from and p_to
    and coalesce(u.total_amount,0)>0;
  get diagnostics v_inventory_entries = row_count;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select e.id,e.brand_id,1,'1300',u.total_amount,0,coalesce(u.item_name,'Pembelian persediaan')
  from public.finance_journal_entries e
  join public.ui_purchase_accounting_v1 u on u.brand_id=e.brand_id and u.source_history_id=e.source_id
  where e.brand_id=p_brand and e.source_type='purchase' and e.entry_date between p_from and p_to;
  get diagnostics v_rc = row_count; v_lines := v_lines + v_rc;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select e.id,e.brand_id,2,coalesce(u.counter_account_code,'2190'),0,u.total_amount,'Lawan pembelian / pembayaran'
  from public.finance_journal_entries e
  join public.ui_purchase_accounting_v1 u on u.brand_id=e.brand_id and u.source_history_id=e.source_id
  where e.brand_id=p_brand and e.source_type='purchase' and e.entry_date between p_from and p_to;
  get diagnostics v_rc = row_count; v_lines := v_lines + v_rc;

  insert into public.finance_journal_entries(
    brand_id,entry_date,source_type,source_id,source_key,description,status,auto_generated,metadata
  )
  select x.brand_id,x.purchase_date,'purchase_expense',x.source_history_id,
         'purchase_expense:'||x.source_history_id::text,
         'Beban pembelian '||coalesce(x.item_name,'(tanpa nama)'),
         x.journal_status,true,
         jsonb_build_object(
           'expense_category',x.expense_category,'payment_method',x.payment_method,
           'source','purchase_tab','reconciled_by','finance_purchase_canonical_rebuild_v2')
  from public.finance_purchase_expense_bridge_v1 x
  where x.brand_id=p_brand and x.purchase_date between p_from and p_to and coalesce(x.total_amount,0)>0;
  get diagnostics v_expense_entries = row_count;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select e.id,e.brand_id,1,x.expense_account_code,x.total_amount,0,
         coalesce(x.expense_category,x.item_name,'Beban pembelian')
  from public.finance_journal_entries e
  join public.finance_purchase_expense_bridge_v1 x on x.brand_id=e.brand_id and x.source_history_id=e.source_id
  where e.brand_id=p_brand and e.source_type='purchase_expense' and e.entry_date between p_from and p_to;
  get diagnostics v_rc = row_count; v_lines := v_lines + v_rc;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select e.id,e.brand_id,2,x.counter_account_code,0,x.total_amount,'Lawan pembayaran beban dari Pembelian'
  from public.finance_journal_entries e
  join public.finance_purchase_expense_bridge_v1 x on x.brand_id=e.brand_id and x.source_history_id=e.source_id
  where e.brand_id=p_brand and e.source_type='purchase_expense' and e.entry_date between p_from and p_to;
  get diagnostics v_rc = row_count; v_lines := v_lines + v_rc;

  if exists (
    select 1
    from public.finance_journal_entries e
    join public.finance_journal_lines l on l.entry_id=e.id
    where e.brand_id=p_brand and e.entry_date between p_from and p_to
      and e.source_type in ('purchase','purchase_expense')
    group by e.id
    having abs(sum(l.debit)-sum(l.credit))>=0.01
  ) then
    raise exception 'Canonical Purchase reconciliation produced unbalanced journal entries';
  end if;

  return jsonb_build_object(
    'deleted_purchase_entries',v_deleted,'inventory_entries',v_inventory_entries,
    'expense_entries',v_expense_entries,'created_lines',v_lines,'from',p_from,'to',p_to);
end;
$$;
revoke all on function private.reconcile_purchase_classification_v2(uuid,date,date) from public,anon,authenticated;
grant execute on function private.reconcile_purchase_classification_v2(uuid,date,date) to service_role;

create or replace function public.replace_purchase_canonical_period_v1(
  p_source_period date,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_brand uuid := private.my_brand_id();
  v_old_min date; v_old_max date; v_new_min date; v_new_max date;
  v_from date; v_to date; v_inserted integer := 0;
  v_finance jsonb := null; v_has_finance_period boolean := false;
begin
  if auth.uid() is null or v_brand is null
     or not private.same_brand(v_brand)
     or not private.can_import_module('purchasing') then
    raise exception 'Purchase import permission required';
  end if;
  if p_source_period is null or jsonb_typeof(coalesce(p_rows,'[]'::jsonb))<>'array' then
    raise exception 'Invalid Purchase canonical payload';
  end if;
  if jsonb_array_length(coalesce(p_rows,'[]'::jsonb))>10000 then
    raise exception 'Purchase canonical payload too large';
  end if;

  select min(coalesce(h.purchase_date,h.source_period)),max(coalesce(h.purchase_date,h.source_period))
    into v_old_min,v_old_max
  from public.offline_purchase_history h
  where h.brand_id=v_brand and h.source_period=p_source_period;

  select min(coalesce(r.purchase_date,p_source_period)),max(coalesce(r.purchase_date,p_source_period))
    into v_new_min,v_new_max
  from jsonb_to_recordset(coalesce(p_rows,'[]'::jsonb)) as r(
    source_file text,row_no integer,purchase_date date,item_name text,quantity_text text,
    unit_text text,unit_price numeric,total_amount numeric,payment_method text,notes text,raw_data jsonb);

  v_from:=least(coalesce(v_old_min,p_source_period),coalesce(v_new_min,p_source_period));
  v_to:=greatest(coalesce(v_old_max,p_source_period),coalesce(v_new_max,p_source_period));

  if exists (
    select 1 from public.accounting_periods ap
    where ap.brand_id=v_brand and ap.status='closed'
      and daterange(ap.period_start,ap.period_end,'[]') && daterange(v_from,v_to,'[]')
  ) then
    raise exception 'Purchase effective range overlaps a closed Finance period';
  end if;

  delete from public.offline_purchase_history h
  where h.brand_id=v_brand and h.source_period=p_source_period;

  insert into public.offline_purchase_history(
    brand_id,source_period,source_file,row_no,purchase_date,item_name,quantity_text,
    unit_text,unit_price,total_amount,payment_method,notes,raw_data)
  select v_brand,p_source_period,
         coalesce(nullif(r.source_file,''),'HASNARIA_PURCHASE_UNIFIED_'||to_char(p_source_period,'YYYY-MM')||'.xlsx'),
         r.row_no,r.purchase_date,r.item_name,r.quantity_text,r.unit_text,r.unit_price,r.total_amount,
         r.payment_method,r.notes,coalesce(r.raw_data,'{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_rows,'[]'::jsonb)) as r(
    source_file text,row_no integer,purchase_date date,item_name text,quantity_text text,
    unit_text text,unit_price numeric,total_amount numeric,payment_method text,notes text,raw_data jsonb)
  order by r.row_no;
  get diagnostics v_inserted = row_count;

  select exists(
    select 1 from public.accounting_periods ap
    where ap.brand_id=v_brand
      and daterange(ap.period_start,ap.period_end,'[]') && daterange(v_from,v_to,'[]')
  ) into v_has_finance_period;
  if v_has_finance_period then
    v_finance:=private.reconcile_purchase_classification_v2(v_brand,v_from,v_to);
  end if;

  return jsonb_build_object(
    'source_period',p_source_period,'inserted_rows',v_inserted,
    'effective_from',v_from,'effective_to',v_to,
    'finance_synced',v_has_finance_period,'finance',v_finance);
end;
$$;
revoke all on function public.replace_purchase_canonical_period_v1(date,jsonb) from public,anon;
grant execute on function public.replace_purchase_canonical_period_v1(date,jsonb) to authenticated;
