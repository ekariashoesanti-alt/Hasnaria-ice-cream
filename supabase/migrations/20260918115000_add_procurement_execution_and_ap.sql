-- ERP procurement execution: Purchase Order -> Goods Receipt -> Supplier Invoice -> Payment/AP.
-- All objects are additive. Existing legacy purchase upload remains supported.

begin;

-- Extend centralized capability matrix for procurement/AP execution.
create or replace function private.has_capability(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_capability, '')))
    when 'business.read' then private.has_role(array['owner','head_store','marketing','pic','pelaksana'])
    when 'sales.write' then private.has_role(array['owner','head_store','pic','pelaksana'])
    when 'ops.write' then private.has_role(array['owner','head_store','pic'])
    when 'stock.write' then private.has_role(array['owner','head_store','pic'])
    when 'social.write' then private.has_role(array['owner','head_store','marketing'])
    when 'purchase.request' then private.has_role(array['owner','head_store','pic','pelaksana'])
    when 'purchase.manage' then private.has_role(array['owner','head_store'])
    when 'purchase.receive' then private.has_role(array['owner','head_store','pic'])
    when 'purchase.approve.limited' then private.has_role(array['head_store'])
    when 'purchase.approve.full' then private.has_role(array['owner'])
    when 'finance.read' then private.has_role(array['owner','head_store'])
    when 'finance.ap.write' then private.has_role(array['owner','head_store'])
    when 'hr.manage' then private.has_role(array['owner','head_store'])
    when 'marketing.manage' then private.has_role(array['owner','head_store','marketing'])
    when 'team.manage' then private.has_role(array['owner'])
    when 'settings.manage' then private.has_role(array['owner'])
    when 'audit.read' then private.has_role(array['owner'])
    else false
  end;
$$;

revoke execute on function private.has_capability(text) from public, anon;
grant execute on function private.has_capability(text) to authenticated;

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_request_id uuid references public.purchase_requests(id) on delete restrict,
  po_no text not null,
  order_date date not null default current_date,
  expected_date date,
  status text not null default 'draft',
  subtotal numeric not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_orders_no_nonempty check (btrim(po_no) <> ''),
  constraint purchase_orders_subtotal_nonnegative check (subtotal >= 0),
  constraint purchase_orders_date_check check (
    expected_date is null or expected_date >= order_date
  ),
  constraint purchase_orders_status_check check (
    status in ('draft','issued','partially_received','received','cancelled','closed')
  )
);

create unique index if not exists purchase_orders_brand_no_uidx
  on public.purchase_orders(brand_id, lower(btrim(po_no)));

create unique index if not exists purchase_orders_request_active_uidx
  on public.purchase_orders(purchase_request_id)
  where purchase_request_id is not null and status <> 'cancelled';

create index if not exists purchase_orders_brand_status_idx
  on public.purchase_orders(brand_id,status,order_date desc);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders(supplier_id);
create index if not exists purchase_orders_outlet_idx on public.purchase_orders(outlet_id);
create index if not exists purchase_orders_created_by_idx on public.purchase_orders(created_by);

alter table public.purchase_orders enable row level security;

create policy purchase_orders_read_same_brand
on public.purchase_orders for select to authenticated
using ((select private.same_brand(purchase_orders.brand_id)));

create policy purchase_orders_insert_manage
on public.purchase_orders for insert to authenticated
with check (
  (select private.same_brand(purchase_orders.brand_id))
  and (select private.has_capability('purchase.manage'))
  and purchase_orders.status='draft'
);

create policy purchase_orders_update_draft
on public.purchase_orders for update to authenticated
using (
  (select private.same_brand(purchase_orders.brand_id))
  and (select private.has_capability('purchase.manage'))
  and purchase_orders.status='draft'
)
with check (
  (select private.same_brand(purchase_orders.brand_id))
  and (select private.has_capability('purchase.manage'))
  and purchase_orders.status='draft'
);

grant select,insert,update on public.purchase_orders to authenticated;

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  purchase_request_item_id uuid references public.purchase_request_items(id) on delete set null,
  inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  item_name text not null,
  ordered_qty numeric not null,
  unit text not null default 'pcs',
  unit_price numeric not null default 0,
  line_total numeric generated always as (ordered_qty * unit_price) stored,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_items_name_nonempty check (btrim(item_name) <> ''),
  constraint purchase_order_items_qty_positive check (ordered_qty > 0),
  constraint purchase_order_items_unit_nonempty check (btrim(unit) <> ''),
  constraint purchase_order_items_price_nonnegative check (unit_price >= 0)
);

