-- Hasnaria ERP foundation regression specification.
-- Safe to run in a transaction; no permanent business data is created.

begin;

-- Core ERP tables must exist.
do $$
declare missing integer;
begin
  select count(*) into missing
  from (values
    ('outlets'),('import_jobs'),('approval_rules'),('approval_requests'),
    ('audit_logs'),('exception_events'),('suppliers'),('purchase_requests'),
    ('purchase_orders'),('goods_receipts'),('purchase_invoices'),
    ('purchase_payments'),('inventory_movements'),('business_settings'),
    ('accounting_periods'),('cash_sessions'),('payment_settlements'),('budgets'),
    ('approval_delegations'),('automation_jobs'),('automation_runs'),
    ('units_of_measure'),('master_categories'),('customers'),
    ('employees'),('shift_templates'),('shift_roster'),('attendance'),
    ('leave_requests'),('overtime_records'),('training_records'),
    ('marketing_campaigns'),('campaign_metrics'),('promotions'),
    ('sale_attributions'),('feedback_cases')
  ) v(name)
  where to_regclass('public.'||v.name) is null;

  if missing<>0 then
    raise exception 'Missing ERP core tables: %',missing;
  end if;
end $$;

-- Approval requests cannot be forged directly by authenticated clients.
do $$
begin
  if has_table_privilege('authenticated','public.approval_requests','INSERT')
     or has_table_privilege('authenticated','public.approval_requests','UPDATE')
     or has_table_privilege('authenticated','public.approval_requests','DELETE') then
    raise exception 'authenticated must not have direct approval request mutation grants';
  end if;
end $$;

-- Default purchase approval routing.
do $$
declare v_small text; v_large text; v_head text;
begin
  select (private.match_approval_rule(
    'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid,
    'purchase_request',null,'pic',1000000
  )).approver_role into v_small;

  select (private.match_approval_rule(
    'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid,
    'purchase_request',null,'pic',2000000
  )).approver_role into v_large;

  select (private.match_approval_rule(
    'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid,
    'purchase_request',null,'head_store',500000
  )).approver_role into v_head;

  if v_small<>'head_store' or v_large<>'owner' or v_head<>'owner' then
    raise exception 'Purchase approval rule regression: %, %, %',v_small,v_large,v_head;
  end if;
end $$;

-- Canonical inventory ledger must reconcile to the existing proven reconciliation.
do $$
declare mismatches integer;
begin
  select count(*) into mismatches
  from public.inventory_stock_reconciliation r
  join public.inventory_ledger_balance l
    on l.brand_id=r.brand_id
   and l.inventory_item_id=r.inventory_item_id
  where abs(coalesce(r.system_qty,0)-coalesce(l.ledger_qty,0))>0.000001;

  if mismatches<>0 then
    raise exception 'Inventory ledger mismatch count: %',mismatches;
  end if;
end $$;

-- Public privileged RPCs must be SECURITY INVOKER wrappers.
do $$
declare bad integer;
begin
  select count(*) into bad
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in (
      'decide_approval_request','create_approval_request',
      'submit_purchase_request','create_purchase_order_from_request',
      'issue_purchase_order','post_goods_receipt',
      'create_purchase_invoice_from_po','post_inventory_movement',
      'open_cash_session','close_cash_session','reconcile_payment_settlement',
      'close_accounting_period','reopen_accounting_period',
      'create_approval_delegation','revoke_approval_delegation',
      'attendance_check_in','attendance_check_out','submit_leave_request'
    )
    and p.prosecdef;

  if bad<>0 then
    raise exception 'Public ERP RPC must not be SECURITY DEFINER: %',bad;
  end if;
end $$;

-- Incomplete COGS must never produce false profit precision.
do $$
declare bad integer;
begin
  select count(*) into bad
  from public.executive_kpi_snapshot
  where cogs_coverage_pct<99.9
    and (gross_profit_mtd is not null or gross_margin_pct is not null or operating_profit_mtd is not null);

  if bad<>0 then
    raise exception 'Executive COGS guard regression: % rows show profit with incomplete costing',bad;
  end if;
end $$;

-- Canonical executive/operational views must resolve.
do $$
declare missing integer;
begin
  select count(*) into missing
  from (values
    ('inventory_ledger_balance'),('accounts_payable_aging'),
    ('business_alerts'),('approval_queue'),('executive_dashboard_snapshot'),
    ('workforce_mtd_summary'),('marketing_mtd_summary')
  ) v(name)
  where to_regclass('public.'||v.name) is null;

  if missing<>0 then
    raise exception 'Missing ERP reporting views: %',missing;
  end if;
end $$;

rollback;
