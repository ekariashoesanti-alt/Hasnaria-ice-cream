-- Keep Majoo evidence for backend audit, but remove it from authenticated business-runtime reads.
-- This prevents client-side canonical rebuilds from letting Majoo replace Excel business transactions.

alter policy purchase_import_evidence_read_same_brand
on public.purchase_import_evidence
using (
  (select private.same_brand(purchase_import_evidence.brand_id))
  and purchase_import_evidence.source_type <> 'majoo'
);

comment on policy purchase_import_evidence_read_same_brand on public.purchase_import_evidence is
  'Authenticated business runtime reads same-brand non-Majoo evidence only. Majoo evidence remains retained for backend audit and source verification.';
