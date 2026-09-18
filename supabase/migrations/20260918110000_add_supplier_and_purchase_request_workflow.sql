-- ERP purchasing foundation: supplier master, purchase requests, and rule-driven approval creation.

begin;

-- Browser clients must not create arbitrary approval requests by choosing their own approver.
revoke insert, update, delete on public.approval_requests from authenticated;
drop policy if exists approval_requests_insert_same_brand on public.approval_requests;

create or replace function private.match_approval_rule(
  p_brand_id uuid,
  p_transaction_type text,
  p_category text,
  p_requester_role text,
  p_amount numeric
)
returns public.approval_rules
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rule public.approval_rules%rowtype;
begin
  select r.*
    into v_rule
  from public.approval_rules r
  where r.brand_id = p_brand_id
    and r.active
    and lower(btrim(r.transaction_type)) = lower(btrim(p_transaction_type))
    and (r.category is null or lower(btrim(r.category)) = lower(btrim(coalesce(p_category, ''))))
    and (r.requester_role is null or r.requester_role = p_requester_role)
    and coalesce(p_amount, 0) >= r.min_amount
    and (r.max_amount is null or coalesce(p_amount, 0) <= r.max_amount)
  order by
    case when r.requester_role = p_requester_role then 0 else 1 end,
    case when r.category is not null then 0 else 1 end,
    r.priority asc,
    r.min_amount desc,
    r.created_at asc
  limit 1;

  if v_rule.id is null then
    raise exception 'No active approval rule matches this request';
  end if;

  return v_rule;
end;
$$;

revoke execute on function private.match_approval_rule(uuid,text,text,text,numeric)
  from public, anon, authenticated;

