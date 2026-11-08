-- Singapore-only UAT source corpus for four uploaded Majoo reports.
-- Read-only source snapshots for relational integrity testing: NEVER join to active ledger for posting.
-- No grants to any browser role; service-side SQL audit only.
create schema if not exists hasnaria_uat;
revoke all on schema hasnaria_uat from public, anon, authenticated;

create table if not exists hasnaria_uat.source_sets (
  batch_key text primary key,
  master_products_sha256 text not null check(master_products_sha256 ~ '^[a-f0-9]{64}$'),
  master_recipe_sha256 text not null check(master_recipe_sha256 ~ '^[a-f0-9]{64}$'),
  detail_sales_sha256 text not null check(detail_sales_sha256 ~ '^[a-f0-9]{64}$'),
  monthly_sales_sha256 text not null check(monthly_sales_sha256 ~ '^[a-f0-9]{64}$'),
  expected_products integer not null check(expected_products between 1 and 10000),
  expected_ingredients integer not null check(expected_ingredients between 1 and 10000),
  expected_bom_lines integer not null check(expected_bom_lines between 1 and 100000),
  expected_sale_skus integer not null check(expected_sale_skus between 1 and 10000),
  expected_receipts integer not null check(expected_receipts between 1 and 100000),
  import_note text not null default 'Isolated UAT reference snapshot. No operational posting.',
  created_at timestamptz not null default now()
);

create table if not exists hasnaria_uat.product_master (
  batch_key text not null references hasnaria_uat.source_sets(batch_key),
  source_sku text not null,
  product_name text not null,
  sale_unit text,
  category text,
  PRIMARY KEY(batch_key,source_sku),
  CHECK (length(btrim(source_sku)) between 1 and 100),
  CHECK (length(btrim(product_name)) between 1 and 300)
);

create table if not exists hasnaria_uat.ingredient_master (
  batch_key text not null references hasnaria_uat.source_sets(batch_key),
  source_sku text not null,
  ingredient_name text not null,
  source_unit text,
  PRIMARY KEY(batch_key,source_sku),
  CHECK (length(btrim(source_sku)) between 1 and 100),
  CHECK (length(btrim(ingredient_name)) between 1 and 300)
);

create table if not exists hasnaria_uat.recipe_composition (
  batch_key text not null references hasnaria_uat.source_sets(batch_key),
  source_row_no integer not null check (source_row_no > 0),
  product_sku text not null,
  ingredient_sku text not null,
  quantity numeric(18,6) not null check (quantity > 0),
  source_unit text not null,
  PRIMARY KEY(batch_key,source_row_no),
  FOREIGN KEY (batch_key,product_sku) REFERENCES hasnaria_uat.product_master(batch_key,source_sku),
  FOREIGN KEY (batch_key,ingredient_sku) REFERENCES hasnaria_uat.ingredient_master(batch_key,source_sku)
);

create unique index if not exists hasnaria_uat_one_bom_component_per_product
on hasnaria_uat.recipe_composition(batch_key,product_sku,ingredient_sku);

alter table hasnaria_uat.source_sets enable row level security;
alter table hasnaria_uat.product_master enable row level security;
alter table hasnaria_uat.ingredient_master enable row level security;
alter table hasnaria_uat.recipe_composition enable row level security;

revoke all on all tables in schema hasnaria_uat from public, anon, authenticated;
