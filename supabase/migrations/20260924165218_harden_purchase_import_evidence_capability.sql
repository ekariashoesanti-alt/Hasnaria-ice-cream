-- Tighten Purchase import evidence writes to authorized purchasing/import roles.
-- Read remains same-brand; INSERT/UPDATE/DELETE require purchasing import capability.

drop policy if exists purchase_import_evidence_insert_same_brand on public.purchase_import_evidence;
drop policy if exists purchase_import_evidence_update_same_brand on public.purchase_import_evidence;
drop policy if exists purchase_import_evidence_delete_same_brand on public.purchase_import_evidence;

create policy purchase_import_evidence_insert_authorized
  on public.purchase_import_evidence
  for insert to authenticated
  with check (
    (select private.same_brand(brand_id))
    and (select private.can_import_module('purchasing'))
  );

create policy purchase_import_evidence_update_authorized
  on public.purchase_import_evidence
  for update to authenticated
  using (
    (select private.same_brand(brand_id))
    and (select private.can_import_module('purchasing'))
  )
  with check (
    (select private.same_brand(brand_id))
    and (select private.can_import_module('purchasing'))
  );

create policy purchase_import_evidence_delete_authorized
  on public.purchase_import_evidence
  for delete to authenticated
  using (
    (select private.same_brand(brand_id))
    and (select private.can_import_module('purchasing'))
  );
