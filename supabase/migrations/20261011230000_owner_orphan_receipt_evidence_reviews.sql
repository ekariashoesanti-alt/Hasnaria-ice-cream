-- Hasnaria P0.1: Owner-only DOCUMENTARY decisions for broken historical
-- Purchase UUIDs. This deliberately never rebinds source_history_id,
-- never posts Stock receipts/movements, and never creates Finance entries.
-- A uniquely matching Majoo invoice is EXTERNAL EVIDENCE, not a canonical
-- Purchase source. Keep 86 old receipts and their movements unchanged.

create table if not exists private.orphan_receipt_owner_reviews_v1 (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  receipt_id uuid not null references public.inventory_purchase_log(id) on delete restrict,
  old_purchase_source_id uuid not null,
  decision text not null check (decision in
     ('CONFIRM_EXTERNAL_EVIDENCE','REQUEST_ORIGINAL_SOURCE','KEEP_HISTORICAL_AUDIT')),
  evidence_id uuid references public.purchase_import_evidence(id) on delete restrict,
  evidence_reference text not null check (length(btrim(evidence_reference)) between 12 and 400),
  source_snapshot jsonb not null,
  reason text not null check (length(btrim(reason)) between 30 and 1000),
  reviewed_by uuid not null,
  reviewed_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  constraint orphan_owner_external_match_only
    check (decision='CONFIRM_EXTERNAL_EVIDENCE' or evidence_id is null),
  constraint orphan_owner_confirm_requires_id
    check (decision<>'CONFIRM_EXTERNAL_EVIDENCE' or evidence_id is not null)
);
create unique index if not exists orphan_receipt_owner_reviews_one_active_v1
 on private.orphan_receipt_owner_reviews_v1(brand_id,receipt_id)
 where revoked_at is null;
create index if not exists orphan_receipt_owner_reviews_receipt_idx_v1
 on private.orphan_receipt_owner_reviews_v1(brand_id,receipt_id);
alter table private.orphan_receipt_owner_reviews_v1 enable row level security;
revoke all on private.orphan_receipt_owner_reviews_v1 from public,anon,authenticated;

