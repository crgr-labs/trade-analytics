// Run with:  node dev/backtest-lab.test.js
'use strict';
var assert = require('assert');
var Core = require('./backtest-lab-core.js');

var passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
function near(a, b, eps) { assert.ok(Math.abs(a - b) <= (eps || 0.01), a + ' !~ ' + b); }

var H4 = Core.H4_MS, D1 = Core.D1_MS;

function rows(candles, ms, start) {
  return candles.map(function (c, i) {
    return [start + i * ms, c.o, c.h, c.l, c.c, c.v === undefined ? 100 : c.v];
  });
}
function flat(h, c, v) { return { o: c, h: h, l: c - 1, c: c, v: v }; }

// Deterministic pseudo-random walk (mulberry32).
function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function walk(n, seed, ms, start) {
  var r = rng(seed), price = 100, out = [];
  for (var i = 0; i < n; i++) {
    var o = price;
    var c = o * (1 + (r() - 0.48) * 0.04);
    var h = Math.max(o, c) * (1 + r() * 0.01);
    var l = Math.min(o, c) * (1 - r() * 0.01);
    var v = 100 * (0.5 + r() * (r() < 0.08 ? 6 : 1.5));
    out.push([start + i * ms, o, h, l, c, v]);
    price = c;
  }
  return out;
}

console.log('RSI');
test('matches the Wilder / StockCharts worked example', function () {
  var closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64];
  var r = Core.rsiWilder(closes, 14);
  assert.strictEqual(r[13], null);
  // Published values (70.53, 66.32, 66.55) round the intermediate averages;
  // worked by hand from the raw changes: 3.34/14 gain, 1.40/14 loss -> 70.46.
  near(r[14], 70.46, 0.01);
  near(r[15], 66.25, 0.01);
  near(r[14], 70.53, 0.1);
  near(r[15], 66.32, 0.1);
  near(r[16], 66.55, 0.15);
});
test('flat prices -> 100 (TradingView: no losses), pure fall -> 0', function () {
  var flatC = []; for (var i = 0; i < 30; i++) flatC.push(10);
  assert.strictEqual(Core.rsiWilder(flatC, 14)[20], 100);
  var down = []; for (var j = 0; j < 30; j++) down.push(100 - j);
  assert.strictEqual(Core.rsiWilder(down, 14)[20], 0);
});

console.log('Swing highs and BOS');
// index: 0  1  2  3  4  5  6  7  8  9 10
// high : 5  6  9  6  5  7  8  6  4 10 11   (N=2: swing at 2 [9]; 6 [8] is not: needs > 7 at idx 5)
test('swing high needs N strictly lower highs each side', function () {
  var h = [5, 6, 9, 6, 5, 7, 8, 6, 4, 10, 11];
  assert.deepStrictEqual(Core.swingHighIndices(h, 2), [2, 6]);
  assert.deepStrictEqual(Core.swingHighIndices([1, 3, 3, 1, 0], 1), []); // equal highs are not "strictly greater"
});
function seriesFromHC(hs, cs) {
  var rs = hs.map(function (h, i) { return [i * H4, cs[i], h, cs[i] - 1, cs[i], 100]; });
  return Core.buildSeries(rs, H4);
}
test('BOS uses the close by default and the wick when asked', function () {
  // swing high 10 at idx 2; candle 6 wicks to 11 but closes 9.5; candle 8 closes 10.5
  var h = [5, 6, 10, 6, 5, 5, 11, 5, 11, 5];
  var c = [4, 5, 9, 5, 4, 4, 9.5, 4, 10.5, 4];
  var s = seriesFromHC(h, c);
  assert.deepStrictEqual(Core.bosScan(s, 2, 'close').events.map(function (e) { return e.i; }), [8]);
  assert.deepStrictEqual(Core.bosScan(s, 2, 'wick').events.map(function (e) { return e.i; }), [6]);
  assert.strictEqual(Core.bosScan(s, 2, 'close').events[0].level, 10);
});
test('a swing high is not usable until N candles to its right exist', function () {
  // idx 2 (9) is an older unbroken swing. idx 6 (9.5) is a swing but is only confirmed at idx 8.
  // Candle 7 closes 9.4: above 9, below 9.5. With no lookahead the target at idx 7 is still idx 2, so it breaks.
  var h = [5, 6, 9, 8, 7, 6, 9.5, 9.45, 7, 6, 5];
  var c = [4, 5, 8.5, 7, 6, 5, 8.5, 9.4, 6, 5, 4];
  var s = seriesFromHC(h, c);
  assert.deepStrictEqual(Core.swingHighIndices(s.h, 2), [2, 6]);
  var ev = Core.bosScan(s, 2, 'close').events;
  assert.deepStrictEqual(ev.map(function (e) { return [e.i, e.level, e.swing]; }), [[7, 9, 2]]);
});
test('an already-broken swing high cannot break again; older unbroken one can later', function () {
  //        0  1  2   3  4  5  6  7   8  9  10 11 12 13
  var h = [5, 6, 20, 6, 5, 9, 12, 8, 7, 13, 6, 5, 22, 5];
  var c = [4, 5, 19, 5, 4, 8, 11, 7, 6, 12.5, 5, 4, 21, 4];
  var s = seriesFromHC(h, c);
  // swings (N=2): idx2=20 (confirmed 4), idx6=12 (confirmed 8), idx9=13 (confirmed 11)
  var sw = Core.swingHighIndices(s.h, 2);
  assert.deepStrictEqual(sw, [2, 6, 9]);
  var ev = Core.bosScan(s, 2, 'close').events;
  // idx9 closes 12.5 > 12 (swing 6 is the most recent unbroken) -> BOS of 12; idx12 closes 21 > 13 (swing 9) and > 20
  assert.deepStrictEqual(ev.map(function (e) { return [e.i, e.level]; }), [[9, 12], [12, 13]]);
});

