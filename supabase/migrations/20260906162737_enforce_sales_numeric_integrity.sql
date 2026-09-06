alter table public.sales
  add constraint sales_transaction_count_positive_check check (transaction_count >= 1),
  add constraint sales_total_amount_nonnegative_check check (total_amount >= 0),
  add constraint sales_cash_amount_nonnegative_check check (cash_amount >= 0),
  add constraint sales_qris_amount_nonnegative_check check (qris_amount >= 0),
  add constraint sales_tf_amount_nonnegative_check check (tf_amount >= 0),
  add constraint sales_external_transaction_nonblank_check check (nullif(btrim(external_transaction_id), '') is not null);

alter table public.sale_items
  add constraint sale_items_qty_positive_check check (qty > 0),
  add constraint sale_items_unit_price_nonnegative_check check (unit_price >= 0),
  add constraint sale_items_unit_cogs_nonnegative_check check (unit_cogs >= 0);

alter table public.daily_metrics
  add constraint daily_metrics_transactions_nonnegative_check check (transactions >= 0),
  add constraint daily_metrics_cash_revenue_nonnegative_check check (cash_revenue >= 0);

alter table public.sales_import_batches
  add constraint sales_import_batches_row_count_nonnegative_check check (row_count >= 0),
  add constraint sales_import_batches_transaction_count_nonnegative_check check (transaction_count >= 0),
  add constraint sales_import_batches_total_amount_nonnegative_check check (total_amount >= 0),
  add constraint sales_import_batches_period_order_check check (period_from is null or period_to is null or period_from <= period_to);
