create table if not exists public.finance_period_snapshots(
  id uuid primary key default gen_random_uuid(),
  accounting_period_id uuid not null references public.accounting_periods(id) on delete restrict,
  brand_id uuid not null references public.brands(id) on delete cascade,
  close_sequence integer not null check (close_sequence>0),
  period_start date not null,
  period_end date not null,
  framework_label text not null default 'Format mengacu SAK EMKM - internal',
  close_note text,
  report_payload jsonb not null,
  journal_summary jsonb not null default '{}'::jsonb,
  journal_fingerprint text not null,
  snapshot_fingerprint text not null,
  captured_by uuid references auth.users(id) on delete set null,
  captured_at timestamptz not null default now(),
  unique(accounting_period_id,close_sequence),
  unique(brand_id,period_start,close_sequence)
);

create table if not exists public.finance_period_events(
  id uuid primary key default gen_random_uuid(),
  accounting_period_id uuid not null references public.accounting_periods(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  event_type text not null check (event_type in ('closed','reopened')),
  snapshot_id uuid references public.finance_period_snapshots(id) on delete restrict,
  note text not null,
  actor_id uuid references auth.users(id) on delete set null,
  event_at timestamptz not null default now()
);

create index if not exists finance_period_snapshots_brand_period_idx on public.finance_period_snapshots(brand_id,period_start,captured_at desc);
create index if not exists finance_period_events_period_idx on public.finance_period_events(accounting_period_id,event_at desc);

alter table public.finance_period_snapshots enable row level security;
alter table public.finance_period_events enable row level security;
drop policy if exists finance_period_snapshots_read_same_brand on public.finance_period_snapshots;
create policy finance_period_snapshots_read_same_brand on public.finance_period_snapshots for select to authenticated using ((select private.same_brand(brand_id)));
drop policy if exists finance_period_events_read_same_brand on public.finance_period_events;
create policy finance_period_events_read_same_brand on public.finance_period_events for select to authenticated using ((select private.same_brand(brand_id)));
grant select on public.finance_period_snapshots,public.finance_period_events to authenticated;

create or replace function private.prevent_finance_snapshot_mutation_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  raise exception 'Finance period snapshots are immutable';
end;
$$;
drop trigger if exists finance_period_snapshots_immutable on public.finance_period_snapshots;
create trigger finance_period_snapshots_immutable before update or delete on public.finance_period_snapshots
for each row execute function private.prevent_finance_snapshot_mutation_v1();

create or replace function private.get_finance_period_pack_live_v1(p_brand uuid,p_period date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_period date:=date_trunc('month',p_period::timestamp)::date;
  v_prev date;
begin
  if not private.same_brand(p_brand) then raise exception 'Brand is outside your access'; end if;
  select max(period_start) into v_prev from public.accounting_periods where brand_id=p_brand and period_start<v_period;
  return jsonb_build_object(
    'period',v_period,
    'previous_period',v_prev,
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
end;
$$;

create or replace function private.finance_period_journal_fingerprint_v1(p_brand uuid,p_period date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_period date:=date_trunc('month',p_period::timestamp)::date;
  v_text text;
  v_hash text;
  v_entries bigint;
  v_lines bigint;
  v_debit numeric;
  v_credit numeric;
begin
  if not private.same_brand(p_brand) then raise exception 'Brand is outside your access'; end if;
  select
    count(distinct e.id),count(l.id),coalesce(sum(l.debit),0),coalesce(sum(l.credit),0),
    string_agg(concat_ws('|',e.id::text,e.entry_date::text,e.source_type,e.source_key,e.status,e.auto_generated::text,l.line_no::text,l.account_code,l.debit::text,l.credit::text,coalesce(l.memo,'')),E'\n' order by e.entry_date,e.id,l.line_no)
  into v_entries,v_lines,v_debit,v_credit,v_text
  from public.finance_journal_entries e
  join public.finance_journal_lines l on l.entry_id=e.id
  where e.brand_id=p_brand and e.period_month=v_period and e.status<>'void';
  v_hash:=encode(extensions.digest(coalesce(v_text,''),'sha256'),'hex');
  return jsonb_build_object('entry_count',v_entries,'line_count',v_lines,'debit_total',v_debit,'credit_total',v_credit,'sha256',v_hash);
end;
$$;

create or replace function private.capture_finance_period_snapshot_v1(p_period_id uuid,p_note text)
returns public.finance_period_snapshots
language plpgsql security definer set search_path='' as $$
declare
  v_period public.accounting_periods%rowtype;
  v_ready boolean;
  v_blockers text;
  v_payload jsonb;
  v_journal jsonb;
  v_seq integer;
  v_snapshot public.finance_period_snapshots%rowtype;
  v_fingerprint text;
begin
  if not private.has_capability('settings.manage') then raise exception 'Owner permission required'; end if;
  select * into v_period from public.accounting_periods where id=p_period_id for update;
  if not found then raise exception 'Accounting period not found'; end if;
  if not private.same_brand(v_period.brand_id) then raise exception 'Accounting period is outside your brand'; end if;
  if v_period.status<>'open' then raise exception 'Only an open period can be snapshotted for close'; end if;
  if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Close note is required for immutable snapshot'; end if;
  select ready_to_close,blockers into v_ready,v_blockers from public.finance_close_readiness_v1 where accounting_period_id=v_period.id;
  if v_ready is distinct from true then raise exception 'Periode belum siap ditutup: %',coalesce(nullif(v_blockers,''),'kontrol keuangan belum lengkap'); end if;

  v_payload:=private.get_finance_period_pack_live_v1(v_period.brand_id,v_period.period_start);
  v_payload:=jsonb_set(v_payload,'{readiness,period_status}','"closed"'::jsonb,true);
  v_journal:=private.finance_period_journal_fingerprint_v1(v_period.brand_id,v_period.period_start);
  select coalesce(max(close_sequence),0)+1 into v_seq from public.finance_period_snapshots where accounting_period_id=v_period.id;
  v_fingerprint:=encode(extensions.digest(v_payload::text||'|'||v_journal::text||'|'||v_period.period_start::text||'|'||v_period.period_end::text,'sha256'),'hex');

  insert into public.finance_period_snapshots(accounting_period_id,brand_id,close_sequence,period_start,period_end,framework_label,close_note,report_payload,journal_summary,journal_fingerprint,snapshot_fingerprint,captured_by)
  values(v_period.id,v_period.brand_id,v_seq,v_period.period_start,v_period.period_end,'Format mengacu SAK EMKM - internal',btrim(p_note),v_payload,v_journal,v_journal->>'sha256',v_fingerprint,auth.uid())
  returning * into v_snapshot;
  return v_snapshot;
end;
$$;

create or replace function private.get_finance_period_pack_v1(p_brand uuid,p_period date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_period date:=date_trunc('month',p_period::timestamp)::date;
  v_status text;
  v_snapshot public.finance_period_snapshots%rowtype;
  v_live jsonb;
begin
  if not private.same_brand(p_brand) then raise exception 'Brand is outside your access'; end if;
  select status into v_status from public.accounting_periods where brand_id=p_brand and period_start=v_period;
  if v_status='closed' then
    select * into v_snapshot from public.finance_period_snapshots
    where brand_id=p_brand and period_start=v_period order by close_sequence desc limit 1;
    if found then
      return v_snapshot.report_payload || jsonb_build_object('snapshot_meta',jsonb_build_object(
        'snapshot_id',v_snapshot.id,'close_sequence',v_snapshot.close_sequence,'captured_at',v_snapshot.captured_at,
        'framework_label',v_snapshot.framework_label,'journal_fingerprint',v_snapshot.journal_fingerprint,
        'snapshot_fingerprint',v_snapshot.snapshot_fingerprint,'immutable',true
      ));
    end if;
  end if;
  v_live:=private.get_finance_period_pack_live_v1(p_brand,v_period);
  return v_live || jsonb_build_object('snapshot_meta',jsonb_build_object('immutable',false,'status',coalesce(v_status,'open')));
end;
$$;

create or replace function public.close_accounting_period(p_period_id uuid,p_note text default null)
returns public.accounting_periods language plpgsql security invoker set search_path='' as $$
declare
  v_period public.accounting_periods%rowtype;
  v_snapshot public.finance_period_snapshots%rowtype;
begin
  select * into v_period from public.accounting_periods where id=p_period_id;
  if not found then raise exception 'Accounting period not found'; end if;
  if v_period.status='closed' then return v_period; end if;
  if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Close note is required'; end if;
  v_snapshot:=private.capture_finance_period_snapshot_v1(p_period_id,p_note);
  v_period:=private.set_accounting_period_status(p_period_id,'closed',p_note);
  insert into public.finance_period_events(accounting_period_id,brand_id,event_type,snapshot_id,note,actor_id)
  values(v_period.id,v_period.brand_id,'closed',v_snapshot.id,btrim(p_note),auth.uid());
  return v_period;
end;
$$;

create or replace function public.reopen_accounting_period(p_period_id uuid,p_note text)
returns public.accounting_periods language plpgsql security invoker set search_path='' as $$
declare
  v_period public.accounting_periods%rowtype;
  v_snapshot_id uuid;
begin
  if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Reopen reason is required'; end if;
  select * into v_period from public.accounting_periods where id=p_period_id;
  if not found then raise exception 'Accounting period not found'; end if;
  if not private.same_brand(v_period.brand_id) then raise exception 'Accounting period is outside your brand'; end if;
  if v_period.status='open' then return v_period; end if;
  select id into v_snapshot_id from public.finance_period_snapshots where accounting_period_id=p_period_id order by close_sequence desc limit 1;
  v_period:=private.set_accounting_period_status(p_period_id,'open',p_note);
  insert into public.finance_period_events(accounting_period_id,brand_id,event_type,snapshot_id,note,actor_id)
  values(v_period.id,v_period.brand_id,'reopened',v_snapshot_id,btrim(p_note),auth.uid());
  return v_period;
end;
$$;

create or replace function private.get_finance_archive_v1(p_brand uuid,p_period date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_period date:=date_trunc('month',p_period::timestamp)::date;
  v_ap public.accounting_periods%rowtype;
  v_latest public.finance_period_snapshots%rowtype;
  v_payload jsonb;
begin
  if not private.same_brand(p_brand) then raise exception 'Brand is outside your access'; end if;
  select * into v_ap from public.accounting_periods where brand_id=p_brand and period_start=v_period;
  if not found then raise exception 'Accounting period not found'; end if;
  select * into v_latest from public.finance_period_snapshots where accounting_period_id=v_ap.id order by close_sequence desc limit 1;
  if v_ap.status='closed' and v_latest.id is not null then v_payload:=v_latest.report_payload; else v_payload:=private.get_finance_period_pack_live_v1(p_brand,v_period); end if;
  return jsonb_build_object(
    'period',to_jsonb(v_ap),
    'framework_label','Format mengacu SAK EMKM - internal',
    'export_status',case when v_ap.status='closed' and v_latest.id is not null then 'CLOSED_SNAPSHOT' else 'DRAFT_LIVE' end,
    'report_payload',v_payload,
    'latest_snapshot',case when v_latest.id is null then null else jsonb_build_object(
      'id',v_latest.id,'close_sequence',v_latest.close_sequence,'captured_at',v_latest.captured_at,'close_note',v_latest.close_note,
      'journal_summary',v_latest.journal_summary,'journal_fingerprint',v_latest.journal_fingerprint,'snapshot_fingerprint',v_latest.snapshot_fingerprint
    ) end,
    'snapshots',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'close_sequence',s.close_sequence,'captured_at',s.captured_at,'close_note',s.close_note,'journal_fingerprint',s.journal_fingerprint,'snapshot_fingerprint',s.snapshot_fingerprint) order by s.close_sequence desc) from public.finance_period_snapshots s where s.accounting_period_id=v_ap.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.event_at desc) from public.finance_period_events e where e.accounting_period_id=v_ap.id),'[]'::jsonb)
  );
end;
$$;

create or replace function public.get_finance_archive_v1(p_brand uuid,p_period date)
returns jsonb language sql security invoker set search_path='' as $$select private.get_finance_archive_v1(p_brand,p_period);$$;

grant execute on function public.get_finance_archive_v1(uuid,date) to authenticated;
revoke all on function public.get_finance_archive_v1(uuid,date) from anon;
