begin;
create index if not exists purchase_invoices_supplier_idx
  on public.purchase_invoices(supplier_id);
commit;
