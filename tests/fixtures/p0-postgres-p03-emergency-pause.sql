-- P0.3 emergency pause regression on disposable PostgreSQL.
create temporary table p03_pause_prior as
select count(*)::bigint reviews_before from private.purchase_unmapped_owner_decisions_v1;
select set_config('app.test_uid','00000000-0000-0000-0000-000000009999',false);
select set_config('app.test_role','owner',false);
set role authenticated;
do $check$
declare fail_apply boolean:=false;fail_revoke boolean:=false;queue jsonb;
begin
 begin
  perform public.owner_purchase_unmapped_apply_v1(
   '00000000-0000-0000-0000-000000000281','HOLD_FOR_EVIDENCE',
   null,null,'stale-token','Supplier invoice archive #281',
   'Owner review should remain blocked during emergency audit pause');
 exception when others then fail_apply:=position('P0.3 PAUSED' in sqlerrm)>0;end;
 if not fail_apply then raise exception 'Pause allowed new mapping review';end if;
 begin
  perform public.owner_purchase_unmapped_revoke_v1(
   '00000000-0000-0000-0000-000000000481',
   'Owner must not revoke a mapping decision while P03 is paused');
 exception when others then fail_revoke:=position('P0.3 PAUSED' in sqlerrm)>0;end;
 if not fail_revoke then raise exception 'Pause allowed mapping revoke';end if;
 queue:=public.owner_purchase_unmapped_queue_v1(
  date_trunc('month',current_date-interval '1 month')::date);
 if queue->>'mode'<>'document_mapping_only_no_business_posting' then
  raise exception 'Pause unexpectedly disabled read-only mapping queue';end if;
 raise notice 'HSN P03 PAUSE PASS: no Owner mapping writes, queue still readable';
end;
$check$;
reset role;
do $verify$
begin
 if (select count(*) from private.purchase_unmapped_owner_decisions_v1) <>
    (select reviews_before from pg_temp.p03_pause_prior) then
  raise exception 'Pause changed existing P03 documentary reviews';end if;
end;$verify$;
