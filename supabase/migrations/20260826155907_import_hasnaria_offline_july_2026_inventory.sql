CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  category text NOT NULL,
  item_name text NOT NULL,
  stock_june numeric,
  purchase_july numeric,
  sold_july numeric,
  stock_august numeric,
  discrepancy numeric,
  notes text,
  source_period date NOT NULL DEFAULT DATE '2026-07-01',
  source_file text NOT NULL DEFAULT 'RENCANA BELANJA JULI 2026.xlsx',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_brand_period_name_idx
ON public.inventory_items(brand_id, source_period, category, item_name);
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_items_read_same_brand ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_write_same_brand ON public.inventory_items;
CREATE POLICY inventory_items_read_same_brand ON public.inventory_items FOR SELECT TO authenticated USING (same_brand(brand_id));
CREATE POLICY inventory_items_write_same_brand ON public.inventory_items FOR ALL TO authenticated USING (same_brand(brand_id)) WITH CHECK (same_brand(brand_id));
