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
  assert.deepStrictEqual(ids.slice().sort(), ['bos-any', 'bos-fresh', 'bos-major', 'bos-minor', 'bos-recent', 'daily-momentum', 'fib-30', 'fib-382', 'fib-50', 'fib-any', 'rsi-4h-above', 'rsi-d-above', 'rsi-d-below', 'volume-spike']);
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
  var v2 = ['4H BOS', 'Fresh 4H BOS', 'M15 30% Fibonacci Pullback', 'M15 50% Fibonacci Pullback', 'Daily Sideways'];
  assert.strictEqual(Core.resolveTag(det['bos-fresh'], v2), 'Fresh 4H BOS');
  assert.strictEqual(Core.resolveTag(det['bos-fresh'], ['4H BOS']), null);          // only when the tag exists in the vocabulary
  assert.strictEqual(Core.resolveTag(det['bos-recent'], v2), '4H BOS');             // the plain BOS detectors keep the shortest match
  assert.strictEqual(Core.resolveTag(det['fib-30'], v2), 'M15 30% Fibonacci Pullback');
  assert.strictEqual(Core.resolveTag(det['fib-50'], v2), 'M15 50% Fibonacci Pullback');
  assert.strictEqual(Core.resolveTag(det['fib-382'], v2), null);
  assert.deepStrictEqual(det['fib-any'].tagFrom, ['fib-30', 'fib-382', 'fib-50']);
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

