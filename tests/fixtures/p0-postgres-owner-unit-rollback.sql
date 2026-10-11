-- Runs only after emergency pause SQL in isolated GitHub Actions Postgres.
do $rollback$
declare p jsonb; rejected boolean := false;
begin
  p:=public.owner_purchase_unit_queue_v1((current_date-interval '1 month')::date);
  if (p->>'total')::int<>2 then
    raise exception 'Emergency pause must keep Owner review queue readable: %',p;
  end if;
  begin
    perform private.owner_purchase_unit_apply_v1(
      '00000000-0000-0000-0000-000000000204','pack',20,
      'not_a_real_token','Invoice synthetic fixture 204',
      'Satuan kemasan 20 pcs sudah diperiksa oleh Owner');
  exception when others then
    rejected:=position('sementara dihentikan' in sqlerrm)>0;
  end;
  if not rejected then
    raise exception 'Emergency Owner-unit rollback failed to pause write';
  end if;
  if (select count(*) from public.inventory_purchase_log)<>5 then
    raise exception 'Emergency Owner-unit rollback touched Stock receipt history';
  end if;
  raise notice 'HSN-P0 OWNER UNIT ROLLBACK PASS: queue still readable; approvals paused, Stock records preserved.';
end;
$rollback$;