create or replace function private.create_approval_request(
  p_brand_id uuid,
  p_outlet_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_amount numeric,
  p_category text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.approval_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_rule public.approval_rules%rowtype;
  v_request public.approval_requests%rowtype;
begin
  select role
    into v_role
  from public.user_profiles
  where id = auth.uid()
    and status = 'active';

  if v_role is null then
    raise exception 'Active profile required';
  end if;

  if not private.same_brand(p_brand_id) then
    raise exception 'Entity is outside your brand';
  end if;

  if p_outlet_id is not null
     and not exists (
       select 1 from public.outlets o
       where o.id = p_outlet_id
         and o.brand_id = p_brand_id
         and o.active
     ) then
    raise exception 'Outlet is invalid or inactive for this brand';
  end if;

  if exists (
    select 1 from public.approval_requests ar
    where ar.brand_id = p_brand_id
      and ar.entity_type = p_entity_type
      and ar.entity_id = p_entity_id
      and ar.status = 'pending'
  ) then
    raise exception 'A pending approval request already exists for this entity';
  end if;

  v_rule := private.match_approval_rule(
    p_brand_id,
    p_entity_type,
    p_category,
    v_role,
    coalesce(p_amount, 0)
  );

  insert into public.approval_requests (
    brand_id, outlet_id, rule_id, entity_type, entity_id, amount,
    approver_role, status, requested_by, metadata
  ) values (
    p_brand_id, p_outlet_id, v_rule.id, p_entity_type, p_entity_id, p_amount,
    v_rule.approver_role, 'pending', auth.uid(), coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_request;

  insert into public.approval_history (
    approval_request_id, action, actor_id, reason, metadata
  ) values (
    v_request.id, 'requested', auth.uid(), null,
    jsonb_build_object('rule_id', v_rule.id, 'approver_role', v_rule.approver_role)
  );

  perform private.write_audit_log(
    p_brand_id,
    p_outlet_id,
    'approval_request',
    v_request.id,
    'requested',
    auth.uid(),
    null,
    to_jsonb(v_request),
    null,
    jsonb_build_object('entity_type', p_entity_type, 'entity_id', p_entity_id)
  );

  return v_request;
end;
$$;

revoke execute on function private.create_approval_request(uuid,uuid,text,uuid,numeric,text,jsonb)
  from public, anon;
grant execute on function private.create_approval_request(uuid,uuid,text,uuid,numeric,text,jsonb)
  to authenticated;

create or replace function public.create_approval_request(
  p_brand_id uuid,
  p_outlet_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_amount numeric,
  p_category text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.approval_requests
language sql
security invoker
set search_path = ''
as $$
  select private.create_approval_request(
    p_brand_id, p_outlet_id, p_entity_type, p_entity_id,
    p_amount, p_category, p_metadata
  );
$$;

revoke execute on function public.create_approval_request(uuid,uuid,text,uuid,numeric,text,jsonb)
  from public, anon;
grant execute on function public.create_approval_request(uuid,uuid,text,uuid,numeric,text,jsonb)
  to authenticated;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  code text,
  name text not null,
  contact_name text,
  phone text,
  email text,
  payment_terms_days integer not null default 0,
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_name_nonempty check (btrim(name) <> ''),
  constraint suppliers_terms_nonnegative check (payment_terms_days >= 0)
);

create unique index if not exists suppliers_brand_name_uidx
  on public.suppliers (brand_id, lower(btrim(name)));

create unique index if not exists suppliers_brand_code_uidx
  on public.suppliers (brand_id, lower(btrim(code)))
  where code is not null and btrim(code) <> '';

create index if not exists suppliers_created_by_idx on public.suppliers(created_by);

alter table public.suppliers enable row level security;

drop policy if exists suppliers_read_same_brand on public.suppliers;
create policy suppliers_read_same_brand
on public.suppliers
for select to authenticated
using ((select private.same_brand(suppliers.brand_id)));

drop policy if exists suppliers_insert_procurement on public.suppliers;
create policy suppliers_insert_procurement
on public.suppliers
for insert to authenticated
with check (
  (select private.same_brand(suppliers.brand_id))
  and (select private.has_role(array['owner','head_store']))
);

drop policy if exists suppliers_update_procurement on public.suppliers;
create policy suppliers_update_procurement
on public.suppliers
for update to authenticated
using (
  (select private.same_brand(suppliers.brand_id))
  and (select private.has_role(array['owner','head_store']))
)
with check (
  (select private.same_brand(suppliers.brand_id))
  and (select private.has_role(array['owner','head_store']))
);

grant select, insert, update on public.suppliers to authenticated;

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  request_no text not null,
  request_date date not null default current_date,
  needed_by date,
  status text not null default 'draft',
  reason text,
  estimated_total numeric not null default 0,
  requested_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_requests_no_nonempty check (btrim(request_no) <> ''),
  constraint purchase_requests_total_nonnegative check (estimated_total >= 0),
  constraint purchase_requests_status_check check (
    status in ('draft','pending_approval','approved','rejected','cancelled','ordered')
  ),
  constraint purchase_requests_needed_by_check check (
    needed_by is null or needed_by >= request_date
  )
);

create unique index if not exists purchase_requests_brand_no_uidx
  on public.purchase_requests (brand_id, lower(btrim(request_no)));

create index if not exists purchase_requests_brand_status_idx
  on public.purchase_requests (brand_id, status, request_date desc);

create index if not exists purchase_requests_outlet_idx on public.purchase_requests(outlet_id);
create index if not exists purchase_requests_supplier_idx on public.purchase_requests(supplier_id);
create index if not exists purchase_requests_requested_by_idx on public.purchase_requests(requested_by);

alter table public.purchase_requests enable row level security;

drop policy if exists purchase_requests_read_same_brand on public.purchase_requests;
create policy purchase_requests_read_same_brand
on public.purchase_requests
for select to authenticated
using ((select private.same_brand(purchase_requests.brand_id)));

drop policy if exists purchase_requests_insert_requester on public.purchase_requests;
create policy purchase_requests_insert_requester
on public.purchase_requests
for insert to authenticated
with check (
  (select private.same_brand(purchase_requests.brand_id))
  and (select private.has_capability('purchase.request'))
  and purchase_requests.requested_by = (select auth.uid())
  and purchase_requests.status = 'draft'
);

drop policy if exists purchase_requests_update_draft on public.purchase_requests;
create policy purchase_requests_update_draft
on public.purchase_requests
for update to authenticated
using (
  (select private.same_brand(purchase_requests.brand_id))
  and purchase_requests.status = 'draft'
  and (
    purchase_requests.requested_by = (select auth.uid())
    or (select private.is_owner())
  )
)
with check (
  (select private.same_brand(purchase_requests.brand_id))
  and purchase_requests.status = 'draft'
  and (
    purchase_requests.requested_by = (select auth.uid())
    or (select private.is_owner())
  )
);

drop policy if exists purchase_requests_delete_draft on public.purchase_requests;
create policy purchase_requests_delete_draft
on public.purchase_requests
for delete to authenticated
using (
  (select private.same_brand(purchase_requests.brand_id))
  and purchase_requests.status = 'draft'
  and (
    purchase_requests.requested_by = (select auth.uid())
    or (select private.is_owner())
  )
);

grant select, insert, update, delete on public.purchase_requests to authenticated;

create table if not exists public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  item_name text not null,
  qty numeric not null,
  unit text not null default 'pcs',
  estimated_unit_price numeric not null default 0,
  line_total numeric generated always as (qty * estimated_unit_price) stored,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_request_items_name_nonempty check (btrim(item_name) <> ''),
  constraint purchase_request_items_qty_positive check (qty > 0),
  constraint purchase_request_items_price_nonnegative check (estimated_unit_price >= 0),
  constraint purchase_request_items_unit_nonempty check (btrim(unit) <> '')
);

