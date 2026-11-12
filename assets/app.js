/* Routa · data pipeline status (sandbox)
   Reads the system register and a feed of events; the board is derived from them. No build step. */
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
  let R;                 // register
  let seed = [];         // seed events, shifted to now
  let events = [];       // everything received so far
  let selected = null;   // "flowId|systemId"
  const sys = {}, flows = {};
  const SEC = { public: 0, internal: 1, confidential: 2, secret: 3 };
  // Security level as a 4-dot meter, like a priority marker on a card.
  const dots = (l) => `<span class="dots ${esc(l)}" title="Security: ${esc(l)}" aria-label="Security ${esc(l)}">${[0, 1, 2, 3].map((i) => `<i class="${i <= SEC[l] ? 'on' : ''}"></i>`).join('')}</span>`;
  const lvl = (l) => `<span class="lvl">${dots(l)}<span class="lvl-name">${esc(l)}</span></span>`;
  const loz = (s) => `<span class="loz ${esc(s)}">${esc(s)}</span>`;
  const chip = loz;

  function latest(flowId, sysId) {
    let best = null;
    for (const e of events) if (e.flow === flowId && e.system_id === sysId && (!best || Date.parse(e.date) >= Date.parse(best.date))) best = e;
    return best;
  }

  // Walk each flow from source to analytics. The first step that breaks stops everything after it.
  function board() {
    return R.flows.map((f) => {
      let broken = null, prev = null;
      const cells = R.stages.map((st, col) => {
        const id = f.path[st.id];
        if (!id) return { na: true, col, stage: st };
        const s = sys[id], e = latest(f.id, id);
        const c = { flow: f, stage: st, col, sys: s, e, key: `${f.id}|${id}` };
        if (broken) { c.status = 'waiting'; c.why = `Waiting on ${broken.sys.name} (${broken.status}). Its data here is from the last good run.`; }
        else if (!e) { c.status = 'waiting'; c.why = 'No event received yet.'; }
        else if (e.status === 'failed') { c.status = 'failed'; c.why = e.message ? (/[.!?]$/.test(e.message) ? e.message : e.message + '.') : 'The run failed.'; }
        else if (prev && prev.e && SEC[prev.e.security_level] > SEC[s.clearance]) {
          c.status = 'blocked'; c.fixer = prev.sys;
          c.why = `${prev.sys.name} sends ${prev.e.security_level} data, but ${s.name} is cleared for ${s.clearance} only. The data is held back.`;
        } else if (minsSince(e.date) > f.every_min * 2) {
          c.status = 'late'; c.why = `No event for ${dur(minsSince(e.date))}; this flow runs ${every(f.every_min)}.`;
        } else { c.status = 'ok'; c.why = `Ran ${ago(e.date)}; this flow runs ${every(f.every_min)}.`; }
        if (!broken && ['failed', 'blocked', 'late'].includes(c.status)) broken = c;
        prev = c;
        return c;
      });
      const downstream = broken ? cells.filter((c) => !c.na && c.col > broken.col) : [];
      return { flow: f, cells, broken, downstream };
    });
  }

  // ---------- JSON with a bit of colour ----------
  function jsonHtml(obj, mark = []) {
    const txt = esc(JSON.stringify(obj, null, 2));
    return txt.split('\n').map((line) => {
      let out = line.replace(/(&quot;(?:(?!&quot;).)*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g, (m, str, colon, lit, n) => {
        if (str) return colon ? `<span class="k">${str}</span>${colon}` : `<span class="s">${str}</span>`;
        return `<span class="n">${m}</span>`;
      });
      if (mark.some((k) => line.includes(`&quot;${k}&quot;:`))) out = `<span class="hl">${out}</span>`;
      return out;
    }).join('\n');
  }

  // ---------- events ----------
  function makeEvent(sysId, flowId, extra) {
    const f = flows[flowId], s = sys[sysId];
    const order = R.stages.map((st) => f.path[st.id]).filter(Boolean);
    const i = order.indexOf(sysId);
    return {
      system_id: s.id, system_name: s.name, stage: s.stage, flow: f.id,
      source: i > 0 ? order[i - 1] : null,
      status: 'ok', date: isoLocal(new Date()),
      security_level: f.security_level,
      ...extra,
    };
  }

  const EXAMPLES = [
    {
      n: '01', title: 'A step fails',
      text: 'Dynamics 365 cannot post the nightly budget revisions because the period is closed.',
      make: () => makeEvent('D365-FIN', 'project-budgets', { status: 'failed', security_level: 'internal', message: 'Posting period 11/2026 is closed' }),
      mark: ['status', 'message'],
      then: ['Dynamics 365 turns red in the Project budgets lane.', 'Project app and Analytics switch to waiting: their figures are now stale, and they can see why.', 'Ville Koskinen (ERP team) is the one to call. Nobody has to guess.'],
      button: 'Send this event',
    },
    {
      n: '02', title: 'The fix goes in',
      text: 'After the mapping fix, the integration hub reprocesses the invoices and reports ok.',
      make: () => makeEvent('INT-01', 'supplier-invoices', { message: 'Reprocessed 2 950 rows' }),
      mark: ['status'],
      then: ['Integration turns green in the Supplier invoices lane.', 'Dynamics 365, the procurement app and analytics stop waiting.', 'The alert for Noora Ahonen closes by itself.'],
      button: 'Send this event',
    },
    {
      n: '03', title: 'Data is too secret for the next hop',
      text: 'The hub forgets to pseudonymise reservations and passes customer IDs on as they are.',
      make: () => makeEvent('INT-01', 'apartment-reservations', { security_level: 'secret' }),
      mark: ['security_level'],
      then: ['The hub says ok, but marks the data it sends as secret.', 'Dynamics 365 is cleared for confidential only, so the data is stopped at the door: blocked.', 'The fix belongs to the sender, Noora Ahonen. The ERP team is told the data is held back.'],
      button: 'Send this event', target: 'apartment-reservations|D365-FIN',
    },
    {
      n: '04', title: 'Nothing arrives',
      text: 'The gate readers go quiet. No event is a signal too, so the platform writes this one itself.',
      make: () => {
        const e = latest('site-checkins', 'SRC-GATE');
        const m = e ? minsSince(e.date) : 0;
        return { ...makeEvent('SRC-GATE', 'site-checkins', { status: 'late', security_level: 'secret', message: `No event for ${dur(m)}; expected every 15 min` }), raised_by: 'platform' };
      },
      mark: ['status', 'raised_by'],
      then: ['Check-ins should report every 15 min. After twice that, the step is marked late.', 'Everything after it waits.', 'Petri Laine (Site operations) gets the call.'],
      button: 'Show it on the board', show: 'site-checkins|SRC-GATE',
    },
  ];

  // ---------- ui bits ----------
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
  const flowIdx = (id) => R.flows.findIndex((f) => f.id === id) % 5;
  const label = (f) => `<span class="label f${flowIdx(f.id)}" title="${esc(f.name)}">${esc(f.name)}</span>`;
  const STOPPED = ['failed', 'blocked', 'late'];

  const ui = { q: '', owner: null, status: 'all', level: 'all', group: true };
  const collapsed = new Set();

  function visible(c) {
    if (c.na) return false;
    if (ui.owner && c.sys.owner !== ui.owner) return false;
    if (ui.status === 'stopped' && !STOPPED.includes(c.status)) return false;
    if (ui.level !== 'all' && (!c.e || c.e.security_level !== ui.level)) return false;
    if (ui.q) {
      const hay = `${c.sys.name} ${c.sys.id} ${c.sys.owner} ${c.sys.team} ${c.flow.name} ${c.flow.contract}`.toLowerCase();
      if (!hay.includes(ui.q.toLowerCase())) return false;
    }
    return true;
  }
  const filtering = () => ui.q || ui.owner || ui.status !== 'all' || ui.level !== 'all';

  // ---------- render ----------
  let lastB = [];
  function render() {
    const B = board();
    lastB = B;
    renderAlerts(B);
    renderBoard(B);
    renderDrawer(B);
    renderFeed();
  }

  function renderAlerts(B) {
    const bad = B.filter((b) => b.broken);
    const items = bad.map((b) => {
      const c = b.broken, who = c.fixer || c.sys;
      return `<li data-key="${esc(c.key)}" tabindex="0" role="button">
        <span>${loz(c.status)}</span>
        <span class="where"><b>${esc(b.flow.name)}</b><span>${esc(c.stage.name)} · ${esc(c.sys.id)}</span></span>
        <span class="what">${esc(c.why)}${b.downstream.length ? ` <span class="muted">Stops ${b.downstream.map((d) => esc(d.sys.name)).join(', ')}.</span>` : ''}</span>
        <span class="who">${av(who.owner)}<span><b>${esc(who.owner)}</b><small>${esc(who.team)}${c.fixer ? ' · sender' : ''}</small></span></span>
      </li>`;
    }).join('');
    $('#alerts').innerHTML = bad.length
      ? `<div class="ah">Who to call now <span class="count bad">${bad.length}</span><span class="muted">${B.length - bad.length} of ${B.length} flows running</span></div><ul>${items}</ul>`
      : `<div class="ah">Who to call now <span class="count">0</span><span class="muted">All ${B.length} flows running</span></div><div class="none">Nothing to chase. Use “Send event” to break something.</div>`;
    $$('#alerts li').forEach((li) => {
      const go = () => open(li.dataset.key, true);
      li.addEventListener('click', go);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  function card(c, withLabel) {
    const stop = STOPPED.includes(c.status);
    const alertTxt = c.status === 'failed' ? `Failed ${c.e ? hhmm(c.e.date) : ''}`
      : c.status === 'blocked' ? 'Blocked: too secret'
        : c.status === 'late' ? `Quiet for ${dur(minsSince(c.e.date))}` : '';
    return `<button type="button" class="card s-${c.status}${selected === c.key ? ' sel' : ''}" data-key="${esc(c.key)}"
        title="${esc(c.why)}" aria-label="${esc(`${c.sys.name}, ${c.stage.name}, ${c.flow.name}: ${c.status}. Owner ${c.sys.owner}`)}">
      <span class="ttl">${esc(c.sys.name)}</span>
      ${withLabel ? `<span>${label(c.flow)}</span>` : ''}
      ${stop ? `<span class="alert">${WARN}<span>${esc(alertTxt)}</span></span>` : ''}
      <span class="row">${c.e ? dots(c.e.security_level) : ''}${loz(c.status)}</span>
      <span class="cfoot">${ti(c.stage.id)}<span class="key">${esc(c.sys.id)}</span><span class="spacer"></span>${av(c.sys.owner)}</span>
    </button>`;
  }

  function renderBoard(B) {
    const cols = R.stages.map((_, i) => {
      const cs = B.map((b) => b.cells[i]).filter(visible);
      return { n: cs.length, bad: cs.filter((c) => STOPPED.includes(c.status)).length, cs };
    });
    const head = `<div class="cols">${R.stages.map((s, i) => `<div class="col-h">${esc(s.name)} <span class="count">${cols[i].n}</span>${cols[i].bad ? `<span class="count bad">${cols[i].bad} stopped</span>` : ''}</div>`).join('')}</div>`;
    const end = `<div class="board-end">${R.stages.map(() => '<div></div>').join('')}</div>`;
    let body;
    if (!ui.group) {
      body = `<div class="lane-row">${cols.map((col) => `<div class="slot">${col.cs.map((c) => card(c, true)).join('') || ''}</div>`).join('')}</div>`;
    } else {
      const caret = '<svg class="caret" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
      body = B.map((b) => {
        const f = b.flow, isCol = collapsed.has(f.id);
        const vis = b.cells.filter(visible);
        if (filtering() && !vis.length) return '';
        const who = b.broken && (b.broken.fixer || b.broken.sys);
        const state = b.broken
          ? `${loz(b.broken.status)} at ${esc(b.broken.stage.name)} · ${av(who.owner)} ${esc(who.owner)}`
          : `${loz('ok')} flowing`;
        const slots = b.cells.map((c) => {
          if (c.na) return `<div class="slot dim">${filtering() ? '' : '<div class="empty">not used</div>'}</div>`;
          return `<div class="slot">${visible(c) ? card(c, false) : ''}</div>`;
        }).join('');
        return `<div class="lane${isCol ? ' collapsed' : ''}" data-flow="${esc(f.id)}">
          <div class="lane-sep"></div>
          <div class="lane-hrow"><button type="button" class="lane-h" aria-expanded="${!isCol}">${caret}${label(f)}
            <span class="m">${esc(f.contract)} · ${esc(every(f.every_min))} · ${vis.length} card${vis.length === 1 ? '' : 's'}</span>${dots(f.security_level)}<span class="state">${state}</span></button></div>
          <div class="lane-row">${slots}</div>
        </div>`;
      }).join('') || '<div class="lane-row"><div class="slot" style="grid-column:1/-1"><div class="empty">No cards match the filters.</div></div></div>';
    }
    $('#board-grid').innerHTML = head + body + end;
    $$('#board-grid .card').forEach((el) => el.addEventListener('click', () => (selected === el.dataset.key && drawerOpen() ? close() : open(el.dataset.key))));
    $$('#board-grid .lane-h').forEach((el) => el.addEventListener('click', () => {
      const id = el.closest('.lane').dataset.flow;
      collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
      renderBoard(lastB);
    }));
  }

  // ---------- side panel ----------
  const drawer = $('#drawer');
  let returnFocus = null;
  const drawerOpen = () => drawer.classList.contains('open');

  function open(key, flash) {
    if (!drawerOpen()) returnFocus = document.activeElement;
    selected = key;
    collapsed.delete(key.split('|')[0]);
    render();
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.focus({ preventScroll: true });
    if (flash) {
      const el = $(`#board-grid .card[data-key="${CSS.escape(key)}"]`);
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

  function renderDrawer(B) {
    const b = selected && B.find((x) => x.cells.some((c) => c.key === selected));
    const c = b && b.cells.find((x) => x.key === selected);
    if (!c) { $('#dr-body').innerHTML = ''; $('#dr-crumb').innerHTML = ''; return; }
    const f = c.flow, who = c.fixer || c.sys;
    const hist = events.filter((e) => e.flow === f.id && e.system_id === c.sys.id).sort((x, y) => Date.parse(y.date) - Date.parse(x.date)).slice(0, 6);
    const headline = { ok: 'Running', failed: 'This step failed', blocked: 'Data held back at this step', late: 'This step has gone quiet', waiting: 'Held up earlier in the pipe' }[c.status];
    const statusName = { ok: 'Running', failed: 'Failed', blocked: 'Blocked', late: 'Late', waiting: 'Waiting' }[c.status];
    const chain = b.cells.filter((x) => !x.na).map((x) =>
      `<button type="button" class="hop s-${x.status}${x.key === c.key ? ' me' : ''}" data-key="${esc(x.key)}" title="${esc(`${x.sys.name}: ${x.status}`)}">${ti(x.stage.id)}${esc(x.sys.id)}</button>`).join('<span class="arr">→</span>');
    const isBreak = b.broken && b.broken.key === c.key;

    $('#dr-crumb').innerHTML = `${label(f)} <span>/</span> ${esc(c.stage.name)} <span>/</span> ${ti(c.stage.id)}<b>${esc(c.sys.id)}</b>`;
    $('#dr-body').innerHTML = `
      <h2 id="dr-title">${esc(c.sys.name)}</h2>
      <span class="dr-status ${c.status}">${esc(statusName)}</span>
      <div class="callout ${c.status}"><b>${esc(headline)}</b>${esc(c.why)}${isBreak && b.downstream.length ? ` Stops ${b.downstream.map((d) => esc(d.sys.name)).join(', ')}.` : ''}</div>

      <h4>Where in the pipe</h4>
      <div class="chain">${chain}</div>

      <h4>Details</h4>
      <div class="box">
        <dl class="fields">
          <dt>Owner</dt><dd><span class="person">${av(c.sys.owner, true)}<span>${esc(c.sys.owner)}<small>${esc(c.sys.team)}</small></span></span></dd>
          ${c.fixer ? `<dt>Who fixes</dt><dd><span class="person">${av(who.owner, true)}<span>${esc(who.owner)}<small>${esc(who.team)} · sends the data</small></span></span></dd>` : ''}
          ${c.status === 'waiting' && b.broken ? `<dt>Waiting on</dt><dd>${esc(b.broken.sys.name)} <small>${esc((b.broken.fixer || b.broken.sys).owner)}</small></dd>` : ''}
          <dt>Flow</dt><dd>${label(f)}</dd>
          <dt>Contract</dt><dd><code>${esc(f.contract)}</code></dd>
          <dt>Runs</dt><dd>${esc(every(f.every_min))}</dd>
          <dt>Data out</dt><dd>${c.e ? lvl(c.e.security_level) : '—'}</dd>
          <dt>Cleared for</dt><dd>${lvl(c.sys.clearance)} <small>and below</small></dd>
          <dt>Last event</dt><dd>${c.e ? `${esc(hhmm(c.e.date))} <small>${esc(ago(c.e.date))}</small>` : '—'}</dd>
        </dl>
      </div>

      <h4>Last event received</h4>
      ${c.e ? `<pre class="code">${jsonHtml(strip(c.e), ['status', 'security_level', 'message'])}</pre>` : '<p class="muted">None yet.</p>'}

      <h4>History</h4>
      <ul class="hist">${hist.map((e) => `<li><span class="t">${esc(hhmm(e.date))}</span>${loz(e.status)}${dots(e.security_level)}<span class="m">${esc(e.message || '')}</span></li>`).join('') || '<li class="muted">No events.</li>'}</ul>`;
    $$('#dr-body .hop').forEach((h) => h.addEventListener('click', () => open(h.dataset.key, true)));
    if (keepScroll.key === c.key) $('#dr-body').scrollTop = keepScroll.top;
    keepScroll.key = c.key;
  }
  const keepScroll = { key: null, top: 0 };
  $('#dr-body').addEventListener('scroll', (e) => { keepScroll.top = e.target.scrollTop; }, { passive: true });

  function renderFeed() {
    const list = [...events].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 40);
    $('#feed-list').innerHTML = list.map((e) => `<li class="${e._new ? 'new' : ''}">
      <span class="t">${esc(hhmm(e.date))}</span>
      <span>${loz(e.status)} ${esc(e.system_id)}</span>
      <span class="j">${esc(JSON.stringify(strip(e)))}</span>
    </li>`).join('');
    events.forEach((e) => delete e._new);
  }
  const strip = (e) => { const { _new, ...rest } = e; return rest; };

  // ---------- sending examples ----------
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

  function renderStatic() {
    $('#schema-json').innerHTML = jsonHtml(strip(events.find((e) => e.system_id === 'INT-01' && e.flow === 'supplier-invoices')));

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
    }[s]}</span>`).join('') + `<span>${dots('confidential')} security level of the data</span>` +
      R.stages.map((s) => `<span>${ti(s.id)}${esc(s.name)}</span>`).join('');

    // toolbar
    const owners = [...new Set(R.systems.map((s) => s.owner))].sort();
    $('#owners').innerHTML = owners.map((o) => `<button type="button" data-o="${esc(o)}" aria-pressed="false" title="${esc(o)}" aria-label="Only ${esc(o)}">${av(o)}</button>`).join('');
    $$('#owners button').forEach((b) => b.addEventListener('click', () => {
      ui.owner = ui.owner === b.dataset.o ? null : b.dataset.o;
      $$('#owners button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.o === ui.owner)));
      renderBoard(lastB);
    }));
    $('#q').addEventListener('input', (e) => { ui.q = e.target.value.trim(); renderBoard(lastB); });
    $('#f-status').addEventListener('change', (e) => { ui.status = e.target.value; e.target.classList.toggle('on', ui.status !== 'all'); renderBoard(lastB); });
    $('#f-level').addEventListener('change', (e) => { ui.level = e.target.value; e.target.classList.toggle('on', ui.level !== 'all'); renderBoard(lastB); });
    $('#group').addEventListener('click', (e) => {
      ui.group = !ui.group;
      e.currentTarget.setAttribute('aria-pressed', String(ui.group));
      e.currentTarget.textContent = ui.group ? 'Group: Flow' : 'Group: None';
      renderBoard(lastB);
    });
    $('#reset').addEventListener('click', resetBoard);

    // tabs follow the scroll position
    const tabs = $$('.tabs a');
    const onScroll = () => {
      let cur = tabs[0];
      tabs.forEach((t) => { const s = $(t.getAttribute('href')); if (s && s.getBoundingClientRect().top < 140) cur = t; });
      tabs.forEach((t) => t.classList.toggle('active', t === cur));
    };
    addEventListener('scroll', onScroll, { passive: true });
  }

  // ---------- boot ----------
  Promise.all(['data/register.json', 'data/events.json'].map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.json(); })))
    .then(([reg, evs]) => {
      R = reg;
      R.systems.forEach((s) => (sys[s.id] = s));
      R.flows.forEach((f) => (flows[f.id] = f));
      // Shift the seed so its newest event is a minute old, whatever day the demo is opened.
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
        <p class="lede">The page reads <code>data/register.json</code> and <code>data/events.json</code>, which browsers block when the file is opened straight from disk. Run <code>python3 -m http.server</code> in the folder and open <code>http://localhost:8000</code>. On GitHub Pages it works as is.</p>`;
    });
})();
