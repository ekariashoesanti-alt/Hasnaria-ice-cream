-- Canonical inventory movement ledger.
-- Existing inventory reconciliation remains untouched; this migration backfills and keeps
-- purchase/sales/opname events synchronized into an auditable ledger.

begin;

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete set null,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  movement_date date not null default current_date,
  movement_type text not null,
  qty_delta numeric not null,
  unit_cost numeric,
  reference_type text,
  reference_id uuid,
  source_key text,
  system_generated boolean not null default false,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_movements_type_check check (
    movement_type in (
      'BASELINE','PURCHASE_RECEIPT','SALE_CONSUMPTION','WASTE',
      'ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT','OPNAME_CORRECTION'
    )
  ),
  constraint inventory_movements_qty_nonzero check (
    qty_delta <> 0 or movement_type in ('BASELINE','OPNAME_CORRECTION')
  ),
  constraint inventory_movements_unit_cost_nonnegative check (
    unit_cost is null or unit_cost >= 0
  )
);

create unique index if not exists inventory_movements_brand_source_uidx
  on public.inventory_movements(brand_id, source_key)
  where source_key is not null and btrim(source_key) <> '';

create index if not exists inventory_movements_item_date_idx
  on public.inventory_movements(inventory_item_id, movement_date, created_at);

create index if not exists inventory_movements_brand_date_idx
  on public.inventory_movements(brand_id, movement_date, created_at);

create index if not exists inventory_movements_outlet_idx
  on public.inventory_movements(outlet_id);

create index if not exists inventory_movements_created_by_idx
  on public.inventory_movements(created_by);

alter table public.inventory_movements enable row level security;

drop policy if exists inventory_movements_read_same_brand on public.inventory_movements;
create policy inventory_movements_read_same_brand
on public.inventory_movements
for select to authenticated
using ((select private.same_brand(inventory_movements.brand_id)));

revoke insert, update, delete on public.inventory_movements from authenticated;
grant select on public.inventory_movements to authenticated;

