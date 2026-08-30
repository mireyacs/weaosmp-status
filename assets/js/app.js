/* =============================================================================
   WeaoSMP.xyz — live Minecraft server status
   Pure client-side so it can run on GitHub Pages.
   ============================================================================= */
(function () {
  'use strict';

  var CONFIG = {
    host: 'weaosmp.xyz',
    port: 25565,
    refreshMs: 60000,
    historyKey: 'weaosmp:history:v1',
    themeKey: 'weaosmp:theme',
    historyMax: 720,      // ~12h at one ping per minute
    stripCells: 60
  };

  var THEMES = [
    { id: 'dark',     name: 'Dark',       colors: ['#000000', '#1a1a1a', '#3bea57', '#ec3b47'] },
    { id: 'light',    name: 'Light',      colors: ['#ffffff', '#f5f5f5', '#3bea57', '#ec3b47'] },
    { id: 'amoled',   name: 'Amoled',     colors: ['#000000', '#000000', '#3bea57', '#ec3b47'] },
    { id: 'kyoto',    name: 'Kyoto',      colors: ['#171821', '#1a1b26', '#8b5cf6', '#ec4899'] },
    { id: 'voxlis',   name: 'voxlis.NET', colors: ['#000000', '#000000', '#dc2626', '#ef4444'] },
    { id: 'pulsery',  name: 'Pulsery',    colors: ['#0a0a0f', '#161625', '#6366f1', '#8b5cf6'] },
    { id: 'sirmeme',  name: 'Sirmeme',    colors: ['#000000', '#1a1a1a', '#ff00d8', '#35ff03'] },
    { id: 'revision', name: 'Revision',   colors: ['#070304', '#0f0f14', '#e06c75', '#e0e0e0'] },
    { id: 'ball20',   name: 'Ball 2.0',   colors: ['#cccccc', '#aaaaaa', '#888888', '#666666'] }
  ];

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    badge: $('status-badge'),
    badgeText: $('status-badge-text'),
    statusSub: $('status-sub'),
    hostLabel: $('host-label'),
    icon: $('server-icon'),
    motdWrap: $('motd-wrap'),
    motd: $('motd'),
    statPlayers: $('stat-players'),
    statPlayersMeta: $('stat-players-meta'),
    statVersion: $('stat-version'),
    statProtocol: $('stat-protocol'),
    statAddress: $('stat-address'),
    statIp: $('stat-ip'),
    statSoftware: $('stat-software'),
    statPlugins: $('stat-plugins'),
    capacity: $('capacity'),
    capacityPct: $('capacity-pct'),
    capacityFill: $('capacity-fill'),
    lastChecked: $('last-checked'),
    nextCheck: $('next-check'),
    refreshBtn: $('refresh-btn'),
    copyBtn: $('copy-btn'),
    playerGrid: $('player-grid'),
    playersEmpty: $('players-empty'),
    playersPill: $('players-pill'),
    uptimeStrip: $('uptime-strip'),
    uptimePill: $('uptime-pill'),
    sparkWrap: $('spark-wrap'),
    spark: $('spark'),
    sparkPeak: $('spark-peak'),
    toast: $('toast'),
    toTop: $('to-top'),
    themeBtn: $('theme-btn'),
    themeMenu: $('theme-menu'),
    statusCard: document.querySelector('.status-card')
  };

  var address = CONFIG.host + (CONFIG.port === 25565 ? '' : ':' + CONFIG.port);
  var lastCheckedAt = null;
  var nextCheckAt = 0;
  var inFlight = false;
  var timer = null;

  /* ---------------------------------------------------------------- storage */

  function safeGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }

  function loadHistory() {
    var raw = safeGet(CONFIG.historyKey);
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function pushHistory(entry) {
    var hist = loadHistory();
    hist.push(entry);
    if (hist.length > CONFIG.historyMax) hist = hist.slice(hist.length - CONFIG.historyMax);
    safeSet(CONFIG.historyKey, JSON.stringify(hist));
    return hist;
  }

  /* ----------------------------------------------------------------- themes */

  function applyTheme(id) {
    var theme = THEMES.some(function (t) { return t.id === id; }) ? id : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    document.documentElement.className = theme;
    document.body.className = 'antialiased ' + theme;
    safeSet(CONFIG.themeKey, theme);
    Array.prototype.forEach.call(el.themeMenu.children, function (btn) {
      btn.setAttribute('aria-checked', String(btn.dataset.theme === theme));
    });
  }

  function buildThemeMenu() {
    THEMES.forEach(function (t) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-option';
      btn.dataset.theme = t.id;
      btn.setAttribute('role', 'menuitemradio');
      btn.setAttribute('aria-checked', 'false');

      var sw = document.createElement('span');
      sw.className = 'theme-swatch';
      // four quadrants, one per theme colour — legible at 15px where bands are not
      sw.style.background = 'conic-gradient(from 225deg, ' + t.colors.map(function (c, i) {
        return c + ' 0 ' + ((i + 1) * 25) + '%';
      }).join(', ') + ')';

      var label = document.createElement('span');
      label.textContent = t.name;

      btn.appendChild(sw);
      btn.appendChild(label);
      btn.addEventListener('click', function () {
        applyTheme(t.id);
        closeThemeMenu();
      });
      el.themeMenu.appendChild(btn);
    });
  }

  function openThemeMenu() {
    el.themeMenu.hidden = false;
    el.themeBtn.setAttribute('aria-expanded', 'true');
  }
  function closeThemeMenu() {
    el.themeMenu.hidden = true;
    el.themeBtn.setAttribute('aria-expanded', 'false');
  }

  /* ------------------------------------------------- Minecraft § formatting */

  var MC_COLORS = {
    '0': '#000000', '1': '#0000aa', '2': '#00aa00', '3': '#00aaaa',
    '4': '#aa0000', '5': '#aa00aa', '6': '#ffaa00', '7': '#aaaaaa',
    '8': '#555555', '9': '#5555ff', 'a': '#55ff55', 'b': '#55ffff',
    'c': '#ff5555', 'd': '#ff55ff', 'e': '#ffff55', 'f': '#ffffff'
  };

  // Renders a §-coded string into safe DOM nodes (never innerHTML from the API).
  function renderFormatted(target, text) {
    target.textContent = '';
    if (!text) return;

    var style = { color: null, bold: false, italic: false, underline: false, strike: false, obf: false };
    var buffer = '';

    function flush() {
      if (!buffer) return;
      var span = document.createElement('span');
      span.textContent = buffer;
      if (style.color) span.style.color = style.color;
      if (style.bold) span.style.fontWeight = '700';
      if (style.italic) span.style.fontStyle = 'italic';
      var deco = [];
      if (style.underline) deco.push('underline');
      if (style.strike) deco.push('line-through');
      if (deco.length) span.style.textDecoration = deco.join(' ');
      if (style.obf) span.className = 'minecraft-format-obfuscated';
      target.appendChild(span);
      buffer = '';
    }

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch !== '§' || i === text.length - 1) { buffer += ch; continue; }

      var code = text[++i].toLowerCase();

      // Bungee hex: §x§r§r§g§g§b§b
      if (code === 'x' && i + 12 <= text.length) {
        var hex = '';
        var ok = true;
        for (var j = 0; j < 6; j++) {
          if (text[i + 1 + j * 2] !== '§') { ok = false; break; }
          hex += text[i + 2 + j * 2];
        }
        if (ok && /^[0-9a-fA-F]{6}$/.test(hex)) {
          flush();
          style.color = '#' + hex;
          i += 12;
          continue;
        }
      }

      if (MC_COLORS[code]) {
        flush();
        style.color = MC_COLORS[code];
        style.bold = style.italic = style.underline = style.strike = style.obf = false;
      } else if (code === 'l') { flush(); style.bold = true; }
      else if (code === 'o') { flush(); style.italic = true; }
      else if (code === 'n') { flush(); style.underline = true; }
      else if (code === 'm') { flush(); style.strike = true; }
      else if (code === 'k') { flush(); style.obf = true; }
      else if (code === 'r') {
        flush();
        style = { color: null, bold: false, italic: false, underline: false, strike: false, obf: false };
      }
      // unknown codes are dropped, matching the vanilla client
    }
    flush();
  }

  function stripCodes(text) {
    return (text || '').replace(/§[0-9a-fk-orA-FK-OR]/g, '');
  }

  /* -------------------------------------------------------------- fetching  */

  function fetchJson(url, timeoutMs) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = setTimeout(function () { if (controller) controller.abort(); }, timeoutMs || 12000);
    var opts = { cache: 'no-store' };
    if (controller) opts.signal = controller.signal;

    return fetch(url, opts).then(function (res) {
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }, function (err) {
      clearTimeout(timeoutId);
      throw err;
    });
  }

  // Primary source: mcstatus.io
  function fromMcStatusIo(d) {
    var players = d.players || {};
    return {
      source: 'mcstatus.io',
      online: !!d.online,
      host: d.host || CONFIG.host,
      port: d.port || CONFIG.port,
      ip: d.ip_address || null,
      eulaBlocked: !!d.eula_blocked,
      playersOnline: typeof players.online === 'number' ? players.online : null,
      playersMax: typeof players.max === 'number' ? players.max : null,
      list: (players.list || []).map(function (p) {
        return { uuid: p.uuid || null, name: p.name_clean || stripCodes(p.name_raw) || '', raw: p.name_raw || '' };
      }),
      versionRaw: d.version ? (d.version.name_raw || d.version.name_clean || '') : '',
      versionClean: d.version ? (d.version.name_clean || stripCodes(d.version.name_raw)) : '',
      protocol: d.version && typeof d.version.protocol === 'number' ? d.version.protocol : null,
      motdRaw: d.motd ? d.motd.raw : '',
      icon: d.icon || null,
      software: d.software || null,
      plugins: (d.plugins || []).length,
      mods: (d.mods || []).length
    };
  }

  // Fallback source: mcsrvstat.us
  function fromMcSrvStat(d) {
    var players = d.players || {};
    var list = [];
    if (Array.isArray(players.list)) {
      list = players.list.map(function (p) {
        if (typeof p === 'string') return { uuid: null, name: p, raw: p };
        return { uuid: p.uuid || null, name: p.name || '', raw: p.name || '' };
      });
    }
    var motd = d.motd && Array.isArray(d.motd.raw) ? d.motd.raw.join('\n') : '';
    return {
      source: 'mcsrvstat.us',
      online: !!d.online,
      host: d.hostname || CONFIG.host,
      port: d.port || CONFIG.port,
      ip: d.ip || null,
      eulaBlocked: !!d.eula_blocked,
      playersOnline: typeof players.online === 'number' ? players.online : null,
      playersMax: typeof players.max === 'number' ? players.max : null,
      list: list,
      versionRaw: d.version || '',
      versionClean: stripCodes(d.version || ''),
      protocol: d.protocol && typeof d.protocol.version === 'number' ? d.protocol.version : null,
      motdRaw: motd,
      icon: d.icon || null,
      software: d.software || null,
      plugins: (d.plugins || []).length,
      mods: (d.mods || []).length
    };
  }

  function queryStatus() {
    var target = encodeURIComponent(CONFIG.host + ':' + CONFIG.port);
    return fetchJson('https://api.mcstatus.io/v2/status/java/' + target)
      .then(fromMcStatusIo)
      .catch(function () {
        return fetchJson('https://api.mcsrvstat.us/3/' + target).then(fromMcSrvStat);
      });
  }

  /* -------------------------------------------------------------- rendering */

  function setBadge(state, text) {
    el.badge.className = 'status-badge is-' + state;
    el.badgeText.textContent = text;
  }

  function formatTime(ts) {
    var d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function headUrl(player) {
    var zeroUuid = !player.uuid || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(player.uuid);
    var key = zeroUuid ? (player.name || 'MHF_Steve') : player.uuid;
    return 'https://mc-heads.net/avatar/' + encodeURIComponent(key) + '/64';
  }

  function renderPlayers(data) {
    el.playerGrid.textContent = '';

    if (!data.online) {
      el.playersPill.textContent = 'Server offline';
      el.playersEmpty.hidden = false;
      el.playersEmpty.textContent = 'Nobody is online — the server is not responding right now.';
      return;
    }

    var count = data.playersOnline;
    el.playersPill.textContent = (count === null ? '—' : count) + (data.playersMax ? ' / ' + data.playersMax : '') + ' online';

    if (!data.list.length) {
      el.playersEmpty.hidden = false;
      el.playersEmpty.textContent = count
        ? count + ' player' + (count === 1 ? '' : 's') + ' online, but the server does not share the name list in its ping response.'
        : 'Nobody is playing right now.';
      return;
    }

    el.playersEmpty.hidden = true;

    data.list.forEach(function (player) {
      var row = document.createElement('div');
      row.className = 'player';

      var img = document.createElement('img');
      img.className = 'player-head';
      img.width = 32;
      img.height = 32;
      img.loading = 'lazy';
      img.alt = '';
      img.src = headUrl(player);
      img.addEventListener('error', function () {
        img.src = 'https://mc-heads.net/avatar/MHF_Steve/64';
      });

      var text = document.createElement('div');
      text.className = 'player-text';
      var name = document.createElement('div');
      name.className = 'player-name';
      renderFormatted(name, player.raw || player.name);
      name.title = player.name;
      text.appendChild(name);

      if (player.uuid && !/^0{8}-/.test(player.uuid)) {
        var tag = document.createElement('div');
        tag.className = 'player-tag';
        tag.textContent = player.uuid.slice(0, 8);
        text.appendChild(tag);
      }

      row.appendChild(img);
      row.appendChild(text);
      el.playerGrid.appendChild(row);
    });

    if (count !== null && count > data.list.length) {
      var note = document.createElement('div');
      note.className = 'player';
      note.style.justifyContent = 'center';
      note.style.minWidth = '0';
      note.style.color = 'var(--foreground-subtle)';
      note.textContent = '+' + (count - data.list.length) + ' more not listed';
      el.playerGrid.appendChild(note);
    }
  }

  function renderStatus(data) {
    el.hostLabel.textContent = address;
    el.statAddress.textContent = address;
    el.statIp.textContent = data.ip ? data.ip + ':' + data.port : ' ';

    if (data.online) {
      setBadge('online', 'Online');
      el.statusSub.textContent = 'Accepting connections — data via ' + data.source;
    } else {
      setBadge('offline', 'Offline');
      el.statusSub.textContent = 'The server did not answer the ping — checked via ' + data.source;
    }

    if (data.eulaBlocked) {
      el.statusSub.textContent += ' • EULA blocked';
    }

    // The icon itself is shipped with the page; it desaturates while the server is down.
    el.icon.classList.toggle('is-down', !data.online);

    // MOTD
    if (data.online && data.motdRaw) {
      el.motdWrap.hidden = false;
      renderFormatted(el.motd, data.motdRaw);
    } else {
      el.motdWrap.hidden = true;
    }

    // stats
    var online = data.playersOnline;
    var max = data.playersMax;
    el.statPlayers.textContent = data.online && online !== null ? String(online) : '—';
    el.statPlayersMeta.textContent = data.online && max ? 'of ' + max + ' slots' : ' ';

    el.statVersion.textContent = data.online && data.versionClean ? data.versionClean : '—';
    el.statProtocol.textContent = data.online && data.protocol !== null ? 'Protocol ' + data.protocol : ' ';

    el.statSoftware.textContent = data.online ? (data.software || 'Unknown') : '—';
    var extras = [];
    if (data.plugins) extras.push(data.plugins + ' plugin' + (data.plugins === 1 ? '' : 's'));
    if (data.mods) extras.push(data.mods + ' mod' + (data.mods === 1 ? '' : 's'));
    el.statPlugins.textContent = extras.length ? extras.join(' • ') : ' ';

    // capacity
    if (data.online && max) {
      var pct = Math.max(0, Math.min(100, Math.round((online / max) * 100)));
      el.capacity.hidden = false;
      el.capacityPct.textContent = pct + '%';
      el.capacityFill.style.width = pct + '%';
    } else {
      el.capacity.hidden = true;
    }
  }

  function renderHistory(hist) {
    // uptime strip
    el.uptimeStrip.textContent = '';
    var recent = hist.slice(-CONFIG.stripCells);
    var padding = CONFIG.stripCells - recent.length;

    for (var i = 0; i < padding; i++) {
      var blank = document.createElement('div');
      blank.className = 'uptime-cell';
      blank.title = 'No data';
      el.uptimeStrip.appendChild(blank);
    }

    recent.forEach(function (entry) {
      var cell = document.createElement('div');
      cell.className = 'uptime-cell ' + (entry.online ? 'up' : 'down');
      cell.title = formatTime(entry.t) + ' — ' + (entry.online
        ? 'online, ' + (entry.players === null ? '?' : entry.players) + ' playing'
        : 'offline');
      el.uptimeStrip.appendChild(cell);
    });

    if (!hist.length) {
      el.uptimePill.textContent = 'No data yet';
    } else {
      var ups = hist.filter(function (e) { return e.online; }).length;
      el.uptimePill.textContent = Math.round((ups / hist.length) * 100) + '% up • ' + hist.length + ' check' + (hist.length === 1 ? '' : 's');
    }

    renderSpark(hist);
  }

  function renderSpark(hist) {
    var points = hist.filter(function (e) { return e.online && typeof e.players === 'number'; });
    if (points.length < 2) {
      el.sparkWrap.hidden = true;
      return;
    }
    el.sparkWrap.hidden = false;

    var series = points.slice(-120);
    var values = series.map(function (e) { return e.players; });
    var peak = Math.max.apply(null, values);
    var top = Math.max(peak, 1);
    var W = 600, H = 90;
    var step = series.length > 1 ? W / (series.length - 1) : W;

    var coords = values.map(function (v, i) {
      return [i * step, H - (v / top) * (H - 8) - 4];
    });

    var line = coords.map(function (c, i) {
      return (i === 0 ? 'M' : 'L') + c[0].toFixed(1) + ' ' + c[1].toFixed(1);
    }).join(' ');
    var area = line + ' L' + W + ' ' + H + ' L0 ' + H + ' Z';

    var ns = 'http://www.w3.org/2000/svg';
    el.spark.textContent = '';

    var defs = document.createElementNS(ns, 'defs');
    var grad = document.createElementNS(ns, 'linearGradient');
    grad.setAttribute('id', 'sparkGrad');
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
    [['0%', '.34'], ['100%', '0']].forEach(function (s) {
      var stop = document.createElementNS(ns, 'stop');
      stop.setAttribute('offset', s[0]);
      stop.setAttribute('stop-color', 'var(--weao-green)');
      stop.setAttribute('stop-opacity', s[1]);
      grad.appendChild(stop);
    });
    defs.appendChild(grad);
    el.spark.appendChild(defs);

    var areaPath = document.createElementNS(ns, 'path');
    areaPath.setAttribute('d', area);
    areaPath.setAttribute('fill', 'url(#sparkGrad)');
    el.spark.appendChild(areaPath);

    var linePath = document.createElementNS(ns, 'path');
    linePath.setAttribute('d', line);
    linePath.setAttribute('fill', 'none');
    linePath.setAttribute('stroke', 'var(--weao-green)');
    linePath.setAttribute('stroke-width', '2');
    linePath.setAttribute('stroke-linejoin', 'round');
    linePath.setAttribute('stroke-linecap', 'round');
    linePath.setAttribute('vector-effect', 'non-scaling-stroke');
    el.spark.appendChild(linePath);

    el.sparkPeak.textContent = 'peak ' + peak + ' • now ' + values[values.length - 1];
  }

  /* ------------------------------------------------------------------ toast */

  var toastTimer = null;
  function toast(message, kind) {
    el.toast.textContent = message;
    el.toast.className = 'toast show ' + (kind || '');
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.className = 'toast ' + (kind || '');
      setTimeout(function () { el.toast.hidden = true; }, 250);
    }, 2200);
  }

  /* ------------------------------------------------------------------ cycle */

  function setLoading(state) {
    el.refreshBtn.disabled = state;
    el.refreshBtn.classList.toggle('is-loading', state);
    el.statusCard.setAttribute('aria-busy', String(state));
  }

  function check() {
    if (inFlight) return;
    inFlight = true;
    setLoading(true);
    if (!lastCheckedAt) setBadge('checking', 'Checking');

    queryStatus().then(function (data) {
      renderStatus(data);
      renderPlayers(data);
      var hist = pushHistory({
        t: Date.now(),
        online: data.online,
        players: data.online && typeof data.playersOnline === 'number' ? data.playersOnline : null
      });
      renderHistory(hist);
      lastCheckedAt = Date.now();
      el.lastChecked.textContent = 'Last checked ' + formatTime(lastCheckedAt);
    }).catch(function (err) {
      setBadge('error', 'Unreachable');
      el.icon.classList.add('is-down');
      el.statusSub.textContent = 'Could not reach the status API (' + (err && err.message ? err.message : 'network error') + ').';
      el.playersPill.textContent = 'Unknown';
      el.playerGrid.textContent = '';
      el.playersEmpty.hidden = false;
      el.playersEmpty.textContent = 'Player list unavailable while the status API is unreachable.';
      lastCheckedAt = Date.now();
      el.lastChecked.textContent = 'Last attempt ' + formatTime(lastCheckedAt);
    }).then(function () {
      inFlight = false;
      setLoading(false);
      nextCheckAt = Date.now() + CONFIG.refreshMs;
      schedule();
    });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(check, CONFIG.refreshMs);
  }

  function tickCountdown() {
    if (!nextCheckAt) return;
    var left = Math.max(0, Math.ceil((nextCheckAt - Date.now()) / 1000));
    el.nextCheck.textContent = inFlight ? 'Checking now…' : 'Next check in ' + left + 's';
  }

  /* ------------------------------------------------------------------- init */

  function init() {
    buildThemeMenu();
    applyTheme(safeGet(CONFIG.themeKey) || 'dark');

    el.themeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (el.themeMenu.hidden) openThemeMenu(); else closeThemeMenu();
    });
    document.addEventListener('click', function (e) {
      if (!el.themeMenu.hidden && !el.themeMenu.contains(e.target)) closeThemeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeThemeMenu();
    });

    el.refreshBtn.addEventListener('click', check);

    el.copyBtn.addEventListener('click', function () {
      var write = navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText(address)
        : Promise.reject();
      write.then(function () {
        toast('Copied ' + address, 'ok');
      }, function () {
        toast('Copy failed — the address is ' + address, 'err');
      });
    });

    var ticking = false;
    function syncToTop() {
      var y = window.pageYOffset || document.documentElement.scrollTop;
      el.toTop.classList.toggle('show', y > 320);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(syncToTop);
    }, { passive: true });
    syncToTop();

    el.toTop.addEventListener('click', function () {
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && nextCheckAt && Date.now() > nextCheckAt) check();
    });

    renderHistory(loadHistory());
    setInterval(tickCountdown, 1000);
    check();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
