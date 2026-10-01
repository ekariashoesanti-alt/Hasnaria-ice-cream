-- Route canonical purchases to Hasnaria's existing chart of accounts.
-- Unknown expense accounts remain provisional in 1990 and are exposed to Staff Kasir.

create or replace view public.finance_purchase_expense_bridge_v1
with (security_invoker=true)
as
with p0 as (
  select p.*,
         private.normalize_purchase_payment_method_v1(p.payment_method) as normalized_payment_method
  from public.purchase_inventory_bridge p
), routed as (
  select
    p.*,
    ii.category as inventory_category,
    fa_override.code as override_code,
    fa_override.name as override_name,
    case
      when fa_override.code is not null then fa_override.code
      when coalesce(p.raw_data->>'analytics_group','')='Investasi' then '1500'
      when coalesce(p.raw_data->>'analytics_group','')='Karyawan'
        or coalesce(p.raw_data->>'analytics_category','') ilike '%Karyawan%'
        or upper(coalesce(p.item_name,'')) ~ '(GAJI|KARYAWAN|SERAGAM|JAS HUJAN|MAKAN SIANG|TUNJANGAN|BONUS|LEMBUR)' then '6200'
      when coalesce(p.expense_category,'')='cleaning_supplies' then '6010'
      when coalesce(p.expense_category,'')='delivery_freight' then '6020'
      when coalesce(p.expense_category,'')='kitchen_fuel' then '6030'
      when coalesce(p.expense_category,'') in ('marketing_printing','marketing','promotion') then '6040'
      when coalesce(p.expense_category,'')='small_equipment' then '6050'
      when coalesce(p.expense_category,'')='store_supplies' then '6060'
      when coalesce(p.expense_category,'') in ('utilities_electricity','utilities') then '6070'
      when coalesce(p.expense_category,'')='internet_telecom' then '6080'
      when coalesce(p.expense_category,'')='rent' then '6090'
      when coalesce(p.expense_category,'') in ('admin_printing','administration') then '6100'
      when coalesce(p.expense_category,'')='maintenance' then '6110'
      when upper(coalesce(p.item_name,'')) ~ '(SABUN|DETERGEN|PEMBERSIH|RINSO|SOKLIN|CUCI PIRING|SABUN PEL)' then '6010'
      when upper(coalesce(p.item_name,'')) ~ '(ONGKIR|DELIVERY|FREIGHT|ANGKUT)' then '6020'
      when upper(coalesce(p.item_name,'')) ~ '(^|[^A-Z])(GAS|LPG)([^A-Z]|$)' then '6030'
      when upper(coalesce(p.item_name,'')) ~ '(CETAK MENU|BANNER|PROMO|IKLAN|MARKETING)' then '6040'
      when upper(coalesce(p.item_name,'')) ~ '(ALAT KECIL|SCOOP|DUMBELL|TRIPOD|PIRING GOLD)' then '6050'
      when upper(coalesce(p.item_name,'')) ~ '(SELOTIP|ISOLASI|SOLASI|PULPEN|KERTAS KASIR|STICKER)' then '6060'
      when upper(coalesce(p.item_name,'')) ~ '(TOKEN|LISTRIK|PLN|PDAM)' then '6070'
      when upper(coalesce(p.item_name,'')) ~ '(INTERNET|PULSA|PAKET DATA|TELEKOM)' then '6080'
      when upper(coalesce(p.item_name,'')) ~ '(SEWA|RENT)' then '6090'
      when upper(coalesce(p.item_name,'')) ~ '(FOTO COPY|FOTOKOPI|FC LAPORAN|LAPORAN|RETRIBUSI|LANGGANAN MAJOO|ADMIN)' then '6100'
      when upper(coalesce(p.item_name,'')) ~ '(SERVIS|SERVICE|PERBAIK|MAINTENANCE|REPAIR)' then '6110'
      when coalesce(p.raw_data->>'analytics_category','') in ('Makanan','Minuman','Ice Cream','Kemasan & Supplies') then '6120'
      when p.mapping_status in ('inventory_alias','exact_name') or p.inventory_item_id is not null then '6120'
      else '1990'
    end as routed_account_code
  from p0 p
  left join public.inventory_items ii on ii.id=p.inventory_item_id and ii.brand_id=p.brand_id
  left join public.finance_accounts fa_override
    on fa_override.brand_id=p.brand_id
   and fa_override.code=nullif(p.raw_data->>'finance_account_code_override','')
   and fa_override.active
   and fa_override.account_type in ('ASSET','LIABILITY','EXPENSE','COGS')
)
select
  p.id as source_history_id,
  p.brand_id,
  coalesce(p.purchase_date,p.source_period) as purchase_date,
  date_trunc('month',coalesce(p.purchase_date,p.source_period))::date as period_month,
  p.item_name,
  p.total_amount,
  p.payment_method,
  coalesce(a.name,case when p.routed_account_code='1990' then 'Pembelian Dalam Review' else 'Pembelian' end) as expense_category,
  p.routed_account_code as expense_account_code,
  case
    when p.normalized_payment_method='TUNAI' then '1000'
    when p.normalized_payment_method in ('TRANSFER','QRIS') then '1100'
    when p.normalized_payment_method in ('UTANG','PAYLATER') then '2000'
    else '2190'
  end as counter_account_code,
  case
    when p.routed_account_code='1990'
      or p.normalized_payment_method is null
      or p.normalized_payment_method='BELUM_DIPETAKAN' then 'provisional'
    else 'posted'
  end as journal_status
