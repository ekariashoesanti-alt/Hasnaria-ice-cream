-- Dual-source Majoo, stage 1: isolated monthly per-SKU source records.
-- SAFE BY DEFAULT: no changes to sales, sale_items, daily_metrics, recipes or stock ledger.
-- Do not use these draft rows as canonical sales or consumption events.

create table if not exists public.sales_product_report_batches (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  outlet_id uuid not null references public.outlets(id),
  period_month date not null,
  filename text not null check (length(btrim(filename)) between 1 and 255),
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[a-f0-9]{32}$'),
  source_format text not null default 'majoo_product_report'
    check (source_format = 'majoo_product_report'),
  status text not null default 'draft'
    check (status in ('draft','under_review','rejected')),
  source_row_count integer not null check (source_row_count between 1 and 5000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_note text,
  check (period_month = date_trunc('month', period_month::timestamp)::date),
  unique (brand_id, outlet_id, period_month, file_sha256)
);

create index if not exists sales_product_report_batches_period_idx
  on public.sales_product_report_batches(brand_id, outlet_id, period_month desc, created_at desc);

create table if not exists public.sales_product_report_lines (
  batch_id uuid not null references public.sales_product_report_batches(id) on delete cascade,
  line_no integer not null check (line_no between 1 and 5000),
  source_sku text not null check (length(btrim(source_sku)) between 1 and 100),
  source_product_name text not null check (length(btrim(source_product_name)) between 1 and 300),
  quantity integer not null check (quantity >= 0),
  source_sales_amount numeric(18,2) not null check (source_sales_amount >= 0),
  source_hpp_amount numeric(18,2) check (source_hpp_amount >= 0),
  source_gross_profit numeric(18,2),
  refund_quantity integer not null default 0 check (refund_quantity >= 0),
  refund_amount numeric(18,2) not null default 0 check (refund_amount >= 0),
  refund_hpp_amount numeric(18,2) check (refund_hpp_amount >= 0),
  primary key(batch_id,line_no),
  check (quantity > 0 or refund_quantity > 0),
  check (refund_quantity <= quantity)
);
create unique index if not exists sales_product_report_lines_sku_unique_idx
  on public.sales_product_report_lines(batch_id,upper(btrim(source_sku)));

-- RLS is deliberately Owner-only. Even authenticated staff cannot change the summary source.
alter table public.sales_product_report_batches enable row level security;
alter table public.sales_product_report_lines enable row level security;
revoke all on public.sales_product_report_batches from public, anon;
revoke all on public.sales_product_report_lines from public, anon;
grant select, insert, update on public.sales_product_report_batches to authenticated;
grant select, insert on public.sales_product_report_lines to authenticated;

create policy sales_product_report_batch_owner_select_v1
  on public.sales_product_report_batches for select to authenticated
  using (
    (select private.is_owner())
    and (select private.same_brand(brand_id))
  );
create policy sales_product_report_batch_owner_insert_v1
  on public.sales_product_report_batches for insert to authenticated
  with check (
    (select private.is_owner())
    and (select private.same_brand(brand_id))
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.outlets o
      where o.id = outlet_id and o.brand_id = brand_id
    )
  );
create policy sales_product_report_batch_owner_update_v1
  on public.sales_product_report_batches for update to authenticated
  using ((select private.is_owner()) and (select private.same_brand(brand_id)))
  with check (
    (select private.is_owner()) and (select private.same_brand(brand_id))
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.outlets o
      where o.id = outlet_id and o.brand_id = brand_id
    )
  );
create policy sales_product_report_line_owner_select_v1
  on public.sales_product_report_lines for select to authenticated
  using (
    (select private.is_owner()) and exists (
      select 1 from public.sales_product_report_batches b
      where b.id = batch_id and (select private.same_brand(b.brand_id))
    )
  );
create policy sales_product_report_line_owner_insert_v1
  on public.sales_product_report_lines for insert to authenticated
  with check (
    (select private.is_owner()) and exists (
      select 1 from public.sales_product_report_batches b
      where b.id = batch_id and (select private.same_brand(b.brand_id))
    )
  );
