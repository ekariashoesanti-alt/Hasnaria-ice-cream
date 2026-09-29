alter view public.payroll_lines_v1 set (security_invoker = true);
revoke all on table public.payroll_lines_v1 from anon, authenticated;
grant select on table public.payroll_lines_v1 to authenticated;
grant select on table public.payroll_lines_v1 to service_role;

alter function public.staff_daily_add_purchase_v1(text,date,text,numeric,text,numeric,numeric,text,text) set schema private;
alter function public.staff_daily_add_stock_v1(text,date,uuid,text,numeric,text) set schema private;
alter function public.staff_daily_context_v1(text,date) set schema private;
alter function public.staff_daily_remove_purchase_v1(text,uuid) set schema private;
alter function public.staff_daily_remove_stock_v1(text,uuid) set schema private;
alter function public.staff_daily_save_sales_v1(text,date,integer,numeric,numeric,numeric,text) set schema private;
alter function public.staff_daily_submit_v1(text,date) set schema private;
alter function public.staff_inventory_options_v1(text) set schema private;
alter function public.staff_session_context_v2(text) set schema private;
alter function public.staff_supervisor_batch_detail_v1(text,uuid) set schema private;
alter function public.staff_supervisor_decide_v1(text,uuid,text,text) set schema private;
alter function public.staff_supervisor_post_approved_v1(text,uuid) set schema private;
alter function public.staff_supervisor_queue_v1(text,date) set schema private;

revoke execute on function private.staff_daily_add_purchase_v1(text,date,text,numeric,text,numeric,numeric,text,text) from public;
revoke execute on function private.staff_daily_add_stock_v1(text,date,uuid,text,numeric,text) from public;
revoke execute on function private.staff_daily_context_v1(text,date) from public;
revoke execute on function private.staff_daily_remove_purchase_v1(text,uuid) from public;
revoke execute on function private.staff_daily_remove_stock_v1(text,uuid) from public;
revoke execute on function private.staff_daily_save_sales_v1(text,date,integer,numeric,numeric,numeric,text) from public;
revoke execute on function private.staff_daily_submit_v1(text,date) from public;
revoke execute on function private.staff_inventory_options_v1(text) from public;
revoke execute on function private.staff_session_context_v2(text) from public;
revoke execute on function private.staff_supervisor_batch_detail_v1(text,uuid) from public;
revoke execute on function private.staff_supervisor_decide_v1(text,uuid,text,text) from public;
revoke execute on function private.staff_supervisor_post_approved_v1(text,uuid) from public;
revoke execute on function private.staff_supervisor_queue_v1(text,date) from public;

grant execute on function private.staff_daily_add_purchase_v1(text,date,text,numeric,text,numeric,numeric,text,text) to anon, authenticated, service_role;
grant execute on function private.staff_daily_add_stock_v1(text,date,uuid,text,numeric,text) to anon, authenticated, service_role;
grant execute on function private.staff_daily_context_v1(text,date) to anon, authenticated, service_role;
grant execute on function private.staff_daily_remove_purchase_v1(text,uuid) to anon, authenticated, service_role;
grant execute on function private.staff_daily_remove_stock_v1(text,uuid) to anon, authenticated, service_role;
grant execute on function private.staff_daily_save_sales_v1(text,date,integer,numeric,numeric,numeric,text) to anon, authenticated, service_role;
grant execute on function private.staff_daily_submit_v1(text,date) to anon, authenticated, service_role;
grant execute on function private.staff_inventory_options_v1(text) to anon, authenticated, service_role;
grant execute on function private.staff_session_context_v2(text) to anon, authenticated, service_role;
grant execute on function private.staff_supervisor_batch_detail_v1(text,uuid) to anon, authenticated, service_role;
grant execute on function private.staff_supervisor_decide_v1(text,uuid,text,text) to anon, authenticated, service_role;
grant execute on function private.staff_supervisor_post_approved_v1(text,uuid) to anon, authenticated, service_role;
grant execute on function private.staff_supervisor_queue_v1(text,date) to anon, authenticated, service_role;

