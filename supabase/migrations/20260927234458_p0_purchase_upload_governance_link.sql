-- Complete P0 upload governance for the canonical Purchase upload history.

alter table public.offline_purchase_history
  add column if not exists import_job_id uuid;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='offline_purchase_history_import_job_id_fkey') then
    alter table public.offline_purchase_history
      add constraint offline_purchase_history_import_job_id_fkey
      foreign key(import_job_id) references public.import_jobs(id) on delete set null;
  end if;
end $$;

create index if not exists offline_purchase_history_import_job_idx
  on public.offline_purchase_history(import_job_id)
  where import_job_id is not null;

create unique index if not exists import_jobs_purchasing_source_file_uidx
  on public.import_jobs(brand_id, lower(btrim(source_file)))
  where lower(btrim(module))='purchasing' and file_hash is null;

-- Reuse an existing governed Purchase job when the canonical source filename already exists.
update public.offline_purchase_history h
set import_job_id=j.id
from public.import_jobs j
where h.import_job_id is null
  and j.brand_id=h.brand_id
  and lower(btrim(j.module))='purchasing'
  and lower(btrim(j.source_file))=lower(btrim(h.source_file));

-- Backfill one auditable, owner-approved job per remaining historical Purchase source file.
insert into public.import_jobs(
  brand_id,module,source_file,file_hash,status,period_from,period_to,
  rows_total,rows_valid,rows_failed,rows_posted,metadata,created_at,completed_at,
  source_type,approval_status,approved_at,governance_note
)
select
  h.brand_id,'purchasing',h.source_file,null,'completed',
  min(h.purchase_date),max(h.purchase_date),count(*)::integer,count(*)::integer,0,count(*)::integer,
  jsonb_build_object('legacy_source','offline_purchase_history','governance_backfill','P0'),
  min(h.created_at),max(h.created_at),'owner_upload','approved',min(h.created_at),
  'P0 backfill: canonical Purchase upload source auto-approved with explicit provenance'
from public.offline_purchase_history h
where h.import_job_id is null
group by h.brand_id,h.source_file
on conflict do nothing;

update public.offline_purchase_history h
set import_job_id=j.id,
    raw_data=coalesce(h.raw_data,'{}'::jsonb) || jsonb_build_object(
      'import_job_id',j.id,
      'governance_source_type',j.source_type,
      'governance_approval_status',j.approval_status
    )
from public.import_jobs j
where h.import_job_id is null
  and j.brand_id=h.brand_id
  and lower(btrim(j.module))='purchasing'
  and lower(btrim(j.source_file))=lower(btrim(h.source_file));

-- Also stamp already-linked rows with the governed source identity for lossless audit/export.
update public.offline_purchase_history h
set raw_data=coalesce(h.raw_data,'{}'::jsonb) || jsonb_build_object(
      'import_job_id',j.id,
      'governance_source_type',j.source_type,
      'governance_approval_status',j.approval_status
    )
from public.import_jobs j
where h.import_job_id=j.id
  and not (coalesce(h.raw_data,'{}'::jsonb) ? 'import_job_id');

create or replace function private.ensure_purchase_history_governance_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job uuid;
begin
  if new.import_job_id is not null then
    return new;
  end if;

  select id into v_job
  from public.import_jobs
  where brand_id=new.brand_id
    and lower(btrim(module))='purchasing'
    and file_hash is null
    and lower(btrim(source_file))=lower(btrim(new.source_file))
  order by created_at desc
  limit 1;

  if v_job is null then
    begin
      insert into public.import_jobs(
        brand_id,module,source_file,file_hash,status,period_from,period_to,
        rows_total,rows_valid,rows_failed,rows_posted,metadata,created_at,completed_at,
        source_type,approval_status,approved_by,approved_at,governance_note
      ) values(
        new.brand_id,'purchasing',new.source_file,null,'completed',new.purchase_date,new.purchase_date,
        1,1,0,1,jsonb_build_object('source','offline_purchase_history','first_row_id',new.id),
        coalesce(new.created_at,now()),coalesce(new.created_at,now()),
        'owner_upload','approved',auth.uid(),coalesce(new.created_at,now()),
        'Purchase upload auto-approved; governance linked by trigger'
      ) returning id into v_job;
    exception when unique_violation then
      select id into v_job
      from public.import_jobs
      where brand_id=new.brand_id
        and lower(btrim(module))='purchasing'
        and file_hash is null
        and lower(btrim(source_file))=lower(btrim(new.source_file))
      limit 1;
    end;
  end if;

  new.import_job_id:=v_job;
  new.raw_data:=coalesce(new.raw_data,'{}'::jsonb) || jsonb_build_object(
    'import_job_id',v_job,
    'governance_source_type','owner_upload',
    'governance_approval_status','approved'
  );
  return new;
end;
$$;

drop trigger if exists offline_purchase_history_governance_trg on public.offline_purchase_history;
create trigger offline_purchase_history_governance_trg
before insert or update of import_job_id on public.offline_purchase_history
for each row execute function private.ensure_purchase_history_governance_v1();

comment on column public.offline_purchase_history.import_job_id is
  'Governed provenance link for Purchase uploads; Owner uploads are explicitly auto-approved.';
