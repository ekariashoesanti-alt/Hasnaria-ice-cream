-- Exact pre-hotfix Finance Administration views captured from production 2026-10-18.
-- Schema-only rollback (transaction and accounting records are untouched).

create or replace view public.ui_administration_category_chart_v1
with (security_invoker=true)
as
 SELECT a.brand_id,
    date_trunc('month'::text, a.purchase_date::timestamp with time zone)::date AS period_month,
    COALESCE(NULLIF(b.expense_category, ''::text), 'Administrasi'::text) AS category,
    count(*) AS admin_rows,
    COALESCE(sum(a.total_amount), 0::numeric)::numeric(18,2) AS amount
   FROM ui_administration_purchase_v1 a
     LEFT JOIN finance_purchase_expense_bridge_v1 b ON b.brand_id = a.brand_id AND b.source_history_id = a.purchase_id
  WHERE a.purchase_date IS NOT NULL
  GROUP BY a.brand_id, (date_trunc('month'::text, a.purchase_date::timestamp with time zone)::date), (COALESCE(NULLIF(b.expense_category, ''::text), 'Administrasi'::text));
grant select on public.ui_administration_category_chart_v1 to authenticated;

create or replace view public.ui_administration_overview_v1
with (security_invoker=true)
as
 SELECT a.brand_id,
    date_trunc('month'::text, a.purchase_date::timestamp with time zone)::date AS period_month,
    count(*) AS admin_rows,
    COALESCE(sum(a.total_amount), 0::numeric)::numeric(18,2) AS admin_amount,
    count(DISTINCT COALESCE(NULLIF(b.expense_category, ''::text), 'Administrasi'::text)) AS category_count,
    NOT COALESCE(s.sync_required, true) AS sync_ok
   FROM ui_administration_purchase_v1 a
     LEFT JOIN finance_purchase_expense_bridge_v1 b ON b.brand_id = a.brand_id AND b.source_history_id = a.purchase_id
     LEFT JOIN finance_administration_sync_status_v1 s ON s.brand_id = a.brand_id AND s.period_month = date_trunc('month'::text, a.purchase_date::timestamp with time zone)::date
  WHERE a.purchase_date IS NOT NULL
  GROUP BY a.brand_id, (date_trunc('month'::text, a.purchase_date::timestamp with time zone)::date), s.sync_required;
grant select on public.ui_administration_overview_v1 to authenticated;
