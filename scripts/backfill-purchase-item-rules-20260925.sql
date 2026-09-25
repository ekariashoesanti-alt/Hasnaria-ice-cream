-- Hasnaria Purchase mapping backfill — 2026-09-25
-- Idempotent data/config backfill. No schema changes.
-- Purpose: resolve high-confidence Purchase aliases/expenses found during Purchase ↔ Finance reconciliation.

with inventory_map(source_name, normalized_source_name, inventory_name, notes) as (
  values
    ('TOPOKKI 10 KG / 10KG','topokki10kg','TOPOKKI','High-confidence alias to TOPOKKI master'),
    ('TOPOKKI 5KG','topokki5kg','TOPOKKI','High-confidence alias to TOPOKKI master'),
    ('TOPOKKI 2','topokki2','TOPOKKI','High-confidence alias to TOPOKKI master'),
    ('BUMBU TOMYAM 10','bumbutomyam10','BUMBU TOMYUM','High-confidence alias to BUMBU TOMYUM master'),
    ('KERTAS CONE 500','kertascone500','KERTAS CONE','High-confidence packaging alias'),
    ('MANGKOK 1000','mangkok1000','MANGKOK','High-confidence packaging alias to MANGKOK'),
    ('#Ice cream cokelat','icecreamcokelat','ICE CREAM POTONG COKELAT','High-confidence ice cream alias'),
    ('#Ice Cream Durian','icecreamdurian','ICE CREAM POTONG DURIAN','High-confidence ice cream alias'),
    ('#Ice Cream Es Teller','icecreamesteller','ICE CREAM POTONG TELLER','High-confidence ice cream alias'),
    ('#ODENG BESAR','odengbesar','ODENG','High-confidence ODENG alias'),
    ('#Roti tawar original','rotitawaroriginal','ROTI TAWAR ORI','High-confidence bread alias'),
    ('CRAB STICK','crabstick','CRAB STIK','Spelling alias to CRAB STIK'),
    ('Kue beras topokki','kueberastopokki','TOPOKKI','High-confidence TOPOKKI alias'),
    ('SALMON STICK','salmonstick','SALMON STIK','Spelling alias to SALMON STIK'),
    ('#BOX ES POTONG','boxespotong','KOTAK ES POTONG','High-confidence packaging alias'),
    ('#CHOCOLATE DELFI','chocolatedelfi','COKELAT DELFI','High-confidence alias to COKELAT DELFI'),
    ('KUAH ODENG','kuahodeng','BUMBU ODENG','High-confidence alias to BUMBU ODENG'),
    ('KUAH TOMYAM','kuahtomyam','BUMBU TOMYUM','High-confidence alias to BUMBU TOMYUM')
), resolved as (
  select
    im.source_name,
    im.normalized_source_name,
    ii.brand_id,
    ii.id as inventory_item_id,
    im.notes
  from inventory_map im
  join public.inventory_items ii
    on ii.item_name = im.inventory_name
  join public.brands b on b.id = ii.brand_id
  where b.name = 'Hasnaria'
)
insert into public.purchase_item_rules(
  id,brand_id,source_name,normalized_source_name,rule_type,inventory_item_id,
  expense_category,qty_multiplier,notes,active,created_at,updated_at
)
select
  gen_random_uuid(),brand_id,source_name,normalized_source_name,'inventory_alias',inventory_item_id,
  null,null,notes || '; reconciled 2026-09-25',true,now(),now()
from resolved
on conflict (brand_id,normalized_source_name) do update set
  source_name=excluded.source_name,
  rule_type=excluded.rule_type,
  inventory_item_id=excluded.inventory_item_id,
  expense_category=null,
  notes=excluded.notes,
  active=true,
  updated_at=now();

with expense_map(source_name, normalized_source_name, expense_category, notes) as (
  values
    ('PAKET DATA INTERNET','paketdatainternet','internet_telecom','Clear telecom operating expense'),
    ('PLASTIK SAMPAH','plastiksampah','cleaning_supplies','Clear cleaning consumable')
), brand as (
  select id as brand_id from public.brands where name='Hasnaria' limit 1
)
insert into public.purchase_item_rules(
  id,brand_id,source_name,normalized_source_name,rule_type,inventory_item_id,
  expense_category,qty_multiplier,notes,active,created_at,updated_at
)
select
  gen_random_uuid(),brand.brand_id,e.source_name,e.normalized_source_name,'expense_candidate',null,
  e.expense_category,null,e.notes || '; reconciled 2026-09-25',true,now(),now()
from expense_map e cross join brand
on conflict (brand_id,normalized_source_name) do update set
  source_name=excluded.source_name,
  rule_type=excluded.rule_type,
  inventory_item_id=null,
  expense_category=excluded.expense_category,
  notes=excluded.notes,
  active=true,
  updated_at=now();
