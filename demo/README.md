# datapipes · demo

Contract-level catalogue with live checkpoints and relationship diagrams. The live, explorable demo. The tour links here when you want to dig in.

Open at `http://localhost:8000/demo/` (run `python3 -m http.server 8000` in the repository root) or `/datapipes/demo/` on GitHub Pages.

## What is in it

- **Sidebar:** data contracts grouped by area, systems grouped by stage, each with a live status dot. Filter at the top.
- **Overview:** counts by status, what needs attention and who to call, and a system map (every system once, lines aggregated over contracts).
- **Contract page:** the current message moving through its checkpoints, recent messages as a grid, the fields that pass (without values), and the latest checkpoint event.
- **System page:** the systems that feed it on the left, the ones it feeds on the right, and every contract through it.
- **Simulate menu:** make a system fail, slow down, leak secret data or go quiet, or fix things. The clock runs 30× by default; pause or change speed in the top bar.

## Colours

| | When |
|---|---|
| Green | The system reported the message within the checkpoint SLA (5 min, 15 for daily batches). |
| Blue | On its way: left the previous system less than the SLA ago. |
| Yellow | Later than the SLA, or passed late. At the source: no new message for 1.5× the schedule. |
| Red | Later than 3× the SLA, an error, or data above the system's clearance. At the source: no new message for 3× the schedule. |
| Grey | Held up at an earlier checkpoint. |

## The event

The same event as the main page, plus `run_id`, which ties one message's checkpoints together:

```json
{ "system_id": "INT-01", "system_name": "Integration hub", "stage": "integration",
  "flow": "supplier-invoices", "run_id": "R-4108", "source": "SRC-INV",
  "status": "failed", "date": "2026-11-12T16:02:10+02:00", "security_level": "confidential",
  "records": 2950, "message": "Mapping error: po_number missing in 112 of 2 950 rows",
  "profile": { "po_number": { "missing": 112 } } }
```

## Files

- `engine.js`: two halves. A simulator (the fake systems) and a model that turns events into checkpoint statuses. The model never reads the simulator's config.
- `data/register.json`: areas, stages, systems with owner and clearance, contracts with schedule, checkpoint SLA and fields.
- `data/simulation.json`: the fake world only. Which systems each contract really passes through, and the problems planted at start.
