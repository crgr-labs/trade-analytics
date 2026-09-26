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
// 121 days of flat 100. Day 118 closes prevPrev; day 119 is the "previous" candle under test (o, c);
// day 120 is the "new" candle that contains the anchor: only its open may matter (h/l/c/v are junk on purpose).
var MOM_START = Date.UTC(2026, 0, 1);
function momentumPair(prevO, prevC, newOpen, opts) {
  opts = opts || {};
  var d1 = [];
  for (var i = 0; i < 119; i++) d1.push([MOM_START + i * D1, 100, 101, 99, 100, 10]);
  d1.push([MOM_START + 119 * D1, prevO, Math.max(prevO, prevC) * 1.01, Math.min(prevO, prevC) * 0.99, prevC, 10]);
  if (opts.prevPrevClose !== undefined) d1[118][4] = opts.prevPrevClose;
  if (!opts.noNewCandle) d1.push([MOM_START + 120 * D1, newOpen, 9999, 0.0001, 5555, 123456]);
  return { pair: pairFrom(walk(121 * 6, 5, H4, MOM_START), d1), d1: d1 };
}
var mom = det['daily-momentum'];
function rebuild(x) { x.pair = pairFrom(walk(121 * 6, 5, H4, MOM_START), x.d1); return x; }   // series copy the rows, so re-build after editing them
var MOM_ANCHOR = MOM_START + 120 * D1 + 5 * 3600 * 1000;   // 05:00 on the new day
function momEval(x, params, anchor) {
  return Core.evaluateDetector(mom, Object.assign(Core.defaultParams(mom), params || {}), x.pair, anchor === undefined ? MOM_ANCHOR : anchor);
}
test('fires when the previous day is bullish +15% and the new day opens above its close', function () {
  var x = momEval(momentumPair(100, 115, 116));
  assert.strictEqual(x.status, 'ok');
  assert.strictEqual(x.fired, true);
  near(x.value.gainPrevClose, 15, 1e-9);
  near(x.value.gainOpen, 15, 1e-9);
  near(x.value.openGapPct, (116 - 115) / 115 * 100, 1e-9);
  assert.strictEqual(x.value.prevClose, 115);
  assert.strictEqual(x.value.newOpen, 116);
  assert.strictEqual(new Date(x.value.prevBarT).toISOString().slice(0, 10), '2026-04-30');   // day 119 of 2026
  assert.deepStrictEqual(x.value.failed, []);
});
test('P is inclusive and editable; the gain basis switches between day-before close and same-candle open', function () {
  var pair = momentumPair(110, 115, 116);                       // gap-up day: +15% vs day-before close, +4.5% vs its own open
  assert.strictEqual(momEval(pair, { P: 15 }).fired, true);     // exactly 15 passes
  assert.strictEqual(momEval(pair, { P: 15.01 }).fired, false);
  var byOpen = momEval(pair, { gainBasis: 'open' });
  assert.strictEqual(byOpen.fired, false);
  near(byOpen.value.gain, 4.545, 0.001);
  assert.ok(/gain 4\.5% < 10%/.test(byOpen.value.failed.join()));
  assert.strictEqual(momEval(pair, { gainBasis: 'open', P: 4 }).fired, true);
});
test('G is an inclusive minimum for the new open vs the previous close (default 0)', function () {
  assert.strictEqual(momEval(momentumPair(100, 115, 115)).fired, true);       // open == close: 0% >= 0%
  var below = momEval(momentumPair(100, 115, 114.9655));                       // -0.03% vs prev close
  assert.strictEqual(below.fired, false);
  assert.ok(/open -0\.03% vs prev close < 0%/.test(below.value.failed.join()));
  assert.strictEqual(momEval(momentumPair(100, 115, 114.9655), { G: -1 }).fired, true);
  assert.strictEqual(momEval(momentumPair(100, 115, 116), { G: 1 }).fired, false);    // +0.87% < 1%
  assert.strictEqual(momEval(momentumPair(100, 115, 116.2), { G: 1 }).fired, true);   // +1.04%
});
test('a bearish previous candle never qualifies, and every failed condition is listed', function () {
  var x = momEval(momentumPair(130, 115, 110));               // red candle, +15% vs day-before close, but new open below its close
  assert.strictEqual(x.fired, false);
  assert.strictEqual(x.value.failed.length, 2);
  assert.ok(/not bullish/.test(x.value.failed[0]));
  assert.ok(/open -4\.35% vs prev close < 0%/.test(x.value.failed[1]));
  var small = momEval(momentumPair(100, 108.2, 109));         // bullish, gap ok, gain 8.2% < 10%
  assert.deepStrictEqual(small.value.failed, ['gain 8.2% < 10%']);
});
test('only the new candle\'s OPEN is used: its high, low, close and volume cannot change the result', function () {
  var a = momentumPair(100, 115, 116);
  var b = momentumPair(100, 115, 116);
  b.d1[120] = [b.d1[120][0], 116, 1, 0.5, 0.75, 0];           // wildly different h/l/c/v, same open
  var ra = momEval(a), rb = momEval(rebuild(b));
  assert.strictEqual(ra.fired, true);
  assert.deepStrictEqual(ra, rb);
  var c = momentumPair(100, 115, 116);
  c.d1[120][1] = 110;                                          // ...but changing the open does change it
  var rc = momEval(rebuild(c));
  assert.strictEqual(rc.value.newOpen, 110);
  assert.strictEqual(rc.fired, false);
});
test('no lookahead: the previous candle is the last COMPLETED day at the anchor', function () {
  var x = momentumPair(100, 115, 116);
  var atMidnight = momEval(x, {}, MOM_START + 120 * D1);       // the new candle has just opened
  assert.strictEqual(atMidnight.status, 'ok');
  assert.strictEqual(atMidnight.barIndex, 119);
  var before = momEval(x, {}, MOM_START + 120 * D1 - 1);       // one ms earlier: day 119 is still forming
  assert.strictEqual(before.barIndex, 118);
  assert.strictEqual(before.value.prevBarT, MOM_START + 118 * D1);
  assert.strictEqual(before.value.newOpen, 100);               // day 119's open, i.e. not the +15% close
});
test('n/a when the candle containing the anchor is missing from the data', function () {
  var x = momentumPair(100, 115, 116, { noNewCandle: true });
  var r = momEval(x);
  assert.strictEqual(r.status, 'na');
  assert.ok(/missing/.test(r.reason));
  var y = momentumPair(100, 115, 116);
  y.d1[120][0] += D1;                                          // a day is skipped in the data
  assert.strictEqual(momEval(rebuild(y)).status, 'na');
});

