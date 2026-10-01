-- Keep the canonical finance journal synchronized with public.sales.
-- Backfills only missing sale journals inside open accounting periods.

create or replace function private.sync_sale_finance_journal_by_id_v1(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_sale public.sales%rowtype;
  v_entry_id uuid;
  v_tender numeric;
begin
  select * into v_sale
  from public.sales
  where id = p_sale_id;

  if not found then
    return;
  end if;

  if coalesce(v_sale.total_amount,0) <= 0 then
    delete from public.finance_journal_entries
    where brand_id=v_sale.brand_id and source_key='sale:'||v_sale.id::text;
    return;
  end if;

  v_tender := coalesce(v_sale.cash_amount,0)+coalesce(v_sale.qris_amount,0)+coalesce(v_sale.tf_amount,0);

  insert into public.finance_journal_entries(
    brand_id,entry_date,source_type,source_id,source_key,
    description,status,auto_generated,metadata
  ) values (
    v_sale.brand_id,
    v_sale.sold_at,
    'sale',
    v_sale.id,
    'sale:'||v_sale.id::text,
    'Penjualan '||v_sale.sold_at::text,
    case when abs(coalesce(v_sale.total_amount,0)-v_tender)<0.01 then 'posted' else 'provisional' end,
    true,
    jsonb_build_object(
      'channel',v_sale.channel,
      'transaction_count',v_sale.transaction_count,
      'journal_policy','management_purchase_basis',
      'sync_source','sales_trigger_v1'
    )
  )
  on conflict (brand_id,source_key) do update set
    entry_date=excluded.entry_date,
    source_type='sale',
    source_id=excluded.source_id,
    description=excluded.description,
    status=excluded.status,
    auto_generated=true,
    metadata=excluded.metadata,
    updated_at=now()
  returning id into v_entry_id;

  delete from public.finance_journal_lines where entry_id=v_entry_id;

  insert into public.finance_journal_lines(
    entry_id,brand_id,line_no,account_code,debit,credit,memo
  )
  select v_entry_id,v_sale.brand_id,x.line_no,x.account_code,x.debit,x.credit,x.memo
  from (values
    (1,'1000'::text,greatest(coalesce(v_sale.cash_amount,0),0)::numeric,0::numeric,'Kas penjualan'::text),
    (2,'1100'::text,greatest(coalesce(v_sale.qris_amount,0)+coalesce(v_sale.tf_amount,0),0)::numeric,0::numeric,'Bank / QRIS / transfer'::text),
    (3,'1199'::text,greatest(coalesce(v_sale.total_amount,0)-v_tender,0)::numeric,0::numeric,'Penerimaan belum terklasifikasi'::text),
    (4,'2199'::text,0::numeric,greatest(v_tender-coalesce(v_sale.total_amount,0),0)::numeric,'Selisih tender'::text),
    (5,'4000'::text,0::numeric,coalesce(v_sale.total_amount,0)::numeric,'Pendapatan penjualan'::text)
  ) as x(line_no,account_code,debit,credit,memo)
  where x.debit>0 or x.credit>0;
end;
$$;

create or replace function private.sync_sale_finance_journal_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='DELETE' then
    delete from public.finance_journal_entries
    where brand_id=old.brand_id and source_key='sale:'||old.id::text;
    return old;
  end if;

  if tg_op='UPDATE' and (old.brand_id is distinct from new.brand_id or old.id is distinct from new.id) then
    delete from public.finance_journal_entries
    where brand_id=old.brand_id and source_key='sale:'||old.id::text;
  end if;

  perform private.sync_sale_finance_journal_by_id_v1(new.id);
  return new;
end;
$$;

drop trigger if exists trg_sales_finance_journal_autosync_v1 on public.sales;
create trigger trg_sales_finance_journal_autosync_v1
after insert or update or delete on public.sales
for each row execute function private.sync_sale_finance_journal_trigger_v1();

do $$
declare
  r record;
begin
  for r in
    select s.id
    from public.sales s
    join public.accounting_periods ap
      on ap.brand_id=s.brand_id
     and s.sold_at between ap.period_start and ap.period_end
     and ap.status='open'
    where coalesce(s.total_amount,0)>0
      and not exists (
        select 1 from public.finance_journal_entries e
        where e.brand_id=s.brand_id and e.source_key='sale:'||s.id::text
      )
  loop
    perform private.sync_sale_finance_journal_by_id_v1(r.id);
  end loop;
end;
$$;