create index if not exists purchase_order_items_order_idx
  on public.purchase_order_items(purchase_order_id);
create index if not exists purchase_order_items_request_item_idx
  on public.purchase_order_items(purchase_request_item_id);
create index if not exists purchase_order_items_inventory_idx
  on public.purchase_order_items(inventory_item_id);

alter table public.purchase_order_items enable row level security;

create or replace function private.purchase_order_draft_allowed(p_order_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.purchase_orders po
    where po.id=p_order_id
      and po.status='draft'
      and private.same_brand(po.brand_id)
      and private.has_capability('purchase.manage')
  );
$$;

revoke execute on function private.purchase_order_draft_allowed(uuid)
  from public,anon,authenticated;

create policy purchase_order_items_read_same_brand
on public.purchase_order_items for select to authenticated
using (
  exists (
    select 1 from public.purchase_orders po
    where po.id=purchase_order_items.purchase_order_id
      and (select private.same_brand(po.brand_id))
  )
);

create policy purchase_order_items_insert_draft
on public.purchase_order_items for insert to authenticated
with check ((select private.purchase_order_draft_allowed(purchase_order_id)));

create policy purchase_order_items_update_draft
on public.purchase_order_items for update to authenticated
using ((select private.purchase_order_draft_allowed(purchase_order_id)))
with check ((select private.purchase_order_draft_allowed(purchase_order_id)));

create policy purchase_order_items_delete_draft
on public.purchase_order_items for delete to authenticated
using ((select private.purchase_order_draft_allowed(purchase_order_id)));

grant select,insert,update,delete on public.purchase_order_items to authenticated;

create or replace function private.guard_purchase_order_item()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_brand uuid;
begin
  select brand_id into v_brand
  from public.purchase_orders where id=new.purchase_order_id;

  if v_brand is null then raise exception 'Purchase order not found'; end if;

  if new.inventory_item_id is not null and not exists (
    select 1 from public.inventory_items i
    where i.id=new.inventory_item_id and i.brand_id=v_brand
  ) then
    raise exception 'Inventory item belongs to another brand';
  end if;

  new.updated_at:=now();
  return new;
end;
$$;

revoke execute on function private.guard_purchase_order_item()
  from public,anon,authenticated;

create trigger trg_guard_purchase_order_item
before insert or update on public.purchase_order_items
for each row execute function private.guard_purchase_order_item();

create or replace function private.recalculate_purchase_order_total()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare v_order uuid;
begin
  v_order:=coalesce(new.purchase_order_id,old.purchase_order_id);
  update public.purchase_orders po
  set subtotal=coalesce((
        select sum(i.line_total) from public.purchase_order_items i
        where i.purchase_order_id=v_order
      ),0),
      updated_at=now()
  where po.id=v_order;
  return null;
end;
$$;

revoke execute on function private.recalculate_purchase_order_total()
  from public,anon,authenticated;

create trigger trg_recalculate_purchase_order_total
after insert or update or delete on public.purchase_order_items
for each row execute function private.recalculate_purchase_order_total();

create or replace function private.create_purchase_order_from_request(
  p_request_id uuid,
  p_supplier_id uuid,
  p_po_no text,
  p_expected_date date default null
)
returns public.purchase_orders
language plpgsql security definer set search_path=''
as $$
declare
  v_pr public.purchase_requests%rowtype;
  v_po public.purchase_orders%rowtype;