console.log('No lookahead (truncation invariance)');
// Result at anchor A must not depend on anything that happens after A. Two checks per detector:
//  1. cut: delete every candle that has not closed by A (skipped for detectors that need the
//     new candle's open, which the framework hands over separately);
//  2. scramble: keep the candle still forming at A but overwrite its high, low, close and volume
//     with junk (only its open is knowable at A) and drop everything after it.
function scrambleForming(fullRows, ms, anchor) {
  var kept = fullRows.filter(function (row) { return row[0] <= anchor; });
  var last = kept.length - 1;
  if (last >= 0 && kept[last][0] + ms > anchor) kept[last] = [kept[last][0], kept[last][1], 1e9, 1e-9, 12345, 987654321];
  return kept;
}
test('every detector gives the same answer with future candle data removed or scrambled', function () {
  var start = Date.UTC(2025, 5, 1);
  var full4 = walk(900, 7, H4, start);
  var full1 = walk(150, 11, D1, start);
  var fullPair = pairFrom(full4, full1);
  var checked = 0, cutChecked = 0;
  var r = rng(99);
  Core.getDetectors().forEach(function (d) {
    var params = Core.defaultParams(d);
    if (d.id === 'rsi-d-above' || d.id === 'rsi-d-below' || d.id === 'rsi-4h-above') params.threshold = 50;
    if (d.id === 'daily-momentum') { params.P = 1; params.gainBasis = 'open'; }   // walk() candles are small: make it fire sometimes
    for (var trial = 0; trial < 80; trial++) {
      var idx = 110 + Math.floor(r() * 780);
      var anchor = start + idx * H4 + Math.floor(r() * H4);   // anywhere inside candle idx
      var a = Core.evaluateDetector(d, params, fullPair, anchor);
      var scrambled = pairFrom(scrambleForming(full4, H4, anchor), scrambleForming(full1, D1, anchor));
      assert.deepStrictEqual(Core.evaluateDetector(d, params, scrambled, anchor), a, d.id + ' changes when the forming candles are scrambled, anchor ' + anchor);
      checked++;
      if (!d.needsCurrentOpen) {
        var cutRows4 = full4.filter(function (row) { return row[0] + H4 <= anchor; });
        var cutRows1 = full1.filter(function (row) { return row[0] + D1 <= anchor; });
        var cutPair = pairFrom(cutRows4, cutRows1.length ? cutRows1 : null);
        assert.deepStrictEqual(Core.evaluateDetector(d, params, cutPair, anchor), a, d.id + ' differs with future candles cut, anchor ' + anchor);
        cutChecked++;
      }
    }
  });
  assert.ok(checked >= 700 && cutChecked >= 560);
});
test('the momentum detector fires on random data (so the invariance test above is not vacuous)', function () {
  var start = Date.UTC(2025, 5, 1);
  var pair = pairFrom(walk(900, 7, H4, start), walk(150, 11, D1, start));
  var p = Object.assign(Core.defaultParams(mom), { P: 1, gainBasis: 'open' });
  var fired = 0, ok = 0;
  for (var day = 110; day < 149; day++) {
    var res = Core.evaluateDetector(mom, p, pair, start + day * D1 + 3600 * 1000);
    if (res.status === 'ok') { ok++; if (res.fired) fired++; }
  }
  assert.ok(ok > 30 && fired > 0 && fired < ok, 'fired ' + fired + ' of ' + ok);
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
