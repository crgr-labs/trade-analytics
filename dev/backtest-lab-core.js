/*
 * Backtest Lab - core (pure logic, no DOM, no network).
 *
 * Loaded by dev/backtest-lab.html as a plain script (window.BacktestLabCore)
 * and by dev/backtest-lab.test.js under Node (module.exports).
 *
 * Time conventions
 *   - A "series" is one timeframe's candles as parallel arrays, t = candle
 *     OPEN time in ms (UTC).
 *   - A candle is complete at anchor time A when t + intervalMs <= A.
 *   - A detector only ever receives a context whose index `i` is the last
 *     candle that is complete at the anchor. Every series-level computation
 *     (RSI, swing highs, volume ratio) is causal: element k depends only on
 *     candles <= k, except swing HIGHS, which need N candles to the right and
 *     are therefore only released once k >= j + N (see bosScan).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BacktestLabCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var M15_MS = 15 * 60 * 1000;
  var H4_MS = 4 * 3600 * 1000;
  var D1_MS = 24 * 3600 * 1000;
  var WARMUP = 100;

  // ---------------------------------------------------------------------
  // Series
  // ---------------------------------------------------------------------

  // rows: Binance kline rows [openTime, o, h, l, c, v, ...] (numbers as strings).
  function buildSeries(rows, intervalMs) {
    var s = { ms: intervalMs, n: rows.length, t: [], o: [], h: [], l: [], c: [], v: [], memo: {} };
    rows.forEach(function (r) {
      s.t.push(Number(r[0]));
      s.o.push(Number(r[1]));
      s.h.push(Number(r[2]));
      s.l.push(Number(r[3]));
      s.c.push(Number(r[4]));
      s.v.push(Number(r[5]));
    });
    return s;
  }

  // Largest i with t[i] + ms <= anchorMs (last candle fully closed by the
  // anchor), or -1.
  function lastCompletedIndex(series, anchorMs) {
    var lo = 0, hi = series.n - 1, ans = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (series.t[mid] + series.ms <= anchorMs) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  // Index of the candle that contains the anchor (t <= anchor < t + ms), or -1.
  function containingIndex(series, anchorMs) {
    var i = lastCompletedIndex(series, anchorMs) + 1;
    return i < series.n && series.t[i] <= anchorMs ? i : -1;
  }

  function memoize(series, key, compute) {
    if (!Object.prototype.hasOwnProperty.call(series.memo, key)) series.memo[key] = compute();
    return series.memo[key];
  }

  // ---------------------------------------------------------------------
  // Indicators
  // ---------------------------------------------------------------------

  function rsiFrom(avgGain, avgLoss) {
    // Same branches as TradingView's ta.rsi.
    if (avgLoss === 0) return 100;
    if (avgGain === 0) return 0;
    return 100 - 100 / (1 + avgGain / avgLoss);
  }

  // RSI with Wilder smoothing (RMA seeded with the simple average of the first
  // `period` changes), matching TradingView. null until index `period`.
  function rsiWilder(closes, period) {
    var n = closes.length;
    var out = new Array(n);
    for (var z = 0; z < n; z++) out[z] = null;
    if (n <= period) return out;
    var gain = 0, loss = 0, i, d;
    for (i = 1; i <= period; i++) {
      d = closes[i] - closes[i - 1];
      if (d > 0) gain += d; else loss -= d;
    }
    gain /= period;
    loss /= period;
    out[period] = rsiFrom(gain, loss);
    for (i = period + 1; i < n; i++) {
      d = closes[i] - closes[i - 1];
      gain = (gain * (period - 1) + (d > 0 ? d : 0)) / period;
      loss = (loss * (period - 1) + (d < 0 ? -d : 0)) / period;
      out[i] = rsiFrom(gain, loss);
    }
    return out;
  }

  function rsiSeries(series, period) {
    return memoize(series, 'rsi|' + period, function () { return rsiWilder(series.c, period); });
  }

  // volume[k] / mean(volume[k-look .. k-1]); null when there is no usable average.
  function volumeRatioSeries(series, look) {
    return memoize(series, 'vr|' + look, function () {
      var out = new Array(series.n);
      var sum = 0;
      for (var k = 0; k < series.n; k++) {
        if (k >= look) {
          var avg = sum / look;
          out[k] = avg > 0 ? series.v[k] / avg : null;
          sum -= series.v[k - look];
        } else {
          out[k] = null;
        }
        sum += series.v[k];
      }
      return out;
    });
  }

  // ATR with Wilder smoothing (TradingView ta.atr): true range, RMA seeded with the
  // simple average of the first `period` true ranges. null until index period - 1.
  function atrSeries(series, period) {
    return memoize(series, 'atr|' + period, function () {
      var n = series.n, out = new Array(n), tr = new Array(n);
      for (var k = 0; k < n; k++) {
        tr[k] = k === 0 ? series.h[0] - series.l[0]
          : Math.max(series.h[k] - series.l[k], Math.abs(series.h[k] - series.c[k - 1]), Math.abs(series.l[k] - series.c[k - 1]));
        out[k] = null;
      }
      if (n < period) return out;
      var sum = 0;
      for (var j = 0; j < period; j++) sum += tr[j];
      out[period - 1] = sum / period;
      for (var m = period; m < n; m++) out[m] = (out[m - 1] * (period - 1) + tr[m]) / period;
      return out;
    });
  }

  // ---------------------------------------------------------------------
  // Impulse leg (for Fibonacci retracements)
  // ---------------------------------------------------------------------

  // The leg as it stands at candle i using only candles i-W+1 .. i:
  //   H = highest high in that window (earliest such candle on ties)
  //   A = lowest low among the candles BEFORE H's candle inside the window
  // Returns { ok:true, H, A, hIdx, aIdx } or { ok:false, kind:'history'|'gap'|'noleg', reason }.
  function legAt(series, i, W) {
    var cache = memoize(series, 'leg|' + W, function () { return {}; });
    if (Object.prototype.hasOwnProperty.call(cache, i)) return cache[i];
    var res;
    var lo = i - W + 1;
    if (lo < 0) {
      res = { ok: false, kind: 'history', reason: 'M15 history too short' };
    } else if (series.t[i] - series.t[lo] !== (W - 1) * series.ms) {
      res = { ok: false, kind: 'gap', reason: 'data gap inside the ' + W + '-candle leg window' };
    } else {
      var hIdx = lo;
      for (var k = lo + 1; k <= i; k++) if (series.h[k] > series.h[hIdx]) hIdx = k;
      if (hIdx === lo) {
        res = { ok: false, kind: 'noleg', reason: 'no impulse leg: the highest high is the oldest candle of the window, so nothing precedes it' };
      } else {
        var aIdx = lo;
        for (var m = lo + 1; m < hIdx; m++) if (series.l[m] < series.l[aIdx]) aIdx = m;
        res = { ok: true, H: series.h[hIdx], A: series.l[aIdx], hIdx: hIdx, aIdx: aIdx };
        if (!(res.H > res.A)) res = { ok: false, kind: 'noleg', reason: 'no impulse leg: H is not above A' };
      }
    }
    cache[i] = res;
    return res;
  }

  // legAt plus an optional in-memory override of the A and/or H price.
  // Returns { ok:true, H, A, hIdx|null, aIdx|null, overridden } or { ok:false, kind:'history'|'gap'|'noleg'|'override', reason }.
  function effectiveLeg(series, i, W, override) {
    var base = legAt(series, i, W);
    // Only real numbers count: isFinite(null) is true, which would turn "no override" into a price of 0.
    var ovA = override && typeof override.A === 'number' && isFinite(override.A) ? override.A : null;
    var ovH = override && typeof override.H === 'number' && isFinite(override.H) ? override.H : null;
    if (ovA === null && ovH === null) return base;
    var H = ovH !== null ? ovH : (base.ok ? base.H : null);
    var A = ovA !== null ? ovA : (base.ok ? base.A : null);
    if (H === null || A === null) return base;            // override needs the other side from the computed leg
    if (!(H > A)) return { ok: false, kind: 'override', reason: 'override invalid: H must be above A' };
    return { ok: true, H: H, A: A, hIdx: ovH !== null ? null : base.hIdx, aIdx: ovA !== null ? null : base.aIdx, overridden: true };
  }

  // ---------------------------------------------------------------------
  // Swing highs and BOS
  // ---------------------------------------------------------------------

  // Indices j whose high is strictly greater than the highs of the N candles
  // on each side. Needs candles j+1..j+N, so it is only "known" at j + N.
  function swingHighIndices(h, N) {
    var out = [];
    for (var j = N; j < h.length - N; j++) {
      var ok = true;
      for (var k = 1; k <= N && ok; k++) {
        if (!(h[j] > h[j - k]) || !(h[j] > h[j + k])) ok = false;
      }
      if (ok) out.push(j);
    }
    return out;
  }

  // Walks the series once, oldest to newest. At candle i the swing highs
  // released so far are those with j + N <= i; the BOS target is the most
  // recent of them that is still unbroken. It breaks when the candle's close
  // (or high, in wick mode) is above the target's high, which also retires
  // every other unbroken swing high the price is now above.
  // Returns { events: [{i, level, swing, N, mode}], brokenAt: {j: i} }.
  function bosScan(series, N, mode) {
    return memoize(series, 'bos|' + N + '|' + mode, function () {
      var swings = swingHighIndices(series.h, N);
      var unbroken = [];
      var events = [];
      var brokenAt = {};
      var p = 0;
      for (var i = 0; i < series.n; i++) {
        while (p < swings.length && swings[p] + N <= i) { unbroken.push(swings[p]); p++; }
        if (!unbroken.length) continue;
        var target = unbroken[unbroken.length - 1];
        var price = mode === 'wick' ? series.h[i] : series.c[i];
        if (price > series.h[target]) {
          events.push({ i: i, level: series.h[target], swing: target, N: N, mode: mode });
          unbroken = unbroken.filter(function (j) {
            if (series.h[j] < price) { brokenAt[j] = i; return false; }
            return true;
          });
        }
      }
      return { events: events, brokenAt: brokenAt, swings: swings };
    });
  }

  // ---------------------------------------------------------------------
  // Detector registry
  // ---------------------------------------------------------------------
  //
  // A detector is one function plus metadata:
  //   id           unique key
  //   label        column / row title
  //   tagKeywords  words that must all appear (case-insensitive) in the
  //                journal tag this detector validates. The tag NAME itself is
  //                read from the parameter vocabulary at run time, never
  //                hardcoded here.
  //   timeframe    '4h' | '1d'
  //   type         'state' | 'event'
  //   definition   one line for the UI (string, or function(params) -> string)
  //   params       [{key,label,type:'int'|'number'|'select',default,min,max,step,options}]
  //   run(ctx, p)  ctx = { series, i, anchorMs, current }; series/i are already the
  //                right timeframe and i is the last completed candle. `current`
  //                is { t, open } of the candle still forming at the anchor (or
  //                null): its open is knowable at the anchor, nothing else is.
  //                A detector must never read series.*[i + 1].
  //                Returns { fired: boolean, value: {...} }.

  var REGISTRY = [];

  function registerDetector(def) {
    if (!def || !def.id || typeof def.run !== 'function') throw new Error('detector needs id and run');
    if (REGISTRY.some(function (d) { return d.id === def.id; })) throw new Error('duplicate detector id ' + def.id);
    REGISTRY.push(def);
    return def;
  }

  function getDetectors() { return REGISTRY.slice(); }

  function defaultParams(def) {
    var p = {};
    (def.params || []).forEach(function (spec) { p[spec.key] = spec.default; });
    return p;
  }

  function definitionText(def, params) {
    return typeof def.definition === 'function' ? def.definition(params) : def.definition;
  }

  // ---- detectors (v1) -------------------------------------------------

  function bosRun(ctx, p, N) {
    var scan = bosScan(ctx.series, N, p.mode);
    // Events are in candle order, so the newest one at or before the anchor
    // candle is the only one that can fall inside the last-L window.
    var last = null;
    for (var e = scan.events.length - 1; e >= 0; e--) {
      if (scan.events[e].i <= ctx.i) { last = scan.events[e]; break; }
    }
    var pick = last && last.i >= ctx.i - p.L + 1 ? last : null;
    var s = ctx.series;
    // Freshness of the break at the anchor: how far price (the entry, or the last close for
    // base-rate anchors) has run past the broken level, in % and in 4H ATR(14) at the last
    // completed candle, and how long ago the BOS candle closed.
    var atr = atrSeries(s, 14)[ctx.i];
    function stamp(ev) {
      if (!ev) return null;
      var out = {
        level: ev.level, bosT: s.t[ev.i], swingT: s.t[ev.swing], barsAgo: ctx.i - ev.i, N: ev.N,
        hoursSinceClose: (ctx.anchorMs - (s.t[ev.i] + s.ms)) / 3600000,
        priceValue: null, priceKind: null, extPct: null, extAtr: null, atr: atr === undefined ? null : atr
      };
      if (ctx.price) {
        out.priceValue = ctx.price.value;
        out.priceKind = ctx.price.kind;
        out.extPct = (ctx.price.value - ev.level) / ev.level * 100;
        out.extAtr = atr > 0 ? (ctx.price.value - ev.level) / atr : null;
      }
      return out;
    }
    return { fired: !!pick, value: pick ? stamp(pick) : { none: true, last: stamp(last), L: p.L, N: N } };
  }

  var BOS_PARAMS = function (N) {
    return [
      { key: 'N', label: 'N (bars each side)', type: 'int', default: N, min: 1, max: 50 },
      { key: 'L', label: 'L (last completed candles)', type: 'int', default: 6, min: 1, max: 100 },
      { key: 'mode', label: 'Break on', type: 'select', default: 'close', options: [['close', 'Close'], ['wick', 'Wick (high)']] }
    ];
  };

  function bosDefinition(p) {
    return 'A 4H candle ' + (p.mode === 'wick' ? 'trades (high) above' : 'CLOSES above') +
      ' the most recent confirmed, still-unbroken swing high (high > the ' + p.N +
      ' highs on each side); fires if that happened within the last ' + p.L + ' completed 4H candles.';
  }

  [['bos-minor', 'BOS minor', 2], ['bos-recent', 'BOS recent', 4], ['bos-major', 'BOS major', 8]].forEach(function (s) {
    registerDetector({
      id: s[0], label: '4H ' + s[1] + ' (N=' + s[2] + ')', tagKeywords: ['4h', 'bos'],
      timeframe: '4h', type: 'event', params: BOS_PARAMS(s[2]), definition: bosDefinition,
      run: function (ctx, p) { return bosRun(ctx, p, p.N); }
    });
  });

  registerDetector({
    id: 'bos-any', label: '4H BOS (any of minor/recent/major)', tagKeywords: ['4h', 'bos'],
    timeframe: '4h', type: 'event',
    params: [
      { key: 'Nminor', label: 'N minor', type: 'int', default: 2, min: 1, max: 50 },
      { key: 'Nrecent', label: 'N recent', type: 'int', default: 4, min: 1, max: 50 },
      { key: 'Nmajor', label: 'N major', type: 'int', default: 8, min: 1, max: 50 },
      { key: 'L', label: 'L (last completed candles)', type: 'int', default: 6, min: 1, max: 100 },
      { key: 'mode', label: 'Break on', type: 'select', default: 'close', options: [['close', 'Close'], ['wick', 'Wick (high)']] }
    ],
    definition: function (p) {
      return 'Fires if a 4H BOS (' + (p.mode === 'wick' ? 'wick' : 'close') + ' above the latest unbroken swing high) occurred at ANY of the three scales N=' +
        p.Nminor + ' / ' + p.Nrecent + ' / ' + p.Nmajor + ' within the last ' + p.L + ' completed 4H candles.';
    },
    run: function (ctx, p) {
      var broke = [];
      [['minor', p.Nminor], ['recent', p.Nrecent], ['major', p.Nmajor]].forEach(function (sc) {
        var r = bosRun(ctx, { L: p.L, mode: p.mode }, sc[1]);
        if (r.fired) { r.value.scale = sc[0]; broke.push(r.value); }
      });
      if (!broke.length) return { fired: false, value: { none: true, L: p.L, N: null } };
      broke.sort(function (a, b) { return a.barsAgo - b.barsAgo; });
      var top = broke[0];
      top.scales = broke.map(function (b) { return b.scale + ' (N=' + b.N + ')'; });
      return { fired: true, value: top };
    }
  });

  // "Fresh 4H BOS": a BOS within the last F completed 4H candles AND price has not run more than X
  // past the broken level (X in % or in 4H ATR multiples). For 'any', each scale is checked and the
  // detector fires if any scale qualifies. Price = the entry (journal price, else the open of the
  // 4H candle holding it, labelled approx); for base-rate anchors it is the last completed 4H close.
  registerDetector({
    id: 'bos-fresh', label: 'Fresh 4H BOS', tagKeywords: ['fresh', 'bos'],
    timeframe: '4h', type: 'event',
    params: [
      { key: 'scale', label: 'BOS scale', type: 'select', default: 'recent', options: [['minor', 'minor'], ['recent', 'recent'], ['major', 'major'], ['any', 'any of the three']] },
      { key: 'Nminor', label: 'N minor', type: 'int', default: 2, min: 1, max: 50 },
      { key: 'Nrecent', label: 'N recent', type: 'int', default: 4, min: 1, max: 50 },
      { key: 'Nmajor', label: 'N major', type: 'int', default: 8, min: 1, max: 50 },
      { key: 'F', label: 'F (BOS within last completed candles)', type: 'int', default: 2, min: 1, max: 100 },
      { key: 'X', label: 'X (max extension)', type: 'number', default: 10, min: 0, step: 0.5 },
      { key: 'unit', label: 'X measured in', type: 'select', default: 'pct', options: [['pct', '% above broken level'], ['atr', '4H ATR(14) multiples']] },
      { key: 'mode', label: 'Break on', type: 'select', default: 'close', options: [['close', 'Close'], ['wick', 'Wick (high)']] }
    ],
    definition: function (p) {
      return 'A 4H BOS (' + p.scale + ' scale, ' + (p.mode === 'wick' ? 'wick' : 'close') + ' above the latest unbroken swing high) within the last ' +
        p.F + ' completed 4H candle' + (p.F === 1 ? '' : 's') + ' AND price is at most ' + p.X + (p.unit === 'atr' ? ' x 4H ATR(14)' : '%') +
        ' above the broken level (entry price; last completed 4H close for base-rate anchors).';
    },
    run: function (ctx, p) {
      var scales = p.scale === 'any' ? [['minor', p.Nminor], ['recent', p.Nrecent], ['major', p.Nmajor]] : [[p.scale, p['N' + p.scale]]];
      if (!ctx.price) return { na: 'no entry price, and the 4H candle holding the entry is missing from the data' };
      var hits = [], lastAny = null;
      scales.forEach(function (sc) {
        var r = bosRun(ctx, { L: p.F, mode: p.mode }, sc[1]);
        if (r.fired) {
          r.value.scale = sc[0];
          r.value.ext = p.unit === 'atr' ? r.value.extAtr : r.value.extPct;
          hits.push(r.value);
        } else if (r.value.last && (!lastAny || r.value.last.barsAgo < lastAny.barsAgo)) {
          lastAny = r.value.last;
          lastAny.scale = sc[0];
        }
      });
      var base = { F: p.F, X: p.X, unit: p.unit };
      if (!hits.length) return { fired: false, value: Object.assign({ none: true, last: lastAny, failed: ['no BOS within the last ' + p.F + ' completed 4H candle' + (p.F === 1 ? '' : 's')] }, base) };
      var passing = hits.filter(function (h) { return h.ext !== null && h.ext <= p.X; });
      var pool = passing.length ? passing : hits;
      pool.sort(function (a, b) { return (a.ext === null ? Infinity : a.ext) - (b.ext === null ? Infinity : b.ext); });
      var top = pool[0];
      top.scales = hits.map(function (h) { return h.scale + ' (N=' + h.N + ')'; });
      top.failed = passing.length ? [] : ['extension ' + (top.ext === null ? 'n/a' : top.ext.toFixed(2) + (p.unit === 'atr' ? ' ATR' : '%')) + ' > ' + p.X + (p.unit === 'atr' ? ' ATR' : '%')];
      return { fired: passing.length > 0, value: Object.assign(top, base) };
    }
  });

  function rsiDefinitionFactory(tfLabel, dirWord) {
    return function (p) {
      return tfLabel + ' RSI(' + p.period + ', Wilder) on the last completed ' + tfLabel + ' close is ' + dirWord + ' ' + p.threshold + '.';
    };
  }

  function rsiRun(ctx, p, above) {
    var r = rsiSeries(ctx.series, p.period);
    var cur = r[ctx.i];
    if (cur === null || cur === undefined) return { na: 'RSI not defined at this candle' };
    var prev = ctx.i > 0 ? r[ctx.i - 1] : null;
    return {
      fired: above ? cur > p.threshold : cur < p.threshold,
      value: { rsi: cur, threshold: p.threshold, distance: cur - p.threshold, prev: prev === undefined ? null : prev, barT: ctx.series.t[ctx.i] }
    };
  }

  var RSI_PARAMS = [
    { key: 'period', label: 'RSI period', type: 'int', default: 14, min: 2, max: 100 },
    { key: 'threshold', label: 'Threshold', type: 'number', default: 70, min: 1, max: 99, step: 0.5 }
  ];

  registerDetector({
    id: 'rsi-d-above', label: 'Daily RSI above', tagKeywords: ['daily', 'rsi', 'above'],
    timeframe: '1d', type: 'state', params: RSI_PARAMS, definition: rsiDefinitionFactory('daily', 'above'),
    run: function (ctx, p) { return rsiRun(ctx, p, true); }
  });
  registerDetector({
    id: 'rsi-d-below', label: 'Daily RSI below', tagKeywords: ['daily', 'rsi', 'below'],
    timeframe: '1d', type: 'state', params: RSI_PARAMS, definition: rsiDefinitionFactory('daily', 'below'),
    run: function (ctx, p) { return rsiRun(ctx, p, false); }
  });
  registerDetector({
    id: 'rsi-4h-above', label: '4H RSI above', tagKeywords: ['4h', 'rsi', 'above'],
    timeframe: '4h', type: 'state', params: RSI_PARAMS, definition: rsiDefinitionFactory('4H', 'above'),
    run: function (ctx, p) { return rsiRun(ctx, p, true); }
  });

  function signedPct(x, d) { return (x >= 0 ? '+' : '') + x.toFixed(d) + '%'; }
  function sig(x) { return Number(Number(x).toPrecision(6)); }

  // Daily Momentum Continuation. Two conditions, checked at the anchor:
  //   1. the last completed daily candle is bullish and gained >= P%
  //   2. the daily candle that contains the anchor OPENED >= G% above that candle's close
  // The second candle is still forming at the anchor, so the framework hands over
  // ONLY its open (ctx.current.open); its high / low / close / volume are never exposed.
  // Gains are (x - ref) / ref rather than x / ref - 1, which turns an exact +15%
  // into 14.999999999999998.
  registerDetector({
    id: 'daily-momentum', label: 'Daily Momentum Continuation', tagKeywords: ['daily', 'momentum', 'continuation'],
    timeframe: '1d', type: 'state', needsCurrentOpen: true,
    params: [
      { key: 'P', label: 'P (min gain %)', type: 'number', default: 10, min: 0, step: 0.5 },
      { key: 'gainBasis', label: 'Gain measured as', type: 'select', default: 'prevClose', options: [['prevClose', 'Close vs day-before close'], ['open', 'Close vs same-candle open']] },
      { key: 'G', label: 'G (min open above prev close, %)', type: 'number', default: 0, step: 0.1 }
    ],
    definition: function (p) {
      return 'The last completed daily candle closed bullish (close > open) with a gain >= ' + p.P + '% (' +
        (p.gainBasis === 'open' ? 'close vs the open of that same candle' : 'close vs the close of the day before it') +
        '), AND the new daily candle (containing the anchor) opened >= ' + p.G + '% above that close. Only the open of the new candle is used.';
    },
    run: function (ctx, p) {
      if (!ctx.current) return { na: 'the daily candle containing the anchor is missing from the fetched data (its open is needed)' };
      var s = ctx.series, i = ctx.i;
      var o = s.o[i], c = s.c[i], prevC = s.c[i - 1];
      var gainPrev = prevC > 0 ? (c - prevC) / prevC * 100 : null;
      var gainOpen = o > 0 ? (c - o) / o * 100 : null;
      var gain = p.gainBasis === 'open' ? gainOpen : gainPrev;
      var gap = c > 0 ? (ctx.current.open - c) / c * 100 : null;
      var bullish = c > o;
      var gainOk = gain !== null && gain >= p.P;
      var gapOk = gap !== null && gap >= p.G;
      var failed = [];
      if (!bullish) failed.push('previous candle not bullish (close ' + sig(c) + ' <= open ' + sig(o) + ')');
      if (!gainOk) failed.push(gain === null ? 'gain n/a' : 'gain ' + gain.toFixed(1) + '% < ' + p.P + '%');
      if (!gapOk) failed.push(gap === null ? 'open gap n/a' : 'open ' + signedPct(gap, 2) + ' vs prev close < ' + p.G + '%');
      return {
        fired: bullish && gainOk && gapOk,
        value: {
          prevBarT: s.t[i], bullish: bullish, gainPrevClose: gainPrev, gainOpen: gainOpen, gain: gain, P: p.P, gainBasis: p.gainBasis,
          prevClose: c, newOpen: ctx.current.open, newBarT: ctx.current.t, openGapPct: gap, G: p.G, failed: failed
        }
      };
    }
  });

  registerDetector({
    id: 'volume-spike', label: 'Volume spike', tagKeywords: ['volume', 'spike'],
    timeframe: '4h', type: 'event',
    params: [
      { key: 'k', label: 'k (x average)', type: 'number', default: 2, min: 0.1, step: 0.1 },
      { key: 'look', label: 'Average of previous', type: 'int', default: 20, min: 1, max: 200 },
      { key: 'L', label: 'L (last completed candles)', type: 'int', default: 6, min: 1, max: 100 }
    ],
    definition: function (p) {
      return 'A 4H candle\'s volume >= ' + p.k + ' x the average volume of the ' + p.look +
        ' candles before it; fires if that happened within the last ' + p.L + ' completed 4H candles.';
    },
    run: function (ctx, p) {
      var ratios = volumeRatioSeries(ctx.series, p.look);
      var lo = Math.max(0, ctx.i - p.L + 1);
      var best = null, hit = null;
      for (var k = ctx.i; k >= lo; k--) {
        var r = ratios[k];
        if (r === null || r === undefined) continue;
        if (!best || r > best.ratio) best = { ratio: r, barsAgo: ctx.i - k, barT: ctx.series.t[k] };
        if (!hit && r >= p.k) hit = { ratio: r, barsAgo: ctx.i - k, barT: ctx.series.t[k] };
      }
      if (hit) return { fired: true, value: { ratio: hit.ratio, k: p.k, barsAgo: hit.barsAgo, barT: hit.barT } };
      return { fired: false, value: { ratio: best ? best.ratio : null, k: p.k, barsAgo: best ? best.barsAgo : null, barT: best ? best.barT : null, isMaxInWindow: true, L: p.L } };
    }
  });

  // ---- M15 Fibonacci retracement (longs only) ---------------------------
  //
  // Leg at anchor t (see legAt): H = highest high of the last W completed M15 candles, A = lowest
  // low before H's candle inside those W. With P = the entry price (last completed M15 close for
  // base-rate anchors), r = (H - P) / (H - A) in percent. A level fires when |r - level| <= T points.

  function fibMeasure(ctx, p) {
    if (!ctx.price) return { na: 'no entry price, and the M15 candle holding the entry is missing from the data' };
    var leg = effectiveLeg(ctx.series, ctx.i, p.W, ctx.override);
    if (!leg.ok) {
      if (leg.kind === 'noleg') return { noLeg: leg.reason };
      return { na: leg.reason };
    }
    var s = ctx.series;
    return {
      H: leg.H, A: leg.A, hT: leg.hIdx === null ? null : s.t[leg.hIdx], aT: leg.aIdx === null ? null : s.t[leg.aIdx],
      P: ctx.price.value, priceKind: ctx.price.kind, r: (leg.H - ctx.price.value) / (leg.H - leg.A) * 100, overridden: !!leg.overridden
    };
  }

  var FIB_PARAMS = function (level) {
    return [
      { key: 'W', label: 'W (M15 candles for the leg)', type: 'int', default: 16, min: 2, max: 96 },
      { key: 'level', label: 'Level (%)', type: 'number', default: level, min: 0, max: 100, step: 0.1 },
      { key: 'T', label: 'T (+/- points)', type: 'number', default: 3, min: 0, step: 0.5 }
    ];
  };
  function fibDefinition(p) {
    return 'Longs only. On the last W=' + p.W + ' completed M15 candles, H = highest high and A = lowest low before it; r = (H - entry) / (H - A). Fires when r is within +/- ' +
      p.T + ' points of ' + p.level + '% (base rate: last completed M15 close instead of the entry).';
  }
  function fibRunOne(ctx, p, levels) {
    var m = fibMeasure(ctx, p);
    if (m.na) return { na: m.na };
    if (m.noLeg) return { fired: false, value: { noLeg: m.noLeg, W: p.W, tol: p.T, levels: levels } };
    var best = null;
    levels.forEach(function (lv) {
      var d = m.r - lv;
      if (!best || Math.abs(d) < Math.abs(best.dist)) best = { level: lv, dist: d };
    });
    var fired = Math.abs(best.dist) <= p.T + 1e-9;
    return { fired: fired, value: Object.assign(m, { W: p.W, tol: p.T, level: best.level, dist: best.dist, levels: levels }) };
  }

  [['fib-30', 30, '30%'], ['fib-382', 38.2, '38.2%'], ['fib-50', 50, '50%']].forEach(function (f) {
    registerDetector({
      id: f[0], label: 'M15 ' + f[2] + ' fib', tagKeywords: ['m15', f[2].toLowerCase(), 'fib'],
      timeframe: '15m', type: 'state', longsOnly: true, params: FIB_PARAMS(f[1]), definition: fibDefinition,
      minCandles: function (p) { return p.W; },
      run: function (ctx, p) { return fibRunOne(ctx, p, [p.level]); }
    });
  });

  registerDetector({
    id: 'fib-any', label: 'M15 fib (any of three)', tagKeywords: ['m15', 'fib'], tagFrom: ['fib-30', 'fib-382', 'fib-50'],
    timeframe: '15m', type: 'state', longsOnly: true,
    params: [
      { key: 'W', label: 'W (M15 candles for the leg)', type: 'int', default: 16, min: 2, max: 96 },
      { key: 'T', label: 'T (+/- points)', type: 'number', default: 3, min: 0, step: 0.5 },
      { key: 'l1', label: 'Level 1 (%)', type: 'number', default: 30, min: 0, max: 100, step: 0.1 },
      { key: 'l2', label: 'Level 2 (%)', type: 'number', default: 38.2, min: 0, max: 100, step: 0.1 },
      { key: 'l3', label: 'Level 3 (%)', type: 'number', default: 50, min: 0, max: 100, step: 0.1 }
    ],
    definition: function (p) {
      return 'Longs only. Fires when r = (H - entry) / (H - A) on the last W=' + p.W + ' completed M15 candles is within +/- ' + p.T + ' points of ' + p.l1 + '%, ' + p.l2 + '% or ' + p.l3 +
        '%. The chart and entry finder use these settings. Tagged if the trade carries any of the three matching tags.';
    },
    minCandles: function (p) { return p.W; },
    run: function (ctx, p) { return fibRunOne(ctx, { W: p.W, T: p.T }, [p.l1, p.l2, p.l3]); }
  });

  // Entry finder. Walks the completed M15 candles from the BOS candle's close to the entry and records,
  // for each Fibonacci level, the FIRST candle whose low touched the level of the leg as it stood at
  // that candle (leg from candles up to and including it, never later ones). A candle that itself
  // set H is skipped: its low may have come before its high, so a retracement inside it is unknowable.
  // A fixed A/H override (per-trade, in memory) is used unchanged for every candle.
  function entryFinder(series, bosCloseMs, anchorMs, W, levels, override, entryPrice) {
    var iLast = lastCompletedIndex(series, anchorMs);
    var out = { levels: levels.map(function (lv) { return { level: lv, touched: false }; }), note: null, firstIdx: null, lastIdx: iLast };
    if (iLast < 0) { out.note = 'no completed M15 candle before the entry'; return out; }
    var j0 = 0;
    while (j0 <= iLast && series.t[j0] < bosCloseMs) j0++;
    if (j0 > iLast) { out.note = 'no completed M15 candle between the BOS close and the entry'; return out; }
    if (series.t[0] > bosCloseMs) out.note = 'M15 history starts after the BOS close, so the search begins at the first fetched candle';
    out.firstIdx = j0;
    for (var j = j0; j <= iLast; j++) {
      var leg = effectiveLeg(series, j, W, override);
      if (!leg.ok) continue;
      if (leg.hIdx === j) continue;
      for (var x = 0; x < out.levels.length; x++) {
        var L = out.levels[x];
        if (L.touched) continue;
        var price = leg.H - L.level / 100 * (leg.H - leg.A);
        if (series.l[j] <= price) {
          L.touched = true;
          L.idx = j;
          L.t = series.t[j];
          L.price = price;
          L.legH = leg.H;
          L.legA = leg.A;
          L.hoursBeforeEntry = (anchorMs - (series.t[j] + series.ms)) / 3600000;
          L.pctBelowEntry = entryPrice > 0 ? (entryPrice - price) / entryPrice * 100 : null;
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------

  // Timeframes: which series of a pair a detector reads, and how to name it.
  var TF = {
    '4h': { key: 'h4', label: '4H' },
    '1d': { key: 'd1', label: 'daily', note: 'dailyNote' },
    '15m': { key: 'm15', label: 'M15', note: 'm15Note' }
  };

  function na(reason) { return { status: 'na', fired: null, reason: reason }; }

  // pair = { h4: series, d1: series|null, m15: series|null }.
  // entry (optional) describes a real trade: { price: number|null, direction, override: {A,H}|null }.
  // Without it the anchor is a base-rate sample and the price is the last completed close.
  // Returns { status:'ok'|'na', fired, value, reason }.
  function evaluateDetector(def, params, pair, anchorMs, entry) {
    var tf = TF[def.timeframe];
    var series = pair[tf.key];
    if (!series) return na('no ' + tf.label + ' data for this pair' + (tf.note && pair[tf.note] ? ' (' + pair[tf.note] + ')' : ''));
    if (def.longsOnly && entry && entry.direction === 'short') return na('short trade: this detector is longs only');
    var i = lastCompletedIndex(series, anchorMs);
    if (i < 0) return na('anchor is before the first fetched ' + tf.label + ' candle');
    var need = def.minCandles ? def.minCandles(params) : WARMUP + 1;      // candles needed at or before i
    if (i + 1 < need) {
      return na(def.timeframe === '15m'
        ? 'M15 history too short (' + (i + 1) + ' candle' + (i === 0 ? '' : 's') + ' before the anchor, ' + need + ' needed)'
        : 'only ' + i + ' ' + tf.label + ' candles before the anchor (< ' + WARMUP + ' warm-up)');
    }
    // The last completed candle must actually be the one that just closed; a
    // larger gap means missing data, and using it would be silent staleness.
    var closeT = series.t[i] + series.ms;
    if (anchorMs - closeT >= series.ms) return na('data gap: last ' + tf.label + ' candle closed more than one interval before the anchor');
    // The candle that contains the anchor is still forming: expose its OPEN only, and only when it really follows candle i.
    var current = i + 1 < series.n && series.t[i + 1] === series.t[i] + series.ms && series.t[i + 1] <= anchorMs
      ? { t: series.t[i + 1], open: series.o[i + 1] } : null;
    // Price at the anchor: the journal entry price; for a trade without one, the open of the candle
    // holding the entry (labelled approx); for base-rate anchors, the last completed close.
    var price = null;
    if (entry) {
      if (typeof entry.price === 'number' && isFinite(entry.price) && entry.price > 0) price = { value: entry.price, kind: 'entry' };
      else if (current) price = { value: current.open, kind: 'approx' };
    } else {
      price = { value: series.c[i], kind: 'last-close' };
    }
    var out = def.run({ series: series, i: i, anchorMs: anchorMs, current: current, price: price, override: entry && entry.override || null }, params);
    if (out.na) return na(out.na);
    return { status: 'ok', fired: !!out.fired, value: out.value, reason: null, barIndex: i };
  }

  // Anchors for base rates: the close of each completed candle of a series, from startIdx on.
  function baseAnchorsFor(series, nowMs, startIdx) {
    var out = [];
    for (var k = startIdx || 0; k < series.n; k++) {
      var t = series.t[k] + series.ms;
      if (t <= nowMs) out.push(t);
    }
    return out;
  }

  // Every 4H anchor with a full warm-up: the close of each completed 4H candle.
  function baseAnchors(pair, nowMs) {
    return baseAnchorsFor(pair.h4, nowMs, WARMUP);
  }

  // results: { detectorId: evaluateDetector result }. The combination fires
  // only when every selected detector fires; it is n/a if any is n/a.
  function combine(results, ids) {
    if (!ids.length) return null;
    var reason = null;
    var all = true;
    for (var x = 0; x < ids.length; x++) {
      var r = results[ids[x]];
      if (!r || r.status !== 'ok') { reason = (r && r.reason) || 'detector unavailable'; return { status: 'na', fired: null, reason: reason }; }
      if (!r.fired) all = false;
    }
    return { status: 'ok', fired: all, reason: null };
  }

  // ---------------------------------------------------------------------
  // Tags and statistics
  // ---------------------------------------------------------------------

  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

  // First shortest vocabulary name containing every keyword, or null.
  function resolveTag(def, names) {
    var best = null;
    names.forEach(function (name) {
      var n = norm(name);
      var ok = def.tagKeywords.every(function (kw) { return n.indexOf(kw) !== -1; });
      if (ok && (best === null || name.length < best.length)) best = name;
    });
    return best;
  }

  function hasTag(tagList, tagName) {
    var key = norm(tagName);
    return tagList.some(function (t) { return norm(t) === key; });
  }

  // rows: [{tagged, fired}]
  function tally(rows) {
    var t = { tp: 0, fn: 0, fp: 0, tn: 0, n: rows.length };
    rows.forEach(function (r) {
      if (r.tagged && r.fired) t.tp++;
      else if (r.tagged) t.fn++;
      else if (r.fired) t.fp++;
      else t.tn++;
    });
    t.tagged = t.tp + t.fn;
    t.fired = t.tp + t.fp;
    return t;
  }

  var MIN_TAGGED = 5;

  function summarize(t, baseFires, baseN) {
    var agreement = t.tagged > 0 ? t.tp / t.tagged : null;
    var baseRate = baseN > 0 ? baseFires / baseN : null;
    var lift = agreement !== null && baseRate ? agreement / baseRate : null;
    return {
      tp: t.tp, fn: t.fn, fp: t.fp, tn: t.tn, n: t.n, tagged: t.tagged, fired: t.fired,
      agreement: agreement,
      precision: t.fired > 0 ? t.tp / t.fired : null,
      baseFires: baseFires, baseN: baseN, baseRate: baseRate, lift: lift,
      indicativeOnly: t.tagged < MIN_TAGGED
    };
  }

  function pct(x) { return x === null ? 'n/a' : Math.round(x * 100) + '%'; }
  function num(x, d) { return x === null || x === undefined ? 'n/a' : Number(x).toFixed(d === undefined ? 1 : d); }

  function verdictLine(label, s, opts) {
    opts = opts || {};
    if (opts.noTag) return label + ': no matching tag in the parameter vocabulary, so agreement cannot be computed';
    if (s.tagged === 0) {
      return label + ': no tagged trades in the tested sample (fires on ' + s.fp + '/' + s.n + ' untagged; base rate ' + pct(s.baseRate) + ')';
    }
    var line = label + ': fires on ' + s.tp + '/' + s.tagged + ' tagged entries, base rate ' + pct(s.baseRate) +
      ', lift ' + (s.lift === null ? 'n/a' : num(s.lift, 1)) +
      '; also fires on ' + s.fp + '/' + (s.fp + s.tn) + ' untagged trades';
    if (s.indicativeOnly) line += ' (indicative only: ' + s.tagged + ' tagged < ' + MIN_TAGGED + ')';
    return line;
  }

  return {
    M15_MS: M15_MS, H4_MS: H4_MS, D1_MS: D1_MS, WARMUP: WARMUP, MIN_TAGGED: MIN_TAGGED,
    buildSeries: buildSeries, lastCompletedIndex: lastCompletedIndex, containingIndex: containingIndex,
    rsiWilder: rsiWilder, rsiSeries: rsiSeries, atrSeries: atrSeries, legAt: legAt, effectiveLeg: effectiveLeg, entryFinder: entryFinder, volumeRatioSeries: volumeRatioSeries,
    swingHighIndices: swingHighIndices, bosScan: bosScan,
    registerDetector: registerDetector, getDetectors: getDetectors, defaultParams: defaultParams, definitionText: definitionText,
    evaluateDetector: evaluateDetector, baseAnchors: baseAnchors, baseAnchorsFor: baseAnchorsFor, combine: combine,
    resolveTag: resolveTag, hasTag: hasTag, tally: tally, summarize: summarize, verdictLine: verdictLine,
    pct: pct, num: num
  };
});
