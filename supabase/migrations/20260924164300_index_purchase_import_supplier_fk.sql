create index if not exists purchase_import_evidence_supplier_id_idx
  on public.purchase_import_evidence(supplier_id)
  where supplier_id is not null;
