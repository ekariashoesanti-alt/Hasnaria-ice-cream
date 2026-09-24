create or replace function private.purchase_evidence_lineage_before_insert()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job uuid;
  v_user uuid := auth.uid();
  v_supplier uuid;
begin
  if new.import_job_id is null then
    select j.id into v_job
    from public.import_jobs j
    where j.brand_id=new.brand_id
      and j.module='purchasing'
      and j.source_file=new.source_file
      and j.metadata->>'source_type'=new.source_type
      and coalesce((j.metadata->>'runtime_auto_batch')::boolean,false)=true
      and j.created_at > now() - interval '10 minutes'
      and j.created_by is not distinct from v_user
    order by j.created_at desc
    limit 1;

    if v_job is null then
      insert into public.import_jobs(
        brand_id,module,source_file,status,period_from,period_to,
        rows_total,rows_valid,rows_failed,rows_posted,metadata,created_by
      ) values (
        new.brand_id,'purchasing',new.source_file,'posting',new.source_period,
        (new.source_period + interval '1 month - 1 day')::date,
        0,0,0,0,
        jsonb_build_object('source_type',new.source_type,'runtime_auto_batch',true),
        v_user
      ) returning id into v_job;
    end if;
    new.import_job_id := v_job;
  end if;

  if new.supplier_id is null and new.supplier_name is not null and btrim(new.supplier_name)<>'' then
    select s.id into v_supplier
    from public.suppliers s
    where s.brand_id=new.brand_id
      and s.active
      and regexp_replace(lower(btrim(s.name)),'\s+',' ','g') = regexp_replace(lower(btrim(new.supplier_name)),'\s+',' ','g')
    order by s.created_at,s.id
    limit 1;
    new.supplier_id := v_supplier;
  end if;

  return new;
end;
$$;

create or replace function private.purchase_evidence_lineage_after_insert()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.import_job_id is not null then
    update public.import_jobs j
    set period_from=least(coalesce(j.period_from,new.source_period),new.source_period),
        period_to=greatest(coalesce(j.period_to,(new.source_period + interval '1 month - 1 day')::date),(new.source_period + interval '1 month - 1 day')::date),
        rows_total=j.rows_total+1,
        rows_valid=j.rows_valid+1,
        rows_posted=j.rows_posted+1,
        status='completed',
        completed_at=now(),
        metadata=j.metadata || jsonb_build_object('last_evidence_at',now())
    where j.id=new.import_job_id;
  end if;
  return null;
end;
$$;

revoke all on function private.purchase_evidence_lineage_before_insert() from public,anon,authenticated;
revoke all on function private.purchase_evidence_lineage_after_insert() from public,anon,authenticated;

drop trigger if exists trg_purchase_evidence_lineage_before_insert on public.purchase_import_evidence;
create trigger trg_purchase_evidence_lineage_before_insert
before insert on public.purchase_import_evidence
for each row execute function private.purchase_evidence_lineage_before_insert();

drop trigger if exists trg_purchase_evidence_lineage_after_insert on public.purchase_import_evidence;
create trigger trg_purchase_evidence_lineage_after_insert
after insert on public.purchase_import_evidence
for each row execute function private.purchase_evidence_lineage_after_insert();
