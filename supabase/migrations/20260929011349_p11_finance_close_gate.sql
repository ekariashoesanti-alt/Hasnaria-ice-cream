create or replace function private.finance_close_gate_state_v1(p_period_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_period public.accounting_periods%rowtype;
  v_core public.finance_close_readiness_v1%rowtype;
  v_purchase public.finance_purchase_reconciliation_monthly_v1%rowtype;
  v_payment_count bigint:=0;
  v_payment_total numeric:=0;
  v_period_complete boolean:=false;
  v_finance_match boolean:=true;
  v_stock_ok boolean:=true;
  v_reviews_ok boolean:=false;
  v_assets_ok boolean:=false;
  v_ready boolean:=false;
  v_blockers text;
begin
  select * into v_period from public.accounting_periods where id=p_period_id;
  if not found then raise exception 'Accounting period not found'; end if;

  select * into v_core
  from public.finance_close_readiness_v1
  where accounting_period_id=v_period.id;

  if not found then raise exception 'Finance close readiness is unavailable'; end if;

  select * into v_purchase
  from public.finance_purchase_reconciliation_monthly_v1
  where brand_id=v_period.brand_id and period_month=v_period.period_start;

  select count(*),coalesce(sum(x.total_amount),0)
  into v_payment_count,v_payment_total
  from public.finance_purchase_expense_bridge_v1 x
  where x.brand_id=v_period.brand_id
    and x.purchase_date>=v_period.period_start
    and x.purchase_date<=v_period.period_end
    and x.journal_status='provisional';

  v_period_complete := timezone('Asia/Jakarta',now())::date > v_period.period_end;
  v_finance_match := coalesce(v_purchase.finance_link_status,'MATCH')='MATCH';
  v_stock_ok := coalesce(v_purchase.stock_review_rows,0)=0
                and coalesce(v_purchase.stock_ready_rows,0)=0
                and coalesce(v_purchase.stock_qty_mismatch_rows,0)=0;
  v_reviews_ok := coalesce(v_core.accruals_reviewed,false)
                  and coalesce(v_core.prepaids_reviewed,false)
                  and coalesce(v_core.tax_reviewed,false);
  v_assets_ok := coalesce(v_core.draft_adjustments,0)=0
                 and coalesce(v_core.unreviewed_investment_candidates,0)=0
                 and coalesce(v_core.draft_assets,0)=0
                 and coalesce(v_core.depreciation_due_assets,0)=0
                 and coalesce(v_core.manual_depreciation_assets,0)=0;

  v_ready := v_period.status='open'
             and v_period_complete
             and v_payment_count=0
             and coalesce(v_core.tender_unclassified_delta,0)<0.01
             and coalesce(v_core.unclassified_purchase_rows,0)=0
             and coalesce(v_core.journal_delta,0)<0.01
             and coalesce(v_core.balance_delta,0)<0.01
             and v_finance_match
             and v_stock_ok
             and coalesce(v_core.opening_balance_mode,'unconfirmed')<>'unconfirmed'
             and v_reviews_ok
             and v_assets_ok;

  v_blockers := concat_ws(' · ',
    case when v_period.status<>'open' then 'Periode sudah ditutup' end,
    case when not v_period_complete then 'Periode belum berakhir ('||v_period.period_end::text||')' end,
    case when v_payment_count>0 then v_payment_count::text||' pembayaran pembelian belum direkonsiliasi' end,
    case when coalesce(v_core.tender_unclassified_delta,0)>=0.01 then 'Tender penjualan belum rekonsiliasi' end,
    case when coalesce(v_core.unclassified_purchase_rows,0)>0 then v_core.unclassified_purchase_rows::text||' pembelian perlu klasifikasi' end,
    case when not v_finance_match then 'Pembelian dan jurnal belum match' end,
    case when coalesce(v_core.journal_delta,0)>=0.01 then 'Jurnal tidak seimbang' end,
    case when coalesce(v_core.balance_delta,0)>=0.01 then 'Posisi keuangan tidak seimbang' end,
    case when coalesce(v_purchase.stock_review_rows,0)>0 then coalesce(v_purchase.stock_review_rows,0)::text||' pembelian perlu review stok' end,
    case when coalesce(v_purchase.stock_ready_rows,0)>0 then coalesce(v_purchase.stock_ready_rows,0)::text||' pembelian siap stok belum diposting' end,
    case when coalesce(v_purchase.stock_qty_mismatch_rows,0)>0 then coalesce(v_purchase.stock_qty_mismatch_rows,0)::text||' kuantitas stok mismatch' end,
    case when coalesce(v_core.opening_balance_mode,'unconfirmed')='unconfirmed' then 'Saldo awal belum dikonfirmasi' end,
    case when not coalesce(v_core.accruals_reviewed,false) then 'Review akrual belum selesai' end,
    case when not coalesce(v_core.prepaids_reviewed,false) then 'Review beban dibayar di muka belum selesai' end,
    case when not coalesce(v_core.tax_reviewed,false) then 'Review pajak belum selesai' end,
    case when coalesce(v_core.draft_adjustments,0)>0 then v_core.draft_adjustments::text||' jurnal penyesuaian masih draft' end,
    case when coalesce(v_core.unreviewed_investment_candidates,0)>0 then v_core.unreviewed_investment_candidates::text||' pembelian investasi belum ditinjau' end,
    case when coalesce(v_core.draft_assets,0)>0 then v_core.draft_assets::text||' aset tetap masih draft' end,
    case when coalesce(v_core.depreciation_due_assets,0)>0 then v_core.depreciation_due_assets::text||' aset perlu posting penyusutan' end,
    case when coalesce(v_core.manual_depreciation_assets,0)>0 then v_core.manual_depreciation_assets::text||' aset perlu review penyusutan manual' end
  );

  return jsonb_build_object(
    'accounting_period_id',v_period.id,
    'period_month',v_period.period_start,
    'period_end',v_period.period_end,
    'period_status',v_period.status,
    'status_label',case when v_period.status='closed' then 'CLOSED' when v_ready then 'READY TO CLOSE' else 'NOT READY' end,
    'ready_to_close',v_ready,
    'blockers',coalesce(v_blockers,''),
    'checks',jsonb_build_array(
      jsonb_build_object('code','period_complete','label','Periode selesai','ok',v_period_complete,'detail',case when v_period_complete then 'Tanggal periode sudah selesai' else 'Berakhir '||v_period.period_end::text end),
      jsonb_build_object('code','payment_reconciliation','label','Pembayaran pembelian','ok',v_payment_count=0,'count',v_payment_count,'amount',v_payment_total),
      jsonb_build_object('code','purchase_finance_link','label','Pembelian → jurnal','ok',v_finance_match and coalesce(v_core.unclassified_purchase_rows,0)=0,'status',coalesce(v_purchase.finance_link_status,'MATCH'),'unclassified',coalesce(v_core.unclassified_purchase_rows,0)),
      jsonb_build_object('code','stock_reconciliation','label','Pembelian → stok','ok',v_stock_ok,'review',coalesce(v_purchase.stock_review_rows,0),'ready',coalesce(v_purchase.stock_ready_rows,0),'mismatch',coalesce(v_purchase.stock_qty_mismatch_rows,0)),
      jsonb_build_object('code','journal_balance','label','Jurnal seimbang','ok',coalesce(v_core.journal_delta,0)<0.01,'delta',coalesce(v_core.journal_delta,0)),
      jsonb_build_object('code','balance_sheet','label','Posisi keuangan seimbang','ok',coalesce(v_core.balance_delta,0)<0.01,'delta',coalesce(v_core.balance_delta,0)),
      jsonb_build_object('code','sales_tender','label','Tender penjualan','ok',coalesce(v_core.tender_unclassified_delta,0)<0.01,'delta',coalesce(v_core.tender_unclassified_delta,0)),
      jsonb_build_object('code','opening_balance','label','Saldo awal','ok',coalesce(v_core.opening_balance_mode,'unconfirmed')<>'unconfirmed','mode',coalesce(v_core.opening_balance_mode,'unconfirmed')),
      jsonb_build_object('code','period_reviews','label','Review akrual / prepaid / pajak','ok',v_reviews_ok,'accruals',coalesce(v_core.accruals_reviewed,false),'prepaids',coalesce(v_core.prepaids_reviewed,false),'tax',coalesce(v_core.tax_reviewed,false)),
      jsonb_build_object('code','adjustments_assets','label','Adjustment & aset','ok',v_assets_ok,'draft_adjustments',coalesce(v_core.draft_adjustments,0),'investment_review',coalesce(v_core.unreviewed_investment_candidates,0),'draft_assets',coalesce(v_core.draft_assets,0),'depreciation_due',coalesce(v_core.depreciation_due_assets,0),'manual_depreciation',coalesce(v_core.manual_depreciation_assets,0))
    )
  );
end;
$$;

create or replace function private.owner_finance_close_gate_v1(p_period date)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_brand uuid;
  v_month date:=date_trunc('month',coalesce(p_period,timezone('Asia/Jakarta',now())::date)::timestamp)::date;
  v_period_id uuid;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;
  if not private.is_owner() then raise exception 'Owner permission required'; end if;
  v_brand:=private.staff_owner_brand();
  select id into v_period_id from public.accounting_periods where brand_id=v_brand and period_start=v_month;
  if v_period_id is null then raise exception 'Accounting period not found'; end if;
  return private.finance_close_gate_state_v1(v_period_id);
end;
$$;

create or replace function public.owner_finance_close_gate_v1(p_period date)
returns jsonb
language sql
stable
set search_path=''
as $$ select private.owner_finance_close_gate_v1(p_period); $$;

revoke all on function public.owner_finance_close_gate_v1(date) from public,anon;
grant execute on function public.owner_finance_close_gate_v1(date) to authenticated,service_role;

create or replace function private.owner_finance_close_period_v1(p_period date,p_note text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_brand uuid;
  v_month date:=date_trunc('month',coalesce(p_period,timezone('Asia/Jakarta',now())::date)::timestamp)::date;
  v_period public.accounting_periods%rowtype;
  v_gate jsonb;
  v_snapshot_id uuid;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;
  if not private.is_owner() then raise exception 'Owner permission required'; end if;
  if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Close note is required'; end if;
  v_brand:=private.staff_owner_brand();
  select * into v_period from public.accounting_periods where brand_id=v_brand and period_start=v_month for update;
  if not found then raise exception 'Accounting period not found'; end if;
  if v_period.status='closed' then
    return jsonb_build_object('period_month',v_month,'period_status','closed','already_closed',true);
  end if;
  v_gate:=private.finance_close_gate_state_v1(v_period.id);
  if coalesce((v_gate->>'ready_to_close')::boolean,false) is not true then
    raise exception 'Periode belum siap ditutup: %',coalesce(nullif(v_gate->>'blockers',''),'kontrol keuangan belum lengkap');
  end if;
  perform public.close_accounting_period(v_period.id,p_note);
  select id into v_snapshot_id from public.finance_period_snapshots where accounting_period_id=v_period.id order by close_sequence desc limit 1;
  return jsonb_build_object('period_month',v_month,'period_status','closed','snapshot_id',v_snapshot_id,'closed_at',now(),'close_note',btrim(p_note));
end;
$$;

create or replace function public.owner_finance_close_period_v1(p_period date,p_note text)
returns jsonb
language sql
set search_path=''
as $$ select private.owner_finance_close_period_v1(p_period,p_note); $$;

revoke all on function public.owner_finance_close_period_v1(date,text) from public,anon;
grant execute on function public.owner_finance_close_period_v1(date,text) to authenticated,service_role;

create or replace function private.capture_finance_period_snapshot_v1(p_period_id uuid,p_note text)
returns public.finance_period_snapshots
language plpgsql
security definer
set search_path=''
as $$
declare
  v_period public.accounting_periods%rowtype;
  v_gate jsonb;
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

  v_gate:=private.finance_close_gate_state_v1(v_period.id);
  v_ready:=coalesce((v_gate->>'ready_to_close')::boolean,false);
  v_blockers:=v_gate->>'blockers';
  if v_ready is distinct from true then raise exception 'Periode belum siap ditutup: %',coalesce(nullif(v_blockers,''),'kontrol keuangan belum lengkap'); end if;

  v_payload:=private.get_finance_period_pack_live_v1(v_period.brand_id,v_period.period_start);
  v_payload:=jsonb_set(v_payload,'{readiness,period_status}','\"closed\"'::jsonb,true);
  v_payload:=jsonb_set(v_payload,'{close_gate}',v_gate,true);
  v_journal:=private.finance_period_journal_fingerprint_v1(v_period.brand_id,v_period.period_start);
  select coalesce(max(close_sequence),0)+1 into v_seq from public.finance_period_snapshots where accounting_period_id=v_period.id;
  v_fingerprint:=encode(extensions.digest(v_payload::text||'|'||v_journal::text||'|'||v_period.period_start::text||'|'||v_period.period_end::text,'sha256'),'hex');

  insert into public.finance_period_snapshots(accounting_period_id,brand_id,close_sequence,period_start,period_end,framework_label,close_note,report_payload,journal_summary,journal_fingerprint,snapshot_fingerprint,captured_by)
  values(v_period.id,v_period.brand_id,v_seq,v_period.period_start,v_period.period_end,'Format mengacu SAK EMKM - internal',btrim(p_note),v_payload,v_journal,v_journal->>'sha256',v_fingerprint,auth.uid())
  returning * into v_snapshot;
  return v_snapshot;
end;
$$;
