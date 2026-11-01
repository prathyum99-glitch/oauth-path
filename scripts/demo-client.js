/* Client renderer for the static review copy of OAuth Path. Mirrors src/components/GuideView.tsx. */
(function () {
  var GUIDES = window.__GUIDES__;
  var DIFF = {
    easy: { label: 'Easy', ticks: 1, blurb: 'Self-serve. Usually under a day, no review.' },
    moderate: { label: 'Moderate', ticks: 2, blurb: 'Self-serve to start. Going public adds a review or conditions.' },
    hard: { label: 'Hard', ticks: 3, blurb: 'Formal review, extra documents, or a security assessment. Plan in weeks.' },
    gated: { label: 'Gated', ticks: 4, blurb: 'Access depends on the provider approving you. Timeline is not in your hands.' }
  };
  var EVID = {
    official: ['Official', 'An official provider page states this.'],
    secondary: ['Secondary', 'Only third-party or community sources state this.'],
    inferred: ['Inferred', 'An estimate or conclusion no source states directly.'],
    unverified: ['Unverified', 'No usable source, or a source check did not support it.']
  };
  var RANK = { unverified: 0, inferred: 1, secondary: 2, official: 3 };
  var CHECK = { supported: 'Re-read and confirmed', partial: 'Partly confirmed', unsupported: 'Page does not confirm it', unreachable: 'Page could not be re-read', not_checked: 'Not re-checked' };
  var WHO = { agent: 'Agent', you: 'You', both: 'Agent + you' };
  var CALLBACK = 'https://backend.composio.dev/api/v3/toolkits/auth/callback';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safe(u) { try { var x = new URL(u); return x.protocol === 'https:' ? x.toString() : null; } catch (e) { return null; } }
  function link(u, inner) { var s = safe(u); return s ? '<a href="' + esc(s) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>' : inner; }
  function hostPath(u) { try { var x = new URL(u); var p = x.pathname.length > 28 ? x.pathname.slice(0, 27) + '…' : x.pathname; return x.hostname + (p === '/' ? '' : p); } catch (e) { return u; } }

  function grade(d, large) {
    var c = DIFF[d], segs = '';
    for (var i = 1; i <= 4; i++) segs += '<span class="grade__seg' + (i <= c.ticks ? ' grade__seg--on' : '') + '"></span>';
    return '<span class="grade grade--' + d + (large ? ' grade--large' : '') + '" role="img" aria-label="Difficulty: ' + c.label + ', ' + c.ticks + ' of 4"><span class="grade__bar" aria-hidden="true">' + segs + '</span><span class="grade__label" aria-hidden="true">' + c.label + '</span></span>';
  }
  function chip(e) {
    if (!e) return '<span class="chip chip--none" title="No claim in the evidence list backs this">No source</span>';
    return '<span class="chip chip--' + e + '" title="' + esc(EVID[e][1]) + '"><span class="chip__mark" aria-hidden="true"></span>' + EVID[e][0] + '</span>';
  }
  function weakest(g, refs) {
    var w = null;
    refs.forEach(function (r) { var c = g.claims.filter(function (x) { return x.id === r; })[0]; if (c && (w === null || RANK[c.evidence] < RANK[w])) w = c.evidence; });
    return w;
  }
  function refs(g, rs) {
    var ids = rs.filter(function (r) { return g.claims.some(function (c) { return c.id === r; }); })
      .map(function (r) { return '<a class="refs__id" href="#' + g.slug + '" data-claim="' + esc(r) + '" aria-label="See evidence ' + esc(r) + '">' + esc(r) + '</a>'; }).join('');
    return '<span class="refs">' + chip(weakest(g, rs)) + ids + '</span>';
  }
  function rows(g, items, f) { return '<ul class="rows">' + items.map(f).join('') + '</ul>'; }

  function guideHTML(g) {
    var counts = { official: 0, secondary: 0, inferred: 0, unverified: 0 };
    g.claims.forEach(function (c) { counts[c.evidence]++; });
    var order = ['official', 'secondary', 'inferred', 'unverified'];
    var countText = order.filter(function (e) { return counts[e] > 0; }).map(function (e) { return counts[e] + ' ' + EVID[e][0].toLowerCase(); }).join(', ');
    var unchecked = g.claims.filter(function (c) { return c.check.status === 'not_checked'; }).length;
    var h = '';
    h += '<article class="guide"><header class="guide__head"><p class="kicker">' + esc(g.app.category) + '</p><h1 class="guide__title">' + esc(g.app.name) + '</h1>';
    h += '<div class="verdict">' + grade(g.verdict.difficulty, true) + '<p class="verdict__headline">' + esc(g.verdict.headline) + '</p></div>';
    h += '<dl class="facts"><div class="facts__item"><dt>Your time</dt><dd>' + esc(g.verdict.effort.label) + '</dd></div>';
    h += '<div class="facts__item"><dt>Provider wait</dt><dd>' + esc(g.verdict.wait.label) + '<span class="facts__basis">' + (g.verdict.wait.basis === 'none' ? 'No source gives a figure' : 'Basis: ' + esc(g.verdict.wait.basis)) + '</span></dd></div>';
    h += '<div class="facts__item"><dt>Tested by a person</dt><dd>' + (g.handsOn.tested ? 'Yes' : 'No') + '<span class="facts__basis">Researched ' + esc(g.researchedOn) + '</span></dd></div></dl>';
    h += '<div class="support"><p class="refs-label">Weakest support behind this verdict</p>' + refs(g, g.verdict.refs) + '</div>';
    h += '<p class="guide__summary">' + esc(g.summary) + '</p><p class="muted small">' + esc(DIFF[g.verdict.difficulty].blurb) + '</p></header>';
    h += '<div class="notice" role="note"><strong>Researched from the provider’s pages, not run by hand.</strong> Claims below show which page supports them and whether a second agent re-checked them.</div>';

    if (g.prerequisites.length) h += '<section class="section"><h2 class="section__title">Have these ready</h2>' + rows(g, g.prerequisites, function (p) { return '<li class="rows__item"><div><strong>' + esc(p.item) + '</strong><p class="rows__detail">' + esc(p.detail) + '</p></div>' + refs(g, p.refs) + '</li>'; }) + '</section>';

    h += '<section class="section"><h2 class="section__title">What the agent can do, and where you take over</h2><div class="split"><div class="split__col split__col--agent"><h3>Agent can</h3><ul>' + g.handoff.agentCanDo.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div><div class="split__col split__col--you"><h3>Only you can</h3><ul>' + g.handoff.youMustDo.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div></div></section>';

    h += '<section class="section"><h2 class="section__title">The route</h2><ol class="route">' + g.steps.map(function (s, i) {
      return '<li class="route__stop route__stop--' + s.who + '"><span class="route__node" aria-hidden="true">' + (i + 1) + '</span><div class="route__body"><div class="route__top"><h3 class="route__title">' + esc(s.title) + '</h3><span class="who who--' + s.who + '">' + WHO[s.who] + '</span></div><p class="route__detail">' + esc(s.detail) + '</p><div class="route__meta">' + refs(g, s.refs) + (s.link ? link(s.link, 'Official page') : '') + '</div></div></li>';
    }).join('') + '</ol></section>';

    if (g.limits.length) h += '<section class="section"><h2 class="section__title">Limits to know</h2>' + rows(g, g.limits, function (l) { return '<li class="rows__item"><div><strong>' + esc(l.title) + '</strong><p class="rows__detail">' + esc(l.detail) + '</p></div>' + refs(g, l.refs) + '</li>'; }) + '</section>';
    if (g.blockers.length) h += '<section class="section"><h2 class="section__title">Where it usually gets stuck</h2>' + rows(g, g.blockers, function (b) { return '<li class="rows__item rows__item--stack"><strong>' + esc(b.problem) + '</strong><p class="rows__detail">' + esc(b.why) + '</p><p class="rows__next"><span class="rows__nextlabel">Next move</span> ' + esc(b.nextMove) + '</p>' + refs(g, b.refs) + '</li>'; }) + '</section>';

    var m = g.composio.managedAuth;
    var mt = m === 'yes' ? 'Composio has an OAuth app for this toolkit, so you can start without registering your own. Register your own app when you need your name on the consent screen, your own scopes or your own rate limits. Then this guide applies to you.'
      : m === 'no' ? 'Composio does not provide an OAuth app for this toolkit, so you register your own with the provider. This guide is that path.'
      : 'Whether Composio provides the OAuth app for this toolkit was not looked up. Composio publishes it per toolkit, so check before you register anything: if it does, you can skip this guide until you need your own app.';
    h += '<section class="section"><h2 class="section__title">If you connect ' + esc(g.app.name) + ' through Composio</h2><div class="panel"><p>' + esc(mt) + '</p><p>Once the provider gives you a client ID and secret, create a custom auth config in Composio and add <code class="code">' + CALLBACK + '</code> as a redirect URI in the provider’s console.</p><p class="muted small">' + esc(g.composio.note) + ' ' + link('https://docs.composio.dev/toolkits/managed-auth', 'Composio: managed and custom auth') + '</p></div></section>';

    h += '<section class="section"><h2 class="section__title">What we know, and how we know it</h2><p class="muted">' + g.claims.length + ' claims behind this guide: ' + countText + '. ' + (unchecked === g.claims.length ? 'A second agent has not re-checked them yet.' : (g.claims.length - unchecked) + ' were re-read by a second agent.') + '</p>';
    if (g.uncertainties.length) h += '<div class="panel panel--warn"><h3 class="panel__title">Could not be confirmed</h3><ul>' + g.uncertainties.map(function (u) { return '<li>' + esc(u) + '</li>'; }).join('') + '</ul></div>';
    if (g.corrections.length) h += '<div class="panel"><h3 class="panel__title">Learned while checking</h3><ul class="corrections">' + g.corrections.map(function (c) { return '<li><span class="corrections__was">' + esc(c.was) + '</span><span class="corrections__now">' + esc(c.now) + '</span><span class="muted small">' + esc(c.why) + '</span></li>'; }).join('') + '</ul></div>';
    h += '<ul class="claims">' + g.claims.map(function (c) {
      return '<li id="claim-' + esc(c.id) + '" class="claims__item"><span class="claims__id">' + esc(c.id) + '</span><div class="claims__body"><p>' + esc(c.text) + '</p><div class="claims__meta">' + chip(c.evidence) + '<span class="check check--' + c.check.status + '">' + CHECK[c.check.status] + '</span>' + c.sources.map(function (u) { return link(u, esc(hostPath(u))); }).join('') + '</div>' + (c.check.note ? '<p class="muted small">' + esc(c.check.note) + '</p>' : '') + '</div></li>';
    }).join('') + '</ul>';
    h += '<h3 class="panel__title">Sources</h3><ul class="sources">' + g.sources.map(function (s) { return '<li class="sources__item">' + link(s.url, esc(s.title)) + '<span class="sources__status sources__status--' + s.status + '">' + (s.status === 'read' ? 'Read' : s.status === 'unreachable' ? 'Could not be read' : 'Not read') + '</span><span class="muted small">' + (s.kind === 'official' ? 'Official' : 'Secondary') + '. ' + esc(s.note) + '</span></li>'; }).join('') + '</ul>';
    h += '<p class="muted small">Researched ' + esc(g.researchedOn) + '. ' + esc(g.handsOn.note) + '</p></section></article>';
    return h;
  }

  function markdown(g) {
    var L = ['# ' + g.app.name + ': OAuth app setup and approval', '', '**' + DIFF[g.verdict.difficulty].label + '.** ' + g.verdict.headline, '', '- Your time: ' + g.verdict.effort.label, '- Provider wait: ' + g.verdict.wait.label, '- Researched on ' + g.researchedOn + '. Not tested hands-on.', '', g.summary, '', '## Steps', ''];
    g.steps.forEach(function (s, i) { L.push((i + 1) + '. **' + s.title + '** [' + WHO[s.who] + ']. ' + s.detail + (s.link ? ' ' + s.link : '')); });
    L.push('', '## What the agent can do, and what only you can', '', 'Agent can:'); g.handoff.agentCanDo.forEach(function (a) { L.push('- ' + a); });
    L.push('', 'You must:'); g.handoff.youMustDo.forEach(function (a) { L.push('- ' + a); });
    L.push('', '## Limits', ''); g.limits.forEach(function (l) { L.push('- **' + l.title + '.** ' + l.detail); });
    L.push('', '## What could not be confirmed', ''); g.uncertainties.forEach(function (u) { L.push('- ' + u); });
    L.push('', '## Sources', ''); g.sources.forEach(function (s) { L.push('- ' + s.title + ': ' + s.url); });
    return L.join('\n');
  }

  var state = { q: '', level: 'all' };
  var app = document.getElementById('app');

  function homeHTML() {
    var t = state.q.trim().toLowerCase();
    var shown = GUIDES.filter(function (g) { return (state.level === 'all' || g.verdict.difficulty === state.level) && (!t || g.app.name.toLowerCase().indexOf(t) >= 0 || g.app.category.toLowerCase().indexOf(t) >= 0); });
    var exact = GUIDES.some(function (g) { return g.app.name.toLowerCase() === t; });
    var filters = [['all', 'All'], ['easy', 'Easy'], ['moderate', 'Moderate'], ['hard', 'Hard'], ['gated', 'Gated']];
    var h = '<section class="hero"><h1 class="hero__title">How hard is it to get an OAuth app approved?</h1><p class="hero__lede">Pick an app to see the time it takes, what the provider asks for, and which steps an agent can do for you. If the app is not on the board, an agent researches it from the provider’s own pages while you wait.</p></section>';
    h += '<div class="finder"><div><label for="finder-q" class="finder__label">Which app do you want to connect?</label><input id="finder-q" class="input input--lg" type="search" autocomplete="off" spellcheck="false" placeholder="App name or website, for example Slack or quickbooks.intuit.com" value="' + esc(state.q) + '"></div>';
    if (state.q.trim().length >= 2 && !exact) h += '<div class="callout"><div><strong>' + (shown.length ? 'Not the one you meant?' : 'No guide for “' + esc(state.q.trim()) + '” yet.') + '</strong><p class="muted small">In the deployed app an agent researches it now from the provider’s own pages and writes a shareable guide. This review copy cannot run it.</p></div><a class="btn btn-primary btn--primary" href="#investigate">See how that works</a></div>';
    h += '<div class="chips" role="group" aria-label="Filter by difficulty">' + filters.map(function (f) { return '<button type="button" class="pill' + (state.level === f[0] ? ' pill--on' : '') + '" data-level="' + f[0] + '" aria-pressed="' + (state.level === f[0]) + '">' + f[1] + '</button>'; }).join('') + '</div>';
    if (shown.length) {
      h += '<ul class="board" aria-label="Guides"><li class="board__head" aria-hidden="true"><span>App</span><span>Difficulty</span><span>Your time</span><span>Provider wait</span></li>' + shown.map(function (g) {
        return '<li><a class="board__row" href="#' + g.slug + '"><span class="board__app"><span class="board__name">' + esc(g.app.name) + '</span><span class="board__cat">' + esc(g.app.category) + '</span></span><span class="board__grade">' + grade(g.verdict.difficulty) + '</span><span class="board__cell" data-label="Your time">' + esc(g.verdict.effort.label) + '</span><span class="board__cell" data-label="Provider wait">' + esc(g.verdict.wait.label) + '</span><span class="board__headline">' + esc(g.verdict.headline) + '</span></a></li>';
      }).join('') + '</ul>';
    } else if (!(state.q.trim().length >= 2 && !exact)) h += '<p class="muted">Nothing matches that filter.</p>';
    h += '</div>';
    h += '<section class="legend" aria-label="How to read a guide"><div><h2 class="legend__title">Grades</h2><ul class="legend__list">' + ['easy', 'moderate', 'hard', 'gated'].map(function (d) { return '<li>' + grade(d) + '<span class="muted small">' + esc(DIFF[d].blurb) + '</span></li>'; }).join('') + '</ul></div><div><h2 class="legend__title">Evidence</h2><ul class="legend__list">' + ['official', 'secondary', 'inferred', 'unverified'].map(function (e) { return '<li>' + chip(e) + '<span class="muted small">' + esc(EVID[e][1]) + '</span></li>'; }).join('') + '</ul></div></section>';
    return h;
  }

  var STAGES = [['research', 'Read the provider’s official pages'], ['draft', 'Draft the guide from what was read'], ['verify', 'Second agent re-reads each cited page'], ['finish', 'Check Composio and save']];
  var SCRIPT = [
    [0, 'stage', 'research', 'Finding and reading the provider’s official pages'],
    [900, 'search', 'quickbooks online oauth app production approval'],
    [1800, 'source', 'Intuit authentication docs', false],
    [2600, 'source', 'Third-party QuickBooks OAuth walkthrough', true],
    [3400, 'source', 'Intuit app review checklist', false],
    [4200, 'stage', 'draft', 'Drafting the guide from 1 page read'],
    [5600, 'stage', 'verify', 'A second agent is re-reading each cited page'],
    [6400, 'check', 3], [6900, 'check', 6],
    [7400, 'warn', 'c3: no official page was read for it, so it is secondary.'],
    [8200, 'stage', 'finish', 'Finishing the guide'],
    [9000, 'done']
  ];
  var timers = [];
  function investigateHTML() {
    return '<section class="hero hero--tight"><h1 class="hero__title">Investigate an app</h1><p class="hero__lede">Type an app name or its website. An agent finds the provider’s developer pages, reads them, writes the guide, and a second agent re-reads every cited page against the claims. You get a link you can share.</p></section>' +
      '<div class="notice" role="note"><strong>Simulation.</strong> This review copy calls no model. The button below replays the screen the deployed app shows, with example events for QuickBooks (whose developer docs render in the browser, so the real agent has to work from thinner sources). A real run needs the deployed app and an API key.</div>' +
      '<div class="gen" style="margin-top:20px"><div class="gen__row"><input id="gen-q" class="input input--lg" value="QuickBooks" aria-label="App name or website" disabled><button id="sim" class="btn btn--primary btn--lg" type="button">Replay the screen</button></div><section class="gen__log" id="log" aria-live="polite"></section></div>';
  }
  function runSim() {
    timers.forEach(clearTimeout); timers = [];
    var f = { stage: -1, msgs: {}, searches: [], sources: [], checks: 0, warns: [], done: false };
    var t0 = Date.now(), btn = document.getElementById('sim'); btn.disabled = true; btn.textContent = 'Replaying…';
    function paint() {
      var log = document.getElementById('log'); if (!log) return;
      var h = '<p class="muted small">' + (f.done ? 'Simulation finished. In the real app this ends on the new guide’s page, saved under a share link.' : 'Simulation running. A real first guide can take a few minutes.') + '</p><ol class="stages">';
      STAGES.forEach(function (s, i) {
        var st = i < f.stage ? 'done' : i === f.stage ? (f.done ? 'done' : 'active') : 'todo'; if (f.done && i <= f.stage) st = 'done';
        h += '<li class="stages__item stages__item--' + st + '"><span class="stages__dot" aria-hidden="true"></span><div><p class="stages__title">' + s[1] + '</p>' + (f.msgs[s[0]] && st !== 'todo' ? '<p class="muted small">' + esc(f.msgs[s[0]]) + '</p>' : '');
        if (i === 0 && f.searches.length) h += '<ul class="feed">' + f.searches.map(function (q) { return '<li>Searched: ' + esc(q) + '</li>'; }).join('') + '</ul>';
        if (i === 0 && f.sources.length) h += '<ul class="feed">' + f.sources.map(function (x) { return '<li class="' + (x.ok ? '' : 'feed__bad') + '">' + (x.ok ? 'Read' : 'Could not read') + ': ' + esc(x.t) + '</li>'; }).join('') + '</ul>';
        if (i === 2 && f.checks) h += '<p class="muted small">' + f.checks + ' claims re-checked so far</p>';
        h += '</div></li>';
      });
      h += '</ol>'; if (f.warns.length) h += '<ul class="feed feed--warn">' + f.warns.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>';
      log.innerHTML = h;
    }
    paint();
    SCRIPT.forEach(function (e) {
      timers.push(setTimeout(function () {
        var k = e[1];
        if (k === 'stage') { f.stage = ['research', 'draft', 'verify', 'finish'].indexOf(e[2]); f.msgs[e[2]] = e[3]; }
        else if (k === 'search') f.searches.push(e[2]);
        else if (k === 'source') f.sources.push({ t: e[2], ok: e[3] });
        else if (k === 'check') f.checks = e[2];
        else if (k === 'warn') f.warns.push(e[2]);
        else if (k === 'done') { f.done = true; var b = document.getElementById('sim'); if (b) { b.disabled = false; b.textContent = 'Replay again'; } }
        paint();
      }, e[0]));
    });
  }

  function render() {
    timers.forEach(clearTimeout); timers = [];
    var hash = (location.hash || '').replace('#', '');
    var g = GUIDES.filter(function (x) { return x.slug === hash; })[0];
    var nav = document.getElementById('nav'); nav.innerHTML = '<a href="#"' + (!hash ? ' aria-current="page"' : '') + '>Guides</a><a href="#investigate"' + (hash === 'investigate' ? ' aria-current="page"' : '') + '>Investigate an app</a>';
    if (g) {
      app.innerHTML = '<div class="copybar"><a class="btn btn--ghost" href="#">All guides</a><button type="button" class="btn btn--ghost" id="copymd">Copy as Markdown</button><span class="copybar__status" id="copystat" role="status" aria-live="polite"></span></div>' + guideHTML(g);
      document.getElementById('copymd').onclick = function () {
        var md = markdown(g), st = document.getElementById('copystat');
        function fallback() { st.innerHTML = 'The browser blocked copying. Select the text below.'; var ta = document.createElement('textarea'); ta.className = 'input'; ta.rows = 8; ta.value = md; ta.id = 'mdfallback'; st.parentNode.appendChild(ta); ta.focus(); ta.select(); }
        try { navigator.clipboard.writeText(md).then(function () { st.textContent = 'Markdown copied.'; setTimeout(function () { st.textContent = ''; }, 2200); }, fallback); } catch (e) { fallback(); }
      };
      app.querySelectorAll('[data-claim]').forEach(function (a) { a.onclick = function (ev) { ev.preventDefault(); var el = document.getElementById('claim-' + a.getAttribute('data-claim')); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('hl'); setTimeout(function () { el.classList.remove('hl'); }, 2000); } }; });
      window.scrollTo(0, 0);
    } else if (hash === 'investigate') {
      app.innerHTML = investigateHTML(); document.getElementById('sim').onclick = runSim; window.scrollTo(0, 0);
    } else {
      app.innerHTML = homeHTML(); bindHome();
    }
  }
  function bindHome() {
    var q = document.getElementById('finder-q');
    q.oninput = function () { state.q = q.value; var pos = q.selectionStart; render(); var n = document.getElementById('finder-q'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} };
    app.querySelectorAll('[data-level]').forEach(function (b) { b.onclick = function () { state.level = b.getAttribute('data-level'); render(); }; });
  }
  window.addEventListener('hashchange', render);
  render();
})();