console.log('BOS freshness (extension, ATR, hours since the BOS close)');
var M15 = Core.M15_MS;
test('ATR(14) is Wilder-smoothed true range seeded with the simple average', function () {
  var rowsA = []; for (var i = 0; i < 30; i++) rowsA.push([i * H4, 100, 101, 99, 100, 10]);
  rowsA[14] = [14 * H4, 100, 108, 92, 100, 10];                 // true range 16 at index 14
  var s = Core.buildSeries(rowsA, H4);
  var atr = Core.atrSeries(s, 14);
  assert.strictEqual(atr[12], null);
  near(atr[13], 2, 1e-9);
  near(atr[14], (2 * 13 + 16) / 14, 1e-9);
  near(atr[15], (atr[14] * 13 + 2) / 14, 1e-9);
});
// Same fixture as the BOS window test: swing high 80 at idx 110, BOS closes above it at idx 120.
function bosFixture() {
  var start = Date.UTC(2026, 0, 1), h = [], c = [];
  for (var i = 0; i < 140; i++) { h.push(50 + (i % 3)); c.push(49); }
  h[110] = 80; c[110] = 60;
  for (var k = 111; k < 140; k++) { h[k] = 52; c[k] = 50; }
  h[120] = 85; c[120] = 82;
  var rs = h.map(function (hh, i) { return [start + i * H4, c[i], hh, c[i] - 1, c[i], 100]; });
  return { start: start, pair: pairFrom(rs), at: function (lastIdx) { return start + (lastIdx + 1) * H4; } };
}
test('BOS cells carry extension in % and ATR multiples and hours since the BOS close', function () {
  var f = bosFixture();
  var r = Core.evaluateDetector(det['bos-recent'], Core.defaultParams(det['bos-recent']), f.pair, f.at(125), { price: 88, direction: 'long' });
  assert.strictEqual(r.fired, true);
  assert.strictEqual(r.value.priceKind, 'entry');
  near(r.value.extPct, 10, 1e-9);                                  // (88 - 80) / 80
  var atr = Core.atrSeries(f.pair.h4, 14)[125];
  near(r.value.atr, atr, 1e-12);
  near(r.value.extAtr, 8 / atr, 1e-9);
  assert.strictEqual(r.value.hoursSinceClose, 20);                 // BOS candle 120 closes at 121; anchor is the close of 125
  assert.strictEqual(r.value.barsAgo, 5);
});
test('a trade without an entry price uses the open of the 4H candle holding it (approx); base-rate anchors use the last close', function () {
  var f = bosFixture();
  var p = Core.defaultParams(det['bos-recent']);
  var approx = Core.evaluateDetector(det['bos-recent'], p, f.pair, f.at(125) + 3600000, { price: null, direction: 'long' });
  assert.strictEqual(approx.value.priceKind, 'approx');
  assert.strictEqual(approx.value.priceValue, f.pair.h4.o[126]);
  var base = Core.evaluateDetector(det['bos-recent'], p, f.pair, f.at(125));
  assert.strictEqual(base.value.priceKind, 'last-close');
  assert.strictEqual(base.value.priceValue, f.pair.h4.c[125]);
});
test('Fresh 4H BOS: BOS within F candles AND extension <= X, in % or ATR multiples, on any scale', function () {
  var f = bosFixture();
  var fresh = det['bos-fresh'];
  var run = function (price, params, lastIdx) {
    return Core.evaluateDetector(fresh, Object.assign(Core.defaultParams(fresh), params || {}), f.pair, f.at(lastIdx === undefined ? 121 : lastIdx), { price: price, direction: 'long' });
  };
  assert.strictEqual(run(87.9).fired, true);                       // +9.9%
  var far = run(88.1);
  assert.strictEqual(far.fired, false);                            // +10.1% > 10%
  assert.ok(/extension 10\.1\d% > 10%/.test(far.value.failed.join()));
  assert.strictEqual(run(88.1, { X: 11 }).fired, true);
  assert.strictEqual(run(87.9, {}, 125).fired, false);             // BOS is 5 candles old, F=2
  assert.strictEqual(run(87.9, { F: 6 }, 125).fired, true);
  assert.ok(/no BOS within the last 2/.test(run(87.9, {}, 125).value.failed.join()));
  var atr = Core.atrSeries(f.pair.h4, 14)[121];
  assert.strictEqual(run(88, { unit: 'atr', X: 8 / atr + 0.01 }).fired, true);
  assert.strictEqual(run(88, { unit: 'atr', X: 8 / atr - 0.01 }).fired, false);
  assert.strictEqual(run(87.9, { scale: 'any' }).fired, true);
  assert.strictEqual(run(87.9, { scale: 'major', Nmajor: 30 }).fired, false);   // no N=30 swing break
});
test('Fresh 4H BOS needs a price: base-rate anchors use the last completed 4H close', function () {
  var f = bosFixture();
  var r = Core.evaluateDetector(det['bos-fresh'], Core.defaultParams(det['bos-fresh']), f.pair, f.at(121));
  assert.strictEqual(r.value.priceKind, 'last-close');
  assert.strictEqual(r.value.priceValue, f.pair.h4.c[121]);
  var noPrice = Core.evaluateDetector(det['bos-fresh'], Core.defaultParams(det['bos-fresh']), f.pair, f.at(121) + 60000, { price: null, direction: 'long' });
  assert.strictEqual(noPrice.value.priceKind, 'approx');           // candle 122 holds the entry
});

