-- HASNARIA: isolated Majoo recipe export evidence for Owner review.
-- DO NOT write to inventory_recipe_components, product_recipe_verifications,
-- inventory_movements, sales, sale_items, finance or stock balances.
-- Export date is evidence metadata, NOT BOM effective_from.

create table if not exists public.recipe_import_batches_v1 (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  outlet_id uuid not null references public.outlets(id),
  source_filename text not null check (length(btrim(source_filename)) between 1 and 255),
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[a-f0-9]{32}$'),
  source_exported_at text not null check (length(btrim(source_exported_at)) between 1 and 50),
  source_outlet_name text not null check (length(btrim(source_outlet_name)) between 1 and 200),
  source_row_count integer not null check (source_row_count between 1 and 3000),
  status text not null default 'under_review' check (status = 'under_review'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (brand_id, outlet_id, file_sha256)
);
create index if not exists recipe_import_batches_lookup_v1
  on public.recipe_import_batches_v1(brand_id, outlet_id, created_at desc);

create table if not exists public.recipe_import_lines_v1 (
  batch_id uuid not null references public.recipe_import_batches_v1(id) on delete restrict,
  line_no integer not null check (line_no between 1 and 3000),
  source_sku text not null check (length(btrim(source_sku)) between 1 and 100),
  source_product_name text not null check (length(btrim(source_product_name)) between 1 and 300),
  source_category text not null default '',
  source_ingredient_sku text not null check (length(btrim(source_ingredient_sku)) between 1 and 100),
  source_ingredient_name text not null check (length(btrim(source_ingredient_name)) between 1 and 300),
  source_quantity numeric(18,6) not null check (source_quantity > 0 and source_quantity <= 10000000),
  source_unit text not null check (length(btrim(source_unit)) between 1 and 100),
  primary key (batch_id,line_no)
);
create unique index if not exists recipe_import_lines_sku_material_unique_v1
  on public.recipe_import_lines_v1(batch_id, upper(btrim(source_sku)),upper(btrim(source_ingredient_sku)));

alter table public.recipe_import_batches_v1 enable row level security;
alter table public.recipe_import_lines_v1 enable row level security;
revoke all privileges on public.recipe_import_batches_v1 from public, anon, authenticated;
revoke all privileges on public.recipe_import_lines_v1 from public, anon, authenticated;
grant select on public.recipe_import_batches_v1 to authenticated;
grant select on public.recipe_import_lines_v1 to authenticated;

create policy recipe_import_batch_owner_select_v1 on public.recipe_import_batches_v1
for select to authenticated
using ((select private.is_owner()) and (select private.same_brand(brand_id)));

create policy recipe_import_lines_owner_select_v1 on public.recipe_import_lines_v1
for select to authenticated
using ((select private.is_owner()) and exists (
  select 1 from public.recipe_import_batches_v1 b
  where b.id=batch_id and (select private.same_brand(b.brand_id))
));

-- Atomic append-only staging RPC. It does not create or approve ANY live BOM.
-- Users with direct SQL access cannot turn these rows into stock movements.
create or replace function public.stage_recipe_import_v1(
  p_brand uuid,
  p_outlet uuid,
  p_filename text,
  p_file_sha256 text,
  p_exported_at text,
  p_source_outlet text,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_batch uuid;
  v_existing_fp text;
  v_fp text := md5(coalesce(p_rows::text,''));
  v_rows integer;
begin
  if auth.uid() is null
    or not coalesce((select private.is_owner()),false)
    or not coalesce((select private.same_brand(p_brand)),false) then
    raise exception 'Owner permission required';
  end if;
  if p_outlet is null or not exists(
    select 1 from public.outlets o where o.id=p_outlet and o.brand_id=p_brand
  ) then raise exception 'Outlet / brand mismatch'; end if;
  if coalesce(length(btrim(p_filename)),0) not between 1 and 255
    or coalesce(length(btrim(p_exported_at)),0) not between 1 and 50
    or coalesce(length(btrim(p_source_outlet)),0) not between 1 and 200 then
    raise exception 'Invalid source metadata';
  end if;
  if p_file_sha256 is null or p_file_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid source SHA256';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Recipe lines must be an array';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 3000 then
    raise exception 'Recipe line count outside 1..3000';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_rows) as x(v)
    where coalesce(length(btrim(x.v->>'sku')),0) not between 1 and 100
       or coalesce(length(btrim(x.v->>'name')),0) not between 1 and 300
       or coalesce(length(btrim(x.v->>'ingredient_code')),0) not between 1 and 100
       or coalesce(length(btrim(x.v->>'ingredient_name')),0) not between 1 and 300
       or coalesce(length(btrim(x.v->>'unit')),0) not between 1 and 100
       or jsonb_typeof(x.v->'quantity') is distinct from 'number'
       or coalesce((x.v->>'quantity')::numeric,0) <= 0
       or coalesce((x.v->>'quantity')::numeric,0) > 10000000
  ) then raise exception 'Malformed or incomplete Majoo recipe line'; end if;

  -- One product SKU cannot silently refer to two distinct menu names.
  if exists(
    select 1 from jsonb_to_recordset(p_rows) as r(sku text,name text)
    group by upper(btrim(r.sku))
    having count(distinct lower(btrim(r.name)))>1
  ) then raise exception 'A Majoo product SKU has conflicting names'; end if;
  -- One ingredient code cannot silently refer to two different names/units.
  if exists(
    select 1 from jsonb_to_recordset(p_rows) as r(ingredient_code text,ingredient_name text,unit text)
    group by upper(btrim(r.ingredient_code))
    having count(distinct lower(btrim(r.ingredient_name)))>1
        or count(distinct lower(btrim(r.unit)))>1
  ) then raise exception 'Conflicting material code, name or unit'; end if;

  insert into public.recipe_import_batches_v1
    (brand_id,outlet_id,source_filename,file_sha256,payload_fingerprint,
     source_exported_at,source_outlet_name,source_row_count,created_by)
  values (p_brand,p_outlet,btrim(p_filename),p_file_sha256,v_fp,
          btrim(p_exported_at),btrim(p_source_outlet),
          jsonb_array_length(p_rows),auth.uid())
  on conflict (brand_id,outlet_id,file_sha256) do nothing
  returning id into v_batch;

  if v_batch is null then
    select b.id,b.payload_fingerprint into v_batch,v_existing_fp
    from public.recipe_import_batches_v1 b
    where b.brand_id=p_brand and b.outlet_id=p_outlet and b.file_sha256=p_file_sha256;
    if v_batch is null or v_fp is distinct from v_existing_fp then
      raise exception 'Existing file SHA with different parsed payload; manual audit required';
    end if;
    return jsonb_build_object('batch_id',v_batch,'reused',true,'status','under_review');
  end if;

  insert into public.recipe_import_lines_v1
    (batch_id,line_no,source_sku,source_product_name,source_category,
     source_ingredient_sku,source_ingredient_name,source_quantity,source_unit)
  select v_batch,r.line_no,btrim(r.sku),btrim(r.name),coalesce(btrim(r.category),''),
    btrim(r.ingredient_code),btrim(r.ingredient_name),r.quantity,btrim(r.unit)
  from jsonb_to_recordset(p_rows) as r(
    line_no integer,sku text,name text,category text,
    ingredient_code text,ingredient_name text,quantity numeric,unit text
  );
  select count(*)::integer into v_rows
    from public.recipe_import_lines_v1 where batch_id=v_batch;
  if v_rows is distinct from jsonb_array_length(p_rows) then
    raise exception 'Recipe staging row count mismatch; entire transaction rolled back';
  end if;
  return jsonb_build_object('batch_id',v_batch,'reused',false,
                            'status','under_review','line_count',v_rows);
end;
$fn$;
revoke all on function public.stage_recipe_import_v1(uuid,uuid,text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.stage_recipe_import_v1(uuid,uuid,text,text,text,text,jsonb)
  to authenticated;

do $audit$
begin
  if has_table_privilege('authenticated','public.recipe_import_batches_v1','TRUNCATE')
    or has_table_privilege('authenticated','public.recipe_import_lines_v1','TRUNCATE')
    or has_table_privilege('authenticated','public.recipe_import_batches_v1','INSERT')
    or has_table_privilege('authenticated','public.recipe_import_lines_v1','INSERT')
    or has_table_privilege('authenticated','public.recipe_import_lines_v1','UPDATE')
    or has_table_privilege('authenticated','public.recipe_import_batches_v1','DELETE')
    or has_table_privilege('anon','public.recipe_import_batches_v1','SELECT')
    or has_function_privilege('anon',
      'public.stage_recipe_import_v1(uuid,uuid,text,text,text,text,jsonb)','EXECUTE')
  then raise exception 'Recipe import ACL check failed; transaction rolled back'; end if;
end;
$audit$;
