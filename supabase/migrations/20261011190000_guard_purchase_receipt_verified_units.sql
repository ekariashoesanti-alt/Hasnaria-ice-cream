-- HSN-P0 Stage 3: do not post Purchase quantity without an auditable source unit.
-- ADDITIVE, FAIL-CLOSED: historical inventory_purchase_log and movements are not touched.
-- Posting always uses inventory_items.unit, never an unconverted source unit.
-- A trusted owner review may supply an explicit qty_multiplier; otherwise an
-- identical source/master unit or exactly one VERIFIED conversion is required.
-- Unverified unit conversions and absent purchase units remain unposted.
-- Existing source-linked receipts are NEVER rewritten by background sync.
-- No change to the separate Purchase -> Finance accounting pipeline.

create or replace function private.guard_purchase_receipt_unit_v1()
returns trigger language plpgsql security definer set search_path = ''
as $guard$
declare
  b record;
  v_qty numeric;
  v_review record;
  v_factor numeric;
  v_conversion_count bigint;
begin
  if tg_op = 'UPDATE' then
    -- Preserve existing historical entries, including orphans, for metadata-only
    -- updates; every quantity/source/item/date/unit/value modification is checked.
    if new.source_history_id is not distinct from old.source_history_id
       and new.brand_id is not distinct from old.brand_id
       and new.inventory_item_id is not distinct from old.inventory_item_id
       and new.purchase_date is not distinct from old.purchase_date
       and new.qty is not distinct from old.qty
       and new.unit is not distinct from old.unit
       and new.unit_cost is not distinct from old.unit_cost
       and new.total_amount is not distinct from old.total_amount
       and new.source_file is not distinct from old.source_file
       and new.source_row_no is not distinct from old.source_row_no then
      return new;
    end if;

    if old.source_history_id is not null and new.source_history_id is null then
      raise exception 'Sumber Pembelian terhubung Stok tidak boleh dihapus dari referensi tanpa rekonsiliasi'
        using errcode = '23503';
    end if;
  end if;

  -- Manual (non-canonical) Stock entries retain their existing workflow.
  if new.source_history_id is null then
    return new;
  end if;

  -- Same advisory lock key as the canonical-source and reviewed-posting guards.
  perform pg_advisory_xact_lock(hashtextextended(new.source_history_id::text, 416));

  select p.*, i.unit as stock_unit
    into b
  from public.purchase_inventory_bridge p
  join public.inventory_items i on i.id=p.inventory_item_id and i.brand_id=p.brand_id
  where p.id=new.source_history_id and p.brand_id=new.brand_id;

  if not found or not coalesce(b.ready_for_inventory,false)
     or b.inventory_item_id is null
     or coalesce(b.quantity_numeric,0)<=0
     or coalesce(b.total_amount,0)<=0
     or nullif(btrim(coalesce(b.stock_unit,'')),'') is null then
    raise exception 'Posting Stok diblokir: referensi Pembelian/SKU tidak valid atau tidak siap'
      using errcode = '23503';
  end if;

  select r.qty_multiplier,r.reviewed_by,r.reviewed_at
    into v_review
  from private.purchase_stock_reviews r
  where r.brand_id=new.brand_id
    and r.source_history_id=new.source_history_id
    and r.inventory_item_id=b.inventory_item_id
    and r.reverted_at is null
  order by r.reviewed_at desc nulls last
  limit 1;

  if b.mapping_status='owner_review' and v_review.reviewed_by is not null
     and v_review.reviewed_at is not null
     and coalesce(v_review.qty_multiplier,0)>0
     and b.inventory_qty=b.quantity_numeric*v_review.qty_multiplier then
    v_qty := b.inventory_qty;
  elsif b.mapping_status <> 'owner_review'
        and nullif(btrim(coalesce(b.unit_text,'')),'') is not null
        and lower(btrim(b.unit_text))=lower(btrim(b.stock_unit))
        and b.inventory_qty=b.quantity_numeric then
    v_qty := b.quantity_numeric;
  elsif b.mapping_status <> 'owner_review'
        and nullif(btrim(coalesce(b.unit_text,'')),'') is not null then
    select count(*),max(c.units_per_purchase_unit)
      into v_conversion_count,v_factor
    from public.inventory_unit_conversions c
    where c.brand_id=new.brand_id
      and c.inventory_item_id=b.inventory_item_id
      and c.status='verified'
      and c.units_per_purchase_unit>0
      and lower(btrim(c.purchase_unit))=lower(btrim(b.unit_text))
      and lower(btrim(c.sale_unit))=lower(btrim(b.stock_unit));
    if v_conversion_count=1 then
      v_qty := b.quantity_numeric*v_factor;
    end if;
  end if;

  if coalesce(v_qty,0)<=0 then
    raise exception 'Posting Stok ditahan: satuan Pembelian belum ada atau konversi belum diverifikasi'
      using errcode = '23514';
  end if;

  if new.inventory_item_id is distinct from b.inventory_item_id
     or new.purchase_date is distinct from b.purchase_date
     or new.qty is distinct from v_qty
     or lower(btrim(coalesce(new.unit,''))) is distinct from lower(btrim(b.stock_unit))
     or new.unit_cost is not null
     or new.total_amount is distinct from b.total_amount
     or new.source_file is distinct from b.source_file
     or new.source_row_no is distinct from b.row_no then
    raise exception 'Posting Stok diblokir: SKU, jumlah dalam satuan stok, tanggal, atau sumber tidak cocok dengan Pembelian'
      using errcode = '23514';
  end if;

  return new;
end;
$guard$;

revoke all on function private.guard_purchase_receipt_unit_v1()
  from public, anon, authenticated;

