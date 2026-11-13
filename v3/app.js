/* Routa · data contracts v3 (sandbox)
   Sidebar of contracts and systems; contract pages show checkpoints turning green/yellow/red as each
   message passes; system pages show who feeds it and who it feeds. Everything is derived from events. */
(() => {
  'use strict';
  const P = window.Pipe;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('fi-FI');
  const num = (n) => nf.format(n);

  // ---------- theme ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  if (store.get('routa-theme')) document.documentElement.dataset.theme = store.get('routa-theme');
  $('#theme').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('routa-theme', next);
  });

  // ---------- little renderers ----------
  const ICON = {
    source: '<ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2"/>',
    integration: '<path d="M2.5 5.5h9l-2.5-2.5M13.5 10.5h-9l2.5 2.5"/>',
    dynamics: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx=".5"/><rect x="9" y="2.5" width="4.5" height="4.5" rx=".5"/><rect x="2.5" y="9" width="4.5" height="4.5" rx=".5"/><rect x="9" y="9" width="4.5" height="4.5" rx=".5"/>',
    apps: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M2.5 6h11"/>',
    analytics: '<path d="M3.5 13V8.5M8 13V3.5M12.5 13V6.5"/>',
    contract: '<path d="M4 1.8h5.5L12.5 5v9.2H4z"/><path d="M9.5 1.8V5h3M6 8h4.5M6 10.5h4.5"/>',
    home: '<path d="M2.5 7.5L8 2.5l5.5 5M4 6.5v7h8v-7"/>',
  };
  const ic = (kind, cls = '') => `<span class="ic ${esc(kind)} ${cls}"><svg viewBox="0 0 16 16" aria-hidden="true">${ICON[kind] || ''}</svg></span>`;
  const TONE = { ok: 'Passing', transit: 'In transit', late: 'Late', bad: 'Red', wait: 'Waiting' };
  const tp = (tone, text) => `<span class="tp ${esc(tone)}">${esc(text || TONE[tone])}</span>`;
  const td = (tone) => `<span class="td ${esc(tone)}" aria-hidden="true"></span>`;
  const SEC = P.SEC;
  const dots = (l) => `<span class="dots ${esc(l)}" title="Security: ${esc(l)}">${[0, 1, 2, 3].map((i) => `<i class="${i <= SEC[l] ? 'on' : ''}"></i>`).join('')}</span>`;
  const lvl = (l) => `<span class="lvl">${dots(l)}<span class="lvl-name">${esc(l)}</span></span>`;
  const initials = (n) => n.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const av = (n, lg) => `<span class="av c${[...n].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 6}${lg ? ' lg' : ''}" title="${esc(n)}" aria-hidden="true">${esc(initials(n))}</span>`;
  const since = (ms) => `<span data-since="${ms}">${esc(P.dur((S.now() - ms) / P.MIN))}</span>`;
  const STATE_TXT = { passed: 'Passed', 'passed-late': 'Passed late', 'passed-very-late': 'Passed very late', transit: 'In transit', late: 'Late', 'very-late': 'Very late', error: 'Error', blocked: 'Blocked', waiting: 'Waiting' };

  // What a checkpoint says, with live-updating durations
  function hopLine(h) {
    const c = h.contract;
    if (h.i === 0 && (h.state === 'late' || h.state === 'very-late')) return `No new message for ${since(h.e ? Date.parse(h.e.date) : S.now())} · runs ${esc(P.every(c.every_min))}`;
    switch (h.state) {
      case 'passed': return `Passed ${esc(P.hhmm(h.e.date))}${h.e.records != null ? ` · ${num(h.e.records)} rec.` : ''}`;
      case 'passed-late': case 'passed-very-late': return `${esc(P.hhmm(h.e.date))}, took ${esc(P.dur(h.took))} · SLA ${c.checkpoint_sla_min} min`;
      case 'transit': return `On its way ${since(Date.parse(h.prev.date))}`;
      case 'late': case 'very-late': return `Waiting ${since(Date.parse(h.prev.date))} · SLA ${c.checkpoint_sla_min} min`;
      case 'error': return esc(h.e.message || 'Error');
      case 'blocked': return `Data too secret for this system`;
      default: return 'Held up earlier';
    }
  }
  function hopWhy(h) {
    const c = h.contract;
    if (h.i === 0 && (h.state === 'late' || h.state === 'very-late')) return `No new message for ${since(h.e ? Date.parse(h.e.date) : S.now())}. This contract runs ${esc(P.every(c.every_min))}.`;
    if (h.state === 'transit' || h.state === 'late' || h.state === 'very-late') return `Expected within ${c.checkpoint_sla_min} min of ${esc(h.prev.system_name)}; it has been ${since(Date.parse(h.prev.date))}.`;
    return esc(h.why);
  }
  const who = (h) => h.fixer || h.sys;

  // ---------- state ----------
  let reg, S, M;
  const closed = new Set();
  let filterQ = '';
  let route = { view: 'overview' };
  let mapMode = store.get('routa-map') || 'sankey', mapInt = store.get('routa-map-int') !== '0';
  let mapHover = null;   // { kind: 'node' | 'k', id } kept across live re-renders
  const tips = new Map();

  P.load().then(({ reg: r, sim }) => {
    reg = r;
    S = P.createSim(reg, sim);
    compute();
    initChrome();
    onRoute();
    window.addEventListener('hashchange', onRoute);
    setInterval(loop, 700);
  }).catch((e) => {
    console.error(e);
    $('#view').innerHTML = `<h1>Data not loaded</h1><p>The page reads files from <code>data/</code>, which browsers block when opened straight from disk. Run <code>python3 -m http.server</code> in the repository folder and open <code>http://localhost:8000/v3/</code>.</p>`;
  });

  function compute() { M = P.derive(reg, S.events, S.now()); }
  const byId = () => Object.fromEntries(M.contracts.map((k) => [k.c.id, k]));

  // ---------- routing ----------
  function parse() {
    const h = location.hash.replace(/^#\/?/, '');
    const [kind, ...rest] = h.split('/');
    const id = decodeURIComponent(rest.join('/'));
    if (kind === 'c' && id) return { view: 'contract', id };
    if (kind === 's' && id) return { view: 'system', id };
    return { view: 'overview' };
  }
  let lastSig = '', lastSideSig = '';
  function onRoute() {
    route = parse();
    $('#side').classList.remove('open');
    $('#side-toggle').setAttribute('aria-expanded', 'false');
    lastSig = '';
    renderSide(true);
    renderView();
    $('#view').scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function loop() {
    compute();
    $('#clock').textContent = P.hhmmss(S.now());
    renderSide();
    renderView();
    $$('[data-since]').forEach((el) => { el.textContent = P.dur((S.now() - +el.dataset.since) / P.MIN); });
  }

  // ---------- sidebar ----------
  function sideSig() {
    return M.contracts.map((k) => k.tone).join('') + Object.values(M.systems).map((s) => s.tone).join('') + route.view + route.id + filterQ + [...closed].join();
  }
  function renderSide(force) {
    const sig = sideSig();
    if (!force && sig === lastSideSig) return;
    lastSideSig = sig;
    const q = filterQ.toLowerCase();
    const caret = '<svg class="caret" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
    const worst = (tones) => tones.reduce((w, t) => (P.TONE_RANK[t] > P.TONE_RANK[w] ? t : w), 'ok');
    const contractGroups = reg.areas.map((a) => {
      const items = M.contracts.filter((k) => k.c.area === a.id && (!q || `${k.c.name} ${k.c.contract}`.toLowerCase().includes(q)));
      if (!items.length) return '';
      const gid = 'a:' + a.id, isClosed = closed.has(gid) && !q;
      return `<button type="button" class="grp${isClosed ? ' closed' : ''}" data-grp="${esc(gid)}" aria-expanded="${!isClosed}">${caret}${td(worst(items.map((k) => k.tone)))}<span>${esc(a.name)}</span><span class="n">${items.length}</span></button>
        <div class="grp-items${isClosed ? ' closed' : ''}">${items.map((k) => `<a class="leaf${route.view === 'contract' && route.id === k.c.id ? ' on' : ''}" href="#/c/${encodeURIComponent(k.c.id)}">${td(k.tone)}<span class="nm">${esc(k.c.name)}</span></a>`).join('')}</div>`;
    }).join('');
    const systemGroups = reg.stages.map((st) => {
      const items = Object.values(M.systems).filter((s) => s.sys.stage === st.id && (!q || `${s.sys.name} ${s.sys.id} ${s.sys.owner}`.toLowerCase().includes(q)))
        .sort((a, b) => b.hops.length - a.hops.length);
      if (!items.length) return '';
      const gid = 's:' + st.id, isClosed = closed.has(gid) && !q;
      return `<button type="button" class="grp${isClosed ? ' closed' : ''}" data-grp="${esc(gid)}" aria-expanded="${!isClosed}">${caret}${td(worst(items.map((s) => s.tone)))}<span>${esc(st.name)}</span><span class="n">${items.length}</span></button>
        <div class="grp-items${isClosed ? ' closed' : ''}">${items.map((s) => `<a class="leaf${route.view === 'system' && route.id === s.sys.id ? ' on' : ''}" href="#/s/${encodeURIComponent(s.sys.id)}">${td(s.tone)}<span class="nm">${esc(s.sys.name)}</span><span class="n">${s.hops.length}</span></a>`).join('')}</div>`;
    }).join('');
    const side = $('#side');
    const keep = side.scrollTop;
    const hadFocus = document.activeElement && document.activeElement.id === 'side-q';
    side.innerHTML = `
      <label class="filter"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3"/></svg>
        <input id="side-q" type="search" placeholder="Filter contracts and systems" value="${esc(filterQ)}" aria-label="Filter contracts and systems"></label>
      <a class="nav-item${route.view === 'overview' ? ' on' : ''}" href="#/"><svg viewBox="0 0 16 16" aria-hidden="true">${ICON.home}</svg>Overview</a>
      <div class="sec-h"><span>Data contracts</span><span>${M.contracts.length}</span></div>${contractGroups || '<p class="muted small" style="padding:0 8px">No match.</p>'}
      <div class="sec-h"><span>Systems</span><span>${Object.keys(M.systems).length}</span></div>${systemGroups || '<p class="muted small" style="padding:0 8px">No match.</p>'}`;
    side.scrollTop = keep;
    const inp = $('#side-q');
    if (hadFocus) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    inp.addEventListener('input', (e) => { filterQ = e.target.value; renderSide(true); });
    $$('.grp', side).forEach((b) => b.addEventListener('click', () => { const g = b.dataset.grp; closed.has(g) ? closed.delete(g) : closed.add(g); renderSide(true); }));
  }

  // ---------- views ----------
  function renderView() {
    let sig, html;
    if (route.view === 'contract') {
      const k = byId()[route.id];
      if (!k) return notFound();
      sig = 'c' + k.c.id + k.hops.map((h) => h.state).join() + (k.cur && k.cur.id) + k.history.map((r) => r.cells.join('')).join('|');
      if (sig === lastSig) return;
      tips.clear();
      html = contractView(k);
    } else if (route.view === 'system') {
      const s = M.systems[route.id];
      if (!s) return notFound();
      sig = 's' + s.sys.id + s.hops.map((h) => h.state).join() + M.links.filter((l) => l.from === s.sys.id || l.to === s.sys.id).map((l) => l.tone).join();
      if (sig === lastSig) return;
      tips.clear();
      html = systemView(s);
    } else {
      sig = 'o' + mapMode + mapInt + M.contracts.map((k) => k.tone + (k.worst ? k.worst.key + k.worst.state : '') + k.hops.map((h) => h.tone[0]).join('')).join() + M.links.map((l) => l.tone).join('');
      if (sig === lastSig) return;
      tips.clear();
      html = overview();
    }
    const v = $('#view'), keep = v.scrollTop;
    lastSig = sig;
    v.innerHTML = html;
    v.scrollTop = keep;
    document.title = `${$('h1', v)?.textContent.trim() || 'Routa'} · Routa data contracts v3`;
    afterRender();
  }
  function notFound() {
    if (lastSig === 'nf') return;
    lastSig = 'nf';
    $('#view').innerHTML = `<h1>Not found</h1><p><a href="#/">Back to the overview</a></p>`;
  }

  // ---------- overview ----------
  function overview() {
    const count = (t) => M.contracts.filter((k) => k.tone === t).length;
    const att = M.contracts.filter((k) => k.tone === 'bad' || k.tone === 'late')
      .sort((a, b) => P.TONE_RANK[b.tone] - P.TONE_RANK[a.tone]);
    const items = att.map((k) => {
      const h = k.worst, w = who(h);
      return `<li><a href="#/c/${encodeURIComponent(k.c.id)}">
        <span>${tp(k.tone, STATE_TXT[h.state])}</span>
        <span class="w"><b>${esc(k.c.name)}</b><small>${esc(areaName(k.c.area))} · at ${esc(h.sys.name)}</small></span>
        <span class="why">${hopWhy(h)}</span>
        <span class="who">${av(w.owner)}<span>${esc(w.owner)}<small>${esc(w.team)}${h.fixer ? ' · sender' : ''}</small></span></span>
      </a></li>`;
    }).join('');
    const sample = S.events.filter((e) => e.flow === 'supplier-invoices' && e.system_id === 'INT-01').slice(-1)[0];
    return `
      <div class="head"><div>
        <h1>Pipeline status</h1>
        <div class="meta"><span>${M.contracts.length} data contracts</span><span>${Object.keys(M.systems).length} systems</span><span>${M.links.length} links between systems</span></div>
      </div></div>
      <p class="desc">Every system reports a checkpoint when a message passes it. Pick a contract on the left to follow its messages, or a system to see what feeds it and what it feeds. The clock runs ${S.speed}× so you can watch messages move.</p>

      <div class="kpis">
        <div class="kpi"><div class="k">${td('ok')} Passing</div><div class="v">${count('ok')}</div></div>
        <div class="kpi transit"><div class="k">${td('transit')} In transit</div><div class="v">${count('transit')}</div></div>
        <div class="kpi late"><div class="k">${td('late')} Late</div><div class="v">${count('late')}</div></div>
        <div class="kpi bad"><div class="k">${td('bad')} Red</div><div class="v">${count('bad')}</div></div>
      </div>

      <section class="sect">
        <h2>Needs attention <span class="count${att.some((k) => k.tone === 'bad') ? ' bad' : ''}">${att.length}</span></h2>
        <p class="sub">Red first. The name on the right is who to call; for blocked data it is the system that sent it.</p>
        ${att.length ? `<ul class="att">${items}</ul>` : '<p class="muted">Nothing late or red right now.</p>'}
      </section>

      <section class="sect">
        <h2>System map</h2>
        <div class="map-tools">
          <div class="seg" role="group" aria-label="Map style">
            <button type="button" data-map="sankey" aria-pressed="${mapMode === 'sankey'}">Sankey</button>
            <button type="button" data-map="lines" aria-pressed="${mapMode === 'lines'}">Lines</button>
          </div>
          ${mapMode === 'sankey' ? `<label class="chk"><input type="checkbox" id="map-int" ${mapInt ? 'checked' : ''}> Show integration layer</label>` : ''}
        </div>
        <p class="sub">${mapMode === 'sankey'
          ? 'Each contract is one band. A system is as tall as the number of contracts passing it, so busy systems like the integration hub get room for every band. Band colour is that contract\'s checkpoint at the system it flows into. Hover a band or a system to light up whole paths; click to open.'
          : 'Every system once, in its stage. A line means at least one contract passes between the two; thicker means more contracts. Hover a system to see its neighbours, click to open it.'}</p>
        <div class="map-wrap">${mapMode === 'sankey' ? sankeyMap() : systemMap()}</div>
        ${legend()}
      </section>

      <section class="sect">
        <h2>The checkpoint event</h2>
        <p class="sub">Each system sends this when a message passes. <code>run_id</code> ties the checkpoints of one message together; <code>source</code> links them into a path. The owner is looked up by <code>system_id</code>.</p>
        <div class="cols2">
          <pre class="code">${sample ? jsonHtml(sample, ['run_id', 'source', 'status']) : ''}</pre>
          <div class="box"><div class="bh">When does a checkpoint change colour?</div>
            <dl class="kv">
              <dt>${tp('ok', 'Passed')}</dt><dd>The system reported the message.</dd>
              <dt>${tp('transit', 'In transit')}</dt><dd>Left the previous system less than the checkpoint SLA ago (5 min, 15 for daily batches).</dd>
              <dt>${tp('late', 'Late')}</dt><dd>Past the SLA. At the source: no new message for 1.5× the schedule.</dd>
              <dt>${tp('bad', 'Red')}</dt><dd>Past 3× the SLA (3× the schedule at the source), an error, or data above the system's clearance.</dd>
              <dt>${tp('wait', 'Waiting')}</dt><dd>Held up at an earlier checkpoint.</dd>
            </dl></div>
        </div>
      </section>`;
  }
  const areaName = (id) => (reg.areas.find((a) => a.id === id) || {}).name || id;
  const stageName = (id) => (reg.stages.find((a) => a.id === id) || {}).name || id;
  function legend() {
    return `<div class="legend-row"><span>${td('ok')} passing</span><span>${td('transit')} in transit</span><span>${td('late')} late</span><span>${td('bad')} red</span><span>${td('wait')} waiting</span>
      ${reg.stages.map((s) => `<span>${ic(s.id, 'sm')}${esc(s.name)}</span>`).join('')}</div>`;
  }

  // Sankey map: one band per contract between consecutive checkpoints. Node height = contracts through it,
  // so a system with 28 contracts gets 28 slots instead of 28 lines meeting in one point.
  function sankeyMap() {
    const SLOT = 7, MINH = 22, GAP = 8, BAR = 12, top = 34, pad = 14;
    const isInt = (sid) => M.systems[sid] && M.systems[sid].sys.stage === 'integration';
    const rankT = (t) => P.TONE_RANK[t];
    // visible checkpoints per contract, and the segments between them
    const segs = [], visits = {};
    M.contracts.forEach((k, ci) => {
      const hs = k.hops.filter((h) => mapInt || !isInt(h.sys.id));
      hs.forEach((h) => { (visits[h.sys.id] ||= []).push(ci); });
      for (let i = 1; i < hs.length; i++) {
        const a = hs[i - 1], b = hs[i];
        const skipped = k.hops.slice(a.i + 1, b.i);   // integration hops hidden between them
        // the band shows the checkpoint it flows into, unless a hidden hop on the way is worse
        let tone = b.tone;
        skipped.forEach((h) => { if (h.tone !== 'ok' && rankT(h.tone) > rankT(tone)) tone = h.tone; });
        segs.push({ k, ci, from: a.sys.id, to: b.sys.id, tone, via: skipped.map((h) => h.sys.id), target: b });
      }
    });
    const ids = Object.keys(visits);
    // a second system in the same stage (API gateway -> hub, Lakehouse -> Reporting) gets its own sub-column
    const stageOf = (id) => M.systems[id].sys.stage;
    const lvl = Object.fromEntries(ids.map((id) => [id, 0]));
    for (let r = 0; r < 3; r++) segs.forEach((g) => { if (stageOf(g.from) === stageOf(g.to)) lvl[g.to] = Math.max(lvl[g.to], lvl[g.from] + 1); });
    const colKeys = [];
    reg.stages.forEach((st) => { for (let l = 0; l <= 3; l++) if (ids.some((id) => stageOf(id) === st.id && lvl[id] === l)) colKeys.push(`${st.id}:${l}`); });
    const colOf = Object.fromEntries(ids.map((id) => [id, colKeys.indexOf(`${stageOf(id)}:${lvl[id]}`)]));
    const cols = colKeys.map((_, c) => ids.filter((id) => colOf[id] === c));
    const hgt = (id) => Math.max(MINH, visits[id].length * SLOT);
    // order within columns: start by contract order, then a few barycentre sweeps to cut crossings
    const ord = Object.fromEntries(ids.map((id) => [id, Math.min(...visits[id])]));
    const ypos = {};
    const place = () => cols.forEach((list) => { let y = 0; list.forEach((id) => { ypos[id] = y + hgt(id) / 2; y += hgt(id) + GAP; }); });
    cols.forEach((list) => list.sort((a, b) => ord[a] - ord[b]));
    place();
    for (let sweep = 0; sweep < 4; sweep++) {
      const fwd = sweep % 2 === 0;
      const range = fwd ? cols.map((_, i) => i).slice(1) : cols.map((_, i) => i).slice(0, -1).reverse();
      range.forEach((c) => {
        cols[c].forEach((id) => {
          const ns = segs.filter((g) => (fwd ? g.to === id : g.from === id)).map((g) => ypos[fwd ? g.from : g.to]);
          if (ns.length) ord[id] = ns.reduce((a, b) => a + b, 0) / ns.length;
        });
        cols[c].sort((a, b) => ord[a] - ord[b]);
        place();
      });
    }
    // geometry
    const colH = cols.map((list) => list.reduce((a, id) => a + hgt(id) + GAP, -GAP));
    const maxH = Math.max(...colH);
    // draw at real pixel size: fit the pane, but never squeeze a column below 118 px
    const avail = Math.max(700, (($('#view') && $('#view').clientWidth) || 1100) - 62);
    const colW = Math.max(118, (avail - pad * 2 - BAR) / Math.max(1, colKeys.length - 1));
    const W = pad * 2 + BAR + colW * Math.max(1, colKeys.length - 1);
    const maxChars = Math.max(10, Math.floor((colW - BAR - 34) / 6.4));
    const node = {};
    cols.forEach((list, c) => {
      let y = top + (maxH - colH[c]) / 2;
      list.forEach((id) => { node[id] = { x: pad + c * colW, y, h: hgt(id) }; y += hgt(id) + GAP; });
    });
    const H = top + maxH + 12;
    // slots: outgoing ordered by target height, incoming by source height
    const outs = {}, ins = {};
    segs.forEach((g) => { (outs[g.from] ||= []).push(g); (ins[g.to] ||= []).push(g); });
    const cy = (id) => node[id].y + node[id].h / 2;
    const slotY = (id, list, g) => {
      const n = list.length, start = node[id].y + (node[id].h - n * SLOT) / 2;
      return start + list.indexOf(g) * SLOT;
    };
    Object.entries(outs).forEach(([, l]) => l.sort((a, b) => cy(a.to) - cy(b.to) || a.ci - b.ci));
    Object.entries(ins).forEach(([, l]) => l.sort((a, b) => cy(a.from) - cy(b.from) || a.ci - b.ci));
    const w = SLOT - 1.2;
    const bands = segs.map((g, i) => {
      const A = node[g.from], B = node[g.to];
      const x1 = A.x + BAR, x2 = B.x, y1 = slotY(g.from, outs[g.from], g), y2 = slotY(g.to, ins[g.to], g);
      const xm = (x1 + x2) / 2;
      tips.set(`b${i}`, `<dl><dt>${esc(g.k.c.name)}</dt><dd>${esc(g.from)} → ${g.via.length ? esc(g.via.join(' → ')) + ' → ' : ''}${esc(g.to)}</dd><dt>At ${esc(g.target.sys.name)}</dt><dd>${esc(STATE_TXT[g.target.state])}</dd></dl>`);
      return `<path class="band t-${g.tone}" data-k="${esc(g.k.c.id)}" data-tipkey="b${i}" d="M${x1},${y1} C${xm},${y1} ${xm},${y2} ${x2},${y2} L${x2},${y2 + w} C${xm},${y2 + w} ${xm},${y1 + w} ${x1},${y1 + w} Z"/>`;
    }).join('');
    const col = { ok: 'var(--t-ok)', transit: 'var(--t-transit)', late: 'var(--t-late)', bad: 'var(--t-bad)', wait: 'var(--t-wait)' };
    const last = colKeys.length - 1;
    const nodesSvg = ids.map((id) => {
      const n = node[id], S0 = M.systems[id], c = colOf[id];
      const full = S0.sys.name.replace(/^Dynamics 365 /, 'D365 ');
      const name = full.length > maxChars ? full.slice(0, maxChars - 1) + '…' : full;
      const right = c !== last;
      const lx = right ? n.x + BAR + 6 : n.x - 6, ly = n.y + Math.min(n.h / 2, 13) + 4;
      tips.set(`sn${id}`, `<dl><dt>${esc(S0.sys.name)}</dt><dd>${esc(id)} · ${esc(S0.sys.owner)}</dd><dt>Contracts</dt><dd>${visits[id].length}${S0.bad ? ` · ${S0.bad} late or red` : ''}</dd></dl>`);
      return `<g class="snode" data-id="${esc(id)}" data-k="${visits[id].map((ci) => M.contracts[ci].c.id).join(' ')}" data-tipkey="sn${esc(id)}" tabindex="0" role="link" aria-label="${esc(S0.sys.name)}, ${visits[id].length} contracts">
        <rect x="${n.x}" y="${n.y}" width="${BAR}" height="${n.h}" rx="3" fill="${col[S0.tone]}"/>
        <text x="${lx}" y="${ly}" text-anchor="${right ? 'start' : 'end'}">${esc(name)} <tspan class="c">${visits[id].length}</tspan></text></g>`;
    }).join('');
    const heads = reg.stages.map((st) => {
      const c = colKeys.indexOf(`${st.id}:0`);
      return c < 0 ? '' : `<text class="colh" x="${pad + c * colW}" y="20">${esc(st.name)}</text>`;
    }).join('');
    return `<svg id="sankey" width="${Math.round(W)}" height="${Math.round(H)}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sankey map: one band per contract between systems">${heads}<g>${bands}</g><g>${nodesSvg}</g></svg>`;
  }

  // Confluent-style map: columns per stage, links between systems aggregated over contracts
  function systemMap() {
    const W = 1000, pad = 14, top = 34, nodeW = 158, nodeH = 30, rowH = 38;
    const colW = (W - pad * 2) / reg.stages.length;
    const sysList = Object.values(M.systems);
    const cols = reg.stages.map((st) => sysList.filter((s) => s.sys.stage === st.id));
    const pos = {};
    // order: sources by contract order, then each column by the average row of its upstream
    const cIdx = Object.fromEntries(M.contracts.map((k, i) => [k.c.id, i]));
    cols.forEach((list, ci) => {
      list.forEach((s) => {
        const ups = M.links.filter((l) => l.to === s.sys.id && pos[l.from]).map((l) => pos[l.from].row);
        s._o = ups.length ? ups.reduce((a, b) => a + b, 0) / ups.length : Math.min(...s.hops.map((h) => cIdx[h.contract.id]));
      });
      list.sort((a, b) => a._o - b._o);
      list.forEach((s, ri) => { pos[s.sys.id] = { col: ci, row: ri, x: pad + ci * colW, y: 0 }; });
    });
    const maxN = Math.max(...cols.map((c) => c.length));
    const H = top + maxN * rowH + 10;
    cols.forEach((list) => {
      const off = top + ((maxN - list.length) * rowH) / 2;
      list.forEach((s, ri) => { pos[s.sys.id].y = off + ri * rowH; });
    });
    const tone = (t) => (t === 'ok' || t === 'wait' ? '' : t);
    const links = M.links.map((l, i) => {
      const a = pos[l.from], b = pos[l.to];
      if (!a || !b) return '';
      const x1 = a.x + nodeW, y1 = a.y + nodeH / 2, x2 = b.x, y2 = b.y + nodeH / 2, dx = (x2 - x1) / 2;
      const w = Math.min(5, 1.2 + l.hops.length * 0.5);
      tips.set(`l${i}`, `<dl><dt>${esc(l.from)} → ${esc(l.to)}</dt><dd>${l.hops.map((h) => `${esc(h.contract.name)}: ${esc(STATE_TXT[h.state])}`).join('<br>')}</dd></dl>`);
      return `<path class="mlink ${tone(l.tone)}" data-a="${esc(l.from)}" data-b="${esc(l.to)}" data-tipkey="l${i}" stroke-width="${w}" d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}"/>`;
    }).join('');
    const col = { ok: 'var(--t-ok)', transit: 'var(--t-transit)', late: 'var(--t-late)', bad: 'var(--t-bad)', wait: 'var(--t-wait)' };
    const nodes = sysList.map((s) => {
      const p = pos[s.sys.id];
      const name = s.sys.name.length > 19 ? s.sys.name.slice(0, 18) + '…' : s.sys.name;
      tips.set(`n${s.sys.id}`, `<dl><dt>${esc(s.sys.name)}</dt><dd>${esc(s.sys.id)} · ${esc(s.sys.owner)}</dd><dt>Contracts</dt><dd>${s.hops.length}${s.bad ? ` · ${s.bad} late or red` : ''}</dd></dl>`);
      return `<g class="mnode" data-id="${esc(s.sys.id)}" data-tipkey="n${esc(s.sys.id)}" tabindex="0" role="link" aria-label="${esc(s.sys.name)}">
        <rect class="b" x="${p.x}" y="${p.y}" width="${nodeW}" height="${nodeH}" rx="4"/>
        <rect x="${p.x}" y="${p.y}" width="4" height="${nodeH}" rx="2" fill="${col[s.tone]}"/>
        <text x="${p.x + 11}" y="${p.y + 19}">${esc(name)}</text>
        <text class="c" x="${p.x + nodeW - 8}" y="${p.y + 19}" text-anchor="end">${s.hops.length}</text></g>`;
    }).join('');
    const heads = reg.stages.map((st, i) => `<text class="colh" x="${pad + i * colW}" y="20">${esc(st.name)}</text>`).join('');
    return `<svg id="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of systems and the links between them">${heads}<g>${links}</g><g>${nodes}</g></svg>`;
  }

  // ---------- contract ----------
  function contractView(k) {
    const c = k.c, src = k.hops[0] ? k.hops[0].sys : null;
    const h = k.worst;
    const chain = k.hops.map((x, i) => {
      const next = k.hops[i + 1];
      const wire = next ? `<span class="wire ${next.state === 'transit' ? 'transit' : next.tone === 'late' ? 'late' : next.tone === 'bad' && next.state !== 'error' ? 'bad' : ''}" aria-hidden="true"></span>` : '';
      tips.set(`h${i}`, x.e
        ? `<dl><dt>Checkpoint</dt><dd>${esc(x.sys.id)} · ${esc(STATE_TXT[x.state])}</dd><dt>Run</dt><dd>${esc(x.e.run_id)}</dd><dt>Time</dt><dd>${esc(P.hhmmss(Date.parse(x.e.date)))}</dd><dt>Security</dt><dd>${esc(x.e.security_level)}</dd>${x.e.message ? `<dt>Message</dt><dd>${esc(x.e.message)}</dd>` : ''}</dl>`
        : `<dl><dt>${esc(STATE_TXT[x.state])}</dt><dd>${esc(x.why)}</dd></dl>`);
      return `<a class="cp ${x.tone}" href="#/s/${encodeURIComponent(x.sys.id)}" data-tipkey="h${i}">
        <span class="top">${ic(x.sys.stage)}<span class="nm">${esc(x.sys.name)}</span></span>
        <span class="id">${esc(x.sys.id)} · ${esc(stageName(x.sys.stage))}</span>
        <span class="st">${tp(x.tone, STATE_TXT[x.state])}<span>${hopLine(x)}</span></span>
        <span class="own">${av(x.sys.owner)}${esc(x.sys.owner)}</span>
        <span class="chev" aria-hidden="true">›</span>
      </a>${wire}`;
    }).join('');

    const runs = k.history.map((r, i) => {
      const took = r.end ? P.dur((r.end - r.start) / P.MIN) : i === 0 ? 'in progress' : 'did not finish';
      return `<tr><td class="mono">${esc(r.id)}</td><td class="mono">${esc(P.hhmm(r.start))}</td><td>${esc(took)}</td>${r.cells.map((t, j) => `<td><span class="sq ${t}" title="${esc(k.hops[j] ? k.hops[j].sys.id : '')}: ${esc(t)}"></span></td>`).join('')}</tr>`;
    }).join('');

    // what passes, without the data
    const lastEvents = k.cur ? k.cur.evs : [];
    const prof = Object.assign({}, ...lastEvents.map((e) => e.profile || {}));
    const lastE = lastEvents[lastEvents.length - 1];
    const recs = lastEvents.length ? lastEvents[0].records : null;
    const fields = c.fields.map((f) => {
      const miss = prof[f.name] && prof[f.name].missing;
      return `<tr><td><code>${esc(f.name)}</code></td><td>${esc(f.type)}</td><td>${lvl(f.level)}</td><td>${miss ? `<span class="miss">${num(miss)} missing</span>` : prof[f.name] ? 'complete' : '<span class="muted">—</span>'}</td></tr>`;
    }).join('');

    return `
      <div class="crumbs"><a href="#/">Overview</a><span>/</span>Data contracts<span>/</span>${esc(areaName(c.area))}</div>
      <div class="head">${ic('contract', 'big-ic')}<div>
        <h1>${esc(c.name)} ${tp(k.tone, k.worst ? STATE_TXT[k.worst.state] : TONE[k.tone])}</h1>
        <div class="meta"><code>${esc(c.contract)}</code><span>runs ${esc(P.every(c.every_min))}</span><span>checkpoint SLA ${c.checkpoint_sla_min} min</span>${lvl(c.security_level)}${src ? `<span>${av(src.owner)} ${esc(src.owner)}, producer</span>` : ''}</div>
      </div></div>
      ${c.description ? `<p class="desc">${esc(c.description)}</p>` : ''}
      ${h ? `<div class="callout ${k.tone}">${av(who(h).owner, true)}<div class="txt"><b>${esc(STATE_TXT[h.state])} at ${esc(h.sys.name)} · call ${esc(who(h).owner)}, ${esc(who(h).team)}</b>${hopWhy(h)}</div></div>` : ''}

      <section class="sect">
        <h2>Checkpoints ${k.cur ? `<span class="muted" style="font-weight:400;font-size:14px">run <span class="mono">${esc(k.cur.id)}</span> started ${esc(P.hhmm(k.cur.start))}</span>` : ''}</h2>
        <p class="sub">The current message, system by system. Hover a checkpoint for its event; click to open the system.</p>
        <div class="chain-wrap"><div class="chain">${chain}</div></div>
        <div class="legend-row"><span>${td('ok')} passed</span><span>${td('transit')} on its way</span><span>${td('late')} later than ${c.checkpoint_sla_min} min</span><span>${td('bad')} later than ${c.checkpoint_sla_min * 3} min, error or blocked</span><span>${td('wait')} held up earlier</span></div>
      </section>

      <section class="sect">
        <h2>Recent messages</h2>
        <p class="sub">One row per run, newest first. A run that stopped shows where.</p>
        <div class="runs"><table><thead><tr><th>Run</th><th>Started</th><th>Took</th>${k.hops.map((x) => `<th>${esc(x.sys.id)}</th>`).join('')}</tr></thead><tbody>${runs}</tbody></table></div>
      </section>

      <section class="sect cols2">
        <div class="box"><div class="bh">What passes, without the data</div>
          <div style="display:flex;gap:22px;padding:12px 14px;border-bottom:1px solid var(--border);font-size:13px;color:var(--text-2)">
            <span><b style="display:block;font-size:17px;color:var(--text)">${recs == null ? '—' : num(recs)}</b>records, current run</span>
            <span><b style="display:block;font-size:17px;color:var(--text)">${c.fields.length}</b>fields</span>
            <span><b style="display:block;font-size:17px;color:var(--text)">${lastE ? esc(lastE.security_level) : '—'}</b>as it leaves ${lastE ? esc(lastE.system_id) : ''}</span>
          </div>
          <table class="tbl"><thead><tr><th>Field</th><th>Type</th><th>Level</th><th>Current run</th></tr></thead><tbody>${fields}</tbody></table>
        </div>
        <div class="box"><div class="bh">Latest checkpoint event</div>
          <div style="padding:12px 14px">${lastE ? `<pre class="code">${jsonHtml(lastE, ['status', 'message', 'profile', 'security_level'])}</pre>` : '<p class="muted">None yet.</p>'}</div>
        </div>
      </section>`;
  }

  // ---------- system (Compass-style) ----------
  function systemView(s) {
    const id = s.sys.id;
    const ups = M.links.filter((l) => l.to === id), downs = M.links.filter((l) => l.from === id);
    const card = (l, otherId, dir) => {
      const o = M.systems[otherId];
      const names = l.hops.map((h) => h.contract.name);
      tips.set(`${dir}${otherId}`, `<dl><dt>${dir === 'u' ? `${esc(otherId)} → ${esc(id)}` : `${esc(id)} → ${esc(otherId)}`}</dt><dd>${l.hops.map((h) => `${esc(h.contract.name)}: ${esc(STATE_TXT[h.state])}`).join('<br>')}</dd></dl>`);
      return `<a class="nb ${l.tone === 'wait' ? '' : l.tone}" href="#/s/${encodeURIComponent(otherId)}" data-link="${dir}" data-tipkey="${dir}${esc(otherId)}" data-tone="${esc(l.tone)}">
        ${ic(o.sys.stage)}<span class="t"><b>${esc(o.sys.name)}</b><small>${names.length} contract${names.length === 1 ? '' : 's'} · ${esc(o.sys.owner)}</small></span><span class="chev" aria-hidden="true">›</span></a>`;
    };
    const late = s.hops.filter((h) => h.tone === 'late').length, red = s.hops.filter((h) => h.tone === 'bad').length;
    const levels = [...new Set(s.hops.map((h) => h.e && h.e.security_level).filter(Boolean))].sort((a, b) => SEC[b] - SEC[a]);
    const rows = s.hops.slice().sort((a, b) => P.TONE_RANK[b.tone] - P.TONE_RANK[a.tone]).map((h) => {
      const k = M.contracts.find((x) => x.c.id === h.contract.id);
      const prev = k.hops[h.i - 1], next = k.hops[h.i + 1];
      return `<tr><td><a href="#/c/${encodeURIComponent(h.contract.id)}">${esc(h.contract.name)}</a><br><small class="muted">${esc(areaName(h.contract.area))}</small></td>
        <td>${tp(h.tone, STATE_TXT[h.state])}</td><td>${hopLine(h)}</td>
        <td class="mono">${prev ? esc(prev.sys.id) : '—'}</td><td class="mono">${next ? esc(next.sys.id) : '—'}</td></tr>`;
    }).join('');
    const tone = s.tone === 'transit' || s.tone === 'wait' ? 'ok' : s.tone;
    return `
      <div class="crumbs"><a href="#/">Overview</a><span>/</span>Systems<span>/</span>${esc(stageName(s.sys.stage))}</div>
      <div class="head">${ic(s.sys.stage, 'big-ic')}<div>
        <h1>${esc(s.sys.name)} ${tp(s.tone)}</h1>
        <div class="meta"><span class="mono">${esc(id)}</span><span>${esc(stageName(s.sys.stage))}</span><span>${av(s.sys.owner)} ${esc(s.sys.owner)}, ${esc(s.sys.team)}</span><span>cleared for ${lvl(s.sys.clearance)}</span></div>
      </div></div>

      <section class="sect">
        <h2>Relationships</h2>
        <p class="sub">Left: the systems that send it data. Right: the systems it sends data to. The line colour is the worst checkpoint on that link right now.</p>
        <div class="ego" id="ego">
          <svg class="ego-svg" id="ego-svg" aria-hidden="true"></svg>
          <div class="ego-grid">
            <div class="ego-col" id="ego-left">${ups.length ? ups.map((l) => card(l, l.from, 'u')).join('') : '<div class="none">Starts here: this is where the data comes from.</div>'}</div>
            <div class="center ${tone}" id="ego-center">
              <div class="top">${ic(s.sys.stage)}<div><b>${esc(s.sys.name)}</b><small>${esc(id)} · ${esc(stageName(s.sys.stage))}</small></div></div>
              <hr>
              <div class="lbl">Owner</div>
              <div style="display:flex;gap:8px;align-items:center">${av(s.sys.owner, true)}<span>${esc(s.sys.owner)}<br><small class="muted">${esc(s.sys.team)}</small></span></div>
              <div class="lbl" style="margin-top:12px">Data it sends</div>
              <div>${levels.map(lvl).join(' ') || '—'} <small class="muted">· cleared for ${esc(s.sys.clearance)}</small></div>
              <div class="stats"><div><b>${s.hops.length}</b>contracts</div><div><b>${late}</b>late</div><div><b>${red}</b>red</div></div>
              <button class="btn" type="button" id="to-list">View contracts</button>
            </div>
            <div class="ego-col" id="ego-right">${downs.length ? downs.map((l) => card(l, l.to, 'd')).join('') : '<div class="none">Ends here: nothing reads from it.</div>'}</div>
          </div>
        </div>
      </section>

      <section class="sect" id="sys-contracts">
        <h2>Contracts through this system <span class="count">${s.hops.length}</span></h2>
        <div class="box" style="overflow-x:auto"><table class="tbl"><thead><tr><th>Contract</th><th>Here</th><th>Last</th><th>From</th><th>To</th></tr></thead><tbody>${rows}</tbody></table></div>
      </section>`;
  }

  function drawEgo() {
    const ego = $('#ego'), svg = $('#ego-svg'), center = $('#ego-center');
    if (!ego || !center) return;
    const E = ego.getBoundingClientRect(), Cr = center.getBoundingClientRect();
    const cy = Cr.top + Cr.height / 2 - E.top + ego.scrollTop;
    const cl = Cr.left - E.left + ego.scrollLeft, cr = Cr.right - E.left + ego.scrollLeft;
    svg.setAttribute('width', ego.scrollWidth); svg.setAttribute('height', ego.scrollHeight);
    const paths = [];
    $$('#ego-left .nb').forEach((n) => {
      const r = n.getBoundingClientRect();
      const x = r.right - E.left + ego.scrollLeft, y = r.top + r.height / 2 - E.top + ego.scrollTop, tx = (x + cl) / 2;
      paths.push(`<path class="${n.dataset.tone === 'ok' || n.dataset.tone === 'wait' ? '' : n.dataset.tone}" d="M${x},${y} H${tx} V${cy} H${cl}"/>`);
    });
    $$('#ego-right .nb').forEach((n) => {
      const r = n.getBoundingClientRect();
      const x = r.left - E.left + ego.scrollLeft, y = r.top + r.height / 2 - E.top + ego.scrollTop, tx = (x + cr) / 2;
      paths.push(`<path class="${n.dataset.tone === 'ok' || n.dataset.tone === 'wait' ? '' : n.dataset.tone}" d="M${cr},${cy} H${tx} V${y} H${x}"/>`);
    });
    svg.innerHTML = paths.join('');
  }
  let rsz;
  addEventListener('resize', () => {
    drawEgo();
    clearTimeout(rsz);
    rsz = setTimeout(() => { if (route.view === 'overview' && mapMode === 'sankey') { lastSig = ''; renderView(); } }, 200);
  });

  // ---------- after render: tooltips, map hover, buttons ----------
  function afterRender() {
    drawEgo();
    $('#to-list')?.addEventListener('click', () => $('#sys-contracts').scrollIntoView({ behavior: 'smooth' }));
    $$('[data-map]').forEach((b) => b.addEventListener('click', () => {
      mapMode = b.dataset.map; store.set('routa-map', mapMode); mapHover = null; lastSig = ''; renderView();
    }));
    $('#map-int')?.addEventListener('change', (e) => {
      mapInt = e.target.checked; store.set('routa-map-int', mapInt ? '1' : '0'); mapHover = null; lastSig = ''; renderView();
    });
    const sk = $('#sankey');
    if (sk) {
      const bands = $$('.band', sk), snodes = $$('.snode', sk);
      const light = (h) => {
        mapHover = h;
        if (!h) { sk.classList.remove('hl'); bands.forEach((b) => b.classList.remove('lit')); snodes.forEach((n) => n.classList.remove('lit')); return; }
        // the contracts to light: one band's contract, or every contract through a system
        const ks = new Set(h.kind === 'k' ? [h.id] : (snodes.find((n) => n.dataset.id === h.id)?.dataset.k || '').split(' '));
        sk.classList.add('hl');
        bands.forEach((b) => b.classList.toggle('lit', ks.has(b.dataset.k)));
        snodes.forEach((n) => n.classList.toggle('lit', n.dataset.k.split(' ').some((k) => ks.has(k))));
      };
      bands.forEach((b) => {
        b.addEventListener('mouseenter', () => light({ kind: 'k', id: b.dataset.k }));
        b.addEventListener('mouseleave', () => light(null));
        b.addEventListener('click', () => { location.hash = '#/c/' + encodeURIComponent(b.dataset.k); });
      });
      snodes.forEach((n) => {
        n.addEventListener('mouseenter', () => light({ kind: 'node', id: n.dataset.id }));
        n.addEventListener('mouseleave', () => light(null));
        n.addEventListener('focus', () => light({ kind: 'node', id: n.dataset.id }));
        n.addEventListener('blur', () => light(null));
        n.addEventListener('click', () => { location.hash = '#/s/' + encodeURIComponent(n.dataset.id); });
        n.addEventListener('keydown', (e) => { if (e.key === 'Enter') location.hash = '#/s/' + encodeURIComponent(n.dataset.id); });
      });
      if (mapHover) light(mapHover);   // keep the highlight through live updates
    }
    const map = $('#map');
    if (map) {
      const nodes = $$('.mnode', map), links = $$('.mlink', map);
      const hl = (id) => {
        if (!id) { map.classList.remove('hl'); nodes.forEach((n) => n.classList.remove('lit')); links.forEach((l) => l.classList.remove('lit')); return; }
        map.classList.add('hl');
        const lit = new Set([id]);
        links.forEach((l) => { const on = l.dataset.a === id || l.dataset.b === id; l.classList.toggle('lit', on); if (on) { lit.add(l.dataset.a); lit.add(l.dataset.b); } });
        nodes.forEach((n) => n.classList.toggle('lit', lit.has(n.dataset.id)));
      };
      nodes.forEach((n) => {
        n.addEventListener('mouseenter', () => hl(n.dataset.id));
        n.addEventListener('mouseleave', () => hl(null));
        n.addEventListener('click', () => { location.hash = '#/s/' + encodeURIComponent(n.dataset.id); });
        n.addEventListener('keydown', (e) => { if (e.key === 'Enter') location.hash = '#/s/' + encodeURIComponent(n.dataset.id); });
      });
    }
  }
  const tip = $('#tip');
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tipkey]');
    if (!t || !tips.has(t.dataset.tipkey)) { tip.hidden = true; return; }
    tip.innerHTML = tips.get(t.dataset.tipkey);
    tip.hidden = false;
    place(e.clientX, e.clientY);
  });
  function place(cx, cy) {
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = cx + 14, y = cy + 16;
    if (x + w > innerWidth - 8) x = cx - w - 14;
    if (y + h > innerHeight - 8) y = cy - h - 12;
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
  }
  document.addEventListener('mousemove', (e) => {
    if (!tip.hidden) place(e.clientX, e.clientY);
  });

  // ---------- chrome: speed, simulate menu, mobile sidebar ----------
  const SCENARIOS = [
    { title: 'Integration hub fails', sub: 'Purchase orders: Dynamics 365 endpoint refuses the connection', go: 'purchase-orders', sc: { type: 'fail', flow: 'purchase-orders', system: 'INT-01', message: 'Connection refused by the Dynamics 365 endpoint' } },
    { title: 'Dynamics 365 Finance slows down', sub: 'Supplier payments: each message takes 18 min to post', go: 'supplier-payments', sc: { type: 'slow', flow: 'supplier-payments', system: 'D365-FIN', delay_min: 18 } },
    { title: 'Hub forwards secret data', sub: 'Apartment reservations: customer IDs not pseudonymised', go: 'reservations', sc: { type: 'leak', flow: 'reservations', system: 'INT-01' } },
    { title: 'Moisture sensors go quiet', sub: 'Concrete moisture: no new messages from the source', go: 'moisture', sc: { type: 'stop', flow: 'moisture' } },
    { title: 'Fix the invoice mapping', sub: 'Supplier invoices: the next message goes through', go: 'supplier-invoices', sc: { type: 'fix', flow: 'supplier-invoices' } },
    { title: 'Fix everything', sub: 'Clear every planted problem', go: null, sc: { type: 'fix-all' } },
  ];
  function initChrome() {
    const menu = $('#sim-menu'), btn = $('#sim-btn');
    menu.innerHTML = `<div class="mh">Make something happen</div>` + SCENARIOS.map((x, i) => `${i === 4 ? '<hr>' : ''}<button type="button" role="menuitem" data-sc="${i}">${esc(x.title)}<small>${esc(x.sub)}</small></button>`).join('');
    const toggle = (show) => { menu.hidden = !show; btn.setAttribute('aria-expanded', String(show)); if (show) menu.querySelector('button').focus(); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(menu.hidden); });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sc]'); if (!b) return;
      const x = SCENARIOS[+b.dataset.sc];
      toggle(false);
      S.apply(x.sc);
      compute();
      location.hash = x.go ? '#/c/' + x.go : '#/';
      lastSig = ''; renderSide(true); renderView();
    });
    document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('.menu-wrap')) toggle(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!menu.hidden) toggle(false);
      $('#side').classList.remove('open');
    });
    $$('[data-speed]').forEach((b) => b.addEventListener('click', () => {
      S.setSpeed(+b.dataset.speed);
      $$('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    $('#side-toggle').addEventListener('click', () => {
      const open = !$('#side').classList.contains('open');
      $('#side').classList.toggle('open', open);
      $('#side-toggle').setAttribute('aria-expanded', String(open));
    });
  }

  // ---------- JSON with colour ----------
  function jsonHtml(obj, mark = []) {
    const txt = esc(JSON.stringify(obj, null, 2));
    return txt.split('\n').map((line) => {
      let out = line.replace(/(&quot;(?:(?!&quot;).)*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g, (m, str, colon) => {
        if (str) return colon ? `<span class="k">${str}</span>${colon}` : `<span class="s">${str}</span>`;
        return `<span class="n">${m}</span>`;
      });
      if (mark.some((k) => line.includes(`&quot;${k}&quot;:`))) out = `<span class="hl">${out}</span>`;
      return out;
    }).join('\n');
  }
})();
