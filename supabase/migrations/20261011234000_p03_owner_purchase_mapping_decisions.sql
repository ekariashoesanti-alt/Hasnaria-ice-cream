-- Hasnaria P0.3: Owner evidence decisions on UNMATCHED / AMBIGUOUS
-- canonical Purchase rows. Documentation only: no purchase rule, Stock,
-- Finance, BOM, or existing Purchase history writes.
create table if not exists private.purchase_unmapped_owner_decisions_v1(
 id uuid primary key default gen_random_uuid(),
 brand_id uuid not null,
 source_history_id uuid not null references public.offline_purchase_history(id) on delete restrict,
 decision text not null check(decision in
  ('MAP_EXISTING_SKU','CLASSIFY_EXPENSE','NOT_FOR_STOCK','HOLD_FOR_EVIDENCE')),
 proposed_inventory_item_id uuid references public.inventory_items(id) on delete restrict,
 proposed_expense_category text,
 evidence_reference text not null check(length(btrim(evidence_reference)) between 12 and 400),
 reason text not null check(length(btrim(reason)) between 30 and 1000),
 source_snapshot jsonb not null,
 reviewed_by uuid not null,
 reviewed_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,revoked_by uuid,revoke_reason text,
 constraint p03_mapping_target_only check(
  (decision='MAP_EXISTING_SKU' and proposed_inventory_item_id is not null and proposed_expense_category is null)
  or (decision='CLASSIFY_EXPENSE' and proposed_inventory_item_id is null and
      proposed_expense_category in('Beban Administrasi','Beban Pemeliharaan',
                                    'Beban Bahan Baku','Beban Kepegawaian'))
  or (decision in('NOT_FOR_STOCK','HOLD_FOR_EVIDENCE') and
       proposed_inventory_item_id is null and proposed_expense_category is null))
);
create unique index if not exists p03_purchase_review_one_active
 on private.purchase_unmapped_owner_decisions_v1(brand_id,source_history_id)
 where revoked_at is null;
alter table private.purchase_unmapped_owner_decisions_v1 enable row level security;
revoke all on private.purchase_unmapped_owner_decisions_v1 from public,anon,authenticated;

create or replace function private.owner_purchase_unmapped_snapshot_v1(p_source uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $snap$
declare v_brand uuid;b record;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 select b.id,b.brand_id,b.source_period,b.source_file,b.row_no,b.purchase_date,
 b.item_name,b.quantity_text,b.unit_text,b.total_amount,b.quantity_numeric,
 b.mapping_status,b.inventory_match_count,b.inventory_item_id,b.rule_type,b.ready_for_inventory
 into b from public.purchase_inventory_bridge b
 where b.brand_id=v_brand and b.id=p_source
  and b.mapping_status in ('unmatched','ambiguous_inventory_name');
 if not found then raise exception 'Sumber tidak ada, sudah diklasifikasikan, atau bukan milik merek';end if;
 if exists(select 1 from public.inventory_purchase_log l
   where l.brand_id=v_brand and l.source_history_id=p_source) then
   raise exception 'Pembelian sudah ada receipt Stok; dilarang mengubah histori mapping';
 end if;
 return jsonb_build_object(
  'brand_id',v_brand,'source_id',b.id,'period',b.source_period,
  'purchase_date',b.purchase_date,'source_file',b.source_file,'row_no',b.row_no,
  'item_name',b.item_name,'quantity_text',b.quantity_text,'source_unit',b.unit_text,
  'amount',b.total_amount,'quantity_numeric',b.quantity_numeric,
  'mapping_status',b.mapping_status,'inventory_match_count',b.inventory_match_count,
  'inventory_item_id',b.inventory_item_id,'rule_type',b.rule_type,
  'ready_for_inventory',b.ready_for_inventory);
end;
$snap$;

create or replace function private.owner_purchase_unmapped_queue_v1(p_period date)
returns jsonb language plpgsql stable security definer set search_path=''
as $q$
declare v_brand uuid;v_rows jsonb;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 if p_period is null then raise exception 'Periode diperlukan';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'source_id',b.id,'purchase_date',b.purchase_date,'item_name',b.item_name,
   'mapping_status',b.mapping_status,'inventory_match_count',b.inventory_match_count,
   'quantity',b.quantity_numeric,'unit_text',b.unit_text,'amount',b.total_amount,
   'source_file',b.source_file,'row_no',b.row_no,
   'review_id',a.id,'review_decision',a.decision,
   'proposed_inventory_item_id',a.proposed_inventory_item_id,
   'proposed_expense_category',a.proposed_expense_category,
   'status',case when a.id is not null then 'DOCUMENTED_NOT_APPLIED'
                 else 'REQUIRES_OWNER_CLASSIFICATION' end)
 order by b.purchase_date,b.row_no,b.id),'[]'::jsonb) into v_rows
 from public.purchase_inventory_bridge b
 left join private.purchase_unmapped_owner_decisions_v1 a
   on a.brand_id=b.brand_id and a.source_history_id=b.id and a.revoked_at is null
 where b.brand_id=v_brand and b.source_period=date_trunc('month',p_period)::date
 and b.mapping_status in ('unmatched','ambiguous_inventory_name')
 and not exists(select 1 from public.inventory_purchase_log l
  where l.brand_id=b.brand_id and l.source_history_id=b.id);
 return jsonb_build_object('period',date_trunc('month',p_period)::date,
   'items',v_rows,'total',jsonb_array_length(v_rows),
   'mode','document_mapping_only_no_business_posting');
