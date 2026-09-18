# ERP Marketing & CRM

Implemented:
- marketing_campaigns
- campaign_metrics
- promotions
- sale_attributions
- feedback_cases
- optional customer_id on sales

## Performance views
- `marketing_campaign_performance`
- `promotion_performance`
- `customer_repeat_summary`

Campaign performance exposes spend, reach, impressions, engagement, clicks, leads, attributed transactions/revenue, ROAS and cost per attributed transaction.

## Attribution
Current model is intentionally simple: one attribution record per sale. Methods may be:
- manual
- promo_code
- utm
- platform
- other

This prevents double-counting in early ERP stages. Multi-touch attribution can be introduced later only if the business genuinely needs it.

## CRM
Customer identity remains optional. Walk-in POS sales continue to work without a customer record.

## Finance integration
Campaign spend is recorded in campaign metrics for marketing analytics. A later finance integration should link campaign spend to approved expense transactions before treating it as accounting truth.