create index if not exists purchase_request_items_request_idx
  on public.purchase_request_items(purchase_request_id);

create index if not exists purchase_request_items_inventory_idx
  on public.purchase_request_items(inventory_item_id);

create index if not exists purchase_request_items_supplier_idx
  on public.purchase_request_items(supplier_id);

alter table public.purchase_request_items enable row level security;

create or replace function private.purchase_request_item_allowed(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.purchase_requests pr
    where pr.id = p_request_id
      and pr.status = 'draft'
      and private.same_brand(pr.brand_id)
      and (
        pr.requested_by = auth.uid()
        or private.is_owner()
      )
  );
$$;

revoke execute on function private.purchase_request_item_allowed(uuid)
  from public, anon, authenticated;

drop policy if exists purchase_request_items_read_same_brand on public.purchase_request_items;
create policy purchase_request_items_read_same_brand
on public.purchase_request_items
for select to authenticated
using (
  exists (
    select 1 from public.purchase_requests pr
    where pr.id = purchase_request_items.purchase_request_id
      and (select private.same_brand(pr.brand_id))
  )
);

drop policy if exists purchase_request_items_insert_draft on public.purchase_request_items;
create policy purchase_request_items_insert_draft
on public.purchase_request_items
for insert to authenticated
with check ((select private.purchase_request_item_allowed(purchase_request_id)));

drop policy if exists purchase_request_items_update_draft on public.purchase_request_items;
create policy purchase_request_items_update_draft
on public.purchase_request_items
for update to authenticated
using ((select private.purchase_request_item_allowed(purchase_request_id)))
with check ((select private.purchase_request_item_allowed(purchase_request_id)));

drop policy if exists purchase_request_items_delete_draft on public.purchase_request_items;
create policy purchase_request_items_delete_draft
on public.purchase_request_items
for delete to authenticated
using ((select private.purchase_request_item_allowed(purchase_request_id)));

grant select, insert, update, delete on public.purchase_request_items to authenticated;

create or replace function private.guard_purchase_request_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_brand_id uuid;
begin
  select brand_id into v_brand_id
  from public.purchase_requests
  where id = new.purchase_request_id;

  if v_brand_id is null then
    raise exception 'Purchase request not found';
  end if;

  if new.inventory_item_id is not null
     and not exists (
       select 1 from public.inventory_items i
       where i.id = new.inventory_item_id
         and i.brand_id = v_brand_id
     ) then
    raise exception 'Inventory item belongs to another brand';
  end if;

  if new.supplier_id is not null
     and not exists (
       select 1 from public.suppliers s
       where s.id = new.supplier_id
         and s.brand_id = v_brand_id
     ) then
    raise exception 'Supplier belongs to another brand';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.guard_purchase_request_item()
  from public, anon, authenticated;

drop trigger if exists trg_guard_purchase_request_item on public.purchase_request_items;
create trigger trg_guard_purchase_request_item
before insert or update on public.purchase_request_items
for each row execute function private.guard_purchase_request_item();

