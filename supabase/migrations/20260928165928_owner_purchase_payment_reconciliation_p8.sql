create or replace function private.owner_purchase_payment_queue_v1(p_period date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_brand uuid;
  v_month date := date_trunc('month', coalesce(p_period, timezone('Asia/Jakarta', now())::date))::date;
  v_next date := (date_trunc('month', coalesce(p_period, timezone('Asia/Jakarta', now())::date)) + interval '1 month')::date;
  v_rows jsonb;
  v_count bigint := 0;
  v_total numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required';
  end if;
  if not private.is_owner() then
    raise exception 'Owner permission required';
  end if;

  v_brand := private.staff_owner_brand();

  with q as (
    select
      x.source_history_id,
      x.purchase_date,
      x.item_name,
      x.total_amount,
      nullif(btrim(coalesce(x.payment_method,'')), '') as payment_method,
      x.expense_category,
      x.expense_account_code,
      x.counter_account_code,
      x.journal_status,
      h.source_file,
      h.row_no,
      nullif(h.raw_data->>'supplier_name','') as supplier_name,
      nullif(h.raw_data->>'invoice_no','') as invoice_no
    from public.finance_purchase_expense_bridge_v1 x
    join public.offline_purchase_history h
      on h.id=x.source_history_id and h.brand_id=x.brand_id
    where x.brand_id=v_brand
      and x.purchase_date>=v_month and x.purchase_date<v_next
      and x.journal_status='provisional'
  )
  select
    count(*),
    coalesce(sum(total_amount),0),
    coalesce(jsonb_agg(jsonb_build_object(
      'source_history_id',source_history_id,
      'purchase_date',purchase_date,
      'item_name',item_name,
      'total_amount',total_amount,
      'payment_method',payment_method,
      'supplier_name',supplier_name,
      'invoice_no',invoice_no,
      'expense_category',expense_category,
      'expense_account_code',expense_account_code,
      'current_counter_account_code',counter_account_code,
      'journal_status',journal_status,
      'source_file',source_file,
      'row_no',row_no
    ) order by purchase_date,row_no),'[]'::jsonb)
  into v_count,v_total,v_rows
  from q;

  return jsonb_build_object(
    'period_month',v_month,
    'unresolved_count',v_count,
    'unresolved_total',v_total,
    'allowed_methods',jsonb_build_array('TUNAI','TRANSFER','QRIS','UTANG','PAYLATER'),
    'rows',v_rows
  );
end;
$$;

create or replace function public.owner_purchase_payment_queue_v1(p_period date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.owner_purchase_payment_queue_v1(p_period);
$$;

create or replace function private.owner_purchase_set_payment_method_v1(
  p_source_history_id uuid,
  p_payment_method text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_brand uuid;
  v_row public.offline_purchase_history%rowtype;
  v_before jsonb;
  v_method text;
  v_entry_id uuid;
  v_status text;
  v_counter text;
  v_amount numeric;
  v_date date;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required';
  end if;
  if not private.is_owner() then
    raise exception 'Owner permission required';
  end if;

  v_brand := private.staff_owner_brand();
  v_method := upper(btrim(coalesce(p_payment_method,'')));
  v_method := case
    when v_method in ('TUNAI','CASH') then 'TUNAI'
    when v_method in ('TRANSFER','TF','REK MANDIRI','BANK TRANSFER') then 'TRANSFER'
    when v_method='QRIS' then 'QRIS'
    when v_method in ('UTANG','HUTANG') then 'UTANG'
    when v_method in ('PAYLATER','PAY LATER') then 'PAYLATER'
    else null
  end;

  if v_method is null then
    raise exception 'Metode pembayaran tidak valid. Pilih TUNAI, TRANSFER, QRIS, UTANG, atau PAYLATER';
  end if;

  select * into v_row
  from public.offline_purchase_history
  where id=p_source_history_id
  for update;

  if not found then
    raise exception 'Purchase source row not found';
  end if;
  if v_row.brand_id is distinct from v_brand then
    raise exception 'Purchase source row is outside owner brand';
  end if;

  v_date := coalesce(v_row.purchase_date,v_row.source_period);
  if v_date is null then
    raise exception 'Purchase date is missing';
  end if;

  if not exists(
    select 1 from public.accounting_periods ap
    where ap.brand_id=v_brand
      and ap.status='open'
      and v_date between ap.period_start and ap.period_end
  ) then
    raise exception 'Accounting period is closed or unavailable for this purchase';
  end if;

  v_before := jsonb_build_object(
    'payment_method',v_row.payment_method,
    'purchase_date',v_row.purchase_date,
    'item_name',v_row.item_name,
    'total_amount',v_row.total_amount
  );

  update public.offline_purchase_history
  set payment_method=v_method
  where id=p_source_history_id;

  select e.id,e.status,l.account_code,l.credit
  into v_entry_id,v_status,v_counter,v_amount
  from public.finance_journal_entries e
  join public.finance_journal_lines l on l.entry_id=e.id and l.line_no=2
  where e.brand_id=v_brand
    and e.source_type='purchase_expense'
    and e.source_id=p_source_history_id;

  if v_entry_id is null or v_status is distinct from 'posted' then
    perform private.reconcile_purchase_classification_v2(v_brand,v_date,v_date);

    select e.id,e.status,l.account_code,l.credit
    into v_entry_id,v_status,v_counter,v_amount
    from public.finance_journal_entries e
    join public.finance_journal_lines l on l.entry_id=e.id and l.line_no=2
    where e.brand_id=v_brand
      and e.source_type='purchase_expense'
      and e.source_id=p_source_history_id;
  end if;

  if v_entry_id is null or v_status is distinct from 'posted' then
    raise exception 'Payment reconciliation did not produce a posted purchase journal';
  end if;

  perform private.write_audit_log(
    v_brand,
    null,
    'purchase_payment_method',
    p_source_history_id,
    'RECONCILE',
    auth.uid(),
    v_before,
    jsonb_build_object(
      'payment_method',v_method,
      'journal_entry_id',v_entry_id,
      'journal_status',v_status,
      'counter_account_code',v_counter,
      'amount',v_amount
    ),
    nullif(btrim(coalesce(p_reason,'')),''),
    jsonb_build_object('source','owner_purchase_payment_reconciliation_p8')
  );

  return jsonb_build_object(
    'source_history_id',p_source_history_id,
    'payment_method',v_method,
    'journal_entry_id',v_entry_id,
    'journal_status',v_status,
    'counter_account_code',v_counter,
    'amount',v_amount
  );
end;
$$;

create or replace function public.owner_purchase_set_payment_method_v1(
  p_source_history_id uuid,
  p_payment_method text,
  p_reason text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.owner_purchase_set_payment_method_v1(p_source_history_id,p_payment_method,p_reason);
$$;

revoke all on function public.owner_purchase_payment_queue_v1(date) from public, anon;
revoke all on function public.owner_purchase_set_payment_method_v1(uuid,text,text) from public, anon;
grant execute on function public.owner_purchase_payment_queue_v1(date) to authenticated;
grant execute on function public.owner_purchase_set_payment_method_v1(uuid,text,text) to authenticated;
