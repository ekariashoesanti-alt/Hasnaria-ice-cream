-- Restrict raw Finance records to roles with finance.read capability.
-- Master account taxonomy remains readable same-brand for procurement/mapping use.

alter policy finance_accounting_settings_read_same_brand
  on public.finance_accounting_settings
  using ((select private.same_brand(brand_id)) and (select private.has_capability('finance.read')));

alter policy finance_adjustment_lines_read_same_brand
  on public.finance_adjustment_lines
  using ((select private.same_brand(brand_id)) and (select private.has_capability('finance.read')));

alter policy finance_adjustments_read_same_brand
  on public.finance_adjustments
  using ((select private.same_brand(brand_id)) and (select private.has_capability('finance.read')));

alter policy finance_asset_candidate_resolutions_read_same_brand
  on public.finance_asset_candidate_resolutions
  using ((select private.same_brand(brand_id)) and (select private.has_capability('finance.read')));

alter policy finance_fixed_assets_read_same_brand
  on public.finance_fixed_assets
  using ((select private.same_brand(brand_id)) and (select private.has_capability('finance.read')));

alter policy finance_journal_entries_read_same_brand
  on public.finance_journal_entries
  using ((select private.same_brand(brand_id)) and (select private.has_capability('finance.read')));

alter policy finance_journal_lines_read_same_brand
  on public.finance_journal_lines
  using ((select private.same_brand(brand_id)) and (select private.has_capability('finance.read')));

alter policy finance_period_events_read_same_brand
  on public.finance_period_events
  using ((select private.same_brand(brand_id)) and (select private.has_capability('finance.read')));

alter policy finance_period_reviews_read_same_brand
  on public.finance_period_reviews
  using ((select private.same_brand(brand_id)) and (select private.has_capability('finance.read')));

alter policy finance_period_snapshots_read_same_brand
  on public.finance_period_snapshots
  using ((select private.same_brand(brand_id)) and (select private.has_capability('finance.read')));
