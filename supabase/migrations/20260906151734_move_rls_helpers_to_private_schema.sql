-- Keep authorization helpers out of the exposed public Data API schema.
-- Policies keep the same role/brand semantics but call private SECURITY DEFINER helpers.

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.has_role(allowed text[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and status = 'active' and role = any(allowed)
  );
$$;

create or replace function private.is_owner()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role = 'owner' and status = 'active'
  );
$$;

create or replace function private.is_active_member()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and status = 'active' and role <> 'pending'
  );
$$;

create or replace function private.my_brand_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select brand_id from public.user_profiles where id = auth.uid(); $$;

create or replace function private.same_brand(p_brand uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.is_active_member() and private.my_brand_id() is not distinct from p_brand; $$;

create or replace function private.can_sales_write()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_role(array['owner','head_store','pic','pelaksana']); $$;

create or replace function private.can_ops_write()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_role(array['owner','head_store','pic']); $$;

create or replace function private.can_stock_write()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_role(array['owner','head_store','pic']); $$;

create or replace function private.can_social_write()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_role(array['owner','head_store','marketing']); $$;

create or replace function private.can_approve_expense(p_category text, p_amount numeric)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid()
      and status = 'active'
      and (
        role = 'owner'
        or (role = 'head_store' and (
          (p_category = 'pembelian' and p_amount <= 1500000)
          or (p_category = 'kompensasi' and p_amount <= 50000)
          or (p_category = 'lainnya' and p_amount <= 500000)
          or p_category = 'waste'
        ))
      )
  );
$$;

grant execute on function private.has_role(text[]) to authenticated;
grant execute on function private.is_owner() to authenticated;
grant execute on function private.is_active_member() to authenticated;
grant execute on function private.my_brand_id() to authenticated;
grant execute on function private.same_brand(uuid) to authenticated;
grant execute on function private.can_sales_write() to authenticated;
grant execute on function private.can_ops_write() to authenticated;
grant execute on function private.can_stock_write() to authenticated;
grant execute on function private.can_social_write() to authenticated;
grant execute on function private.can_approve_expense(text,numeric) to authenticated;
revoke execute on function private.sync_legacy_roster_to_profile() from authenticated, anon, public;

alter policy brand_read_own_brand on public.brands using ((id = (select private.my_brand_id())) or (select private.is_owner()));
alter policy owner_manage_brands on public.brands using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy brand_write_daily_metrics on public.daily_metrics using ((select private.same_brand(brand_id)) and (select private.can_sales_write())) with check ((select private.same_brand(brand_id)) and (select private.can_sales_write()));
alter policy expenses_delete_owner on public.expenses using ((select private.same_brand(brand_id)) and (select private.is_owner()));
alter policy expenses_insert_same_brand on public.expenses with check ((select private.same_brand(brand_id)));
alter policy expenses_read_same_brand on public.expenses using ((select private.same_brand(brand_id)));
alter policy expenses_update_approval on public.expenses using ((select private.same_brand(brand_id)) and (select private.can_approve_expense(category,amount))) with check ((select private.same_brand(brand_id)) and (select private.can_approve_expense(category,amount)));
alter policy inventory_items_read_same_brand on public.inventory_items using ((select private.same_brand(brand_id)));
alter policy inventory_items_write_role on public.inventory_items using ((select private.same_brand(brand_id)) and (select private.can_stock_write())) with check ((select private.same_brand(brand_id)) and (select private.can_stock_write()));
alter policy inventory_purchase_log_read_same_brand on public.inventory_purchase_log using ((select private.same_brand(brand_id)));
alter policy inventory_purchase_log_write_role on public.inventory_purchase_log using ((select private.same_brand(brand_id)) and (select private.can_stock_write())) with check ((select private.same_brand(brand_id)) and (select private.can_stock_write()));
alter policy offline_ops_history_read_same_brand on public.offline_ops_history using ((select private.same_brand(brand_id)));
alter policy offline_ops_history_write_role on public.offline_ops_history using ((select private.same_brand(brand_id)) and (select private.can_ops_write())) with check ((select private.same_brand(brand_id)) and (select private.can_ops_write()));
alter policy offline_purchase_history_read_same_brand on public.offline_purchase_history using ((select private.same_brand(brand_id)));
alter policy offline_purchase_history_write_role on public.offline_purchase_history using ((select private.same_brand(brand_id)) and (select private.can_stock_write())) with check ((select private.same_brand(brand_id)) and (select private.can_stock_write()));
alter policy products_read_same_brand on public.products using ((select private.same_brand(brand_id)));
alter policy products_write_role on public.products using ((select private.same_brand(brand_id)) and (select private.has_role(array['owner','head_store','pic']))) with check ((select private.same_brand(brand_id)) and (select private.has_role(array['owner','head_store','pic'])));
alter policy brand_manage_sale_items on public.sale_items using (exists (select 1 from public.sales s where s.id = sale_items.sale_id and (select private.same_brand(s.brand_id)) and (select private.can_sales_write()))) with check (exists (select 1 from public.sales s where s.id = sale_items.sale_id and (select private.same_brand(s.brand_id)) and (select private.can_sales_write())));
alter policy brand_write_sales on public.sales using ((select private.same_brand(brand_id)) and (select private.can_sales_write())) with check ((select private.same_brand(brand_id)) and (select private.can_sales_write()));
alter policy brand_read_sales_import_batches on public.sales_import_batches using ((select private.same_brand(brand_id)));
alter policy brand_write_sales_import_batches on public.sales_import_batches using ((select private.same_brand(brand_id)) and (select private.can_sales_write())) with check ((select private.same_brand(brand_id)) and (select private.can_sales_write()));
alter policy brand_write_social on public.social_contents using ((select private.same_brand(brand_id)) and (select private.can_social_write())) with check ((select private.same_brand(brand_id)) and (select private.can_social_write()));
alter policy owner_manage_profiles on public.user_profiles using ((select private.is_owner())) with check ((select private.is_owner()));
alter policy owner_read_all_profiles on public.user_profiles using ((select private.is_owner()));

revoke execute on function public.has_role(text[]) from public, anon, authenticated;
revoke execute on function public.can_sales_write() from public, anon, authenticated;
revoke execute on function public.can_ops_write() from public, anon, authenticated;
revoke execute on function public.can_stock_write() from public, anon, authenticated;
revoke execute on function public.can_social_write() from public, anon, authenticated;
revoke execute on function public.can_approve_expense(text,numeric) from public, anon, authenticated;
revoke execute on function public.is_owner() from public, anon, authenticated;
revoke execute on function public.same_brand(uuid) from public, anon, authenticated;
revoke execute on function public.is_active_member() from public, anon, authenticated;
revoke execute on function public.my_brand_id() from public, anon, authenticated;
