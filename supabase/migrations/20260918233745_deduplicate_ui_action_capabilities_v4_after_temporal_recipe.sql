create or replace view public.ui_action_capabilities_v4
with (security_invoker=true)
as
select action_type,resolution_mode,rpc_name,input_schema,notes
from public.ui_action_capabilities_v3
where action_type not in ('zero_amount_purchase','missing_recipe','untracked_stock')
union all
select 'zero_amount_purchase'::text,'rpc'::text,'resolve_zero_amount_purchase_candidate'::text,
       '{"source_history_id":"uuid","resolution":"actual_amount|exclude","effective_amount":"number>0 required for actual_amount","reason":"text required"}'::jsonb,
       'Raw source remains unchanged. actual_amount supplies audited effective amount; exclude removes the source row from downstream mapping/posting.'::text
union all
select 'financing_payment_review'::text,'rpc'::text,'resolve_financing_payment_candidate'::text,
       '{"reason":"text recommended","cash_date":"date required for cash_paid","resolution":"cash_paid|liability_only|exclude","cash_amount":"number>0 required for cash_paid","source_history_id":"uuid"}'::jsonb,
       'Cashflow hanya berubah jika resolution=cash_paid; liability_only tetap non-cash.'::text
union all
select 'untracked_stock'::text,'rpc'::text,'resolve_physical_stock_opname'::text,
       '{"inventory_item_id":"uuid","physical_qty":"number>=0","opname_date":"date<=today","reason":"text required"}'::jsonb,
       'Physical count only. System quantity is read from the ledger; no stock value is guessed.'::text
union all
select 'missing_recipe'::text,'rpc'::text,'save_product_recipe_draft'::text,
       '{"product_id":"uuid","components":"array of {inventory_item_id,qty_per_sale>0}","reason":"text required"}'::jsonb,
       'Saves recipe as draft only. Recipe must be verified separately with effective_from before it can affect COGS or inventory consumption.'::text;

grant select on public.ui_action_capabilities_v4 to authenticated, service_role;