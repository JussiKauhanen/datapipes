/* Routa · data contracts sandbox
   Plain JS, no build step. Reads data/catalog.json; everything else is derived. */
(() => {
  'use strict';

  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('en-GB');
  const num = (n) => (n == null ? '—' : nf.format(n));
  const pct = (n) => (n == null ? '—' : `${n.toFixed(1)} %`);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const href = (path) => `#${path}`;
  const cLink = (c, label) => `<a class="ev" href="${href('/contracts/' + encodeURIComponent(c.id))}">${esc(label ?? c.event)}</a>`;
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
  const nowTs = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const hhmmss = (d) => d.toTimeString().slice(0, 8);
  const short = (name) => { const p = String(name).split(' '); return p.length > 1 ? `${p[0][0]}. ${p.slice(1).join(' ')}` : name; };

  // ---------- theme ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  const savedTheme = store.get('routa-theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $('.theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('routa-theme', next);
  });

  // ---------- catalogue ----------
  let C;
  const ix = { team: {}, system: {}, contract: {}, consumer: {} };

  const SEV = { breach: 3, warn: 2, ok: 1, none: 0 };
  const HEALTH_LABEL = { ok: 'Healthy', warn: 'Warning', breach: 'Breach', none: 'Not live' };
  const healthChip = (h) => `<span class="st ${h}">${HEALTH_LABEL[h]}</span>`;
  const lcChip = (s) => `<span class="lc ${s}">${s}</span>`;
  const piiChip = (p) => (p ? `<span class="pii ${p}">${p}</span>` : '');

  function prepare(data) {
    C = data;
    C.teams.forEach((t) => (ix.team[t.id] = t));
    C.systems.forEach((s) => (ix.system[s.id] = s));
    C.consumers.forEach((k) => (ix.consumer[k.id] = k));
    C.contracts.forEach((c) => {
      ix.contract[c.id] = c;
      const worst = c.issues.reduce((w, i) => (SEV[i.severity] > SEV[w] ? i.severity : w), 'ok');
      c.health = c.status === 'draft' && worst === 'ok' ? 'none' : worst;
      c.piiClass = c.pii || (c.fields.some((f) => f.pii === 'personal') ? 'personal'
        : c.fields.some((f) => f.pii === 'pseudonymised') ? 'pseudonymised' : null);
    });
    C.contracts.forEach((c) => {
      c.readers = [];   // explicit, field-level
      c.tolerant = [];  // read everything as-is
      C.consumers.forEach((k) => {
        if (k.reads[c.id]) c.readers.push({ consumer: k, fields: k.reads[c.id] });
        else if (k.reads['*'] && c.status !== 'draft') c.tolerant.push(k);
      });
    });
  }

  const consumersOf = (c) => [...c.readers.map((r) => r.consumer), ...c.tolerant];
  const contractsReadBy = (k) => C.contracts.filter((c) => k.reads[c.id] || (k.reads['*'] && c.status !== 'draft'));
  const readersOfField = (c, fname) => c.readers.filter((r) => r.fields.includes(fname));
  const teamName = (id) => (id && ix.team[id] ? ix.team[id].name : 'No owner');

  // ---------- validation ----------
  const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function typeOk(f, v) {
    switch (f.type) {
      case 'string': case 'enum': return typeof v === 'string';
      case 'integer': return Number.isInteger(v);
      case 'decimal': return typeof v === 'number' && Number.isFinite(v);
      case 'boolean': return typeof v === 'boolean';
      case 'date': return typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
      case 'timestamp': return typeof v === 'string' && TS_RE.test(v) && !Number.isNaN(Date.parse(v));
      default: return true;
    }
  }
  const showVal = (v) => (typeof v === 'string' ? `"${v}"` : JSON.stringify(v));

  function validate(c, p) {
    const errors = [], warnings = [];
    if (p === null || typeof p !== 'object' || Array.isArray(p)) {
      errors.push({ field: '(payload)', rule: 'type', msg: 'Payload must be a JSON object' });
      return { errors, warnings };
    }
    for (const f of c.fields) {
      const v = p[f.name];
      if (v === undefined || v === null) {
        if (f.required) errors.push({ field: f.name, rule: 'required', msg: 'required field missing' });
        continue;
      }
      if (!typeOk(f, v)) {
        errors.push({ field: f.name, rule: 'type', msg: `expected ${f.type}, got ${showVal(v)}` });
        continue;
      }
      if (f.enum && !f.enum.includes(v)) errors.push({ field: f.name, rule: 'enum', msg: `${showVal(v)} not one of ${f.enum.join(', ')}` });
      if (f.pattern && !new RegExp(f.pattern).test(v)) errors.push({ field: f.name, rule: 'pattern', msg: `${showVal(v)} does not match ${f.pattern}` });
      if (f.min != null && v < f.min) errors.push({ field: f.name, rule: 'min', msg: `${v} is below ${f.min}` });
      if (f.max != null && v > f.max) errors.push({ field: f.name, rule: 'max', msg: `${v} is above ${f.max}` });
    }
    const known = new Set(c.fields.map((f) => f.name));
    Object.keys(p).filter((k) => !known.has(k)).forEach((k) =>
      warnings.push({ field: k, rule: 'unknown', msg: 'not in the contract — readers will ignore it' }));
    return { errors, warnings };
  }

  // ---------- mock payloads ----------
  function genPattern(src) {
    const s = src.replace(/^\^/, '').replace(/\$$/, '');
    let out = '', i = 0;
    while (i < s.length) {
      let chars;
      if (s[i] === '\\' && s[i + 1] === 'd') { chars = '0123456789'; i += 2; }
      else if (s[i] === '\\') { chars = s[i + 1]; i += 2; }
      else if (s[i] === '[') {
        const end = s.indexOf(']', i);
        const body = s.slice(i + 1, end); chars = '';
        for (let j = 0; j < body.length; j++) {
          if (body[j + 1] === '-' && body[j + 2]) {
            for (let k = body.charCodeAt(j); k <= body.charCodeAt(j + 2); k++) chars += String.fromCharCode(k);
            j += 2;
          } else chars += body[j];
        }
        i = end + 1;
      } else { chars = s[i]; i += 1; }
      let n = 1;
      const q = s.slice(i).match(/^\{(\d+)(?:,(\d+))?\}/);
      if (q) { n = q[2] ? rint(+q[1], +q[2]) : +q[1]; i += q[0].length; }
      for (let k = 0; k < n; k++) out += chars.length === 1 ? chars : pick(chars.split(''));
    }
    return out;
  }

  // Plausible ranges for a Finnish November.
  const RANGE = {
    rh_percent: [78, 97, 1], temp_c: [9, 21, 1], temperature_c: [-14, 3, 1], kwh: [4, 85, 2],
    amount_eur: [600, 240000, 2], budget_total_eur: [2.1e6, 48e6, 0], change_eur: [-250000, 420000, 0],
    quantity: [1, 420, 1], price_eur: [189000, 612000, 0], revision: [2, 14], depth_mm: [40, 100],
    workers_on_site: [8, 64], photo_count: [0, 6], units_count: [12, 84],
  };
  const DATE_OFFSET = { start_date: [30, 200], planned_handover: [420, 900], due_date: [14, 60] };
  const TRUE_RATE = { tax_debt_register: 0.04, tax_number_verified: 0.985, delays_reported: 0.2 };

  function genValue(f, ctx) {
    if (f.ref === 'project') return ctx.project.id;
    if (f.ref === 'projectName') return ctx.project.name;
    if (f.ref === 'municipality') return ctx.project.municipality;
    if (f.ref === 'site') return ctx.project.site;
    if (f.ref === 'supplier') return pick(C.suppliers);
    if (f.name === 'business_unit') return ctx.project.unit;
    if (f.samples) return pick(f.samples);
    if (f.enum) return pick(f.enum);
    if (f.pattern) return genPattern(f.pattern);
    const r = RANGE[f.name];
    switch (f.type) {
      case 'integer': return r ? rint(r[0], r[1]) : rint(f.min ?? 0, f.max ?? 100);
      case 'decimal': {
        const [a, b, d] = r || [f.min ?? 0, f.max ?? 1000, 2];
        return +rnd(a, b).toFixed(d);
      }
      case 'boolean': return Math.random() < (TRUE_RATE[f.name] ?? 0.9);
      case 'date': { const o = DATE_OFFSET[f.name]; return o ? addDays(rint(o[0], o[1])) : today(); }
      case 'timestamp': return nowTs();
      default: return f.desc ? 'sample' : '';
    }
  }

  function genPayload(c, opts = {}) {
    const pool = opts.excludeSites ? C.projects.filter((p) => !opts.excludeSites.includes(p.site)) : C.projects;
    const ctx = { project: pick(pool.length ? pool : C.projects) };
    const p = {};
    c.fields.forEach((f) => {
      if (!f.required && Math.random() < 0.15 && !opts.full) return;
      p[f.name] = genValue(f, ctx);
    });
    return p;
  }

  // Realistic faults, the kind that actually show up.
  function breakPayload(c, p, kind) {
    const q = { ...p };
    const reqd = c.fields.filter((f) => f.required);
    const kinds = kind ? [kind] : ['missing', 'type', 'enum', 'pattern'];
    for (let tries = 0; tries < 8; tries++) {
      const k = pick(kinds);
      if (k === 'missing' && reqd.length) { const f = pick(reqd); delete q[f.name]; return { q, kind: k }; }
      if (k === 'type') {
        const f = c.fields.find((x) => x.type === 'decimal' && q[x.name] != null);
        if (f) { q[f.name] = String(q[f.name]).replace('.', ','); return { q, kind: k }; } // decimal comma from a Finnish Excel
      }
      if (k === 'enum') {
        const f = c.fields.find((x) => x.enum && q[x.name] != null);
        if (f) { const v = q[f.name]; q[f.name] = v[0].toUpperCase() + v.slice(1).replace(/_/g, ' '); return { q, kind: k }; }
      }
      if (k === 'pattern') {
        const f = c.fields.find((x) => x.pattern && q[x.name] != null && /-/.test(q[x.name]));
        if (f) { q[f.name] = q[f.name].replace('-', ''); return { q, kind: k }; }
      }
    }
    if (reqd.length) delete q[reqd[0].name];
    return { q, kind: 'missing' };
  }

  // ---------- router ----------
  const view = $('#view');
  let teardown = null;

  function route() {
    if (teardown) { teardown(); teardown = null; }
    const h = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
    const parts = h.split('/').filter(Boolean);
    const top = parts[0] || 'overview';
    $$('.tabs a').forEach((a) => {
      if (a.dataset.route === top) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const rest = parts.slice(1).join('/');
    const r = {
      overview: renderOverview,
      contracts: () => (rest ? renderContract(rest) : renderContracts()),
      lineage: () => renderLineage(rest),
      events: renderEvents,
      owners: renderOwners,
      sandbox: () => renderSandbox(rest),
    }[top] || renderNotFound;
    r();
    const t = $('h1', view);
    document.title = `${t ? t.textContent : 'Routa'} · Routa data contracts`;
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function renderNotFound() {
    view.innerHTML = `<div class="page-head"><div><h1>Not here</h1><p class="lede">Nothing at this address. <a href="#/">Back to the overview</a>.</p></div></div>`;
  }

  // ---------- overview ----------
  function renderOverview() {
    const cs = C.contracts;
    const by = (s) => cs.filter((c) => c.status === s).length;
    const live = cs.filter((c) => c.passRate != null);
    const vol = live.reduce((a, c) => a + c.volume24h, 0);
    const pass = live.reduce((a, c) => a + c.volume24h * c.passRate, 0) / vol;
    const issues = cs.flatMap((c) => c.issues.map((i) => ({ ...i, c })));
    const breaches = issues.filter((i) => i.severity === 'breach').length;
    const unowned = C.consumers.filter((k) => !k.team);
    const usedSystems = new Set(cs.map((c) => c.producer)).size;

    const attention = [
      ...issues.sort((a, b) => SEV[b.severity] - SEV[a.severity]).map((i) => {
        const t = ix.team[i.c.team];
        return `<li>
          <span>${healthChip(i.severity)}</span>
          <span>${cLink(i.c)}<span class="sub mono">${esc(i.check)} · since ${esc(i.since)}</span></span>
          <span class="what">${esc(i.text)}</span>
          <span class="who"><b>${esc(t.name)}</b>${esc(t.owner)} · steward ${esc(t.steward)}</span>
        </li>`;
      }),
      ...unowned.map((k) => `<li>
          <span>${healthChip('breach')}</span>
          <span><a class="ev" href="${href('/lineage/k:' + k.id)}">${esc(k.name)}</a><span class="sub mono">ownership</span></span>
          <span class="what">${esc(k.note)} Reads ${contractsReadBy(k).map((c) => `<code>${esc(c.event)}@${esc(c.version)}</code>`).join(', ')}.</span>
          <span class="who"><b>No owner</b>Needs a named team before sunset</span>
        </li>`),
    ].join('');

    view.innerHTML = `
      <div class="page-head">
        <div>
          <p class="eyebrow">${esc(C.company.name)} · catalogue as of ${esc(C.company.asOf.slice(0, 10))}</p>
          <h1>What flows where, and who answers for it</h1>
          <p class="lede">Every integration is described by a contract: the event's shape, its owner and its promises. Producers, events and consumers sit in one place, so a broken feed or a planned change points straight at the people involved.</p>
        </div>
      </div>

      <div class="titleblock" role="list">
        <div role="listitem"><div class="k">Contracts</div><div class="v">${cs.length}</div><div class="s">${by('active')} active · ${by('draft')} draft · ${by('deprecated')} deprecated</div></div>
        <div role="listitem"><div class="k">Producing systems</div><div class="v">${usedSystems}</div><div class="s">${C.teams.length} owning teams</div></div>
        <div role="listitem"><div class="k">Consumers</div><div class="v">${C.consumers.length}</div><div class="s">${unowned.length} without owner</div></div>
        <div role="listitem"><div class="k">Events, 24 h</div><div class="v">${num(vol)}</div><div class="s">across ${live.length} live contracts</div></div>
        <div role="listitem"><div class="k">Pass rate, 24 h</div><div class="v ${pass < 99 ? 'warn' : ''}">${pct(pass)}</div><div class="s">volume-weighted</div></div>
        <div role="listitem"><div class="k">Open issues</div><div class="v ${breaches ? 'bad' : ''}">${issues.length + unowned.length}</div><div class="s">${breaches + unowned.length} need action now</div></div>
      </div>

      <section class="section">
        <div class="section-head"><h2>Needs attention</h2><span class="hint">Sorted by severity · owner is who gets the call</span></div>
        <ul class="attention">${attention}</ul>
      </section>

      <section class="section">
        <div class="section-head"><h2>How the pieces fit</h2></div>
        <div class="flow">
          <div class="step"><div class="n">01 · CONTRACT</div><h3>Owner writes it down</h3><p>Fields, types, PII class, freshness and volume promises. One file per contract in git, reviewed like code.</p></div>
          <div class="arrow">→</div>
          <div class="step"><div class="n">02 · EVENT</div><h3>Platform checks every event</h3><p>Payloads are validated at the edge. Failures go to the producing team's steward, not to whoever noticed first.</p></div>
          <div class="arrow">→</div>
          <div class="step"><div class="n">03 · CONSUMER</div><h3>Readers register fields</h3><p>Each consumer lists the fields it reads. A proposed change shows exactly which reports break and who to tell.</p></div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>What the sandbox trial should answer</h2><span class="hint">Anonymised data only</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Question</th><th>Where to look here</th></tr></thead>
          <tbody>
            <tr><td>Will owners keep a contract file up to date if it is this small?</td><td><a href="#/contracts/purchase_order.approved.v3">A contract page</a> and its YAML</td></tr>
            <tr><td>Is field-level read registration worth the effort for consumers?</td><td><a href="#/sandbox/invoice.received.v2">Change impact</a> in the sandbox</td></tr>
            <tr><td>Does routing failures to the producing steward shorten time to fix?</td><td><a href="#/events">Event stream</a></td></tr>
            <tr><td>How many integrations have no owner today?</td><td><a href="#/owners">Owners</a> and <a href="#/lineage">lineage</a></td></tr>
          </tbody>
        </table></div>
      </section>`;
  }

  // ---------- contracts list ----------
  const listState = { q: '', status: 'all', team: 'all' };

  function renderContracts() {
    view.innerHTML = `
      <div class="page-head">
        <div><h1>Contracts</h1><p class="lede">One row per contract version. A deprecated version stays listed until its last reader has moved.</p></div>
      </div>
      <div class="filters">
        <input type="search" id="f-q" placeholder="Search event, field or system" value="${esc(listState.q)}" aria-label="Search contracts">
        <div class="seg" role="group" aria-label="Lifecycle">
          ${['all', 'active', 'draft', 'deprecated'].map((s) => `<button type="button" data-s="${s}" aria-pressed="${listState.status === s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}
        </div>
        <select id="f-team" aria-label="Owning team">
          <option value="all">All teams</option>
          ${C.teams.map((t) => `<option value="${t.id}" ${listState.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
        </select>
        <span class="muted small" id="f-count"></span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Event</th><th>Version</th><th>Lifecycle</th><th>Producer · owner</th><th>Health</th>
          <th class="num">Pass, 24 h</th><th class="num">Events, 24 h</th><th class="num">Readers</th>
        </tr></thead>
        <tbody id="rows"></tbody>
      </table></div>`;

    const draw = () => {
      const q = listState.q.trim().toLowerCase();
      const rows = C.contracts.filter((c) => {
        if (listState.status !== 'all' && c.status !== listState.status) return false;
        if (listState.team !== 'all' && c.team !== listState.team) return false;
        if (!q) return true;
        const hay = [c.event, c.description, ix.system[c.producer].name, teamName(c.team), ...c.fields.map((f) => f.name)].join(' ').toLowerCase();
        return hay.includes(q);
      });
      $('#rows').innerHTML = rows.map((c) => `
        <tr class="clickable" data-id="${esc(c.id)}">
          <td>${cLink(c)}<span class="sub">${esc(c.description.split('. ')[0].replace(/\.$/, ''))}.</span></td>
          <td class="mono">${esc(c.version)}</td>
          <td>${lcChip(c.status)}</td>
          <td>${esc(ix.system[c.producer].name)}<span class="sub">${esc(teamName(c.team))}</span></td>
          <td>${healthChip(c.health)}</td>
          <td class="num mono">${pct(c.passRate)}</td>
          <td class="num mono">${c.status === 'draft' ? '—' : num(c.volume24h)}</td>
          <td class="num mono">${c.readers.length}${c.tolerant.length ? ` <span class="muted">+${c.tolerant.length}</span>` : ''}</td>
        </tr>`).join('') || `<tr><td colspan="8" class="muted">No contract matches.</td></tr>`;
      $('#f-count').textContent = `${rows.length} of ${C.contracts.length}`;
    };
    draw();
    $('#f-q').addEventListener('input', (e) => { listState.q = e.target.value; draw(); });
    $('#f-team').addEventListener('change', (e) => { listState.team = e.target.value; draw(); });
    $$('.seg button', view).forEach((b) => b.addEventListener('click', () => {
      listState.status = b.dataset.s;
      $$('.seg button', view).forEach((x) => x.setAttribute('aria-pressed', x === b));
      draw();
    }));
    $('#rows').addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const tr = e.target.closest('tr[data-id]');
      if (tr) location.hash = '/contracts/' + encodeURIComponent(tr.dataset.id);
    });
  }

  // ---------- contract detail ----------
  function checksFor(c) {
    const st = (check) => {
      if (c.status === 'draft') return 'none';
      const i = c.issues.find((x) => x.check === check);
      return i ? i.severity : 'ok';
    };
    const base = [
      { ck: 'schema', text: `Payload conforms to ${c.version}`, s: st('schema') },
      { ck: 'freshness', text: `Lands within ${c.sla.freshness}`, s: st('freshness') },
      { ck: 'volume', text: `Volume ${c.sla.volume}`, s: st('volume') },
    ];
    c.issues.filter((i) => !['schema', 'freshness', 'volume'].includes(i.check))
      .forEach((i) => base.push({ ck: i.check, text: i.check === 'lifecycle' ? `Sunset ${c.sunset}` : 'Review', s: i.severity }));
    return base;
  }

  function constraintText(f) {
    const parts = [];
    if (f.enum) parts.push(f.enum.join(' | '));
    if (f.pattern) parts.push(f.pattern);
    if (f.min != null && f.max != null) parts.push(`${f.min} … ${f.max}`);
    else if (f.min != null) parts.push(`≥ ${f.min}`);
    else if (f.max != null) parts.push(`≤ ${f.max}`);
    return parts.join('<br>');
  }

  function renderContract(id) {
    const c = ix.contract[id];
    if (!c) return renderNotFound();
    const t = ix.team[c.team];
    const sys = ix.system[c.producer];
    const others = C.contracts.filter((x) => x.event === c.event && x.id !== c.id);

    const fieldRows = c.fields.map((f) => {
      const rs = readersOfField(c, f.name);
      return `<tr>
        <td><span class="fieldname">${esc(f.name)}</span> ${f.required ? '<span class="req" title="required">REQ</span>' : ''}<span class="sub">${esc(f.desc)}</span></td>
        <td class="mono small">${esc(f.type)}</td>
        <td class="constraint">${esc(constraintText(f)).replace(/&lt;br&gt;/g, '<br>')}</td>
        <td>${piiChip(f.pii)}</td>
        <td>${rs.map((r) => `<a class="chip ${r.consumer.team ? '' : 'unowned'}" href="${href('/lineage/k:' + r.consumer.id)}">${esc(r.consumer.name)}</a>`).join('') || '<span class="muted small">no registered reader</span>'}</td>
      </tr>`;
    }).join('');

    const consumerRows = [
      ...c.readers.map((r) => `<tr>
        <td>${esc(r.consumer.name)}<span class="sub">${r.consumer.team ? esc(teamName(r.consumer.team)) + ' · ' + esc(ix.team[r.consumer.team].owner) : '<span style="color:var(--bad)">No owner</span>'}</span></td>
        <td class="num mono">${r.fields.length}/${c.fields.length}</td></tr>`),
      ...c.tolerant.map((k) => `<tr><td>${esc(k.name)}<span class="sub">${esc(teamName(k.team))} · tolerant reader</span></td><td class="num mono">all</td></tr>`),
    ].join('') || `<tr><td colspan="2" class="muted">No consumers yet.</td></tr>`;

    view.innerHTML = `
      <div class="crumbs"><a href="#/contracts">Contracts</a> / ${esc(c.event)}</div>
      <div class="detail-title">
        <h1>${esc(c.event)}</h1><span class="ver">v${esc(c.version)}</span>${lcChip(c.status)}${healthChip(c.health)}
      </div>
      <p class="lede" style="max-width:78ch;color:var(--ink-2);margin:10px 0 0">${esc(c.description)}</p>
      ${others.length ? `<p class="small muted" style="margin:6px 0 0">Other versions: ${others.map((o) => cLink(o, `v${o.version} (${o.status})`)).join(', ')}</p>` : ''}
      ${c.issues.map((i) => `<div class="issue ${i.severity}"><b>${esc(i.check)}</b>${esc(i.text)} <span class="muted">Since ${esc(i.since)}.</span></div>`).join('')}

      <div class="meta">
        <div><div class="k">Producer</div><div class="v">${esc(sys.name)}<small>${esc(sys.note)}</small></div></div>
        <div><div class="k">Owning team</div><div class="v">${esc(t.name)}<small>${esc(t.owner)}, ${esc(t.ownerRole.toLowerCase())}</small></div></div>
        <div><div class="k">Technical steward</div><div class="v">${esc(t.steward)}<small>Gets validation alerts</small></div></div>
        <div><div class="k">Channel</div><div class="v mono small">${esc(c.channel)}</div></div>
        <div><div class="k">Freshness</div><div class="v">${esc(c.sla.freshness)}</div></div>
        <div><div class="k">Volume</div><div class="v">${esc(c.sla.volume)}</div></div>
        <div><div class="k">Personal data</div><div class="v">${c.piiClass ? piiChip(c.piiClass) : 'None'}</div></div>
        <div><div class="k">Last 24 h</div><div class="v">${c.status === 'draft' ? 'Not live' : `${num(c.volume24h)} events · ${pct(c.passRate)} pass`}</div></div>
      </div>

      <div class="row" style="margin-top:14px">
        <a class="btn" href="${href('/sandbox/' + encodeURIComponent(c.id))}">Test a payload or a change</a>
        <a class="btn ghost" href="${href('/lineage/c:' + encodeURIComponent(c.id))}">Show in lineage</a>
      </div>

      <div class="cols-2 section">
        <div>
          <div class="section-head" style="margin-bottom:10px"><h2>Fields</h2><span class="hint">${c.fields.length} fields · ${c.fields.filter((f) => f.required).length} required</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Field</th><th>Type</th><th>Constraint</th><th>PII</th><th>Read by</th></tr></thead>
            <tbody>${fieldRows}</tbody>
          </table></div>
        </div>
        <div>
          <div class="section-head" style="margin-bottom:10px"><h2>Checks</h2></div>
          <ul class="checks">${checksFor(c).map((k) => `<li><span class="ck">${esc(k.ck)}</span><span style="flex:1">${esc(k.text)}</span>${healthChip(k.s)}</li>`).join('')}</ul>

          <div class="section-head" style="margin:26px 0 10px"><h2>Consumers</h2><span class="hint">fields read</span></div>
          <div class="table-wrap"><table><tbody>${consumerRows}</tbody></table></div>

          <div class="section-head" style="margin:26px 0 4px"><h2>Changelog</h2></div>
          <ul class="log">${c.changelog.map((l) => `<li><span class="mono">${esc(l.version)}</span><span class="mono muted">${esc(l.date)}</span><span>${esc(l.note)}</span></li>`).join('')}</ul>
        </div>
      </div>

      <details class="yaml section">
        <summary>The contract as it would sit in git — <code>contracts/${esc(c.id)}.yaml</code></summary>
        <pre class="code">${yamlHtml(toYaml(c))}</pre>
      </details>`;
  }

  function yq(v) {
    if (typeof v !== 'string') return String(v);
    return /^[\w .,()–\-\/≈·]+$/.test(v) && !/^\d/.test(v) && !/^(true|false|null|yes|no)$/i.test(v) ? v : JSON.stringify(v);
  }
  function toYaml(c) {
    const t = ix.team[c.team];
    const L = [
      `# contracts/${c.id}.yaml`,
      `id: ${c.id}`, `event: ${c.event}`, `version: ${yq(c.version)}`, `status: ${c.status}`,
      ...(c.sunset ? [`sunset: ${yq(c.sunset)}`] : []),
      'owner:', `  team: ${yq(t.name)}`, `  business_owner: ${yq(t.owner)}`, `  steward: ${yq(t.steward)}`,
      `producer: ${yq(ix.system[c.producer].name)}`, `channel: ${yq(c.channel)}`,
      'sla:', `  freshness: ${yq(c.sla.freshness)}`, `  volume: ${yq(c.sla.volume)}`,
      'fields:',
    ];
    c.fields.forEach((f) => {
      L.push(`  - name: ${f.name}`, `    type: ${f.type}`, `    required: ${f.required}`);
      if (f.enum) L.push(`    enum: [${f.enum.join(', ')}]`);
      if (f.pattern) L.push(`    pattern: ${JSON.stringify(f.pattern)}`);
      if (f.min != null) L.push(`    min: ${f.min}`);
      if (f.max != null) L.push(`    max: ${f.max}`);
      if (f.pii) L.push(`    pii: ${f.pii}`);
      L.push(`    description: ${yq(f.desc)}`);
    });
    if (c.readers.length) {
      L.push('# readers register themselves in their own repo; shown here for reference', 'readers:');
      c.readers.forEach((r) => L.push(`  ${r.consumer.id}: [${r.fields.join(', ')}]`));
    }
    return L.join('\n');
  }
  function yamlHtml(s) {
    return esc(s).split('\n').map((line) => {
      if (/^\s*#/.test(line)) return `<span class="y-c">${line}</span>`;
      return line.replace(/^(\s*-?\s*)([a-z_]+)(:)/, '$1<span class="y-k">$2</span>$3');
    }).join('\n');
  }

  // ---------- lineage ----------
  function renderLineage(sel) {
    const systems = C.systems.filter((s) => C.contracts.some((c) => c.producer === s.id));
    const contracts = systems.flatMap((s) => C.contracts.filter((c) => c.producer === s.id));
    const cIndex = new Map(contracts.map((c, i) => [c.id, i]));
    const consumers = [...C.consumers].sort((a, b) => {
      const bar = (k) => { const xs = contractsReadBy(k).map((c) => cIndex.get(c.id)); return xs.reduce((x, y) => x + y, 0) / (xs.length || 1); };
      if (a.reads['*']) return 1; if (b.reads['*']) return -1;
      return bar(a) - bar(b);
    });

    const W = 980, rowH = 40, boxH = 30, top = 44;
    const cols = [{ x: 14, w: 200 }, { x: 330, w: 290 }, { x: 750, w: 216 }];
    const maxN = Math.max(systems.length, contracts.length, consumers.length);
    const H = top + maxN * rowH + 8;
    const place = (list, col) => {
      const off = top + ((maxN - list.length) * rowH) / 2;
      return list.map((item, i) => ({ item, col, x: cols[col].x, w: cols[col].w, y: off + i * rowH }));
    };
    const nodes = [
      ...place(systems, 0).map((n) => ({ ...n, key: 's:' + n.item.id })),
      ...place(contracts, 1).map((n) => ({ ...n, key: 'c:' + n.item.id })),
      ...place(consumers, 2).map((n) => ({ ...n, key: 'k:' + n.item.id })),
    ];
    const N = Object.fromEntries(nodes.map((n) => [n.key, n]));
    const edges = [];
    contracts.forEach((c) => {
      edges.push({ a: 's:' + c.producer, b: 'c:' + c.id, draft: c.status === 'draft' });
      consumersOf(c).forEach((k) => edges.push({ a: 'c:' + c.id, b: 'k:' + k.id, draft: c.status === 'draft' || c.status === 'deprecated' }));
    });

    const path = (e) => {
      const A = N[e.a], B = N[e.b];
      const x1 = A.x + A.w, y1 = A.y + boxH / 2, x2 = B.x, y2 = B.y + boxH / 2, dx = (x2 - x1) / 2;
      return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
    };
    const barColor = (h) => ({ ok: 'var(--ok)', warn: 'var(--warn)', breach: 'var(--bad)', none: 'var(--ink-3)' }[h]);

    const nodeSvg = (n) => {
      if (n.col === 0) {
        return `<g class="g-node" data-key="${n.key}" tabindex="0" role="button" aria-label="System ${esc(n.item.name)}">
          <rect class="box" x="${n.x}" y="${n.y}" width="${n.w}" height="${boxH}"/>
          <text x="${n.x + 10}" y="${n.y + 19}">${esc(n.item.name)}</text></g>`;
      }
      if (n.col === 1) {
        const c = n.item;
        return `<g class="g-node ${c.status}" data-key="${n.key}" tabindex="0" role="button" aria-label="Contract ${esc(c.event)} ${esc(c.version)}">
          <rect class="box" x="${n.x}" y="${n.y}" width="${n.w}" height="${boxH}"/>
          <rect class="bar" x="${n.x}" y="${n.y}" width="4" height="${boxH}" fill="${barColor(c.health)}"/>
          <text class="mono" x="${n.x + 12}" y="${n.y + 19}">${esc(c.event)}</text>
          <text class="mono" x="${n.x + n.w - 8}" y="${n.y + 19}" text-anchor="end" style="fill:var(--ink-3)">${esc(c.version.split('.')[0] === '0' ? c.version : 'v' + c.version.split('.')[0])}</text></g>`;
      }
      const k = n.item;
      return `<g class="g-node ${k.team ? '' : 'unowned'}" data-key="${n.key}" tabindex="0" role="button" aria-label="Consumer ${esc(k.name)}">
        <rect class="box" x="${n.x}" y="${n.y}" width="${n.w}" height="${boxH}"/>
        <text x="${n.x + 10}" y="${n.y + 19}">${esc(k.name.length > 30 ? k.name.slice(0, 29) + '…' : k.name)}</text></g>`;
    };

    view.innerHTML = `
      <div class="page-head">
        <div><h1>Lineage</h1><p class="lede">Systems on the left, contracts in the middle, consumers on the right. Pick any box to trace what it feeds and what feeds it.</p></div>
      </div>
      <div class="lineage-layout">
        <div>
          <div class="graph-wrap">
            <svg id="graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lineage graph">
              <text class="colhead" x="${cols[0].x}" y="24">Producing system</text>
              <text class="colhead" x="${cols[1].x}" y="24">Contract</text>
              <text class="colhead" x="${cols[2].x}" y="24">Consumer</text>
              <g>${edges.map((e, i) => `<path class="g-edge ${e.draft ? 'draft' : ''}" data-i="${i}" d="${path(e)}"/>`).join('')}</g>
              <g>${nodes.map(nodeSvg).join('')}</g>
            </svg>
          </div>
          <div class="legend">
            <span><i></i> live flow</span><span><i class="d"></i> draft or deprecated</span><span><i class="h"></i> traced path</span>
            <span><span class="st ok"></span>health bar on contracts</span>
          </div>
        </div>
        <aside class="side" id="side" aria-live="polite"></aside>
      </div>`;

    const svg = $('#graph');
    const side = $('#side');
    const defaultSide = () => `
      <div class="kind">Lineage</div><h3>Nothing selected</h3>
      <p class="small muted">Click or tab to a box. Try the <a href="#/lineage/k:xlsx">Excel export</a> on the right, or <a href="#/lineage/s:erp">the ERP</a> on the left.</p>
      <dl><dt>In this view</dt><dd>${systems.length} systems · ${contracts.length} contracts · ${consumers.length} consumers · ${edges.length} flows</dd></dl>`;

    function select(key) {
      $$('.g-node', svg).forEach((g) => g.classList.remove('sel', 'lit'));
      $$('.g-edge', svg).forEach((p) => p.classList.remove('hot'));
      if (!key || !N[key]) { svg.classList.remove('focus'); side.innerHTML = defaultSide(); return; }
      const lit = new Set([key]);
      const hot = new Set();
      const [kind, id] = [key.slice(0, 1), key.slice(2)];
      const mark = (pred) => edges.forEach((e, i) => { if (pred(e)) { hot.add(i); lit.add(e.a); lit.add(e.b); } });
      if (kind === 's') {
        const cs = new Set(contracts.filter((c) => c.producer === id).map((c) => 'c:' + c.id));
        mark((e) => e.a === key || cs.has(e.a));
      } else if (kind === 'c') {
        mark((e) => e.a === key || e.b === key);
      } else {
        const cs = new Set(edges.filter((e) => e.b === key).map((e) => e.a));
        mark((e) => e.b === key || cs.has(e.b));
      }
      svg.classList.add('focus');
      lit.forEach((k) => svg.querySelector(`[data-key="${CSS.escape(k)}"]`)?.classList.add('lit'));
      svg.querySelector(`[data-key="${CSS.escape(key)}"]`)?.classList.add('sel');
      hot.forEach((i) => svg.querySelector(`.g-edge[data-i="${i}"]`).classList.add('hot'));
      side.innerHTML = sideFor(kind, id);
    }

    function sideFor(kind, id) {
      if (kind === 's') {
        const s = ix.system[id], t = ix.team[s.team];
        const cs = contracts.filter((c) => c.producer === id);
        const ks = [...new Set(cs.flatMap(consumersOf))];
        return `<div class="kind">Producing system</div><h3>${esc(s.name)}</h3><p class="small muted">${esc(s.note)}</p>
          <dl><dt>Owner</dt><dd>${esc(t.name)} · ${esc(t.owner)}</dd>
          <dt>Publishes</dt><dd>${cs.map((c) => cLink(c, `${c.event} ${c.version}`)).join('<br>')}</dd>
          <dt>Reaches</dt><dd>${ks.length} consumers</dd></dl>`;
      }
      if (kind === 'c') {
        const c = ix.contract[id], t = ix.team[c.team];
        return `<div class="kind">Contract · ${esc(c.status)}</div><h3 class="mono">${esc(c.event)} <span class="muted">${esc(c.version)}</span></h3>
          <p>${healthChip(c.health)}</p><p class="small muted">${esc(c.description)}</p>
          <dl><dt>Owner</dt><dd>${esc(t.name)} · ${esc(t.owner)}</dd>
          <dt>Read by</dt><dd>${consumersOf(c).map((k) => esc(k.name)).join('<br>') || '—'}</dd></dl>
          <p style="margin-top:14px">${cLink(c, 'Open contract →')}</p>`;
      }
      const k = ix.consumer[id], t = ix.team[k.team];
      const cs = contractsReadBy(k);
      return `<div class="kind">Consumer</div><h3>${esc(k.name)}</h3><p class="small muted">${esc(k.note)}</p>
        <dl><dt>Owner</dt><dd>${t ? `${esc(t.name)} · ${esc(t.owner)}` : '<span class="st breach">No owner</span>'}</dd>
        <dt>Depends on</dt><dd>${cs.map((c) => `${cLink(c, c.event)} <span class="muted mono small">${esc(c.version)}</span>${c.status === 'deprecated' ? ` <span class="lc deprecated">sunset ${esc(c.sunset)}</span>` : ''}`).join('<br>')}</dd>
        <dt>Upstream systems</dt><dd>${[...new Set(cs.map((c) => ix.system[c.producer].name))].map(esc).join(', ')}</dd></dl>`;
    }

    const go = (key) => { history.replaceState(null, '', '#/lineage' + (key ? '/' + encodeURIComponent(key) : '')); select(key); };
    let current = sel && N[sel] ? sel : null;
    svg.addEventListener('click', (e) => {
      const g = e.target.closest('.g-node');
      current = g && g.dataset.key !== current ? g.dataset.key : null;
      go(current);
    });
    svg.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.g-node')) {
        e.preventDefault(); current = e.target.closest('.g-node').dataset.key; go(current);
      }
      if (e.key === 'Escape') { current = null; go(null); }
    });
    select(current);
  }

  // ---------- event stream ----------
  const stream = { rows: [], total: 0, ok: 0, fail: 0, seq: 0, paused: false, speed: 1, onlyFail: false, filter: 'all', injectNext: false, selected: null };

  function nextEvent() {
    const live = C.contracts.filter((c) => c.status !== 'draft' && c.volume24h > 0);
    const weights = live.map((c) => Math.sqrt(c.volume24h));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0), c = live[0];
    for (let i = 0; i < live.length; i++) { r -= weights[i]; if (r <= 0) { c = live[i]; break; } }

    // Mirror the catalogue's story: S-1042 gate is offline; invoices lose po_number.
    let payload = genPayload(c, c.id === 'site.worker.checked_in.v2' ? { excludeSites: ['S-1042'] } : {});
    let fault = null;
    if (stream.injectNext) { ({ q: payload, kind: fault } = breakPayload(c, payload)); stream.injectNext = false; }
    else if (c.id === 'invoice.received.v2' && Math.random() < 0.06) { delete payload.po_number; fault = 'missing'; }
    else if (Math.random() < 0.012) ({ q: payload, kind: fault } = breakPayload(c, payload));

    const res = validate(c, payload);
    const ev = { seq: ++stream.seq, at: new Date(), c, payload, res, ok: res.errors.length === 0 };
    stream.total++; ev.ok ? stream.ok++ : stream.fail++;
    stream.rows.unshift(ev);
    if (stream.rows.length > 200) stream.rows.length = 200;
    return ev;
  }

  function renderEvents() {
    view.innerHTML = `
      <div class="page-head">
        <div><h1>Event stream</h1><p class="lede">Simulated traffic, validated in your browser against the contracts. A failed event is routed to the producing team's steward. The two live issues from the catalogue are reproduced: invoices sometimes lose <code>po_number</code>, and site S‑1042 sends no check-ins.</p></div>
      </div>
      <div class="stream-bar" id="sbar">
        <button class="btn" id="s-pause" type="button"></button>
        <div class="seg" role="group" aria-label="Speed">
          <button type="button" data-sp="1" aria-pressed="${stream.speed === 1}">1×</button>
          <button type="button" data-sp="4" aria-pressed="${stream.speed === 4}">4×</button>
        </div>
        <select id="s-filter" aria-label="Filter by contract">
          <option value="all">All contracts</option>
          ${C.contracts.filter((c) => c.status !== 'draft').map((c) => `<option value="${esc(c.id)}" ${stream.filter === c.id ? 'selected' : ''}>${esc(c.event)} ${esc(c.version)}</option>`).join('')}
        </select>
        <label class="small"><input type="checkbox" id="s-fail" ${stream.onlyFail ? 'checked' : ''}> Failures only</label>
        <button class="btn ghost" id="s-inject" type="button">Send a bad event</button>
        <div class="counter">
          <div><div class="k">Seen</div><div class="v" id="c-total">0</div></div>
          <div><div class="k">Passed</div><div class="v" id="c-ok">0</div></div>
          <div><div class="k">Failed</div><div class="v" id="c-fail" style="color:var(--bad)">0</div></div>
          <div><div class="k">Pass rate</div><div class="v" id="c-rate">—</div></div>
        </div>
      </div>
      <div class="table-wrap"><table class="stream">
        <thead><tr><th>Time</th><th>Event</th><th>Result</th><th>Detail</th><th>Routed to</th></tr></thead>
        <tbody id="s-rows"></tbody>
      </table></div>
      <div class="inspect" id="s-inspect"></div>`;

    const bar = $('#sbar');
    const draw = (freshSeq) => {
      $('#s-pause').innerHTML = stream.paused ? 'Resume' : '<span class="dot-live"></span>Pause';
      bar.classList.toggle('paused', stream.paused);
      $('#c-total').textContent = num(stream.total);
      $('#c-ok').textContent = num(stream.ok);
      $('#c-fail').textContent = num(stream.fail);
      $('#c-rate').textContent = stream.total ? pct((stream.ok / stream.total) * 100) : '—';
      const rows = stream.rows.filter((e) => (stream.filter === 'all' || e.c.id === stream.filter) && (!stream.onlyFail || !e.ok)).slice(0, 40);
      $('#s-rows').innerHTML = rows.map((e) => {
        const t = ix.team[e.c.team];
        return `<tr class="clickable ${e.ok ? '' : 'fail'} ${e.seq === freshSeq ? 'new' : ''}" data-seq="${e.seq}">
          <td class="t">${hhmmss(e.at)}</td>
          <td><span class="mono" style="font-size:13px;font-weight:500">${esc(e.c.event)}</span><span class="sub">${esc(ix.system[e.c.producer].name)} · v${esc(e.c.version)}</span></td>
          <td>${e.ok ? '<span class="st ok">pass</span>' : '<span class="st breach">reject</span>'}</td>
          <td>${e.ok ? `<div class="payload">${esc(JSON.stringify(e.payload))}</div>` : e.res.errors.map((x) => `<div class="err">${esc(x.field)}: ${esc(x.msg)}</div>`).join('')}</td>
          <td class="small">${e.ok ? '<span class="muted">—</span>' : `${esc(short(t.steward))}<span class="sub">${esc(t.name)}</span>`}</td>
        </tr>`;
      }).join('') || `<tr><td colspan="5" class="muted">Waiting for events…</td></tr>`;
    };
    const inspect = (seq) => {
      const e = stream.rows.find((x) => x.seq === seq);
      if (!e) { $('#s-inspect').innerHTML = ''; return; }
      const t = ix.team[e.c.team];
      const envelope = { event_id: `evt_${String(e.seq).padStart(6, '0')}`, event: e.c.event, schema_version: e.c.version, producer: e.c.producer, occurred_at: e.at.toISOString().replace(/\.\d{3}Z$/, 'Z'), payload: e.payload };
      $('#s-inspect').innerHTML = `
        <div class="section-head" style="margin:10px 0 10px"><h2>Event ${esc(envelope.event_id)}</h2><span class="hint">${cLink(e.c, 'contract →')}</span></div>
        <div class="sb-grid">
          <pre class="code">${esc(JSON.stringify(envelope, null, 2))}</pre>
          <div class="verdict ${e.ok ? 'pass' : 'fail'}" style="margin-top:0">
            <h3>${e.ok ? 'Accepted' : 'Rejected at the edge'}</h3>
            ${e.ok ? `<p class="small">All ${e.c.fields.length} fields conform to v${esc(e.c.version)}. Delivered to ${consumersOf(e.c).length} consumers.</p>`
              : `<ul>${e.res.errors.map((x) => `<li><code>${esc(x.field)}</code> — ${esc(x.rule)}: ${esc(x.msg)}</li>`).join('')}</ul>
                 <p class="small" style="margin-top:12px">Parked in the dead-letter queue. Alert sent to <b>${esc(t.steward)}</b> (${esc(t.name)}). Not delivered to: ${consumersOf(e.c).map((k) => esc(k.name)).join(', ')}.</p>`}
          </div>
        </div>`;
    };

    let timer = null;
    const schedule = () => {
      clearTimeout(timer);
      if (stream.paused) return;
      timer = setTimeout(() => { const e = nextEvent(); draw(e.seq); schedule(); }, rint(500, 1400) / stream.speed);
    };

    if (!stream.rows.length) for (let i = 0; i < 14; i++) { const e = nextEvent(); e.at = new Date(Date.now() - (14 - i) * 900); }
    stream.rows.sort((a, b) => b.at - a.at);
    draw();
    if (stream.selected) inspect(stream.selected);
    schedule();

    $('#s-pause').addEventListener('click', () => { stream.paused = !stream.paused; draw(); schedule(); });
    $$('[data-sp]', bar).forEach((b) => b.addEventListener('click', () => {
      stream.speed = +b.dataset.sp; $$('[data-sp]', bar).forEach((x) => x.setAttribute('aria-pressed', x === b)); schedule();
    }));
    $('#s-filter').addEventListener('change', (e) => { stream.filter = e.target.value; draw(); });
    $('#s-fail').addEventListener('change', (e) => { stream.onlyFail = e.target.checked; draw(); });
    $('#s-inject').addEventListener('click', () => {
      stream.injectNext = true;
      const e = nextEvent(); draw(e.seq); stream.selected = e.seq; inspect(e.seq);
    });
    $('#s-rows').addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr[data-seq]'); if (!tr) return;
      stream.selected = +tr.dataset.seq; inspect(stream.selected);
      if (!stream.paused) { stream.paused = true; draw(); schedule(); }
    });
    teardown = () => clearTimeout(timer);
  }

  // ---------- owners ----------
  function renderOwners() {
    const card = (t) => {
      const produces = C.contracts.filter((c) => c.team === t.id);
      const owns = C.consumers.filter((k) => k.team === t.id);
      const systems = C.systems.filter((s) => s.team === t.id);
      const open = produces.reduce((a, c) => a + c.issues.length, 0);
      return `<div class="owner-card">
        <h3><span>${esc(t.name)}</span>${open ? healthChip(produces.some((c) => c.health === 'breach') ? 'breach' : 'warn') : healthChip('ok')}</h3>
        <div class="people">
          <div><div class="k">Business owner</div>${esc(t.owner)}<small>${esc(t.ownerRole)}</small></div>
          <div><div class="k">Steward</div>${esc(t.steward)}<small>Alerts &amp; schema changes</small></div>
        </div>
        ${systems.length ? `<div class="grp">Systems</div><div>${systems.map((s) => `<a class="chip" href="${href('/lineage/s:' + s.id)}">${esc(s.name)}</a>`).join('')}</div>` : ''}
        <div class="grp">Publishes</div>
        <div>${produces.map((c) => `<a class="chip" href="${href('/contracts/' + encodeURIComponent(c.id))}" title="${esc(c.status)}">${esc(c.event)} ${esc(c.version.split('.')[0] === '0' ? c.version : 'v' + c.version.split('.')[0])}</a>`).join('') || '<span class="muted small">Nothing</span>'}</div>
        <div class="grp">Consumes</div>
        <div>${owns.map((k) => `<a class="chip" href="${href('/lineage/k:' + k.id)}">${esc(k.name)}</a>`).join('') || '<span class="muted small">Nothing</span>'}</div>
      </div>`;
    };
    const unowned = C.consumers.filter((k) => !k.team);
    view.innerHTML = `
      <div class="page-head">
        <div><h1>Owners</h1><p class="lede">Each contract has one owning team. The business owner answers for what the data means; the steward answers for the feed and for announcing changes.</p></div>
      </div>
      <div class="owner-grid">
        ${C.teams.map(card).join('')}
        ${unowned.map((k) => `<div class="owner-card unowned">
          <h3><span>${esc(k.name)}</span>${healthChip('breach')}</h3>
          <p class="small" style="margin:8px 0 10px">${esc(k.note)}</p>
          <div class="grp">Depends on</div>
          <div>${contractsReadBy(k).map((c) => `<a class="chip" href="${href('/contracts/' + encodeURIComponent(c.id))}">${esc(c.event)} ${esc(c.version)} · sunset ${esc(c.sunset || '—')}</a>`).join('')}</div>
          <div class="grp">Decision needed</div>
          <p class="small" style="margin:0">Adopt and migrate to v3, or retire. Without either, three site offices lose their report on ${esc(contractsReadBy(k)[0]?.sunset || '—')}.</p>
        </div>`).join('')}
      </div>`;
  }

  // ---------- sandbox ----------
  const CHANGES = [
    ['remove', 'Remove field'], ['rename', 'Rename field'], ['type', 'Change type'],
    ['optional', 'Make optional'], ['required', 'Make required'],
    ['enum_add', 'Add enum value'], ['enum_remove', 'Remove enum value'],
    ['add_optional', 'Add optional field'], ['add_required', 'Add required field'],
  ];
  const TYPES = ['string', 'integer', 'decimal', 'boolean', 'date', 'timestamp', 'enum'];

  function bump(v, level) {
    const [a, b, c] = v.split('.').map(Number);
    if (a === 0) return level === 'major' ? `0.${b + 1}.0` : `0.${b}.${c + 1}`; // pre-1.0: anything goes
    return level === 'major' ? `${a + 1}.0.0` : level === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
  }

  function assess(c, change, fname, extra) {
    const f = c.fields.find((x) => x.name === fname);
    const readers = f ? readersOfField(c, f.name) : [];
    const R = { level: 'minor', verdict: 'safe', note: '', affected: [], fyi: c.tolerant };
    const has = readers.length > 0;
    switch (change) {
      case 'remove':
        Object.assign(R, { level: 'major', verdict: has ? 'break' : 'safe', affected: readers,
          note: has ? `Removing <code>${esc(fname)}</code> breaks every reader that uses it.` : `Nobody has registered a read of <code>${esc(fname)}</code>. Still a major version, but nothing should break.` });
        break;
      case 'rename':
        Object.assign(R, { level: 'major', verdict: has ? 'break' : 'safe', affected: readers,
          note: `A rename is a remove plus an add. Publish both names for one version${extra ? ` (<code>${esc(fname)}</code> and <code>${esc(extra)}</code>)` : ''} and give readers a sunset date.` });
        break;
      case 'type':
        Object.assign(R, { level: 'major', verdict: has ? 'break' : 'safe', affected: readers,
          note: `${esc(f.type)} → ${esc(extra || '?')}. Readers parsing the old type fail or, worse, silently mis-read.` });
        break;
      case 'optional':
        Object.assign(R, { level: has ? 'major' : 'minor', verdict: has ? 'break' : 'safe', affected: readers,
          note: f && !f.required ? 'Already optional.' : 'Readers that assume the value is always present will start seeing nulls.' });
        break;
      case 'required':
        Object.assign(R, { level: 'minor', verdict: 'safe', affected: [],
          note: f && f.required ? 'Already required.' : 'Safe for readers. The producer must start sending it in the same release, or its own events get rejected.' });
        break;
      case 'enum_add':
        Object.assign(R, { level: 'minor', verdict: has ? 'maybe' : 'safe', affected: readers,
          note: f && f.enum ? `New value <code>${esc(extra || '?')}</code>. Readers that map every value (reports, colour codes, emission factors) need to know before it appears.` : `<code>${esc(fname)}</code> is not an enum.` });
        break;
      case 'enum_remove':
        Object.assign(R, { level: 'minor', verdict: 'safe', affected: [],
          note: 'Readers will simply stop seeing that value. Check historical data still makes sense.' });
        break;
      case 'add_optional':
        Object.assign(R, { level: 'minor', verdict: 'safe', affected: [], note: `New optional field <code>${esc(extra || 'new_field')}</code>. Readers ignore what they don't use.` });
        break;
      case 'add_required':
        Object.assign(R, { level: 'minor', verdict: 'safe', affected: [], note: `New required field <code>${esc(extra || 'new_field')}</code>. Safe for readers; the producer must ship it with the contract change.` });
        break;
    }
    R.to = bump(c.version, R.level);
    if (c.status === 'draft') R.note += ' This contract is a draft (0.x), so changes are expected and readers are only planned.';
    return R;
  }

  function renderSandbox(id) {
    const c0 = ix.contract[id] || ix.contract['invoice.received.v2'];
    view.innerHTML = `
      <div class="page-head">
        <div><h1>Sandbox</h1><p class="lede">Check a payload against a contract, or see what a proposed change would hit before anyone ships it. Nothing here leaves your browser.</p></div>
      </div>
      <div class="row" style="margin-bottom:18px">
        <div><label class="fl" for="sb-c">Contract</label>
        <select id="sb-c">${C.contracts.map((c) => `<option value="${esc(c.id)}" ${c.id === c0.id ? 'selected' : ''}>${esc(c.event)} ${esc(c.version)}${c.status !== 'active' ? ` (${c.status})` : ''}</option>`).join('')}</select></div>
        <div style="align-self:flex-end"><a class="small" id="sb-open" href="#">Open contract →</a></div>
      </div>
      <div class="sb-grid">
        <section>
          <div class="section-head" style="margin-bottom:10px"><h2>Validate a payload</h2><span class="hint">validates as you type</span></div>
          <textarea class="payload" id="sb-p" spellcheck="false" aria-label="Payload JSON"></textarea>
          <div class="row">
            <button class="btn ghost" type="button" id="sb-ex">Fresh valid example</button>
            <button class="btn ghost" type="button" id="sb-break">Break it like real life</button>
          </div>
          <div id="sb-v"></div>
        </section>
        <section>
          <div class="section-head" style="margin-bottom:10px"><h2>Change impact</h2><span class="hint">uses consumers' registered fields</span></div>
          <div class="field-row">
            <div><label class="fl" for="ch-kind">Change</label><select id="ch-kind">${CHANGES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
            <div id="ch-field-wrap"><label class="fl" for="ch-field">Field</label><select id="ch-field"></select></div>
            <div id="ch-extra-wrap"><label class="fl" for="ch-extra" id="ch-extra-l">Value</label><span id="ch-extra-slot"></span></div>
          </div>
          <div id="ch-out"></div>
        </section>
      </div>`;

    let c = c0;
    const ta = $('#sb-p');
    const setPayload = (p) => { ta.value = JSON.stringify(p, null, 2); check(); };
    const check = () => {
      let p;
      try { p = JSON.parse(ta.value); }
      catch (err) {
        $('#sb-v').innerHTML = `<div class="verdict fail"><h3>Not valid JSON</h3><p class="small mono">${esc(err.message)}</p></div>`; return;
      }
      const { errors, warnings } = validate(c, p);
      const t = ix.team[c.team];
      const cls = errors.length ? 'fail' : warnings.length ? 'mixed' : 'pass';
      $('#sb-v').innerHTML = `<div class="verdict ${cls}">
        <h3>${errors.length ? `Rejected — ${errors.length} problem${errors.length > 1 ? 's' : ''}` : 'Conforms to v' + esc(c.version)}</h3>
        ${errors.length ? `<ul>${errors.map((x) => `<li><code>${esc(x.field)}</code> — ${esc(x.rule)}: ${esc(x.msg)}</li>`).join('')}</ul>` : ''}
        ${warnings.length ? `<ul>${warnings.map((x) => `<li class="muted"><code>${esc(x.field)}</code> — ${esc(x.msg)}</li>`).join('')}</ul>` : ''}
        <p class="small muted" style="margin:10px 0 0">${errors.length ? `In production this goes to the dead-letter queue and ${esc(t.steward)} gets the alert.` : `Would be delivered to ${consumersOf(c).length} consumer${consumersOf(c).length === 1 ? '' : 's'}.`}</p>
      </div>`;
    };
    let tId; ta.addEventListener('input', () => { clearTimeout(tId); tId = setTimeout(check, 180); });
    $('#sb-ex').addEventListener('click', () => setPayload(genPayload(c, { full: true })));
    $('#sb-break').addEventListener('click', () => {
      let p; try { p = JSON.parse(ta.value); } catch { p = genPayload(c, { full: true }); }
      setPayload(breakPayload(c, p).q);
    });

    // change impact
    const kindSel = $('#ch-kind'), fieldSel = $('#ch-field');
    const needsField = (k) => !['add_optional', 'add_required'].includes(k);
    const fillFields = () => {
      const k = kindSel.value;
      const fs = c.fields.filter((f) => (k.startsWith('enum') ? f.enum : true));
      const prev = fieldSel.value;
      fieldSel.innerHTML = fs.map((f) => `<option value="${esc(f.name)}">${esc(f.name)}</option>`).join('') || '<option value="">(no enum fields)</option>';
      if (fs.some((f) => f.name === prev)) fieldSel.value = prev;
      $('#ch-field-wrap').style.display = needsField(k) ? '' : 'none';
      const f = c.fields.find((x) => x.name === fieldSel.value);
      const slot = $('#ch-extra-slot'), lab = $('#ch-extra-l'), wrap = $('#ch-extra-wrap');
      wrap.style.display = '';
      if (k === 'type') { lab.textContent = 'New type'; slot.innerHTML = `<select id="ch-extra">${TYPES.filter((t) => !f || t !== f.type).map((t) => `<option>${t}</option>`).join('')}</select>`; }
      else if (k === 'rename') { lab.textContent = 'New name'; slot.innerHTML = `<input type="text" id="ch-extra" value="${esc(f ? f.name + '_v2' : '')}">`; }
      else if (k === 'enum_add') { lab.textContent = 'New value'; slot.innerHTML = `<input type="text" id="ch-extra" value="${esc(suggestEnum(f))}">`; }
      else if (k === 'enum_remove') { lab.textContent = 'Value'; slot.innerHTML = `<select id="ch-extra">${(f?.enum || []).map((v) => `<option>${esc(v)}</option>`).join('')}</select>`; }
      else if (k.startsWith('add_')) { lab.textContent = 'Field name'; slot.innerHTML = `<input type="text" id="ch-extra" value="${esc(suggestNew(c))}">`; }
      else { wrap.style.display = 'none'; slot.innerHTML = ''; }
      $('#ch-extra')?.addEventListener('input', impact);
      $('#ch-extra')?.addEventListener('change', impact);
      impact();
    };
    const impact = () => {
      const k = kindSel.value, fname = fieldSel.value, extra = $('#ch-extra')?.value?.trim();
      if (needsField(k) && !fname) { $('#ch-out').innerHTML = '<div class="verdict mixed"><p class="small">This contract has no enum fields.</p></div>'; return; }
      const R = assess(c, k, fname, extra);
      const t = ix.team[c.team];
      const tag = { break: '<span class="tag-break">Breaking</span>', maybe: '<span class="tag-maybe">Readers should check</span>', safe: '<span class="tag-safe">Safe for readers</span>' }[R.verdict];
      const affectedRows = R.affected.map((r) => {
        const kt = ix.team[r.consumer.team];
        return `<tr><td>${esc(r.consumer.name)}<span class="sub">${kt ? esc(kt.name) : '<span style="color:var(--bad)">No owner — nobody to tell</span>'}</span></td>
          <td>${kt ? esc(kt.owner) + '<span class="sub">steward ' + esc(kt.steward) + '</span>' : '—'}</td></tr>`;
      }).join('');
      const fv = c.fields.find((x) => x.name === fname);
      const what = {
        remove: `remove \`${fname}\``,
        rename: `rename \`${fname}\` to \`${extra}\``,
        type: `change \`${fname}\` from ${fv?.type} to ${extra}`,
        optional: `make \`${fname}\` optional`,
        required: `make \`${fname}\` required`,
        enum_add: `add \`${extra}\` to \`${fname}\``,
        enum_remove: `remove \`${extra}\` from \`${fname}\``,
        add_optional: `add optional field \`${extra || 'new_field'}\``,
        add_required: `add required field \`${extra || 'new_field'}\``,
      }[k];
      const msg = R.affected.length || R.verdict !== 'safe' ? [
        `Subject: ${c.event} ${R.to} — ${what}`,
        '',
        `${t.name} plans to ${what} in ${c.event} (${c.version} → ${R.to}).`,
        R.affected.length ? `You are listed as reading ${needsField(k) ? `\`${fname}\`` : 'this contract'}: ${R.affected.map((r) => r.consumer.name).join(', ')}.` : '',
        R.level === 'major' ? `${c.version} stays published in parallel for at least one release. Proposed sunset: ${addDays(60)}.` : 'No action needed unless you map every value of this field.',
        '',
        `Questions to ${t.steward}.`,
      ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n') : '';

      $('#ch-out').innerHTML = `
        <div class="verdict ${R.verdict === 'break' ? 'fail' : R.verdict === 'maybe' ? 'mixed' : 'pass'}">
          <div class="row" style="margin:0 0 8px;justify-content:space-between">${tag}<span class="bump"><span class="from">${esc(c.version)} →</span> ${esc(R.to)}</span></div>
          <p class="small" style="margin:0">${R.note}</p>
        </div>
        ${R.affected.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Affected reader</th><th>Who to tell</th></tr></thead><tbody>${affectedRows}</tbody></table></div>` : ''}
        ${R.fyi.length ? `<p class="small muted" style="margin:10px 0 0">Also informed, no action: ${R.fyi.map((k2) => esc(k2.name)).join(', ')} (tolerant reader).</p>` : ''}
        ${msg ? `<div class="notify"><label class="fl">Change notice, drafted</label><pre class="code">${esc(msg)}</pre></div>` : ''}`;
    };
    function suggestEnum(f) {
      const s = { material_category: 'clt_elements', unit: 'kg', vat_treatment: 'standard_14', weather: 'storm', category: 'fire_safety', source: 'solar', role: 'trainee', discipline: 'geotechnical', reason: 'claim', result: 'pending' };
      return f ? s[f.name] || 'new_value' : '';
    }
    function suggestNew(cc) {
      const s = { 'invoice.received.v2': 'einvoice_channel', 'purchase_order.approved.v3': 'delivery_week', 'site.worker.checked_in.v2': 'gate_id', 'sensor.concrete_rh.measured.v1': 'battery_pct', 'defect.reported.v2': 'responsible_business_id' };
      return s[cc.id] || 'new_field';
    }
    kindSel.addEventListener('change', fillFields);
    fieldSel.addEventListener('change', fillFields);

    const load = (nid) => {
      c = ix.contract[nid];
      $('#sb-open').href = href('/contracts/' + encodeURIComponent(c.id));
      history.replaceState(null, '', '#/sandbox/' + encodeURIComponent(c.id));
      const p = genPayload(c, { full: true });
      if (c.id === 'invoice.received.v2') delete p.po_number; // start on the live problem
      setPayload(p);
      if (c.id === 'invoice.received.v2' && kindSel.value === 'remove') { fillFields(); fieldSel.value = 'po_number'; }
      fillFields();
    };
    $('#sb-c').addEventListener('change', (e) => load(e.target.value));
    load(c0.id);
  }

  // ---------- boot ----------
  fetch('data/catalog.json')
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { prepare(d); window.addEventListener('hashchange', route); route(); })
    .catch(() => {
      view.innerHTML = `<div class="page-head"><div><h1>Catalogue not loaded</h1>
        <p class="lede">The page reads <code>data/catalog.json</code>, which browsers block when the file is opened straight from disk. Serve the folder instead, e.g. <code>python3 -m http.server</code> and open <code>http://localhost:8000</code>. On GitHub Pages it works as is.</p></div></div>`;
    });
})();
