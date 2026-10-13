-- HSN P0.2: Owner documentary review for stock MASTER units.
-- This does NOT update inventory_items.unit, opening_qty, Stock movements,
-- recorded Sales consumption, purchase source, Finance or recipe BOM.
-- Reviewed physical units can be applied in a separate, restorable, UAT-gated
-- operation only after historical movements and recipe factors are reconciled.
create table if not exists private.inventory_master_unit_attestations_v1(
 id uuid primary key default gen_random_uuid(),
 brand_id uuid not null,
 inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
 decision text not null check(decision in
    ('DOCUMENT_UNIT','HOLD_FOR_EVIDENCE','NOT_FOR_STOCK')),
 proposed_stock_unit text,
 evidence_reference text not null
   check(length(btrim(evidence_reference)) between 12 and 400),
 reason text not null check(length(btrim(reason)) between 30 and 1000),
 source_snapshot jsonb not null,
 reviewed_by uuid not null,
 reviewed_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,
 revoked_by uuid,
 revoke_reason text,
 constraint verified_master_unit_required check(
  (decision='DOCUMENT_UNIT' and proposed_stock_unit is not null
   and length(btrim(proposed_stock_unit)) between 1 and 40)
  or (decision<>'DOCUMENT_UNIT' and proposed_stock_unit is null))
);
create unique index if not exists inventory_master_unit_one_active_v1
 on private.inventory_master_unit_attestations_v1(brand_id,inventory_item_id)
 where revoked_at is null;
create index if not exists inventory_master_unit_review_item_v1
 on private.inventory_master_unit_attestations_v1(brand_id,inventory_item_id);
alter table private.inventory_master_unit_attestations_v1 enable row level security;
revoke all on private.inventory_master_unit_attestations_v1
 from public,anon,authenticated;

-- Reusable runtime source snapshot: never trust a client-supplied tenant,
-- SKU name, usage counts, baseline or existing master unit.
create or replace function private.owner_master_unit_snapshot_v1(p_item_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $snap$
declare v_brand uuid; i record; r record;
 v_receipts bigint;v_moves bigint;v_bom bigint;v_pending bigint;v_rules jsonb;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 select id,brand_id,item_name,unit,category,opening_qty
 into i from public.inventory_items
 where brand_id=v_brand and id=p_item_id;
 if not found then raise exception 'SKU tidak ada atau milik brand lain'; end if;
 select tracking_active,last_opname_date,baseline_date
 into r from public.inventory_stock_reconciliation
 where brand_id=v_brand and inventory_item_id=p_item_id;
 select count(*) into v_receipts from public.inventory_purchase_log l
 where l.brand_id=v_brand and l.inventory_item_id=p_item_id;
 select count(*) into v_moves from public.inventory_movements m
 where m.brand_id=v_brand and m.inventory_item_id=p_item_id;
 select count(*) into v_bom from public.inventory_recipe_components b
 where b.brand_id=v_brand and b.inventory_item_id=p_item_id and b.active;
 select count(*) into v_pending from public.purchase_inventory_bridge b
 where b.brand_id=v_brand and b.inventory_item_id=p_item_id
   and b.ready_for_inventory and coalesce(b.quantity_numeric,0)>0
   and not exists(select 1 from public.inventory_purchase_log l
     where l.brand_id=b.brand_id and l.source_history_id=b.id);
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'purchase_unit',c.purchase_unit,'sale_unit',c.sale_unit,
  'factor',c.units_per_purchase_unit,'status',c.status)
  order by c.id),'[]'::jsonb)
 into v_rules from public.inventory_unit_conversions c
 where c.brand_id=v_brand and c.inventory_item_id=p_item_id;
 return jsonb_build_object(
  'brand_id',v_brand,'item_id',i.id,'item_name',i.item_name,
  'category',i.category,'master_unit',i.unit,'opening_qty',i.opening_qty,
  'tracking_active',coalesce(r.tracking_active,false),
  'last_opname_date',r.last_opname_date,'baseline_date',r.baseline_date,
  'receipt_count',v_receipts,'movement_count',v_moves,
  'active_recipe_count',v_bom,'pending_purchase_count',v_pending,
  'conversion_catalog',v_rules,
  'priority',case when coalesce(r.tracking_active,false) or
     v_receipts>0 or v_bom>0 or v_pending>0 then 'P0_ACTIVE_DEPENDENCY'
     else 'P1_UNUSED_PLACEHOLDER' end);
