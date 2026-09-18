# ERP HR & Workforce

Implemented backend domains:
- employees
- shift_templates
- shift_roster
- attendance
- leave_requests
- overtime_records
- training_records

## Privacy
Employee master, attendance, leave, overtime and training use self-or-HR access. Salary fields exist on employee master but are not broadly readable because the employee RLS only exposes the employee's own row or HR management roles.

## Attendance
Self-service RPCs:
- `attendance_check_in`
- `attendance_check_out`

Check-in requires an active employee linked to the logged-in user and a scheduled shift for the current date. Late status uses the brand setting `attendance_grace_minutes`.

## Leave
Leave requests are submitted through `submit_leave_request` and routed into the generic approval engine. Default Hasnaria approver role is Head Store; Owner retains approval override through the approval engine.

## KPI views
- `workforce_daily_kpis`: active headcount, present, late, worked hours, revenue and sales per worked hour.
- `payroll_input_summary`: attendance days, late days, worked hours, overtime minutes.

This is payroll-input support, not a statutory payroll/tax engine.
