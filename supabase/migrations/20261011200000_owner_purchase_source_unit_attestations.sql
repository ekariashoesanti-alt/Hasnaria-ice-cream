-- HSN-P0 Stage 4: Owner verifies canonical Purchase units WITHOUT posting Stock.
-- Additive private evidence approvals: NO Purchase/Stock/Finance business DML.
-- Designed specifically for exact/alias mappings which the older Owner
-- unmatched-name mapping RPC deliberately does not accept.
-- A reviewed approval is documentary only. Later Stock posting needs its
-- own explicit and separately audited release.
create table if not exists private.purchase_unit_attestations_v1 (
 id uuid primary key default gen_random_uuid(),
 brand_id uuid not null,
 source_history_id uuid not null references public.offline_purchase_history(id) on delete restrict,
 inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
 source_unit text not null,
 stock_unit text not null,
 multiplier numeric not null check (multiplier>0 and multiplier<1000000),
 stock_qty numeric not null check (stock_qty>0),
 source_snapshot jsonb not null,
 evidence_reference text not null,
 reason text not null,
 reviewed_by uuid not null,
 reviewed_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,
 revoked_by uuid,
 revoke_reason text,
 constraint source_unit_attestation_text check (
  length(btrim(source_unit)) between 1 and 40
  and length(btrim(stock_unit)) between 1 and 40
  and length(btrim(evidence_reference)) between 12 and 400
  and length(btrim(reason)) between 20 and 1000)
);
create unique index if not exists purchase_unit_attestations_one_active_source_v1
on private.purchase_unit_attestations_v1(brand_id,source_history_id)
where revoked_at is null;
create index if not exists purchase_unit_attestations_inventory_lookup_v1
on private.purchase_unit_attestations_v1(brand_id,inventory_item_id);
alter table private.purchase_unit_attestations_v1 enable row level security;
revoke all on private.purchase_unit_attestations_v1 from public,anon,authenticated;

create or replace function private.owner_purchase_unit_queue_v1(p_period date)
returns jsonb language plpgsql stable security definer set search_path=''
as $q$
declare v_brand uuid; v_month date; v_result jsonb;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 if p_period is null then raise exception 'Pilih periode Pembelian'; end if;
 v_month:=date_trunc('month',p_period)::date;
 select coalesce(jsonb_agg(jsonb_build_object(
     'source_id',b.id,'purchase_date',b.purchase_date,
     'item_name',b.item_name,'source_qty',b.quantity_numeric,
     'canonical_source_unit',nullif(btrim(coalesce(b.unit_text,'')),''),
     'stock_qty_unverified',b.inventory_qty,'stock_unit',i.unit,
     'stock_item',i.item_name,'inventory_item_id',b.inventory_item_id,
     'amount',b.total_amount,'source_file',b.source_file,'row_no',b.row_no,
     'mapping_status',b.mapping_status,
     'last_opname_date',r.last_opname_date,
     'baseline_effect',case
       when r.last_opname_date is null then 'NO_PHYSICAL_BASELINE'
       when b.purchase_date<=r.last_opname_date then 'PRE_OR_ON_OPNAME'
       else 'POST_OPNAME' end,
     'approval_id',a.id,'approved_unit',a.source_unit,
     'approved_multiplier',a.multiplier,'approved_qty',a.stock_qty,
     'approved_at',a.reviewed_at,
     'status',case when a.id is not null then 'DOCUMENTED_NOT_POSTED'
                   else 'NEEDS_UNIT_VERIFICATION' end
   ) order by b.purchase_date desc,b.total_amount desc,b.id),
   '[]'::jsonb) into v_result
 from public.purchase_inventory_bridge b
 join public.inventory_items i on i.id=b.inventory_item_id and i.brand_id=b.brand_id
 left join public.inventory_stock_reconciliation r
   on r.brand_id=b.brand_id and r.inventory_item_id=b.inventory_item_id
 left join private.purchase_unit_attestations_v1 a
   on a.brand_id=b.brand_id and a.source_history_id=b.id and a.revoked_at is null
 where b.brand_id=v_brand and b.source_period=v_month
   and b.ready_for_inventory and b.inventory_item_id is not null
   and coalesce(b.quantity_numeric,0)>0 and coalesce(b.total_amount,0)>0
   and b.mapping_status in ('exact_name','inventory_alias')
   and not exists(select 1 from public.inventory_purchase_log l
                  where l.brand_id=b.brand_id and l.source_history_id=b.id);
 return jsonb_build_object('period',v_month,'items',v_result,
                           'total',jsonb_array_length(v_result),
                           'mode','unit_documentation_only_no_stock_post');
