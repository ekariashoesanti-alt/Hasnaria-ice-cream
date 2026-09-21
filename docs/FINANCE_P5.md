# Finance P5 — Period Close Archive & Export

P5 freezes a financial-report snapshot when an accounting period is formally closed.

## Close behavior

- `close_accounting_period` still requires every P3/P4 close-readiness gate to pass.
- A close now captures an immutable report payload, trial balance, close metadata, journal totals and SHA-256 journal/snapshot fingerprints before the period is marked closed.
- Closed-period report retrieval uses the latest immutable snapshot rather than recomputing the report from mutable operational tables.
- Snapshot rows cannot be updated or deleted.

## Reopen behavior

- Reopen requires an explicit reason and is audit logged.
- Existing snapshots remain immutable after reopen.
- A later re-close creates the next snapshot version instead of overwriting the previous version.

## Export

The Owner Finance workspace exposes an `Arsip & Ekspor` action:

- XLSX: Laba Rugi, Posisi Keuangan, Neraca Saldo, Catatan, and Metadata sheets.
- PDF: print-ready financial report; the browser print dialog can save the report as PDF.
- Open periods are exported as `DRAFT / LIVE`.
- Closed periods are exported as `CLOSED SNAPSHOT` with snapshot fingerprints.

The product wording remains `Format mengacu SAK EMKM - internal`. A snapshot or export is not, by itself, a statement of full SAK EMKM compliance.
