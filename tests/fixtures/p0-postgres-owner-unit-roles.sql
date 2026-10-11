-- Disposable Hasnaria P0 role-authority regression.
-- Mimic the production Owner guard with controllable simulated auth claims;
-- SECURITY DEFINER in private must never become bypassable by staff or anon.
create or replace function auth.uid()
returns uuid language sql stable set search_path=''
as $auth$select nullif(current_setting('app.test_uid',true),'')::uuid$auth$;

create or replace function private.owner_stock_review_assert_v1()
returns uuid language plpgsql stable security definer set search_path=''
as $authority$
begin
 if auth.uid() is null or current_setting('app.test_role',true) is distinct from 'owner' then
   raise exception 'Owner aktif diperlukan';
 end if;
 return '00000000-0000-0000-0000-000000000001'::uuid;
end;
$authority$;

grant usage on schema private to authenticated;
-- Do NOT grant SELECT/INSERT/UPDATE/DELETE on the evidence table.

-- A signed-in Owner can read an empty/test queue through the public invoker
-- wrapper, without needing direct access to its private evidence tables.
set role authenticated;
select set_config('app.test_uid','00000000-0000-0000-0000-000000009999',false);
select set_config('app.test_role','owner',false);
do $owner$
declare j jsonb;
begin
 j:=public.owner_purchase_unit_queue_v1(
  date_trunc('month',current_date-interval '1 month')::date);
 if (j->>'total')::integer<>2 then
   raise exception 'Owner wrapper cannot access expected queue: %',j;
 end if;
 if has_table_privilege('authenticated','private.purchase_unit_attestations_v1','SELECT')
    or has_table_privilege('authenticated','private.purchase_unit_attestations_v1','INSERT') then
   raise exception 'Private attestation table is accessible outside Owner RPC';
 end if;
end;
$owner$;

-- Emulate signed-in staff with the same database role as Owner.
select set_config('app.test_role','staff',false);
do $staff$
declare denied boolean; src uuid:='00000000-0000-0000-0000-000000000204';
begin
 denied:=false;
 begin
  perform public.owner_purchase_unit_queue_v1(
   date_trunc('month',current_date-interval '1 month')::date);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Staff can enumerate Owner Purchase source data'; end if;

 denied:=false;
 begin
  perform public.owner_purchase_unit_preview_v1(src,'pack',20);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Staff can preview Owner Purchase quantities'; end if;

 denied:=false;
 begin
  perform public.owner_purchase_unit_apply_v1(
   src,'pack',20,'not-a-real-token','Invoice fixture number 204',
   'Staff must not be able to record source unit conversion');
 exception when others then denied:=true; end;
 if not denied then raise exception 'Staff can approve source unit attestations'; end if;

 denied:=false;
 begin
  perform public.owner_purchase_unit_revoke_v1(
   '00000000-0000-0000-0000-000000000404',
   'Staff must never cancel a source unit verification');
 exception when others then denied:=true; end;
 if not denied then raise exception 'Staff can revoke Owner source evidence'; end if;
end;
$staff$;

-- Logged-out tokens must fail even if a spoofed role claims "owner".
select set_config('app.test_role','owner',false);
select set_config('app.test_uid','',false);
do $unsigned$
declare denied boolean:=false;
begin
 begin
  perform public.owner_purchase_unit_queue_v1(
   date_trunc('month',current_date-interval '1 month')::date);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Unsigned user can read the Owner queue'; end if;
end;
$unsigned$;
reset role;

-- A different tenant's source UUID is not eligible for the active brand.
-- Review functions must not reveal or attest any cross-brand canonical source.
select set_config('app.test_role','owner',false);
select set_config('app.test_uid','00000000-0000-0000-0000-000000009999',false);
insert into public.inventory_items(id,brand_id,item_name,category,unit,opening_qty)
values ('00000000-0000-0000-0000-000000000190',
        '00000000-0000-0000-0000-000000000002',
        'OTHER BRAND ITEM','Bahan','pcs',0);
insert into public.offline_purchase_history
 (id,brand_id,source_period,source_file,row_no,purchase_date,
 item_name,quantity_text,unit_text,unit_price,total_amount,inventory_item_id)
values('00000000-0000-0000-0000-000000000290',
       '00000000-0000-0000-0000-000000000002',
       date_trunc('month',current_date-interval '1 month')::date,
       'other-brand-source.xlsx',1,current_date-4,'OTHER BRAND ITEM',
       '1','pcs',100,100,'00000000-0000-0000-0000-000000000190');
do $tenant$
declare denied boolean:=false;
begin
 begin
  perform public.owner_purchase_unit_preview_v1(
   '00000000-0000-0000-0000-000000000290','pcs',1);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Owner can review another brand source'; end if;
 if (select count(*) from private.purchase_unit_attestations_v1)<>1 then
   raise exception 'Role/tenant tests changed documentary approval history';
 end if;
 raise notice 'HSN-P0 AUTH PASS: owner reads; staff read/preview/apply/revoke denied; unsigned and cross-brand denied; evidence untouched.';
end;
$tenant$;

do $anon$
begin
 if has_function_privilege('anon','public.owner_purchase_unit_queue_v1(date)','EXECUTE')
    or has_function_privilege('anon','public.owner_purchase_unit_apply_v1(uuid,text,numeric,text,text,text)','EXECUTE')
 then raise exception 'Anonymous access unexpectedly granted to Owner unit RPC'; end if;
end;
$anon$;