console.log('Detectors');
function pairFrom(rows4, rows1) {
  return { h4: Core.buildSeries(rows4, H4), d1: rows1 ? Core.buildSeries(rows1, D1) : null };
}
var det = {};
Core.getDetectors().forEach(function (d) { det[d.id] = d; });

test('every detector validates a tag keyword set and is registered once', function () {
  var ids = Core.getDetectors().map(function (d) { return d.id; });
  assert.deepStrictEqual(ids.slice().sort(), ['bos-any', 'bos-major', 'bos-minor', 'bos-recent', 'daily-momentum', 'rsi-4h-above', 'rsi-d-above', 'rsi-d-below', 'volume-spike']);
  assert.throws(function () { Core.registerDetector({ id: 'bos-any', run: function () {} }); });
});
test('tag resolution reads names from the vocabulary', function () {
  var vocab = ['Daily Sideways', '4H BOS', '4H BOS Retest', 'Daily RSI above 70', 'Daily RSI below 70', '4H RSI above 70', 'Volume spike confirmed', 'M15 50% Fibonacci Pullback'];
  assert.strictEqual(Core.resolveTag(det['bos-recent'], vocab), '4H BOS');
  assert.strictEqual(Core.resolveTag(det['rsi-d-above'], vocab), 'Daily RSI above 70');
  assert.strictEqual(Core.resolveTag(det['rsi-d-below'], vocab), 'Daily RSI below 70');
  assert.strictEqual(Core.resolveTag(det['rsi-4h-above'], vocab), '4H RSI above 70');
  assert.strictEqual(Core.resolveTag(det['volume-spike'], vocab), 'Volume spike confirmed');
  assert.strictEqual(Core.resolveTag(det['volume-spike'], ['Daily Sideways']), null);
  assert.strictEqual(Core.resolveTag(det['daily-momentum'], vocab.concat('Daily Momentum Continuation', 'Daily Uptrend & Momentum')), 'Daily Momentum Continuation');
  assert.strictEqual(Core.resolveTag(det['daily-momentum'], ['Daily Uptrend & Momentum']), null);
});
test('daily detector uses the previous COMPLETED daily candle (no lookahead at the day boundary)', function () {
  var start = Date.UTC(2026, 0, 1);
  var d1 = []; for (var i = 0; i < 130; i++) d1.push([start + i * D1, 100, 101, 99, 100 + (i < 129 ? -i * 0.1 : 500), 10]);
  var h4 = []; for (var k = 0; k < 130 * 6; k++) h4.push([start + k * H4, 100, 101, 99, 100, 10]);
  var pair = pairFrom(h4, d1);
  var p = Core.defaultParams(det['rsi-d-above']);
  // Day 129 (the +500 spike) opens at start+129d. At 23:59 that day it is still forming; at 00:00 the next day it is complete.
  var during = Core.evaluateDetector(det['rsi-d-above'], p, pair, start + 129 * D1 + D1 - 60000);
  assert.strictEqual(during.status, 'ok');
  assert.strictEqual(during.fired, false);
  assert.strictEqual(during.barIndex, 128);
  var after = Core.evaluateDetector(det['rsi-d-above'], p, pair, start + 130 * D1);
  assert.strictEqual(after.barIndex, 129);
  assert.strictEqual(after.fired, true);
});
test('warm-up, missing series and data gaps come back as n/a with a reason', function () {
  var start = Date.UTC(2026, 0, 1);
  var pair = pairFrom(walk(150, 1, H4, start), null);
  var early = Core.evaluateDetector(det['rsi-4h-above'], Core.defaultParams(det['rsi-4h-above']), pair, start + 50 * H4);
  assert.strictEqual(early.status, 'na');
  assert.ok(/warm-up/.test(early.reason));
  var noDaily = Core.evaluateDetector(det['rsi-d-above'], Core.defaultParams(det['rsi-d-above']), pair, start + 140 * H4);
  assert.strictEqual(noDaily.status, 'na');
  assert.ok(/no daily data/.test(noDaily.reason));
  var gap = Core.evaluateDetector(det['rsi-4h-above'], Core.defaultParams(det['rsi-4h-above']), pair, start + 149 * H4 + 3 * H4);
  assert.strictEqual(gap.status, 'na');
  assert.ok(/gap/.test(gap.reason));
});
test('volume spike: k x mean of the 20 previous candles, within the last L', function () {
  var start = Date.UTC(2026, 0, 1);
  var cs = []; for (var i = 0; i < 150; i++) cs.push(flat(101, 100, 100));
  cs[120].v = 250;               // 2.5x
  cs[130].v = 199;               // 1.99x
  var pair = pairFrom(rows(cs, H4, start));
  var p = Core.defaultParams(det['volume-spike']);
  var anchorAt = function (lastIdx) { return start + (lastIdx + 1) * H4; };
  var f = Core.evaluateDetector(det['volume-spike'], p, pair, anchorAt(125)); // spike 5 bars ago, L=6
  assert.strictEqual(f.fired, true);
  near(f.value.ratio, 2.5, 1e-9);
  assert.strictEqual(f.value.barsAgo, 5);
  var late = Core.evaluateDetector(det['volume-spike'], p, pair, anchorAt(126)); // 6 bars ago -> outside window of 6
  assert.strictEqual(late.fired, false);
  var near2 = Core.evaluateDetector(det['volume-spike'], p, pair, anchorAt(131)); // only the 1.99x candle in window
  assert.strictEqual(near2.fired, false);
  near(near2.value.ratio, 199 / 107.5, 1e-9);   // the prior-20 average includes the 250 candle
});
test('BOS event window: fires within last L candles, not after', function () {
  var start = Date.UTC(2026, 0, 1);
  var h = [], c = [];
  for (var i = 0; i < 140; i++) { h.push(50 + (i % 3)); c.push(49); }
  h[110] = 80; c[110] = 60;       // swing high (N=4) at 110, others <= 52
  for (var k = 111; k < 140; k++) { h[k] = 52; c[k] = 50; }
  h[120] = 85; c[120] = 82;       // closes above it -> BOS at 120
  var rs = h.map(function (hh, i) { return [start + i * H4, c[i], hh, c[i] - 1, c[i], 100]; });
  var pair = pairFrom(rs);
  var p = Core.defaultParams(det['bos-recent']);
  var at = function (lastIdx) { return start + (lastIdx + 1) * H4; };
  var r = Core.evaluateDetector(det['bos-recent'], p, pair, at(125));
  assert.strictEqual(r.fired, true);
  assert.strictEqual(r.value.level, 80);
  assert.strictEqual(r.value.barsAgo, 5);
  assert.strictEqual(Core.evaluateDetector(det['bos-recent'], p, pair, at(126)).fired, false);
  assert.strictEqual(Core.evaluateDetector(det['bos-recent'], p, pair, at(119)).fired, false);
  var any = Core.evaluateDetector(det['bos-any'], Core.defaultParams(det['bos-any']), pair, at(125));
  assert.strictEqual(any.fired, true);
  assert.ok(any.value.scales.length >= 1);
});


