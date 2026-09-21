create table if not exists public.finance_accounting_settings(
  brand_id uuid primary key references public.brands(id) on delete cascade,
  opening_balance_mode text not null default 'unconfirmed' check (opening_balance_mode in ('unconfirmed','zero_confirmed','journal_posted')),
  opening_balance_date date,
  opening_balance_note text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_fixed_assets(
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  source_purchase_id uuid references public.offline_purchase_history(id) on delete restrict,
  asset_name text not null,
  asset_class text,
  acquisition_date date not null,
  available_for_use_date date,
  acquisition_cost numeric(18,2) not null check (acquisition_cost>0),
  useful_life_months integer check (useful_life_months is null or useful_life_months>0),
  depreciation_method text check (depreciation_method is null or depreciation_method in ('straight_line','declining_balance','manual')),
  depreciation_convention text check (depreciation_convention is null or depreciation_convention in ('full_month','next_month','manual')),
  declining_rate_annual numeric(10,6) check (declining_rate_annual is null or (declining_rate_annual>0 and declining_rate_annual<1)),
  status text not null default 'draft' check (status in ('draft','active','disposed')),
  disposal_date date,
  disposal_proceeds numeric(18,2),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  activated_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(brand_id,source_purchase_id),
  check (disposal_date is null or disposal_date>=acquisition_date)
);

create table if not exists public.finance_adjustments(
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  adjustment_type text not null check (adjustment_type in ('opening_balance','accrual','prepaid','tax','depreciation','reclass','correction','other')),
  entry_date date not null,
  description text not null,
  status text not null default 'draft' check (status in ('draft','posted','void')),
  source_asset_id uuid references public.finance_fixed_assets(id) on delete restrict,
  posted_journal_entry_id uuid references public.finance_journal_entries(id) on delete set null,
  audit_note text not null,
  created_by uuid references auth.users(id) on delete set null,
  posted_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_adjustment_lines(
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references public.finance_adjustments(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  line_no integer not null check (line_no>0),
  account_code text not null,
  debit numeric(18,2) not null default 0 check (debit>=0),
  credit numeric(18,2) not null default 0 check (credit>=0),
  memo text,
  created_at timestamptz not null default now(),
  unique(adjustment_id,line_no),
  foreign key(brand_id,account_code) references public.finance_accounts(brand_id,code),
  check ((debit>0 and credit=0) or (credit>0 and debit=0))
);

create table if not exists public.finance_asset_candidate_resolutions(
  purchase_id uuid primary key references public.offline_purchase_history(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  decision text not null check (decision in ('fixed_asset','expense','other')),
  target_account_code text,
  adjustment_id uuid references public.finance_adjustments(id) on delete set null,
  fixed_asset_id uuid references public.finance_fixed_assets(id) on delete set null,
  reason text not null,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz not null default now(),
  foreign key(brand_id,target_account_code) references public.finance_accounts(brand_id,code)
);

create index if not exists finance_adjustments_brand_date_idx on public.finance_adjustments(brand_id,entry_date,status);
create index if not exists finance_adjustment_lines_brand_account_idx on public.finance_adjustment_lines(brand_id,account_code);
create index if not exists finance_fixed_assets_brand_status_idx on public.finance_fixed_assets(brand_id,status,available_for_use_date);
create index if not exists finance_asset_candidate_resolutions_brand_idx on public.finance_asset_candidate_resolutions(brand_id,decision);

alter table public.finance_accounting_settings enable row level security;
alter table public.finance_fixed_assets enable row level security;
alter table public.finance_adjustments enable row level security;
alter table public.finance_adjustment_lines enable row level security;
alter table public.finance_asset_candidate_resolutions enable row level security;

drop policy if exists finance_accounting_settings_read_same_brand on public.finance_accounting_settings;
create policy finance_accounting_settings_read_same_brand on public.finance_accounting_settings for select to authenticated using ((select private.same_brand(brand_id)));
drop policy if exists finance_fixed_assets_read_same_brand on public.finance_fixed_assets;
create policy finance_fixed_assets_read_same_brand on public.finance_fixed_assets for select to authenticated using ((select private.same_brand(brand_id)));
drop policy if exists finance_adjustments_read_same_brand on public.finance_adjustments;
create policy finance_adjustments_read_same_brand on public.finance_adjustments for select to authenticated using ((select private.same_brand(brand_id)));
drop policy if exists finance_adjustment_lines_read_same_brand on public.finance_adjustment_lines;
create policy finance_adjustment_lines_read_same_brand on public.finance_adjustment_lines for select to authenticated using ((select private.same_brand(brand_id)));
drop policy if exists finance_asset_candidate_resolutions_read_same_brand on public.finance_asset_candidate_resolutions;
create policy finance_asset_candidate_resolutions_read_same_brand on public.finance_asset_candidate_resolutions for select to authenticated using ((select private.same_brand(brand_id)));

grant select on public.finance_accounting_settings,public.finance_fixed_assets,public.finance_adjustments,public.finance_adjustment_lines,public.finance_asset_candidate_resolutions to authenticated;

create or replace function private.save_finance_adjustment_v1(
  p_adjustment_id uuid,
  p_type text,
  p_entry_date date,
  p_description text,
  p_lines jsonb,
  p_reason text,
  p_source_asset_id uuid default null
) returns public.finance_adjustments
language plpgsql security definer set search_path=''
as $$
declare
  v_brand uuid:=private.my_brand_id();
  v_type text:=lower(btrim(coalesce(p_type,'')));
  v_adj public.finance_adjustments%rowtype;
  v_count integer;
  v_debit numeric;
  v_credit numeric;
begin
  if v_brand is null or not private.has_capability('settings.manage') then raise exception 'Owner permission required'; end if;
  if p_entry_date is null then raise exception 'Entry date is required'; end if;
  perform private.assert_accounting_period_open(v_brand,p_entry_date);
  if v_type not in ('opening_balance','accrual','prepaid','tax','depreciation','reclass','correction','other') then raise exception 'Unsupported adjustment type'; end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'Description is required'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Audit reason is required'; end if;
  if jsonb_typeof(p_lines)<>'array' then raise exception 'Adjustment lines must be an array'; end if;

  select count(*),coalesce(sum(coalesce(nullif(x->>'debit','')::numeric,0)),0),coalesce(sum(coalesce(nullif(x->>'credit','')::numeric,0)),0)
    into v_count,v_debit,v_credit
  from jsonb_array_elements(p_lines) x;
  if v_count<2 then raise exception 'At least two adjustment lines are required'; end if;
  if v_debit<=0 or abs(v_debit-v_credit)>=0.01 then raise exception 'Adjustment must be balanced'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_lines) x
    where not (
      (coalesce(nullif(x->>'debit','')::numeric,0)>0 and coalesce(nullif(x->>'credit','')::numeric,0)=0)
      or (coalesce(nullif(x->>'credit','')::numeric,0)>0 and coalesce(nullif(x->>'debit','')::numeric,0)=0)
    )
  ) then raise exception 'Each adjustment line must have debit or credit, not both'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_lines) x
    left join public.finance_accounts a on a.brand_id=v_brand and a.code=x->>'account_code' and a.active
    where a.id is null
  ) then raise exception 'Adjustment contains inactive or unknown account'; end if;
  if p_source_asset_id is not null and not exists(select 1 from public.finance_fixed_assets a where a.id=p_source_asset_id and a.brand_id=v_brand) then
    raise exception 'Fixed asset is outside your brand or missing';
  end if;

  if p_adjustment_id is null then
    insert into public.finance_adjustments(brand_id,adjustment_type,entry_date,description,status,source_asset_id,audit_note,created_by)
    values(v_brand,v_type,p_entry_date,btrim(p_description),'draft',p_source_asset_id,btrim(p_reason),auth.uid()) returning * into v_adj;
  else
    select * into v_adj from public.finance_adjustments where id=p_adjustment_id for update;
    if not found or v_adj.brand_id<>v_brand then raise exception 'Adjustment not found'; end if;
    if v_adj.status<>'draft' then raise exception 'Only draft adjustment can be edited'; end if;
    update public.finance_adjustments set adjustment_type=v_type,entry_date=p_entry_date,description=btrim(p_description),source_asset_id=p_source_asset_id,audit_note=btrim(p_reason),updated_at=now()
    where id=v_adj.id returning * into v_adj;
    delete from public.finance_adjustment_lines where adjustment_id=v_adj.id;
  end if;

  insert into public.finance_adjustment_lines(adjustment_id,brand_id,line_no,account_code,debit,credit,memo)
  select v_adj.id,v_brand,ord::integer,x->>'account_code',
         coalesce(nullif(x->>'debit','')::numeric,0),coalesce(nullif(x->>'credit','')::numeric,0),nullif(btrim(x->>'memo'),'')
  from jsonb_array_elements(p_lines) with ordinality q(x,ord);

  perform private.write_audit_log(v_brand,null,'finance_adjustment',v_adj.id,'draft_saved',auth.uid(),null,to_jsonb(v_adj),p_reason,jsonb_build_object('debit',v_debit,'credit',v_credit));
  return v_adj;