console.log('M15 Fibonacci');
// 80 flat M15 candles (low 100, high 101, close 100.5); then overrides per index.
function m15Fixture(edits, opts) {
  opts = opts || {};
  var start = Date.UTC(2026, 0, 1), rs = [];
  for (var i = 0; i < 80; i++) rs.push([start + i * M15, 100.5, 101, 100, 100.5, 10]);
  Object.keys(edits || {}).forEach(function (k) { var e = edits[k]; rs[+k] = [start + k * M15, e.o === undefined ? 100.5 : e.o, e.h, e.l, e.c === undefined ? 100.5 : e.c, 10]; });
  if (opts.dropIndex !== undefined) rs.splice(opts.dropIndex, 1);
  var series = Core.buildSeries(rs, M15);
  return { start: start, series: series, pair: { h4: null, d1: null, m15: series, m15Note: opts.note }, at: function (lastIdx, extra) { return start + (lastIdx + 1) * M15 + (extra || 0); } };
}
// Leg: A = 100 (baseline lows), H = 110 at candle 55; anchor right after candle 58.
function legFixture() { return m15Fixture({ 55: { h: 110, l: 101, c: 109 }, 56: { h: 109, l: 105, c: 106 }, 57: { h: 108, l: 105, c: 107 }, 58: { h: 108, l: 106, c: 107 } }); }
function fibEval(id, fx, entry, params, lastIdx, extra) {
  var d = det[id];
  return Core.evaluateDetector(d, Object.assign(Core.defaultParams(d), params || {}), fx.pair, fx.at(lastIdx === undefined ? 58 : lastIdx, extra), entry);
}
test('the leg: H = highest high of the last W candles, A = lowest low BEFORE it (window only)', function () {
  var fx = m15Fixture({ 40: { h: 101, l: 95 }, 55: { h: 110, l: 101, c: 109 } });
  var leg = Core.legAt(fx.series, 58, 16);
  assert.deepStrictEqual([leg.ok, leg.H, leg.A, leg.hIdx, leg.aIdx], [true, 110, 100, 55, 43]);   // window is 43..58: candle 40 (low 95) is outside
  var wide = Core.legAt(fx.series, 58, 20);                                                     // window 39..58 now includes it
  assert.deepStrictEqual([wide.H, wide.A, wide.aIdx], [110, 95, 40]);
  assert.strictEqual(Core.legAt(fx.series, 54, 16).ok, false);                                  // no leg before H exists: highs are flat, H is the oldest candle
  assert.strictEqual(Core.legAt(fx.series, 54, 16).kind, 'noleg');
  var after = Core.legAt(fx.series, 71, 16);                                                    // window 56..71: H fell out, flat again
  assert.strictEqual(after.kind, 'noleg');
  assert.strictEqual(Core.legAt(fx.series, 5, 16).kind, 'history');
});
test('a missing candle inside the window is a data gap, not a guess', function () {
  var fx = m15Fixture({ 55: { h: 110, l: 101, c: 109 } }, { dropIndex: 50 });
  assert.strictEqual(Core.legAt(fx.series, 57, 16).kind, 'gap');
});
test('r = (H - entry) / (H - A); fires within +/- T points of the level (inclusive)', function () {
  var fx = legFixture();
  var at = function (price, params, id) { return fibEval(id || 'fib-30', fx, { price: price, direction: 'long' }, params); };
  var r0 = at(107);                                             // (110-107)/10 = 30%
  assert.strictEqual(r0.status, 'ok');
  assert.strictEqual(r0.fired, true);
  near(r0.value.r, 30, 1e-9);
  assert.strictEqual(r0.value.H, 110);
  assert.strictEqual(r0.value.A, 100);
  assert.strictEqual(r0.value.priceKind, 'entry');
  assert.strictEqual(at(106.7).fired, true);                    // r = 33.0: exactly T away
  assert.strictEqual(at(106.69).fired, false);                  // r = 33.1
  assert.strictEqual(at(106.69, { T: 3.2 }).fired, true);       // T is editable
  assert.strictEqual(at(107, { level: 50 }).fired, false);      // level is editable
  assert.strictEqual(at(105.9, {}, 'fib-382').fired, true);     // r = 41.0, 2.8 from 38.2
  assert.strictEqual(at(105, {}, 'fib-50').fired, true);
  assert.strictEqual(at(105, {}, 'fib-30').fired, false);
  assert.strictEqual(at(103).fired, false);                     // r = 70
});
test('fib-any fires on the closest of its three levels and reports it', function () {
  var fx = legFixture();
  var any = fibEval('fib-any', fx, { price: 105.9, direction: 'long' });
  assert.strictEqual(any.fired, true);
  assert.strictEqual(any.value.level, 38.2);
  assert.strictEqual(fibEval('fib-any', fx, { price: 102, direction: 'long' }).fired, false);
  assert.strictEqual(fibEval('fib-any', fx, { price: 102, direction: 'long' }, { l3: 80 }).fired, true);   // level 3 editable: r = 80
});
test('no entry price -> open of the M15 candle holding the entry (approx); base-rate anchors -> last completed M15 close', function () {
  var fx = m15Fixture({ 55: { h: 110, l: 101, c: 109 }, 56: { h: 109, l: 105, c: 106 }, 57: { h: 108, l: 105, c: 107 }, 58: { h: 108, l: 106, c: 107 }, 59: { o: 107, h: 120, l: 50, c: 90 } });
  var approx = fibEval('fib-30', fx, { price: null, direction: 'long' }, {}, 58, 5 * 60000);   // 5 minutes into candle 59
  assert.strictEqual(approx.value.priceKind, 'approx');
  assert.strictEqual(approx.value.P, 107);                      // candle 59's OPEN; its wild high/low/close are never seen
  assert.strictEqual(approx.fired, true);
  var base = fibEval('fib-30', fx, undefined, {}, 58);
  assert.strictEqual(base.value.priceKind, 'last-close');
  assert.strictEqual(base.value.P, 107);                        // candle 58's close
});
test('longs only, missing M15 data and short history are reported, not guessed', function () {
  var fx = legFixture();
  var short = fibEval('fib-30', fx, { price: 107, direction: 'short' });
  assert.strictEqual(short.status, 'na');
  assert.ok(/longs only/.test(short.reason));
  assert.strictEqual(fibEval('fib-30', fx, undefined).status, 'ok');                            // base-rate anchors carry no direction
  var tiny = m15Fixture({});
  tiny.pair.m15 = Core.buildSeries(tiny.series.t.slice(0, 10).map(function (t) { return [t, 100, 101, 100, 100.5, 1]; }), M15);
  var r = fibEval('fib-30', tiny, { price: 100.5, direction: 'long' }, {}, 9);
  assert.strictEqual(r.status, 'na');
  assert.ok(/M15 history too short/.test(r.reason));
  var none = fibEval('fib-30', { pair: { h4: null, d1: null, m15: null, m15Note: 'M15 fetch failed: HTTP 400' }, at: fx.at }, { price: 107, direction: 'long' });
  assert.ok(/no M15 data for this pair \(M15 fetch failed: HTTP 400\)/.test(none.reason));
  var flat = fibEval('fib-30', m15Fixture({}), { price: 100.5, direction: 'long' });
  assert.strictEqual(flat.status, 'ok');
  assert.strictEqual(flat.fired, false);
  assert.ok(/no impulse leg/.test(flat.value.noLeg));
});
test('per-trade A / H override replaces the computed price for that trade only', function () {
  var fx = legFixture();
  var entry = { price: 107, direction: 'long', override: { A: 90, H: 110 } };
  var r = fibEval('fib-30', fx, entry);
  near(r.value.r, 15, 1e-9);                                    // (110-107)/20
  assert.strictEqual(r.value.overridden, true);
  assert.strictEqual(r.fired, false);
  var onlyA = fibEval('fib-30', fx, { price: 107, direction: 'long', override: { A: 95, H: null } });
  near(onlyA.value.r, 3 / 15 * 100, 1e-9);                      // computed H = 110 with A = 95
  assert.strictEqual(fibEval('fib-30', fx, { price: 107, direction: 'long', override: { A: null, H: null } }).value.overridden, false);
  assert.strictEqual(fibEval('fib-30', fx, { price: 107, direction: 'long', override: { A: 120, H: 110 } }).status, 'na');   // H must be above A
  var noLegFx = m15Fixture({});
  var rescued = fibEval('fib-30', noLegFx, { price: 105, direction: 'long', override: { A: 100, H: 107 } }, {}, 58);   // override supplies a leg where none exists
  assert.strictEqual(rescued.status, 'ok');
  near(rescued.value.r, (107 - 105) / 7 * 100, 1e-9);
});