console.log('Daily Momentum Continuation');
// 120 flat days (100), then the day under test at index 119 (open/close/high as given).
function momentumPair(o, h, c, prevClose, extra) {
  var start = Date.UTC(2026, 0, 1), d1 = [];
  for (var i = 0; i < 120; i++) d1.push([start + i * D1, 100, 101, 99, 100, 10]);
  if (prevClose !== undefined) d1[118][4] = prevClose;
  d1[119] = [start + 119 * D1, o, h, 99, c, 10];
  if (extra) extra(d1);
  return { start: start, pair: pairFrom(walk(120 * 6, 5, H4, start), d1) };
}
var mom = det['daily-momentum'];
function momAt(x, params, dayIdx) { return Core.evaluateDetector(mom, Object.assign(Core.defaultParams(mom), params || {}), x.pair, x.start + (dayIdx + 1) * D1); }
test('fires on a bullish +15% breakout to a fresh 10-day close high; reports both gains, level and margin', function () {
  var x = momentumPair(100, 116, 115);
  var r = momAt(x, {}, 119);
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.fired, true);
  near(r.value.gainPrevClose, 15, 1e-9);
  near(r.value.gainOpen, 15, 1e-9);
  assert.strictEqual(r.value.level, 100);
  near(r.value.breakoutPct, 15, 1e-9);
  assert.strictEqual(r.value.daysAgo, 0);
});
test('gain threshold is inclusive and editable; gain basis switches between prev close and open', function () {
  var x = momentumPair(110, 116, 115);            // gap up: +15% vs prev close, +4.5% vs open
  assert.strictEqual(momAt(x, { P: 15 }, 119).fired, true);          // exactly 15 -> passes (>=)
  assert.strictEqual(momAt(x, { P: 15.01 }, 119).fired, false);
  var byOpen = momAt(x, { gainBasis: 'open' }, 119);
  assert.strictEqual(byOpen.fired, false);
  near(byOpen.value.gainOpen, 4.545, 0.001);
  assert.ok(/gain 4.5% < 10%/.test(byOpen.value.misses.join()));
  assert.strictEqual(momAt(x, { gainBasis: 'open', P: 4 }, 119).fired, true);
});
test('fresh-high basis: close vs highest prior close, or high vs highest prior high', function () {
  // prior highs are 101, prior closes 100. Candle closes 100.5 (below prior high 101 but above prior closes)
  var x = momentumPair(90, 102, 100.5, 88);       // +14.2% vs prev close 88, bullish
  assert.strictEqual(momAt(x, {}, 119).fired, true);                   // close 100.5 > 100
  var hi = momAt(x, { freshBasis: 'high' }, 119);                      // high 102 > 101
  assert.strictEqual(hi.fired, true);
  var y = momentumPair(90, 100.8, 100.5, 88);                          // high 100.8 <= 101
  var miss = momAt(y, { freshBasis: 'high' }, 119);
  assert.strictEqual(miss.fired, false);
  assert.ok(/high 100.8 <= prior 10d highest high 101/.test(miss.value.misses.join()));
});
test('bearish candle never qualifies even with a big gain vs prev close', function () {
  var x = momentumPair(130, 131, 115);            // +15% vs prev close but red (close < open)
  var r = momAt(x, {}, 119);
  assert.strictEqual(r.fired, false);
  assert.ok(/not bullish/.test(r.value.misses.join()));
});
test('closest miss is the candle passing the most conditions; N days is editable', function () {
  var x = momentumPair(100, 109, 108.2, undefined);   // +8.2%, bullish, breaks 100 -> only the gain fails
  var r = momAt(x, {}, 119);
  assert.strictEqual(r.fired, false);
  assert.deepStrictEqual(r.value.misses.length, 1);
  assert.ok(/gain 8.2% < 10%/.test(r.value.misses[0]));
  var z = momentumPair(100, 116, 115, undefined, function (d1) { d1[112][4] = 120; d1[112][2] = 121; });  // a higher close 7 days before
  assert.strictEqual(momAt(z, { N: 10 }, 119).fired, false);           // 115 < 120
  assert.strictEqual(momAt(z, { N: 5 }, 119).fired, true);             // 120 is outside the prior 5 days
});
test('look-back window: default only the last completed daily candle; up to 3 candles', function () {
  var x = momentumPair(100, 116, 115, undefined, function (d1) {
    d1[119] = [d1[119][0], 115, 116, 114, 115.5, 10];                  // day 119 quiet; qualifying candle moves to day 118
    d1[118] = [d1[118][0], 100, 116, 99, 115, 10];
  });
  assert.strictEqual(momAt(x, {}, 119).fired, false);
  var two = momAt(x, { lookback: 2 }, 119);
  assert.strictEqual(two.fired, true);
  assert.strictEqual(two.value.daysAgo, 1);
  assert.strictEqual(momAt(x, { lookback: 3 }, 119).fired, true);
});
test('no lookahead: the day still forming at the anchor is ignored', function () {
  var x = momentumPair(100, 116, 115);
  var during = momAt(x, {}, 118);                                      // anchor at 00:00 of day 119: day 119 not complete
  assert.strictEqual(during.fired, false);
  assert.strictEqual(during.barIndex, 118);
  var midDay = Core.evaluateDetector(mom, Core.defaultParams(mom), x.pair, x.start + 119 * D1 + 12 * 3600 * 1000);
  assert.strictEqual(midDay.fired, false);
  assert.strictEqual(momAt(x, {}, 119).fired, true);
});
test('n/a when there are not N prior days', function () {
  var x = momentumPair(100, 116, 115);
  assert.strictEqual(momAt(x, { N: 90 }, 119).status, 'ok');           // 119 candles before the anchor >= 90
  var r = momAt(x, { N: 200 }, 119);                                   // only 119 before it, 200 needed
  assert.strictEqual(r.status, 'na');
  assert.ok(/fewer than 200 daily candles/.test(r.reason));
});

