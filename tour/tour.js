/* Tour: seven short chapters, scripted so the same thing happens every time you present it. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // theme, shared with the other pages
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
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- timers: every chapter cancels the previous one's ----------
  let timers = [];
  const later = (ms, fn) => { const t = setTimeout(fn, reduced ? Math.min(ms, 60) : ms); timers.push(t); return t; };
  const clearAll = () => { timers.forEach(clearTimeout); timers = []; };

  // ---------- little renderers ----------
  const ICON = {
    source: '<ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2"/>',
    integration: '<path d="M2.5 5.5h9l-2.5-2.5M13.5 10.5h-9l2.5 2.5"/>',
    dynamics: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx=".5"/><rect x="9" y="2.5" width="4.5" height="4.5" rx=".5"/><rect x="2.5" y="9" width="4.5" height="4.5" rx=".5"/><rect x="9" y="9" width="4.5" height="4.5" rx=".5"/>',
    apps: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M2.5 6h11"/>',
    analytics: '<path d="M3.5 13V8.5M8 13V3.5M12.5 13V6.5"/>',
  };
  const ic = (stage) => `<span class="ic ${stage}"><svg viewBox="0 0 16 16" aria-hidden="true">${ICON[stage]}</svg></span>`;
  const teamInitials = (t) => t.replace(/\bteam\b/i, '').trim().split(/[\s&]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || t[0];
  const hue = (t) => [...t].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 6;
  const tav = (t) => `<span class="av team c${hue(t)}" title="${esc(t)}" aria-hidden="true">${esc(teamInitials(t))}</span>`;
  const pav = (n) => `<span class="av c${hue(n)}" title="${esc(n)}" aria-hidden="true">${esc(n.split(' ').map((p) => p[0]).join(''))}</span>`;
  const BOT = '<span class="bot" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 14.5h14M5 18h14"/></svg></span>';
  function json(obj) {
    return esc(JSON.stringify(obj, null, 2)).replace(/(&quot;(?:(?!&quot;).)*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g, (m, str, colon) => {
      if (str) return colon ? `<span class="k">${str}</span>${colon}` : `<span class="s">${str}</span>`;
      return `<span class="n">${m}</span>`;
    });
  }

  // ---------- the one flow the story follows ----------
  const FLOW = [
    { id: 'SRC-INV', name: 'E-invoice operator', stage: 'source', team: 'Finance' },
    { id: 'INT-01', name: 'Integration hub', stage: 'integration', team: 'Integration team' },
    { id: 'D365-FIN', name: 'Dynamics 365 Finance', stage: 'dynamics', team: 'ERP team' },
    { id: 'APP-PRC', name: 'Procurement app', stage: 'apps', team: 'Procurement' },
    { id: 'ANA-01', name: 'Lakehouse', stage: 'analytics', team: 'Data platform' },
    { id: 'ANA-02', name: 'Reporting (BI)', stage: 'analytics', team: 'Data platform' },
  ];
  const ST = { idle: '', passed: 'passed', failed: 'error', waiting: 'waiting', transit: 'on its way' };
  const flowHtml = (states) => `<div class="flow" id="flow"><span class="msg" id="msg" aria-hidden="true"></span><div class="nodes">${FLOW.map((n, i) => `
      <div class="node ${states[i] || 'idle'}" data-i="${i}">
        ${ic(n.stage)}<span class="nm">${esc(n.name)}</span><span class="id">${esc(n.id)}</span>
        <span class="st">${esc(ST[states[i] || 'idle'] || 'not yet')}</span>
      </div>`).join('')}</div></div>`;
  function setNode(i, state) {
    const el = $(`.node[data-i="${i}"]`);
    if (!el) return;
    el.className = `node ${state}`;
    $('.st', el).textContent = ST[state] || 'not yet';
    if (state === 'passed' || state === 'failed') { el.classList.add('pop'); later(260, () => el.classList.remove('pop')); }
  }
  function dotTo(i, bad) {
    const flow = $('#flow'), msg = $('#msg'), el = $(`.node[data-i="${i}"]`);
    if (!flow || !el) return;
    msg.style.left = `${el.offsetLeft + el.offsetWidth / 2}px`;
    msg.style.top = `${el.offsetTop - 10}px`;
    msg.classList.add('on');
    msg.classList.toggle('bad', !!bad);
  }
  const dotOff = () => $('#msg')?.classList.remove('on');

  // simulated clock in the stage header
  let clockMin = 0;
  const fmtClock = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
  const setClock = (m) => { clockMin = m; const c = $('#clk'); if (c) c.textContent = fmtClock(m); };
  const stageHead = (title, m) => `<div class="stage-head"><b>${esc(title)}</b><span class="clock" id="clk">${fmtClock(m)}</span><span class="simtag">Simulated data</span></div>`;
  const evt = (i, status, extra = {}) => ({
    system_id: FLOW[i].id, flow: 'supplier-invoices', run_id: extra.run || 'R-4108',
    source: i ? FLOW[i - 1].id : null, status, date: `2026-11-13T${fmtClock(clockMin)}:${String(10 + i * 7).padStart(2, '0')}+02:00`,
    ...(extra.more || {}),
  });

  // play a message through the flow; stop at `failAt` if given
  function runMessage({ startMin, failAt = -1, run = 'R-4108', onHop, done }) {
    setClock(startMin);
    FLOW.forEach((_, i) => setNode(i, 'idle'));
    let t = 200;
    for (let i = 0; i < FLOW.length; i++) {
      const at = t;
      later(at, () => { dotTo(i, i === failAt); if (i > 0) setNode(i, 'transit'); });
      later(at + 620, () => {
        setClock(startMin + i * 0.7);
        if (i === failAt) {
          setNode(i, 'failed');
          for (let j = i + 1; j < FLOW.length; j++) setNode(j, 'waiting');
          onHop && onHop(i, 'failed', run);
          dotOff();
          done && done();
        } else {
          setNode(i, 'passed');
          onHop && onHop(i, 'ok', run);
        }
      });
      if (i === failAt) return;
      t += 900;
    }
    later(t + 100, () => { dotOff(); done && done(); });
  }

  // ---------- chapters ----------
  const CH = [
    {
      key: 'flow', short: 'One flow', eyebrow: 'Chapter 1 · The idea',
      title: 'This is a data flow',
      text: `<p>Supplier invoices pass through <b>six systems</b> before they show up in a report. Each system sends <b>one small checkpoint</b> when the message passes it. No data, just "it passed me, at this time".</p>
             <p>Put the checkpoints side by side and you can see the message move, and see where it stops.</p>`,
      acts: '<button class="btn primary" data-act="replay">Send another message</button>',
      stage: () => stageHead('Supplier invoices', 180) + flowHtml([]) + `
        <div class="below">
          <div class="panel"><div class="ph">Latest checkpoint <small>what a system sends</small></div><pre id="ev">{ }</pre></div>
          <div class="panel"><div class="ph">Checkpoints received</div><div class="msgs" id="log"></div></div>
        </div>`,
      enter() {
        const play = () => {
          $('#log').innerHTML = '';
          runMessage({
            startMin: 180,
            onHop: (i, status) => {
              $('#ev').innerHTML = json(evt(i, status));
              $('#log').insertAdjacentHTML('beforeend', `<div class="cm fade-in">${tav(FLOW[i].team)}<div><div class="who"><b>${esc(FLOW[i].id)}</b><span>${esc(fmtClock(clockMin))}</span></div><div class="txt">${esc(FLOW[i].name)} passed the message on.</div></div></div>`);
              const log = $('#log'); log.scrollTop = log.scrollHeight;
            },
          });
        };
        play();
        return { replay: play };
      },
    },
    {
      key: 'break', short: 'It breaks', eyebrow: 'Chapter 2 · 03:05',
      title: 'At three in the morning, it breaks',
      text: `<p>The integration hub can't map 112 of the invoices. Everything after it is now <b>waiting</b>.</p>
             <p>Nobody has to notice. The <b>team that owns that step</b> is told in its own channel within minutes, with what went wrong. Whoever is on duty picks it up.</p>
             <p>If nobody does, the team's <b>manager</b> hears next. People change and go on holiday; teams stay, so teams own things.</p>`,
      acts: '<button class="btn primary" data-act="ack">Pick it up as the team</button>',
      stage: () => stageHead('Supplier invoices', 182) + flowHtml([]) + `
        <div class="below">
          <div class="panel"><div class="ph">The checkpoint that failed</div><pre id="ev">{ }</pre></div>
          <div class="panel chan"><div class="ph"><span class="hash">#</span>integration-team <small>team channel</small></div><div class="msgs" id="chan"></div></div>
        </div>`,
      enter() {
        let acked = false, posted = false;
        runMessage({
          startMin: 182, failAt: 1,
          onHop: (i, status) => {
            $('#ev').innerHTML = json(evt(i, status, { more: status === 'failed' ? { message: 'Mapping error: po_number missing in 112 of 2 950 rows' } : {} }));
          },
          done: () => {
            later(700, () => {
              setClock(185);
              posted = true;
              $('#chan').insertAdjacentHTML('beforeend', `<div class="cm fade-in">${BOT}<div><div class="who"><b>Data checkpoints</b><span>03:05</span></div>
                <div class="card"><b>Supplier invoices stopped at Integration hub</b>Mapping error: po_number missing in 112 of 2 950 rows. 4 systems after it are waiting.<div class="muted">Your team owns this step.</div>
                <button class="btn" type="button" data-act="ack">Acknowledge</button></div></div></div>
                <div class="sysline fade-in" id="esc">If nobody acknowledges, manager Noora Ahonen is told at 03:20.</div>`);
              $$('#chan [data-act="ack"]').forEach((b) => b.addEventListener('click', ack));
            });
          },
        });
        function ack() {
          if (acked || !posted) return;
          acked = true;
          setClock(189);
          $$('#chan [data-act="ack"]').forEach((b) => { b.disabled = true; b.textContent = 'Acknowledged'; });
          $('#esc').className = 'sysline ok fade-in';
          $('#esc').textContent = 'Acknowledged by Sami Koivisto at 03:09. The manager does not need to be told.';
          $('#chan').insertAdjacentHTML('beforeend', `<div class="cm fade-in">${pav('Sami Koivisto')}<div><div class="who"><b>Sami Koivisto</b><span>03:09</span></div><div class="txt">On it. Looks like the new OCR template.</div></div></div>`);
        }
        return { ack };
      },
    },
    {
      key: 'impact', short: 'Who is affected', eyebrow: 'Chapter 3 · 03:10',
      title: 'Who else is affected',
      text: `<p>Each contract lists which teams read it, so the platform knows exactly <b>who is affected</b>: the finance team's cost forecast, procurement's app, and the <b>committed cost</b> figure in three reports.</p>
             <p>Those teams get a short heads-up: <b>the data is late, not wrong</b>. Nobody acts on stale numbers, and nobody has to ask what happened.</p>`,
      acts: '<button class="btn primary" data-act="replay">Show it again</button>',
      stage: () => stageHead('Supplier invoices', 190) + flowHtml(['passed', 'failed', 'waiting', 'waiting', 'waiting', 'waiting']) + `
        <div class="impact" id="imp">
          <div class="col"><h4>Stopped at</h4><div class="it bad"><b>Integration hub</b><small>Integration team</small></div></div>
          <div class="col"><h4>Waiting</h4>
            <div class="it"><b>Dynamics 365 Finance</b><small>ERP team</small></div><div class="it"><b>Procurement app</b><small>Procurement</small></div>
            <div class="it"><b>Lakehouse · Reporting</b><small>Data platform</small></div></div>
          <div class="col"><h4>Teams told</h4>
            <div class="it late"><b>Finance</b><small>cost forecast is stale</small></div><div class="it late"><b>Procurement</b><small>open invoices not updated</small></div>
            <div class="it late"><b>Data platform</b><small>nightly load will wait</small></div></div>
          <div class="col"><h4>Business figures</h4>
            <div class="it metric"><b>Committed cost</b><small>approved orders + unmatched invoices</small></div>
            <div class="it metric"><b>3 reports</b><small>Project cost review, Monthly close, Procurement KPIs</small></div></div>
        </div>
        <div class="below" style="grid-template-columns:1fr">
          <div class="panel chan"><div class="ph"><span class="hash">#</span>finance <small>a reading team's channel</small></div><div class="msgs" id="chan" style="min-height:0"></div></div>
        </div>`,
      enter() {
        const play = () => {
          $$('#imp .it').forEach((x) => x.classList.remove('on'));
          $('#chan').innerHTML = '';
          $$('#imp .it').forEach((x, i) => later(250 + i * 260, () => x.classList.add('on')));
          later(250 + $$('#imp .it').length * 260 + 300, () => {
            $('#chan').insertAdjacentHTML('beforeend', `<div class="cm fade-in">${BOT}<div><div class="who"><b>Data checkpoints</b><span>03:10</span></div>
              <div class="card late"><b>Heads-up: supplier invoices are late</b>Your cost forecast and the committed cost figure are not up to date. The integration team is on it. Nothing for you to do yet.</div></div></div>`);
          });
        };
        play();
        return { replay: play };
      },
    },
    {
      key: 'fixed', short: 'Fixed', eyebrow: 'Chapter 4 · 03:38',
      title: 'Fixed, and nobody had to ask',
      text: `<p>The integration team fixes the mapping and the message runs again. Every checkpoint turns green, and the reading teams are told it's current again.</p>
             <p>The history shows exactly <b>when it broke and when it recovered</b>. By the 09:00 meeting there is nothing to discuss.</p>`,
      acts: '<button class="btn primary" data-act="rerun">Run it again</button>',
      stage: () => stageHead('Supplier invoices', 218) + flowHtml(['passed', 'failed', 'waiting', 'waiting', 'waiting', 'waiting']) + `
        <div class="below">
          <div class="panel chan"><div class="ph"><span class="hash">#</span>integration-team</div><div class="msgs" id="chan"></div></div>
          <div class="panel"><div class="ph">Recent messages</div><div class="runs" id="runs"></div></div>
        </div>`,
      enter() {
        const rows = (first) => [
          ...(first ? [['R-4109', '03:38', first]] : []),
          ['R-4108', '03:02', ['ok', 'bad', 'wait', 'wait', 'wait', 'wait']],
          ['R-4107', '02:02', ['ok', 'ok', 'ok', 'ok', 'ok', 'ok']],
          ['R-4106', '01:02', ['ok', 'ok', 'ok', 'ok', 'ok', 'ok']],
        ];
        const drawRuns = (first) => { $('#runs').innerHTML = rows(first).map(([id, t, c]) => `<div class="r"><span class="mono">${id}</span><span class="mono">${t}</span><span class="sqs">${c.map((x) => `<span class="sq ${x === 'ok' ? '' : x}"></span>`).join('')}</span></div>`).join(''); };
        const play = () => {
          $('#chan').innerHTML = `<div class="cm fade-in">${pav('Sami Koivisto')}<div><div class="who"><b>Sami Koivisto</b><span>03:37</span></div><div class="txt">Fixed the mapping for the new OCR template. Running it again.</div></div></div>`;
          drawRuns(null);
          later(600, () => runMessage({
            startMin: 218, run: 'R-4109',
            done: () => {
              setClock(221);
              drawRuns(['ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
              $('#chan').insertAdjacentHTML('beforeend', `<div class="cm fade-in">${BOT}<div><div class="who"><b>Data checkpoints</b><span>03:41</span></div>
                <div class="card ok"><b>Supplier invoices: all 6 checkpoints passed</b>Run R-4109. Finance and Procurement have been told their figures are current again.</div></div></div>`);
            },
          }));
        };
        play();
        return { rerun: play };
      },
    },
    {
      key: 'thirty', short: 'Times thirty', eyebrow: 'Chapter 5 · 09:00',
      title: 'Now times thirty',
      text: `<p>Every data flow works the same way. Here are <b>30 contracts</b> across seven areas, each square one checkpoint.</p>
             <p>At 09:00 two need attention, each already with the team that owns it. Everything else is quiet, and <b>quiet is the point</b>.</p>`,
      acts: '<a class="btn primary" href="../demo/">Explore in the demo</a><a class="btn" href="../landscape/">See the landscape</a>',
      stage: () => stageHead('All contracts', 540) + `<div class="counts" id="counts"></div><div class="thirty" id="thirty"><p class="muted">Loading…</p></div>`,
      enter() {
        Promise.all(['../demo/data/register.json', '../demo/data/simulation.json'].map((u) => fetch(u).then((r) => r.json())))
          .then(([reg, sim]) => {
            const box = $('#thirty');
            if (!box) return;
            const area = Object.fromEntries(reg.areas.map((a) => [a.id, a.name]));
            const special = { 'equipment-rental': { at: 1, kind: 'bad' }, 'site-checkins': { at: 0, kind: 'late' } };
            box.innerHTML = reg.contracts.map((c) => {
              const path = sim.contracts[c.id].path;
              return `<div class="tr${special[c.id] ? ' hot' : ''}" data-c="${esc(c.id)}"><span class="nm">${esc(c.name)}<small>${esc(area[c.area])}</small></span>
                <span class="pips">${path.map(() => '<span class="pip"></span>').join('')}</span></div>`;
            }).join('');
            const rowsEl = $$('#thirty .tr');
            rowsEl.forEach((row, r) => {
              const c = reg.contracts[r], sp = special[c.id];
              $$('.pip', row).forEach((p, i) => later(120 + r * 40 + i * 110, () => {
                if (!sp) p.className = 'pip ok';
                else if (i < sp.at) p.className = 'pip ok';
                else if (i === sp.at) p.className = `pip ${sp.kind}`;
                else p.className = 'pip wait';
              }));
            });
            later(120 + rowsEl.length * 40 + 800, () => {
              $('#counts').innerHTML = `<div><b>28</b>flowing</div><div><b>1</b>late · Site operations told</div><div><b>1</b>red · Integration team told</div>`;
            });
          })
          .catch(() => { const b = $('#thirty'); if (b) b.innerHTML = '<p class="muted">Open this page through a web server to load the 30 contracts.</p>'; });
        return {};
      },
    },
    {
      key: 'add', short: 'Add a system', eyebrow: 'Chapter 6 · Joining',
      title: 'Adding a system takes minutes',
      text: `<p>A team fills in three things: <b>what the system is</b>, <b>which team owns it</b>, and <b>how it can connect</b>. The register entry and the start of the contract are written for them.</p>
             <p>Systems that can only call a URL get a webhook address. Systems that can do nothing get watched. Nobody has to learn a new format.</p>`,
      acts: '<button class="btn primary" data-act="test">Send a test event</button>',
      stage: () => stageHead('Join the platform', 602) + `
        <div class="onb">
          <form class="form" id="onb" onsubmit="return false">
            <label>System name<input name="name" value="Rental partner portal"></label>
            <label>Owning team<input name="team" value="Logistics"></label>
            <label>Team manager<input name="manager" value="Sanna Heikkilä"></label>
            <label>Team channel<input name="channel" value="#logistics"></label>
            <div><div style="font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:6px">How can it connect?</div>
              <div class="ways">
                <label><input type="radio" name="way" value="webhook" checked> Webhook</label>
                <label><input type="radio" name="way" value="api"> API call</label>
                <label><input type="radio" name="way" value="file"> File drop</label>
                <label><input type="radio" name="way" value="hub"> Integration step</label>
              </div></div>
          </form>
          <div style="display:grid;gap:14px;align-content:start">
            <div class="panel"><div class="ph">Register entry <small>written for you</small></div><pre id="regentry"></pre></div>
            <div class="panel"><div class="ph">How it connects</div><div class="conn" id="conn"></div></div>
          </div>
        </div>`,
      enter() {
        const f = $('#onb');
        const slug = (s) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 4) || 'NEW';
        const val = () => Object.fromEntries(new FormData(f).entries());
        let tested = false;
        const draw = () => {
          const v = val(), id = `SRC-${slug(v.name)}`;
          $('#regentry').innerHTML = json({ id, name: v.name, stage: 'source', owner: { team: v.team, manager: v.manager, channel: v.channel }, clearance: 'internal' });
          const how = {
            webhook: `Give the partner this address and secret:<br><code>https://intake.routa.example/hooks/${id}</code><br><code>secret: ••••••••••3f9a</code><br>We map whatever they send. Nothing changes on their side.`,
            api: `Post one small checkpoint per run to:<br><code>POST https://intake.routa.example/checkpoints</code><br>with <code>system_id: ${id}</code>. About ten lines of code.`,
            file: `Drop files where you already do:<br><code>sftp://files.routa.example/in/${id.toLowerCase()}/</code><br>The platform writes a checkpoint when a file lands.`,
            hub: `Nothing to do in the system. The integration team adds one checkpoint step to the integration that carries its data.`,
          }[v.way];
          $('#conn').innerHTML = how + (tested ? `<div class="ok fade-in">✓ First checkpoint received from ${esc(id)} at 10:02. Posted in ${esc(v.channel)}.</div>` : '');
        };
        f.addEventListener('input', () => { tested = false; draw(); });
        draw();
        const test = () => { tested = true; setClock(602); draw(); };
        return { test };
      },
    },
    {
      key: 'takes', short: 'What it takes', eyebrow: 'Chapter 7 · Next',
      title: 'What it takes',
      text: `<p>Four building blocks, each useful on its own. A pilot on <b>three contracts</b> that hurt when they break. And a handful of decisions for architecture.</p>
             <p>Everything is built on open standards, so other tools can read what we produce.</p>`,
      acts: '<a class="btn primary" href="../guide/">How to get here</a><a class="btn" href="../demo/">Open the demo</a>',
      stage: () => stageHead('From prototype to real', 0).replace(/<span class="clock"[^>]*>[^<]*<\/span>/, '').replace(/<span class="simtag">[^<]*<\/span>/, '') + `
        <div class="takes">
          <a href="../guide/#minimal"><span class="n">01</span><b>Register</b><span>Systems and the teams that own them, with a manager and a channel. A spreadsheet is fine.</span></a>
          <a href="../guide/#send"><span class="n">02</span><b>Checkpoints</b><span>One small event per system per message. Many ways in: integration step, webhook, API, file.</span></a>
          <a href="../guide/#manage"><span class="n">03</span><b>Contracts</b><span>One file per data flow in git, in the open ODCS format. Owned by a team, reviewed like code.</span></a>
          <a href="../guide/#expect"><span class="n">04</span><b>Expectations</b><span>When it should arrive. Declared first, learned later, the team decides.</span></a>
        </div>
        <div class="pilot"><b>Pilot: three contracts</b>
          <ul><li>Supplier invoices: the story you just saw</li><li>Worker check-ins: feeds the monthly report to the Tax Administration</li><li>Project budgets: a nightly batch into Dynamics 365</li></ul></div>
        <div class="pilot"><b>Decisions needed</b> <span class="muted" style="font-size:14px">· standards, ways in, where the register lives, security levels, who runs the platform</span>
          <div style="margin-top:8px"><a href="../guide/#decide">See the list in the guide →</a></div></div>`,
      enter() { return {}; },
    },
  ];

  // ---------- navigation ----------
  let cur = 0, actions = {};
  const seen = new Set();
  function go(n) {
    n = Math.max(0, Math.min(CH.length - 1, n));
    clearAll();
    cur = n;
    seen.add(n);
    history.replaceState(null, '', `#${n + 1}`);
    const c = CH[n];
    $('#dots').innerHTML = CH.map((x, i) => `<button type="button" data-go="${i}" ${i === n ? 'aria-current="step"' : ''} class="${seen.has(i) && i !== n ? 'done' : ''}" title="${esc(x.title)}"><span class="n">${i + 1}</span><span class="t">${esc(x.short)}</span></button>`).join('')
      + '<span class="hint"><kbd>←</kbd> <kbd>→</kbd> to move</span>';
    $('#chapter').innerHTML = `<div class="chapter fade-in">
      <div class="story">
        <p class="eyebrow">${esc(c.eyebrow)}</p>
        <h1>${esc(c.title)}</h1>
        ${c.text}
        <div class="acts">${c.acts}</div>
        <div class="pager">
          ${n > 0 ? `<button class="btn" type="button" data-go="${n - 1}">← ${esc(CH[n - 1].short)}</button>` : ''}
          ${n < CH.length - 1 ? `<button class="btn primary next" type="button" data-go="${n + 1}">${esc(CH[n + 1].short)} →</button>` : `<a class="btn primary next" href="../demo/">Open the demo →</a>`}
        </div>
      </div>
      <div class="stage">${c.stage()}</div>
    </div>`;
    document.title = `${c.title} · Routa tour`;
    actions = c.enter() || {};
    $$('#chapter [data-act]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.act] && actions[b.dataset.act]()));
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) { go(+b.dataset.go); window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(cur + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(cur - 1); }
  });
  addEventListener('resize', () => { /* the dot re-positions on its next move */ });
  addEventListener('hashchange', () => { const n = parseInt(location.hash.replace('#', ''), 10); if (Number.isFinite(n) && n - 1 !== cur) go(n - 1); });
  const start = parseInt(location.hash.replace('#', ''), 10);
  go(Number.isFinite(start) ? start - 1 : 0);
})();
