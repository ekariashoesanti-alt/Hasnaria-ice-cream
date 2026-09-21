-- Extend Finance alerts with the actionable Purchase data-quality queue.
create or replace view public.ui_finance_alerts with (security_invoker=true) as
select 10 sort_order,'warning'::text severity,'FINANCING_PAYMENT_REVIEW'::text alert_code,'Cicilan legacy perlu klasifikasi dampak kas'::text title,
 concat(count(*),' transaksi senilai Rp',to_char(coalesce(sum(total_amount),0),'FM999G999G999G999'),' belum ditentukan sebagai cash_paid atau liability_only.') message,
 'cashflow'::text target_section,jsonb_build_object('unresolved_count',count(*),'unresolved_amount',coalesce(sum(total_amount),0)) metadata
from public.ui_financing_payment_queue where review_status='needs_review' having count(*)>0
union all select 15,'warning','PURCHASE_DATA_INCOMPLETE','Data Pembelian perlu dilengkapi',
 concat(count(*),' transaksi Pembelian senilai Rp',to_char(coalesce(sum(total_amount),0),'FM999G999G999G999'),' masih membutuhkan mapping/tanggal/kuantitas/review pembayaran.'),
 'purchase_quality',jsonb_build_object('rows',count(*),'amount',coalesce(sum(total_amount),0))
from public.finance_purchase_data_quality_queue_v1 having count(*)>0
union all select 20,'warning','HPP_RECIPE_MISSING','Recipe produk belum lengkap',concat(count(distinct product_id),' produk terjual belum memiliki recipe. Laba tetap ditandai belum final sampai recipe dilengkapi.'),'hpp',jsonb_build_object('products',count(distinct product_id),'uncovered_units',coalesce(sum(uncovered_units),0)) from public.finance_hpp_verification_queue_v2 where blocker_reason='missing_recipe' having count(*)>0
union all select 30,'warning','HPP_RECIPE_UNVERIFIED','Recipe menunggu verifikasi',concat(count(distinct product_id),' produk memiliki draft recipe yang belum diverifikasi.'),'hpp',jsonb_build_object('products',count(distinct product_id),'uncovered_units',coalesce(sum(uncovered_units),0)) from public.finance_hpp_verification_queue_v2 where blocker_reason='recipe_unverified' having count(*)>0
union all select 40,'error','HPP_PRODUCT_MAPPING_MISSING','Mapping produk penjualan belum lengkap',concat(coalesce(sum(uncovered_units),0),' unit penjualan belum terhubung ke master produk.'),'hpp',jsonb_build_object('uncovered_units',coalesce(sum(uncovered_units),0)) from public.finance_hpp_verification_queue_v2 where blocker_reason='missing_product_mapping' having count(*)>0
union all select 50,'warning','HPP_COMPONENT_COST_MISSING','Biaya komponen HPP belum lengkap',concat(count(distinct product_id),' produk memiliki recipe tetapi biaya komponen belum dapat diaudit.'),'hpp',jsonb_build_object('products',count(distinct product_id),'uncovered_units',coalesce(sum(uncovered_units),0)) from public.finance_hpp_verification_queue_v2 where blocker_reason='missing_component_cost' having count(*)>0
union all select 60,'warning','FIXED_ASSET_REVIEW','Kandidat aset perlu klasifikasi',concat(count(*),' transaksi pembelian berlabel investasi masih menunggu keputusan aset/beban/persediaan.'),'assets',jsonb_build_object('candidates',count(*),'amount',coalesce(sum(total_amount),0)) from public.finance_asset_candidate_queue_v1 where review_status='unreviewed' having count(*)>0
union all select 70,'warning','OPENING_BALANCE_MISSING','Saldo awal akuntansi belum ditetapkan','Isi saldo awal ketika data tersedia, atau konfirmasi nol hanya bila memang benar.','opening_balance',jsonb_build_object('required',true)
where exists(select 1 from public.accounting_periods) and not exists(select 1 from public.finance_accounting_settings where opening_balance_mode is not null);
grant select on public.ui_finance_alerts to authenticated;
