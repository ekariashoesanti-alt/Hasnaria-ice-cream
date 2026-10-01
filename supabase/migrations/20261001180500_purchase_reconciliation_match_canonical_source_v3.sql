-- Resolve Staff Kasir payment corrections against the exact canonical source record first.
create or replace function private.staff_purchase_resolve_payment_v3(
  p_token text,p_evidence_id uuid,p_payment_method text,p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_emp public.employees%rowtype;
  e public.purchase_import_evidence%rowtype;
  v_method text;
  v_history public.offline_purchase_history%rowtype;
  v_row_no integer;
  v_norm text;
  v_fin jsonb;
begin
  v_emp:=private.staff_session_employee(p_token,'kasir');
  v_method:=private.normalize_purchase_payment_method_v1(p_payment_method);
  if v_method is null or v_method='BELUM_DIPETAKAN' then raise exception 'Pilih akun pembayaran final yang valid'; end if;

  select * into e from public.purchase_import_evidence x
  where x.id=p_evidence_id and x.brand_id=v_emp.brand_id for update;
  if not found then raise exception 'Transaksi pembelian tidak ditemukan'; end if;

  update public.purchase_import_evidence
  set payment_method=v_method,
      raw_data=coalesce(raw_data,'{}'::jsonb)||jsonb_build_object(
        'account_reconciled_by_staff',v_emp.id,'account_reconciled_at',now(),
        'account_reconcile_reason',nullif(btrim(coalesce(p_reason,'')),'')
      ),updated_at=now()
  where id=e.id;

  v_norm:=regexp_replace(lower(coalesce(e.item_name,'')),'[^a-z0-9]+','','g');
  select h.* into v_history
  from public.offline_purchase_history h
  where h.brand_id=v_emp.brand_id
    and h.source_period=e.source_period
    and (
      h.raw_data->>'canonical_source_record_key'=e.source_record_key
      or (
        coalesce(h.purchase_date,h.source_period)=coalesce(e.purchase_date,e.source_period)
        and regexp_replace(lower(coalesce(h.item_name,'')),'[^a-z0-9]+','','g')=v_norm
        and abs(coalesce(h.total_amount,0)-coalesce(e.total_amount,0))<0.01
      )
    )
  order by
    case when h.raw_data->>'canonical_source_record_key'=e.source_record_key then 0 else 1 end,
    case when private.normalize_purchase_payment_method_v1(h.payment_method)='BELUM_DIPETAKAN' then 0 else 1 end,
    h.created_at
  limit 1
  for update;

  if found then
    update public.offline_purchase_history h
    set payment_method=v_method,
        raw_data=coalesce(h.raw_data,'{}'::jsonb)||jsonb_build_object(
          'account_reconciled_by_staff',v_emp.id,'account_reconciled_at',now(),
          'source_evidence_id',e.id
        )
    where h.id=v_history.id returning h.* into v_history;
  else
    select coalesce(max(h.row_no),0)+1 into v_row_no
    from public.offline_purchase_history h
    where h.brand_id=v_emp.brand_id
      and h.source_file='HASNARIA_PURCHASE_UNIFIED_'||to_char(e.source_period,'YYYY-MM')||'.xlsx';

    insert into public.offline_purchase_history(
      brand_id,source_period,source_file,row_no,purchase_date,item_name,quantity_text,unit_text,
      unit_price,total_amount,payment_method,notes,raw_data
    ) values(
      v_emp.brand_id,e.source_period,'HASNARIA_PURCHASE_UNIFIED_'||to_char(e.source_period,'YYYY-MM')||'.xlsx',v_row_no,
      e.purchase_date,e.item_name,case when e.quantity is null then '' else e.quantity::text end,e.unit_text,
      e.unit_price,e.total_amount,v_method,'UNIFIED · ACCOUNT RECONCILED',
      coalesce(e.raw_data,'{}'::jsonb)||jsonb_build_object(
        'unified_source_v1',true,'canonical_source_type',e.source_type,'canonical_source_file',e.source_file,
        'canonical_source_record_key',e.source_record_key,'source_evidence_id',e.id,
        'account_reconciled_by_staff',v_emp.id,'account_reconciled_at',now()
      )
    ) returning * into v_history;
  end if;

  v_fin:=private.refresh_purchase_finance_row_v3(v_emp.brand_id,v_history.id);
  return jsonb_build_object('evidence_id',e.id,'source_history_id',v_history.id,'payment_method',v_method,'finance',v_fin);
end;
$$;