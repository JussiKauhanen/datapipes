# datapipes

Sandbox prototype of a lightweight data contract and integration catalogue for a fictional Finnish builder, **Routa Rakennus Oyj**. Data contracts, checkpoints, dependencies and owners on one platform. Every name, system and number is invented.

## Try it on GitHub Pages

| Page | Link | What it shows |
|---|---|---|
| Demo (v3) | [jussikauhanen.github.io/datapipes/v3](https://jussikauhanen.github.io/datapipes/v3/) | Contracts and systems in a sidebar, live checkpoints turning green, yellow and red, relationship diagrams per system, Sankey system map |
| Landscape (beta) | [jussikauhanen.github.io/datapipes/v-beta](https://jussikauhanen.github.io/datapipes/v-beta/) | Everything on one screen: landscape map and a contract × system grid |
| How to get here | [jussikauhanen.github.io/datapipes/guide](https://jussikauhanen.github.io/datapipes/guide/) | For data architects: why contracts, the data model from simple to hard, what systems send, how contracts are managed, how expectations and retention work, decisions needed |

The root address, [jussikauhanen.github.io/datapipes](https://jussikauhanen.github.io/datapipes/), forwards to the demo.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000/v3/, /v-beta/ or /guide/
```

Opening an `index.html` straight from disk does not load the data files.

## Layout

```
index.html        forwards to v3/
v3/               the demo: engine.js (simulator + status model), app.js, data/
v-beta/           landscape and grid, same engine and data
guide/            how to get from the demo to the real thing
```

The simulator in `engine.js` plays the systems and emits checkpoint events; the pages only read those events. `data/register.json` holds systems, owners and contracts; `data/simulation.json` describes the fake world behind the demo.
