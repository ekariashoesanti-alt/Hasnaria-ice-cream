-- Unblock authenticated Purchase upload/runtime after account-routing v4.
-- Unknown payment labels are preserved for Staff Kasir reconciliation instead of rejecting the upload.

create or replace function private.enforce_purchase_payment_method_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_method text;
  v_source_label text:=nullif(btrim(coalesce(new.payment_method,'')),'');
begin
  v_method:=private.normalize_purchase_payment_method_v1(new.payment_method);

  if v_method is null then
    new.raw_data:=coalesce(new.raw_data,'{}'::jsonb)||jsonb_build_object(
      'source_payment_label',v_source_label,
      'account_mapping_status','unmapped',
      'payment_normalization','provisional_fallback'
    );
    new.payment_method:='BELUM_DIPETAKAN';
  else
    new.payment_method:=v_method;
    if v_method='BELUM_DIPETAKAN' then
      new.raw_data:=coalesce(new.raw_data,'{}'::jsonb)||jsonb_build_object(
        'source_payment_label',coalesce(nullif(new.raw_data->>'source_payment_label',''),v_source_label),
        'account_mapping_status','unmapped'
      );
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_purchase_payment_method_v1() from public,anon,authenticated;
grant execute on function private.enforce_purchase_payment_method_v1() to postgres,service_role;

-- The canonical replace RPC already performs auth.uid(), brand, and purchasing capability checks.
grant execute on function public.replace_purchase_canonical_period_v1(date,jsonb) to authenticated,service_role;

-- finance_purchase_expense_bridge_v1 is SECURITY INVOKER and references this pure immutable helper.
-- Authenticated users therefore need EXECUTE on the helper for Purchase screens to render/import.
grant execute on function private.normalize_purchase_payment_method_v1(text) to authenticated,service_role;

comment on function private.enforce_purchase_payment_method_v1() is
  'SECURITY DEFINER trigger guard; unknown payment methods become BELUM_DIPETAKAN and remain reviewable by Staff Kasir.';
comment on function public.replace_purchase_canonical_period_v1(date,jsonb) is
  'Authenticated owner/importer RPC for canonical Purchase replacement; internal capability checks remain authoritative.';
comment on function private.normalize_purchase_payment_method_v1(text) is
  'Pure immutable Purchase payment normalizer; executable by authenticated because security-invoker Purchase views reference it.';