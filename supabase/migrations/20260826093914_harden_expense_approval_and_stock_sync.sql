-- 1) Make the existing stock screen's legacy storage consistent with the real stock_qty column.
UPDATE public.products
SET stock_qty = selling_price
WHERE brand_id = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
  AND name LIKE 'HASNARIA_PAR|%';

CREATE OR REPLACE FUNCTION public.sync_par_stock_qty()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name LIKE 'HASNARIA_PAR|%' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.stock_qty := COALESCE(NEW.selling_price, 0);
    ELSIF NEW.selling_price IS DISTINCT FROM OLD.selling_price
      AND NEW.stock_qty IS NOT DISTINCT FROM OLD.stock_qty THEN
      NEW.stock_qty := COALESCE(NEW.selling_price, 0);
    ELSIF NEW.stock_qty IS DISTINCT FROM OLD.stock_qty
      AND NEW.selling_price IS NOT DISTINCT FROM OLD.selling_price THEN
      NEW.selling_price := COALESCE(NEW.stock_qty, 0);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_par_stock_qty ON public.products;
CREATE TRIGGER trg_sync_par_stock_qty
BEFORE INSERT OR UPDATE OF selling_price, stock_qty, name ON public.products
FOR EACH ROW EXECUTE FUNCTION public.sync_par_stock_qty();

-- 2) Approval is now enforced by the database, not only by the UI.
CREATE OR REPLACE FUNCTION public.can_approve_expense(p_category text, p_amount numeric)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND status = 'active'
      AND (
        role = 'owner'
        OR (role = 'head_store' AND (
          (p_category = 'pembelian' AND p_amount <= 1500000)
          OR (p_category = 'kompensasi' AND p_amount <= 50000)
          OR (p_category = 'lainnya' AND p_amount <= 500000)
          OR p_category = 'waste'
        ))
      )
  );
$$;

DROP POLICY IF EXISTS brand_write_expenses ON public.expenses;
DROP POLICY IF EXISTS expenses_read_same_brand ON public.expenses;
DROP POLICY IF EXISTS expenses_insert_same_brand ON public.expenses;
DROP POLICY IF EXISTS expenses_update_approval ON public.expenses;
DROP POLICY IF EXISTS expenses_delete_owner ON public.expenses;

CREATE POLICY expenses_read_same_brand
ON public.expenses FOR SELECT TO authenticated
USING (same_brand(brand_id));

CREATE POLICY expenses_insert_same_brand
ON public.expenses FOR INSERT TO authenticated
WITH CHECK (same_brand(brand_id));

CREATE POLICY expenses_update_approval
ON public.expenses FOR UPDATE TO authenticated
USING (same_brand(brand_id) AND can_approve_expense(category, amount))
WITH CHECK (same_brand(brand_id) AND can_approve_expense(category, amount));

CREATE POLICY expenses_delete_owner
ON public.expenses FOR DELETE TO authenticated
USING (same_brand(brand_id) AND is_owner());

-- This function is not used by the current client/RLS policy set.
REVOKE EXECUTE ON FUNCTION public.can_approve() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon, authenticated;

-- Keep explicit execute for the new policy helper because PostgreSQL evaluates
-- RLS expressions as the calling role even when the function is SECURITY DEFINER.
GRANT EXECUTE ON FUNCTION public.can_approve_expense(text, numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_approve_expense(text, numeric) FROM anon;