end;
$q$;

create or replace function private.owner_purchase_unit_preview_v1(
 p_source_id uuid,p_source_unit text,p_multiplier numeric)
returns jsonb language plpgsql stable security definer set search_path=''
as $pre$
declare v_brand uuid; b record; i record; v_last_opname date; v_unit text; v_payload jsonb;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 v_unit:=btrim(coalesce(p_source_unit,''));
 if p_source_id is null or length(v_unit) not between 1 and 40
    or lower(v_unit) in ('unknown','?', 'null','purchase_unit','unit','-')
    or p_multiplier is null or p_multiplier<=0 or p_multiplier>=1000000 then
   raise exception 'Satuan Pembelian dan faktor konversi harus jelas dan positif';
 end if;
 select * into b from public.purchase_inventory_bridge
 where id=p_source_id and brand_id=v_brand;
 if not found or not coalesce(b.ready_for_inventory,false)
    or b.mapping_status not in ('exact_name','inventory_alias')
    or coalesce(b.quantity_numeric,0)<=0 or coalesce(b.total_amount,0)<=0 then
   raise exception 'Sumber Pembelian tidak memenuhi syarat verifikasi satuan';
 end if;
 select id,item_name,unit,category into i from public.inventory_items
 where id=b.inventory_item_id and brand_id=v_brand;
 if not found or nullif(btrim(coalesce(i.unit,'')),'') is null
    or lower(btrim(i.unit))='purchase_unit' then
   raise exception 'Master SKU belum memiliki satuan stok yang sah';
 end if;
 if nullif(btrim(coalesce(b.unit_text,'')),'') is not null
    and lower(btrim(b.unit_text))<>lower(v_unit) then
   raise exception 'Satuan sumber aktif berbeda dari yang diisi Owner';
 end if;
 if lower(v_unit)=lower(btrim(i.unit)) and p_multiplier<>1 then
   raise exception 'Satuan sama wajib menggunakan faktor 1';
 end if;
 if b.quantity_numeric*p_multiplier>1000000000 then
   raise exception 'Hasil konversi tidak wajar, verifikasi kembali';
 end if;
 if exists(select 1 from public.inventory_purchase_log l
            where l.brand_id=v_brand and l.source_history_id=p_source_id) then
   raise exception 'Sumber ini sudah diposting ke Stok, gunakan audit histori';
 end if;
 if exists(select 1 from private.purchase_unit_attestations_v1 a
           where a.brand_id=v_brand and a.source_history_id=p_source_id
             and a.revoked_at is null) then
   raise exception 'Sudah ada verifikasi aktif; batalkan sebelum revisi';
 end if;
 select last_opname_date into v_last_opname from public.inventory_stock_reconciliation
 where brand_id=v_brand and inventory_item_id=i.id;
 v_payload:=jsonb_build_object(
    'brand_id',v_brand,'source_id',b.id,'source_file',b.source_file,
    'row_no',b.row_no,'purchase_date',b.purchase_date,
    'source_period',b.source_period,'canonical_loaded_at',b.canonical_loaded_at,
    'item_name',b.item_name,'source_qty',b.quantity_numeric,
    'canonical_unit',b.unit_text,'amount',b.total_amount,
    'inventory_item_id',i.id,'stock_item',i.item_name,
    'stock_unit',i.unit,'source_unit',v_unit,
    'multiplier',p_multiplier,'stock_qty',b.quantity_numeric*p_multiplier,
    'last_opname_date',v_last_opname,
    'baseline_effect',case when v_last_opname is null
        then 'NO_PHYSICAL_BASELINE'
        when b.purchase_date<=v_last_opname
        then 'PRE_OR_ON_OPNAME' else 'POST_OPNAME' end);
 return v_payload||jsonb_build_object('token',md5(v_payload::text),
                     'will_post_stock',false,'will_change_finance',false,
                     'mode','unit_documentation_only');
end;
$pre$;

