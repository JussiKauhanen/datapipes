/* Routa · data pipeline status, v2 (sandbox)
   Same event as v1, at 30 flows. Paths are derived from each event's `source`; nothing in the register
   says which systems a flow passes through. No build step. */
(() => {
  'use strict';

  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const isoLocal = (d) => {
    const o = -d.getTimezoneOffset(), sg = o >= 0 ? '+' : '-', a = Math.abs(o);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sg}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
  };
  const hhmm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const dur = (min) => (min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)} h${Math.round(min % 60) ? ' ' + Math.round(min % 60) + ' min' : ''}`);
  const minsSince = (iso) => (Date.now() - Date.parse(iso)) / 60000;
  const ago = (iso) => { const m = minsSince(iso); return m < 1 ? 'just now' : `${dur(m)} ago`; };
  const every = (m) => (m >= 1440 ? 'daily' : `every ${dur(m)}`);
  const nf = new Intl.NumberFormat('fi-FI');
  const num = (n) => nf.format(n);
  const sentence = (s) => (/[.!?]$/.test(s) ? s : s + '.');

  // ---------- theme ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  const saved = store.get('routa-theme');
  if (saved) document.documentElement.dataset.theme = saved;
  $('#theme').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('routa-theme', next);
  });

  // ---------- state ----------
  let R, seed = [], events = [];
  let selected = null;           // "flowId|systemId" or "sys|systemId"
  const sys = {}, flows = {};
  const SEC = { public: 0, internal: 1, confidential: 2, secret: 3 };
  const STOPPED = ['failed', 'blocked', 'late'];
  const ui = { board: 'all', view: 'compact', q: '', owner: null, status: 'all', level: 'all', stoppedFirst: true };
  const collapsed = new Set();

  // ---------- small renderers ----------
  const dots = (l) => `<span class="dots ${esc(l)}" title="Security: ${esc(l)}" aria-label="Security ${esc(l)}">${[0, 1, 2, 3].map((i) => `<i class="${i <= SEC[l] ? 'on' : ''}"></i>`).join('')}</span>`;
  const lvl = (l) => `<span class="lvl">${dots(l)}<span class="lvl-name">${esc(l)}</span></span>`;
  const loz = (s) => `<span class="loz ${esc(s)}">${esc(s)}</span>`;
  const initials = (n) => n.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const avColor = (n) => [...n].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 6;
  const av = (n, lg) => `<span class="av c${avColor(n)}${lg ? ' lg' : ''}" title="${esc(n)}" aria-hidden="true">${esc(initials(n))}</span>`;
  const TYPE_ICON = {
    source: '<ellipse cx="6" cy="3" rx="4" ry="1.5"/><path d="M2 3v6c0 .8 1.8 1.5 4 1.5s4-.7 4-1.5V3"/>',
    integration: '<path d="M2 4h7.5L7.5 2M10 8H2.5l2 2"/>',
    dynamics: '<rect x="2" y="2" width="3" height="3"/><rect x="7" y="2" width="3" height="3"/><rect x="2" y="7" width="3" height="3"/><rect x="7" y="7" width="3" height="3"/>',
    apps: '<rect x="2" y="2" width="8" height="8" rx="1"/><path d="M2 4.5h8"/>',
    analytics: '<path d="M3 10V6.5M6 10V2.5M9 10V5"/>',
  };
  const ti = (stage) => `<span class="ti ${esc(stage)}" title="${esc(stage)}"><svg viewBox="0 0 12 12" aria-hidden="true">${TYPE_ICON[stage] || ''}</svg></span>`;
  const WARN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2l6.5 11.5h-13z"/><path d="M8 6.5v3M8 11.5v.5"/></svg>';
  const areaIdx = (id) => Math.max(0, R.areas.findIndex((a) => a.id === id)) % 5;
  const label = (f) => `<span class="label f${areaIdx(f.area)}" title="${esc(f.name)}">${esc(f.name)}</span>`;
  const areaName = (id) => (R.areas.find((a) => a.id === id) || {}).name || id;

  // ---------- the model ----------
  function latest(flowId, sysId) {
    let best = null;
    for (const e of events) if (e.flow === flowId && e.system_id === sysId && (!best || Date.parse(e.date) >= Date.parse(best.date))) best = e;
    return best;
  }

  // A flow's path is whatever its events say: start at the event with no source, follow `source` links.
  function chainOf(flowId) {
    const ids = [...new Set(events.filter((e) => e.flow === flowId).map((e) => e.system_id))];
    const last = Object.fromEntries(ids.map((id) => [id, latest(flowId, id)]));
    const order = [];
    let cur = ids.find((id) => !last[id].source) || ids[0];
    while (cur && !order.includes(cur)) {
      order.push(cur);
      cur = ids.find((id) => !order.includes(id) && last[id].source === order[order.length - 1]);
    }
    ids.filter((id) => !order.includes(id)).forEach((id) => order.push(id));
    return order.map((id) => ({ sys: sys[id], e: last[id] }));
  }

  // Walk the chain. The first step that breaks stops everything after it.
  function model() {
    return R.flows.map((f) => {
      let broken = null, prev = null;
      const hops = chainOf(f.id).map(({ sys: s, e }, i) => {
        const h = { flow: f, sys: s, e, i, key: `${f.id}|${s.id}`, stage: s.stage };
        if (broken) { h.status = 'waiting'; h.why = `Waiting on ${broken.sys.name} (${broken.status}). Data here is from the last good run.`; }
        else if (e.status === 'failed') { h.status = 'failed'; h.why = e.message ? sentence(e.message) : 'The run failed.'; }
        else if (prev && SEC[prev.e.security_level] > SEC[s.clearance]) {
          h.status = 'blocked'; h.fixer = prev.sys;
          h.why = `${prev.sys.name} sends ${prev.e.security_level} data, but ${s.name} is cleared for ${s.clearance} only. The data is held back.`;
        } else if (minsSince(e.date) > f.every_min * 2) {
          h.status = 'late'; h.why = `No event for ${dur(minsSince(e.date))}; this flow runs ${every(f.every_min)}.`;
        } else { h.status = 'ok'; h.why = `Ran ${ago(e.date)}; this flow runs ${every(f.every_min)}.`; }
        if (!broken && STOPPED.includes(h.status)) broken = h;
        prev = h;
        return h;
      });
      const byStage = Object.fromEntries(R.stages.map((st) => [st.id, hops.filter((h) => h.stage === st.id)]));
      return { flow: f, hops, byStage, broken, downstream: broken ? hops.filter((h) => h.i > broken.i) : [] };
    });
  }

  // ---------- filters ----------
  const inBoard = (m) => ui.board === 'all' || m.flow.area === ui.board;
  function hopVisible(h) {
    if (ui.owner && h.sys.owner !== ui.owner) return false;
    if (ui.status === 'stopped' && !STOPPED.includes(h.status)) return false;
    if (ui.level !== 'all' && h.e.security_level !== ui.level) return false;
    if (ui.q) {
      const hay = `${h.sys.name} ${h.sys.id} ${h.sys.owner} ${h.sys.team} ${h.flow.name} ${h.flow.contract} ${h.flow.fields.map((x) => x.name).join(' ')}`.toLowerCase();
      if (!hay.includes(ui.q.toLowerCase())) return false;
    }
    return true;
  }
  const filtering = () => ui.q || ui.owner || ui.status !== 'all' || ui.level !== 'all';
  function visibleModel(M) {
    let list = M.filter(inBoard).map((m) => ({ ...m, vis: m.hops.filter(hopVisible) })).filter((m) => !filtering() || m.vis.length);
    const areaOrder = Object.fromEntries(R.areas.map((a, i) => [a.id, i]));
    list.sort((a, b) => (areaOrder[a.flow.area] - areaOrder[b.flow.area])
      || (ui.stoppedFirst ? (b.broken ? 1 : 0) - (a.broken ? 1 : 0) : 0));
    return list;
  }
  // Only stage types that something on screen actually uses become columns.
  const usedStages = (list) => R.stages.filter((st) => list.some((m) => m.vis.some((h) => h.stage === st.id)));
  function byArea(list) {
    const groups = [];
    list.forEach((m) => {
      let g = groups.find((x) => x.area === m.flow.area);
      if (!g) groups.push(g = { area: m.flow.area, items: [] });
      g.items.push(m);
    });
    return groups;
  }
  const areaHead = (g) => {
    const bad = g.items.filter((m) => m.broken).length;
    return `<div class="area-h">${esc(areaName(g.area))} <span class="count">${g.items.length}</span>${bad ? `<span class="count bad">${bad} stopped</span>` : ''}</div>`;
  };

  // ---------- render ----------
  let lastM = [];
  function render() {
    const M = model();
    lastM = M;
    renderAlerts(M);
    renderBoard(M);
    renderDrawer(M);
    renderFeed();
  }

  function renderAlerts(M) {
    const list = M.filter(inBoard);
    const bad = list.filter((m) => m.broken);
    const items = bad.map((m) => {
      const h = m.broken, who = h.fixer || h.sys;
      return `<li data-key="${esc(h.key)}" tabindex="0" role="button">
        <span>${loz(h.status)}</span>
        <span class="where"><b>${esc(m.flow.name)}</b><span>${esc(areaName(m.flow.area))} · ${esc(stageName(h.stage))} · ${esc(h.sys.id)}</span></span>
        <span class="what">${esc(h.why)}${m.downstream.length ? ` <span class="muted">Stops ${m.downstream.map((d) => esc(d.sys.name)).join(', ')}.</span>` : ''}</span>
        <span class="who">${av(who.owner)}<span><b>${esc(who.owner)}</b><small>${esc(who.team)}${h.fixer ? ' · sender' : ''}</small></span></span>
      </li>`;
    }).join('');
    $('#alerts').innerHTML = `<div class="ah">Who to call now <span class="count${bad.length ? ' bad' : ''}">${bad.length}</span><span class="muted">${list.length - bad.length} of ${list.length} flows running${ui.board !== 'all' ? ` on the ${esc(areaName(ui.board))} board` : ''}</span></div>`
      + (bad.length ? `<ul>${items}</ul>` : '<div class="none">Nothing to chase on this board.</div>');
    $$('#alerts li').forEach((li) => {
      const go = () => open(li.dataset.key, true);
      li.addEventListener('click', go);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }
  const stageName = (id) => (R.stages.find((s) => s.id === id) || {}).name || id;

  function colHeads(stages, list, extraFirst, extraLast) {
    const cnt = (st) => {
      const hs = list.flatMap((m) => m.vis.filter((h) => h.stage === st.id));
      const bad = hs.filter((h) => STOPPED.includes(h.status)).length;
      return `<span class="count">${hs.length}</span>${bad ? `<span class="count bad" title="${bad} stopped">${bad} ✕</span>` : ''}`;
    };
    return `<div class="cols">${extraFirst ? `<div class="col-h">${extraFirst}</div>` : ''}${stages.map((st) => `<div class="col-h">${ti(st.id)} ${esc(st.name)} ${cnt(st)}</div>`).join('')}${extraLast ? `<div class="col-h">${extraLast}</div>` : ''}</div>`;
  }

  function hopCard(h) {
    const stop = STOPPED.includes(h.status);
    const alertTxt = h.status === 'failed' ? `Failed ${hhmm(h.e.date)}` : h.status === 'blocked' ? 'Blocked: too secret' : h.status === 'late' ? `Quiet for ${dur(minsSince(h.e.date))}` : '';
    return `<button type="button" class="card s-${h.status}${selected === h.key ? ' sel' : ''}" data-key="${esc(h.key)}" title="${esc(h.why)}"
        aria-label="${esc(`${h.sys.name}, ${h.flow.name}: ${h.status}. Owner ${h.sys.owner}`)}">
      <span class="ttl">${esc(h.sys.name)}</span>
      ${stop ? `<span class="alert">${WARN}<span>${esc(alertTxt)}</span></span>` : ''}
      <span class="row">${dots(h.e.security_level)}${loz(h.status)}<span class="meta">${num(h.e.records ?? 0)} rec.</span></span>
      <span class="cfoot">${ti(h.stage)}<span class="key">${esc(h.sys.id)}</span><span class="spacer"></span>${av(h.sys.owner)}</span>
    </button>`;
  }

  function laneState(m) {
    if (!m.broken) return `${loz('ok')} flowing`;
    const who = m.broken.fixer || m.broken.sys;
    return `${loz(m.broken.status)} at ${esc(stageName(m.broken.stage))} · ${av(who.owner)} ${esc(who.owner)}`;
  }

  function renderBoard(M) {
    const grid = $('#board-grid');
    const list = visibleModel(M);
    if (ui.view === 'systems') return renderSystems(M, list, grid);
    const stages = usedStages(list);
    grid.style.setProperty('--ncol', Math.max(stages.length, 1));
    if (!list.length) { grid.className = 'board'; grid.innerHTML = '<div class="empty">No flows match the filters.</div>'; return; }

    if (ui.view === 'compact') {
      grid.className = 'board compact-v';
      const rows = byArea(list).map((g) => areaHead(g) + g.items.map((m) => {
        const cells = stages.map((st) => {
          const hs = m.byStage[st.id];
          if (!hs.length) return '<div class="cell-stage skip"></div>';
          return `<div class="cell-stage">${hs.map((h) => `<button type="button" class="pip ${h.status}${selected === h.key ? ' sel' : ''}${hopVisible(h) ? '' : ' dim'}" data-key="${esc(h.key)}" title="${esc(`${h.sys.name} · ${h.sys.owner} · ${h.status}`)}">${esc(h.sys.id)}</button>`).join('<span class="pip-arr">→</span>')}</div>`;
        }).join('');
        return `<div class="crow">
          <div><button type="button" class="fname" data-flow="${esc(m.flow.id)}"><span style="display:flex;gap:6px;align-items:center"><span class="fdot f${areaIdx(m.flow.area)}"></span><b>${esc(m.flow.name)}</b></span><small>${esc(m.flow.contract)} · ${esc(every(m.flow.every_min))}</small></button></div>
          ${cells}
          <div class="fstate">${laneState(m)}</div>
        </div>`;
      }).join('')).join('');
      grid.innerHTML = colHeads(stages, list, 'Flow', 'State') + rows;
      $$('.pip', grid).forEach((p) => p.addEventListener('click', () => open(p.dataset.key)));
      $$('.fname', grid).forEach((b) => b.addEventListener('click', () => {
        const m = lastM.find((x) => x.flow.id === b.dataset.flow);
        open((m.broken || m.hops[0]).key);
      }));
      return;
    }

    // cards: one lane per flow, multiple systems in the same stage stack in order
    grid.className = 'board cards-v';
    const caret = '<svg class="caret" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
    const lanes = byArea(list).map((g) => areaHead(g) + g.items.map((m) => {
      const isCol = collapsed.has(m.flow.id);
      const slots = stages.map((st) => {
        const hs = m.byStage[st.id].filter(hopVisible);
        if (!m.byStage[st.id].length) return '<div class="slot skip"></div>';
        return `<div class="slot${hs.length > 1 ? ' stack' : ''}">${hs.map(hopCard).join('')}</div>`;
      }).join('');
      return `<div class="lane${isCol ? ' collapsed' : ''}" data-flow="${esc(m.flow.id)}">
        <div class="lane-sep"></div>
        <div class="lane-hrow"><button type="button" class="lane-h" aria-expanded="${!isCol}">${caret}${label(m.flow)}
          <span class="m">${esc(m.flow.contract)} · ${esc(every(m.flow.every_min))} · ${m.hops.length} steps</span>${dots(m.flow.security_level)}<span class="state">${laneState(m)}</span></button></div>
        <div class="lane-row">${slots}</div>
      </div>`;
    }).join('')).join('');
    grid.innerHTML = colHeads(stages, list) + lanes + `<div class="board-end">${stages.map(() => '<div></div>').join('')}</div>`;
    $$('.card', grid).forEach((el) => el.addEventListener('click', () => (selected === el.dataset.key && drawerOpen() ? close() : open(el.dataset.key))));
    $$('.lane-h', grid).forEach((el) => el.addEventListener('click', () => {
      const id = el.closest('.lane').dataset.flow;
      collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
      renderBoard(lastM);
    }));
  }

  // One card per system: how many flows pass through it, and how they are doing.
  function systemRows(list) {
    const map = new Map();
    list.forEach((m) => m.hops.forEach((h) => {
      if (!map.has(h.sys.id)) map.set(h.sys.id, { sys: h.sys, hops: [] });
      map.get(h.sys.id).hops.push(h);
    }));
    return [...map.values()];
  }
  function renderSystems(M, list, grid) {
    let rows = systemRows(list).filter((r) => r.hops.some(hopVisible));
    const stages = R.stages.filter((st) => rows.some((r) => r.sys.stage === st.id));
    grid.style.setProperty('--ncol', Math.max(stages.length, 1));
    grid.className = 'board cards-v';
    const rank = (r) => r.hops.filter((h) => STOPPED.includes(h.status)).length * 100 + r.hops.length;
    rows = rows.sort((a, b) => rank(b) - rank(a));
    const cols = stages.map((st) => `<div class="slot">${rows.filter((r) => r.sys.stage === st.id).map((r) => {
      const bad = r.hops.filter((h) => STOPPED.includes(h.status)).length;
      const waiting = r.hops.filter((h) => h.status === 'waiting').length;
      const key = `sys|${r.sys.id}`;
      const onlyLate = bad && r.hops.filter((h) => STOPPED.includes(h.status)).every((h) => h.status === 'late');
      return `<button type="button" class="card s-${bad ? (onlyLate ? 'late' : 'failed') : 'ok'}${selected === key ? ' sel' : ''}" data-key="${esc(key)}">
        <span class="ttl">${esc(r.sys.name)}</span>
        ${bad ? `<span class="alert">${WARN}<span>${bad} of ${r.hops.length} flow${r.hops.length === 1 ? '' : 's'} stopped here</span></span>` : ''}
        <span class="meta">${r.hops.length} flow${r.hops.length === 1 ? '' : 's'}${waiting ? ` · ${waiting} waiting on others` : ''}</span>
        <span class="sys-flows">${r.hops.map((h) => `<i class="${h.status}" title="${esc(`${h.flow.name}: ${h.status}`)}"></i>`).join('')}</span>
        <span class="cfoot">${ti(r.sys.stage)}<span class="key">${esc(r.sys.id)}</span>${dots(r.sys.clearance)}<span class="spacer"></span>${av(r.sys.owner)}</span>
      </button>`;
    }).join('')}</div>`).join('');
    const heads = `<div class="cols">${stages.map((st) => {
      const n = rows.filter((r) => r.sys.stage === st.id).length;
      return `<div class="col-h">${ti(st.id)} ${esc(st.name)} <span class="count">${n}</span></div>`;
    }).join('')}</div>`;
    grid.innerHTML = heads + `<div class="lane-row">${cols}</div><div class="board-end">${stages.map(() => '<div></div>').join('')}</div>`;
    $$('.card', grid).forEach((el) => el.addEventListener('click', () => (selected === el.dataset.key && drawerOpen() ? close() : open(el.dataset.key))));
  }

  // ---------- side panel ----------
  const drawer = $('#drawer');
  let returnFocus = null;
  const drawerOpen = () => drawer.classList.contains('open');
  function open(key, flash) {
    if (!drawerOpen()) returnFocus = document.activeElement;
    selected = key;
    if (!key.startsWith('sys|')) {
      const fid = key.split('|')[0];
      collapsed.delete(fid);
      const f = flows[fid];
      if (ui.board !== 'all' && f && f.area !== ui.board) setBoard('all');
    }
    render();
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.focus({ preventScroll: true });
    if (flash) {
      const el = $(`#board-grid [data-key="${CSS.escape(key)}"]`);
      if (el) {
        el.classList.add('flash');
        const r = el.getBoundingClientRect();
        if (r.top < 60 || r.bottom > innerHeight) el.scrollIntoView({ block: 'center' });
      }
    }
  }
  function close() {
    selected = null;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    render();
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
  }
  $('#dr-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('#send-menu').hidden) toggleMenu(false); else if (drawerOpen()) close(); } });
  const keepScroll = { key: null, top: 0 };
  $('#dr-body').addEventListener('scroll', (e) => { keepScroll.top = e.target.scrollTop; }, { passive: true });

  // What the data is, without the data: names, types, levels and counts only.
  const TOKEN = { string: '‹text›', integer: '‹integer›', decimal: '‹decimal›', number: '‹number›', boolean: '‹true/false›', date: '‹date›', timestamp: '‹timestamp›' };
  function shapeHtml(h) {
    const f = h.flow, prof = h.e.profile || {};
    const afterInt = h.flow && chainOf(f.id).slice(0, h.i + 1).some((x) => x.sys.id === 'INT-01');
    const pseud = (fd) => fd.level === 'secret' && afterInt && h.sys.stage !== 'integration';
    const rec = h.e.records ?? null;
    const preview = '{\n' + f.fields.map((fd) => `  <span class="k">"${esc(fd.name)}"</span>: <span class="tok">${esc(pseud(fd) ? '‹pseudonymised id›' : TOKEN[fd.type] || '‹value›')}</span>`).join(',\n') + '\n}';
    const rows = f.fields.map((fd) => {
      const miss = prof[fd.name] && prof[fd.name].missing;
      const lv = pseud(fd) ? 'confidential' : fd.level;
      return `<tr><td><code>${esc(fd.name)}</code></td><td>${esc(fd.type)}</td><td>${lvl(lv)}${pseud(fd) ? ' <small class="muted">pseudonymised</small>' : ''}</td>
        <td>${miss ? `<span class="miss">${num(miss)} missing</span>` : `<span class="okc">${prof[fd.name] ? 'complete' : '—'}</span>`}</td></tr>`;
    }).join('');
    return `<div class="box shape">
      <div class="shape-sum">
        <span><b>${rec == null ? '—' : num(rec)}</b>records, last run</span>
        <span><b>${f.fields.length}</b>fields</span>
        <span><b>${esc(f.contract)}</b>contract</span>
        <span><b>${esc(h.e.security_level)}</b>as it leaves</span>
      </div>
      <table><thead><tr><th>Field</th><th>Type</th><th>Level</th><th>This run</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="note">One record, shape only:</div>
      <pre class="code" style="margin:0 14px 14px">${preview}</pre>
      <div class="note">Field names and types come from the contract; counts come from the event. No values are sent to this platform.</div>
    </div>`;
  }

  function renderDrawer(M) {
    if (!selected) { $('#dr-body').innerHTML = ''; $('#dr-crumb').innerHTML = ''; return; }
    if (selected.startsWith('sys|')) return renderSystemDrawer(M, selected.slice(4));
    const m = M.find((x) => x.hops.some((h) => h.key === selected));
    const h = m && m.hops.find((x) => x.key === selected);
    if (!h) { $('#dr-body').innerHTML = ''; return; }
    const f = m.flow, who = h.fixer || h.sys;
    const hist = events.filter((e) => e.flow === f.id && e.system_id === h.sys.id).sort((x, y) => Date.parse(y.date) - Date.parse(x.date)).slice(0, 6);
    const headline = { ok: 'Running', failed: 'This step failed', blocked: 'Data held back at this step', late: 'This step has gone quiet', waiting: 'Held up earlier in the pipe' }[h.status];
    const statusName = { ok: 'Running', failed: 'Failed', blocked: 'Blocked', late: 'Late', waiting: 'Waiting' }[h.status];
    const chain = m.hops.map((x) => `<button type="button" class="hop s-${x.status}${x.key === h.key ? ' me' : ''}" data-key="${esc(x.key)}" title="${esc(`${x.sys.name}: ${x.status}`)}">${ti(x.stage)}${esc(x.sys.id)}</button>`).join('<span class="arr">→</span>');
    const isBreak = m.broken && m.broken.key === h.key;

    $('#dr-crumb').innerHTML = `${label(f)} <span>/</span> ${esc(stageName(h.stage))} <span>/</span> ${ti(h.stage)}<b>${esc(h.sys.id)}</b>`;
    $('#dr-body').innerHTML = `
      <h2 id="dr-title">${esc(h.sys.name)}</h2>
      <span class="dr-status ${h.status}">${esc(statusName)}</span>
      <div class="callout ${h.status}"><b>${esc(headline)}</b>${esc(h.why)}${isBreak && m.downstream.length ? ` Stops ${m.downstream.map((d) => esc(d.sys.name)).join(', ')}.` : ''}</div>

      <h4>Where in the pipe</h4>
      <div class="chain">${chain}</div>

      <h4>What passes here</h4>
      ${shapeHtml(h)}

      <h4>Details</h4>
      <div class="box"><dl class="fields">
        <dt>Owner</dt><dd><span class="person">${av(h.sys.owner, true)}<span>${esc(h.sys.owner)}<small>${esc(h.sys.team)}</small></span></span></dd>
        ${h.fixer ? `<dt>Who fixes</dt><dd><span class="person">${av(who.owner, true)}<span>${esc(who.owner)}<small>${esc(who.team)} · sends the data</small></span></span></dd>` : ''}
        ${h.status === 'waiting' && m.broken ? `<dt>Waiting on</dt><dd>${esc(m.broken.sys.name)} <small>${esc((m.broken.fixer || m.broken.sys).owner)}</small></dd>` : ''}
        <dt>Flow</dt><dd>${label(f)} <small>${esc(areaName(f.area))}</small></dd>
        <dt>Runs</dt><dd>${esc(every(f.every_min))}</dd>
        <dt>Cleared for</dt><dd>${lvl(h.sys.clearance)} <small>and below</small></dd>
        <dt>Last event</dt><dd>${esc(hhmm(h.e.date))} <small>${esc(ago(h.e.date))}</small></dd>
      </dl></div>

      <h4>Last event received</h4>
      <pre class="code">${jsonHtml(strip(h.e), ['status', 'security_level', 'message', 'profile'])}</pre>

      <h4>History</h4>
      <ul class="hist">${hist.map((e) => `<li><span class="t">${esc(hhmm(e.date))}</span>${loz(e.status)}${dots(e.security_level)}<span class="m">${esc(e.message || (e.records != null ? num(e.records) + ' records' : ''))}</span></li>`).join('')}</ul>`;
    $$('#dr-body .hop').forEach((b) => b.addEventListener('click', () => open(b.dataset.key, true)));
    if (keepScroll.key === selected) $('#dr-body').scrollTop = keepScroll.top;
    keepScroll.key = selected;
  }

  function renderSystemDrawer(M, id) {
    const s = sys[id];
    const hops = M.flatMap((m) => m.hops.filter((h) => h.sys.id === id));
    const bad = hops.filter((h) => STOPPED.includes(h.status));
    const levels = [...new Set(hops.map((h) => h.e.security_level))].sort((a, b) => SEC[b] - SEC[a]);
    $('#dr-crumb').innerHTML = `Systems <span>/</span> ${esc(stageName(s.stage))} <span>/</span> ${ti(s.stage)}<b>${esc(s.id)}</b>`;
    $('#dr-body').innerHTML = `
      <h2 id="dr-title">${esc(s.name)}</h2>
      <span class="dr-status ${bad.length ? 'failed' : 'ok'}">${bad.length ? `${bad.length} stopped` : 'All flows running'}</span>
      <h4>Details</h4>
      <div class="box"><dl class="fields">
        <dt>Owner</dt><dd><span class="person">${av(s.owner, true)}<span>${esc(s.owner)}<small>${esc(s.team)}</small></span></span></dd>
        <dt>Stage</dt><dd>${ti(s.stage)} ${esc(stageName(s.stage))}</dd>
        <dt>Cleared for</dt><dd>${lvl(s.clearance)} <small>and below</small></dd>
        <dt>Data it sends</dt><dd>${levels.map(lvl).join(' ')}</dd>
        <dt>Records, last runs</dt><dd>${num(hops.reduce((a, h) => a + (h.e.records || 0), 0))}</dd>
      </dl></div>
      <h4>Flows through this system <span class="count">${hops.length}</span></h4>
      <ul class="flist">${hops.sort((a, b) => (STOPPED.includes(b.status) ? 1 : 0) - (STOPPED.includes(a.status) ? 1 : 0)).map((h) => `<li><button type="button" data-key="${esc(h.key)}">${loz(h.status)}<span class="grow">${esc(h.flow.name)} <small>${esc(h.flow.contract)}</small></span>${dots(h.e.security_level)}<small>${esc(hhmm(h.e.date))}</small></button></li>`).join('')}</ul>`;
    $$('#dr-body .flist button').forEach((b) => b.addEventListener('click', () => open(b.dataset.key, true)));
  }

  // ---------- JSON with a bit of colour ----------
  function jsonHtml(obj, mark = []) {
    const txt = esc(JSON.stringify(obj, null, 2));
    return txt.split('\n').map((line) => {
      let out = line.replace(/(&quot;(?:(?!&quot;).)*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g, (mm, str, colon) => {
        if (str) return colon ? `<span class="k">${str}</span>${colon}` : `<span class="s">${str}</span>`;
        return `<span class="n">${mm}</span>`;
      });
      if (mark.some((k) => line.includes(`&quot;${k}&quot;:`))) out = `<span class="hl">${out}</span>`;
      return out;
    }).join('\n');
  }
  const strip = (e) => { const { _new, ...rest } = e; return rest; };

  function renderFeed() {
    const list = [...events].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 60);
    $('#feed-list').innerHTML = list.map((e) => `<li class="${e._new ? 'new' : ''}">
      <span class="t">${esc(hhmm(e.date))}</span>
      <span>${loz(e.status)} ${esc(e.system_id)}</span>
      <span class="j">${esc(JSON.stringify(strip(e)))}</span>
    </li>`).join('');
    events.forEach((e) => delete e._new);
  }

  // ---------- examples ----------
  function makeEvent(sysId, flowId, extra) {
    const s = sys[sysId];
    const ch = chainOf(flowId), i = ch.findIndex((x) => x.sys.id === sysId);
    const prev = latest(flowId, sysId);
    return {
      system_id: s.id, system_name: s.name, stage: s.stage, flow: flowId,
      source: i > 0 ? ch[i - 1].sys.id : null, status: 'ok', date: isoLocal(new Date()),
      security_level: prev ? prev.security_level : flows[flowId].security_level, records: prev ? prev.records : 0,
      ...extra,
    };
  }
  const EXAMPLES = [
    {
      n: '01', title: 'A step fails',
      text: 'Dynamics 365 Project Operations cannot post the nightly budget revisions because the period is closed.',
      make: () => makeEvent('D365-PO', 'project-budgets', { status: 'failed', records: 0, message: 'Posting period 11/2026 is closed' }),
      mark: ['status', 'message'],
      then: ['The step turns red in the Project budgets lane, on the Finance board and in the D365-PO system card.', 'Project app, Lakehouse and Reporting switch to waiting.', 'Ville Koskinen (ERP team) is the one to call.'],
      button: 'Send this event',
    },
    {
      n: '02', title: 'The fix goes in',
      text: 'After the mapping fix the hub reprocesses the invoices. The profile now shows no missing purchase order numbers.',
      make: () => makeEvent('INT-01', 'supplier-invoices', { records: 2950, profile: { po_number: { missing: 0 } }, message: 'Reprocessed 2 950 rows' }),
      mark: ['status', 'profile'],
      then: ['Integration turns green; the five steps after it stop waiting.', 'Under “What passes here”, po_number goes from 112 missing to complete.', 'The alert for Noora Ahonen closes by itself.'],
      button: 'Send this event',
    },
    {
      n: '03', title: 'Data is too secret for the next hop',
      text: 'The hub forgets to pseudonymise reservations and passes customer IDs on as they are.',
      make: () => makeEvent('INT-01', 'reservations', { security_level: 'secret' }),
      mark: ['security_level'],
      then: ['The hub says ok, but marks what it sends as secret.', 'Dynamics 365 Finance is cleared for confidential only: blocked.', 'The fix belongs to the sender, Noora Ahonen.'],
      button: 'Send this event', target: 'reservations|D365-FIN',
    },
    {
      n: '04', title: 'Nothing arrives',
      text: 'The gate readers go quiet. No event is a signal too, so the platform writes this one itself.',
      make: () => {
        const e = latest('site-checkins', 'SRC-GATE');
        return { ...makeEvent('SRC-GATE', 'site-checkins', { status: 'late', records: 0, message: `No event for ${dur(e ? minsSince(e.date) : 0)}; expected every 15 min` }), raised_by: 'platform' };
      },
      mark: ['status', 'raised_by'],
      then: ['Check-ins should report every 15 min. After twice that, the step is marked late.', 'Everything after it waits.', 'Petri Laine (Site operations) gets the call.'],
      button: 'Show it on the board', show: 'site-checkins|SRC-GATE',
    },
  ];
  function sendExample(i) {
    const x = EXAMPLES[i];
    if (x.show) { open(x.show, true); return; }
    const e = x.make();
    e._new = true;
    events.push(e);
    const res = $(`[data-res="${i}"]`);
    if (res) res.textContent = `Sent at ${hhmm(e.date)}. See the panel on the right.`;
    const pre = $(`[data-json="${i}"]`);
    if (pre) pre.innerHTML = jsonHtml(x.make(), x.mark);
    open(x.target || `${e.flow}|${e.system_id}`, true);
  }
  function resetBoard() {
    events = seed.map((e) => ({ ...e }));
    $$('[data-res]').forEach((r) => (r.textContent = ''));
    collapsed.clear();
    if (drawerOpen()) close(); else render();
  }
  const menu = $('#send-menu'), sendBtn = $('#send-btn');
  function toggleMenu(show) {
    menu.hidden = !show;
    sendBtn.setAttribute('aria-expanded', String(show));
    if (show) menu.querySelector('button')?.focus();
  }

  function setBoard(id) {
    ui.board = id;
    $('#f-board').value = id;
    $('#crumb-board').textContent = id === 'all' ? 'All flows' : `${areaName(id)} board`;
  }

  // ---------- static parts ----------
  function renderStatic() {
    $('#schema-json').innerHTML = jsonHtml(strip(events.find((e) => e.system_id === 'INT-01' && e.flow === 'supplier-invoices')), ['records', 'profile']);

    $('#examples-grid').innerHTML = EXAMPLES.map((x, i) => `<article class="ex">
      <div class="n"><span class="count">${esc(x.n)}</span><h3>${esc(x.title)}</h3></div>
      <p>${esc(x.text)}</p>
      <pre class="code" data-json="${i}">${jsonHtml(x.make(), x.mark)}</pre>
      <div class="then">What the platform does</div>
      <ol>${x.then.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
      <div class="foot-row"><button class="btn${x.show ? '' : ' primary'}" type="button" data-ex="${i}">${esc(x.button)}</button><span class="result" data-res="${i}"></span></div>
    </article>`).join('');
    $$('[data-ex]').forEach((btn) => btn.addEventListener('click', () => sendExample(+btn.dataset.ex)));

    menu.innerHTML = `<div class="mh">Send an example event</div>${EXAMPLES.map((x, i) => `<button type="button" role="menuitem" data-m="${i}">${esc(x.title)}<small>${esc(x.show ? 'Show the platform-raised event' : x.text)}</small></button>`).join('')}
      <hr><button type="button" role="menuitem" data-m="reset">Reset the board<small>Back to the seeded events</small></button>`;
    sendBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(menu.hidden); });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      toggleMenu(false);
      b.dataset.m === 'reset' ? resetBoard() : sendExample(+b.dataset.m);
    });
    document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('.menu-wrap')) toggleMenu(false); });

    $('#levels').innerHTML = `<table>
      <thead><tr><th>Level</th><th>In Finnish</th><th>How it may be passed</th><th>Systems cleared for it</th></tr></thead>
      <tbody>${R.security_levels.map((l) => `<tr>
        <td>${lvl(l.id)}</td><td>${esc(l.fi)}</td><td>${esc(l.rule)}</td>
        <td>${R.systems.filter((s) => SEC[s.clearance] >= SEC[l.id]).map((s) => `<code>${esc(s.id)}</code>`).join(' ')}</td>
      </tr>`).join('')}</tbody></table>`;

    $('#legend').innerHTML = ['ok', 'failed', 'blocked', 'late', 'waiting'].map((s) => `<span>${loz(s)}${{
      ok: 'ran on time', failed: 'reported an error', blocked: 'data too secret for it', late: 'no event in time', waiting: 'held up earlier',
    }[s]}</span>`).join('') + `<span>${dots('confidential')} security level</span><span><span style="display:inline-block;width:22px;border-top:1px dashed var(--border-2)"></span> flow skips this stage</span>`;

    // board selector: one board per area
    const counts = Object.fromEntries(R.areas.map((a) => [a.id, R.flows.filter((f) => f.area === a.id).length]));
    $('#f-board').innerHTML = `<option value="all">Board: All flows (${R.flows.length})</option>` + R.areas.map((a) => `<option value="${esc(a.id)}">Board: ${esc(a.name)} (${counts[a.id]})</option>`).join('');
    $('#f-board').addEventListener('change', (e) => { setBoard(e.target.value); e.target.classList.toggle('on', ui.board !== 'all'); render(); });

    $$('[data-view]').forEach((b) => b.addEventListener('click', () => {
      ui.view = b.dataset.view;
      $$('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderBoard(lastM);
    }));

    const owners = [...new Set(R.systems.map((s) => s.owner))].sort();
    $('#owners').innerHTML = owners.map((o) => `<button type="button" data-o="${esc(o)}" aria-pressed="false" title="${esc(o)}" aria-label="Only ${esc(o)}">${av(o)}</button>`).join('');
    $$('#owners button').forEach((b) => b.addEventListener('click', () => {
      ui.owner = ui.owner === b.dataset.o ? null : b.dataset.o;
      $$('#owners button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.o === ui.owner)));
      renderBoard(lastM);
    }));
    $('#q').addEventListener('input', (e) => { ui.q = e.target.value.trim(); renderBoard(lastM); });
    $('#f-status').addEventListener('change', (e) => { ui.status = e.target.value; e.target.classList.toggle('on', ui.status !== 'all'); renderBoard(lastM); });
    $('#f-level').addEventListener('change', (e) => { ui.level = e.target.value; e.target.classList.toggle('on', ui.level !== 'all'); renderBoard(lastM); });
    $('#stopped-first').addEventListener('click', (e) => {
      ui.stoppedFirst = !ui.stoppedFirst;
      e.currentTarget.setAttribute('aria-pressed', String(ui.stoppedFirst));
      renderBoard(lastM);
    });
    $('#reset').addEventListener('click', resetBoard);

    const tabs = $$('.tabs a');
    addEventListener('scroll', () => {
      let cur = tabs[0];
      tabs.forEach((t) => { const s = $(t.getAttribute('href')); if (s && s.getBoundingClientRect().top < 140) cur = t; });
      tabs.forEach((t) => t.classList.toggle('active', t === cur));
    }, { passive: true });
  }

  // ---------- boot ----------
  Promise.all(['data/register.json', 'data/events.json'].map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.json(); })))
    .then(([reg, evs]) => {
      R = reg;
      R.systems.forEach((s) => (sys[s.id] = s));
      R.flows.forEach((f) => (flows[f.id] = f));
      const newest = Math.max(...evs.map((e) => Date.parse(e.date)));
      const shift = Date.now() - 60000 - newest;
      seed = evs.map((e) => ({ ...e, date: isoLocal(new Date(Date.parse(e.date) + shift)) }));
      events = seed.map((e) => ({ ...e }));
      renderStatic();
      render();
      setInterval(render, 30000);
    })
    .catch((err) => {
      console.error(err);
      $('main').innerHTML = `<h2>Data not loaded</h2>
        <p class="lede">The page reads <code>data/register.json</code> and <code>data/events.json</code>, which browsers block when the file is opened straight from disk. Run <code>python3 -m http.server</code> in the repository folder and open <code>http://localhost:8000/v2/</code>.</p>`;
    });
})();
