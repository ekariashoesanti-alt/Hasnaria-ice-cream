alter table public.purchase_import_evidence
  add column if not exists import_job_id uuid references public.import_jobs(id) on delete set null,
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

create index if not exists purchase_import_evidence_import_job_idx
  on public.purchase_import_evidence(import_job_id)
  where import_job_id is not null;

create index if not exists purchase_import_evidence_supplier_idx
  on public.purchase_import_evidence(brand_id, supplier_id)
  where supplier_id is not null;

insert into public.import_jobs(
  brand_id,module,source_file,status,period_from,period_to,
  rows_total,rows_valid,rows_failed,rows_posted,metadata,completed_at
)
select
  e.brand_id,
  'purchasing',
  e.source_file,
  'completed',
  min(e.source_period),
  (max(e.source_period) + interval '1 month - 1 day')::date,
  count(*)::int,
  count(*)::int,
  0,
  count(*)::int,
  jsonb_build_object('source_type',e.source_type,'backfilled_from_evidence',true),
  now()
from public.purchase_import_evidence e
where e.import_job_id is null
group by e.brand_id,e.source_type,e.source_file;

update public.purchase_import_evidence e
set import_job_id=j.id
from public.import_jobs j
where e.import_job_id is null
  and j.brand_id=e.brand_id
  and j.module='purchasing'
  and j.source_file=e.source_file
  and j.metadata->>'source_type'=e.source_type
  and coalesce((j.metadata->>'backfilled_from_evidence')::boolean,false)=true;

update public.purchase_import_evidence e
set supplier_id = (
  select s.id
  from public.suppliers s
  where s.brand_id=e.brand_id
    and s.active
    and regexp_replace(lower(btrim(s.name)),'\s+',' ','g') = regexp_replace(lower(btrim(e.supplier_name)),'\s+',' ','g')
  order by s.created_at, s.id
  limit 1
)
where e.supplier_id is null
  and e.supplier_name is not null
  and btrim(e.supplier_name)<>''
  and exists (
    select 1
    from public.suppliers s2
    where s2.brand_id=e.brand_id
      and s2.active
      and regexp_replace(lower(btrim(s2.name)),'\s+',' ','g') = regexp_replace(lower(btrim(e.supplier_name)),'\s+',' ','g')
  );