begin
  if not private.has_capability('purchase.manage') then
    raise exception 'Purchase management permission required';
  end if;

  select * into v_pr from public.purchase_requests
  where id=p_request_id for update;

  if not found then raise exception 'Purchase request not found'; end if;
  if not private.same_brand(v_pr.brand_id) then raise exception 'Purchase request is outside your brand'; end if;
  if v_pr.status <> 'approved' then raise exception 'Only approved purchase requests can become purchase orders'; end if;

  if not exists (
    select 1 from public.suppliers s
    where s.id=p_supplier_id and s.brand_id=v_pr.brand_id and s.active
  ) then
    raise exception 'Supplier is invalid or inactive for this brand';
  end if;

  if exists (
    select 1 from public.purchase_request_items pri
    where pri.purchase_request_id=v_pr.id
      and pri.supplier_id is not null
      and pri.supplier_id<>p_supplier_id
  ) then
    raise exception 'Purchase request contains items assigned to a different supplier';
  end if;

  insert into public.purchase_orders(
    brand_id,outlet_id,supplier_id,purchase_request_id,po_no,
    order_date,expected_date,status,notes,created_by
  ) values (
    v_pr.brand_id,v_pr.outlet_id,p_supplier_id,v_pr.id,p_po_no,
    current_date,p_expected_date,'draft',v_pr.reason,auth.uid()
  )
  returning * into v_po;

  insert into public.purchase_order_items(
    purchase_order_id,purchase_request_item_id,inventory_item_id,item_name,
    ordered_qty,unit,unit_price,notes
  )
  select
    v_po.id,pri.id,pri.inventory_item_id,pri.item_name,
    pri.qty,pri.unit,pri.estimated_unit_price,pri.notes
  from public.purchase_request_items pri
  where pri.purchase_request_id=v_pr.id;

  update public.purchase_orders
  set subtotal=coalesce((
    select sum(line_total) from public.purchase_order_items where purchase_order_id=v_po.id
  ),0),updated_at=now()
  where id=v_po.id
  returning * into v_po;

  perform private.write_audit_log(
    v_po.brand_id,v_po.outlet_id,'purchase_order',v_po.id,'created',
    auth.uid(),null,to_jsonb(v_po),null,
    jsonb_build_object('purchase_request_id',v_pr.id)
  );

  return v_po;
end;
$$;

revoke execute on function private.create_purchase_order_from_request(uuid,uuid,text,date)
  from public,anon;
grant execute on function private.create_purchase_order_from_request(uuid,uuid,text,date)
  to authenticated;

create or replace function public.create_purchase_order_from_request(
  p_request_id uuid,
  p_supplier_id uuid,
  p_po_no text,
  p_expected_date date default null
)
returns public.purchase_orders
language sql security invoker set search_path=''
as $$
  select private.create_purchase_order_from_request(
    p_request_id,p_supplier_id,p_po_no,p_expected_date
  );
$$;

revoke execute on function public.create_purchase_order_from_request(uuid,uuid,text,date)
  from public,anon;
grant execute on function public.create_purchase_order_from_request(uuid,uuid,text,date)
  to authenticated;

create or replace function private.issue_purchase_order(p_order_id uuid)
returns public.purchase_orders
language plpgsql security definer set search_path=''
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_count integer;
begin
  if not private.has_capability('purchase.manage') then
    raise exception 'Purchase management permission required';
  end if;

  select * into v_po from public.purchase_orders
  where id=p_order_id for update;

  if not found then raise exception 'Purchase order not found'; end if;
  if not private.same_brand(v_po.brand_id) then raise exception 'Purchase order is outside your brand'; end if;
  if v_po.status<>'draft' then raise exception 'Only draft purchase orders can be issued'; end if;

  select count(*) into v_count from public.purchase_order_items
  where purchase_order_id=v_po.id;

  if v_count=0 or v_po.subtotal<=0 then
    raise exception 'Purchase order requires priced items';
  end if;

  update public.purchase_orders
  set status='issued',issued_at=now(),updated_at=now()
  where id=v_po.id
  returning * into v_po;

  update public.purchase_requests
  set status='ordered',updated_at=now()
  where id=v_po.purchase_request_id;

  perform private.write_audit_log(
    v_po.brand_id,v_po.outlet_id,'purchase_order',v_po.id,'issued',
    auth.uid(),jsonb_build_object('status','draft'),to_jsonb(v_po),null,'{}'::jsonb
  );

  return v_po;
end;
$$;

revoke execute on function private.issue_purchase_order(uuid) from public,anon;
grant execute on function private.issue_purchase_order(uuid) to authenticated;

create or replace function public.issue_purchase_order(p_order_id uuid)
returns public.purchase_orders
language sql security invoker set search_path=''
as $$ select private.issue_purchase_order(p_order_id); $$;

revoke execute on function public.issue_purchase_order(uuid) from public,anon;
grant execute on function public.issue_purchase_order(uuid) to authenticated;

create table if not exists public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete restrict,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  receipt_no text not null,
  receipt_date date not null default current_date,
  status text not null default 'draft',
  notes text,
  received_by uuid references auth.users(id) on delete set null default auth.uid(),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goods_receipts_no_nonempty check (btrim(receipt_no)<>''),
  constraint goods_receipts_status_check check (status in ('draft','posted','void'))
);