end;
$q$;

create or replace function private.owner_purchase_unmapped_preview_v1(
 p_source uuid,p_decision text,p_target uuid default null,p_expense text default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $pre$
declare v_brand uuid;v_src jsonb;v_item jsonb;v_target record;v_payload jsonb;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 if p_decision is null or p_decision not in
 ('MAP_EXISTING_SKU','CLASSIFY_EXPENSE','NOT_FOR_STOCK','HOLD_FOR_EVIDENCE') then
  raise exception 'Keputusan mapping wajib dipilih';
 end if;
 v_src:=private.owner_purchase_unmapped_snapshot_v1(p_source);
 if exists(select 1 from private.purchase_unmapped_owner_decisions_v1 a
  where a.brand_id=v_brand and a.source_history_id=p_source and a.revoked_at is null) then
  raise exception 'Keputusan aktif sudah ada; batalkan dulu agar histori tetap terlacak';
 end if;
 if p_decision='MAP_EXISTING_SKU' then
  if p_target is null or p_expense is not null then
   raise exception 'Pilih tepat satu target SKU, tanpa kategori Beban';end if;
  select i.id,i.item_name,i.unit into v_target
  from public.inventory_items i where i.brand_id=v_brand and i.id=p_target;
  if not found then raise exception 'Target SKU tidak ada atau milik brand lain';end if;
  v_item:=jsonb_build_object('item_id',v_target.id,
    'item_name',v_target.item_name,'stock_unit',v_target.unit);
 elsif p_decision='CLASSIFY_EXPENSE' then
  if p_target is not null or p_expense is null or p_expense not in
   ('Beban Administrasi','Beban Pemeliharaan','Beban Bahan Baku','Beban Kepegawaian') then
   raise exception 'Tentukan kategori Beban valid; jangan kirim SKU';end if;
 else
  if p_target is not null or p_expense is not null then
   raise exception 'Keputusan hold/nonstok tidak boleh memuat target atau Beban';end if;
 end if;
 v_payload:=v_src||jsonb_build_object(
  'decision',p_decision,'target_inventory_item_id',p_target,
  'expense_category',p_expense,'target_snapshot',v_item);
 return v_payload||jsonb_build_object('token',md5(v_payload::text),
  'stock_posted',false,'finance_posted',false,'rule_applied',false);
end;
$pre$;

create or replace function private.owner_purchase_unmapped_apply_v1(
 p_source uuid,p_decision text,p_target uuid,p_expense text,p_token text,
 p_evidence text,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $apply$
declare v_brand uuid;v_pre jsonb;v_review uuid;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 if length(btrim(coalesce(p_evidence,''))) not between 12 and 400
   or length(btrim(coalesce(p_reason,''))) not between 30 and 1000 then
  raise exception 'Bukti 12–400 dan alasan 30–1000 karakter wajib tersedia';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_source::text,433));
 perform 1 from public.offline_purchase_history p
  where p.brand_id=v_brand and p.id=p_source for share;
 if not found then raise exception 'Sumber Purchase berubah atau tidak valid';end if;
 v_pre:=private.owner_purchase_unmapped_preview_v1(p_source,p_decision,p_target,p_expense);
 if p_token is null or p_token is distinct from v_pre->>'token' then
  raise exception 'Sumber, mapping atau SKU berubah; periksa pratinjau ulang';
 end if;
 insert into private.purchase_unmapped_owner_decisions_v1(
  brand_id,source_history_id,decision,proposed_inventory_item_id,
  proposed_expense_category,evidence_reference,reason,source_snapshot,reviewed_by)
 values(v_brand,p_source,p_decision,p_target,p_expense,
  btrim(p_evidence),btrim(p_reason),v_pre-'token',auth.uid())
 returning id into v_review;
 return jsonb_build_object('review_id',v_review,'status','DOCUMENTED_NOT_APPLIED',
  'stock_posted',false,'finance_posted',false,'rule_applied',false);
