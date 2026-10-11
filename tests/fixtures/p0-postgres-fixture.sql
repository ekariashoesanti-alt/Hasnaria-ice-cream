-- Synthetic Hasnaria P0 fixture for a disposable PostgreSQL 17 CI service.
-- Never run against the Hasnaria production database.
create schema private;
create schema auth;
create or replace function auth.uid() returns uuid language sql stable
as $fixture$select '00000000-0000-0000-0000-000000009999'::uuid$fixture$;
create or replace function private.owner_stock_review_assert_v1()
returns uuid language sql stable
as $fixture$select '00000000-0000-0000-0000-000000000001'::uuid$fixture$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create table public.inventory_items (
 id uuid primary key, brand_id uuid not null, item_name text not null,
 category text, unit text, min_qty numeric, order_qty numeric,
 opening_qty numeric
);
create table public.offline_purchase_history (
 id uuid primary key, brand_id uuid not null, source_period date,
 source_file text not null, row_no integer not null,
 purchase_date date, item_name text, quantity_text text, unit_text text,
 unit_price numeric, total_amount numeric,
 inventory_item_id uuid, canonical_loaded_at timestamptz default now()
);
create table public.inventory_purchase_log (
 id uuid primary key default gen_random_uuid(),
 brand_id uuid not null, inventory_item_id uuid not null,
 purchase_date date not null, qty numeric not null,
 unit text, notes text, unit_cost numeric, total_amount numeric,
 source_history_id uuid, source_file text, source_row_no integer,
 mapping_method text, created_at timestamptz default now()
);
create unique index inventory_purchase_log_source_history_uidx
 on public.inventory_purchase_log(source_history_id)
 where source_history_id is not null;
create table public.inventory_unit_conversions (
 id uuid primary key default gen_random_uuid(),
 brand_id uuid not null, inventory_item_id uuid not null,
 product_id uuid not null default '00000000-0000-0000-0000-000000000901'::uuid,
 status text not null, purchase_unit text not null, sale_unit text not null,
 units_per_purchase_unit numeric, updated_at timestamptz default now()
);
create table private.purchase_stock_reviews (
 id uuid primary key default gen_random_uuid(),
 brand_id uuid not null, source_history_id uuid not null,
 inventory_item_id uuid not null, qty_multiplier numeric,
 source_snapshot jsonb, target_snapshot jsonb, log_snapshot jsonb,
 reason text, reviewed_by uuid, reviewed_at timestamptz default now(),
 reverted_at timestamptz, reverted_by uuid, revert_reason text
);
create table public.purchase_import_evidence (
 id uuid primary key default gen_random_uuid(),
 brand_id uuid not null, source_type text,
 source_period date, source_file text,
 source_record_key text, row_no integer,
 purchase_date date, item_name text,
 quantity numeric,unit_text text,total_amount numeric,source_status text
);
create table public.inventory_stock_opname (
 brand_id uuid not null, inventory_item_id uuid not null,
 opname_date date not null, system_qty numeric, physical_qty numeric,
 variance numeric, created_at timestamptz default now()
);
-- Source tables for exercising the exact manual Stock-view rollback definition.
create table public.sales (
 id uuid primary key, brand_id uuid not null, sold_at date not null
);
create table public.sale_items (
 id uuid primary key, sale_id uuid not null, product_id uuid, qty numeric
);
create table public.inventory_recipe_components (
 brand_id uuid not null, inventory_item_id uuid not null,
 product_id uuid not null, qty_per_sale numeric not null, active boolean not null
);
create table public.inventory_movements (
 id uuid primary key default gen_random_uuid(), brand_id uuid not null,
 inventory_item_id uuid not null, movement_date date not null,
 movement_type text not null, qty_delta numeric not null,
 reference_type text, reference_id uuid
);
create or replace function private.same_brand(uuid) returns boolean language sql
as $$ select true $$;
create or replace function private.has_capability(text) returns boolean language sql
as $$ select true $$;
create or replace function private.can_import_module(text) returns boolean language sql
as $$ select true $$;
create or replace function private.can_stock_write() returns boolean language sql
as $$ select true $$;


-- Mock-only Product and business audit sink for exercising the existing ERP
-- conversion RPC: the real Supabase function writes audit logs but must not
-- create/update/activate recipe BOM from packaging factor verification.
create table public.products (
 id uuid primary key,brand_id uuid not null,name text not null
);
insert into public.products(id,brand_id,name)
values('00000000-0000-0000-0000-000000000901',
       '00000000-0000-0000-0000-000000000001','SYNTHETIC PRODUCT');
