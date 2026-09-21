begin;

create unique index if not exists finance_accounts_brand_code_uq on public.finance_accounts(brand_id, code);

insert into public.finance_accounts (brand_id, code, name, account_type, active)
select b.id, x.code, x.name, x.account_type, true
from public.brands b
cross join (values
  ('1200','Piutang Usaha','ASSET'),('1400','Beban Dibayar di Muka','ASSET'),('1500','Aset Tetap','ASSET'),('1590','Akumulasi Penyusutan','ASSET'),
  ('2100','Utang Bank / Pinjaman','LIABILITY'),('2190','Liabilitas Belum Direkonsiliasi','LIABILITY'),('2199','Selisih Tender / Settlement','LIABILITY'),
  ('3100','Saldo Laba (Defisit)','EQUITY'),('4100','Pendapatan Lain-lain','REVENUE'),('6100','Beban Administrasi','EXPENSE'),('6200','Beban Karyawan','EXPENSE'),
  ('6300','Beban Penyusutan','EXPENSE'),('6400','Beban Keuangan','EXPENSE'),('6500','Beban Pajak Penghasilan','EXPENSE')
) as x(code,name,account_type)
on conflict (brand_id, code) do update set name=excluded.name, account_type=excluded.account_type, active=true;

create table if not exists public.finance_journal_entries (
  id uuid primary key default gen_random_uuid(), brand_id uuid not null references public.brands(id) on delete cascade,
  entry_date date not null, period_month date generated always as (date_trunc('month', entry_date::timestamp)::date) stored,
  source_type text not null, source_id uuid, source_key text not null, description text not null,
  status text not null default 'posted' check (status in ('posted','provisional','void')),
  auto_generated boolean not null default true, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (brand_id, source_key)
);

create table if not exists public.finance_journal_lines (
  id uuid primary key default gen_random_uuid(), entry_id uuid not null references public.finance_journal_entries(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade, line_no integer not null check (line_no > 0),
  account_code text not null, debit numeric(18,2) not null default 0 check (debit >= 0), credit numeric(18,2) not null default 0 check (credit >= 0),
  memo text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), unique(entry_id, line_no),
  constraint finance_journal_line_one_side check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0)),
  constraint finance_journal_line_account_fk foreign key (brand_id, account_code) references public.finance_accounts(brand_id, code)
);

create index if not exists finance_journal_entries_brand_date_idx on public.finance_journal_entries(brand_id, entry_date);
create index if not exists finance_journal_entries_brand_period_idx on public.finance_journal_entries(brand_id, period_month);
create index if not exists finance_journal_lines_brand_account_idx on public.finance_journal_lines(brand_id, account_code);

alter table public.finance_journal_entries enable row level security;
alter table public.finance_journal_lines enable row level security;
drop policy if exists finance_journal_entries_read_same_brand on public.finance_journal_entries;
create policy finance_journal_entries_read_same_brand on public.finance_journal_entries for select to authenticated using ((select private.same_brand(brand_id)));
drop policy if exists finance_journal_lines_read_same_brand on public.finance_journal_lines;
create policy finance_journal_lines_read_same_brand on public.finance_journal_lines for select to authenticated using ((select private.same_brand(brand_id)));