create or replace function private.owner_purchase_unit_apply_v1(
 p_source_id uuid,p_source_unit text,p_multiplier numeric,
 p_token text,p_evidence text,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $apply$
declare v_brand uuid; v_preview jsonb; v_id uuid; v_source uuid;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 if length(btrim(coalesce(p_evidence,''))) not between 12 and 400
    or length(btrim(coalesce(p_reason,''))) not between 20 and 1000 then
  raise exception 'Sertakan referensi bukti (min 12 karakter) dan alasan (min 20 karakter)';
 end if;
 if p_source_id is null then raise exception 'Sumber Pembelian diperlukan'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_source_id::text,416));
 select id into v_source from public.offline_purchase_history
 where id=p_source_id and brand_id=v_brand for share;
 if not found then raise exception 'Sumber Pembelian tidak ditemukan'; end if;
 v_preview:=private.owner_purchase_unit_preview_v1(p_source_id,p_source_unit,p_multiplier);
 if p_token is null or p_token is distinct from v_preview->>'token' then
   raise exception 'Sumber atau kuantitas berubah, buat ulang pratinjau';
 end if;
 insert into private.purchase_unit_attestations_v1(
  brand_id,source_history_id,inventory_item_id,source_unit,stock_unit,
  multiplier,stock_qty,source_snapshot,evidence_reference,reason,reviewed_by)
 values(v_brand,p_source_id,(v_preview->>'inventory_item_id')::uuid,
  v_preview->>'source_unit',v_preview->>'stock_unit',p_multiplier,
  (v_preview->>'stock_qty')::numeric,v_preview-'token',
  btrim(p_evidence),btrim(p_reason),auth.uid())
 returning id into v_id;
 return jsonb_build_object('review_id',v_id,'status','DOCUMENTED_NOT_POSTED',
         'stock_qty',v_preview->'stock_qty','stock_unit',v_preview->'stock_unit',
         'will_post_stock',false,'will_change_finance',false);
end;
$apply$;

create or replace function private.owner_purchase_unit_revoke_v1(
 p_review_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $undo$
declare v_brand uuid; a private.purchase_unit_attestations_v1%rowtype;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 if length(btrim(coalesce(p_reason,'')))<20
    then raise exception 'Alasan revisi minimal 20 karakter'; end if;
 select * into a from private.purchase_unit_attestations_v1
 where id=p_review_id and brand_id=v_brand for update;
 if not found then raise exception 'Verifikasi tidak ditemukan'; end if;
 if a.revoked_at is not null then
   return jsonb_build_object('review_id',a.id,'already_revoked',true);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(a.source_history_id::text,416));
 if exists(select 1 from public.inventory_purchase_log l
   where l.brand_id=v_brand and l.source_history_id=a.source_history_id) then
   raise exception 'Stok telah diposting. Pembatalan wajib lewat rekonsiliasi.';
 end if;
 update private.purchase_unit_attestations_v1
 set revoked_at=clock_timestamp(),revoked_by=auth.uid(),
     revoke_reason=btrim(p_reason)
 where id=a.id;
 return jsonb_build_object('review_id',a.id,'already_revoked',false,
                            'stock_changed',false);
end;
$undo$;

-- Only exposed public RPC wrappers, each calls the private Owner-only
-- assertion through SECURITY DEFINER implementation. Do not grant table DML.
create or replace function public.owner_purchase_unit_queue_v1(p_period date)
returns jsonb language sql stable security invoker set search_path=''
as $$select private.owner_purchase_unit_queue_v1(p_period)$$;
create or replace function public.owner_purchase_unit_preview_v1(
 p_source_id uuid,p_source_unit text,p_multiplier numeric)
returns jsonb language sql stable security invoker set search_path=''
as $$select private.owner_purchase_unit_preview_v1(p_source_id,p_source_unit,p_multiplier)$$;
create or replace function public.owner_purchase_unit_apply_v1(
 p_source_id uuid,p_source_unit text,p_multiplier numeric,
 p_token text,p_evidence text,p_reason text)
returns jsonb language sql security invoker set search_path=''
as $$select private.owner_purchase_unit_apply_v1(p_source_id,p_source_unit,p_multiplier,p_token,p_evidence,p_reason)$$;
create or replace function public.owner_purchase_unit_revoke_v1(
 p_review_id uuid,p_reason text)
returns jsonb language sql security invoker set search_path=''
as $$select private.owner_purchase_unit_revoke_v1(p_review_id,p_reason)$$;
revoke all on function public.owner_purchase_unit_queue_v1(date),
 public.owner_purchase_unit_preview_v1(uuid,text,numeric),
 public.owner_purchase_unit_apply_v1(uuid,text,numeric,text,text,text),
 public.owner_purchase_unit_revoke_v1(uuid,text)
 from public,anon;
grant execute on function public.owner_purchase_unit_queue_v1(date),
 public.owner_purchase_unit_preview_v1(uuid,text,numeric),
 public.owner_purchase_unit_apply_v1(uuid,text,numeric,text,text,text),
 public.owner_purchase_unit_revoke_v1(uuid,text)
 to authenticated,service_role;
