begin;

create or replace view public.finance_journal_view_v1
with (security_invoker=true)
as
select e.brand_id,e.period_month,e.entry_date,e.id entry_id,e.source_type,e.source_id,e.source_key,
       e.description,e.status,e.auto_generated,l.line_no,l.account_code,a.name account_name,a.account_type,
       l.debit,l.credit,l.memo
from public.finance_journal_entries e
join public.finance_journal_lines l on l.entry_id=e.id
join public.finance_accounts a on a.brand_id=l.brand_id and a.code=l.account_code
where e.status<>'void';

create or replace view public.finance_ledger_view_v1
with (security_invoker=true)
as
select j.*,
       case when j.account_type in ('ASSET','COGS','EXPENSE')
         then sum(j.debit-j.credit) over(partition by j.brand_id,j.account_code order by j.entry_date,j.entry_id,j.line_no rows unbounded preceding)
         else sum(j.credit-j.debit) over(partition by j.brand_id,j.account_code order by j.entry_date,j.entry_id,j.line_no rows unbounded preceding)
       end::numeric(18,2) running_balance
from public.finance_journal_view_v1 j;

create or replace view public.finance_position_lines_v1
with (security_invoker=true)
as
select tb.brand_id,tb.period_month,tb.account_code,tb.account_name,tb.account_type,tb.ending_balance,
       case when tb.account_type='ASSET' then 'ASET'
            when tb.account_type='LIABILITY' then 'LIABILITAS'
            when tb.account_type='EQUITY' then 'EKUITAS'
            else 'HASIL_PERIODE' end section,
       case when tb.account_type='ASSET' then 1 when tb.account_type='LIABILITY' then 2 when tb.account_type='EQUITY' then 3 else 4 end section_order
from public.finance_trial_balance_monthly_v1 tb
where abs(tb.ending_balance)>=0.01 or tb.account_type in ('ASSET','LIABILITY','EQUITY');

grant select on public.finance_journal_view_v1, public.finance_ledger_view_v1, public.finance_position_lines_v1 to authenticated;

create or replace function public.get_finance_period_pack_v1(p_brand uuid,p_period date)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_period date:=date_trunc('month',p_period::timestamp)::date;
  v_prev date;
begin
  if not private.same_brand(p_brand) then raise exception 'Brand is outside your access'; end if;
  select max(period_start) into v_prev from public.accounting_periods where brand_id=p_brand and period_start<v_period;
  return jsonb_build_object(
    'period',v_period,'previous_period',v_prev,
    'income_current',(select to_jsonb(i) from public.finance_income_statement_monthly_v1 i where i.brand_id=p_brand and i.period_month=v_period),
    'income_previous',(select to_jsonb(i) from public.finance_income_statement_monthly_v1 i where i.brand_id=p_brand and i.period_month=v_prev),
    'position_current',(select to_jsonb(b) from public.finance_balance_sheet_monthly_v1 b where b.brand_id=p_brand and b.period_month=v_period),
    'position_previous',(select to_jsonb(b) from public.finance_balance_sheet_monthly_v1 b where b.brand_id=p_brand and b.period_month=v_prev),
    'position_lines_current',coalesce((select jsonb_agg(to_jsonb(x) order by x.section_order,x.account_code) from public.finance_position_lines_v1 x where x.brand_id=p_brand and x.period_month=v_period),'[]'::jsonb),
    'position_lines_previous',coalesce((select jsonb_agg(to_jsonb(x) order by x.section_order,x.account_code) from public.finance_position_lines_v1 x where x.brand_id=p_brand and x.period_month=v_prev),'[]'::jsonb),
    'trial_balance',coalesce((select jsonb_agg(to_jsonb(t) order by t.account_code) from public.finance_trial_balance_monthly_v1 t where t.brand_id=p_brand and t.period_month=v_period),'[]'::jsonb),
    'readiness',(select to_jsonb(r) from public.finance_close_readiness_v1 r where r.brand_id=p_brand and r.period_month=v_period),
    'notes',(select n.notes from public.finance_notes_monthly_v1 n where n.brand_id=p_brand and n.period_month=v_period)
  );
end;$$;
revoke all on function public.get_finance_period_pack_v1(uuid,date) from public;
grant execute on function public.get_finance_period_pack_v1(uuid,date) to authenticated;

create or replace function public.close_accounting_period(p_period_id uuid,p_note text default null)
returns public.accounting_periods language plpgsql security invoker set search_path=''
as $$
declare v_ready boolean; v_blockers text;
begin
  select r.ready_to_close,r.blockers into v_ready,v_blockers
  from public.finance_close_readiness_v1 r where r.accounting_period_id=p_period_id;
  if v_ready is distinct from true then
    raise exception 'Periode belum siap ditutup: %',coalesce(nullif(v_blockers,''),'kontrol keuangan belum lengkap');
  end if;
  return private.set_accounting_period_status(p_period_id,'closed',p_note);
end;$$;
revoke all on function public.close_accounting_period(uuid,text) from public;
grant execute on function public.close_accounting_period(uuid,text) to authenticated;

commit;
