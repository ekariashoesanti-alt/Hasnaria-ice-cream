-- Majoo purchase evidence is audit-only and must not enter Staff Kasir reconciliation queues.

create or replace function private.staff_purchase_reconciliation_queue_v3(p_token text,p_period date default null)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_emp public.employees%rowtype;
  v_month date:=date_trunc('month',coalesce(p_period,timezone('Asia/Jakarta',now())::date))::date;
  v_next date:=(date_trunc('month',coalesce(p_period,timezone('Asia/Jakarta',now())::date))+interval '1 month')::date;
  v_rows jsonb;
begin
  v_emp:=private.staff_session_employee(p_token,'kasir');
  with q as (
    select 'payment_account'::text issue_type,e.id evidence_id,null::uuid source_history_id,
           e.purchase_date business_date,e.item_name,e.total_amount,nullif(btrim(e.payment_method),'') current_value,
           coalesce(nullif(e.raw_data->>'source_payment_label',''),nullif(e.payment_method,''),'Belum dipetakan') source_label,
           null::text mapping_status,e.source_type,e.source_file,e.row_no,10 priority
    from public.purchase_import_evidence e
    where e.brand_id=v_emp.brand_id and e.source_period=v_month
      and e.source_type<>'majoo'
      and (private.normalize_purchase_payment_method_v1(e.payment_method) is null
           or private.normalize_purchase_payment_method_v1(e.payment_method)='BELUM_DIPETAKAN')
      and coalesce(e.total_amount,0)>0
    union all
    select 'expense_account'::text,null::uuid,h.id,f.purchase_date,h.item_name,h.total_amount,
           nullif(h.raw_data->>'finance_account_code_override',''),
           coalesce(b.mapping_status,'Belum dipetakan'),b.mapping_status,'canonical'::text,h.source_file,h.row_no,20
    from public.offline_purchase_history h
    join public.purchase_inventory_bridge b on b.id=h.id and b.brand_id=h.brand_id
    join public.finance_purchase_expense_bridge_v1 f on f.source_history_id=h.id and f.brand_id=h.brand_id
    where h.brand_id=v_emp.brand_id
      and f.purchase_date>=v_month and f.purchase_date<v_next
      and f.expense_account_code='1990'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'issue_type',issue_type,'evidence_id',evidence_id,'source_history_id',source_history_id,
    'business_date',business_date,'item_name',item_name,'total_amount',total_amount,
    'current_value',current_value,'source_label',source_label,'mapping_status',mapping_status,
    'source_type',source_type,'source_file',source_file,'row_no',row_no
  ) order by priority,business_date,row_no,item_name),'[]'::jsonb)
  into v_rows from q;
  return jsonb_build_object(
    'period_month',v_month,
    'payment_options',jsonb_build_array(
      jsonb_build_object('method','TUNAI','account_code','1000','account_name','Cash'),
      jsonb_build_object('method','TRANSFER','account_code','1100','account_name','Bank / QRIS Settlement'),
      jsonb_build_object('method','QRIS','account_code','1100','account_name','Bank / QRIS Settlement'),
      jsonb_build_object('method','UTANG','account_code','2000','account_name','Accounts Payable'),
      jsonb_build_object('method','PAYLATER','account_code','2000','account_name','Accounts Payable')
    ),'rows',v_rows
  );
end;
$$;

comment on function private.staff_purchase_reconciliation_queue_v3(text,date) is
  'Staff purchase reconciliation queue; Majoo evidence-only rows are excluded from operational correction workflows.';
