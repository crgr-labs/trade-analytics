/*
 * Backtest Lab - UI, journal reader and Binance fetcher.
 *
 * Isolated by design: this page never imports app.js, and it only READS
 * localStorage (tj_trades, tj_custom_parameters, tj_entry_tz_offset_minutes,
 * tj_theme). It has no code path that writes to storage.
 */
(function () {
  'use strict';

  var Core = window.BacktestLabCore;
  var H4 = Core.H4_MS;
  var D1 = Core.D1_MS;

  // Theme: the journal's saved choice (its inline <head> script is not allowed by this page's CSP).
  try { if (localStorage.getItem('tj_theme') === 'dark') document.documentElement.classList.add('dark'); } catch (e) { /* stay light */ }

  // ---------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------

  function $(id) { return document.getElementById(id); }

  // Builds DOM without innerHTML: pair names and tags come from imports / user text.
  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    });
    (kids === undefined ? [] : Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function fmtUtc(ms, full) {
    var d = new Date(ms);
    return (full ? d.getUTCFullYear() + '-' : '') + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) + ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
  }
  function fmtPrice(x) { return x === null || x === undefined ? 'n/a' : String(Number(Number(x).toPrecision(6))); }
  function signed(x, d) { return (x >= 0 ? '+' : '') + x.toFixed(d); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  // ---------------------------------------------------------------------
  // Journal (read-only)
  // ---------------------------------------------------------------------

  // Mirrors PARAMETER_ALIASES / canonicalParameter in app.js, so a tag stored
  // under a retired spelling still matches.
  var ALIASES = {
    '4h break of structure (bos)': '4H BOS',
    'daily uptrend and momentum continuation': 'Daily Uptrend & Momentum'
  };
  function canon(name) {
    var t = String(name == null ? '' : name).trim();
    return ALIASES[t.toLowerCase()] || t;
  }

  function readJson(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // Mirrors getEntryTzOffsetMinutes in app.js: the setting, else the browser's own offset on a 30-minute grid.
  function readTzOffsetMinutes() {
    try {
      var raw = localStorage.getItem('tj_entry_tz_offset_minutes');
      if (raw !== null && raw !== '') return parseInt(raw, 10);
    } catch (e) { /* fall through */ }
    return Math.round(-new Date().getTimezoneOffset() / 30) * 30;
  }
  function tzLabel(min) {
    var a = Math.abs(min);
    return 'UTC' + (min < 0 ? '-' : '+') + pad2(Math.floor(a / 60)) + ':' + pad2(a % 60);
  }

  function normalizePair(pair) {
    return String(pair == null ? '' : pair).toUpperCase().replace(/\.P$/, '').replace(/[^A-Z0-9]/g, '');
  }

  // Same conversion as timelineEntryMoment in app.js (manual entries are wall-clock in the
  // journal timezone, MEXC imports are already UTC), except a missing entry time
  // falls back to the END of the trade's date instead of "unknown".
  function tradeAnchor(trade, offsetMin) {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trade.date || '');
    if (!d) return null;
    var off = trade.source === 'mexc-import' ? 0 : offsetMin;
    var t = /^(\d{1,2}):(\d{2})$/.exec(trade.entryTime || '');
    if (t) return { ms: Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]) - off * 60000, noTime: false };
    return { ms: Date.UTC(+d[1], +d[2] - 1, +d[3] + 1) - 1 - off * 60000, noTime: true };
  }

  function loadJournal() {
    var stored = readJson('tj_trades');
    var tzOffset = readTzOffsetMinutes();
    var info = { trades: [], skipped: 0, totalLogged: 0, tzOffset: tzOffset, problem: null };
    if (!Array.isArray(stored) || !stored.length) {
      info.problem = 'No trades found in this browser\'s localStorage (tj_trades). Open the journal on this same origin first.';
    } else {
      info.totalLogged = stored.length;
      stored.forEach(function (t) {
        var symbol = normalizePair(t.pair);
        var anchor = symbol ? tradeAnchor(t, tzOffset) : null;
        if (!symbol || !anchor) { info.skipped++; return; }
        var list = Array.isArray(t.parameters) ? t.parameters : (Array.isArray(t.confluence) ? t.confluence : []);
        var seen = {};
        var tags = list.map(canon).filter(function (x) {
          var k = x.toLowerCase();
          if (!x || seen[k]) return false;
          seen[k] = true;
          return true;
        });
        var status = {};
        Object.keys(t.parameterStatus || {}).forEach(function (name) {
          var v = t.parameterStatus[name];
          if (v === 'pending' || v === 'failed') status[canon(name).toLowerCase()] = v;
        });
        info.trades.push({
          id: String(t.id), pair: String(t.pair), symbol: symbol, date: t.date, entryTime: t.entryTime || '',
          direction: t.direction || '', outcome: t.outcome || '', tags: tags, tagStatus: status,
          anchorMs: anchor.ms, noEntryTime: anchor.noTime
        });
      });
      info.trades.sort(function (a, b) { return a.anchorMs - b.anchorMs; });
    }

    // Tag names come from the journal's own parameter vocabulary.
    var vocab = readJson('tj_custom_parameters');
    var names = [];
    var seenName = {};
    (Array.isArray(vocab) ? vocab : []).forEach(function (e) {
      var n = canon(typeof e === 'string' ? e : e && e.name);
      if (n && !seenName[n.toLowerCase()]) { seenName[n.toLowerCase()] = true; names.push(n); }
    });
    info.vocabFromStorage = names.length > 0;
    if (!names.length) {
      // The vocabulary is seeded when the journal first runs; fall back to what trades actually carry.
      info.trades.forEach(function (t) {
        t.tags.forEach(function (n) { if (!seenName[n.toLowerCase()]) { seenName[n.toLowerCase()] = true; names.push(n); } });
      });
    }
    info.vocab = names;
    return info;
  }

  // ---------------------------------------------------------------------
  // Binance klines (public, unauthenticated)
  // ---------------------------------------------------------------------

  var VENUES = [
    { key: 'futures', label: 'Binance futures', url: 'https://fapi.binance.com/fapi/v1/klines' },
    { key: 'spot', label: 'Binance spot', url: 'https://api.binance.com/api/v3/klines' }
  ];
  var MIN_GAP_MS = 350;        // spacing between any two requests
  var MAX_RETRIES = 3;
  var lastRequestAt = 0;

  async function fetchKlines(venue, symbol, interval, limit, endMs) {
    var url = venue.url + '?symbol=' + encodeURIComponent(symbol) + '&interval=' + interval + '&limit=' + limit + '&endTime=' + endMs;
    for (var attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      var wait = lastRequestAt + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastRequestAt = Date.now();
      var res;
      try {
        var ctrl = new AbortController();
        var timer = setTimeout(function () { ctrl.abort(); }, 20000);
        res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
      } catch (e) {
        if (attempt < MAX_RETRIES) { await sleep(1000 * (attempt + 1)); continue; }
        // Binance spot answers an unknown symbol with a 400 that has no CORS header, which the browser reports as a bare network failure.
        return { error: 'network', message: e && e.name === 'AbortError' ? 'request timed out' : 'no readable response (offline, blocked, or Binance rejected the symbol without CORS headers, usually meaning it is not listed there)' };
      }
      if (res.status === 429 || res.status === 418) {
        var ra = parseInt(res.headers.get('Retry-After') || '', 10);
        if (attempt < MAX_RETRIES) { await sleep(Math.min(60, isNaN(ra) ? 5 * (attempt + 1) : ra) * 1000); continue; }
        return { error: 'ratelimit', message: 'rate limited by Binance (HTTP ' + res.status + ') after ' + MAX_RETRIES + ' retries' };
      }
      if (res.status >= 500 && attempt < MAX_RETRIES) { await sleep(1000 * (attempt + 1)); continue; }
      var body = null;
      try { body = await res.json(); } catch (e) { body = null; }
      if (res.ok && Array.isArray(body)) return { rows: body };
      if (body && body.code === -1121) return { error: 'notlisted', message: 'symbol not listed' };
      if (res.status === 451) return { error: 'blocked', message: 'blocked in this region (HTTP 451)' };
      return { error: 'http', message: 'HTTP ' + res.status + (body && body.msg ? ': ' + body.msg : '') };
    }
    return { error: 'network', message: 'request failed' };
  }

  // Tries futures, then spot, and takes the first venue whose 4H data is usable.
  // Never substitutes anything: every failure is reported with its reason.
  async function fetchPair(symbol, endMs) {
    var reasons = [];
    for (var v = 0; v < VENUES.length; v++) {
      var venue = VENUES[v];
      var r4 = await fetchKlines(venue, symbol, '4h', 1000, endMs);
      if (r4.error) { reasons.push(venue.label + ': ' + r4.message); continue; }
      var rows = r4.rows;
      if (!rows.length) { reasons.push(venue.label + ': returned no candles (empty data)'); continue; }
      var lastOpen = rows[rows.length - 1][0];
      if (endMs - (lastOpen + H4) >= H4) {
        reasons.push(venue.label + ': data ends ' + fmtUtc(lastOpen + H4, true) + ' UTC, ' + Math.round((endMs - lastOpen) / 86400000) +
          ' days before the latest trade (delisted or no data for that period)');
        continue;
      }
      if (rows.every(function (r) { return Number(r[5]) === 0; })) { reasons.push(venue.label + ': every candle has zero volume'); continue; }
      if (rows.length < Core.WARMUP) {
        reasons.push(venue.label + ': only ' + rows.length + ' 4H candles (< ' + Core.WARMUP + ' needed for indicator warm-up)');
        continue;
      }
      var out = { ok: true, venue: venue.label, h4Rows: rows, d1Rows: null, dailyNote: null };
      var r1 = await fetchKlines(venue, symbol, '1d', 500, endMs);
      if (r1.error) out.dailyNote = 'daily data unavailable (' + r1.message + ')';
      else if (!r1.rows.length) out.dailyNote = 'daily data unavailable (empty response)';
      else if (r1.rows.length < Core.WARMUP) out.dailyNote = 'only ' + r1.rows.length + ' daily candles (< ' + Core.WARMUP + ' needed), so daily detectors are n/a';
      else if (endMs - (r1.rows[r1.rows.length - 1][0] + D1) >= D1) out.dailyNote = 'daily data ends before the latest trade';
      else out.d1Rows = r1.rows;
      return out;
    }
    return { ok: false, reason: reasons.join('  |  ') };
  }

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------

  var S = {
    journal: null,
    detectors: Core.getDetectors(),
    params: {},          // detector id -> current parameter values
    tagChoice: {},       // detector id -> chosen journal tag name ('' = none)
    combo: {},           // detector id -> bool
    ignoreNonPassed: false,
    pairs: {},           // symbol -> { symbol, endMs, ok, venue, h4, d1, dailyNote, reason, h4Rows, d1Rows }
    cache: {},           // symbol|endMs -> fetched result (in-memory only)
    fetching: false,
    fetchedAt: 0,
    results: null,
    chartTradeId: null,
    chartScale: 'recent',
    charts: []
  };

  function detById(id) { return S.detectors.filter(function (d) { return d.id === id; })[0]; }

  // ---------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------

  function tradeHasTag(trade, tagName) {
    if (!tagName || !Core.hasTag(trade.tags, tagName)) return false;
    return !(S.ignoreNonPassed && trade.tagStatus[tagName.toLowerCase()]);
  }

  function comboIds() { return S.detectors.filter(function (d) { return S.combo[d.id]; }).map(function (d) { return d.id; }); }

  function comboTags(ids) {
    var tags = [];
    for (var i = 0; i < ids.length; i++) {
      var t = S.tagChoice[ids[i]];
      if (!t) return null;
      if (tags.indexOf(t) === -1) tags.push(t);
    }
    return tags;
  }

  function evaluateAll(pair, anchorMs) {
    var res = {};
    S.detectors.forEach(function (d) { res[d.id] = Core.evaluateDetector(d, S.params[d.id], pair, anchorMs); });
    return res;
  }

  function compute() {
    var ids = comboIds();
    var cTags = comboTags(ids);
    var now = Date.now();
    var rows = S.journal.trades.map(function (tr) {
      var pd = S.pairs[tr.symbol];
      var row = { trade: tr, pair: pd, results: null, combo: null, tagged: {}, comboTagged: null };
      if (!pd || !pd.ok) return row;
      row.results = evaluateAll(pd, tr.anchorMs);
      S.detectors.forEach(function (d) { row.tagged[d.id] = S.tagChoice[d.id] ? tradeHasTag(tr, S.tagChoice[d.id]) : null; });
      row.combo = Core.combine(row.results, ids);
      if (ids.length && cTags) row.comboTagged = cTags.every(function (t) { return tradeHasTag(tr, t); });
      return row;
    });

    // Base rate: every 4H close after warm-up in the fetched history of the tested pairs.
    var base = {}; S.detectors.forEach(function (d) { base[d.id] = { fires: 0, n: 0 }; });
    var baseCombo = { fires: 0, n: 0 };
    var used = {};
    rows.forEach(function (r) { if (r.pair && r.pair.ok) used[r.pair.symbol] = r.pair; });
    Object.keys(used).forEach(function (sym) {
      var pd = used[sym];
      Core.baseAnchors(pd, now).forEach(function (a) {
        var res = evaluateAll(pd, a);
        S.detectors.forEach(function (d) {
          if (res[d.id].status === 'ok') { base[d.id].n++; if (res[d.id].fired) base[d.id].fires++; }
        });
        var c = Core.combine(res, ids);
        if (c && c.status === 'ok') { baseCombo.n++; if (c.fired) baseCombo.fires++; }
      });
    });

    var detStats = {};
    S.detectors.forEach(function (d) {
      var tag = S.tagChoice[d.id] || null;
      var usable = rows.filter(function (r) { return r.results && r.results[d.id].status === 'ok'; });
      var t = Core.tally(usable.map(function (r) { return { tagged: !!r.tagged[d.id], fired: r.results[d.id].fired }; }));
      detStats[d.id] = {
        tag: tag, summary: Core.summarize(t, base[d.id].fires, base[d.id].n),
        usable: usable.length, na: rows.filter(function (r) { return r.results && r.results[d.id].status !== 'ok'; }).length
      };
    });

    var comboStats = null;
    if (ids.length) {
      var usableC = rows.filter(function (r) { return r.combo && r.combo.status === 'ok'; });
      var tc = Core.tally(usableC.map(function (r) { return { tagged: !!r.comboTagged, fired: r.combo.fired }; }));
      comboStats = {
        ids: ids, tags: cTags, summary: Core.summarize(tc, baseCombo.fires, baseCombo.n), usable: usableC.length,
        na: rows.filter(function (r) { return r.combo && r.combo.status !== 'ok'; }).length
      };
    }

    var verdicts = S.detectors.map(function (d) {
      var st = detStats[d.id];
      return { id: d.id, text: Core.verdictLine(d.label, st.summary, { noTag: !st.tag }), combo: false };
    });
    if (comboStats) {
      var label = 'COMBINATION (' + ids.map(function (i) { return detById(i).label; }).join(' + ') + ')';
      verdicts.push({ id: 'combination', text: Core.verdictLine(label, comboStats.summary, { noTag: !cTags }), combo: true });
    }

    S.results = { rows: rows, detStats: detStats, comboStats: comboStats, verdicts: verdicts, base: base, baseCombo: baseCombo };
  }

  // ---------------------------------------------------------------------
  // Rendering: controls (built once)
  // ---------------------------------------------------------------------

  var relayout = debounce(function () { if (S.journal && S.journal.trades.length) { recompute(); } }, 250);

  function buildParamInput(def, spec) {
    var id = 'bl-p-' + def.id + '-' + spec.key;
    var input;
    if (spec.type === 'select') {
      input = el('select', { class: 'bl-input', id: id }, spec.options.map(function (o) { return el('option', { value: o[0], text: o[1] }); }));
      input.value = S.params[def.id][spec.key];
      input.addEventListener('change', function () { S.params[def.id][spec.key] = input.value; onParamChange(def); });
    } else {
      input = el('input', { class: 'bl-input', id: id, type: 'number', min: spec.min, max: spec.max, step: spec.step || (spec.type === 'int' ? 1 : 'any'), value: spec.default });
      input.addEventListener('input', function () {
        var v = Number(input.value);
        var ok = input.value.trim() !== '' && isFinite(v) && (spec.type !== 'int' || Math.floor(v) === v) &&
          (spec.min === undefined || v >= spec.min) && (spec.max === undefined || v <= spec.max);
        input.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (!ok) return;       // keep the last valid value until the field is valid again
        S.params[def.id][spec.key] = v;
        onParamChange(def);
      });
    }
    return el('label', { class: 'bl-param', for: id }, [spec.label, input]);
  }

  var defTextNodes = {};
  function onParamChange(def) {
    if (defTextNodes[def.id]) defTextNodes[def.id].textContent = Core.definitionText(def, S.params[def.id]);
    relayout();
  }

  function buildControls() {
    var host = $('bl-detector-cards');
    clear(host);
    S.detectors.forEach(function (d) {
      S.params[d.id] = Core.defaultParams(d);
      S.tagChoice[d.id] = Core.resolveTag(d, S.journal.vocab) || '';
      S.combo[d.id] = false;

      var check = el('input', { type: 'checkbox', id: 'bl-c-' + d.id, 'aria-label': 'Include ' + d.label + ' in the combination' });
      check.addEventListener('change', function () { S.combo[d.id] = check.checked; recompute(); });

      var tagSel = el('select', { class: 'bl-input', 'aria-label': 'Journal tag validated by ' + d.label }, [el('option', { value: '', text: '(no tag)' })]
        .concat(S.journal.vocab.map(function (n) { return el('option', { value: n, text: n }); })));
      tagSel.value = S.tagChoice[d.id];
      tagSel.addEventListener('change', function () { S.tagChoice[d.id] = tagSel.value; recompute(); });

      var defText = el('div', { class: 'bl-def', text: Core.definitionText(d, S.params[d.id]) });
      defTextNodes[d.id] = defText;

      host.appendChild(el('div', { class: 'bl-card' }, [
        el('div', { class: 'bl-card-head' }, [
          el('label', { class: 'bl-check' }, [check, el('span', { class: 'bl-card-title', text: d.label })]),
          el('span', { class: 'bl-badge', text: d.type + ' · ' + (d.timeframe === '1d' ? 'daily' : '4H') })
        ]),
        defText,
        el('div', { class: 'bl-params' }, d.params.map(function (spec) { return buildParamInput(d, spec); })),
        el('div', { class: 'bl-tagline' }, [el('span', { class: 'bl-muted', text: 'Validates tag:' }), tagSel,
          S.tagChoice[d.id] ? null : el('span', { class: 'bl-badge bl-badge-na', text: 'not in vocabulary' })])
      ]));
    });
  }

  function renderCoverage() {
    var host = $('bl-coverage');
    clear(host);
    S.journal.vocab.forEach(function (name) {
      var mine = S.detectors.filter(function (d) { return S.tagChoice[d.id] && S.tagChoice[d.id].toLowerCase() === name.toLowerCase(); });
      if (mine.length) {
        host.appendChild(el('span', { class: 'bl-chip' }, [name + ' ', el('small', { text: '→ ' + mine.map(function (d) { return d.label; }).join(', ') })]));
      } else {
        host.appendChild(el('span', { class: 'bl-chip bl-chip-none' }, [name + ' ', el('small', { text: '· no detector yet' })]));
      }
    });
    if (!S.journal.vocab.length) host.appendChild(el('span', { class: 'bl-note', text: 'No parameter vocabulary found.' }));
  }

  // ---------------------------------------------------------------------
  // Rendering: results
  // ---------------------------------------------------------------------

  function valueText(def, res) {
    if (res.status !== 'ok') return res.reason;
    var v = res.value;
    if (def.id.indexOf('rsi') === 0) {
      return 'RSI ' + v.rsi.toFixed(1) + ' (' + signed(v.distance, 1) + ' vs ' + v.threshold + ')' +
        (v.prev !== null ? ' · prev ' + v.prev.toFixed(1) : '') + ' · bar ' + fmtUtc(v.barT);
    }
    if (def.id === 'daily-momentum') {
      var day = new Date(v.prevBarT).toISOString().slice(0, 10);
      var gains = 'prev day ' + day + ': ' + (v.gainPrevClose === null ? 'n/a' : signed(v.gainPrevClose, 1) + '%') + ' vs prev close / ' +
        (v.gainOpen === null ? 'n/a' : signed(v.gainOpen, 1) + '%') + ' vs open';
      var gap = 'new day opened ' + (v.openGapPct === null ? 'n/a' : signed(v.openGapPct, 2) + '%') + ' vs prev close (' + fmtPrice(v.newOpen) + ' vs ' + fmtPrice(v.prevClose) + ')';
      return (res.fired ? '' : 'failed: ' + v.failed.join('; ') + ' · ') + gains + ' · ' + gap;
    }
    if (def.id === 'volume-spike') {
      if (res.fired) return 'x' + v.ratio.toFixed(2) + ' >= ' + v.k + ' · ' + v.barsAgo + ' bars ago (' + fmtUtc(v.barT) + ')';
      return v.ratio === null ? 'no usable volume average in the last ' + v.L : 'max x' + v.ratio.toFixed(2) + ' (< ' + v.k + ') in the last ' + v.L;
    }
    // BOS family
    if (res.fired) {
      return 'broke ' + fmtPrice(v.level) + ' @ ' + fmtUtc(v.bosT) + ' · ' + v.barsAgo + ' bars ago · swing ' + fmtUtc(v.swingT) +
        (v.scales ? ' · scales: ' + v.scales.join(', ') : ' · N=' + v.N);
    }
    if (v.last) return 'no BOS in the last ' + v.L + ' · last: ' + fmtPrice(v.last.level) + ' @ ' + fmtUtc(v.last.bosT) + ' (' + v.last.barsAgo + ' bars ago)';
    return 'no BOS in the last ' + v.L + ' (none earlier in the fetched history)';
  }

  function detectorCell(def, res, tagged, tagName) {
    var badges = [];
    var cls = 'bl-cell';
    if (res.status !== 'ok') {
      badges.push(el('span', { class: 'bl-badge bl-badge-na', text: 'n/a' }));
    } else {
      badges.push(el('span', { class: 'bl-badge ' + (res.fired ? 'bl-badge-fired' : 'bl-badge-not'), text: res.fired ? 'fired' : 'not fired' }));
      if (tagName) {
        badges.push(el('span', { class: 'bl-badge ' + (tagged ? 'bl-badge-tag' : 'bl-badge-not'), text: tagged ? 'tagged' : 'not tagged' }));
        cls += res.fired === tagged ? ' bl-match' : ' bl-miss';
      } else {
        badges.push(el('span', { class: 'bl-badge bl-badge-na', text: 'no tag mapped' }));
      }
    }
    return el('td', { class: cls }, el('div', { class: 'bl-cell-lines' }, [el('div', { class: 'bl-cell-badges' }, badges), el('div', { class: 'bl-val', text: valueText(def, res) })]));
  }

  function comboCell(row) {
    if (!row.combo) return el('td', { class: 'bl-cell bl-muted', text: 'no combination selected' });
    var badges = [];
    var cls = 'bl-cell';
    if (row.combo.status !== 'ok') {
      badges.push(el('span', { class: 'bl-badge bl-badge-na', text: 'n/a' }));
      return el('td', { class: cls }, el('div', { class: 'bl-cell-lines' }, [el('div', { class: 'bl-cell-badges' }, badges), el('div', { class: 'bl-val', text: row.combo.reason })]));
    }
    badges.push(el('span', { class: 'bl-badge ' + (row.combo.fired ? 'bl-badge-fired' : 'bl-badge-not'), text: row.combo.fired ? 'fired' : 'not fired' }));
    if (row.comboTagged === null) {
      badges.push(el('span', { class: 'bl-badge bl-badge-na', text: 'no tag mapped' }));
    } else {
      badges.push(el('span', { class: 'bl-badge ' + (row.comboTagged ? 'bl-badge-tag' : 'bl-badge-not'), text: row.comboTagged ? 'all tagged' : 'not all tagged' }));
      cls += row.combo.fired === row.comboTagged ? ' bl-match' : ' bl-miss';
    }
    var parts = comboIds().map(function (id) { return detById(id).label + ': ' + (row.results[id].fired ? 'yes' : 'no'); });
    return el('td', { class: cls }, el('div', { class: 'bl-cell-lines' }, [el('div', { class: 'bl-cell-badges' }, badges), el('div', { class: 'bl-val', text: parts.join(' · ') })]));
  }

  function renderTradeTable() {
    var table = $('bl-trade-table');
    clear(table);
    var head = el('tr', {}, [el('th', { text: 'Trade' })]);
    S.detectors.forEach(function (d) { head.appendChild(el('th', { text: d.label })); });
    head.appendChild(el('th', { text: 'Combination' }));
    head.appendChild(el('th', { text: '' }));
    table.appendChild(el('thead', {}, head));
    var body = el('tbody');
    S.results.rows.forEach(function (row) {
      var tr = row.trade;
      var first = [
        el('div', {}, [el('strong', { text: tr.pair }), ' ', el('span', { class: 'bl-muted', text: tr.direction })]),
        el('div', { class: 'bl-val', text: fmtUtc(tr.anchorMs, true) + ' UTC' })
      ];
      if (tr.noEntryTime) first.push(el('div', {}, el('span', { class: 'bl-flag', text: 'no entry time (end of date used)' })));
      var tr_el = el('tr', {}, [el('td', { class: 'bl-first' }, first)]);
      if (!row.results) {
        tr_el.appendChild(el('td', { class: 'bl-cell bl-muted', colspan: S.detectors.length + 1 }, 'Not tested: ' + (row.pair ? row.pair.reason : 'no data fetched yet')));
        tr_el.appendChild(el('td'));
      } else {
        S.detectors.forEach(function (d) {
          tr_el.appendChild(detectorCell(d, row.results[d.id], row.tagged[d.id], S.tagChoice[d.id]));
        });
        tr_el.appendChild(comboCell(row));
        tr_el.appendChild(el('td', {}, el('button', { type: 'button', class: 'bl-btn bl-btn-sm', text: 'Chart', onclick: function () { showChart(tr.id, true); } })));
      }
      body.appendChild(tr_el);
    });
    table.appendChild(body);
  }

  function renderStats() {
    var R = S.results;
    var vlist = $('bl-verdicts');
    clear(vlist);
    R.verdicts.forEach(function (v) { vlist.appendChild(el('li', { class: v.combo ? 'bl-combo' : '', text: v.text })); });

    var table = $('bl-stats');
    clear(table);
    var cols = ['Detector', 'Tag', 'n', 'Tagged + fired', 'Tagged, not fired', 'Fired, not tagged', 'Neither', 'Agreement', 'Precision', 'Base rate', 'Lift', 'Sample'];
    table.appendChild(el('thead', {}, el('tr', {}, cols.map(function (c, i) { return el('th', { class: i >= 2 && i <= 10 ? 'bl-num' : '', text: c }); }))));
    var body = el('tbody');
    function statRow(label, tag, st, usable, na, isCombo) {
      var s = st.summary;
      var sample = [];
      sample.push(el('span', { class: 'bl-muted', text: s.tagged + ' tagged / ' + s.n + ' tested' + (na ? ' (' + na + ' n/a)' : '') }));
      if (s.indicativeOnly) sample.push(' ', el('span', { class: 'bl-badge bl-badge-ind', text: 'indicative only' }));
      var noTag = !tag;
      var dash = function (x) { return noTag ? '–' : x; };
      body.appendChild(el('tr', { class: isCombo ? 'bl-match' : '' }, [
        el('td', {}, el('strong', { text: label })),
        el('td', { text: tag ? (Array.isArray(tag) ? tag.join(' + ') : tag) : 'none in vocabulary' }),
        el('td', { class: 'bl-num', text: String(s.n) }),
        el('td', { class: 'bl-num', text: dash(s.tp) }), el('td', { class: 'bl-num', text: dash(s.fn) }),
        el('td', { class: 'bl-num', text: dash(s.fp) }), el('td', { class: 'bl-num', text: dash(s.tn) }),
        el('td', { class: 'bl-num', text: noTag ? '–' : Core.pct(s.agreement) + (s.agreement !== null ? ' (' + s.tp + '/' + s.tagged + ')' : '') }),
        el('td', { class: 'bl-num', text: noTag ? '–' : Core.pct(s.precision) + (s.precision !== null ? ' (' + s.tp + '/' + s.fired + ')' : '') }),
        el('td', { class: 'bl-num', text: Core.pct(s.baseRate) + (s.baseN ? ' (' + s.baseFires + '/' + s.baseN + ')' : '') }),
        el('td', { class: 'bl-num', text: noTag ? '–' : Core.num(s.lift, 2) }),
        el('td', {}, sample)
      ]));
    }
    S.detectors.forEach(function (d) { statRow(d.label, R.detStats[d.id].tag, R.detStats[d.id], R.detStats[d.id].usable, R.detStats[d.id].na, false); });
    if (R.comboStats) {
      statRow('Combination', R.comboStats.tags, R.comboStats, R.comboStats.usable, R.comboStats.na, true);
    }
    table.appendChild(body);
    $('bl-stats-note').textContent =
      'Agreement = tagged+fired / tagged. Precision = tagged+fired / fired. Base rate = share of ALL 4H anchor points (each 4H close after ' + Core.WARMUP +
      '-candle warm-up, same pairs) where the detector, or the whole combination, fires. Lift = agreement / base rate. "n" counts trades the detector could evaluate (n/a trades are excluded). Fewer than ' +
      Core.MIN_TAGGED + ' tagged trades = indicative only.';
  }

  function renderData() {
    var host = $('bl-data');
    clear(host);
    var symbols = Object.keys(S.pairs);
    if (!symbols.length) return;
    var table = el('table', { class: 'bl-table' });
    table.appendChild(el('thead', {}, el('tr', {}, ['Pair', 'Source', '4H candles', 'Daily candles', 'Trades', 'Status'].map(function (c) { return el('th', { text: c }); }))));
    var body = el('tbody');
    symbols.forEach(function (sym) {
      var pd = S.pairs[sym];
      var n = S.journal.trades.filter(function (t) { return t.symbol === sym; }).length;
      var range = pd.ok ? fmtUtc(pd.h4.t[0], true) + ' → ' + fmtUtc(pd.h4.t[pd.h4.n - 1], true) : '';
      var status = !pd.ok ? 'Skipped: ' + pd.reason : (pd.dailyNote ? 'Tested (4H only): ' + pd.dailyNote : 'Tested');
      body.appendChild(el('tr', {}, [
        el('td', {}, el('strong', { text: sym })),
        el('td', { text: pd.ok ? pd.venue : '–' }),
        el('td', {}, pd.ok ? [String(pd.h4.n), el('div', { class: 'bl-val', text: range })] : '–'),
        el('td', { text: pd.ok && pd.d1 ? String(pd.d1.n) : '–' }),
        el('td', { class: 'bl-num', text: String(n) }),
        el('td', { class: pd.ok && !pd.dailyNote ? '' : 'bl-muted', text: status })
      ]));
    });
    table.appendChild(body);
    host.appendChild(el('div', { class: 'bl-scroll' }, table));
  }

  function renderUntested() {
    var host = $('bl-untested-list');
    clear(host);
    var J = S.journal;
    var any = false;
    Object.keys(S.pairs).forEach(function (sym) {
      var pd = S.pairs[sym];
      if (pd.ok && !pd.dailyNote) return;
      any = true;
      var n = J.trades.filter(function (t) { return t.symbol === sym; }).length;
      host.appendChild(el('div', { class: 'bl-untested-item' }, [
        el('strong', { text: sym }), el('span', { class: 'bl-muted', text: ' · ' + n + ' trade' + (n === 1 ? '' : 's') + ' · ' }),
        pd.ok ? 'Partially tested (daily detectors n/a): ' + pd.dailyNote : 'Not tested: ' + pd.reason
      ]));
    });
    if (J.skipped) {
      any = true;
      host.appendChild(el('div', { class: 'bl-untested-item' }, el('span', { class: 'bl-muted', text: J.skipped + ' logged trade' + (J.skipped === 1 ? '' : 's') + ' have no pair or no valid date and are excluded.' })));
    }
    // Trades whose anchor falls before a tested pair's warm-up window are n/a per detector; surface the count.
    if (S.results) {
      var early = S.results.rows.filter(function (r) { return r.results && S.detectors.every(function (d) { return r.results[d.id].status !== 'ok'; }); }).length;
      if (early) {
        any = true;
        host.appendChild(el('div', { class: 'bl-untested-item' }, el('span', { class: 'bl-muted', text: early + ' trade' + (early === 1 ? '' : 's') + ' on tested pairs could not be evaluated by any detector (anchor outside the fetched window or before warm-up); see the n/a reasons in the table.' })));
      }
    }
    if (!any) host.appendChild(el('div', { class: 'bl-note', text: 'Every pair with a logged trade was tested.' }));
  }

  // ---------------------------------------------------------------------
  // Chart
  // ---------------------------------------------------------------------

  function themeRgb(name, alpha) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!v) return alpha === undefined ? '#888' : 'rgba(136,136,136,' + alpha + ')';
    var p = v.split(/\s+/).join(',');
    return alpha === undefined ? 'rgb(' + p + ')' : 'rgba(' + p + ',' + alpha + ')';
  }

  function destroyCharts() {
    S.charts.forEach(function (c) { try { c.remove(); } catch (e) { /* already gone */ } });
    S.charts = [];
  }

  function fillTradeSelect() {
    var sel = $('bl-chart-trade');
    clear(sel);
    S.results.rows.forEach(function (r) {
      if (!r.results) return;
      sel.appendChild(el('option', { value: r.trade.id, text: r.trade.pair + ' · ' + fmtUtc(r.trade.anchorMs, true) }));
    });
    if (S.chartTradeId) sel.value = S.chartTradeId;
  }

  function showChart(id, scroll) {
    S.chartTradeId = id;
    var sel = $('bl-chart-trade');
    if (sel.value !== id) sel.value = id;
    renderChart();
    if (scroll) $('bl-chart-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderChart() {
    destroyCharts();
    var msg = $('bl-chart-msg');
    msg.textContent = '';
    $('bl-chart-legend').textContent = '';
    if (!S.results) { msg.textContent = 'Run the validation first.'; return; }
    var row = S.results.rows.filter(function (r) { return r.trade.id === S.chartTradeId && r.results; })[0];
    if (!row) { msg.textContent = 'Pick a tested trade to chart it.'; return; }
    var LW = window.LightweightCharts;
    if (!LW) { msg.textContent = 'The charting library failed to load (vendor/lightweight-charts.standalone.production.js).'; return; }

    var s = row.pair.h4;
    var i4 = Core.lastCompletedIndex(s, row.trade.anchorMs);
    if (i4 < 0) { msg.textContent = 'This trade is before the first fetched 4H candle.'; return; }
    var entryIdx = Core.containingIndex(s, row.trade.anchorMs);
    var from = Math.max(0, i4 - 160);
    var to = Math.min(s.n - 1, i4 + 1);        // the candle holding the entry; nothing later
    if (entryIdx < 0 || entryIdx > to) entryIdx = to;

    var scale = S.chartScale;
    var bosDef = detById('bos-' + scale);
    var bp = S.params[bosDef.id];
    var scan = Core.bosScan(s, bp.N, bp.mode);
    var t = function (i) { return Math.floor(s.t[i] / 1000); };

    var text = themeRgb('--c-on-surface-variant');
    var grid = themeRgb('--c-outline-variant', 0.35);
    var layout = {
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: grid, minimumWidth: 72 },
      timeScale: { borderColor: grid, timeVisible: true, secondsVisible: false },
      autoSize: true
    };
    var priceChart = LW.createChart($('bl-chart-price'), layout);
    var rsiChart = LW.createChart($('bl-chart-rsi'), layout);
    S.charts = [priceChart, rsiChart];

    var candles = priceChart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' });
    var data = [];
    for (var i = from; i <= to; i++) data.push({ time: t(i), open: s.o[i], high: s.h[i], low: s.l[i], close: s.c[i] });
    candles.setData(data);

    var markers = [];
    var amber = themeRgb('--c-warning');
    var grey = themeRgb('--c-outline');
    var green = '#16a34a';
    var primary = themeRgb('--c-primary');

    // Swing highs the detector could see at the anchor (j + N <= last completed candle).
    scan.swings.forEach(function (j) {
      if (j < from || j + bp.N > i4) return;
      var broken = scan.brokenAt[j] !== undefined && scan.brokenAt[j] <= i4;
      markers.push({ time: t(j), position: 'aboveBar', shape: 'circle', color: broken ? grey : amber, size: 0.6 });
    });

    // BOS events up to the anchor: the level runs from its swing to the breaking candle.
    var windowLo = i4 - bp.L + 1;
    scan.events.forEach(function (ev) {
      if (ev.i > i4 || ev.i < from) return;
      var inWindow = ev.i >= windowLo;
      if (ev.i > from) {       // a line needs two distinct times
        var line = priceChart.addLineSeries({
          color: inWindow ? green : grey, lineWidth: inWindow ? 2 : 1, lineStyle: inWindow ? 0 : 2,
          lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false
        });
        line.setData([{ time: t(Math.max(ev.swing, from)), value: ev.level }, { time: t(ev.i), value: ev.level }]);
      }
      markers.push({ time: t(ev.i), position: 'belowBar', shape: 'arrowUp', color: inWindow ? green : grey, text: inWindow ? 'BOS ' + fmtPrice(ev.level) : '' });
    });

    markers.push({ time: t(entryIdx), position: 'aboveBar', shape: 'arrowDown', color: primary, text: row.trade.noEntryTime ? 'Entry (date end)' : 'Entry', size: 1.4 });
    markers.sort(function (a, b) { return a.time - b.time; });
    candles.setMarkers(markers);

    // 4H RSI with the detector's threshold. Points before the RSI exists are blanks so both charts share one time axis.
    var rp = S.params['rsi-4h-above'];
    var rsi = Core.rsiSeries(s, rp.period);
    var rsiLine = rsiChart.addLineSeries({ color: primary, lineWidth: 2, lastValueVisible: true, priceLineVisible: false });
    var rdata = [];
    for (var k = from; k <= to; k++) rdata.push(rsi[k] === null ? { time: t(k) } : { time: t(k), value: rsi[k] });
    rsiLine.setData(rdata);
    rsiLine.createPriceLine({ price: rp.threshold, color: amber, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: String(rp.threshold) });
    if (rsi[i4] !== null) rsiLine.setMarkers([{ time: t(i4), position: 'inBar', shape: 'circle', color: amber, size: 1 }]);

    var syncing = false;
    function link(a, b) {
      a.timeScale().subscribeVisibleLogicalRangeChange(function (r) {
        if (syncing || !r) return;
        syncing = true; b.timeScale().setVisibleLogicalRange(r); syncing = false;
      });
    }
    link(priceChart, rsiChart);
    link(rsiChart, priceChart);
    // Room on the right so the entry label is not clipped by the last candle.
    priceChart.timeScale().setVisibleLogicalRange({ from: -1, to: data.length + 7 });

    $('bl-chart-legend').textContent =
      '4H candles (UTC), ending at the candle that holds the entry; only swing highs and breaks the detector could see at the anchor are drawn. ' +
      'Circles = confirmed swing highs, N=' + bp.N + ' (amber unbroken, grey broken). Green line + arrow = ' + bp.mode + ' break within the last ' + bp.L +
      ' completed candles (grey dashed = older). Blue arrow = your entry. Lower pane: 4H RSI(' + rp.period + ') with the ' + rp.threshold +
      ' threshold; the dot is the last completed candle the detectors read.';
  }

  // ---------------------------------------------------------------------
  // JSON export
  // ---------------------------------------------------------------------

  function isoify(value) {
    if (Array.isArray(value)) return value.map(isoify);
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function (k) {
        var v = value[k];
        out[k] = /T$/.test(k) && typeof v === 'number' ? new Date(v).toISOString() : isoify(v);
      });
      return out;
    }
    return value;
  }

  function buildExport() {
    var R = S.results;
    var J = S.journal;
    var ids = comboIds();
    return {
      generatedAt: new Date().toISOString(),
      note: 'Backtest Lab validation: coded detectors vs the confluence tags logged in the journal. No lookahead: each detector only sees candles closed by the anchor.',
      settings: {
        journalUtcOffset: tzLabel(J.tzOffset), warmupCandles: Core.WARMUP, minTaggedForConfidence: Core.MIN_TAGGED,
        countPendingFailedAsUntagged: S.ignoreNonPassed, combination: ids,
        detectors: S.detectors.map(function (d) {
          return { id: d.id, label: d.label, tag: S.tagChoice[d.id] || null, type: d.type, timeframe: d.timeframe, params: S.params[d.id], definition: Core.definitionText(d, S.params[d.id]) };
        })
      },
      data: {
        pairs: Object.keys(S.pairs).map(function (sym) {
          var pd = S.pairs[sym];
          return pd.ok
            ? { pair: sym, tested: true, source: pd.venue, candles4h: pd.h4.n, candlesDaily: pd.d1 ? pd.d1.n : 0, from: new Date(pd.h4.t[0]).toISOString(), to: new Date(pd.h4.t[pd.h4.n - 1]).toISOString(), note: pd.dailyNote }
            : { pair: sym, tested: false, reason: pd.reason };
        }),
        tradesLogged: J.totalLogged, tradesExcludedNoPairOrDate: J.skipped
      },
      verdicts: R.verdicts.map(function (v) { return v.text; }),
      stats: S.detectors.map(function (d) {
        var st = R.detStats[d.id];
        return Object.assign({ id: d.id, tag: st.tag, testedTrades: st.usable, naTrades: st.na }, st.summary);
      }).concat(R.comboStats ? [Object.assign({ id: 'combination', detectors: R.comboStats.ids, tags: R.comboStats.tags, testedTrades: R.comboStats.usable, naTrades: R.comboStats.na }, R.comboStats.summary)] : []),
      trades: R.rows.map(function (r) {
        var out = { id: r.trade.id, pair: r.trade.pair, date: r.trade.date, entryTime: r.trade.entryTime, anchorUtc: new Date(r.trade.anchorMs).toISOString(), noEntryTime: r.trade.noEntryTime, direction: r.trade.direction, outcome: r.trade.outcome, tags: r.trade.tags };
        if (!r.results) { out.tested = false; out.reason = r.pair ? r.pair.reason : 'no data'; return out; }
        out.tested = true;
        out.detectors = {};
        S.detectors.forEach(function (d) {
          var x = r.results[d.id];
          out.detectors[d.id] = { status: x.status, fired: x.fired, journalTagged: r.tagged[d.id], value: x.status === 'ok' ? isoify(x.value) : undefined, reason: x.reason || undefined };
        });
        if (r.combo) out.combination = { status: r.combo.status, fired: r.combo.fired, journalTagged: r.comboTagged, reason: r.combo.reason || undefined };
        return out;
      })
    };
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = el('textarea', { style: 'position:fixed;opacity:0;left:-9999px' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error('copy blocked'));
    });
  }

  // ---------------------------------------------------------------------
  // Orchestration
  // ---------------------------------------------------------------------

  function setStatus(text, isErr) {
    var n = $('bl-status');
    n.textContent = text;
    n.className = 'bl-status' + (isErr ? ' bl-err' : '');
  }

  function recompute() {
    if (!S.journal) return;
    if (!S.fetchedAt) { renderCoverage(); return; }      // nothing to evaluate until candles are fetched
    compute();
    renderCoverage();
    renderStats();
    renderTradeTable();
    renderData();
    renderUntested();
    fillTradeSelect();
    if (!S.chartTradeId || !S.results.rows.some(function (r) { return r.trade.id === S.chartTradeId && r.results; })) {
      var first = S.results.rows.filter(function (r) { return r.results; })[0];
      S.chartTradeId = first ? first.trade.id : null;
      if (S.chartTradeId) $('bl-chart-trade').value = S.chartTradeId;
    }
    renderChart();
  }

  async function run(refetch) {
    if (S.fetching) return;
    var J = S.journal;
    if (!J.trades.length) { setStatus(J.problem || 'No trades with a pair and a date.', true); return; }
    S.fetching = true;
    $('bl-run-btn').disabled = true;
    $('bl-refetch-btn').disabled = true;
    if (refetch) S.cache = {};

    // One fetch per pair, ending at that pair's latest trade.
    var latest = {};
    J.trades.forEach(function (t) { latest[t.symbol] = Math.max(latest[t.symbol] || 0, t.anchorMs); });
    var symbols = Object.keys(latest).sort();
    S.pairs = {};
    for (var i = 0; i < symbols.length; i++) {
      var sym = symbols[i];
      var key = sym + '|' + latest[sym];
      setStatus('Fetching ' + (i + 1) + '/' + symbols.length + ': ' + sym + '…');
      if (!S.cache[key]) S.cache[key] = await fetchPair(sym, latest[sym]);
      var got = S.cache[key];
      S.pairs[sym] = got.ok
        ? { symbol: sym, endMs: latest[sym], ok: true, venue: got.venue, h4: Core.buildSeries(got.h4Rows, H4), d1: got.d1Rows ? Core.buildSeries(got.d1Rows, D1) : null, dailyNote: got.dailyNote }
        : { symbol: sym, endMs: latest[sym], ok: false, reason: got.reason };
      renderData();
    }
    S.fetchedAt = Date.now();
    var tested = symbols.filter(function (s) { return S.pairs[s].ok; }).length;
    setStatus('Fetched ' + symbols.length + ' pair' + (symbols.length === 1 ? '' : 's') + ' · ' + tested + ' tested, ' + (symbols.length - tested) + ' skipped · ' + new Date().toLocaleTimeString());
    S.fetching = false;
    $('bl-run-btn').disabled = false;
    $('bl-refetch-btn').disabled = false;
    recompute();
  }

  function init() {
    S.journal = loadJournal();
    var J = S.journal;
    var info = $('bl-journal-info');
    info.textContent = J.problem ||
      J.trades.length + ' of ' + J.totalLogged + ' logged trades have a pair and a date · journal timezone ' + tzLabel(J.tzOffset) + ' (from the journal setting) · ' +
      (J.vocabFromStorage ? J.vocab.length + ' tags in the parameter vocabulary' : 'parameter vocabulary not found, using tags found on trades');

    buildControls();
    renderCoverage();

    $('bl-run-btn').addEventListener('click', function () { run(false); });
    $('bl-refetch-btn').addEventListener('click', function () { run(true); });
    $('bl-opt-status').addEventListener('change', function (e) { S.ignoreNonPassed = e.target.checked; recompute(); });
    $('bl-chart-trade').addEventListener('change', function (e) { S.chartTradeId = e.target.value; renderChart(); });
    $('bl-chart-scale').addEventListener('change', function (e) { S.chartScale = e.target.value; renderChart(); });
    $('bl-copy-btn').addEventListener('click', function () {
      var btn = $('bl-copy-btn');
      if (!S.results) { setStatus('Nothing to copy yet: run the validation first.', true); return; }
      copyText(JSON.stringify(buildExport(), null, 2)).then(function () {
        btn.textContent = 'Copied!';
      }, function () {
        btn.textContent = 'Copy failed';
      }).then(function () { setTimeout(function () { btn.textContent = 'Copy results as JSON'; }, 1800); });
    });

    if (J.problem) { setStatus(J.problem, true); $('bl-run-btn').disabled = true; $('bl-refetch-btn').disabled = true; }
    else setStatus('Ready. Click "Fetch data & run" (about ' + Object.keys(J.trades.reduce(function (m, t) { m[t.symbol] = 1; return m; }, {})).length + ' pairs, requests are spaced out).');
  }

  function start() {
    if (!Core) { document.body.textContent = 'backtest-lab-core.js failed to load.'; return; }
    init();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
