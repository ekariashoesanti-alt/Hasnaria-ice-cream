-- Purchase Excel safe-merge support + Staff Kasir account reconciliation v3.
-- Unknown payment accounts stay in purchase_import_evidence until a staff member maps them.

create or replace view public.finance_purchase_expense_bridge_v1
with (security_invoker=true)
as
with p0 as (
  select p.*,
    case
      when upper(btrim(coalesce(p.payment_method,''))) in ('TUNAI','CASH') then 'TUNAI'
      when upper(btrim(coalesce(p.payment_method,''))) in ('TRANSFER','TF','REK MANDIRI','BANK TRANSFER') then 'TRANSFER'
      when upper(btrim(coalesce(p.payment_method,'')))='QRIS' then 'QRIS'
      when upper(btrim(coalesce(p.payment_method,''))) in ('UTANG','HUTANG','UTANG RIA') then 'UTANG'
      when upper(btrim(coalesce(p.payment_method,''))) in ('PAYLATER','PAY LATER') then 'PAYLATER'
      else null
    end as normalized_payment_method
  from public.purchase_inventory_bridge p
)
select
  p.id as source_history_id,
  p.brand_id,
  coalesce(p.purchase_date,p.source_period) as purchase_date,
  date_trunc('month',coalesce(p.purchase_date,p.source_period))::date as period_month,
  p.item_name,p.total_amount,p.payment_method,
  case
    when fa_override.code is not null then fa_override.name
    when coalesce(p.raw_data->>'analytics_group','')='Karyawan'
      or coalesce(p.raw_data->>'analytics_category','') ilike '%Karyawan%'
      or upper(coalesce(p.item_name,'')) ~ '(GAJI|KARYAWAN|SERAGAM|JAS HUJAN|MAKAN SIANG|TUNJANGAN|BONUS|LEMBUR)' then 'Beban Kepegawaian'
    when upper(coalesce(p.item_name,'')) ~ '(SERVIS|SERVICE|PERBAIK|MAINTENANCE|KEBERSIH|SABUN|TISSUE|DETERGEN|PLASTIK SAMPAH|PERALATAN|ALAT KECIL|LAMPU|REPAIR|LISTRIK|TOKEN|GAS|CUCI)' then 'Beban Pemeliharaan'
    when coalesce(p.raw_data->>'analytics_category','') in ('Makanan','Minuman','Ice Cream','Kemasan & Supplies') then 'Beban Bahan Baku'
    else 'Beban Administrasi'
  end as expense_category,
  coalesce(fa_override.code,
    case
      when coalesce(p.raw_data->>'analytics_group','')='Karyawan'
        or coalesce(p.raw_data->>'analytics_category','') ilike '%Karyawan%'
        or upper(coalesce(p.item_name,'')) ~ '(GAJI|KARYAWAN|SERAGAM|JAS HUJAN|MAKAN SIANG|TUNJANGAN|BONUS|LEMBUR)' then '6200'
      when upper(coalesce(p.item_name,'')) ~ '(SERVIS|SERVICE|PERBAIK|MAINTENANCE|KEBERSIH|SABUN|TISSUE|DETERGEN|PLASTIK SAMPAH|PERALATAN|ALAT KECIL|LAMPU|REPAIR|LISTRIK|TOKEN|GAS|CUCI)' then '6110'
      when coalesce(p.raw_data->>'analytics_category','') in ('Makanan','Minuman','Ice Cream','Kemasan & Supplies') then '6120'
      else '6100'
    end
  ) as expense_account_code,
  case
    when p.normalized_payment_method='TUNAI' then '1000'
    when p.normalized_payment_method in ('TRANSFER','QRIS') then '1100'
    when p.normalized_payment_method in ('UTANG','PAYLATER') then '2000'
    else '2190'
  end as counter_account_code,
  case when p.normalized_payment_method is not null then 'posted' else 'provisional' end as journal_status
