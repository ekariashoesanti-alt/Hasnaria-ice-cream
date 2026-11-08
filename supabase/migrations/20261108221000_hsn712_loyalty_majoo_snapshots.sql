-- HSN-712: Majoo Loyalty snapshots. No changes to sales, stock or ledger.
begin;

create table if not exists public.loyalty_import_batches (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  period_month date not null,
  source_file text not null,
  source_sha256 text not null,
  source_generated_at timestamptz not null,
  source_rows integer not null check (source_rows between 1 and 2000),
  transaction_count integer not null default 0 check (transaction_count >= 0),
  revenue_amount numeric(18,2) not null default 0 check (revenue_amount >= 0),
  is_current boolean not null default true,
  imported_by uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default now(),
  constraint loyalty_period_first_day check (period_month=date_trunc('month',period_month)::date),
  constraint loyalty_sha_format check (source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint loyalty_file_not_empty check (length(btrim(source_file)) between 1 and 255),
  unique (brand_id, period_month, source_sha256)
);
create unique index if not exists loyalty_one_current_period_uidx
  on public.loyalty_import_batches(brand_id,period_month) where is_current;
create index if not exists loyalty_imports_latest_idx
  on public.loyalty_import_batches(brand_id,period_month desc,imported_at desc);

create table if not exists public.loyalty_customer_snapshots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  batch_id uuid not null references public.loyalty_import_batches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  period_month date not null,
  source_name text not null,
  registration_date date,
  registration_outlet text,
  last_visit_at timestamptz,
  period_visits integer not null check (period_visits >= 1),
  period_revenue numeric(18,2) not null check (period_revenue >= 0),
  source_row integer not null check (source_row >= 11),
  unique(batch_id,customer_id),
  unique(batch_id,source_row)
);
create index if not exists loyalty_snapshots_batch_spend_idx
  on public.loyalty_customer_snapshots(batch_id,period_revenue desc);
create index if not exists loyalty_snapshots_customer_period_idx
  on public.loyalty_customer_snapshots(customer_id,period_month desc);

alter table public.loyalty_import_batches enable row level security;
alter table public.loyalty_customer_snapshots enable row level security;
drop policy if exists loyalty_batches_owner_read on public.loyalty_import_batches;
create policy loyalty_batches_owner_read on public.loyalty_import_batches
for select to authenticated
using ((select private.same_brand(brand_id)) and (select private.is_owner()));
drop policy if exists loyalty_snapshots_owner_read on public.loyalty_customer_snapshots;
create policy loyalty_snapshots_owner_read on public.loyalty_customer_snapshots
for select to authenticated
using ((select private.same_brand(brand_id)) and (select private.is_owner()));

revoke all on public.loyalty_import_batches from public,anon,authenticated;
revoke all on public.loyalty_customer_snapshots from public,anon,authenticated;
grant select on public.loyalty_import_batches to authenticated;
grant select on public.loyalty_customer_snapshots to authenticated;

