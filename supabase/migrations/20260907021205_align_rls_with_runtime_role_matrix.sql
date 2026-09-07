-- Align database RLS with the runtime permission matrix.
-- Active non-pending members may read same-brand operational data.
-- Writes remain restricted to the role responsible for each domain.

-- Brands: a pending profile must not gain business visibility merely because it has a brand_id.
drop policy if exists brand_read_own_brand on public.brands;
create policy brand_read_own_brand
on public.brands
for select
to authenticated
using (
  ((id = (select private.my_brand_id())) and (select private.is_active_member()))
  or (select private.is_owner())
);

-- Daily metrics: read for active same-brand members; write only sales roles.
drop policy if exists brand_write_daily_metrics on public.daily_metrics;
create policy daily_metrics_read_same_brand
on public.daily_metrics for select to authenticated
using ((select private.same_brand(brand_id)));
create policy daily_metrics_insert_role
on public.daily_metrics for insert to authenticated
with check ((select private.same_brand(brand_id)) and (select private.can_sales_write()));
create policy daily_metrics_update_role
on public.daily_metrics for update to authenticated
using ((select private.same_brand(brand_id)) and (select private.can_sales_write()))
with check ((select private.same_brand(brand_id)) and (select private.can_sales_write()));
create policy daily_metrics_delete_role
on public.daily_metrics for delete to authenticated
using ((select private.same_brand(brand_id)) and (select private.can_sales_write()));

-- Expenses: UI permits creation only to Owner/Head/PIC; reads remain same-brand.
drop policy if exists expenses_insert_same_brand on public.expenses;
create policy expenses_insert_ops_role
on public.expenses for insert to authenticated
with check ((select private.same_brand(brand_id)) and (select private.can_ops_write()));

-- Normalized sales: all active same-brand members may read; writes only sales roles.
drop policy if exists brand_write_sales on public.sales;
create policy sales_read_same_brand
on public.sales for select to authenticated
using ((select private.same_brand(brand_id)));
create policy sales_insert_role
on public.sales for insert to authenticated
with check ((select private.same_brand(brand_id)) and (select private.can_sales_write()));
create policy sales_update_role
on public.sales for update to authenticated
using ((select private.same_brand(brand_id)) and (select private.can_sales_write()))
with check ((select private.same_brand(brand_id)) and (select private.can_sales_write()));
create policy sales_delete_role
on public.sales for delete to authenticated
using ((select private.same_brand(brand_id)) and (select private.can_sales_write()));

-- Sale items inherit brand visibility from their parent sale.
drop policy if exists brand_manage_sale_items on public.sale_items;
create policy sale_items_read_same_brand
on public.sale_items for select to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and (select private.same_brand(s.brand_id))
  )
);
create policy sale_items_insert_role
on public.sale_items for insert to authenticated
with check (
  exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and (select private.same_brand(s.brand_id))
      and (select private.can_sales_write())
  )
);
create policy sale_items_update_role
on public.sale_items for update to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and (select private.same_brand(s.brand_id))
      and (select private.can_sales_write())
  )
)
with check (
  exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and (select private.same_brand(s.brand_id))
      and (select private.can_sales_write())
  )
);
create policy sale_items_delete_role
on public.sale_items for delete to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and (select private.same_brand(s.brand_id))
      and (select private.can_sales_write())
  )
);

-- social_contents carries three domains:
--   HASNARIA_SHIFT / HASNARIA_HR -> operational roles (Owner/Head/PIC)
--   ordinary social platforms    -> social roles (Owner/Head/Marketing)
-- All active same-brand members may read the shared feed/dashboard data.
drop policy if exists brand_write_social on public.social_contents;
create policy social_contents_read_same_brand
on public.social_contents for select to authenticated
using ((select private.same_brand(brand_id)));
create policy social_contents_insert_domain_role
on public.social_contents for insert to authenticated
with check (
  (select private.same_brand(brand_id))
  and (
    (platform in ('HASNARIA_SHIFT','HASNARIA_HR') and (select private.can_ops_write()))
    or
    (platform not in ('HASNARIA_SHIFT','HASNARIA_HR') and (select private.can_social_write()))
  )
);
create policy social_contents_update_domain_role
on public.social_contents for update to authenticated
using (
  (select private.same_brand(brand_id))
  and (
    (platform in ('HASNARIA_SHIFT','HASNARIA_HR') and (select private.can_ops_write()))
    or
    (platform not in ('HASNARIA_SHIFT','HASNARIA_HR') and (select private.can_social_write()))
  )
)
with check (
  (select private.same_brand(brand_id))
  and (
    (platform in ('HASNARIA_SHIFT','HASNARIA_HR') and (select private.can_ops_write()))
    or
    (platform not in ('HASNARIA_SHIFT','HASNARIA_HR') and (select private.can_social_write()))
  )
);
create policy social_contents_delete_domain_role
on public.social_contents for delete to authenticated
using (
  (select private.same_brand(brand_id))
  and (
    (platform in ('HASNARIA_SHIFT','HASNARIA_HR') and (select private.can_ops_write()))
    or
    (platform not in ('HASNARIA_SHIFT','HASNARIA_HR') and (select private.can_social_write()))
  )
);
