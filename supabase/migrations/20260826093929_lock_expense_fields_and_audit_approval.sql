CREATE OR REPLACE FUNCTION public.guard_expense_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  owner_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = uid AND status = 'active' AND role = 'owner'
  ) INTO owner_ok;

  IF NOT owner_ok THEN
    IF NEW.brand_id IS DISTINCT FROM OLD.brand_id
       OR NEW.expense_date IS DISTINCT FROM OLD.expense_date
       OR NEW.category IS DISTINCT FROM OLD.category
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.requested_by IS DISTINCT FROM OLD.requested_by THEN
      RAISE EXCEPTION 'Expense fields are locked after creation';
    END IF;

    IF OLD.status = 'pending_approval' AND NEW.status IN ('approved','rejected') THEN
      NEW.approved_by := uid;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Invalid expense status transition';
    END IF;
  ELSE
    IF NEW.status IN ('approved','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.approved_by := uid;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_expense_update ON public.expenses;
CREATE TRIGGER trg_guard_expense_update
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.guard_expense_update();

CREATE OR REPLACE FUNCTION public.set_expense_requester()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.requested_by IS NULL THEN NEW.requested_by := auth.uid(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_expense_requester ON public.expenses;
CREATE TRIGGER trg_set_expense_requester
BEFORE INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.set_expense_requester();

REVOKE EXECUTE ON FUNCTION public.guard_expense_update() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_expense_requester() FROM anon, authenticated;
