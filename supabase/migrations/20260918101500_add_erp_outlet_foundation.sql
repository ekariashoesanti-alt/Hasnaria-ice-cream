-- ERP foundation: multi-outlet master under the existing brand tenant boundary.
-- Additive only: no existing transactional table is changed in this migration.

begin;

create table if not exists public.outlets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  code text not null,
  name text not null,
  timezone text not null default 'Asia/Jakarta',
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outlets_code_nonempty check (btrim(code) <> ''),
  constraint outlets_name_nonempty check (btrim(name) <> '')
);

create unique index if not exists outlets_brand_code_uidx
  on public.outlets (brand_id, lower(btrim(code)));

create unique index if not exists outlets_brand_name_uidx
  on public.outlets (brand_id, lower(btrim(name)));

create index if not exists outlets_brand_active_idx
  on public.outlets (brand_id, active, name);

alter table public.outlets enable row level security;

drop policy if exists outlets_read_same_brand on public.outlets;
create policy outlets_read_same_brand
on public.outlets
for select to authenticated
using ((select private.same_brand(outlets.brand_id)));

drop policy if exists outlets_insert_owner on public.outlets;
create policy outlets_insert_owner
on public.outlets
for insert to authenticated
with check (
  (select private.same_brand(outlets.brand_id))
  and (
    (select private.is_owner())
    or (select private.is_super_admin())
  )
);

drop policy if exists outlets_update_owner on public.outlets;
create policy outlets_update_owner
on public.outlets
for update to authenticated
using (
  (select private.same_brand(outlets.brand_id))
  and (
    (select private.is_owner())
    or (select private.is_super_admin())
  )
)
with check (
  (select private.same_brand(outlets.brand_id))
  and (
    (select private.is_owner())
    or (select private.is_super_admin())
  )
);

drop policy if exists outlets_delete_owner on public.outlets;
create policy outlets_delete_owner
on public.outlets
for delete to authenticated
using (
  (select private.same_brand(outlets.brand_id))
  and (
    (select private.is_owner())
    or (select private.is_super_admin())
  )
);

grant select, insert, update, delete on public.outlets to authenticated;

comment on table public.outlets is
  'ERP outlet/store master. Existing data remains brand-scoped until outlet_id is introduced module-by-module.';

commit;