from p0 p
left join public.finance_accounts fa_override
  on fa_override.brand_id=p.brand_id
 and fa_override.code=nullif(p.raw_data->>'finance_account_code_override','')
 and fa_override.active
 and fa_override.account_type in ('ASSET','LIABILITY','EXPENSE','COGS')
where coalesce(p.total_amount,0)>0
  and coalesce(p.mapping_status,'') not in ('excluded','payment_candidate');

grant select on public.finance_purchase_expense_bridge_v1 to authenticated;

create or replace function private.refresh_purchase_finance_row_v3(p_brand uuid,p_source_history_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare x record; v_entry uuid;
begin
  delete from public.finance_journal_entries e
  where e.brand_id=p_brand and e.source_type='purchase_expense'
    and e.source_id=p_source_history_id and e.auto_generated;
  select * into x from public.finance_purchase_expense_bridge_v1 b
  where b.brand_id=p_brand and b.source_history_id=p_source_history_id;
  if not found then return jsonb_build_object('source_history_id',p_source_history_id,'journal_status','not_applicable'); end if;
  insert into public.finance_journal_entries(
    brand_id,entry_date,source_type,source_id,source_key,description,status,auto_generated,metadata
  ) values(
    p_brand,x.purchase_date,'purchase_expense',p_source_history_id,
    'purchase_expense:'||p_source_history_id::text,
    'Beban pembelian '||coalesce(x.item_name,'(tanpa nama)'),x.journal_status,true,
    jsonb_build_object('expense_category',x.expense_category,'expense_account_code',x.expense_account_code,
      'payment_method',x.payment_method,'source','staff_purchase_reconciliation_v3')
  ) returning id into v_entry;
  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  values
    (v_entry,p_brand,1,x.expense_account_code,x.total_amount,0,coalesce(x.expense_category,x.item_name,'Pembelian')),
    (v_entry,p_brand,2,x.counter_account_code,0,x.total_amount,'Lawan pembayaran pembelian');
  return jsonb_build_object('source_history_id',p_source_history_id,'journal_entry_id',v_entry,
    'journal_status',x.journal_status,'expense_account_code',x.expense_account_code,'counter_account_code',x.counter_account_code);
end;$$;
revoke all on function private.refresh_purchase_finance_row_v3(uuid,uuid) from public,anon,authenticated;

create or replace function private.staff_purchase_reconciliation_queue_v3(p_token text,p_period date default null)
returns jsonb language plpgsql stable security definer set search_path=''
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
      and private.normalize_purchase_payment_method_v1(e.payment_method) is null and coalesce(e.total_amount,0)>0
    union all
    select 'expense_account',null::uuid,d.source_history_id,d.effective_date,d.item_name,d.total_amount,
      nullif(h.raw_data->>'finance_account_code_override',''),coalesce(d.mapping_status,'Belum dipetakan'),d.mapping_status,
      'canonical',h.source_file,h.row_no,20
    from public.finance_purchase_data_quality_queue_v1 d
    join public.offline_purchase_history h on h.id=d.source_history_id and h.brand_id=d.brand_id
    where d.brand_id=v_emp.brand_id and d.effective_date>=v_month and d.effective_date<v_next
      and d.mapping_status in ('unmatched','ambiguous_inventory_name')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'issue_type',issue_type,'evidence_id',evidence_id,'source_history_id',source_history_id,
    'business_date',business_date,'item_name',item_name,'total_amount',total_amount,'current_value',current_value,
    'source_label',source_label,'mapping_status',mapping_status,'source_type',source_type,'source_file',source_file,'row_no',row_no
  ) order by priority,business_date,row_no,item_name),'[]'::jsonb) into v_rows from q;
  return jsonb_build_object('period_month',v_month,'payment_options',jsonb_build_array(
    jsonb_build_object('method','TUNAI','account_code','1000','account_name','Cash'),
    jsonb_build_object('method','TRANSFER','account_code','1100','account_name','Bank / QRIS Settlement'),
    jsonb_build_object('method','QRIS','account_code','1100','account_name','Bank / QRIS Settlement'),
    jsonb_build_object('method','UTANG','account_code','2000','account_name','Accounts Payable'),
    jsonb_build_object('method','PAYLATER','account_code','2000','account_name','Accounts Payable')
  ),'rows',v_rows);
