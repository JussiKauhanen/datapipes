/* Guide page: fill-in-the-blank snippets with template / example tabs, light syntax colouring, copy, TOC. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // theme, shared with the demo pages
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

  // ‹…› marks a blank to fill in
  const S = {
    system: {
      file: 'register/systems/INT-01.json', lang: 'json',
      template: {
        id: '‹SYSTEM-ID›',
        name: '‹human name›',
        stage: '‹source | integration | dynamics | apps | analytics›',
        owner: { team: '‹owning team›', business_owner: '‹person who answers for the meaning›', steward: '‹person who answers for the feed›', contact: '‹team channel or mailbox›' },
        clearance: '‹highest security level it may hold›',
        environment: '‹prod | test›',
      },
      example: {
        id: 'INT-01',
        name: 'Integration hub',
        stage: 'integration',
        owner: { team: 'Integration team', business_owner: 'Noora Ahonen', steward: 'Sami Koivisto', contact: '#integration-team' },
        clearance: 'secret',
        environment: 'prod',
      },
    },
    contract: {
      file: 'contracts/finance/supplier-invoices.json', lang: 'json',
      template: {
        id: '‹contract-id›',
        name: '‹human name›',
        version: '‹1.0.0›',
        area: '‹Finance | Projects | Site | …›',
        status: '‹draft | active | deprecated›',
        owner: '‹business owner›',
        producer: '‹SYSTEM-ID where the data starts›',
        consumers: ['‹SYSTEM-ID›', '‹SYSTEM-ID›'],
        schedule: { every_min: '‹60›', window: '‹when it runs, e.g. Mon–Fri 06–22›' },
        security_level: '‹level at the source›',
      },
      example: {
        id: 'supplier-invoices',
        name: 'Supplier invoices',
        version: '2.1.0',
        area: 'Finance',
        status: 'active',
        owner: 'Aino Lehtinen',
        producer: 'SRC-INV',
        consumers: ['D365-FIN', 'APP-PRC', 'ANA-01'],
        schedule: { every_min: 60, window: 'Mon–Fri 06:00–22:00 Europe/Helsinki' },
        security_level: 'confidential',
      },
    },
    event: {
      file: 'POST /checkpoints', lang: 'json',
      template: {
        system_id: '‹SYSTEM-ID sending this›',
        system_name: '‹human name›',
        stage: '‹stage›',
        flow: '‹contract-id›',
        run_id: '‹same id at every checkpoint of one message›',
        source: '‹SYSTEM-ID it got the data from, null at the source›',
        status: '‹ok | failed›',
        date: '‹ISO 8601 with offset›',
        security_level: '‹level of the data as it leaves›',
        records: '‹count, optional›',
        message: '‹one line when failed, optional›',
        profile: { '‹field›': { missing: '‹count›' } },
      },
      example: {
        system_id: 'INT-01',
        system_name: 'Integration hub',
        stage: 'integration',
        flow: 'supplier-invoices',
        run_id: 'R-4108',
        source: 'SRC-INV',
        status: 'failed',
        date: '2026-11-13T09:22:04+02:00',
        security_level: 'confidential',
        records: 2950,
        message: 'Mapping error: po_number missing in 112 of 2 950 rows',
        profile: { po_number: { missing: 112 } },
      },
    },
    shape: {
      file: 'contracts/finance/supplier-invoices.json · fields + expectations', lang: 'json',
      template: {
        fields: [{ name: '‹field›', type: '‹string | integer | decimal | date | timestamp | boolean›', level: '‹security level›', required: '‹true | false›' }],
        readers: [{ system: '‹SYSTEM-ID›', reads: ['‹field›', '‹field›'] }],
        expectations: {
          arrival: { every_min: '‹60›', grace_min: '‹10›', calendar: '‹fi-business-days›' },
          checkpoint_sla_min: '‹5›',
          records: { min: '‹100›', max: '‹5000›' },
          learn: '‹true: let the platform suggest values›',
        },
      },
      example: {
        fields: [
          { name: 'invoice_id', type: 'string', level: 'internal', required: true },
          { name: 'po_number', type: 'string', level: 'internal', required: true },
          { name: 'amount_eur', type: 'decimal', level: 'confidential', required: true },
          { name: 'due_date', type: 'date', level: 'internal', required: true },
        ],
        readers: [
          { system: 'APP-PRC', reads: ['invoice_id', 'po_number', 'amount_eur'] },
          { system: 'ANA-01', reads: '*' },
        ],
        expectations: {
          arrival: { every_min: 60, grace_min: 10, calendar: 'fi-business-days' },
          checkpoint_sla_min: 5,
          records: { min: 500, max: 6000 },
          learn: true,
        },
      },
    },
    yaml: {
      file: 'contracts/finance/supplier-invoices.yaml', lang: 'yaml',
      template: `# contracts/‹area›/‹contract-id›.yaml   — one file per contract, reviewed like code
id: ‹contract-id›
version: ‹1.0.0›          # major = breaking for readers, minor = safe
status: ‹draft | active | deprecated›
owner:
  business: ‹person›      # answers for what the data means
  steward: ‹person›       # answers for the feed and for change notices
producer: ‹SYSTEM-ID›
schedule:
  every: ‹60m›
  window: "‹Mon-Fri 06:00-22:00 Europe/Helsinki›"
expectations:
  checkpoint_sla: ‹5m›
  learn: ‹true›
security_level: ‹level›
fields:
  - { name: ‹field›, type: ‹type›, level: ‹level›, required: ‹true› }
readers:
  - { system: ‹SYSTEM-ID›, reads: [‹field›, ‹field›] }`,
      example: `# contracts/finance/supplier-invoices.yaml
id: supplier-invoices
version: 2.1.0
status: active
owner:
  business: Aino Lehtinen
  steward: Ville Koskinen
producer: SRC-INV
schedule:
  every: 60m
  window: "Mon-Fri 06:00-22:00 Europe/Helsinki"
expectations:
  checkpoint_sla: 5m
  learn: true
security_level: confidential
fields:
  - { name: invoice_id, type: string,  level: internal,     required: true }
  - { name: po_number,  type: string,  level: internal,     required: true }
  - { name: amount_eur, type: decimal, level: confidential, required: true }
readers:
  - { system: APP-PRC, reads: [invoice_id, po_number, amount_eur] }
  - { system: ANA-01,  reads: "*" }`,
    },
    learned: {
      file: 'what the platform keeps per checkpoint (example values)', lang: 'json',
      template: {
        contract: '‹contract-id›',
        checkpoint: '‹SYSTEM-ID›',
        declared: { sla_min: '‹from the contract›' },
        learned: { runs: '‹count›', p50_min: '‹›', p95_min: '‹›', p99_min: '‹›', by_slot: { '‹weekday 06–09 | month-end | …›': { p95_min: '‹›' } } },
        thresholds_now: { yellow_after_min: '‹›', red_after_min: '‹›', why: '‹learned, capped by declared›' },
        suggestion: { sla_min: '‹›', status: '‹waiting for owner | accepted | rejected›' },
      },
      example: {
        contract: 'supplier-invoices',
        checkpoint: 'D365-FIN',
        declared: { sla_min: 5 },
        learned: { runs: 412, p50_min: 1.8, p95_min: 3.9, p99_min: 6.2, by_slot: { 'month-end': { p95_min: 11.0 } } },
        thresholds_now: { yellow_after_min: 5, red_after_min: 15, why: 'declared; learned p95 is lower, month-end uses 11 / 33' },
        suggestion: { sla_min: 4, status: 'waiting for owner' },
      },
    },
  };

  // colouring
  function jsonHtml(obj) {
    return esc(JSON.stringify(obj, null, 2)).replace(/("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g, (m, str, colon) => {
      if (str) {
        if (colon) return `<span class="k">${str}</span>${colon}`;
        return str.startsWith('"‹') ? `<span class="ph">${str}</span>` : `<span class="s">${str}</span>`;
      }
      return `<span class="n">${m}</span>`;
    });
  }
  function yamlHtml(txt) {
    return esc(txt).split('\n').map((line) => {
      let code = line, cmt = '';
      const i = line.indexOf('#');
      if (i >= 0 && !/"[^"]*#/.test(line.slice(0, i + 1))) { code = line.slice(0, i); cmt = line.slice(i); }
      // one pass, so later rules never touch the markup earlier ones added
      code = code.replace(/(‹[^›]*›)|("[^"]*")|(^\s*-?\s*|[{,]\s*)([a-z_]+)(?=:)/g, (m, ph, str, pre, key) => {
        if (ph) return `<span class="ph">${ph}</span>`;
        if (str) return `<span class="s">${str}</span>`;
        return `${pre}<span class="k">${key}</span>`;
      });
      return code + (cmt ? `<span class="c">${cmt}</span>` : '');
    }).join('\n');
  }
  const render = (sn, which) => (sn.lang === 'yaml' ? yamlHtml(sn[which]) : jsonHtml(sn[which]));
  const plain = (sn, which) => (sn.lang === 'yaml' ? sn[which] : JSON.stringify(sn[which], null, 2));

  $$('[data-snip]').forEach((box) => {
    const sn = S[box.dataset.snip];
    let which = box.dataset.start || 'template';
    box.className = 'snip';
    box.innerHTML = `<div class="bar" role="tablist"><span class="file">${esc(sn.file)}</span>
        <button type="button" role="tab" data-w="template">Template</button>
        <button type="button" role="tab" data-w="example">Example</button>
        <button type="button" class="copy">Copy</button></div>
      <pre tabindex="0"></pre>
      <div class="legend"><span class="ph">‹ ›</span> marks a blank to fill in.</div>`;
    const pre = $('pre', box), legend = $('.legend', box);
    const show = (w) => {
      which = w;
      pre.innerHTML = render(sn, w);
      $$('[data-w]', box).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.w === w)));
      legend.hidden = w !== 'template';
    };
    $$('[data-w]', box).forEach((b) => b.addEventListener('click', () => show(b.dataset.w)));
    $('.copy', box).addEventListener('click', async (e) => {
      try { await navigator.clipboard.writeText(plain(sn, which)); e.target.textContent = 'Copied'; }
      catch { e.target.textContent = 'Select and copy'; }
      setTimeout(() => { e.target.textContent = 'Copy'; }, 1400);
    });
    show(which);
  });

  // data-model ladder: expand / collapse
  $$('.lv > .lh').forEach((h) => h.addEventListener('click', () => {
    const lv = h.parentElement, open = !lv.classList.contains('open');
    lv.classList.toggle('open', open);
    h.setAttribute('aria-expanded', String(open));
  }));

  // table of contents follows the scroll
  const links = $$('.toc a');
  const onScroll = () => {
    let cur = links[0];
    links.forEach((a) => { const s = $(a.getAttribute('href')); if (s && s.getBoundingClientRect().top < 140) cur = a; });
    links.forEach((a) => a.classList.toggle('on', a === cur));
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