create unique index if not exists goods_receipts_brand_no_uidx
  on public.goods_receipts(brand_id,lower(btrim(receipt_no)));
create index if not exists goods_receipts_po_idx on public.goods_receipts(purchase_order_id);
create index if not exists goods_receipts_brand_date_idx on public.goods_receipts(brand_id,receipt_date desc);
create index if not exists goods_receipts_outlet_idx on public.goods_receipts(outlet_id);
create index if not exists goods_receipts_received_by_idx on public.goods_receipts(received_by);

alter table public.goods_receipts enable row level security;

create policy goods_receipts_read_same_brand
on public.goods_receipts for select to authenticated
using ((select private.same_brand(goods_receipts.brand_id)));

create policy goods_receipts_insert_receive
on public.goods_receipts for insert to authenticated
with check (
  (select private.same_brand(goods_receipts.brand_id))
  and (select private.has_capability('purchase.receive'))
  and goods_receipts.status='draft'
);

create policy goods_receipts_update_draft
on public.goods_receipts for update to authenticated
using (
  (select private.same_brand(goods_receipts.brand_id))
  and (select private.has_capability('purchase.receive'))
  and goods_receipts.status='draft'
)
with check (
  (select private.same_brand(goods_receipts.brand_id))
  and (select private.has_capability('purchase.receive'))
  and goods_receipts.status='draft'
);

grant select,insert,update on public.goods_receipts to authenticated;

create table if not exists public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references public.goods_receipts(id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  qty_received numeric not null,
  unit text not null default 'pcs',
  unit_cost numeric not null default 0,
  line_total numeric generated always as (qty_received * unit_cost) stored,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goods_receipt_items_qty_positive check (qty_received>0),
  constraint goods_receipt_items_cost_nonnegative check (unit_cost>=0),
  constraint goods_receipt_items_unit_nonempty check (btrim(unit)<>'')
);

create index if not exists goods_receipt_items_receipt_idx
  on public.goods_receipt_items(goods_receipt_id);
create index if not exists goods_receipt_items_po_item_idx
  on public.goods_receipt_items(purchase_order_item_id);
create index if not exists goods_receipt_items_inventory_idx
  on public.goods_receipt_items(inventory_item_id);

alter table public.goods_receipt_items enable row level security;

create or replace function private.goods_receipt_draft_allowed(p_receipt_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.goods_receipts gr
    where gr.id=p_receipt_id
      and gr.status='draft'
      and private.same_brand(gr.brand_id)
      and private.has_capability('purchase.receive')
  );
$$;

revoke execute on function private.goods_receipt_draft_allowed(uuid)
  from public,anon,authenticated;

create policy goods_receipt_items_read_same_brand
on public.goods_receipt_items for select to authenticated
using (
  exists (
    select 1 from public.goods_receipts gr
    where gr.id=goods_receipt_items.goods_receipt_id
      and (select private.same_brand(gr.brand_id))
  )
);

create policy goods_receipt_items_insert_draft
on public.goods_receipt_items for insert to authenticated
with check ((select private.goods_receipt_draft_allowed(goods_receipt_id)));

create policy goods_receipt_items_update_draft
on public.goods_receipt_items for update to authenticated
using ((select private.goods_receipt_draft_allowed(goods_receipt_id)))
with check ((select private.goods_receipt_draft_allowed(goods_receipt_id)));

create policy goods_receipt_items_delete_draft
on public.goods_receipt_items for delete to authenticated
using ((select private.goods_receipt_draft_allowed(goods_receipt_id)));

grant select,insert,update,delete on public.goods_receipt_items to authenticated;

create or replace function private.guard_goods_receipt_item()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_gr public.goods_receipts%rowtype;
  v_poi public.purchase_order_items%rowtype;
  v_received numeric;