end;
$$;

create or replace function private.post_finance_adjustment_v1(p_adjustment_id uuid)
returns public.finance_adjustments
language plpgsql security definer set search_path=''
as $$
declare
  v_brand uuid:=private.my_brand_id();
  v_adj public.finance_adjustments%rowtype;
  v_journal public.finance_journal_entries%rowtype;
  v_debit numeric;
  v_credit numeric;
begin
  if v_brand is null or not private.has_capability('settings.manage') then raise exception 'Owner permission required'; end if;
  select * into v_adj from public.finance_adjustments where id=p_adjustment_id for update;
  if not found or v_adj.brand_id<>v_brand then raise exception 'Adjustment not found'; end if;
  if v_adj.status='posted' then return v_adj; end if;
  if v_adj.status<>'draft' then raise exception 'Only draft adjustment can be posted'; end if;
  perform private.assert_accounting_period_open(v_brand,v_adj.entry_date);
  select coalesce(sum(debit),0),coalesce(sum(credit),0) into v_debit,v_credit from public.finance_adjustment_lines where adjustment_id=v_adj.id;
  if v_debit<=0 or abs(v_debit-v_credit)>=0.01 then raise exception 'Adjustment is not balanced'; end if;

  insert into public.finance_journal_entries(brand_id,entry_date,source_type,source_id,source_key,description,status,auto_generated,metadata)
  values(v_brand,v_adj.entry_date,'manual_adjustment',v_adj.id,'manual_adjustment:'||v_adj.id::text,v_adj.description,'posted',false,
         jsonb_build_object('adjustment_type',v_adj.adjustment_type,'source_asset_id',v_adj.source_asset_id,'audit_note',v_adj.audit_note))
  on conflict(brand_id,source_key) do update set description=excluded.description,status='posted',metadata=excluded.metadata,updated_at=now()
  returning * into v_journal;

  delete from public.finance_journal_lines where entry_id=v_journal.id;
  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select v_journal.id,brand_id,line_no,account_code,debit,credit,memo from public.finance_adjustment_lines where adjustment_id=v_adj.id order by line_no;

  update public.finance_adjustments set status='posted',posted_journal_entry_id=v_journal.id,posted_by=auth.uid(),posted_at=now(),updated_at=now()
  where id=v_adj.id returning * into v_adj;

  if v_adj.adjustment_type='opening_balance' then
    insert into public.finance_accounting_settings(brand_id,opening_balance_mode,opening_balance_date,opening_balance_note,updated_by,updated_at)
    values(v_brand,'journal_posted',v_adj.entry_date,v_adj.audit_note,auth.uid(),now())
    on conflict(brand_id) do update set opening_balance_mode='journal_posted',opening_balance_date=excluded.opening_balance_date,opening_balance_note=excluded.opening_balance_note,updated_by=auth.uid(),updated_at=now();
  end if;

  perform private.write_audit_log(v_brand,null,'finance_adjustment',v_adj.id,'posted',auth.uid(),null,to_jsonb(v_adj),v_adj.audit_note,jsonb_build_object('journal_entry_id',v_journal.id));
  return v_adj;
