-- Keep Purchase -> Finance posting canonical on every open-period Finance refresh.
-- The base rebuild historically posted purchases from raw analytics_group, while
-- the Purchase UI now classifies rows through purchase_inventory_bridge and
-- finance_purchase_expense_bridge_v1. This post-rebuild reconciler makes the
-- canonical classification authoritative:
--   inventory -> 1300
--   expense   -> mapped 6xxx account
--   review    -> not posted until resolved
-- It prevents a Finance refresh from undoing Purchase expense reclassification.

create or replace function private.reconcile_purchase_classification_v2(
  p_brand uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_inventory_entries integer := 0;
  v_expense_entries integer := 0;
  v_lines integer := 0;
  v_rc integer := 0;
begin
  if p_brand is null or p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid Purchase reconciliation range';
  end if;
  if not private.same_brand(p_brand) or not private.has_capability('settings.manage') then
    raise exception 'Owner permission required';
  end if;

  -- Start from a clean Purchase-origin slice. Sales/COGS/legacy expense journals
  -- produced by the base rebuild are intentionally untouched.
  delete from public.finance_journal_entries e
  where e.brand_id = p_brand
    and e.auto_generated
    and e.entry_date between p_from and p_to
    and e.source_type in ('purchase','purchase_expense');
  get diagnostics v_deleted = row_count;

  -- Only inventory rows that are accounting-ready are posted. Review-required
  -- rows remain visible through the quality/reconciliation views but do not alter
  -- a final financial statement until their classification is resolved.
  insert into public.finance_journal_entries(
    brand_id, entry_date, source_type, source_id, source_key, description,
    status, auto_generated, metadata
  )
  select
    u.brand_id,
    u.effective_date,
    'purchase',
    u.source_history_id,
    'purchase:' || u.source_history_id::text,
    'Pembelian persediaan ' || coalesce(u.item_name,'(tanpa nama)'),
    u.finance_status,
    true,
    jsonb_build_object(
      'accounting_treatment','inventory',
      'analytics_group',u.analytics_group,
      'analytics_category',u.analytics_category,
      'payment_method',u.payment_method,
      'source','purchase_tab',
      'reconciled_by','finance_purchase_canonical_rebuild_v2'
    )
  from public.ui_purchase_accounting_v1 u
  where u.brand_id = p_brand
    and u.accounting_treatment = 'inventory'
    and u.finance_status in ('posted','provisional')
    and u.effective_date between p_from and p_to
    and coalesce(u.total_amount,0) > 0;
  get diagnostics v_inventory_entries = row_count;

  insert into public.finance_journal_lines(
    entry_id, brand_id, line_no, account_code, debit, credit, memo
  )
  select
    e.id, e.brand_id, 1, '1300', u.total_amount, 0,
    coalesce(u.item_name,'Pembelian persediaan')
  from public.finance_journal_entries e
  join public.ui_purchase_accounting_v1 u
    on u.brand_id=e.brand_id
   and u.source_history_id=e.source_id
  where e.brand_id=p_brand
    and e.source_type='purchase'
    and e.entry_date between p_from and p_to;
  get diagnostics v_rc = row_count; v_lines := v_lines + v_rc;

  insert into public.finance_journal_lines(
    entry_id, brand_id, line_no, account_code, debit, credit, memo
  )
  select
    e.id, e.brand_id, 2, coalesce(u.counter_account_code,'2190'), 0, u.total_amount,
    'Lawan pembelian / pembayaran'
  from public.finance_journal_entries e
  join public.ui_purchase_accounting_v1 u
    on u.brand_id=e.brand_id
   and u.source_history_id=e.source_id
  where e.brand_id=p_brand
    and e.source_type='purchase'
    and e.entry_date between p_from and p_to;
  get diagnostics v_rc = row_count; v_lines := v_lines + v_rc;

  -- Expense candidates use the canonical Purchase -> Finance expense bridge.
  insert into public.finance_journal_entries(
    brand_id, entry_date, source_type, source_id, source_key, description,
    status, auto_generated, metadata
  )
  select
    x.brand_id,
    x.purchase_date,
    'purchase_expense',
    x.source_history_id,
    'purchase_expense:' || x.source_history_id::text,
    'Beban pembelian ' || coalesce(x.item_name,'(tanpa nama)'),
    x.journal_status,
    true,
    jsonb_build_object(
      'expense_category',x.expense_category,
      'payment_method',x.payment_method,
      'source','purchase_tab',
      'reconciled_by','finance_purchase_canonical_rebuild_v2'
    )
  from public.finance_purchase_expense_bridge_v1 x
  where x.brand_id=p_brand
    and x.purchase_date between p_from and p_to
    and coalesce(x.total_amount,0)>0;
  get diagnostics v_expense_entries = row_count;

  insert into public.finance_journal_lines(
    entry_id, brand_id, line_no, account_code, debit, credit, memo
  )
  select
    e.id,e.brand_id,1,x.expense_account_code,x.total_amount,0,
    coalesce(x.expense_category,x.item_name,'Beban pembelian')
  from public.finance_journal_entries e
  join public.finance_purchase_expense_bridge_v1 x
    on x.brand_id=e.brand_id
   and x.source_history_id=e.source_id
  where e.brand_id=p_brand
    and e.source_type='purchase_expense'
    and e.entry_date between p_from and p_to;
  get diagnostics v_rc = row_count; v_lines := v_lines + v_rc;

  insert into public.finance_journal_lines(
    entry_id, brand_id, line_no, account_code, debit, credit, memo
  )
  select
    e.id,e.brand_id,2,x.counter_account_code,0,x.total_amount,
    'Lawan pembayaran beban dari Pembelian'
  from public.finance_journal_entries e
  join public.finance_purchase_expense_bridge_v1 x
    on x.brand_id=e.brand_id
   and x.source_history_id=e.source_id
  where e.brand_id=p_brand
    and e.source_type='purchase_expense'
    and e.entry_date between p_from and p_to;
  get diagnostics v_rc = row_count; v_lines := v_lines + v_rc;

  if exists (
    select 1
    from public.finance_journal_entries e
    join public.finance_journal_lines l on l.entry_id=e.id
    where e.brand_id=p_brand
      and e.entry_date between p_from and p_to
      and e.source_type in ('purchase','purchase_expense')
    group by e.id
    having abs(sum(l.debit)-sum(l.credit)) >= 0.01
  ) then
    raise exception 'Canonical Purchase reconciliation produced unbalanced journal entries';
  end if;

  return jsonb_build_object(
    'deleted_purchase_entries',v_deleted,
    'inventory_entries',v_inventory_entries,
    'expense_entries',v_expense_entries,
    'created_lines',v_lines,
    'from',p_from,
    'to',p_to
  );
end;
$$;

revoke all on function private.reconcile_purchase_classification_v2(uuid,date,date) from public, anon, authenticated;
grant execute on function private.reconcile_purchase_classification_v2(uuid,date,date) to service_role;

-- Public refresh keeps the existing base rebuild, then immediately reconciles
-- the Purchase slice to the canonical classification before reports are re-read.
create or replace function public.rebuild_finance_journal_v1(p_from date,p_to date)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brand uuid := private.my_brand_id();
  v_base jsonb;
  v_purchase jsonb;
begin
  v_base := private.rebuild_finance_journal_v1(v_brand,p_from,p_to);
  v_purchase := private.reconcile_purchase_classification_v2(v_brand,p_from,p_to);
  return coalesce(v_base,'{}'::jsonb) || jsonb_build_object('purchase_alignment',v_purchase);
end;
$$;

revoke all on function public.rebuild_finance_journal_v1(date,date) from public, anon;
grant execute on function public.rebuild_finance_journal_v1(date,date) to authenticated;
