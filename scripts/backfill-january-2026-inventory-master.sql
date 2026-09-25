-- Hasnaria January 2026 inventory master backfill
-- Derived only from verified rows in RENCANA BELANJA JANUARI.xlsx.
-- Idempotent data/config backfill; no schema changes.

with x(item_name,category) as (
  values
    ('ICE CREAM','ICE CREAM'),
    ('MIE KOREA','MAKANAN'),
    ('SIRUP COCOPANDAN','MINUMAN'),
    ('SIRUP MELON','MINUMAN'),
    ('SIRUP STRAWBERRY','MINUMAN'),
    ('PLASTIK 1 KG','KEMASAN'),
    ('CUP 8 OZ','KEMASAN'),
    ('CUP 12 OZ','KEMASAN'),
    ('CUP 16 OZ','KEMASAN')
), brand as (
  select id as brand_id from public.brands where name='Hasnaria' limit 1
)
insert into public.inventory_items(
  brand_id,category,item_name,source_period,source_file,unit,opening_date,opening_qty,notes
)
select
  b.brand_id,x.category,x.item_name,date '2026-01-01','RENCANA BELANJA JANUARI.xlsx',
  'purchase_unit',date '2026-01-01',0,
  'Master added from verified January 2026 purchase source; opening qty intentionally 0'
from x cross join brand b
where not exists (
  select 1 from public.inventory_items i
  where i.brand_id=b.brand_id and upper(trim(i.item_name))=upper(trim(x.item_name))
);

with m(source_name,normalized_source_name,inventory_name) as (
  values
    ('TTEOKBOKKI','tteokbokki','TOPOKKI'),
    ('CONE REGULAR','coneregular','CONE')
), r as (
  select m.*,i.id as inventory_item_id,i.brand_id
  from m
  join public.inventory_items i on i.item_name=m.inventory_name
  join public.brands b on b.id=i.brand_id and b.name='Hasnaria'
)
insert into public.purchase_item_rules(
  id,brand_id,source_name,normalized_source_name,rule_type,inventory_item_id,
  expense_category,qty_multiplier,notes,active,created_at,updated_at
)
select
  gen_random_uuid(),brand_id,source_name,normalized_source_name,'inventory_alias',inventory_item_id,
  null,null,'High-confidence January 2026 alias; reconciled 2026-09-25',true,now(),now()
from r
on conflict (brand_id,normalized_source_name) do update set
  source_name=excluded.source_name,
  rule_type=excluded.rule_type,
  inventory_item_id=excluded.inventory_item_id,
  expense_category=null,
  notes=excluded.notes,
  active=true,
  updated_at=now();