end;
$snap$;

create or replace function private.owner_master_unit_queue_v1(p_critical_only boolean default true)
returns jsonb language plpgsql stable security definer set search_path=''
as $queue$
declare v_brand uuid; v_items jsonb;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 select coalesce(jsonb_agg(
   snapshot||jsonb_build_object(
    'review_id',a.id,'decision',a.decision,
    'proposed_stock_unit',a.proposed_stock_unit,'reviewed_at',a.reviewed_at,
    'status',case when a.id is not null then 'DOCUMENTED_NOT_APPLIED'
                  else 'REQUIRES_MASTER_UNIT_REVIEW' end)
   order by (snapshot->>'priority') asc,(snapshot->>'item_name') asc
 ),'[]'::jsonb)
 into v_items
 from (
   select i.id,
     private.owner_master_unit_snapshot_v1(i.id) as snapshot
   from public.inventory_items i
   where i.brand_id=v_brand
     and (i.unit is null or nullif(btrim(i.unit),'') is null or
          lower(btrim(i.unit))='purchase_unit')
 ) q
 left join private.inventory_master_unit_attestations_v1 a
   on a.brand_id=v_brand and a.inventory_item_id=q.id and a.revoked_at is null
 where not coalesce(p_critical_only,true)
    or snapshot->>'priority'='P0_ACTIVE_DEPENDENCY';
 return jsonb_build_object(
    'total',jsonb_array_length(v_items),'items',v_items,
    'mode','document_master_only_no_stock_sale_or_finance_mutation');
end;
$queue$;