create function public.staff_daily_add_purchase_v1(p_token text,p_date date,p_item_name text,p_quantity numeric,p_unit_text text,p_unit_price numeric,p_total_amount numeric,p_payment_method text,p_notes text default null)
returns uuid language sql security invoker set search_path='' as $$ select private.staff_daily_add_purchase_v1($1,$2,$3,$4,$5,$6,$7,$8,$9); $$;
create function public.staff_daily_add_stock_v1(p_token text,p_date date,p_inventory_item_id uuid,p_movement_type text,p_qty_delta numeric,p_notes text default null)
returns uuid language sql security invoker set search_path='' as $$ select private.staff_daily_add_stock_v1($1,$2,$3,$4,$5,$6); $$;
create function public.staff_daily_context_v1(p_token text,p_date date)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.staff_daily_context_v1($1,$2); $$;
create function public.staff_daily_remove_purchase_v1(p_token text,p_id uuid)
returns boolean language sql security invoker set search_path='' as $$ select private.staff_daily_remove_purchase_v1($1,$2); $$;
create function public.staff_daily_remove_stock_v1(p_token text,p_id uuid)
returns boolean language sql security invoker set search_path='' as $$ select private.staff_daily_remove_stock_v1($1,$2); $$;
create function public.staff_daily_save_sales_v1(p_token text,p_date date,p_transaction_count integer,p_cash numeric,p_qris numeric,p_transfer numeric,p_notes text default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.staff_daily_save_sales_v1($1,$2,$3,$4,$5,$6,$7); $$;
create function public.staff_daily_submit_v1(p_token text,p_date date)
returns jsonb language sql security invoker set search_path='' as $$ select private.staff_daily_submit_v1($1,$2); $$;
create function public.staff_inventory_options_v1(p_token text)
returns table(inventory_item_id uuid,item_name text,category text,unit text,ledger_qty numeric,min_qty numeric,status text)
language sql stable security invoker set search_path='' as $$ select * from private.staff_inventory_options_v1($1); $$;
create function public.staff_session_context_v2(p_token text)
returns table(employee_id uuid,full_name text,brand_id uuid,outlet_id uuid,modules text[],expires_at timestamptz,is_supervisor boolean)
language sql security invoker set search_path='' as $$ select * from private.staff_session_context_v2($1); $$;
create function public.staff_supervisor_batch_detail_v1(p_token text,p_batch_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.staff_supervisor_batch_detail_v1($1,$2); $$;
create function public.staff_supervisor_decide_v1(p_token text,p_batch_id uuid,p_action text,p_reason text default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.staff_supervisor_decide_v1($1,$2,$3,$4); $$;
create function public.staff_supervisor_post_approved_v1(p_token text,p_batch_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.staff_supervisor_post_approved_v1($1,$2); $$;
create function public.staff_supervisor_queue_v1(p_token text,p_date date default null)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.staff_supervisor_queue_v1($1,$2); $$;

revoke execute on function public.staff_daily_add_purchase_v1(text,date,text,numeric,text,numeric,numeric,text,text) from public;
revoke execute on function public.staff_daily_add_stock_v1(text,date,uuid,text,numeric,text) from public;
revoke execute on function public.staff_daily_context_v1(text,date) from public;
revoke execute on function public.staff_daily_remove_purchase_v1(text,uuid) from public;
revoke execute on function public.staff_daily_remove_stock_v1(text,uuid) from public;
revoke execute on function public.staff_daily_save_sales_v1(text,date,integer,numeric,numeric,numeric,text) from public;
revoke execute on function public.staff_daily_submit_v1(text,date) from public;
revoke execute on function public.staff_inventory_options_v1(text) from public;
revoke execute on function public.staff_session_context_v2(text) from public;
revoke execute on function public.staff_supervisor_batch_detail_v1(text,uuid) from public;
revoke execute on function public.staff_supervisor_decide_v1(text,uuid,text,text) from public;
revoke execute on function public.staff_supervisor_post_approved_v1(text,uuid) from public;
revoke execute on function public.staff_supervisor_queue_v1(text,date) from public;

grant execute on function public.staff_daily_add_purchase_v1(text,date,text,numeric,text,numeric,numeric,text,text) to anon, authenticated, service_role;
grant execute on function public.staff_daily_add_stock_v1(text,date,uuid,text,numeric,text) to anon, authenticated, service_role;
grant execute on function public.staff_daily_context_v1(text,date) to anon, authenticated, service_role;
grant execute on function public.staff_daily_remove_purchase_v1(text,uuid) to anon, authenticated, service_role;
grant execute on function public.staff_daily_remove_stock_v1(text,uuid) to anon, authenticated, service_role;
grant execute on function public.staff_daily_save_sales_v1(text,date,integer,numeric,numeric,numeric,text) to anon, authenticated, service_role;
grant execute on function public.staff_daily_submit_v1(text,date) to anon, authenticated, service_role;
grant execute on function public.staff_inventory_options_v1(text) to anon, authenticated, service_role;
grant execute on function public.staff_session_context_v2(text) to anon, authenticated, service_role;
grant execute on function public.staff_supervisor_batch_detail_v1(text,uuid) to anon, authenticated, service_role;
grant execute on function public.staff_supervisor_decide_v1(text,uuid,text,text) to anon, authenticated, service_role;
grant execute on function public.staff_supervisor_post_approved_v1(text,uuid) to anon, authenticated, service_role;
grant execute on function public.staff_supervisor_queue_v1(text,date) to anon, authenticated, service_role;