end;
$$;

create or replace function private.void_finance_adjustment_v1(p_adjustment_id uuid,p_reason text)
returns public.finance_adjustments
language plpgsql security definer set search_path=''
as $$
declare
  v_brand uuid:=private.my_brand_id();
  v_adj public.finance_adjustments%rowtype;
begin
  if v_brand is null or not private.has_capability('settings.manage') then raise exception 'Owner permission required'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Void reason is required'; end if;
  select * into v_adj from public.finance_adjustments where id=p_adjustment_id for update;
  if not found or v_adj.brand_id<>v_brand then raise exception 'Adjustment not found'; end if;
  if v_adj.status='void' then return v_adj; end if;
  perform private.assert_accounting_period_open(v_brand,v_adj.entry_date);
  if v_adj.posted_journal_entry_id is not null then update public.finance_journal_entries set status='void',updated_at=now() where id=v_adj.posted_journal_entry_id and brand_id=v_brand; end if;
  update public.finance_adjustments set status='void',voided_by=auth.uid(),voided_at=now(),updated_at=now(),audit_note=audit_note||E'\nVOID: '||btrim(p_reason)
  where id=v_adj.id returning * into v_adj;
  perform private.write_audit_log(v_brand,null,'finance_adjustment',v_adj.id,'voided',auth.uid(),null,to_jsonb(v_adj),p_reason,'{}'::jsonb);
  return v_adj;