create or replace function private.owner_orphan_receipt_queue_v1(p_period date default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $queue$
declare v_brand uuid; v_result jsonb;
begin
  v_brand:=private.owner_stock_review_assert_v1();
  select coalesce(jsonb_agg(jsonb_build_object(
    'receipt_id',e.receipt_id,'purchase_date',e.purchase_date,
    'item_name',e.sku_name,'receipt_qty',e.receipt_qty,
    'receipt_unit',e.receipt_unit,'receipt_amount',e.receipt_amount,
    'stale_purchase_uuid',e.stale_purchase_uuid,
    'evidence_id',e.evidence_id,'evidence_source_file',e.evidence_source_file,
    'evidence_source_key',e.evidence_source_record_key,
    'evidence_status',e.lineage_triage,'baseline_effect',e.baseline_effect,
    'active_ledger_exposure',g.active_ledger_exposure,
    'movement_integrity_failed',g.movement_integrity_failed,
    'review_id',a.id,'review_decision',a.decision,
    'reviewed_at',a.reviewed_at,'review_evidence',a.evidence_reference,
    'status',case
      when g.active_ledger_exposure or g.movement_integrity_failed
        then 'BLOCK_LEDGER_INTEGRITY_REPAIR'
      when a.id is not null then 'DOCUMENTED_NOT_REBOUND'
      when e.lineage_triage in ('MAJOO_EVIDENCE_UNIQUE_REVIEW_ONLY',
                                'OTHER_EVIDENCE_UNIQUE_REVIEW_ONLY')
        then 'UNIQUE_EXTERNAL_EVIDENCE_TO_VERIFY'
      else 'NEEDS_ORIGINAL_SOURCE'
    end
  ) order by e.purchase_date desc,e.receipt_id),
  '[]'::jsonb) into v_result
  from private.inventory_receipt_lineage_triage_v1 e
  join private.orphan_receipt_active_ledger_gate_v1 g
    on g.brand_id=e.brand_id and g.receipt_id=e.receipt_id
  left join private.orphan_receipt_owner_reviews_v1 a
    on a.brand_id=e.brand_id and a.receipt_id=e.receipt_id
   and a.revoked_at is null
  where e.brand_id=v_brand
    and (p_period is null or
         date_trunc('month',e.purchase_date)::date=date_trunc('month',p_period)::date);
  return jsonb_build_object('items',v_result,'total',jsonb_array_length(v_result),
     'mode','documentary_only_no_stock_or_finance_mutation',
     'period',case when p_period is null then 'all'
                   else to_char(p_period,'YYYY-MM') end);
end;
$queue$;

create or replace function private.owner_orphan_receipt_preview_v1(
  p_receipt_id uuid,p_decision text)
returns jsonb language plpgsql stable security definer set search_path=''
as $preview$
declare v_brand uuid; e record; g record; v_payload jsonb;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 if p_receipt_id is null or p_decision not in
    ('CONFIRM_EXTERNAL_EVIDENCE','REQUEST_ORIGINAL_SOURCE','KEEP_HISTORICAL_AUDIT')
    or p_decision is null then
    raise exception 'Receipt dan keputusan review Owner wajib dipilih';
 end if;
 select * into e from private.inventory_receipt_lineage_triage_v1
 where brand_id=v_brand and receipt_id=p_receipt_id;
 if not found then raise exception 'Receipt ini bukan orphan Purchase historis milik merek'; end if;
 select * into g from private.orphan_receipt_active_ledger_gate_v1
 where brand_id=v_brand and receipt_id=p_receipt_id;
 if not found or g.active_ledger_exposure or g.movement_integrity_failed then
   raise exception 'Ledger aktif/movement tidak cocok: hentikan review dan eskalasi ke rekonsiliasi DBA';
 end if;
 if exists(select 1 from private.orphan_receipt_owner_reviews_v1 a
           where a.brand_id=v_brand and a.receipt_id=p_receipt_id and a.revoked_at is null) then
   raise exception 'Review aktif sudah ada; batalkan dahulu untuk revisi dengan jejak audit';
 end if;
 if p_decision='CONFIRM_EXTERNAL_EVIDENCE'
   and (e.evidence_id is null or
        e.lineage_triage not in ('MAJOO_EVIDENCE_UNIQUE_REVIEW_ONLY',
                                 'OTHER_EVIDENCE_UNIQUE_REVIEW_ONLY')) then
   raise exception 'Tidak ada faktur eksternal unik; dilarang mengonfirmasi bukti yang ambigu';
 end if;
 if p_decision='REQUEST_ORIGINAL_SOURCE'
   and e.evidence_id is not null then
   raise exception 'Sudah ada kandidat faktur unik; tinjau bukti atau pilih review historis';
 end if;
 v_payload:=jsonb_build_object(
   'brand_id',v_brand,'receipt_id',e.receipt_id,
   'old_purchase_source_id',e.stale_purchase_uuid,
   'purchase_date',e.purchase_date,'inventory_item_id',e.inventory_item_id,
   'item_name',e.sku_name,'receipt_qty',e.receipt_qty,
   'receipt_unit',e.receipt_unit,'receipt_amount',e.receipt_amount,
   'receipt_source_file',e.old_source_file,'receipt_source_row',e.old_source_row,
   'evidence_triage',e.lineage_triage,'evidence_id',
       case when p_decision='CONFIRM_EXTERNAL_EVIDENCE' then e.evidence_id else null end,
   'external_evidence_file',e.evidence_source_file,
   'external_evidence_key',e.evidence_source_record_key,
   'matching_evidence_rows',e.matching_evidence_rows,
   'baseline_effect',e.baseline_effect,'tracking_active',e.tracking_active,
   'last_opname_date',e.last_opname_date,
   'receipt_movement_count',g.receipt_movement_count,
   'movement_matching_keys',g.movement_matching_keys,
   'movement_qty',g.movement_qty,
   'active_ledger_exposure',g.active_ledger_exposure,
   'movement_integrity_failed',g.movement_integrity_failed,
   'decision',p_decision
 );
 return v_payload||jsonb_build_object('token',md5(v_payload::text),
   'will_rebind_source',false,'will_change_stock',false,'will_change_finance',false);
end;
$preview$;

create or replace function private.owner_orphan_receipt_apply_v1(
  p_receipt_id uuid,p_decision text,p_token text,
  p_evidence_reference text,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $apply$
declare v_brand uuid; v_id uuid; v_preview jsonb; v_found uuid;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 if length(btrim(coalesce(p_evidence_reference,''))) not between 12 and 400
    or length(btrim(coalesce(p_reason,''))) not between 30 and 1000 then
   raise exception 'Referensi bukti (12–400) dan catatan keputusan (30–1000 karakter) wajib';
 end if;
 if p_receipt_id is null then raise exception 'Receipt UUID wajib tersedia'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_receipt_id::text,419));
 select id into v_found from public.inventory_purchase_log
 where id=p_receipt_id and brand_id=v_brand for share;
 if not found then raise exception 'Receipt tidak ditemukan'; end if;
 v_preview:=private.owner_orphan_receipt_preview_v1(p_receipt_id,p_decision);
 if p_token is null or p_token is distinct from v_preview->>'token' then
   raise exception 'Ledger, bukti, atau identitas receipt berubah; ulang pratinjau';
 end if;
 insert into private.orphan_receipt_owner_reviews_v1(
   brand_id,receipt_id,old_purchase_source_id,decision,evidence_id,
   evidence_reference,source_snapshot,reason,reviewed_by)
 values(v_brand,p_receipt_id,(v_preview->>'old_purchase_source_id')::uuid,
        p_decision,nullif(v_preview->>'evidence_id','null')::uuid,
        btrim(p_evidence_reference),v_preview-'token',
        btrim(p_reason),auth.uid())
 returning id into v_id;
 return jsonb_build_object('review_id',v_id,
    'status','DOCUMENTED_NOT_REBOUND','will_rebind_source',false,
    'will_change_stock',false,'will_change_finance',false);
