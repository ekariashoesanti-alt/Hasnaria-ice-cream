-- P10: require and normalize purchase payment methods for all new writes.
-- Legacy rows are intentionally left untouched and can be reconciled through P8.

create or replace function private.normalize_purchase_payment_method_v1(p_method text)
returns text
language sql
immutable
set search_path to ''
as $$
  select case
    when upper(btrim(coalesce(p_method,''))) in ('TUNAI','CASH') then 'TUNAI'
    when upper(btrim(coalesce(p_method,''))) in ('TRANSFER','TF','REK MANDIRI','BANK TRANSFER') then 'TRANSFER'
    when upper(btrim(coalesce(p_method,''))) = 'QRIS' then 'QRIS'
    when upper(btrim(coalesce(p_method,''))) in ('UTANG','HUTANG','UTANG RIA') then 'UTANG'
    when upper(btrim(coalesce(p_method,''))) in ('PAYLATER','PAY LATER') then 'PAYLATER'
    else null
  end;
$$;

revoke all on function private.normalize_purchase_payment_method_v1(text) from public, anon, authenticated;

create or replace function private.enforce_purchase_payment_method_v1()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_method text;
begin
  v_method := private.normalize_purchase_payment_method_v1(new.payment_method);
  if v_method is null then
    raise exception 'Metode pembayaran wajib dan harus salah satu dari TUNAI, TRANSFER, QRIS, UTANG, atau PAYLATER';
  end if;
  new.payment_method := v_method;
  return new;
end;
$$;

revoke all on function private.enforce_purchase_payment_method_v1() from public, anon, authenticated;

drop trigger if exists offline_purchase_history_payment_method_guard on public.offline_purchase_history;
create trigger offline_purchase_history_payment_method_guard
before insert or update of payment_method on public.offline_purchase_history
for each row execute function private.enforce_purchase_payment_method_v1();

create or replace function public.staff_daily_add_purchase_v1(
  p_token text,
  p_date date,
  p_item_name text,
  p_quantity numeric,
  p_unit_text text,
  p_unit_price numeric,
  p_total_amount numeric,
  p_payment_method text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_emp public.employees%rowtype;
  v_batch private.staff_daily_batches%rowtype;
  v_id uuid;
  v_method text;
begin
  v_emp:=private.staff_session_employee(p_token,'kasir');
  v_batch:=private.staff_daily_get_batch(p_token,p_date,true);
  perform private.staff_assert_editable(v_batch);
  if nullif(btrim(coalesce(p_item_name,'')),'') is null then raise exception 'Nama item wajib diisi'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Qty harus lebih dari 0'; end if;
  if coalesce(p_total_amount,0)<0 then raise exception 'Total pembelian tidak boleh negatif'; end if;

  v_method := private.normalize_purchase_payment_method_v1(p_payment_method);
  if v_method is null then
    raise exception 'Metode pembayaran wajib. Pilih Tunai, Transfer, QRIS, Utang, atau PayLater';
  end if;

  insert into private.staff_daily_purchases(
    batch_id,purchase_date,item_name,quantity,unit_text,unit_price,total_amount,payment_method,notes
  ) values(
    v_batch.id,p_date,btrim(p_item_name),p_quantity,
    nullif(btrim(coalesce(p_unit_text,'')),''),p_unit_price,coalesce(p_total_amount,0),v_method,
    nullif(btrim(coalesce(p_notes,'')),'')
  )
  returning id into v_id;
  update private.staff_daily_batches set status='draft',updated_at=now() where id=v_batch.id and status='revision_required';
  return v_id;
end;
$$;

create or replace function public.replace_purchase_canonical_period_v1(p_source_period date, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_brand uuid := private.my_brand_id();
  v_old_min date;
  v_old_max date;
  v_new_min date;
  v_new_max date;
  v_from date;
  v_to date;
  v_inserted integer := 0;
  v_finance jsonb := null;
  v_has_finance_period boolean := false;
begin
  if auth.uid() is null or v_brand is null
     or not private.same_brand(v_brand)
     or not private.can_import_module('purchasing') then
    raise exception 'Purchase import permission required';
  end if;
  if p_source_period is null or jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' then
    raise exception 'Invalid Purchase canonical payload';
  end if;
  if jsonb_array_length(coalesce(p_rows,'[]'::jsonb)) > 10000 then
    raise exception 'Purchase canonical payload too large';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_rows,'[]'::jsonb)) as r(
      source_file text,row_no integer,purchase_date date,item_name text,quantity_text text,
      unit_text text,unit_price numeric,total_amount numeric,payment_method text,notes text,raw_data jsonb
    )
    where private.normalize_purchase_payment_method_v1(r.payment_method) is null
  ) then
    raise exception 'Import Pembelian ditolak: setiap transaksi wajib memiliki metode TUNAI, TRANSFER, QRIS, UTANG, atau PAYLATER';
  end if;

  select min(coalesce(h.purchase_date,h.source_period)),max(coalesce(h.purchase_date,h.source_period))
  into v_old_min,v_old_max
  from public.offline_purchase_history h
  where h.brand_id=v_brand and h.source_period=p_source_period;

  select min(coalesce(r.purchase_date,p_source_period)),max(coalesce(r.purchase_date,p_source_period))
  into v_new_min,v_new_max
  from jsonb_to_recordset(coalesce(p_rows,'[]'::jsonb)) as r(
    source_file text,row_no integer,purchase_date date,item_name text,quantity_text text,
    unit_text text,unit_price numeric,total_amount numeric,payment_method text,notes text,raw_data jsonb
  );

  v_from := least(coalesce(v_old_min,p_source_period),coalesce(v_new_min,p_source_period));
  v_to := greatest(coalesce(v_old_max,p_source_period),coalesce(v_new_max,p_source_period));

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
    unit_text,unit_price,total_amount,payment_method,notes,raw_data
  )
  select
    v_brand,p_source_period,
    coalesce(nullif(r.source_file,''),'HASNARIA_PURCHASE_UNIFIED_'||to_char(p_source_period,'YYYY-MM')||'.xlsx'),
    r.row_no,r.purchase_date,r.item_name,r.quantity_text,r.unit_text,r.unit_price,r.total_amount,
    private.normalize_purchase_payment_method_v1(r.payment_method),r.notes,coalesce(r.raw_data,'{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_rows,'[]'::jsonb)) as r(
    source_file text,row_no integer,purchase_date date,item_name text,quantity_text text,
    unit_text text,unit_price numeric,total_amount numeric,payment_method text,notes text,raw_data jsonb
  )
  order by r.row_no;
  get diagnostics v_inserted = row_count;

  select exists(
    select 1 from public.accounting_periods ap
    where ap.brand_id=v_brand
      and daterange(ap.period_start,ap.period_end,'[]') && daterange(v_from,v_to,'[]')
  ) into v_has_finance_period;

  if v_has_finance_period then
    v_finance := private.reconcile_purchase_classification_v2(v_brand,v_from,v_to);
  end if;

  return jsonb_build_object(
    'source_period',p_source_period,'inserted_rows',v_inserted,
    'effective_from',v_from,'effective_to',v_to,
    'finance_synced',v_has_finance_period,'finance',v_finance
  );
end;
$$;