drop trigger if exists guard_purchase_receipt_unit_v1 on public.inventory_purchase_log;
create trigger guard_purchase_receipt_unit_v1
before insert or update of
  source_history_id,brand_id,inventory_item_id,purchase_date,qty,unit,
  unit_cost,total_amount,source_file,source_row_no
on public.inventory_purchase_log
for each row execute function private.guard_purchase_receipt_unit_v1();

-- Replace the original privileged posting function with a guarded version.
-- Keep existing authentication/capability checks. Skip unsafe rows and report
-- how many candidates still need owner unit verification; do not throw on every
-- page load, do not rewrite legacy receipts.
create or replace function private.sync_purchase_quantity_stock_v1(
  p_brand uuid,p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path = ''
as $sync$
declare
  v_total integer := 0;
  v_eligible integer := 0;
  v_synced integer := 0;
begin
  if p_brand is null or p_from is null or p_to is null or p_from>p_to then
    raise exception 'Invalid Purchase stock sync range';
  end if;
  if not private.same_brand(p_brand)
     or not (private.has_capability('settings.manage')
             or private.can_import_module('purchasing')
             or private.can_stock_write()) then
    raise exception 'Purchase stock sync permission required';
  end if;

  with candidates as materialized (
    select b.*, i.unit as stock_unit,
           r.reviewed_by,r.reviewed_at,r.qty_multiplier as review_factor,
           c.conversion_count,c.verified_factor
    from public.purchase_inventory_bridge b
    join public.inventory_items i
      on i.id=b.inventory_item_id and i.brand_id=b.brand_id
    left join lateral (
      select q.reviewed_by,q.reviewed_at,q.qty_multiplier
      from private.purchase_stock_reviews q
      where q.source_history_id=b.id and q.brand_id=b.brand_id
        and q.inventory_item_id=b.inventory_item_id
        and q.reverted_at is null
      order by q.reviewed_at desc nulls last limit 1
    ) r on true
    left join lateral (
      select count(*) as conversion_count,
             max(c.units_per_purchase_unit) as verified_factor
      from public.inventory_unit_conversions c
      where c.brand_id=b.brand_id and c.inventory_item_id=b.inventory_item_id
        and c.status='verified' and c.units_per_purchase_unit>0
        and lower(btrim(c.purchase_unit))=lower(btrim(coalesce(b.unit_text,'')))
        and lower(btrim(c.sale_unit))=lower(btrim(coalesce(i.unit,'')))
    ) c on true
    where b.brand_id=p_brand
      and b.purchase_date between p_from and p_to
      and b.ready_for_inventory
      and b.inventory_item_id is not null
      and coalesce(b.quantity_numeric,0)>0
      and coalesce(b.total_amount,0)>0
  ), qualified as materialized (
    select b.*,
      case
        when b.mapping_status='owner_review'
          and b.reviewed_by is not null and b.reviewed_at is not null
          and coalesce(b.review_factor,0)>0
          and b.inventory_qty=b.quantity_numeric*b.review_factor
          then b.inventory_qty
        when b.mapping_status <> 'owner_review'
          and nullif(btrim(coalesce(b.unit_text,'')),'') is not null
          and lower(btrim(b.unit_text))=lower(btrim(coalesce(b.stock_unit,'')))
          and b.inventory_qty=b.quantity_numeric
          then b.quantity_numeric
        when b.mapping_status <> 'owner_review'
          and nullif(btrim(coalesce(b.unit_text,'')),'') is not null
          and b.conversion_count=1 and b.verified_factor>0
          then b.quantity_numeric*b.verified_factor
        else null::numeric
      end as stock_qty
    from candidates b
  ), posted as (
    insert into public.inventory_purchase_log(
      brand_id,inventory_item_id,purchase_date,qty,unit,notes,unit_cost,
      total_amount,source_history_id,source_file,source_row_no,mapping_method
    )
    select b.brand_id,b.inventory_item_id,b.purchase_date,b.stock_qty,b.stock_unit,
      concat('Quantity-only from Purchase; unit verified; Finance expense separate: ',
             coalesce(b.item_name,'(tanpa nama)')),
      null::numeric,b.total_amount,b.id,b.source_file,b.row_no,
      case when b.mapping_status='owner_review' then 'purchase_quantity_owner_review'
           when lower(btrim(b.unit_text))=lower(btrim(b.stock_unit)) then 'purchase_quantity_same_unit'
           else 'purchase_quantity_verified_conversion' end
    from qualified b
    where b.stock_qty>0
      and nullif(btrim(coalesce(b.stock_unit,'')),'') is not null
    -- Idempotent append-only: never rewrite any existing receipt/movement.
    -- Source corrections must pass a separately reviewed Stock reconciliation.
    on conflict (source_history_id)
      where source_history_id is not null
    do nothing
    returning id
  )
  select (select count(*) from candidates),
         (select count(*) from qualified where stock_qty>0
            and nullif(btrim(coalesce(stock_unit,'')),'') is not null),
         (select count(*) from posted)
    into v_total,v_eligible,v_synced;

  return jsonb_build_object(
    'synced_stock_rows',v_synced,
    'eligible_stock_rows',v_eligible,
    'blocked_for_unit_review',v_total-v_eligible,
    'total_stock_candidates',v_total,
    'from',p_from,'to',p_to,
    'basis','quantity_only_verified_unit'
  );
end;
$sync$;

comment on function private.sync_purchase_quantity_stock_v1(uuid,date,date) is
  'HSN-P0: only posts verified and correctly converted Purchase units; reports skipped unverified rows without modifying historical receipts.';

comment on function private.guard_purchase_receipt_unit_v1() is
  'HSN-P0: fail closed on Purchase-source Stock receipt insert or material update without owner review or verified units, preserving existing historical rows.';
