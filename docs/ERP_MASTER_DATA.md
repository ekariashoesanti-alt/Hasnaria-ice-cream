# ERP Foundation Master Data

## Units of measure
Global seed units:
- pcs
- portion
- g / kg
- ml / l
- pack
- box

Each unit has a dimension and conversion-to-base factor. Brand-specific custom units are Owner-managed.

## Categories
`master_categories` provides canonical categories by domain:
- product
- inventory
- expense

Existing free-text fields are retained for compatibility and can be migrated gradually.

## Customers
`customers` is a lightweight optional CRM master:
- name / phone / email
- marketing opt-in
- first/last seen
- visit count
- lifetime revenue
- active state

Customer identity is not required for every sale. This keeps walk-in POS transactions valid.