console.log('No lookahead (truncation invariance)');
// Result at anchor A must be identical whether or not any candle that had not
// closed by A exists in the data.
test('every detector gives the same answer on the full series and on a series cut at the anchor', function () {
  var start = Date.UTC(2025, 5, 1);
  var full4 = walk(900, 7, H4, start);
  var full1 = walk(150, 11, D1, start);
  var fullPair = pairFrom(full4, full1);
  var checked = 0;
  var r = rng(99);
  Core.getDetectors().forEach(function (d) {
    var params = Core.defaultParams(d);
    if (d.id === 'rsi-d-above' || d.id === 'rsi-d-below') params.threshold = 50;
    if (d.id === 'rsi-4h-above') params.threshold = 50;
    for (var trial = 0; trial < 60; trial++) {
      var idx = 110 + Math.floor(r() * 780);
      var anchor = start + idx * H4 + Math.floor(r() * H4);   // anywhere inside candle idx
      var cutRows4 = full4.filter(function (row) { return row[0] + H4 <= anchor; });
      var cutRows1 = full1.filter(function (row) { return row[0] + D1 <= anchor; });
      var cutPair = pairFrom(cutRows4, cutRows1.length ? cutRows1 : null);
      var a = Core.evaluateDetector(d, params, fullPair, anchor);
      var b = Core.evaluateDetector(d, params, cutPair, anchor);
      assert.deepStrictEqual(a, b, d.id + ' differs at anchor ' + anchor);
      checked++;
    }
  });
  assert.ok(checked >= 400);
});
test('base anchors are 4H closes after warm-up only', function () {
  var start = Date.UTC(2026, 0, 1);
  var pair = pairFrom(walk(300, 3, H4, start), null);
  var a = Core.baseAnchors(pair, start + 300 * H4);
  assert.strictEqual(a.length, 300 - Core.WARMUP);
  assert.strictEqual(a[0], start + (Core.WARMUP + 1) * H4);
  var partial = Core.baseAnchors(pair, start + 299 * H4 + 1000);   // last candle still forming
  assert.strictEqual(partial.length, 299 - Core.WARMUP);
});

