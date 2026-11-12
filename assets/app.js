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
  $('.theme-toggle').addEventListener('click', () => {
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
  const SEC_SHORT = { public: 'Public', internal: 'Internal', confidential: 'Conf.', secret: 'Secret' };
  const lvl = (l, long) => `<span class="lvl lvl-${esc(l)}" title="${esc(l)}">${esc(long ? l : SEC_SHORT[l] || l)}</span>`;
  const chip = (s) => `<span class="st ${esc(s)}">${esc(s)}</span>`;

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
      then: ['Dynamics 365 turns red on the Project budgets row.', 'Project app and Analytics switch to waiting: their figures are now stale, and they can see why.', 'Ville Koskinen (ERP team) is the one to call. Nobody has to guess.'],
      button: 'Send this event',
    },
    {
      n: '02', title: 'The fix goes in',
      text: 'After the mapping fix, the integration hub reprocesses the invoices and reports ok.',
      make: () => makeEvent('INT-01', 'supplier-invoices', { message: 'Reprocessed 2 950 rows' }),
      mark: ['status'],
      then: ['Integration turns green on the Supplier invoices row.', 'Dynamics 365, the procurement app and analytics stop waiting.', 'The alert for Noora Ahonen closes by itself.'],
      button: 'Send this event',
    },
    {
      n: '03', title: 'Data is too secret for the next hop',
      text: 'The hub forgets to pseudonymise reservations and passes customer IDs on as they are.',
      make: () => makeEvent('INT-01', 'apartment-reservations', { security_level: 'secret' }),
      mark: ['security_level'],
      then: ['The hub says ok, but marks the data it sends as secret.', 'Dynamics 365 is cleared for confidential only, so the data is stopped at the door: blocked.', 'The fix belongs to the sender, Noora Ahonen. The ERP team is told the data is held back.'],
      button: 'Send this event',
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

  // ---------- render ----------
  const collapsed = new Set();
  const loz = (s) => `<span class="loz ${esc(s)}">${esc(s)}</span>`;
  const initials = (n) => n.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const avColor = (n) => [...n].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 6;
  const av = (n, lg) => `<span class="av c${avColor(n)}${lg ? ' lg' : ''}" title="${esc(n)}" aria-hidden="true">${esc(initials(n))}</span>`;

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
        <span>${chip(c.status)}</span>
        <span class="where"><b>${esc(b.flow.name)}</b><span>${esc(c.stage.name)} · ${esc(c.sys.id)}</span></span>
        <span class="what">${esc(c.why)}${b.downstream.length ? ` <span class="muted">Stops: ${b.downstream.map((d) => esc(d.sys.name)).join(', ')}.</span>` : ''}</span>
        <span class="who"><b>${esc(who.owner)}</b>${esc(who.team)}${c.fixer ? ' · sender' : ''}</span>
      </li>`;
    }).join('');
    $('#alerts').innerHTML = `
      <div class="sum">
        <div class="k">Flows running</div>
        <div class="v">${B.length - bad.length}<span class="muted"> / ${B.length}</span></div>
        <div class="s">${bad.length ? `<b style="color:var(--bad)">${bad.length} stopped</b> · who to call →` : 'Nothing to chase'}</div>
      </div>
      ${bad.length ? `<ul>${items}</ul>` : '<div class="none">All flows ran on time. Send an example below to break one.</div>'}`;
    $$('#alerts li').forEach((li) => {
      const go = () => open(li.dataset.key, true);
      li.addEventListener('click', go);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  function renderBoard(B) {
    const perCol = R.stages.map((_, i) => {
      const cs = B.map((b) => b.cells[i]).filter((c) => !c.na);
      return { n: cs.length, bad: cs.filter((c) => ['failed', 'blocked', 'late'].includes(c.status)).length };
    });
    const head = `<div class="cols">${R.stages.map((s, i) => `<div class="col-h"><span>${esc(s.name)}</span><span class="cnt">${perCol[i].n}${perCol[i].bad ? ` · <b>${perCol[i].bad} stopped</b>` : ''}</span></div>`).join('')}</div>`;
    const caret = '<svg class="caret" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>';
    const lanes = B.map((b) => {
      const f = b.flow, isCol = collapsed.has(f.id);
      const state = b.broken
        ? `<span class="state ${b.broken.status === 'late' ? 'warn' : 'bad'}">${b.broken.status === 'late' ? 'Late' : b.broken.status === 'blocked' ? 'Blocked' : 'Stopped'} at ${esc(b.broken.stage.name)} · ${esc((b.broken.fixer || b.broken.sys).owner)}</span>`
        : `<span class="state">${chip('ok')} flowing</span>`;
      const slots = b.cells.map((c, i) => {
        const cut = b.broken && i >= b.broken.col && i < R.stages.length - 1 ? ' cut' : '';
        if (c.na) return `<div class="slot${cut}"><div class="empty">not used</div></div>`;
        const showMsg = ['failed', 'blocked', 'late'].includes(c.status);
        return `<div class="slot${cut}"><button type="button" class="card s-${c.status}${selected === c.key ? ' sel' : ''}" data-key="${esc(c.key)}"
            aria-label="${esc(`${c.sys.name}, ${c.stage.name}, ${f.name}: ${c.status}. Owner ${c.sys.owner}`)}">
          <span class="ttl-row"><span class="ttl">${esc(c.sys.name)}</span>${c.e ? lvl(c.e.security_level) : ''}</span>
          ${showMsg ? `<span class="msg">${esc(c.why)}</span>` : ''}
          <span class="cfoot"><span class="key">${esc(c.sys.id)}</span>${loz(c.status)}<span class="sp"></span>${av(c.sys.owner)}</span>
        </button></div>`;
      }).join('');
      return `<div class="lane${isCol ? ' collapsed' : ''}" data-flow="${esc(f.id)}">
        <button type="button" class="lane-h" aria-expanded="${!isCol}">${caret}<span class="t">${esc(f.name)}</span>
          <span class="m">${esc(f.contract)} · ${esc(every(f.every_min))}</span>${lvl(f.security_level)}${state}</button>
        <div class="lane-row">${slots}</div>
      </div>`;
    }).join('');
    $('#board-grid').innerHTML = head + lanes;
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
    const flowId = key.split('|')[0];
    collapsed.delete(flowId);
    render();
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.focus({ preventScroll: true });
    if (flash) {
      const el = $(`#board-grid .card[data-key="${CSS.escape(key)}"]`);
      if (el) {
        el.classList.add('flash');
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: 'center' });
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
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerOpen()) close(); });

  function renderDrawer(B) {
    const b = selected && B.find((x) => x.cells.some((c) => c.key === selected));
    const c = b && b.cells.find((x) => x.key === selected);
    if (!c) { $('#dr-body').innerHTML = ''; $('#dr-crumb').innerHTML = ''; return; }
    const f = c.flow, who = c.fixer || c.sys;
    const hist = events.filter((e) => e.flow === f.id && e.system_id === c.sys.id).sort((x, y) => Date.parse(y.date) - Date.parse(x.date)).slice(0, 6);
    const headline = {
      ok: 'Running', failed: 'This step failed', blocked: 'Data held back at this step', late: 'This step has gone quiet', waiting: 'Held up earlier in the pipe',
    }[c.status];
    const chain = b.cells.filter((x) => !x.na).map((x) =>
      `<button type="button" class="hop s-${x.status}${x.key === c.key ? ' me' : ''}" data-key="${esc(x.key)}" title="${esc(`${x.sys.name}: ${x.status}`)}">${esc(x.sys.id)}</button>`).join('<span class="arr">→</span>');

    $('#dr-crumb').innerHTML = `${esc(f.name)} / ${esc(c.stage.name)} / <b>${esc(c.sys.id)}</b>`;
    $('#dr-body').innerHTML = `
      <h2 id="dr-title">${esc(c.sys.name)}</h2>
      <div>${loz(c.status)}</div>
      <div class="callout ${c.status}"><b>${esc(headline)}</b>${esc(c.why)}${b.broken && b.broken.key === c.key && b.downstream.length ? ` Stops ${b.downstream.map((d) => esc(d.sys.name)).join(', ')}.` : ''}</div>

      <h4>Where in the pipe</h4>
      <div class="chain">${chain}</div>

      <h4>Details</h4>
      <dl class="fields">
        <dt>Owner</dt><dd>${av(c.sys.owner, true)}<span>${esc(c.sys.owner)}<br><small>${esc(c.sys.team)}</small></span></dd>
        ${c.fixer ? `<dt>Who fixes</dt><dd>${av(who.owner, true)}<span>${esc(who.owner)}<br><small>${esc(who.team)} · sends the data</small></span></dd>` : ''}
        ${c.status === 'waiting' && b.broken ? `<dt>Waiting on</dt><dd>${esc(b.broken.sys.name)} <small>${esc((b.broken.fixer || b.broken.sys).owner)}</small></dd>` : ''}
        <dt>Contract</dt><dd><code>${esc(f.contract)}</code></dd>
        <dt>Runs</dt><dd>${esc(every(f.every_min))}</dd>
        <dt>Data out</dt><dd>${c.e ? lvl(c.e.security_level, true) : '—'}</dd>
        <dt>Cleared for</dt><dd>${lvl(c.sys.clearance, true)} <small>and below</small></dd>
        <dt>Last event</dt><dd>${c.e ? `${esc(hhmm(c.e.date))} <small>${esc(ago(c.e.date))}</small>` : '—'}</dd>
      </dl>

      <h4>Last event received</h4>
      ${c.e ? `<pre class="code">${jsonHtml(strip(c.e), ['status', 'security_level', 'message'])}</pre>` : '<p class="muted">None yet.</p>'}

      <h4>History</h4>
      <ul class="hist">${hist.map((e) => `<li><span class="t">${esc(hhmm(e.date))}</span>${loz(e.status)}${lvl(e.security_level)}<span class="m">${esc(e.message || '')}</span></li>`).join('') || '<li class="muted">No events.</li>'}</ul>`;
    $$('#dr-body .hop').forEach((h) => h.addEventListener('click', () => open(h.dataset.key, true)));
  }

  function renderFeed() {
    const list = [...events].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 40);
    $('#feed-list').innerHTML = list.map((e) => `<li class="${e._new ? 'new' : ''}">
      <span class="t">${esc(hhmm(e.date))}</span>
      <span>${chip(e.status)} <code>${esc(e.system_id)}</code></span>
      <span class="j">${esc(JSON.stringify(strip(e)))}</span>
    </li>`).join('');
    events.forEach((e) => delete e._new);
  }
  const strip = (e) => { const { _new, ...rest } = e; return rest; };

  function renderStatic() {
    $('#schema-json').innerHTML = jsonHtml(strip(events.find((e) => e.system_id === 'INT-01' && e.flow === 'supplier-invoices')));

    $('#examples-grid').innerHTML = EXAMPLES.map((x, i) => `<article class="ex">
      <div class="n">${esc(x.n)}</div>
      <h3>${esc(x.title)}</h3>
      <p>${esc(x.text)}</p>
      <pre class="code" data-json="${i}">${jsonHtml(x.make(), x.mark)}</pre>
      <div class="then">What the platform does</div>
      <ol>${x.then.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
      <div class="foot-row"><button class="btn" type="button" data-ex="${i}">${esc(x.button)}</button><span class="result" data-res="${i}"></span></div>
    </article>`).join('');
    $$('[data-ex]').forEach((btn) => btn.addEventListener('click', () => {
      const i = +btn.dataset.ex, x = EXAMPLES[i];
      if (x.show) { open(x.show, true); return; }
      const e = x.make();
      e._new = true;
      events.push(e);
      $(`[data-res="${i}"]`).textContent = `Sent at ${hhmm(e.date)}. See the panel on the right.`;
      $(`[data-json="${i}"]`).innerHTML = jsonHtml(x.make(), x.mark);
      open(`${e.flow}|${e.system_id === 'INT-01' && e.security_level === 'secret' ? 'D365-FIN' : e.system_id}`, true);
    }));

    $('#levels').innerHTML = `<table>
      <thead><tr><th>Level</th><th>In Finnish</th><th>How it may be passed</th><th>Systems cleared for it</th></tr></thead>
      <tbody>${R.security_levels.map((l) => `<tr>
        <td>${lvl(l.id, true)}</td><td>${esc(l.fi)}</td><td>${esc(l.rule)}</td>
        <td class="small">${R.systems.filter((s) => SEC[s.clearance] >= SEC[l.id]).map((s) => `<code>${esc(s.id)}</code>`).join(' ')}</td>
      </tr>`).join('')}</tbody></table>`;

    $('#legend').innerHTML = ['ok', 'failed', 'blocked', 'late', 'waiting'].map((s) => `<span>${loz(s)}<span class="muted">${{
      ok: 'ran on time', failed: 'reported an error', blocked: 'data too secret for it', late: 'no event in time', waiting: 'held up earlier',
    }[s]}</span></span>`).join('');

    $('#expand-all').addEventListener('click', () => { collapsed.clear(); renderBoard(lastB); });
    $('#collapse-ok').addEventListener('click', () => { lastB.filter((b) => !b.broken).forEach((b) => collapsed.add(b.flow.id)); renderBoard(lastB); });

    $('#reset').addEventListener('click', () => {
      events = seed.map((e) => ({ ...e }));
      $$('[data-res]').forEach((r) => (r.textContent = ''));
      collapsed.clear();
      close();
      $('#board').scrollIntoView();
    });
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
    .catch(() => {
      $('main').innerHTML = `<section class="intro"><h1>Data not loaded</h1>
        <p class="lede">The page reads <code>data/register.json</code> and <code>data/events.json</code>, which browsers block when the file is opened straight from disk. Run <code>python3 -m http.server</code> in the folder and open <code>http://localhost:8000</code>. On GitHub Pages it works as is.</p></section>`;
    });
})();