create table private.fixture_unit_conversion_audit(
 id bigint generated always as identity primary key,
 action text,entity_id uuid,before_state jsonb,after_state jsonb,
 reason text,details jsonb
);
create or replace function private.write_audit_log(
 p_brand_id uuid,p_outlet_id uuid,p_entity_type text,p_entity_id uuid,
 p_action text,p_actor_id uuid,p_before jsonb,p_after jsonb,
 p_reason text,p_details jsonb)
returns void language plpgsql security definer set search_path=''
as $audit$
begin
 insert into private.fixture_unit_conversion_audit
 (action,entity_id,before_state,after_state,reason,details)
 values(p_action,p_entity_id,p_before,p_after,p_reason,p_details);
end;
$audit$;

-- Stable fixed UUIDs make behavior tests deterministic.
insert into public.inventory_items(id,brand_id,item_name,category,unit,opening_qty)
values
('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001','BAKSO TEST','Bahan','pcs',0),
('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000001','CONES TEST','Kemasan','pcs',0),
('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000001','OLD RECEIPT','Bahan','pcs',0);

insert into public.offline_purchase_history
 (id,brand_id,source_period,source_file,row_no,purchase_date,
  item_name,quantity_text,unit_text,unit_price,total_amount,inventory_item_id)
values
 ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000001',
  date_trunc('month',current_date - interval '1 month')::date,'synthetic.xlsx',1,current_date - 5,
  'PACK UNVERIFIED','2','pack',100,200,'00000000-0000-0000-0000-000000000101'),
 ('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000001',
  date_trunc('month',current_date - interval '1 month')::date,'synthetic.xlsx',2,current_date - 5,
  'SAME UNIT','3','pcs',100,300,'00000000-0000-0000-0000-000000000102'),
 ('00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-000000000001',
  date_trunc('month',current_date - interval '1 month')::date,'synthetic.xlsx',3,current_date - 5,
  'PACK VERIFIED','2','pack',100,200,'00000000-0000-0000-0000-000000000101'),
 ('00000000-0000-0000-0000-000000000204','00000000-0000-0000-0000-000000000001',
  date_trunc('month',current_date - interval '1 month')::date,'synthetic.xlsx',4,current_date - 5,
  'UNKNOWN UNIT','4',null,100,400,'00000000-0000-0000-0000-000000000101'),
 ('00000000-0000-0000-0000-000000000205','00000000-0000-0000-0000-000000000001',
  date_trunc('month',current_date - interval '1 month')::date,'synthetic.xlsx',5,current_date - 5,
  'REVIEWED MISSING UNIT','1',null,100,100,'00000000-0000-0000-0000-000000000101'),
 ('00000000-0000-0000-0000-000000000206','00000000-0000-0000-0000-000000000001',
  date_trunc('month',current_date - interval '1 month')::date,'synthetic.xlsx',6,current_date - 5,
  'ALREADY POSTED','1',null,100,100,'00000000-0000-0000-0000-000000000103');

-- Historical pre-guard entry that must be preserved and never replayed.
insert into public.inventory_purchase_log
 (id,brand_id,inventory_item_id,purchase_date,qty,unit,total_amount,
  source_history_id,source_file,source_row_no)
values
 ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000103',current_date - 5,1,'pack',100,
  '00000000-0000-0000-0000-000000000206','synthetic.xlsx',6),
 ('00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000103',current_date - 9,6,'pcs',99,
  '00000000-0000-0000-0000-000000000299','old-source.xlsx',77);

-- Historic generated receipt movements are preserved exactly in production.
-- Seed a matching pair for the orphan and original linked receipt in CI.
insert into public.inventory_movements
 (brand_id,inventory_item_id,movement_date,movement_type,qty_delta,
  reference_type,reference_id)
values
 ('00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000103',current_date-5,
  'PURCHASE_RECEIPT',1,'inventory_purchase_log',
  '00000000-0000-0000-0000-000000000301'),
 ('00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000103',current_date-9,
  'PURCHASE_RECEIPT',6,'inventory_purchase_log',
  '00000000-0000-0000-0000-000000000302');