begin
  select * into v_gr from public.goods_receipts where id=new.goods_receipt_id;
  if not found or v_gr.status<>'draft' then raise exception 'Goods receipt is not editable'; end if;

  select * into v_poi from public.purchase_order_items where id=new.purchase_order_item_id;
  if not found then raise exception 'Purchase order item not found'; end if;

  if not exists (
    select 1 from public.purchase_orders po
    where po.id=v_gr.purchase_order_id
      and po.id=v_poi.purchase_order_id
      and po.brand_id=v_gr.brand_id
      and po.status in ('issued','partially_received')
  ) then
    raise exception 'Receipt item does not belong to an issued purchase order';
  end if;

  if v_poi.inventory_item_id is null then
    raise exception 'Purchase order item must map to inventory before receiving';
  end if;

  new.inventory_item_id:=v_poi.inventory_item_id;
  new.unit:=v_poi.unit;
  if new.unit_cost=0 then new.unit_cost:=v_poi.unit_price; end if;

  select coalesce(sum(gri.qty_received),0) into v_received
  from public.goods_receipt_items gri
  join public.goods_receipts gr on gr.id=gri.goods_receipt_id
  where gri.purchase_order_item_id=new.purchase_order_item_id
    and gr.status='posted'
    and gri.id<>coalesce(new.id,gen_random_uuid());

  if v_received + new.qty_received > v_poi.ordered_qty then
    raise exception 'Received quantity exceeds ordered quantity';
  end if;

  new.updated_at:=now();
  return new;
end;
$$;

revoke execute on function private.guard_goods_receipt_item()
  from public,anon,authenticated;

create trigger trg_guard_goods_receipt_item
before insert or update on public.goods_receipt_items
for each row execute function private.guard_goods_receipt_item();

create or replace function private.refresh_purchase_order_receipt_status(p_order_id uuid)
returns void
language plpgsql security definer set search_path=''
as $$
declare
  v_ordered numeric;
  v_received numeric;
  v_status text;
begin
  select coalesce(sum(ordered_qty),0) into v_ordered
  from public.purchase_order_items where purchase_order_id=p_order_id;

  select coalesce(sum(gri.qty_received),0) into v_received
  from public.goods_receipt_items gri
  join public.goods_receipts gr on gr.id=gri.goods_receipt_id
  where gr.purchase_order_id=p_order_id and gr.status='posted';

  if v_received<=0 then
    v_status:='issued';
  elsif v_received<v_ordered then
    v_status:='partially_received';
  else
    v_status:='received';
  end if;

  update public.purchase_orders
  set status=v_status,updated_at=now()
  where id=p_order_id and status not in ('cancelled','closed');
end;
$$;

revoke execute on function private.refresh_purchase_order_receipt_status(uuid)
  from public,anon,authenticated;

create or replace function private.post_goods_receipt(p_receipt_id uuid)
returns public.goods_receipts
language plpgsql security definer set search_path=''
as $$
declare
  v_gr public.goods_receipts%rowtype;
  v_item record;
  v_count integer;
begin
  if not private.has_capability('purchase.receive') then
    raise exception 'Purchase receiving permission required';
  end if;

  select * into v_gr from public.goods_receipts
  where id=p_receipt_id for update;

  if not found then raise exception 'Goods receipt not found'; end if;
  if not private.same_brand(v_gr.brand_id) then raise exception 'Goods receipt is outside your brand'; end if;
  if v_gr.status<>'draft' then raise exception 'Only draft goods receipts can be posted'; end if;

  select count(*) into v_count from public.goods_receipt_items
  where goods_receipt_id=v_gr.id;
  if v_count=0 then raise exception 'Goods receipt requires at least one item'; end if;

  -- Final over-receipt validation against all already posted receipts.
  for v_item in
    select
      poi.id as po_item_id,
      poi.ordered_qty,
      coalesce((
        select sum(gri.qty_received)
        from public.goods_receipt_items gri
        join public.goods_receipts gr2 on gr2.id=gri.goods_receipt_id
        where gri.purchase_order_item_id=poi.id
          and gr2.status='posted'
      ),0) as already_received,
      coalesce((
        select sum(gri2.qty_received)
        from public.goods_receipt_items gri2
        where gri2.goods_receipt_id=v_gr.id
          and gri2.purchase_order_item_id=poi.id
      ),0) as this_receipt
    from public.purchase_order_items poi
    where poi.purchase_order_id=v_gr.purchase_order_id
  loop
    if v_item.already_received + v_item.this_receipt > v_item.ordered_qty then
      raise exception 'Posting receipt would exceed ordered quantity';
    end if;
  end loop;

  update public.goods_receipts
  set status='posted',posted_at=now(),updated_at=now()
  where id=v_gr.id
  returning * into v_gr;

  insert into public.inventory_movements(
    brand_id,outlet_id,inventory_item_id,movement_date,movement_type,
    qty_delta,unit_cost,reference_type,reference_id,source_key,
    system_generated,notes,created_by
  )
  select
    v_gr.brand_id,v_gr.outlet_id,gri.inventory_item_id,v_gr.receipt_date,
    'PURCHASE_RECEIPT',gri.qty_received,gri.unit_cost,
    'goods_receipt_item',gri.id,
    'GOODS_RECEIPT_ITEM:'||gri.id::text,
    true,gri.notes,auth.uid()
  from public.goods_receipt_items gri
  where gri.goods_receipt_id=v_gr.id
  on conflict (brand_id,source_key) where source_key is not null and btrim(source_key)<>''
  do update set
    movement_date=excluded.movement_date,
    qty_delta=excluded.qty_delta,
    unit_cost=excluded.unit_cost,
    notes=excluded.notes;

  perform private.refresh_purchase_order_receipt_status(v_gr.purchase_order_id);

  perform private.write_audit_log(
    v_gr.brand_id,v_gr.outlet_id,'goods_receipt',v_gr.id,'posted',
    auth.uid(),jsonb_build_object('status','draft'),to_jsonb(v_gr),null,
    jsonb_build_object('purchase_order_id',v_gr.purchase_order_id)
  );

  return v_gr;