create or replace function private.recalculate_purchase_request_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
begin
  v_request_id := coalesce(new.purchase_request_id, old.purchase_request_id);

  update public.purchase_requests pr
  set estimated_total = coalesce((
        select sum(i.line_total)
        from public.purchase_request_items i
        where i.purchase_request_id = v_request_id
      ), 0),
      updated_at = now()
  where pr.id = v_request_id;

  return null;
end;
$$;

revoke execute on function private.recalculate_purchase_request_total()
  from public, anon, authenticated;

drop trigger if exists trg_recalculate_purchase_request_total on public.purchase_request_items;
create trigger trg_recalculate_purchase_request_total
after insert or update or delete on public.purchase_request_items
for each row execute function private.recalculate_purchase_request_total();

create or replace function private.submit_purchase_request(p_request_id uuid)
returns public.purchase_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.purchase_requests%rowtype;
  v_role text;
  v_approval public.approval_requests%rowtype;
  v_item_count integer;
begin
  select role into v_role
  from public.user_profiles
  where id = auth.uid()
    and status = 'active';

  if v_role is null then
    raise exception 'Active profile required';
  end if;

  select * into v_request
  from public.purchase_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Purchase request not found';
  end if;

  if not private.same_brand(v_request.brand_id) then
    raise exception 'Purchase request is outside your brand';
  end if;

  if v_request.status <> 'draft' then
    raise exception 'Only draft purchase requests can be submitted';
  end if;

  if v_request.requested_by <> auth.uid()
     and not private.is_owner() then
    raise exception 'Only the requester or Owner can submit this purchase request';
  end if;

  select count(*) into v_item_count
  from public.purchase_request_items
  where purchase_request_id = v_request.id;

  if v_item_count = 0 then
    raise exception 'Purchase request requires at least one item';
  end if;

  if v_request.estimated_total <= 0 then
    raise exception 'Purchase request estimated total must be greater than zero';
  end if;

  if v_role = 'owner' then
    update public.purchase_requests
    set status = 'approved',
        submitted_at = now(),
        approved_at = now(),
        updated_at = now()
    where id = v_request.id
    returning * into v_request;

    perform private.write_audit_log(
      v_request.brand_id, v_request.outlet_id, 'purchase_request',
      v_request.id, 'approved_owner_direct', auth.uid(), null,
      to_jsonb(v_request), 'Owner direct authority',
      jsonb_build_object('estimated_total', v_request.estimated_total)
    );
  else
    v_approval := private.create_approval_request(
      v_request.brand_id,
      v_request.outlet_id,
      'purchase_request',
      v_request.id,
      v_request.estimated_total,
      null,
      jsonb_build_object('request_no', v_request.request_no)
    );

    update public.purchase_requests
    set status = 'pending_approval',
        submitted_at = now(),
        updated_at = now()
    where id = v_request.id
    returning * into v_request;

    perform private.write_audit_log(
      v_request.brand_id, v_request.outlet_id, 'purchase_request',
      v_request.id, 'submitted', auth.uid(), null,
      to_jsonb(v_request), null,
      jsonb_build_object('approval_request_id', v_approval.id)
    );
  end if;

  return v_request;
end;
$$;

revoke execute on function private.submit_purchase_request(uuid)
  from public, anon;
grant execute on function private.submit_purchase_request(uuid)
  to authenticated;

create or replace function public.submit_purchase_request(p_request_id uuid)
returns public.purchase_requests
language sql
security invoker
set search_path = ''
as $$ select private.submit_purchase_request(p_request_id); $$;

revoke execute on function public.submit_purchase_request(uuid) from public, anon;
grant execute on function public.submit_purchase_request(uuid) to authenticated;

-- Extend generic decision handling so Purchase Request status follows the approval.
create or replace function private.decide_approval_request(
  p_request_id uuid,
  p_action text,
  p_reason text default null
)
returns public.approval_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.approval_requests%rowtype;
  v_role text;
  v_is_super boolean;
