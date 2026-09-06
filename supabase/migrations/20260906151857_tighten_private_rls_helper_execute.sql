-- Private RLS helpers are callable only by authenticated policy evaluation.
revoke execute on all functions in schema private from public, anon;
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
revoke execute on function private.sync_legacy_roster_to_profile() from authenticated;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated;
