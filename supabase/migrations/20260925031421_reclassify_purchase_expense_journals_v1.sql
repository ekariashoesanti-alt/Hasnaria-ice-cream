update public.finance_journal_lines l
set account_code=x.expense_account_code
from public.finance_journal_entries e
join public.finance_purchase_expense_bridge_v1 x
  on x.brand_id=e.brand_id
 and x.source_history_id=e.source_id
where l.entry_id=e.id
  and l.line_no=1
  and e.brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'
  and e.source_type='purchase_expense'
  and e.auto_generated
  and l.account_code is distinct from x.expense_account_code;
