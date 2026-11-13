/* Routa · pipeline status — shared engine (demo and landscape)
   Two separate halves on purpose:
   1. Sim   — a fake world of systems that run on schedules and emit events. Only the demo needs this.
   2. Model — turns the events (and nothing else) into checkpoint statuses. This is the part a real
              platform would have; it never looks at the simulator's config. */
window.Pipe = (() => {
  'use strict';

  const SEC = { public: 0, internal: 1, confidential: 2, secret: 3 };
  const MIN = 60000;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (ms) => {
    const d = new Date(ms), o = -d.getTimezoneOffset(), a = Math.abs(o);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${o >= 0 ? '+' : '-'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
  };

  // small deterministic random so the demo opens the same way every time
  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  // =====================================================================
  // 1. Simulator
  // =====================================================================
  function createSim(reg, cfg) {
    const sys = Object.fromEntries(reg.systems.map((s) => [s.id, s]));
    const con = Object.fromEntries(reg.contracts.map((c) => [c.id, c]));
    const rnd = seeded(20261112);
    let now = Date.now(), speed = 30, paused = false, runSeq = 4100;
    const t0 = now;
    let planted = JSON.parse(JSON.stringify(cfg.planted));
    const events = [], queue = [], listeners = [];
    const nextStart = {};

    const find = (type, flow, system) => planted.find((p) => p.type === type && p.flow === flow && (!system || p.system === system));
    const stopped = (flow) => !!find('stop', flow);

    function hopDelay(flow, sid, k) {
      if (k === 0) return 0;
      let d = 0.4 + rnd() * 2.2;
      const slow = find('slow', flow, sid);
      if (slow) d = slow.delay_min * (0.9 + rnd() * 0.2);
      else if (rnd() < 0.006) d = con[flow].checkpoint_sla_min * (1.3 + rnd());   // the odd slow hop
      return d;
    }

    function run(flow, start, opts = {}) {
      const c = con[flow], path = cfg.contracts[flow].path;
      const runId = `R-${++runSeq}`;
      let t = start, level = c.security_level;
      for (let k = 0; k < path.length; k++) {
        const s = sys[path[k]];
        t += hopDelay(flow, s.id, k) * MIN;
        // the receiving system refuses data above its clearance: nothing is emitted from here on
        if (k > 0 && SEC[level] > SEC[s.clearance]) break;
        const fail = opts.noFail ? null : find('fail', flow, s.id) || (rnd() < 0.0015 ? { message: 'Timeout calling the next system' } : null);
        const recs = Math.max(0, Math.round(cfg.contracts[flow].records * (0.85 + rnd() * 0.3)));
        if (s.id === 'INT-01' && level === 'secret' && !find('leak', flow, s.id)) level = 'confidential';
        if (find('leak', flow, s.id)) level = 'secret';
        const ev = {
          system_id: s.id, system_name: s.name, stage: s.stage, flow, run_id: runId,
          source: k ? path[k - 1] : null, status: fail ? 'failed' : 'ok', date: iso(t),
          security_level: level, records: recs,
        };
        if (fail) { ev.message = fail.message; if (fail.profile) ev.profile = fail.profile; }
        if (flow === 'supplier-invoices' && !fail && s.id === 'INT-01') ev.profile = { po_number: { missing: 0 } };
        queue.push({ at: t, ev });
        if (fail) break;
      }
    }

    // history: a few hours of runs, so the page opens with something to show
    for (const c of reg.contracts) {
      const every = c.every_min * MIN;
      const stop = find('stop', c.id);
      let last;
      if (c.every_min >= 1440) last = now - (180 + rnd() * 260) * MIN;
      else last = now - rnd() * every;
      if (stop) last = now - stop.since_min * MIN;
      const starts = [];
      const daily = c.every_min >= 1440;
      const span = daily ? 3 : Math.min(10, Math.floor((8 * 60) / c.every_min));
      for (let i = span - 1; i >= 0; i--) starts.push(last - i * every);
      // planted failures only affect the latest one or two runs, so history shows when it started
      starts.forEach((st, i) => run(c.id, st, { noFail: i < starts.length - (daily ? 1 : 2) }));
      nextStart[c.id] = last + every;
    }
    flush();

    function flush() {
      queue.sort((a, b) => a.at - b.at);
      const out = [];
      while (queue.length && queue[0].at <= now) out.push(queue.shift().ev);
      if (out.length) { events.push(...out); listeners.forEach((fn) => fn(out)); }
    }

    function step(ms) {
      now += ms;
      for (const c of reg.contracts) {
        const every = c.every_min * MIN;
        while (nextStart[c.id] <= now) {
          if (!stopped(c.id)) run(c.id, nextStart[c.id]);
          nextStart[c.id] += every;
        }
      }
      flush();
    }

    let last = performance.now();
    setInterval(() => {
      const t = performance.now(), dt = t - last; last = t;
      if (!paused) step(dt * speed);
    }, 250);

    return {
      events,
      now: () => now,
      startedAt: t0,
      on: (fn) => listeners.push(fn),
      get speed() { return speed; },
      setSpeed: (x) => { speed = x; paused = x === 0; },
      get paused() { return paused; },
      planted: () => planted,
      // scenarios the demo can trigger
      apply(sc) {
        if (sc.type === 'fix') planted = planted.filter((p) => !(p.flow === sc.flow && (!sc.system || p.system === sc.system)));
        else if (sc.type === 'fix-all') planted = [];
        else {
          planted = planted.filter((p) => !(p.flow === sc.flow && p.system === sc.system && p.type === sc.type));
          planted.push(sc);
        }
        // start a run now so the effect is visible straight away
        if (sc.flow && !stopped(sc.flow)) { run(sc.flow, now); nextStart[sc.flow] = now + con[sc.flow].every_min * MIN; }
        if (sc.type === 'fix-all') reg.contracts.forEach((c) => { if (now - lastStartOf(c.id) > c.every_min * MIN) { run(c.id, now); nextStart[c.id] = now + c.every_min * MIN; } });
        flush();
      },
    };
    function lastStartOf(flow) {
      let t = 0;
      for (const e of events) if (e.flow === flow && !e.source) t = Math.max(t, Date.parse(e.date));
      return t;
    }
  }

  // =====================================================================
  // 2. Model — from events only
  // =====================================================================
  // checkpoint states and how they read
  const STATE = {
    passed:     { tone: 'ok',      label: 'Passed',     rank: 0 },
    'passed-late':      { tone: 'late', label: 'Passed late',      rank: 2 },
    'passed-very-late': { tone: 'bad',  label: 'Passed very late', rank: 3 },
    transit:    { tone: 'transit', label: 'In transit', rank: 1 },
    late:       { tone: 'late',    label: 'Late',       rank: 2 },
    'very-late':{ tone: 'bad',     label: 'Very late',  rank: 3 },
    error:      { tone: 'bad',     label: 'Error',      rank: 3 },
    blocked:    { tone: 'bad',     label: 'Blocked',    rank: 3 },
    waiting:    { tone: 'wait',    label: 'Waiting',    rank: -1 },
  };
  const TONE_RANK = { ok: 0, transit: 1, late: 2, bad: 3, wait: -1 };
  const dur = (min) => (min < 1 ? `${Math.max(1, Math.round(min * 60))} s` : min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)} h${Math.round(min % 60) ? ' ' + Math.round(min % 60) + ' min' : ''}`);
  const every = (m) => (m >= 1440 ? 'daily' : `every ${dur(m)}`);

  function derive(reg, events, now) {
    const sys = Object.fromEntries(reg.systems.map((s) => [s.id, s]));
    const byFlow = {};
    for (const e of events) (byFlow[e.flow] ||= {})[e.run_id] ||= [], byFlow[e.flow][e.run_id].push(e);

    const contracts = reg.contracts.map((c) => {
      const runs = Object.entries(byFlow[c.id] || {}).map(([id, evs]) => {
        evs.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
        return { id, evs, start: Date.parse(evs[0].date), at: Object.fromEntries(evs.map((e) => [e.system_id, e])) };
      }).sort((a, b) => a.start - b.start);
      // path: follow `source` links in the most complete recent run
      const recent = runs.slice(-8);
      const best = recent.reduce((a, r) => (!a || r.evs.length > a.evs.length ? r : a), null);
      const path = [];
      if (best) {
        let cur = best.evs.find((e) => !e.source);
        while (cur && !path.includes(cur.system_id)) {
          path.push(cur.system_id);
          cur = best.evs.find((e) => e.source === path[path.length - 1] && !path.includes(e.system_id));
        }
      }
      const cur = runs[runs.length - 1];
      const sla = c.checkpoint_sla_min;
      let blockedAt = false;
      const hops = path.map((sid, i) => {
        const s = sys[sid], e = cur && cur.at[sid];
        const prev = i ? cur && cur.at[path[i - 1]] : null;
        const h = { i, sys: s, e, prev, contract: c, key: `${c.id}|${sid}` };
        if (e) {
          if (e.status === 'failed') { h.state = 'error'; h.why = e.message || 'The system reported an error.'; }
          else {
            const took = prev ? (Date.parse(e.date) - Date.parse(prev.date)) / MIN : 0;
            h.took = took;
            h.state = took > sla * 3 ? 'passed-very-late' : took > sla ? 'passed-late' : 'passed';
            h.why = `Passed at ${hhmm(e.date)}${prev ? `, ${dur(took)} after ${prev.system_id}` : ''}${h.state !== 'passed' ? ` (SLA ${sla} min)` : ''}.`;
          }
        } else if (!prev || blockedAt || (prev && prev.status === 'failed')) {
          h.state = 'waiting'; h.why = 'Held up at an earlier checkpoint.';
        } else if (SEC[prev.security_level] > SEC[s.clearance]) {
          h.state = 'blocked'; h.fixer = sys[prev.system_id]; blockedAt = true;
          h.why = `${prev.system_name} sent ${prev.security_level} data; ${s.name} is cleared for ${s.clearance} only. Held back.`;
        } else {
          const m = (now - Date.parse(prev.date)) / MIN;
          h.elapsed = m;
          h.state = m < sla ? 'transit' : m < sla * 3 ? 'late' : 'very-late';
          h.why = h.state === 'transit' ? `On its way from ${prev.system_id} for ${dur(m)}. Expected within ${sla} min.`
            : `Expected within ${sla} min of ${prev.system_id}; it has been ${dur(m)}.`;
        }
        // the source also answers "has a new message started on time?"
        if (i === 0 && cur) {
          const since = (now - cur.start) / MIN;
          if (since > c.every_min * 3) { h.state = 'very-late'; h.why = `No new message for ${dur(since)}. This contract runs ${every(c.every_min)}.`; }
          else if (since > c.every_min * 1.5) { h.state = 'late'; h.why = `No new message for ${dur(since)}. This contract runs ${every(c.every_min)}.`; }
          h.sinceStart = since;
        }
        h.tone = STATE[h.state].tone;
        return h;
      });
      const worst = hops.reduce((w, h) => (TONE_RANK[h.tone] > TONE_RANK[w ? w.tone : 'wait'] ? h : w), null);
      const tone = worst ? worst.tone : 'wait';
      // recent runs as a grid: per checkpoint what happened in that run
      const history = runs.slice(-10).reverse().map((r, idx) => ({
        id: r.id, start: r.start,
        cells: path.map((sid, i) => {
          const e = r.at[sid];
          if (idx === 0) return hops[i] ? hops[i].tone : 'wait';
          if (e) {
            if (e.status === 'failed') return 'bad';
            const pe = i ? r.at[path[i - 1]] : null;
            const took = pe ? (Date.parse(e.date) - Date.parse(pe.date)) / MIN : 0;
            return took > sla * 3 ? 'bad' : took > sla ? 'late' : 'ok';
          }
          const prevE = i ? r.at[path[i - 1]] : null;
          return prevE && prevE.status !== 'failed' ? 'bad' : 'wait';   // never arrived
        }),
        end: r.evs.length === path.length ? Date.parse(r.evs[r.evs.length - 1].date) : null,
      }));
      return { c, path, hops, cur, tone, worst: worst && worst.tone !== 'ok' && worst.tone !== 'transit' ? worst : null, history, runs };
    });

    // systems and the links between them
    const systems = {}, links = {};
    for (const k of contracts) {
      k.hops.forEach((h, i) => {
        const S = (systems[h.sys.id] ||= { sys: h.sys, hops: [] });
        S.hops.push(h);
        if (i) {
          const a = k.hops[i - 1].sys.id, key = `${a}>${h.sys.id}`;
          const L = (links[key] ||= { from: a, to: h.sys.id, hops: [] });
          L.hops.push(h);
        }
      });
    }
    const worstTone = (hs) => hs.reduce((w, h) => (TONE_RANK[h.tone] > TONE_RANK[w] ? h.tone : w), 'ok');
    Object.values(systems).forEach((S) => { S.tone = worstTone(S.hops.filter((h) => h.tone !== 'wait')); S.bad = S.hops.filter((h) => h.tone === 'bad' || h.tone === 'late').length; });
    Object.values(links).forEach((L) => { L.tone = worstTone(L.hops); });
    return { contracts, systems, links: Object.values(links) };
  }

  function hhmm(v) { const d = new Date(typeof v === 'number' ? v : Date.parse(v)); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function hhmmss(v) { const d = new Date(v); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }

  async function load(base = 'data/') {
    const [reg, sim] = await Promise.all(['register.json', 'simulation.json'].map((f) => fetch(base + f).then((r) => { if (!r.ok) throw new Error(f); return r.json(); })));
    return { reg, sim };
  }

  return { createSim, derive, load, SEC, STATE, TONE_RANK, MIN, dur, every, hhmm, hhmmss, iso };
})();