create or replace function private.rebuild_finance_journal_v1(p_brand uuid,p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_deleted integer:=0; v_entries integer:=0; v_lines integer:=0; v_rc integer:=0;
begin
  if p_brand is null or p_from is null or p_to is null or p_from>p_to then raise exception 'Invalid journal rebuild range'; end if;
  if not private.same_brand(p_brand) or not private.has_capability('settings.manage') then raise exception 'Owner permission required'; end if;
  if exists (select 1 from public.accounting_periods ap where ap.brand_id=p_brand and ap.status='closed' and daterange(ap.period_start,ap.period_end,'[]') && daterange(p_from,p_to,'[]')) then
    raise exception 'Closed accounting period overlaps rebuild range';
  end if;

  delete from public.finance_journal_entries e where e.brand_id=p_brand and e.auto_generated and e.entry_date between p_from and p_to;
  get diagnostics v_deleted = row_count;

  insert into public.finance_journal_entries(brand_id,entry_date,source_type,source_id,source_key,description,status,auto_generated,metadata)
  select s.brand_id,s.sold_at,'sale',s.id,'sale:'||s.id::text,'Penjualan '||s.sold_at::text,
         case when abs(s.total_amount-(coalesce(s.cash_amount,0)+coalesce(s.qris_amount,0)+coalesce(s.tf_amount,0)))<0.01 then 'posted' else 'provisional' end,
         true,jsonb_build_object('channel',s.channel,'transaction_count',s.transaction_count)
  from public.sales s where s.brand_id=p_brand and s.sold_at between p_from and p_to and s.total_amount>0;
  get diagnostics v_rc = row_count; v_entries:=v_entries+v_rc;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select e.id,e.brand_id,x.line_no,x.account_code,x.debit,x.credit,x.memo
  from public.finance_journal_entries e join public.sales s on e.source_type='sale' and e.source_id=s.id
  cross join lateral (values
    (1,'1000',greatest(coalesce(s.cash_amount,0),0)::numeric,0::numeric,'Kas penjualan'),
    (2,'1100',greatest(coalesce(s.qris_amount,0)+coalesce(s.tf_amount,0),0)::numeric,0::numeric,'Bank / QRIS / transfer'),
    (3,'1199',greatest(s.total_amount-(coalesce(s.cash_amount,0)+coalesce(s.qris_amount,0)+coalesce(s.tf_amount,0)),0)::numeric,0::numeric,'Penerimaan belum terklasifikasi'),
    (4,'2199',0::numeric,greatest((coalesce(s.cash_amount,0)+coalesce(s.qris_amount,0)+coalesce(s.tf_amount,0))-s.total_amount,0)::numeric,'Selisih tender'),
    (5,'4000',0::numeric,s.total_amount::numeric,'Pendapatan penjualan')
  ) as x(line_no,account_code,debit,credit,memo)
  where e.brand_id=p_brand and e.entry_date between p_from and p_to and e.source_type='sale' and (x.debit>0 or x.credit>0);
  get diagnostics v_rc = row_count; v_lines:=v_lines+v_rc;

  insert into public.finance_journal_entries(brand_id,entry_date,source_type,source_id,source_key,description,status,auto_generated,metadata)
  select e.brand_id,e.expense_date,'expense',e.id,'expense:'||e.id::text,coalesce(nullif(btrim(e.category),''),'Beban operasional'),'provisional',true,
         jsonb_build_object('category',e.category,'legacy_payment_account','unknown')
  from public.expenses e where e.brand_id=p_brand and e.expense_date between p_from and p_to and e.status in ('recorded','approved') and e.source_history_id is null and e.amount>0;
  get diagnostics v_rc = row_count; v_entries:=v_entries+v_rc;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select j.id,j.brand_id,1,case
    when lower(coalesce(e.category,'')) ~ '(gaji|salary|wage|employee|karyawan|kepegawaian)' then '6200'
    when lower(coalesce(e.category,'')) ~ '(admin|atk|office|perizin|license|lisensi)' then '6100'
    when lower(coalesce(e.category,'')) ~ '(depres|penyusutan)' then '6300'
    when lower(coalesce(e.category,'')) ~ '(bunga|bank|finance|keuangan)' then '6400'
    when lower(coalesce(e.category,'')) ~ '(pajak|tax)' then '6500' else '6000' end,
    e.amount,0,coalesce(e.category,'Beban operasional')
  from public.finance_journal_entries j join public.expenses e on j.source_type='expense' and j.source_id=e.id
  where j.brand_id=p_brand and j.entry_date between p_from and p_to;
  get diagnostics v_rc = row_count; v_lines:=v_lines+v_rc;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select j.id,j.brand_id,2,'2190',0,e.amount,'Sumber pembayaran belum direkonsiliasi'
  from public.finance_journal_entries j join public.expenses e on j.source_type='expense' and j.source_id=e.id
  where j.brand_id=p_brand and j.entry_date between p_from and p_to;
  get diagnostics v_rc = row_count; v_lines:=v_lines+v_rc;

  insert into public.finance_journal_entries(brand_id,entry_date,source_type,source_id,source_key,description,status,auto_generated,metadata)
  select p.brand_id,coalesce(p.purchase_date,p.source_period),'purchase',p.id,'purchase:'||p.id::text,'Pembelian '||coalesce(p.item_name,'(tanpa nama)'),
         case when upper(coalesce(p.payment_method,'')) ~ '^(TUNAI|REK MANDIRI|TRANSFER|TF|QRIS|UTANG RIA|PAYLATER)$' then 'posted' else 'provisional' end,
         true,jsonb_build_object('analytics_group',p.raw_data->>'analytics_group','payment_method',p.payment_method,'item_name',p.item_name)
  from public.offline_purchase_history p
  where p.brand_id=p_brand and coalesce(p.purchase_date,p.source_period) between p_from and p_to and coalesce(p.total_amount,0)>0
    and coalesce(nullif(btrim(p.raw_data->>'analytics_group'),''),'') in ('Operasi','Administrasi','Karyawan','Investasi');
  get diagnostics v_rc = row_count; v_entries:=v_entries+v_rc;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select j.id,j.brand_id,1,case p.raw_data->>'analytics_group' when 'Operasi' then '1300' when 'Administrasi' then '6100' when 'Karyawan' then '6200' when 'Investasi' then '1500' else '6000' end,
         p.total_amount,0,coalesce(p.item_name,'Pembelian')
  from public.finance_journal_entries j join public.offline_purchase_history p on j.source_type='purchase' and j.source_id=p.id
  where j.brand_id=p_brand and j.entry_date between p_from and p_to;
  get diagnostics v_rc = row_count; v_lines:=v_lines+v_rc;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select j.id,j.brand_id,2,case when upper(coalesce(p.payment_method,''))='TUNAI' then '1000'
    when upper(coalesce(p.payment_method,'')) in ('REK MANDIRI','TRANSFER','TF','QRIS') then '1100'
    when upper(coalesce(p.payment_method,'')) like '%UTANG%' or upper(coalesce(p.payment_method,'')) like '%PAYLATER%' then '2000' else '2190' end,
    0,p.total_amount,'Lawan pembelian / pembayaran'
  from public.finance_journal_entries j join public.offline_purchase_history p on j.source_type='purchase' and j.source_id=p.id
  where j.brand_id=p_brand and j.entry_date between p_from and p_to;
  get diagnostics v_rc = row_count; v_lines:=v_lines+v_rc;

  insert into public.finance_journal_entries(brand_id,entry_date,source_type,source_id,source_key,description,status,auto_generated,metadata)
  select s.brand_id,s.sold_at,'sale_cogs',s.id,'sale_cogs:'||s.id::text,'HPP penjualan '||s.sold_at::text,'posted',true,jsonb_build_object('cogs_source','sale_items_verified')
  from public.sales s join (select sale_id,sum(qty::numeric*unit_cogs) cogs from public.sale_items where unit_cogs>0 group by sale_id) c on c.sale_id=s.id and c.cogs>0
  where s.brand_id=p_brand and s.sold_at between p_from and p_to;
  get diagnostics v_rc = row_count; v_entries:=v_entries+v_rc;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select j.id,j.brand_id,1,'5000',c.cogs,0,'Harga pokok penjualan'
  from public.finance_journal_entries j join (select sale_id,sum(qty::numeric*unit_cogs) cogs from public.sale_items where unit_cogs>0 group by sale_id) c on j.source_type='sale_cogs' and j.source_id=c.sale_id
  where j.brand_id=p_brand and j.entry_date between p_from and p_to;
  get diagnostics v_rc = row_count; v_lines:=v_lines+v_rc;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select j.id,j.brand_id,2,'1300',0,c.cogs,'Pengurangan persediaan karena penjualan'
  from public.finance_journal_entries j join (select sale_id,sum(qty::numeric*unit_cogs) cogs from public.sale_items where unit_cogs>0 group by sale_id) c on j.source_type='sale_cogs' and j.source_id=c.sale_id
  where j.brand_id=p_brand and j.entry_date between p_from and p_to;
  get diagnostics v_rc = row_count; v_lines:=v_lines+v_rc;

  if exists (select 1 from public.finance_journal_entries e join public.finance_journal_lines l on l.entry_id=e.id where e.brand_id=p_brand and e.entry_date between p_from and p_to group by e.id having abs(sum(l.debit)-sum(l.credit))>=0.01) then
    raise exception 'Journal rebuild produced unbalanced entry';
  end if;
  return jsonb_build_object('deleted_entries',v_deleted,'created_entries',v_entries,'created_lines',v_lines,'from',p_from,'to',p_to);
end;$$;

create or replace function public.rebuild_finance_journal_v1(p_from date,p_to date)
returns jsonb language sql security invoker set search_path=''
as $$ select private.rebuild_finance_journal_v1(private.my_brand_id(),p_from,p_to); $$;
revoke all on function public.rebuild_finance_journal_v1(date,date) from public;
grant execute on function public.rebuild_finance_journal_v1(date,date) to authenticated;

commit;
