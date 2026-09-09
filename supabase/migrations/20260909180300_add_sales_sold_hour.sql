alter table public.sales
  add column if not exists sold_hour smallint;

alter table public.sales
  drop constraint if exists sales_sold_hour_range_check;

alter table public.sales
  add constraint sales_sold_hour_range_check
  check (sold_hour is null or sold_hour between 0 and 23);

create index if not exists idx_sales_brand_sold_at_hour
  on public.sales(brand_id, sold_at, sold_hour);
