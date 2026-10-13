-- HSN-P0 historical Purchase/Stock lineage audit — READ ONLY VIEW.
-- No INSERT, UPDATE or DELETE of Hasnaria business records.
-- Keep this under private (not exposed in the public Data API).
-- A unique matching factuur is an EVIDENCE candidate, NOT a canonical Purchase
-- UUID; do not use it to write offline_purchase_history or financial journals.
-- Product and amount matching deliberately requires five independent fields:
-- purchase_date + normalized SKU/name + qty + original unit + total_amount.
-- Both the receipt AND invoice evidence must have unique cardinality.

create or replace view private.inventory_receipt_lineage_triage_v1
with (security_invoker = true)
as
with orphans as (
 select l.brand_id,
        l.id as receipt_id,
        l.source_history_id as stale_purchase_uuid,
        l.inventory_item_id,
        i.item_name as sku_name,
        i.unit as stock_unit,
        l.purchase_date,
        l.qty as receipt_qty,
        l.unit as receipt_unit,
        l.total_amount as receipt_amount,
        l.source_file as old_source_file,
        l.source_row_no as old_source_row,
        l.created_at as receipt_created_at,
        coalesce(r.tracking_active,false) as tracking_active,
        r.last_opname_date,
        case when coalesce(r.tracking_active,false)
                  and l.purchase_date<=r.last_opname_date
             then 'BEFORE_OR_ON_LAST_OPNAME'
             when coalesce(r.tracking_active,false)
                  and l.purchase_date>r.last_opname_date
             then 'AFTER_LAST_OPNAME'
             else 'NO_PHYSICAL_OPNAME' end as baseline_effect
 from public.inventory_purchase_log l
 join public.inventory_items i
   on i.brand_id=l.brand_id and i.id=l.inventory_item_id
 left join public.offline_purchase_history p
   on p.brand_id=l.brand_id and p.id=l.source_history_id
 left join public.inventory_stock_reconciliation r
   on r.brand_id=l.brand_id and r.inventory_item_id=l.inventory_item_id
 where l.source_history_id is not null and p.id is null
), candidates as (
 select o.receipt_id,o.brand_id,
        e.id as evidence_id,e.source_type as evidence_source_type,
        e.source_file as evidence_source_file,
        e.source_record_key,e.row_no as evidence_row_no,
        e.quantity as evidence_qty,e.unit_text as evidence_unit,
        e.total_amount as evidence_amount,e.source_status as evidence_status
 from orphans o
 join public.purchase_import_evidence e
   on e.brand_id=o.brand_id
  and e.purchase_date=o.purchase_date
  and e.quantity=o.receipt_qty
  and e.total_amount=o.receipt_amount
  and lower(btrim(coalesce(e.unit_text,'')))=lower(btrim(coalesce(o.receipt_unit,'')))
  and regexp_replace(lower(coalesce(e.item_name,'')),'[^a-z0-9]','','g')
     =regexp_replace(lower(coalesce(o.sku_name,'')),'[^a-z0-9]','','g')
 where nullif(btrim(coalesce(e.source_record_key,'')),'') is not null
), candidate_counts as (
 select receipt_id,count(*) as candidate_count from candidates group by receipt_id
), evidence_claims as (
 select evidence_id,count(*) as receipt_claim_count from candidates group by evidence_id
), key_claims as (
 select brand_id,source_record_key,count(distinct receipt_id) as key_receipt_claim_count
 from candidates group by brand_id,source_record_key
), eligible as (
 select c.*, ec.receipt_claim_count,kc.key_receipt_claim_count
 from candidates c
 join evidence_claims ec on ec.evidence_id=c.evidence_id
 join key_claims kc on kc.brand_id=c.brand_id
                   and kc.source_record_key=c.source_record_key
 join candidate_counts cc on cc.receipt_id=c.receipt_id
 where cc.candidate_count=1
   and ec.receipt_claim_count=1
   and kc.key_receipt_claim_count=1
)
select o.brand_id,o.receipt_id,o.stale_purchase_uuid,o.inventory_item_id,
       o.sku_name,o.stock_unit,o.purchase_date,
       o.receipt_qty,o.receipt_unit,o.receipt_amount,
       o.old_source_file,o.old_source_row,o.receipt_created_at,
       o.tracking_active,o.last_opname_date,o.baseline_effect,
       coalesce(cc.candidate_count,0) as matching_evidence_rows,
       case
         when coalesce(cc.candidate_count,0)=0 then 'NO_EVIDENCE_MATCH'
         when v.evidence_id is not null and v.evidence_source_type='majoo'
           then 'MAJOO_EVIDENCE_UNIQUE_REVIEW_ONLY'
         when v.evidence_id is not null then 'OTHER_EVIDENCE_UNIQUE_REVIEW_ONLY'
         else 'AMBIGUOUS_EVIDENCE_MANUAL_REVIEW'
       end as lineage_triage,
       v.evidence_id,v.source_record_key as evidence_source_record_key,
       v.evidence_source_file,v.evidence_row_no,
       v.evidence_qty,v.evidence_unit,v.evidence_amount,v.evidence_status,
       case
        when v.evidence_id is not null
         then 'Verify external invoice + source key; preserve receipt UUID and do not create canonical Purchase/Finance posting'
        else 'Request original source file/invoice; cannot auto-rebind by row number or amount'
       end as recommended_action
from orphans o
left join candidate_counts cc on cc.receipt_id=o.receipt_id
left join eligible v on v.receipt_id=o.receipt_id;

comment on view private.inventory_receipt_lineage_triage_v1 is
 'Read-only historical orphan Stock source audit. Unique invoice evidence is a review hint, never an auto-repair of canonical Purchase/Finance.';