end;
$$;

revoke execute on function private.post_goods_receipt(uuid) from public,anon;
grant execute on function private.post_goods_receipt(uuid) to authenticated;

create or replace function public.post_goods_receipt(p_receipt_id uuid)
returns public.goods_receipts
language sql security invoker set search_path=''
as $$ select private.post_goods_receipt(p_receipt_id); $$;

revoke execute on function public.post_goods_receipt(uuid) from public,anon;
grant execute on function public.post_goods_receipt(uuid) to authenticated;

create table if not exists public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders(id) on delete restrict,
  invoice_no text not null,
  invoice_date date not null default current_date,
  due_date date,
  status text not null default 'open',
  subtotal numeric not null default 0,
  tax_amount numeric not null default 0,
  other_amount numeric not null default 0,
  total_amount numeric generated always as (subtotal+tax_amount+other_amount) stored,
  paid_amount numeric not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_invoices_no_nonempty check (btrim(invoice_no)<>''),
  constraint purchase_invoices_amounts_nonnegative check (
    subtotal>=0 and tax_amount>=0 and other_amount>=0 and paid_amount>=0
  ),
  constraint purchase_invoices_due_check check (due_date is null or due_date>=invoice_date),
  constraint purchase_invoices_status_check check (
    status in ('open','partially_paid','paid','void')
  )
);

create unique index if not exists purchase_invoices_supplier_no_uidx
  on public.purchase_invoices(brand_id,supplier_id,lower(btrim(invoice_no)));
create index if not exists purchase_invoices_brand_status_idx
  on public.purchase_invoices(brand_id,status,due_date);
create index if not exists purchase_invoices_po_idx on public.purchase_invoices(purchase_order_id);
create index if not exists purchase_invoices_outlet_idx on public.purchase_invoices(outlet_id);
create index if not exists purchase_invoices_created_by_idx on public.purchase_invoices(created_by);

alter table public.purchase_invoices enable row level security;

create policy purchase_invoices_read_finance
on public.purchase_invoices for select to authenticated
using (
  (select private.same_brand(purchase_invoices.brand_id))
  and (
    (select private.has_capability('finance.read'))
    or (select private.has_capability('purchase.manage'))
  )
);

create policy purchase_invoices_insert_ap
on public.purchase_invoices for insert to authenticated
with check (
  (select private.same_brand(purchase_invoices.brand_id))
  and (select private.has_capability('finance.ap.write'))
);

grant select,insert on public.purchase_invoices to authenticated;

create table if not exists public.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  purchase_invoice_id uuid not null references public.purchase_invoices(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric not null,
  payment_method text not null,
  reference_no text,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint purchase_payments_amount_positive check (amount>0),
  constraint purchase_payments_method_nonempty check (btrim(payment_method)<>'')
);

create index if not exists purchase_payments_invoice_idx
  on public.purchase_payments(purchase_invoice_id,payment_date);
create index if not exists purchase_payments_brand_date_idx
  on public.purchase_payments(brand_id,payment_date desc);
create index if not exists purchase_payments_created_by_idx
  on public.purchase_payments(created_by);

alter table public.purchase_payments enable row level security;

create policy purchase_payments_read_finance
on public.purchase_payments for select to authenticated
using (
  (select private.same_brand(purchase_payments.brand_id))
  and (select private.has_capability('finance.read'))
);

