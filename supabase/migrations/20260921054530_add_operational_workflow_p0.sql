-- P0 Operational workflow foundation.
-- Lightweight by design: one run header + run items. Existing audit log is reused.
-- Stock opname is only posted to inventory_stock_opname after reviewer approval.

begin;

create table if not exists public.operational_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  run_type text not null,
  title text not null,
  scheduled_date date not null default current_date,
  status text not null default 'draft',
  priority text not null default 'normal',
  procedure_version text not null default 'v1',
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_runs_type_check check (run_type in ('stock_opname','opening','closing','hygiene','equipment','custom')),
  constraint operational_runs_status_check check (status in ('draft','in_progress','submitted','approved','rejected','closed')),
  constraint operational_runs_priority_check check (priority in ('normal','high','critical')),
  constraint operational_runs_title_nonempty check (btrim(title) <> ''),
  constraint operational_runs_version_nonempty check (btrim(procedure_version) <> '')
);

create index if not exists operational_runs_brand_date_idx
  on public.operational_runs(brand_id, scheduled_date desc, status);
create index if not exists operational_runs_assigned_idx
  on public.operational_runs(assigned_to, status, scheduled_date desc);

create table if not exists public.operational_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.operational_runs(id) on delete cascade,
  item_order integer not null default 0,
  item_key text not null,
  label text not null,
  item_type text not null,
  required boolean not null default true,
  inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  expected_qty numeric,
  bool_value boolean,
  numeric_value numeric,
  text_value text,
  notes text,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_run_items_type_check check (item_type in ('check','number','text','stock_count')),
  constraint operational_run_items_key_nonempty check (btrim(item_key) <> ''),
  constraint operational_run_items_label_nonempty check (btrim(label) <> ''),
  constraint operational_run_items_order_nonnegative check (item_order >= 0),
  constraint operational_run_items_run_key_uidx unique (run_id,item_key)
);

create index if not exists operational_run_items_run_order_idx
  on public.operational_run_items(run_id,item_order,id);
create index if not exists operational_run_items_inventory_idx
  on public.operational_run_items(inventory_item_id)
  where inventory_item_id is not null;

create or replace function private.touch_operational_run()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.touch_operational_run_item()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.touch_operational_run() from public,anon,authenticated;
revoke execute on function private.touch_operational_run_item() from public,anon,authenticated;

drop trigger if exists trg_touch_operational_run on public.operational_runs;
create trigger trg_touch_operational_run
before update on public.operational_runs
for each row execute function private.touch_operational_run();

drop trigger if exists trg_touch_operational_run_item on public.operational_run_items;
create trigger trg_touch_operational_run_item
before update on public.operational_run_items
for each row execute function private.touch_operational_run_item();

create or replace function private.can_read_operational_run(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.operational_runs r
    join public.user_profiles u on u.id=auth.uid()
    where r.id=p_run_id
      and r.brand_id=u.brand_id
      and u.status='active'
      and private.same_brand(r.brand_id)
      and (
        u.role in ('owner','head_store','pic')
        or r.assigned_to=auth.uid()
        or r.created_by=auth.uid()
      )
  );
$$;

create or replace function private.can_execute_operational_run(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.operational_runs r
    join public.user_profiles u on u.id=auth.uid()
    where r.id=p_run_id
      and r.brand_id=u.brand_id
      and u.status='active'
      and private.same_brand(r.brand_id)
      and r.status in ('draft','in_progress')
      and (
        u.role in ('owner','head_store','pic')
        or (r.assigned_to=auth.uid() and u.role='pelaksana')
      )
  );
$$;

revoke execute on function private.can_read_operational_run(uuid) from public,anon,authenticated;
revoke execute on function private.can_execute_operational_run(uuid) from public,anon,authenticated;

alter table public.operational_runs enable row level security;
alter table public.operational_run_items enable row level security;

drop policy if exists operational_runs_read_allowed on public.operational_runs;
create policy operational_runs_read_allowed
on public.operational_runs for select to authenticated
using ((select private.can_read_operational_run(operational_runs.id)));

