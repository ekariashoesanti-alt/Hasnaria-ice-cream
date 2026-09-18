-- Clean up legacy inventory RLS policy overlap and index the opname actor FK.

begin;

drop policy if exists inventory_recipe_components_write_role on public.inventory_recipe_components;

create policy inventory_recipe_components_insert_role
on public.inventory_recipe_components
for insert to authenticated
with check (
  (select private.same_brand(inventory_recipe_components.brand_id))
  and (select private.can_stock_write())
);

create policy inventory_recipe_components_update_role
on public.inventory_recipe_components
for update to authenticated
using (
  (select private.same_brand(inventory_recipe_components.brand_id))
  and (select private.can_stock_write())
)
with check (
  (select private.same_brand(inventory_recipe_components.brand_id))
  and (select private.can_stock_write())
);

create policy inventory_recipe_components_delete_role
on public.inventory_recipe_components
for delete to authenticated
using (
  (select private.same_brand(inventory_recipe_components.brand_id))
  and (select private.can_stock_write())
);

drop policy if exists inventory_stock_history_write_role on public.inventory_stock_history;

create policy inventory_stock_history_insert_role
on public.inventory_stock_history
for insert to authenticated
with check (
  (select private.same_brand(inventory_stock_history.brand_id))
  and (select private.can_stock_write())
);

create policy inventory_stock_history_update_role
on public.inventory_stock_history
for update to authenticated
using (
  (select private.same_brand(inventory_stock_history.brand_id))
  and (select private.can_stock_write())
)
with check (
  (select private.same_brand(inventory_stock_history.brand_id))
  and (select private.can_stock_write())
);

create policy inventory_stock_history_delete_role
on public.inventory_stock_history
for delete to authenticated
using (
  (select private.same_brand(inventory_stock_history.brand_id))
  and (select private.can_stock_write())
);

drop policy if exists inventory_stock_opname_write_role on public.inventory_stock_opname;

create policy inventory_stock_opname_insert_role
on public.inventory_stock_opname
for insert to authenticated
with check (
  (select private.same_brand(inventory_stock_opname.brand_id))
  and (select private.can_stock_write())
);

create policy inventory_stock_opname_update_role
on public.inventory_stock_opname
for update to authenticated
using (
  (select private.same_brand(inventory_stock_opname.brand_id))
  and (select private.can_stock_write())
)
with check (
  (select private.same_brand(inventory_stock_opname.brand_id))
  and (select private.can_stock_write())
);

create policy inventory_stock_opname_delete_role
on public.inventory_stock_opname
for delete to authenticated
using (
  (select private.same_brand(inventory_stock_opname.brand_id))
  and (select private.can_stock_write())
);

create index if not exists inventory_stock_opname_created_by_idx
  on public.inventory_stock_opname(created_by);

commit;
