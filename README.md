# datapipes · v2 (at scale)

A separate copy of the prototype that tests the same idea at 30 flows. The simple version in the repository root is unchanged; v2 has its own page, styles, script and data.

Open it at `http://localhost:8000/v2/` (run `python3 -m http.server 8000` in the repository root), or `/datapipes/v2/` on GitHub Pages.

## What is different from v1

- **Columns are stage types, not systems.** Only the stage types used by something on screen become columns, so a board for Site has no Dynamics column if no site flow touches Dynamics.
- **Paths come from the events.** The register no longer lists which systems a flow passes through. The page starts at the event with no `source` and follows the `source` links. Two systems in the same stage (an API gateway then the integration hub, Lakehouse then Reporting) stack in order.
- **A skipped stage is a thin dashed line**, not an empty box.
- **Three views:** one line per flow (fits 30 flows on a screen), cards (lanes per flow), and by system (each system once, with a square per flow passing through it).
- **One board per area:** Finance, Procurement, Projects, Site, Sales & customers, People, Sustainability.
- **"What passes here" without the data.** Each step's side panel shows record count, the contract's fields with type and security level, missing-value counts from the event, and the shape of one record with placeholders instead of values. Secret fields show as pseudonymised after the integration hub.

## The event

Same as v1, with two optional fields that describe the data without containing it:

```json
{
  "system_id": "INT-01",
  "system_name": "Integration hub",
  "stage": "integration",
  "flow": "supplier-invoices",
  "source": "SRC-INV",
  "status": "failed",
  "date": "2026-11-12T09:22:00+02:00",
  "security_level": "confidential",
  "records": 2950,
  "message": "Mapping error: po_number missing in 112 of 2 950 rows",
  "profile": { "po_number": { "missing": 112 } }
}
```

## Data

`data/register.json` (stages, areas, systems with owner and clearance, flows with contract and fields) and `data/events.json` (seed feed). Both were generated for the demo; every name and number is invented.
