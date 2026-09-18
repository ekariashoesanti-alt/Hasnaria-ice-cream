# CEO Snapshot Contract

Primary backend view for the future Owner/CEO screen:

`executive_dashboard_snapshot`

It extends the reconciled KPI snapshot with:
- latest reported cash position from the most recent closed cash session per outlet;
- latest aggregate cash variance;
- last cash close timestamp;
- count of CRITICAL and WARNING decisions.

Use this view for summary cards. Use `executive_decision_center` for the actionable list and module views for drill-down.

When no cash session has been closed yet, cash position is NULL rather than falsely shown as zero.
