drop policy if exists purchase_import_evidence_write_same_brand on public.purchase_import_evidence;

create policy purchase_import_evidence_insert_same_brand
  on public.purchase_import_evidence
  for insert to authenticated
  with check ((select private.same_brand(purchase_import_evidence.brand_id)));

create policy purchase_import_evidence_update_same_brand
  on public.purchase_import_evidence
  for update to authenticated
  using ((select private.same_brand(purchase_import_evidence.brand_id)))
  with check ((select private.same_brand(purchase_import_evidence.brand_id)));

create policy purchase_import_evidence_delete_same_brand
  on public.purchase_import_evidence
  for delete to authenticated
  using ((select private.same_brand(purchase_import_evidence.brand_id)));
