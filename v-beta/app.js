/* Routa · data landscape (beta)
   Same events and model as v3, shown two other ways: a landscape of nested boxes, and a contract × system grid. */
(() => {
  'use strict';
  const P = window.Pipe;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

  const TONE = { ok: 'Passing', transit: 'In transit', late: 'Late', bad: 'Red', wait: 'Waiting' };
  const STATE_TXT = { passed: 'Passed', 'passed-late': 'Passed late', 'passed-very-late': 'Passed very late', transit: 'In transit', late: 'Late', 'very-late': 'Very late', error: 'Error', blocked: 'Blocked', waiting: 'Waiting' };
  const LEVELS = ['public', 'internal', 'confidential', 'secret'];
  const TEAM_COL = ['#579dff', '#2ebd85', '#f5cd47', '#9f8fef', '#fea362', '#6cc3e0', '#f87168', '#94c748', '#e774bb', '#8590a2', '#c97cf4', '#4bce97', '#ffd5d2', '#b8acf6'];
  const tp = (tone, text) => `<span class="tp ${esc(tone)}">${esc(text || TONE[tone])}</span>`;
  const td = (tone) => `<span class="td ${esc(tone)}" aria-hidden="true"></span>`;
  const initials = (n) => n.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const av = (n, lg) => `<span class="av c${[...n].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 6}${lg ? ' lg' : ''}" title="${esc(n)}" aria-hidden="true">${esc(initials(n))}</span>`;

  let reg, S, M, teams = [];
  const ui = { view: 'land', colour: 'status', q: '', hidden: new Set(), sel: null };   // sel: {kind:'c'|'s', id}

  P.load('data/').then(({ reg: r, sim }) => {
    reg = r;
    teams = [...new Set(reg.systems.map((s) => s.team))].sort();
    S = P.createSim(reg, sim);
    compute();
    chrome();
    render(true);
    setInterval(() => { compute(); $('#clock').textContent = P.hhmmss(S.now()); render(); }, 900);
  }).catch((e) => {
    console.error(e);
    $('#stage').innerHTML = '<p>The page reads files from <code>data/</code>, which browsers block when opened straight from disk. Run <code>python3 -m http.server</code> in the repository folder and open <code>http://localhost:8000/v-beta/</code>.</p>';
  });
  function compute() { M = P.derive(reg, S.events, S.now()); }

  // ---------- colouring ----------
  function colourOf(h) {
    if (ui.colour === 'security') { const l = h.e ? h.e.security_level : null; return { cls: l ? `c-${l}` : 'c-wait', cat: l || 'none', style: '' }; }
    if (ui.colour === 'team') { const i = teams.indexOf(h.sys.team); return { cls: '', cat: h.sys.team, style: `background:${TEAM_COL[i % TEAM_COL.length]};color:#1d2125` }; }
    return { cls: `c-${h.tone}`, cat: h.tone, style: '' };
  }
  const matchQ = (k) => !ui.q || `${k.c.name} ${k.c.contract} ${k.hops.map((h) => `${h.sys.id} ${h.sys.name} ${h.sys.owner}`).join(' ')}`.toLowerCase().includes(ui.q.toLowerCase());

  // ---------- render ----------
  let lastSig = '', lastDrawerSig = '';
  function render(force) {
    const sig = [ui.view, ui.colour, ui.q, [...ui.hidden].join(), ui.sel && ui.sel.kind + ui.sel.id,
      M.contracts.map((k) => k.hops.map((h) => h.state + (h.e ? h.e.security_level : '')).join()).join('|')].join('#');
    if (force || sig !== lastSig) {
      lastSig = sig;
      const st = $('#stage'), scrollEl = $('.mx-wrap');
      const keep = scrollEl ? [scrollEl.scrollTop, scrollEl.scrollLeft] : null;
      st.innerHTML = ui.view === 'land' ? landscape() : grid();
      if (keep && $('.mx-wrap')) { $('.mx-wrap').scrollTop = keep[0]; $('.mx-wrap').scrollLeft = keep[1]; }
      $('#legend').innerHTML = legend();
      bindStage();
    }
    renderDrawer();
  }

  function legend() {
    let rows;
    if (ui.colour === 'security') rows = LEVELS.map((l) => [l, `c-${l}`, '', l]);
    else if (ui.colour === 'team') rows = teams.map((t, i) => [t, '', `background:${TEAM_COL[i % TEAM_COL.length]}`, t]);
    else rows = ['ok', 'transit', 'late', 'bad', 'wait'].map((t) => [t, `c-${t}`, '', TONE[t]]);
    const counts = {};
    M.contracts.forEach((k) => k.hops.forEach((h) => { const c = colourOf(h).cat; counts[c] = (counts[c] || 0) + 1; }));
    return `<h3>Legend</h3>${rows.map(([cat, cls, style, label]) => `<label><input type="checkbox" data-cat="${esc(cat)}" ${ui.hidden.has(cat) ? '' : 'checked'}><span class="sw ${cls}" style="${style}"></span>${esc(label)} <span class="muted" style="margin-left:auto">${counts[cat] || 0}</span></label>`).join('')}
      <small>${ui.colour === 'status' ? 'Late: past the checkpoint SLA. Red: past 3× the SLA, an error, or data above the system\'s clearance.' : ui.colour === 'security' ? 'Level of the data as it leaves each system.' : 'Team that owns each system.'} Untick to fade.</small>`;
  }

  function tile(h) {
    const c = colourOf(h), dim = ui.hidden.has(c.cat) ? ' dim' : '';
    const title = `${h.sys.name} (${h.sys.id}) · ${STATE_TXT[h.state]} · ${h.sys.owner}${h.e ? ' · ' + h.e.security_level : ''}`;
    return `<span class="tile ${c.cls}${h.state === 'transit' && ui.colour === 'status' ? ' transit' : ''}${dim}" style="${c.style}" title="${esc(title)}">${esc(h.sys.id)}<small>${esc(short(h.sys.name))}</small></span>`;
  }
  const short = (n) => (n.length > 16 ? n.slice(0, 15) + '…' : n);
  const worst = (tones) => tones.reduce((w, t) => (P.TONE_RANK[t] > P.TONE_RANK[w] ? t : w), 'ok');

  function landscape() {
    return `<div class="land">${reg.areas.map((a) => {
      const ks = M.contracts.filter((k) => k.c.area === a.id);
      if (!ks.length) return '';
      const t = worst(ks.map((k) => k.tone));
      const bad = ks.filter((k) => k.tone === 'bad' || k.tone === 'late').length;
      const head = ui.colour === 'status' ? `c-${t === 'transit' ? 'ok' : t}` : '';
      return `<section class="area t-${ui.colour === 'status' ? t : 'none'}">
        <div class="ah ${head}" style="${ui.colour === 'status' ? '' : 'background:var(--sunken)'}">${esc(a.name)} <span class="n">${ks.length} contracts${bad ? ` · ${bad} need attention` : ''}</span></div>
        <div class="body">${ks.map((k) => `<button type="button" class="con${ui.sel && ui.sel.kind === 'c' && ui.sel.id === k.c.id ? ' sel' : ''}${matchQ(k) ? '' : ' dim'}" data-c="${esc(k.c.id)}" aria-label="${esc(`${k.c.name}: ${TONE[k.tone]}`)}">
            <span class="chd">${td(k.tone)}${esc(k.c.name)}<span class="k">${esc(k.c.contract)}</span></span>
            <span class="tiles">${k.hops.map(tile).join('<span class="tarr" aria-hidden="true">›</span>')}</span>
          </button>`).join('')}</div>
      </section>`;
    }).join('')}</div>`;
  }

  function grid() {
    const sysList = Object.values(M.systems);
    const cols = reg.stages.flatMap((st) => sysList.filter((s) => s.sys.stage === st.id).sort((a, b) => b.hops.length - a.hops.length));
    const stageSpans = reg.stages.map((st) => [st, cols.filter((s) => s.sys.stage === st.id).length]).filter(([, n]) => n);
    const firstOfStage = new Set(stageSpans.map(([st]) => cols.find((s) => s.sys.stage === st.id).sys.id));
    const selCol = ui.sel && ui.sel.kind === 's' ? ui.sel.id : null;
    const head1 = `<tr><th class="rowh"></th>${stageSpans.map(([st, n]) => `<th colspan="${n}">${esc(st.name)}</th>`).join('')}</tr>`;
    const head2 = `<tr><th class="rowh" style="vertical-align:bottom;padding:8px 10px;font:600 12px var(--sans);color:var(--text-2)">Contract</th>${cols.map((s) => `<th data-col="${esc(s.sys.id)}" class="${selCol === s.sys.id ? 'colsel' : ''}" title="${esc(`${s.sys.name} · ${s.sys.owner} · ${s.hops.length} contracts`)}"><span class="vt">${esc(s.sys.name)}</span></th>`).join('')}</tr>`;
    const body = reg.areas.map((a) => {
      const ks = M.contracts.filter((k) => k.c.area === a.id);
      if (!ks.length) return '';
      return `<tr class="areah"><td colspan="${cols.length + 1}">${esc(a.name)}</td></tr>` + ks.map((k) => {
        const at = Object.fromEntries(k.hops.map((h) => [h.sys.id, h]));
        const rowSel = ui.sel && ui.sel.kind === 'c' && ui.sel.id === k.c.id;
        return `<tr class="${rowSel ? 'rowsel' : ''}${matchQ(k) ? '' : ' dimrow'}" data-c="${esc(k.c.id)}">
          <td class="rowh" title="${esc(k.c.name)}">${td(k.tone)}${esc(k.c.name)}</td>
          ${cols.map((s) => {
            const h = at[s.sys.id];
            const cls = `cell${firstOfStage.has(s.sys.id) ? ' stg' : ''}${selCol === s.sys.id ? ' colsel' : ''}`;
            if (!h) return `<td class="${cls}" data-col="${esc(s.sys.id)}"></td>`;
            const c = colourOf(h);
            return `<td class="${cls}" data-col="${esc(s.sys.id)}" data-c="${esc(k.c.id)}" title="${esc(`${k.c.name} at ${s.sys.name}: ${STATE_TXT[h.state]}`)}"><i class="${c.cls}${ui.hidden.has(c.cat) || !matchQ(k) ? ' dim' : ''}" style="${c.style}"></i></td>`;
          }).join('')}
        </tr>`;
      }).join('');
    }).join('');
    return `<div class="mx-wrap"><table class="mx"><thead>${head1}${head2}</thead><tbody>${body}</tbody></table></div>
      <p class="muted" style="font-size:13px;margin-top:8px">Click a column heading to see everything that depends on that system. Click a row or square for the contract.</p>`;
  }

  function bindStage() {
    $$('#stage .con').forEach((b) => b.addEventListener('click', () => select('c', b.dataset.c)));
    $$('#stage .mx td.rowh, #stage .mx td.cell[data-c]').forEach((td) => td.addEventListener('click', () => select('c', td.closest('tr').dataset.c)));
    $$('#stage .mx thead th[data-col]').forEach((th) => th.addEventListener('click', () => select('s', th.dataset.col)));
    const mx = $('#stage .mx');
    if (mx) {
      let cur = null;
      mx.addEventListener('mouseover', (e) => {
        const c = e.target.closest('[data-col]');
        const id = c ? c.dataset.col : null;
        if (id === cur) return;
        if (cur) $$(`.mx [data-col="${CSS.escape(cur)}"]`).forEach((x) => x.classList.remove('colhl'));
        cur = id;
        if (cur) $$(`.mx td[data-col="${CSS.escape(cur)}"]`).forEach((x) => x.classList.add('colhl'));
      });
    }
    $$('#legend input[data-cat]').forEach((i) => i.addEventListener('change', () => {
      i.checked ? ui.hidden.delete(i.dataset.cat) : ui.hidden.add(i.dataset.cat);
      render(true);
    }));
  }

  // ---------- side panel ----------
  const drawer = $('#drawer');
  function select(kind, id) {
    ui.sel = ui.sel && ui.sel.kind === kind && ui.sel.id === id ? null : { kind, id };
    drawer.classList.toggle('open', !!ui.sel);
    drawer.setAttribute('aria-hidden', String(!ui.sel));
    lastDrawerSig = '';
    render(true);
    if (ui.sel) drawer.focus({ preventScroll: true });
  }
  $('#dr-close').addEventListener('click', () => { if (ui.sel) select(ui.sel.kind, ui.sel.id); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.sel) select(ui.sel.kind, ui.sel.id); });

  const dotStyle = (t) => ({ ok: 'var(--t-ok)', transit: 'var(--t-transit)', late: 'var(--t-late)', bad: 'var(--t-bad)', wait: 'var(--t-wait)' }[t]);
  const areaName = (id) => (reg.areas.find((a) => a.id === id) || {}).name || id;
  const stageName = (id) => (reg.stages.find((a) => a.id === id) || {}).name || id;

  function renderDrawer() {
    if (!ui.sel) return;
    let sig, crumb, body;
    if (ui.sel.kind === 'c') {
      const k = M.contracts.find((x) => x.c.id === ui.sel.id);
      if (!k) return;
      sig = 'c' + k.c.id + k.hops.map((h) => h.state).join();
      if (sig === lastDrawerSig) return;
      const w = k.worst, who = w && (w.fixer || w.sys);
      crumb = `Contracts <span>/</span> ${esc(areaName(k.c.area))}`;
      body = `<h2 id="dr-title">${esc(k.c.name)}</h2>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${tp(k.tone, w ? STATE_TXT[w.state] : TONE[k.tone])}<code>${esc(k.c.contract)}</code><span class="muted">runs ${esc(P.every(k.c.every_min))}</span></div>
        ${w ? `<div class="callout ${k.tone}">${av(who.owner, true)}<div class="txt"><b>${esc(STATE_TXT[w.state])} at ${esc(w.sys.name)} · call ${esc(who.owner)}</b>${esc(w.why)}</div></div>` : ''}
        <h4>Checkpoints</h4>
        <div class="chainmini">${k.hops.map((h) => `<div class="hopr"><span class="dot" style="background:${dotStyle(h.tone)}"></span>
          <span><b>${esc(h.sys.name)}</b><small>${esc(h.sys.id)} · ${esc(stageName(h.sys.stage))} · ${esc(h.sys.owner)}</small></span>
          <span>${tp(h.tone, STATE_TXT[h.state])}</span></div>`).join('')}</div>
        <a class="btn open-v3" href="../v3/#/c/${encodeURIComponent(k.c.id)}">Open in v3 →</a>`;
    } else {
      const s = M.systems[ui.sel.id];
      if (!s) return;
      sig = 's' + s.sys.id + s.hops.map((h) => h.state).join();
      if (sig === lastDrawerSig) return;
      const downstream = new Set();
      s.hops.forEach((h) => { const k = M.contracts.find((x) => x.c.id === h.contract.id); k.hops.slice(h.i + 1).forEach((x) => downstream.add(x.sys.id)); });
      crumb = `Systems <span>/</span> ${esc(stageName(s.sys.stage))}`;
      body = `<h2 id="dr-title">${esc(s.sys.name)}</h2>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${tp(s.tone)}<code>${esc(s.sys.id)}</code><span class="person">${av(s.sys.owner)} ${esc(s.sys.owner)}, ${esc(s.sys.team)}</span></div>
        <h4>If this system stops</h4>
        <p class="muted" style="margin:0 0 8px">${s.hops.length} contract${s.hops.length === 1 ? '' : 's'} stop here, and ${downstream.size} system${downstream.size === 1 ? '' : 's'} after it stop getting fresh data.</p>
        <ul class="impact">${s.hops.map((h) => `<li>${td(h.tone)}<a href="../v3/#/c/${encodeURIComponent(h.contract.id)}">${esc(h.contract.name)}</a>${tp(h.tone, STATE_TXT[h.state])}</li>`).join('')}</ul>
        <a class="btn open-v3" href="../v3/#/s/${encodeURIComponent(s.sys.id)}">Open relationships in v3 →</a>`;
    }
    lastDrawerSig = sig;
    $('#dr-crumb').innerHTML = crumb;
    $('#dr-body').innerHTML = body;
  }

  // ---------- chrome ----------
  const SCENARIOS = [
    { title: 'Integration hub fails', sub: 'Purchase orders', sc: { type: 'fail', flow: 'purchase-orders', system: 'INT-01', message: 'Connection refused by the Dynamics 365 endpoint' } },
    { title: 'Dynamics 365 Finance slows down', sub: 'Supplier payments take 18 min to post', sc: { type: 'slow', flow: 'supplier-payments', system: 'D365-FIN', delay_min: 18 } },
    { title: 'Hub forwards secret data', sub: 'Apartment reservations not pseudonymised', sc: { type: 'leak', flow: 'reservations', system: 'INT-01' } },
    { title: 'Moisture sensors go quiet', sub: 'No new messages from the source', sc: { type: 'stop', flow: 'moisture' } },
    { title: 'Fix everything', sub: 'Clear every planted problem', sc: { type: 'fix-all' } },
  ];
  function chrome() {
    const menu = $('#sim-menu'), btn = $('#sim-btn');
    menu.innerHTML = '<div class="mh">Make something happen</div>' + SCENARIOS.map((x, i) => `${i === 4 ? '<hr>' : ''}<button type="button" role="menuitem" data-sc="${i}">${esc(x.title)}<small>${esc(x.sub)}</small></button>`).join('');
    const toggle = (show) => { menu.hidden = !show; btn.setAttribute('aria-expanded', String(show)); if (show) menu.querySelector('button').focus(); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(menu.hidden); });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sc]'); if (!b) return;
      toggle(false);
      const x = SCENARIOS[+b.dataset.sc];
      S.apply(x.sc); compute();
      if (x.sc.flow) { ui.sel = { kind: 'c', id: x.sc.flow }; drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); lastDrawerSig = ''; }
      render(true);
    });
    document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('.menu-wrap')) toggle(false); });
    $$('[data-speed]').forEach((b) => b.addEventListener('click', () => {
      S.setSpeed(+b.dataset.speed);
      $$('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    $$('[data-view]').forEach((b) => b.addEventListener('click', () => {
      ui.view = b.dataset.view;
      $$('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render(true);
    }));
    $('#colour').addEventListener('change', (e) => { ui.colour = e.target.value; ui.hidden.clear(); render(true); });
    $('#q').addEventListener('input', (e) => { ui.q = e.target.value.trim(); render(true); });
  }
})();
