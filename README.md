# datapipes

Sandbox prototype of a lightweight data contract and integration catalogue: events, dependencies and owners on one page.

The company in it, **Routa Rakennus Oyj**, is fictional and modelled loosely on a large Finnish contractor (housing, business premises, infrastructure, renovation). Every name, project, business ID and figure is invented, so the prototype can be shown and shared without touching real data.

## What's in it

| View | What it shows |
|---|---|
| Overview | Catalogue totals and what needs attention right now, each with the owner to call |
| Contracts | All contracts with lifecycle, health, pass rate and readers. Each contract page shows fields, PII class, checks, consumers, changelog and the YAML file it would be in git |
| Lineage | Systems → contracts → consumers. Click any box to trace upstream and downstream |
| Event stream | Simulated events validated in the browser. Failures go to the producing team's steward |
| Owners | Business owner and steward per team, what they publish and consume, and integrations nobody owns |
| Sandbox | Validate a JSON payload against a contract, and see what a proposed change (remove, rename, retype, new enum value…) would break, the version bump it needs and who to notify |

The catalogue includes a few planted problems so there is something to find: invoices losing `po_number` after an OCR change, a site gate reader that went silent, a late nightly budget batch, a deprecated contract still read by an unowned Excel export, and a draft with personal data waiting for privacy review.

## Run locally

The page loads `data/catalog.json` with `fetch`, so it needs to be served rather than opened from disk:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Publish on GitHub Pages

1. Commit and push to `main`.
2. In the repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The site appears at `https://<user>.github.io/datapipes/` after a minute or so.

There is no build step. `.nojekyll` stops GitHub from running Jekyll over the files.

## Changing the data

Everything is in `data/catalog.json`:

- `teams` — owning teams with business owner and steward
- `systems` — producing systems
- `contracts` — one entry per contract version: fields (type, required, pattern, enum, min/max, PII), SLA, 24 h volume and pass rate, open issues, changelog
- `consumers` — what reads what, **at field level** (`reads: { contractId: [fields] }`); `"*"` marks a tolerant reader such as the lakehouse

Health, lineage, impact analysis and the simulated stream are all derived from that file, so adding a contract or a consumer needs no code change.

## Files

```
index.html          shell and navigation
assets/style.css    styles (light and dark)
assets/app.js       views, validator, payload generator, change-impact rules
data/catalog.json   the mock catalogue
```
