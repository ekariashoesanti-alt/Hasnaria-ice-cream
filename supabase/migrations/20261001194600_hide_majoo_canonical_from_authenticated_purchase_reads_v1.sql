-- Defense in depth for legacy/direct UI readers of offline_purchase_history.
-- Majoo canonical rows stay in storage for audit but are hidden from authenticated business UI reads.

alter policy offline_purchase_history_read_same_brand
on public.offline_purchase_history
using (
  (select private.same_brand(offline_purchase_history.brand_id))
  and coalesce(offline_purchase_history.raw_data->>'canonical_source_type','') <> 'majoo'
);

comment on policy offline_purchase_history_read_same_brand on public.offline_purchase_history is
  'Authenticated business UI reads same-brand canonical Purchase rows except Majoo evidence-only rows; Majoo remains retained in evidence/history for audit.';