create policy purchase_payments_insert_ap
on public.purchase_payments for insert to authenticated
with check (
  (select private.same_brand(purchase_payments.brand_id))
  and (select private.has_capability('finance.ap.write'))
);

grant select,insert on public.purchase_payments to authenticated;

create or replace function private.refresh_purchase_invoice_payment_status(p_invoice_id uuid)
returns void
language plpgsql security definer set search_path=''
as $$
declare
  v_paid numeric;
  v_total numeric;
begin
  select total_amount into v_total
  from public.purchase_invoices where id=p_invoice_id;

  select coalesce(sum(amount),0) into v_paid
  from public.purchase_payments where purchase_invoice_id=p_invoice_id;

  if v_paid>v_total then
    raise exception 'Payments exceed invoice total';
  end if;

  update public.purchase_invoices
  set paid_amount=v_paid,
      status=case
        when status='void' then 'void'
        when v_paid=0 then 'open'
        when v_paid<v_total then 'partially_paid'
        else 'paid'
      end,
      updated_at=now()
  where id=p_invoice_id;
end;
$$;

revoke execute on function private.refresh_purchase_invoice_payment_status(uuid)
  from public,anon,authenticated;

create or replace function private.guard_purchase_payment()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_invoice public.purchase_invoices%rowtype;
  v_existing numeric;
begin
  select * into v_invoice from public.purchase_invoices
  where id=new.purchase_invoice_id;

  if not found then raise exception 'Purchase invoice not found'; end if;
  if v_invoice.status in ('paid','void') then raise exception 'Invoice is not payable'; end if;
  if new.brand_id<>v_invoice.brand_id then raise exception 'Payment brand mismatch'; end if;

  select coalesce(sum(amount),0) into v_existing
  from public.purchase_payments
  where purchase_invoice_id=new.purchase_invoice_id
    and id<>coalesce(new.id,gen_random_uuid());

  if v_existing+new.amount>v_invoice.total_amount then
    raise exception 'Payment exceeds invoice outstanding amount';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_purchase_payment()
  from public,anon,authenticated;

create trigger trg_guard_purchase_payment
before insert on public.purchase_payments
for each row execute function private.guard_purchase_payment();

create or replace function private.refresh_purchase_payment_after_insert()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  perform private.refresh_purchase_invoice_payment_status(new.purchase_invoice_id);

  perform private.write_audit_log(
    new.brand_id,null,'purchase_payment',new.id,'created',
    auth.uid(),null,to_jsonb(new),new.notes,
    jsonb_build_object('purchase_invoice_id',new.purchase_invoice_id)
  );

  return new;
end;
$$;

revoke execute on function private.refresh_purchase_payment_after_insert()
  from public,anon,authenticated;

create trigger trg_refresh_purchase_payment_after_insert
after insert on public.purchase_payments
for each row execute function private.refresh_purchase_payment_after_insert();

create or replace function private.create_purchase_invoice_from_po(
  p_order_id uuid,
  p_invoice_no text,
  p_invoice_date date,
  p_due_date date,
  p_tax_amount numeric default 0,
  p_other_amount numeric default 0,
  p_notes text default null
)
returns public.purchase_invoices
language plpgsql security definer set search_path=''
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_invoice public.purchase_invoices%rowtype;
begin
  if not private.has_capability('finance.ap.write') then
    raise exception 'Accounts payable permission required';
  end if;

  select * into v_po from public.purchase_orders where id=p_order_id;
  if not found then raise exception 'Purchase order not found'; end if;
  if not private.same_brand(v_po.brand_id) then raise exception 'Purchase order is outside your brand'; end if;
  if v_po.status not in ('issued','partially_received','received','closed') then
    raise exception 'Purchase order is not eligible for invoicing';
  end if;

  insert into public.purchase_invoices(
    brand_id,outlet_id,supplier_id,purchase_order_id,invoice_no,
    invoice_date,due_date,status,subtotal,tax_amount,other_amount,notes,created_by
  ) values (
    v_po.brand_id,v_po.outlet_id,v_po.supplier_id,v_po.id,p_invoice_no,
    coalesce(p_invoice_date,current_date),p_due_date,'open',v_po.subtotal,
    coalesce(p_tax_amount,0),coalesce(p_other_amount,0),p_notes,auth.uid()
  )
  returning * into v_invoice;

  perform private.write_audit_log(
    v_invoice.brand_id,v_invoice.outlet_id,'purchase_invoice',v_invoice.id,'created',
    auth.uid(),null,to_jsonb(v_invoice),p_notes,
    jsonb_build_object('purchase_order_id',v_po.id)
  );

  return v_invoice;
