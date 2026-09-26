-- Align the canonical open-period Finance journal with the active Purchase model.
-- Purchase value is an expense; stock is quantity-only.
-- Legacy sale_cogs rows are preserved for audit but voided from active reporting.

create or replace function private.reconcile_purchase_classification_v2(p_brand uuid,p_from date,p_to date)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_entries integer:=0;
  v_lines integer:=0;
  v_hpp_voided integer:=0;
begin
  if p_brand is null or p_from is null or p_to is null or p_from>p_to then
    raise exception 'Invalid Purchase reconciliation range';
  end if;
  if not private.same_brand(p_brand)
     or not (private.has_capability('settings.manage') or private.can_import_module('purchasing')) then
    raise exception 'Purchase Finance reconciliation permission required';
  end if;

  update public.finance_journal_entries e
  set description=c.expense_category||' · '||coalesce(c.item_name,'(tanpa nama)'),
      status=case when c.category_status='classified' and c.finance_status='posted' then 'posted' else 'provisional' end,
      metadata=e.metadata||jsonb_build_object(
        'expense_category',c.expense_category,
        'expense_account_code',case c.expense_category
          when 'Beban Administrasi' then '6100'
          when 'Beban Pemeliharaan' then '6110'
          when 'Beban Bahan Baku' then '6120'
          when 'Beban Kepegawaian' then '6200'
          else '6000' end,
        'management_basis','purchase_value_expense_stock_quantity',
        'reconciled_by','purchase_journal_expense_alignment'
      ),
      updated_at=now()
  from public.finance_purchase_expense_category_v1 c
  where e.brand_id=p_brand
    and e.entry_date between p_from and p_to
    and e.source_type in ('purchase','purchase_expense')
    and e.source_id=c.source_history_id
    and c.brand_id=e.brand_id;
  get diagnostics v_entries=row_count;

  update public.finance_journal_lines l
  set account_code=case c.expense_category
        when 'Beban Administrasi' then '6100'
        when 'Beban Pemeliharaan' then '6110'
        when 'Beban Bahan Baku' then '6120'
        when 'Beban Kepegawaian' then '6200'
        else '6000' end,
      memo=c.expense_category,
      metadata=l.metadata||jsonb_build_object('purchase_value_role','expense')
  from public.finance_journal_entries e,
       public.finance_purchase_expense_category_v1 c
  where l.entry_id=e.id
    and l.brand_id=e.brand_id
    and l.line_no=1
    and e.brand_id=p_brand
    and e.entry_date between p_from and p_to
    and e.source_type in ('purchase','purchase_expense')
    and e.source_id=c.source_history_id
    and c.brand_id=e.brand_id;
  get diagnostics v_lines=row_count;

  update public.finance_journal_entries e
  set status='void',
      metadata=e.metadata||jsonb_build_object(
        'retired_from_active_reporting',true,
        'retired_reason','Purchase value is expensed; stock is quantity-only'
      ),
      updated_at=now()
  where e.brand_id=p_brand
    and e.entry_date between p_from and p_to
    and e.source_type='sale_cogs'
    and e.status<>'void';
  get diagnostics v_hpp_voided=row_count;

  return jsonb_build_object(
    'deleted_purchase_entries',0,
    'inventory_entries',0,
    'expense_entries',v_entries,
    'created_lines',0,
    'reclassified_lines',v_lines,
    'voided_legacy_hpp_entries',v_hpp_voided,
    'from',p_from,
    'to',p_to,
    'basis','purchase_value_expense_stock_quantity'
  );
end;
$function$;

-- Apply the same alignment immediately to currently open periods.
with x as materialized (
  select c.*
  from public.finance_purchase_expense_category_v1 c
  join public.accounting_periods ap
    on ap.brand_id=c.brand_id and ap.period_start=c.period_month and ap.status='open'
)
update public.finance_journal_entries e
set description=x.expense_category||' · '||coalesce(x.item_name,'(tanpa nama)'),
    status=case when x.category_status='classified' and x.finance_status='posted' then 'posted' else 'provisional' end,
    metadata=e.metadata||jsonb_build_object(
      'expense_category',x.expense_category,
      'expense_account_code',case x.expense_category
        when 'Beban Administrasi' then '6100'
        when 'Beban Pemeliharaan' then '6110'
        when 'Beban Bahan Baku' then '6120'
        when 'Beban Kepegawaian' then '6200'
        else '6000' end,
      'management_basis','purchase_value_expense_stock_quantity',
      'reconciled_by','purchase_journal_expense_alignment'
    ),
    updated_at=now()
from x
where e.source_type in ('purchase','purchase_expense')
  and e.source_id=x.source_history_id
  and x.brand_id=e.brand_id;

with x as materialized (
  select c.*
  from public.finance_purchase_expense_category_v1 c
  join public.accounting_periods ap
    on ap.brand_id=c.brand_id and ap.period_start=c.period_month and ap.status='open'
)
update public.finance_journal_lines l
set account_code=case x.expense_category
      when 'Beban Administrasi' then '6100'
      when 'Beban Pemeliharaan' then '6110'
      when 'Beban Bahan Baku' then '6120'
      when 'Beban Kepegawaian' then '6200'
      else '6000' end,
    memo=x.expense_category,
    metadata=l.metadata||jsonb_build_object('purchase_value_role','expense')
from public.finance_journal_entries e,
     x
where l.entry_id=e.id
  and l.brand_id=e.brand_id
  and l.line_no=1
  and e.source_type in ('purchase','purchase_expense')
  and e.source_id=x.source_history_id
  and x.brand_id=e.brand_id;

update public.finance_journal_entries e
set status='void',
    metadata=e.metadata||jsonb_build_object(
      'retired_from_active_reporting',true,
      'retired_reason','Purchase value is expensed; stock is quantity-only'
    ),
    updated_at=now()
where e.source_type='sale_cogs'
  and e.status<>'void'
  and exists(
    select 1 from public.accounting_periods ap
    where ap.brand_id=e.brand_id and ap.status='open'
      and e.entry_date between ap.period_start and ap.period_end
  );