end;
$apply$;

create or replace function private.owner_purchase_unmapped_revoke_v1(
 p_review uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $rev$
declare v_brand uuid;v_row private.purchase_unmapped_owner_decisions_v1%rowtype;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 if p_review is null or length(btrim(coalesce(p_reason,'')))<30 then
  raise exception 'Alasan pembatalan minimal 30 karakter';end if;
 select * into v_row from private.purchase_unmapped_owner_decisions_v1
  where id=p_review and brand_id=v_brand for update;
 if not found then raise exception 'Review tidak ditemukan';end if;
 if v_row.revoked_at is not null then return jsonb_build_object('already_revoked',true);end if;
 perform pg_advisory_xact_lock(hashtextextended(v_row.source_history_id::text,433));
 update private.purchase_unmapped_owner_decisions_v1
 set revoked_at=clock_timestamp(),revoked_by=auth.uid(),revoke_reason=btrim(p_reason)
 where id=v_row.id;
 return jsonb_build_object('already_revoked',false,'status','REVIEW_REOPENED');
end;
$rev$;

create or replace function public.owner_purchase_unmapped_queue_v1(p_period date)
returns jsonb language sql stable security invoker set search_path=''
as $$select private.owner_purchase_unmapped_queue_v1(p_period)$$;
create or replace function public.owner_purchase_unmapped_preview_v1(
 p_source uuid,p_decision text,p_target uuid default null,p_expense text default null)
returns jsonb language sql stable security invoker set search_path=''
as $$select private.owner_purchase_unmapped_preview_v1(p_source,p_decision,p_target,p_expense)$$;
create or replace function public.owner_purchase_unmapped_apply_v1(
 p_source uuid,p_decision text,p_target uuid,p_expense text,p_token text,
 p_evidence text,p_reason text)
returns jsonb language sql security invoker set search_path=''
as $$select private.owner_purchase_unmapped_apply_v1(p_source,p_decision,p_target,
 p_expense,p_token,p_evidence,p_reason)$$;
create or replace function public.owner_purchase_unmapped_revoke_v1(
 p_review uuid,p_reason text)
returns jsonb language sql security invoker set search_path=''
as $$select private.owner_purchase_unmapped_revoke_v1(p_review,p_reason)$$;
revoke all on function public.owner_purchase_unmapped_queue_v1(date),
 public.owner_purchase_unmapped_preview_v1(uuid,text,uuid,text),
 public.owner_purchase_unmapped_apply_v1(uuid,text,uuid,text,text,text,text),
 public.owner_purchase_unmapped_revoke_v1(uuid,text) from public,anon;
grant execute on function public.owner_purchase_unmapped_queue_v1(date),
 public.owner_purchase_unmapped_preview_v1(uuid,text,uuid,text),
 public.owner_purchase_unmapped_apply_v1(uuid,text,uuid,text,text,text,text),
 public.owner_purchase_unmapped_revoke_v1(uuid,text) to authenticated,service_role;
comment on table private.purchase_unmapped_owner_decisions_v1 is
 'P0.3 Owner document-only disposition for unresolved Purchase SKU mapping; no automatic posting to Stock, Finance or Purchase rules.';