end;
$$;

revoke execute on function private.create_purchase_invoice_from_po(uuid,text,date,date,numeric,numeric,text)
  from public,anon;
grant execute on function private.create_purchase_invoice_from_po(uuid,text,date,date,numeric,numeric,text)
  to authenticated;

create or replace function public.create_purchase_invoice_from_po(
  p_order_id uuid,
  p_invoice_no text,
  p_invoice_date date default current_date,
  p_due_date date default null,
  p_tax_amount numeric default 0,
  p_other_amount numeric default 0,
  p_notes text default null
)
returns public.purchase_invoices
language sql security invoker set search_path=''
as $$
  select private.create_purchase_invoice_from_po(
    p_order_id,p_invoice_no,p_invoice_date,p_due_date,
    p_tax_amount,p_other_amount,p_notes
  );
$$;

revoke execute on function public.create_purchase_invoice_from_po(uuid,text,date,date,numeric,numeric,text)
  from public,anon;
grant execute on function public.create_purchase_invoice_from_po(uuid,text,date,date,numeric,numeric,text)
  to authenticated;

create or replace view public.accounts_payable_aging
with (security_invoker=true)
as
select
  pi.brand_id,
  pi.outlet_id,
  pi.id as purchase_invoice_id,
  pi.supplier_id,
  s.name as supplier_name,
  pi.invoice_no,
  pi.invoice_date,
  pi.due_date,
  pi.status,
  pi.total_amount,
  pi.paid_amount,
  greatest(pi.total_amount-pi.paid_amount,0) as outstanding_amount,
  case
    when pi.status='paid' then 0
    when pi.due_date is null then 0
    else greatest(current_date-pi.due_date,0)
  end as days_overdue,
  case
    when pi.status='paid' then 'PAID'
    when pi.due_date is null or pi.due_date>=current_date then 'CURRENT'
    when current_date-pi.due_date<=30 then '1-30'
    when current_date-pi.due_date<=60 then '31-60'
    when current_date-pi.due_date<=90 then '61-90'
    else '90+'
  end as aging_bucket
from public.purchase_invoices pi
join public.suppliers s on s.id=pi.supplier_id
where pi.status<>'void';

grant select on public.accounts_payable_aging to authenticated;

create or replace view public.purchase_order_receipt_status
with (security_invoker=true)
as
select
  po.brand_id,
  po.outlet_id,
  po.id as purchase_order_id,
  po.po_no,
  po.supplier_id,
  s.name as supplier_name,
  po.order_date,
  po.expected_date,
  po.status,
  po.subtotal,
  coalesce(sum(poi.ordered_qty),0) as ordered_qty,
  coalesce((
    select sum(gri.qty_received)
    from public.goods_receipt_items gri
    join public.goods_receipts gr on gr.id=gri.goods_receipt_id
    where gr.purchase_order_id=po.id and gr.status='posted'
  ),0) as received_qty
from public.purchase_orders po
join public.suppliers s on s.id=po.supplier_id
left join public.purchase_order_items poi on poi.purchase_order_id=po.id
group by po.id,s.name;

grant select on public.purchase_order_receipt_status to authenticated;

create or replace view public.supplier_spend_monthly
with (security_invoker=true)
as
select
  pi.brand_id,
  pi.supplier_id,
  s.name as supplier_name,
  date_trunc('month',pi.invoice_date)::date as month,
  sum(pi.total_amount) as invoiced_amount,
  sum(pi.paid_amount) as paid_amount,
  sum(greatest(pi.total_amount-pi.paid_amount,0)) as outstanding_amount
from public.purchase_invoices pi
join public.suppliers s on s.id=pi.supplier_id
where pi.status<>'void'
group by pi.brand_id,pi.supplier_id,s.name,date_trunc('month',pi.invoice_date);

grant select on public.supplier_spend_monthly to authenticated;

comment on table public.purchase_orders is 'Issued supplier commitments created from approved Purchase Requests.';
comment on table public.goods_receipts is 'Draft/post receipt header. Posting creates idempotent inventory movements.';
comment on table public.purchase_invoices is 'Supplier invoice/AP header linked to Purchase Order.';
comment on table public.purchase_payments is 'Supplier invoice payment events; trigger maintains paid/outstanding status.';

commit;
