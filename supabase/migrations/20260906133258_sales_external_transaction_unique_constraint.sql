drop index if exists public.sales_brand_external_transaction_uidx;
alter table public.sales drop constraint if exists sales_brand_external_transaction_key;
alter table public.sales add constraint sales_brand_external_transaction_key unique (brand_id, external_transaction_id);