from routed p
left join public.finance_accounts a
  on a.brand_id=p.brand_id and a.code=p.routed_account_code and a.active
where coalesce(p.total_amount,0)>0
  and coalesce(p.mapping_status,'') not in ('excluded','payment_candidate');

create or replace view public.finance_trial_balance_monthly_v1
with (security_invoker=true)
as
with months as (
  select distinct e.brand_id,e.period_month
  from public.finance_journal_entries e
  where e.status<>'void'
  union
  select distinct p.brand_id,p.period_month
  from public.finance_purchase_expense_bridge_v1 p
), journal_monthly as (
  select e.brand_id,e.period_month,l.account_code,
         sum(l.debit)::numeric(18,2) as period_debit,
         sum(l.credit)::numeric(18,2) as period_credit
  from public.finance_journal_entries e
  join public.finance_journal_lines l on l.entry_id=e.id
  where e.status<>'void'
    and e.source_type not in ('purchase','purchase_expense','sale_cogs')
  group by e.brand_id,e.period_month,l.account_code
), purchase_expense_monthly as (
  select p.brand_id,p.period_month,p.expense_account_code as account_code,
         sum(p.total_amount)::numeric(18,2) as period_debit,
         0::numeric(18,2) as period_credit
  from public.finance_purchase_expense_bridge_v1 p
  group by p.brand_id,p.period_month,p.expense_account_code
), purchase_counter_monthly as (
  select p.brand_id,p.period_month,p.counter_account_code as account_code,
         0::numeric(18,2) as period_debit,
         sum(p.total_amount)::numeric(18,2) as period_credit
  from public.finance_purchase_expense_bridge_v1 p
  group by p.brand_id,p.period_month,p.counter_account_code
), monthly as (
  select q.brand_id,q.period_month,q.account_code,
         sum(q.period_debit)::numeric(18,2) as period_debit,
         sum(q.period_credit)::numeric(18,2) as period_credit
  from (
    select * from journal_monthly
    union all select * from purchase_expense_monthly
    union all select * from purchase_counter_monthly
  ) q
  group by q.brand_id,q.period_month,q.account_code
), matrix as (
  select m.brand_id,m.period_month,a.code as account_code,a.name as account_name,a.account_type,
         coalesce(x.period_debit,0)::numeric(18,2) as period_debit,
         coalesce(x.period_credit,0)::numeric(18,2) as period_credit,
         case when a.account_type in ('ASSET','COGS','EXPENSE')
              then coalesce(x.period_debit,0)-coalesce(x.period_credit,0)
              else coalesce(x.period_credit,0)-coalesce(x.period_debit,0) end as normal_movement
  from months m
  join public.finance_accounts a on a.brand_id=m.brand_id and a.active
  left join monthly x on x.brand_id=m.brand_id and x.period_month=m.period_month and x.account_code=a.code
), balances as (
  select matrix.*,
         sum(normal_movement) over(partition by brand_id,account_code order by period_month rows unbounded preceding) as ending_balance
  from matrix
)
select brand_id,period_month,account_code,account_name,account_type,
       (ending_balance-normal_movement)::numeric(18,2) as opening_balance,
       period_debit,period_credit,ending_balance::numeric(18,2) as ending_balance
