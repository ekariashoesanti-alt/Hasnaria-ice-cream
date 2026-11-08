-- Singapore UAT: preserve *actual* daily transaction counts and amounts without inventing SKU quantities.
-- Raw 824 transaction IDs were deduplicated during client-side audit; only daily aggregates
-- and a monthly payment summary are retained here. Both are private / never canonical.

create table if not exists hasnaria_uat.transaction_daily_reference (
  batch_key text not null references hasnaria_uat.source_sets(batch_key),
  sale_date date not null,
  receipt_count integer not null check (receipt_count >= 0),
  gross_sales numeric(18,2) not null check (gross_sales >= 0),
  product_name_appearances integer not null check (product_name_appearances >= 0),
  primary key(batch_key,sale_date)
);

create table if not exists hasnaria_uat.transaction_payment_reference (
  batch_key text not null references hasnaria_uat.source_sets(batch_key),
  payment_method text not null check(length(btrim(payment_method)) between 1 and 150),
  receipt_count integer not null check(receipt_count >= 0),
  gross_sales numeric(18,2) not null check(gross_sales >= 0),
  primary key(batch_key,payment_method)
);

alter table hasnaria_uat.transaction_daily_reference enable row level security;
alter table hasnaria_uat.transaction_payment_reference enable row level security;
revoke all on all tables in schema hasnaria_uat from public, anon, authenticated;
