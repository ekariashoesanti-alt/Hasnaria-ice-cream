-- P1: complete staff daily validation lifecycle and harden Supervisor assignment.

create unique index if not exists staff_supervisor_assignments_one_active_brand_uidx
  on private.staff_supervisor_assignments(brand_id)
  where active;

create or replace function public.staff_owner_set_supervisor_v1(
  p_employee_id uuid,
  p_active boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_brand uuid;
  v_name text;
begin
  v_brand:=private.staff_owner_brand();

  select e.full_name into v_name
  from public.employees e
  where e.id=p_employee_id
    and e.brand_id=v_brand
    and e.status='active';
  if not found then raise exception 'Pegawai aktif tidak ditemukan'; end if;

  if coalesce(p_active,false) then
    if not exists(
      select 1
      from private.staff_access sa
      where sa.employee_id=p_employee_id
        and sa.brand_id=v_brand
        and sa.active
        and sa.pin_hash is not null
    ) then
      raise exception 'Supervisor harus memiliki login staff aktif dan PIN yang sudah diset';
    end if;

    update private.staff_supervisor_assignments
    set active=false,
        revoked_by=auth.uid(),
        revoked_at=now()
    where brand_id=v_brand
      and active
      and employee_id<>p_employee_id;

    insert into private.staff_supervisor_assignments(
      brand_id,employee_id,active,assigned_by,assigned_at,note
    ) values(
      v_brand,p_employee_id,true,auth.uid(),now(),nullif(btrim(coalesce(p_note,'')),'')
    )
    on conflict(brand_id,employee_id) do update
    set active=true,
        assigned_by=auth.uid(),
        assigned_at=now(),
        revoked_by=null,
        revoked_at=null,
        note=excluded.note;
  else
    update private.staff_supervisor_assignments
    set active=false,
        revoked_by=auth.uid(),
        revoked_at=now(),
        note=coalesce(nullif(btrim(coalesce(p_note,'')),''),note)
    where brand_id=v_brand
      and employee_id=p_employee_id;
  end if;

  return jsonb_build_object(
    'employee_id',p_employee_id,
    'full_name',v_name,
    'active',coalesce(p_active,false)
  );
end;
$$;

create or replace function private.revoke_supervisor_when_staff_disabled_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.active and not new.active then
    update private.staff_supervisor_assignments
    set active=false,
        revoked_by=auth.uid(),
        revoked_at=now(),
        note=coalesce(note,'') || case when coalesce(note,'')='' then '' else ' · ' end || 'Auto-revoked: login staff dinonaktifkan'
    where brand_id=new.brand_id
      and employee_id=new.employee_id
      and active;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_staff_access_revoke_supervisor on private.staff_access;
create trigger trg_staff_access_revoke_supervisor
after update of active on private.staff_access
for each row
when (old.active is true and new.active is false)
execute function private.revoke_supervisor_when_staff_disabled_v1();

create or replace function public.staff_supervisor_queue_v1(
  p_token text,
  p_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_emp public.employees%rowtype;
  v_date date:=coalesce(p_date,timezone('Asia/Jakarta',now())::date);
  v_rows jsonb;
begin
  v_emp:=private.staff_session_employee(p_token,null);
  if not private.staff_is_supervisor(v_emp.id,v_emp.brand_id) then
    raise exception 'Akun staff ini belum ditetapkan sebagai Supervisor';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'batch_id',b.id,
    'employee_id',b.employee_id,
    'full_name',e.full_name,
    'business_date',b.business_date,
    'status',b.status,
    'submitted_at',b.submitted_at,
    'reviewed_at',b.reviewed_at,
    'approved_at',b.approved_at,
    'posted_at',b.posted_at,
    'review_reason',b.review_reason,
    'sales_total',coalesce(s.cash_amount,0)+coalesce(s.qris_amount,0)+coalesce(s.transfer_amount,0),
    'transaction_count',s.transaction_count,
    'purchase_count',(select count(*) from private.staff_daily_purchases p where p.batch_id=b.id),
    'purchase_total',(select coalesce(sum(p.total_amount),0) from private.staff_daily_purchases p where p.batch_id=b.id),
    'stock_count',(select count(*) from private.staff_daily_stock st where st.batch_id=b.id)
  ) order by
    case b.status
      when 'submitted' then 0
      when 'approved' then 1
      when 'revision_required' then 2
      when 'posted' then 3
      when 'rejected' then 4
      else 5
    end,
    e.full_name),'[]'::jsonb)
  into v_rows
  from private.staff_daily_batches b
  join public.employees e on e.id=b.employee_id
  left join private.staff_daily_sales s on s.batch_id=b.id
  where b.brand_id=v_emp.brand_id
    and b.business_date=v_date
    and b.employee_id<>v_emp.id;

  return coalesce(v_rows,'[]'::jsonb);
