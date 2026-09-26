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
  //   run(ctx, p)  ctx = { series, i, anchorMs }; series/i are already the
  //                right timeframe and i is the last completed candle.
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
    function stamp(ev) {
      return ev ? { level: ev.level, bosT: s.t[ev.i], swingT: s.t[ev.swing], barsAgo: ctx.i - ev.i, N: ev.N } : null;
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

  // One daily candle tested against the three conditions. Returns null when there
  // are not N prior days (or no previous close) to measure against.
  function sig(x) { return Number(Number(x).toPrecision(6)); }

  function momentumCandle(s, k, p) {
    if (k < 1 || k < p.N) return null;
    var o = s.o[k], c = s.c[k], prevC = s.c[k - 1];
    // (c - ref) / ref rather than c / ref - 1: the latter turns an exact +15% into 14.999999999999998.
    var gainPrev = prevC > 0 ? (c - prevC) / prevC * 100 : null;
    var gainOpen = o > 0 ? (c - o) / o * 100 : null;
    var gain = p.gainBasis === 'open' ? gainOpen : gainPrev;
    var useHigh = p.freshBasis === 'high';
    var level = -Infinity;
    for (var j = k - p.N; j < k; j++) {
      var v = useHigh ? s.h[j] : s.c[j];
      if (v > level) level = v;
    }
    var price = useHigh ? s.h[k] : c;
    var bullish = c > o;
    var gainOk = gain !== null && gain >= p.P;
    var breakOk = price > level;
    var misses = [];
    if (!bullish) misses.push('not bullish (close ' + sig(c) + ' <= open ' + sig(o) + ')');
    if (!gainOk) misses.push(gain === null ? 'gain n/a' : 'gain ' + gain.toFixed(1) + '% < ' + p.P + '%');
    if (!breakOk) {
      misses.push((useHigh ? 'high ' : 'close ') + sig(price) + ' <= prior ' + p.N + 'd highest ' + (useHigh ? 'high ' : 'close ') + sig(level) +
        ' (' + ((price / level - 1) * 100).toFixed(1) + '%)');
    }
    return {
      ok: bullish && gainOk && breakOk,
      passed: (bullish ? 1 : 0) + (gainOk ? 1 : 0) + (breakOk ? 1 : 0),
      value: {
        barT: s.t[k], bullish: bullish, gainPrevClose: gainPrev, gainOpen: gainOpen, gain: gain, P: p.P, gainBasis: p.gainBasis,
        level: level, price: price, breakoutPct: (price / level - 1) * 100, levelBasis: useHigh ? 'high' : 'close', N: p.N,
        misses: misses
      }
    };
  }

  registerDetector({
    id: 'daily-momentum', label: 'Daily Momentum Continuation', tagKeywords: ['daily', 'momentum', 'continuation'],
    timeframe: '1d', type: 'state',
    params: [
      { key: 'P', label: 'P (min gain %)', type: 'number', default: 10, min: 0, step: 0.5 },
      { key: 'gainBasis', label: 'Gain measured as', type: 'select', default: 'prevClose', options: [['prevClose', 'Close vs previous close'], ['open', 'Close vs same-day open']] },
      { key: 'N', label: 'N (days)', type: 'int', default: 10, min: 1, max: 90 },
      { key: 'freshBasis', label: 'Fresh high means', type: 'select', default: 'close', options: [['close', 'Close > highest prior close'], ['high', 'High > highest prior high']] },
      { key: 'lookback', label: 'Days to look back', type: 'int', default: 1, min: 1, max: 3 }
    ],
    definition: function (p) {
      return 'A completed daily candle is bullish (close > open), gains >= ' + p.P + '% (' +
        (p.gainBasis === 'open' ? 'close vs same-day open' : 'close vs previous close') + ') and its ' +
        (p.freshBasis === 'high' ? 'high is above the highest high' : 'close is above the highest close') + ' of the prior ' + p.N +
        ' days; fires if any of the last ' + p.lookback + ' completed daily candle' + (p.lookback === 1 ? '' : 's') + ' qualifies.';
    },
    run: function (ctx, p) {
      var lo = Math.max(0, ctx.i - p.lookback + 1);
      var hit = null, best = null, usable = 0;
      for (var k = ctx.i; k >= lo; k--) {          // newest first, so ties keep the more recent candle
        var q = momentumCandle(ctx.series, k, p);
        if (!q) continue;
        usable++;
        q.value.daysAgo = ctx.i - k;
        if (q.ok) { hit = q; break; }
        if (!best || q.passed > best.passed) best = q;
      }
      if (!usable) return { na: 'fewer than ' + p.N + ' daily candles before the anchor' };
      var pick = hit || best;
      return { fired: !!hit, value: pick.value };
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

  // ---------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------

  // pair = { h4: series, d1: series|null }. Returns { status:'ok'|'na', fired, value, reason }.
  function evaluateDetector(def, params, pair, anchorMs) {
    var series = def.timeframe === '1d' ? pair.d1 : pair.h4;
    var tfLabel = def.timeframe === '1d' ? 'daily' : '4H';
    if (!series) return { status: 'na', fired: null, reason: 'no ' + tfLabel + ' data for this pair' };
    var i = lastCompletedIndex(series, anchorMs);
    if (i < 0) return { status: 'na', fired: null, reason: 'anchor is before the first fetched ' + tfLabel + ' candle' };
    if (i < WARMUP) return { status: 'na', fired: null, reason: 'only ' + i + ' ' + tfLabel + ' candles before the anchor (< ' + WARMUP + ' warm-up)' };
    // The last completed candle must actually be the one that just closed; a
    // larger gap means missing data, and using it would be silent staleness.
    var closeT = series.t[i] + series.ms;
    if (anchorMs - closeT >= series.ms) return { status: 'na', fired: null, reason: 'data gap: last ' + tfLabel + ' candle closed more than one interval before the anchor' };
    var out = def.run({ series: series, i: i, anchorMs: anchorMs }, params);
    if (out.na) return { status: 'na', fired: null, reason: out.na };
    return { status: 'ok', fired: !!out.fired, value: out.value, reason: null, barIndex: i };
  }

  // Every 4H anchor with a full warm-up: the close of each completed 4H candle.
  function baseAnchors(pair, nowMs) {
    var out = [];
    var s = pair.h4;
    for (var k = WARMUP; k < s.n; k++) {
      var t = s.t[k] + s.ms;
      if (t <= nowMs) out.push(t);
    }
    return out;
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
    H4_MS: H4_MS, D1_MS: D1_MS, WARMUP: WARMUP, MIN_TAGGED: MIN_TAGGED,
    buildSeries: buildSeries, lastCompletedIndex: lastCompletedIndex, containingIndex: containingIndex,
    rsiWilder: rsiWilder, rsiSeries: rsiSeries, volumeRatioSeries: volumeRatioSeries,
    swingHighIndices: swingHighIndices, bosScan: bosScan,
    registerDetector: registerDetector, getDetectors: getDetectors, defaultParams: defaultParams, definitionText: definitionText,
    evaluateDetector: evaluateDetector, baseAnchors: baseAnchors, combine: combine,
    resolveTag: resolveTag, hasTag: hasTag, tally: tally, summarize: summarize, verdictLine: verdictLine,
    pct: pct, num: num
  };
});