-- Batch identity and source totals are immutable after creation.
-- The RPC may transition DRAFT -> UNDER_REVIEW; a reviewer may reject but
-- cannot re-open a batch and rewrite source rows. Revisions get a new SHA256.
create or replace function private.guard_sales_product_report_batch_update_v1()
returns trigger language plpgsql security invoker set search_path = '' as $
begin
  if row(new.brand_id,new.outlet_id,new.period_month,new.filename,new.file_sha256,
         new.payload_fingerprint,new.source_format,new.source_row_count,
         new.created_by,new.created_at)
     is distinct from
     row(old.brand_id,old.outlet_id,old.period_month,old.filename,old.file_sha256,
         old.payload_fingerprint,old.source_format,old.source_row_count,
         old.created_by,old.created_at) then
    raise exception 'Sales product report source fields are immutable';
  end if;
  if (old.status='draft' and new.status not in ('draft','under_review'))
     or (old.status='under_review' and new.status not in ('under_review','rejected'))
     or (old.status='rejected' and new.status <> 'rejected') then
    raise exception 'Invalid report review status transition';
  end if;
  return new;
end;
$;
revoke all on function private.guard_sales_product_report_batch_update_v1() from public, anon, authenticated;
create trigger trg_guard_sales_product_report_batch_update_v1
  before update on public.sales_product_report_batches
  for each row execute function private.guard_sales_product_report_batch_update_v1();

-- Do not mutate line snapshots after the Owner sends a batch for review.
create or replace function private.guard_sales_product_report_lines_v1()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_batch uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then v_batch := old.batch_id;
  else v_batch := new.batch_id; end if;
  select b.status into v_status
    from public.sales_product_report_batches b where b.id = v_batch;
  if v_status is distinct from 'draft' then
    raise exception 'Product report batch is locked for review';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.guard_sales_product_report_lines_v1() from public, anon, authenticated;
create trigger trg_guard_sales_product_report_lines_v1
  before insert or update or delete on public.sales_product_report_lines
  for each row execute function private.guard_sales_product_report_lines_v1();

-- ONE RPC = ONE DB TRANSACTION. Hash retries return an existing batch unchanged.
-- This function intentionally never sets an active/canonical status.
create or replace function public.stage_sales_product_report_v1(
  p_brand uuid,
  p_outlet uuid,
  p_period_month date,
  p_filename text,
  p_file_sha256 text,
  p_rows jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_batch uuid;
  v_existing_fingerprint text;
  v_fingerprint text := md5(coalesce(p_rows::text, ''));
  v_inserted integer;
  v_count integer;
  v_units bigint;
  v_sales numeric;
begin
  if auth.uid() is null
     or not coalesce((select private.is_owner()),false)
     or not coalesce((select private.same_brand(p_brand)),false) then
    raise exception 'Owner permission required';
  end if;
  if p_outlet is null or not exists (
    select 1 from public.outlets o where o.id=p_outlet and o.brand_id=p_brand
  ) then raise exception 'Outlet does not belong to brand'; end if;
  if p_period_month is null
     or p_period_month <> date_trunc('month',p_period_month::timestamp)::date then
    raise exception 'Use first day of month for product report'; end if;
  if p_file_sha256 is null or p_file_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid file SHA256'; end if;
  if coalesce(length(btrim(p_filename)),0) not between 1 and 255 then
    raise exception 'Invalid source filename'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_rows) not between 1 and 5000 then
    raise exception 'Product report lines must be a non-empty array (max 5000)'; end if;

  insert into public.sales_product_report_batches
    (brand_id,outlet_id,period_month,filename,file_sha256,payload_fingerprint,source_row_count)
  values
    (p_brand,p_outlet,p_period_month,btrim(p_filename),p_file_sha256,v_fingerprint,jsonb_array_length(p_rows))
  on conflict (brand_id,outlet_id,period_month,file_sha256) do nothing
  returning id into v_batch;

  if v_batch is null then
    select id,payload_fingerprint into v_batch,v_existing_fingerprint
    from public.sales_product_report_batches
    where brand_id=p_brand and outlet_id=p_outlet and period_month=p_period_month
      and file_sha256=p_file_sha256;
    if v_batch is null or v_existing_fingerprint is distinct from v_fingerprint then
      raise exception 'File hash collision or concurrent import; stop for review';
    end if;
    return jsonb_build_object('batch_id',v_batch,'reused',true,'status','existing');
  end if;

  insert into public.sales_product_report_lines
    (batch_id,line_no,source_sku,source_product_name,quantity,
     source_sales_amount,source_hpp_amount,source_gross_profit,
     refund_quantity,refund_amount,refund_hpp_amount)
  select
    v_batch,r.line_no,btrim(r.sku),btrim(r.name),r.quantity,
    r.sales_amount,r.cogs_amount,r.gross_profit,
    coalesce(r.refund_qty,0),coalesce(r.refund_amount,0),r.refund_cogs
  from jsonb_to_recordset(p_rows) as r(
    line_no integer,sku text,name text,quantity integer,
    sales_amount numeric,cogs_amount numeric,gross_profit numeric,
    refund_qty integer,refund_amount numeric,refund_cogs numeric
  );

  select count(*)::int,coalesce(sum(quantity),0)::bigint,
         coalesce(sum(source_sales_amount),0)
  into v_count,v_units,v_sales
  from public.sales_product_report_lines where batch_id=v_batch;
  if v_count is distinct from jsonb_array_length(p_rows) then
    raise exception 'Import count mismatch; transaction rolled back';
  end if;
  -- Seal the snapshot before commit; future direct line writes are blocked.
  update public.sales_product_report_batches
  set status='under_review',reviewed_at=now(),
      review_note='Awaiting Owner reconciliation; never canonical or stock-postable'
  where id=v_batch and status='draft';
  if not found then
    raise exception 'Unable to seal report snapshot; transaction rolled back';
  end if;
  return jsonb_build_object('batch_id',v_batch,'reused',false,
     'status','under_review','line_count',v_count,'quantity',v_units,'sales',v_sales);
