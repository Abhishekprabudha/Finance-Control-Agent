# AIonOS Agentic FinOps Mission Control for Uber

A complete front-end-only consulting-style demo for Uber India Finance. It uses synthetic JSON datasets and a browser simulation engine to demonstrate agentic FinOps across journals, close, reconciliation, revenue assurance, CFO performance, governance and audit readiness.

## Run locally

Because the app fetches JSON files from `/data`, run it through any static server:

```bash
python -m http.server 8080
# open http://localhost:8080
```

## Deploy on GitHub Pages

1. Upload this folder to a GitHub repository.
2. Enable **Settings → Pages → Deploy from branch**.
3. Select the `main` branch and root folder.
4. Open the published GitHub Pages URL.

## Included datasets

- `data/finance_events.json`
- `data/journal_rules.json`
- `data/journal_entries.json`
- `data/close_tasks.json`
- `data/reconciliation_records.json`
- `data/revenue_leakage_cases.json`
- `data/cfo_metrics.json`
- `data/audit_trail.json`
- `data/scenarios.json`

## Demo controls

- Demo Mode toggle starts/stops real-time event streaming.
- Scenario buttons replay Month-End Close, Payment Mismatch Spike, Revenue Leakage Detection and Audit Evidence Pack flows.
- JE Approval, Recon Exception Resolution, CFO Narrative Generation and Audit JSON Export all write traceable audit records.
- Reset localStorage restores the demo to the synthetic baseline.

No backend, package manager, database or ERP connection is required.