create or replace view public.purchase_inventory_bridge
with (security_invoker=true) as
select p.id,p.brand_id,p.source_period,p.canonical_loaded_at,p.purchase_date,p.item_name,p.source_file,p.row_no,
 p.unit_text,p.total_amount,p.inventory_item_id,p.quantity_text::numeric as quantity_numeric,
 coalesce(p.quantity_text::numeric*r.qty_multiplier,p.quantity_text::numeric) as inventory_qty,
 case when r.reviewed_by is not null then 'owner_review'::text else 'exact_name'::text end as mapping_status,
 (p.purchase_date is not null and p.quantity_text::numeric>0) as ready_for_inventory,
 null::text as rule_type
from public.offline_purchase_history p
left join private.purchase_stock_reviews r
  on r.source_history_id=p.id and r.brand_id=p.brand_id and r.reverted_at is null;

-- A single explicitly verified pack conversion; other pack receipts are still
-- distinguishable in behavioral tests via transaction source and expected qty.
insert into public.inventory_unit_conversions
 (brand_id,inventory_item_id,status,purchase_unit,sale_unit,units_per_purchase_unit)
values('00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000101',
       'verified','pack','pcs',20);

-- Source 201 must be unverified despite the same master unit conversion:
-- behavioral test checks the guarded feature after source 201 is withheld by an
-- explicit update of source unit to 'unknown-pack' below.
update public.offline_purchase_history set unit_text='unknown-pack'
 where id='00000000-0000-0000-0000-000000000201';

insert into private.purchase_stock_reviews
 (brand_id,source_history_id,inventory_item_id,qty_multiplier,reviewed_by,reviewed_at)
values('00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000205',
       '00000000-0000-0000-0000-000000000101',12,
       '00000000-0000-0000-0000-000000009999',now());

-- Independent tracked SKU for stock-view correctness:
insert into public.inventory_stock_opname
 (brand_id,inventory_item_id,opname_date,system_qty,physical_qty,variance)
values ('00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000102',current_date - 10,10,10,0);
insert into public.inventory_movements
 (brand_id,inventory_item_id,movement_date,movement_type,qty_delta)
values('00000000-0000-0000-0000-000000000001',
'00000000-0000-0000-0000-000000000102',current_date - 5,'SALE_CONSUMPTION',-2);


-- Read-only invoice evidence candidate. The original orphan source UUID must
-- NOT be changed just because the factuur record matches it.
insert into public.purchase_import_evidence
(brand_id,source_type,source_period,source_file,source_record_key,row_no,
 purchase_date,item_name,quantity,unit_text,total_amount,source_status)
values('00000000-0000-0000-0000-000000000001','majoo',
 date_trunc('month',current_date)::date,'factuur-fixture.xlsx',
 'majoo:fixture:old-source',99,current_date-9,'OLD RECEIPT',
 6,'pcs',99,'Selesai');

-- Audited Owner review posting to exercise the narrow authorized reversal.
-- It lies outside the regular 20-day auto-sync window.
insert into public.offline_purchase_history
(id,brand_id,source_period,source_file,row_no,purchase_date,
 item_name,quantity_text,unit_text,unit_price,total_amount,inventory_item_id)
values('00000000-0000-0000-0000-000000000207',
       '00000000-0000-0000-0000-000000000001',
       (current_date-50)::date,'owner-reviewed-fixture.xlsx',7,current_date-50,
       'OWNER REVIEWED ITEM','1',null,100,100,
       '00000000-0000-0000-0000-000000000101');

insert into public.inventory_purchase_log
(id,brand_id,inventory_item_id,purchase_date,qty,unit,unit_cost,total_amount,
 source_history_id,source_file,source_row_no,mapping_method)
values('00000000-0000-0000-0000-000000000304',
       '00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000101',current_date-50,
       12,'pcs',null,100,'00000000-0000-0000-0000-000000000207',
       'owner-reviewed-fixture.xlsx',7,'owner_source_review');

insert into private.purchase_stock_reviews
(id,brand_id,source_history_id,inventory_item_id,qty_multiplier,
 reviewed_by,reviewed_at,log_snapshot,reason)
values('00000000-0000-0000-0000-000000000404',
       '00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000207',
       '00000000-0000-0000-0000-000000000101',
       12,'00000000-0000-0000-0000-000000009999',now(),
       jsonb_build_object('id','00000000-0000-0000-0000-000000000304',
                          'source_history_id','00000000-0000-0000-0000-000000000207'),
       'fixture owner review');