from balances;

create or replace function private.staff_purchase_account_options_v3(p_token text)
returns table(account_code text,account_name text,account_type text)
language plpgsql stable security definer set search_path=''
as $$
declare v_emp public.employees%rowtype;
begin
  v_emp:=private.staff_session_employee(p_token,'kasir');
  return query
  select a.code,a.name,a.account_type
  from public.finance_accounts a
  where a.brand_id=v_emp.brand_id and a.active
    and (a.account_type in ('EXPENSE','COGS') or a.code in ('1300','1500'))
    and a.code<>'1990'
  order by case when a.code='1300' then 0 when a.code='1500' then 1 when a.account_type='EXPENSE' then 2 else 3 end,a.code;
end;
$$;

create or replace function private.staff_purchase_reconciliation_queue_v3(p_token text,p_period date default null)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_emp public.employees%rowtype;
  v_month date:=date_trunc('month',coalesce(p_period,timezone('Asia/Jakarta',now())::date))::date;
  v_next date:=(date_trunc('month',coalesce(p_period,timezone('Asia/Jakarta',now())::date))+interval '1 month')::date;
  v_rows jsonb;
begin
  v_emp:=private.staff_session_employee(p_token,'kasir');
  with q as (
    select 'payment_account'::text issue_type,e.id evidence_id,null::uuid source_history_id,
           e.purchase_date business_date,e.item_name,e.total_amount,nullif(btrim(e.payment_method),'') current_value,
           coalesce(nullif(e.raw_data->>'source_payment_label',''),nullif(e.payment_method,''),'Belum dipetakan') source_label,
           null::text mapping_status,e.source_type,e.source_file,e.row_no,10 priority
    from public.purchase_import_evidence e
    where e.brand_id=v_emp.brand_id and e.source_period=v_month
      and (private.normalize_purchase_payment_method_v1(e.payment_method) is null
           or private.normalize_purchase_payment_method_v1(e.payment_method)='BELUM_DIPETAKAN')
      and coalesce(e.total_amount,0)>0
    union all
    select 'expense_account'::text,null::uuid,h.id,f.purchase_date,h.item_name,h.total_amount,
           nullif(h.raw_data->>'finance_account_code_override',''),
           coalesce(b.mapping_status,'Belum dipetakan'),b.mapping_status,'canonical'::text,h.source_file,h.row_no,20
    from public.offline_purchase_history h
    join public.purchase_inventory_bridge b on b.id=h.id and b.brand_id=h.brand_id
    join public.finance_purchase_expense_bridge_v1 f on f.source_history_id=h.id and f.brand_id=h.brand_id
    where h.brand_id=v_emp.brand_id
      and f.purchase_date>=v_month and f.purchase_date<v_next
      and f.expense_account_code='1990'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'issue_type',issue_type,'evidence_id',evidence_id,'source_history_id',source_history_id,
    'business_date',business_date,'item_name',item_name,'total_amount',total_amount,
    'current_value',current_value,'source_label',source_label,'mapping_status',mapping_status,
    'source_type',source_type,'source_file',source_file,'row_no',row_no
  ) order by priority,business_date,row_no,item_name),'[]'::jsonb)
  into v_rows from q;
  return jsonb_build_object(
    'period_month',v_month,
    'payment_options',jsonb_build_array(
      jsonb_build_object('method','TUNAI','account_code','1000','account_name','Cash'),
      jsonb_build_object('method','TRANSFER','account_code','1100','account_name','Bank / QRIS Settlement'),
      jsonb_build_object('method','QRIS','account_code','1100','account_name','Bank / QRIS Settlement'),
      jsonb_build_object('method','UTANG','account_code','2000','account_name','Accounts Payable'),
      jsonb_build_object('method','PAYLATER','account_code','2000','account_name','Accounts Payable')
    ),'rows',v_rows
  );
end;
$$;