end;
$apply$;

create or replace function private.owner_orphan_receipt_revoke_v1(
 p_review_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $revoke$
declare v_brand uuid; a private.orphan_receipt_owner_reviews_v1%rowtype;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 if length(btrim(coalesce(p_reason,'')))<30 then
   raise exception 'Alasan revisi historis minimal 30 karakter';
 end if;
 select * into a from private.orphan_receipt_owner_reviews_v1
 where id=p_review_id and brand_id=v_brand for update;
 if not found then raise exception 'Persetujuan tidak ditemukan'; end if;
 if a.revoked_at is not null then
    return jsonb_build_object('already_revoked',true,'review_id',a.id);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(a.receipt_id::text,419));
 update private.orphan_receipt_owner_reviews_v1
 set revoked_at=clock_timestamp(),revoked_by=auth.uid(),
     revoke_reason=btrim(p_reason)
 where id=a.id;
 return jsonb_build_object('already_revoked',false,'review_id',a.id,
                           'stock_changed',false);
end;
$revoke$;

create or replace function public.owner_orphan_receipt_queue_v1(p_period date default null)
returns jsonb language sql stable security invoker set search_path=''
as $$select private.owner_orphan_receipt_queue_v1(p_period)$$;
create or replace function public.owner_orphan_receipt_preview_v1(
 p_receipt_id uuid,p_decision text)
returns jsonb language sql stable security invoker set search_path=''
as $$select private.owner_orphan_receipt_preview_v1(p_receipt_id,p_decision)$$;
create or replace function public.owner_orphan_receipt_apply_v1(
 p_receipt_id uuid,p_decision text,p_token text,p_evidence_reference text,p_reason text)
returns jsonb language sql security invoker set search_path=''
as $$select private.owner_orphan_receipt_apply_v1(
 p_receipt_id,p_decision,p_token,p_evidence_reference,p_reason)$$;
create or replace function public.owner_orphan_receipt_revoke_v1(
 p_review_id uuid,p_reason text)
returns jsonb language sql security invoker set search_path=''
as $$select private.owner_orphan_receipt_revoke_v1(p_review_id,p_reason)$$;

revoke all on function public.owner_orphan_receipt_queue_v1(date),
 public.owner_orphan_receipt_preview_v1(uuid,text),
 public.owner_orphan_receipt_apply_v1(uuid,text,text,text,text),
 public.owner_orphan_receipt_revoke_v1(uuid,text)
 from public,anon;
grant execute on function public.owner_orphan_receipt_queue_v1(date),
 public.owner_orphan_receipt_preview_v1(uuid,text),
 public.owner_orphan_receipt_apply_v1(uuid,text,text,text,text),
 public.owner_orphan_receipt_revoke_v1(uuid,text)
 to authenticated,service_role;
comment on table private.orphan_receipt_owner_reviews_v1 is
 'Owner documentary evidence only for historic orphan receipts. Does not rebind source UUID or mutate Inventory/Finance; all decisions and revocations auditable.';
