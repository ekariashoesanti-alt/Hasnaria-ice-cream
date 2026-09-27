-- P0 closure: explicit approval -> posting lifecycle and auditable upload governance.

alter table private.staff_daily_batches
  add column if not exists approved_at timestamptz;

create or replace function private.post_staff_daily_batch_v1(
  p_batch_id uuid,
  p_supervisor_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_batch private.staff_daily_batches%rowtype;
  v_sales private.staff_daily_sales%rowtype;
  v_emp public.employees%rowtype;
  v_purchase private.staff_daily_purchases%rowtype;
  v_stock private.staff_daily_stock%rowtype;
  v_row_no integer:=0;
  v_total numeric:=0;
  v_sales_id uuid;
  v_source text;
begin
  select * into v_batch from private.staff_daily_batches where id=p_batch_id for update;
  if not found then raise exception 'Batch tidak ditemukan'; end if;
  if v_batch.status='posted' then
    return jsonb_build_object('batch_id',v_batch.id,'status','posted','idempotent',true);
  end if;
  if v_batch.status<>'approved' then
    raise exception 'Batch harus berstatus approved sebelum diposting';
  end if;
  if v_batch.supervisor_employee_id is null then
    raise exception 'Batch approved belum memiliki Supervisor';
  end if;
  if p_supervisor_employee_id is not null and v_batch.supervisor_employee_id<>p_supervisor_employee_id then
    raise exception 'Supervisor posting tidak sesuai dengan approver';
  end if;

  select * into v_emp from public.employees where id=v_batch.employee_id;

  select * into v_sales from private.staff_daily_sales where batch_id=v_batch.id;
  if found then
    v_total:=coalesce(v_sales.cash_amount,0)+coalesce(v_sales.qris_amount,0)+coalesce(v_sales.transfer_amount,0);
    insert into public.sales(brand_id,sold_at,transaction_count,channel,notes,cash_amount,qris_amount,tf_amount,total_amount,external_transaction_id,outlet_id)
    values(v_batch.brand_id,v_batch.business_date,v_sales.transaction_count,'STAFF_DAILY',concat('Approved staff daily · ',v_emp.full_name,case when v_sales.notes is not null then ' · '||v_sales.notes else '' end),v_sales.cash_amount,v_sales.qris_amount,v_sales.transfer_amount,v_total,'staff_daily:'||v_batch.id::text,v_batch.outlet_id)
    on conflict(brand_id,external_transaction_id) do update set sold_at=excluded.sold_at,transaction_count=excluded.transaction_count,channel=excluded.channel,notes=excluded.notes,cash_amount=excluded.cash_amount,qris_amount=excluded.qris_amount,tf_amount=excluded.tf_amount,total_amount=excluded.total_amount,outlet_id=excluded.outlet_id
    returning id into v_sales_id;
  end if;

  v_source:='STAFF:'||v_batch.id::text;
  for v_purchase in select * from private.staff_daily_purchases where batch_id=v_batch.id order by created_at,id loop
    v_row_no:=v_row_no+1;
    insert into public.offline_purchase_history(brand_id,source_period,source_file,row_no,purchase_date,item_name,quantity_text,unit_text,unit_price,total_amount,payment_method,notes,raw_data)
    values(v_batch.brand_id,date_trunc('month',v_batch.business_date)::date,v_source,v_row_no,v_purchase.purchase_date,v_purchase.item_name,v_purchase.quantity::text,v_purchase.unit_text,v_purchase.unit_price,v_purchase.total_amount,v_purchase.payment_method,concat_ws(' · ',nullif(v_purchase.notes,''),'Approved staff daily',v_emp.full_name),jsonb_build_object('source','staff_daily','batch_id',v_batch.id,'employee_id',v_batch.employee_id,'purchase_entry_id',v_purchase.id,'approval_status','approved','approved_at',v_batch.approved_at))
    on conflict(brand_id,source_file,row_no) do update set purchase_date=excluded.purchase_date,item_name=excluded.item_name,quantity_text=excluded.quantity_text,unit_text=excluded.unit_text,unit_price=excluded.unit_price,total_amount=excluded.total_amount,payment_method=excluded.payment_method,notes=excluded.notes,raw_data=excluded.raw_data;
  end loop;

  if v_row_no>0 then
    perform private.sync_purchase_quantity_stock_v1(v_batch.brand_id,v_batch.business_date,v_batch.business_date);
  end if;

  for v_stock in select * from private.staff_daily_stock where batch_id=v_batch.id order by created_at,id loop
    insert into public.inventory_movements(brand_id,outlet_id,inventory_item_id,movement_date,movement_type,qty_delta,unit_cost,reference_type,reference_id,source_key,system_generated,notes,created_by)
    values(v_batch.brand_id,v_batch.outlet_id,v_stock.inventory_item_id,v_batch.business_date,v_stock.movement_type,v_stock.qty_delta,null,'staff_daily',v_stock.id,'staff_daily_stock:'||v_stock.id::text,false,concat_ws(' · ',nullif(v_stock.notes,''),'Approved supervisor: '||v_batch.supervisor_employee_id::text),null)
    on conflict do nothing;
  end loop;

  update private.staff_daily_batches
  set status='posted',posted_at=now(),updated_at=now()
  where id=v_batch.id;
  return jsonb_build_object('batch_id',v_batch.id,'status','posted','sales_total',v_total,'purchase_rows',v_row_no,'approved_at',v_batch.approved_at);
end;
$$;

create or replace function public.staff_supervisor_decide_v1(
  p_token text,
  p_batch_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_emp public.employees%rowtype;
  v_batch private.staff_daily_batches%rowtype;
  v_action text:=lower(btrim(coalesce(p_action,'')));
begin
  v_emp:=private.staff_session_employee(p_token,null);
  if not private.staff_is_supervisor(v_emp.id,v_emp.brand_id) then raise exception 'Akun staff ini belum ditetapkan sebagai Supervisor'; end if;
  select * into v_batch from private.staff_daily_batches where id=p_batch_id and brand_id=v_emp.brand_id for update;
  if not found then raise exception 'Batch tidak ditemukan'; end if;
  if v_batch.employee_id=v_emp.id then raise exception 'Supervisor tidak boleh menyetujui entry miliknya sendiri'; end if;
  if v_batch.status<>'submitted' then raise exception 'Hanya data submitted yang dapat diputuskan'; end if;

  if v_action='approve' then
    update private.staff_daily_batches
      set status='approved',supervisor_employee_id=v_emp.id,reviewed_at=now(),approved_at=now(),review_reason=null,posted_at=null,updated_at=now()
      where id=v_batch.id;
    return jsonb_build_object('batch_id',v_batch.id,'status','approved','posting_required',true);
  elsif v_action='revision' then
    if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Alasan revisi wajib diisi'; end if;
    update private.staff_daily_batches set status='revision_required',supervisor_employee_id=v_emp.id,reviewed_at=now(),approved_at=null,review_reason=btrim(p_reason),updated_at=now() where id=v_batch.id;
    return jsonb_build_object('batch_id',v_batch.id,'status','revision_required');
  elsif v_action='reject' then
    if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Alasan penolakan wajib diisi'; end if;
    update private.staff_daily_batches set status='rejected',supervisor_employee_id=v_emp.id,reviewed_at=now(),approved_at=null,review_reason=btrim(p_reason),updated_at=now() where id=v_batch.id;
    return jsonb_build_object('batch_id',v_batch.id,'status','rejected');
  else
    raise exception 'Aksi tidak valid';
  end if;
end;
$$;

create or replace function public.staff_supervisor_post_approved_v1(
  p_token text,
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_emp public.employees%rowtype;
  v_batch private.staff_daily_batches%rowtype;
begin
  v_emp:=private.staff_session_employee(p_token,null);
  if not private.staff_is_supervisor(v_emp.id,v_emp.brand_id) then raise exception 'Akun staff ini belum ditetapkan sebagai Supervisor'; end if;
  select * into v_batch from private.staff_daily_batches where id=p_batch_id and brand_id=v_emp.brand_id for update;
  if not found then raise exception 'Batch tidak ditemukan'; end if;
  if v_batch.status='posted' then return jsonb_build_object('batch_id',v_batch.id,'status','posted','idempotent',true); end if;
  if v_batch.status<>'approved' then raise exception 'Hanya batch approved yang dapat diposting'; end if;
  if v_batch.supervisor_employee_id is distinct from v_emp.id then raise exception 'Hanya Supervisor yang menyetujui batch ini yang dapat memposting'; end if;
  return private.post_staff_daily_batch_v1(v_batch.id,v_emp.id);
end;
$$;

revoke all on function public.staff_supervisor_post_approved_v1(text,uuid) from public;
grant execute on function public.staff_supervisor_post_approved_v1(text,uuid) to anon, authenticated, service_role;

create or replace function public.staff_daily_submit_v1(p_token text,p_date date)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_batch private.staff_daily_batches%rowtype;
  v_has_data boolean;
begin
  v_batch:=private.staff_daily_get_batch(p_token,p_date,true);
  perform private.staff_assert_editable(v_batch);
  select exists(select 1 from private.staff_daily_sales where batch_id=v_batch.id)
      or exists(select 1 from private.staff_daily_purchases where batch_id=v_batch.id)
      or exists(select 1 from private.staff_daily_stock where batch_id=v_batch.id)
    into v_has_data;
  if not v_has_data then raise exception 'Belum ada data operasional yang diisi hari ini'; end if;
  update private.staff_daily_batches
  set status='submitted',submitted_at=now(),review_reason=null,reviewed_at=null,approved_at=null,supervisor_employee_id=null,posted_at=null,updated_at=now()
  where id=v_batch.id;
  return jsonb_build_object('batch_id',v_batch.id,'status','submitted');
end;
$$;

-- Shared import governance: current owner upload paths remain compatible and are explicitly auto-approved/auditable.
alter table public.import_jobs add column if not exists source_type text;
alter table public.import_jobs add column if not exists approval_status text;
alter table public.import_jobs add column if not exists approved_by uuid;
alter table public.import_jobs add column if not exists approved_at timestamptz;
alter table public.import_jobs add column if not exists governance_note text;

update public.import_jobs
set source_type=coalesce(nullif(btrim(source_type),''),'owner_upload'),
    approval_status=coalesce(nullif(btrim(approval_status),''),'approved'),
    approved_by=coalesce(approved_by,created_by),
    approved_at=coalesce(approved_at,completed_at,created_at),
    governance_note=coalesce(governance_note,'P0 backfill: existing authenticated import treated as owner-approved provenance')
where source_type is null or approval_status is null or approved_at is null;

alter table public.import_jobs alter column source_type set default 'owner_upload';
alter table public.import_jobs alter column source_type set not null;
alter table public.import_jobs alter column approval_status set default 'approved';
alter table public.import_jobs alter column approval_status set not null;
alter table public.import_jobs alter column approved_by set default auth.uid();
alter table public.import_jobs alter column approved_at set default now();

do $$ begin
  if not exists(select 1 from pg_constraint where conname='import_jobs_source_type_nonempty') then
    alter table public.import_jobs add constraint import_jobs_source_type_nonempty check (btrim(source_type)<>'');
  end if;
  if not exists(select 1 from pg_constraint where conname='import_jobs_approval_status_check') then
    alter table public.import_jobs add constraint import_jobs_approval_status_check check (approval_status in ('pending','approved','rejected'));
  end if;
  if not exists(select 1 from pg_constraint where conname='import_jobs_approved_by_fkey') then
    alter table public.import_jobs add constraint import_jobs_approved_by_fkey foreign key(approved_by) references auth.users(id) on delete set null;
  end if;
end $$;

create or replace function private.enforce_import_governance_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.source_type:=coalesce(nullif(btrim(new.source_type),''),'owner_upload');
  new.approval_status:=coalesce(nullif(btrim(new.approval_status),''),'approved');
  if new.approval_status='approved' then
    new.approved_by:=coalesce(new.approved_by,new.created_by,auth.uid());
    new.approved_at:=coalesce(new.approved_at,now());
  else
    new.approved_by:=null;
    new.approved_at:=null;
  end if;
  if new.status in ('posting','completed') and new.approval_status<>'approved' then
    raise exception 'Import harus approved sebelum posting/completed';
  end if;
  return new;
end;
$$;

drop trigger if exists import_jobs_governance_trg on public.import_jobs;
create trigger import_jobs_governance_trg
before insert or update of status,approval_status,source_type,created_by on public.import_jobs
for each row execute function private.enforce_import_governance_v1();

alter table public.sales_import_batches add column if not exists import_job_id uuid;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='sales_import_batches_import_job_id_fkey') then
    alter table public.sales_import_batches add constraint sales_import_batches_import_job_id_fkey foreign key(import_job_id) references public.import_jobs(id) on delete set null;
  end if;
end $$;
create index if not exists sales_import_batches_import_job_idx on public.sales_import_batches(import_job_id) where import_job_id is not null;

-- One governed import job per distinct sales file hash; duplicate historical batches share the same source identity.
insert into public.import_jobs(brand_id,outlet_id,module,source_file,file_hash,status,period_from,period_to,rows_total,rows_valid,rows_failed,rows_posted,metadata,created_by,created_at,completed_at,source_type,approval_status,approved_by,approved_at,governance_note)
select x.brand_id,x.outlet_id,'sales',x.filename,x.file_hash,
       case x.status when 'failed' then 'failed' when 'rolled_back' then 'rolled_back' when 'preview' then 'staged' else 'completed' end,
       x.period_from,x.period_to,x.row_count,x.row_count,0,case when x.status in ('completed','replaced') then x.row_count else 0 end,
       jsonb_build_object('legacy_source','sales_import_batches','representative_batch_id',x.id,'sales_source',x.source),
       x.created_by,x.created_at,case when x.status in ('completed','replaced') then x.created_at else null end,
       'owner_upload','approved',x.created_by,x.created_at,'P0 backfill: sales upload auto-approved with explicit provenance'
from (
  select distinct on (brand_id,lower(btrim(file_hash))) *
  from public.sales_import_batches
  where nullif(btrim(file_hash),'') is not null
  order by brand_id,lower(btrim(file_hash)),created_at desc,id desc
) x
on conflict do nothing;

update public.sales_import_batches b
set import_job_id=j.id
from public.import_jobs j
where b.import_job_id is null
  and nullif(btrim(b.file_hash),'') is not null
  and j.brand_id=b.brand_id and lower(btrim(j.module))='sales'
  and lower(btrim(j.file_hash))=lower(btrim(b.file_hash));

-- Hashless legacy batches retain one explicit job each.
insert into public.import_jobs(brand_id,outlet_id,module,source_file,file_hash,status,period_from,period_to,rows_total,rows_valid,rows_failed,rows_posted,metadata,created_by,created_at,completed_at,source_type,approval_status,approved_by,approved_at,governance_note)
select b.brand_id,b.outlet_id,'sales',b.filename,null,
       case b.status when 'failed' then 'failed' when 'rolled_back' then 'rolled_back' when 'preview' then 'staged' else 'completed' end,
       b.period_from,b.period_to,b.row_count,b.row_count,0,case when b.status in ('completed','replaced') then b.row_count else 0 end,
       jsonb_build_object('legacy_source','sales_import_batches','sales_import_batch_id',b.id,'sales_source',b.source),
       b.created_by,b.created_at,case when b.status in ('completed','replaced') then b.created_at else null end,
       'owner_upload','approved',b.created_by,b.created_at,'P0 backfill: hashless sales upload auto-approved with explicit provenance'
from public.sales_import_batches b
where b.import_job_id is null and nullif(btrim(b.file_hash),'') is null;

update public.sales_import_batches b
set import_job_id=j.id
from public.import_jobs j
where b.import_job_id is null
  and j.metadata->>'sales_import_batch_id'=b.id::text;

create or replace function private.ensure_sales_import_governance_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job uuid;
  v_status text;
begin
  if new.import_job_id is not null then return new; end if;
  v_status:=case new.status when 'failed' then 'failed' when 'rolled_back' then 'rolled_back' when 'preview' then 'staged' else 'completed' end;

  if nullif(btrim(new.file_hash),'') is not null then
    select id into v_job from public.import_jobs
    where brand_id=new.brand_id and lower(btrim(module))='sales' and lower(btrim(file_hash))=lower(btrim(new.file_hash))
    limit 1;
  end if;

  if v_job is null then
    insert into public.import_jobs(brand_id,outlet_id,module,source_file,file_hash,status,period_from,period_to,rows_total,rows_valid,rows_failed,rows_posted,metadata,created_by,created_at,completed_at,source_type,approval_status,approved_by,approved_at,governance_note)
    values(new.brand_id,new.outlet_id,'sales',new.filename,new.file_hash,v_status,new.period_from,new.period_to,new.row_count,new.row_count,0,case when new.status in ('completed','replaced') then new.row_count else 0 end,
           jsonb_build_object('source','sales_import_batches','sales_import_batch_id',new.id,'sales_source',new.source),new.created_by,coalesce(new.created_at,now()),case when new.status in ('completed','replaced') then coalesce(new.created_at,now()) else null end,
           'owner_upload','approved',new.created_by,coalesce(new.created_at,now()),'Sales upload auto-approved; governance linked by trigger')
    returning id into v_job;
  end if;
  new.import_job_id:=v_job;
  return new;
end;
$$;

drop trigger if exists sales_import_batches_governance_trg on public.sales_import_batches;
create trigger sales_import_batches_governance_trg
before insert or update of import_job_id on public.sales_import_batches
for each row execute function private.ensure_sales_import_governance_v1();

comment on column public.import_jobs.source_type is 'Governed origin, e.g. owner_upload, staff_upload, system_import.';
comment on column public.import_jobs.approval_status is 'Governance approval independent of technical import status.';
comment on column public.sales_import_batches.import_job_id is 'Shared provenance link into governed ERP import_jobs.';
