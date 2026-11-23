-- HSN-426 security follow-up: the project default privileges grant broad view
-- privileges to authenticated. Restrict the reporting view to read-only SELECT.
revoke all on public.ui_stock_purchase_usage_monthly_v1 from anon, authenticated, public;
grant select on public.ui_stock_purchase_usage_monthly_v1 to authenticated;