end;$$;

create or replace function private.staff_purchase_account_options_v3(p_token text)
returns table(account_code text,account_name text,account_type text)
language plpgsql stable security definer set search_path=''
as $$
declare v_emp public.employees%rowtype;
begin
  v_emp:=private.staff_session_employee(p_token,'kasir');
  return query select a.code,a.name,a.account_type from public.finance_accounts a
  where a.brand_id=v_emp.brand_id and a.active and a.account_type in ('ASSET','LIABILITY','EXPENSE','COGS')
  order by case a.account_type when 'EXPENSE' then 0 when 'COGS' then 1 when 'ASSET' then 2 else 3 end,a.code;
end;$$;

create or replace function private.staff_purchase_resolve_payment_v3(
  p_token text,p_evidence_id uuid,p_payment_method text,p_reason text default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_emp public.employees%rowtype; e public.purchase_import_evidence%rowtype;
  v_method text; v_history public.offline_purchase_history%rowtype; v_row_no integer; v_norm text; v_fin jsonb;
begin
  v_emp:=private.staff_session_employee(p_token,'kasir');
  v_method:=private.normalize_purchase_payment_method_v1(p_payment_method);
  if v_method is null then raise exception 'Pilih akun pembayaran yang valid'; end if;
  select * into e from public.purchase_import_evidence x where x.id=p_evidence_id and x.brand_id=v_emp.brand_id for update;
  if not found then raise exception 'Transaksi pembelian tidak ditemukan'; end if;
  update public.purchase_import_evidence set payment_method=v_method,
    raw_data=coalesce(raw_data,'{}'::jsonb)||jsonb_build_object('account_reconciled_by_staff',v_emp.id,'account_reconciled_at',now(),'account_reconcile_reason',nullif(btrim(coalesce(p_reason,'')),'')),updated_at=now()
  where id=e.id;
  v_norm:=regexp_replace(lower(coalesce(e.item_name,'')),'[^a-z0-9]+','','g');
  select h.* into v_history from public.offline_purchase_history h
  where h.brand_id=v_emp.brand_id and h.source_period=e.source_period
    and coalesce(h.purchase_date,h.source_period)=coalesce(e.purchase_date,e.source_period)
    and regexp_replace(lower(coalesce(h.item_name,'')),'[^a-z0-9]+','','g')=v_norm
    and abs(coalesce(h.total_amount,0)-coalesce(e.total_amount,0))<0.01
  order by case when private.normalize_purchase_payment_method_v1(h.payment_method) is null then 0 else 1 end,h.created_at
  limit 1 for update;
  if found then
    update public.offline_purchase_history h set payment_method=v_method,
      raw_data=coalesce(h.raw_data,'{}'::jsonb)||jsonb_build_object('account_reconciled_by_staff',v_emp.id,'account_reconciled_at',now(),'source_evidence_id',e.id)
    where h.id=v_history.id returning h.* into v_history;
  else
    select coalesce(max(h.row_no),0)+1 into v_row_no from public.offline_purchase_history h
    where h.brand_id=v_emp.brand_id and h.source_file='HASNARIA_PURCHASE_UNIFIED_'||to_char(e.source_period,'YYYY-MM')||'.xlsx';
    insert into public.offline_purchase_history(
      brand_id,source_period,source_file,row_no,purchase_date,item_name,quantity_text,unit_text,unit_price,total_amount,payment_method,notes,raw_data
    ) values(
      v_emp.brand_id,e.source_period,'HASNARIA_PURCHASE_UNIFIED_'||to_char(e.source_period,'YYYY-MM')||'.xlsx',v_row_no,e.purchase_date,e.item_name,
      case when e.quantity is null then '' else e.quantity::text end,e.unit_text,e.unit_price,e.total_amount,v_method,'UNIFIED · ACCOUNT RECONCILED',
      coalesce(e.raw_data,'{}'::jsonb)||jsonb_build_object('unified_source_v1',true,'canonical_source_type',e.source_type,'canonical_source_file',e.source_file,
        'canonical_source_record_key',e.source_record_key,'source_evidence_id',e.id,'account_reconciled_by_staff',v_emp.id,'account_reconciled_at',now())
    ) returning * into v_history;
  end if;
  v_fin:=private.refresh_purchase_finance_row_v3(v_emp.brand_id,v_history.id);
  return jsonb_build_object('evidence_id',e.id,'source_history_id',v_history.id,'payment_method',v_method,'finance',v_fin);
end;$$;

create or replace function private.staff_purchase_resolve_expense_account_v3(
  p_token text,p_source_history_id uuid,p_account_code text,p_reason text default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_emp public.employees%rowtype; h public.offline_purchase_history%rowtype; a public.finance_accounts%rowtype; v_fin jsonb;
begin
  v_emp:=private.staff_session_employee(p_token,'kasir');
  select * into a from public.finance_accounts x where x.brand_id=v_emp.brand_id and x.code=p_account_code and x.active
    and x.account_type in ('ASSET','LIABILITY','EXPENSE','COGS');
  if not found then raise exception 'Akun pembelian tidak valid'; end if;
  select * into h from public.offline_purchase_history x where x.id=p_source_history_id and x.brand_id=v_emp.brand_id for update;
  if not found then raise exception 'Transaksi canonical tidak ditemukan'; end if;
  update public.offline_purchase_history x set raw_data=coalesce(x.raw_data,'{}'::jsonb)||jsonb_build_object(
    'finance_account_code_override',a.code,'finance_account_name_override',a.name,'account_reconciled_by_staff',v_emp.id,
    'account_reconciled_at',now(),'account_reconcile_reason',nullif(btrim(coalesce(p_reason,'')),'')
  ) where x.id=h.id;
  v_fin:=private.refresh_purchase_finance_row_v3(v_emp.brand_id,h.id);
  return jsonb_build_object('source_history_id',h.id,'account_code',a.code,'account_name',a.name,'finance',v_fin);
end;$$;

create or replace function public.staff_purchase_reconciliation_queue_v3(p_token text,p_period date default null)
returns jsonb language sql stable set search_path='' as $$select private.staff_purchase_reconciliation_queue_v3($1,$2);$$;
create or replace function public.staff_purchase_account_options_v3(p_token text)
returns table(account_code text,account_name text,account_type text) language sql stable set search_path='' as $$select * from private.staff_purchase_account_options_v3($1);$$;
create or replace function public.staff_purchase_resolve_payment_v3(p_token text,p_evidence_id uuid,p_payment_method text,p_reason text default null)
returns jsonb language sql set search_path='' as $$select private.staff_purchase_resolve_payment_v3($1,$2,$3,$4);$$;
create or replace function public.staff_purchase_resolve_expense_account_v3(p_token text,p_source_history_id uuid,p_account_code text,p_reason text default null)
returns jsonb language sql set search_path='' as $$select private.staff_purchase_resolve_expense_account_v3($1,$2,$3,$4);$$;

revoke all on function public.staff_purchase_reconciliation_queue_v3(text,date) from public;
revoke all on function public.staff_purchase_account_options_v3(text) from public;
revoke all on function public.staff_purchase_resolve_payment_v3(text,uuid,text,text) from public;
revoke all on function public.staff_purchase_resolve_expense_account_v3(text,uuid,text,text) from public;
grant execute on function public.staff_purchase_reconciliation_queue_v3(text,date) to anon,authenticated;
grant execute on function public.staff_purchase_account_options_v3(text) to anon,authenticated;
grant execute on function public.staff_purchase_resolve_payment_v3(text,uuid,text,text) to anon,authenticated;
grant execute on function public.staff_purchase_resolve_expense_account_v3(text,uuid,text,text) to anon,authenticated;