console.log('Entry finder');
// Baseline flat (low 100). Candle 40 sets H = 110 (its low 100.5 must not count). Then lows walk down through the fibs.
function finderFixture() {
  return m15Fixture({
    40: { h: 110, l: 100.5, c: 109 }, 41: { h: 109.5, l: 108, c: 108.5 }, 42: { h: 108, l: 106.9, c: 107.5 },
    43: { h: 107.5, l: 106.0, c: 106.5 }, 44: { h: 106.5, l: 104.5, c: 105 }, 45: { h: 112, l: 105, c: 111 },
    46: { h: 111, l: 108, c: 109 }, 50: { h: 500, l: 1, c: 2 }
  });
}
test('first M15 candle whose low touched each fib of the leg as it stood then; the candle that set H is skipped', function () {
  var fx = finderFixture();
  var anchor = fx.at(46, 5 * 60000);                             // inside candle 47
  var res = Core.entryFinder(fx.series, fx.start + 40 * M15, anchor, 16, [30, 38.2, 50, 90], null, 105);
  var by = {}; res.levels.forEach(function (l) { by[l.level] = l; });
  assert.strictEqual(by[30].idx, 42);                            // fib 107 (H 110, A 100); candle 40 (low 100.5) skipped, 41's low 108 > 107
  near(by[30].price, 107, 1e-9);
  assert.strictEqual(by[38.2].idx, 43);                          // 106.18
  assert.strictEqual(by[50].idx, 44);                            // 105
  assert.strictEqual(by[90].touched, false);                     // 101 never touched after candle 40
  assert.strictEqual(by[30].t, fx.start + 42 * M15);
  near(by[30].hoursBeforeEntry, (anchor - (fx.start + 43 * M15)) / 3600000, 1e-12);   // measured from that candle's close
  near(by[30].pctBelowEntry, (105 - 107) / 105 * 100, 1e-9);     // negative: the fib was above the entry
  assert.strictEqual(res.lastIdx, 46);
});
test('entry finder scans from the BOS close, not before, and never reads candles after the entry', function () {
  var fx = finderFixture();
  var anchor = fx.at(46, 5 * 60000);
  var late = Core.entryFinder(fx.series, fx.start + 43 * M15, anchor, 16, [30], null, 105);
  assert.strictEqual(late.levels[0].idx, 43);                    // 42 is before the BOS close
  var mid = Core.entryFinder(fx.series, fx.start + 40 * M15, anchor, 16, [30, 50], null, 105);
  var scrambled = finderFixture();                               // candle 50 (after the entry) is already wild; also wreck candle 47 (forming)
  scrambled.series.h[47] = 1e9; scrambled.series.l[47] = 1e-9;
  scrambled.series.memo = {};
  var again = Core.entryFinder(scrambled.series, scrambled.start + 40 * M15, anchor, 16, [30, 50], null, 105);
  assert.deepStrictEqual(again.levels, mid.levels);
  assert.strictEqual(Core.entryFinder(fx.series, fx.start + 46 * M15, fx.at(45), 16, [30], null, 105).note, 'no completed M15 candle between the BOS close and the entry');
});
test('a fixed A/H override is used unchanged for every candle', function () {
  var fx = finderFixture();
  var res = Core.entryFinder(fx.series, fx.start + 40 * M15, fx.at(46, 5 * 60000), 16, [30], { A: 100, H: 120 }, 105);
  assert.strictEqual(res.levels[0].idx, 40);                     // fib = 120 - 6 = 114; the first scanned candle (40, low 100.5) touches it and is NOT skipped: with an override, H is not its high
  near(res.levels[0].price, 114, 1e-9);
});

