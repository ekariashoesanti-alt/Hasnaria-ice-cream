-- Reclassify purchase-origin expense journals for open periods after Purchase→Finance mapping alignment.
-- Closed accounting periods are intentionally untouched.

do $$
begin
  delete from public.finance_journal_entries e
  using public.finance_purchase_expense_bridge_v1 x, public.accounting_periods ap
  where e.brand_id=x.brand_id
    and e.source_id=x.source_history_id
    and e.source_type in ('purchase','purchase_expense')
    and e.auto_generated
    and ap.brand_id=x.brand_id
    and ap.status='open'
    and x.purchase_date between ap.period_start and ap.period_end;

  insert into public.finance_journal_entries(
    brand_id,entry_date,source_type,source_id,source_key,description,status,auto_generated,metadata
  )
  select
    x.brand_id,
    x.purchase_date,
    'purchase_expense',
    x.source_history_id,
    'purchase_expense:'||x.source_history_id::text,
    'Beban pembelian '||coalesce(x.item_name,'(tanpa nama)'),
    x.journal_status,
    true,
    jsonb_build_object(
      'expense_category',x.expense_category,
      'payment_method',x.payment_method,
      'source','purchase_tab',
      'reclassified_by','reclassify_open_purchase_expense_journals_v1'
    )
  from public.finance_purchase_expense_bridge_v1 x
  join public.accounting_periods ap
    on ap.brand_id=x.brand_id
   and ap.status='open'
   and x.purchase_date between ap.period_start and ap.period_end
  where not exists (
    select 1 from public.finance_journal_entries e
    where e.brand_id=x.brand_id
      and e.source_type='purchase_expense'
      and e.source_id=x.source_history_id
  );

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select
    e.id,e.brand_id,1,x.expense_account_code,x.total_amount,0,
    coalesce(x.expense_category,x.item_name,'Beban pembelian')
  from public.finance_journal_entries e
  join public.finance_purchase_expense_bridge_v1 x
    on e.brand_id=x.brand_id
   and e.source_type='purchase_expense'
   and e.source_id=x.source_history_id
  join public.accounting_periods ap
    on ap.brand_id=e.brand_id
   and ap.status='open'
   and e.entry_date between ap.period_start and ap.period_end
  where e.auto_generated
    and not exists (
      select 1 from public.finance_journal_lines l
      where l.entry_id=e.id and l.line_no=1
    );

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select
    e.id,e.brand_id,2,x.counter_account_code,0,x.total_amount,
    'Lawan pembayaran beban dari Pembelian'
  from public.finance_journal_entries e
  join public.finance_purchase_expense_bridge_v1 x
    on e.brand_id=x.brand_id
   and e.source_type='purchase_expense'
   and e.source_id=x.source_history_id
  join public.accounting_periods ap
    on ap.brand_id=e.brand_id
   and ap.status='open'
   and e.entry_date between ap.period_start and ap.period_end
  where e.auto_generated
    and not exists (
      select 1 from public.finance_journal_lines l
      where l.entry_id=e.id and l.line_no=2
    );

  if exists (
    select 1
    from public.finance_journal_entries e
    join public.finance_journal_lines l on l.entry_id=e.id
    join public.accounting_periods ap
      on ap.brand_id=e.brand_id
     and ap.status='open'
     and e.entry_date between ap.period_start and ap.period_end
    where e.source_type='purchase_expense'
      and e.auto_generated
    group by e.id
    having abs(sum(l.debit)-sum(l.credit))>=0.01
  ) then
    raise exception 'Purchase expense reclassification produced unbalanced journal entries';
  end if;
end $$;
