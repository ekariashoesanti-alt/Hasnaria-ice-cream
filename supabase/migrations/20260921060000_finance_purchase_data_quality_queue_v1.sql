-- Finance: actionable purchase data-quality queue for legacy/current incomplete inputs.
create or replace view public.finance_purchase_data_quality_queue_v1 with (security_invoker=true) as
select id source_history_id,brand_id,coalesce(purchase_date,source_period) effective_date,purchase_date,source_period,
 item_name,quantity_text,quantity_numeric,unit_text,total_amount,payment_method,mapping_status,
 case mapping_status
  when 'unmatched' then 'Hubungkan item pembelian ke master persediaan atau tandai sebagai beban.'
  when 'missing_date' then 'Lengkapi tanggal transaksi sebelum transaksi dapat diposting.'
  when 'invalid_qty' then 'Perbaiki kuantitas/satuan pembelian sebelum menghitung persediaan.'
  when 'payment_candidate' then 'Tentukan apakah cicilan merupakan pembayaran kas atau pelunasan utang terkait.'
  else 'Review data pembelian.' end required_action,
 case mapping_status when 'missing_date' then 10 when 'payment_candidate' then 20 when 'invalid_qty' then 30 else 40 end priority_rank
from public.purchase_inventory_bridge
where mapping_status in ('unmatched','missing_date','invalid_qty','payment_candidate');
grant select on public.finance_purchase_data_quality_queue_v1 to authenticated;

create or replace view public.finance_purchase_data_quality_summary_v1 with (security_invoker=true) as
select mapping_status,count(*) row_count,coalesce(sum(total_amount),0)::numeric total_amount
from public.finance_purchase_data_quality_queue_v1 group by mapping_status;
grant select on public.finance_purchase_data_quality_summary_v1 to authenticated;