create or replace function private.sync_inventory_baseline(p_inventory_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_brand_id uuid;
  v_opening_qty numeric;
  v_opening_date date;
  v_baseline_qty numeric;
  v_baseline_date date;
begin
  select brand_id, coalesce(opening_qty, 0), opening_date
    into v_brand_id, v_opening_qty, v_opening_date
  from public.inventory_items
  where id = p_inventory_item_id;

  if v_brand_id is null then
    return;
  end if;

  select o.physical_qty, o.opname_date
    into v_baseline_qty, v_baseline_date
  from public.inventory_stock_opname o
  where o.inventory_item_id = p_inventory_item_id
    and o.brand_id = v_brand_id
    and o.opname_date <= current_date
  order by o.opname_date desc, o.created_at desc
  limit 1;

  if v_baseline_date is null then
    v_baseline_qty := v_opening_qty;
    v_baseline_date := coalesce(v_opening_date, current_date);
  end if;

  insert into public.inventory_movements(
    brand_id, inventory_item_id, movement_date, movement_type,
    qty_delta, reference_type, source_key, system_generated, notes
  ) values (
    v_brand_id, p_inventory_item_id, v_baseline_date, 'BASELINE',
    coalesce(v_baseline_qty, 0), 'inventory_item',
    'BASELINE:' || p_inventory_item_id::text, true,
    'Canonical baseline; latest physical opname overrides opening quantity'
  )
  on conflict (brand_id, source_key) where source_key is not null and btrim(source_key) <> ''
  do update set
    movement_date = excluded.movement_date,
    qty_delta = excluded.qty_delta,
    notes = excluded.notes;
end;
$$;

revoke execute on function private.sync_inventory_baseline(uuid)
  from public, anon, authenticated;

create or replace function private.sync_purchase_log_inventory_movement(p_log_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.inventory_purchase_log%rowtype;
begin
  delete from public.inventory_movements
  where reference_type = 'inventory_purchase_log'
    and reference_id = p_log_id
    and system_generated;

  select * into v_row
  from public.inventory_purchase_log
  where id = p_log_id;

  if not found then
    return;
  end if;

  perform private.sync_inventory_baseline(v_row.inventory_item_id);

  insert into public.inventory_movements(
    brand_id, inventory_item_id, movement_date, movement_type,
    qty_delta, reference_type, reference_id, source_key,
    system_generated, notes
  ) values (
    v_row.brand_id, v_row.inventory_item_id, v_row.purchase_date,
    'PURCHASE_RECEIPT', v_row.qty,
    'inventory_purchase_log', v_row.id,
    'LEGACY_PURCHASE:' || v_row.id::text,
    true, v_row.notes
  );
end;
$$;

revoke execute on function private.sync_purchase_log_inventory_movement(uuid)
  from public, anon, authenticated;

create or replace function private.sync_sale_item_inventory_movement(p_sale_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_item public.sale_items%rowtype;
  v_brand_id uuid;
  v_sold_at date;
  v_recipe record;
begin
  delete from public.inventory_movements
  where reference_type = 'sale_item'
    and reference_id = p_sale_item_id
    and system_generated;

  select * into v_sale_item
  from public.sale_items
  where id = p_sale_item_id;

  if not found or v_sale_item.product_id is null then
    return;
  end if;

  select s.brand_id, s.sold_at
    into v_brand_id, v_sold_at
  from public.sales s
  where s.id = v_sale_item.sale_id;

  if v_brand_id is null then
    return;
  end if;

  for v_recipe in
    select r.inventory_item_id, r.qty_per_sale
    from public.inventory_recipe_components r
    where r.brand_id = v_brand_id
      and r.product_id = v_sale_item.product_id
      and r.active
  loop
    perform private.sync_inventory_baseline(v_recipe.inventory_item_id);

    insert into public.inventory_movements(
      brand_id, inventory_item_id, movement_date, movement_type,
      qty_delta, reference_type, reference_id, source_key,
      system_generated, notes
    ) values (
      v_brand_id, v_recipe.inventory_item_id, v_sold_at,
      'SALE_CONSUMPTION',
      -(v_sale_item.qty::numeric * v_recipe.qty_per_sale),
      'sale_item', v_sale_item.id,
      'SALE_ITEM:' || v_sale_item.id::text || ':' || v_recipe.inventory_item_id::text,
      true, v_sale_item.item_name
    )
    on conflict (brand_id, source_key) where source_key is not null and btrim(source_key) <> ''
    do update set
      movement_date = excluded.movement_date,
      qty_delta = excluded.qty_delta,
      notes = excluded.notes;
  end loop;
end;
$$;

revoke execute on function private.sync_sale_item_inventory_movement(uuid)
  from public, anon, authenticated;

create or replace function private.sync_opname_inventory_movement(p_opname_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.inventory_stock_opname%rowtype;
begin
  delete from public.inventory_movements
  where reference_type = 'inventory_stock_opname'
    and reference_id = p_opname_id
    and system_generated;

  select * into v_row
  from public.inventory_stock_opname
  where id = p_opname_id;

  if not found then
    return;
  end if;

  if v_row.opname_date > current_date then
    raise exception 'Future-dated stock opname is not allowed';
  end if;

  insert into public.inventory_movements(
    brand_id, inventory_item_id, movement_date, movement_type,
    qty_delta, reference_type, reference_id, source_key,
    system_generated, notes
  ) values (
    v_row.brand_id, v_row.inventory_item_id, v_row.opname_date,
    'OPNAME_CORRECTION', v_row.variance,
    'inventory_stock_opname', v_row.id,
    'OPNAME:' || v_row.id::text,
    true, v_row.notes
  )
  on conflict (brand_id, source_key) where source_key is not null and btrim(source_key) <> ''
  do update set
    movement_date = excluded.movement_date,
    qty_delta = excluded.qty_delta,
    notes = excluded.notes;

  perform private.sync_inventory_baseline(v_row.inventory_item_id);
end;
$$;

revoke execute on function private.sync_opname_inventory_movement(uuid)
  from public, anon, authenticated;

create or replace function private.inventory_purchase_log_movement_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.inventory_movements
    where reference_type = 'inventory_purchase_log'
      and reference_id = old.id
      and system_generated;
    return old;
  end if;

  perform private.sync_purchase_log_inventory_movement(new.id);
  return new;
end;
$$;

revoke execute on function private.inventory_purchase_log_movement_trigger()
  from public, anon, authenticated;

drop trigger if exists trg_inventory_purchase_log_movement on public.inventory_purchase_log;
create trigger trg_inventory_purchase_log_movement
after insert or update or delete on public.inventory_purchase_log
for each row execute function private.inventory_purchase_log_movement_trigger();

create or replace function private.sale_item_inventory_movement_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.inventory_movements
    where reference_type = 'sale_item'
      and reference_id = old.id
      and system_generated;
    return old;
  end if;

  perform private.sync_sale_item_inventory_movement(new.id);
  return new;
end;
$$;

revoke execute on function private.sale_item_inventory_movement_trigger()
  from public, anon, authenticated;

drop trigger if exists trg_sale_item_inventory_movement on public.sale_items;
create trigger trg_sale_item_inventory_movement
after insert or update on public.sale_items
for each row execute function private.sale_item_inventory_movement_trigger();

drop trigger if exists trg_sale_item_inventory_movement_delete on public.sale_items;
create trigger trg_sale_item_inventory_movement_delete
after delete on public.sale_items
for each row execute function private.sale_item_inventory_movement_trigger();

create or replace function private.opname_inventory_movement_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_id uuid;
begin
  if tg_op = 'DELETE' then
    v_item_id := old.inventory_item_id;
    delete from public.inventory_movements
    where reference_type = 'inventory_stock_opname'
      and reference_id = old.id
      and system_generated;
    perform private.sync_inventory_baseline(v_item_id);
    return old;
  end if;

  if new.opname_date > current_date then
    raise exception 'Future-dated stock opname is not allowed';
  end if;

  perform private.sync_opname_inventory_movement(new.id);

  if tg_op = 'UPDATE' and old.inventory_item_id is distinct from new.inventory_item_id then
    perform private.sync_inventory_baseline(old.inventory_item_id);
  end if;

  return new;
end;
$$;

revoke execute on function private.opname_inventory_movement_trigger()
  from public, anon, authenticated;

drop trigger if exists trg_opname_inventory_movement on public.inventory_stock_opname;
create trigger trg_opname_inventory_movement
after insert or update or delete on public.inventory_stock_opname
for each row execute function private.opname_inventory_movement_trigger();

create or replace function private.recipe_inventory_movement_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_sale_item_id uuid;
begin
  v_product_id := coalesce(new.product_id, old.product_id);

  for v_sale_item_id in
    select si.id
    from public.sale_items si
    where si.product_id = v_product_id
  loop
    perform private.sync_sale_item_inventory_movement(v_sale_item_id);
  end loop;

  if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
    for v_sale_item_id in
      select si.id
      from public.sale_items si
      where si.product_id = old.product_id
    loop
      perform private.sync_sale_item_inventory_movement(v_sale_item_id);
    end loop;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function private.recipe_inventory_movement_trigger()
  from public, anon, authenticated;

drop trigger if exists trg_recipe_inventory_movement on public.inventory_recipe_components;
create trigger trg_recipe_inventory_movement
after insert or update or delete on public.inventory_recipe_components
for each row execute function private.recipe_inventory_movement_trigger();

-- Seed current baselines.
insert into public.inventory_movements(
  brand_id, inventory_item_id, movement_date, movement_type,
  qty_delta, reference_type, source_key, system_generated, notes
)
select
  i.brand_id,
  i.id,
  coalesce(lo.opname_date, i.opening_date, current_date),
  'BASELINE',
  coalesce(lo.physical_qty, i.opening_qty, 0),
  'inventory_item',
  'BASELINE:' || i.id::text,
  true,
  'Initial canonical ledger baseline'
from public.inventory_items i
left join lateral (
  select o.opname_date, o.physical_qty
  from public.inventory_stock_opname o
  where o.inventory_item_id = i.id
    and o.brand_id = i.brand_id
    and o.opname_date <= current_date
  order by o.opname_date desc, o.created_at desc
  limit 1
) lo on true
on conflict (brand_id, source_key) where source_key is not null and btrim(source_key) <> ''
do update set
  movement_date = excluded.movement_date,
  qty_delta = excluded.qty_delta,
  notes = excluded.notes;

-- Backfill purchase log events.
insert into public.inventory_movements(
  brand_id, inventory_item_id, movement_date, movement_type,
  qty_delta, reference_type, reference_id, source_key,
  system_generated, notes
)
select
  l.brand_id, l.inventory_item_id, l.purchase_date,
  'PURCHASE_RECEIPT', l.qty,
  'inventory_purchase_log', l.id,
  'LEGACY_PURCHASE:' || l.id::text,
  true, l.notes
from public.inventory_purchase_log l
on conflict (brand_id, source_key) where source_key is not null and btrim(source_key) <> ''
do update set
  movement_date = excluded.movement_date,
  qty_delta = excluded.qty_delta,
  notes = excluded.notes;

-- Backfill normalized sales consumption from the current explicit recipe map.
insert into public.inventory_movements(
  brand_id, inventory_item_id, movement_date, movement_type,
  qty_delta, reference_type, reference_id, source_key,
  system_generated, notes
)
select
  s.brand_id,
  r.inventory_item_id,
  s.sold_at,
  'SALE_CONSUMPTION',
  -(si.qty::numeric * r.qty_per_sale),
  'sale_item',
  si.id,
  'SALE_ITEM:' || si.id::text || ':' || r.inventory_item_id::text,
  true,
  si.item_name
from public.sale_items si
join public.sales s on s.id = si.sale_id
join public.inventory_recipe_components r
  on r.brand_id = s.brand_id
 and r.product_id = si.product_id
 and r.active
on conflict (brand_id, source_key) where source_key is not null and btrim(source_key) <> ''
do update set
  movement_date = excluded.movement_date,
  qty_delta = excluded.qty_delta,
  notes = excluded.notes;

-- Mirror existing physical count audit events.
insert into public.inventory_movements(
  brand_id, inventory_item_id, movement_date, movement_type,
  qty_delta, reference_type, reference_id, source_key,
  system_generated, notes
)
select
  o.brand_id, o.inventory_item_id, o.opname_date,
  'OPNAME_CORRECTION', o.variance,
  'inventory_stock_opname', o.id,
  'OPNAME:' || o.id::text,
  true, o.notes
from public.inventory_stock_opname o
where o.opname_date <= current_date
on conflict (brand_id, source_key) where source_key is not null and btrim(source_key) <> ''
do update set
  movement_date = excluded.movement_date,
  qty_delta = excluded.qty_delta,
  notes = excluded.notes;

create or replace view public.inventory_ledger_balance
with (security_invoker = true)
as
with latest_opname as (
  select distinct on (o.brand_id, o.inventory_item_id)
    o.brand_id,
    o.inventory_item_id,
    o.opname_date,
    o.physical_qty
  from public.inventory_stock_opname o
  where o.opname_date <= current_date
  order by o.brand_id, o.inventory_item_id, o.opname_date desc, o.created_at desc
),
base as (
  select
    i.brand_id,
    i.id as inventory_item_id,
    i.item_name,
    i.category,
    coalesce(i.unit, 'pcs') as unit,
    coalesce(i.min_qty, 0) as min_qty,
    coalesce(i.order_qty, 0) as order_qty,
    coalesce(lo.opname_date, current_date) as baseline_date,
    coalesce(lo.physical_qty, i.opening_qty, 0) as baseline_qty,
    lo.opname_date is not null as tracking_active
  from public.inventory_items i
  left join latest_opname lo
    on lo.brand_id = i.brand_id
   and lo.inventory_item_id = i.id
),
movement_totals as (
  select
    b.inventory_item_id,
    case when b.tracking_active then
      coalesce(sum(m.qty_delta) filter (
        where m.movement_type <> 'BASELINE'
          and m.movement_type <> 'OPNAME_CORRECTION'
          and m.movement_date > b.baseline_date
          and m.movement_date <= current_date
      ), 0)
    else 0 end as net_movement
  from base b
  left join public.inventory_movements m
    on m.brand_id = b.brand_id
   and m.inventory_item_id = b.inventory_item_id
  group by b.inventory_item_id, b.tracking_active
)
select
  b.brand_id,
  b.inventory_item_id,
  b.item_name,
  b.category,
  b.unit,
  b.min_qty,
  b.order_qty,
  b.baseline_date,
  b.baseline_qty,
  coalesce(mt.net_movement, 0) as net_movement,
  b.baseline_qty + coalesce(mt.net_movement, 0) as ledger_qty,
  b.tracking_active,
  case
    when not b.tracking_active then 'untracked'
    when b.baseline_qty + coalesce(mt.net_movement, 0) <= 0 then 'critical'
    when b.min_qty > 0
      and b.baseline_qty + coalesce(mt.net_movement, 0) < b.min_qty then 'order'
    else 'ok'
  end as status
from base b
left join movement_totals mt
  on mt.inventory_item_id = b.inventory_item_id;

grant select on public.inventory_ledger_balance to authenticated;

create or replace function private.inventory_ledger_qty_as_of(
  p_inventory_item_id uuid,
  p_date date
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with latest_opname as (
    select o.opname_date, o.physical_qty
    from public.inventory_stock_opname o
    where o.inventory_item_id = p_inventory_item_id
      and o.opname_date <= p_date
    order by o.opname_date desc, o.created_at desc
    limit 1
  ),
  base as (
    select
      coalesce((select opname_date from latest_opname), p_date) as baseline_date,
      coalesce(
        (select physical_qty from latest_opname),
        i.opening_qty,
        0
      ) as baseline_qty,
      exists(select 1 from latest_opname) as tracking_active
    from public.inventory_items i
    where i.id = p_inventory_item_id
  )
  select
    case when b.tracking_active then
      b.baseline_qty + coalesce((
        select sum(m.qty_delta)
        from public.inventory_movements m
        where m.inventory_item_id = p_inventory_item_id
          and m.movement_type not in ('BASELINE','OPNAME_CORRECTION')
          and m.movement_date > b.baseline_date
          and m.movement_date <= p_date
      ), 0)
    else b.baseline_qty end
  from base b;
$$;

revoke execute on function private.inventory_ledger_qty_as_of(uuid,date)
  from public, anon, authenticated;

create or replace function private.post_manual_inventory_movement(
  p_inventory_item_id uuid,
  p_outlet_id uuid,
  p_movement_type text,
  p_qty_delta numeric,
  p_movement_date date,
  p_unit_cost numeric,
  p_notes text,
  p_source_key text
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.inventory_items%rowtype;
  v_row public.inventory_movements%rowtype;
  v_date date := coalesce(p_movement_date, current_date);
  v_current_qty numeric;
  v_last_opname date;
begin
  if not private.can_stock_write() then
    raise exception 'Stock write permission required';
  end if;

  if upper(btrim(coalesce(p_movement_type,''))) not in (
    'WASTE','ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT'
  ) then
    raise exception 'Unsupported manual inventory movement type';
  end if;

  if p_qty_delta is null or p_qty_delta = 0 then
    raise exception 'Quantity delta must be non-zero';
  end if;

  if upper(btrim(p_movement_type)) = 'WASTE' and p_qty_delta >= 0 then
    raise exception 'Waste must use a negative quantity';
  end if;

  if upper(btrim(p_movement_type)) = 'TRANSFER_IN' and p_qty_delta <= 0 then
    raise exception 'Transfer in must use a positive quantity';
  end if;

  if upper(btrim(p_movement_type)) = 'TRANSFER_OUT' and p_qty_delta >= 0 then
    raise exception 'Transfer out must use a negative quantity';
  end if;

  if v_date > current_date then
    raise exception 'Future-dated manual inventory movement is not allowed';
  end if;

  select * into v_item
  from public.inventory_items
  where id = p_inventory_item_id;

  if not found or not private.same_brand(v_item.brand_id) then
    raise exception 'Inventory item not found in your brand';
  end if;

  if p_outlet_id is not null
     and not exists (
       select 1 from public.outlets o
       where o.id = p_outlet_id
         and o.brand_id = v_item.brand_id
         and o.active
     ) then
    raise exception 'Outlet is invalid or inactive for this brand';
  end if;

  select max(opname_date) into v_last_opname
  from public.inventory_stock_opname
  where inventory_item_id = p_inventory_item_id
    and opname_date <= v_date;

  if v_last_opname is null then
    raise exception 'Physical stock opname is required before manual stock movements';
  end if;

  if v_date <= v_last_opname then
    raise exception 'Movement date must be after the latest stock opname date';
  end if;

  v_current_qty := private.inventory_ledger_qty_as_of(p_inventory_item_id, v_date);

  if p_qty_delta < 0 and v_current_qty + p_qty_delta < 0 then
    raise exception 'Movement would create negative inventory';
  end if;

  insert into public.inventory_movements(
    brand_id, outlet_id, inventory_item_id, movement_date, movement_type,
    qty_delta, unit_cost, reference_type, source_key,
    system_generated, notes, created_by
  ) values (
    v_item.brand_id, p_outlet_id, p_inventory_item_id, v_date,
    upper(btrim(p_movement_type)), p_qty_delta, p_unit_cost,
    'manual', nullif(btrim(coalesce(p_source_key,'')), ''),
    false, p_notes, auth.uid()
  )
  returning * into v_row;

  perform private.write_audit_log(
    v_item.brand_id, p_outlet_id, 'inventory_movement', v_row.id,
    'created', auth.uid(), null, to_jsonb(v_row), p_notes,
    jsonb_build_object('movement_type', v_row.movement_type)
  );

  return v_row;
end;
$$;

revoke execute on function private.post_manual_inventory_movement(uuid,uuid,text,numeric,date,numeric,text,text)
  from public, anon;
grant execute on function private.post_manual_inventory_movement(uuid,uuid,text,numeric,date,numeric,text,text)
  to authenticated;

create or replace function public.post_inventory_movement(
  p_inventory_item_id uuid,
  p_outlet_id uuid,
  p_movement_type text,
  p_qty_delta numeric,
  p_movement_date date default current_date,
  p_unit_cost numeric default null,
  p_notes text default null,
  p_source_key text default null
)
returns public.inventory_movements
language sql
security invoker
set search_path = ''
as $$
  select private.post_manual_inventory_movement(
    p_inventory_item_id, p_outlet_id, p_movement_type, p_qty_delta,
    p_movement_date, p_unit_cost, p_notes, p_source_key
  );
$$;

revoke execute on function public.post_inventory_movement(uuid,uuid,text,numeric,date,numeric,text,text)
  from public, anon;
grant execute on function public.post_inventory_movement(uuid,uuid,text,numeric,date,numeric,text,text)
  to authenticated;

comment on table public.inventory_movements is
  'Canonical append-oriented inventory event ledger. System-generated sales/purchase/opname entries are synchronized from source transactions; manual writes use controlled RPC.';
comment on view public.inventory_ledger_balance is
  'Canonical theoretical inventory balance using the latest physical opname baseline plus post-baseline movements.';

commit;
