-- brands: keep one SELECT policy; split owner writes by command
drop policy if exists owner_manage_brands on public.brands;
create policy owner_insert_brands on public.brands for insert to authenticated
with check ((select private.is_owner()));
create policy owner_update_brands on public.brands for update to authenticated
using ((select private.is_owner())) with check ((select private.is_owner()));
create policy owner_delete_brands on public.brands for delete to authenticated
using ((select private.is_owner()));

-- inventory_items
drop policy if exists inventory_items_write_role on public.inventory_items;
create policy inventory_items_insert_role on public.inventory_items for insert to authenticated
with check ((select private.same_brand(brand_id)) and (select private.can_stock_write()));
create policy inventory_items_update_role on public.inventory_items for update to authenticated
using ((select private.same_brand(brand_id)) and (select private.can_stock_write()))
with check ((select private.same_brand(brand_id)) and (select private.can_stock_write()));
create policy inventory_items_delete_role on public.inventory_items for delete to authenticated
using ((select private.same_brand(brand_id)) and (select private.can_stock_write()));

-- inventory_purchase_log
drop policy if exists inventory_purchase_log_write_role on public.inventory_purchase_log;
create policy inventory_purchase_log_insert_role on public.inventory_purchase_log for insert to authenticated
with check ((select private.same_brand(brand_id)) and (select private.can_stock_write()));
create policy inventory_purchase_log_update_role on public.inventory_purchase_log for update to authenticated
using ((select private.same_brand(brand_id)) and (select private.can_stock_write()))
with check ((select private.same_brand(brand_id)) and (select private.can_stock_write()));
create policy inventory_purchase_log_delete_role on public.inventory_purchase_log for delete to authenticated
using ((select private.same_brand(brand_id)) and (select private.can_stock_write()));

-- offline_ops_history
drop policy if exists offline_ops_history_write_role on public.offline_ops_history;
create policy offline_ops_history_insert_role on public.offline_ops_history for insert to authenticated
with check ((select private.same_brand(brand_id)) and (select private.can_ops_write()));
create policy offline_ops_history_update_role on public.offline_ops_history for update to authenticated
using ((select private.same_brand(brand_id)) and (select private.can_ops_write()))
with check ((select private.same_brand(brand_id)) and (select private.can_ops_write()));
create policy offline_ops_history_delete_role on public.offline_ops_history for delete to authenticated
using ((select private.same_brand(brand_id)) and (select private.can_ops_write()));

-- offline_purchase_history
drop policy if exists offline_purchase_history_write_role on public.offline_purchase_history;
create policy offline_purchase_history_insert_role on public.offline_purchase_history for insert to authenticated
with check ((select private.same_brand(brand_id)) and (select private.can_stock_write()));
create policy offline_purchase_history_update_role on public.offline_purchase_history for update to authenticated
using ((select private.same_brand(brand_id)) and (select private.can_stock_write()))
with check ((select private.same_brand(brand_id)) and (select private.can_stock_write()));
create policy offline_purchase_history_delete_role on public.offline_purchase_history for delete to authenticated
using ((select private.same_brand(brand_id)) and (select private.can_stock_write()));

-- products: combine normal role insert with pending-self bootstrap
drop policy if exists products_write_role on public.products;
drop policy if exists products_pending_self_insert on public.products;
create policy products_insert_authorized on public.products for insert to authenticated
with check (
  ((select private.same_brand(brand_id)) and (select private.has_role(array['owner','head_store','pic']::text[])))
  or (
    brand_id = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
    and split_part(name,'|',1) = 'HASNARIA_USER'
    and split_part(name,'|',2) = (select auth.uid())::text
    and split_part(name,'|',3) = 'pending'
  )
);
create policy products_update_role on public.products for update to authenticated
using ((select private.same_brand(brand_id)) and (select private.has_role(array['owner','head_store','pic']::text[])))
with check ((select private.same_brand(brand_id)) and (select private.has_role(array['owner','head_store','pic']::text[])));
create policy products_delete_role on public.products for delete to authenticated
using ((select private.same_brand(brand_id)) and (select private.has_role(array['owner','head_store','pic']::text[])));

-- sales_import_batches
drop policy if exists brand_write_sales_import_batches on public.sales_import_batches;
create policy brand_insert_sales_import_batches on public.sales_import_batches for insert to authenticated
with check ((select private.same_brand(brand_id)) and (select private.can_sales_write()));
create policy brand_update_sales_import_batches on public.sales_import_batches for update to authenticated
using ((select private.same_brand(brand_id)) and (select private.can_sales_write()))
with check ((select private.same_brand(brand_id)) and (select private.can_sales_write()));
create policy brand_delete_sales_import_batches on public.sales_import_batches for delete to authenticated
using ((select private.same_brand(brand_id)) and (select private.can_sales_write()));

-- user_profiles: combine own + owner reads and updates
drop policy if exists owner_read_all_profiles on public.user_profiles;
drop policy if exists users_read_own_profile on public.user_profiles;
create policy profiles_read_own_or_owner on public.user_profiles for select to authenticated
using (((select auth.uid()) = id) or (select private.is_owner()));

drop policy if exists owner_manage_profiles on public.user_profiles;
drop policy if exists users_update_own_profile on public.user_profiles;
create policy profiles_update_own_or_owner on public.user_profiles for update to authenticated
using (((select auth.uid()) = id) or (select private.is_owner()))
with check (((select auth.uid()) = id) or (select private.is_owner()));
