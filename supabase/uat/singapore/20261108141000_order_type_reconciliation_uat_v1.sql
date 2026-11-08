-- SINGAPORE UAT ONLY. Five actual Majoo receipt order categories
-- derived from uploaded Detil Penjualan 1–31 Oct 2026.
-- This is a private, non-canonical reference; never add it to sales/stock.
CREATE TABLE IF NOT EXISTS hasnaria_uat.transaction_order_type_reference (
  batch_key text NOT NULL REFERENCES hasnaria_uat.source_sets(batch_key),
  order_type text NOT NULL CHECK (length(btrim(order_type)) BETWEEN 1 AND 100),
  receipt_count integer NOT NULL CHECK (receipt_count >= 0),
  gross_sales numeric(18,2) NOT NULL CHECK (gross_sales >= 0),
  PRIMARY KEY (batch_key,order_type)
);
ALTER TABLE hasnaria_uat.transaction_order_type_reference ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hasnaria_uat.transaction_order_type_reference FROM PUBLIC, anon, authenticated;

BEGIN;
INSERT INTO hasnaria_uat.transaction_order_type_reference
  (batch_key,order_type,receipt_count,gross_sales)
VALUES
  ('majoo_20261108_0820','Bungkus',501,10252500),
  ('majoo_20261108_0820','Free Table',138,5378000),
  ('majoo_20261108_0820','Lainnya',94,3325000),
  ('majoo_20261108_0820','Ojek Online - Go-Jek',60,1456000),
  ('majoo_20261108_0820','Table',31,1203000)
ON CONFLICT (batch_key,order_type) DO NOTHING;

DO $check$
DECLARE
  v_categories integer;
  v_receipts integer;
  v_gross numeric;
  v_detail_receipts integer;
  v_detail_gross numeric;
  v_pay_receipts integer;
  v_pay_gross numeric;
BEGIN
  SELECT COUNT(*)::int, SUM(receipt_count)::int, SUM(gross_sales)
    INTO v_categories,v_receipts,v_gross
  FROM hasnaria_uat.transaction_order_type_reference
  WHERE batch_key='majoo_20261108_0820';

  SELECT SUM(receipt_count)::int,SUM(gross_sales)
    INTO v_detail_receipts,v_detail_gross
  FROM hasnaria_uat.transaction_daily_reference
  WHERE batch_key='majoo_20261108_0820';

  SELECT SUM(receipt_count)::int,SUM(gross_sales)
    INTO v_pay_receipts,v_pay_gross
  FROM hasnaria_uat.transaction_payment_reference
  WHERE batch_key='majoo_20261108_0820';

  IF v_categories<>5 OR v_receipts<>824 OR v_gross<>21614500
    OR v_detail_receipts<>v_receipts OR v_detail_gross<>v_gross
    OR v_pay_receipts<>v_receipts OR v_pay_gross<>v_gross THEN
    RAISE EXCEPTION 'Majoo order type reconciliation mismatch: %,%,%',v_categories,v_receipts,v_gross;
  END IF;
END
$check$;
COMMIT;
