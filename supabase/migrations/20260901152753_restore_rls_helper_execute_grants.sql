grant execute on function public.has_role(text[]) to authenticated;
grant execute on function public.can_sales_write() to authenticated;
grant execute on function public.can_ops_write() to authenticated;
grant execute on function public.can_stock_write() to authenticated;
grant execute on function public.can_social_write() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.same_brand(uuid) to authenticated;
grant execute on function public.is_active_member() to authenticated;
grant execute on function public.my_brand_id() to authenticated;

alter function public.sync_par_stock_qty() set search_path = '';
