drop policy if exists users_insert_own_profile on public.user_profiles;
create policy users_insert_own_profile on public.user_profiles
for insert to authenticated
with check (
  id = auth.uid()
  and role = 'pending'
  and status = 'active'
  and brand_id = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
);

drop policy if exists products_pending_self_insert on public.products;
create policy products_pending_self_insert on public.products
for insert to authenticated
with check (
  brand_id = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
  and split_part(name,'|',1) = 'HASNARIA_USER'
  and split_part(name,'|',2) = auth.uid()::text
  and split_part(name,'|',3) = 'pending'
);

revoke execute on function public.can_approve_expense(text,numeric) from public;
revoke execute on function public.guard_expense_update() from public;
revoke execute on function public.set_expense_requester() from public;
revoke execute on function public.sync_par_stock_qty() from public;
