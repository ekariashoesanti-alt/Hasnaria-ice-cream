-- HSN-P0: keep audited Owner Stock review undo working with receipt guard.
-- Security: owner_stock_review_assert_v1 + source snapshot, period, movement and
-- finance fingerprint checks are PRESERVED verbatim from the live function.
-- Source change and old receipt deletion remain forbidden outside this audited
-- owner-initiated, transaction-atomic review reversal.
-- The review marker is set before DELETE so the receipt guard can recognize
-- an authorized reversal (both changes commit or both roll back).
-- Run only after migration 20261011190000_guard_purchase_receipt_verified_units.sql.

CREATE OR REPLACE FUNCTION private.owner_stock_review_undo_v1(p_review_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b uuid; r private.purchase_stock_reviews%rowtype; l public.inventory_purchase_log%rowtype; s jsonb; before_fin jsonb; m date;
begin
 b:=private.owner_stock_review_assert_v1();
 if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Alasan pembatalan minimal 10 karakter'; end if;
 select * into r from private.purchase_stock_reviews where id=p_review_id and brand_id=b;
 if not found then raise exception 'Review tidak ditemukan'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.source_history_id::text,416));
 perform 1 from public.offline_purchase_history where id=r.source_history_id and brand_id=b for update;
 select * into r from private.purchase_stock_reviews where id=p_review_id and brand_id=b for update;
 if r.reverted_at is not null then return jsonb_build_object('review_id',r.id,'already_reverted',true); end if;
 perform 1 from public.inventory_items where id=r.inventory_item_id for update;
 select to_jsonb(x)-'canonical_loaded_at'-'created_at' into s from private.purchase_inventory_pre_review_v1 x where id=r.source_history_id and brand_id=b;
 if s is distinct from r.source_snapshot then raise exception 'Sumber/rule berubah; perlu rekonsiliasi sebelum pembatalan'; end if;
 perform private.assert_purchase_period_open_v1(b,(s->>'source_period')::date,(s->>'purchase_date')::date);
 select * into l from public.inventory_purchase_log where source_history_id=r.source_history_id for update;
 if not found or (to_jsonb(l)-'notes'-'mapping_method') is distinct from (r.log_snapshot-'notes'-'mapping_method') then raise exception 'Posting stok berubah; perlu rekonsiliasi sebelum pembatalan'; end if;
 if exists(select 1 from public.inventory_movements x where x.inventory_item_id=r.inventory_item_id and x.created_at>r.reviewed_at and x.reference_id is distinct from l.id and x.qty_delta<0) then raise exception 'Ada pemakaian stok setelah review; pembatalan otomatis ditolak'; end if;
 m:=date_trunc('month',l.purchase_date)::date;
 before_fin:=private.finance_period_journal_fingerprint_v1(b,m);
 -- Mark reviewed rollback BEFORE deleting the receipt. The guarded
 -- BEFORE DELETE trigger checks this privileged, auditable same-transaction
 -- authorization. Any later failure rolls back the review and the deletion.
 update private.purchase_stock_reviews
 set reverted_at=clock_timestamp(),reverted_by=auth.uid(),
     revert_reason=btrim(p_reason)
 where id=r.id and reverted_at is null;
 delete from public.inventory_purchase_log where id=l.id;
 perform private.write_audit_log(b,null,'purchase_stock_review',r.id,'undo',auth.uid(),to_jsonb(r),jsonb_build_object('reverted',true,'removed_log',l.id),p_reason,jsonb_build_object('scope','one_source_row','quantity_only',true));
 if before_fin is distinct from private.finance_period_journal_fingerprint_v1(b,m) then raise exception 'Finance berubah; transaksi dibatalkan'; end if;
 return jsonb_build_object('review_id',r.id,'already_reverted',false);
end $function$;

comment on function private.owner_stock_review_undo_v1(uuid,text) is
 'HSN-P0 guarded undo: owner review reverted first within same transaction; receipt delete permitted only for audited matching review.';