console.log('Combination and statistics');
test('combination fires only if ALL selected fire; n/a if any is n/a', function () {
  var ok = function (f) { return { status: 'ok', fired: f }; };
  assert.strictEqual(Core.combine({ a: ok(true), b: ok(true) }, ['a', 'b']).fired, true);
  assert.strictEqual(Core.combine({ a: ok(true), b: ok(false) }, ['a', 'b']).fired, false);
  assert.strictEqual(Core.combine({ a: ok(true), b: { status: 'na', reason: 'x' } }, ['a', 'b']).status, 'na');
  assert.strictEqual(Core.combine({}, []), null);
});
test('2x2, agreement, base rate, lift, indicative-only flag', function () {
  var rowsIn = [
    { tagged: true, fired: true }, { tagged: true, fired: true }, { tagged: true, fired: true }, { tagged: true, fired: false },
    { tagged: false, fired: true }, { tagged: false, fired: false }, { tagged: false, fired: false }
  ];
  var t = Core.tally(rowsIn);
  assert.deepStrictEqual([t.tp, t.fn, t.fp, t.tn], [3, 1, 1, 2]);
  var s = Core.summarize(t, 31, 100);
  near(s.agreement, 0.75, 1e-9);
  near(s.baseRate, 0.31, 1e-9);
  near(s.lift, 0.75 / 0.31, 1e-9);
  assert.strictEqual(s.indicativeOnly, true);
  var many = []; for (var i = 0; i < 5; i++) many.push({ tagged: true, fired: true });
  assert.strictEqual(Core.summarize(Core.tally(many), 1, 2).indicativeOnly, false);
  assert.strictEqual(Core.summarize(Core.tally(many), 0, 50).lift, null);   // base rate 0 -> no lift
  assert.ok(/fires on 8\/9 tagged entries, base rate 31%, lift 2\.9/.test(Core.verdictLine('X', Core.summarize({ tp: 8, fn: 1, fp: 2, tn: 5, n: 16, tagged: 9, fired: 10 }, 31, 100))));
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', with failures' : ''));