end;
$$;

create or replace function public.staff_supervisor_batch_detail_v1(
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
  v_staff_name text;
  v_sales jsonb;
  v_purchases jsonb;
  v_stock jsonb;
begin
  v_emp:=private.staff_session_employee(p_token,null);
  if not private.staff_is_supervisor(v_emp.id,v_emp.brand_id) then
    raise exception 'Akun staff ini belum ditetapkan sebagai Supervisor';
  end if;

  select * into v_batch
  from private.staff_daily_batches b
  where b.id=p_batch_id
    and b.brand_id=v_emp.brand_id;
  if not found then raise exception 'Batch tidak ditemukan'; end if;
  if v_batch.employee_id=v_emp.id then
    raise exception 'Supervisor tidak boleh memvalidasi entry miliknya sendiri';
  end if;

  select e.full_name into v_staff_name
  from public.employees e
  where e.id=v_batch.employee_id;

  select jsonb_build_object(
    'transaction_count',s.transaction_count,
    'cash_amount',s.cash_amount,
    'qris_amount',s.qris_amount,
    'transfer_amount',s.transfer_amount,
    'total_amount',coalesce(s.cash_amount,0)+coalesce(s.qris_amount,0)+coalesce(s.transfer_amount,0),
    'notes',s.notes
  )
  into v_sales
  from private.staff_daily_sales s
  where s.batch_id=v_batch.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,
    'purchase_date',p.purchase_date,
    'item_name',p.item_name,
    'quantity',p.quantity,
    'unit_text',p.unit_text,
    'unit_price',p.unit_price,
    'total_amount',p.total_amount,
    'payment_method',p.payment_method,
    'notes',p.notes
  ) order by p.created_at,p.id),'[]'::jsonb)
  into v_purchases
  from private.staff_daily_purchases p
  where p.batch_id=v_batch.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',st.id,
    'inventory_item_id',st.inventory_item_id,
    'item_name',i.item_name,
    'movement_type',st.movement_type,
    'qty_delta',st.qty_delta,
    'notes',st.notes
  ) order by st.created_at,st.id),'[]'::jsonb)
  into v_stock
  from private.staff_daily_stock st
  join public.inventory_items i on i.id=st.inventory_item_id
  where st.batch_id=v_batch.id;

  return jsonb_build_object(
    'batch_id',v_batch.id,
    'employee_id',v_batch.employee_id,
    'full_name',v_staff_name,
    'business_date',v_batch.business_date,
    'status',v_batch.status,
    'submitted_at',v_batch.submitted_at,
    'reviewed_at',v_batch.reviewed_at,
    'approved_at',v_batch.approved_at,
    'posted_at',v_batch.posted_at,
    'review_reason',v_batch.review_reason,
    'sales',v_sales,
    'purchases',coalesce(v_purchases,'[]'::jsonb),
    'stock',coalesce(v_stock,'[]'::jsonb)
  );
end;
$$;

revoke all on function public.staff_supervisor_batch_detail_v1(text,uuid) from public;
grant execute on function public.staff_supervisor_batch_detail_v1(text,uuid) to anon,authenticated,service_role;

revoke all on function private.revoke_supervisor_when_staff_disabled_v1() from public,anon,authenticated;
