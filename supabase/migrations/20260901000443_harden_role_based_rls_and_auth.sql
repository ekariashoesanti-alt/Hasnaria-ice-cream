create or replace function public.has_role(allowed text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid()
      and status = 'active'
      and role = any(allowed)
  );
$$;

create or replace function public.can_sales_write()
returns boolean language sql stable security definer set search_path=public
as $$ select public.has_role(array['owner','head_store','pic','pelaksana']); $$;

create or replace function public.can_ops_write()
returns boolean language sql stable security definer set search_path=public
as $$ select public.has_role(array['owner','head_store','pic']); $$;

create or replace function public.can_stock_write()
returns boolean language sql stable security definer set search_path=public
as $$ select public.has_role(array['owner','head_store','pic']); $$;

create or replace function public.can_social_write()
returns boolean language sql stable security definer set search_path=public
as $$ select public.has_role(array['owner','head_store','marketing']); $$;

create or replace function public.protect_user_profile_authority()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_owner() then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.brand_id is distinct from old.brand_id then
      raise exception 'Only Owner may change role, status, or brand';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_user_profile_authority on public.user_profiles;
create trigger trg_protect_user_profile_authority
before update on public.user_profiles
for each row execute function public.protect_user_profile_authority();

drop policy if exists brand_write_sales on public.sales;
create policy brand_write_sales on public.sales
for all to authenticated
using (same_brand(brand_id) and can_sales_write())
with check (same_brand(brand_id) and can_sales_write());

drop policy if exists brand_manage_sale_items on public.sale_items;
create policy brand_manage_sale_items on public.sale_items
for all to authenticated
using (exists (select 1 from public.sales s where s.id=sale_items.sale_id and same_brand(s.brand_id) and can_sales_write()))
with check (exists (select 1 from public.sales s where s.id=sale_items.sale_id and same_brand(s.brand_id) and can_sales_write()));

drop policy if exists brand_write_daily_metrics on public.daily_metrics;
create policy brand_write_daily_metrics on public.daily_metrics
for all to authenticated
using (same_brand(brand_id) and can_sales_write())
with check (same_brand(brand_id) and can_sales_write());

drop policy if exists inventory_items_write_same_brand on public.inventory_items;
create policy inventory_items_write_role on public.inventory_items
for all to authenticated
using (same_brand(brand_id) and can_stock_write())
with check (same_brand(brand_id) and can_stock_write());

drop policy if exists inventory_purchase_log_write_same_brand on public.inventory_purchase_log;
create policy inventory_purchase_log_write_role on public.inventory_purchase_log
for all to authenticated
using (same_brand(brand_id) and can_stock_write())
with check (same_brand(brand_id) and can_stock_write());

drop policy if exists offline_purchase_history_write_same_brand on public.offline_purchase_history;
create policy offline_purchase_history_write_role on public.offline_purchase_history
for all to authenticated
using (same_brand(brand_id) and can_stock_write())
with check (same_brand(brand_id) and can_stock_write());

drop policy if exists offline_ops_history_write_same_brand on public.offline_ops_history;
create policy offline_ops_history_write_role on public.offline_ops_history
for all to authenticated
using (same_brand(brand_id) and can_ops_write())
with check (same_brand(brand_id) and can_ops_write());

drop policy if exists brand_write_social on public.social_contents;
create policy brand_write_social on public.social_contents
for all to authenticated
using (same_brand(brand_id) and can_social_write())
with check (same_brand(brand_id) and can_social_write());

drop policy if exists brand_write_products on public.products;
create policy products_read_same_brand on public.products
for select to authenticated
using (same_brand(brand_id));
create policy products_write_role on public.products
for all to authenticated
using (same_brand(brand_id) and has_role(array['owner','head_store','pic']))
with check (same_brand(brand_id) and has_role(array['owner','head_store','pic']));
create policy products_pending_self_insert on public.products
for insert to authenticated
with check (
  brand_id = my_brand_id()
  and split_part(name,'|',1) = 'HASNARIA_USER'
  and split_part(name,'|',2) = auth.uid()::text
  and split_part(name,'|',3) = 'pending'
);

drop policy if exists expenses_insert_same_brand on public.expenses;
create policy expenses_insert_same_brand on public.expenses
for insert to authenticated
with check (same_brand(brand_id));

revoke execute on function public.can_approve_expense(text,numeric) from anon;
revoke execute on function public.can_approve_expense(text,numeric) from authenticated;
revoke execute on function public.guard_expense_update() from anon;
revoke execute on function public.guard_expense_update() from authenticated;
revoke execute on function public.set_expense_requester() from anon;
revoke execute on function public.set_expense_requester() from authenticated;
revoke execute on function public.sync_par_stock_qty() from anon;
revoke execute on function public.sync_par_stock_qty() from authenticated;
revoke execute on function public.has_role(text[]) from anon, authenticated;
revoke execute on function public.can_sales_write() from anon, authenticated;
revoke execute on function public.can_ops_write() from anon, authenticated;
revoke execute on function public.can_stock_write() from anon, authenticated;
revoke execute on function public.can_social_write() from anon, authenticated;
revoke execute on function public.is_owner() from anon, authenticated;
revoke execute on function public.same_brand(uuid) from anon, authenticated;
revoke execute on function public.is_active_member() from anon, authenticated;
revoke execute on function public.my_brand_id() from anon, authenticated;
