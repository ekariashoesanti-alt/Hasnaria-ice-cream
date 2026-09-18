-- Complete ERP foundation master data: units, categories and lightweight customers.

begin;

create table if not exists public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete cascade,
  code text not null,
  name text not null,
  dimension text not null default 'count',
  base_unit_code text,
  conversion_to_base numeric not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint units_code_nonempty check (btrim(code)<>''),
  constraint units_name_nonempty check (btrim(name)<>''),
  constraint units_conversion_positive check (conversion_to_base>0)
);

create unique index if not exists units_global_code_uidx
  on public.units_of_measure(lower(btrim(code)))
  where brand_id is null;

create unique index if not exists units_brand_code_uidx
  on public.units_of_measure(brand_id,lower(btrim(code)))
  where brand_id is not null;

alter table public.units_of_measure enable row level security;

create policy units_read_available
on public.units_of_measure for select to authenticated
using (
  brand_id is null
  or (select private.same_brand(units_of_measure.brand_id))
);

create policy units_owner_insert
on public.units_of_measure for insert to authenticated
with check (
  units_of_measure.brand_id is not null
  and (select private.same_brand(units_of_measure.brand_id))
  and (select private.has_capability('settings.manage'))
);

create policy units_owner_update
on public.units_of_measure for update to authenticated
using (
  units_of_measure.brand_id is not null
  and (select private.same_brand(units_of_measure.brand_id))
  and (select private.has_capability('settings.manage'))
)
with check (
  units_of_measure.brand_id is not null
  and (select private.same_brand(units_of_measure.brand_id))
  and (select private.has_capability('settings.manage'))
);

grant select,insert,update on public.units_of_measure to authenticated;

insert into public.units_of_measure(brand_id,code,name,dimension,base_unit_code,conversion_to_base)
values
  (null,'pcs','Pieces','count','pcs',1),
  (null,'portion','Portion','count','portion',1),
  (null,'g','Gram','mass','g',1),
  (null,'kg','Kilogram','mass','g',1000),
  (null,'ml','Milliliter','volume','ml',1),
  (null,'l','Liter','volume','ml',1000),
  (null,'pack','Pack','count','pack',1),
  (null,'box','Box','count','box',1)
on conflict do nothing;

create table if not exists public.master_categories (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  domain text not null,
  code text not null,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint master_categories_domain_nonempty check (btrim(domain)<>''),
  constraint master_categories_code_nonempty check (btrim(code)<>''),
  constraint master_categories_name_nonempty check (btrim(name)<>'')
);

create unique index if not exists master_categories_brand_domain_code_uidx
  on public.master_categories(brand_id,lower(btrim(domain)),lower(btrim(code)));
create index if not exists master_categories_lookup_idx
  on public.master_categories(brand_id,domain,active,sort_order,name);
create index if not exists master_categories_created_by_idx
  on public.master_categories(created_by);

alter table public.master_categories enable row level security;

create policy master_categories_read_same_brand
on public.master_categories for select to authenticated
using ((select private.same_brand(master_categories.brand_id)));

create policy master_categories_owner_insert
on public.master_categories for insert to authenticated
with check (
  (select private.same_brand(master_categories.brand_id))
  and (select private.has_capability('settings.manage'))
);

create policy master_categories_owner_update
on public.master_categories for update to authenticated
using (
  (select private.same_brand(master_categories.brand_id))
  and (select private.has_capability('settings.manage'))
)
with check (
  (select private.same_brand(master_categories.brand_id))
  and (select private.has_capability('settings.manage'))
);

grant select,insert,update on public.master_categories to authenticated;

insert into public.master_categories(brand_id,domain,code,name,sort_order)
select b.id,x.domain,x.code,x.name,x.sort_order
from public.brands b
cross join (values
  ('expense','pembelian','Pembelian',10),
  ('expense','kompensasi','Kompensasi',20),
  ('expense','waste','Waste',30),
  ('expense','lainnya','Lainnya',100),
  ('inventory','bahan_baku','Bahan Baku',10),
  ('inventory','kemasan','Kemasan',20),
  ('inventory','produk_jadi','Produk Jadi',30),
  ('product','food','Food',10),
  ('product','beverage','Beverage',20),
  ('product','dessert','Dessert',30)
) x(domain,code,name,sort_order)
where lower(btrim(b.name))='hasnaria'
on conflict (brand_id,lower(btrim(domain)),lower(btrim(code))) do nothing;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  customer_code text,
  name text,
  phone text,
  email text,
  birth_date date,
  marketing_opt_in boolean not null default false,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  visit_count integer not null default 0,
  lifetime_revenue numeric not null default 0,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_identity_check check (
    nullif(btrim(coalesce(name,'')),'') is not null
    or nullif(btrim(coalesce(phone,'')),'') is not null
    or nullif(btrim(coalesce(email,'')),'') is not null
  ),
  constraint customers_visit_nonnegative check (visit_count>=0),
  constraint customers_revenue_nonnegative check (lifetime_revenue>=0)
);

create unique index if not exists customers_brand_code_uidx
  on public.customers(brand_id,lower(btrim(customer_code)))
  where customer_code is not null and btrim(customer_code)<>'';

create unique index if not exists customers_brand_phone_uidx
  on public.customers(brand_id,regexp_replace(phone,'[^0-9]+','','g'))
  where phone is not null and btrim(phone)<>'';

create index if not exists customers_brand_last_seen_idx
  on public.customers(brand_id,last_seen_at desc);
create index if not exists customers_created_by_idx on public.customers(created_by);

alter table public.customers enable row level security;

create policy customers_read_management
on public.customers for select to authenticated
using (
  (select private.same_brand(customers.brand_id))
  and (select private.has_role(array['owner','head_store','marketing']))
);

create policy customers_insert_ops
on public.customers for insert to authenticated
with check (
  (select private.same_brand(customers.brand_id))
  and (select private.has_role(array['owner','head_store','marketing','pic']))
);

create policy customers_update_management
on public.customers for update to authenticated
using (
  (select private.same_brand(customers.brand_id))
  and (select private.has_role(array['owner','head_store','marketing']))
)
with check (
  (select private.same_brand(customers.brand_id))
  and (select private.has_role(array['owner','head_store','marketing']))
);

grant select,insert,update on public.customers to authenticated;

comment on table public.units_of_measure is 'Canonical UOM registry. Global base units may be read by all authenticated users; brand-specific units are brand-scoped.';
comment on table public.master_categories is 'Canonical brand-scoped categories by business domain.';
comment on table public.customers is 'Optional lightweight CRM customer master; sales remain valid without customer identity.';

commit;
