-- Hasnaria security hardening applied to production on 2026-09-01.
-- Role-aware RLS, server-side authority protection, and removal of public RPC execution.

create or replace function public.has_role(allowed text[])
returns boolean language sql stable security definer set search_path=public
as $$ select exists (select 1 from public.user_profiles where id=auth.uid() and status='active' and role=any(allowed)); $$;

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
    if new.role is distinct from old.role or new.status is distinct from old.status or new.brand_id is distinct from old.brand_id then
      raise exception 'Only Owner may change role, status, or brand';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protect_user_profile_authority on public.user_profiles;
create trigger trg_protect_user_profile_authority before update on public.user_profiles for each row execute function public.protect_user_profile_authority();

create or replace function public.bootstrap_user_profile()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.id=auth.uid() then
    new.brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid;
    new.role='pending';
    new.status='active';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_bootstrap_user_profile on public.user_profiles;
create trigger trg_bootstrap_user_profile before insert on public.user_profiles for each row execute function public.bootstrap_user_profile();

-- Replace broad same-brand write policies with role-aware policies.
drop policy if exists brand_write_sales on public.sales;
create policy brand_write_sales on public.sales for all to authenticated using (same_brand(brand_id) and can_sales_write()) with check (same_brand(brand_id) and can_sales_write());
drop policy if exists brand_manage_sale_items on public.sale_items;
create policy brand_manage_sale_items on public.sale_items for all to authenticated using (exists (select 1 from public.sales s where s.id=sale_items.sale_id and same_brand(s.brand_id) and can_sales_write())) with check (exists (select 1 from public.sales s where s.id=sale_items.sale_id and same_brand(s.brand_id) and can_sales_write()));
drop policy if exists brand_write_daily_metrics on public.daily_metrics;
create policy brand_write_daily_metrics on public.daily_metrics for all to authenticated using (same_brand(brand_id) and can_sales_write()) with check (same_brand(brand_id) and can_sales_write());
drop policy if exists inventory_items_write_same_brand on public.inventory_items;
create policy inventory_items_write_role on public.inventory_items for all to authenticated using (same_brand(brand_id) and can_stock_write()) with check (same_brand(brand_id) and can_stock_write());
drop policy if exists inventory_purchase_log_write_same_brand on public.inventory_purchase_log;
create policy inventory_purchase_log_write_role on public.inventory_purchase_log for all to authenticated using (same_brand(brand_id) and can_stock_write()) with check (same_brand(brand_id) and can_stock_write());
drop policy if exists offline_purchase_history_write_same_brand on public.offline_purchase_history;
create policy offline_purchase_history_write_role on public.offline_purchase_history for all to authenticated using (same_brand(brand_id) and can_stock_write()) with check (same_brand(brand_id) and can_stock_write());
drop policy if exists offline_ops_history_write_same_brand on public.offline_ops_history;
create policy offline_ops_history_write_role on public.offline_ops_history for all to authenticated using (same_brand(brand_id) and can_ops_write()) with check (same_brand(brand_id) and can_ops_write());
drop policy if exists brand_write_social on public.social_contents;
create policy brand_write_social on public.social_contents for all to authenticated using (same_brand(brand_id) and can_social_write()) with check (same_brand(brand_id) and can_social_write());

drop policy if exists brand_write_products on public.products;
create policy products_read_same_brand on public.products for select to authenticated using (same_brand(brand_id));
create policy products_write_role on public.products for all to authenticated using (same_brand(brand_id) and has_role(array['owner','head_store','pic'])) with check (same_brand(brand_id) and has_role(array['owner','head_store','pic']));
create policy products_pending_self_insert on public.products for insert to authenticated with check (brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid and split_part(name,'|',1)='HASNARIA_USER' and split_part(name,'|',2)=auth.uid()::text and split_part(name,'|',3)='pending');

-- Expense approval remains role-gated by can_approve_expense().

drop policy if exists users_insert_own_profile on public.user_profiles;
create policy users_insert_own_profile on public.user_profiles for insert to authenticated with check (id=auth.uid() and role='pending' and status='active' and brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid);

-- Client RPC execution is removed. RLS may still use approved SECURITY DEFINER helpers.
revoke execute on function public.guard_expense_update() from public;
revoke execute on function public.set_expense_requester() from public;
revoke execute on function public.sync_par_stock_qty() from public;
revoke execute on function public.has_role(text[]) from public;
revoke execute on function public.can_sales_write() from public;
revoke execute on function public.can_ops_write() from public;
revoke execute on function public.can_stock_write() from public;
revoke execute on function public.can_social_write() from public;
revoke execute on function public.can_approve_expense(text,numeric) from public;
revoke execute on function public.is_owner() from public;
revoke execute on function public.same_brand(uuid) from public;
revoke execute on function public.is_active_member() from public;
revoke execute on function public.my_brand_id() from public;
grant execute on function public.has_role(text[]) to authenticated;
grant execute on function public.can_sales_write() to authenticated;
grant execute on function public.can_ops_write() to authenticated;
grant execute on function public.can_stock_write() to authenticated;
grant execute on function public.can_social_write() to authenticated;
grant execute on function public.can_approve_expense(text,numeric) to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.same_brand(uuid) to authenticated;
grant execute on function public.is_active_member() to authenticated;
grant execute on function public.my_brand_id() to authenticated;
