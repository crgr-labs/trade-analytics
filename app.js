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
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var path = el.getAttribute('data-path');
      window.location.hash = path;
      activate(path);
    });
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
    if (window.innerWidth < 768) {
      var sb = document.getElementById('app-sidebar');
      var bd = document.getElementById('sidebar-backdrop');
      if (sb) sb.classList.add('-translate-x-full');
      if (bd) bd.classList.add('hidden');
      document.body.classList.remove('overflow-hidden', 'md:overflow-auto');
    }
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

  function safeUrl(value) {
    if (!value) return '#';
    var str = String(value).trim();
    if (/^https?:\/\//i.test(str)) {
      return escapeHtml(str);
    }
    return '#';
  }

  function safeImageUrl(value) {
    if (!value) return '';
    var str = String(value).trim();
    if (/^data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(str) || /^https?:\/\//i.test(str)) {
      return escapeHtml(str);
    }
    return '';
  }

  function parseDate(dateStr) {
    return new Date(dateStr + 'T00:00:00');
  }

  function todayDateString() {
    return new Date().toISOString().slice(0, 10);
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

  // The three fixed chart-evidence slots. `short` is the compact badge on
  // empty slots and list thumbnails; `label` is the name on filled slots and tabs.
  var CHART_TIMEFRAMES = [
    { key: 'daily', label: 'Daily', short: 'D' },
    { key: 'h4', label: '4H', short: '4H' },
    { key: 'm15', label: 'M15', short: '15m' }
  ];

  // Retired parameter names, mapped (lowercased) to the name they merged into.
  // The picker used to ship a long-form default next to the short name that
  // trades actually carry ("4H Break of Structure (BOS)" vs "4H BOS"), so the
  // long form always matched zero trades. The name in use is the one kept, so
  // no logged history needs rewriting to something the stats don't already
  // use. Applied wherever a name can live: trades (parameters, legacy
  // confluence, checklist statuses), saved setups and the picker vocabulary -
  // including data pulled from another device that still has the old name.
  var PARAMETER_ALIASES = {
    '4h break of structure (bos)': '4H BOS',
    'daily uptrend and momentum continuation': 'Daily Uptrend & Momentum'
  };

  function canonicalParameter(name) {
    var trimmed = String(name == null ? '' : name).trim();
    return PARAMETER_ALIASES[trimmed.toLowerCase()] || trimmed;
  }

  // Canonical names, empties dropped, and a trade that carried both spellings
  // ends up with the one parameter rather than a duplicate.
  function canonicalParameterList(list) {
    var seen = {};
    return list.map(canonicalParameter).filter(function (p) {
      var key = p.toLowerCase();
      if (!p || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  // Trades used to store confluence parameters as a fixed 7-slot array
  // (`confluence`). That's now a variable-length `parameters` array picked
  // from a multi-select. This migrates any trade still shaped the old way
  // the first time it's read, so previously-saved trades keep working.
  function migrateTrade(trade) {
    if (!Array.isArray(trade.parameters)) {
      trade.parameters = (trade.confluence || []).map(function (v) { return (v || '').trim(); }).filter(Boolean);
    }
    trade.parameters = canonicalParameterList(trade.parameters);
    // The legacy slot array is only read as a fallback, but it still carries
    // the old name in stored data, so it is renamed too (slots stay in place -
    // some hold bare values like "32%" and empty slots are meaningful).
    if (Array.isArray(trade.confluence)) trade.confluence = trade.confluence.map(canonicalParameter);
    if (!trade.source) trade.source = 'manual';
    // Optional "HH:mm" exit time, same frame as entryTime; older trades have none.
    if (typeof trade.exitTime !== 'string') trade.exitTime = '';

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

    // TradingView snapshot links are per timeframe too (`chartLinks`, plain
    // strings). The old trade-wide link (`chart`) has no known timeframe, so
    // it moves to the first empty slot - Daily in practice - and is cleared.
    var links = trade.chartLinks && typeof trade.chartLinks === 'object' ? trade.chartLinks : {};
    CHART_TIMEFRAMES.forEach(function (tf) {
      links[tf.key] = typeof links[tf.key] === 'string' ? links[tf.key].trim() : '';
    });
    if (trade.chart && trade.chart.type === 'link') {
      var legacyLink = String(trade.chart.value || '').trim();
      var freeSlot = CHART_TIMEFRAMES.filter(function (tf) { return !links[tf.key]; })[0];
      if (legacyLink && freeSlot) links[freeSlot.key] = legacyLink;
      trade.chart = null;
    }
    trade.chartLinks = links;

    // Per-factor checklist status. Only non-default states are stored, so a
    // missing key means Passed and older trades need no migration beyond this.
    var statuses = {};
    if (trade.parameterStatus && typeof trade.parameterStatus === 'object') {
      Object.keys(trade.parameterStatus).forEach(function (name) {
        var status = trade.parameterStatus[name];
        if (status !== 'pending' && status !== 'failed') return;
        // Statuses are keyed by parameter name, so a renamed parameter keeps
        // its status; if the canonical name already has its own, that wins.
        var key = canonicalParameter(name);
        if (key !== name && statuses[key]) return;
        statuses[key] = status;
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

  function tradeChartLinks(trade) {
    return trade && trade.chartLinks ? trade.chartLinks : { daily: '', h4: '', m15: '' };
  }

  // First timeframe holding an image or a link - the tab the case study opens on.
  function firstAttachedChartKey(trade) {
    var charts = tradeCharts(trade);
    var links = tradeChartLinks(trade);
    for (var i = 0; i < CHART_TIMEFRAMES.length; i++) {
      var key = CHART_TIMEFRAMES[i].key;
      if (charts[key] || links[key]) return key;
    }
    return null;
  }

  function firstChartLink(trade) {
    var links = tradeChartLinks(trade);
    for (var i = 0; i < CHART_TIMEFRAMES.length; i++) {
      if (links[CHART_TIMEFRAMES[i].key]) return links[CHART_TIMEFRAMES[i].key];
    }
    return '';
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
      return [];
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

  // Playbook setups: a named, reusable parameter combination, saved from the
  // Confluence Matrix and loadable into New Trade Entry. Win rate is never
  // stored - it is recomputed against current trades wherever it is shown.
  var SETUPS_STORAGE_KEY = 'tj_setups';

  function normalizeSetup(s) {
    return {
      id: String(s.id),
      name: String(s.name || '').trim(),
      parameters: Array.isArray(s.parameters) ? canonicalParameterList(s.parameters) : [],
      createdAt: s.createdAt || new Date().toISOString()
    };
  }

  // Setups and anti-patterns are the same record shape (a named parameter
  // combination), so they share one store implementation. Each keeps its own
  // storage key and its own GitHub file.
  function createNamedComboStore(storageKey) {
    var store = {
      getAll: function () {
        try {
          var raw = localStorage.getItem(storageKey);
          var list = raw ? JSON.parse(raw) : [];
          return Array.isArray(list) ? list.filter(function (s) { return s && s.id; }).map(normalizeSetup) : [];
        } catch (e) {
          return [];
        }
      },
      setAll: function (items) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(items));
          scheduleGithubSync();
          return true;
        } catch (e) {
          return false;
        }
      },
      add: function (item) {
        var items = store.getAll();
        items.push(item);
        return store.setAll(items);
      },
      rename: function (id, name) {
        var items = store.getAll();
        var found = items.filter(function (s) { return s.id === id; })[0];
        if (!found) return false;
        found.name = name;
        return store.setAll(items);
      },
      remove: function (id) {
        return store.setAll(store.getAll().filter(function (s) { return s.id !== id; }));
      },
      getById: function (id) {
        return store.getAll().filter(function (s) { return s.id === id; })[0] || null;
      }
    };
    return store;
  }

  var SetupStore = createNamedComboStore(SETUPS_STORAGE_KEY);
  // Combinations flagged from the Confluence Matrix's Patterns to Avoid.
  var ANTI_PATTERNS_STORAGE_KEY = 'tj_anti_patterns';
  var AntiPatternStore = createNamedComboStore(ANTI_PATTERNS_STORAGE_KEY);

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
    var link = firstChartLink(trade);
    if (link && !firstChartKey(trade)) {
      var href = safeUrl(link);
      if (href === '#') return '';
      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer" ' +
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

  function tradeCardHtml(trade) {
    var tags = nonEmptyConfluence(trade);
    var visibleTags = tags.slice(0, 3);
    var moreCount = Math.max(tags.length - 3, 0);

    var tagsHtml = visibleTags.map(function (tag) {
      return '<span class="bg-surface-container-low text-on-surface-variant font-body-sm text-[12px] px-2 py-0.5 rounded shadow-sm">' + escapeHtml(tag) + '</span>';
    }).join('');
    if (moreCount > 0) {
      tagsHtml += '<span class="font-metric-sm text-[11px] text-secondary ml-1 cursor-default">+' + moreCount + ' more</span>';
    }
    if (!tagsHtml) {
      tagsHtml = '<span class="font-metric-sm text-[11px] text-outline-variant">No parameters logged</span>';
    }

    var dot = OUTCOME_DOT_CLASS[trade.outcome] || OUTCOME_DOT_CLASS.open;
    var pillClass = OUTCOME_PILL_CLASS[trade.outcome] || OUTCOME_PILL_CLASS.open;
    var directionClass = DIRECTION_BADGE_CLASS[trade.direction] || DIRECTION_BADGE_CLASS.long;

    return (
      '<div class="trade-card p-4 hover:bg-surface-container-low/40 transition-colors flex flex-col gap-2.5" data-trade-id="' +
      escapeHtml(trade.id) + '" data-outcome="' + escapeHtml(trade.outcome) + '" data-pair="' + escapeHtml(trade.pair) + '" data-match-warning="' + (trade.matchWarning ? 'true' : 'false') + '">' +
        // Row 1: Date & Day on left, Outcome badge on right
        '<div class="flex items-center justify-between gap-2">' +
          '<div class="flex items-center gap-2">' +
            '<span class="font-headline-sm text-headline-sm text-on-surface font-semibold">' + formatDateLabel(trade.date) + '</span>' +
            '<span class="font-metric-sm text-metric-sm text-secondary">' + weekdayLabel(trade.date) + '</span>' +
          '</div>' +
          '<span class="' + pillClass + ' font-metric-sm text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">' +
            '<span class="w-1.5 h-1.5 rounded-full ' + dot + '"></span>' + escapeHtml(trade.outcome.toUpperCase()) +
          '</span>' +
        '</div>' +
        // Row 2: Pair, Direction, Leverage, Chart link
        '<div class="flex items-center justify-between gap-2">' +
          '<div class="flex items-center gap-2 min-w-0 flex-wrap">' +
            '<div class="flex items-center gap-1.5">' +
              '<span class="w-1.5 h-1.5 rounded-full ' + dot + '"></span>' +
              '<span class="font-metric-md text-metric-md font-bold text-on-surface">' + escapeHtml(trade.pair) + '</span>' +
            '</div>' +
            '<span class="' + directionClass + ' font-metric-sm text-[11px] font-semibold px-2 py-0.5 rounded">' + escapeHtml(trade.direction.toUpperCase()) + '</span>' +
            '<span class="font-metric-sm text-metric-sm text-secondary">' + escapeHtml(trade.leverage || '—') + '</span>' +
            tradeRowBadgesHtml(trade) +
          '</div>' +
          '<div>' + tradeChartCellHtml(trade) + '</div>' +
        '</div>' +
        // Row 3: Parameter chips
        '<div class="flex items-center flex-wrap gap-1">' + tagsHtml + '</div>' +
        // Row 4: Card actions (Edit, Delete, Case study link)
        '<div class="flex items-center justify-between pt-2 border-t border-surface-container-low mt-0.5">' +
          '<div class="flex items-center gap-2">' +
            '<a class="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary hover:text-primary transition-colors" href="#new-trade-entry/' + encodeURIComponent(trade.id) + '" title="Edit trade"><span class="material-symbols-outlined text-[18px]">edit</span></a>' +
            '<button type="button" class="trade-delete-btn w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary hover:text-error transition-colors" data-trade-id="' + escapeHtml(trade.id) + '" data-trade-pair="' + escapeHtml(trade.pair) + '" title="Delete trade"><span class="material-symbols-outlined text-[18px]">delete</span></button>' +
          '</div>' +
          '<a class="inline-flex items-center gap-1 text-primary hover:text-primary-container font-headline-sm text-headline-sm font-medium transition-colors" href="#case-studies/' + encodeURIComponent(trade.id) + '">' +
            '<span>Case study</span>' +
            '<span class="material-symbols-outlined text-[15px]">arrow_forward</span>' +
          '</a>' +
        '</div>' +
      '</div>'
    );
  }

  function applyTradeJournalFilters(section) {
    var rows = section.querySelectorAll('#tradesBody .trade-row');
    var cards = section.querySelectorAll('#tradesCards .trade-card');
    var visible = 0;
    function matches(el) {
      var outcome = el.getAttribute('data-outcome');
      var pair = (el.getAttribute('data-pair') || '').toLowerCase();
      return (tjState.filter === 'all' || outcome === tjState.filter) &&
        (!tjState.search || pair.indexOf(tjState.search) !== -1) &&
        (!tjState.flaggedOnly || el.getAttribute('data-match-warning') === 'true');
    }
    rows.forEach(function (row) {
      var m = matches(row);
      row.style.display = m ? '' : 'none';
      if (m) visible++;
    });
    cards.forEach(function (card) {
      card.style.display = matches(card) ? '' : 'none';
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

  // Direction split across every logged trade (not just closed) - this card
  // describes what's being set up, not how it performed.
  function computeDirectionBreakdown(trades) {
    if (!trades.length) return null;
    var counts = { long: 0, short: 0 };
    trades.forEach(function (t) { counts[t.direction === 'short' ? 'short' : 'long']++; });
    var dominant = counts.long >= counts.short ? 'long' : 'short';
    return { dominant: dominant, pct: pct(counts[dominant], trades.length) };
  }

  // Groups every trade by its Daily-context tag plus the next tag after it
  // (typically the 4H structure), e.g. "Daily Uptrend & Momentum + 4H BOS".
  function computeContextStructureCombos(trades) {
    var groups = {};
    trades.forEach(function (t) {
      var tags = nonEmptyConfluence(t);
      var context = tags[0] || 'Unlabeled context';
      var structure = tags[1];
      var label = structure ? context + ' + ' + structure : context;
      groups[label] = groups[label] || { label: label, total: 0 };
      groups[label].total++;
    });
    return Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return b.total - a.total; });
  }

  function computeAverageLeverage(trades) {
    var withLev = trades.map(function (t) {
      var multiplier = parseFloat((t.leverage || '').match(/[\d.]+/) || 0);
      return multiplier ? { multiplier: multiplier, mode: parseLeverageMode(t.leverage) } : null;
    }).filter(Boolean);
    if (!withLev.length) return null;
    var avg = withLev.reduce(function (sum, x) { return sum + x.multiplier; }, 0) / withLev.length;
    var modeCounts = {};
    withLev.forEach(function (x) { modeCounts[x.mode] = (modeCounts[x.mode] || 0) + 1; });
    var dominantMode = Object.keys(modeCounts).sort(function (a, b) { return modeCounts[b] - modeCounts[a]; })[0];
    return { avg: avg, mode: dominantMode };
  }

  // null (not 0 or Infinity) when there's no losing $ to divide by - a
  // profit factor isn't meaningfully defined yet in that case.
  function computeProfitFactor(withPnl) {
    var gains = 0, lossAbs = 0;
    withPnl.forEach(function (x) {
      if (x.pnl > 0) gains += x.pnl; else if (x.pnl < 0) lossAbs += Math.abs(x.pnl);
    });
    return lossAbs ? gains / lossAbs : null;
  }

  function comboRowHtml(combo, totalTrades, colorClass) {
    var rate = pct(combo.total, totalTrades);
    return (
      '<div>' +
        '<div class="flex justify-between font-metric-sm text-metric-sm mb-1">' +
          '<span class="text-on-surface">' + escapeHtml(combo.label) + '</span>' +
          '<span class="text-on-surface font-semibold">' + combo.total + ' trade' + (combo.total === 1 ? '' : 's') + ' (' + rate + '%)</span>' +
        '</div>' +
        '<div class="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">' +
          '<div class="h-full ' + colorClass + ' rounded-full" style="width: ' + rate + '%;"></div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderTradeJournalSnapshot(section, trades) {
    var badgeEl = section.querySelector('#tj-direction-badge');
    var descEl = section.querySelector('#tj-direction-desc');
    var comboBodyEl = section.querySelector('#tj-combo-body');
    var leverageEl = section.querySelector('#tj-avg-leverage');

    var direction = computeDirectionBreakdown(trades);
    if (badgeEl) badgeEl.textContent = direction ? direction.pct + '% ' + (direction.dominant === 'long' ? 'Long' : 'Short') + ' Execution' : 'No trades yet';

    var combos = computeContextStructureCombos(trades);
    if (descEl) {
      descEl.textContent = combos.length
        ? 'Dominant setup: ' + combos[0].label + '.'
        : 'Log a trade to see your directional bias.';
    }
    if (comboBodyEl) {
      var top = combos.slice(0, 2);
      comboBodyEl.innerHTML = top.length
        ? top.map(function (c, i) { return comboRowHtml(c, trades.length, i === 0 ? 'bg-primary' : 'bg-secondary'); }).join('')
        : '<p class="font-metric-sm text-metric-sm text-outline-variant">No confluence tags logged yet.</p>';
    }

    var leverage = computeAverageLeverage(trades);
    if (leverageEl) leverageEl.textContent = leverage ? leverage.avg.toFixed(1) + 'x ' + (leverage.mode === 'cross' ? 'Cross' : 'Isolated') : 'Not recorded';
  }

  function renderTradeJournalValidation(section, docStats, confluenceStats) {
    var badgeEl = section.querySelector('#tj-validation-badge');
    var copyEl = section.querySelector('#tj-validation-copy');
    var pfEl = section.querySelector('#tj-profit-factor');

    if (badgeEl) badgeEl.textContent = 'N=' + confluenceStats.closedCount;

    if (copyEl) {
      var sentences = [];
      var best = confluenceStats.topParams.filter(function (p) { return p.total >= 3; })[0];
      if (best) {
        sentences.push('The ' + best.label + ' setup displays a ' + pct(best.wins, best.total) + '% win conversion rate across ' + best.total + ' iterations.');
      } else {
        sentences.push('Not enough recurring signals yet to validate one (need 3+ occurrences of the same tag).');
      }
      if (confluenceStats.lossProfile) {
        sentences.push('The lone control-group deviation occurred during ' + confluenceStats.lossProfile.label + '.');
      }
      copyEl.textContent = sentences.join(' ');
    }

    if (pfEl) {
      var pf = computeProfitFactor(docStats.withPnl);
      pfEl.textContent = pf === null ? 'Unavailable' : pf.toFixed(2) + ' PF';
    }
  }

  function renderTradeJournal() {
    var section = sections['trade-journal'];
    if (!section) return;
    var trades = TradeStore.getAll();
    var sorted = sortTrades(trades, tjState.sort);

    var tbody = section.querySelector('#tradesBody');
    if (tbody) tbody.innerHTML = sorted.map(tradeRowHtml).join('');
    var cardsContainer = section.querySelector('#tradesCards');
    if (cardsContainer) cardsContainer.innerHTML = sorted.map(tradeCardHtml).join('');

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
    renderTradeJournalSnapshot(section, trades);
    renderTradeJournalValidation(section, computeTradeJournalPnl(trades), computeConfluenceStats(trades));

    var updatedEl = section.querySelector('#tj-updated-at');
    if (updatedEl) {
      var now = new Date();
      var hh = String(now.getUTCHours()).padStart(2, '0');
      var mm = String(now.getUTCMinutes()).padStart(2, '0');
      updatedEl.textContent = 'Updated Today ' + hh + ':' + mm + ' UTC';
    }
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
    return Array.prototype.filter.call(section.querySelectorAll('#tradesBody .trade-row'), function (row) {
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

  // Lightweight RFC-4180 compliant CSV parser
  function parseCsv(text) {
    if (!text || typeof text !== 'string') return [];
    var str = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    var rows = [];
    var currentRow = [];
    var currentField = '';
    var inQuotes = false;
    var i = 0;
    var len = str.length;

    while (i < len) {
      var char = str[i];
      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < len && str[i + 1] === '"') {
            currentField += '"';
            i += 2;
          } else {
            inQuotes = false;
            i++;
          }
        } else {
          currentField += char;
          i++;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
          i++;
        } else if (char === ',') {
          currentRow.push(currentField);
          currentField = '';
          i++;
        } else if (char === '\r') {
          if (i + 1 < len && str[i + 1] === '\n') {
            i++;
          }
          currentRow.push(currentField);
          currentField = '';
          rows.push(currentRow);
          currentRow = [];
          i++;
        } else if (char === '\n') {
          currentRow.push(currentField);
          currentField = '';
          rows.push(currentRow);
          currentRow = [];
          i++;
        } else {
          currentField += char;
          i++;
        }
      }
    }
    if (inQuotes) {
      currentRow.push(currentField);
      rows.push(currentRow);
    } else if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }
    if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
      rows.pop();
    }
    return rows;
  }

  function parseMexcRowsMatrix(candidateRows) {
    if (!candidateRows || !candidateRows.length) {
      return { rows: [], error: 'File is empty.' };
    }

    // Pass 1: a textual header row (case/whitespace/full-width tolerant).
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

    // Pass 2: no header row at all - MEXC's raw export can be just the data,
    // in a fixed column order, starting at row 1. Find where it starts by
    // content shape instead, then read positionally.
    for (var r2 = 0; r2 < candidateRows.length; r2++) {
      if (!looksLikeMexcDataRow(candidateRows[r2])) continue;
      var dataRows2 = [];
      for (var r3 = r2; r3 < candidateRows.length; r3++) {
        var raw2 = candidateRows[r3];
        if (!raw2 || raw2.every(function (c) { return String(c == null ? '' : c).trim() === ''; })) continue;
        dataRows2.push(extractMexcDataRow(raw2, MEXC_POSITIONAL_COLUMNS));
      }
      return { rows: dataRows2, error: null };
    }

    var sampleRow = candidateRows.filter(function (r) { return r.some(function (c) { return String(c == null ? '' : c).trim() !== ''; }); })[0];
    return {
      rows: [], error: 'Could not find MEXC Position History data in this file (looked for column headers, and for rows shaped like exported positions). First readable row: ' + describeRowForDiagnostics(sampleRow)
    };
  }

  function parseMexcCsv(csvText) {
    var candidateRows = parseCsv(csvText);
    return parseMexcRowsMatrix(candidateRows);
  }

  function parseMexcWorkbook(workbook) {
    var sheetNames = workbook.SheetNames || [];

    // Check each sheet with Pass 1 and Pass 2
    for (var s = 0; s < sheetNames.length; s++) {
      var sheet = workbook.Sheets[sheetNames[s]];
      if (!sheet) continue;
      var candidateRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      var res = parseMexcRowsMatrix(candidateRows);
      if (res.rows.length > 0 || (res.error && res.error.indexOf('Missing expected column') === 0)) {
        return res;
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
        var isCsv = /\.csv$/i.test(file.name);
        if (!isCsv && typeof XLSX === 'undefined') {
          window.alert('The .xlsx import library failed to load, so this file can\'t be read. Check your connection and try again.');
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var result;
          try {
            var parsed;
            if (isCsv) {
              parsed = parseMexcCsv(reader.result);
            } else {
              var data = new Uint8Array(reader.result);
              var workbook = XLSX.read(data, { type: 'array', cellDates: true });
              parsed = parseMexcWorkbook(workbook);
            }
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
            window.alert('Could not read this file. Make sure it is a MEXC Position History export (.xlsx or .csv).');
            return;
          }
          showImportSummary(result);
          renderTradeJournal();
        };
        reader.onerror = function () {
          window.alert('Could not read this file.');
        };
        if (isCsv) {
          reader.readAsText(file);
        } else {
          reader.readAsArrayBuffer(file);
        }
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

  // ---------------------------------------------------------------------
  // TradingView Paper Trade History import
  // ---------------------------------------------------------------------
  // TradingView exports one row per order (entry + exit), both sharing the
  // same "Trade number".  We pair them up to build one closed position per
  // trade number.  Columns (0-indexed):
  //   0: Symbol  1: Trade number  2: Type  3: Date and time
  //   4: Order ID  5: Signal  6: Price  7: Size (qty)
  //   8: Size (value)  9: Net PnL USD  10: Return %
  //  11: Commission USD  12: Cumulative PnL USD  13: Cumulative PnL %

  var TV_REQUIRED_HEADERS = ['symbol', 'trade number', 'type', 'date and time', 'price', 'net pnl usd'];

  // "Jul 31, 2026, 09:23"  →  ISO UTC string  (TV paper trades have no TZ; treat as UTC)
  var TV_MONTH_MAP = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  function parseTvDateTime(raw) {
    if (!raw) return '';
    // Handle JS Date objects (cellDates: true)
    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) return '';
      return raw.toISOString();
    }
    var s = String(raw).trim();
    // "Jul 31, 2026, 09:23"
    var m = s.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      var mo = TV_MONTH_MAP[m[1].toLowerCase()];
      if (mo === undefined) return '';
      var ms = Date.UTC(parseInt(m[3]), mo, parseInt(m[2]), parseInt(m[4]), parseInt(m[5]), m[6] ? parseInt(m[6]) : 0);
      return new Date(ms).toISOString();
    }
    // Fallback: let Date parse it
    var d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }

  // "OKX:MMTUSDT.P"  or  "BINANCE:BTCUSDT.P"  →  "MMTUSDT.P"
  function parseTvSymbol(raw) {
    var s = (raw || '').toString().trim().toUpperCase();
    var colonIdx = s.lastIndexOf(':');
    if (colonIdx !== -1) s = s.slice(colonIdx + 1);
    // Already ends in .P  (TV perps) or doesn't — normalise to .P convention
    if (!s.endsWith('.P')) s = s.replace(/\.P$/, '') + '.P';
    return s;
  }

  // "Entry long" / "Exit long" / "Entry short" / "Exit short"
  function parseTvType(raw) {
    var s = (raw || '').toLowerCase();
    var isEntry = s.indexOf('entry') !== -1;
    var isLong  = s.indexOf('long') !== -1;
    return { isEntry: isEntry, direction: isLong ? 'long' : 'short' };
  }

  function parseTvNumber(raw) {
    if (typeof raw === 'number') return isNaN(raw) ? null : raw;
    var s = (raw == null ? '' : String(raw)).trim().replace(/,/g, '');
    if (!s) return null;
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  // Detect whether a rows matrix looks like a TradingView paper-trade export.
  // Returns { headerRow, colIndex } if recognised, or null if not.
  function detectTvHeader(candidateRows) {
    for (var i = 0; i < candidateRows.length; i++) {
      var row = candidateRows[i];
      var norm = row.map(function (c) { return normalizeHeaderCell(c); });
      var hasAll = TV_REQUIRED_HEADERS.every(function (h) { return norm.indexOf(h) !== -1; });
      if (!hasAll) continue;
      var idx = {};
      norm.forEach(function (n, j) { idx[n] = j; });
      return { headerRowIndex: i, colIndex: idx };
    }
    return null;
  }

  function parseTvRowsMatrix(candidateRows) {
    var detected = detectTvHeader(candidateRows);
    if (!detected) return null;   // not a TradingView file

    var ci = detected.colIndex;
    var dataStart = detected.headerRowIndex + 1;

    // Collect all order rows
    var orders = [];
    for (var r = dataStart; r < candidateRows.length; r++) {
      var row = candidateRows[r];
      if (!row || row.every(function (c) { return String(c == null ? '' : c).trim() === ''; })) continue;
      var typeInfo = parseTvType(row[ci['type']]);
      orders.push({
        symbol:    parseTvSymbol(row[ci['symbol']]),
        tradeNum:  parseTvNumber(row[ci['trade number']]),
        isEntry:   typeInfo.isEntry,
        direction: typeInfo.direction,
        datetime:  parseTvDateTime(row[ci['date and time']]),
        price:     parseTvNumber(row[ci['price']]),
        sizeQty:   parseTvNumber(row[ci['size (qty)']]),
        sizeVal:   parseTvNumber(row[ci['size (value)']]),
        netPnl:    parseTvNumber(row[ci['net pnl usd']]),
        commission:parseTvNumber(row[ci['commission usd']]),
        returnPct: parseTvNumber(row[ci['return %']])
      });
    }

    // Group entry + exit by trade number
    var byTradeNum = {};
    orders.forEach(function (o) {
      var k = String(o.tradeNum) + '|' + o.symbol;
      if (!byTradeNum[k]) byTradeNum[k] = { entry: null, exit: null, symbol: o.symbol, direction: o.direction };
      if (o.isEntry) byTradeNum[k].entry = o;
      else           byTradeNum[k].exit  = o;
    });

    var positions = [];
    Object.keys(byTradeNum).forEach(function (k) {
      var grp = byTradeNum[k];
      var entry = grp.entry;
      var exit  = grp.exit;
      // Need at least an exit to know the trade is closed and have PnL
      if (!exit) return;

      var pnl  = exit.netPnl !== null ? exit.netPnl : 0;
      var comm = (entry && entry.commission !== null ? Math.abs(entry.commission) : 0) +
                 (exit.commission !== null ? Math.abs(exit.commission) : 0);

      var openIso  = entry ? entry.datetime : '';
      var closeIso = exit.datetime;

      // Position ID natural key includes trade number from the filename context;
      // use symbol + openIso + closeIso for dedup.
      positions.push({
        symbol:    grp.symbol,
        direction: grp.direction,
        openIso:   openIso,
        closeIso:  closeIso,
        entryPrice:entry ? entry.price : null,
        closePrice:exit.price,
        sizeVal:   exit.sizeVal,
        pnl:       pnl,
        fee:       comm,
        source:    'tv-paper'
      });
    });

    return { positions: positions, error: null };
  }

  function importTvPositions(parsed) {
    var existing = PositionStore.getAll();
    var seen = {};
    existing.forEach(function (p) { seen[positionNaturalKey(p)] = true; });

    var imported = 0, skipped = 0;

    parsed.positions.forEach(function (pos) {
      if (!pos.closeIso) { skipped++; return; }

      var pair = pos.symbol; // already normalised by parseTvSymbol

      // Build a stub record matching the PositionStore schema
      var rec = {
        id: '',
        uid: '',
        pair: pair,
        openTime:   pos.openIso || pos.closeIso,
        closeTime:  pos.closeIso,
        marginMode: 'paper',
        entryPrice: pos.entryPrice,
        closePrice: pos.closePrice,
        direction:  pos.direction,
        qty:        '',
        fee:        pos.fee,
        pnl:        pos.pnl,
        status:     'All Closed',
        linkedTradeId: null,
        source:     'tv-paper'
      };

      var key = positionNaturalKey(rec);
      if (seen[key]) { skipped++; return; }
      seen[key] = true;

      var dateSlug = (rec.openTime || rec.closeTime).slice(0, 10);
      rec.id = 'pos-tv-' + pair.replace(/[^A-Z0-9]/g, '') + '-' + dateSlug + '-' + Math.random().toString(36).slice(2, 8);
      existing.push(rec);
      imported++;
    });

    PositionStore.setAll(existing);
    return { imported: imported, skipped: skipped };
  }

  // Try TradingView first, then fall back to MEXC.  Returns
  // { kind: 'tv'|'mexc'|'unknown', parsed, error }
  function detectAndParseWorkbook(workbook) {
    var sheetNames = workbook.SheetNames || [];
    for (var s = 0; s < sheetNames.length; s++) {
      var sheet = workbook.Sheets[sheetNames[s]];
      if (!sheet) continue;
      var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      var tvResult = parseTvRowsMatrix(rows);
      if (tvResult) return { kind: 'tv', parsed: tvResult };
    }
    // Fall back to MEXC
    var mexcResult = parseMexcWorkbook(workbook);
    return { kind: 'mexc', parsed: mexcResult };
  }

  function detectAndParseCsv(text) {
    var rows = parseCsv(text);
    var tvResult = parseTvRowsMatrix(rows);
    if (tvResult) return { kind: 'tv', parsed: tvResult };
    return { kind: 'mexc', parsed: parseMexcRowsMatrix(rows) };
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

  // The position's close as a time of day in that same journal timezone frame,
  // for prefilling Exit Time when promoting. Blank when the hold is 24h or
  // longer: a bare time of day can't represent that, and the linked position's
  // real timestamps are what the case study uses anyway.
  function positionLocalCloseTime(p) {
    var openMs = Date.parse(p.openTime);
    var closeMs = Date.parse(p.closeTime);
    if (isNaN(openMs) || isNaN(closeMs) || closeMs < openMs || closeMs - openMs >= 86400000) return '';
    var shifted = new Date(closeMs + getEntryTzOffsetMinutes() * 60000);
    return pad2(shifted.getUTCHours()) + ':' + pad2(shifted.getUTCMinutes());
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
    var sourceBadge = p.source === 'tv-paper'
      ? '<div class="mt-0.5"><span class="inline-flex items-center gap-1 bg-warning-container text-warning font-metric-sm text-[10px] font-semibold px-1.5 py-0.5 rounded"><span class="material-symbols-outlined text-[10px] align-middle">labs</span>Paper</span></div>'
      : '';
    var promotedBadge = p.linkedTradeId
      ? '<div class="mt-1"><span class="inline-flex items-center gap-1 bg-primary/10 text-primary font-metric-sm text-[10px] font-semibold px-1.5 py-0.5 rounded"><span class="material-symbols-outlined text-[11px] align-middle">arrow_outward</span>Promoted</span></div>'
      : '';

    return (
      '<tr class="ph-row hover:bg-surface-container-low/60 transition-colors" data-position-id="' + escapeHtml(p.id) + '" data-pair="' + escapeHtml(p.pair) + '">' +
        rowCheckboxHtml('ph-row-check', p.id, phSelection, 'Select position', 'pl-5 pr-2 py-3') +
        '<td class="px-5 py-3 font-metric-sm text-metric-sm text-on-surface whitespace-nowrap">' + formatIsoDateTime(p.openTime) + '</td>' +
        '<td class="px-5 py-3"><div class="flex flex-col">' +
          '<span class="font-metric-md text-metric-md font-bold text-on-surface">' + escapeHtml(p.pair) + '</span>' +
          sourceBadge +
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
      '</div>' +
      (function () {
        var dd = computeMaxDrawdown(ordered.map(function (it) { return { t: it.t, amount: it.amount }; }));
        if (!dd) return '';
        var pct = dd.peakCum > 0 ? ' (' + (Math.abs(dd.drawdown / dd.peakCum) * 100).toFixed(1) + '%)' : '';
        return '<div class="text-center font-metric-sm text-metric-sm text-error mt-1 opacity-80">' +
          'Max drawdown: ' + formatSignedMoney(dd.drawdown) + pct +
          ' <span class="text-secondary">peak ' + formatSignedMoney(dd.peakCum) + ' → trough ' + formatSignedMoney(dd.troughCum) + '</span>' +
        '</div>';
      })()
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
        var isCsv = /\.csv$/i.test(file.name);
        if (!isCsv && typeof XLSX === 'undefined') {
          window.alert('The .xlsx import library failed to load, so this file can\'t be read.');
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var result;
          try {
            var detected;
            if (isCsv) {
              detected = detectAndParseCsv(reader.result);
            } else {
              var workbook = XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: true });
              detected = detectAndParseWorkbook(workbook);
            }

            if (detected.kind === 'tv') {
              var tvParsed = detected.parsed;
              if (tvParsed.error) { window.alert('Could not import this file: ' + tvParsed.error); return; }
              if (!tvParsed.positions || !tvParsed.positions.length) {
                window.alert('No closed trades found in this TradingView paper-trade export.'); return;
              }
              var tvResult = importTvPositions(tvParsed);
              var tvText = 'Imported ' + tvResult.imported + ' paper trade' + (tvResult.imported === 1 ? '' : 's') + ' from TradingView';
              if (tvResult.skipped) tvText += ' (' + tvResult.skipped + ' already on file)';
              result = { text: tvText };
            } else {
              var mexcParsed = detected.parsed;
              if (mexcParsed.error) { window.alert('Could not import this file: ' + mexcParsed.error); return; }
              if (!mexcParsed.rows || !mexcParsed.rows.length) {
                window.alert('No position rows found in this file.'); return;
              }
              var mexcResult = importPositionRows(mexcParsed.rows);
              var mexcText = 'Imported ' + mexcResult.imported + ' position' + (mexcResult.imported === 1 ? '' : 's');
              if (mexcResult.skipped) mexcText += ' (' + mexcResult.skipped + ' already on file)';
              if (mexcResult.ignored) mexcText += ', ' + mexcResult.ignored + ' skipped (not closed)';
              result = { text: mexcText };
            }
          } catch (err) {
            window.alert('Could not read this file. Supported formats: MEXC Position History (.xlsx/.csv) or TradingView Paper Trade History (.xlsx/.csv).');
            return;
          }
          var textEl = section.querySelector('#ph-import-text');
          var banner = section.querySelector('#ph-import-banner');
          if (textEl) textEl.textContent = result.text;
          if (banner) banner.hidden = false;
          renderPositionHistory();
          renderInsightsDashboard();
        };
        reader.onerror = function () { window.alert('Could not read this file.'); };
        if (isCsv) {
          reader.readAsText(file);
        } else {
          reader.readAsArrayBuffer(file);
        }
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
        downloadFile('trade-journal-backup-' + todayDateString() + '.json', json, 'application/json');
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
      baseGroups[key] = baseGroups[key] || { label: key, params: [c[0], c[1]], trades: [] };
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
      .slice(0, 5)
      .map(function (s) {
        // The full parameter set this row stands for (base pair + the add-on),
        // so the drill-down can match trades on all of it.
        s.params = baseStack.params.concat(s.label);
        return s;
      });

    // Loss profile: a losing trade outside the dominant base stack, described by its own setup.
    var lossOutsideBase = closed.filter(function (t) { return t.outcome === 'loss' && baseGroup.indexOf(t) === -1; });
    var lossProfile = null;
    if (lossOutsideBase.length) {
      var c = nonEmptyConfluence(lossOutsideBase[0]).slice().sort();
      lossProfile = {
        label: (c[0] || 'Unlabeled setup') + ' + ' + (c[2] || c[1] || 'setup') + ' (loss profile)',
        wins: 0,
        total: lossOutsideBase.length,
        tradeIds: lossOutsideBase.map(function (t) { return t.id; })
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

    // Flat version of paramCounts (not split by category) for callers that
    // just want the overall most-recurring signals, e.g. the Insights
    // dashboard's "Recurring Signal Performance" grid.
    var topParams = Object.keys(paramCounts)
      .map(function (k) { return paramCounts[k]; })
      .sort(function (a, b) { return b.total - a.total; });

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
      byCategory: byCategory,
      topParams: topParams
    };
  }

  // Drill-down specs for the clickable stats. Each rendered element carries an
  // index into this list (data-cm-drill) rather than the spec itself, so the
  // matching rule and the title stay out of the DOM. Rebuilt on every render.
  var cmDrillSpecs = [];
  var CM_DRILL_CLASS = 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';

  function cmDrillAttrs(spec) {
    cmDrillSpecs.push(spec);
    return ' data-cm-drill="' + (cmDrillSpecs.length - 1) + '" role="button" tabindex="0" title="View the trades behind this"';
  }

  function cmSetDrill(el, spec) {
    if (!el) return;
    if (!spec) {
      el.removeAttribute('data-cm-drill');
      el.removeAttribute('role');
      el.removeAttribute('tabindex');
      el.removeAttribute('title');
      return;
    }
    cmDrillSpecs.push(spec);
    el.setAttribute('data-cm-drill', String(cmDrillSpecs.length - 1));
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('title', 'View the trades behind this');
  }

  function notableStackRowHtml(stack, isLossRow) {
    var rate = pct(stack.wins, stack.total);
    var colors = rateColors(rate);
    var dotColor = isLossRow ? 'bg-error' : 'bg-primary';
    var rowClass = (isLossRow ? 'bg-error-container/20 hover:bg-error-container/40 rounded-lg group transition-colors' : 'hover:bg-surface-container-low transition-colors group') + ' ' + CM_DRILL_CLASS;
    var label = (isLossRow ? '' : '+ ') + escapeHtml(stack.label);
    var spec = isLossRow
      ? { title: 'Trades in ' + stack.label, ids: stack.tradeIds }
      : { title: 'Trades using ' + stack.params.join(' + '), params: stack.params };
    return (
      '<tr class="' + rowClass + '"' + cmDrillAttrs(spec) + '>' +
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
    var spec = { title: 'Trades with ' + bucket.filled + ' parameter' + (bucket.filled === 1 ? '' : 's'), exactFilled: bucket.filled };
    return (
      '<div class="flex flex-col gap-1.5 -mx-2 px-2 py-1.5 rounded-lg hover:bg-surface-container-low transition-colors ' + CM_DRILL_CLASS + '"' + cmDrillAttrs(spec) + '>' +
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
    var spec = { title: 'Trades using ' + param.label, params: [param.label] };
    return (
      '<div class="flex flex-col gap-1 -mx-2 px-2 py-1.5 rounded-lg hover:bg-surface-container-low transition-colors ' + CM_DRILL_CLASS + '"' + cmDrillAttrs(spec) + '>' +
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
    cmDrillSpecs = [];

    var cohortEl = section.querySelector('#cm-cohort-count');
    if (cohortEl) cohortEl.textContent = stats.totalTrades + ' Logged Execution' + (stats.totalTrades === 1 ? '' : 's') + ' (100% Retrospective)';

    var labelEl = section.querySelector('#cm-best-stack-label');
    var tradesEl = section.querySelector('#cm-best-stack-trades');
    var rateEl = section.querySelector('#cm-best-stack-rate');
    var bannerEl = section.querySelector('#cm-best-stack-banner');
    var bannerHintEl = section.querySelector('#cm-best-stack-hint');
    if (stats.baseStack) {
      if (labelEl) labelEl.textContent = stats.baseStack.label;
      if (tradesEl) tradesEl.textContent = stats.baseWins + '/' + stats.baseStack.trades.length;
      if (rateEl) rateEl.textContent = pct(stats.baseWins, stats.baseStack.trades.length) + '%';
      cmSetDrill(bannerEl, { title: 'Trades using ' + stats.baseStack.params.join(' + '), params: stats.baseStack.params });
    } else {
      if (labelEl) labelEl.textContent = 'Not enough closed trades yet';
      if (tradesEl) tradesEl.textContent = '0/0';
      if (rateEl) rateEl.textContent = '—';
      cmSetDrill(bannerEl, null);
    }
    if (bannerEl) {
      var bannerDrillClasses = (CM_DRILL_CLASS + ' hover:shadow-lg hover:ring-2 hover:ring-primary-fixed/40 transition-shadow').split(' ');
      bannerDrillClasses.forEach(function (cls) { bannerEl.classList.toggle(cls, !!stats.baseStack); });
    }
    if (bannerHintEl) bannerHintEl.hidden = !stats.baseStack;

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
    cmSetDrill(section.querySelector('#cm-high-confl-row'), stats.highConflTotal ? { title: 'Trades with 6+ parameters', minFilled: 6 } : null);

    ['trend', 'retracement', 'momentum'].forEach(function (cat) {
      var el = section.querySelector('#cm-param-col-' + cat);
      if (!el) return;
      var rows = stats.byCategory[cat];
      el.innerHTML = rows.length ? rows.map(paramRowHtml).join('') : '<span class="font-metric-sm text-metric-sm text-secondary">No data yet.</span>';
    });

    var findingsEl = section.querySelector('#cm-key-findings');
    if (findingsEl) findingsEl.innerHTML = renderKeyFindings(stats);

    renderPlaybookSetups(section);
  }

  // ---------------------------------------------------------------------
  // Confluence Matrix drill-down: the trades behind a clicked stat
  // ---------------------------------------------------------------------

  // Every stat on the page is computed over closed (win/loss) trades, so the
  // drill-down does the same - otherwise open trades carrying the same
  // parameters would make the list disagree with the number that was clicked.
  // `closedTrades` lets a caller that matches many specs in one pass (the saved
  // setups list) read the trade store once instead of once per spec.
  function cmClosedTrades() {
    return TradeStore.getAll().filter(function (t) { return t.outcome === 'win' || t.outcome === 'loss'; });
  }

  function cmDrillTrades(spec, closedTrades) {
    var c;
    return (closedTrades || cmClosedTrades())
      .filter(function (t) {
        if (spec.ids) return spec.ids.indexOf(t.id) !== -1;
        c = nonEmptyConfluence(t);
        if (spec.params) return spec.params.every(function (p) { return c.indexOf(p) !== -1; });
        if (spec.exactFilled != null) return c.length === spec.exactFilled;
        if (spec.minFilled != null) return c.length >= spec.minFilled;
        return false;
      })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  }

  // Same layout as the Case Studies list row, plus the parameter chips -
  // those are what these drill-downs are about, and the list row only shows
  // a one-line setup summary. Chips that satisfied the clicked stat's
  // matching rule are highlighted.
  function cmDrillTradeRowHtml(trade, matched) {
    var dot = OUTCOME_DOT_CLASS[trade.outcome] || OUTCOME_DOT_CLASS.open;
    var pillClass = OUTCOME_PILL_CLASS[trade.outcome] || OUTCOME_PILL_CLASS.open;
    var directionClass = DIRECTION_BADGE_CLASS[trade.direction] || DIRECTION_BADGE_CLASS.long;
    var chips = nonEmptyConfluence(trade).map(function (tag) {
      var hit = matched.indexOf(tag) !== -1;
      return '<span class="' + (hit ? 'bg-primary/10 text-primary font-semibold' : 'bg-surface-container-low text-on-surface-variant') + ' font-body-sm text-[12px] px-2 py-0.5 rounded">' + escapeHtml(tag) + '</span>';
    }).join('') || '<span class="font-metric-sm text-[11px] text-outline-variant">No parameters logged</span>';
    return (
      '<a href="#case-studies/' + encodeURIComponent(trade.id) + '" class="block px-5 py-3.5 hover:bg-surface-container-low/60 transition-colors">' +
        '<div class="flex items-center justify-between gap-3">' +
          '<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-wrap sm:flex-nowrap">' +
            '<div class="flex flex-col shrink-0 w-14 sm:w-16">' +
              '<span class="font-headline-sm text-headline-sm text-on-surface font-semibold">' + formatDateLabel(trade.date) + '</span>' +
              '<span class="font-metric-sm text-metric-sm text-secondary">' + weekdayLabel(trade.date) + '</span>' +
            '</div>' +
            '<span class="font-metric-md text-metric-md font-bold text-on-surface truncate">' + escapeHtml(trade.pair) + '</span>' +
            '<span class="' + directionClass + ' font-metric-sm text-[11px] font-semibold px-2 py-0.5 rounded shrink-0">' + escapeHtml(trade.direction.toUpperCase()) + '</span>' +
          '</div>' +
          '<div class="flex items-center gap-2 shrink-0">' +
            '<span class="' + pillClass + ' font-metric-sm text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">' +
              '<span class="w-1.5 h-1.5 rounded-full ' + dot + '"></span>' + escapeHtml(trade.outcome.toUpperCase()) +
            '</span>' +
            '<span class="material-symbols-outlined text-secondary text-[18px]">chevron_right</span>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center flex-wrap gap-1 mt-2">' + chips + '</div>' +
      '</a>'
    );
  }

  var cmDrillTrigger = null;
  var cmDrillSaveParams = [];

  // Parameters present on every trade in the list, minus bare fib-depth
  // numbers like "32%" (they're values, not parameters - the stats skip them too).
  function cmCommonParameters(trades) {
    if (!trades.length) return [];
    return nonEmptyConfluence(trades[0]).filter(function (p) {
      return !isBareNumber(p) && trades.every(function (t) { return nonEmptyConfluence(t).indexOf(p) !== -1; });
    });
  }

  function openCmDrillModal(spec, trigger) {
    var modal = document.getElementById('cm-drill-modal');
    var body = document.getElementById('cm-drill-body');
    var title = document.getElementById('cm-drill-title');
    if (!modal || !body || !title || !spec) return;

    var trades = cmDrillTrades(spec);
    var wins = trades.filter(function (t) { return t.outcome === 'win'; }).length;
    title.textContent = spec.title + ' — ' + trades.length + ' trade' + (trades.length === 1 ? '' : 's') + ', ' + wins + ' win' + (wins === 1 ? '' : 's');

    var matched = spec.params || [];
    body.innerHTML = trades.length
      ? '<div class="divide-y divide-surface-container-low">' + trades.map(function (t) { return cmDrillTradeRowHtml(t, matched); }).join('') + '</div>'
      : '<div class="px-5 py-10 text-center font-body-sm text-body-sm text-secondary">No matching trades.</div>';
    body.scrollTop = 0;

    // "Save as Setup": a params spec is already a combination; a count- or
    // id-based one (filled-slot bars, high confluence, loss profile) has no
    // single combination, so it offers what every matched trade has in common.
    // (noSave: a pattern to avoid shouldn't be one click from becoming a setup.)
    cmDrillSaveParams = (spec.fromSetup || spec.noSave) ? [] : (spec.params ? spec.params.slice() : cmCommonParameters(trades));
    var footer = document.getElementById('cm-drill-footer');
    if (footer) footer.hidden = !cmDrillSaveParams.length;

    cmDrillTrigger = trigger || null;
    modal.hidden = false;
    var closeBtn = document.getElementById('cm-drill-close');
    if (closeBtn) closeBtn.focus();
  }

  function closeCmDrillModal(restoreFocus) {
    var modal = document.getElementById('cm-drill-modal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    if (restoreFocus && cmDrillTrigger && document.body.contains(cmDrillTrigger)) cmDrillTrigger.focus();
    cmDrillTrigger = null;
  }

  // ---------------------------------------------------------------------
  // Playbook Setups: builder + saved list
  // ---------------------------------------------------------------------

  var cmBuilderSelected = [];
  var cmBuilderNameTouched = false;
  var cmRenamingSetupId = null;

  // Every parameter that appears on any trade. Trade data uses names the
  // picker vocabulary may not list (e.g. "4H BOS"), and the builder has to
  // be able to express the combinations this page reports on.
  function cmKnownTradeParameters() {
    var seen = {};
    var names = [];
    TradeStore.getAll().forEach(function (t) {
      nonEmptyConfluence(t).forEach(function (p) {
        if (isBareNumber(p) || seen[p.toLowerCase()]) return;
        seen[p.toLowerCase()] = true;
        names.push(p);
      });
    });
    return names;
  }

  function cmSetupKey(params) {
    return params.map(function (p) { return p.toLowerCase(); }).sort().join('\u0001');
  }

  function cmSetupStat(params, closed) {
    var trades = cmDrillTrades({ params: params }, closed);
    var wins = trades.filter(function (t) { return t.outcome === 'win'; }).length;
    return { total: trades.length, wins: wins, rate: pct(wins, trades.length) };
  }

  function showBuilderNote(section, message, isError) {
    var note = section.querySelector('#cm-builder-note');
    if (!note) return;
    note.textContent = message || '';
    note.className = 'font-metric-sm text-metric-sm mt-1.5 ' + (isError ? 'text-error' : 'text-secondary');
    note.hidden = !message;
  }

  function syncBuilderSaveState(section) {
    var saveBtn = section.querySelector('#cm-builder-save');
    var nameInput = section.querySelector('#cm-builder-name');
    if (saveBtn && nameInput) saveBtn.disabled = !cmBuilderSelected.length || !nameInput.value.trim();
  }

  function builderStatHtml(closed) {
    if (!cmBuilderSelected.length) {
      return '<span class="font-body-sm text-body-sm text-secondary">Select parameters to see how that combination has performed.</span>';
    }
    var stat = cmSetupStat(cmBuilderSelected, closed);
    if (!stat.total) {
      return '<span class="font-body-sm text-body-sm text-secondary">No closed trades contain all ' + cmBuilderSelected.length + ' selected parameter' + (cmBuilderSelected.length === 1 ? '' : 's') + ' yet.</span>';
    }
    var colors = rateColors(stat.rate);
    return (
      '<div class="flex items-center justify-between gap-3">' +
        '<div class="flex flex-col min-w-0">' +
          '<span class="font-headline-sm text-headline-sm text-on-surface font-semibold">' + stat.total + ' trade' + (stat.total === 1 ? '' : 's') + ' · ' + stat.wins + ' win' + (stat.wins === 1 ? '' : 's') + '</span>' +
          '<span class="font-metric-sm text-metric-sm text-secondary">Closed trades containing all selected parameters</span>' +
        '</div>' +
        '<div class="flex items-center gap-3 shrink-0">' +
          '<span class="font-metric-md text-metric-md font-semibold ' + colors.pill + ' px-2 py-0.5 rounded-full">' + stat.wins + '/' + stat.total + ' (' + stat.rate + '%)</span>' +
          '<button type="button" id="cm-builder-view" class="inline-flex items-center gap-1 text-primary hover:text-primary-container font-headline-sm text-headline-sm font-medium transition-colors">View trades<span class="material-symbols-outlined text-[15px]">arrow_forward</span></button>' +
        '</div>' +
      '</div>' +
      '<div class="mt-2.5 h-2 w-full bg-surface-container-high rounded-full overflow-hidden"><div class="h-full ' + colors.bar + ' rounded-full" style="width: ' + stat.rate + '%"></div></div>'
    );
  }

  // Lower bound of the Wilson score interval for a win rate (95% by default).
  // Ranks small samples honestly: 3/3 scores well below 30/30, where a raw
  // win rate calls them both 100%. Shared by anything that has to judge one
  // combination as better or worse than another (a future Auto-Discover
  // should call this too, so both places agree on what "improved" means).
  function wilsonBounds(wins, total, z) {
    if (!total) return { lower: 0, upper: 1 };
    z = z || 1.96;
    var p = wins / total;
    var z2 = z * z;
    var centre = p + z2 / (2 * total);
    var margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
    var denom = 1 + z2 / total;
    return { lower: (centre - margin) / denom, upper: (centre + margin) / denom };
  }

  function wilsonLowerBound(wins, total, z) {
    return wilsonBounds(wins, total, z).lower;
  }

  // The other end of the same interval: the best win rate a combination could
  // plausibly still have. Used to rank losing patterns - a combination is only
  // confidently bad when even its optimistic end is low.
  function wilsonUpperBound(wins, total, z) {
    return wilsonBounds(wins, total, z).upper;
  }

  // One step from the current selection: for every parameter not yet
  // selected, how the combination would perform with it added. Adding a
  // parameter can only narrow the matching trades, so the candidates are
  // just the other parameters carried by trades that already match.
  //   best  - highest Wilson lower bound, and only if it beats the current
  //           selection's (so a subset with the same record isn't "better");
  //   worst - the addition that would cut the win rate the most, ignoring
  //           drops under 5 points as noise.
  // Additions leaving fewer than 2 matching trades are never surfaced.
  var CM_MIN_SUGGESTION_TRADES = 2;
  var CM_MIN_HURT_DROP = 0.05;

  function cmNextAdditions(selected, closed) {
    if (!selected.length) return null;
    var matched = cmDrillTrades({ params: selected }, closed);
    if (!matched.length) return null;
    var baseWins = matched.filter(function (t) { return t.outcome === 'win'; }).length;
    var base = { wins: baseWins, total: matched.length, rate: baseWins / matched.length, lb: wilsonLowerBound(baseWins, matched.length) };

    var counts = {};
    matched.forEach(function (t) {
      nonEmptyConfluence(t).forEach(function (p) {
        if (isBareNumber(p) || parameterInList(selected, p)) return;
        counts[p] = counts[p] || { name: p, wins: 0, total: 0 };
        counts[p].total++;
        if (t.outcome === 'win') counts[p].wins++;
      });
    });
    var candidates = Object.keys(counts).map(function (k) {
      var c = counts[k];
      c.rate = c.wins / c.total;
      c.lb = wilsonLowerBound(c.wins, c.total);
      return c;
    }).filter(function (c) { return c.total >= CM_MIN_SUGGESTION_TRADES; });

    var best = candidates.filter(function (c) { return c.lb > base.lb + 0.005; }).sort(function (a, b) {
      return (b.lb - a.lb) || (b.total - a.total) || a.name.localeCompare(b.name);
    })[0] || null;
    var worst = candidates.filter(function (c) { return c.rate < base.rate - CM_MIN_HURT_DROP; }).sort(function (a, b) {
      return (a.rate - b.rate) || (b.total - a.total) || a.name.localeCompare(b.name);
    })[0] || null;
    return { base: base, best: best, worst: worst };
  }

  function builderHintsHtml(closed) {
    var next = cmNextAdditions(cmBuilderSelected, closed);
    if (!next || (!next.best && !next.worst)) return '';
    function record(s) { return s.wins + '/' + s.total + ' (' + pct(s.wins, s.total) + '%)'; }
    var html = '';
    if (next.best) {
      html +=
        '<button type="button" class="cm-builder-suggest w-full text-left flex items-start gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" data-value="' + escapeHtml(next.best.name) + '">' +
          '<span class="material-symbols-outlined text-[18px] shrink-0 mt-px">lightbulb</span>' +
          '<span class="font-body-sm text-body-sm">Adding <span class="font-semibold">\'' + escapeHtml(next.best.name) + '\'</span> would take this from ' + record(next.base) + ' to ' + record(next.best) + ' — <span class="font-semibold underline">try it</span></span>' +
        '</button>';
    }
    if (next.worst) {
      html +=
        '<div class="flex items-start gap-2 px-3 py-2 rounded-lg bg-warning-container text-on-warning-container">' +
          '<span class="material-symbols-outlined text-[18px] shrink-0 mt-px">warning</span>' +
          '<span class="font-body-sm text-body-sm">Adding <span class="font-semibold">\'' + escapeHtml(next.worst.name) + '\'</span> would drop this from ' + record(next.base) + ' to ' + record(next.worst) + '</span>' +
        '</div>';
    }
    return html;
  }

  function renderSetupBuilder(section, closed) {
    var grid = section.querySelector('#cm-builder-grid');
    if (!grid) return;
    var scrollTop = grid.scrollTop;
    grid.innerHTML = parameterPickerGridHtml(cmBuilderSelected, { manage: false, extraKnown: cmKnownTradeParameters() }) ||
      '<p class="font-metric-sm text-metric-sm text-secondary">No parameters yet. Log a trade with confluence parameters first.</p>';
    grid.scrollTop = scrollTop;

    var countEl = section.querySelector('#cm-builder-count');
    if (countEl) countEl.textContent = cmBuilderSelected.length + ' selected';
    var clearBtn = section.querySelector('#cm-builder-clear');
    if (clearBtn) clearBtn.hidden = !cmBuilderSelected.length;

    var statEl = section.querySelector('#cm-builder-stat');
    if (statEl) statEl.innerHTML = builderStatHtml(closed);
    var hintsEl = section.querySelector('#cm-builder-hints');
    if (hintsEl) {
      var hintsHtml = builderHintsHtml(closed);
      hintsEl.innerHTML = hintsHtml;
      hintsEl.hidden = !hintsHtml;
    }

    // The suggested name follows the selection until the user edits it.
    var nameInput = section.querySelector('#cm-builder-name');
    if (nameInput && (!cmBuilderNameTouched || !nameInput.value.trim())) {
      nameInput.value = cmBuilderSelected.join(' + ');
      cmBuilderNameTouched = false;
    }
    syncBuilderSaveState(section);
  }

  function setupRowHtml(setup, closed) {
    var stat = cmSetupStat(setup.parameters, closed);
    var colors = rateColors(stat.rate);
    var statHtml = stat.total
      ? '<span class="font-metric-sm text-[11px] font-semibold ' + colors.pill + ' px-2 py-0.5 rounded-full whitespace-nowrap">' + stat.wins + '/' + stat.total + ' (' + stat.rate + '%)</span>'
      : '<span class="font-metric-sm text-[11px] text-outline-variant whitespace-nowrap">No closed trades yet</span>';
    var nameHtml = cmRenamingSetupId === setup.id
      ? '<input type="text" class="cm-setup-rename-input h-[30px] w-full min-w-0 px-2.5 rounded-lg bg-surface-container-lowest text-on-surface font-headline-sm text-headline-sm focus:outline-none focus:ring-2 focus:ring-primary/30" maxlength="80" value="' + escapeHtml(setup.name) + '" aria-label="Setup name" />'
      : '<span class="font-headline-sm text-headline-sm text-on-surface font-semibold truncate" title="' + escapeHtml(setup.name) + '">' + escapeHtml(setup.name) + '</span>';
    var chips = setup.parameters.map(function (p) {
      return '<span class="bg-surface-container-lowest text-on-surface-variant font-body-sm text-[12px] px-2 py-0.5 rounded">' + escapeHtml(p) + '</span>';
    }).join('');
    var btn = 'w-8 h-8 rounded-lg bg-surface-container-lowest flex items-center justify-center text-secondary transition-colors ';
    return (
      '<div class="cm-setup-row rounded-xl bg-surface-container-low/60 p-3.5 flex flex-col gap-2.5" data-setup-id="' + escapeHtml(setup.id) + '">' +
        '<div class="flex items-center justify-between gap-2"><div class="min-w-0 flex-1 flex">' + nameHtml + '</div>' + statHtml + '</div>' +
        '<div class="flex items-center flex-wrap gap-1">' + (chips || '<span class="font-metric-sm text-[11px] text-outline-variant">No parameters</span>') + '</div>' +
        '<div class="flex items-center justify-between pt-2 border-t border-surface-container-low">' +
          '<button type="button" class="cm-setup-view inline-flex items-center gap-1 text-primary hover:text-primary-container font-headline-sm text-headline-sm font-medium transition-colors">View matching trades<span class="material-symbols-outlined text-[15px]">arrow_forward</span></button>' +
          '<div class="flex items-center gap-2">' +
            '<button type="button" class="cm-setup-rename ' + btn + 'hover:text-primary" title="Rename setup" aria-label="Rename setup"><span class="material-symbols-outlined text-[18px]">edit</span></button>' +
            '<button type="button" class="cm-setup-delete ' + btn + 'hover:text-error" title="Delete setup" aria-label="Delete setup"><span class="material-symbols-outlined text-[18px]">delete</span></button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderSavedSetups(section, closed) {
    var list = section.querySelector('#cm-saved-setups-list');
    if (!list) return;
    var setups = SetupStore.getAll().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    list.innerHTML = setups.length
      ? setups.map(function (s) { return setupRowHtml(s, closed); }).join('')
      : '<p class="font-body-sm text-body-sm text-secondary">No setups saved yet. Build a combination on the left, or use "Save as Setup" from any stat\'s trade list.</p>';
    var renameInput = list.querySelector('.cm-setup-rename-input');
    if (renameInput) { renameInput.focus(); renameInput.select(); }
  }

  function renderPlaybookSetups(section) {
    var closed = cmClosedTrades();
    renderSetupBuilder(section, closed);
    renderSavedSetups(section, closed);
    if (cmDiscoverOpen) runAutoDiscover(section, closed);
    if (cmAvoidOpen) runAvoidPatterns(section, closed);
    renderFlaggedAntiPatterns(section, closed);
  }

  // ---------------------------------------------------------------------
  // Auto-Discover Setups
  // ---------------------------------------------------------------------

  var CM_DISCOVER_MIN_SIZE = 2;
  var CM_DISCOVER_MAX_SIZE = 5;
  var CM_DISCOVER_TOP = 10;
  var CM_DISCOVER_DEFAULT_MIN_TRADES = 2;
  // Below this many closed trades every result is an early lead at best.
  var CM_SMALL_SAMPLE_TRADES = 20;

  var cmDiscoverOpen = false;
  var cmDiscoverMinTrades = CM_DISCOVER_DEFAULT_MIN_TRADES;
  var cmDiscoverResults = [];

  // Counts every 2-5 parameter combination that actually occurs, with its
  // wins/total over closed trades. A trade contributes to every combination
  // it *contains*, which is exactly the "contains ALL selected parameters"
  // rule the builder and drill-downs use - but built from what trades carry
  // rather than by testing every possible combination of the vocabulary
  // (millions, nearly all matching nothing). Parameters on fewer than
  // minTrades trades are dropped up front: a combination can't match more
  // trades than its rarest member.
  function cmDiscoverCombos(closed, minTrades) {
    var tradeParams = closed.map(function (t) {
      return nonEmptyConfluence(t).filter(function (p) { return !isBareNumber(p); });
    });
    var freq = {};
    tradeParams.forEach(function (list) {
      list.forEach(function (p) { freq[p] = (freq[p] || 0) + 1; });
    });

    var combos = {};
    closed.forEach(function (trade, index) {
      var params = tradeParams[index]
        .filter(function (p) { return freq[p] >= minTrades; })
        .filter(function (p, i, arr) { return arr.indexOf(p) === i; })
        .sort();
      var won = trade.outcome === 'win';

      function extend(start, chosen) {
        if (chosen.length >= CM_DISCOVER_MIN_SIZE) {
          var key = chosen.join('\u0001');
          var entry = combos[key] || (combos[key] = { params: chosen.slice(), wins: 0, total: 0, ids: [] });
          entry.total++;
          if (won) entry.wins++;
          entry.ids.push(index);
        }
        if (chosen.length === CM_DISCOVER_MAX_SIZE) return;
        for (var i = start; i < params.length; i++) {
          chosen.push(params[i]);
          extend(i + 1, chosen);
          chosen.pop();
        }
      }
      extend(0, []);
    });
    return combos;
  }

  // Ranks by the Wilson lower bound, not the raw win rate, so a lucky 2/2
  // doesn't outrank a sturdier 7/8. Combinations that match exactly the same
  // trades are the same finding, so only the simplest (fewest parameters) is
  // kept - otherwise adding a parameter every matching trade already has
  // would fill the list with copies. Sub-50% combinations aren't "best
  // performing" whatever their sample, so they aren't listed.
  //
  // mode 'worst' runs the same search inverted for Patterns to Avoid: only
  // combinations below 50% qualify, ranked by the Wilson UPPER bound
  // ascending, so a combination needs a trustworthy record of losing (not
  // one unlucky trade) to rank high.
  function cmDiscoverSetups(closed, minTrades, mode) {
    var worst = mode === 'worst';
    var combos = cmDiscoverCombos(closed, minTrades);
    var keys = Object.keys(combos);
    var bySignature = {};
    keys.forEach(function (k) {
      var c = combos[k];
      if (c.total < minTrades) return;
      if (worst ? c.wins / c.total >= 0.5 : c.wins / c.total < 0.5) return;
      var signature = c.ids.join(',');
      var kept = bySignature[signature];
      if (!kept || c.params.length < kept.params.length || (c.params.length === kept.params.length && k < kept.key)) {
        bySignature[signature] = { key: k, params: c.params, wins: c.wins, total: c.total };
      }
    });
    var ranked = Object.keys(bySignature).map(function (s) {
      var r = bySignature[s];
      r.rate = pct(r.wins, r.total);
      r.lb = wilsonLowerBound(r.wins, r.total);
      r.ub = wilsonUpperBound(r.wins, r.total);
      return r;
    }).sort(function (a, b) {
      var byScore = worst ? (a.ub - b.ub) : (b.lb - a.lb);
      return byScore || (b.total - a.total) || (a.params.length - b.params.length) || (a.key < b.key ? -1 : 1);
    });
    return { evaluated: keys.length, qualifying: ranked.length, top: ranked.slice(0, CM_DISCOVER_TOP) };
  }

  // Sample-size tiers for the "how much to trust this" badge - separate from
  // the ranking score so the raw record stays visible next to it.
  function cmConfidenceTier(total) {
    if (total >= 10) return { label: 'High confidence', pill: 'bg-tertiary-fixed/30 text-tertiary' };
    if (total >= 5) return { label: 'Moderate sample', pill: 'bg-secondary-fixed/40 text-on-secondary-fixed-variant' };
    return { label: 'Thin data', pill: 'bg-warning-container text-on-warning-container' };
  }

  function discoverCardHtml(result, index, savedKeys) {
    var tier = cmConfidenceTier(result.total);
    var colors = rateColors(result.rate);
    var saved = !!savedKeys[cmSetupKey(result.params)];
    var chips = result.params.map(function (p) {
      return '<span class="bg-surface-container-lowest text-on-surface-variant font-body-sm text-[12px] px-2 py-0.5 rounded">' + escapeHtml(p) + '</span>';
    }).join('');
    var saveBtn = saved
      ? '<span class="h-[32px] px-3 rounded-lg bg-surface-container-lowest text-secondary font-headline-sm text-[12px] font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">check</span>Saved</span>'
      : '<button type="button" class="cm-discover-save h-[32px] px-3 rounded-lg bg-primary text-on-primary hover:opacity-90 font-headline-sm text-[12px] font-semibold transition-opacity flex items-center gap-1.5" data-index="' + index + '"><span class="material-symbols-outlined text-[16px]">bookmark_add</span>Save as Setup</button>';
    return (
      '<div class="rounded-xl bg-surface-container-low/60 p-4 flex flex-col gap-3">' +
        '<div class="flex items-start justify-between gap-2">' +
          '<div class="flex items-center gap-2 min-w-0">' +
            '<span class="w-6 h-6 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center font-metric-sm text-metric-sm font-bold shrink-0">' + (index + 1) + '</span>' +
            '<span class="font-metric-sm text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ' + tier.pill + '">' + tier.label + '</span>' +
          '</div>' +
          '<span class="font-metric-md text-metric-md font-semibold ' + colors.pill + ' px-2 py-0.5 rounded-full whitespace-nowrap">' + result.wins + '/' + result.total + ' (' + result.rate + '%)</span>' +
        '</div>' +
        '<div class="flex items-center flex-wrap gap-1">' + chips + '</div>' +
        '<div class="flex items-center justify-between gap-2 font-metric-sm text-metric-sm text-secondary">' +
          '<span>' + result.total + ' trades · ' + result.wins + ' win' + (result.wins === 1 ? '' : 's') + '</span>' +
          '<span class="cursor-help" title="Wilson lower bound: the win rate this combination should still clear at 95% confidence given its sample size. Results are ranked by this, not the raw win rate.">Confidence floor ' + Math.round(result.lb * 100) + '%</span>' +
        '</div>' +
        '<div class="flex items-center justify-between gap-2 pt-2 border-t border-surface-container-low">' +
          '<div class="flex items-center gap-3">' +
            '<button type="button" class="cm-discover-view inline-flex items-center gap-1 text-primary hover:text-primary-container font-headline-sm text-headline-sm font-medium transition-colors" data-index="' + index + '">View trades<span class="material-symbols-outlined text-[15px]">arrow_forward</span></button>' +
            '<button type="button" class="cm-discover-refine text-secondary hover:text-on-surface font-metric-sm text-metric-sm font-semibold transition-colors" data-index="' + index + '">Refine in builder</button>' +
          '</div>' +
          saveBtn +
        '</div>' +
      '</div>'
    );
  }

  function renderDiscoverResults(section) {
    var body = section.querySelector('#cm-discover-results');
    if (!body) return;
    var savedKeys = {};
    SetupStore.getAll().forEach(function (s) { savedKeys[cmSetupKey(s.parameters)] = true; });
    body.innerHTML = cmDiscoverResults.map(function (r, i) { return discoverCardHtml(r, i, savedKeys); }).join('');
  }

  function runAutoDiscover(section, closed) {
    var panel = section.querySelector('#cm-discover-panel');
    if (!panel) return;
    var found = cmDiscoverSetups(closed, cmDiscoverMinTrades);
    cmDiscoverResults = found.top;

    var banner = section.querySelector('#cm-discover-banner');
    if (banner) banner.hidden = closed.length >= CM_SMALL_SAMPLE_TRADES;
    var bannerText = section.querySelector('#cm-discover-banner-text');
    if (bannerText) bannerText.textContent = 'Small sample (' + closed.length + ' closed trade' + (closed.length === 1 ? '' : 's') + ') — treat these as early leads, not proven edges.';

    var summary = section.querySelector('#cm-discover-summary');
    if (summary) {
      if (!closed.length) {
        summary.textContent = 'No closed trades yet. Close a few trades and discovery has something to search.';
      } else if (!found.qualifying) {
        summary.textContent = 'Searched ' + found.evaluated + ' combination' + (found.evaluated === 1 ? '' : 's') + ' across ' + closed.length + ' closed trades. None with ' + cmDiscoverMinTrades + '+ matching trades has a win rate of 50% or better yet.';
      } else {
        summary.textContent = 'Top ' + found.top.length + ' of ' + found.qualifying + ' qualifying combinations (' + cmDiscoverMinTrades + '+ trades, 50%+ win rate), from ' + found.evaluated + ' searched across ' + closed.length + ' closed trades. Combinations matching the same trades are shown once, as the simplest.';
      }
    }
    renderDiscoverResults(section);
  }

  function setDiscoverOpen(section, open) {
    cmDiscoverOpen = open;
    var panel = section.querySelector('#cm-discover-panel');
    var btn = section.querySelector('#cm-discover-btn');
    if (panel) panel.hidden = !open;
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      runAutoDiscover(section, cmClosedTrades());
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function initAutoDiscoverControls(section) {
    var btn = section.querySelector('#cm-discover-btn');
    var panel = section.querySelector('#cm-discover-panel');
    if (!btn || !panel) return;

    btn.addEventListener('click', function () { setDiscoverOpen(section, !cmDiscoverOpen); });
    var closeBtn = section.querySelector('#cm-discover-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        setDiscoverOpen(section, false);
        btn.focus();
      });
    }

    var minInput = section.querySelector('#cm-discover-min');
    if (minInput) {
      minInput.addEventListener('input', function () {
        var value = parseInt(minInput.value, 10);
        // Below 2 a single trade could "qualify" - the very noise this filters.
        if (isNaN(value) || value < 2) return;
        cmDiscoverMinTrades = Math.min(value, 99);
        runAutoDiscover(section, cmClosedTrades());
      });
      minInput.addEventListener('blur', function () { minInput.value = String(cmDiscoverMinTrades); });
    }

    var results = section.querySelector('#cm-discover-results');
    if (results) {
      results.addEventListener('click', function (e) {
        var target = e.target.closest ? e.target.closest('button[data-index]') : null;
        if (!target) return;
        var result = cmDiscoverResults[parseInt(target.getAttribute('data-index'), 10)];
        if (!result) return;

        if (target.classList.contains('cm-discover-view')) {
          openCmDrillModal({ title: 'Trades using ' + result.params.join(' + '), params: result.params.slice() }, target);
        } else if (target.classList.contains('cm-discover-refine')) {
          prefillSetupBuilder(section, result.params);
        } else if (target.classList.contains('cm-discover-save')) {
          var saved = addPlaybookSetup(result.params.join(' + '), result.params);
          if (saved.ok || saved.duplicate) {
            renderSavedSetups(section, cmClosedTrades());
            renderDiscoverResults(section);
          } else {
            window.alert('Could not save. Local storage is full or unavailable.');
          }
        }
      });
    }
  }

  // The one place a setup gets created, shared by the builder and the
  // Auto-Discover cards. A combination that's already saved (under any name,
  // any order) is refused rather than duplicated.
  // `store` defaults to the setups; Patterns to Avoid passes AntiPatternStore
  // to flag a combination through the same path.
  function addPlaybookSetup(name, params, store) {
    store = store || SetupStore;
    var key = cmSetupKey(params);
    var duplicate = store.getAll().filter(function (s) { return cmSetupKey(s.parameters) === key; })[0];
    if (duplicate) return { ok: false, duplicate: duplicate };
    var ok = store.add({
      id: 'setup-' + Date.now(),
      name: name,
      parameters: params.slice(),
      createdAt: new Date().toISOString()
    });
    return { ok: ok, duplicate: null };
  }

  function saveBuilderSetup(section) {
    var nameInput = section.querySelector('#cm-builder-name');
    var name = nameInput ? nameInput.value.trim() : '';
    if (!cmBuilderSelected.length || !name) return;

    var result = addPlaybookSetup(name, cmBuilderSelected);
    if (result.duplicate) {
      showBuilderNote(section, 'Already saved as "' + result.duplicate.name + '".', true);
      return;
    }
    if (!result.ok) {
      showBuilderNote(section, 'Could not save. Local storage is full or unavailable.', true);
      return;
    }
    cmBuilderSelected = [];
    cmBuilderNameTouched = false;
    if (nameInput) nameInput.value = '';
    renderPlaybookSetups(section);
    showBuilderNote(section, 'Saved "' + name + '" to your playbook.', false);
  }

  // Loads a parameter combination into the builder, scrolls to it and puts
  // the cursor in the name field - used by the drill-down's Save as Setup.
  function prefillSetupBuilder(section, params) {
    cmBuilderSelected = params.slice();
    cmBuilderNameTouched = false;
    renderPlaybookSetups(section);
    showBuilderNote(section, '', false);
    var builder = section.querySelector('#cm-setup-builder');
    if (builder) builder.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var nameInput = section.querySelector('#cm-builder-name');
    if (nameInput) nameInput.focus({ preventScroll: true });
  }

  function commitSetupRename(section, id, input) {
    var name = input.value.trim();
    if (!name) {
      input.classList.add('ring-2', 'ring-error/50');
      return false;
    }
    cmRenamingSetupId = null;
    SetupStore.rename(id, name);
    renderSavedSetups(section, cmClosedTrades());
    return true;
  }

  function initPlaybookSetupControls(section) {
    var grid = section.querySelector('#cm-builder-grid');
    if (grid) {
      grid.addEventListener('click', function (e) {
        var chip = e.target.closest ? e.target.closest('.confluence-chip') : null;
        if (!chip) return;
        var value = chip.getAttribute('data-value');
        cmBuilderSelected = parameterInList(cmBuilderSelected, value)
          ? cmBuilderSelected.filter(function (p) { return p.toLowerCase() !== value.toLowerCase(); })
          : cmBuilderSelected.concat(value);
        showBuilderNote(section, '', false);
        renderSetupBuilder(section, cmClosedTrades());
      });
    }

    var clearBtn = section.querySelector('#cm-builder-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        cmBuilderSelected = [];
        cmBuilderNameTouched = false;
        showBuilderNote(section, '', false);
        renderSetupBuilder(section, cmClosedTrades());
      });
    }

    var hintsEl = section.querySelector('#cm-builder-hints');
    if (hintsEl) {
      // Taking the suggestion is just another selection change, so the stat
      // and the next suggestion both re-derive from the new selection.
      hintsEl.addEventListener('click', function (e) {
        var suggestion = e.target.closest ? e.target.closest('.cm-builder-suggest') : null;
        if (!suggestion) return;
        var value = suggestion.getAttribute('data-value');
        if (!parameterInList(cmBuilderSelected, value)) cmBuilderSelected = cmBuilderSelected.concat(value);
        showBuilderNote(section, '', false);
        renderSetupBuilder(section, cmClosedTrades());
      });
    }

    var statEl = section.querySelector('#cm-builder-stat');
    if (statEl) {
      statEl.addEventListener('click', function (e) {
        var viewBtn = e.target.closest ? e.target.closest('#cm-builder-view') : null;
        if (!viewBtn || !cmBuilderSelected.length) return;
        openCmDrillModal({ title: 'Trades using ' + cmBuilderSelected.join(' + '), params: cmBuilderSelected.slice() }, viewBtn);
      });
    }

    var nameInput = section.querySelector('#cm-builder-name');
    if (nameInput) {
      nameInput.addEventListener('input', function () {
        cmBuilderNameTouched = true;
        showBuilderNote(section, '', false);
        syncBuilderSaveState(section);
      });
      nameInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        saveBuilderSetup(section);
      });
    }
    var saveBtn = section.querySelector('#cm-builder-save');
    if (saveBtn) saveBtn.addEventListener('click', function () { saveBuilderSetup(section); });

    var list = section.querySelector('#cm-saved-setups-list');
    if (list) {
      list.addEventListener('click', function (e) {
        var row = e.target.closest ? e.target.closest('.cm-setup-row') : null;
        if (!row) return;
        var setup = SetupStore.getById(row.getAttribute('data-setup-id'));
        if (!setup) return;

        var viewBtn = e.target.closest('.cm-setup-view');
        if (viewBtn) {
          openCmDrillModal({ title: 'Trades using setup "' + setup.name + '"', params: setup.parameters, fromSetup: true }, viewBtn);
          return;
        }
        if (e.target.closest('.cm-setup-rename')) {
          cmRenamingSetupId = setup.id;
          renderSavedSetups(section, cmClosedTrades());
          return;
        }
        if (e.target.closest('.cm-setup-delete')) {
          if (!window.confirm('Delete setup "' + setup.name + '"?\n\nYour trades are not affected.')) return;
          if (cmRenamingSetupId === setup.id) cmRenamingSetupId = null;
          SetupStore.remove(setup.id);
          renderSavedSetups(section, cmClosedTrades());
        }
      });
      list.addEventListener('keydown', function (e) {
        var input = e.target.closest ? e.target.closest('.cm-setup-rename-input') : null;
        if (!input) return;
        var row = input.closest('.cm-setup-row');
        if (e.key === 'Enter') {
          e.preventDefault();
          commitSetupRename(section, row.getAttribute('data-setup-id'), input);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cmRenamingSetupId = null;
          renderSavedSetups(section, cmClosedTrades());
        }
      });
      // Clicking away commits a valid rename and quietly abandons a blank one.
      // cmRenamingSetupId is cleared before any re-render, so the blur that
      // fires when the input is removed doesn't run this a second time.
      list.addEventListener('focusout', function (e) {
        var input = e.target.closest ? e.target.closest('.cm-setup-rename-input') : null;
        if (!input || cmRenamingSetupId === null) return;
        var row = input.closest('.cm-setup-row');
        if (!commitSetupRename(section, row.getAttribute('data-setup-id'), input)) {
          cmRenamingSetupId = null;
          renderSavedSetups(section, cmClosedTrades());
        }
      });
    }

    var drillSave = document.getElementById('cm-drill-save');
    if (drillSave) {
      drillSave.addEventListener('click', function () {
        var params = cmDrillSaveParams.slice();
        if (!params.length) return;
        closeCmDrillModal(false);
        prefillSetupBuilder(section, params);
      });
    }
  }

  // ---------------------------------------------------------------------
  // Patterns to Avoid (Auto-Discover, inverted)
  // ---------------------------------------------------------------------

  var cmAvoidOpen = false;
  var cmAvoidMinTrades = CM_DISCOVER_DEFAULT_MIN_TRADES;
  var cmAvoidResults = [];

  function avoidCardHtml(result, index, flaggedKeys) {
    var tier = cmConfidenceTier(result.total);
    var losses = result.total - result.wins;
    var flagged = !!flaggedKeys[cmSetupKey(result.params)];
    var colors = rateColors(result.rate);
    var chips = result.params.map(function (p) {
      return '<span class="bg-surface-container-lowest text-on-surface-variant font-body-sm text-[12px] px-2 py-0.5 rounded">' + escapeHtml(p) + '</span>';
    }).join('');
    var flagBtn = flagged
      ? '<span class="h-[32px] px-3 rounded-lg bg-surface-container-lowest text-secondary font-headline-sm text-[12px] font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">check</span>Flagged</span>'
      : '<button type="button" class="cm-avoid-flag h-[32px] px-3 rounded-lg bg-error text-on-error hover:opacity-90 font-headline-sm text-[12px] font-semibold transition-opacity flex items-center gap-1.5" data-index="' + index + '"><span class="material-symbols-outlined text-[16px]">flag</span>Flag as Anti-Pattern</button>';
    return (
      '<div class="rounded-xl bg-error-container/20 p-4 flex flex-col gap-3">' +
        '<div class="flex items-start justify-between gap-2">' +
          '<div class="flex items-center gap-2 min-w-0">' +
            '<span class="w-6 h-6 rounded-full bg-error-container text-error flex items-center justify-center font-metric-sm text-metric-sm font-bold shrink-0">' + (index + 1) + '</span>' +
            '<span class="font-metric-sm text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ' + cmConfidenceTier(result.total).pill + '">' + tier.label + '</span>' +
          '</div>' +
          '<span class="font-metric-md text-metric-md font-semibold ' + colors.pill + ' px-2 py-0.5 rounded-full whitespace-nowrap">' + result.wins + '/' + result.total + ' (' + result.rate + '%)</span>' +
        '</div>' +
        '<div class="flex items-center flex-wrap gap-1">' + chips + '</div>' +
        '<div class="flex items-center justify-between gap-2 font-metric-sm text-metric-sm text-secondary">' +
          '<span>' + result.total + ' trades · ' + losses + ' loss' + (losses === 1 ? '' : 'es') + '</span>' +
          '<span class="cursor-help" title="Wilson upper bound: the best win rate this combination could plausibly still have at 95% confidence given its sample size. Results are ranked by this, lowest first, so one unlucky trade can\'t rank high.">Best case ' + Math.round(result.ub * 100) + '%</span>' +
        '</div>' +
        '<div class="flex items-center justify-between gap-2 pt-2 border-t border-error/10">' +
          '<button type="button" class="cm-avoid-view inline-flex items-center gap-1 text-primary hover:text-primary-container font-headline-sm text-headline-sm font-medium transition-colors" data-index="' + index + '">View trades<span class="material-symbols-outlined text-[15px]">arrow_forward</span></button>' +
          flagBtn +
        '</div>' +
      '</div>'
    );
  }

  function renderAvoidResults(section) {
    var body = section.querySelector('#cm-avoid-results');
    if (!body) return;
    var flaggedKeys = {};
    AntiPatternStore.getAll().forEach(function (s) { flaggedKeys[cmSetupKey(s.parameters)] = true; });
    body.innerHTML = cmAvoidResults.map(function (r, i) { return avoidCardHtml(r, i, flaggedKeys); }).join('');
  }

  // Everything already flagged, with its live record - so a flag can always be
  // reviewed and removed, whether or not it still makes today's top list.
  function renderFlaggedAntiPatterns(section, closed) {
    var wrap = section.querySelector('#cm-avoid-flagged-wrap');
    var list = section.querySelector('#cm-avoid-flagged');
    if (!wrap || !list) return;
    var flagged = AntiPatternStore.getAll().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    wrap.hidden = !flagged.length;
    list.innerHTML = flagged.map(function (item) {
      var stat = cmSetupStat(item.parameters, closed);
      var colors = rateColors(stat.rate);
      var statHtml = stat.total
        ? '<span class="font-metric-sm text-[11px] font-semibold ' + colors.pill + ' px-2 py-0.5 rounded-full whitespace-nowrap">' + stat.wins + '/' + stat.total + ' (' + stat.rate + '%)</span>'
        : '<span class="font-metric-sm text-[11px] text-outline-variant whitespace-nowrap">No closed trades yet</span>';
      var chips = item.parameters.map(function (p) {
        return '<span class="bg-surface-container-lowest text-on-surface-variant font-body-sm text-[12px] px-2 py-0.5 rounded">' + escapeHtml(p) + '</span>';
      }).join('');
      return (
        '<div class="cm-flagged-row rounded-lg bg-surface-container-low/60 px-3 py-2.5 flex items-center justify-between gap-3" data-id="' + escapeHtml(item.id) + '">' +
          '<div class="flex items-center flex-wrap gap-1 min-w-0">' + chips + '</div>' +
          '<div class="flex items-center gap-2 shrink-0">' + statHtml +
            '<button type="button" class="cm-flagged-remove w-8 h-8 rounded-lg bg-surface-container-lowest flex items-center justify-center text-secondary hover:text-error transition-colors" title="Remove flag" aria-label="Remove anti-pattern flag"><span class="material-symbols-outlined text-[18px]">delete</span></button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function runAvoidPatterns(section, closed) {
    var found = cmDiscoverSetups(closed, cmAvoidMinTrades, 'worst');
    cmAvoidResults = found.top;

    var banner = section.querySelector('#cm-avoid-banner');
    if (banner) banner.hidden = closed.length >= CM_SMALL_SAMPLE_TRADES;
    var bannerText = section.querySelector('#cm-avoid-banner-text');
    if (bannerText) bannerText.textContent = 'Small sample (' + closed.length + ' closed trade' + (closed.length === 1 ? '' : 's') + ') — treat these as early leads, not proven edges.';

    var summary = section.querySelector('#cm-avoid-summary');
    if (summary) {
      if (!closed.length) {
        summary.textContent = 'No closed trades yet. Close a few trades and there is something to search.';
      } else if (!found.qualifying) {
        summary.textContent = 'Searched ' + found.evaluated + ' combination' + (found.evaluated === 1 ? '' : 's') + ' across ' + closed.length + ' closed trades. None with ' + cmAvoidMinTrades + '+ matching trades has a win rate under 50%. Nothing to avoid yet.';
      } else {
        summary.textContent = 'Top ' + found.top.length + ' of ' + found.qualifying + ' losing combinations (' + cmAvoidMinTrades + '+ trades, under 50% win rate), from ' + found.evaluated + ' searched across ' + closed.length + ' closed trades. Combinations matching the same trades are shown once, as the simplest.';
      }
    }
    renderAvoidResults(section);
  }

  function setAvoidOpen(section, open) {
    cmAvoidOpen = open;
    var panel = section.querySelector('#cm-avoid-panel');
    var btn = section.querySelector('#cm-avoid-btn');
    if (panel) panel.hidden = !open;
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      runAvoidPatterns(section, cmClosedTrades());
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function initAvoidControls(section) {
    var btn = section.querySelector('#cm-avoid-btn');
    var panel = section.querySelector('#cm-avoid-panel');
    if (!btn || !panel) return;

    btn.addEventListener('click', function () { setAvoidOpen(section, !cmAvoidOpen); });
    var closeBtn = section.querySelector('#cm-avoid-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        setAvoidOpen(section, false);
        btn.focus();
      });
    }

    var minInput = section.querySelector('#cm-avoid-min');
    if (minInput) {
      minInput.addEventListener('input', function () {
        var value = parseInt(minInput.value, 10);
        if (isNaN(value) || value < 2) return;
        cmAvoidMinTrades = Math.min(value, 99);
        runAvoidPatterns(section, cmClosedTrades());
      });
      minInput.addEventListener('blur', function () { minInput.value = String(cmAvoidMinTrades); });
    }

    var results = section.querySelector('#cm-avoid-results');
    if (results) {
      results.addEventListener('click', function (e) {
        var target = e.target.closest ? e.target.closest('button[data-index]') : null;
        if (!target) return;
        var result = cmAvoidResults[parseInt(target.getAttribute('data-index'), 10)];
        if (!result) return;

        if (target.classList.contains('cm-avoid-view')) {
          openCmDrillModal({ title: 'Trades using ' + result.params.join(' + '), params: result.params.slice(), noSave: true }, target);
        } else if (target.classList.contains('cm-avoid-flag')) {
          var flagged = addPlaybookSetup(result.params.join(' + '), result.params, AntiPatternStore);
          if (flagged.ok || flagged.duplicate) {
            renderFlaggedAntiPatterns(section, cmClosedTrades());
            renderAvoidResults(section);
          } else {
            window.alert('Could not flag. Local storage is full or unavailable.');
          }
        }
      });
    }

    var flaggedList = section.querySelector('#cm-avoid-flagged');
    if (flaggedList) {
      flaggedList.addEventListener('click', function (e) {
        var remove = e.target.closest ? e.target.closest('.cm-flagged-remove') : null;
        if (!remove) return;
        var row = remove.closest('.cm-flagged-row');
        var item = row ? AntiPatternStore.getById(row.getAttribute('data-id')) : null;
        if (!item) return;
        if (!window.confirm('Remove the anti-pattern flag on:\n' + item.parameters.join(' + ') + '?\n\nYour trades are not affected.')) return;
        AntiPatternStore.remove(item.id);
        renderFlaggedAntiPatterns(section, cmClosedTrades());
        renderAvoidResults(section);
      });
    }
  }

  function initConfluenceMatrixControls(section) {
    if (!section) return;
    initPlaybookSetupControls(section);
    initAutoDiscoverControls(section);
    initAvoidControls(section);

    function specFor(el) {
      var target = el && el.closest ? el.closest('[data-cm-drill]') : null;
      if (!target || !section.contains(target)) return null;
      var spec = cmDrillSpecs[parseInt(target.getAttribute('data-cm-drill'), 10)];
      return spec ? { spec: spec, target: target } : null;
    }

    section.addEventListener('click', function (e) {
      var hit = specFor(e.target);
      if (hit) openCmDrillModal(hit.spec, hit.target);
    });
    section.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var hit = specFor(e.target);
      if (!hit || e.target !== hit.target) return;
      e.preventDefault();
      openCmDrillModal(hit.spec, hit.target);
    });

    var modal = document.getElementById('cm-drill-modal');
    if (!modal) return;
    var backdrop = document.getElementById('cm-drill-backdrop');
    var closeBtn = document.getElementById('cm-drill-close');
    if (backdrop) backdrop.addEventListener('click', function () { closeCmDrillModal(true); });
    if (closeBtn) closeBtn.addEventListener('click', function () { closeCmDrillModal(true); });
    document.addEventListener('keydown', function (e) {
      if (!modal.hidden && e.key === 'Escape') closeCmDrillModal(true);
    });
    // Following a case-study link (or any other navigation) leaves the modal behind.
    document.addEventListener('screenchange', function () { closeCmDrillModal(false); });
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

  // ---------------------------------------------------------------------
  // Timing records
  // ---------------------------------------------------------------------
  //
  // The weekday/session maths below work on whichever collection the user
  // picked, so both are first normalized to one shape:
  //
  //   { dateStr, utcMinutes, isWin, isLoss, net, contextLabel, comboLabel }
  //
  // A trade carries confluence tags but only a local wall-clock "HH:mm"
  // (hence the timezone offset) and a manually-set outcome. A position
  // carries no tags but an exact UTC timestamp and real money, so its
  // labels fall back to the pair.

  function tradeToTimingRecord(trade, offsetMinutes) {
    var ret = computeTradeReturn(trade);
    return {
      id: trade.id,
      dateStr: trade.date,
      utcMinutes: entryUtcMinutesForTrade(trade, offsetMinutes),
      isWin: trade.outcome === 'win',
      isLoss: trade.outcome === 'loss',
      net: ret && ret.dollarPnl !== null ? ret.dollarPnl : null,
      contextLabel: shortContext(nonEmptyConfluence(trade)[0]),
      comboLabel: summarizeCombo(trade)
    };
  }

  function tradesToTimingRecords(trades) {
    var offsetMinutes = getEntryTzOffsetMinutes();
    return trades.map(function (t) { return tradeToTimingRecord(t, offsetMinutes); });
  }

  // Win/loss is classified on gross pnl (zero excluded) while the money
  // figure is net of fees - matching computePositionStats and the pair
  // breakdown exactly, so this screen can't disagree with Position History.
  function positionToTimingRecord(position) {
    var openMs = Date.parse(position.openTime);
    var utcMinutes = null;
    if (!isNaN(openMs)) {
      var d = new Date(openMs);
      utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
    }
    return {
      id: position.id,
      dateStr: isoDateOnly(position.openTime),
      utcMinutes: utcMinutes,
      isWin: position.pnl > 0,
      isLoss: position.pnl < 0,
      net: positionNet(position),
      contextLabel: position.pair,
      comboLabel: position.pair
    };
  }

  function positionsToTimingRecords(positions) {
    return positions.map(positionToTimingRecord);
  }

  function computeSessionStatsFromRecords(records) {
    var withTime = records.filter(function (r) {
      return (r.isWin || r.isLoss) && r.utcMinutes !== null;
    });

    var perHour = [];
    for (var h = 0; h < 24; h++) perHour.push({ hour: h, wins: 0, losses: 0, total: 0, net: 0 });

    var bySession = {};
    SESSIONS.forEach(function (s) { bySession[s.key] = { name: s.name, wins: 0, losses: 0, total: 0, net: 0 }; });

    withTime.forEach(function (r) {
      var hour = Math.floor(r.utcMinutes / 60);
      var bucket = perHour[hour];
      bucket.total++;
      bucket.net += r.net || 0;
      if (r.isWin) bucket.wins++; else bucket.losses++;

      SESSIONS.forEach(function (s) {
        if (hour >= s.start && hour < s.end) {
          var sb = bySession[s.key];
          sb.total++;
          sb.net += r.net || 0;
          if (r.isWin) sb.wins++; else sb.losses++;
        }
      });
    });

    var sessions = SESSIONS.map(function (s) {
      var sb = bySession[s.key];
      return { name: s.name, total: sb.total, wins: sb.wins, losses: sb.losses, net: sb.net, rate: pct(sb.wins, sb.total) };
    });

    return { loggedCount: withTime.length, perHour: perHour, sessions: sessions };
  }

  // Mirrors dayCellHtml's tinted-tile treatment (green all-win / amber mixed
  // / red all-loss / gray no-trades) so the session tiles read as the same
  // visual family as the day-of-week heatmap above them.
  // "3 positions" / "1 trade" - the screen renders whichever collection is
  // selected, so the noun is passed in rather than hardcoded.
  function timingCountLabel(count, noun) {
    return count + ' ' + noun + (count === 1 ? '' : 's');
  }

  // Real money is only meaningful for positions; a trade's dollarPnl is
  // usually null, so the net line is omitted entirely in trade mode.
  function timingNetLabel(net, usingPositions) {
    return usingPositions ? ' · ' + formatSignedMoney(net) : '';
  }

  // Option C: Frosted Neo-Fintech Light Design
  // High-contrast, crisp white surfaces, vibrant 4px left-accent stripes,
  // modern status micro-pills, and punchy typography.
  var NFT_LIGHT = {
    profit: {
      card: 'background: linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, var(--nft-card-end) 80%); border: 1px solid rgba(16, 185, 129, 0.22); border-left: 4px solid #10b981; box-shadow: 0 1px 3px rgba(16, 185, 129, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);',
      name: 'color: var(--nft-name);',
      pill: 'background: rgba(16, 185, 129, 0.12); color: var(--nft-profit-text); border: 1px solid rgba(16, 185, 129, 0.3);',
      dot: '#10b981',
      rate: 'color: var(--nft-profit-rate);',
      pnl: 'color: var(--nft-profit-text); background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2);',
      bar: 'var(--nft-profit-bar)',
      barLabel: 'color: var(--nft-profit-label);',
      tag: 'PROFIT'
    },
    loss: {
      card: 'background: linear-gradient(135deg, rgba(244, 63, 94, 0.05) 0%, var(--nft-card-end) 80%); border: 1px solid rgba(244, 63, 94, 0.22); border-left: 4px solid #f43f5e; box-shadow: 0 1px 3px rgba(244, 63, 94, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);',
      name: 'color: var(--nft-name);',
      pill: 'background: rgba(244, 63, 94, 0.10); color: var(--nft-loss-text); border: 1px solid rgba(244, 63, 94, 0.25);',
      dot: '#f43f5e',
      rate: 'color: var(--nft-loss-rate);',
      pnl: 'color: var(--nft-loss-text); background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.2);',
      bar: 'var(--nft-loss-bar)',
      barLabel: 'color: var(--nft-loss-label);',
      tag: 'LOSS'
    },
    mixed: {
      card: 'background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, var(--nft-card-end) 80%); border: 1px solid rgba(99, 102, 241, 0.22); border-left: 4px solid #6366f1; box-shadow: 0 1px 3px rgba(99, 102, 241, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);',
      name: 'color: var(--nft-name);',
      pill: 'background: rgba(99, 102, 241, 0.10); color: var(--nft-mixed-text); border: 1px solid rgba(99, 102, 241, 0.25);',
      dot: '#6366f1',
      rate: 'color: var(--nft-mixed-rate);',
      pnl: 'color: var(--nft-mixed-text); background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2);',
      bar: 'var(--nft-mixed-bar)',
      barLabel: 'color: var(--nft-mixed-label);',
      tag: 'MIXED'
    },
    empty: {
      card: 'background: var(--nft-empty-bg); border: 1px solid var(--nft-empty-border); border-left: 4px solid var(--nft-empty-accent);',
      name: 'color: var(--nft-empty-text);',
      pill: 'color: var(--nft-empty-text);',
      dot: 'var(--nft-empty-accent)',
      rate: 'color: var(--nft-empty-accent);',
      pnl: '',
      bar: 'var(--nft-empty-bar)',
      barLabel: 'color: var(--nft-empty-text);',
      tag: 'NO DATA'
    }
  };

  function sessionCellHtml(s, noun, usingPositions) {
    var profitable   = usingPositions && s.net > 0;
    var unprofitable = usingPositions && s.net < 0;

    if (s.total === 0) {
      var emptyCfg = NFT_LIGHT.empty;
      return (
        '<div class="group relative rounded-xl p-4 text-left flex flex-col justify-between h-36 transition-all duration-200" style="' + emptyCfg.card + '">' +
          '<div class="flex items-center justify-between">' +
            '<span class="text-xs font-bold uppercase tracking-wider" style="' + emptyCfg.name + '">' + escapeHtml(s.name) + '</span>' +
            '<span class="text-[10px] font-semibold text-slate-400">NO DATA</span>' +
          '</div>' +
          '<div class="my-auto py-1">' +
            '<span class="text-3xl font-extrabold tracking-tight block leading-none" style="' + emptyCfg.rate + '">—</span>' +
          '</div>' +
          '<div class="text-xs font-medium text-slate-400">no ' + noun + 's</div>' +
        '</div>'
      );
    }

    var cfg;
    if (usingPositions) {
      if (profitable)        cfg = NFT_LIGHT.profit;
      else if (unprofitable) cfg = NFT_LIGHT.loss;
      else                   cfg = NFT_LIGHT.mixed;
    } else {
      if (s.wins > 0 && s.losses > 0) cfg = NFT_LIGHT.mixed;
      else if (s.losses > 0)           cfg = NFT_LIGHT.loss;
      else                             cfg = NFT_LIGHT.profit;
    }

    var rateLabel = s.wins > 0 && s.losses > 0 ? s.rate + '%' : s.losses > 0 ? '0%' : '100%';

    var pnlBadge = '';
    if (usingPositions) {
      var netSign = s.net >= 0 ? '+' : '';
      pnlBadge = '<span class="text-xs font-bold font-mono px-2 py-0.5 rounded-md shadow-xs" style="' + cfg.pnl + '">' +
        netSign + '$' + Math.abs(s.net).toFixed(2) + '</span>';
    }

    var countsLabel = '<span class="text-xs font-semibold text-slate-600">' + s.wins + 'W <span class="text-slate-400">/</span> ' + s.losses + 'L</span>' +
      (s.total ? ' <span class="text-[11px] text-slate-400 font-normal">(' + s.total + ' ' + noun + (s.total === 1 ? '' : 's') + ')</span>' : '');

    return (
      '<div class="th-session-card group relative rounded-xl p-4 text-left flex flex-col justify-between h-36 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer" style="' + cfg.card + '">' +
        '<div class="flex items-center justify-between">' +
          '<div class="flex items-center gap-1.5">' +
            '<span class="w-2 h-2 rounded-full" style="background:' + cfg.dot + '"></span>' +
            '<span class="text-xs font-bold uppercase tracking-wider" style="' + cfg.name + '">' + escapeHtml(s.name) + '</span>' +
          '</div>' +
          '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider" style="' + cfg.pill + '">' +
            cfg.tag +
          '</span>' +
        '</div>' +
        '<div class="my-auto py-1">' +
          '<div class="text-3xl font-black tracking-tight" style="' + cfg.rate + '">' + rateLabel + '</div>' +
        '</div>' +
        '<div class="flex items-center justify-between pt-2 border-t border-slate-100/90">' +
          countsLabel +
          pnlBadge +
        '</div>' +
      '</div>'
    );
  }

  function hourBarHtml(h, maxCount, noun) {
    var hourLabel = pad2(h.hour);
    if (h.total === 0) {
      return (
        '<div class="flex-1 flex flex-col items-center gap-1.5" title="' + hourLabel + ':00 UTC — no ' + noun + 's">' +
          '<div class="w-full h-16 flex items-end"><div class="w-full h-1 rounded-full" style="background: var(--nft-empty-bar);"></div></div>' +
          '<span class="font-mono text-[9px] text-slate-400 font-medium">' + hourLabel + '</span>' +
        '</div>'
      );
    }
    var rate = pct(h.wins, h.total);
    var cfg = h.losses === 0
      ? NFT_LIGHT.profit
      : (h.wins === 0 ? NFT_LIGHT.loss : NFT_LIGHT.mixed);

    var heightPct = Math.max(14, Math.round((h.total / maxCount) * 100));
    var barStyle = 'background:' + cfg.bar + '; border-radius: 1px 1px 0 0; box-shadow: 0 1px 2px rgba(0,0,0,0.04);';

    return (
      '<div class="flex-1 flex flex-col items-center gap-1.5 transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer" title="' + hourLabel + ':00 UTC — ' + timingCountLabel(h.total, noun) + ', ' + rate + '% win">' +
        '<div class="w-full h-16 flex items-end">' +
          '<div class="w-full" style="height:' + heightPct + '%;' + barStyle + '"></div>' +
        '</div>' +
        '<span class="font-mono text-[9px] font-semibold" style="' + cfg.barLabel + '">' + hourLabel + '</span>' +
      '</div>'
    );
  }

  function computeWeekdayStatsFromRecords(records) {
    var closed = records.filter(function (r) { return r.isWin || r.isLoss; });
    var byDay = {};
    WEEKDAYS.forEach(function (d) { byDay[d] = { day: d, wins: 0, losses: 0, total: 0, net: 0, records: [] }; });

    closed.forEach(function (r) {
      var day = weekdayLabel(r.dateStr);
      var bucket = byDay[day];
      if (!bucket) return;
      bucket.total++;
      bucket.records.push(r);
      bucket.net += r.net || 0;
      if (r.isWin) bucket.wins++; else bucket.losses++;
    });

    return WEEKDAYS.map(function (day) {
      var b = byDay[day];
      var rate = pct(b.wins, b.total);
      var dominantSetup = null;
      if (b.total > 0) {
        if (b.wins > 0 && b.losses > 0) {
          dominantSetup = 'Mixed, ' + mostCommon(b.records.map(function (r) { return r.contextLabel; })) + ' context';
        } else {
          dominantSetup = mostCommon(b.records.map(function (r) { return r.comboLabel; }));
        }
      }
      return {
        day: day, abbr: WEEKDAY_ABBR[day], total: b.total, wins: b.wins, losses: b.losses,
        net: b.net, rate: rate, dominantSetup: dominantSetup, records: b.records
      };
    });
  }

  function computeWeekdayStats(trades) {
    return computeWeekdayStatsFromRecords(tradesToTimingRecords(trades));
  }

  function dayCellHtml(d, noun, usingPositions) {
    // Whether this day is net profitable (only meaningful when using positions)
    var hasPnl  = usingPositions && d.total > 0;
    var netPos  = hasPnl && d.net > 0;
    var netNeg  = hasPnl && d.net < 0;

    if (d.total === 0) {
      return (
        '<div class="group relative rounded-lg bg-surface-container p-4 text-center flex flex-col justify-between h-32 opacity-75 transition-all duration-200">' +
          '<div class="flex items-center justify-between">' +
            '<span class="font-label-eyebrow text-label-eyebrow text-secondary font-medium">' + d.abbr + '</span>' +
            '<span class="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>' +
          '</div>' +
          '<div class="my-auto"><span class="font-metric-display text-metric-display text-secondary/40 font-bold block leading-none">—</span></div>' +
          '<div class="font-metric-sm text-metric-sm text-secondary/70 font-medium">no ' + noun + 's</div>' +
        '</div>'
      );
    }

    // Pick background and text colours based on profitability (positions) or win rate (trades)
    var bgClass, labelClass, rateTextClass, dotClass;
    if (usingPositions) {
      // Profitability-first colouring
      if (netPos) {
        bgClass       = 'bg-tertiary-fixed/40 border-l-4 border-tertiary';
        labelClass    = 'text-tertiary font-bold';
        rateTextClass = 'text-tertiary';
        dotClass      = 'bg-tertiary';
      } else if (netNeg) {
        bgClass       = 'bg-error-container/40 border-l-4 border-error';
        labelClass    = 'text-error font-bold';
        rateTextClass = 'text-error';
        dotClass      = 'bg-error';
      } else {
        // Exactly break-even
        bgClass       = 'bg-secondary-fixed border-l-4 border-outline-variant';
        labelClass    = 'text-on-secondary-fixed font-bold';
        rateTextClass = 'text-on-surface';
        dotClass      = 'bg-outline-variant';
      }
    } else {
      // Trade mode: colour by win rate only (no P&L)
      if (d.wins > 0 && d.losses > 0) {
        bgClass = 'bg-secondary-fixed'; labelClass = 'text-on-secondary-fixed font-bold';
        rateTextClass = 'text-on-surface'; dotClass = 'bg-error';
      } else if (d.losses > 0) {
        bgClass = 'bg-error-container/40'; labelClass = 'text-error font-bold';
        rateTextClass = 'text-error'; dotClass = 'bg-error';
      } else {
        bgClass = 'bg-tertiary-fixed/40'; labelClass = 'text-on-tertiary-fixed font-bold';
        rateTextClass = 'text-tertiary'; dotClass = 'bg-tertiary-container';
      }
    }

    var rateLabel = d.wins > 0 && d.losses > 0 ? d.rate + '%'
                  : d.losses > 0 ? '0%' : '100%';

    // Bottom line: show wins/losses count + net P&L when available
    var bottomLine = d.wins + 'W / ' + d.losses + 'L';
    if (usingPositions) {
      var netSign = d.net >= 0 ? '+' : '';
      bottomLine += ' · <span class="' + (d.net >= 0 ? 'text-tertiary' : 'text-error') + ' font-semibold">' + netSign + '$' + Math.abs(d.net).toFixed(2) + '</span>';
    }

    return (
      '<div class="th-day-cell group relative rounded-lg ' + bgClass + ' p-4 text-center flex flex-col justify-between h-32 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer" data-day="' + d.day + '" role="button" tabindex="0">' +
        '<div class="flex items-center justify-between">' +
          '<span class="font-label-eyebrow text-label-eyebrow ' + labelClass + '">' + d.abbr + '</span>' +
          '<span class="w-2 h-2 rounded-full ' + dotClass + '"></span>' +
        '</div>' +
        '<div class="my-auto"><span class="font-metric-display text-metric-display ' + rateTextClass + ' font-bold block leading-none">' + rateLabel + '</span></div>' +
        '<div class="font-metric-sm text-metric-sm font-medium ' + (usingPositions ? '' : labelClass) + '">' + bottomLine + '</div>' +
      '</div>'
    );
  }

  function detailRowHtml(d, noun, usingPositions) {
    var profitable = usingPositions && d.net > 0;
    var unprofitable = usingPositions && d.net < 0;

    // Dot and rate colouring: positions → net P&L, trades → win/loss presence
    var dotColor  = usingPositions
      ? (profitable ? 'bg-tertiary' : (unprofitable ? 'bg-error' : 'bg-outline-variant'))
      : (d.losses > 0 ? 'bg-error' : 'bg-tertiary-container');
    var rateColor = usingPositions
      ? (profitable ? 'text-tertiary' : (unprofitable ? 'text-error' : 'text-secondary'))
      : (d.losses > 0 ? 'text-error' : 'text-tertiary-container');
    var pillClass = (d.wins > 0 && d.losses > 0) ? 'bg-secondary-fixed text-on-secondary-fixed' : 'bg-surface-container text-on-surface-variant';

    // Net P&L cell (shown for positions; in trade mode show wins/losses breakdown instead)
    var extraCell;
    if (usingPositions) {
      var netSign = d.net >= 0 ? '+' : '';
      extraCell = '<td class="py-3 px-3 font-metric-md text-metric-md font-semibold text-right ' +
        (profitable ? 'text-tertiary' : (unprofitable ? 'text-error' : 'text-secondary')) + '">' +
        netSign + '$' + Math.abs(d.net).toFixed(2) + '</td>';
    } else {
      extraCell = '<td class="py-3 px-3 font-metric-sm text-metric-sm text-secondary text-right">' +
        d.wins + 'W / ' + d.losses + 'L</td>';
    }

    // Rate label with profit/loss tag
    var rateLabel = d.rate + '%';
    if (usingPositions && d.total > 0) {
      rateLabel += '<span class="ml-1.5 text-[10px] font-semibold px-1 py-0.5 rounded ' +
        (profitable ? 'bg-tertiary/15 text-tertiary' : (unprofitable ? 'bg-error/15 text-error' : 'bg-surface-container text-secondary')) + '">' +
        (profitable ? 'PROFIT' : (unprofitable ? 'LOSS' : 'EVEN')) + '</span>';
    }

    return (
      '<tr class="th-day-row hover:bg-surface-container-low/50 transition-colors cursor-pointer" data-day="' + d.day + '">' +
        '<td class="py-3 px-3 font-medium text-on-surface flex items-center gap-2"><span class="w-2 h-2 rounded-full ' + dotColor + '"></span>' + d.day + '</td>' +
        '<td class="py-3 px-3 font-metric-sm text-metric-sm text-on-surface-variant text-right">' + timingCountLabel(d.total, noun) + '</td>' +
        '<td class="py-3 px-3 font-metric-md text-metric-md font-bold ' + rateColor + ' text-right">' + rateLabel + '</td>' +
        extraCell +
        '<td class="py-3 px-3 text-secondary font-medium"><span class="px-2 py-0.5 rounded ' + pillClass + ' font-metric-sm text-metric-sm">' + escapeHtml(d.dominantSetup || '—') + '</span></td>' +
      '</tr>'
    );
  }

  // Which collection the screen is analysing. Positions carry exact UTC
  // timestamps and real P&L, so they're the better timing sample whenever
  // any have been imported; trades remain available via the toggle.
  var thSourceState = null;

  function timingSource() {
    if (thSourceState === 'trades' || thSourceState === 'positions') return thSourceState;
    return PositionStore.getAll().length ? 'positions' : 'trades';
  }

  // Bridges render-time data to the day-cell/detail-row click handlers,
  // which are wired once at boot and have no other way to reach whichever
  // per-day bucket (and its underlying record ids) the latest render built.
  var thLastStats = null;
  var thLastUsingPositions = false;
  var thLastNoun = 'trade';

  function renderTimingHeatmap() {
    var section = sections['timing-and-heatmap'];
    if (!section) return;

    var source = timingSource();
    var usingPositions = source === 'positions';
    var noun = usingPositions ? 'position' : 'trade';
    var items = usingPositions ? PositionStore.getAll() : TradeStore.getAll();
    var records = usingPositions ? positionsToTimingRecords(items) : tradesToTimingRecords(items);

    var stats = computeWeekdayStatsFromRecords(records);
    var closed = records.filter(function (r) { return r.isWin || r.isLoss; });
    var totalWins = closed.filter(function (r) { return r.isWin; }).length;
    var totalLosses = closed.length - totalWins;

    thLastStats = stats;
    thLastUsingPositions = usingPositions;
    thLastNoun = noun;

    syncTimingSourceToggle(section, source);

    var sampleEl = section.querySelector('#th-sample-population');
    if (sampleEl) {
      sampleEl.textContent = items.length + (usingPositions
        ? ' Imported Position' + (items.length === 1 ? '' : 's')
        : ' Logged Execution' + (items.length === 1 ? '' : 's'));
    }

    var winRateEl = section.querySelector('#th-active-winrate');
    if (winRateEl) winRateEl.textContent = pct(totalWins, closed.length) + '% (' + totalWins + 'W / ' + totalLosses + 'L)';

    var gridEl = section.querySelector('#th-day-grid');
    if (gridEl) gridEl.innerHTML = stats.map(function (d) { return dayCellHtml(d, noun, usingPositions); }).join('');

    var countHead = section.querySelector('#th-detail-count-head');
    if (countHead) countHead.textContent = usingPositions ? 'POSITIONS' : 'TRADES';
    var netHead = section.querySelector('#th-detail-net-head');
    if (netHead) netHead.hidden = !usingPositions;

    var detailBody = section.querySelector('#th-detail-body');
    var daysWithTrades = stats.filter(function (d) { return d.total > 0; });
    if (detailBody) {
      detailBody.innerHTML = daysWithTrades.length
        ? daysWithTrades.map(function (d) { return detailRowHtml(d, noun, usingPositions); }).join('')
        : '<tr><td class="py-3 px-3 text-secondary font-body-sm text-body-sm" colspan="' + (usingPositions ? 5 : 4) + '">No closed ' + noun + 's logged yet.</td></tr>';
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
      var windowNet = bestRun.reduce(function (sum, d) { return sum + d.net; }, 0);
      var label = bestRun.length === 1 ? bestRun[0].day : (bestRun[0].day + ' to ' + bestRun[bestRun.length - 1].day);
      if (windowLabelEl) windowLabelEl.textContent = label;
      if (windowCopyEl) {
        windowCopyEl.innerHTML = 'Every decided ' + noun + ' in this window has closed a winner so far, ' +
          '<span class="text-tertiary-fixed font-metric-sm text-metric-sm font-semibold">' + windowTrades + ' for ' + windowTrades + '</span>' +
          (usingPositions ? ', worth ' + formatSignedMoney(windowNet) + ' net.' : '.');
      }
      // Reliability is the share of the whole decided sample this perfect
      // window rests on - a 2-of-2 window is not as reliable as 40-of-40.
      if (reliabilityEl) reliabilityEl.textContent = closed.length ? pct(windowTrades, closed.length) + '% of sample' : '—';
      if (sparklineEl) {
        var barCount = Math.max(1, Math.min(windowTrades, 8));
        sparklineEl.innerHTML = new Array(barCount).fill('<span class="w-1.5 h-3.5 bg-tertiary-fixed rounded-xs"></span>').join('');
      }
    } else {
      if (windowLabelEl) windowLabelEl.textContent = 'Not yet found';
      if (windowCopyEl) windowCopyEl.textContent = 'No consecutive winning window yet, log a few more closed ' + noun + 's.';
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
      var context = mostCommon(watchDay.records.map(function (r) { return r.contextLabel; })) || 'Unlabeled';
      if (watchLabelEl) watchLabelEl.textContent = watchDay.day;
      if (watchCopyEl) {
        watchCopyEl.textContent = (watchDay.rate === 0 ? 'Your worst day so far, ' : 'Your softest day so far, ') +
          watchDay.wins + '/' + watchDay.total + ' (' + watchDay.rate + '%)' +
          (usingPositions ? ', ' + formatSignedMoney(watchDay.net) + ' net. Mostly ' + context + '.' : '. It’s also sourced mostly from a ' + context + ' daily context, small sample, worth tracking forward.');
      }
      if (watchContextEl) watchContextEl.textContent = context;
      if (watchStopEl) watchStopEl.textContent = watchDay.losses + (usingPositions ? ' Losing Position' + (watchDay.losses === 1 ? '' : 's') : ' Stop Hit' + (watchDay.losses === 1 ? '' : 's'));
    } else {
      if (watchLabelEl) watchLabelEl.textContent = 'None yet';
      if (watchCopyEl) watchCopyEl.textContent = 'No losing days logged yet, keep it up.';
      if (watchContextEl) watchContextEl.textContent = '—';
      if (watchStopEl) watchStopEl.textContent = usingPositions ? '0 Losing Positions' : '0 Stop Hits';
    }

    // Session + hour-of-day breakdown. Trades need the user's timezone to
    // turn a local "HH:mm" into UTC; positions are already true UTC, so the
    // control is hidden rather than left there implying it does something.
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
    var tzWrap = section.querySelector('#th-tz-wrap');
    if (tzWrap) tzWrap.hidden = usingPositions;

    var sessionStats = computeSessionStatsFromRecords(records);
    var sessionGridEl = section.querySelector('#th-session-grid');
    if (sessionGridEl) sessionGridEl.innerHTML = sessionStats.sessions.map(function (s) { return sessionCellHtml(s, noun, usingPositions); }).join('');

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
        hourStripEl.innerHTML = sessionStats.perHour.map(function (h) { return hourBarHtml(h, maxCount, noun); }).join('');
      }
    }
  }

  var TH_SOURCE_ACTIVE_CLASS = 'bg-surface-container-lowest text-on-surface shadow-sm';
  var TH_SOURCE_IDLE_CLASS = 'text-secondary hover:text-on-surface';

  function syncTimingSourceToggle(section, source) {
    var positionCount = PositionStore.getAll().length;
    Array.prototype.forEach.call(section.querySelectorAll('.th-source-btn'), function (btn) {
      var isActive = btn.getAttribute('data-source') === source;
      // th-source-btn must survive this rewrite - it's what the click
      // delegation and every future call to this function select on.
      btn.className = 'th-source-btn px-2.5 py-1 rounded-lg font-metric-sm text-metric-sm font-medium transition-colors ' +
        (isActive ? TH_SOURCE_ACTIVE_CLASS : TH_SOURCE_IDLE_CLASS);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    var note = section.querySelector('#th-source-note');
    if (note) {
      note.textContent = positionCount
        ? ''
        : 'Import position history to analyse exact UTC times and real P&L.';
      note.hidden = !!positionCount;
    }
  }

  // Compact list row for a position inside the day-detail modal - not the
  // Position History table row (positionRowHtml), which carries columns
  // (checkbox, fees, duration) that don't belong in a short popup list.
  function dayModalPositionRowHtml(p) {
    var net = positionNet(p);
    var netClass = net > 0 ? 'text-tertiary' : (net < 0 ? 'text-error' : 'text-secondary');
    var directionClass = DIRECTION_BADGE_CLASS[p.direction] || DIRECTION_BADGE_CLASS.long;
    var action = p.linkedTradeId
      ? '<a class="text-primary hover:text-primary-container font-metric-sm text-metric-sm font-semibold transition-colors whitespace-nowrap" href="#case-studies/' + encodeURIComponent(p.linkedTradeId) + '">View case study</a>'
      : '<button type="button" class="th-day-modal-promote px-2.5 py-1 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-metric-sm text-metric-sm font-semibold transition-colors whitespace-nowrap" data-position-id="' + escapeHtml(p.id) + '">Promote</button>';
    return (
      '<div class="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-surface-container-low/60 transition-colors">' +
        '<div class="flex items-center gap-3 min-w-0">' +
          '<span class="font-metric-sm text-metric-sm text-secondary whitespace-nowrap">' + formatIsoDateTime(p.openTime) + '</span>' +
          '<span class="font-metric-md text-metric-md font-bold text-on-surface truncate">' + escapeHtml(p.pair) + '</span>' +
          '<span class="' + directionClass + ' font-metric-sm text-[11px] font-semibold px-2 py-0.5 rounded shrink-0">' + p.direction.toUpperCase() + '</span>' +
        '</div>' +
        '<div class="flex items-center gap-3 shrink-0">' +
          '<span class="font-metric-md text-metric-md font-semibold ' + netClass + '">' + formatSignedMoney(net) + '</span>' +
          action +
        '</div>' +
      '</div>'
    );
  }

  // The day-cell/detail-row click handlers only have a weekday name to go
  // on, so this looks up thLastStats (set by the most recent render) to
  // find that day's actual record ids, then refetches the full trades or
  // positions to render - the flattened timing-record shape deliberately
  // doesn't carry everything a full list row needs.
  function openDayModal(day) {
    var modal = document.getElementById('th-day-modal');
    var body = document.getElementById('th-day-modal-body');
    var title = document.getElementById('th-day-modal-title');
    if (!modal || !body || !title || !thLastStats) return;

    var bucket = thLastStats.filter(function (d) { return d.day === day; })[0];
    if (!bucket || !bucket.records.length) return;

    title.textContent = day + ' — ' + timingCountLabel(bucket.total, thLastNoun);

    if (thLastUsingPositions) {
      var positions = bucket.records.map(function (r) { return PositionStore.getById(r.id); }).filter(Boolean);
      body.innerHTML = positions.length
        ? '<div class="divide-y divide-surface-container-low">' + positions.map(dayModalPositionRowHtml).join('') + '</div>'
        : '<div class="px-5 py-8 text-center font-body-sm text-body-sm text-secondary">Nothing found.</div>';
    } else {
      var trades = bucket.records.map(function (r) { return TradeStore.getById(r.id); }).filter(Boolean);
      body.innerHTML = trades.length
        ? '<div class="divide-y divide-surface-container-low">' + trades.map(caseStudyListRowHtml).join('') + '</div>'
        : '<div class="px-5 py-8 text-center font-body-sm text-body-sm text-secondary">Nothing found.</div>';
    }

    modal.hidden = false;
  }

  function closeDayModal() {
    var modal = document.getElementById('th-day-modal');
    if (modal) modal.hidden = true;
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

    var sourceGroup = section.querySelector('#th-source-toggle');
    if (sourceGroup) {
      sourceGroup.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.th-source-btn') : null;
        if (!btn) return;
        thSourceState = btn.getAttribute('data-source');
        renderTimingHeatmap();
      });
    }

    var dayGrid = section.querySelector('#th-day-grid');
    if (dayGrid) {
      dayGrid.addEventListener('click', function (e) {
        var cell = e.target.closest ? e.target.closest('.th-day-cell') : null;
        if (cell) openDayModal(cell.getAttribute('data-day'));
      });
      dayGrid.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var cell = e.target.closest ? e.target.closest('.th-day-cell') : null;
        if (!cell || e.target !== cell) return;
        e.preventDefault();
        openDayModal(cell.getAttribute('data-day'));
      });
    }

    var detailBody = section.querySelector('#th-detail-body');
    if (detailBody) {
      detailBody.addEventListener('click', function (e) {
        var row = e.target.closest ? e.target.closest('.th-day-row') : null;
        if (row) openDayModal(row.getAttribute('data-day'));
      });
    }

    var dayModal = document.getElementById('th-day-modal');
    if (dayModal) {
      var dayModalBackdrop = document.getElementById('th-day-modal-backdrop');
      var dayModalClose = document.getElementById('th-day-modal-close');
      if (dayModalBackdrop) dayModalBackdrop.addEventListener('click', closeDayModal);
      if (dayModalClose) dayModalClose.addEventListener('click', closeDayModal);
      document.addEventListener('keydown', function (e) {
        if (!dayModal.hidden && e.key === 'Escape') closeDayModal();
      });
      // Following a "View case study" link (or any other navigation) should
      // leave the modal behind rather than have it linger over a new screen.
      document.addEventListener('screenchange', closeDayModal);

      var dayModalBody = document.getElementById('th-day-modal-body');
      if (dayModalBody) {
        dayModalBody.addEventListener('click', function (e) {
          var promoteBtn = e.target.closest ? e.target.closest('.th-day-modal-promote') : null;
          if (!promoteBtn) return;
          var id = promoteBtn.getAttribute('data-position-id');
          if (id) window.AppRouter.navigate('new-trade-entry', 'promote:' + id);
        });
      }
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

  // A short, human setup label for a trade: the freeform Setup Name field
  // when logged, otherwise a summary of its first confluence tags (the same
  // summarizeCombo() the confluence stats copy already uses) - so older
  // trades logged before Setup Name existed still show something useful.
  function caseStudySetupSummary(trade) {
    if (trade.setupName && trade.setupName.trim()) return trade.setupName.trim();
    return summarizeCombo(trade);
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
  function linkedPositionForTrade(trade) {
    var positions = PositionStore.getAll();
    for (var i = 0; i < positions.length; i++) {
      if (positions[i].linkedTradeId === trade.id) return positions[i];
    }
    return null;
  }

  function tradeDurationLabel(trade) {
    var position = linkedPositionForTrade(trade);
    if (!position) return null;
    var label = formatDurationMs(positionDurationMs(position));
    return label === '—' ? null : label;
  }

  function parseClockMinutes(str) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(str || '');
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }

  // A manually-logged trade has one date (the entry's) plus optional entry and
  // exit times of day, so the hold time is the gap between the two clock times:
  // an exit at or after the entry is the same day, an earlier one the next day.
  // That caps it at under 24h - the caller labels it as such. Identical times
  // are ambiguous (0 or 24h), so they yield nothing rather than a guess.
  function manualHoldMinutes(trade) {
    var entry = parseClockMinutes(trade.entryTime);
    var exit = parseClockMinutes(trade.exitTime);
    if (entry === null || exit === null || entry === exit) return null;
    return (exit - entry + 1440) % 1440;
  }

  // Fees only exist for exchange-sourced data: the linked Position History
  // record, or the fee carried on a trade imported straight from MEXC. A zero
  // is treated as unknown (the importers default a missing fee to 0).
  function tradeFeeAmount(trade) {
    var position = linkedPositionForTrade(trade);
    var fee = position && typeof position.fee === 'number' ? position.fee
      : (typeof trade.fee === 'number' ? trade.fee : null);
    if (fee === null || !isFinite(fee) || fee === 0) return null;
    return Math.abs(fee);
  }

  // Reward:risk as a multiple of the entry-to-stop distance. Uses the planned
  // Take-Profit when set, otherwise the realized Exit when it was in profit.
  // Needs a stop on the losing side of entry; returns null otherwise.
  function computeRiskReward(trade) {
    var entry = parsePriceValue(trade.entryPrice);
    var stop = parsePriceValue(trade.stopLoss);
    if (entry === null || stop === null) return null;
    var isShort = trade.direction === 'short';
    var risk = isShort ? (stop - entry) : (entry - stop);
    if (!(risk > 0)) return null;

    var candidates = [
      { price: parsePriceValue(trade.takeProfit), basis: 'Planned' },
      { price: parsePriceValue(trade.exitPrice), basis: 'Realized' }
    ];
    for (var i = 0; i < candidates.length; i++) {
      var price = candidates[i].price;
      if (price === null) continue;
      var reward = isShort ? (entry - price) : (price - entry);
      if (reward > 0) return { ratio: reward / risk, basis: candidates[i].basis };
    }
    return null;
  }

  function formatRiskReward(rr) {
    return '1 : ' + Number(rr.ratio.toFixed(2));
  }

  // Signed $ P&L when it can be computed, otherwise the R-multiple - the
  // same precedence the case study list rows use.
  function tradeReturnLabel(trade) {
    var ret = computeTradeReturn(trade);
    if (!ret) return null;
    if (ret.dollarPnl !== null) return { label: formatSignedDollars(ret.dollarPnl), positive: ret.dollarPnl >= 0 };
    if (ret.rMultiple !== null) return { label: formatSignedR(ret.rMultiple), positive: ret.rMultiple >= 0 };
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

  // Tab pills are the All / Wins / Losses filter chips: active is the solid
  // dark pill, inactive is a light pill outlined by the card shadow's hairline.
  function chartTabsHtml(trade, activeKey) {
    var charts = tradeCharts(trade);
    var links = tradeChartLinks(trade);
    return CHART_TIMEFRAMES.map(function (tf) {
      // An empty timeframe is dimmed with a lighter text token, not opacity:
      // opacity-60 dropped the label to 3:1 contrast, secondary keeps 5.9:1.
      var stateClass = tf.key === activeKey
        ? 'bg-on-surface text-surface-container-lowest'
        : 'bg-surface-container-lowest hover:bg-surface-container-low ' + (charts[tf.key] || links[tf.key] ? 'text-on-surface-variant' : 'text-secondary');
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
    var linkValue = tradeChartLinks(trade)[tf.key] || '';
    var link = linkValue ? { value: linkValue } : null;
    var safeLink = link ? safeUrl(link.value) : '#';

    // A TradingView snapshot URL is a web page, not an image file, and those
    // pages aren't guaranteed to permit framing - so it's presented as a
    // link card sized like the placeholder rather than embedded. It only
    // takes the body when this timeframe has no uploaded screenshot.
    if (link && !image) {
      return (
        '<div class="rounded-xl bg-surface-container-low p-10 flex flex-col items-center justify-center text-center gap-2">' +
          '<span class="material-symbols-outlined text-primary text-[32px]">candlestick_chart</span>' +
          '<span class="font-headline-sm text-headline-sm text-on-surface font-medium">TradingView ' + tf.label + ' snapshot</span>' +
          '<span class="font-metric-sm text-metric-sm text-secondary break-all max-w-full" title="' + escapeHtml(link.value) + '">' + escapeHtml(truncateMiddle(link.value, 52)) + '</span>' +
          (safeLink !== '#'
            ? '<a href="' + safeLink + '" target="_blank" rel="noopener noreferrer" class="mt-2 inline-flex items-center gap-1.5 bg-primary hover:bg-primary-container text-on-primary px-3.5 py-1.5 rounded-lg font-headline-sm text-[12px] font-semibold shadow-sm transition-colors">' +
                'View Chart on TradingView' +
                '<span class="material-symbols-outlined text-[15px]">open_in_new</span>' +
              '</a>'
            : '') +
        '</div>'
      );
    }

    var linkButton = (link && safeLink !== '#')
      ? '<a href="' + safeLink + '" target="_blank" rel="noopener noreferrer" class="ml-auto inline-flex items-center gap-1 text-primary hover:underline font-metric-sm text-metric-sm font-semibold">' +
          'View on TradingView<span class="material-symbols-outlined text-[14px]">open_in_new</span></a>'
      : '';

    if (image) {
      // The image sits on a tinted well (same tone as the Trade Notes well)
      // rather than straight on the white card padding.
      return (
        '<div class="bg-surface-container-low rounded-xl p-3">' +
          '<button type="button" class="cs-fs-exit items-center gap-1.5 bg-on-surface text-surface-container-lowest px-3.5 py-1.5 rounded-full font-metric-sm text-metric-sm font-semibold shadow-sm"><span class="material-symbols-outlined text-[16px]">fullscreen_exit</span>Exit full screen</button>' +
          '<div class="chart-preview-btn relative rounded-lg overflow-hidden shadow-sm cursor-zoom-in" data-trade-id="' + escapeHtml(trade.id) + '" data-tf="' + tf.key + '" title="Click to zoom">' +
            '<img src="' + safeImageUrl(image.value) + '" alt="' + tf.label + ' chart for ' + escapeHtml(trade.pair) + '" class="w-full h-auto block" />' +
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

    // Empty timeframe: the same dashed dropzone the entry form shows for an
    // empty slot, linking straight to that trade's Edit Entry to fill it.
    return (
      '<a href="#new-trade-entry/' + encodeURIComponent(trade.id) + '" class="group rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low hover:bg-surface-container hover:border-primary transition-all p-10 flex flex-col items-center justify-center text-center gap-2 no-underline">' +
        '<span class="bg-primary/10 text-primary font-metric-sm text-[10px] font-semibold px-1.5 py-0.5 rounded">' + tf.short + '</span>' +
        '<span class="material-symbols-outlined text-[32px] text-secondary group-hover:text-primary transition-colors">add_a_photo</span>' +
        '<span class="font-headline-sm text-headline-sm text-on-surface font-medium">No ' + tf.label + ' chart attached</span>' +
        '<span class="font-metric-sm text-metric-sm text-secondary">Add an image or TradingView link in Edit Entry</span>' +
      '</a>'
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

  var csListState = { search: '', sort: 'date-desc', filter: 'all' };

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

  // Same badge the Execution Details / Result R tiles on the detail page use
  // (formatSignedDollars/formatSignedR, tertiary for gains, error for
  // losses) - prefers $P&L (needs entry+exit+position size), falls back to
  // R-multiple (needs entry+exit+stop-loss) when only that is recorded, and
  // renders nothing when neither can be computed rather than a placeholder.
  function caseStudyReturnBadgeHtml(trade) {
    var result = tradeReturnLabel(trade);
    if (!result) return '';
    var tone = result.positive ? 'bg-tertiary/10 text-tertiary' : 'bg-error/10 text-error';
    return '<span class="' + tone + ' font-metric-sm text-[11px] font-semibold px-2 py-0.5 rounded shrink-0">' + result.label + '</span>';
  }

  function caseStudyListRowHtml(trade) {
    var dot = OUTCOME_DOT_CLASS[trade.outcome] || OUTCOME_DOT_CLASS.open;
    var pillClass = OUTCOME_PILL_CLASS[trade.outcome] || OUTCOME_PILL_CLASS.open;
    var directionClass = DIRECTION_BADGE_CLASS[trade.direction] || DIRECTION_BADGE_CLASS.long;
    var filledCount = nonEmptyConfluence(trade).length;
    var sessionLabel = tradeSessionLabel(trade);
    var setupSummary = caseStudySetupSummary(trade);
    return (
      '<a href="#case-studies/' + encodeURIComponent(trade.id) + '" class="block p-4 sm:px-5 sm:py-3.5 hover:bg-surface-container-low/60 transition-colors">' +
      '<div class="flex flex-col md:flex-row md:items-center justify-between gap-2.5 md:gap-4">' +
        '<div class="flex items-center justify-between md:justify-start gap-2.5 min-w-0">' +
          '<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-wrap sm:flex-nowrap">' +
            '<div class="flex flex-col shrink-0 w-14 sm:w-16">' +
              '<span class="font-headline-sm text-headline-sm text-on-surface font-semibold">' + formatDateLabel(trade.date) + '</span>' +
              '<span class="font-metric-sm text-metric-sm text-secondary">' + weekdayLabel(trade.date) + '</span>' +
            '</div>' +
            (sessionLabel ? '<span class="shrink-0 font-metric-sm text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-surface-container-low text-secondary" title="Session">' + escapeHtml(sessionLabel) + '</span>' : '') +
            '<span class="font-metric-md text-metric-md font-bold text-on-surface truncate">' + escapeHtml(trade.pair) + '</span>' +
            '<span class="' + directionClass + ' font-metric-sm text-[11px] font-semibold px-2 py-0.5 rounded shrink-0">' + trade.direction.toUpperCase() + '</span>' +
            caseStudyReturnBadgeHtml(trade) +
          '</div>' +
          '<span class="md:hidden ' + pillClass + ' font-metric-sm text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shrink-0">' +
            '<span class="w-1.5 h-1.5 rounded-full ' + dot + '"></span>' + trade.outcome.toUpperCase() +
          '</span>' +
        '</div>' +
        '<div class="flex items-center justify-between md:justify-end gap-3 shrink-0">' +
          '<span class="font-metric-sm text-metric-sm text-secondary">' + filledCount + ' parameter' + (filledCount === 1 ? '' : 's') + '</span>' +
          '<span class="hidden md:flex ' + pillClass + ' font-metric-sm text-metric-sm font-semibold px-2.5 py-0.5 rounded-full items-center gap-1.5">' +
            '<span class="w-1.5 h-1.5 rounded-full ' + dot + '"></span>' + trade.outcome.toUpperCase() +
          '</span>' +
          '<span class="material-symbols-outlined text-secondary text-[18px]">chevron_right</span>' +
        '</div>' +
      '</div>' +
      (setupSummary
        ? '<div class="flex items-center gap-1.5 mt-2 md:mt-1.5 md:pl-[4.75rem] min-w-0">' +
            '<span class="material-symbols-outlined text-secondary text-[14px] shrink-0">strategy</span>' +
            '<span class="font-metric-sm text-metric-sm text-secondary truncate">' + escapeHtml(setupSummary) + '</span>' +
          '</div>'
        : '') +
      '</a>'
    );
  }

  // Same filter+sort the case study list renders with, shared so Prev/Next
  // on the detail view walks through exactly what the list currently shows.
  function orderedCaseStudyTrades() {
    var trades = TradeStore.getAll();
    var query = csListState.search.trim().toLowerCase();
    var filtered = trades.filter(function (t) {
      var matchesQuery = !query || (t.pair || '').toLowerCase().indexOf(query) !== -1;
      var matchesFilter = csListState.filter === 'all' || t.outcome === csListState.filter;
      return matchesQuery && matchesFilter;
    });
    return sortCaseStudyTrades(filtered, csListState.sort);
  }

  function setActiveCsPill(section) {
    section.querySelectorAll('#cs-filter-pill-group .filter-pill').forEach(function (pill) {
      var isActive = pill.getAttribute('data-filter') === csListState.filter;
      if (isActive) {
        pill.classList.remove('bg-surface-container-lowest', 'text-on-surface-variant');
        pill.classList.add('bg-on-surface', 'text-surface-container-lowest');
      } else {
        pill.classList.remove('bg-on-surface', 'text-surface-container-lowest');
        pill.classList.add('bg-surface-container-lowest', 'text-on-surface-variant');
      }
    });
  }

  // KPI ribbon above the list reuses the exact numbers the Trade Journal
  // P&L breakdown already computes - every trade in TradeStore has a Case
  // Study (there's no separate "promoted" flag), so the scope is identical.
  function renderCaseStudyKpis(section, allTrades) {
    var stats = computeStats(allTrades);
    var winrateEl = section.querySelector('#cs-kpi-winrate');
    var winrateSubEl = section.querySelector('#cs-kpi-winrate-sub');
    if (winrateEl) winrateEl.textContent = (stats.wins + stats.losses) > 0 ? stats.winRate.toFixed(1) + '%' : '--';
    if (winrateSubEl) winrateSubEl.textContent = stats.wins + ' wins, ' + stats.losses + ' losses';

    var pnlStats = computeTradeJournalPnl(allTrades);
    var hasPnl = pnlStats.covered > 0;
    var netEl = section.querySelector('#cs-kpi-netpnl');
    var netSubEl = section.querySelector('#cs-kpi-netpnl-sub');
    if (netEl) {
      netEl.textContent = hasPnl ? formatSignedMoney(pnlStats.total) : 'Not recorded';
      netEl.className = 'text-metric-display font-metric-display ' + (hasPnl ? (pnlStats.total >= 0 ? 'text-tertiary' : 'text-error') : 'text-secondary');
    }
    if (netSubEl) {
      netSubEl.textContent = hasPnl
        ? 'across ' + pnlStats.covered + ' trade' + (pnlStats.covered === 1 ? '' : 's') + ' with P&L'
        : 'no entry/exit prices yet';
    }

    var bestLinkEl = section.querySelector('#cs-kpi-best-link');
    var bestSubEl = section.querySelector('#cs-kpi-best-sub');
    if (bestLinkEl && bestSubEl) {
      if (hasPnl) {
        var best = pnlStats.best;
        bestLinkEl.textContent = best.trade.pair;
        bestLinkEl.className = 'text-metric-display font-metric-display hover:text-primary transition-colors truncate block ' + (best.pnl >= 0 ? 'text-tertiary' : 'text-error');
        bestLinkEl.setAttribute('href', '#case-studies/' + encodeURIComponent(best.trade.id));
        bestSubEl.textContent = formatMediumDate(best.trade.date) + ' · ' + formatSignedDollars(best.pnl);
      } else {
        bestLinkEl.textContent = '--';
        bestLinkEl.className = 'text-metric-display font-metric-display text-secondary truncate block';
        bestLinkEl.setAttribute('href', '#case-studies');
        bestSubEl.textContent = 'no entry/exit prices yet';
      }
    }
  }

  function renderCaseStudyList() {
    var section = sections['case-studies'];
    if (!section) return;
    var listEl = section.querySelector('#cs-list');
    if (!listEl) return;

    var allTrades = TradeStore.getAll();
    var allStats = computeStats(allTrades);
    var countAll = section.querySelector('#cs-filter-pill-group [data-pill-count="all"]');
    var countWin = section.querySelector('#cs-filter-pill-group [data-pill-count="win"]');
    var countLoss = section.querySelector('#cs-filter-pill-group [data-pill-count="loss"]');
    var countOpen = section.querySelector('#cs-filter-pill-group [data-pill-count="open"]');
    if (countAll) countAll.textContent = allStats.total;
    if (countWin) countWin.textContent = allStats.wins;
    if (countLoss) countLoss.textContent = allStats.losses;
    if (countOpen) countOpen.textContent = allStats.open;
    setActiveCsPill(section);
    renderCaseStudyKpis(section, allTrades);

    var sorted = orderedCaseStudyTrades();

    listEl.innerHTML = sorted.length
      ? sorted.map(caseStudyListRowHtml).join('')
      : '<div class="px-5 py-8 text-center font-body-sm text-body-sm text-secondary">No trades match the current filters.</div>';
  }

  // Populates the Prev/Next buttons and "N of M" label based on where this
  // trade sits in the current (filtered/sorted) case study list.
  // Compact pill link to the adjacent trade: "<- Previous Trade: PAIR (value)" /
  // "Next Trade: PAIR (value) ->". The value is the trade's P&L or R-multiple;
  // without either it falls back to the date (never a blank or invented number),
  // with a tooltip saying why. A missing neighbour renders nothing but an empty
  // grid cell, so the remaining pill keeps its side rather than showing disabled.
  function adjacentTradeCardHtml(trade, isNext) {
    if (!trade) return '<div></div>';
    var result = tradeReturnLabel(trade);
    var valueHtml = result
      ? '<span class="font-semibold ' + (result.positive ? 'text-tertiary' : 'text-error') + '">(' + result.label + ')</span>'
      : '<span class="text-secondary" title="P&amp;L / R-multiple not recorded for this trade">(' + escapeHtml(formatMediumDate(trade.date)) + ')</span>';
    var arrow = '<span class="material-symbols-outlined text-[18px] shrink-0 text-secondary group-hover:text-primary transition-colors">' + (isNext ? 'arrow_forward' : 'arrow_back') + '</span>';
    var label =
      '<span class="min-w-0 truncate font-metric-md text-metric-md">' +
        '<span class="text-secondary">' + (isNext ? 'Next Trade:' : 'Previous Trade:') + '</span> ' +
        '<span class="font-bold text-on-surface">' + escapeHtml(trade.pair) + '</span> ' + valueHtml +
      '</span>';
    return (
      '<a href="#case-studies/' + encodeURIComponent(trade.id) + '" class="group flex items-center gap-2 min-w-0 px-4 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low hover:border-primary transition-colors ' + (isNext ? 'justify-end text-right' : '') + '">' +
        (isNext ? label + arrow : arrow + label) +
      '</a>'
    );
  }

  function renderCaseStudyAdjacent(section, ordered, index) {
    var wrap = section.querySelector('#cs-adjacent');
    if (!wrap) return;
    var prev = index > 0 ? ordered[index - 1] : null;
    var next = index !== -1 && index < ordered.length - 1 ? ordered[index + 1] : null;
    if (!prev && !next) {
      wrap.hidden = true;
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = adjacentTradeCardHtml(prev, false) + adjacentTradeCardHtml(next, true);
    wrap.hidden = false;
  }

  function renderCaseStudyPrevNext(section, tradeId) {
    var prevBtn = section.querySelector('#cs-btn-prev');
    var nextBtn = section.querySelector('#cs-btn-next');
    var labelEl = section.querySelector('#cs-position-label');
    if (!prevBtn || !nextBtn || !labelEl) return;

    var ordered = orderedCaseStudyTrades();
    var index = ordered.findIndex(function (t) { return t.id === tradeId; });
    renderCaseStudyAdjacent(section, ordered, index);

    if (index === -1) {
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      prevBtn.removeAttribute('data-nav-id');
      nextBtn.removeAttribute('data-nav-id');
      labelEl.textContent = '';
      return;
    }

    labelEl.textContent = (index + 1) + ' of ' + ordered.length;

    if (index > 0) {
      prevBtn.disabled = false;
      prevBtn.setAttribute('data-nav-id', ordered[index - 1].id);
    } else {
      prevBtn.disabled = true;
      prevBtn.removeAttribute('data-nav-id');
    }

    if (index < ordered.length - 1) {
      nextBtn.disabled = false;
      nextBtn.setAttribute('data-nav-id', ordered[index + 1].id);
    } else {
      nextBtn.disabled = true;
      nextBtn.removeAttribute('data-nav-id');
    }
  }

  function initCaseStudyListControls() {
    var section = sections['case-studies'];
    if (!section) return;
    var searchInput = section.querySelector('#cs-search-input');
    var sortSelect = section.querySelector('#cs-sort-select');
    section.querySelectorAll('#cs-filter-pill-group .filter-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        csListState.filter = pill.getAttribute('data-filter');
        renderCaseStudyList();
      });
    });
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
    renderCaseStudyChartActions(section, trade);
  }

  var CS_CHART_ACTION_CLASS = 'inline-flex items-center gap-1.5 text-secondary hover:text-primary font-metric-sm text-metric-sm font-semibold transition-colors';

  function chartFullscreenLabelHtml() {
    var active = !!document.fullscreenElement;
    return '<span class="material-symbols-outlined text-[16px]">' + (active ? 'fullscreen_exit' : 'fullscreen') + '</span>' +
      '<span>' + (active ? 'Exit full screen' : 'Full screen') + '</span>';
  }

  // Full screen applies to the active timeframe: an uploaded image goes
  // full screen in place (browser Fullscreen API), a link-only timeframe opens
  // its TradingView snapshot in a new tab (that page can't be framed), and an
  // empty timeframe has nothing to expand so shows no action.
  function renderCaseStudyChartActions(section, trade) {
    var el = section.querySelector('#cs-chart-actions');
    if (!el) return;
    var image = tradeCharts(trade)[csActiveChartTf];
    var linkValue = tradeChartLinks(trade)[csActiveChartTf];
    var href = linkValue ? safeUrl(linkValue) : '#';
    if (image) {
      el.innerHTML = '<button type="button" id="cs-chart-fullscreen" class="' + CS_CHART_ACTION_CLASS + '" title="Show this chart full screen">' + chartFullscreenLabelHtml() + '</button>';
    } else if (href !== '#') {
      el.innerHTML = '<a href="' + href + '" target="_blank" rel="noopener noreferrer" class="' + CS_CHART_ACTION_CLASS + '" title="Open this snapshot in TradingView">' +
        '<span class="material-symbols-outlined text-[16px]">open_in_new</span><span>Open in TradingView</span></a>';
    } else {
      el.innerHTML = '';
    }
  }

  function toggleChartFullscreen(section, trade) {
    var container = section.querySelector('#cs-chart-container');
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }
    var request = container.requestFullscreen || container.webkitRequestFullscreen;
    if (request) {
      var result = request.call(container);
      if (result && result.catch) result.catch(function () { openChartPreviewFallback(section); });
    } else {
      openChartPreviewFallback(section);
    }
  }

  // No Fullscreen API (or the browser refused): the existing zoom viewer
  // opens the same image, through the delegated .chart-preview-btn handler.
  function openChartPreviewFallback(section) {
    var target = section.querySelector('#cs-chart-container .chart-preview-btn');
    if (target) target.click();
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
      if (breadcrumbEmpty) breadcrumbEmpty.textContent = 'CASE STUDIES';
      // The list keeps its own breadcrumb; the detail row (back link + pager) is for a single trade.
      section.querySelector('#cs-crumb-list').hidden = false;
      section.querySelector('#cs-crumb-detail').hidden = true;
      renderCaseStudyList();
      return;
    }

    if (listState) listState.hidden = true;
    if (content) content.hidden = false;

    section.querySelector('#cs-crumb-list').hidden = true;
    section.querySelector('#cs-crumb-detail').hidden = false;
    // Final crumb: the pair plus the trade's date, abbreviated ("KERNELUSDT.P (SEP 22)").
    var crumbDate = /^\d{4}-(\d{2})-(\d{2})$/.exec(trade.date || '');
    section.querySelector('#cs-crumb-pair').textContent = trade.pair +
      (crumbDate && MONTH_ABBR[+crumbDate[1] - 1] ? ' (' + MONTH_ABBR[+crumbDate[1] - 1].toUpperCase() + ' ' + (+crumbDate[2]) + ')' : '');
    renderCaseStudyPrevNext(section, trade.id);
    section.querySelector('#cs-pair').textContent = trade.pair;
    section.querySelector('#cs-pair-avatar').textContent = (trade.pair || '?').charAt(0).toUpperCase();
    section.querySelector('#cs-direction').textContent = trade.direction.toUpperCase();
    section.querySelector('#cs-logged-date').textContent = formatLongDate(trade.date);
    // Session only when the entry time makes it real - omitted entirely otherwise.
    var sessionLabel = tradeSessionLabel(trade);
    section.querySelector('#cs-session-text').textContent = sessionLabel || '';
    section.querySelector('#cs-session-wrap').hidden = !sessionLabel;

    var outcomeDot = section.querySelector('#cs-outcome-dot');
    var outcomeText = section.querySelector('#cs-outcome-text');
    var outcomePill = section.querySelector('#cs-outcome-pill');
    outcomeText.textContent = trade.outcome.toUpperCase();
    outcomeDot.className = 'w-1.5 h-1.5 rounded-full ' + (OUTCOME_DOT_CLASS[trade.outcome] || OUTCOME_DOT_CLASS.open);
    // 'breakeven' isn't a form option, but zero-P&L imports produce it, so it
    // gets the same neutral treatment as an open trade rather than looking broken.
    outcomePill.className = 'px-3 py-1 rounded-full font-metric-md text-metric-md font-semibold flex items-center gap-1.5 ' +
      (trade.outcome === 'win' ? 'bg-surface-container-low text-tertiary' : trade.outcome === 'loss' ? 'bg-error-container text-error' : 'bg-surface-container text-on-surface-variant');

    var sourceBadge = section.querySelector('#cs-source-badge');
    if (sourceBadge) sourceBadge.hidden = trade.source !== 'mexc-import';

    var ret = computeTradeReturn(trade);

    // The freeform Setup Name only - the confluence-summary fallback used by
    // the Setup Used tile below would just repeat the checklist in the header.
    var setupNameWrap = section.querySelector('#cs-setup-name-wrap');
    var setupNameEl = section.querySelector('#cs-setup-name');
    var setupName = trade.setupName && trade.setupName.trim();
    if (setupNameWrap && setupNameEl) {
      setupNameEl.textContent = setupName || '';
      setupNameEl.title = setupName || '';
      setupNameWrap.hidden = !setupName;
    }
    renderCaseStudyReturnBadges(section, ret);
    renderCaseStudyStats(section, trade, ret);
    renderCaseStudyTimeline(section, trade);

    // Metadata tiles
    var hasR = ret && ret.rMultiple !== null;
    setMetaTile(section, 'r', hasR ? formatSignedR(ret.rMultiple) : '', hasR ? (ret.rMultiple >= 0 ? 'text-tertiary' : 'text-error') : '', ret ? 'No stop-loss logged' : 'Not recorded');
    // No dedicated Playbook entity exists yet - fall back to a confluence-tag
    // summary for trades logged before the Setup Name field existed.
    setMetaTile(section, 'setup', caseStudySetupSummary(trade) || '', '', 'Not recorded');
    setMetaTile(section, 'session', tradeSessionLabel(trade) || '', '', 'No entry time logged');

    csCurrentTradeId = trade.id;
    csActiveChartTf = firstAttachedChartKey(trade) || 'daily';
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

    section.querySelector('#cs-btn-edit').setAttribute('data-trade-id', trade.id);
    section.querySelector('#cs-btn-delete').setAttribute('data-trade-id', trade.id);
  }

  var NOT_RECORDED_CLASS = 'font-metric-sm text-metric-sm font-medium text-secondary bg-surface-container px-2.5 py-0.5 rounded';

  // True-UTC entry moment for the timeline. A linked Position History record
  // has the exact open time; otherwise it's the logged date + entry time,
  // which is local wall-clock in the journal's timezone setting for manual
  // trades but already UTC for MEXC imports. A trade with no entry time
  // yields the date only (hasTime false) and is never given an invented hour.
  function timelineEntryMoment(trade, position) {
    var openMs = position && position.openTime ? Date.parse(position.openTime) : NaN;
    if (!isNaN(openMs)) return { ms: openMs, hasTime: true };
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trade.date || '');
    if (!d) return null;
    var t = /^(\d{1,2}):(\d{2})$/.exec(trade.entryTime || '');
    if (!t) return { hasTime: false };
    var offset = trade.source === 'mexc-import' ? 0 : getEntryTzOffsetMinutes();
    return { ms: Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]) - offset * 60000, hasTime: true };
  }

  // Shown in the journal's timezone setting (the one Timing & Heatmap uses),
  // so entry and exit are always in the same frame and labelled with it.
  function formatTimelineMoment(ms) {
    var offset = getEntryTzOffsetMinutes();
    var d = new Date(ms + offset * 60000);
    return MONTH_ABBR[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear() + ' · ' +
      pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ' ' + formatTzOffsetLabel(offset);
  }

  // Exactly two events - one entry, one exit - from what the trade really has.
  // The exit time only exists for a trade linked to Position History; every
  // missing value renders as the same "Not recorded" tag used in Execution
  // Details rather than a guess.
  function renderCaseStudyTimeline(section, trade) {
    var list = section.querySelector('#cs-timeline');
    if (!list) return;
    var position = linkedPositionForTrade(trade);

    var entry = timelineEntryMoment(trade, position);
    var entryStamp = entry && entry.hasTime ? formatTimelineMoment(entry.ms)
      : (entry ? formatMediumDate(trade.date) : null);

    var closeMs = position && position.closeTime ? Date.parse(position.closeTime) : NaN;
    // No linked close timestamp: fall back to the manually entered exit time,
    // placed after the entry by the same same-day / next-day rule as Hold Time.
    if (isNaN(closeMs) && entry && entry.hasTime) {
      var heldMinutes = manualHoldMinutes(trade);
      if (heldMinutes !== null) closeMs = entry.ms + heldMinutes * 60000;
    }
    var isOpen = trade.outcome === 'open';
    var exitStamp = !isNaN(closeMs) ? formatTimelineMoment(closeMs) : null;

    function priceHtml(raw) {
      return parsePriceValue(raw || '') !== null
        ? '<span class="font-metric-lg text-metric-lg font-semibold text-on-surface">$' + escapeHtml(raw) + '</span>'
        : '<span class="' + NOT_RECORDED_CLASS + '">Not recorded</span>';
    }
    function stampHtml(stamp, missing) {
      return stamp
        ? '<span class="font-metric-sm text-metric-sm text-secondary">' + escapeHtml(stamp) + '</span>'
        : '<span class="font-metric-sm text-metric-sm text-secondary italic">' + missing + '</span>';
    }
    function row(dotClass, stampMarkup, title, descriptionHtml, priceMarkup, isLast) {
      return (
        '<li class="relative flex gap-4' + (isLast ? '' : ' pb-6') + '">' +
          (isLast ? '' : '<span class="absolute left-[5px] top-4 bottom-0 w-px bg-outline-variant"></span>') +
          '<span class="relative mt-1 w-[11px] h-[11px] rounded-full shrink-0 ring-4 ring-surface-container-lowest ' + dotClass + '"></span>' +
          '<div class="flex-1 min-w-0 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">' +
            '<div class="flex flex-col gap-0.5 min-w-0">' +
              stampMarkup +
              '<span class="font-headline-sm text-headline-sm text-on-surface font-semibold">' + title + '</span>' +
              '<span class="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-2 flex-wrap">' + descriptionHtml + '</span>' +
            '</div>' +
            '<div class="shrink-0">' + priceMarkup + '</div>' +
          '</div>' +
        '</li>'
      );
    }

    var exitDescription;
    if (isOpen) {
      exitDescription = 'Position still open';
    } else {
      var pillClass = OUTCOME_PILL_CLASS[trade.outcome] || OUTCOME_PILL_CLASS.open;
      var dot = OUTCOME_DOT_CLASS[trade.outcome] || OUTCOME_DOT_CLASS.open;
      exitDescription = 'Position closed <span class="' + pillClass + ' font-metric-sm text-metric-sm font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5">' +
        '<span class="w-1.5 h-1.5 rounded-full ' + dot + '"></span>' + escapeHtml(String(trade.outcome).toUpperCase()) + '</span>';
    }

    list.innerHTML =
      row('bg-primary', stampHtml(entryStamp, 'Entry date not recorded'), 'Entry', 'Position opened', priceHtml(trade.entryPrice), false) +
      row(isOpen ? OUTCOME_DOT_CLASS.open : (OUTCOME_DOT_CLASS[trade.outcome] || OUTCOME_DOT_CLASS.open),
        stampHtml(exitStamp, isOpen ? 'Not closed yet' : 'Close time not recorded'), 'Exit', exitDescription, priceHtml(trade.exitPrice), true);
  }

  // Larger P&L and R badges in the header; each only when it can be computed.
  function renderCaseStudyReturnBadges(section, ret) {
    var el = section.querySelector('#cs-return-badges');
    if (!el) return;
    var badges = [];
    function add(label, positive) {
      badges.push('<span class="' + (positive ? 'bg-tertiary/10 text-tertiary' : 'bg-error/10 text-error') +
        ' font-metric-md text-metric-md font-bold px-2.5 py-1 rounded-lg">' + label + '</span>');
    }
    if (ret && ret.dollarPnl !== null) add(formatSignedDollars(ret.dollarPnl), ret.dollarPnl >= 0);
    if (ret && ret.rMultiple !== null) add(formatSignedR(ret.rMultiple), ret.rMultiple >= 0);
    el.innerHTML = badges.join('');
  }

  // Horizontal stat cells under the header. A cell is only built when real
  // data backs it - there are no placeholders, so the row shrinks per trade.
  function renderCaseStudyStats(section, trade, ret) {
    var row = section.querySelector('#cs-stats-row');
    if (!row) return;

    var cells = [];
    function cell(label, icon, value, sub, tone) {
      cells.push(
        // No card of its own: the row sits inside the header card, under a divider.
        '<div class="flex flex-col min-w-0">' +
          '<div class="flex items-center justify-between text-secondary font-label-eyebrow text-label-eyebrow uppercase gap-2">' +
            '<span class="truncate">' + label + '</span>' +
            '<span class="material-symbols-outlined text-primary text-[18px] shrink-0">' + icon + '</span>' +
          '</div>' +
          '<div class="mt-2 min-w-0">' +
            '<div class="font-metric-lg text-metric-lg font-semibold truncate ' + (tone || 'text-on-surface') + '" title="' + escapeHtml(value) + '">' + escapeHtml(value) + '</div>' +
            (sub ? '<div class="font-metric-sm text-metric-sm text-secondary">' + escapeHtml(sub) + '</div>' : '') +
          '</div>' +
        '</div>'
      );
    }
    function present(raw) { return parsePriceValue(raw || '') !== null; }

    if (present(trade.entryPrice)) cell('Entry Price', 'login', '$' + trade.entryPrice);
    if (present(trade.exitPrice)) cell('Exit Price', 'logout', '$' + trade.exitPrice);
    if (present(trade.stopLoss)) cell('Stop Loss', 'block', '$' + trade.stopLoss);
    if (present(trade.takeProfit)) cell('Take Profit', 'flag', '$' + trade.takeProfit);

    var rr = computeRiskReward(trade);
    if (rr) cell('Risk : Reward', 'balance', formatRiskReward(rr), rr.basis);

    if (ret && ret.dollarPnl !== null) {
      cell('P&L', 'payments', formatSignedDollars(ret.dollarPnl),
        (ret.pctChange >= 0 ? '+' : '') + ret.pctChange.toFixed(2) + '%',
        ret.dollarPnl >= 0 ? 'text-tertiary' : 'text-error');
    }

    // Position Size: notional (margin x leverage, only when leverage is actually
    // recorded) and/or the contract quantity from the linked Position History
    // record. Margin alone is already in Execution Details, so it isn't repeated.
    var margin = parsePriceValue(trade.positionSize || '');
    var leverageX = parseFloat((trade.leverage || '').match(/[\d.]+/) || 0);
    var notional = margin !== null && leverageX ? margin * leverageX : null;
    var linkedPosition = linkedPositionForTrade(trade);
    var qty = linkedPosition && linkedPosition.qty ? String(linkedPosition.qty).trim() : '';
    if (notional !== null) cell('Position Size', 'account_balance_wallet', formatMoney(notional), qty ? 'Notional · ' + qty + ' cont.' : 'Notional');
    else if (qty) cell('Position Size', 'account_balance_wallet', qty, 'Contracts');

    // Hold Time: exact from a linked Position History record; otherwise from
    // the manually entered entry + exit times (under 24h by construction).
    var hold = tradeDurationLabel(trade);
    var holdSub = '';
    if (!hold) {
      var manualMinutes = manualHoldMinutes(trade);
      if (manualMinutes !== null) {
        hold = formatDurationMs(manualMinutes * 60000);
        holdSub = 'Assumes exit within 24h';
      }
    }
    if (hold) cell('Hold Time', 'timelapse', hold, holdSub);

    var fee = tradeFeeAmount(trade);
    if (fee !== null) cell('Fees', 'receipt_long', formatMoney(fee));

    row.innerHTML = cells.join('');
    row.hidden = cells.length === 0;
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

  // Bold "X / Y" score: parameters logged on this trade against the size of
  // the whole known vocabulary. A parameter since removed from the vocabulary
  // still counts toward Y, so X can never exceed it.
  function renderCaseStudyScore(section, trade, checklist) {
    var valueEl = section.querySelector('#cs-score-value');
    var unitEl = section.querySelector('#cs-score-unit');
    var subEl = section.querySelector('#cs-score-sub');
    var barEl = section.querySelector('#cs-score-bar');
    if (!valueEl || !unitEl || !subEl || !barEl) return;

    var known = {};
    getAllKnownParameters().forEach(function (name) { known[name.toLowerCase()] = true; });
    nonEmptyConfluence(trade).forEach(function (name) { known[name.toLowerCase()] = true; });
    var total = Object.keys(known).length;
    var filled = checklist.filledCount;

    if (!filled) {
      valueEl.textContent = '0';
      unitEl.textContent = 'parameters';
      subEl.textContent = total ? 'of ' + total + ' known' : '';
      barEl.style.width = '0%';
      return;
    }
    valueEl.textContent = filled + ' / ' + total;
    unitEl.textContent = 'parameters';
    subEl.textContent = checklist.passedCount + ' passed';
    barEl.style.width = Math.round((filled / total) * 100) + '%';
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
    renderCaseStudyScore(section, trade, checklist);

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

    // The Full screen button is re-rendered with the tabs, and the exit button
    // lives inside the fullscreen element itself, so both are delegated.
    section.addEventListener('click', function (e) {
      var target = e.target.closest ? e.target : null;
      if (!target || !csCurrentTradeId) return;
      var trade = TradeStore.getById(csCurrentTradeId);
      if (!trade) return;
      if (target.closest('#cs-chart-fullscreen') || target.closest('.cs-fs-exit')) toggleChartFullscreen(section, trade);
    });
    document.addEventListener('fullscreenchange', function () {
      var btn = section.querySelector('#cs-chart-fullscreen');
      if (btn) btn.innerHTML = chartFullscreenLabelHtml();
    });
    // Leaving the page (or picking another trade) mustn't strand a fullscreen panel.
    document.addEventListener('screenchange', function () {
      if (document.fullscreenElement) document.exitFullscreen();
    });

    var editBtn = section.querySelector('#cs-btn-edit');
    if (editBtn) {
      editBtn.addEventListener('click', function () {
        var id = editBtn.getAttribute('data-trade-id');
        if (id) window.AppRouter.navigate('new-trade-entry', id);
      });
    }

    // Export uses the browser's print dialog ("Save as PDF"); the print
    // stylesheet in index.html hides the app chrome and action buttons. The
    // tab title becomes the default PDF filename, so it's set for the print.
    var exportBtn = section.querySelector('#cs-btn-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        var trade = csCurrentTradeId ? TradeStore.getById(csCurrentTradeId) : null;
        if (!trade) return;
        var originalTitle = document.title;
        document.title = 'Case Study - ' + trade.pair + ' - ' + trade.date;
        window.addEventListener('afterprint', function restore() {
          document.title = originalTitle;
          window.removeEventListener('afterprint', restore);
        });
        window.print();
      });
    }

    var prevBtn = section.querySelector('#cs-btn-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        var id = prevBtn.getAttribute('data-nav-id');
        if (id) window.AppRouter.navigate('case-studies', id);
      });
    }

    var nextBtn = section.querySelector('#cs-btn-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        var id = nextBtn.getAttribute('data-nav-id');
        if (id) window.AppRouter.navigate('case-studies', id);
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
        body.innerHTML = '<img src="' + safeImageUrl(uploadedChart) + '" alt="' + (key ? chartTimeframe(key).label : 'Chart') + ' chart for ' + escapeHtml(trade.pair) + '" class="rounded-lg" draggable="false" />';
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
  var nteChartLinks = { daily: '', h4: '', m15: '' };
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

  // A timeframe counts as attached with an image, a link, or both.
  function renderChartAttachedCount(section) {
    var counter = section.querySelector('#chart-attached-count');
    if (!counter) return;
    var attached = CHART_TIMEFRAMES.filter(function (tf) { return nteChartImages[tf.key] || nteChartLinks[tf.key]; }).length;
    counter.textContent = attached + ' / ' + CHART_TIMEFRAMES.length + ' ATTACHED';
  }

  // Each timeframe is its own image slot plus its own TradingView link input
  // (either, or both, may be filled).
  function renderChartSlots(section) {
    var container = section.querySelector('#chart-slots');
    if (!container) return;
    container.innerHTML = CHART_TIMEFRAMES.map(function (tf) {
      var image = nteChartImages[tf.key];
      var error = nteChartErrors[tf.key];
      var slot;
      if (image) {
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
      var linkValue = nteChartLinks[tf.key] || '';
      var linkInput =
        '<div class="mt-2">' +
          '<label class="font-label-eyebrow text-label-eyebrow text-on-surface-variant uppercase tracking-wider block mb-1" for="chart-link-' + tf.key + '">' + tf.label + ' TradingView link (optional)</label>' +
          '<input class="chart-link-input h-[34px] w-full px-3 rounded-lg bg-surface-container-low text-on-surface font-metric-sm text-metric-sm placeholder:text-outline-variant focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" ' +
            'id="chart-link-' + tf.key + '" data-tf="' + tf.key + '" type="text" placeholder="https://www.tradingview.com/x/XXXXXXXX/" autocomplete="off" value="' + escapeHtml(linkValue) + '" />' +
          '<p class="chart-link-warning font-metric-sm text-metric-sm text-error mt-1" data-tf="' + tf.key + '"' + (chartLinkLooksOff(linkValue) ? '' : ' hidden') + '>This doesn’t look like a TradingView link</p>' +
        '</div>';
      return '<div>' + slot + (error ? '<p class="font-metric-sm text-metric-sm text-error mt-1.5">' + escapeHtml(error) + '</p>' : '') + linkInput + '</div>';
    }).join('');
    renderChartAttachedCount(section);
    updateFieldsCompleted(section);
  }

  // ---------------------------------------------------------------------
  // Confluence Parameters multi-select (New Trade Entry)
  // ---------------------------------------------------------------------

  var CONFLUENCE_PARAMETER_LIBRARY = [
    'Daily Uptrend & Momentum',
    'Daily Sideways',
    'Daily RSI above 70',
    'Daily RSI below 70',
    '4H BOS',
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
      // A tombstone for a retired default carries over to the name it merged into.
      return Array.isArray(list) ? list.map(function (n) { return canonicalParameter(n).toLowerCase(); }) : [];
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

    // Entries under a retired name go last, so when both spellings are stored
    // the one already under the kept name (and wherever the user filed it)
    // survives the merge below.
    function isRetired(entry) {
      var raw = typeof entry === 'string' ? entry : (entry && entry.name);
      return !!raw && canonicalParameter(raw).toLowerCase() !== String(raw).trim().toLowerCase();
    }
    stored = stored.filter(function (e) { return !isRetired(e); }).concat(stored.filter(isRetired));

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
      var canonicalName = canonicalParameter(name);
      if (canonicalName !== name) {
        name = canonicalName;
        changed = true;
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

  // One-time cleanup of data saved under a retired parameter name. Reads
  // already return canonical names (migrateTrade / normalizeSetup /
  // loadConfluenceVocabulary), so this only makes that permanent in storage -
  // and, via the store's own setAll, queues the change for GitHub sync. It
  // only rewrites when a retired name is actually present, so it is a no-op
  // on every load after the first.
  function migrateStoredParameterAliases() {
    var retired = Object.keys(PARAMETER_ALIASES);
    function mentionsRetired(raw) {
      var lower = String(raw || '').toLowerCase();
      return retired.some(function (name) { return lower.indexOf(name) !== -1; });
    }
    try {
      if (mentionsRetired(localStorage.getItem(STORAGE_KEY))) TradeStore.setAll(TradeStore.getAll());
      if (mentionsRetired(localStorage.getItem(SETUPS_STORAGE_KEY))) SetupStore.setAll(SetupStore.getAll());
      if (mentionsRetired(localStorage.getItem(ANTI_PATTERNS_STORAGE_KEY))) AntiPatternStore.setAll(AntiPatternStore.getAll());
    } catch (e) {}
    loadConfluenceVocabulary();
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
  // `selectedList` is whichever selection the picker instance owns (New Trade
  // Entry's nteSelectedParameters, or the Confluence Matrix setup builder's).
  // With opts.manage false the delete control is left out entirely, so a
  // read-only use of the picker can't remove vocabulary entries.
  function parameterInList(list, value) {
    var key = String(value).toLowerCase();
    return list.some(function (p) { return p.toLowerCase() === key; });
  }

  function confluenceChipHtml(value, selectedList, opts) {
    var manage = !opts || opts.manage !== false;
    var selected = parameterInList(selectedList || nteSelectedParameters, value);
    var stateClass = selected
      ? 'bg-primary text-on-primary shadow-sm'
      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container';
    var icon = selected
      ? '<span class="material-symbols-outlined text-[14px]">check</span>'
      : '<span class="material-symbols-outlined text-[14px] opacity-40">add</span>';
    var deleteTone = selected ? 'hover:bg-on-primary/20' : 'hover:bg-error/10 hover:text-error';
    var deleteBtn = manage
      ? '<button type="button" class="confluence-chip-delete mr-1.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ' + deleteTone + '" ' +
          'data-value="' + escapeHtml(value) + '" title="Delete from picker" aria-label="Delete ' + escapeHtml(value) + ' from picker">' +
          '<span class="material-symbols-outlined text-[14px]">close</span>' +
        '</button>'
      : '';
    return (
      '<span class="confluence-chip-wrap group inline-flex items-center rounded-full transition-colors ' + stateClass + '">' +
        '<button type="button" class="confluence-chip inline-flex items-center gap-1.5 pl-3 ' + (manage ? 'pr-1.5' : 'pr-3') + ' py-1.5 rounded-full font-body-sm text-body-sm font-medium bg-transparent" ' +
          'data-value="' + escapeHtml(value) + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' +
          icon + escapeHtml(value) +
        '</button>' +
        deleteBtn +
      '</span>'
    );
  }

  function confluenceCategoryHeaderHtml(category, count, opts) {
    var deletable = category.key !== FALLBACK_CATEGORY_KEY && (!opts || opts.manage !== false);
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
  //
  // Shared by New Trade Entry (opts.manage true: chips and categories can be
  // deleted) and the Confluence Matrix setup builder (manage false, plus
  // opts.extraKnown - names in use on trades that the vocabulary doesn't list).
  function parameterPickerGridHtml(selectedList, opts) {
    opts = opts || {};
    var manage = opts.manage !== false;
    var known = getAllKnownParameters();
    // A parameter only present on this trade (e.g. from an older vocabulary)
    // still needs a chip, otherwise it would silently vanish on edit.
    selectedList.concat(opts.extraKnown || []).forEach(function (value) {
      if (!parameterInList(known, value)) known.push(value);
    });

    var categories = loadParamCategories();
    var grouped = {};
    categories.forEach(function (cat) { grouped[cat.key] = []; });
    known.forEach(function (value) { grouped[parameterCategory(value)].push(value); });

    // Empty categories still render in manage mode - otherwise they'd be
    // invisible and there would be no way to reach their delete control.
    return categories.map(function (cat) {
      var items = grouped[cat.key] || [];
      if (!manage && !items.length) return '';
      var body = items.length
        ? '<div class="flex flex-wrap gap-2">' + items.map(function (value) { return confluenceChipHtml(value, selectedList, opts); }).join('') + '</div>'
        : '<p class="font-metric-sm text-metric-sm text-outline-variant">No parameters in this category yet.</p>';
      return '<div>' + confluenceCategoryHeaderHtml(cat, items.length, opts) + body + '</div>';
    }).join('');
  }

  function renderConfluenceGrid(section) {
    var grid = section.querySelector('#confluence-grid');
    if (!grid) return;

    grid.innerHTML = parameterPickerGridHtml(nteSelectedParameters, { manage: true });

    var countEl = section.querySelector('#confluence-selected-count');
    if (countEl) countEl.textContent = nteSelectedParameters.length + ' selected';

    renderSetupMatchBanners(section);
    syncConfluenceCategoryOptions(section);
    updateFieldsCompleted(section);
  }

  // Saved setups / flagged anti-patterns whose parameters are ALL in the
  // current selection - the same contains-all rule as everywhere else, so the
  // trade may carry extra parameters beyond what the combination requires.
  function combosContainedInSelection(store) {
    return store.getAll().filter(function (item) {
      return item.parameters.length && item.parameters.every(function (p) { return parameterInList(nteSelectedParameters, p); });
    });
  }

  // The moment-of-decision nudge under the picker. Runs on every selection
  // change (renderConfluenceGrid is the single path for all of them), and
  // stays hidden - not an empty state - when nothing matches. The trade
  // being edited is left out of the record it is compared against, so an
  // edit isn't graded partly on its own outcome. Trades are only read when
  // something matched, keeping ordinary chip toggling cheap.
  function renderSetupMatchBanners(section) {
    var el = section.querySelector('#nte-match-banners');
    if (!el) return;
    var setups = combosContainedInSelection(SetupStore);
    var antiPatterns = combosContainedInSelection(AntiPatternStore);
    if (!setups.length && !antiPatterns.length) {
      el.innerHTML = '';
      el.hidden = true;
      return;
    }

    var closed = cmClosedTrades().filter(function (t) { return t.id !== nteEditingTradeId; });
    function banner(tone, icon, html) {
      return '<div class="flex items-start gap-2 px-3 py-2 rounded-lg ' + tone + '">' +
        '<span class="material-symbols-outlined text-[18px] shrink-0 mt-px">' + icon + '</span>' +
        '<span class="font-body-sm text-body-sm">' + html + '</span></div>';
    }
    // Warnings first: they're the ones worth stopping for.
    var html = antiPatterns.map(function (item) {
      var stat = cmSetupStat(item.parameters, closed);
      var record = stat.total ? 'historically ' + stat.wins + '/' + stat.total + ' (' + stat.rate + '%)' : 'no closed trades to judge it by yet';
      return banner('bg-error-container text-on-error-container', 'warning',
        'Matches flagged anti-pattern <span class="font-semibold">\'' + escapeHtml(item.name) + '\'</span> — ' + record + '.');
    }).concat(setups.map(function (item) {
      var stat = cmSetupStat(item.parameters, closed);
      var record = stat.total ? stat.rate + '% historical win rate (' + stat.wins + '/' + stat.total + ')' : 'no closed trades to judge it by yet';
      return banner('bg-tertiary-fixed/30 text-on-tertiary-fixed-variant', 'check_circle',
        'Matches your saved setup <span class="font-semibold">\'' + escapeHtml(item.name) + '\'</span> — ' + record + '.');
    })).join('');
    el.innerHTML = html;
    el.hidden = false;
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

    // Planned R:R (Entry / Stop / Take-Profit) shows as soon as a Take-Profit
    // is typed; with only an Exit it reflects the realized reward instead.
    var rrDisplay = section.querySelector('#target-risk-reward');
    if (rrDisplay) {
      var rr = computeRiskReward({
        entryPrice: section.querySelector('#input-entry').value,
        exitPrice: section.querySelector('#input-exit').value,
        stopLoss: section.querySelector('#input-stop-loss').value,
        takeProfit: section.querySelector('#input-take-profit').value,
        direction: directionInput ? directionInput.value : 'long'
      });
      rrDisplay.textContent = rr ? formatRiskReward(rr) + ' (' + rr.basis.toLowerCase() + ')' : 'Pending Values';
      rrDisplay.className = 'font-metric-md text-metric-md font-semibold ' + (rr ? 'text-on-surface' : 'text-on-surface-variant');
    }

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

  // Counts the text/select inputs listed below, plus confluence parameters and
  // a chart (image or link) - each counted once regardless of how many
  // sub-values it holds.
  function updateFieldsCompleted(section) {
    var countEl = section.querySelector('#fields-completed-count');
    var barEl = section.querySelector('#fields-completed-bar');
    if (!countEl || !barEl) return;

    var textFields = ['#input-date', '#input-entry-time', '#input-exit-time', '#input-pair', '#input-leverage-multiplier',
      '#input-entry', '#input-exit', '#input-position-size', '#input-stop-loss', '#input-take-profit', '#input-notes'];
    var filled = textFields.filter(function (sel) {
      var el = section.querySelector(sel);
      return el && el.value && el.value.trim();
    }).length;

    if (nteSelectedParameters.length) filled++;

    var hasChart = CHART_TIMEFRAMES.some(function (tf) {
      return (nteChartImages[tf.key] && nteChartImages[tf.key].value) || nteChartLinks[tf.key];
    });
    if (hasChart) filled++;

    var total = textFields.length + 2;
    countEl.textContent = filled + ' / ' + total;
    barEl.style.width = Math.round((filled / total) * 100) + '%';
  }

  // Deliberately advisory only - a snapshot can live on a shortened or
  // regional domain, so an unexpected host is flagged but never blocks a save.
  function chartLinkLooksOff(value) {
    if (!value) return false;
    var isHttp = /^https?:\/\//i.test(value);
    var isTV = value.toLowerCase().indexOf('tradingview.com') !== -1;
    return !(isHttp && isTV);
  }

  // Rebuilt every time the form is entered, so a setup saved (or deleted) on
  // Confluence Matrix is reflected without a reload.
  function syncLoadSetupOptions(section) {
    var select = section.querySelector('#nte-load-setup');
    if (!select) return;
    var setups = SetupStore.getAll().sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (!setups.length) {
      select.innerHTML = '<option value="">No saved setups yet — create one on Confluence Matrix</option>';
      select.disabled = true;
      return;
    }
    select.disabled = false;
    select.innerHTML = '<option value="">Choose a setup…</option>' + setups.map(function (s) {
      return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.name) + ' (' + s.parameters.length + ')</option>';
    }).join('');
    select.value = '';
  }

  // A starting point, not a lock: the picker stays fully editable afterwards.
  function loadSetupIntoForm(section, setupId) {
    var select = section.querySelector('#nte-load-setup');
    var setup = setupId ? SetupStore.getById(setupId) : null;
    if (!setup) return;

    var extras = nteSelectedParameters.filter(function (p) { return !parameterInList(setup.parameters, p); });
    if (extras.length && !window.confirm(
      'Replace the ' + nteSelectedParameters.length + ' currently selected parameter' + (nteSelectedParameters.length === 1 ? '' : 's') +
      ' with "' + setup.name + '"?\n\n' + extras.length + ' of them ' + (extras.length === 1 ? 'is' : 'are') + ' not part of that setup.'
    )) {
      if (select) select.value = '';
      return;
    }

    nteSelectedParameters = setup.parameters.slice();
    renderConfluenceGrid(section);
    var setupNameField = section.querySelector('#input-setup-name');
    if (setupNameField && !setupNameField.value.trim()) setupNameField.value = setup.name;
    showConfluenceAddNote(section, 'Loaded "' + setup.name + '" — ' + setup.parameters.length + ' parameter' + (setup.parameters.length === 1 ? '' : 's') + '. Add or remove any before saving.');
    if (select) select.value = '';
  }

  function initNewTradeEntry() {
    var section = sections['new-trade-entry'];
    if (!section) return;

    var loadSetupSelect = section.querySelector('#nte-load-setup');
    if (loadSetupSelect) {
      loadSetupSelect.addEventListener('change', function () { loadSetupIntoForm(section, loadSetupSelect.value); });
    }

    var form = section.querySelector('#trade-entry-form');
    var entryInput = section.querySelector('#input-entry');
    var exitInput = section.querySelector('#input-exit');
    var saveBtn = section.querySelector('#btn-save-trade');
    var cancelBtn = section.querySelector('#btn-cancel-trade');
    var pairField = section.querySelector('#input-pair');

    initConfluencePicker(section);

    var slotsEl = section.querySelector('#chart-slots');
    var slotInput = section.querySelector('#chart-slot-input');

    // Each timeframe's link input is re-rendered with the slots, so what's
    // typed lives in nteChartLinks rather than in the DOM. Typing doesn't
    // re-render (that would drop focus); it only toggles the advisory note.
    if (slotsEl) {
      slotsEl.addEventListener('input', function (e) {
        var input = e.target.closest ? e.target.closest('.chart-link-input') : null;
        if (!input) return;
        var tfKey = input.getAttribute('data-tf');
        nteChartLinks[tfKey] = input.value.trim();
        var warning = slotsEl.querySelector('.chart-link-warning[data-tf="' + tfKey + '"]');
        if (warning) warning.hidden = !chartLinkLooksOff(nteChartLinks[tfKey]);
        renderChartAttachedCount(section);
      });
    }

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
    var takeProfitInputEl = section.querySelector('#input-take-profit');
    if (takeProfitInputEl) takeProfitInputEl.addEventListener('input', updateDelta);
    form.querySelectorAll('input[name="direction"]').forEach(function (r) { r.addEventListener('change', updateDelta); });
    var leverageMultiplierEl = section.querySelector('#input-leverage-multiplier');
    if (leverageMultiplierEl) leverageMultiplierEl.addEventListener('change', updateDelta);
    form.querySelectorAll('input[name="margin_mode"]').forEach(function (r) { r.addEventListener('change', updateDelta); });

    // Delegated rather than per-field: covers every text/select input
    // (including ones with no other listener, like date/pair/notes)
    // without enumerating them a second time.
    form.addEventListener('input', function () { updateFieldsCompleted(section); });
    form.addEventListener('change', function () { updateFieldsCompleted(section); });

    function collectTrade() {
      var directionInput = form.querySelector('input[name="direction"]:checked');
      var prevCandleInput = form.querySelector('input[name="prev_candle"]:checked');
      var outcomeInput = form.querySelector('input[name="outcome"]:checked');
      var dateInput = section.querySelector('#input-date');
      var leverageMultiplierInput = section.querySelector('#input-leverage-multiplier');
      var marginModeInput = form.querySelector('input[name="margin_mode"]:checked');
      var positionSizeInput = section.querySelector('#input-position-size');
      var stopLossInput = section.querySelector('#input-stop-loss');
      var takeProfitInput = section.querySelector('#input-take-profit');
      var entryTimeInput = section.querySelector('#input-entry-time');
      var exitTimeInput = section.querySelector('#input-exit-time');
      var notesInput = section.querySelector('#input-notes');
      var setupNameInput = section.querySelector('#input-setup-name');

      var originalTrade = nteEditingTradeId ? TradeStore.getById(nteEditingTradeId) : null;

      var trade = {
        id: nteEditingTradeId || ('trade-' + Date.now()),
        date: dateInput && dateInput.value ? dateInput.value : todayDateString(),
        entryTime: entryTimeInput && entryTimeInput.value ? entryTimeInput.value : '',
        exitTime: exitTimeInput && exitTimeInput.value ? exitTimeInput.value : '',
        pair: normalizePairSymbol(pairField.value),
        setupName: setupNameInput ? setupNameInput.value.trim() : '',
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
        takeProfit: takeProfitInput ? takeProfitInput.value.trim() : '',
        outcome: outcomeInput ? outcomeInput.value : 'open',
        parameters: nteSelectedParameters.slice(),
        charts: CHART_TIMEFRAMES.reduce(function (acc, tf) { acc[tf.key] = nteChartImages[tf.key]; return acc; }, {}),
        chartLinks: CHART_TIMEFRAMES.reduce(function (acc, tf) { acc[tf.key] = (nteChartLinks[tf.key] || '').trim(); return acc; }, {}),
        chart: null,
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
    // History row rather than from an existing trade. "duplicate:<tradeId>"
    // pre-fills the setup (pair/direction/leverage/confluence tags) from an
    // existing trade but as a brand-new draft - blank date, blank prices,
    // blank id - so a similar setup can be logged quickly without editing
    // the original.
    var rawParam = tradeIdParam ? decodeURIComponent(tradeIdParam) : null;
    var promotingPosition = null;
    var duplicatingTrade = null;
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
    } else if (rawParam && rawParam.indexOf('duplicate:') === 0) {
      duplicatingTrade = TradeStore.getById(rawParam.slice('duplicate:'.length));
      tradeId = null;
    }
    var trade = tradeId ? TradeStore.getById(tradeId) : null;

    form.reset();
    nteChartEpoch += 1;
    nteChartImages = { daily: null, h4: null, m15: null };
    nteChartLinks = { daily: '', h4: '', m15: '' };
    nteChartErrors = {};
    nteChartTargetTf = null;
    ntePromotingPositionId = null;
    nteSelectedParameters = trade ? nonEmptyConfluence(trade).slice()
      : duplicatingTrade ? nonEmptyConfluence(duplicatingTrade).slice()
      : [];
    // Set before the first picker render: the setup-match banner excludes the
    // trade being edited from the record it shows.
    nteEditingTradeId = trade ? trade.id : null;
    renderConfluenceGrid(section);
    syncLoadSetupOptions(section);
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
      section.querySelector('#input-exit-time').value = trade.exitTime || '';
      section.querySelector('#input-pair').value = trade.pair || '';
      var setupNameField = section.querySelector('#input-setup-name');
      if (setupNameField) setupNameField.value = trade.setupName || '';
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
      section.querySelector('#input-take-profit').value = trade.takeProfit || '';
      section.querySelector('#input-notes').value = trade.notes || '';
      ['direction', 'prev_candle', 'outcome'].forEach(function (name) {
        var value = name === 'direction' ? trade.direction : name === 'prev_candle' ? trade.prevCandle : trade.outcome;
        var radio = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
        if (radio) radio.checked = true;
      });
      CHART_TIMEFRAMES.forEach(function (tf) {
        nteChartImages[tf.key] = tradeCharts(trade)[tf.key];
      });
      CHART_TIMEFRAMES.forEach(function (tf) {
        nteChartLinks[tf.key] = tradeChartLinks(trade)[tf.key] || '';
      });
      if (headingEl) headingEl.textContent = 'Edit Trade';
      if (stageBadgeEl) { stageBadgeEl.textContent = 'STAGE: EDIT'; }
      if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> Save Changes';
    } else if (promotingPosition) {
      nteEditingTradeId = null;
      ntePromotingPositionId = promotingPosition.id;
      var local = positionLocalDateTime(promotingPosition);
      section.querySelector('#input-date').value = local.date;
      section.querySelector('#input-entry-time').value = local.time;
      section.querySelector('#input-exit-time').value = positionLocalCloseTime(promotingPosition);
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
    } else if (duplicatingTrade) {
      nteEditingTradeId = null;
      ntePromotingPositionId = null;
      section.querySelector('#input-date').value = todayDateString();
      section.querySelector('#input-pair').value = duplicatingTrade.pair || '';
      var dupSetupNameField = section.querySelector('#input-setup-name');
      if (dupSetupNameField) dupSetupNameField.value = duplicatingTrade.setupName || '';
      var dupLeverageMultiplier = parseFloat((duplicatingTrade.leverage || '').match(/[\d.]+/) || 10);
      var dupMultiplierSelect = section.querySelector('#input-leverage-multiplier');
      var dupHasOption = Array.prototype.some.call(dupMultiplierSelect.options, function (o) { return Number(o.value) === dupLeverageMultiplier; });
      dupMultiplierSelect.value = dupHasOption ? String(dupLeverageMultiplier) : '10';
      var dupMarginModeRadio = form.querySelector('input[name="margin_mode"][value="' + parseLeverageMode(duplicatingTrade.leverage) + '"]');
      if (dupMarginModeRadio) dupMarginModeRadio.checked = true;
      ['direction', 'prev_candle'].forEach(function (name) {
        var value = name === 'direction' ? duplicatingTrade.direction : duplicatingTrade.prevCandle;
        var radio = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
        if (radio) radio.checked = true;
      });
      if (headingEl) headingEl.textContent = 'New Trade Entry (Duplicated)';
      if (stageBadgeEl) { stageBadgeEl.textContent = 'STAGE: DRAFT'; }
      if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> Save Trade';
    } else {
      nteEditingTradeId = null;
      ntePromotingPositionId = null;
      section.querySelector('#input-date').value = todayDateString();
      if (headingEl) headingEl.textContent = 'New Trade Entry';
      if (stageBadgeEl) { stageBadgeEl.textContent = 'STAGE: DRAFT'; }
      if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> Save Trade';
    }

    renderChartSlots(section);
    updateDeltaDisplay(section);
  }

  // ---------------------------------------------------------------------
  // Insights Dashboard screen
  // ---------------------------------------------------------------------

  // Longest run of consecutive wins in date order. An 'open' trade breaks
  // the streak the same way a loss does - it isn't a confirmed win yet.
  function computeLongestWinStreak(trades) {
    var sorted = trades.slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    var current = 0, longest = 0;
    sorted.forEach(function (t) {
      if (t.outcome === 'win') { current++; longest = Math.max(longest, current); }
      else { current = 0; }
    });
    return longest;
  }

  // Returns { count, direction } for the current active streak in the most
  // recent trades.  direction = 'win' | 'loss' | 'none'.
  function computeCurrentStreak(trades) {
    var sorted = trades.slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    var closed = sorted.filter(function (t) { return t.outcome === 'win' || t.outcome === 'loss'; });
    if (!closed.length) return { count: 0, direction: 'none' };
    var dir = closed[closed.length - 1].outcome;
    var count = 0;
    for (var i = closed.length - 1; i >= 0; i--) {
      if (closed[i].outcome === dir) count++;
      else break;
    }
    return { count: count, direction: dir };
  }

  // Expectancy = (Win Rate × Avg Win $) − (Loss Rate × Avg Loss $)
  // Returns null when there isn't enough data.
  function computeExpectancy(positions) {
    var wins   = positions.filter(function (p) { return positionNet(p) > 0; });
    var losses = positions.filter(function (p) { return positionNet(p) < 0; });
    if (!wins.length || !losses.length) return null;
    var total = wins.length + losses.length;
    var avgWin  = wins.reduce(function (s, p) { return s + positionNet(p); }, 0) / wins.length;
    var avgLoss = losses.reduce(function (s, p) { return s + positionNet(p); }, 0) / losses.length; // negative
    var winRate  = wins.length / total;
    var lossRate = losses.length / total;
    return winRate * avgWin + lossRate * avgLoss; // avgLoss is negative so this subtracts
  }

  // Avg hold duration (ms) split by position outcome.
  // Returns { avgWinMs, avgLossMs, winCount, lossCount }.
  function computeAvgHoldTimes(positions) {
    var winMs = 0, lossMs = 0, winN = 0, lossN = 0;
    positions.forEach(function (p) {
      var dur = positionDurationMs(p);
      if (!isFinite(dur) || dur < 0) return;
      var net = positionNet(p);
      if (net > 0) { winMs += dur; winN++; }
      else if (net < 0) { lossMs += dur; lossN++; }
    });
    return {
      avgWinMs:  winN  > 0 ? winMs  / winN  : null,
      avgLossMs: lossN > 0 ? lossMs / lossN : null,
      winCount:  winN,
      lossCount: lossN
    };
  }

  // Max drawdown from an ordered { t, amount } series.
  // Returns { drawdown (negative $), peakCum, troughCum } or null.
  function computeMaxDrawdown(items) {
    var ordered = items.slice().sort(function (a, b) { return a.t - b.t; });
    if (ordered.length < 2) return null;
    var cum = 0, peak = 0, maxDD = 0, ddPeak = 0, ddTrough = 0;
    ordered.forEach(function (it) {
      cum += it.amount;
      if (cum > peak) peak = cum;
      var dd = cum - peak;
      if (dd < maxDD) { maxDD = dd; ddPeak = peak; ddTrough = cum; }
    });
    return maxDD < 0 ? { drawdown: maxDD, peakCum: ddPeak, troughCum: ddTrough } : null;
  }

  // Win rate grouped by each trade's Daily-context tag (the first logged
  // confluence parameter, e.g. "Daily Uptrend & Momentum").
  function computeDailyContextStats(trades) {
    var closed = trades.filter(function (t) { return t.outcome === 'win' || t.outcome === 'loss'; });
    var groups = {};
    closed.forEach(function (t) {
      var label = nonEmptyConfluence(t)[0] || 'Unlabeled context';
      groups[label] = groups[label] || { label: label, wins: 0, total: 0 };
      groups[label].total++;
      if (t.outcome === 'win') groups[label].wins++;
    });
    return Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return b.total - a.total; });
  }

  function dotColorForRate(rate) {
    if (rate >= 80) return 'bg-tertiary';
    if (rate >= 50) return 'bg-secondary';
    return 'bg-error';
  }

  function dailyContextRowHtml(g) {
    var rate = pct(g.wins, g.total);
    var colors = rateColors(rate);
    return (
      '<tr class="hover:bg-surface-container-low transition-colors">' +
        '<td class="py-3 px-3 text-body-md font-body-md text-on-surface font-medium flex items-center gap-2">' +
          '<span class="w-2 h-2 rounded-full ' + dotColorForRate(rate) + '"></span>' + escapeHtml(g.label) +
        '</td>' +
        '<td class="py-3 px-3 text-right text-metric-md font-metric-md text-secondary">' + g.total + ' trade' + (g.total === 1 ? '' : 's') + '</td>' +
        '<td class="py-3 px-3 text-right"><span class="font-metric-md text-metric-md font-semibold ' + colors.text + ' bg-surface-container px-2 py-0.5 rounded">' + g.wins + '/' + g.total + ' (' + rate + '%)</span></td>' +
      '</tr>'
    );
  }

  function bestDayRowHtml(group) {
    return (
      '<tr class="hover:bg-surface-container-low transition-colors">' +
        '<td class="py-2.5 px-3 text-body-md font-body-md text-on-surface font-medium">' + escapeHtml(group.label) + '</td>' +
        '<td class="py-2.5 px-3 text-right text-metric-md font-metric-md text-secondary">' + group.total + ' trade' + (group.total === 1 ? '' : 's') + '</td>' +
        '<td class="py-2.5 px-3 text-right"><span class="font-metric-md text-metric-md font-semibold ' + rateColors(group.rate).text + '">' + group.rate + '%</span></td>' +
      '</tr>'
    );
  }

  function signalMicroBarHtml(param) {
    var rate = pct(param.wins, param.total);
    var colors = rateColors(rate);
    return (
      '<div class="flex flex-col gap-1.5 p-3 rounded-lg bg-surface-container-low">' +
        '<div class="flex items-center justify-between text-body-sm font-body-sm">' +
          '<span class="font-medium text-on-surface">' + escapeHtml(param.label) + '</span>' +
          '<span class="font-metric-md text-metric-md font-semibold ' + colors.text + '">' + param.wins + '/' + param.total + ' (' + rate + '%)</span>' +
        '</div>' +
        '<div class="w-full bg-surface-container h-2 rounded-full overflow-hidden">' +
          '<div class="' + colors.bar + ' h-full rounded-full" style="width: ' + rate + '%;"></div>' +
        '</div>' +
      '</div>'
    );
  }

  // The account as it actually traded, straight from imported positions -
  // real exchange P&L and fees, so unlike the documented-setup KPIs above
  // these resolve to numbers rather than "Unavailable".
  function renderAccountPerformance(section, positions, posStats) {
    var emptyEl = section.querySelector('#ins-acct-empty');
    var bodyEl = section.querySelector('#ins-acct-body');
    var countEl = section.querySelector('#ins-acct-count');
    if (!emptyEl || !bodyEl) return;

    if (!posStats) {
      emptyEl.hidden = false;
      bodyEl.hidden = true;
      if (countEl) countEl.textContent = 'No positions imported';
      return;
    }
    emptyEl.hidden = true;
    bodyEl.hidden = false;

    if (countEl) {
      var promoted = positions.filter(function (p) { return p.linkedTradeId; }).length;
      countEl.textContent = posStats.count + ' position' + (posStats.count === 1 ? '' : 's') + ' · ' + promoted + ' promoted';
    }

    var netEl = section.querySelector('#ins-acct-net');
    var netSubEl = section.querySelector('#ins-acct-net-sub');
    if (netEl) {
      netEl.textContent = formatSignedMoney(posStats.netPnl);
      netEl.className = 'font-metric-lg text-metric-lg font-bold mt-1 ' + (posStats.netPnl >= 0 ? 'text-tertiary' : 'text-error');
    }
    if (netSubEl) netSubEl.textContent = formatSignedMoney(posStats.totalPnl) + ' gross';

    // Same helper the Trade Journal validation card uses, fed real position
    // money instead of the mostly-null per-trade estimate.
    var pfEl = section.querySelector('#ins-acct-pf');
    var pfSubEl = section.querySelector('#ins-acct-pf-sub');
    var pf = computeProfitFactor(positions.map(function (p) { return { pnl: positionNet(p) }; }));
    if (pfEl) pfEl.textContent = pf === null ? 'Unavailable' : pf.toFixed(2);
    if (pfSubEl) pfSubEl.textContent = pf === null ? 'no losing positions yet' : 'net wins ÷ net losses';

    // Mirrors the Position History fee tile's fee-as-%-of-gross wording so
    // the two screens can't quote different numbers.
    var feesEl = section.querySelector('#ins-acct-fees');
    var feesSubEl = section.querySelector('#ins-acct-fees-sub');
    if (feesEl) feesEl.textContent = formatMoney(posStats.totalFees);
    if (feesSubEl) {
      feesSubEl.textContent = posStats.totalPnl !== 0
        ? (Math.abs(posStats.totalFees / posStats.totalPnl) * 100).toFixed(0) + '% of gross P&L'
        : 'paid to exchange';
    }

    var winEl = section.querySelector('#ins-acct-winrate');
    var winSubEl = section.querySelector('#ins-acct-winrate-sub');
    if (winEl) winEl.textContent = posStats.winRate.toFixed(1) + '%';
    if (winSubEl) winSubEl.textContent = posStats.wins + ' wins, ' + posStats.losses + ' losses';

    // --- Expectancy ---
    var expectEl = section.querySelector('#ins-acct-expectancy');
    var expectSubEl = section.querySelector('#ins-acct-expectancy-sub');
    var expectancy = computeExpectancy(positions);
    if (expectEl) {
      if (expectancy !== null) {
        expectEl.textContent = formatSignedMoney(expectancy);
        expectEl.className = 'font-metric-lg text-metric-lg font-bold mt-1 ' + (expectancy >= 0 ? 'text-tertiary' : 'text-error');
      } else {
        expectEl.textContent = '—';
        expectEl.className = 'font-metric-lg text-metric-lg font-bold mt-1 text-secondary';
      }
    }
    if (expectSubEl) {
      expectSubEl.textContent = expectancy !== null
        ? 'avg net per closed trade'
        : 'need wins & losses to calculate';
    }

    // --- Avg Hold Time ---
    var holdEl = section.querySelector('#ins-acct-hold');
    var holdSubEl = section.querySelector('#ins-acct-hold-sub');
    var holds = computeAvgHoldTimes(positions);
    if (holdEl) {
      var parts = [];
      if (holds.avgWinMs !== null)  parts.push('W ' + formatDurationMs(holds.avgWinMs));
      if (holds.avgLossMs !== null) parts.push('L ' + formatDurationMs(holds.avgLossMs));
      holdEl.textContent = parts.length ? parts.join(' · ') : '—';
      // Flag if average loss is held longer than average win (ride losers / cut winners)
      var holdWarning = holds.avgWinMs !== null && holds.avgLossMs !== null && holds.avgLossMs > holds.avgWinMs;
      holdEl.className = 'font-metric-md text-metric-md font-bold mt-1 ' + (holdWarning ? 'text-error' : 'text-on-surface');
    }
    if (holdSubEl) {
      var holdWarning2 = holds.avgWinMs !== null && holds.avgLossMs !== null && holds.avgLossMs > holds.avgWinMs;
      holdSubEl.textContent = holdWarning2
        ? 'losses held longer than wins ⚠'
        : (holds.avgWinMs !== null || holds.avgLossMs !== null ? 'avg duration by outcome' : 'no duration data yet');
    }

    var equityEl = section.querySelector('#ins-acct-equity');
    if (equityEl) {
      var equityItems = positions.filter(function (p) { return p.closeTime; }).map(function (p) {
        return { t: Date.parse(p.closeTime), amount: positionNet(p), label: p.pair };
      });
      equityEl.innerHTML = equityCurveHtml(equityItems, 'Import at least two closed positions to plot an equity curve.');
    }
  }

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

    renderAccountPerformance(section, positions, posStats);

    // --- Header subtitle + KPI ribbon (Logged Trades / Win Rate / Longest Streak) ---
    var distinctPairs = {};
    allTrades.forEach(function (t) { if (t.pair) distinctPairs[t.pair] = true; });
    var pairCount = Object.keys(distinctPairs).length;
    var tradeDates = allTrades.map(function (t) { return t.date; }).filter(Boolean).sort();

    var subtitleEl = section.querySelector('#ins-subtitle');
    if (subtitleEl) {
      subtitleEl.textContent = allTrades.length
        ? 'Live snapshot of ' + allTrades.length + ' trade' + (allTrades.length === 1 ? '' : 's') + ' from ' +
          formatMediumDate(tradeDates[0]) + ' to ' + formatMediumDate(tradeDates[tradeDates.length - 1]) + '.'
        : 'No trades logged yet. Add your first trade to see live stats here.';
    }

    var tradesValueEl = section.querySelector('#ins-kpi-trades-value');
    var tradesSubEl = section.querySelector('#ins-kpi-trades-sub');
    if (tradesValueEl) tradesValueEl.textContent = allTrades.length;
    if (tradesSubEl) tradesSubEl.textContent = pairCount + ' pair' + (pairCount === 1 ? '' : 's') + ' traded';

    var closedWins = closed.filter(function (t) { return t.outcome === 'win'; }).length;
    var closedLosses = closed.length - closedWins;
    var winRate = pct(closedWins, closed.length);
    var winRateValueEl = section.querySelector('#ins-kpi-winrate-value');
    var winRateSubEl = section.querySelector('#ins-kpi-winrate-sub');
    var winRateBarEl = section.querySelector('#ins-kpi-winrate-bar');
    if (winRateValueEl) winRateValueEl.textContent = closed.length ? winRate + '%' : '--';
    if (winRateSubEl) winRateSubEl.textContent = closed.length
      ? closedWins + ' win' + (closedWins === 1 ? '' : 's') + ', ' + closedLosses + ' loss' + (closedLosses === 1 ? '' : 'es')
      : 'no closed trades yet';
    if (winRateBarEl) winRateBarEl.style.width = winRate + '%';

    var longestStreak = computeLongestWinStreak(allTrades);
    var currentStreak = computeCurrentStreak(allTrades);
    var streakValueEl = section.querySelector('#ins-kpi-streak-value');
    var streakSubEl   = section.querySelector('#ins-kpi-streak-sub');
    var streakBarEl   = section.querySelector('#ins-kpi-streak-bar');
    if (streakValueEl) streakValueEl.textContent = longestStreak;
    if (streakBarEl) streakBarEl.style.width = (closed.length ? Math.min(100, Math.round((longestStreak / closed.length) * 100)) : 0) + '%';
    if (streakSubEl) {
      if (currentStreak.direction === 'none') {
        streakSubEl.textContent = 'consecutive wins';
      } else {
        var streakLabel = currentStreak.direction === 'win' ? '🔥 ' : '❄️ ';
        streakLabel += 'Now: ' + currentStreak.count + ' ' + currentStreak.direction + (currentStreak.count === 1 ? '' : 's') + ' · Best: ' + longestStreak;
        streakSubEl.textContent = streakLabel;
        streakSubEl.className = 'text-body-sm font-body-sm mt-1 ' + (currentStreak.direction === 'win' ? 'text-tertiary' : 'text-error');
      }
    }

    // --- What Stands Out - reuses the Confluence Matrix screen's own
    // narrative computation, so the two screens can never disagree. ---
    var confluenceStats = computeConfluenceStats(allTrades);
    var findingsNEl = section.querySelector('#ins-key-findings-n');
    var findingsEl = section.querySelector('#ins-key-findings');
    if (findingsNEl) findingsNEl.textContent = 'Clinical Synthesis (N=' + allTrades.length + ')';
    if (findingsEl) findingsEl.innerHTML = renderKeyFindings(confluenceStats);

    // --- Daily Context Performance ---
    var dailyGroups = computeDailyContextStats(allTrades);
    var dailyBodyEl = section.querySelector('#ins-daily-context-body');
    if (dailyBodyEl) {
      dailyBodyEl.innerHTML = dailyGroups.length
        ? dailyGroups.slice(0, 5).map(dailyContextRowHtml).join('')
        : '<tr><td class="py-3 px-3 text-secondary font-body-sm text-body-sm" colspan="3">Not enough closed trades yet.</td></tr>';
    }
    var dailyNoteEl = section.querySelector('#ins-daily-context-note');
    if (dailyNoteEl) {
      if (dailyGroups.length >= 2) {
        var byRate = dailyGroups.map(function (g) { return { label: g.label, rate: pct(g.wins, g.total) }; })
          .sort(function (a, b) { return b.rate - a.rate; });
        var bestCtx = byRate[0], worstCtx = byRate[byRate.length - 1];
        var spread = bestCtx.rate - worstCtx.rate;
        dailyNoteEl.textContent = 'Variance spread: ' + (spread >= 0 ? '+' : '') + spread + '% between ' + bestCtx.label + ' and ' + worstCtx.label;
      } else {
        dailyNoteEl.textContent = 'Not enough closed trades yet to compare contexts.';
      }
    }

    // --- Best Day To Trade ---
    var weekdayStats = computeWeekdayStats(allTrades).filter(function (d) { return d.total > 0; });
    var dayGroupMap = {};
    weekdayStats.forEach(function (d) {
      dayGroupMap[d.rate] = dayGroupMap[d.rate] || { rate: d.rate, total: 0, days: [] };
      dayGroupMap[d.rate].total += d.total;
      dayGroupMap[d.rate].days.push(d.day);
    });
    var dayGroups = Object.keys(dayGroupMap).map(function (k) { return dayGroupMap[k]; })
      .sort(function (a, b) { return b.rate - a.rate || b.total - a.total; })
      .slice(0, 3)
      .map(function (g) { return { label: g.days.join(' / '), total: g.total, rate: g.rate }; });
    var bestDayBodyEl = section.querySelector('#ins-best-day-body');
    if (bestDayBodyEl) {
      bestDayBodyEl.innerHTML = dayGroups.length
        ? dayGroups.map(bestDayRowHtml).join('')
        : '<tr><td class="py-2.5 px-3 text-secondary font-body-sm text-body-sm" colspan="3">Not enough closed trades yet.</td></tr>';
    }
    var bestDayNoteEl = section.querySelector('#ins-best-day-note');
    if (bestDayNoteEl) {
      var weekend = weekdayStats.filter(function (d) { return d.day === 'Saturday' || d.day === 'Sunday'; });
      var weekendTotal = weekend.reduce(function (sum, d) { return sum + d.total; }, 0);
      var weekendWins = weekend.reduce(function (sum, d) { return sum + d.wins; }, 0);
      bestDayNoteEl.textContent = weekendTotal
        ? 'Weekend liquidity: ' + pct(weekendWins, weekendTotal) + '% strike rate across ' + weekendTotal + ' setup' + (weekendTotal === 1 ? '' : 's')
        : 'No weekend trades logged yet.';
    }

    // --- Recurring Signal Performance ---
    var signalsSubEl = section.querySelector('#ins-signals-sub');
    if (signalsSubEl) signalsSubEl.textContent = 'Win rate by recurring technical triggers across ' + confluenceStats.totalTrades + ' logged setup' + (confluenceStats.totalTrades === 1 ? '' : 's') + '.';
    var signalsGridEl = section.querySelector('#ins-signals-grid');
    if (signalsGridEl) {
      var topSignals = confluenceStats.topParams.slice(0, 6);
      signalsGridEl.innerHTML = topSignals.length
        ? topSignals.map(signalMicroBarHtml).join('')
        : '<p class="font-body-sm text-body-sm text-secondary col-span-full">No recurring parameters yet - log a few closed trades to surface one.</p>';
    }

    // --- Reliability and Coverage ---
    var reliabilityTitleEl = section.querySelector('#ins-reliability-title');
    if (reliabilityTitleEl) {
      reliabilityTitleEl.textContent = !allTrades.length
        ? 'No Trades Logged Yet'
        : closed.length < COMPARISON_MIN_SAMPLE
          ? 'Sample Is Still Developing'
          : 'Sample Is Established';
    }
    var coverageEl = section.querySelector('#ins-reliability-coverage');
    if (coverageEl) {
      coverageEl.textContent = tradeDates.length
        ? formatMediumDate(tradeDates[0]) + ' to ' + formatMediumDate(tradeDates[tradeDates.length - 1]) + ' (' + allTrades.length + ' trade' + (allTrades.length === 1 ? '' : 's') + ')'
        : 'No trades logged yet';
    }
    var pairsEl = section.querySelector('#ins-reliability-pairs');
    if (pairsEl) {
      pairsEl.textContent = 'Distinct pairs: ' + pairCount + ' pair' + (pairCount === 1 ? '' : 's') +
        (pairCount && pairCount === allTrades.length ? ', no repeats yet' : '');
    }
    var highConflEl = section.querySelector('#ins-reliability-highconfl');
    if (highConflEl) highConflEl.textContent = confluenceStats.highConflWins + ' wins / ' + confluenceStats.highConflTotal + ' trades';
    var duplicatesEl = section.querySelector('#ins-reliability-duplicates');
    if (duplicatesEl) {
      var dupCount = allTrades.filter(function (t) { return t.matchWarning; }).length;
      duplicatesEl.textContent = dupCount ? 'Flagged duplicates: ' + dupCount + ' trade' + (dupCount === 1 ? '' : 's') : 'No flagged duplicates';
    }

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

    // The "⌘K" pill next to the icon is a real shortcut: Cmd+K (Mac) or
    // Ctrl+K (Windows / Linux) opens the search from anywhere; pressing it again
    // while the panel is open closes it. preventDefault stops the browser's own
    // Ctrl+K (focus the address bar's search).
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (panel.hidden) openPanel(); else closePanel();
      }
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
  // Guards against two pushToGitHub() calls running at once (e.g. the
  // debounced auto-push firing while a manual "Push now" click is still
  // in flight) - concurrent pushes race each other's file SHAs and one
  // side gets rejected by GitHub with no useful explanation.
  var githubPushInFlight = false;
  var githubPushQueued = false;

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

  // Pairing link: lets an already-configured device hand its GitHub sync
  // config to a new one without retyping owner/repo/branch/token there.
  // Carried in the URL *hash* (never sent to a server, unlike a query
  // string or path) so the token doesn't end up in host/CDN access logs.
  function encodeGithubPairingPayload(cfg) {
    var json = JSON.stringify({ owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, token: cfg.token });
    return utf8ToBase64(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeGithubPairingPayload(encoded) {
    var b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return JSON.parse(base64ToUtf8(b64));
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
        setups: SetupStore.getAll(),
        antiPatterns: AntiPatternStore.getAll(),
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
    if (Array.isArray(snapshot.setups)) SetupStore.setAll(snapshot.setups);
    if (Array.isArray(snapshot.antiPatterns)) AntiPatternStore.setAll(snapshot.antiPatterns);
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

  // setups and antiPatterns are only mixed in when there are some, so a
  // journal that has never saved one keeps the exact fingerprint it had
  // before they existed and isn't mistaken for having unpushed local changes
  // after an upgrade.
  function computeDataFingerprint(trades, positions, setups, antiPatterns) {
    var setupList = setups || SetupStore.getAll();
    var antiList = antiPatterns || AntiPatternStore.getAll();
    return simpleHash(
      JSON.stringify(buildRemoteTradesPayload(trades)) + JSON.stringify(positions) + JSON.stringify(buildRemoteParamsPayload()) +
      (setupList.length ? JSON.stringify(setupList) : '') +
      (antiList.length ? '\u0002' + JSON.stringify(antiList) : '')
    );
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

  // Shared by push and pull: describes a collection that's about to shrink
  // (e.g. "Trades: 42 -> 1"), or null if it wouldn't. Used to warn before
  // either sync direction silently drops data - the failure mode that once
  // wiped a real trade history in a single pull with no confirmation.
  function describeCountShrink(label, fromCount, toCount) {
    if (fromCount > 0 && toCount < fromCount) {
      return label + ': ' + fromCount + ' → ' + toCount;
    }
    return null;
  }

  function pushToGitHub() {
    var cfg = ghConfigGet();
    if (!cfg) return;

    // A push is running (or about to) right now, so any pending debounced
    // auto-push would just redo the same work a few seconds later, racing
    // this one's file writes - cancel it.
    clearTimeout(githubPushDebounceTimer);

    if (githubPushInFlight) {
      // Don't run two pushes at once - queue exactly one follow-up so
      // whatever changed after this push started still gets synced, once
      // it's safe to read fresh SHAs instead of racing the in-flight one.
      githubPushQueued = true;
      return;
    }
    githubPushInFlight = true;

    var meta = ghMetaGet();
    var previousStatus = meta.status || 'synced';
    var previousError = meta.lastError || null;

    setSyncStatus('syncing');

    var trades = TradeStore.getAll();
    var positions = PositionStore.getAll();
    var setups = SetupStore.getAll();
    var antiPatterns = AntiPatternStore.getAll();

    function finishInFlight() {
      githubPushInFlight = false;
      if (githubPushQueued) {
        githubPushQueued = false;
        pushToGitHub();
      }
    }

    function putJsonFile(path, json, shaField, message) {
      return ghPutFile(cfg, path, utf8ToBase64(json), meta[shaField], message).then(function (result) {
        if (result.ok) { meta[shaField] = result.sha; return result; }
        return ghGetFile(cfg, path).then(function (existing) {
          return ghPutFile(cfg, path, utf8ToBase64(json), existing.exists ? existing.sha : null, message);
        }).then(function (retryResult) {
          if (retryResult.ok) meta[shaField] = retryResult.sha;
          return retryResult;
        });
      }).then(function (result) {
        return { ok: result.ok, status: result.status, path: path };
      });
    }

    function doWrite() {
      return uploadChangedImages(cfg, trades).then(function () {
        var tradesJson = JSON.stringify(buildRemoteTradesPayload(trades), null, 2);
        var positionsJson = JSON.stringify(positions, null, 2);
        var paramsJson = JSON.stringify(buildRemoteParamsPayload(), null, 2);
        var writes = [
          ['data/trades.json', tradesJson, 'tradesSha', 'Sync trades'],
          ['data/positions.json', positionsJson, 'positionsSha', 'Sync positions'],
          ['data/parameters.json', paramsJson, 'paramsSha', 'Sync confluence categories']
        ];
        // Only written once a setup exists (or the repo already has the file,
        // so deleting the last one still propagates) - otherwise a journal
        // that never uses setups doesn't gain an empty data/setups.json.
        if (setups.length || meta.setupsSha) {
          writes.push(['data/setups.json', JSON.stringify(setups, null, 2), 'setupsSha', 'Sync setups']);
        }
        if (antiPatterns.length || meta.antiPatternsSha) {
          writes.push(['data/antipatterns.json', JSON.stringify(antiPatterns, null, 2), 'antiPatternsSha', 'Sync anti-patterns']);
        }
        // One at a time. Every Contents API write is its own commit on the
        // branch, and GitHub rejects a commit made while another is still
        // landing (409) - so parallel writes clash with each other, and the
        // refetch-and-retry in putJsonFile just clashes again with whatever is
        // still in flight. Each file is small, so the extra latency is minor.
        return writes.reduce(function (chain, w) {
          return chain.then(function (results) {
            return putJsonFile(w[0], w[1], w[2], w[3]).then(function (result) { return results.concat(result); });
          });
        }, Promise.resolve([]));
      }).then(function (results) {
        var failed = results.filter(function (r) { return !r.ok; });
        if (failed.length) {
          throw new Error('failed to write ' + failed.map(function (r) { return r.path + ' (status ' + r.status + ')'; }).join(', '));
        }
        ghMetaSet({
          tradesSha: meta.tradesSha,
          positionsSha: meta.positionsSha,
          paramsSha: meta.paramsSha,
          setupsSha: meta.setupsSha || null,
          antiPatternsSha: meta.antiPatternsSha || null,
          lastPushedFingerprint: computeDataFingerprint(trades, positions, setups, antiPatterns),
          lastPushAt: Date.now(),
          lastSyncAt: Date.now()
        });
        setSyncStatus('synced');
      });
    }

    // Guard against a smaller/broken local state silently overwriting a
    // bigger remote history - the exact failure mode that once wiped a real
    // trade history: a near-empty device's autosave overwrote everyone
    // else's data with nothing standing in the way. Confirms before a push
    // would shrink what's already on GitHub.
    Promise.all([
      ghGetFile(cfg, 'data/trades.json'),
      ghGetFile(cfg, 'data/positions.json')
    ]).then(function (remoteResults) {
      var remoteTradeCount = remoteResults[0].exists ? JSON.parse(remoteResults[0].text).length : 0;
      var remotePositionCount = remoteResults[1].exists ? JSON.parse(remoteResults[1].text).length : 0;
      var lines = [
        describeCountShrink('Trades', remoteTradeCount, trades.length),
        describeCountShrink('Positions', remotePositionCount, positions.length)
      ].filter(Boolean);

      if (lines.length && !window.confirm(
        'This device has FEWER trades/positions than what\'s already on GitHub:\n\n' + lines.join('\n') +
        '\n\nPushing will REPLACE the GitHub data with this smaller set - every other device that syncs afterward loses the difference too.\n\n' +
        'Click OK to push anyway.\nClick Cancel to leave GitHub untouched (pull first if you expected more data on this device).'
      )) {
        return null; // cancelled - fall through without writing
      }
      return doWrite();
    }).then(function (result) {
      if (result === null) setSyncStatus(previousStatus, previousError);
    }).catch(function (err) {
      setSyncStatus('error', err && err.message ? err.message : String(err));
    }).then(finishInFlight);
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
      ghGetFile(cfg, 'data/parameters.json'),
      ghGetFile(cfg, 'data/setups.json'),
      ghGetFile(cfg, 'data/antipatterns.json')
    ]).then(function (results) {
      var tradesFile = results[0];
      var positionsFile = results[1];
      var paramsFile = results[2];
      var setupsFile = results[3];
      var antiPatternsFile = results[4];

      if (!tradesFile.exists && !positionsFile.exists && !paramsFile.exists && !setupsFile.exists && !antiPatternsFile.exists) {
        // Brand-new empty data repo - seed it from whatever's local.
        pushToGitHub();
        return;
      }

      var remoteTrades = tradesFile.exists ? JSON.parse(tradesFile.text) : [];
      var remotePositions = positionsFile.exists ? JSON.parse(positionsFile.text) : [];
      var remoteParams = paramsFile.exists ? JSON.parse(paramsFile.text) : null;
      var remoteSetupsRaw = setupsFile.exists ? JSON.parse(setupsFile.text) : null;
      var remoteSetups = Array.isArray(remoteSetupsRaw) ? remoteSetupsRaw.filter(function (s) { return s && s.id; }).map(normalizeSetup) : null;
      var remoteAntiRaw = antiPatternsFile.exists ? JSON.parse(antiPatternsFile.text) : null;
      var remoteAntiPatterns = Array.isArray(remoteAntiRaw) ? remoteAntiRaw.filter(function (s) { return s && s.id; }).map(normalizeSetup) : null;

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
        // replacing trade history. 'seed-01'..'seed-11' ids are leftover
        // mockup rows a device may still have from before trade storage
        // stopped auto-seeding them - they don't count as real local data.
        var localTrades = TradeStore.getAll();
        var localPositions = PositionStore.getAll();
        var hasCustomLocalData = localTrades.some(function (t) { return t.id.indexOf('seed-') !== 0; }) || localPositions.length > 0;
        if (hasCustomLocalData && computeDataFingerprint(remoteTrades, remotePositions, remoteSetups || [], remoteAntiPatterns || []) !== localFingerprint) {
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
      } else {
        // Established device (already synced before): the guard above only
        // catches unpushed local edits, so without this, a remote that's
        // shrunk for any reason - another device's bad push, sync pointed at
        // the wrong repo, a stray test - gets applied here with no warning
        // at all. This is exactly what once wiped a real trade history in
        // one silent pull.
        var localTradesForShrinkCheck = TradeStore.getAll();
        var localPositionsForShrinkCheck = PositionStore.getAll();
        var shrinkLines = [
          describeCountShrink('Trades', localTradesForShrinkCheck.length, remoteTrades.length),
          describeCountShrink('Positions', localPositionsForShrinkCheck.length, remotePositions.length)
        ].filter(Boolean);

        if (shrinkLines.length && !window.confirm(
          'GitHub has FEWER trades/positions than this device:\n\n' + shrinkLines.join('\n') +
          '\n\nThis usually means another device pushed a smaller dataset, or sync is pointed at the wrong repo. Continuing will REPLACE this device\'s data with the smaller set.\n\n' +
          'Click OK to accept it anyway.\nClick Cancel to keep this device\'s data and push it to GitHub instead.'
        )) {
          pushToGitHub();
          return;
        }
      }

      return Promise.all(remoteTrades.map(function (t) { return hydrateChartRef(cfg, t).then(migrateTrade); })).then(function (hydratedTrades) {
        savePrePullSnapshot();
        githubSyncApplyingRemote = true;
        TradeStore.setAll(hydratedTrades);
        PositionStore.setAll(remotePositions);
        // A repo that predates setups has no file - keep whatever's local
        // rather than treating the absence as "delete every setup".
        if (remoteSetups) SetupStore.setAll(remoteSetups);
        if (remoteAntiPatterns) AntiPatternStore.setAll(remoteAntiPatterns);

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

        // Local setups on a repo that has no setups.json yet also need pushing.
        var needsSetupsPushBack = (!remoteSetups && SetupStore.getAll().length > 0) ||
          (!remoteAntiPatterns && AntiPatternStore.getAll().length > 0);

        if (needsParamsPushBack || needsSetupsPushBack) {
          ghMetaSet({
            tradesSha: tradesFile.exists ? tradesFile.sha : null,
            positionsSha: positionsFile.exists ? positionsFile.sha : null,
            paramsSha: paramsFile.exists ? paramsFile.sha : null,
            setupsSha: setupsFile.exists ? setupsFile.sha : null,
            antiPatternsSha: antiPatternsFile.exists ? antiPatternsFile.sha : null,
            lastSyncAt: Date.now()
          });
          pushToGitHub();
        } else {
          ghMetaSet({
            tradesSha: tradesFile.exists ? tradesFile.sha : null,
            positionsSha: positionsFile.exists ? positionsFile.sha : null,
            paramsSha: paramsFile.exists ? paramsFile.sha : null,
            setupsSha: setupsFile.exists ? setupsFile.sha : null,
            antiPatternsSha: antiPatternsFile.exists ? antiPatternsFile.sha : null,
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

  // The header pill: same palette as the Win / Loss / Open pills - green when
  // up to date, blue while syncing, red on error, neutral when not set up.
  var SYNC_PILL_CLASS = {
    unconfigured: 'bg-surface-container text-on-surface-variant',
    syncing: 'bg-primary/10 text-primary',
    synced: 'bg-tertiary-fixed/30 text-on-tertiary-fixed-variant',
    error: 'bg-error-container text-on-error-container'
  };

  function renderSyncStatusUI() {
    var dot = document.getElementById('github-sync-status-dot');
    var text = document.getElementById('github-sync-status-text');
    var pill = document.getElementById('github-sync-pill');
    var pillText = document.getElementById('github-sync-pill-text');
    var toggle = document.getElementById('github-sync-toggle');
    if (!dot || !text) return;

    var cfg = ghConfigGet();
    var meta = ghMetaGet();
    var state = cfg ? (meta.status || 'synced') : 'unconfigured';
    if (!SYNC_PILL_CLASS[state]) state = 'unconfigured';

    dot.className = 'w-1.5 h-1.5 rounded-full ' + SYNC_STATUS_DOT_CLASS[state];

    // The panel keeps the long form (incl. the error detail); the pill is short.
    var pillLabel;
    if (!cfg) {
      text.textContent = 'GitHub sync not configured';
      pillLabel = 'Sync off';
    } else if (state === 'syncing') {
      text.textContent = 'Syncing…';
      pillLabel = 'Syncing…';
    } else if (state === 'error') {
      text.textContent = 'Sync error' + (meta.lastError ? ': ' + meta.lastError : '');
      pillLabel = 'Sync error';
    } else {
      var rel = formatRelativeTime(meta.lastSyncAt);
      text.textContent = rel ? 'Synced ' + rel : 'Synced';
      pillLabel = text.textContent;
    }

    if (pill) pill.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-metric-sm text-metric-sm font-semibold whitespace-nowrap ' + SYNC_PILL_CLASS[state];
    if (pillText) pillText.textContent = pillLabel;
    if (toggle) {
      toggle.setAttribute('aria-label', 'GitHub sync settings: ' + text.textContent);
      toggle.title = text.textContent;
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
    var copyLinkBtn = document.getElementById('gh-sync-copy-link');
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

    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', function () {
        var cfg = ghConfigGet();
        if (!cfg) {
          window.alert('Save your GitHub sync settings on this device first, then a setup link can be generated from them.');
          return;
        }
        var link = window.location.origin + window.location.pathname + '#gh-sync=' + encodeGithubPairingPayload(cfg);
        var done = function () {
          window.alert('Setup link copied. Open it on the other device (paste into the address bar) - it will connect and pull automatically.\n\nIt contains your token in plain text, so share it only over a private channel.');
        };
        var fallback = function () {
          window.prompt('Copy this link and open it on the other device:', link);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link).then(done, fallback);
        } else {
          fallback();
        }
      });
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

  // ---------------------------------------------------------------------
  // Light / dark theme
  // ---------------------------------------------------------------------
  //
  // The whole palette is CSS variables (index.html); the "dark" class on <html>
  // swaps the set. The saved choice is applied before first paint by a tiny
  // inline script in <head>, so this only wires the button. Light is the default.

  var THEME_STORAGE_KEY = 'tj_theme';

  function currentTheme() {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }

  function renderThemeToggle() {
    var btn = document.getElementById('theme-toggle');
    var icon = document.getElementById('theme-toggle-icon');
    if (!btn) return;
    var dark = currentTheme() === 'dark';
    // The icon shows where a click takes you: a sun in dark mode, a moon in light.
    if (icon) icon.textContent = dark ? 'light_mode' : 'dark_mode';
    var label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    btn.title = label;
  }

  function setTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch (e) { /* choice just won't persist */ }
    renderThemeToggle();
  }

  function initThemeToggle() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    renderThemeToggle();
    btn.addEventListener('click', function () {
      setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });

    // Printing / Save as PDF is always the light theme, then the choice comes back.
    var restoreDark = false;
    window.addEventListener('beforeprint', function () {
      restoreDark = currentTheme() === 'dark';
      if (restoreDark) document.documentElement.classList.remove('dark');
    });
    window.addEventListener('afterprint', function () {
      if (restoreDark) document.documentElement.classList.add('dark');
      restoreDark = false;
    });
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

  function initMobileDrawer() {
    var sidebar = document.getElementById('app-sidebar');
    var backdrop = document.getElementById('sidebar-backdrop');
    var toggleBtn = document.getElementById('sidebar-toggle');
    if (!sidebar || !backdrop || !toggleBtn) return;

    function openDrawer() {
      sidebar.classList.remove('-translate-x-full');
      backdrop.classList.remove('hidden');
      toggleBtn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('overflow-hidden', 'md:overflow-auto');
    }

    function closeDrawer() {
      sidebar.classList.add('-translate-x-full');
      backdrop.classList.add('hidden');
      toggleBtn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('overflow-hidden', 'md:overflow-auto');
    }

    toggleBtn.addEventListener('click', function () {
      var isOpen = !sidebar.classList.contains('-translate-x-full');
      if (isOpen) closeDrawer();
      else openDrawer();
    });

    backdrop.addEventListener('click', closeDrawer);

    sidebar.querySelectorAll('a, button').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.innerWidth < 768) closeDrawer();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !sidebar.classList.contains('-translate-x-full') && window.innerWidth < 768) {
        closeDrawer();
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth >= 768 && !sidebar.classList.contains('-translate-x-full')) {
        backdrop.classList.add('hidden');
        document.body.classList.remove('overflow-hidden', 'md:overflow-auto');
      }
    });
  }

  // Consumes a `#gh-sync=...` pairing link (see encodeGithubPairingPayload),
  // if the URL was opened with one. Runs before the router reads the hash,
  // and clears the hash either way - so the token never lingers in history
  // and a leftover fragment can't be mistaken for a screen route.
  function consumeGithubPairingLink() {
    var hash = window.location.hash || '';
    if (hash.indexOf('#gh-sync=') !== 0) return;
    var encoded = hash.slice('#gh-sync='.length);
    history.replaceState(null, '', window.location.pathname + window.location.search);
    var cfg;
    try {
      cfg = decodeGithubPairingPayload(encoded);
      if (!cfg || !cfg.owner || !cfg.repo || !cfg.token) throw new Error('incomplete pairing payload');
      cfg.branch = cfg.branch || 'main';
    } catch (e) {
      window.alert('This setup link looks invalid. Open GitHub Sync settings on the source device and generate a new one.');
      return;
    }
    var existing = ghConfigGet();
    var question = existing
      ? 'Reconnect this device from "' + existing.owner + '/' + existing.repo + '" to "' + cfg.owner + '/' + cfg.repo + '" (branch: ' + cfg.branch + ')?\n\nThis pulls the latest trades/positions from there.'
      : 'Connect this device to GitHub sync repo "' + cfg.owner + '/' + cfg.repo + '" (branch: ' + cfg.branch + ')?\n\nThis pulls the latest trades/positions from there.';
    if (!window.confirm(question)) return;
    ghConfigSet(cfg);
  }

  // ---------------------------------------------------------------------
  // Wiring + boot
  // ---------------------------------------------------------------------

  consumeGithubPairingLink();
  migrateStoredParameterAliases();
  initMobileDrawer();
  initTradeJournalControls(sections['trade-journal']);
  initMexcImport(sections['trade-journal']);
  initPositionHistory(sections['position-history']);
  initNewTradeEntry();
  initDataExportImport();
  initCaseStudyActions();
  initCaseStudyListControls();
  initChartPreviewModal();
  initTimingHeatmapControls(sections['timing-and-heatmap']);
  initConfluenceMatrixControls(sections['confluence-matrix']);
  initHeaderSearch();
  initGithubSyncSettings();
  initThemeToggle();

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

  window.AppRouter = {
    navigate: function (slug, param) {
      window.location.hash = param ? (slug + '/' + param) : slug;
    }
  };

  (function boot() {
    var parsed = parseHash();
    activate(parsed.slug || DEFAULT_SCREEN, parsed.param);
  })();

  renderSyncStatusUI();
  // "Synced 2m ago" is computed at render time, so re-render to keep it current.
  setInterval(renderSyncStatusUI, 30000);
  pullFromGitHub();

  // Quick-action buttons (e.g. "New Trade" on Insights Dashboard / Trade Journal)
  // that share the same data-path convention as the sidebar nav links.
  document.querySelectorAll('button[data-path]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      window.AppRouter.navigate(btn.getAttribute('data-path'));
    });
  });
})();
