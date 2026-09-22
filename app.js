(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------------

  var SCREENS = [
    'insights-dashboard',
    'trade-journal',
    'position-history',
    'case-studies',
    'confluence-matrix',
    'timing-and-heatmap',
    'new-trade-entry'
  ];
  var DEFAULT_SCREEN = 'insights-dashboard';

  var ACTIVE_CLASS = 'bg-surface-container-high text-primary font-semibold';
  var INACTIVE_CLASS = 'font-body-md text-body-md text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors';
  var BASE_CLASS = 'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors';

  var sections = {};
  var navLinks = {};

  document.querySelectorAll('section[data-screen]').forEach(function (el) {
    sections[el.getAttribute('data-screen')] = el;
  });
  document.querySelectorAll('nav a[data-path]').forEach(function (el) {
    navLinks[el.getAttribute('data-path')] = el;
  });

  function setNavActive(slug) {
    Object.keys(navLinks).forEach(function (key) {
      var link = navLinks[key];
      if (key === slug) {
        link.setAttribute('aria-current', 'page');
        link.className = BASE_CLASS + ' ' + ACTIVE_CLASS;
      } else {
        link.removeAttribute('aria-current');
        link.className = BASE_CLASS + ' ' + INACTIVE_CLASS;
      }
    });
  }

  // Tracks the last screen that wasn't the New Trade Entry form, so its
  // Cancel button can return the user to wherever they actually came from
  // (Trade Journal or a specific Case Study) instead of a fixed screen.
  var activeSlug = null;
  var activeParam = null;
  var lastNonFormSlug = DEFAULT_SCREEN;
  var lastNonFormParam = null;

  function activate(slug, param) {
    if (SCREENS.indexOf(slug) === -1) slug = DEFAULT_SCREEN;

    if (activeSlug && activeSlug !== 'new-trade-entry') {
      lastNonFormSlug = activeSlug;
      lastNonFormParam = activeParam;
    }
    activeSlug = slug;
    activeParam = param || null;

    Object.keys(sections).forEach(function (key) {
      sections[key].hidden = key !== slug;
    });
    setNavActive(slug);
    window.scrollTo(0, 0);

    document.dispatchEvent(new CustomEvent('screenchange', { detail: { screen: slug, param: param || null } }));
  }

  function parseHash() {
    var raw = (window.location.hash || '').replace(/^#/, '');
    var slashIdx = raw.indexOf('/');
    if (slashIdx === -1) return { slug: raw, param: null };
    return { slug: raw.slice(0, slashIdx), param: raw.slice(slashIdx + 1) || null };
  }

  // ---------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function parseDate(dateStr) {
    return new Date(dateStr + 'T00:00:00');
  }

  function formatDateLabel(dateStr) {
    var d = parseDate(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function weekdayLabel(dateStr) {
    return parseDate(dateStr).toLocaleDateString('en-US', { weekday: 'long' });
  }

  // ---------------------------------------------------------------------
  // Trade store (localStorage)
  // ---------------------------------------------------------------------

  var STORAGE_KEY = 'tj_trades';

  // The 11 trades from the original Stitch mockup, seeded on first run so
  // the app looks identical to the exported design before anything new is
  // logged. The Trade Journal table only ever showed 3 confluence tags per
  // row (plus a "+N more" count) so the other 4 confluence slots below are
  // reconstructed rather than lifted from the export - they exist so the
  // Confluence Matrix / Timing screens have real per-trade data to
  // recompute from instead of freeform text with nothing behind it.
  var SEED_TRADES = [
    { id: 'seed-01', date: '2026-08-22', pair: 'TRUMPUSDT.P', direction: 'long', leverage: '10x isolated', prevCandle: 'bullish', entryPrice: '', exitPrice: '', outcome: 'open', confluence: ['Daily Uptrend & Momentum', '4H BOS', '4H Pullback', '', '', '', '4H RSI above 70'], notes: '' },
    { id: 'seed-02', date: '2026-08-26', pair: 'BTRUSDT.P', direction: 'long', leverage: '10x isolated', prevCandle: 'bullish', entryPrice: '', exitPrice: '', outcome: 'open', confluence: ['Daily Uptrend & Momentum', '4H BOS', '4H Parabolic', '', '', '', '4H RSI above 70'], notes: '' },
    { id: 'seed-03', date: '2026-08-29', pair: 'HNTUSDT.P', direction: 'long', leverage: '10x isolated', prevCandle: 'bullish', entryPrice: '', exitPrice: '', outcome: 'win', confluence: ['Daily Uptrend & Momentum', '4H BOS', '4H Pause', 'M15 30% Fibonacci Pullback', '32%', '', '4H RSI above 70'], notes: '' },
    { id: 'seed-04', date: '2026-08-30', pair: 'HNTUSDT.P', direction: 'long', leverage: '10x isolated', prevCandle: 'bullish', entryPrice: '', exitPrice: '', outcome: 'win', confluence: ['Daily Uptrend & Momentum', '4H BOS', '4H Parabolic', 'M15 30% Fibonacci Pullback', '35%', '', '4H RSI above 70'], notes: '' },
    { id: 'seed-05', date: '2026-08-31', pair: 'UPROBINHOODUSDT.P', direction: 'long', leverage: '10x isolated', prevCandle: 'bullish', entryPrice: '', exitPrice: '', outcome: 'win', confluence: ['Daily Uptrend & Momentum', '4H BOS', '4H Pullback', 'M15 50% Fibonacci Pullback', '48%', '', '4H RSI above 70'], notes: '' },
    { id: 'seed-06', date: '2026-09-01', pair: '0GUSDT.P', direction: 'long', leverage: '10x isolated', prevCandle: 'bearish', entryPrice: '', exitPrice: '', outcome: 'loss', confluence: ['Daily Sideways', '4H BOS', '4H LS', 'M15 30% Fibonacci Pullback', '22%', '', ''], notes: '' },
    { id: 'seed-07', date: '2026-09-01', pair: 'UAIUSDT.P', direction: 'long', leverage: '10x isolated', prevCandle: 'bearish', entryPrice: '', exitPrice: '', outcome: 'win', confluence: ['Daily Sideways', '4H BOS', '4H Parabolic', 'M15 30% Fibonacci Pullback', '30%', '', 'Daily RSI above 70'], notes: '' },
    { id: 'seed-08', date: '2026-09-02', pair: 'EGLUSDT.P', direction: 'long', leverage: '10x isolated', prevCandle: 'bullish', entryPrice: '', exitPrice: '', outcome: 'win', confluence: ['Daily Uptrend & Momentum', '4H BOS', '4H Parabolic', '', '', 'Volume spike confirmed', '4H RSI above 70'], notes: '' },
    { id: 'seed-09', date: '2026-09-02', pair: 'PYTHUSDT.P', direction: 'long', leverage: '10x isolated', prevCandle: 'bearish', entryPrice: '', exitPrice: '', outcome: 'win', confluence: ['Daily Sideways', '4H BOS', '4H Parabolic', 'M15 50% Fibonacci Pullback', '52%', '', 'Daily RSI above 70'], notes: '' },
    { id: 'seed-10', date: '2026-09-03', pair: 'USELESSUSDT.P', direction: 'long', leverage: '10x isolated', prevCandle: 'bullish', entryPrice: '', exitPrice: '', outcome: 'win', confluence: ['Daily Uptrend & Momentum', '4H BOS', '4H Parabolic', '', '', 'Volume spike confirmed', '4H RSI above 70'], notes: '' },
    { id: 'seed-11', date: '2026-09-03', pair: 'BULLAUSDT.P', direction: 'long', leverage: '10x isolated', prevCandle: 'bullish', entryPrice: '', exitPrice: '', outcome: 'win', confluence: ['Daily Uptrend & Momentum', '4H BOS', '4H Pullback', 'M15 30% Fibonacci Pullback', '28%', '', '4H RSI above 70'], notes: '' }
  ];

  // The three fixed chart-evidence slots. `short` is the compact badge on
  // empty slots and list thumbnails; `label` is the name on filled slots and tabs.
  var CHART_TIMEFRAMES = [
    { key: 'daily', label: 'Daily', short: 'D' },
    { key: 'h4', label: '4H', short: '4H' },
    { key: 'm15', label: 'M15', short: '15m' }
  ];

  // Trades used to store confluence parameters as a fixed 7-slot array
  // (`confluence`). That's now a variable-length `parameters` array picked
  // from a multi-select. This migrates any trade still shaped the old way
  // the first time it's read, so previously-saved trades keep working.
  function migrateTrade(trade) {
    if (!Array.isArray(trade.parameters)) {
      trade.parameters = (trade.confluence || []).map(function (v) { return (v || '').trim(); }).filter(Boolean);
    }
    if (!trade.source) trade.source = 'manual';

    // A chart used to be a single base64 upload (chartImage/chartFileName).
    // It's now { type, value } so a TradingView snapshot link can live in
    // the same slot. The legacy keys are dropped once folded in, otherwise
    // a re-save would persist the same megabytes of base64 twice.
    if (!trade.chart && trade.chartImage) {
      trade.chart = { type: 'upload', value: trade.chartImage, name: trade.chartFileName || '' };
    }
    if ('chartImage' in trade) delete trade.chartImage;
    if ('chartFileName' in trade) delete trade.chartFileName;
    if (!trade.chart) trade.chart = null;

    // Chart evidence is now one screenshot per timeframe (`charts`). `chart`
    // only keeps a TradingView link; a legacy single upload has no known
    // timeframe, so it's folded into Daily rather than dropped.
    var charts = trade.charts && typeof trade.charts === 'object' ? trade.charts : {};
    CHART_TIMEFRAMES.forEach(function (tf) {
      var entry = charts[tf.key];
      charts[tf.key] = entry && entry.value ? entry : null;
    });
    if (trade.chart && trade.chart.type === 'upload' && trade.chart.value) {
      if (!charts.daily) charts.daily = { value: trade.chart.value, name: trade.chart.name || '' };
      trade.chart = null;
    }
    trade.charts = charts;

    // Per-factor checklist status. Only non-default states are stored, so a
    // missing key means Passed and older trades need no migration beyond this.
    var statuses = {};
    if (trade.parameterStatus && typeof trade.parameterStatus === 'object') {
      Object.keys(trade.parameterStatus).forEach(function (name) {
        var status = trade.parameterStatus[name];
        if (status === 'pending' || status === 'failed') statuses[name] = status;
      });
    }
    trade.parameterStatus = statuses;

    return trade;
  }

  function tradeCharts(trade) {
    return trade && trade.charts ? trade.charts : { daily: null, h4: null, m15: null };
  }

  function firstChartKey(trade) {
    var charts = tradeCharts(trade);
    for (var i = 0; i < CHART_TIMEFRAMES.length; i++) {
      if (charts[CHART_TIMEFRAMES[i].key]) return CHART_TIMEFRAMES[i].key;
    }
    return null;
  }

  function chartTimeframe(key) {
    return CHART_TIMEFRAMES.filter(function (tf) { return tf.key === key; })[0] || CHART_TIMEFRAMES[0];
  }

  var TradeStore = {
    getAll: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw).map(migrateTrade);
      } catch (e) {}
      TradeStore.setAll(SEED_TRADES);
      return SEED_TRADES.slice().map(migrateTrade);
    },
    setAll: function (trades) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
        scheduleGithubSync();
        return true;
      } catch (e) {
        return false;
      }
    },
    add: function (trade) {
      var trades = TradeStore.getAll();
      trades.push(trade);
      return TradeStore.setAll(trades);
    },
    update: function (id, updatedTrade) {
      var trades = TradeStore.getAll();
      var idx = trades.findIndex(function (t) { return t.id === id; });
      if (idx === -1) return false;
      trades[idx] = updatedTrade;
      return TradeStore.setAll(trades);
    },
    remove: function (id) {
      var trades = TradeStore.getAll().filter(function (t) { return t.id !== id; });
      return TradeStore.setAll(trades);
    },
    getById: function (id) {
      return TradeStore.getAll().filter(function (t) { return t.id === id; })[0] || null;
    }
  };

  function computeStats(trades) {
    var wins = 0, losses = 0, open = 0;
    trades.forEach(function (t) {
      if (t.outcome === 'win') wins++;
      else if (t.outcome === 'loss') losses++;
      else if (t.outcome === 'open') open++;
    });
    var closed = wins + losses;
    return {
      total: trades.length,
      wins: wins,
      losses: losses,
      open: open,
      winRate: closed > 0 ? (wins / closed) * 100 : 0
    };
  }

  // ---------------------------------------------------------------------
  // Trade Journal screen
  // ---------------------------------------------------------------------

  var OUTCOME_DOT_CLASS = { open: 'bg-secondary', win: 'bg-tertiary', loss: 'bg-error' };
  var OUTCOME_PILL_CLASS = {
    open: 'bg-surface-container text-on-surface-variant',
    win: 'bg-tertiary-fixed/30 text-on-tertiary-fixed-variant',
    loss: 'bg-error-container text-on-error-container'
  };
  var DIRECTION_BADGE_CLASS = {
    long: 'bg-primary/10 text-primary',
    short: 'bg-error/10 text-error'
  };

  var tjState = { filter: 'all', search: '', flaggedOnly: false, sort: 'date-desc' };

  // Trades are stored in insertion order, so the table needs an explicit
  // sort - otherwise an imported or newly added trade just lands at the
  // bottom regardless of its date. Dates are compared as timestamps rather
  // than formatted labels, and trades with no recorded P&L sink to the
  // bottom of a P&L sort instead of ranking as if they broke even.
  function tradeSortTimestamp(trade) {
    var ms = Date.parse((trade.date || '') + 'T00:00:00Z');
    return isNaN(ms) ? null : ms;
  }

  function tradeSortPnl(trade) {
    var ret = computeTradeReturn(trade);
    return ret && ret.dollarPnl !== null ? ret.dollarPnl : null;
  }

  function compareMissingLast(a, b) {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return null;
  }

  function sortTrades(trades, sortKey) {
    var sorted = trades.slice();
    if (sortKey === 'pair-az') {
      sorted.sort(function (a, b) { return (a.pair || '').localeCompare(b.pair || ''); });
      return sorted;
    }
    var byPnl = sortKey === 'pnl-desc' || sortKey === 'pnl-asc';
    var descending = sortKey === 'date-desc' || sortKey === 'pnl-desc';
    var valueOf = byPnl ? tradeSortPnl : tradeSortTimestamp;
    sorted.sort(function (a, b) {
      var av = valueOf(a);
      var bv = valueOf(b);
      var missing = compareMissingLast(av, bv);
      if (missing !== null) return missing;
      return descending ? bv - av : av - bv;
    });
    return sorted;
  }

  // ---------------------------------------------------------------------
  // Bulk row selection (Trade Journal + Position History)
  // ---------------------------------------------------------------------
  //
  // Both tables keep their own id-keyed selection set. The objects are
  // mutated in place rather than reassigned so the render paths can hold a
  // stable reference.

  var tjSelection = {};
  var phSelection = {};

  function selectionCount(selection) {
    return Object.keys(selection).length;
  }

  function clearSelection(selection) {
    Object.keys(selection).forEach(function (key) { delete selection[key]; });
  }

  function rowCheckboxHtml(cssClass, id, selection, label, padding) {
    return '<td class="' + padding + '"><input type="checkbox" class="' + cssClass +
      ' w-4 h-4 accent-primary cursor-pointer align-middle" data-select-id="' + escapeHtml(id) + '"' +
      (selection[id] ? ' checked' : '') + ' aria-label="' + label + '" /></td>';
  }

  // Keeps the floating action bar and the header "select all" box in step
  // with the current selection, including the partial (indeterminate) case.
  function syncSelectionUi(opts) {
    var bar = document.getElementById(opts.barId);
    var countEl = document.getElementById(opts.countId);
    var selectAll = document.getElementById(opts.selectAllId);
    var count = selectionCount(opts.selection);

    if (bar) bar.hidden = count === 0;
    if (countEl) countEl.textContent = count + ' selected';

    if (selectAll) {
      var visible = opts.visibleIds();
      var selectedVisible = visible.filter(function (id) { return opts.selection[id]; }).length;
      selectAll.checked = visible.length > 0 && selectedVisible === visible.length;
      selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
      selectAll.disabled = visible.length === 0;
    }
  }

  // A promoted position points at the trade it produced; if that trade is
  // deleted the link would dangle, so it's reset and the position becomes
  // promotable again.
  function unlinkPositionsForTrades(deletedIds) {
    var positions = PositionStore.getAll();
    var changed = false;
    positions.forEach(function (p) {
      if (p.linkedTradeId && deletedIds[p.linkedTradeId]) {
        p.linkedTradeId = null;
        changed = true;
      }
    });
    if (changed) PositionStore.setAll(positions);
  }

  function tradeRowBadgesHtml(trade) {
    var badges = [];
    if (trade.source === 'mexc-import') {
      badges.push('<span class="inline-flex items-center gap-1 bg-primary/10 text-primary font-metric-sm text-[10px] font-semibold px-1.5 py-0.5 rounded" title="Imported from MEXC Position History"><span class="material-symbols-outlined text-[11px] align-middle">sync_alt</span>Imported</span>');
    }
    if (trade.matchWarning) {
      badges.push('<span class="inline-flex items-center gap-1 bg-error-container/60 text-error font-metric-sm text-[10px] font-semibold px-1.5 py-0.5 rounded" title="' + escapeHtml(trade.matchWarning) + '"><span class="material-symbols-outlined text-[11px] align-middle">report</span>Possible duplicate — review</span>');
    }
    if (trade.source === 'mexc-import' && nonEmptyConfluence(trade).length === 0) {
      badges.push('<span class="inline-flex items-center gap-1 bg-secondary-fixed/50 text-on-secondary-fixed font-metric-sm text-[10px] font-semibold px-1.5 py-0.5 rounded" title="No confluence parameters tagged yet"><span class="material-symbols-outlined text-[11px] align-middle">flag</span>Needs review</span>');
    }
    return badges.length ? '<div class="flex flex-wrap items-center gap-1 mt-1">' + badges.join('') + '</div>' : '';
  }

  // A link-backed chart can't be previewed in the modal - there's no image
  // file behind the URL - so it opens TradingView in a new tab instead.
  function tradeChartCellHtml(trade) {
    var chart = trade.chart;
    if (chart && chart.type === 'link' && chart.value && !firstChartKey(trade)) {
      return '<a href="' + escapeHtml(chart.value) + '" target="_blank" rel="noopener noreferrer" ' +
        'class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors" ' +
        'title="Open TradingView snapshot in a new tab">' +
        '<span class="font-metric-sm text-[10px] font-bold">TV</span></a>';
    }
    return '<div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-secondary hover:text-primary transition-colors cursor-pointer chart-preview-btn" ' +
      'data-trade-id="' + escapeHtml(trade.id) + '" title="Preview chart breakdown">' +
      '<span class="material-symbols-outlined text-[18px]">image</span></div>';
  }

  function tradeRowHtml(trade) {
    var tags = nonEmptyConfluence(trade);
    var visibleTags = tags.slice(0, 3);
    var moreCount = Math.max(tags.length - 3, 0);

    var tagsHtml = visibleTags.map(function (tag) {
      return '<span class="bg-surface-container-lowest text-on-surface-variant font-body-sm text-body-sm px-2 py-0.5 rounded-lg shadow-sm">' + escapeHtml(tag) + '</span>';
    }).join('');
    if (moreCount > 0) {
      tagsHtml += '<span class="font-metric-sm text-metric-sm text-secondary ml-1 cursor-default" title="' + moreCount + ' additional parameter' + (moreCount === 1 ? '' : 's') + '">+' + moreCount + ' more</span>';
    }
    if (!tagsHtml) {
      tagsHtml = '<span class="font-metric-sm text-metric-sm text-outline-variant">No parameters logged</span>';
    }

    var dot = OUTCOME_DOT_CLASS[trade.outcome] || OUTCOME_DOT_CLASS.open;
    var pillClass = OUTCOME_PILL_CLASS[trade.outcome] || OUTCOME_PILL_CLASS.open;
    var directionClass = DIRECTION_BADGE_CLASS[trade.direction] || DIRECTION_BADGE_CLASS.long;

    return (
      '<tr class="trade-row hover:bg-surface-container-low/60 transition-colors" data-trade-id="' + escapeHtml(trade.id) + '" data-outcome="' + escapeHtml(trade.outcome) + '" data-pair="' + escapeHtml(trade.pair) + '" data-match-warning="' + (trade.matchWarning ? 'true' : 'false') + '">' +
        rowCheckboxHtml('tj-row-check', trade.id, tjSelection, 'Select trade', 'pl-6 pr-2 py-3') +
        '<td class="px-6 py-3"><div class="flex flex-col">' +
          '<span class="font-headline-sm text-headline-sm text-on-surface">' + formatDateLabel(trade.date) + '</span>' +
          '<span class="font-metric-sm text-metric-sm text-secondary">' + weekdayLabel(trade.date) + '</span>' +
        '</div></td>' +
        '<td class="px-6 py-3"><div class="flex flex-col">' +
          '<div class="flex items-center gap-2">' +
            '<span class="w-1.5 h-1.5 rounded-full ' + dot + '"></span>' +
            '<span class="font-metric-md text-metric-md font-bold text-on-surface">' + escapeHtml(trade.pair) + '</span>' +
          '</div>' +
          tradeRowBadgesHtml(trade) +
        '</div></td>' +
        '<td class="px-6 py-3"><div class="flex flex-col items-start gap-0.5">' +
          '<span class="' + directionClass + ' font-metric-sm text-[11px] font-semibold px-2 py-0.5 rounded">' + escapeHtml(trade.direction.toUpperCase()) + '</span>' +
          '<span class="font-metric-sm text-metric-sm text-secondary">' + escapeHtml(trade.leverage || '—') + '</span>' +
        '</div></td>' +
        '<td class="px-6 py-3"><div class="flex items-center flex-wrap gap-1">' + tagsHtml + '</div></td>' +
        '<td class="px-6 py-3"><div class="flex justify-center">' + tradeChartCellHtml(trade) + '</div></td>' +
        '<td class="px-6 py-3"><span class="' + pillClass + ' font-metric-sm text-metric-sm font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 w-fit"><span class="w-1.5 h-1.5 rounded-full ' + dot + '"></span>' + escapeHtml(trade.outcome.toUpperCase()) + '</span></td>' +
        '<td class="px-6 py-3 text-right"><div class="flex items-center justify-end gap-2">' +
          '<a class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-secondary hover:text-primary transition-colors" href="#new-trade-entry/' + encodeURIComponent(trade.id) + '" title="Edit trade"><span class="material-symbols-outlined text-[18px]">edit</span></a>' +
          '<button type="button" class="trade-delete-btn w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-secondary hover:text-error transition-colors" data-trade-id="' + escapeHtml(trade.id) + '" data-trade-pair="' + escapeHtml(trade.pair) + '" title="Delete trade"><span class="material-symbols-outlined text-[18px]">delete</span></button>' +
          '<a class="inline-flex items-center gap-1 text-primary hover:text-primary-container font-headline-sm text-headline-sm font-medium transition-colors" href="#case-studies/' + encodeURIComponent(trade.id) + '"><span>Case study</span><span class="material-symbols-outlined text-[15px]">arrow_forward</span></a>' +
        '</div></td>' +
      '</tr>'
    );
  }

  function applyTradeJournalFilters(section) {
    var rows = section.querySelectorAll('.trade-row');
    var visible = 0;
    rows.forEach(function (row) {
      var outcome = row.getAttribute('data-outcome');
      var pair = (row.getAttribute('data-pair') || '').toLowerCase();
      var matches = (tjState.filter === 'all' || outcome === tjState.filter) &&
        (!tjState.search || pair.indexOf(tjState.search) !== -1) &&
        (!tjState.flaggedOnly || row.getAttribute('data-match-warning') === 'true');
      row.style.display = matches ? '' : 'none';
      if (matches) visible++;
    });
    var countDisplay = section.querySelector('#visible-count');
    if (countDisplay) countDisplay.textContent = visible;
    syncTradeSelectionUi();
  }

  function setActivePill(section) {
    section.querySelectorAll('.filter-pill').forEach(function (pill) {
      var isActive = pill.getAttribute('data-filter') === tjState.filter;
      if (isActive) {
        pill.classList.remove('bg-surface-container-lowest', 'text-on-surface-variant');
        pill.classList.add('bg-on-surface', 'text-surface-container-lowest');
      } else {
        pill.classList.remove('bg-on-surface', 'text-surface-container-lowest');
        pill.classList.add('bg-surface-container-lowest', 'text-on-surface-variant');
      }
    });
  }

  function initTradeJournalControls(section) {
    if (!section) return;
    section.querySelectorAll('.filter-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        tjState.filter = pill.getAttribute('data-filter');
        // Rows that were selected may no longer be visible under the new
        // filter, so the selection starts fresh rather than going stale.
        clearSelection(tjSelection);
        setActivePill(section);
        renderTradeJournal();
      });
    });
    var searchInput = section.querySelector('#pairSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        tjState.search = (e.target.value || '').trim().toLowerCase();
        clearSelection(tjSelection);
        renderTradeJournal();
      });
    }

    // Sort lives in module state, so it survives filter-chip changes and
    // every re-render (save, edit, delete, import) until the page reloads.
    var sortSelect = section.querySelector('#tj-sort-select');
    if (sortSelect) {
      sortSelect.value = tjState.sort;
      sortSelect.addEventListener('change', function () {
        tjState.sort = sortSelect.value;
        renderTradeJournal();
      });
    }

    section.addEventListener('change', function (e) {
      var rowCheck = e.target.closest('.tj-row-check');
      if (rowCheck) {
        var id = rowCheck.getAttribute('data-select-id');
        if (rowCheck.checked) tjSelection[id] = true;
        else delete tjSelection[id];
        syncTradeSelectionUi();
        return;
      }
      if (e.target.id === 'tj-select-all') {
        var checked = e.target.checked;
        visibleTradeIds().forEach(function (id) {
          if (checked) tjSelection[id] = true;
          else delete tjSelection[id];
        });
        section.querySelectorAll('.tj-row-check').forEach(function (box) {
          var boxId = box.getAttribute('data-select-id');
          box.checked = !!tjSelection[boxId];
        });
        syncTradeSelectionUi();
      }
    });

    var bulkDeleteBtn = document.getElementById('tj-bulk-delete');
    if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', bulkDeleteTrades);
    var bulkCancelBtn = document.getElementById('tj-bulk-cancel');
    if (bulkCancelBtn) {
      bulkCancelBtn.addEventListener('click', function () {
        clearSelection(tjSelection);
        section.querySelectorAll('.tj-row-check').forEach(function (box) { box.checked = false; });
        syncTradeSelectionUi();
      });
    }
    section.addEventListener('click', function (e) {
      var pairTh = e.target.closest('.tj-pair-sort-th');
      if (pairTh) {
        var pairKey = pairTh.getAttribute('data-tj-pair-sort');
        if (tjPairSortState.pairSortKey === pairKey) {
          tjPairSortState.pairSortDir = tjPairSortState.pairSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          tjPairSortState.pairSortKey = pairKey;
          tjPairSortState.pairSortDir = pairKey === 'pair' ? 'asc' : 'desc';
        }
        renderTradeJournal();
        return;
      }
      var btn = e.target.closest('.trade-delete-btn');
      if (!btn) return;
      var id = btn.getAttribute('data-trade-id');
      if (!id) return;
      var label = btn.getAttribute('data-trade-pair') || 'this trade';
      if (window.confirm('Delete the log for ' + label + '? This cannot be undone.')) {
        TradeStore.remove(id);
        var removed = {};
        removed[id] = true;
        unlinkPositionsForTrades(removed);
        renderTradeJournal();
      }
    });
  }

  function renderTradeJournal() {
    var section = sections['trade-journal'];
    if (!section) return;
    var trades = TradeStore.getAll();

    var tbody = section.querySelector('#tradesBody');
    if (tbody) tbody.innerHTML = sortTrades(trades, tjState.sort).map(tradeRowHtml).join('');

    var stats = computeStats(trades);
    var countAll = section.querySelector('[data-pill-count="all"]');
    var countWin = section.querySelector('[data-pill-count="win"]');
    var countLoss = section.querySelector('[data-pill-count="loss"]');
    var countOpen = section.querySelector('[data-pill-count="open"]');
    if (countAll) countAll.textContent = stats.total;
    if (countWin) countWin.textContent = stats.wins;
    if (countLoss) countLoss.textContent = stats.losses;
    if (countOpen) countOpen.textContent = stats.open;

    var sampleEl = section.querySelector('#tj-sample-size');
    if (sampleEl) sampleEl.textContent = stats.total + ' Logged';
    var winRateEl = section.querySelector('#tj-win-rate');
    if (winRateEl) winRateEl.textContent = stats.winRate.toFixed(1) + '%';

    setActivePill(section);
    applyTradeJournalFilters(section);
    renderTradeJournalPnl(section, trades);
  }

  function bulkDeleteTrades() {
    var ids = Object.keys(tjSelection);
    if (!ids.length) return;
    if (!window.confirm('Delete ' + ids.length + ' trade' + (ids.length === 1 ? '' : 's') + '? This can\'t be undone.')) return;

    var deleted = {};
    ids.forEach(function (id) { deleted[id] = true; });
    TradeStore.setAll(TradeStore.getAll().filter(function (t) { return !deleted[t.id]; }));
    unlinkPositionsForTrades(deleted);
    clearSelection(tjSelection);
    renderTradeJournal();
    renderInsightsDashboard();
  }

  function bulkDeletePositions() {
    var ids = Object.keys(phSelection);
    if (!ids.length) return;
    if (!window.confirm('Delete ' + ids.length + ' position' + (ids.length === 1 ? '' : 's') + '? This can\'t be undone.')) return;

    var deleted = {};
    ids.forEach(function (id) { deleted[id] = true; });
    PositionStore.setAll(PositionStore.getAll().filter(function (p) { return !deleted[p.id]; }));
    clearSelection(phSelection);
    renderPositionHistory();
    renderInsightsDashboard();
  }

  function visibleTradeIds() {
    var section = sections['trade-journal'];
    if (!section) return [];
    return Array.prototype.filter.call(section.querySelectorAll('.trade-row'), function (row) {
      return row.style.display !== 'none';
    }).map(function (row) { return row.getAttribute('data-trade-id'); });
  }

  function syncTradeSelectionUi() {
    syncSelectionUi({
      barId: 'tj-bulk-bar',
      countId: 'tj-bulk-count',
      selectAllId: 'tj-select-all',
      selection: tjSelection,
      visibleIds: visibleTradeIds
    });
  }

  function visiblePositionIds() {
    var section = sections['position-history'];
    if (!section) return [];
    return Array.prototype.map.call(section.querySelectorAll('.ph-row'), function (row) {
      return row.getAttribute('data-position-id');
    });
  }

  function syncPositionSelectionUi() {
    syncSelectionUi({
      barId: 'ph-bulk-bar',
      countId: 'ph-bulk-count',
      selectAllId: 'ph-select-all',
      selection: phSelection,
      visibleIds: visiblePositionIds
    });
  }

  var tjPairSortState = { pairSortKey: 'net', pairSortDir: 'asc' };

  // Uses the same P&L the earlier R-multiple work already derives per trade
  // (computeTradeReturn().dollarPnl) rather than a second stored field.
  // Trades with no usable entry/exit are left out of the sum entirely - not
  // counted as zero - and reported in the coverage caption instead.
  function computeTradeJournalPnl(trades) {
    var withPnl = [];
    trades.forEach(function (t) {
      var ret = computeTradeReturn(t);
      if (ret && ret.dollarPnl !== null) withPnl.push({ trade: t, pnl: ret.dollarPnl });
    });
    var total = withPnl.reduce(function (sum, x) { return sum + x.pnl; }, 0);
    var best = null, worst = null;
    var wins = 0, losses = 0;
    withPnl.forEach(function (x) {
      if (!best || x.pnl > best.pnl) best = x;
      if (!worst || x.pnl < worst.pnl) worst = x;
      if (x.pnl > 0) wins++;
      else if (x.pnl < 0) losses++;
    });
    return {
      totalTrades: trades.length,
      covered: withPnl.length,
      withPnl: withPnl,
      total: total,
      average: withPnl.length ? total / withPnl.length : 0,
      best: best,
      worst: worst,
      // Classified by realized P&L sign rather than the manually-set
      // outcome, so this is directly comparable to the Position History
      // win rate, which has no outcome field to read.
      winsByPnl: wins,
      lossesByPnl: losses,
      winRateByPnl: pct(wins, wins + losses)
    };
  }

  function renderTradeJournalPnl(section, trades) {
    var pnlStats = computeTradeJournalPnl(trades);
    var stats = computeStats(trades);
    var hasPnl = pnlStats.covered > 0;
    var NEUTRAL = 'text-metric-display font-metric-display text-secondary';

    var pnlEl = section.querySelector('#tj-kpi-pnl');
    if (!pnlEl) return;
    pnlEl.textContent = hasPnl ? formatSignedMoney(pnlStats.total) : 'Not recorded';
    pnlEl.className = hasPnl
      ? 'text-metric-display font-metric-display ' + (pnlStats.total >= 0 ? 'text-tertiary' : 'text-error')
      : NEUTRAL;
    section.querySelector('#tj-kpi-pnl-sub').textContent = hasPnl
      ? 'across ' + pnlStats.covered + ' trade' + (pnlStats.covered === 1 ? '' : 's') + ' with P&L'
      : 'no entry/exit prices yet';

    section.querySelector('#tj-kpi-winrate').textContent = stats.winRate.toFixed(1) + '%';
    section.querySelector('#tj-kpi-winrate-sub').textContent = stats.wins + ' wins, ' + stats.losses + ' losses';

    var avgEl = section.querySelector('#tj-kpi-avg');
    avgEl.textContent = hasPnl ? formatSignedMoney(pnlStats.average) : 'Not recorded';
    avgEl.className = hasPnl
      ? 'text-metric-display font-metric-display ' + (pnlStats.average >= 0 ? 'text-tertiary' : 'text-error')
      : NEUTRAL;
    section.querySelector('#tj-kpi-avg-sub').textContent = hasPnl
      ? 'mean of ' + pnlStats.covered + ' logged result' + (pnlStats.covered === 1 ? '' : 's')
      : 'needs entry + exit prices';

    var bestEl = section.querySelector('#tj-kpi-best');
    var worstEl = section.querySelector('#tj-kpi-worst');
    var bestPairEl = section.querySelector('#tj-kpi-best-pair');
    var worstPairEl = section.querySelector('#tj-kpi-worst-pair');
    if (hasPnl) {
      bestEl.textContent = formatSignedMoney(pnlStats.best.pnl);
      bestEl.className = 'font-metric-md text-metric-md font-semibold text-tertiary';
      bestPairEl.textContent = pnlStats.best.trade.pair;
      worstEl.textContent = formatSignedMoney(pnlStats.worst.pnl);
      worstEl.className = 'font-metric-md text-metric-md font-semibold ' + (pnlStats.worst.pnl < 0 ? 'text-error' : 'text-tertiary');
      worstPairEl.textContent = pnlStats.worst.trade.pair;
    } else {
      bestEl.textContent = 'Not recorded';
      bestEl.className = 'font-metric-md text-metric-md font-semibold text-secondary';
      bestPairEl.textContent = '';
      worstEl.textContent = '';
      worstEl.className = 'font-metric-md text-metric-md font-semibold text-secondary';
      worstPairEl.textContent = '';
    }

    section.querySelector('#tj-pnl-coverage').textContent = hasPnl
      ? 'P&L shown for ' + pnlStats.covered + ' of ' + pnlStats.totalTrades + ' trades. The rest have no entry/exit price recorded and are excluded from these totals.'
      : 'No P&L recorded yet — add entry and exit prices (and a position size) to a trade to unlock these numbers. ' + pnlStats.totalTrades + ' trade' + (pnlStats.totalTrades === 1 ? '' : 's') + ' logged.';

    var equityItems = pnlStats.withPnl.map(function (x) {
      return { t: Date.parse(x.trade.date + 'T00:00:00Z'), amount: x.pnl, label: x.trade.pair };
    }).filter(function (item) { return !isNaN(item.t); });
    section.querySelector('#tj-equity-chart').innerHTML =
      equityCurveHtml(equityItems, 'Log entry and exit prices on at least two trades to plot an equity curve.');
    var equitySummary = section.querySelector('#tj-equity-summary');
    if (equitySummary) equitySummary.textContent = hasPnl ? 'Ending ' + formatSignedMoney(pnlStats.total) : '';

    var pairRows = sortPairBreakdown(computePairBreakdown(trades.map(function (t) {
      var ret = computeTradeReturn(t);
      var dollarPnl = ret && ret.dollarPnl !== null ? ret.dollarPnl : null;
      return {
        pair: t.pair,
        net: dollarPnl === null ? 0 : dollarPnl,
        hasPnl: dollarPnl !== null,
        isWin: t.outcome === 'win',
        isLoss: t.outcome === 'loss'
      };
    })), tjPairSortState);
    var pairBody = section.querySelector('#tj-pair-body');
    if (pairBody) {
      pairBody.innerHTML = pairRows.length
        ? pairRows.map(pairBreakdownRowHtml).join('')
        : '<tr><td class="px-5 py-8 text-center font-body-sm text-body-sm text-secondary" colspan="4">No trades logged yet.</td></tr>';
    }
    updateSortIndicators(section, '.tj-pair-sort-th', 'data-tj-pair-sort', tjPairSortState.pairSortKey, tjPairSortState.pairSortDir);
  }

  // ---------------------------------------------------------------------
  // MEXC Position History (.xlsx) import
  // ---------------------------------------------------------------------

  // Only the columns this importer actually reads are required to match -
  // UID / Close Time / Margin Mode / Closing Qty aren't used for anything,
  // so a slightly different header on one of those shouldn't block an
  // otherwise-readable file.
  var MEXC_REQUIRED_COLUMNS = [
    'Futures', 'Avg Entry Price', 'Avg Close Price', 'Direction', 'Fee', 'Realized PNL', 'Status'
  ];

  // Handles case differences, extra/odd whitespace, and full-width
  // punctuation (common when a header is copy-pasted from a CJK locale
  // export UI), all of which are plausible ways a real export's header
  // text could differ from the reference sample without the data itself
  // being any different.
  function normalizeHeaderCell(v) {
    return String(v == null ? '' : v)
      .replace(/（/g, '(').replace(/）/g, ')')
      .replace(/：/g, ':')
      .replace(/ /g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // Read when present, but never required - a differently-worded header on
  // one of these shouldn't block an otherwise-readable file.
  var MEXC_OPTIONAL_COLUMNS = ['UID', 'Close Time', 'Margin Mode', 'Closing Qty (Cont.)'];

  var MEXC_REQUIRED_LOOKUP = {};
  MEXC_REQUIRED_COLUMNS.concat(MEXC_OPTIONAL_COLUMNS).forEach(function (name) {
    MEXC_REQUIRED_LOOKUP[normalizeHeaderCell(name)] = name;
  });

  // Manual entries use a ".P" suffix (e.g. "HNTUSDT.P"); MEXC's export has
  // none (e.g. "WAVESUSDT"). Normalizing onto the manual convention keeps
  // every existing screen, seed trade, and placeholder untouched.
  function normalizePairSymbol(raw) {
    var p = (raw || '').toString().trim().toUpperCase();
    p = p.replace(/\.P$/, '');
    if (!p) return p;
    return p + '.P';
  }

  // Some low-priced altcoins have entry/close prices small enough that
  // JS's default number-to-string conversion switches to scientific
  // notation (e.g. 1.234e-7), which parsePriceValue can't read - format
  // explicitly instead of relying on String(number).
  function formatMexcPriceCell(raw) {
    if (typeof raw === 'number') {
      if (!isFinite(raw)) return '';
      return raw.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
    }
    return (raw == null ? '' : String(raw)).trim();
  }

  function parseMexcNumericUsdt(raw) {
    if (typeof raw === 'number') return isNaN(raw) ? null : raw;
    var s = (raw == null ? '' : String(raw)).trim();
    if (!s) return null;
    var n = parseFloat(s.replace(/USDT$/i, '').replace(/,/g, '').trim());
    return isNaN(n) ? null : n;
  }

  function outcomeFromRealizedPnl(pnl) {
    if (pnl > 0) return 'win';
    if (pnl < 0) return 'loss';
    return 'breakeven';
  }

  // Reads a date/time cell that may come through as a JS Date (when SheetJS's
  // cellDates option applies) or as formatted text, and returns its naive
  // wall-clock components exactly as displayed in the sheet - i.e. NOT
  // adjusted for the browser's local timezone, since SheetJS represents
  // date cells using UTC-based getters internally.
  function parseMexcDateTimeComponents(raw) {
    if (raw instanceof Date && !isNaN(raw.getTime())) {
      return {
        year: raw.getUTCFullYear(), month: raw.getUTCMonth() + 1, day: raw.getUTCDate(),
        hour: raw.getUTCHours(), minute: raw.getUTCMinutes(), second: raw.getUTCSeconds()
      };
    }
    var s = (raw == null ? '' : String(raw)).trim();
    if (!s) return null;
    var normalized = s.replace(/\//g, '-').replace('T', ' ');
    var m = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5], second: +(m[6] || 0) };
  }

  // The export's Open Time column is labeled UTC+08:00. Converts those naive
  // components into the app's canonical UTC date + "HH:mm" entry time.
  function mexcOpenTimeToUtcParts(components) {
    var utcMs = Date.UTC(components.year, components.month - 1, components.day, components.hour, components.minute, components.second || 0) - 8 * 3600 * 1000;
    var d = new Date(utcMs);
    return {
      date: d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()),
      entryTime: pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes())
    };
  }

  function daysBetweenDateStrings(a, b) {
    var msA = Date.parse(a + 'T00:00:00Z');
    var msB = Date.parse(b + 'T00:00:00Z');
    if (isNaN(msA) || isNaN(msB)) return Infinity;
    return Math.round((msA - msB) / 86400000);
  }

  // Parses the workbook into raw column-keyed rows. Scans for the header row
  // rather than assuming row 1, since exchange exports sometimes prepend a
  // title row above the actual header.
  function findOpenTimeColumnIndex(headerRow) {
    for (var i = 0; i < headerRow.length; i++) {
      if (normalizeHeaderCell(headerRow[i]).indexOf('open time') !== -1) return i;
    }
    return -1;
  }

  function describeRowForDiagnostics(row) {
    var cells = (row || []).map(function (c) { return String(c == null ? '' : c).trim(); }).filter(Boolean);
    return cells.length ? cells.join(' | ') : '(empty row)';
  }

  // Fixed column order MEXC uses in its raw Position History export, for
  // files that have no header row at all - just the data, starting at row 1.
  var MEXC_POSITIONAL_COLUMNS = {
    'UID': 0, 'Futures': 1, 'Open Time(UTC+08:00)': 2, 'Close Time': 3, 'Margin Mode': 4,
    'Avg Entry Price': 5, 'Avg Close Price': 6, 'Direction': 7, 'Closing Qty (Cont.)': 8,
    'Fee': 9, 'Realized PNL': 10, 'Status': 11
  };

  // Content-shape check used to find where headerless data starts: Direction
  // is exactly "Long"/"Short", and Fee/Realized PNL end in "USDT" - a
  // distinctive enough signature that it's very unlikely to false-positive
  // on an unrelated spreadsheet.
  function looksLikeMexcDataRow(row) {
    if (!row || row.length < 12) return false;
    var direction = normalizeHeaderCell(row[MEXC_POSITIONAL_COLUMNS.Direction]);
    if (direction !== 'long' && direction !== 'short') return false;
    var fee = String(row[MEXC_POSITIONAL_COLUMNS.Fee] == null ? '' : row[MEXC_POSITIONAL_COLUMNS.Fee]).trim();
    var pnl = String(row[MEXC_POSITIONAL_COLUMNS['Realized PNL']] == null ? '' : row[MEXC_POSITIONAL_COLUMNS['Realized PNL']]).trim();
    return /USDT\s*$/i.test(fee) || /USDT\s*$/i.test(pnl);
  }

  function mexcCellText(raw, colIndex, name) {
    var idx = colIndex[name];
    if (idx === undefined) return '';
    return String(raw[idx] == null ? '' : raw[idx]).trim();
  }

  function extractMexcDataRow(raw, colIndex) {
    return {
      uid: mexcCellText(raw, colIndex, 'UID'),
      futures: mexcCellText(raw, colIndex, 'Futures'),
      openTime: raw[colIndex['Open Time(UTC+08:00)']],
      closeTime: colIndex['Close Time'] === undefined ? '' : raw[colIndex['Close Time']],
      marginMode: mexcCellText(raw, colIndex, 'Margin Mode'),
      avgEntryPrice: raw[colIndex['Avg Entry Price']],
      avgClosePrice: raw[colIndex['Avg Close Price']],
      direction: mexcCellText(raw, colIndex, 'Direction'),
      qty: mexcCellText(raw, colIndex, 'Closing Qty (Cont.)'),
      fee: raw[colIndex['Fee']],
      realizedPnl: raw[colIndex['Realized PNL']],
      status: mexcCellText(raw, colIndex, 'Status')
    };
  }

  function parseMexcWorkbook(workbook) {
    var sheetNames = workbook.SheetNames;

    // Pass 1: a textual header row (case/whitespace/full-width tolerant).
    for (var s = 0; s < sheetNames.length; s++) {
      var sheet = workbook.Sheets[sheetNames[s]];
      if (!sheet) continue;
      var candidateRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      for (var i = 0; i < candidateRows.length; i++) {
        var normVals = candidateRows[i].map(normalizeHeaderCell);
        if (normVals.indexOf('futures') === -1 || normVals.indexOf('direction') === -1) continue;

        var headerRow = candidateRows[i];
        var colIndex = {};
        headerRow.forEach(function (cell, idx) {
          var canonical = MEXC_REQUIRED_LOOKUP[normalizeHeaderCell(cell)];
          if (canonical) colIndex[canonical] = idx;
        });
        var openTimeIdx = findOpenTimeColumnIndex(headerRow);
        if (openTimeIdx !== -1) colIndex['Open Time(UTC+08:00)'] = openTimeIdx;

        var missing = MEXC_REQUIRED_COLUMNS.filter(function (name) { return !(name in colIndex); });
        if (openTimeIdx === -1) missing.push('Open Time');
        if (missing.length) {
          return {
            rows: [], error: 'Missing expected column(s): ' + missing.join(', ') +
              '. Columns found in this file: ' + describeRowForDiagnostics(headerRow)
          };
        }

        var dataRows = [];
        for (var r = i + 1; r < candidateRows.length; r++) {
          var raw = candidateRows[r];
          if (!raw || raw.every(function (c) { return String(c == null ? '' : c).trim() === ''; })) continue;
          dataRows.push(extractMexcDataRow(raw, colIndex));
        }
        return { rows: dataRows, error: null };
      }
    }

    // Pass 2: no header row at all - MEXC's raw export can be just the data,
    // in a fixed column order, starting at row 1. Find where it starts by
    // content shape instead, then read positionally.
    for (var s2 = 0; s2 < sheetNames.length; s2++) {
      var sheet2 = workbook.Sheets[sheetNames[s2]];
      if (!sheet2) continue;
      var rows2 = XLSX.utils.sheet_to_json(sheet2, { header: 1, defval: '' });
      for (var r2 = 0; r2 < rows2.length; r2++) {
        if (!looksLikeMexcDataRow(rows2[r2])) continue;
        var dataRows2 = [];
        for (var r3 = r2; r3 < rows2.length; r3++) {
          var raw2 = rows2[r3];
          if (!raw2 || raw2.every(function (c) { return String(c == null ? '' : c).trim() === ''; })) continue;
          dataRows2.push(extractMexcDataRow(raw2, MEXC_POSITIONAL_COLUMNS));
        }
        return { rows: dataRows2, error: null };
      }
    }

    var firstSheet = workbook.Sheets[sheetNames[0]];
    var firstRows = firstSheet ? XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) : [];
    var sampleRow = firstRows.filter(function (r) { return r.some(function (c) { return String(c == null ? '' : c).trim() !== ''; }); })[0];
    return {
      rows: [], error: 'Could not find MEXC Position History data in this file (looked for column headers, and for rows shaped like exported positions). First readable row: ' + describeRowForDiagnostics(sampleRow)
    };
  }

  function buildImportedTrade(imp, matchWarning) {
    var trade = {
      id: 'mexc-' + imp.date + '-' + imp.pair.replace(/[^A-Z0-9]/g, '') + '-' + Math.random().toString(36).slice(2, 8),
      date: imp.date,
      entryTime: imp.entryTime,
      pair: imp.pair,
      direction: imp.direction,
      leverage: '',
      prevCandle: '',
      entryPrice: imp.entryPrice,
      exitPrice: imp.exitPrice,
      positionSize: '',
      stopLoss: '',
      outcome: imp.outcome,
      parameters: [],
      chart: null,
      notes: '',
      source: 'mexc-import',
      realizedPnl: imp.realizedPnl,
      fee: imp.fee
    };
    if (matchWarning) trade.matchWarning = matchWarning;
    return trade;
  }

  // Backfills a high-confidence manual match with the exchange's execution
  // data. Parameters, notes, and chart image are deliberately left alone.
  function mergeMexcDataIntoTrade(trade, imp) {
    trade.entryPrice = imp.entryPrice;
    trade.exitPrice = imp.exitPrice;
    trade.realizedPnl = imp.realizedPnl;
    trade.fee = imp.fee;
    if (imp.realizedPnl !== null) trade.outcome = outcomeFromRealizedPnl(imp.realizedPnl);
    return trade;
  }

  // Confidence-tiered matching against existing manual trades, per pair +
  // direction + calendar date, disambiguated by a +/-1 day same-pair window.
  function importMexcRows(rawRows) {
    var manualTrades = TradeStore.getAll().filter(function (t) { return t.source === 'manual'; });
    var prepared = [];
    var skipped = 0;

    rawRows.forEach(function (row) {
      if (row.status.toLowerCase() !== 'all closed') { skipped++; return; }
      var dt = parseMexcDateTimeComponents(row.openTime);
      if (!dt) { skipped++; return; }
      var utc = mexcOpenTimeToUtcParts(dt);
      var direction = row.direction.toLowerCase();
      if (direction !== 'long' && direction !== 'short') direction = 'long';
      var realizedPnl = parseMexcNumericUsdt(row.realizedPnl);
      var fee = parseMexcNumericUsdt(row.fee);
      prepared.push({
        pair: normalizePairSymbol(row.futures),
        direction: direction,
        date: utc.date,
        entryTime: utc.entryTime,
        entryPrice: formatMexcPriceCell(row.avgEntryPrice),
        exitPrice: formatMexcPriceCell(row.avgClosePrice),
        realizedPnl: realizedPnl,
        fee: fee,
        outcome: realizedPnl === null ? 'open' : outcomeFromRealizedPnl(realizedPnl)
      });
    });

    var classified = prepared.map(function (imp) {
      var candidatesForPairWindow = manualTrades.filter(function (t) {
        return normalizePairSymbol(t.pair) === imp.pair && Math.abs(daysBetweenDateStrings(t.date, imp.date)) <= 1;
      });
      var exactMatches = candidatesForPairWindow.filter(function (t) {
        return t.direction === imp.direction && t.date === imp.date;
      });
      var tier = 'none';
      var target = null;
      if (exactMatches.length === 1 && candidatesForPairWindow.length === 1) {
        tier = 'high';
        target = exactMatches[0];
      } else if (candidatesForPairWindow.length >= 1) {
        tier = 'low';
      }
      return { imp: imp, tier: tier, target: target, candidates: candidatesForPairWindow };
    });

    // If two or more imported rows in this batch would each claim the same
    // manual trade as their unique high-confidence match (e.g. partial-fill
    // tranches), none of them is actually unambiguous - downgrade them all.
    var claimCounts = {};
    classified.forEach(function (c) {
      if (c.tier === 'high') claimCounts[c.target.id] = (claimCounts[c.target.id] || 0) + 1;
    });
    classified.forEach(function (c) {
      if (c.tier === 'high' && claimCounts[c.target.id] > 1) {
        c.tier = 'low';
        c.candidates = [c.target];
        c.target = null;
      }
    });

    var mergedCount = 0, flaggedCount = 0, addedCount = 0;
    var trades = TradeStore.getAll();

    classified.forEach(function (c) {
      if (c.tier === 'high') {
        var idx = trades.findIndex(function (t) { return t.id === c.target.id; });
        if (idx !== -1) {
          trades[idx] = mergeMexcDataIntoTrade(trades[idx], c.imp);
          mergedCount++;
          return;
        }
        // Target vanished between snapshots (shouldn't normally happen) - fall through to a flagged import.
      }
      if (c.tier === 'high' || c.tier === 'low') {
        var warning = 'Possible duplicate of ' + c.candidates.map(function (t) {
          return formatDateLabel(t.date) + ' ' + t.pair;
        }).join(', ');
        trades.push(buildImportedTrade(c.imp, warning));
        flaggedCount++;
      } else {
        trades.push(buildImportedTrade(c.imp, null));
        addedCount++;
      }
    });

    TradeStore.setAll(trades);

    return {
      total: prepared.length,
      merged: mergedCount,
      flagged: flaggedCount,
      added: addedCount,
      skipped: skipped
    };
  }

  function importSummaryText(result) {
    var parts = [];
    if (result.merged) parts.push(result.merged + ' merged automatically');
    if (result.flagged) parts.push(result.flagged + ' flagged for review');
    if (result.added) parts.push(result.added + ' new');
    var text = 'Imported ' + result.total + ' trade' + (result.total === 1 ? '' : 's');
    if (parts.length) text += ' — ' + parts.join(', ');
    if (result.skipped) text += ' (' + result.skipped + ' row' + (result.skipped === 1 ? '' : 's') + ' skipped, not fully closed)';
    return text;
  }

  function showImportSummary(result) {
    var banner = document.getElementById('import-summary-banner');
    var textEl = document.getElementById('import-summary-text');
    var reviewBtn = document.getElementById('import-summary-review-btn');
    if (!banner || !textEl) return;
    textEl.textContent = importSummaryText(result);
    if (reviewBtn) reviewBtn.hidden = !result.flagged;
    banner.hidden = false;
  }

  function initMexcImport(section) {
    if (!section) return;
    var importBtn = document.getElementById('btn-import-mexc');
    var fileInput = document.getElementById('mexc-import-file-input');
    var banner = document.getElementById('import-summary-banner');
    var dismissBtn = document.getElementById('import-summary-dismiss');
    var reviewBtn = document.getElementById('import-summary-review-btn');

    if (importBtn && fileInput) {
      importBtn.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function (e) {
        var file = e.target.files[0];
        fileInput.value = '';
        if (!file) return;
        if (typeof XLSX === 'undefined') {
          window.alert('The .xlsx import library failed to load, so this file can\'t be read. Check your connection and try again.');
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var result;
          try {
            var data = new Uint8Array(reader.result);
            var workbook = XLSX.read(data, { type: 'array', cellDates: true });
            var parsed = parseMexcWorkbook(workbook);
            if (parsed.error) {
              window.alert('Could not import this file: ' + parsed.error);
              return;
            }
            if (!parsed.rows.length) {
              window.alert('No closed positions found in this file to import.');
              return;
            }
            result = importMexcRows(parsed.rows);
          } catch (err) {
            window.alert('Could not read this file. Make sure it is a MEXC Position History .xlsx export.');
            return;
          }
          showImportSummary(result);
          renderTradeJournal();
        };
        reader.onerror = function () {
          window.alert('Could not read this file.');
        };
        reader.readAsArrayBuffer(file);
      });
    }

    if (dismissBtn && banner) {
      dismissBtn.addEventListener('click', function () { banner.hidden = true; });
    }
    if (reviewBtn && banner) {
      reviewBtn.addEventListener('click', function () {
        tjState.flaggedOnly = true;
        applyTradeJournalFilters(section);
        banner.hidden = true;
      });
    }
  }

  // ---------------------------------------------------------------------
  // Position History (raw exchange ledger)
  // ---------------------------------------------------------------------
  //
  // Deliberately a separate collection from `trades`: the Trade Journal is
  // the curated set of setups being studied, this is every position the
  // account actually took, with real P&L. They're never merged or deduped
  // against each other - a position is only ever linked to a trade when the
  // user explicitly promotes it.

  var POSITION_STORAGE_KEY = 'tj_position_history';

  var PositionStore = {
    getAll: function () {
      try {
        var raw = localStorage.getItem(POSITION_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return [];
    },
    setAll: function (positions) {
      try {
        localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(positions));
        scheduleGithubSync();
        return true;
      } catch (e) {
        return false;
      }
    },
    getById: function (id) {
      return PositionStore.getAll().filter(function (p) { return p.id === id; })[0] || null;
    },
    update: function (id, changes) {
      var positions = PositionStore.getAll();
      var idx = positions.findIndex(function (p) { return p.id === id; });
      if (idx === -1) return false;
      Object.keys(changes).forEach(function (k) { positions[idx][k] = changes[k]; });
      return PositionStore.setAll(positions);
    }
  };

  // The export's timestamps are UTC+08:00; store them as true-UTC ISO
  // strings so sorting, duration math, and date filtering are unambiguous.
  function mexcTimeToIso(rawCell) {
    var parts = parseMexcDateTimeComponents(rawCell);
    if (!parts) return '';
    var utcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0) - 8 * 3600 * 1000;
    return new Date(utcMs).toISOString();
  }

  function positionNaturalKey(rec) {
    return [rec.uid, rec.pair, rec.openTime, rec.closeTime].join('|');
  }

  function buildPositionRecord(row) {
    var pnl = parseMexcNumericUsdt(row.realizedPnl);
    var fee = parseMexcNumericUsdt(row.fee);
    var direction = row.direction.toLowerCase();
    if (direction !== 'long' && direction !== 'short') direction = 'long';
    var openIso = mexcTimeToIso(row.openTime);
    if (!openIso) return null;
    return {
      id: '',
      uid: row.uid || '',
      pair: row.futures.toUpperCase(),
      openTime: openIso,
      closeTime: mexcTimeToIso(row.closeTime),
      marginMode: row.marginMode || '',
      entryPrice: parsePriceValue(formatMexcPriceCell(row.avgEntryPrice)),
      closePrice: parsePriceValue(formatMexcPriceCell(row.avgClosePrice)),
      direction: direction,
      qty: row.qty || '',
      fee: fee === null ? 0 : Math.abs(fee),
      pnl: pnl === null ? 0 : pnl,
      status: row.status,
      linkedTradeId: null
    };
  }

  // Repeat exports usually overlap in date range, so rows already on file
  // are skipped by their natural key rather than re-added.
  function importPositionRows(rawRows) {
    var existing = PositionStore.getAll();
    var seen = {};
    existing.forEach(function (p) { seen[positionNaturalKey(p)] = true; });

    var imported = 0, skipped = 0, ignored = 0;

    rawRows.forEach(function (row) {
      if (row.status.toLowerCase() !== 'all closed') { ignored++; return; }
      var rec = buildPositionRecord(row);
      if (!rec) { ignored++; return; }
      var key = positionNaturalKey(rec);
      if (seen[key]) { skipped++; return; }
      seen[key] = true;
      rec.id = 'pos-' + (rec.uid || 'x') + '-' + rec.openTime.slice(0, 10) + '-' + Math.random().toString(36).slice(2, 8);
      existing.push(rec);
      imported++;
    });

    PositionStore.setAll(existing);
    return { imported: imported, skipped: skipped, ignored: ignored };
  }

  function positionNet(p) {
    return p.pnl - p.fee;
  }

  function computePositionStats(positions) {
    var totalPnl = 0, totalFees = 0, wins = 0, losses = 0;
    positions.forEach(function (p) {
      totalPnl += p.pnl;
      totalFees += p.fee;
      if (p.pnl > 0) wins++;
      else if (p.pnl < 0) losses++;
    });
    var decided = wins + losses;
    return {
      count: positions.length,
      totalPnl: totalPnl,
      totalFees: totalFees,
      netPnl: totalPnl - totalFees,
      wins: wins,
      losses: losses,
      winRate: decided > 0 ? (wins / decided) * 100 : 0
    };
  }

  function formatMoney(n) {
    var sign = n < 0 ? '-' : '';
    var abs = Math.abs(n);
    return sign + '$' + (abs < 1 && abs > 0 ? abs.toFixed(4) : abs.toFixed(2));
  }

  function formatSignedMoney(n) {
    return (n >= 0 ? '+' : '-') + '$' + (Math.abs(n) < 1 && n !== 0 ? Math.abs(n).toFixed(4) : Math.abs(n).toFixed(2));
  }

  function formatDurationMs(ms) {
    if (!isFinite(ms) || ms < 0) return '—';
    var mins = Math.round(ms / 60000);
    if (mins < 1) return '<1m';
    if (mins < 60) return mins + 'm';
    var hours = Math.floor(mins / 60);
    var remMins = mins % 60;
    if (hours < 24) return remMins ? (hours + 'h ' + remMins + 'm') : (hours + 'h');
    var days = Math.floor(hours / 24);
    var remHours = hours % 24;
    return remHours ? (days + 'd ' + remHours + 'h') : (days + 'd');
  }

  // Positions store true UTC, but the Trade Journal's Entry Time field is
  // wall-clock in whichever timezone the user configured on Timing &
  // Heatmap. Promoting converts into that frame so the value round-trips
  // back to the right UTC hour when sessions are computed.
  function positionLocalDateTime(p) {
    var ms = Date.parse(p.openTime);
    if (isNaN(ms)) return { date: '', time: '' };
    var shifted = new Date(ms + getEntryTzOffsetMinutes() * 60000);
    return {
      date: shifted.getUTCFullYear() + '-' + pad2(shifted.getUTCMonth() + 1) + '-' + pad2(shifted.getUTCDate()),
      time: pad2(shifted.getUTCHours()) + ':' + pad2(shifted.getUTCMinutes())
    };
  }

  function positionDurationMs(p) {
    if (!p.openTime || !p.closeTime) return NaN;
    return Date.parse(p.closeTime) - Date.parse(p.openTime);
  }

  var MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Timestamps are stored as true UTC, so they're formatted with UTC getters
  // throughout - using local getters here would silently shift the displayed
  // date/time by the viewer's own offset.
  function isoDateOnly(iso) {
    return (iso || '').slice(0, 10);
  }

  function formatIsoDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return MONTH_ABBR[d.getUTCMonth()] + ' ' + d.getUTCDate() + ' ' +
      pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
  }

  var PH_PAGE_SIZE = 25;

  var phState = {
    search: '', direction: 'all', outcome: 'all', from: '', to: '',
    sortKey: 'date', sortDir: 'desc',
    pairSortKey: 'net', pairSortDir: 'asc',
    page: 1
  };

  function filteredPositions() {
    var query = phState.search.trim().toLowerCase();
    return PositionStore.getAll().filter(function (p) {
      if (query && p.pair.toLowerCase().indexOf(query) === -1) return false;
      if (phState.direction !== 'all' && p.direction !== phState.direction) return false;
      if (phState.outcome === 'win' && !(p.pnl > 0)) return false;
      if (phState.outcome === 'loss' && !(p.pnl < 0)) return false;
      var day = isoDateOnly(p.openTime);
      if (phState.from && day < phState.from) return false;
      if (phState.to && day > phState.to) return false;
      return true;
    });
  }

  function positionSortValue(p, key) {
    var value;
    if (key === 'pnl') value = p.pnl;
    else if (key === 'fee') value = p.fee;
    else if (key === 'duration') value = positionDurationMs(p);
    else value = Date.parse(p.openTime);
    return typeof value === 'number' && !isNaN(value) ? value : null;
  }

  function sortPositions(positions) {
    var key = phState.sortKey;
    var factor = phState.sortDir === 'asc' ? 1 : -1;
    return positions.slice().sort(function (a, b) {
      if (key === 'pair') return factor * a.pair.localeCompare(b.pair);
      var av = positionSortValue(a, key);
      var bv = positionSortValue(b, key);
      // A position with no close time has no duration - it sinks to the
      // bottom either way rather than sorting as if it lasted zero minutes.
      var missing = compareMissingLast(av, bv);
      if (missing !== null) return missing;
      return factor * (av - bv);
    });
  }

  // The dropdown and the clickable column headers drive the same state, so
  // they stay in sync in both directions.
  function positionSortSelectValue() {
    return phState.sortKey === 'pair' ? 'pair-az' : phState.sortKey + '-' + phState.sortDir;
  }

  function applyPositionSortSelectValue(value) {
    if (value === 'pair-az') {
      phState.sortKey = 'pair';
      phState.sortDir = 'asc';
      return;
    }
    var splitAt = value.lastIndexOf('-');
    phState.sortKey = value.slice(0, splitAt);
    phState.sortDir = value.slice(splitAt + 1);
  }

  function positionRowHtml(p) {
    var pnlClass = p.pnl > 0 ? 'text-tertiary' : (p.pnl < 0 ? 'text-error' : 'text-secondary');
    var directionClass = DIRECTION_BADGE_CLASS[p.direction] || DIRECTION_BADGE_CLASS.long;
    var action = p.linkedTradeId
      ? '<a class="inline-flex items-center gap-1 text-primary hover:text-primary-container font-headline-sm text-headline-sm font-medium transition-colors" href="#case-studies/' + encodeURIComponent(p.linkedTradeId) + '"><span>View case study</span><span class="material-symbols-outlined text-[15px]">arrow_forward</span></a>'
      : '<button type="button" class="ph-promote-btn px-2.5 py-1 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-metric-sm text-metric-sm font-semibold transition-colors" data-position-id="' + escapeHtml(p.id) + '">Promote</button>';
    var promotedBadge = p.linkedTradeId
      ? '<div class="mt-1"><span class="inline-flex items-center gap-1 bg-primary/10 text-primary font-metric-sm text-[10px] font-semibold px-1.5 py-0.5 rounded"><span class="material-symbols-outlined text-[11px] align-middle">arrow_outward</span>Promoted</span></div>'
      : '';

    return (
      '<tr class="ph-row hover:bg-surface-container-low/60 transition-colors" data-position-id="' + escapeHtml(p.id) + '" data-pair="' + escapeHtml(p.pair) + '">' +
        rowCheckboxHtml('ph-row-check', p.id, phSelection, 'Select position', 'pl-5 pr-2 py-3') +
        '<td class="px-5 py-3 font-metric-sm text-metric-sm text-on-surface whitespace-nowrap">' + formatIsoDateTime(p.openTime) + '</td>' +
        '<td class="px-5 py-3"><div class="flex flex-col">' +
          '<span class="font-metric-md text-metric-md font-bold text-on-surface">' + escapeHtml(p.pair) + '</span>' +
          promotedBadge +
        '</div></td>' +
        '<td class="px-5 py-3"><span class="' + directionClass + ' font-metric-sm text-[11px] font-semibold px-2 py-0.5 rounded">' + p.direction.toUpperCase() + '</span></td>' +
        '<td class="px-5 py-3 text-right font-metric-sm text-metric-sm text-on-surface-variant">' + (p.entryPrice === null ? '—' : p.entryPrice) + '</td>' +
        '<td class="px-5 py-3 text-right font-metric-sm text-metric-sm text-on-surface-variant">' + (p.closePrice === null ? '—' : p.closePrice) + '</td>' +
        '<td class="px-5 py-3 text-right font-metric-md text-metric-md font-semibold ' + pnlClass + '">' + formatSignedMoney(p.pnl) + '</td>' +
        '<td class="px-5 py-3 text-right font-metric-sm text-metric-sm text-secondary">' + formatMoney(p.fee) + '</td>' +
        '<td class="px-5 py-3 text-right font-metric-sm text-metric-sm text-secondary whitespace-nowrap">' + formatDurationMs(positionDurationMs(p)) + '</td>' +
        '<td class="px-5 py-3 text-right">' + action + '</td>' +
      '</tr>'
    );
  }

  // Shared by Position History and the Trade Journal. Callers normalize
  // their own records into { pair, net, hasPnl, isWin, isLoss } first, so a
  // pair with no P&L recorded anywhere reads as "not recorded" rather than
  // as a misleading $0.00.
  function computePairBreakdown(items) {
    var byPair = {};
    items.forEach(function (it) {
      if (!byPair[it.pair]) byPair[it.pair] = { pair: it.pair, count: 0, wins: 0, losses: 0, net: 0, hasPnl: false };
      var b = byPair[it.pair];
      b.count++;
      if (it.hasPnl) {
        b.net += it.net;
        b.hasPnl = true;
      }
      if (it.isWin) b.wins++;
      else if (it.isLoss) b.losses++;
    });
    return Object.keys(byPair).map(function (k) {
      var b = byPair[k];
      b.winRate = pct(b.wins, b.wins + b.losses);
      return b;
    });
  }

  function sortPairBreakdown(rows, state) {
    var key = state.pairSortKey;
    var factor = state.pairSortDir === 'asc' ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      // Pairs with no P&L recorded always sink to the bottom rather than
      // sorting as if they were worth exactly $0.
      if (key === 'net' && a.hasPnl !== b.hasPnl) return a.hasPnl ? -1 : 1;
      if (key === 'pair') return factor * a.pair.localeCompare(b.pair);
      return factor * (a[key] - b[key]);
    });
  }

  function pairBreakdownRowHtml(row) {
    var netClass = row.net > 0 ? 'text-tertiary' : (row.net < 0 ? 'text-error' : 'text-secondary');
    var rateColor = row.winRate >= 50 ? 'text-tertiary' : 'text-error';
    var netCell = row.hasPnl
      ? '<span class="' + netClass + '">' + formatSignedMoney(row.net) + '</span>'
      : '<span class="text-secondary font-normal">Not recorded</span>';
    return (
      '<tr class="hover:bg-surface-container-low/60 transition-colors">' +
        '<td class="px-5 py-3 font-metric-md text-metric-md font-bold text-on-surface">' + escapeHtml(row.pair) + '</td>' +
        '<td class="px-5 py-3 text-right font-metric-sm text-metric-sm text-secondary">' + row.count + '</td>' +
        '<td class="px-5 py-3 text-right font-metric-sm text-metric-sm font-semibold ' + rateColor + '">' + row.winRate + '% <span class="text-secondary font-normal">(' + row.wins + 'W/' + row.losses + 'L)</span></td>' +
        '<td class="px-5 py-3 text-right font-metric-md text-metric-md font-semibold">' + netCell + '</td>' +
      '</tr>'
    );
  }

  function updateSortIndicators(section, selector, attr, activeKey, dir) {
    section.querySelectorAll(selector).forEach(function (th) {
      var key = th.getAttribute(attr);
      var base = th.textContent.replace(/[▲▼]\s*$/, '').trim();
      th.textContent = key === activeKey ? (base + ' ' + (dir === 'asc' ? '▲' : '▼')) : base;
    });
  }

  // Cumulative P&L over time, drawn as a plain SVG polyline so the app keeps
  // its no-charting-library footprint. Shared by Position History and the
  // Trade Journal; callers pass normalized { t, amount, label } items.
  function equityCurveHtml(items, emptyMessage) {
    var ordered = items.slice().sort(function (a, b) { return a.t - b.t; });
    if (ordered.length < 2) {
      return '<div class="font-body-sm text-body-sm text-secondary bg-surface-container-low/60 rounded-lg px-4 py-8 text-center">' + escapeHtml(emptyMessage) + '</div>';
    }

    var cumulative = 0;
    var points = ordered.map(function (it) {
      cumulative += it.amount;
      return { t: it.t, cum: cumulative, pair: it.label };
    });

    var W = 1000, H = 260, padL = 6, padR = 6, padT = 18, padB = 26;
    // Axis bounds always include the zero baseline, but the peak/trough
    // labels report values the curve actually reached.
    var peakCum = points.reduce(function (m, p) { return Math.max(m, p.cum); }, points[0].cum);
    var troughCum = points.reduce(function (m, p) { return Math.min(m, p.cum); }, points[0].cum);
    var minCum = Math.min(0, troughCum);
    var maxCum = Math.max(0, peakCum);
    var range = (maxCum - minCum) || 1;
    var t0 = points[0].t;
    var tSpan = (points[points.length - 1].t - t0) || 1;

    function xOf(p) { return padL + ((p.t - t0) / tSpan) * (W - padL - padR); }
    function yOf(v) { return padT + (1 - (v - minCum) / range) * (H - padT - padB); }

    var coords = points.map(function (p) { return xOf(p).toFixed(2) + ',' + yOf(p.cum).toFixed(2); });
    var zeroY = yOf(0).toFixed(2);
    var finalCum = points[points.length - 1].cum;
    var toneClass = finalCum >= 0 ? 'text-tertiary' : 'text-error';

    var areaPath = 'M ' + xOf(points[0]).toFixed(2) + ',' + zeroY + ' L ' + coords.join(' L ') +
      ' L ' + xOf(points[points.length - 1]).toFixed(2) + ',' + zeroY + ' Z';

    var dots = '';
    if (points.length <= 60) {
      dots = points.map(function (p) {
        return '<circle cx="' + xOf(p).toFixed(2) + '" cy="' + yOf(p.cum).toFixed(2) + '" r="3" fill="currentColor"><title>' +
          escapeHtml(p.pair) + ' · ' + formatSignedMoney(p.cum) + ' cumulative</title></circle>';
      }).join('');
    }

    return (
      '<div class="' + toneClass + '">' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" class="w-full h-64" role="img" aria-label="Cumulative net profit and loss over time">' +
          '<line x1="0" y1="' + zeroY + '" x2="' + W + '" y2="' + zeroY + '" stroke="currentColor" stroke-width="1" stroke-dasharray="4 4" opacity="0.35" vector-effect="non-scaling-stroke" />' +
          '<path d="' + areaPath + '" fill="currentColor" opacity="0.10" />' +
          '<polyline points="' + coords.join(' ') + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />' +
          dots +
        '</svg>' +
      '</div>' +
      '<div class="flex items-center justify-between font-metric-sm text-metric-sm text-secondary mt-1">' +
        '<span>' + formatIsoDateTime(new Date(points[0].t).toISOString()) + '</span>' +
        '<span>Peak ' + formatSignedMoney(peakCum) + ' · Trough ' + formatSignedMoney(troughCum) + '</span>' +
        '<span>' + formatIsoDateTime(new Date(points[points.length - 1].t).toISOString()) + '</span>' +
      '</div>'
    );
  }

  // Outlier positions tend to be the most instructive ones to document, so
  // the biggest absolute results that aren't case studies yet get surfaced.
  function reviewCandidates(positions) {
    return positions
      .filter(function (p) { return !p.linkedTradeId && p.pnl !== 0; })
      .sort(function (a, b) { return Math.abs(b.pnl) - Math.abs(a.pnl); })
      .slice(0, 5);
  }

  function renderPositionHistory() {
    var section = sections['position-history'];
    if (!section) return;

    var all = PositionStore.getAll();
    var emptyState = section.querySelector('#ph-empty-state');
    var content = section.querySelector('#ph-content');
    if (emptyState) emptyState.hidden = all.length > 0;
    if (content) content.hidden = all.length === 0;
    if (!all.length) return;

    var visible = sortPositions(filteredPositions());
    var stats = computePositionStats(all);

    var pnlEl = section.querySelector('#ph-kpi-pnl');
    pnlEl.textContent = formatSignedMoney(stats.totalPnl);
    pnlEl.className = 'text-metric-display font-metric-display ' + (stats.totalPnl >= 0 ? 'text-tertiary' : 'text-error');

    section.querySelector('#ph-kpi-fees').textContent = formatMoney(stats.totalFees);
    section.querySelector('#ph-kpi-fees-sub').textContent = stats.totalPnl !== 0
      ? (Math.abs(stats.totalFees / stats.totalPnl) * 100).toFixed(0) + '% of gross P&L'
      : 'paid to exchange';

    var netEl = section.querySelector('#ph-kpi-net');
    netEl.textContent = formatSignedMoney(stats.netPnl);
    netEl.className = 'text-metric-display font-metric-display ' + (stats.netPnl >= 0 ? 'text-tertiary' : 'text-error');

    section.querySelector('#ph-kpi-winrate').textContent = stats.winRate.toFixed(1) + '%';
    section.querySelector('#ph-kpi-winrate-sub').textContent = stats.wins + ' wins, ' + stats.losses + ' losses';
    section.querySelector('#ph-kpi-count').textContent = stats.count;
    var promoted = all.filter(function (p) { return p.linkedTradeId; }).length;
    section.querySelector('#ph-kpi-count-sub').textContent = promoted + ' promoted to case studies';

    var equityItems = all.filter(function (p) { return p.closeTime; }).map(function (p) {
      return { t: Date.parse(p.closeTime), amount: positionNet(p), label: p.pair };
    });
    section.querySelector('#ph-equity-chart').innerHTML =
      equityCurveHtml(equityItems, 'Import at least two closed positions to plot an equity curve.');
    var equitySummary = section.querySelector('#ph-equity-summary');
    if (equitySummary) equitySummary.textContent = 'Ending net ' + formatSignedMoney(stats.netPnl);

    var reviewCard = section.querySelector('#ph-review-card');
    var reviewList = section.querySelector('#ph-review-list');
    var candidates = reviewCandidates(all);
    if (reviewCard && reviewList) {
      reviewCard.hidden = candidates.length === 0;
      reviewList.innerHTML = candidates.map(function (p) {
        var tone = p.pnl >= 0 ? 'text-tertiary' : 'text-error';
        return '<button type="button" class="ph-promote-btn inline-flex items-center gap-2 bg-surface-container-lowest hover:bg-surface-container px-3 py-1.5 rounded-lg shadow-sm transition-colors" data-position-id="' + escapeHtml(p.id) + '">' +
          '<span class="font-metric-sm text-metric-sm font-bold text-on-surface">' + escapeHtml(p.pair) + '</span>' +
          '<span class="font-metric-sm text-metric-sm font-semibold ' + tone + '">' + formatSignedMoney(p.pnl) + '</span>' +
          '<span class="material-symbols-outlined text-[14px] text-secondary">add_circle</span>' +
        '</button>';
      }).join('');
    }

    var totalPages = Math.max(1, Math.ceil(visible.length / PH_PAGE_SIZE));
    if (phState.page > totalPages) phState.page = totalPages;
    if (phState.page < 1) phState.page = 1;
    var pageStart = (phState.page - 1) * PH_PAGE_SIZE;
    var pageItems = visible.slice(pageStart, pageStart + PH_PAGE_SIZE);

    var body = section.querySelector('#ph-body');
    body.innerHTML = pageItems.length
      ? pageItems.map(positionRowHtml).join('')
      : '<tr><td class="px-5 py-8 text-center font-body-sm text-body-sm text-secondary" colspan="10">No positions match these filters.</td></tr>';
    section.querySelector('#ph-visible-count').textContent = visible.length;

    var pageSummaryEl = section.querySelector('#ph-page-summary');
    if (pageSummaryEl) {
      pageSummaryEl.textContent = visible.length
        ? 'Showing ' + (pageStart + 1) + '–' + Math.min(pageStart + PH_PAGE_SIZE, visible.length) + ' of ' + visible.length
        : 'Showing 0 of 0';
    }
    var pageIndicatorEl = section.querySelector('#ph-page-indicator');
    if (pageIndicatorEl) pageIndicatorEl.textContent = 'Page ' + phState.page + ' of ' + totalPages;
    var prevBtn = section.querySelector('#ph-page-prev');
    var nextBtn = section.querySelector('#ph-page-next');
    if (prevBtn) prevBtn.disabled = phState.page <= 1;
    if (nextBtn) nextBtn.disabled = phState.page >= totalPages;

    syncPositionSelectionUi();

    var pairBody = section.querySelector('#ph-pair-body');
    var pairRows = sortPairBreakdown(computePairBreakdown(visible.map(function (p) {
      return { pair: p.pair, net: positionNet(p), hasPnl: true, isWin: p.pnl > 0, isLoss: p.pnl < 0 };
    })), phState);
    pairBody.innerHTML = pairRows.length
      ? pairRows.map(pairBreakdownRowHtml).join('')
      : '<tr><td class="px-5 py-8 text-center font-body-sm text-body-sm text-secondary" colspan="4">No positions match these filters.</td></tr>';

    updatePositionSortIndicators(section);
  }

  function updatePositionSortIndicators(section) {
    updateSortIndicators(section, '.ph-sort-th', 'data-ph-sort', phState.sortKey, phState.sortDir);
    updateSortIndicators(section, '.ph-pair-sort-th', 'data-ph-pair-sort', phState.pairSortKey, phState.pairSortDir);
    var sortSelect = section.querySelector('#ph-sort-select');
    if (sortSelect) sortSelect.value = positionSortSelectValue();
  }

  function showPositionImportBanner(result) {
    var banner = document.getElementById('ph-import-banner');
    var textEl = document.getElementById('ph-import-text');
    if (!banner || !textEl) return;
    var text = 'Imported ' + result.imported + ' new position' + (result.imported === 1 ? '' : 's') +
      ', skipped ' + result.skipped + ' already on file.';
    if (result.ignored) {
      text += ' (' + result.ignored + ' row' + (result.ignored === 1 ? '' : 's') + ' ignored, not fully closed.)';
    }
    textEl.textContent = text;
    banner.hidden = false;
  }

  function initPositionHistory(section) {
    if (!section) return;

    var importBtn = section.querySelector('#btn-import-positions');
    var fileInput = section.querySelector('#position-import-file-input');
    if (importBtn && fileInput) {
      importBtn.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function (e) {
        var file = e.target.files[0];
        fileInput.value = '';
        if (!file) return;
        if (typeof XLSX === 'undefined') {
          window.alert('The .xlsx import library failed to load, so this file can\'t be read.');
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var result;
          try {
            var workbook = XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: true });
            var parsed = parseMexcWorkbook(workbook);
            if (parsed.error) {
              window.alert('Could not import this file: ' + parsed.error);
              return;
            }
            if (!parsed.rows.length) {
              window.alert('No position rows found in this file.');
              return;
            }
            result = importPositionRows(parsed.rows);
          } catch (err) {
            window.alert('Could not read this file. Make sure it is a MEXC Position History .xlsx export.');
            return;
          }
          showPositionImportBanner(result);
          renderPositionHistory();
          renderInsightsDashboard();
        };
        reader.onerror = function () { window.alert('Could not read this file.'); };
        reader.readAsArrayBuffer(file);
      });
    }

    var dismissBtn = section.querySelector('#ph-import-dismiss');
    var banner = section.querySelector('#ph-import-banner');
    if (dismissBtn && banner) {
      dismissBtn.addEventListener('click', function () { banner.hidden = true; });
    }

    // Any filter change drops the selection - the rows it referred to may no
    // longer be on screen.
    function applyFilterChange(mutate) {
      mutate();
      phState.page = 1;
      clearSelection(phSelection);
      renderPositionHistory();
    }

    var searchInput = section.querySelector('#ph-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        applyFilterChange(function () { phState.search = searchInput.value; });
      });
    }
    var directionSelect = section.querySelector('#ph-filter-direction');
    if (directionSelect) {
      directionSelect.addEventListener('change', function () {
        applyFilterChange(function () { phState.direction = directionSelect.value; });
      });
    }
    var outcomeSelect = section.querySelector('#ph-filter-outcome');
    if (outcomeSelect) {
      outcomeSelect.addEventListener('change', function () {
        applyFilterChange(function () { phState.outcome = outcomeSelect.value; });
      });
    }
    var fromInput = section.querySelector('#ph-filter-from');
    var toInput = section.querySelector('#ph-filter-to');
    if (fromInput) {
      fromInput.addEventListener('change', function () {
        applyFilterChange(function () { phState.from = fromInput.value; });
      });
    }
    if (toInput) {
      toInput.addEventListener('change', function () {
        applyFilterChange(function () { phState.to = toInput.value; });
      });
    }

    section.addEventListener('change', function (e) {
      var rowCheck = e.target.closest('.ph-row-check');
      if (rowCheck) {
        var id = rowCheck.getAttribute('data-select-id');
        if (rowCheck.checked) phSelection[id] = true;
        else delete phSelection[id];
        syncPositionSelectionUi();
        return;
      }
      if (e.target.id === 'ph-select-all') {
        var checked = e.target.checked;
        visiblePositionIds().forEach(function (id) {
          if (checked) phSelection[id] = true;
          else delete phSelection[id];
        });
        section.querySelectorAll('.ph-row-check').forEach(function (box) {
          box.checked = !!phSelection[box.getAttribute('data-select-id')];
        });
        syncPositionSelectionUi();
      }
    });

    var phBulkDelete = document.getElementById('ph-bulk-delete');
    if (phBulkDelete) phBulkDelete.addEventListener('click', bulkDeletePositions);
    var phBulkCancel = document.getElementById('ph-bulk-cancel');
    if (phBulkCancel) {
      phBulkCancel.addEventListener('click', function () {
        clearSelection(phSelection);
        section.querySelectorAll('.ph-row-check').forEach(function (box) { box.checked = false; });
        syncPositionSelectionUi();
      });
    }

    var phSortSelect = section.querySelector('#ph-sort-select');
    if (phSortSelect) {
      phSortSelect.addEventListener('change', function () {
        applyPositionSortSelectValue(phSortSelect.value);
        phState.page = 1;
        renderPositionHistory();
      });
    }

    var clearBtn = section.querySelector('#ph-filter-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        clearSelection(phSelection);
        phState.search = ''; phState.direction = 'all'; phState.outcome = 'all'; phState.from = ''; phState.to = '';
        phState.page = 1;
        if (searchInput) searchInput.value = '';
        if (directionSelect) directionSelect.value = 'all';
        if (outcomeSelect) outcomeSelect.value = 'all';
        if (fromInput) fromInput.value = '';
        if (toInput) toInput.value = '';
        renderPositionHistory();
      });
    }

    section.addEventListener('click', function (e) {
      var sortTh = e.target.closest('.ph-sort-th');
      if (sortTh) {
        var key = sortTh.getAttribute('data-ph-sort');
        if (phState.sortKey === key) {
          phState.sortDir = phState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          phState.sortKey = key;
          phState.sortDir = key === 'pair' ? 'asc' : 'desc';
        }
        phState.page = 1;
        renderPositionHistory();
        return;
      }
      var pairTh = e.target.closest('.ph-pair-sort-th');
      if (pairTh) {
        var pairKey = pairTh.getAttribute('data-ph-pair-sort');
        if (phState.pairSortKey === pairKey) {
          phState.pairSortDir = phState.pairSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          phState.pairSortKey = pairKey;
          phState.pairSortDir = pairKey === 'pair' ? 'asc' : 'desc';
        }
        renderPositionHistory();
        return;
      }
      var promoteBtn = e.target.closest('.ph-promote-btn');
      if (promoteBtn) {
        var id = promoteBtn.getAttribute('data-position-id');
        if (id) window.AppRouter.navigate('new-trade-entry', 'promote:' + id);
      }
    });

    var pagePrevBtn = section.querySelector('#ph-page-prev');
    var pageNextBtn = section.querySelector('#ph-page-next');
    if (pagePrevBtn) {
      pagePrevBtn.addEventListener('click', function () {
        phState.page--;
        renderPositionHistory();
      });
    }
    if (pageNextBtn) {
      pageNextBtn.addEventListener('click', function () {
        phState.page++;
        renderPositionHistory();
      });
    }
  }

  function downloadFile(filename, content, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function initDataExportImport() {
    var exportBtn = document.getElementById('btn-export-data');
    var importBtn = document.getElementById('btn-import-data');
    var importInput = document.getElementById('import-file-input');

    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        var trades = TradeStore.getAll();
        var json = JSON.stringify(trades, null, 2);
        var date = new Date().toISOString().slice(0, 10);
        downloadFile('trade-journal-backup-' + date + '.json', json, 'application/json');
      });
    }

    if (importBtn && importInput) {
      importBtn.addEventListener('click', function () { importInput.click(); });

      importInput.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function () {
          var parsed;
          try {
            parsed = JSON.parse(reader.result);
          } catch (err) {
            window.alert('That file is not valid JSON.');
            importInput.value = '';
            return;
          }
          if (!Array.isArray(parsed)) {
            window.alert('Expected a JSON array of trades, like the one Export Data produces.');
            importInput.value = '';
            return;
          }
          var count = parsed.length;
          var confirmed = window.confirm(
            'Import ' + count + ' trade' + (count === 1 ? '' : 's') + '? This replaces everything currently in your journal.'
          );
          if (confirmed) {
            if (TradeStore.setAll(parsed)) {
              renderTradeJournal();
              window.alert('Imported ' + count + ' trade' + (count === 1 ? '' : 's') + '.');
            } else {
              window.alert('Could not import — local storage is full or unavailable.');
            }
          }
          importInput.value = '';
        };
        reader.readAsText(file);
      });
    }
  }

  // ---------------------------------------------------------------------
  // Confluence Matrix screen
  // ---------------------------------------------------------------------

  function nonEmptyConfluence(trade) {
    if (Array.isArray(trade.parameters)) return trade.parameters.map(function (v) { return (v || '').trim(); }).filter(Boolean);
    return (trade.confluence || []).map(function (v) { return (v || '').trim(); }).filter(Boolean);
  }

  function averageConfluenceCount() {
    var trades = TradeStore.getAll();
    if (!trades.length) return 0;
    var total = trades.reduce(function (sum, t) { return sum + nonEmptyConfluence(t).length; }, 0);
    return total / trades.length;
  }

  function pct(wins, total) {
    return total > 0 ? Math.round((wins / total) * 100) : 0;
  }

  function rateColors(rate) {
    if (rate >= 80) return { bar: 'bg-tertiary-container', text: 'text-tertiary', pill: 'text-tertiary bg-tertiary-fixed/30' };
    if (rate >= 50) return { bar: 'bg-secondary', text: 'text-on-secondary-fixed-variant', pill: 'text-on-secondary-fixed-variant bg-secondary-fixed/40' };
    return { bar: 'bg-error', text: 'text-error', pill: 'text-error bg-error-container/60' };
  }

  function isBareNumber(label) {
    return /^[\d.]+%?$/.test(label.trim());
  }

  function categorizeParam(label) {
    var l = label.toLowerCase();
    if (l.indexOf('rsi') !== -1 || l.indexOf('volume') !== -1) return 'momentum';
    if (l.indexOf('fib') !== -1 || l.indexOf('%') !== -1 || l.indexOf(' ls') !== -1 || l.indexOf('range') !== -1) return 'retracement';
    return 'trend';
  }

  function computeConfluenceStats(trades) {
    var closed = trades.filter(function (t) { return t.outcome === 'win' || t.outcome === 'loss'; });

    // Base stack: the most common two-parameter combination among closed
    // trades. The grouping key is sorted (order-independent) so the same
    // parameters picked in a different order on the multi-select still
    // match exactly, per the "group on exact matches" requirement.
    // TODO: this still only compares a fixed pair of parameters rather than
    // mining frequent combinations of any size across the full
    // variable-length parameter set - revisit if "notable stacks" needs to
    // surface larger recurring combos than a pair.
    var baseGroups = {};
    closed.forEach(function (t) {
      var c = nonEmptyConfluence(t).slice().sort();
      if (c.length < 2) return;
      var key = c[0] + ' + ' + c[1];
      baseGroups[key] = baseGroups[key] || { label: key, trades: [] };
      baseGroups[key].trades.push(t);
    });
    var baseStack = null;
    Object.keys(baseGroups).forEach(function (key) {
      if (!baseStack || baseGroups[key].trades.length > baseStack.trades.length) baseStack = baseGroups[key];
    });
    var baseGroup = baseStack ? baseStack.trades : [];
    var baseWins = baseGroup.filter(function (t) { return t.outcome === 'win'; }).length;

    // Notable stacks: parameters beyond the base pair that recur (2+ times) within the base group.
    var extraCounts = {};
    baseGroup.forEach(function (t) {
      nonEmptyConfluence(t).slice().sort().slice(2).filter(function (v) { return !isBareNumber(v); }).forEach(function (val) {
        extraCounts[val] = extraCounts[val] || { label: val, wins: 0, total: 0 };
        extraCounts[val].total++;
        if (t.outcome === 'win') extraCounts[val].wins++;
      });
    });
    var notableStacks = Object.keys(extraCounts)
      .map(function (k) { return extraCounts[k]; })
      .filter(function (s) { return s.total >= 2; })
      .sort(function (a, b) { return b.total - a.total; })
      .slice(0, 5);

    // Loss profile: a losing trade outside the dominant base stack, described by its own setup.
    var lossOutsideBase = closed.filter(function (t) { return t.outcome === 'loss' && baseGroup.indexOf(t) === -1; });
    var lossProfile = null;
    if (lossOutsideBase.length) {
      var c = nonEmptyConfluence(lossOutsideBase[0]).slice().sort();
      lossProfile = {
        label: (c[0] || 'Unlabeled setup') + ' + ' + (c[2] || c[1] || 'setup') + ' (loss profile)',
        wins: 0,
        total: lossOutsideBase.length
      };
    }

    // Filled slots vs win rate.
    var bucketMap = {};
    closed.forEach(function (t) {
      var filled = nonEmptyConfluence(t).length;
      bucketMap[filled] = bucketMap[filled] || { filled: filled, wins: 0, total: 0 };
      bucketMap[filled].total++;
      if (t.outcome === 'win') bucketMap[filled].wins++;
    });
    var buckets = Object.keys(bucketMap)
      .map(function (k) { return bucketMap[k]; })
      .sort(function (a, b) { return a.filled - b.filled; });

    var highConfl = closed.filter(function (t) { return nonEmptyConfluence(t).length >= 6; });
    var highConflWins = highConfl.filter(function (t) { return t.outcome === 'win'; }).length;

    // Individual parameter win rate, across every closed trade.
    var paramCounts = {};
    closed.forEach(function (t) {
      nonEmptyConfluence(t).filter(function (v) { return !isBareNumber(v); }).forEach(function (val) {
        paramCounts[val] = paramCounts[val] || { label: val, wins: 0, total: 0 };
        paramCounts[val].total++;
        if (t.outcome === 'win') paramCounts[val].wins++;
      });
    });
    var byCategory = { trend: [], retracement: [], momentum: [] };
    Object.keys(paramCounts).forEach(function (k) {
      byCategory[categorizeParam(k)].push(paramCounts[k]);
    });
    Object.keys(byCategory).forEach(function (cat) {
      byCategory[cat].sort(function (a, b) { return b.total - a.total; });
      byCategory[cat] = byCategory[cat].slice(0, 3);
    });

    return {
      totalTrades: trades.length,
      closedCount: closed.length,
      wins: closed.filter(function (t) { return t.outcome === 'win'; }).length,
      losses: closed.filter(function (t) { return t.outcome === 'loss'; }).length,
      baseStack: baseStack,
      baseWins: baseWins,
      notableStacks: notableStacks,
      lossProfile: lossProfile,
      buckets: buckets,
      highConflWins: highConflWins,
      highConflTotal: highConfl.length,
      byCategory: byCategory
    };
  }

  function notableStackRowHtml(stack, isLossRow) {
    var rate = pct(stack.wins, stack.total);
    var colors = rateColors(rate);
    var dotColor = isLossRow ? 'bg-error' : 'bg-primary';
    var rowClass = isLossRow ? 'bg-error-container/20 rounded-lg group' : 'hover:bg-surface-container-low transition-colors group';
    var label = (isLossRow ? '' : '+ ') + escapeHtml(stack.label);
    return (
      '<tr class="' + rowClass + '">' +
        '<td class="py-3 px-3' + (isLossRow ? ' rounded-l-lg' : '') + '"><div class="flex items-center gap-2">' +
          '<span class="w-1.5 h-1.5 rounded-full ' + dotColor + '"></span>' +
          '<span class="font-body-md text-body-md font-medium text-on-surface">' + label + '</span>' +
        '</div></td>' +
        '<td class="py-3 px-3 text-center font-metric-md text-metric-md text-secondary">' + stack.total + ' trade' + (stack.total === 1 ? '' : 's') + '</td>' +
        '<td class="py-3 px-3 text-right' + (isLossRow ? ' rounded-r-lg' : '') + '"><span class="font-metric-md text-metric-md font-semibold ' + colors.pill + ' px-2 py-0.5 rounded-full">' + stack.wins + '/' + stack.total + ' (' + rate + '%)</span></td>' +
      '</tr>'
    );
  }

  function bucketRowHtml(bucket) {
    var rate = pct(bucket.wins, bucket.total);
    var colors = rateColors(rate);
    return (
      '<div class="flex flex-col gap-1.5">' +
        '<div class="flex justify-between items-baseline font-body-sm text-body-sm">' +
          '<span class="font-medium text-on-surface">' + bucket.filled + ' parameter' + (bucket.filled === 1 ? '' : 's') + '</span>' +
          '<span class="font-metric-sm text-metric-sm font-semibold ' + colors.text + '">' + bucket.wins + '/' + bucket.total + ' (' + rate + '%)</span>' +
        '</div>' +
        '<div class="h-2 w-full bg-surface-container-low rounded-full overflow-hidden">' +
          '<div class="h-full ' + colors.bar + ' rounded-full" style="width: ' + rate + '%"></div>' +
        '</div>' +
      '</div>'
    );
  }

  function paramRowHtml(param) {
    var rate = pct(param.wins, param.total);
    var colors = rateColors(rate);
    return (
      '<div class="flex flex-col gap-1">' +
        '<div class="flex justify-between items-center text-body-sm font-body-sm">' +
          '<span class="text-on-surface font-medium">' + escapeHtml(param.label) + '</span>' +
          '<span class="font-metric-sm text-metric-sm font-semibold ' + colors.text + '">' + param.wins + '/' + param.total + ' (' + rate + '%)</span>' +
        '</div>' +
        '<div class="h-2 w-full bg-surface-container rounded-full overflow-hidden">' +
          '<div class="h-full ' + colors.bar + ' rounded-full" style="width: ' + rate + '%"></div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderKeyFindings(stats) {
    var findings = [];

    if (stats.baseStack) {
      findings.push('<span class="font-semibold">Best validated base stack:</span> ' + escapeHtml(stats.baseStack.label) + ', ' + stats.baseWins + ' wins from ' + stats.baseStack.trades.length + ' trades.');
    } else {
      findings.push('<span class="font-semibold">Best validated base stack:</span> not enough closed trades yet to identify one.');
    }

    if (stats.notableStacks.length) {
      var top = stats.notableStacks[0];
      findings.push('<span class="font-semibold">Notable synergy:</span> adding ' + escapeHtml(top.label) + ' held a ' + pct(top.wins, top.total) + '% win rate across ' + top.total + ' trades.');
    } else {
      findings.push('<span class="font-semibold">Notable synergy:</span> no recurring add-on parameters yet, log more trades to surface one.');
    }

    findings.push('<span class="font-semibold">High-confluence cluster:</span> setups with 6+ filled parameter slots are ' + stats.highConflWins + '/' + stats.highConflTotal + ' (' + pct(stats.highConflWins, stats.highConflTotal) + '%).');

    var worst = stats.buckets.slice().sort(function (a, b) { return pct(a.wins, a.total) - pct(b.wins, b.total); })[0];
    if (worst) {
      findings.push('<span class="font-semibold">Weakest bucket:</span> ' + worst.filled + '-parameter setups are the softest so far at ' + worst.wins + '/' + worst.total + ' (' + pct(worst.wins, worst.total) + '%).');
    } else {
      findings.push('<span class="font-semibold">Weakest bucket:</span> not enough closed trades yet to tell.');
    }

    findings.push('<span class="font-semibold">Sample size caveat:</span> every result here is preliminary, the journal holds ' + stats.totalTrades + ' trade' + (stats.totalTrades === 1 ? '' : 's') + ' (' + stats.closedCount + ' closed) and no monetary P&amp;L yet.');

    return findings.map(function (html, i) {
      return (
        '<div class="flex items-start gap-3 py-1">' +
          '<div class="w-5 h-5 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center font-metric-sm text-metric-sm font-bold shrink-0 mt-0.5">' + (i + 1) + '</div>' +
          '<p class="font-body-md text-body-md text-on-surface">' + html + '</p>' +
        '</div>'
      );
    }).join('');
  }

  function renderConfluenceMatrix() {
    var section = sections['confluence-matrix'];
    if (!section) return;
    var trades = TradeStore.getAll();
    var stats = computeConfluenceStats(trades);

    var cohortEl = section.querySelector('#cm-cohort-count');
    if (cohortEl) cohortEl.textContent = stats.totalTrades + ' Logged Execution' + (stats.totalTrades === 1 ? '' : 's') + ' (100% Retrospective)';

    var labelEl = section.querySelector('#cm-best-stack-label');
    var tradesEl = section.querySelector('#cm-best-stack-trades');
    var rateEl = section.querySelector('#cm-best-stack-rate');
    if (stats.baseStack) {
      if (labelEl) labelEl.textContent = stats.baseStack.label;
      if (tradesEl) tradesEl.textContent = stats.baseWins + '/' + stats.baseStack.trades.length;
      if (rateEl) rateEl.textContent = pct(stats.baseWins, stats.baseStack.trades.length) + '%';
    } else {
      if (labelEl) labelEl.textContent = 'Not enough closed trades yet';
      if (tradesEl) tradesEl.textContent = '0/0';
      if (rateEl) rateEl.textContent = '—';
    }

    var notableBody = section.querySelector('#cm-notable-stacks-body');
    if (notableBody) {
      var rowsHtml = stats.notableStacks.map(function (s) { return notableStackRowHtml(s, false); }).join('');
      if (stats.lossProfile) rowsHtml += notableStackRowHtml(stats.lossProfile, true);
      notableBody.innerHTML = rowsHtml || '<tr><td class="py-3 px-3 text-secondary font-body-sm text-body-sm" colspan="3">Not enough closed trades yet to surface a stack.</td></tr>';
    }

    var captionEl = section.querySelector('#cm-sample-caption');
    if (captionEl) {
      captionEl.textContent = 'Base sample isolated from ' + stats.wins + ' winning setup' + (stats.wins === 1 ? '' : 's') + ' + ' + stats.losses + ' controlled loss' + (stats.losses === 1 ? '' : 'es');
    }

    var filledSlotsEl = section.querySelector('#cm-filled-slots-body');
    if (filledSlotsEl) {
      filledSlotsEl.innerHTML = stats.buckets.length
        ? stats.buckets.map(bucketRowHtml).join('')
        : '<span class="font-metric-sm text-metric-sm text-secondary">Not enough closed trades yet.</span>';
    }

    var highEl = section.querySelector('#cm-high-confl-value');
    var highBar = section.querySelector('#cm-high-confl-bar');
    var highRate = pct(stats.highConflWins, stats.highConflTotal);
    if (highEl) highEl.textContent = stats.highConflWins + '/' + stats.highConflTotal + ' (' + highRate + '%)';
    if (highBar) highBar.style.width = highRate + '%';

    ['trend', 'retracement', 'momentum'].forEach(function (cat) {
      var el = section.querySelector('#cm-param-col-' + cat);
      if (!el) return;
      var rows = stats.byCategory[cat];
      el.innerHTML = rows.length ? rows.map(paramRowHtml).join('') : '<span class="font-metric-sm text-metric-sm text-secondary">No data yet.</span>';
    });

    var findingsEl = section.querySelector('#cm-key-findings');
    if (findingsEl) findingsEl.innerHTML = renderKeyFindings(stats);
  }

  // ---------------------------------------------------------------------
  // Timing & Heatmap screen
  // ---------------------------------------------------------------------

  var WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var WEEKDAY_ABBR = { Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED', Thursday: 'THU', Friday: 'FRI', Saturday: 'SAT', Sunday: 'SUN' };

  // ---------------------------------------------------------------------
  // Entry-time timezone handling
  // ---------------------------------------------------------------------
  //
  // Trade entry times are logged as a plain "HH:mm" wall-clock value with no
  // timezone attached. To classify them into UTC trading sessions we need to
  // know what timezone that wall-clock value is in - since that's specific
  // to the person logging trades (and can change, e.g. after moving or
  // travelling), it's a user-editable setting rather than a hardcoded
  // assumption, stored alongside the trades in localStorage.

  var ENTRY_TZ_STORAGE_KEY = 'tj_entry_tz_offset_minutes';
  var MIN_SESSION_TRADES_FOR_HOUR_CHART = 5;

  var SESSIONS = [
    { key: 'asia', name: 'Asia', start: 0, end: 8 },
    { key: 'london', name: 'London', start: 7, end: 16 },
    { key: 'newyork', name: 'New York', start: 13, end: 22 }
  ];

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function buildTzOffsetOptions() {
    var options = [];
    for (var m = -720; m <= 840; m += 30) options.push(m);
    return options;
  }

  function formatTzOffsetLabel(minutes) {
    var sign = minutes < 0 ? '-' : '+';
    var abs = Math.abs(minutes);
    return 'UTC' + sign + pad2(Math.floor(abs / 60)) + ':' + pad2(abs % 60);
  }

  function defaultEntryTzOffsetMinutes() {
    // Date.prototype.getTimezoneOffset() returns UTC-minus-local in minutes,
    // so the browser's own "UTC+/-HH:MM" offset is the negation of that.
    var browserOffset = -new Date().getTimezoneOffset();
    return Math.round(browserOffset / 30) * 30;
  }

  function getEntryTzOffsetMinutes() {
    try {
      var raw = localStorage.getItem(ENTRY_TZ_STORAGE_KEY);
      if (raw !== null && raw !== '') return parseInt(raw, 10);
    } catch (e) {}
    return defaultEntryTzOffsetMinutes();
  }

  function setEntryTzOffsetMinutes(minutes) {
    try { localStorage.setItem(ENTRY_TZ_STORAGE_KEY, String(minutes)); } catch (e) {}
  }

  // Converts a trade's logged "HH:mm" wall-clock entry time to minutes-since-
  // UTC-midnight, using the given UTC offset (e.g. -300 for UTC-05:00).
  function entryTimeToUtcMinutes(timeStr, offsetMinutes) {
    var parts = (timeStr || '').split(':');
    if (parts.length !== 2) return null;
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    var total = h * 60 + m - offsetMinutes;
    return ((total % 1440) + 1440) % 1440;
  }

  function shortContext(field) {
    return (field || '').replace(/^Daily\s+/i, '').split(' & ')[0];
  }

  function summarizeCombo(trade) {
    var c = nonEmptyConfluence(trade);
    var parts = [shortContext(c[0]), c[1]].filter(Boolean);
    if (c[2]) parts.push(c[2].replace(/^4H\s+/, ''));
    return parts.join(' + ');
  }

  function mostCommon(values) {
    var counts = {};
    var best = null;
    values.forEach(function (v) {
      counts[v] = (counts[v] || 0) + 1;
      if (!best || counts[v] > counts[best]) best = v;
    });
    return best;
  }

  // Session/hour-of-day breakdown, derived from each closed trade's logged
  // entry time (optional - trades without one are simply excluded rather
  // than erroring or being counted as hour 0).
  // MEXC-imported trades' entryTime is already converted to true UTC at
  // import time (the exchange's own UTC+08:00 column is known exactly), so
  // it must not be re-shifted by the user's manual-entry timezone setting -
  // only manually-logged local wall-clock times go through that offset.
  function entryUtcMinutesForTrade(trade, manualOffsetMinutes) {
    var effectiveOffset = trade.source === 'mexc-import' ? 0 : manualOffsetMinutes;
    return entryTimeToUtcMinutes(trade.entryTime, effectiveOffset);
  }

  function computeSessionStats(trades) {
    var offsetMinutes = getEntryTzOffsetMinutes();
    var closedWithTime = trades.filter(function (t) {
      return (t.outcome === 'win' || t.outcome === 'loss') && entryUtcMinutesForTrade(t, offsetMinutes) !== null;
    });

    var perHour = [];
    for (var h = 0; h < 24; h++) perHour.push({ hour: h, wins: 0, losses: 0, total: 0 });

    var bySession = {};
    SESSIONS.forEach(function (s) { bySession[s.key] = { name: s.name, wins: 0, losses: 0, total: 0 }; });

    closedWithTime.forEach(function (t) {
      var utcMinutes = entryUtcMinutesForTrade(t, offsetMinutes);
      var hour = Math.floor(utcMinutes / 60);
      var bucket = perHour[hour];
      bucket.total++;
      if (t.outcome === 'win') bucket.wins++; else bucket.losses++;

      SESSIONS.forEach(function (s) {
        if (hour >= s.start && hour < s.end) {
          var sb = bySession[s.key];
          sb.total++;
          if (t.outcome === 'win') sb.wins++; else sb.losses++;
        }
      });
    });

    var sessions = SESSIONS.map(function (s) {
      var sb = bySession[s.key];
      return { name: s.name, total: sb.total, wins: sb.wins, losses: sb.losses, rate: pct(sb.wins, sb.total) };
    });

    return { loggedCount: closedWithTime.length, perHour: perHour, sessions: sessions };
  }

  // Mirrors dayCellHtml's tinted-tile treatment (green all-win / amber mixed
  // / red all-loss / gray no-trades) so the session tiles read as the same
  // visual family as the day-of-week heatmap above them.
  function sessionCellHtml(s) {
    if (s.total === 0) {
      return (
        '<div class="group relative rounded-lg bg-surface-container p-4 text-center flex flex-col justify-between h-32 opacity-75 transition-all duration-200">' +
          '<div class="flex items-center justify-between">' +
            '<span class="font-label-eyebrow text-label-eyebrow text-secondary font-medium">' + escapeHtml(s.name) + '</span>' +
            '<span class="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>' +
          '</div>' +
          '<div class="my-auto"><span class="font-metric-display text-metric-display text-secondary/40 font-bold block leading-none">—</span></div>' +
          '<div class="font-metric-sm text-metric-sm text-secondary/70 font-medium">no trades</div>' +
        '</div>'
      );
    }
    if (s.wins > 0 && s.losses > 0) {
      return (
        '<div class="group relative rounded-lg bg-secondary-fixed p-4 text-center flex flex-col justify-between h-32 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer">' +
          '<div class="flex items-center justify-between">' +
            '<span class="font-label-eyebrow text-label-eyebrow text-on-secondary-fixed font-bold">' + escapeHtml(s.name) + '</span>' +
            '<span class="w-2 h-2 rounded-full bg-error"></span>' +
          '</div>' +
          '<div class="my-auto"><span class="font-metric-display text-metric-display text-on-surface font-bold block leading-none">' + s.rate + '%</span></div>' +
          '<div class="font-metric-sm text-metric-sm text-on-secondary-fixed-variant font-medium">' + s.total + ' trade' + (s.total === 1 ? '' : 's') + ' <span class="text-error font-semibold">(' + s.losses + ' loss' + (s.losses === 1 ? '' : 'es') + ')</span></div>' +
        '</div>'
      );
    }
    if (s.losses > 0) {
      return (
        '<div class="group relative rounded-lg bg-error-container/40 p-4 text-center flex flex-col justify-between h-32 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer">' +
          '<div class="flex items-center justify-between">' +
            '<span class="font-label-eyebrow text-label-eyebrow text-error font-bold">' + escapeHtml(s.name) + '</span>' +
            '<span class="w-2 h-2 rounded-full bg-error"></span>' +
          '</div>' +
          '<div class="my-auto"><span class="font-metric-display text-metric-display text-error font-bold block leading-none">0%</span></div>' +
          '<div class="font-metric-sm text-metric-sm text-error font-medium">' + s.total + ' trade' + (s.total === 1 ? '' : 's') + '</div>' +
        '</div>'
      );
    }
    return (
      '<div class="group relative rounded-lg bg-tertiary-fixed/40 p-4 text-center flex flex-col justify-between h-32 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer">' +
        '<div class="flex items-center justify-between">' +
          '<span class="font-label-eyebrow text-label-eyebrow text-on-tertiary-fixed font-bold">' + escapeHtml(s.name) + '</span>' +
          '<span class="w-2 h-2 rounded-full bg-tertiary-container"></span>' +
        '</div>' +
        '<div class="my-auto"><span class="font-metric-display text-metric-display text-tertiary font-bold block leading-none">100%</span></div>' +
        '<div class="font-metric-sm text-metric-sm text-on-tertiary-fixed-variant font-medium">' + s.total + ' trade' + (s.total === 1 ? '' : 's') + '</div>' +
      '</div>'
    );
  }

  function hourBarHtml(h, maxCount) {
    var hourLabel = pad2(h.hour);
    if (h.total === 0) {
      return (
        '<div class="flex-1 flex flex-col items-center gap-1" title="' + hourLabel + ':00 UTC — no trades">' +
          '<div class="w-full h-16 flex items-end"><div class="w-full h-1 bg-surface-container-high rounded-xs"></div></div>' +
          '<span class="font-metric-sm text-[9px] text-outline-variant">' + hourLabel + '</span>' +
        '</div>'
      );
    }
    var rate = pct(h.wins, h.total);
    var barColor = h.losses === 0 ? 'bg-tertiary' : (h.wins === 0 ? 'bg-error' : 'bg-secondary');
    var heightPct = Math.max(14, Math.round((h.total / maxCount) * 100));
    return (
      '<div class="flex-1 flex flex-col items-center gap-1" title="' + hourLabel + ':00 UTC — ' + h.total + ' trade' + (h.total === 1 ? '' : 's') + ', ' + rate + '% win">' +
        '<div class="w-full h-16 flex items-end"><div class="w-full ' + barColor + ' rounded-xs" style="height: ' + heightPct + '%"></div></div>' +
        '<span class="font-metric-sm text-[9px] text-secondary">' + hourLabel + '</span>' +
      '</div>'
    );
  }

  function computeWeekdayStats(trades) {
    var closed = trades.filter(function (t) { return t.outcome === 'win' || t.outcome === 'loss'; });
    var byDay = {};
    WEEKDAYS.forEach(function (d) { byDay[d] = { day: d, wins: 0, losses: 0, total: 0, trades: [] }; });

    closed.forEach(function (t) {
      var day = weekdayLabel(t.date);
      var bucket = byDay[day];
      if (!bucket) return;
      bucket.total++;
      bucket.trades.push(t);
      if (t.outcome === 'win') bucket.wins++; else bucket.losses++;
    });

    return WEEKDAYS.map(function (day) {
      var b = byDay[day];
      var rate = pct(b.wins, b.total);
      var dominantSetup = null;
      if (b.total > 0) {
        if (b.wins > 0 && b.losses > 0) {
          dominantSetup = 'Mixed, ' + mostCommon(b.trades.map(function (t) { return shortContext(nonEmptyConfluence(t)[0]); })) + ' context';
        } else {
          dominantSetup = mostCommon(b.trades.map(summarizeCombo));
        }
      }
      return { day: day, abbr: WEEKDAY_ABBR[day], total: b.total, wins: b.wins, losses: b.losses, rate: rate, dominantSetup: dominantSetup, trades: b.trades };
    });
  }

  function dayCellHtml(d) {
    if (d.total === 0) {
      return (
        '<div class="group relative rounded-lg bg-surface-container p-4 text-center flex flex-col justify-between h-32 opacity-75 transition-all duration-200">' +
          '<div class="flex items-center justify-between">' +
            '<span class="font-label-eyebrow text-label-eyebrow text-secondary font-medium">' + d.abbr + '</span>' +
            '<span class="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>' +
          '</div>' +
          '<div class="my-auto"><span class="font-metric-display text-metric-display text-secondary/40 font-bold block leading-none">—</span></div>' +
          '<div class="font-metric-sm text-metric-sm text-secondary/70 font-medium">no trades</div>' +
        '</div>'
      );
    }
    if (d.wins > 0 && d.losses > 0) {
      return (
        '<div class="group relative rounded-lg bg-secondary-fixed p-4 text-center flex flex-col justify-between h-32 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer">' +
          '<div class="flex items-center justify-between">' +
            '<span class="font-label-eyebrow text-label-eyebrow text-on-secondary-fixed font-bold">' + d.abbr + '</span>' +
            '<span class="w-2 h-2 rounded-full bg-error"></span>' +
          '</div>' +
          '<div class="my-auto"><span class="font-metric-display text-metric-display text-on-surface font-bold block leading-none">' + d.rate + '%</span></div>' +
          '<div class="font-metric-sm text-metric-sm text-on-secondary-fixed-variant font-medium">' + d.total + ' trade' + (d.total === 1 ? '' : 's') + ' <span class="text-error font-semibold">(' + d.losses + ' loss' + (d.losses === 1 ? '' : 'es') + ')</span></div>' +
        '</div>'
      );
    }
    if (d.losses > 0) {
      return (
        '<div class="group relative rounded-lg bg-error-container/40 p-4 text-center flex flex-col justify-between h-32 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer">' +
          '<div class="flex items-center justify-between">' +
            '<span class="font-label-eyebrow text-label-eyebrow text-error font-bold">' + d.abbr + '</span>' +
            '<span class="w-2 h-2 rounded-full bg-error"></span>' +
          '</div>' +
          '<div class="my-auto"><span class="font-metric-display text-metric-display text-error font-bold block leading-none">0%</span></div>' +
          '<div class="font-metric-sm text-metric-sm text-error font-medium">' + d.total + ' trade' + (d.total === 1 ? '' : 's') + '</div>' +
        '</div>'
      );
    }
    return (
      '<div class="group relative rounded-lg bg-tertiary-fixed/40 p-4 text-center flex flex-col justify-between h-32 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer">' +
        '<div class="flex items-center justify-between">' +
          '<span class="font-label-eyebrow text-label-eyebrow text-on-tertiary-fixed font-bold">' + d.abbr + '</span>' +
          '<span class="w-2 h-2 rounded-full bg-tertiary-container"></span>' +
        '</div>' +
        '<div class="my-auto"><span class="font-metric-display text-metric-display text-tertiary font-bold block leading-none">100%</span></div>' +
        '<div class="font-metric-sm text-metric-sm text-on-tertiary-fixed-variant font-medium">' + d.total + ' trade' + (d.total === 1 ? '' : 's') + '</div>' +
      '</div>'
    );
  }

  function detailRowHtml(d) {
    var dotColor = d.losses > 0 ? 'bg-error' : 'bg-tertiary-container';
    var rateColor = d.losses > 0 ? 'text-error' : 'text-tertiary-container';
    var pillClass = (d.wins > 0 && d.losses > 0) ? 'bg-secondary-fixed text-on-secondary-fixed' : 'bg-surface-container text-on-surface-variant';
    return (
      '<tr class="hover:bg-surface-container-low/50 transition-colors">' +
        '<td class="py-3 px-3 font-medium text-on-surface flex items-center gap-2"><span class="w-2 h-2 rounded-full ' + dotColor + '"></span>' + d.day + '</td>' +
        '<td class="py-3 px-3 font-metric-sm text-metric-sm text-on-surface-variant text-right">' + d.total + ' trade' + (d.total === 1 ? '' : 's') + '</td>' +
        '<td class="py-3 px-3 font-metric-md text-metric-md font-bold ' + rateColor + ' text-right">' + d.rate + '%</td>' +
        '<td class="py-3 px-3 text-secondary font-medium"><span class="px-2 py-0.5 rounded ' + pillClass + ' font-metric-sm text-metric-sm">' + escapeHtml(d.dominantSetup || '—') + '</span></td>' +
      '</tr>'
    );
  }

  function renderTimingHeatmap() {
    var section = sections['timing-and-heatmap'];
    if (!section) return;
    var trades = TradeStore.getAll();
    var stats = computeWeekdayStats(trades);
    var closed = trades.filter(function (t) { return t.outcome === 'win' || t.outcome === 'loss'; });
    var totalWins = closed.filter(function (t) { return t.outcome === 'win'; }).length;
    var totalLosses = closed.length - totalWins;

    var sampleEl = section.querySelector('#th-sample-population');
    if (sampleEl) sampleEl.textContent = trades.length + ' Logged Execution' + (trades.length === 1 ? '' : 's');

    var winRateEl = section.querySelector('#th-active-winrate');
    if (winRateEl) winRateEl.textContent = pct(totalWins, closed.length) + '% (' + totalWins + 'W / ' + totalLosses + 'L)';

    var gridEl = section.querySelector('#th-day-grid');
    if (gridEl) gridEl.innerHTML = stats.map(dayCellHtml).join('');

    var detailBody = section.querySelector('#th-detail-body');
    var daysWithTrades = stats.filter(function (d) { return d.total > 0; });
    if (detailBody) {
      detailBody.innerHTML = daysWithTrades.length
        ? daysWithTrades.map(detailRowHtml).join('')
        : '<tr><td class="py-3 px-3 text-secondary font-body-sm text-body-sm" colspan="4">No closed trades logged yet.</td></tr>';
    }

    var nEl = section.querySelector('#th-detail-n');
    if (nEl) nEl.textContent = 'N = ' + closed.length;

    // Best window: the longest run of consecutive 100%-win days (Mon -> Sun).
    var bestRun = [];
    var currentRun = [];
    stats.forEach(function (d) {
      if (d.total > 0 && d.rate === 100) {
        currentRun.push(d);
        if (currentRun.length > bestRun.length) bestRun = currentRun.slice();
      } else {
        currentRun = [];
      }
    });
    var windowLabelEl = section.querySelector('#th-best-window-label');
    var windowCopyEl = section.querySelector('#th-best-window-copy');
    var reliabilityEl = section.querySelector('#th-best-window-reliability');
    var sparklineEl = section.querySelector('#th-best-window-sparkline');
    if (bestRun.length) {
      var windowTrades = bestRun.reduce(function (sum, d) { return sum + d.total; }, 0);
      var label = bestRun.length === 1 ? bestRun[0].day : (bestRun[0].day + ' to ' + bestRun[bestRun.length - 1].day);
      if (windowLabelEl) windowLabelEl.textContent = label;
      if (windowCopyEl) {
        windowCopyEl.innerHTML = 'Every decided trade in this window has closed a winner so far, <span class="text-tertiary-fixed font-metric-sm text-metric-sm font-semibold">' + windowTrades + ' for ' + windowTrades + '</span>. Momentum setups executed during this window showcase zero premature invalidations.';
      }
      if (reliabilityEl) reliabilityEl.textContent = '100.0%';
      if (sparklineEl) {
        var barCount = Math.max(1, Math.min(windowTrades, 8));
        sparklineEl.innerHTML = new Array(barCount).fill('<span class="w-1.5 h-3.5 bg-tertiary-fixed rounded-xs"></span>').join('');
      }
    } else {
      if (windowLabelEl) windowLabelEl.textContent = 'Not yet found';
      if (windowCopyEl) windowCopyEl.textContent = 'No consecutive winning window yet, log a few more closed trades.';
      if (reliabilityEl) reliabilityEl.textContent = '—';
      if (sparklineEl) sparklineEl.innerHTML = '';
    }

    // Watch day: the weekday with the lowest win rate among days that have at least one loss.
    var watchLabelEl = section.querySelector('#th-watch-day-label');
    var watchCopyEl = section.querySelector('#th-watch-day-copy');
    var watchContextEl = section.querySelector('#th-watch-day-context');
    var watchStopEl = section.querySelector('#th-watch-day-stophit');
    var lossyDays = daysWithTrades.filter(function (d) { return d.losses > 0; });
    var watchDay = lossyDays.length
      ? lossyDays.reduce(function (worst, d) { return d.rate < worst.rate ? d : worst; })
      : null;
    if (watchDay) {
      var context = mostCommon(watchDay.trades.map(function (t) { return shortContext(nonEmptyConfluence(t)[0]); })) || 'Unlabeled';
      if (watchLabelEl) watchLabelEl.textContent = watchDay.day;
      if (watchCopyEl) {
        watchCopyEl.textContent = (watchDay.rate === 0 ? 'Your worst day so far, ' : 'Your softest day so far, ') + watchDay.wins + '/' + watchDay.total + ' (' + watchDay.rate + '%). It’s also sourced mostly from a ' + context + ' daily context, small sample, worth tracking forward.';
      }
      if (watchContextEl) watchContextEl.textContent = context;
      if (watchStopEl) watchStopEl.textContent = watchDay.losses + ' Stop Hit' + (watchDay.losses === 1 ? '' : 's');
    } else {
      if (watchLabelEl) watchLabelEl.textContent = 'None yet';
      if (watchCopyEl) watchCopyEl.textContent = 'No losing days logged yet, keep it up.';
      if (watchContextEl) watchContextEl.textContent = '—';
      if (watchStopEl) watchStopEl.textContent = '0 Stop Hits';
    }

    // Session + hour-of-day breakdown, from whichever trades have an entry time logged.
    var tzSelect = section.querySelector('#th-tz-select');
    if (tzSelect && !tzSelect.options.length) {
      var currentOffset = getEntryTzOffsetMinutes();
      buildTzOffsetOptions().forEach(function (minutes) {
        var opt = document.createElement('option');
        opt.value = String(minutes);
        opt.textContent = formatTzOffsetLabel(minutes) + (minutes === 0 ? ' (UTC)' : '');
        tzSelect.appendChild(opt);
      });
      tzSelect.value = String(currentOffset);
    }

    var sessionStats = computeSessionStats(trades);
    var sessionGridEl = section.querySelector('#th-session-grid');
    if (sessionGridEl) sessionGridEl.innerHTML = sessionStats.sessions.map(sessionCellHtml).join('');

    var hourStripEl = section.querySelector('#th-hour-strip');
    var hourStripEmptyEl = section.querySelector('#th-hour-strip-empty');
    if (hourStripEl && hourStripEmptyEl) {
      if (sessionStats.loggedCount < MIN_SESSION_TRADES_FOR_HOUR_CHART) {
        hourStripEl.hidden = true;
        hourStripEmptyEl.hidden = false;
      } else {
        hourStripEl.hidden = false;
        hourStripEmptyEl.hidden = true;
        var maxCount = sessionStats.perHour.reduce(function (max, h) { return Math.max(max, h.total); }, 1);
        hourStripEl.innerHTML = sessionStats.perHour.map(function (h) { return hourBarHtml(h, maxCount); }).join('');
      }
    }
  }

  function initTimingHeatmapControls(section) {
    if (!section) return;
    var tzSelect = section.querySelector('#th-tz-select');
    if (tzSelect) {
      tzSelect.addEventListener('change', function () {
        setEntryTzOffsetMinutes(parseInt(tzSelect.value, 10));
        renderTimingHeatmap();
      });
    }
  }

  // ---------------------------------------------------------------------
  // Case Studies screen
  // ---------------------------------------------------------------------

  var QUOTE_ASSETS = ['USDT', 'USDC', 'BUSD', 'USD', 'BTC', 'ETH'];

  function splitPairLabel(pair) {
    var p = (pair || '').replace(/\.P$/i, '');
    for (var i = 0; i < QUOTE_ASSETS.length; i++) {
      var q = QUOTE_ASSETS[i];
      if (p.length > q.length && p.slice(-q.length).toUpperCase() === q) {
        return p.slice(0, -q.length) + ' / ' + q;
      }
    }
    return p;
  }

  function archiveIdFor(trade) {
    var parts = (trade.date || '').split('-');
    if (parts.length !== 3) return '#CS-' + trade.id;
    return '#CS-' + parts[0] + '-' + parts[1] + parts[2];
  }

  function formatLongDate(dateStr) {
    var d = parseDate(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'long' }) + ', ' + d.getDate() + ' ' +
      d.toLocaleDateString('en-US', { month: 'long' }) + ' ' + d.getFullYear();
  }

  function formatMediumDate(dateStr) {
    return parseDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function parsePriceValue(raw) {
    var n = parseFloat((raw || '').replace(/[^0-9.-]+/g, ''));
    return isNaN(n) ? null : n;
  }

  function computeTradeReturn(trade) {
    var entry = parsePriceValue(trade.entryPrice);
    var exit = parsePriceValue(trade.exitPrice);
    if (entry === null || exit === null || entry === 0) return null;
    var rawPct = ((exit - entry) / entry) * 100;
    var pctChange = trade.direction === 'short' ? -rawPct : rawPct;
    var delta = trade.direction === 'short' ? (entry - exit) : (exit - entry);
    var leverageMultiplier = parseFloat((trade.leverage || '').match(/[\d.]+/) || 0);
    // Position Size is the margin you put up; P&L is driven by the full notional
    // exposure that margin controls (margin x leverage), not the margin alone -
    // leverage doesn't change P&L for a given exposure, it changes how little
    // margin was needed to hold it. Default to 1x when leverage isn't recorded.
    var positionSize = parsePriceValue(trade.positionSize);
    var notionalSize = positionSize !== null ? positionSize * (leverageMultiplier || 1) : null;
    // An exact exchange-reported realized P&L (from an imported trade) is
    // always more trustworthy than the estimate derived from margin x
    // leverage, so it takes priority whenever it's present.
    var dollarPnl = typeof trade.realizedPnl === 'number'
      ? trade.realizedPnl
      : (notionalSize !== null ? (pctChange / 100) * notionalSize : null);

    var stopLoss = parsePriceValue(trade.stopLoss);
    var rMultiple = null;
    if (stopLoss !== null) {
      var riskPerUnit = trade.direction === 'short' ? (stopLoss - entry) : (entry - stopLoss);
      if (riskPerUnit > 0) rMultiple = delta / riskPerUnit;
    }

    return {
      entry: entry,
      exit: exit,
      pctChange: pctChange,
      delta: delta,
      roe: leverageMultiplier ? pctChange * leverageMultiplier : null,
      positionSize: positionSize,
      notionalSize: notionalSize,
      dollarPnl: dollarPnl,
      rMultiple: rMultiple
    };
  }

  function buildLeverageString(multiplier, mode) {
    // No multiplier selected means leverage genuinely isn't known (e.g. a
    // position promoted from an exchange export, which carries no leverage
    // column) - record it as blank rather than inventing a number.
    if (!multiplier) return '';
    return multiplier + 'x ' + (mode === 'cross' ? 'cross' : 'isolated');
  }

  function parseLeverageMode(leverageStr) {
    return /\bcross\b/i.test(leverageStr || '') ? 'cross' : 'isolated';
  }

  function formatSignedDollars(n) {
    var sign = n >= 0 ? '+' : '-';
    return sign + '$' + Math.abs(n).toFixed(2);
  }

  function formatSignedR(n) {
    var sign = n >= 0 ? '+' : '';
    return sign + n.toFixed(2) + 'R';
  }

  // The session windows overlap (e.g. 07:00-08:00 UTC is both Asia and
  // London), so a trade can sit in more than one. Uses the same UTC
  // conversion as the Timing & Heatmap stats, mexc-import special case included.
  function tradeSessionLabel(trade) {
    var minutes = entryUtcMinutesForTrade(trade, getEntryTzOffsetMinutes());
    if (minutes === null) return null;
    var hour = Math.floor(minutes / 60);
    var names = SESSIONS
      .filter(function (s) { return hour >= s.start && hour < s.end; })
      .map(function (s) { return s.name; });
    return names.length ? names.join(' / ') : 'Off-hours';
  }

  // Trades carry no exit time, so duration only exists when the trade came
  // from (or was promoted from) a Position History record.
  function tradeDurationLabel(trade) {
    var positions = PositionStore.getAll();
    for (var i = 0; i < positions.length; i++) {
      if (positions[i].linkedTradeId === trade.id) {
        var label = formatDurationMs(positionDurationMs(positions[i]));
        return label === '—' ? null : label;
      }
    }
    return null;
  }

  function computeTradeGrade(trade, filledCount) {
    if (trade.outcome === 'open') return { label: 'PENDING', color: 'text-secondary' };
    if (trade.outcome === 'loss') return { label: 'REVIEW', color: 'text-error' };
    return filledCount >= 5
      ? { label: 'TIER-A VALIDATED', color: 'text-primary' }
      : { label: 'TIER-B VALIDATED', color: 'text-primary' };
  }

  function truncateMiddle(text, max) {
    if (text.length <= max) return text;
    var head = Math.ceil((max - 1) / 2);
    return text.slice(0, head) + '…' + text.slice(text.length - (max - 1 - head));
  }

  // Tab pills reuse the All / Wins / Losses pill treatment. Inside a white card
  // the inactive pill uses surface-container-low so it stays visible.
  function chartTabsHtml(trade, activeKey) {
    var charts = tradeCharts(trade);
    return CHART_TIMEFRAMES.map(function (tf) {
      // An empty timeframe is dimmed with a lighter text token, not opacity:
      // opacity-60 dropped the label to 3:1 contrast, secondary keeps 5.9:1.
      var stateClass = tf.key === activeKey
        ? 'bg-on-surface text-surface-container-lowest'
        : 'bg-surface-container-low hover:bg-surface-container ' + (charts[tf.key] ? 'text-on-surface-variant' : 'text-secondary');
      return (
        '<button type="button" data-tf="' + tf.key + '" class="cs-chart-tab font-metric-sm text-metric-sm px-3.5 py-1.5 rounded-full shadow-sm flex items-center gap-1.5 transition-all ' + stateClass + '">' +
          tf.label +
        '</button>'
      );
    }).join('');
  }

  function chartEvidenceHtml(trade, tfKey) {
    var tf = chartTimeframe(tfKey);
    var image = tradeCharts(trade)[tf.key];
    var link = trade.chart && trade.chart.type === 'link' && trade.chart.value ? trade.chart : null;

    // A TradingView snapshot URL is a web page, not an image file, and those
    // pages aren't guaranteed to permit framing - so it's presented as a
    // link card sized like the placeholder rather than embedded. It only
    // takes the body when there is no uploaded screenshot to show instead.
    if (link && !firstChartKey(trade)) {
      return (
        '<div class="rounded-xl bg-surface-container-low p-10 flex flex-col items-center justify-center text-center gap-2">' +
          '<span class="material-symbols-outlined text-primary text-[32px]">candlestick_chart</span>' +
          '<span class="font-headline-sm text-headline-sm text-on-surface font-medium">TradingView snapshot</span>' +
          '<span class="font-metric-sm text-metric-sm text-secondary break-all max-w-full" title="' + escapeHtml(link.value) + '">' + escapeHtml(truncateMiddle(link.value, 52)) + '</span>' +
          '<a href="' + escapeHtml(link.value) + '" target="_blank" rel="noopener noreferrer" class="mt-2 inline-flex items-center gap-1.5 bg-primary hover:bg-primary-container text-on-primary px-3.5 py-1.5 rounded-lg font-headline-sm text-[12px] font-semibold shadow-sm transition-colors">' +
            'View Chart on TradingView' +
            '<span class="material-symbols-outlined text-[15px]">open_in_new</span>' +
          '</a>' +
        '</div>'
      );
    }

    var linkButton = link
      ? '<a href="' + escapeHtml(link.value) + '" target="_blank" rel="noopener noreferrer" class="ml-auto inline-flex items-center gap-1 text-primary hover:underline font-metric-sm text-metric-sm font-semibold">' +
          'View on TradingView<span class="material-symbols-outlined text-[14px]">open_in_new</span></a>'
      : '';

    if (image) {
      // The image sits on a tinted well (same tone as the Trade Notes well)
      // rather than straight on the white card padding.
      return (
        '<div class="bg-surface-container-low rounded-xl p-3">' +
          '<div class="chart-preview-btn relative rounded-lg overflow-hidden shadow-sm cursor-zoom-in" data-trade-id="' + escapeHtml(trade.id) + '" data-tf="' + tf.key + '" title="Click to zoom">' +
            '<img src="' + image.value + '" alt="' + tf.label + ' chart for ' + escapeHtml(trade.pair) + '" class="w-full h-auto block" />' +
            '<span class="absolute top-3 left-3 bg-surface-container-lowest/90 text-primary font-metric-sm text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-sm">' + tf.short + '</span>' +
          '</div>' +
          '<div class="flex items-center gap-2 px-1 pt-2">' +
            '<span class="material-symbols-outlined text-secondary text-[18px]">image</span>' +
            '<span class="font-metric-sm text-metric-sm font-semibold text-on-surface">' + escapeHtml(image.name || 'Attached screenshot') + '</span>' +
            linkButton +
          '</div>' +
        '</div>'
      );
    }

    return (
      '<div class="rounded-xl bg-surface-container-low p-10 flex flex-col items-center justify-center text-center gap-2">' +
        '<span class="material-symbols-outlined text-secondary text-[32px]">image</span>' +
        '<span class="font-headline-sm text-headline-sm text-on-surface font-medium">No ' + tf.label + ' chart attached</span>' +
        '<span class="font-metric-sm text-metric-sm text-secondary">Attach one from Edit Entry</span>' +
      '</div>' +
      (link ? '<div class="flex items-center px-1 pt-2">' + linkButton + '</div>' : '')
    );
  }

  // Categories are a stored, ordered list rather than a fixed set, so they
  // can be removed once empty. "Other" is permanent - it's the fallback any
  // uncategorizable parameter lands in.
  var PARAM_CATEGORY_STORAGE_KEY = 'tj_param_categories';
  var FALLBACK_CATEGORY_KEY = 'Other';
  var DEFAULT_PARAM_CATEGORIES = [
    { key: 'Daily', label: 'Daily Context' },
    { key: '4H', label: '4H Structure & Pattern' },
    { key: 'M15', label: 'M15 Trigger' },
    { key: 'Other', label: 'Other' }
  ];

  function saveParamCategories(categories) {
    try { localStorage.setItem(PARAM_CATEGORY_STORAGE_KEY, JSON.stringify(categories)); } catch (e) {}
    scheduleGithubSync();
  }

  function loadParamCategories() {
    var stored = null;
    try {
      var raw = localStorage.getItem(PARAM_CATEGORY_STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch (e) {}

    if (!Array.isArray(stored) || !stored.length) {
      saveParamCategories(DEFAULT_PARAM_CATEGORIES);
      return DEFAULT_PARAM_CATEGORIES.slice();
    }

    var categories = [];
    var seen = {};
    stored.forEach(function (entry) {
      if (!entry || !entry.key || seen[entry.key]) return;
      seen[entry.key] = true;
      categories.push({ key: String(entry.key), label: String(entry.label || entry.key) });
    });
    if (!seen[FALLBACK_CATEGORY_KEY]) {
      categories.push({ key: FALLBACK_CATEGORY_KEY, label: 'Other' });
      saveParamCategories(categories);
    }
    return categories;
  }

  function paramCategoryKeys() {
    return loadParamCategories().map(function (c) { return c.key; });
  }

  function paramCategoryLabel(key) {
    var match = loadParamCategories().filter(function (c) { return c.key === key; })[0];
    return match ? match.label : key;
  }

  function categorizeParamValue(value) {
    if (/^daily/i.test(value)) return 'Daily';
    if (/^4h/i.test(value)) return '4H';
    if (/^m15/i.test(value)) return 'M15';
    return 'Other';
  }

  // Click-to-cycle order. A missing key in trade.parameterStatus means Passed.
  var PARAM_STATUS_UI = {
    passed: {
      label: 'Passed',
      tag: 'bg-tertiary-fixed/30 text-on-tertiary-fixed-variant',
      box: 'bg-tertiary text-on-tertiary',
      icon: 'check'
    },
    pending: {
      label: 'Pending',
      tag: 'bg-warning-container text-on-warning-container',
      box: 'bg-surface-container-lowest border-2 border-warning',
      icon: ''
    },
    failed: {
      label: 'Failed',
      tag: 'bg-error-container text-on-error-container',
      box: 'bg-error text-on-error',
      icon: 'close'
    }
  };

  function tradeParamStatus(trade, name) {
    var status = trade.parameterStatus && trade.parameterStatus[name];
    return status === 'pending' || status === 'failed' ? status : 'passed';
  }

  function nextParamStatus(status) {
    return status === 'passed' ? 'pending' : status === 'pending' ? 'failed' : 'passed';
  }

  function confluenceChecklistHtml(trade) {
    // Treated as a flat, variable-length list of whatever parameters are
    // actually logged on this trade - not tied to the 7 fixed entry-form
    // slots they came from, so the checklist reads the same whether a trade
    // has 2 parameters or 7.
    var params = nonEmptyConfluence(trade);

    if (!params.length) {
      return {
        html: '<p class="font-body-sm text-body-sm text-secondary italic px-1 py-2">No confluence parameters logged for this trade.</p>',
        categoriesHtml: '',
        filledCount: 0,
        passedCount: 0
      };
    }

    var categoryCounts = {};
    paramCategoryKeys().forEach(function (key) { categoryCounts[key] = 0; });
    params.forEach(function (p) {
      var key = parameterCategory(p);
      categoryCounts[key] = (categoryCounts[key] || 0) + 1;
    });

    var categoriesHtml = paramCategoryKeys()
      .filter(function (cat) { return categoryCounts[cat] > 0; })
      .map(function (cat) {
        return '<span class="bg-surface-container text-on-surface-variant font-metric-sm text-metric-sm px-2 py-0.5 rounded-full">' + cat + ' · ' + categoryCounts[cat] + '</span>';
      }).join('');

    var passedCount = 0;
    var html = params.map(function (value, index) {
      var status = tradeParamStatus(trade, value);
      if (status === 'passed') passedCount += 1;
      var ui = PARAM_STATUS_UI[status];
      return (
        '<div class="flex items-center gap-3 p-2.5 rounded-lg bg-surface-container-low/50 transition-colors">' +
          '<div class="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 shadow-sm ' + ui.box + '">' +
            (ui.icon ? '<span class="material-symbols-outlined text-[15px] font-bold">' + ui.icon + '</span>' : '') +
          '</div>' +
          '<div class="min-w-0 flex-1 font-headline-sm text-body-md font-semibold text-on-surface">' + escapeHtml(value) + '</div>' +
          '<button type="button" class="cs-param-status shrink-0 font-metric-sm text-metric-sm font-semibold px-2.5 py-0.5 rounded-full transition-opacity hover:opacity-80 ' + ui.tag + '" data-index="' + index + '" title="Click to change status">' + ui.label + '</button>' +
        '</div>'
      );
    }).join('');

    return { html: html, categoriesHtml: categoriesHtml, filledCount: params.length, passedCount: passedCount };
  }

  var csListState = { search: '', sort: 'date-desc' };

  var OUTCOME_SORT_RANK = { win: 0, loss: 1, open: 2 };

  function sortCaseStudyTrades(trades, sort) {
    var sorted = trades.slice();
    switch (sort) {
      case 'date-asc':
        sorted.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
        break;
      case 'outcome':
        sorted.sort(function (a, b) {
          var rankDiff = OUTCOME_SORT_RANK[a.outcome] - OUTCOME_SORT_RANK[b.outcome];
          return rankDiff !== 0 ? rankDiff : (a.pair || '').localeCompare(b.pair || '');
        });
        break;
      case 'pair':
        sorted.sort(function (a, b) { return (a.pair || '').localeCompare(b.pair || ''); });
        break;
      case 'confluence':
        sorted.sort(function (a, b) { return nonEmptyConfluence(b).length - nonEmptyConfluence(a).length; });
        break;
      case 'date-desc':
      default:
        sorted.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
        break;
    }
    return sorted;
  }

  function caseStudyListRowHtml(trade) {
    var dot = OUTCOME_DOT_CLASS[trade.outcome] || OUTCOME_DOT_CLASS.open;
    var pillClass = OUTCOME_PILL_CLASS[trade.outcome] || OUTCOME_PILL_CLASS.open;
    var directionClass = DIRECTION_BADGE_CLASS[trade.direction] || DIRECTION_BADGE_CLASS.long;
    var filledCount = nonEmptyConfluence(trade).length;
    return (
      '<a href="#case-studies/' + encodeURIComponent(trade.id) + '" class="block px-5 py-3.5 hover:bg-surface-container-low/60 transition-colors">' +
      '<div class="flex items-center justify-between gap-4">' +
        '<div class="flex items-center gap-3 min-w-0">' +
          '<div class="flex flex-col shrink-0 w-16">' +
            '<span class="font-headline-sm text-headline-sm text-on-surface">' + formatDateLabel(trade.date) + '</span>' +
            '<span class="font-metric-sm text-metric-sm text-secondary">' + weekdayLabel(trade.date) + '</span>' +
          '</div>' +
          '<span class="font-metric-md text-metric-md font-bold text-on-surface truncate">' + escapeHtml(trade.pair) + '</span>' +
          '<span class="' + directionClass + ' font-metric-sm text-[11px] font-semibold px-2 py-0.5 rounded shrink-0">' + trade.direction.toUpperCase() + '</span>' +
        '</div>' +
        '<div class="flex items-center gap-3 shrink-0">' +
          '<span class="font-metric-sm text-metric-sm text-secondary">' + filledCount + ' parameter' + (filledCount === 1 ? '' : 's') + '</span>' +
          '<span class="' + pillClass + ' font-metric-sm text-metric-sm font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">' +
            '<span class="w-1.5 h-1.5 rounded-full ' + dot + '"></span>' + trade.outcome.toUpperCase() +
          '</span>' +
          '<span class="material-symbols-outlined text-secondary text-[18px]">chevron_right</span>' +
        '</div>' +
      '</div>' +
      // Aligned under the pair (date column w-16 + gap-3), so the strip reads
      // as part of the row's content rather than a separate footer.
      '<div class="flex items-center gap-2 mt-2 pl-[4.75rem]">' + chartStripHtml(trade) + '</div>' +
      '</a>'
    );
  }

  // Always three boxes, so a missing timeframe reads as "not logged" rather
  // than leaving a gap.
  function chartStripHtml(trade) {
    var charts = tradeCharts(trade);
    return CHART_TIMEFRAMES.map(function (tf) {
      var image = charts[tf.key];
      var badge = '<span class="absolute top-0.5 left-0.5 bg-surface-container-lowest/90 text-primary font-metric-sm text-[9px] font-semibold leading-none px-1 py-0.5 rounded">' + tf.short + '</span>';
      if (image) {
        return (
          '<div class="relative w-14 h-9 rounded-lg overflow-hidden bg-surface-container-low" title="' + tf.label + ' chart">' +
            '<img src="' + image.value + '" alt="" class="w-full h-full object-cover" />' + badge +
          '</div>'
        );
      }
      return (
        '<div class="relative w-14 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary opacity-40" title="No ' + tf.label + ' chart">' +
          '<span class="material-symbols-outlined text-[14px]">image</span>' + badge +
        '</div>'
      );
    }).join('');
  }

  function renderCaseStudyList() {
    var section = sections['case-studies'];
    if (!section) return;
    var listEl = section.querySelector('#cs-list');
    if (!listEl) return;

    var trades = TradeStore.getAll();
    var query = csListState.search.trim().toLowerCase();
    var filtered = query ? trades.filter(function (t) { return (t.pair || '').toLowerCase().indexOf(query) !== -1; }) : trades;
    var sorted = sortCaseStudyTrades(filtered, csListState.sort);

    listEl.innerHTML = sorted.length
      ? sorted.map(caseStudyListRowHtml).join('')
      : '<div class="px-5 py-8 text-center font-body-sm text-body-sm text-secondary">No trades match "' + escapeHtml(csListState.search) + '".</div>';
  }

  function initCaseStudyListControls() {
    var section = sections['case-studies'];
    if (!section) return;
    var searchInput = section.querySelector('#cs-search-input');
    var sortSelect = section.querySelector('#cs-sort-select');
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        csListState.search = e.target.value || '';
        renderCaseStudyList();
      });
    }
    if (sortSelect) {
      sortSelect.addEventListener('change', function (e) {
        csListState.sort = e.target.value;
        renderCaseStudyList();
      });
    }
  }

  // Which trade and timeframe the detail view's chart card is showing. The
  // card's innerHTML is rebuilt on every render, so the tab clicks are
  // delegated from a listener registered once in initCaseStudyActions.
  var csCurrentTradeId = null;
  var csActiveChartTf = 'daily';

  function renderCaseStudyChart(section, trade) {
    var tabs = section.querySelector('#cs-chart-tabs');
    var container = section.querySelector('#cs-chart-container');
    if (tabs) tabs.innerHTML = chartTabsHtml(trade, csActiveChartTf);
    if (container) container.innerHTML = chartEvidenceHtml(trade, csActiveChartTf);
  }

  function renderCaseStudy(tradeIdParam) {
    var section = sections['case-studies'];
    if (!section) return;

    var tradeId = tradeIdParam ? decodeURIComponent(tradeIdParam) : null;
    var trade = tradeId ? TradeStore.getById(tradeId) : null;

    var listState = section.querySelector('#cs-list-state');
    var content = section.querySelector('#cs-content');

    if (!trade) {
      if (listState) listState.hidden = false;
      if (content) content.hidden = true;
      var breadcrumbEmpty = section.querySelector('#cs-breadcrumb-pair');
      if (breadcrumbEmpty) breadcrumbEmpty.textContent = '--';
      var archiveEmpty = section.querySelector('#cs-archive-id');
      if (archiveEmpty) archiveEmpty.textContent = '--';
      renderCaseStudyList();
      return;
    }

    if (listState) listState.hidden = true;
    if (content) content.hidden = false;

    section.querySelector('#cs-breadcrumb-pair').textContent = trade.pair;
    section.querySelector('#cs-archive-id').textContent = archiveIdFor(trade);
    section.querySelector('#cs-pair').textContent = trade.pair;
    section.querySelector('#cs-direction').textContent = trade.direction.toUpperCase();
    section.querySelector('#cs-logged-date').textContent = 'Logged ' + formatLongDate(trade.date);

    var outcomeDot = section.querySelector('#cs-outcome-dot');
    var outcomeText = section.querySelector('#cs-outcome-text');
    var outcomePill = section.querySelector('#cs-outcome-pill');
    outcomeText.textContent = trade.outcome.toUpperCase();
    outcomeDot.className = 'w-1.5 h-1.5 rounded-full ' + (OUTCOME_DOT_CLASS[trade.outcome] || OUTCOME_DOT_CLASS.open);
    // 'breakeven' isn't a form option, but zero-P&L imports produce it, so it
    // gets the same neutral treatment as an open trade rather than looking broken.
    outcomePill.className = 'px-2.5 py-0.5 rounded-full font-metric-sm text-metric-sm font-semibold flex items-center gap-1.5 ' +
      (trade.outcome === 'win' ? 'bg-surface-container-low text-tertiary' : trade.outcome === 'loss' ? 'bg-error-container text-error' : 'bg-surface-container text-on-surface-variant');

    var sourceBadge = section.querySelector('#cs-source-badge');
    if (sourceBadge) sourceBadge.hidden = trade.source !== 'mexc-import';

    var ret = computeTradeReturn(trade);

    // Metadata tiles
    setMetaTile(section, 'entry', trade.entryPrice ? ('$' + trade.entryPrice) : '', '', 'Not recorded');
    setMetaTile(section, 'exit', trade.exitPrice ? ('$' + trade.exitPrice) : '', '', 'Not recorded');
    var hasR = ret && ret.rMultiple !== null;
    setMetaTile(section, 'r', hasR ? formatSignedR(ret.rMultiple) : '', hasR ? (ret.rMultiple >= 0 ? 'text-tertiary' : 'text-error') : '', ret ? 'No stop-loss logged' : 'Not recorded');
    setMetaTile(section, 'duration', tradeDurationLabel(trade) || '', '', 'Not recorded');
    // No Playbook / setup entity exists yet, so there is nothing to show.
    setMetaTile(section, 'setup', '', '', 'Not recorded');
    setMetaTile(section, 'session', tradeSessionLabel(trade) || '', '', 'No entry time logged');

    csCurrentTradeId = trade.id;
    csActiveChartTf = firstChartKey(trade) || 'daily';
    renderCaseStudyChart(section, trade);
    renderCaseStudyChecklist(section, trade);
    section.querySelector('#cs-notes-text').textContent = trade.notes && trade.notes.trim() ? trade.notes : 'No notes recorded for this trade.';

    // Execution details
    var returnValueEl = section.querySelector('#cs-return-value');
    var returnSubEl = section.querySelector('#cs-return-sub');
    if (ret) {
      var positive = ret.pctChange >= 0;
      returnValueEl.textContent = (positive ? '+' : '') + ret.pctChange.toFixed(2) + '%';
      returnValueEl.className = 'font-metric-lg text-metric-lg font-bold ' + (positive ? 'text-tertiary' : 'text-error');
      var returnSubParts = [];
      if (ret.dollarPnl !== null) returnSubParts.push(formatSignedDollars(ret.dollarPnl));
      if (ret.roe !== null) returnSubParts.push((ret.roe >= 0 ? '+' : '') + ret.roe.toFixed(1) + '% ROE');
      returnSubEl.textContent = returnSubParts.join(' · ');
    } else {
      returnValueEl.textContent = 'Not recorded';
      returnValueEl.className = 'font-metric-lg text-metric-lg font-bold text-secondary';
      returnSubEl.textContent = '';
    }

    section.querySelector('#cs-detail-pair-label').textContent = 'PAIR: ' + splitPairLabel(trade.pair);
    section.querySelector('#cs-detail-date').textContent = formatMediumDate(trade.date);
    var changeEl = section.querySelector('#cs-detail-change');
    if (ret) {
      changeEl.textContent = (ret.pctChange >= 0 ? '+' : '') + ret.pctChange.toFixed(2) + '%';
      changeEl.className = 'font-metric-md text-metric-md font-bold ' + (ret.pctChange >= 0 ? 'text-tertiary' : 'text-error');
    } else {
      changeEl.textContent = 'Not recorded';
      changeEl.className = 'font-metric-md text-metric-md font-bold text-secondary';
    }
    section.querySelector('#cs-detail-leverage').textContent = trade.leverage || 'Not recorded';
    section.querySelector('#cs-detail-prevcandle').innerHTML =
      '<span class="w-2 h-2 rounded-full ' + (trade.prevCandle === 'bearish' ? 'bg-error' : 'bg-tertiary') + '"></span>' +
      (trade.prevCandle ? (trade.prevCandle.charAt(0).toUpperCase() + trade.prevCandle.slice(1)) : 'Not recorded');

    var NOT_RECORDED_CLASS = 'font-metric-sm text-metric-sm font-medium text-secondary bg-surface-container px-2.5 py-0.5 rounded';
    var positionSizeEl = section.querySelector('#cs-detail-position-size');
    if (trade.positionSize) {
      positionSizeEl.textContent = '$' + trade.positionSize;
      positionSizeEl.className = 'font-metric-sm text-metric-sm font-medium text-on-surface';
    } else {
      positionSizeEl.textContent = 'Not recorded';
      positionSizeEl.className = NOT_RECORDED_CLASS;
    }

    var notionalEl = section.querySelector('#cs-detail-notional');
    if (ret && ret.notionalSize !== null) {
      notionalEl.textContent = '$' + ret.notionalSize.toFixed(2);
      notionalEl.className = 'font-metric-sm text-metric-sm font-medium text-on-surface';
    } else {
      notionalEl.textContent = 'Not recorded';
      notionalEl.className = NOT_RECORDED_CLASS;
    }

    var stopLossEl = section.querySelector('#cs-detail-stop-loss');
    if (trade.stopLoss) {
      stopLossEl.textContent = '$' + trade.stopLoss;
      stopLossEl.className = 'font-metric-sm text-metric-sm font-medium text-on-surface';
    } else {
      stopLossEl.textContent = 'Not recorded';
      stopLossEl.className = NOT_RECORDED_CLASS;
    }

    var pnlEl = section.querySelector('#cs-detail-pnl');
    if (ret && ret.dollarPnl !== null) {
      pnlEl.textContent = formatSignedDollars(ret.dollarPnl);
      pnlEl.className = 'font-metric-sm text-metric-sm font-semibold ' + (ret.dollarPnl >= 0 ? 'text-tertiary' : 'text-error');
    } else {
      pnlEl.textContent = 'Not recorded';
      pnlEl.className = NOT_RECORDED_CLASS;
    }

    section.querySelector('#cs-btn-edit').setAttribute('data-trade-id', trade.id);
    section.querySelector('#cs-btn-delete').setAttribute('data-trade-id', trade.id);
  }

  // Numeric tiles use the large metric size; Setup and Session hold text
  // (e.g. "London / New York") and would truncate at that size in the narrow column.
  var META_TEXT_TILES = { setup: true, session: true };

  // One of the six metadata tiles. An empty value renders as a dash with a
  // "why it's missing" line instead of a blank card.
  function setMetaTile(section, key, text, colorClass, missingLabel) {
    var valueEl = section.querySelector('#cs-meta-' + key);
    var subEl = section.querySelector('#cs-meta-' + key + '-sub');
    var valueClass = (META_TEXT_TILES[key] ? 'font-metric-md text-metric-md' : 'font-metric-lg text-metric-lg') + ' font-semibold truncate ';
    if (text) {
      valueEl.textContent = text;
      valueEl.title = text;
      valueEl.className = valueClass + (colorClass || 'text-on-surface');
      subEl.textContent = '';
    } else {
      valueEl.textContent = '—';
      valueEl.title = '';
      valueEl.className = valueClass + 'text-secondary';
      subEl.textContent = missingLabel || 'Not recorded';
    }
  }

  // Grade and badge count only Passed factors, so a Pending or Failed one
  // lowers the tier. Re-rendered on its own when a status tag is clicked.
  function renderCaseStudyChecklist(section, trade) {
    var checklist = confluenceChecklistHtml(trade);
    section.querySelector('#cs-confluence-filled-badge').textContent = checklist.filledCount
      ? checklist.passedCount + ' / ' + checklist.filledCount + ' passed'
      : 'None logged';
    section.querySelector('#cs-confluence-categories').innerHTML = checklist.categoriesHtml || '';
    section.querySelector('#cs-confluence-list').innerHTML = checklist.html;

    var grade = computeTradeGrade(trade, checklist.passedCount);
    var gradeEl = section.querySelector('#cs-trade-grade');
    gradeEl.textContent = grade.label;
    gradeEl.className = 'font-metric-sm text-metric-sm font-semibold px-2.5 py-0.5 rounded-full bg-surface-container-low whitespace-nowrap ' + grade.color;
  }

  function initCaseStudyActions() {
    var section = sections['case-studies'];
    if (!section) return;

    var chartTabs = section.querySelector('#cs-chart-tabs');
    if (chartTabs) {
      chartTabs.addEventListener('click', function (e) {
        var tab = e.target.closest ? e.target.closest('.cs-chart-tab') : null;
        if (!tab || !csCurrentTradeId) return;
        var trade = TradeStore.getById(csCurrentTradeId);
        if (!trade) return;
        csActiveChartTf = tab.getAttribute('data-tf') || 'daily';
        renderCaseStudyChart(section, trade);
      });
    }

    var editBtn = section.querySelector('#cs-btn-edit');
    if (editBtn) {
      editBtn.addEventListener('click', function () {
        var id = editBtn.getAttribute('data-trade-id');
        if (id) window.AppRouter.navigate('new-trade-entry', id);
      });
    }

    // Clicking a status tag cycles Passed -> Pending -> Failed. The entry form
    // has no status field, so this is the only place a status is set.
    var checklistList = section.querySelector('#cs-confluence-list');
    if (checklistList) {
      checklistList.addEventListener('click', function (e) {
        var tag = e.target.closest ? e.target.closest('.cs-param-status') : null;
        if (!tag || !csCurrentTradeId) return;
        var trade = TradeStore.getById(csCurrentTradeId);
        if (!trade) return;
        var name = nonEmptyConfluence(trade)[parseInt(tag.getAttribute('data-index'), 10)];
        if (name === undefined) return;

        var status = nextParamStatus(tradeParamStatus(trade, name));
        var statuses = {};
        Object.keys(trade.parameterStatus || {}).forEach(function (key) { statuses[key] = trade.parameterStatus[key]; });
        if (status === 'passed') delete statuses[name]; else statuses[name] = status;
        trade.parameterStatus = statuses;

        if (!TradeStore.update(trade.id, trade)) {
          window.alert('Could not save — local storage is full. Try exporting or removing some old trades.');
          return;
        }
        renderCaseStudyChecklist(section, trade);
      });
    }

    var deleteBtn = section.querySelector('#cs-btn-delete');
    var deleteModal = document.getElementById('cs-delete-modal');
    var deleteBackdrop = document.getElementById('cs-delete-backdrop');
    var deleteCancel = document.getElementById('cs-delete-cancel');
    var deleteConfirm = document.getElementById('cs-delete-confirm');
    var deleteTrigger = null;
    var pendingDeleteId = null;

    function closeDeleteModal(restoreFocus) {
      if (!deleteModal) return;
      deleteModal.hidden = true;
      pendingDeleteId = null;
      if (restoreFocus && deleteTrigger && deleteTrigger.focus) deleteTrigger.focus();
      deleteTrigger = null;
    }

    if (deleteBtn && deleteModal && deleteCancel && deleteConfirm) {
      deleteBtn.addEventListener('click', function () {
        var id = deleteBtn.getAttribute('data-trade-id');
        if (!id) return;
        pendingDeleteId = id;
        deleteTrigger = deleteBtn;
        deleteModal.hidden = false;
        // Cancel is the safe default focus for a destructive prompt.
        deleteCancel.focus();
      });

      deleteCancel.addEventListener('click', function () { closeDeleteModal(true); });
      if (deleteBackdrop) deleteBackdrop.addEventListener('click', function () { closeDeleteModal(true); });

      deleteConfirm.addEventListener('click', function () {
        var id = pendingDeleteId;
        if (!id) return;
        closeDeleteModal(false);
        TradeStore.remove(id);
        var removed = {};
        removed[id] = true;
        unlinkPositionsForTrades(removed);
        window.AppRouter.navigate('trade-journal');
      });

      document.addEventListener('keydown', function (e) {
        if (deleteModal.hidden) return;
        if (e.key === 'Escape') {
          closeDeleteModal(true);
        } else if (e.key === 'Tab') {
          // Only two focusable controls, so wrapping between them is a full trap.
          var first = deleteCancel;
          var last = deleteConfirm;
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      });

      document.addEventListener('screenchange', function () { closeDeleteModal(false); });
    }
  }

  // ---------------------------------------------------------------------
  // Chart screenshot preview modal (opened from the Trade Journal chart icon)
  // ---------------------------------------------------------------------

  var CHART_ZOOM_MIN = 50;
  var CHART_ZOOM_MAX = 400;
  var CHART_ZOOM_STEP = 25;

  function initChartPreviewModal() {
    var modal = document.getElementById('chart-preview-modal');
    if (!modal) return;
    var backdrop = document.getElementById('chart-preview-backdrop');
    var closeBtn = document.getElementById('chart-preview-close');
    var body = document.getElementById('chart-preview-body');
    var title = document.getElementById('chart-preview-title');
    var zoomInBtn = document.getElementById('chart-zoom-in');
    var zoomOutBtn = document.getElementById('chart-zoom-out');
    var zoomResetBtn = document.getElementById('chart-zoom-reset');
    var zoomLevelLabel = document.getElementById('chart-zoom-level');

    var zoomLevel = 100;
    var isSpaceDown = false;
    var isPanning = false;
    var didPan = false;
    var panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };

    function currentImage() {
      return body.querySelector('img');
    }

    function updateCursor() {
      var img = currentImage();
      if (!img) return;
      if (isPanning) img.style.cursor = 'grabbing';
      else if (isSpaceDown) img.style.cursor = 'grab';
      else img.style.cursor = zoomLevel < CHART_ZOOM_MAX ? 'zoom-in' : 'zoom-out';
    }

    function applyZoom() {
      var img = currentImage();
      zoomLevelLabel.textContent = zoomLevel + '%';
      if (!img) return;
      img.style.maxWidth = 'none';
      img.style.width = zoomLevel + '%';
      updateCursor();
    }

    function setZoom(next) {
      zoomLevel = Math.max(CHART_ZOOM_MIN, Math.min(CHART_ZOOM_MAX, next));
      applyZoom();
    }

    // A requested timeframe with no image falls back to the first one that
    // has one, so the table's single preview button always opens something.
    function openModal(trade, tfKey) {
      var charts = tradeCharts(trade);
      var key = tfKey && charts[tfKey] ? tfKey : firstChartKey(trade);
      var uploadedChart = key ? charts[key].value : null;
      title.textContent = trade.pair + ' — ' + (key ? chartTimeframe(key).label + ' Chart' : 'Chart Screenshot');
      zoomLevel = 100;
      isSpaceDown = false;
      isPanning = false;
      if (uploadedChart) {
        body.innerHTML = '<img src="' + uploadedChart + '" alt="' + (key ? chartTimeframe(key).label : 'Chart') + ' chart for ' + escapeHtml(trade.pair) + '" class="rounded-lg" draggable="false" />';
        var img = currentImage();
        img.addEventListener('click', function () {
          if (didPan) { didPan = false; return; }
          setZoom(zoomLevel >= CHART_ZOOM_MAX ? 100 : zoomLevel + 100);
        });
        img.addEventListener('mousedown', function (e) {
          if (!isSpaceDown) return;
          e.preventDefault();
          isPanning = true;
          // Holding space is itself pan intent - suppress the click-to-zoom
          // toggle that would otherwise follow, even if the mouse never moved.
          didPan = true;
          panStart.x = e.clientX;
          panStart.y = e.clientY;
          panStart.scrollLeft = body.scrollLeft;
          panStart.scrollTop = body.scrollTop;
          updateCursor();
        });
      } else {
        body.innerHTML =
          '<div class="rounded-xl bg-surface-container-low p-10 flex flex-col items-center justify-center text-center gap-2">' +
            '<span class="material-symbols-outlined text-secondary text-[32px]">image</span>' +
            '<span class="font-headline-sm text-headline-sm text-on-surface font-medium">No chart attached</span>' +
            '<span class="font-metric-sm text-metric-sm text-secondary">Attach one from this trade’s Edit Entry.</span>' +
          '</div>';
      }
      applyZoom();
      modal.hidden = false;
    }

    function closeModal() {
      modal.hidden = true;
      body.innerHTML = '';
    }

    document.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.chart-preview-btn') : null;
      if (btn) {
        var id = btn.getAttribute('data-trade-id');
        var trade = id ? TradeStore.getById(id) : null;
        if (trade) openModal(trade, btn.getAttribute('data-tf'));
      }
    });

    if (backdrop) backdrop.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (zoomInBtn) zoomInBtn.addEventListener('click', function () { setZoom(zoomLevel + CHART_ZOOM_STEP); });
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', function () { setZoom(zoomLevel - CHART_ZOOM_STEP); });
    if (zoomResetBtn) zoomResetBtn.addEventListener('click', function () { setZoom(100); });

    body.addEventListener('wheel', function (e) {
      if (!currentImage() || !e.ctrlKey) return;
      e.preventDefault();
      setZoom(zoomLevel + (e.deltaY < 0 ? CHART_ZOOM_STEP : -CHART_ZOOM_STEP));
    }, { passive: false });

    document.addEventListener('keydown', function (e) {
      if (modal.hidden) return;
      if (e.code === 'Space' || e.key === ' ') {
        if (!isSpaceDown) { isSpaceDown = true; updateCursor(); }
        e.preventDefault(); // don't let the page scroll while panning
        return;
      }
      if (e.key === 'Escape') closeModal();
      else if (e.key === '+' || e.key === '=') setZoom(zoomLevel + CHART_ZOOM_STEP);
      else if (e.key === '-') setZoom(zoomLevel - CHART_ZOOM_STEP);
      else if (e.key === '0') setZoom(100);
    });

    document.addEventListener('keyup', function (e) {
      if (e.code === 'Space' || e.key === ' ') {
        isSpaceDown = false;
        isPanning = false;
        updateCursor();
      }
    });

    window.addEventListener('mousemove', function (e) {
      if (!isPanning) return;
      body.scrollLeft = panStart.scrollLeft - (e.clientX - panStart.x);
      body.scrollTop = panStart.scrollTop - (e.clientY - panStart.y);
    });

    window.addEventListener('mouseup', function () {
      if (isPanning) {
        isPanning = false;
        updateCursor();
      }
    });
  }

  // ---------------------------------------------------------------------
  // New Trade Entry screen
  // ---------------------------------------------------------------------

  // Three screenshots per trade all live in one localStorage key, so every
  // upload is resized and re-encoded as JPEG before it's stored. The input cap
  // only guards against absurdly large files; the stored copy is far smaller.
  var MAX_CHART_INPUT_BYTES = 10 * 1024 * 1024;
  var CHART_MAX_EDGE_PX = 1600;
  var CHART_TARGET_BYTES = 500 * 1024;
  var CHART_MIN_QUALITY = 0.6;
  var nteEditingTradeId = null;
  var ntePromotingPositionId = null;
  var nteChartImages = { daily: null, h4: null, m15: null };
  var nteChartErrors = {};
  var nteChartTargetTf = null;
  // Bumped whenever the form is reset, so an image still being compressed
  // from a previous draft can't land in the next one.
  var nteChartEpoch = 0;

  function compressChartImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, CHART_MAX_EDGE_PX / Math.max(img.naturalWidth, img.naturalHeight));
        var width = Math.max(1, Math.round(img.naturalWidth * scale));
        var height = Math.max(1, Math.round(img.naturalHeight * scale));
        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext('2d');
        // JPEG has no alpha, so a transparent PNG would otherwise go black.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        var quality = 0.82;
        var dataUrl = canvas.toDataURL('image/jpeg', quality);
        // base64 is ~4/3 the size of the bytes it encodes.
        while (dataUrl.length * 0.75 > CHART_TARGET_BYTES && quality > CHART_MIN_QUALITY) {
          quality = Math.round((quality - 0.05) * 100) / 100;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve({ value: dataUrl, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('unreadable image'));
      };
      img.src = url;
    });
  }

  function renderChartSlots(section) {
    var container = section.querySelector('#chart-slots');
    if (!container) return;
    var attached = 0;
    container.innerHTML = CHART_TIMEFRAMES.map(function (tf) {
      var image = nteChartImages[tf.key];
      var error = nteChartErrors[tf.key];
      var slot;
      if (image) {
        attached += 1;
        slot =
          '<div class="chart-slot relative aspect-[16/10] rounded-xl overflow-hidden bg-surface-container-low cursor-pointer transition-all" data-tf="' + tf.key + '" role="button" tabindex="0" title="Click to replace">' +
            '<img src="' + image.value + '" alt="' + tf.label + ' chart" class="absolute inset-0 w-full h-full object-cover" />' +
            '<span class="absolute top-2 left-2 bg-surface-container-lowest/90 text-primary font-metric-sm text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm">' + tf.label + '</span>' +
            '<button type="button" class="chart-slot-remove absolute top-2 right-2 w-6 h-6 rounded-full bg-surface-container-lowest/90 text-secondary hover:text-error shadow-sm flex items-center justify-center transition-colors" data-tf="' + tf.key + '" aria-label="Remove ' + tf.label + ' chart">' +
              '<span class="material-symbols-outlined text-[14px]">close</span>' +
            '</button>' +
          '</div>';
      } else {
        slot =
          '<div class="chart-slot group relative aspect-[16/10] rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low hover:bg-surface-container hover:border-primary transition-all flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer px-3" data-tf="' + tf.key + '" role="button" tabindex="0">' +
            '<span class="absolute top-2 left-2 bg-primary/10 text-primary font-metric-sm text-[10px] font-semibold px-1.5 py-0.5 rounded">' + tf.short + '</span>' +
            '<span class="material-symbols-outlined text-[24px] text-secondary group-hover:text-primary transition-colors">add_a_photo</span>' +
            '<span class="font-metric-sm text-metric-sm text-secondary">Drop image or click to upload</span>' +
          '</div>';
      }
      return '<div>' + slot + (error ? '<p class="font-metric-sm text-metric-sm text-error mt-1.5">' + escapeHtml(error) + '</p>' : '') + '</div>';
    }).join('');
    var counter = section.querySelector('#chart-attached-count');
    if (counter) counter.textContent = attached + ' / ' + CHART_TIMEFRAMES.length + ' ATTACHED';
  }

  // ---------------------------------------------------------------------
  // Confluence Parameters multi-select (New Trade Entry)
  // ---------------------------------------------------------------------

  var CONFLUENCE_PARAMETER_LIBRARY = [
    'Daily Uptrend and Momentum continuation',
    'Daily Sideways',
    'Daily RSI above 70',
    'Daily RSI below 70',
    '4H Break of Structure (BOS)',
    '4H Parabolic',
    '4H Pullback',
    '4H Pause',
    '4H LS',
    '4H RSI above 70',
    'M15 30% Fibonacci Pullback',
    'M15 50% Fibonacci Pullback',
    'M15 not applicable'
  ];
  var CUSTOM_PARAMS_STORAGE_KEY = 'tj_custom_parameters';
  var nteSelectedParameters = [];

  // The vocabulary used to be a flat list of strings whose category was
  // re-inferred from the name on every render. It now stores the category
  // explicitly per parameter, so a name like "Test" - which no prefix rule
  // can place - can be filed deliberately and stay there.
  function normalizeParamCategory(category) {
    return paramCategoryKeys().indexOf(category) !== -1 ? category : FALLBACK_CATEGORY_KEY;
  }

  // Pulling from GitHub must never delete a category/parameter created
  // locally and not yet pushed - these three merges union local with
  // remote (local wins on a key collision) instead of replacing local
  // outright. See localHasExtra, used by the pull path to decide whether
  // the merge result needs pushing back so other devices converge too.
  function mergeParamCategories(local, remote) {
    var merged = local.slice();
    var seen = {};
    merged.forEach(function (c) { seen[String(c.key).toLowerCase()] = true; });
    (remote || []).forEach(function (rc) {
      if (!rc || !rc.key) return;
      var key = String(rc.key).toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      merged.push({ key: String(rc.key), label: String(rc.label || rc.key) });
    });
    return merged;
  }

  function mergeConfluenceVocabulary(local, remote) {
    var merged = local.slice();
    var seen = {};
    merged.forEach(function (v) { seen[v.name.toLowerCase()] = true; });
    (remote || []).forEach(function (rv) {
      if (!rv || !rv.name) return;
      var key = String(rv.name).toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      merged.push({ name: String(rv.name), category: normalizeParamCategory(rv.category) });
    });
    return merged;
  }

  function mergeRemovedDefaults(local, remote) {
    var seen = {};
    var merged = [];
    local.concat(remote || []).forEach(function (n) {
      var key = String(n).toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      merged.push(key);
    });
    return merged;
  }

  function localHasExtra(local, remote, keyFn) {
    var remoteKeys = {};
    (remote || []).forEach(function (r) { remoteKeys[String(keyFn(r)).toLowerCase()] = true; });
    return local.some(function (l) { return !remoteKeys[String(keyFn(l)).toLowerCase()]; });
  }

  function saveConfluenceVocabulary(vocab) {
    try { localStorage.setItem(CUSTOM_PARAMS_STORAGE_KEY, JSON.stringify(vocab)); } catch (e) {}
    scheduleGithubSync();
  }

  // Built-ins missing from storage are normally re-seeded, so that a
  // parameter added to the code later still reaches an existing journal.
  // Deleting one therefore needs a tombstone, otherwise it would reappear
  // on the next read.
  var REMOVED_DEFAULTS_STORAGE_KEY = 'tj_removed_default_parameters';

  function getRemovedDefaults() {
    try {
      var raw = localStorage.getItem(REMOVED_DEFAULTS_STORAGE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.map(function (n) { return String(n).toLowerCase(); }) : [];
    } catch (e) {
      return [];
    }
  }

  function saveRemovedDefaults(removed) {
    try { localStorage.setItem(REMOVED_DEFAULTS_STORAGE_KEY, JSON.stringify(removed)); } catch (e) {}
    scheduleGithubSync();
  }

  function rememberRemovedDefault(name) {
    if (CONFLUENCE_PARAMETER_LIBRARY.indexOf(name) === -1) return;
    var removed = getRemovedDefaults();
    if (removed.indexOf(name.toLowerCase()) !== -1) return;
    removed.push(name.toLowerCase());
    saveRemovedDefaults(removed);
  }

  // Reads the stored vocabulary, upgrading it in place the first time:
  // plain strings get their category backfilled by the same prefix
  // inference that was previously applied at render time, so nothing
  // visually moves. Built-ins missing from storage are folded in too, so a
  // parameter added to the code later still reaches existing journals.
  function loadConfluenceVocabulary() {
    var stored = [];
    try {
      var raw = localStorage.getItem(CUSTOM_PARAMS_STORAGE_KEY);
      if (raw) stored = JSON.parse(raw) || [];
    } catch (e) {
      stored = [];
    }
    if (!Array.isArray(stored)) stored = [];

    var vocab = [];
    var seen = {};
    var changed = false;

    stored.forEach(function (entry) {
      var name, category;
      if (typeof entry === 'string') {
        name = entry;
        category = categorizeParamValue(entry);
        changed = true;
      } else if (entry && entry.name) {
        name = String(entry.name);
        category = entry.category || categorizeParamValue(name);
        if (!entry.category) changed = true;
      } else {
        changed = true;
        return;
      }
      var key = name.toLowerCase();
      if (seen[key]) { changed = true; return; }
      seen[key] = true;
      vocab.push({ name: name, category: normalizeParamCategory(category) });
    });

    var removedDefaults = getRemovedDefaults();
    CONFLUENCE_PARAMETER_LIBRARY.forEach(function (name) {
      var key = name.toLowerCase();
      if (seen[key] || removedDefaults.indexOf(key) !== -1) return;
      seen[key] = true;
      vocab.push({ name: name, category: categorizeParamValue(name) });
      changed = true;
    });

    if (changed) saveConfluenceVocabulary(vocab);
    return vocab;
  }

  function findVocabularyEntry(name) {
    var key = String(name || '').toLowerCase();
    return loadConfluenceVocabulary().filter(function (entry) {
      return entry.name.toLowerCase() === key;
    })[0] || null;
  }

  // Category of a parameter as stored. Falls back to prefix inference for a
  // value that isn't in the vocabulary at all (e.g. one sitting on an older
  // trade), so grouping never breaks.
  function parameterCategory(name) {
    var entry = findVocabularyEntry(name);
    // Normalized either way: a name inferred into a category that has since
    // been deleted still has to land somewhere that exists.
    return normalizeParamCategory(entry ? entry.category : categorizeParamValue(name));
  }

  function getAllKnownParameters() {
    return loadConfluenceVocabulary().map(function (entry) { return entry.name; });
  }

  function addVocabularyParameter(name, category) {
    var vocab = loadConfluenceVocabulary();
    vocab.push({ name: name, category: normalizeParamCategory(category) });
    saveConfluenceVocabulary(vocab);
  }

  function setVocabularyCategory(name, category) {
    var vocab = loadConfluenceVocabulary();
    var key = name.toLowerCase();
    var moved = false;
    vocab.forEach(function (entry) {
      if (entry.name.toLowerCase() !== key) return;
      entry.category = normalizeParamCategory(category);
      moved = true;
    });
    if (moved) saveConfluenceVocabulary(vocab);
    return moved;
  }

  function isParameterSelected(value) {
    return nteSelectedParameters.some(function (p) { return p.toLowerCase() === value.toLowerCase(); });
  }

  function tradesUsingParameter(name) {
    var key = String(name || '').toLowerCase();
    return TradeStore.getAll().filter(function (trade) {
      return nonEmptyConfluence(trade).some(function (p) { return p.toLowerCase() === key; });
    });
  }

  // The delete control keeps its slot at all times and only fades in on
  // hover/focus, so revealing it never reflows the row of chips.
  function confluenceChipHtml(value) {
    var selected = isParameterSelected(value);
    var stateClass = selected
      ? 'bg-primary text-on-primary shadow-sm'
      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container';
    var icon = selected
      ? '<span class="material-symbols-outlined text-[14px]">check</span>'
      : '<span class="material-symbols-outlined text-[14px] opacity-40">add</span>';
    var deleteTone = selected ? 'hover:bg-on-primary/20' : 'hover:bg-error/10 hover:text-error';
    return (
      '<span class="confluence-chip-wrap group inline-flex items-center rounded-full transition-colors ' + stateClass + '">' +
        '<button type="button" class="confluence-chip inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full font-body-sm text-body-sm font-medium bg-transparent" ' +
          'data-value="' + escapeHtml(value) + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' +
          icon + escapeHtml(value) +
        '</button>' +
        '<button type="button" class="confluence-chip-delete mr-1.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ' + deleteTone + '" ' +
          'data-value="' + escapeHtml(value) + '" title="Delete from picker" aria-label="Delete ' + escapeHtml(value) + ' from picker">' +
          '<span class="material-symbols-outlined text-[14px]">close</span>' +
        '</button>' +
      '</span>'
    );
  }

  function confluenceCategoryHeaderHtml(category, count) {
    var deletable = category.key !== FALLBACK_CATEGORY_KEY;
    var button = '';
    if (deletable) {
      // Non-empty categories keep a visible but muted control: clicking it
      // explains the block, which beats a disabled button that says nothing.
      var tone = count === 0
        ? 'text-secondary hover:text-error hover:bg-error/10'
        : 'text-outline-variant hover:bg-surface-container-low';
      button = '<button type="button" class="confluence-category-delete w-5 h-5 rounded flex items-center justify-center transition-colors ' + tone + '" ' +
        'data-category="' + escapeHtml(category.key) + '" data-count="' + count + '" ' +
        'title="Delete category" aria-label="Delete category ' + escapeHtml(category.label) + '">' +
        '<span class="material-symbols-outlined text-[15px]">delete</span></button>';
    }
    return (
      '<div class="flex items-center gap-1.5 mb-2">' +
        '<span class="font-label-eyebrow text-label-eyebrow text-on-surface-variant uppercase tracking-wider">' +
          escapeHtml(category.label) +
        '</span>' + button +
      '</div>'
    );
  }

  // Every known parameter is always on screen, grouped by category - no
  // typing required to discover what exists.
  function renderConfluenceGrid(section) {
    var grid = section.querySelector('#confluence-grid');
    if (!grid) return;

    var known = getAllKnownParameters();
    // A parameter only present on this trade (e.g. from an older vocabulary)
    // still needs a chip, otherwise it would silently vanish on edit.
    nteSelectedParameters.forEach(function (value) {
      var inKnown = known.some(function (p) { return p.toLowerCase() === value.toLowerCase(); });
      if (!inKnown) known.push(value);
    });

    var categories = loadParamCategories();
    var grouped = {};
    categories.forEach(function (cat) { grouped[cat.key] = []; });
    known.forEach(function (value) { grouped[parameterCategory(value)].push(value); });

    // Empty categories still render - otherwise they'd be invisible and
    // there would be no way to reach their delete control.
    grid.innerHTML = categories.map(function (cat) {
      var items = grouped[cat.key] || [];
      var body = items.length
        ? '<div class="flex flex-wrap gap-2">' + items.map(confluenceChipHtml).join('') + '</div>'
        : '<p class="font-metric-sm text-metric-sm text-outline-variant">No parameters in this category yet.</p>';
      return '<div>' + confluenceCategoryHeaderHtml(cat, items.length) + body + '</div>';
    }).join('');

    var countEl = section.querySelector('#confluence-selected-count');
    if (countEl) countEl.textContent = nteSelectedParameters.length + ' selected';

    syncConfluenceCategoryOptions(section);
  }

  // The add-row category select is rebuilt from the live list so a deleted
  // category can't linger as a selectable option.
  function syncConfluenceCategoryOptions(section) {
    var select = section.querySelector('#confluence-add-category');
    if (!select) return;
    var previous = select.value;
    select.innerHTML = loadParamCategories().map(function (cat) {
      return '<option value="' + escapeHtml(cat.key) + '">' + escapeHtml(cat.label) + '</option>';
    }).join('');
    var stillExists = paramCategoryKeys().indexOf(previous) !== -1;
    select.value = stillExists ? previous : FALLBACK_CATEGORY_KEY;
  }

  function toggleConfluenceParameter(section, value) {
    if (isParameterSelected(value)) {
      nteSelectedParameters = nteSelectedParameters.filter(function (p) { return p.toLowerCase() !== value.toLowerCase(); });
    } else {
      nteSelectedParameters.push(value);
    }
    renderConfluenceGrid(section);
  }

  function showConfluenceAddNote(section, message) {
    var note = section.querySelector('#confluence-add-note');
    if (!note) return;
    note.textContent = message || '';
    note.hidden = !message;
  }

  // Tracks whether the user has overridden the category select by hand; once
  // they have, typing stops re-guessing underneath them.
  var nteCategoryTouched = false;

  // The select defaults to whatever the prefix rule would have guessed, so
  // the common case ("4H Volume Spike") still needs zero extra clicks. If
  // the typed name already exists, it shows where that parameter currently
  // lives instead, which is what makes re-filing it discoverable.
  function syncConfluenceAddCategory(section) {
    var input = section.querySelector('#confluence-add-input');
    var select = section.querySelector('#confluence-add-category');
    if (!input || !select) return;
    var value = input.value.trim();
    var existing = value ? findVocabularyEntry(value) : null;

    if (existing) {
      if (!nteCategoryTouched) select.value = normalizeParamCategory(existing.category);
      showConfluenceAddNote(section, select.value === existing.category
        ? '"' + existing.name + '" already exists in ' + paramCategoryLabel(existing.category) + '. Pick a different category to move it.'
        : 'Add will move "' + existing.name + '" to ' + paramCategoryLabel(normalizeParamCategory(select.value)) + '.');
      return;
    }

    // The inferred key is normalized: a prefix can still point at a category
    // the user has since deleted, and assigning a missing option would leave
    // the select blank.
    if (!nteCategoryTouched) {
      select.value = value ? normalizeParamCategory(categorizeParamValue(value)) : FALLBACK_CATEGORY_KEY;
    }
    showConfluenceAddNote(section, '');
  }

  // Adding grows the shared vocabulary so the chip is available on every
  // future trade, and selects it here since that's why it was just typed.
  function addConfluenceParameterFromInput(section) {
    var input = section.querySelector('#confluence-add-input');
    var select = section.querySelector('#confluence-add-category');
    if (!input) return;
    var value = input.value.trim();
    if (!value) return;
    var category = normalizeParamCategory(select ? select.value : categorizeParamValue(value));

    var existing = findVocabularyEntry(value);
    if (existing) {
      if (existing.category !== category) {
        // Re-filing an existing parameter is a housekeeping action, so it
        // deliberately does NOT attach the parameter to the trade being
        // edited - that would quietly change what the trade claims.
        setVocabularyCategory(existing.name, category);
        showConfluenceAddNote(section, 'Moved "' + existing.name + '" to ' + paramCategoryLabel(category) + '. Selection unchanged.');
      } else {
        if (!isParameterSelected(existing.name)) nteSelectedParameters.push(existing.name);
        showConfluenceAddNote(section, '"' + existing.name + '" already existed — selected it for this trade.');
      }
    } else {
      addVocabularyParameter(value, category);
      nteSelectedParameters.push(value);
      showConfluenceAddNote(section, 'Added "' + value + '" to ' + paramCategoryLabel(category) + '.');
    }

    input.value = '';
    nteCategoryTouched = false;
    renderConfluenceGrid(section);
  }

  // Removing a parameter from the picker never edits history: trades that
  // already recorded it keep it, on their Case Study checklist and Trade
  // Journal chips alike. Only the vocabulary entry goes away.
  function deleteConfluenceParameter(section, name) {
    var entry = findVocabularyEntry(name);
    var users = tradesUsingParameter(name);

    if (users.length) {
      var message = '"' + name + '" is used by ' + users.length + ' trade' + (users.length === 1 ? '' : 's') +
        '.\n\nDeleting removes it from the picker, but those trades keep it recorded.\n\nDelete from the picker?';
      if (!window.confirm(message)) return;
    }

    if (entry) {
      saveConfluenceVocabulary(loadConfluenceVocabulary().filter(function (item) {
        return item.name.toLowerCase() !== name.toLowerCase();
      }));
      rememberRemovedDefault(entry.name);
    }
    // It shouldn't stay attached to the trade still open in the form either,
    // though already-saved trades are untouched.
    nteSelectedParameters = nteSelectedParameters.filter(function (p) {
      return p.toLowerCase() !== name.toLowerCase();
    });

    showConfluenceAddNote(section, users.length
      ? 'Removed "' + name + '" from the picker. ' + users.length + ' existing trade' + (users.length === 1 ? '' : 's') + ' still show' + (users.length === 1 ? 's' : '') + ' it.'
      : 'Deleted "' + name + '" from the picker.');
    renderConfluenceGrid(section);
  }

  function showConfluenceCategoryNote(section, message, isError) {
    var note = section.querySelector('#confluence-category-note');
    if (!note) return;
    note.textContent = message || '';
    note.className = 'font-metric-sm text-metric-sm mt-1.5 ' + (isError ? 'text-error' : 'text-secondary');
    note.hidden = !message;
  }

  // New categories are appended to the end of the stored order, and the key
  // is the name itself - short keys like "4H" only exist because they were
  // seed data, nothing depends on them being abbreviations.
  function addConfluenceCategoryFromInput(section) {
    var input = section.querySelector('#confluence-add-category-input');
    if (!input) return;
    var name = input.value.trim();

    if (!name) {
      showConfluenceCategoryNote(section, 'Enter a category name.', true);
      return;
    }

    var lower = name.toLowerCase();
    var clash = loadParamCategories().filter(function (cat) {
      return cat.key.toLowerCase() === lower || cat.label.toLowerCase() === lower;
    })[0];
    if (clash) {
      showConfluenceCategoryNote(section, 'A category called "' + clash.label + '" already exists.', true);
      return;
    }

    var categories = loadParamCategories();
    categories.push({ key: name, label: name });
    saveParamCategories(categories);
    input.value = '';
    showConfluenceCategoryNote(section, 'Added the "' + name + '" category. Add parameters to it above.', false);
    renderConfluenceGrid(section);
  }

  function deleteConfluenceCategory(section, key, count) {
    if (key === FALLBACK_CATEGORY_KEY) return;
    var label = paramCategoryLabel(key);
    if (count > 0) {
      // Never silently bulk-move parameters somewhere else - the user has to
      // empty the category deliberately first.
      showConfluenceAddNote(section, 'Can\'t delete ' + label + ' yet — move or delete its ' +
        count + ' parameter' + (count === 1 ? '' : 's') + ' first.');
      return;
    }
    if (!window.confirm('Delete the empty category "' + label + '"?')) return;
    saveParamCategories(loadParamCategories().filter(function (cat) { return cat.key !== key; }));
    showConfluenceAddNote(section, 'Deleted the "' + label + '" category.');
    renderConfluenceGrid(section);
  }

  function initConfluencePicker(section) {
    var grid = section.querySelector('#confluence-grid');
    var addInput = section.querySelector('#confluence-add-input');
    var addBtn = section.querySelector('#confluence-add-btn');
    if (!grid) return;

    grid.addEventListener('click', function (e) {
      var categoryDelete = e.target.closest('.confluence-category-delete');
      if (categoryDelete) {
        deleteConfluenceCategory(section, categoryDelete.getAttribute('data-category'),
          parseInt(categoryDelete.getAttribute('data-count'), 10) || 0);
        return;
      }
      var chipDelete = e.target.closest('.confluence-chip-delete');
      if (chipDelete) {
        deleteConfluenceParameter(section, chipDelete.getAttribute('data-value'));
        return;
      }
      var chip = e.target.closest('.confluence-chip');
      if (!chip) return;
      toggleConfluenceParameter(section, chip.getAttribute('data-value'));
    });

    if (addBtn) {
      addBtn.addEventListener('click', function () { addConfluenceParameterFromInput(section); });
    }
    if (addInput) {
      addInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        // The form has no submit button wired, but Enter here should add a
        // parameter rather than do nothing.
        e.preventDefault();
        addConfluenceParameterFromInput(section);
      });
      addInput.addEventListener('input', function () { syncConfluenceAddCategory(section); });
    }

    var addCategory = section.querySelector('#confluence-add-category');
    if (addCategory) {
      addCategory.addEventListener('change', function () {
        nteCategoryTouched = true;
        syncConfluenceAddCategory(section);
      });
    }

    var categoryInput = section.querySelector('#confluence-add-category-input');
    var categoryBtn = section.querySelector('#confluence-add-category-btn');
    if (categoryBtn) {
      categoryBtn.addEventListener('click', function () { addConfluenceCategoryFromInput(section); });
    }
    if (categoryInput) {
      categoryInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        addConfluenceCategoryFromInput(section);
      });
      categoryInput.addEventListener('input', function () { showConfluenceCategoryNote(section, '', false); });
    }
  }

  function updateDeltaDisplay(section) {
    var deltaDisplay = section.querySelector('#target-delta');
    var notionalDisplay = section.querySelector('#target-notional');
    var pnlDisplay = section.querySelector('#target-pnl');
    var rMultipleDisplay = section.querySelector('#target-rmultiple');
    var directionInput = section.querySelector('input[name="direction"]:checked');
    var leverageMultiplierInput = section.querySelector('#input-leverage-multiplier');
    var marginModeInput = section.querySelector('input[name="margin_mode"]:checked');

    var ret = computeTradeReturn({
      entryPrice: section.querySelector('#input-entry').value,
      exitPrice: section.querySelector('#input-exit').value,
      direction: directionInput ? directionInput.value : 'long',
      leverage: buildLeverageString(
        leverageMultiplierInput ? leverageMultiplierInput.value : '10',
        marginModeInput ? marginModeInput.value : 'isolated'
      ),
      positionSize: section.querySelector('#input-position-size').value,
      stopLoss: section.querySelector('#input-stop-loss').value
    });

    if (ret) {
      deltaDisplay.textContent = (ret.pctChange >= 0 ? '+' + ret.pctChange.toFixed(2) : ret.pctChange.toFixed(2)) + '% spread';
      deltaDisplay.className = ret.pctChange >= 0
        ? 'font-metric-sm text-metric-sm font-semibold text-tertiary'
        : 'font-metric-sm text-metric-sm font-semibold text-error';
    } else {
      deltaDisplay.textContent = 'Pending Values';
      deltaDisplay.className = 'font-metric-sm text-metric-sm text-on-surface-variant font-semibold';
    }

    if (ret && ret.notionalSize !== null) {
      notionalDisplay.textContent = '$' + ret.notionalSize.toFixed(2);
      notionalDisplay.className = 'font-metric-sm text-metric-sm font-semibold text-on-surface-variant';
    } else {
      notionalDisplay.textContent = 'Pending Values';
      notionalDisplay.className = 'font-metric-sm text-metric-sm text-on-surface-variant font-semibold';
    }

    if (ret && ret.dollarPnl !== null) {
      pnlDisplay.textContent = formatSignedDollars(ret.dollarPnl);
      pnlDisplay.className = 'font-metric-sm text-metric-sm font-semibold ' + (ret.dollarPnl >= 0 ? 'text-tertiary' : 'text-error');
    } else {
      pnlDisplay.textContent = 'Pending Values';
      pnlDisplay.className = 'font-metric-sm text-metric-sm text-on-surface-variant font-semibold';
    }

    if (ret && ret.rMultiple !== null) {
      rMultipleDisplay.textContent = formatSignedR(ret.rMultiple);
      rMultipleDisplay.className = 'font-metric-sm text-metric-sm font-semibold ' + (ret.rMultiple >= 0 ? 'text-tertiary' : 'text-error');
    } else {
      rMultipleDisplay.textContent = 'Pending Values';
      rMultipleDisplay.className = 'font-metric-sm text-metric-sm text-on-surface-variant font-semibold';
    }
  }

  // Deliberately advisory only - a snapshot can live on a shortened or
  // regional domain, so an unexpected host is flagged but never blocks a save.
  function validateChartLink(section) {
    var input = section.querySelector('#input-chart-link');
    var warning = section.querySelector('#chart-link-warning');
    if (!input || !warning) return;
    var value = input.value.trim();
    warning.hidden = !value || value.toLowerCase().indexOf('tradingview.com') !== -1;
  }

  function initNewTradeEntry() {
    var section = sections['new-trade-entry'];
    if (!section) return;

    var form = section.querySelector('#trade-entry-form');
    var entryInput = section.querySelector('#input-entry');
    var exitInput = section.querySelector('#input-exit');
    var saveBtn = section.querySelector('#btn-save-trade');
    var cancelBtn = section.querySelector('#btn-cancel-trade');
    var pairField = section.querySelector('#input-pair');

    initConfluencePicker(section);

    var chartLinkInput = section.querySelector('#input-chart-link');
    if (chartLinkInput) {
      chartLinkInput.addEventListener('input', function () { validateChartLink(section); });
    }

    var slotsEl = section.querySelector('#chart-slots');
    var slotInput = section.querySelector('#chart-slot-input');

    function attachChartFile(tfKey, file) {
      if (!file) return;
      if (!/^image\/(png|jpeg)$/.test(file.type)) {
        nteChartErrors[tfKey] = 'Use a PNG or JPG image';
        renderChartSlots(section);
        return;
      }
      if (file.size > MAX_CHART_INPUT_BYTES) {
        nteChartErrors[tfKey] = file.name + ' is larger than 10MB';
        renderChartSlots(section);
        return;
      }
      delete nteChartErrors[tfKey];
      var epoch = nteChartEpoch;
      compressChartImage(file).then(function (result) {
        if (epoch !== nteChartEpoch) return;
        nteChartImages[tfKey] = result;
        renderChartSlots(section);
      }).catch(function () {
        if (epoch !== nteChartEpoch) return;
        nteChartErrors[tfKey] = 'Couldn\u2019t read that image';
        renderChartSlots(section);
      });
    }

    function slotFromEvent(e) {
      return e.target.closest ? e.target.closest('.chart-slot') : null;
    }

    function openSlotPicker(slot) {
      nteChartTargetTf = slot.getAttribute('data-tf');
      slotInput.value = '';
      slotInput.click();
    }

    if (slotsEl && slotInput) {
      slotsEl.addEventListener('click', function (e) {
        var removeBtn = e.target.closest ? e.target.closest('.chart-slot-remove') : null;
        if (removeBtn) {
          var removeKey = removeBtn.getAttribute('data-tf');
          nteChartImages[removeKey] = null;
          delete nteChartErrors[removeKey];
          renderChartSlots(section);
          return;
        }
        var slot = slotFromEvent(e);
        if (slot) openSlotPicker(slot);
      });
      slotsEl.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var slot = slotFromEvent(e);
        if (!slot || e.target !== slot) return;
        e.preventDefault();
        openSlotPicker(slot);
      });
      slotsEl.addEventListener('dragover', function (e) {
        var slot = slotFromEvent(e);
        if (!slot) return;
        e.preventDefault();
        slot.classList.add('ring-2', 'ring-primary');
      });
      slotsEl.addEventListener('dragleave', function (e) {
        var slot = slotFromEvent(e);
        if (slot && !slot.contains(e.relatedTarget)) slot.classList.remove('ring-2', 'ring-primary');
      });
      slotsEl.addEventListener('drop', function (e) {
        var slot = slotFromEvent(e);
        if (!slot) return;
        e.preventDefault();
        slot.classList.remove('ring-2', 'ring-primary');
        attachChartFile(slot.getAttribute('data-tf'), e.dataTransfer && e.dataTransfer.files[0]);
      });
      slotInput.addEventListener('change', function (e) {
        if (nteChartTargetTf) attachChartFile(nteChartTargetTf, e.target.files[0]);
      });
    }

    function updateDelta() { updateDeltaDisplay(section); }
    if (entryInput) entryInput.addEventListener('input', updateDelta);
    if (exitInput) exitInput.addEventListener('input', updateDelta);
    var positionSizeInputEl = section.querySelector('#input-position-size');
    var stopLossInputEl = section.querySelector('#input-stop-loss');
    if (positionSizeInputEl) positionSizeInputEl.addEventListener('input', updateDelta);
    if (stopLossInputEl) stopLossInputEl.addEventListener('input', updateDelta);
    form.querySelectorAll('input[name="direction"]').forEach(function (r) { r.addEventListener('change', updateDelta); });
    var leverageMultiplierEl = section.querySelector('#input-leverage-multiplier');
    if (leverageMultiplierEl) leverageMultiplierEl.addEventListener('change', updateDelta);
    form.querySelectorAll('input[name="margin_mode"]').forEach(function (r) { r.addEventListener('change', updateDelta); });

    function collectChartLink() {
      var linkInput = section.querySelector('#input-chart-link');
      var url = linkInput ? linkInput.value.trim() : '';
      return url ? { type: 'link', value: url } : null;
    }

    function collectTrade() {
      var directionInput = form.querySelector('input[name="direction"]:checked');
      var prevCandleInput = form.querySelector('input[name="prev_candle"]:checked');
      var outcomeInput = form.querySelector('input[name="outcome"]:checked');
      var dateInput = section.querySelector('#input-date');
      var leverageMultiplierInput = section.querySelector('#input-leverage-multiplier');
      var marginModeInput = form.querySelector('input[name="margin_mode"]:checked');
      var positionSizeInput = section.querySelector('#input-position-size');
      var stopLossInput = section.querySelector('#input-stop-loss');
      var entryTimeInput = section.querySelector('#input-entry-time');
      var notesInput = section.querySelector('#input-notes');

      var originalTrade = nteEditingTradeId ? TradeStore.getById(nteEditingTradeId) : null;

      var trade = {
        id: nteEditingTradeId || ('trade-' + Date.now()),
        date: dateInput && dateInput.value ? dateInput.value : new Date().toISOString().slice(0, 10),
        entryTime: entryTimeInput && entryTimeInput.value ? entryTimeInput.value : '',
        pair: normalizePairSymbol(pairField.value),
        direction: directionInput ? directionInput.value : 'long',
        leverage: buildLeverageString(
          leverageMultiplierInput ? leverageMultiplierInput.value : '10',
          marginModeInput ? marginModeInput.value : 'isolated'
        ),
        prevCandle: prevCandleInput ? prevCandleInput.value : 'bullish',
        entryPrice: entryInput ? entryInput.value.trim() : '',
        exitPrice: exitInput ? exitInput.value.trim() : '',
        positionSize: positionSizeInput ? positionSizeInput.value.trim() : '',
        stopLoss: stopLossInput ? stopLossInput.value.trim() : '',
        outcome: outcomeInput ? outcomeInput.value : 'open',
        parameters: nteSelectedParameters.slice(),
        charts: CHART_TIMEFRAMES.reduce(function (acc, tf) { acc[tf.key] = nteChartImages[tf.key]; return acc; }, {}),
        chart: collectChartLink(),
        notes: notesInput ? notesInput.value.trim() : ''
      };

      // Editing an imported trade shouldn't erase where it came from, or the
      // exact exchange-reported P&L/fee/duplicate-flag data - the form has
      // no fields for these, so carry them forward from the original record.
      if (originalTrade) {
        // The form has no per-factor status control either; keep the statuses
        // set from the case study, dropping any for a parameter just removed.
        var carriedStatuses = {};
        trade.parameters.forEach(function (name) {
          var status = originalTrade.parameterStatus && originalTrade.parameterStatus[name];
          if (status === 'pending' || status === 'failed') carriedStatuses[name] = status;
        });
        trade.parameterStatus = carriedStatuses;
        trade.source = originalTrade.source || 'manual';
        if (typeof originalTrade.realizedPnl === 'number') trade.realizedPnl = originalTrade.realizedPnl;
        if (typeof originalTrade.fee === 'number') trade.fee = originalTrade.fee;
        if (originalTrade.matchWarning) trade.matchWarning = originalTrade.matchWarning;
      } else {
        trade.source = 'manual';
      }

      return trade;
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        if (!pairField.value.trim()) {
          pairField.classList.add('ring-2', 'ring-error');
          pairField.focus();
          return;
        }
        pairField.classList.remove('ring-2', 'ring-error');

        var trade = collectTrade();
        var wasEditing = nteEditingTradeId;
        var wasPromoting = ntePromotingPositionId;
        var originalHtml = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span> Saving...';
        setTimeout(function () {
          var ok = wasEditing ? TradeStore.update(wasEditing, trade) : TradeStore.add(trade);
          if (!ok) {
            saveBtn.innerHTML = originalHtml;
            window.alert('Could not save — local storage is full. Try a smaller chart image, or export/remove some old trades.');
            return;
          }
          // A promoted position is linked to the trade it produced, so the
          // ledger row can point at the resulting case study from now on.
          if (wasPromoting) PositionStore.update(wasPromoting, { linkedTradeId: trade.id });
          saveBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">check</span> Saved';
          setTimeout(function () {
            saveBtn.innerHTML = originalHtml;
            if (wasEditing || wasPromoting) {
              window.AppRouter.navigate('case-studies', trade.id);
            } else {
              window.AppRouter.navigate('trade-journal');
            }
          }, 900);
        }, 600);
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        window.AppRouter.navigate(lastNonFormSlug, lastNonFormParam);
      });
    }
  }

  function enterNewTradeEntry(tradeIdParam) {
    var section = sections['new-trade-entry'];
    if (!section) return;

    var form = section.querySelector('#trade-entry-form');
    var headingEl = section.querySelector('#nte-heading');
    var stageBadgeEl = section.querySelector('#nte-stage-badge');
    var saveBtn = section.querySelector('#btn-save-trade');

    // "promote:<positionId>" enters the form pre-filled from a Position
    // History row rather than from an existing trade.
    var rawParam = tradeIdParam ? decodeURIComponent(tradeIdParam) : null;
    var promotingPosition = null;
    var tradeId = rawParam;
    if (rawParam && rawParam.indexOf('promote:') === 0) {
      promotingPosition = PositionStore.getById(rawParam.slice('promote:'.length));
      tradeId = null;
      // A position can only be promoted once - if it already produced a
      // trade, send the user to that case study instead of a second form.
      if (promotingPosition && promotingPosition.linkedTradeId) {
        window.AppRouter.navigate('case-studies', promotingPosition.linkedTradeId);
        return;
      }
    }
    var trade = tradeId ? TradeStore.getById(tradeId) : null;

    form.reset();
    nteChartEpoch += 1;
    nteChartImages = { daily: null, h4: null, m15: null };
    nteChartErrors = {};
    nteChartTargetTf = null;
    ntePromotingPositionId = null;
    nteSelectedParameters = trade ? nonEmptyConfluence(trade).slice() : [];
    renderConfluenceGrid(section);
    var confluenceAddInput = section.querySelector('#confluence-add-input');
    if (confluenceAddInput) confluenceAddInput.value = '';
    nteCategoryTouched = false;
    var confluenceCategoryInput = section.querySelector('#confluence-add-category-input');
    if (confluenceCategoryInput) confluenceCategoryInput.value = '';
    showConfluenceCategoryNote(section, '', false);
    syncConfluenceAddCategory(section);

    if (trade) {
      nteEditingTradeId = trade.id;
      section.querySelector('#input-date').value = trade.date || '';
      section.querySelector('#input-entry-time').value = trade.entryTime || '';
      section.querySelector('#input-pair').value = trade.pair || '';
      var editLeverageMultiplier = parseFloat((trade.leverage || '').match(/[\d.]+/) || 10);
      var multiplierSelect = section.querySelector('#input-leverage-multiplier');
      var hasOption = Array.prototype.some.call(multiplierSelect.options, function (o) { return Number(o.value) === editLeverageMultiplier; });
      multiplierSelect.value = hasOption ? String(editLeverageMultiplier) : '10';
      var marginModeRadio = form.querySelector('input[name="margin_mode"][value="' + parseLeverageMode(trade.leverage) + '"]');
      if (marginModeRadio) marginModeRadio.checked = true;
      section.querySelector('#input-entry').value = trade.entryPrice || '';
      section.querySelector('#input-exit').value = trade.exitPrice || '';
      section.querySelector('#input-position-size').value = trade.positionSize || '';
      section.querySelector('#input-stop-loss').value = trade.stopLoss || '';
      section.querySelector('#input-notes').value = trade.notes || '';
      ['direction', 'prev_candle', 'outcome'].forEach(function (name) {
        var value = name === 'direction' ? trade.direction : name === 'prev_candle' ? trade.prevCandle : trade.outcome;
        var radio = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
        if (radio) radio.checked = true;
      });
      CHART_TIMEFRAMES.forEach(function (tf) {
        nteChartImages[tf.key] = tradeCharts(trade)[tf.key];
      });
      var linkField = section.querySelector('#input-chart-link');
      if (linkField) linkField.value = trade.chart && trade.chart.type === 'link' ? (trade.chart.value || '') : '';
      if (headingEl) headingEl.textContent = 'Edit Trade';
      if (stageBadgeEl) { stageBadgeEl.textContent = 'STAGE: EDIT'; }
      if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> Save Changes';
    } else if (promotingPosition) {
      nteEditingTradeId = null;
      ntePromotingPositionId = promotingPosition.id;
      var local = positionLocalDateTime(promotingPosition);
      section.querySelector('#input-date').value = local.date;
      section.querySelector('#input-entry-time').value = local.time;
      section.querySelector('#input-pair').value = normalizePairSymbol(promotingPosition.pair);
      section.querySelector('#input-entry').value = promotingPosition.entryPrice === null ? '' : String(promotingPosition.entryPrice);
      section.querySelector('#input-exit').value = promotingPosition.closePrice === null ? '' : String(promotingPosition.closePrice);
      // The export has no leverage column, so it's left explicitly unknown.
      section.querySelector('#input-leverage-multiplier').value = '';
      var promoteDirection = form.querySelector('input[name="direction"][value="' + promotingPosition.direction + '"]');
      if (promoteDirection) promoteDirection.checked = true;
      var promoteOutcome = form.querySelector('input[name="outcome"][value="' + outcomeFromRealizedPnl(promotingPosition.pnl) + '"]');
      if (promoteOutcome) promoteOutcome.checked = true;
      if (headingEl) headingEl.textContent = 'Promote to Case Study';
      if (stageBadgeEl) { stageBadgeEl.textContent = 'STAGE: PROMOTE'; }
      if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> Save Trade';
    } else {
      nteEditingTradeId = null;
      ntePromotingPositionId = null;
      if (headingEl) headingEl.textContent = 'New Trade Entry';
      if (stageBadgeEl) { stageBadgeEl.textContent = 'STAGE: DRAFT'; }
      if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> Save Trade';
    }

    renderChartSlots(section);
    validateChartLink(section);
    updateDeltaDisplay(section);
  }

  // ---------------------------------------------------------------------
  // Insights Dashboard screen
  // ---------------------------------------------------------------------

  function renderInsightsDashboard() {
    var section = sections['insights-dashboard'];
    if (!section) return;

    var allTrades = TradeStore.getAll();
    var closed = allTrades.filter(function (t) { return t.outcome === 'win' || t.outcome === 'loss'; });
    var rTrades = [];
    var totalR = 0;
    closed.forEach(function (t) {
      var ret = computeTradeReturn(t);
      if (ret && ret.rMultiple !== null) { rTrades.push(t); totalR += ret.rMultiple; }
    });

    // Same helper the Trade Journal header uses, so the two screens can
    // never disagree about what "documented setups P&L" means.
    var docStats = computeTradeJournalPnl(allTrades);
    var positions = PositionStore.getAll();
    var posStats = positions.length ? computePositionStats(positions) : null;

    var valueEl = section.querySelector('#ins-profitability-value');
    var subEl = section.querySelector('#ins-profitability-sub');
    var barEl = section.querySelector('#ins-profitability-bar');
    var iconEl = section.querySelector('#ins-profitability-icon');
    var evidenceEl = section.querySelector('#ins-profitability-evidence');
    if (!valueEl || !subEl || !barEl || !iconEl) return;

    // This KPI is strictly the documented-setup sample. Account-wide P&L
    // lives in its own metric below and is never blended into this one.
    if (docStats.covered) {
      var docPositive = docStats.total >= 0;
      valueEl.textContent = formatSignedMoney(docStats.total);
      valueEl.className = 'text-headline-lg font-headline-lg ' + (docPositive ? 'text-tertiary' : 'text-error');
      subEl.textContent = docStats.covered + '/' + docStats.totalTrades + ' trades w/ P&L · avg ' + formatSignedMoney(docStats.average);
      barEl.style.width = Math.round((docStats.covered / Math.max(docStats.totalTrades, 1)) * 100) + '%';
      barEl.className = 'h-full rounded-full ' + (docPositive ? 'bg-tertiary' : 'bg-error');
      iconEl.textContent = docPositive ? 'trending_up' : 'trending_down';
      iconEl.className = 'material-symbols-outlined text-[18px] ' + (docPositive ? 'text-tertiary' : 'text-error');
      if (evidenceEl) {
        evidenceEl.textContent = formatSignedMoney(docStats.total) + ' across ' + docStats.covered + ' documented trade' + (docStats.covered === 1 ? '' : 's');
        evidenceEl.className = 'font-metric-md text-metric-md font-medium mt-1 ' + (docPositive ? 'text-tertiary' : 'text-error');
      }
    } else if (rTrades.length) {
      var avgR = totalR / rTrades.length;
      valueEl.textContent = formatSignedR(avgR);
      valueEl.className = 'text-headline-lg font-headline-lg ' + (avgR >= 0 ? 'text-tertiary' : 'text-error');
      subEl.textContent = 'avg R across ' + rTrades.length + ' trade' + (rTrades.length === 1 ? '' : 's') + ', no $ P&L yet';
      barEl.style.width = Math.round((rTrades.length / Math.max(closed.length, 1)) * 100) + '%';
      barEl.className = 'h-full rounded-full ' + (avgR >= 0 ? 'bg-tertiary' : 'bg-error');
      iconEl.textContent = 'trending_up';
      iconEl.className = 'material-symbols-outlined text-[18px] ' + (avgR >= 0 ? 'text-tertiary' : 'text-error');
      if (evidenceEl) {
        evidenceEl.textContent = 'avg ' + formatSignedR(avgR) + ' across ' + rTrades.length + ' trade' + (rTrades.length === 1 ? '' : 's');
        evidenceEl.className = 'font-metric-md text-metric-md font-medium mt-1 ' + (avgR >= 0 ? 'text-tertiary' : 'text-error');
      }
    } else {
      valueEl.textContent = 'Unavailable';
      valueEl.className = 'text-headline-lg font-headline-lg text-secondary';
      subEl.textContent = 'no P&L or R-multiple logged';
      barEl.style.width = '0%';
      barEl.className = 'bg-outline-variant h-full rounded-full';
      iconEl.textContent = 'pending_actions';
      iconEl.className = 'material-symbols-outlined text-[18px] text-error';
      if (evidenceEl) {
        evidenceEl.textContent = 'Unavailable';
        evidenceEl.className = 'font-metric-md text-metric-md font-medium text-error mt-1';
      }
    }

    renderPnlComparison(section, docStats, posStats);
  }

  var COMPARISON_MIN_SAMPLE = 5;

  function setComparisonMoney(el, value, hasValue, fallback) {
    if (!el) return;
    var sizeClass = el.id === 'ins-cmp-doc-avg' || el.id === 'ins-cmp-acc-avg'
      ? 'font-metric-lg text-metric-lg font-bold '
      : 'font-metric-md text-metric-md font-semibold ';
    if (!hasValue) {
      el.textContent = fallback;
      el.className = sizeClass + 'text-secondary';
      return;
    }
    el.textContent = formatSignedMoney(value);
    el.className = sizeClass + (value >= 0 ? 'text-tertiary' : 'text-error');
  }

  function setSmallSampleNote(el, count, hasData) {
    if (!el) return;
    if (hasData && count < COMPARISON_MIN_SAMPLE) {
      el.textContent = 'Still a small sample (' + count + ' trade' + (count === 1 ? '' : 's') + ') — treat this comparison as early, not conclusive.';
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  // Answers the question the rest of the app can't: does tagging a setup with
  // confluence parameters correlate with it doing better than an average
  // trade? Compared on average-per-trade, never on totals - the two samples
  // differ wildly in size, and a promoted position deliberately appears in
  // both, so the totals are two lenses rather than addends.
  function renderPnlComparison(section, docStats, posStats) {
    var card = section.querySelector('#ins-pnl-comparison');
    if (!card) return;
    var hasDoc = docStats.covered > 0;
    if (!hasDoc && !posStats) {
      card.hidden = true;
      return;
    }
    card.hidden = false;

    section.querySelector('#ins-cmp-doc-count').textContent = hasDoc
      ? docStats.covered + ' of ' + docStats.totalTrades
      : '—';
    section.querySelector('#ins-cmp-doc-winrate').textContent = hasDoc
      ? docStats.winRateByPnl + '% (' + docStats.winsByPnl + 'W/' + docStats.lossesByPnl + 'L)'
      : '—';
    setComparisonMoney(section.querySelector('#ins-cmp-doc-total'), docStats.total, hasDoc, 'Not recorded');
    setComparisonMoney(section.querySelector('#ins-cmp-doc-avg'), docStats.average, hasDoc, '—');
    setSmallSampleNote(section.querySelector('#ins-cmp-doc-note'), docStats.covered, hasDoc);

    var accAvg = posStats ? posStats.totalPnl / posStats.count : 0;
    section.querySelector('#ins-cmp-acc-count').textContent = posStats ? String(posStats.count) : '—';
    section.querySelector('#ins-cmp-acc-winrate').textContent = posStats
      ? posStats.winRate.toFixed(1) + '% (' + posStats.wins + 'W/' + posStats.losses + 'L)'
      : '—';
    setComparisonMoney(section.querySelector('#ins-cmp-acc-total'), posStats ? posStats.totalPnl : 0, !!posStats, 'Not imported');
    setComparisonMoney(section.querySelector('#ins-cmp-acc-avg'), accAvg, !!posStats, '—');
    setSmallSampleNote(section.querySelector('#ins-cmp-acc-note'), posStats ? posStats.count : 0, !!posStats);

    // Both sides are compared gross, since documented trades carry no fee
    // data at all - the real net figure is surfaced here instead of being
    // quietly folded into a comparison it would skew.
    var feesEl = section.querySelector('#ins-cmp-acc-fees');
    if (feesEl) {
      feesEl.textContent = posStats
        ? 'Net of ' + formatMoney(posStats.totalFees) + ' fees: ' + formatSignedMoney(posStats.netPnl)
        : 'Import a MEXC export on Position History to fill this in.';
    }

    var verdictEl = section.querySelector('#ins-cmp-verdict');
    if (!verdictEl) return;
    if (!hasDoc || !posStats) {
      verdictEl.textContent = hasDoc
        ? 'Import your exchange history on Position History to see whether these documented setups beat your average trade.'
        : 'Record entry and exit prices on a few journal trades to see whether documented setups beat your average trade.';
      return;
    }

    var gap = docStats.average - accAvg;
    if (gap > 0) {
      verdictEl.innerHTML = 'Your documented setups average <span class="font-semibold text-tertiary">' +
        escapeHtml(formatMoney(gap)) + ' more per trade</span> than your average position — logging the confluence checklist appears to correlate with better trades.';
    } else {
      verdictEl.innerHTML = 'Your documented setups <span class="font-semibold">aren\'t yet outperforming</span> your average trade' +
        (gap < 0 ? ' (' + escapeHtml(formatMoney(Math.abs(gap))) + ' behind per trade)' : '') +
        ' — still an early signal given the sample size.';
    }
  }

  // ---------------------------------------------------------------------
  // Header quick search
  // ---------------------------------------------------------------------

  var HEADER_SEARCH_MIN_CHARS = 2;
  var HEADER_SEARCH_MAX_RESULTS = 8;
  var HEADER_SEARCH_DEBOUNCE_MS = 150;

  function headerSearchResults(rawQuery) {
    var query = rawQuery.trim().toLowerCase();
    if (query.length < HEADER_SEARCH_MIN_CHARS) return [];

    var results = [];

    TradeStore.getAll().forEach(function (t) {
      var haystack = ((t.pair || '') + ' ' + (t.notes || '')).toLowerCase();
      if (haystack.indexOf(query) === -1) return;
      var ret = computeTradeReturn(t);
      results.push({
        type: 'trade', id: t.id, pair: t.pair, date: t.date,
        pnl: ret ? ret.dollarPnl : null
      });
    });

    PositionStore.getAll().forEach(function (p) {
      if ((p.pair || '').toLowerCase().indexOf(query) === -1) return;
      results.push({ type: 'position', id: p.id, pair: p.pair, date: p.openTime, pnl: p.pnl });
    });

    results.sort(function (a, b) {
      if (a.type !== b.type) return a.type === 'trade' ? -1 : 1;
      return (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0);
    });

    return results.slice(0, HEADER_SEARCH_MAX_RESULTS);
  }

  function headerSearchResultHtml(r) {
    var badgeClass = r.type === 'trade' ? 'bg-secondary-container text-on-secondary-fixed' : 'bg-primary/10 text-primary';
    var badgeLabel = r.type === 'trade' ? 'Journal entry' : 'Position';
    var pnlHtml = (r.pnl === null || r.pnl === undefined)
      ? '<span class="text-secondary">—</span>'
      : '<span class="' + (r.pnl > 0 ? 'text-tertiary' : (r.pnl < 0 ? 'text-error' : 'text-secondary')) + ' font-semibold">' + formatSignedMoney(r.pnl) + '</span>';
    var dateLabel = r.type === 'trade' ? formatDateLabel(r.date) : formatIsoDateTime(r.date);
    return (
      '<button type="button" class="header-search-result w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-surface-container-low transition-colors text-left" ' +
        'data-result-type="' + r.type + '" data-result-id="' + escapeHtml(r.id) + '" data-result-pair="' + escapeHtml(r.pair) + '">' +
        '<div class="flex flex-col min-w-0">' +
          '<span class="font-metric-md text-metric-md font-bold text-on-surface truncate">' + escapeHtml(r.pair) + '</span>' +
          '<span class="font-metric-sm text-metric-sm text-secondary">' + escapeHtml(dateLabel) + '</span>' +
        '</div>' +
        '<div class="flex items-center gap-2 shrink-0">' + pnlHtml +
          '<span class="' + badgeClass + ' font-metric-sm text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide">' + badgeLabel + '</span>' +
        '</div>' +
      '</button>'
    );
  }

  function initHeaderSearch() {
    var toggle = document.getElementById('header-search-toggle');
    var panel = document.getElementById('header-search-panel');
    var input = document.getElementById('header-search-input');
    var resultsEl = document.getElementById('header-search-results');
    if (!toggle || !panel || !input || !resultsEl) return;

    var debounceTimer = null;

    function renderResults() {
      var trimmed = (input.value || '').trim();
      if (!trimmed.length) {
        resultsEl.innerHTML = '<div class="px-3 py-4 text-center font-body-sm text-body-sm text-secondary">Search your journal trades and imported positions.</div>';
        return;
      }
      if (trimmed.length < HEADER_SEARCH_MIN_CHARS) {
        resultsEl.innerHTML = '<div class="px-3 py-4 text-center font-body-sm text-body-sm text-secondary">Keep typing to search…</div>';
        return;
      }
      var results = headerSearchResults(input.value);
      resultsEl.innerHTML = results.length
        ? results.map(headerSearchResultHtml).join('')
        : '<div class="px-3 py-4 text-center font-body-sm text-body-sm text-secondary">No trades or positions match "' + escapeHtml(trimmed) + '".</div>';
    }

    function openPanel() {
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      renderResults();
      input.focus();
    }

    function closePanel() {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', function () {
      if (panel.hidden) openPanel(); else closePanel();
    });

    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(renderResults, HEADER_SEARCH_DEBOUNCE_MS);
    });

    resultsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.header-search-result');
      if (!btn) return;
      var type = btn.getAttribute('data-result-type');
      var id = btn.getAttribute('data-result-id');
      var pair = btn.getAttribute('data-result-pair');
      closePanel();
      input.value = '';

      if (type === 'trade') {
        window.AppRouter.navigate('case-studies', id);
      } else {
        phState.search = pair;
        phState.page = 1;
        var phSection = sections['position-history'];
        var phSearchInput = phSection && phSection.querySelector('#ph-search');
        if (phSearchInput) phSearchInput.value = pair;
        // Setting the hash to the screen it's already on won't fire
        // hashchange, so the filtered results wouldn't otherwise apply
        // without leaving and returning to the screen.
        if (phSection && !phSection.hidden) renderPositionHistory();
        window.AppRouter.navigate('position-history');
      }
    });

    document.addEventListener('click', function (e) {
      if (panel.hidden) return;
      if (toggle.contains(e.target) || panel.contains(e.target)) return;
      closePanel();
    });

    document.addEventListener('keydown', function (e) {
      if (panel.hidden) return;
      if (e.key === 'Escape') { closePanel(); toggle.focus(); }
    });

    document.addEventListener('screenchange', closePanel);
  }

  // ---------------------------------------------------------------------
  // GitHub Sync — backs trades/positions/chart images/confluence categories
  // & parameter vocabulary up to a private GitHub repo the user configures
  // in the header panel. Every entry point
  // below no-ops immediately when ghConfigGet() returns null, so the app
  // behaves exactly as it does with sync never set up.
  // ---------------------------------------------------------------------

  var GITHUB_API_BASE = 'https://api.github.com';
  var GITHUB_PUSH_DEBOUNCE_MS = 4000;
  var GITHUB_SYNC_CONFIG_KEY = 'tj_github_sync_config';
  var GITHUB_SYNC_META_KEY = 'tj_github_sync_meta';
  var GITHUB_IMAGE_STATE_KEY = 'tj_github_image_state';
  var PRE_PULL_SNAPSHOT_KEY = 'tj_pre_pull_snapshot';

  // Suppresses scheduleGithubSync() while a just-pulled remote snapshot is
  // being written back into TradeStore/PositionStore, so pulling doesn't
  // immediately schedule a redundant push of the data we just received.
  var githubSyncApplyingRemote = false;
  var githubPushDebounceTimer = null;

  function ghConfigGet() {
    try {
      var raw = localStorage.getItem(GITHUB_SYNC_CONFIG_KEY);
      if (!raw) return null;
      var cfg = JSON.parse(raw);
      if (!cfg || !cfg.owner || !cfg.repo || !cfg.token) return null;
      cfg.branch = cfg.branch || 'main';
      return cfg;
    } catch (e) {
      return null;
    }
  }

  function ghConfigSet(cfg) {
    try {
      localStorage.setItem(GITHUB_SYNC_CONFIG_KEY, JSON.stringify(cfg));
      return true;
    } catch (e) {
      return false;
    }
  }

  function ghConfigClear() {
    try {
      localStorage.removeItem(GITHUB_SYNC_CONFIG_KEY);
      localStorage.removeItem(GITHUB_SYNC_META_KEY);
      localStorage.removeItem(GITHUB_IMAGE_STATE_KEY);
    } catch (e) {}
  }

  function ghMetaGet() {
    try {
      var raw = localStorage.getItem(GITHUB_SYNC_META_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function ghMetaSet(patch) {
    try {
      var current = ghMetaGet();
      Object.keys(patch).forEach(function (k) { current[k] = patch[k]; });
      localStorage.setItem(GITHUB_SYNC_META_KEY, JSON.stringify(current));
    } catch (e) {}
  }

  function ghImageStateGet() {
    try {
      var raw = localStorage.getItem(GITHUB_IMAGE_STATE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function ghImageStateSet(map) {
    try {
      localStorage.setItem(GITHUB_IMAGE_STATE_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  // A single-slot "undo" for pullFromGitHub() - captures local state right
  // before remote data is applied, so a bad pull (wrong repo, unexpected
  // remote content) can be rolled back from inside the app even with no
  // OS-level backup. Best-effort: if localStorage is near its quota the
  // write silently no-ops rather than blocking the pull it's protecting.
  function savePrePullSnapshot() {
    try {
      localStorage.setItem(PRE_PULL_SNAPSHOT_KEY, JSON.stringify({
        savedAt: Date.now(),
        trades: TradeStore.getAll(),
        positions: PositionStore.getAll(),
        categories: loadParamCategories(),
        vocabulary: loadConfluenceVocabulary(),
        removedDefaults: getRemovedDefaults()
      }));
    } catch (e) {}
  }

  function getPrePullSnapshot() {
    try {
      var raw = localStorage.getItem(PRE_PULL_SNAPSHOT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function restorePrePullSnapshot() {
    var snapshot = getPrePullSnapshot();
    if (!snapshot) {
      window.alert('No pre-sync snapshot is available yet - one is saved automatically each time data is pulled from GitHub.');
      return;
    }
    var when = new Date(snapshot.savedAt).toLocaleString();
    if (!window.confirm('Restore local trades, positions, categories, and parameters to how they were just before the last pull (' + when + ')?\n\nAnything changed since then on this device will be lost.')) {
      return;
    }
    TradeStore.setAll(snapshot.trades || []);
    PositionStore.setAll(snapshot.positions || []);
    if (Array.isArray(snapshot.categories)) saveParamCategories(snapshot.categories);
    if (Array.isArray(snapshot.vocabulary)) saveConfluenceVocabulary(snapshot.vocabulary);
    if (Array.isArray(snapshot.removedDefaults)) saveRemovedDefaults(snapshot.removedDefaults);
    if (activeSlug && activeSlug !== 'new-trade-entry') renderForScreen(activeSlug, activeParam);
    window.alert('Restored. This device now differs from GitHub - push when ready.');
  }

  // btoa/atob only handle Latin1 - trade notes can contain emoji/curly
  // quotes/etc, so JSON text is routed through TextEncoder/TextDecoder
  // first to stay correct for arbitrary UTF-8. Image bytes never go
  // through these - they're handled as raw bytes end to end (see
  // bytesToBase64) so binary data is never at risk of text-decoding
  // corruption.
  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToUtf8(b64) {
    var binary = atob(b64.replace(/\n/g, ''));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function bytesToBase64(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function ghAuthError(status) {
    var err = new Error('request failed (' + status + ') - check the repo owner/name and that the token has Contents: Read and write access');
    err.ghStatus = status;
    return err;
  }

  // opts.raw fetches the raw-media-type response as bytes (ArrayBuffer)
  // instead of the default JSON-wrapped response.
  function ghRequest(method, cfg, path, opts) {
    opts = opts || {};
    var headers = {
      'Authorization': 'Bearer ' + cfg.token,
      'Accept': opts.raw ? 'application/vnd.github.raw' : 'application/vnd.github+json'
    };
    var body;
    if (opts.body) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    return fetch(GITHUB_API_BASE + '/repos/' + cfg.owner + '/' + cfg.repo + path, {
      method: method, headers: headers, body: body
    }).then(function (res) {
      if (opts.raw) {
        return res.arrayBuffer().then(function (buf) {
          return { status: res.status, bytes: new Uint8Array(buf) };
        });
      }
      return res.json().catch(function () { return null; }).then(function (json) {
        return { status: res.status, json: json };
      });
    });
  }

  // Resolves { exists:false } for a 404 - the expected "nothing pushed
  // yet" case on a brand-new data repo, not an error. `binary` skips
  // UTF-8 decoding and keeps `text` as base64, for image files.
  function ghGetFile(cfg, path, binary) {
    return ghRequest('GET', cfg, '/contents/' + path + '?ref=' + encodeURIComponent(cfg.branch)).then(function (res) {
      if (res.status === 404) return { exists: false };
      if (res.status === 401 || res.status === 403) throw ghAuthError(res.status);
      if (res.status < 200 || res.status >= 300) throw new Error('unexpected status ' + res.status + ' fetching ' + path);
      var body = res.json;
      // Verified against the live API: for files over the Contents API's
      // ~1MB inline-content ceiling, `content` is present but an EMPTY
      // string, not omitted - so this must check for non-empty content,
      // not just its presence, or an oversized chart image would silently
      // come back blank instead of falling through to the raw fetch below.
      if (body && typeof body.content === 'string' && body.content.length > 0) {
        var cleanedB64 = body.content.replace(/\n/g, '');
        return { exists: true, sha: body.sha, text: binary ? cleanedB64 : base64ToUtf8(cleanedB64) };
      }
      // File exceeds the Contents API's inline-content size ceiling (chart
      // images can) - fetch the raw bytes directly instead.
      return ghRequest('GET', cfg, '/contents/' + path + '?ref=' + encodeURIComponent(cfg.branch), { raw: true }).then(function (rawRes) {
        if (rawRes.status < 200 || rawRes.status >= 300) throw new Error('unexpected status ' + rawRes.status + ' fetching raw ' + path);
        var text = binary ? bytesToBase64(rawRes.bytes) : new TextDecoder().decode(rawRes.bytes);
        return { exists: true, sha: body ? body.sha : null, text: text };
      });
    });
  }

  // Creates or updates a file. Resolves { ok:false, status } on a sha
  // conflict (409/422) instead of throwing, so callers can refetch + retry.
  function ghPutFile(cfg, path, base64Content, sha, message) {
    var body = { message: message, content: base64Content, branch: cfg.branch };
    if (sha) body.sha = sha;
    return ghRequest('PUT', cfg, '/contents/' + path, { body: body }).then(function (res) {
      if (res.status === 401 || res.status === 403) throw ghAuthError(res.status);
      if (res.status === 200 || res.status === 201) {
        return { ok: true, sha: res.json && res.json.content ? res.json.content.sha : null };
      }
      return { ok: false, status: res.status };
    });
  }

  function simpleHash(str) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16);
  }

  var IMAGE_EXT_MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp'
  };

  function mimeForExtension(ext) {
    return IMAGE_EXT_MIME[(ext || '').toLowerCase()] || 'application/octet-stream';
  }

  function deriveImageExtension(chart) {
    if (chart.name) {
      var m = chart.name.match(/\.([a-zA-Z0-9]+)$/);
      if (m) return m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
    }
    if (chart.value) {
      var mime = chart.value.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/);
      if (mime) return mime[1].toLowerCase() === 'jpeg' ? 'jpg' : mime[1].toLowerCase();
    }
    return 'png';
  }

  // The transform that keeps chart images out of the committed JSON - the
  // local TradeStore copy is never touched, only this outbound payload.
  function buildRemoteTradesPayload(trades) {
    return trades.map(function (t) {
      var charts = t.charts;
      var hasUpload = charts && CHART_TIMEFRAMES.some(function (tf) { return charts[tf.key] && charts[tf.key].value; });
      if (!hasUpload) return t;
      var copy = {};
      Object.keys(t).forEach(function (k) { copy[k] = t[k]; });
      copy.charts = {};
      CHART_TIMEFRAMES.forEach(function (tf) {
        var image = charts[tf.key];
        copy.charts[tf.key] = image && image.value
          ? { type: 'upload-ref', ref: chartImagePath(t.id, tf.key, image), name: image.name || '' }
          : null;
      });
      return copy;
    });
  }

  function chartImagePath(tradeId, tfKey, image) {
    return 'images/' + tradeId + '-' + tfKey + '.' + deriveImageExtension(image);
  }

  // The confluence category list and parameter vocabulary travel alongside
  // trades/positions so a new device gets the same categories and
  // sub-categories instead of falling back to the built-in defaults.
  function buildRemoteParamsPayload() {
    return {
      categories: loadParamCategories(),
      vocabulary: loadConfluenceVocabulary(),
      removedDefaults: getRemovedDefaults()
    };
  }

  function computeDataFingerprint(trades, positions) {
    return simpleHash(JSON.stringify(buildRemoteTradesPayload(trades)) + JSON.stringify(positions) + JSON.stringify(buildRemoteParamsPayload()));
  }

  // Skips re-uploading (and re-committing) a chart image whose bytes
  // haven't changed since the last successful push. A failed upload is
  // deliberately left out of the cache, not treated as fatal to the whole
  // push - it's simply retried on the next sync cycle.
  function uploadChangedImages(cfg, trades) {
    var cache = ghImageStateGet();
    var nextCache = {};
    var tasks = [];

    trades.forEach(function (t) {
      CHART_TIMEFRAMES.forEach(function (tf) {
        var image = t.charts && t.charts[tf.key];
        if (!(image && image.value)) return;
        var cacheKey = t.id + ':' + tf.key;
        var fingerprint = simpleHash(image.value);
        var cached = cache[cacheKey];
        var ext = deriveImageExtension(image);
        if (cached && cached.fingerprint === fingerprint && cached.ext === ext) {
          nextCache[cacheKey] = cached;
          return;
        }
        var path = chartImagePath(t.id, tf.key, image);
        var base64 = image.value.split(',')[1] || '';
        var message = 'Update ' + tf.label + ' chart for ' + (t.pair || t.id);
        // A cached sha belongs to the old path if the extension changed.
        var knownSha = cached && cached.ext === ext ? cached.sha : null;
        var task = ghPutFile(cfg, path, base64, knownSha, message)
          .then(function (result) {
            if (result.ok) return result;
            return ghGetFile(cfg, path, true).then(function (existing) {
              return ghPutFile(cfg, path, base64, existing.exists ? existing.sha : null, message);
            });
          })
          .then(function (result) {
            if (result.ok) nextCache[cacheKey] = { sha: result.sha, fingerprint: fingerprint, ext: ext };
          });
        tasks.push(task);
      });
    });

    return Promise.all(tasks).then(function () {
      ghImageStateSet(nextCache);
    });
  }

  function pushToGitHub() {
    var cfg = ghConfigGet();
    if (!cfg) return;

    setSyncStatus('syncing');

    var trades = TradeStore.getAll();
    var positions = PositionStore.getAll();
    var meta = ghMetaGet();

    function putJsonFile(path, json, shaField, message) {
      return ghPutFile(cfg, path, utf8ToBase64(json), meta[shaField], message).then(function (result) {
        if (result.ok) { meta[shaField] = result.sha; return result; }
        return ghGetFile(cfg, path).then(function (existing) {
          return ghPutFile(cfg, path, utf8ToBase64(json), existing.exists ? existing.sha : null, message);
        }).then(function (retryResult) {
          if (retryResult.ok) meta[shaField] = retryResult.sha;
          return retryResult;
        });
      });
    }

    uploadChangedImages(cfg, trades).then(function () {
      var tradesJson = JSON.stringify(buildRemoteTradesPayload(trades), null, 2);
      var positionsJson = JSON.stringify(positions, null, 2);
      var paramsJson = JSON.stringify(buildRemoteParamsPayload(), null, 2);
      return Promise.all([
        putJsonFile('data/trades.json', tradesJson, 'tradesSha', 'Sync trades'),
        putJsonFile('data/positions.json', positionsJson, 'positionsSha', 'Sync positions'),
        putJsonFile('data/parameters.json', paramsJson, 'paramsSha', 'Sync confluence categories')
      ]);
    }).then(function (results) {
      if (!results.every(function (r) { return r.ok; })) {
        throw new Error('failed to write one or more data files');
      }
      ghMetaSet({
        tradesSha: meta.tradesSha,
        positionsSha: meta.positionsSha,
        paramsSha: meta.paramsSha,
        lastPushedFingerprint: computeDataFingerprint(trades, positions),
        lastPushAt: Date.now(),
        lastSyncAt: Date.now()
      });
      setSyncStatus('synced');
    }).catch(function (err) {
      setSyncStatus('error', err && err.message ? err.message : String(err));
    });
  }

  function scheduleGithubSync() {
    if (githubSyncApplyingRemote) return;
    if (!ghConfigGet()) return;
    clearTimeout(githubPushDebounceTimer);
    githubPushDebounceTimer = setTimeout(pushToGitHub, GITHUB_PUSH_DEBOUNCE_MS);
  }

  // Resolves to the {value, name} image shape every render call site expects,
  // or null when the file is definitively gone from the repo. A network
  // failure is not swallowed - it rejects, aborting the pull, so a flaky
  // fetch can't wipe a local image (a later push would drop the remote ref).
  function fetchChartImage(cfg, entry) {
    return ghGetFile(cfg, entry.ref, true).then(function (result) {
      if (!result.exists) return null;
      var ext = (entry.ref.split('.').pop() || 'png').toLowerCase();
      return { value: 'data:' + mimeForExtension(ext) + ';base64,' + result.text, name: entry.name || '' };
    });
  }

  // Handles both the per-timeframe `charts` refs and the legacy single
  // `chart` ref (pre-multi-timeframe data), which migrateTrade then folds
  // into Daily.
  function hydrateChartRef(cfg, trade) {
    var tasks = [];
    if (trade.chart && trade.chart.type === 'upload-ref' && trade.chart.ref) {
      tasks.push(fetchChartImage(cfg, trade.chart).then(function (image) {
        trade.chart = image ? { type: 'upload', value: image.value, name: image.name } : null;
      }));
    }
    CHART_TIMEFRAMES.forEach(function (tf) {
      var entry = trade.charts && trade.charts[tf.key];
      if (!(entry && entry.type === 'upload-ref' && entry.ref)) return;
      tasks.push(fetchChartImage(cfg, entry).then(function (image) {
        trade.charts[tf.key] = image;
      }));
    });
    return Promise.all(tasks).then(function () { return trade; });
  }

  function pullFromGitHub() {
    var cfg = ghConfigGet();
    if (!cfg) { setSyncStatus('unconfigured'); return; }

    setSyncStatus('syncing');

    Promise.all([
      ghGetFile(cfg, 'data/trades.json'),
      ghGetFile(cfg, 'data/positions.json'),
      ghGetFile(cfg, 'data/parameters.json')
    ]).then(function (results) {
      var tradesFile = results[0];
      var positionsFile = results[1];
      var paramsFile = results[2];

      if (!tradesFile.exists && !positionsFile.exists && !paramsFile.exists) {
        // Brand-new empty data repo - seed it from whatever's local.
        pushToGitHub();
        return;
      }

      var remoteTrades = tradesFile.exists ? JSON.parse(tradesFile.text) : [];
      var remotePositions = positionsFile.exists ? JSON.parse(positionsFile.text) : [];
      var remoteParams = paramsFile.exists ? JSON.parse(paramsFile.text) : null;

      var localFingerprint = computeDataFingerprint(TradeStore.getAll(), PositionStore.getAll());
      var meta = ghMetaGet();

      if (meta.lastPushedFingerprint && meta.lastPushedFingerprint !== localFingerprint) {
        // Local has changes GitHub doesn't know about yet (e.g. the tab
        // closed before the debounced push fired) - local wins.
        pushToGitHub();
        return;
      }

      if (!meta.lastPushedFingerprint) {
        // First time this device has ever synced - there's no fingerprint
        // to compare against, so the check above can't tell "fresh device,
        // nothing to lose" apart from "device with real local trades that
        // just haven't been pushed yet". Ask, rather than silently
        // replacing trade history. SEED_TRADES ids are 'seed-01'..'seed-11',
        // so any other id means the user actually logged something here.
        var localTrades = TradeStore.getAll();
        var localPositions = PositionStore.getAll();
        var hasCustomLocalData = localTrades.some(function (t) { return t.id.indexOf('seed-') !== 0; }) || localPositions.length > 0;
        if (hasCustomLocalData && computeDataFingerprint(remoteTrades, remotePositions) !== localFingerprint) {
          var replaceLocal = window.confirm(
            'This device has trades/positions that have never been backed up to GitHub, and the repo already has different data (likely from another device).\n\n' +
            'Click OK to replace this device\'s trades/positions with what\'s on GitHub.\n' +
            'Click Cancel to keep this device\'s data and push it to GitHub instead.'
          );
          if (!replaceLocal) {
            pushToGitHub();
            return;
          }
        }
      }

      return Promise.all(remoteTrades.map(function (t) { return hydrateChartRef(cfg, t).then(migrateTrade); })).then(function (hydratedTrades) {
        savePrePullSnapshot();
        githubSyncApplyingRemote = true;
        TradeStore.setAll(hydratedTrades);
        PositionStore.setAll(remotePositions);

        // Categories/vocabulary are merged, never replaced outright - a
        // category or parameter created locally and not yet pushed must
        // survive a pull. localHasExtra tells us whether the merge result
        // has something GitHub doesn't, so it can be pushed back and other
        // devices converge on the same union.
        var needsParamsPushBack = false;
        if (remoteParams) {
          var localCategories = loadParamCategories();
          var localVocab = loadConfluenceVocabulary();
          var localRemoved = getRemovedDefaults();
          needsParamsPushBack =
            localHasExtra(localCategories, remoteParams.categories, function (c) { return c.key; }) ||
            localHasExtra(localVocab, remoteParams.vocabulary, function (v) { return v.name; }) ||
            localHasExtra(localRemoved, remoteParams.removedDefaults, function (n) { return n; });

          // Categories must be saved before vocabulary: mergeConfluenceVocabulary
          // normalizes each entry's category against the live (just-merged) list.
          saveParamCategories(mergeParamCategories(localCategories, remoteParams.categories));
          saveConfluenceVocabulary(mergeConfluenceVocabulary(localVocab, remoteParams.vocabulary));
          saveRemovedDefaults(mergeRemovedDefaults(localRemoved, remoteParams.removedDefaults));
        }
        githubSyncApplyingRemote = false;

        if (needsParamsPushBack) {
          ghMetaSet({
            tradesSha: tradesFile.exists ? tradesFile.sha : null,
            positionsSha: positionsFile.exists ? positionsFile.sha : null,
            paramsSha: paramsFile.exists ? paramsFile.sha : null,
            lastSyncAt: Date.now()
          });
          pushToGitHub();
        } else {
          ghMetaSet({
            tradesSha: tradesFile.exists ? tradesFile.sha : null,
            positionsSha: positionsFile.exists ? positionsFile.sha : null,
            paramsSha: paramsFile.exists ? paramsFile.sha : null,
            lastPushedFingerprint: computeDataFingerprint(hydratedTrades, remotePositions),
            lastSyncAt: Date.now()
          });
          setSyncStatus('synced');
        }

        // Refresh whatever's on screen - except an in-progress New Trade
        // Entry draft, which a render would reset.
        if (activeSlug && activeSlug !== 'new-trade-entry') renderForScreen(activeSlug, activeParam);
      });
    }).catch(function (err) {
      setSyncStatus('error', err && err.message ? err.message : String(err));
    });
  }

  function formatRelativeTime(ms) {
    if (!ms) return null;
    var diff = Date.now() - ms;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return new Date(ms).toLocaleDateString();
  }

  var SYNC_STATUS_DOT_CLASS = {
    unconfigured: 'bg-outline-variant',
    syncing: 'bg-primary animate-pulse',
    synced: 'bg-tertiary',
    error: 'bg-error'
  };

  function renderSyncStatusUI() {
    var dot = document.getElementById('github-sync-status-dot');
    var text = document.getElementById('github-sync-status-text');
    if (!dot || !text) return;

    var cfg = ghConfigGet();
    var meta = ghMetaGet();
    var state = cfg ? (meta.status || 'synced') : 'unconfigured';

    dot.className = 'absolute top-1 right-1 w-2 h-2 rounded-full ' + (SYNC_STATUS_DOT_CLASS[state] || SYNC_STATUS_DOT_CLASS.unconfigured);

    if (!cfg) {
      text.textContent = 'GitHub sync not configured';
    } else if (state === 'syncing') {
      text.textContent = 'Syncing…';
    } else if (state === 'error') {
      text.textContent = 'Sync error' + (meta.lastError ? ': ' + meta.lastError : '');
    } else {
      var rel = formatRelativeTime(meta.lastSyncAt);
      text.textContent = rel ? 'Synced ' + rel : 'Synced';
    }
  }

  function setSyncStatus(state, detail) {
    ghMetaSet({ status: state, lastError: detail || null });
    renderSyncStatusUI();
  }

  function initGithubSyncSettings() {
    var toggle = document.getElementById('github-sync-toggle');
    var panel = document.getElementById('github-sync-panel');
    var ownerInput = document.getElementById('gh-sync-owner');
    var repoInput = document.getElementById('gh-sync-repo');
    var branchInput = document.getElementById('gh-sync-branch');
    var tokenInput = document.getElementById('gh-sync-token');
    var saveBtn = document.getElementById('gh-sync-save');
    var syncNowBtn = document.getElementById('gh-sync-now');
    var pullNowBtn = document.getElementById('gh-sync-pull');
    var disconnectBtn = document.getElementById('gh-sync-disconnect');
    var restoreSnapshotBtn = document.getElementById('gh-sync-restore-snapshot');
    if (!toggle || !panel) return;

    function fillFromConfig() {
      var cfg = ghConfigGet();
      ownerInput.value = cfg ? cfg.owner : '';
      repoInput.value = cfg ? cfg.repo : '';
      branchInput.value = cfg ? cfg.branch : '';
      tokenInput.value = cfg ? cfg.token : '';
    }

    function openPanel() {
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      fillFromConfig();
      renderSyncStatusUI();
    }

    function closePanel() {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', function () {
      if (panel.hidden) openPanel(); else closePanel();
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var owner = ownerInput.value.trim();
        var repo = repoInput.value.trim();
        var branch = branchInput.value.trim() || 'main';
        var token = tokenInput.value.trim();
        if (!owner || !repo || !token) {
          window.alert('Repo owner, repo name, and a personal access token are all required.');
          return;
        }
        ghConfigSet({ owner: owner, repo: repo, branch: branch, token: token });
        pullFromGitHub();
      });
    }

    if (syncNowBtn) {
      syncNowBtn.addEventListener('click', function () { pushToGitHub(); });
    }

    if (pullNowBtn) {
      pullNowBtn.addEventListener('click', function () { pullFromGitHub(); });
    }

    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', function () {
        ghConfigClear();
        fillFromConfig();
        renderSyncStatusUI();
      });
    }

    if (restoreSnapshotBtn) {
      restoreSnapshotBtn.addEventListener('click', function () { restorePrePullSnapshot(); });
    }

    document.addEventListener('click', function (e) {
      if (panel.hidden) return;
      if (toggle.contains(e.target) || panel.contains(e.target)) return;
      closePanel();
    });

    document.addEventListener('keydown', function (e) {
      if (panel.hidden) return;
      if (e.key === 'Escape') { closePanel(); toggle.focus(); }
    });

    document.addEventListener('screenchange', closePanel);
  }

  function renderForScreen(slug, param) {
    if (slug === 'insights-dashboard') renderInsightsDashboard();
    if (slug === 'trade-journal') renderTradeJournal();
    if (slug === 'position-history') renderPositionHistory();
    if (slug === 'confluence-matrix') renderConfluenceMatrix();
    if (slug === 'timing-and-heatmap') renderTimingHeatmap();
    if (slug === 'case-studies') renderCaseStudy(param);
    if (slug === 'new-trade-entry') enterNewTradeEntry(param);
  }

  // ---------------------------------------------------------------------
  // Wiring + boot
  // ---------------------------------------------------------------------

  initTradeJournalControls(sections['trade-journal']);
  initMexcImport(sections['trade-journal']);
  initPositionHistory(sections['position-history']);
  initNewTradeEntry();
  initDataExportImport();
  initCaseStudyActions();
  initCaseStudyListControls();
  initChartPreviewModal();
  initTimingHeatmapControls(sections['timing-and-heatmap']);
  initHeaderSearch();
  initGithubSyncSettings();

  document.addEventListener('screenchange', function (e) {
    // Leaving a table drops its selection rather than carrying a stale one
    // back on return.
    clearSelection(tjSelection);
    clearSelection(phSelection);
    renderForScreen(e.detail.screen, e.detail.param);
  });

  window.addEventListener('hashchange', function () {
    var parsed = parseHash();
    activate(parsed.slug, parsed.param);
  });

  (function boot() {
    var parsed = parseHash();
    activate(parsed.slug || DEFAULT_SCREEN, parsed.param);
  })();

  renderSyncStatusUI();
  pullFromGitHub();

  window.AppRouter = {
    navigate: function (slug, param) {
      window.location.hash = param ? (slug + '/' + param) : slug;
    }
  };

  // Quick-action buttons (e.g. "New Trade" on Insights Dashboard / Trade Journal)
  // that share the same data-path convention as the sidebar nav links.
  document.querySelectorAll('button[data-path]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      window.AppRouter.navigate(btn.getAttribute('data-path'));
    });
  });
})();
