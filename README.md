# datapipes

Sandbox prototype of data contracts and checkpoints for a fictional Finnish builder, **Routa Rakennus Oyj**: every data flow gets a promise, an owning team and a light that shows whether the promise is kept. Every name, system and number is invented.

## Pages

| Page | Link | What it is for |
|---|---|---|
| Tour | [jussikauhanen.github.io/datapipes/tour](https://jussikauhanen.github.io/datapipes/tour/) | Start here. A scripted three-minute walk: one flow, what happens when it breaks, who is affected, times thirty, adding a system, what it takes. Use ← → to present. |
| Demo | [jussikauhanen.github.io/datapipes/demo](https://jussikauhanen.github.io/datapipes/demo/) | Explore freely: contracts and systems in a sidebar, live checkpoints, relationship diagrams, Sankey map, simulated problems. |
| Landscape | [jussikauhanen.github.io/datapipes/landscape](https://jussikauhanen.github.io/datapipes/landscape/) | Everything on one screen: landscape map and a contract × system grid. |
| How to get here | [jussikauhanen.github.io/datapipes/guide](https://jussikauhanen.github.io/datapipes/guide/) | For architects: why, the smallest version, the data model, open standards, ways in, management, expectations, retention, decisions. |

The root address forwards to the tour. The old `/v3/` and `/v-beta/` addresses forward to the demo and the landscape.

Owners are teams, not people: each team has a manager and a channel. Alerts go to the team's channel; the manager hears if nobody picks them up.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

Opening an `index.html` straight from disk does not load the data files.

## Layout

```
index.html     forwards to tour/
tour/          scripted walkthrough
demo/          the live demo: engine.js (simulator + status model), app.js, data/
landscape/     landscape and grid, same engine and data
guide/         how to get from the prototype to the real thing
shared/        the top bar used by every page
v3/, v-beta/   forward to the new addresses
```