end;
$$;

create or replace function private.confirm_finance_opening_balance_zero_v1(p_date date,p_reason text)
returns public.finance_accounting_settings
language plpgsql security definer set search_path=''
as $$
declare v_brand uuid:=private.my_brand_id(); v_row public.finance_accounting_settings%rowtype;
begin
  if v_brand is null or not private.has_capability('settings.manage') then raise exception 'Owner permission required'; end if;
  if p_date is null then raise exception 'Opening balance date is required'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Reason is required'; end if;
  if exists(select 1 from public.finance_adjustments where brand_id=v_brand and adjustment_type='opening_balance' and status='posted') then raise exception 'Posted opening balance journal already exists'; end if;
  insert into public.finance_accounting_settings(brand_id,opening_balance_mode,opening_balance_date,opening_balance_note,updated_by,updated_at)
  values(v_brand,'zero_confirmed',p_date,btrim(p_reason),auth.uid(),now())
  on conflict(brand_id) do update set opening_balance_mode='zero_confirmed',opening_balance_date=excluded.opening_balance_date,opening_balance_note=excluded.opening_balance_note,updated_by=auth.uid(),updated_at=now()
  returning * into v_row;
  perform private.write_audit_log(v_brand,null,'finance_accounting_settings',v_brand,'opening_balance_zero_confirmed',auth.uid(),null,to_jsonb(v_row),p_reason,'{}'::jsonb);
  return v_row;
end;
$$;

create or replace function private.save_finance_fixed_asset_v1(
  p_asset_id uuid,
  p_source_purchase_id uuid,
  p_asset_name text,
  p_asset_class text,
  p_acquisition_date date,
  p_available_for_use_date date,
  p_acquisition_cost numeric,
  p_useful_life_months integer,
  p_depreciation_method text,
  p_depreciation_convention text,
  p_declining_rate_annual numeric,
  p_notes text,
  p_activate boolean default false
) returns public.finance_fixed_assets
language plpgsql security definer set search_path=''
as $$
declare
  v_brand uuid:=private.my_brand_id();
  v_asset public.finance_fixed_assets%rowtype;
  v_method text:=nullif(lower(btrim(coalesce(p_depreciation_method,''))), '');
  v_conv text:=nullif(lower(btrim(coalesce(p_depreciation_convention,''))), '');
  v_purchase public.offline_purchase_history%rowtype;
begin
  if v_brand is null or not private.has_capability('settings.manage') then raise exception 'Owner permission required'; end if;
  if nullif(btrim(coalesce(p_asset_name,'')),'') is null then raise exception 'Asset name is required'; end if;
  if p_acquisition_date is null or coalesce(p_acquisition_cost,0)<=0 then raise exception 'Valid acquisition date and cost are required'; end if;
  if p_source_purchase_id is not null then
    select * into v_purchase from public.offline_purchase_history where id=p_source_purchase_id;
    if not found or v_purchase.brand_id<>v_brand then raise exception 'Source purchase not found'; end if;
    if abs(coalesce(v_purchase.total_amount,0)-p_acquisition_cost)>=0.01 then raise exception 'Asset cost must match source purchase amount'; end if;
  end if;
  if p_activate then
    if p_available_for_use_date is null or p_available_for_use_date<p_acquisition_date then raise exception 'Valid available-for-use date is required'; end if;
    if coalesce(p_useful_life_months,0)<=0 then raise exception 'Useful life months are required'; end if;
    if v_method not in ('straight_line','declining_balance','manual') then raise exception 'Depreciation method is required'; end if;
    if v_conv not in ('full_month','next_month','manual') then raise exception 'Depreciation convention is required'; end if;
    if v_method='declining_balance' and not (coalesce(p_declining_rate_annual,0)>0 and p_declining_rate_annual<1) then raise exception 'Declining balance annual rate is required'; end if;
  end if;

  if p_asset_id is null then
    insert into public.finance_fixed_assets(brand_id,source_purchase_id,asset_name,asset_class,acquisition_date,available_for_use_date,acquisition_cost,useful_life_months,depreciation_method,depreciation_convention,declining_rate_annual,status,notes,created_by,activated_by,activated_at)
    values(v_brand,p_source_purchase_id,btrim(p_asset_name),nullif(btrim(coalesce(p_asset_class,'')),''),p_acquisition_date,p_available_for_use_date,p_acquisition_cost,p_useful_life_months,v_method,v_conv,p_declining_rate_annual,case when p_activate then 'active' else 'draft' end,nullif(btrim(coalesce(p_notes,'')),''),auth.uid(),case when p_activate then auth.uid() end,case when p_activate then now() end)
    returning * into v_asset;
  else
    select * into v_asset from public.finance_fixed_assets where id=p_asset_id for update;
    if not found or v_asset.brand_id<>v_brand then raise exception 'Asset not found'; end if;
    if v_asset.status='disposed' then raise exception 'Disposed asset cannot be edited'; end if;
    update public.finance_fixed_assets set source_purchase_id=p_source_purchase_id,asset_name=btrim(p_asset_name),asset_class=nullif(btrim(coalesce(p_asset_class,'')),''),acquisition_date=p_acquisition_date,available_for_use_date=p_available_for_use_date,acquisition_cost=p_acquisition_cost,useful_life_months=p_useful_life_months,depreciation_method=v_method,depreciation_convention=v_conv,declining_rate_annual=p_declining_rate_annual,status=case when p_activate then 'active' else status end,notes=nullif(btrim(coalesce(p_notes,'')),''),activated_by=case when p_activate and status='draft' then auth.uid() else activated_by end,activated_at=case when p_activate and status='draft' then now() else activated_at end,updated_at=now()
    where id=v_asset.id returning * into v_asset;
  end if;
  perform private.write_audit_log(v_brand,null,'finance_fixed_asset',v_asset.id,case when p_activate then 'activated' else 'saved' end,auth.uid(),null,to_jsonb(v_asset),p_notes,'{}'::jsonb);
  return v_asset;
