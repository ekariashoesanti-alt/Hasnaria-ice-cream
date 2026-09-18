begin;
create index if not exists payment_settlements_outlet_idx
  on public.payment_settlements(outlet_id);
commit;