drop policy if exists operational_run_items_read_allowed on public.operational_run_items;
create policy operational_run_items_read_allowed
on public.operational_run_items for select to authenticated
using ((select private.can_read_operational_run(operational_run_items.run_id)));

revoke all on public.operational_runs from public,anon,authenticated;
revoke all on public.operational_run_items from public,anon,authenticated;
grant select on public.operational_runs to authenticated;
grant select on public.operational_run_items to authenticated;

create or replace function private.create_stock_opname_run(
  p_assigned_to uuid default auth.uid(),
  p_scheduled_date date default current_date,
  p_title text default 'Stock Opname'
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_brand uuid;
  v_run_id uuid;
  v_assignee uuid;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;
  if not private.has_capability('ops.write') then raise exception 'Operational management permission required'; end if;

  v_brand := private.my_brand_id();
  if v_brand is null then raise exception 'Active brand is required'; end if;
  if p_scheduled_date is null then raise exception 'Scheduled date is required'; end if;
  if nullif(btrim(coalesce(p_title,'')),'') is null then raise exception 'Title is required'; end if;

  v_assignee := coalesce(p_assigned_to,auth.uid());
  if not exists (
    select 1 from public.user_profiles u
    where u.id=v_assignee and u.brand_id=v_brand and u.status='active'
      and u.role in ('owner','head_store','pic','pelaksana')
  ) then
    raise exception 'Assignee must be an active operational member of this brand';
  end if;

  insert into public.operational_runs(
    brand_id,run_type,title,scheduled_date,status,priority,procedure_version,assigned_to,created_by
  ) values (
    v_brand,'stock_opname',btrim(p_title),p_scheduled_date,'draft','normal','v1',v_assignee,auth.uid()
  ) returning id into v_run_id;

  insert into public.operational_run_items(
    run_id,item_order,item_key,label,item_type,required,inventory_item_id,expected_qty
  )
  select
    v_run_id,
    row_number() over(order by i.category,i.item_name)::integer,
    'stock:'||i.id::text,
    i.item_name,
    'stock_count',
    true,
    i.id,
    coalesce(l.ledger_qty,0)
  from public.inventory_items i
  left join public.inventory_ledger_balance l
    on l.brand_id=i.brand_id and l.inventory_item_id=i.id
  where i.brand_id=v_brand
  order by i.category,i.item_name;

  perform private.write_audit_log(
    v_brand,null,'operational_run',v_run_id,'created_stock_opname',auth.uid(),
    null,
    jsonb_build_object('run_type','stock_opname','scheduled_date',p_scheduled_date,'assigned_to',v_assignee),
    null,
    jsonb_build_object('source','operational_workflow_v1')
  );

  return v_run_id;
end;
$$;

create or replace function public.create_stock_opname_run(
  p_assigned_to uuid default auth.uid(),
  p_scheduled_date date default current_date,
  p_title text default 'Stock Opname'
)
returns uuid
language sql
security invoker
set search_path=''
as $$
  select private.create_stock_opname_run(p_assigned_to,p_scheduled_date,p_title);
$$;

revoke execute on function private.create_stock_opname_run(uuid,date,text) from public,anon,authenticated;
revoke execute on function public.create_stock_opname_run(uuid,date,text) from public,anon;
grant execute on function public.create_stock_opname_run(uuid,date,text) to authenticated;

create or replace function private.set_operational_run_item(
  p_item_id uuid,
  p_bool_value boolean default null,
  p_numeric_value numeric default null,
  p_text_value text default null,
  p_notes text default null
)
returns public.operational_run_items
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item public.operational_run_items%rowtype;
  v_run public.operational_runs%rowtype;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;

  select * into v_item from public.operational_run_items where id=p_item_id for update;
  if not found then raise exception 'Operational item not found'; end if;
  if not private.can_execute_operational_run(v_item.run_id) then raise exception 'Operational execution permission required'; end if;

  select * into v_run from public.operational_runs where id=v_item.run_id for update;
  if v_run.status not in ('draft','in_progress') then raise exception 'Operational run is no longer editable'; end if;

  if v_item.item_type='stock_count' and (p_numeric_value is null or p_numeric_value < 0) then
    raise exception 'Physical stock quantity must be zero or greater';
  elsif v_item.item_type='check' and p_bool_value is null then
    raise exception 'Checklist value is required';
  elsif v_item.item_type='number' and p_numeric_value is null then
    raise exception 'Numeric value is required';
  elsif v_item.item_type='text' and nullif(btrim(coalesce(p_text_value,'')),'') is null then
    raise exception 'Text value is required';
  end if;

  update public.operational_run_items
  set bool_value=case when v_item.item_type='check' then p_bool_value else bool_value end,
      numeric_value=case when v_item.item_type in ('number','stock_count') then p_numeric_value else numeric_value end,
      text_value=case when v_item.item_type='text' then nullif(btrim(coalesce(p_text_value,'')),'') else text_value end,
      notes=nullif(btrim(coalesce(p_notes,'')),''),
      completed_by=auth.uid(),
      completed_at=now()
  where id=v_item.id
  returning * into v_item;

  if v_run.status='draft' then
    update public.operational_runs set status='in_progress' where id=v_run.id;
  end if;

  return v_item;
end;
$$;

create or replace function public.set_operational_run_item(
  p_item_id uuid,
  p_bool_value boolean default null,
  p_numeric_value numeric default null,
  p_text_value text default null,
  p_notes text default null
)
returns public.operational_run_items
language sql
security invoker
set search_path=''
as $$
  select private.set_operational_run_item(p_item_id,p_bool_value,p_numeric_value,p_text_value,p_notes);
$$;

revoke execute on function private.set_operational_run_item(uuid,boolean,numeric,text,text) from public,anon,authenticated;
revoke execute on function public.set_operational_run_item(uuid,boolean,numeric,text,text) from public,anon;
grant execute on function public.set_operational_run_item(uuid,boolean,numeric,text,text) to authenticated;

create or replace function private.submit_operational_run(p_run_id uuid)
returns public.operational_runs
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run public.operational_runs%rowtype;
  v_missing integer;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;

  select * into v_run from public.operational_runs where id=p_run_id for update;
  if not found then raise exception 'Operational run not found'; end if;
  if not private.can_execute_operational_run(v_run.id) then raise exception 'Operational execution permission required'; end if;
  if v_run.status not in ('draft','in_progress') then raise exception 'Only draft or in-progress runs can be submitted'; end if;

  select count(*) into v_missing
  from public.operational_run_items i
  where i.run_id=v_run.id and i.required
    and (
      (i.item_type='check' and i.bool_value is null)
      or (i.item_type in ('number','stock_count') and i.numeric_value is null)
      or (i.item_type='text' and nullif(btrim(coalesce(i.text_value,'')),'') is null)
    );
  if v_missing>0 then raise exception 'Complete all required operational items before submit (% remaining)',v_missing; end if;

  update public.operational_runs
  set status='submitted',submitted_by=auth.uid(),submitted_at=now()
  where id=v_run.id
  returning * into v_run;

  perform private.write_audit_log(
    v_run.brand_id,null,'operational_run',v_run.id,'submitted',auth.uid(),
    jsonb_build_object('status','in_progress'),
    jsonb_build_object('status','submitted','submitted_at',v_run.submitted_at),
    null,
    jsonb_build_object('source','operational_workflow_v1')
  );

  return v_run;
end;
$$;

create or replace function public.submit_operational_run(p_run_id uuid)
returns public.operational_runs
language sql
security invoker
set search_path=''
as $$ select private.submit_operational_run(p_run_id); $$;

revoke execute on function private.submit_operational_run(uuid) from public,anon,authenticated;
revoke execute on function public.submit_operational_run(uuid) from public,anon;
grant execute on function public.submit_operational_run(uuid) to authenticated;

create or replace function private.reject_operational_run(p_run_id uuid,p_review_notes text)
returns public.operational_runs
language plpgsql
security definer
set search_path=''
as $$
declare v_run public.operational_runs%rowtype;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;
  if not private.has_capability('ops.write') then raise exception 'Operational review permission required'; end if;
  if nullif(btrim(coalesce(p_review_notes,'')),'') is null then raise exception 'Review notes are required'; end if;

  select * into v_run from public.operational_runs where id=p_run_id for update;
  if not found or not private.same_brand(v_run.brand_id) then raise exception 'Operational run not found'; end if;
  if v_run.status<>'submitted' then raise exception 'Only submitted runs can be rejected'; end if;

  update public.operational_runs
  set status='rejected',reviewed_by=auth.uid(),reviewed_at=now(),review_notes=btrim(p_review_notes)
  where id=v_run.id returning * into v_run;

  perform private.write_audit_log(
    v_run.brand_id,null,'operational_run',v_run.id,'rejected',auth.uid(),
    jsonb_build_object('status','submitted'),
    jsonb_build_object('status','rejected','review_notes',v_run.review_notes),
    v_run.review_notes,
    jsonb_build_object('source','operational_workflow_v1')
  );
  return v_run;
end;
$$;

create or replace function public.reject_operational_run(p_run_id uuid,p_review_notes text)
returns public.operational_runs
language sql
security invoker
set search_path=''
as $$ select private.reject_operational_run(p_run_id,p_review_notes); $$;

revoke execute on function private.reject_operational_run(uuid,text) from public,anon,authenticated;
revoke execute on function public.reject_operational_run(uuid,text) from public,anon;
grant execute on function public.reject_operational_run(uuid,text) to authenticated;

create or replace function private.approve_stock_opname_run(p_run_id uuid,p_review_notes text default null)
returns public.operational_runs
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run public.operational_runs%rowtype;
  v_item public.operational_run_items%rowtype;
  v_reason text;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;
  if not private.can_stock_write() then raise exception 'Stock review permission required'; end if;

  select * into v_run from public.operational_runs where id=p_run_id for update;
  if not found or not private.same_brand(v_run.brand_id) then raise exception 'Operational run not found'; end if;
  if v_run.run_type<>'stock_opname' then raise exception 'Run is not a stock opname run'; end if;
  if v_run.status<>'submitted' then raise exception 'Only submitted stock opname runs can be approved'; end if;
  if v_run.scheduled_date>current_date then raise exception 'Future-dated stock opname cannot be approved'; end if;

  for v_item in
    select * from public.operational_run_items
    where run_id=v_run.id and item_type='stock_count'
    order by item_order,id
  loop
    if v_item.inventory_item_id is null or v_item.numeric_value is null or v_item.numeric_value<0 then
      raise exception 'Stock opname run contains an invalid count item';
    end if;
    v_reason := coalesce(nullif(btrim(v_item.notes),''),nullif(btrim(coalesce(p_review_notes,'')),''),'Operational stock opname approval '||v_run.id::text);
    perform private.resolve_physical_stock_opname(
      v_item.inventory_item_id,
      v_item.numeric_value,
      v_run.scheduled_date,
      v_reason
    );
  end loop;

  update public.operational_runs
  set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),review_notes=nullif(btrim(coalesce(p_review_notes,'')),'')
  where id=v_run.id returning * into v_run;

  perform private.write_audit_log(
    v_run.brand_id,null,'operational_run',v_run.id,'approved_stock_opname',auth.uid(),
    jsonb_build_object('status','submitted'),
    jsonb_build_object('status','approved','reviewed_at',v_run.reviewed_at),
    v_run.review_notes,
    jsonb_build_object('source','operational_workflow_v1')
  );

  return v_run;
end;
$$;

create or replace function public.approve_stock_opname_run(p_run_id uuid,p_review_notes text default null)
returns public.operational_runs
language sql
security invoker
set search_path=''
as $$ select private.approve_stock_opname_run(p_run_id,p_review_notes); $$;

revoke execute on function private.approve_stock_opname_run(uuid,text) from public,anon,authenticated;
revoke execute on function public.approve_stock_opname_run(uuid,text) from public,anon;
grant execute on function public.approve_stock_opname_run(uuid,text) to authenticated;

commit;
