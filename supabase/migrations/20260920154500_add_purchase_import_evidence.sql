CREATE TABLE IF NOT EXISTS public.purchase_import_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  source_type text NOT NULL CHECK (source_type IN ('excel','majoo','excel_legacy')),
  source_period date NOT NULL,
  source_file text NOT NULL,
  source_record_key text NOT NULL,
  row_no integer NOT NULL,
  purchase_date date,
  item_name text,
  normalized_item text,
  sku text,
  quantity numeric,
  unit_text text,
  unit_price numeric,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  supplier_name text,
  invoice_no text,
  source_status text,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, source_type, source_period, source_record_key)
);

CREATE INDEX IF NOT EXISTS purchase_import_evidence_brand_period_idx
  ON public.purchase_import_evidence(brand_id, source_period);
CREATE INDEX IF NOT EXISTS purchase_import_evidence_brand_source_period_idx
  ON public.purchase_import_evidence(brand_id, source_type, source_period);
CREATE INDEX IF NOT EXISTS purchase_import_evidence_invoice_idx
  ON public.purchase_import_evidence(brand_id, invoice_no)
  WHERE invoice_no IS NOT NULL;

ALTER TABLE public.purchase_import_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_import_evidence_read_same_brand ON public.purchase_import_evidence;
DROP POLICY IF EXISTS purchase_import_evidence_write_same_brand ON public.purchase_import_evidence;
CREATE POLICY purchase_import_evidence_read_same_brand
  ON public.purchase_import_evidence FOR SELECT TO authenticated
  USING (same_brand(brand_id));
CREATE POLICY purchase_import_evidence_write_same_brand
  ON public.purchase_import_evidence FOR ALL TO authenticated
  USING (same_brand(brand_id)) WITH CHECK (same_brand(brand_id));