create or replace function public.import_loyalty_majoo_v1(
  p_period_month date,
  p_filename text,
  p_sha256 text,
  p_generated_at timestamptz,
  p_rows jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_brand uuid;
  v_batch uuid;
  v_previous timestamptz;
  v_row jsonb;
  v_phone text;
  v_name text;
  v_customer uuid;
  v_first_seen timestamptz;
  v_last_seen timestamptz;
  v_reg_date date;
  v_visits integer;
  v_revenue numeric(18,2);
  v_count integer := 0;
  v_total_visits integer := 0;
  v_total_revenue numeric(18,2) := 0;
  v_source_row integer;
  v_seen_phones text[] := array[]::text[];
begin
  select u.brand_id into v_brand from public.user_profiles u
  where u.id=auth.uid() and u.status='active' and u.role='owner';
  if v_brand is null then raise exception 'Akses impor Loyalty hanya untuk Owner aktif.' using errcode='42501'; end if;
  if p_period_month is null or p_period_month<>date_trunc('month',p_period_month)::date then
    raise exception 'Bulan laporan harus tanggal pertama bulan.';
  end if;
  if p_filename is null or length(btrim(p_filename)) not between 1 and 255
     or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_generated_at is null or p_generated_at > now()+interval '1 day' then
    raise exception 'Metadata sumber Majoo tidak valid.';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Data laporan harus array.'; end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Laporan harus memuat 1 sampai 2000 pelanggan.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_brand::text||p_period_month::text,0));
  select id into v_batch from public.loyalty_import_batches
  where brand_id=v_brand and period_month=p_period_month and source_sha256=p_sha256;
  if v_batch is not null then
    return jsonb_build_object('status','duplicate','batch_id',v_batch,'message','File identik sudah pernah diimpor; tidak ada perubahan.');
  end if;
  select source_generated_at into v_previous from public.loyalty_import_batches
  where brand_id=v_brand and period_month=p_period_month and is_current;
  if v_previous is not null and p_generated_at<=v_previous then
    raise exception 'Laporan ini lebih lama atau sama dengan snapshot aktif. Gunakan ekspor Majoo terbaru.';
  end if;

  -- Validate all rows before any import is made durable.
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_name := btrim(coalesce(v_row->>'name',''));
    v_phone := regexp_replace(coalesce(v_row->>'phone',''),'[^0-9]','','g');
    if v_phone !~ '^628[0-9]{8,12}$' or length(v_name) not between 1 and 200 then
      raise exception 'Nama atau nomor telepon tidak valid pada pelanggan baris %.', coalesce(v_row->>'source_row','?');
    end if;
    if v_phone=any(v_seen_phones) then
      raise exception 'Nomor telepon duplikat dalam laporan: akhiran %.',right(v_phone,4);
    end if;
    v_seen_phones := array_append(v_seen_phones,v_phone);
    v_visits := (v_row->>'visits')::integer;
    v_revenue := (v_row->>'revenue')::numeric(18,2);
    v_source_row := (v_row->>'source_row')::integer;
    if v_visits < 1 or v_visits > 100000 or v_revenue < 0 or v_revenue > 1000000000000
       or v_source_row < 11 or v_source_row > 100000 then
      raise exception 'Metrik pelanggan tidak valid pada baris %.', v_source_row;
    end if;
    v_count := v_count+1;
    v_total_visits := v_total_visits+v_visits;
    v_total_revenue := v_total_revenue+v_revenue;
  end loop;

  update public.loyalty_import_batches set is_current=false
  where brand_id=v_brand and period_month=p_period_month and is_current;
  insert into public.loyalty_import_batches
     (brand_id,period_month,source_file,source_sha256,source_generated_at,source_rows,transaction_count,revenue_amount,imported_by)
  values (v_brand,p_period_month,btrim(p_filename),p_sha256,p_generated_at,v_count,v_total_visits,v_total_revenue,auth.uid())
  returning id into v_batch;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_name := btrim(v_row->>'name');
    v_phone := regexp_replace(v_row->>'phone','[^0-9]','','g');
    v_reg_date := nullif(v_row->>'registration_date','')::date;
    v_first_seen := case when v_reg_date is null then null else v_reg_date::timestamp at time zone 'Asia/Jakarta' end;
    v_last_seen := case when nullif(v_row->>'last_visit_at','') is null
      then null else (v_row->>'last_visit_at')::timestamp at time zone 'Asia/Jakarta' end;
    if v_reg_date is not null and v_reg_date > (p_period_month + interval '2 months')::date then
      raise exception 'Tanggal registrasi di luar jangkauan.';
    end if;
    select c.id into v_customer from public.customers c
    where c.brand_id=v_brand and regexp_replace(c.phone,'[^0-9]','','g')=v_phone limit 1;
    if v_customer is null then
      insert into public.customers(brand_id,name,phone,first_seen_at,last_seen_at)
      values(v_brand,v_name,v_phone,v_first_seen,v_last_seen)
      returning id into v_customer;
    else
      update public.customers c
      set name=case when btrim(coalesce(c.name,''))='' then v_name else c.name end,
          first_seen_at=case when c.first_seen_at is null then v_first_seen when v_first_seen is null then c.first_seen_at else least(c.first_seen_at,v_first_seen) end,
          last_seen_at=case when c.last_seen_at is null then v_last_seen when v_last_seen is null then c.last_seen_at else greatest(c.last_seen_at,v_last_seen) end,
          updated_at=now()
      where c.id=v_customer and c.brand_id=v_brand;
    end if;
    insert into public.loyalty_customer_snapshots
    (brand_id,batch_id,customer_id,period_month,source_name,registration_date,registration_outlet,last_visit_at,period_visits,period_revenue,source_row)
    values(v_brand,v_batch,v_customer,p_period_month,v_name,v_reg_date,
      left(coalesce(v_row->>'registration_outlet',''),160),v_last_seen,
      (v_row->>'visits')::integer,(v_row->>'revenue')::numeric(18,2),(v_row->>'source_row')::integer);
    v_customer:=null;
  end loop;
  return jsonb_build_object('status','imported','batch_id',v_batch,
    'customers',v_count,'transactions',v_total_visits,'revenue',v_total_revenue);
end;
$$;
revoke all on function public.import_loyalty_majoo_v1(date,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.import_loyalty_majoo_v1(date,text,text,timestamptz,jsonb) to authenticated;

create or replace function public.get_loyalty_dashboard_v1(
  p_period_month date default null,
  p_search text default '',
  p_sort text default 'spend',
  p_limit integer default 25,
  p_offset integer default 0
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_brand uuid;
  v_batch public.loyalty_import_batches%rowtype;
  v_clients integer;
  v_repeat integer;
  v_visits bigint;
  v_sales numeric;
  v_repeat_sales numeric;
  v_rows jsonb;
  v_total integer;
  v_dist jsonb;
begin
  select u.brand_id into v_brand from public.user_profiles u
  where u.id=auth.uid() and u.status='active' and u.role='owner';
  if v_brand is null then raise exception 'Akses Loyalty hanya untuk Owner aktif.' using errcode='42501'; end if;
  if p_limit not between 1 and 100 or p_offset < 0 or p_offset > 100000
     or coalesce(p_sort,'') not in ('spend','visits','recent','name')
     or length(coalesce(p_search,''))>100 then
     raise exception 'Parameter pencarian atau halaman tidak valid.';
  end if;
  select * into v_batch from public.loyalty_import_batches b
  where b.brand_id=v_brand and b.is_current and (p_period_month is null or b.period_month=p_period_month)
  order by b.period_month desc limit 1;
  if not found then return jsonb_build_object('status','empty','customers','[]'::jsonb); end if;
  select count(*),count(*) filter(where period_visits>=2),coalesce(sum(period_visits),0),
    coalesce(sum(period_revenue),0),coalesce(sum(period_revenue) filter(where period_visits>=2),0)
  into v_clients,v_repeat,v_visits,v_sales,v_repeat_sales
  from public.loyalty_customer_snapshots where batch_id=v_batch.id;
  select count(*) into v_total from public.loyalty_customer_snapshots s
  where s.batch_id=v_batch.id and
    (coalesce(btrim(p_search),'')='' or s.source_name ilike '%'||btrim(p_search)||'%' or
      exists(select 1 from public.customers c where c.id=s.customer_id and c.phone like '%'||regexp_replace(p_search,'[^0-9]','','g')||'%'));
  select coalesce(jsonb_agg(to_jsonb(z)),'[]'::jsonb) into v_rows from (
    select s.customer_id,s.source_name as name,right(c.phone,4) as phone_last4,
      s.period_visits as visits,s.period_revenue as revenue,s.last_visit_at,
      s.registration_date,s.registration_outlet,
      case when s.period_visits>=3 then 'high_frequency'
        when s.period_visits>=2 then 'repeat' else 'single' end as segment
    from public.loyalty_customer_snapshots s
    join public.customers c on c.id=s.customer_id and c.brand_id=v_brand
    where s.batch_id=v_batch.id and (coalesce(btrim(p_search),'')='' or
      s.source_name ilike '%'||btrim(p_search)||'%' or c.phone like '%'||regexp_replace(p_search,'[^0-9]','','g')||'%')
    order by
      case when p_sort='spend' then s.period_revenue end desc nulls last,
      case when p_sort='visits' then s.period_visits end desc nulls last,
      case when p_sort='recent' then s.last_visit_at end desc nulls last,
      case when p_sort='name' then lower(s.source_name) end asc nulls last,
      s.source_name asc,s.customer_id
    limit p_limit offset p_offset
  ) z;
  select coalesce(jsonb_agg(jsonb_build_object('group',x.group_name,'customers',x.n,'revenue',x.revenue)
           order by x.sort_key),'[]'::jsonb)
  into v_dist from (
    select case when period_visits>=3 then '3+' when period_visits=2 then '2' else '1' end as group_name,
      case when period_visits>=3 then 3 when period_visits=2 then 2 else 1 end as sort_key,
      count(*) as n,sum(period_revenue) as revenue
    from public.loyalty_customer_snapshots where batch_id=v_batch.id
    group by 1,2
  ) x;
  return jsonb_build_object(
    'status','ok',
    'batch',jsonb_build_object('id',v_batch.id,'period_month',v_batch.period_month,
      'source_file',v_batch.source_file,'source_generated_at',v_batch.source_generated_at,
      'imported_at',v_batch.imported_at,'source_rows',v_batch.source_rows,
      'transactions',v_batch.transaction_count,'revenue',v_batch.revenue_amount),
    'summary',jsonb_build_object('customers',v_clients,'repeat_customers',v_repeat,
       'transactions',v_visits,'revenue',v_sales,'repeat_revenue',v_repeat_sales),
    'distribution',v_dist,'customers',v_rows,'matched_rows',v_total);
end;
$$;
revoke all on function public.get_loyalty_dashboard_v1(date,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.get_loyalty_dashboard_v1(date,text,text,integer,integer) to authenticated;

comment on table public.loyalty_import_batches is 'Versioned Majoo customer report provenance; only one current batch per brand-month. Never included in sales/finance turnover.';
comment on table public.loyalty_customer_snapshots is 'Majoo monthly customer metrics snapshot; source aggregates must not be joined as transaction-level sales.';
commit;