console.log('No lookahead (truncation invariance)');
// Result at anchor A must not depend on anything that happens after A. Per detector and anchor:
//  1. cut: delete every candle that has not closed by A (skipped for anything that needs the
//     forming candle's open: the momentum detector and the approx-price path);
//  2. scramble: keep the candle still forming at A but overwrite its high, low, close and volume
//     with junk (only its open is knowable at A) and drop everything after it.
// Entry variants: none (base-rate), journal price, and no price (approx, from the forming candle's open).
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
  var full15 = walk(900 * 16, 13, M15, start);
  var fullPair = { h4: Core.buildSeries(full4, H4), d1: Core.buildSeries(full1, D1), m15: Core.buildSeries(full15, M15) };
  var entries = [undefined, { price: 100, direction: 'long' }, { price: null, direction: 'long' }];
  var checked = 0, cutChecked = 0;
  var r = rng(99);
  var list = Core.getDetectors().map(function (d) {
    var params = Core.defaultParams(d);
    if (d.id === 'rsi-d-above' || d.id === 'rsi-d-below' || d.id === 'rsi-4h-above') params.threshold = 50;
    if (d.id === 'daily-momentum') { params.P = 1; params.gainBasis = 'open'; }   // walk() candles are small: make it fire sometimes
    if (d.id === 'bos-fresh') { params.X = 50; params.F = 6; }
    if (d.id.indexOf('fib') === 0) params.T = 20;                                 // wide, so both outcomes occur
    return { d: d, params: params };
  });
  for (var trial = 0; trial < 60; trial++) {
    var idx = 110 + Math.floor(r() * 780);
    var anchor = start + idx * H4 + Math.floor(r() * H4);   // anywhere inside 4H candle idx
    var scrambled = {
      h4: Core.buildSeries(scrambleForming(full4, H4, anchor), H4), d1: Core.buildSeries(scrambleForming(full1, D1, anchor), D1),
      m15: Core.buildSeries(scrambleForming(full15, M15, anchor), M15)
    };
    var cutOf = function (rows, ms) { var c = rows.filter(function (row) { return row[0] + ms <= anchor; }); return c.length ? Core.buildSeries(c, ms) : null; };
    var cut = { h4: cutOf(full4, H4), d1: cutOf(full1, D1), m15: cutOf(full15, M15) };
    list.forEach(function (x) {
      entries.forEach(function (entry, ei) {
        var a = Core.evaluateDetector(x.d, x.params, fullPair, anchor, entry);
        assert.deepStrictEqual(Core.evaluateDetector(x.d, x.params, scrambled, anchor, entry), a, x.d.id + ' changes when the forming candles are scrambled, anchor ' + anchor + ', entry variant ' + ei);
        checked++;
        if (!x.d.needsCurrentOpen && ei !== 2) {
          assert.deepStrictEqual(Core.evaluateDetector(x.d, x.params, cut, anchor, entry), a, x.d.id + ' differs with future candles cut, anchor ' + anchor + ', entry variant ' + ei);
          cutChecked++;
        }
      });
    });
  }
  assert.ok(checked >= 2400 && cutChecked >= 1500, checked + ' / ' + cutChecked);
});
test('the fib detectors and Fresh BOS fire on random data (so the invariance test above is not vacuous)', function () {
  var start = Date.UTC(2025, 5, 1);
  var pair = { h4: Core.buildSeries(walk(900, 7, H4, start), H4), d1: null, m15: Core.buildSeries(walk(900 * 16, 13, M15, start), M15) };
  ['fib-any', 'bos-fresh'].forEach(function (id) {
    var d = det[id], p = Object.assign(Core.defaultParams(d), id === 'fib-any' ? { T: 20 } : { X: 50, F: 6 });
    var fired = 0, ok = 0;
    Core.baseAnchorsFor(d.timeframe === '15m' ? pair.m15 : pair.h4, start + 1e12, 110).slice(0, 2000).forEach(function (a) {
      var res = Core.evaluateDetector(d, p, pair, a);
      if (res.status === 'ok') { ok++; if (res.fired) fired++; }
    });
    assert.ok(ok > 500 && fired > 0 && fired < ok, id + ': fired ' + fired + ' of ' + ok);
  });
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
