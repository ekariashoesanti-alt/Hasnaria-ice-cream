-- Sales import foundation: preserve transaction identity and import provenance.
-- This migration is intentionally additive; existing sales/daily_metrics data is untouched.

create table if not exists public.sales_import_batches (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  filename text not null,
  file_hash text,
  source text not null default 'majoo',
  period_from date,
  period_to date,
  row_count integer not null default 0,
  transaction_count integer not null default 0,
  total_amount numeric not null default 0,
  status text not null default 'completed' check (status in ('preview','completed','failed','replaced')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.sales add column if not exists external_transaction_id text;
alter table public.sales add column if not exists source_batch_id uuid references public.sales_import_batches(id) on delete set null;

create unique index if not exists sales_brand_external_transaction_uidx
  on public.sales(brand_id, external_transaction_id)
  where external_transaction_id is not null;
create index if not exists idx_sales_source_batch on public.sales(source_batch_id);
create index if not exists idx_sales_brand_sold_at on public.sales(brand_id, sold_at);
create index if not exists idx_sales_import_batches_brand_created on public.sales_import_batches(brand_id, created_at desc);

alter table public.sales_import_batches enable row level security;
drop policy if exists brand_read_sales_import_batches on public.sales_import_batches;
create policy brand_read_sales_import_batches on public.sales_import_batches for select to authenticated using (same_brand(brand_id));
drop policy if exists brand_write_sales_import_batches on public.sales_import_batches;
create policy brand_write_sales_import_batches on public.sales_import_batches for all to authenticated using (same_brand(brand_id) and can_sales_write()) with check (same_brand(brand_id) and can_sales_write());