end;
$$;
revoke all on function public.stage_sales_product_report_v1(uuid,uuid,date,text,text,jsonb) from public, anon;
grant execute on function public.stage_sales_product_report_v1(uuid,uuid,date,text,text,jsonb) to authenticated;

-- Read-only audit only. Never feed this view into daily metrics or inventory ledger.
create or replace view public.sales_product_report_reconciliation_v1
with (security_invoker=true) as
with product_totals as (
  select batch_id,count(*)::int line_count,
    coalesce(sum(quantity),0)::bigint sku_units,
    coalesce(sum(source_sales_amount),0)::numeric source_sales_amount,
    coalesce(sum(source_hpp_amount),0)::numeric source_hpp_amount,
    count(*) filter (where source_hpp_amount is null)::int missing_hpp_lines,
    coalesce(sum(refund_quantity),0)::bigint refund_units,
    coalesce(sum(refund_amount),0)::numeric refund_amount
  from public.sales_product_report_lines group by batch_id
), tx as (
  select brand_id,outlet_id,date_trunc('month',sold_at::timestamp)::date period_month,
    count(*)::int transaction_headers,coalesce(sum(total_amount),0)::numeric transaction_sales,
    min(sold_at) first_transaction_date,max(sold_at) last_transaction_date
  from public.sales group by brand_id,outlet_id,date_trunc('month',sold_at::timestamp)::date
)
select b.id batch_id,b.brand_id,b.outlet_id,b.period_month,b.file_sha256,
  b.status,b.source_row_count,pt.line_count,pt.sku_units,
  pt.source_sales_amount,pt.source_hpp_amount,pt.missing_hpp_lines,
  pt.refund_units,pt.refund_amount,
  tx.transaction_headers,tx.transaction_sales,
  tx.first_transaction_date,tx.last_transaction_date,
  pt.source_sales_amount-tx.transaction_sales sales_difference,
  case when tx.transaction_headers is null then 'NO_TRANSACTION_SOURCE'
       when tx.first_transaction_date > b.period_month
         or tx.last_transaction_date < (b.period_month + interval '1 month - 1 day')::date
       then 'DATE_RANGE_PARTIAL'
       else 'BOUNDARY_DATES_PRESENT' end detail_coverage
from public.sales_product_report_batches b
left join product_totals pt on pt.batch_id=b.id
left join tx on tx.brand_id=b.brand_id and tx.outlet_id=b.outlet_id
  and tx.period_month=b.period_month;

revoke all on public.sales_product_report_reconciliation_v1 from public, anon;
grant select on public.sales_product_report_reconciliation_v1 to authenticated;