begin
  if lower(btrim(coalesce(p_action, ''))) not in ('approved','rejected') then
    raise exception 'Unsupported approval action';
  end if;

  select role, is_super_admin
    into v_role, v_is_super
  from public.user_profiles
  where id = auth.uid()
    and status = 'active';

  if v_role is null and coalesce(v_is_super, false) = false then
    raise exception 'Active profile required';
  end if;

  select *
    into v_request
  from public.approval_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Approval request not found';
  end if;

  if not private.same_brand(v_request.brand_id) then
    raise exception 'Approval request is outside your brand';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Approval request is no longer pending';
  end if;

  if v_request.requested_by = auth.uid() then
    raise exception 'Self-approval is not allowed';
  end if;

  if not coalesce(v_is_super, false)
     and v_role <> v_request.approver_role
     and not (v_role = 'owner' and v_request.approver_role = 'head_store') then
    raise exception 'You are not an authorized approver for this request';
  end if;

  update public.approval_requests
  set status = lower(btrim(p_action)),
      resolved_by = auth.uid(),
      resolved_at = now(),
      decision_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = v_request.id
  returning * into v_request;

  insert into public.approval_history (
    approval_request_id, action, actor_id, reason
  ) values (
    v_request.id, v_request.status, auth.uid(), v_request.decision_reason
  );

  if v_request.entity_type = 'purchase_request' then
    update public.purchase_requests
    set status = case when v_request.status = 'approved' then 'approved' else 'rejected' end,
        approved_at = case when v_request.status = 'approved' then now() else approved_at end,
        rejected_at = case when v_request.status = 'rejected' then now() else rejected_at end,
        updated_at = now()
    where id = v_request.entity_id;
  end if;

  perform private.write_audit_log(
    v_request.brand_id,
    v_request.outlet_id,
    'approval_request',
    v_request.id,
    v_request.status,
    auth.uid(),
    jsonb_build_object('status', 'pending'),
    jsonb_build_object(
      'status', v_request.status,
      'resolved_by', auth.uid(),
      'resolved_at', v_request.resolved_at
    ),
    v_request.decision_reason,
    jsonb_build_object(
      'entity_type', v_request.entity_type,
      'entity_id', v_request.entity_id
    )
  );

  return v_request;
end;
$$;

revoke execute on function private.decide_approval_request(uuid,text,text)
  from public, anon;
grant execute on function private.decide_approval_request(uuid,text,text)
  to authenticated;

-- Default Hasnaria purchase approval routes. Owner submissions use direct Owner authority.
insert into public.approval_rules (
  brand_id, transaction_type, category, requester_role,
  min_amount, max_amount, approver_role, priority, active
)
select b.id, 'purchase_request', null, 'pic',
       0, 1500000, 'head_store', 10, true
from public.brands b
where lower(btrim(b.name)) = 'hasnaria'
  and not exists (
    select 1 from public.approval_rules r
    where r.brand_id = b.id
      and r.transaction_type = 'purchase_request'
      and r.requester_role = 'pic'
      and r.max_amount = 1500000
  );

insert into public.approval_rules (
  brand_id, transaction_type, category, requester_role,
  min_amount, max_amount, approver_role, priority, active
)
select b.id, 'purchase_request', null, 'pelaksana',
       0, 1500000, 'head_store', 10, true
from public.brands b
where lower(btrim(b.name)) = 'hasnaria'
  and not exists (
    select 1 from public.approval_rules r
    where r.brand_id = b.id
      and r.transaction_type = 'purchase_request'
      and r.requester_role = 'pelaksana'
      and r.max_amount = 1500000
  );

insert into public.approval_rules (
  brand_id, transaction_type, category, requester_role,
  min_amount, max_amount, approver_role, priority, active
)
select b.id, 'purchase_request', null, null,
       0, null, 'owner', 100, true
from public.brands b
where lower(btrim(b.name)) = 'hasnaria'
  and not exists (
    select 1 from public.approval_rules r
    where r.brand_id = b.id
      and r.transaction_type = 'purchase_request'
      and r.requester_role is null
      and r.approver_role = 'owner'
  );

comment on table public.suppliers is 'ERP supplier/vendor master scoped by brand.';
comment on table public.purchase_requests is 'Purchase Request header. Submission routes through rule-driven approval unless requester is Owner.';
comment on table public.purchase_request_items is 'Purchase Request line items with generated estimated line total.';

commit;