end;
$$;

create or replace function public.save_finance_adjustment_v1(p_adjustment_id uuid,p_type text,p_entry_date date,p_description text,p_lines jsonb,p_reason text,p_source_asset_id uuid default null)
returns public.finance_adjustments language sql security invoker set search_path='' as $$select private.save_finance_adjustment_v1(p_adjustment_id,p_type,p_entry_date,p_description,p_lines,p_reason,p_source_asset_id);$$;
create or replace function public.post_finance_adjustment_v1(p_adjustment_id uuid)
returns public.finance_adjustments language sql security invoker set search_path='' as $$select private.post_finance_adjustment_v1(p_adjustment_id);$$;
create or replace function public.void_finance_adjustment_v1(p_adjustment_id uuid,p_reason text)
returns public.finance_adjustments language sql security invoker set search_path='' as $$select private.void_finance_adjustment_v1(p_adjustment_id,p_reason);$$;
create or replace function public.confirm_finance_opening_balance_zero_v1(p_date date,p_reason text)
returns public.finance_accounting_settings language sql security invoker set search_path='' as $$select private.confirm_finance_opening_balance_zero_v1(p_date,p_reason);$$;
create or replace function public.save_finance_fixed_asset_v1(p_asset_id uuid,p_source_purchase_id uuid,p_asset_name text,p_asset_class text,p_acquisition_date date,p_available_for_use_date date,p_acquisition_cost numeric,p_useful_life_months integer,p_depreciation_method text,p_depreciation_convention text,p_declining_rate_annual numeric,p_notes text,p_activate boolean default false)
returns public.finance_fixed_assets language sql security invoker set search_path='' as $$select private.save_finance_fixed_asset_v1(p_asset_id,p_source_purchase_id,p_asset_name,p_asset_class,p_acquisition_date,p_available_for_use_date,p_acquisition_cost,p_useful_life_months,p_depreciation_method,p_depreciation_convention,p_declining_rate_annual,p_notes,p_activate);$$;

grant execute on function public.save_finance_adjustment_v1(uuid,text,date,text,jsonb,text,uuid) to authenticated;
grant execute on function public.post_finance_adjustment_v1(uuid) to authenticated;
grant execute on function public.void_finance_adjustment_v1(uuid,text) to authenticated;
grant execute on function public.confirm_finance_opening_balance_zero_v1(date,text) to authenticated;
grant execute on function public.save_finance_fixed_asset_v1(uuid,uuid,text,text,date,date,numeric,integer,text,text,numeric,text,boolean) to authenticated;
revoke all on function public.save_finance_adjustment_v1(uuid,text,date,text,jsonb,text,uuid) from anon;
revoke all on function public.post_finance_adjustment_v1(uuid) from anon;
revoke all on function public.void_finance_adjustment_v1(uuid,text) from anon;
revoke all on function public.confirm_finance_opening_balance_zero_v1(date,text) from anon;
revoke all on function public.save_finance_fixed_asset_v1(uuid,uuid,text,text,date,date,numeric,integer,text,text,numeric,text,boolean) from anon;