create or replace function private.owner_master_unit_preview_v1(
 p_item_id uuid,p_decision text,p_unit text default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $pre$
declare v_brand uuid; v_source jsonb; v_unit text;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 v_unit:=nullif(btrim(coalesce(p_unit,'')),'');
 if p_item_id is null or p_decision is null
   or p_decision not in ('DOCUMENT_UNIT','HOLD_FOR_EVIDENCE','NOT_FOR_STOCK') then
   raise exception 'SKU dan keputusan review wajib dipilih';
 end if;
 if p_decision='DOCUMENT_UNIT' and (
   v_unit is null or length(v_unit)>40
   or lower(v_unit) in ('purchase_unit','unknown','null','unit','?','-')) then
   raise exception 'Satuan master harus spesifik, bukan placeholder';
 end if;
 if p_decision<>'DOCUMENT_UNIT' and v_unit is not null then
   raise exception 'Jangan menetapkan satuan saat keputusan masih ditahan atau dikecualikan';
 end if;
 v_source:=private.owner_master_unit_snapshot_v1(p_item_id);
 if coalesce(lower(btrim(v_source->>'master_unit')),'') not in ('','purchase_unit') then
   raise exception 'Satuan master sudah spesifik, jangan gunakan antrean placeholder';
 end if;
 if exists(select 1 from private.inventory_master_unit_attestations_v1 a
   where a.brand_id=v_brand and a.inventory_item_id=p_item_id
     and a.revoked_at is null) then
   raise exception 'Keputusan Owner sudah ada; batalkan dahulu sebelum revisi';
 end if;
 return v_source||jsonb_build_object(
  'decision',p_decision,'proposed_stock_unit',v_unit,
  'token',md5((v_source||jsonb_build_object(
     'decision',p_decision,'proposed_stock_unit',v_unit))::text),
  'master_will_change',false,'stock_will_change',false,
  'recipe_will_change',false,'finance_will_change',false);
end;
$pre$;

create or replace function private.owner_master_unit_apply_v1(
 p_item_id uuid,p_decision text,p_unit text,p_token text,
 p_evidence text,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $apply$
declare v_brand uuid; v_source jsonb; v_review uuid;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 if length(btrim(coalesce(p_evidence,''))) not between 12 and 400
  or length(btrim(coalesce(p_reason,''))) not between 30 and 1000 then
   raise exception 'Bukti 12–400 dan alasan 30–1000 karakter wajib diisi';
 end if;
 if p_item_id is null then raise exception 'SKU wajib ada'; end if;
 -- Lock SKU plus transaction-scoped advisory key before re-evaluating token:
 -- concurrent approvals/re-import cannot authorize a stale source snapshot.
 perform pg_advisory_xact_lock(hashtextextended(
     v_brand::text||':'||p_item_id::text,423));
 perform 1 from public.inventory_items
 where brand_id=v_brand and id=p_item_id for update;
 if not found then raise exception 'SKU hilang atau akses ditolak'; end if;
 v_source:=private.owner_master_unit_preview_v1(p_item_id,p_decision,p_unit);
 if p_token is null or p_token is distinct from v_source->>'token' then
   raise exception 'Master, bukti, atau status SKU berubah; jalankan pratinjau ulang';
 end if;
 insert into private.inventory_master_unit_attestations_v1(
    brand_id,inventory_item_id,decision,proposed_stock_unit,
    evidence_reference,reason,source_snapshot,reviewed_by)
 values(v_brand,p_item_id,p_decision,
    nullif(v_source->>'proposed_stock_unit',''),
    btrim(p_evidence),btrim(p_reason),v_source-'token',auth.uid())
 returning id into v_review;
 return jsonb_build_object(
    'review_id',v_review,'status','DOCUMENTED_NOT_APPLIED',
    'master_changed',false,'stock_changed',false,
    'recipe_changed',false,'finance_changed',false);
end;
$apply$;

create or replace function private.owner_master_unit_revoke_v1(
 p_review_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $rev$
declare v_brand uuid; a private.inventory_master_unit_attestations_v1%rowtype;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 if p_review_id is null or length(btrim(coalesce(p_reason,'')))<30 then
  raise exception 'Review dan alasan pembatalan minimal 30 karakter diperlukan';
 end if;
 select * into a from private.inventory_master_unit_attestations_v1
 where id=p_review_id and brand_id=v_brand for update;
 if not found then raise exception 'Persetujuan SKU tidak ditemukan'; end if;
 if a.revoked_at is not null then return jsonb_build_object(
     'review_id',a.id,'already_revoked',true);end if;
 perform pg_advisory_xact_lock(hashtextextended(
     v_brand::text||':'||a.inventory_item_id::text,423));
 update private.inventory_master_unit_attestations_v1
 set revoked_at=clock_timestamp(),revoked_by=auth.uid(),
     revoke_reason=btrim(p_reason)
 where id=a.id;
 return jsonb_build_object('review_id',a.id,'already_revoked',false,
   'master_changed',false,'stock_changed',false);
end;
$rev$;

create or replace function public.owner_master_unit_queue_v1(p_critical_only boolean default true)
returns jsonb language sql stable security invoker set search_path=''
as $$select private.owner_master_unit_queue_v1(p_critical_only)$$;
create or replace function public.owner_master_unit_preview_v1(
 p_item_id uuid,p_decision text,p_unit text default null)
returns jsonb language sql stable security invoker set search_path=''
as $$select private.owner_master_unit_preview_v1(p_item_id,p_decision,p_unit)$$;
create or replace function public.owner_master_unit_apply_v1(
 p_item_id uuid,p_decision text,p_unit text,p_token text,p_evidence text,p_reason text)
returns jsonb language sql security invoker set search_path=''
as $$select private.owner_master_unit_apply_v1(p_item_id,p_decision,p_unit,
 p_token,p_evidence,p_reason)$$;
create or replace function public.owner_master_unit_revoke_v1(
 p_review_id uuid,p_reason text)
returns jsonb language sql security invoker set search_path=''
as $$select private.owner_master_unit_revoke_v1(p_review_id,p_reason)$$;
revoke all on function public.owner_master_unit_queue_v1(boolean),
 public.owner_master_unit_preview_v1(uuid,text,text),
 public.owner_master_unit_apply_v1(uuid,text,text,text,text,text),
 public.owner_master_unit_revoke_v1(uuid,text)
 from public,anon;
grant execute on function public.owner_master_unit_queue_v1(boolean),
 public.owner_master_unit_preview_v1(uuid,text,text),
 public.owner_master_unit_apply_v1(uuid,text,text,text,text,text),
 public.owner_master_unit_revoke_v1(uuid,text)
 to authenticated,service_role;
comment on table private.inventory_master_unit_attestations_v1 is
 'P0.2 Owner documentary master-unit reviews. Does not change any inventory_items.unit value or stock/recipe/finance data. Actual controlled master change requires separately audited release.';
