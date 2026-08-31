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
    stripCells: 60,
    gapCells: 4           // most "no data" cells drawn for a single absence
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
    { id: 'ball20',   name: 'Ball 2.0',   colors: ['#cccccc', '#aaaaaa', '#888888', '#666666'] },
    { id: 'israel',   name: 'Israel',     colors: ['#ffffff', '#0038b8', '#0038b8', '#ffffff'],
      lang: 'he', swatch: 'assets/img/israel-flag.svg' }
  ];

  var DEFAULT_LANG = 'en';

  // Same emblems, counts and sizes weao.gg uses for these two themes.
  var RAIN = {
    voxlis:  { src: 'assets/img/red-heart.svg', clickable: true },
    sirmeme: { src: 'assets/img/sirmeme.png',   clickable: false },
    // deliberately fewer and fainter than the other two — this one sits behind
    // a light palette, where the same density would read as clutter
    israel:  {
      src: 'assets/img/star-of-david.svg', clickable: false,
      count: 12, size: [16, 30], opacity: [0.10, 0.26]
    }
  };
  var RAIN_COUNT = 20;
  var RAIN_MAX = 50;

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
    rain: $('rain'),
    devPanel: $('dev-panel'),
    devBanner: $('dev-banner'),
    devBannerText: $('dev-banner-text'),
    devBannerReset: $('dev-banner-reset'),
    devHost: $('dev-host'),
    devPort: $('dev-port'),
    devApply: $('dev-apply'),
    devReset: $('dev-reset'),
    devTargetHint: $('dev-target-hint'),
    devSource: $('dev-source'),
    devInterval: $('dev-interval'),
    devPing: $('dev-ping'),
    devJson: $('dev-json'),
    devDiag: $('dev-diag'),
    devCopyJson: $('dev-copy-json'),
    devCopyDiag: $('dev-copy-diag'),
    devPurge: $('dev-purge'),
    devClearHistory: $('dev-clear-history'),
    devLock: $('dev-lock'),
    devMin: $('dev-min'),
    devClose: $('dev-close'),
    toTop: $('to-top'),
    themeBtn: $('theme-btn'),
    themeMenu: $('theme-menu'),
    statusCard: document.querySelector('.status-card')
  };

  // the default target, kept so developer mode can always get back to it
  var DEFAULT_TARGET = { host: CONFIG.host, port: CONFIG.port, refreshMs: CONFIG.refreshMs };

  function serverAddress() {
    return CONFIG.host + (CONFIG.port === 25565 ? '' : ':' + CONFIG.port);
  }
  var lastCheckedAt = null;
  var lastCheckedKey = 'status.lastChecked';
  var lastData = null;
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


  /* ------------------------------------------------------------------- i18n
     A theme may carry a language (the Israel theme ships Hebrew). Strings with
     a {placeholder} are filled by t(); plural forms take a `_one` variant.
     ---------------------------------------------------------------------- */

  var I18N = {
    en: {
      'nav.status': 'Status',
      'nav.players': 'Players',
      'nav.history': 'History',
      'nav.themes': 'Themes',

      'hero.sub': 'Live status tracker for the WeaoSMP Minecraft server',
      'hero.subAlt': 'Pings the server every minute — no refresh needed',

      'status.copyIp': 'Copy IP',
      'status.copyTitle': 'Copy server address',
      'status.contacting': 'Contacting the server…',
      'status.checking': 'Checking',
      'status.online': 'Online',
      'status.offline': 'Offline',
      'status.unreachable': 'Unreachable',
      'status.refresh': 'Refresh',
      'status.refreshTitle': 'Refresh now',
      'status.motd': 'MOTD',
      'status.capacity': 'Server capacity',
      'status.up': 'Accepting connections — data via {source}',
      'status.down': 'The server did not answer the ping — checked via {source}',
      'status.eula': ' • EULA blocked',
      'status.apiError': 'Could not reach the status API ({error}).',
      'status.neverChecked': 'Never checked',
      'status.lastChecked': 'Last checked {time}',
      'status.lastAttempt': 'Last attempt {time}',
      'status.nextCheck': 'Next check in {seconds}s',
      'status.checkingNow': 'Checking now…',
      'status.networkError': 'network error',

      'stat.players': 'Players',
      'stat.version': 'Version',
      'stat.address': 'Address',
      'stat.software': 'Software',
      'stat.slots': 'of {max} slots',
      'stat.protocol': 'Protocol {protocol}',
      'stat.unknown': 'Unknown',
      'stat.plugins_one': '{count} plugin',
      'stat.plugins': '{count} plugins',
      'stat.mods_one': '{count} mod',
      'stat.mods': '{count} mods',

      'players.title': 'Currently playing',
      'players.waiting': 'Waiting for the first ping…',
      'players.serverOffline': 'Server offline',
      'players.unknown': 'Unknown',
      'players.pill': '{online} / {max} online',
      'players.pillNoMax': '{online} online',
      'players.nobodyOffline': 'Nobody is online — the server is not responding right now.',
      'players.nobody': 'Nobody is playing right now.',
      'players.hidden_one': '{count} player online, but the server does not share the name list in its ping response.',
      'players.hidden': '{count} players online, but the server does not share the name list in its ping response.',
      'players.more': '+{count} more not listed',
      'players.apiDown': 'Player list unavailable while the status API is unreachable.',

      'history.title': 'Recent checks',
      'history.online': 'Online',
      'history.offline': 'Offline',
      'history.noData': 'No data',
      'history.note': 'Stored in your browser only — gaps are time the page was closed.',
      'history.spark': 'Player count over time',
      'history.empty': 'No data yet',
      'history.pill_one': '{percent}% up • {count} check',
      'history.pill': '{percent}% up • {count} checks',
      'history.tipUp': '{time} — online, {players} playing',
      'history.tipDown': '{time} — offline',
      'history.tipNone': 'No data',
      'history.tipGap': 'No data — page closed for {duration}',
      'history.peak': 'peak {peak} • now {now}',
      'unit.d': 'd',
      'unit.h': 'h',
      'unit.m': 'm',

      'how.title': 'How this works',
      'how.body': 'The page pings <code>weaosmp.xyz:25565</code> through the public <a href="https://mcstatus.io" target="_blank" rel="noopener noreferrer">mcstatus.io</a> API (falling back to <a href="https://mcsrvstat.us" target="_blank" rel="noopener noreferrer">mcsrvstat.us</a>) directly from your browser, then refreshes every 60 seconds.',
      'how.caveat': 'The player list depends on the server exposing its sample list in the ping response. Some servers hide it, or only return a handful of names — in that case the count is still accurate even when no heads are shown.',

      'toTop.aria': 'Scroll back to top',
      'toTop.title': 'Back to top',

      'footer.server': 'Server',
      'footer.data': 'Data',
      'footer.connect': 'Connect',
      'footer.source': 'Source',
      'footer.copy': 'Unofficial community status page for <strong>weaosmp.xyz</strong>. Not affiliated with Mojang or Microsoft.',

      'toast.copied': 'Copied {address}',
      'toast.copyFailed': 'Copy failed — the address is {address}',

      'theme.dark': 'Dark',
      'theme.light': 'Light',
      'theme.amoled': 'Amoled',
      'theme.kyoto': 'Kyoto',
      'theme.voxlis': 'voxlis.NET',
      'theme.pulsery': 'Pulsery',
      'theme.sirmeme': 'Sirmeme',
      'theme.revision': 'Revision',
      'theme.ball20': 'Ball 2.0',
      'theme.israel': 'Israel'
    },

    he: {
      'nav.status': 'סטטוס',
      'nav.players': 'שחקנים',
      'nav.history': 'היסטוריה',
      'nav.themes': 'ערכות נושא',

      'hero.sub': 'מעקב סטטוס חי אחר שרת המיינקראפט WeaoSMP',
      'hero.subAlt': 'בודק את השרת בכל דקה — אין צורך לרענן',

      'status.copyIp': 'העתקת כתובת',
      'status.copyTitle': 'העתקת כתובת השרת',
      'status.contacting': 'יוצר קשר עם השרת…',
      'status.checking': 'בודק',
      'status.online': 'מקוון',
      'status.offline': 'לא מקוון',
      'status.unreachable': 'לא נגיש',
      'status.refresh': 'רענון',
      'status.refreshTitle': 'רענון עכשיו',
      'status.motd': 'הודעת היום',
      'status.capacity': 'תפוסת השרת',
      'status.up': 'השרת מקבל חיבורים — נתונים מ־{source}',
      'status.down': 'השרת לא הגיב לבדיקה — נבדק דרך {source}',
      'status.eula': ' • חסום עקב תנאי השימוש',
      'status.apiError': 'לא ניתן להגיע לשירות הסטטוס ({error}).',
      'status.neverChecked': 'טרם נבדק',
      'status.lastChecked': 'נבדק לאחרונה ב־{time}',
      'status.lastAttempt': 'ניסיון אחרון ב־{time}',
      'status.nextCheck': 'הבדיקה הבאה בעוד {seconds} שניות',
      'status.checkingNow': 'בודק כעת…',
      'status.networkError': 'שגיאת רשת',

      'stat.players': 'שחקנים',
      'stat.version': 'גרסה',
      'stat.address': 'כתובת',
      'stat.software': 'תוכנה',
      'stat.slots': 'מתוך {max} מקומות',
      'stat.protocol': 'פרוטוקול {protocol}',
      'stat.unknown': 'לא ידוע',
      'stat.plugins_one': 'תוסף אחד',
      'stat.plugins': '{count} תוספים',
      'stat.mods_one': 'מוד אחד',
      'stat.mods': '{count} מודים',

      'players.title': 'משחקים כעת',
      'players.waiting': 'ממתין לבדיקה הראשונה…',
      'players.serverOffline': 'השרת כבוי',
      'players.unknown': 'לא ידוע',
      'players.pill': '{online} מתוך {max} מחוברים',
      'players.pillNoMax': '{online} מחוברים',
      'players.nobodyOffline': 'אף אחד לא מחובר — השרת אינו מגיב כרגע.',
      'players.nobody': 'אף אחד לא משחק כרגע.',
      'players.hidden_one': 'שחקן אחד מחובר, אך השרת אינו חושף את רשימת השמות בתגובת הבדיקה.',
      'players.hidden': '{count} שחקנים מחוברים, אך השרת אינו חושף את רשימת השמות בתגובת הבדיקה.',
      'players.more': 'ועוד {count} שאינם ברשימה',
      'players.apiDown': 'רשימת השחקנים אינה זמינה כל עוד שירות הסטטוס אינו נגיש.',

      'history.title': 'בדיקות אחרונות',
      'history.online': 'מקוון',
      'history.offline': 'לא מקוון',
      'history.noData': 'אין נתונים',
      'history.note': 'נשמר בדפדפן שלך בלבד — הרווחים מסמנים זמן שבו הדף היה סגור.',
      'history.spark': 'מספר השחקנים לאורך זמן',
      'history.empty': 'אין נתונים עדיין',
      'history.pill_one': '{percent}% זמינות • בדיקה אחת',
      'history.pill': '{percent}% זמינות • {count} בדיקות',
      'history.tipUp': '{time} — מקוון, {players} משחקים',
      'history.tipDown': '{time} — לא מקוון',
      'history.tipNone': 'אין נתונים',
      'history.tipGap': 'אין נתונים — הדף היה סגור {duration}',
      'history.peak': 'שיא {peak} • כעת {now}',
      'unit.d_one': ' יום',
      'unit.d': ' ימים',
      'unit.h_one': ' שעה',
      'unit.h': ' שע׳',
      'unit.m_one': ' דקה',
      'unit.m': ' דק׳',

      'how.title': 'איך זה עובד',
      'how.body': 'הדף בודק את <code>weaosmp.xyz:25565</code> דרך ממשק ה־API הציבורי <a href="https://mcstatus.io" target="_blank" rel="noopener noreferrer">mcstatus.io</a> (ובמידת הצורך <a href="https://mcsrvstat.us" target="_blank" rel="noopener noreferrer">mcsrvstat.us</a>) ישירות מהדפדפן שלך, ומתרענן כל 60 שניות.',
      'how.caveat': 'רשימת השחקנים תלויה בכך שהשרת חושף את רשימת הדוגמה בתגובת הבדיקה. שרתים מסוימים מסתירים אותה או מחזירים רק כמה שמות — במקרה כזה המספר עדיין מדויק גם כשלא מוצגות דמויות.',

      'toTop.aria': 'חזרה לראש הדף',
      'toTop.title': 'חזרה למעלה',

      'footer.server': 'שרת',
      'footer.data': 'נתונים',
      'footer.connect': 'קישורים',
      'footer.source': 'קוד מקור',
      'footer.copy': 'דף סטטוס קהילתי לא רשמי עבור <strong>weaosmp.xyz</strong>. אינו קשור ל־Mojang או ל־Microsoft.',

      'toast.copied': 'הכתובת {address} הועתקה',
      'toast.copyFailed': 'ההעתקה נכשלה — הכתובת היא {address}',

      'theme.dark': 'כהה',
      'theme.light': 'בהיר',
      'theme.amoled': 'AMOLED',
      'theme.kyoto': 'קיוטו',
      'theme.voxlis': 'voxlis.NET',
      'theme.pulsery': 'Pulsery',
      'theme.sirmeme': 'Sirmeme',
      'theme.revision': 'Revision',
      'theme.ball20': 'Ball 2.0',
      'theme.israel': 'ישראל'
    }
  };

  var lang = DEFAULT_LANG;

  function t(key, params) {
    var table = I18N[lang] || I18N[DEFAULT_LANG];
    var str = table[key];
    if (str === undefined) str = I18N[DEFAULT_LANG][key];
    if (str === undefined) return key;
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, function (whole, name) {
      return params[name] === undefined ? whole : params[name];
    });
  }

  // plural helper: `count === 1` picks the `<key>_one` entry when one exists
  function tn(key, count, params) {
    var p = params || {};
    p.count = count;
    return t(count === 1 && (I18N[lang] || {})[key + '_one'] !== undefined ? key + '_one' : key, p);
  }

  function applyLanguage(next) {
    lang = I18N[next] ? next : DEFAULT_LANG;
    var rtl = lang === 'he';
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    document.body.setAttribute('dir', rtl ? 'rtl' : 'ltr');

    var node, i, list;
    list = document.querySelectorAll('[data-i18n]');
    for (i = 0; i < list.length; i++) { node = list[i]; node.textContent = t(node.dataset.i18n); }

    list = document.querySelectorAll('[data-i18n-html]');
    for (i = 0; i < list.length; i++) { node = list[i]; node.innerHTML = t(node.dataset.i18nHtml); }

    list = document.querySelectorAll('[data-i18n-title]');
    for (i = 0; i < list.length; i++) { node = list[i]; node.title = t(node.dataset.i18nTitle); }

    list = document.querySelectorAll('[data-i18n-aria-label]');
    for (i = 0; i < list.length; i++) { node = list[i]; node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel)); }

    // The walk above restored every static default, including the nodes that
    // later hold live values — so repaint those from the last response.
    if (lastData) {
      renderStatus(lastData);
      renderPlayers(lastData);
    }
    renderHistory(loadHistory());
    el.lastChecked.textContent = lastCheckedAt
      ? t(lastCheckedKey, { time: formatTime(lastCheckedAt) })
      : t('status.neverChecked');
    tickCountdown();
  }

  /* ------------------------------------------------------------ theme rain */

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function rnd(min, max) { return min + Math.random() * (max - min); }

  function makeRainItem(cfg, clickX, clickY) {
    var img = document.createElement('img');
    var sizeRange = cfg.size || [20, 40];
    var opRange = cfg.opacity || [0.45, 0.95];
    var size = rnd(sizeRange[0], sizeRange[1]);
    img.className = 'rain-item' + (clickX === undefined ? '' : ' is-click');
    img.src = cfg.src;
    img.alt = '';
    img.width = img.height = Math.round(size);
    img.style.width = size + 'px';
    img.style.height = 'auto';

    var dur = rnd(6, 14);
    img.style.setProperty('--dur', dur.toFixed(2) + 's');
    img.style.setProperty('--op', rnd(opRange[0], opRange[1]).toFixed(2));
    img.style.setProperty('--drift', rnd(-70, 70).toFixed(0) + 'px');
    img.style.setProperty('--rot0', rnd(-25, 25).toFixed(0) + 'deg');
    img.style.setProperty('--rot1', rnd(-220, 220).toFixed(0) + 'deg');

    if (clickX === undefined) {
      img.style.left = rnd(0, 100).toFixed(2) + '%';
      // negative delay so the screen is already full of them on arrival
      img.style.setProperty('--delay', (-rnd(0, dur)).toFixed(2) + 's');
    } else {
      img.style.left = clickX + 'px';
      img.style.top = clickY + 'px';
      img.style.setProperty('--delay', '0s');
      img.addEventListener('animationend', function () {
        if (img.parentNode) img.parentNode.removeChild(img);
      });
    }
    return img;
  }

  function buildRain(themeId) {
    el.rain.textContent = '';
    var cfg = RAIN[themeId];
    if (!cfg || prefersReducedMotion()) return;
    var frag = document.createDocumentFragment();
    var count = cfg.count || RAIN_COUNT;
    for (var i = 0; i < count; i++) frag.appendChild(makeRainItem(cfg));
    el.rain.appendChild(frag);
  }

  function spawnRainAt(x, y) {
    var cfg = RAIN[document.documentElement.getAttribute('data-theme')];
    if (!cfg || !cfg.clickable || prefersReducedMotion()) return;
    var room = RAIN_MAX - el.rain.childElementCount;
    var n = Math.max(0, Math.min(7, room));
    for (var i = 0; i < n; i++) {
      el.rain.appendChild(makeRainItem(cfg, x + rnd(-30, 30), y + rnd(-30, 30)));
    }
  }

  /* ----------------------------------------------------------------- themes */

  function applyTheme(id) {
    var theme = THEMES.some(function (t) { return t.id === id; }) ? id : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    document.documentElement.className = theme;
    document.body.className = 'antialiased ' + theme;
    safeSet(CONFIG.themeKey, theme);

    var entry = THEMES.filter(function (x) { return x.id === theme; })[0];
    applyLanguage((entry && entry.lang) || DEFAULT_LANG);

    Array.prototype.forEach.call(el.themeMenu.children, function (btn) {
      btn.setAttribute('aria-checked', String(btn.dataset.themeId === theme));
    });
    buildRain(theme);
  }

  function buildThemeMenu() {
    THEMES.forEach(function (t) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-option';
      btn.dataset.themeId = t.id;
      btn.setAttribute('role', 'menuitemradio');
      btn.setAttribute('aria-checked', 'false');

      var sw = document.createElement('span');
      sw.className = 'theme-swatch';
      if (t.swatch) {
        sw.style.background = '#fff url("' + t.swatch + '") center / cover no-repeat';
      } else {
        // four quadrants, one per theme colour — legible at 15px where bands are not
        sw.style.background = 'conic-gradient(from 225deg, ' + t.colors.map(function (c, i) {
          return c + ' 0 ' + ((i + 1) * 25) + '%';
        }).join(', ') + ')';
      }

      var label = document.createElement('span');
      label.dataset.i18n = 'theme.' + t.id;
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

  var lastRaw = null;

  // Primary source: mcstatus.io
  function fromMcStatusIo(d) {
    lastRaw = d;
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
    lastRaw = d;
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
    var primary = function () {
      return fetchJson('https://api.mcstatus.io/v2/status/java/' + target).then(fromMcStatusIo);
    };
    var fallback = function () {
      return fetchJson('https://api.mcsrvstat.us/3/' + target).then(fromMcSrvStat);
    };
    if (dev.source === 'mcstatus') return primary();
    if (dev.source === 'mcsrvstat') return fallback();
    return primary().catch(fallback);
  }

  /* -------------------------------------------------------------- rendering */

  function setBadge(state, text) {
    el.badge.className = 'status-badge is-' + state;
    el.badgeText.textContent = text;
  }

  function formatTime(ts) {
    var d = new Date(ts);
    return d.toLocaleTimeString(lang === 'he' ? 'he-IL' : [], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatDuration(ms) {
    var mins = Math.max(1, Math.round(ms / 60000));
    var days = Math.floor(mins / 1440);
    var hours = Math.floor((mins % 1440) / 60);
    var rest = mins % 60;
    var parts = [];
    if (days) parts.push(days + tn('unit.d', days));
    if (hours) parts.push(hours + tn('unit.h', hours));
    if (rest && !days) parts.push(rest + tn('unit.m', rest));
    return parts.length ? parts.join(' ') : (1 + tn('unit.m', 1));
  }

  function headUrl(player) {
    var zeroUuid = !player.uuid || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(player.uuid);
    var key = zeroUuid ? (player.name || 'MHF_Steve') : player.uuid;
    return 'https://mc-heads.net/avatar/' + encodeURIComponent(key) + '/64';
  }

  function renderPlayers(data) {
    el.playerGrid.textContent = '';

    if (!data.online) {
      el.playersPill.textContent = t('players.serverOffline');
      el.playersEmpty.hidden = false;
      el.playersEmpty.textContent = t('players.nobodyOffline');
      return;
    }

    var count = data.playersOnline;
    el.playersPill.textContent = data.playersMax
      ? t('players.pill', { online: count === null ? '—' : count, max: data.playersMax })
      : t('players.pillNoMax', { online: count === null ? '—' : count });

    if (!data.list.length) {
      el.playersEmpty.hidden = false;
      el.playersEmpty.textContent = count
        ? tn('players.hidden', count)
        : t('players.nobody');
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
      note.textContent = t('players.more', { count: count - data.list.length });
      el.playerGrid.appendChild(note);
    }
  }

  function renderTarget() {
    el.hostLabel.textContent = serverAddress();
    el.statAddress.textContent = serverAddress();
  }

  function renderStatus(data) {
    renderTarget();
    el.statIp.textContent = data.ip ? data.ip + ':' + data.port : ' ';

    if (data.online) {
      setBadge('online', t('status.online'));
      el.statusSub.textContent = t('status.up', { source: data.source });
    } else {
      setBadge('offline', t('status.offline'));
      el.statusSub.textContent = t('status.down', { source: data.source });
    }

    if (data.eulaBlocked) {
      el.statusSub.textContent += t('status.eula');
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
    el.statPlayersMeta.textContent = data.online && max ? t('stat.slots', { max: max }) : ' ';

    el.statVersion.textContent = data.online && data.versionClean ? data.versionClean : '—';
    el.statProtocol.textContent = data.online && data.protocol !== null ? t('stat.protocol', { protocol: data.protocol }) : ' ';

    el.statSoftware.textContent = data.online ? (data.software || t('stat.unknown')) : '—';
    var extras = [];
    if (data.plugins) extras.push(tn('stat.plugins', data.plugins));
    if (data.mods) extras.push(tn('stat.mods', data.mods));
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

  // A raw check log says nothing about the stretches when the page was closed:
  // two entries eight hours apart sit side by side and read as consecutive
  // minutes. This walks the log and expands every stretch longer than a couple
  // of poll intervals into explicit "no data" cells, capped so a week away does
  // not push the real checks off the strip.
  function withGaps(hist) {
    var bucket = Math.max(CONFIG.refreshMs, 15000);
    var threshold = bucket * 2.5;
    var cells = [];
    for (var i = 0; i < hist.length; i++) {
      if (i > 0) {
        var dt = hist[i].t - hist[i - 1].t;
        if (dt > threshold) {
          var missed = Math.min(Math.round(dt / bucket) - 1, CONFIG.gapCells);
          for (var g = 0; g < missed; g++) cells.push({ gap: true, ms: dt });
        }
      }
      cells.push(hist[i]);
    }
    return cells;
  }

  function noDataCell(title) {
    var cell = document.createElement('div');
    cell.className = 'uptime-cell none';
    cell.title = title;
    return cell;
  }

  function renderHistory(hist) {
    var cells = withGaps(hist);

    // uptime strip
    el.uptimeStrip.textContent = '';
    var recent = cells.slice(-CONFIG.stripCells);
    var padding = CONFIG.stripCells - recent.length;

    for (var i = 0; i < padding; i++) {
      el.uptimeStrip.appendChild(noDataCell(t('history.tipNone')));
    }

    recent.forEach(function (entry) {
      if (entry.gap) {
        el.uptimeStrip.appendChild(
          noDataCell(t('history.tipGap', { duration: formatDuration(entry.ms) })));
        return;
      }
      var cell = document.createElement('div');
      cell.className = 'uptime-cell ' + (entry.online ? 'up' : 'down');
      cell.title = entry.online
        ? t('history.tipUp', { time: formatTime(entry.t), players: entry.players === null ? '?' : entry.players })
        : t('history.tipDown', { time: formatTime(entry.t) });
      el.uptimeStrip.appendChild(cell);
    });

    if (!hist.length) {
      el.uptimePill.textContent = t('history.empty');
    } else {
      var ups = hist.filter(function (e) { return e.online; }).length;
      el.uptimePill.textContent = tn('history.pill', hist.length, { percent: Math.round((ups / hist.length) * 100) });
    }

    renderSpark(cells);
  }

  // Splits the cell list into runs of consecutive plottable points. Anything
  // that is not an online check with a player count — a gap, an outage, a
  // response without numbers — ends the current run, so the line never spans
  // time nobody measured.
  function sparkSegments(cells) {
    var segments = [];
    var current = [];
    cells.forEach(function (cell, i) {
      if (!cell.gap && cell.online && typeof cell.players === 'number') {
        current.push({ i: i, v: cell.players });
        return;
      }
      if (current.length) { segments.push(current); current = []; }
    });
    if (current.length) segments.push(current);
    return segments;
  }

  function renderSpark(cells) {
    var window_ = cells.slice(-120);
    var segments = sparkSegments(window_);
    var values = [];
    segments.forEach(function (seg) {
      seg.forEach(function (point) { values.push(point.v); });
    });

    if (values.length < 2) {
      el.sparkWrap.hidden = true;
      return;
    }
    el.sparkWrap.hidden = false;

    var peak = Math.max.apply(null, values);
    var top = Math.max(peak, 1);
    var W = 600, H = 90;
    var span = Math.max(window_.length - 1, 1);
    var step = W / span;

    function coords(seg) {
      return seg.map(function (point) {
        return [point.i * step, H - (point.v / top) * (H - 8) - 4];
      });
    }

    var ns = 'http://www.w3.org/2000/svg';
    el.spark.textContent = '';

    var defs = document.createElementNS(ns, 'defs');
    var grad = document.createElementNS(ns, 'linearGradient');
    grad.setAttribute('id', 'sparkGrad');
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
    [['0%', '.34'], ['100%', '0']].forEach(function (stopSpec) {
      var stop = document.createElementNS(ns, 'stop');
      stop.setAttribute('offset', stopSpec[0]);
      stop.setAttribute('stop-color', 'var(--weao-green)');
      stop.setAttribute('stop-opacity', stopSpec[1]);
      grad.appendChild(stop);
    });
    defs.appendChild(grad);
    el.spark.appendChild(defs);

    segments.forEach(function (seg) {
      var pts = coords(seg);

      if (pts.length === 1) {
        var dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', pts[0][0].toFixed(1));
        dot.setAttribute('cy', pts[0][1].toFixed(1));
        dot.setAttribute('r', '2.5');
        dot.setAttribute('fill', 'var(--weao-green)');
        el.spark.appendChild(dot);
        return;
      }

      var line = pts.map(function (c, i) {
        return (i === 0 ? 'M' : 'L') + c[0].toFixed(1) + ' ' + c[1].toFixed(1);
      }).join(' ');
      var area = line + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + H +
                 ' L' + pts[0][0].toFixed(1) + ' ' + H + ' Z';

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
    });

    el.sparkPeak.textContent = t('history.peak', { peak: peak, now: values[values.length - 1] });
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


  /* ------------------------------------------------------------- dev mode
     Unlocked by typing the code anywhere on the page. Everything it changes
     lives under one storage key, so purging is a single sweep.
     ---------------------------------------------------------------------- */

  var DEV_CODE = 'developermode';
  var DEV_KEY = 'weaosmp:dev';

  var dev = { unlocked: false, host: null, port: null, refreshMs: null, source: 'auto', force: 'off' };

  function devSave() {
    safeSet(DEV_KEY, JSON.stringify({
      unlocked: dev.unlocked,
      host: dev.host,
      port: dev.port,
      refreshMs: dev.refreshMs,
      source: dev.source
    }));
  }

  function devLoad() {
    var raw = safeGet(DEV_KEY);
    if (!raw) return;
    try {
      var d = JSON.parse(raw);
      dev.unlocked = !!d.unlocked;
      dev.host = d.host || null;
      dev.port = d.port || null;
      dev.refreshMs = d.refreshMs || null;
      dev.source = d.source || 'auto';
    } catch (e) { /* corrupt entry, fall back to defaults */ }
    applyTarget();
  }

  // push the override (or the default) into CONFIG, which everything else reads
  function applyTarget() {
    CONFIG.host = dev.host || DEFAULT_TARGET.host;
    CONFIG.port = dev.port || DEFAULT_TARGET.port;
    CONFIG.refreshMs = dev.refreshMs || DEFAULT_TARGET.refreshMs;
  }

  function isOverridden() {
    return CONFIG.host !== DEFAULT_TARGET.host || CONFIG.port !== DEFAULT_TARGET.port;
  }

  function devBanner() {
    var on = isOverridden() || dev.force !== 'off';
    el.devBanner.hidden = !on;
    if (!on) return;
    var bits = [];
    if (isOverridden()) bits.push('target ' + serverAddress());
    if (dev.force !== 'off') bits.push('forced ' + dev.force);
    el.devBannerText.textContent = 'DEV — ' + bits.join(' · ');
  }

  /* --- synthetic responses so UI work is not blocked by a dead server --- */

  function forcedData(kind) {
    var base = {
      source: 'forced', online: false, host: CONFIG.host, port: CONFIG.port,
      ip: '203.0.113.10', eulaBlocked: false, playersOnline: null, playersMax: null,
      list: [], versionRaw: '', versionClean: '', protocol: null, motdRaw: '',
      icon: null, software: null, plugins: 0, mods: 0
    };
    if (kind === 'offline') return base;
    base.online = true;
    base.playersOnline = 3;
    base.playersMax = 20;
    base.versionClean = '1.21.1';
    base.versionRaw = '1.21.1';
    base.protocol = 767;
    base.software = 'Paper';
    base.plugins = 12;
    base.motdRaw = '§aWeaoSMP §7» §fforced preview\n§eall systems nominal';
    // real UUIDs, so the head renderer is genuinely exercised
    base.list = [
      { uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5', name: 'Notch', raw: 'Notch' },
      { uuid: '853c80ef-3c37-49fd-aa49-938b674adae6', name: 'jeb_', raw: '§bjeb_' },
      { uuid: '61699b2e-d327-4a01-9f1e-0ea8c3f06bc6', name: 'Dinnerbone', raw: 'Dinnerbone' }
    ];
    return base;
  }

  /* --------------------------------------------------------------- panel --- */

  function devOpen() {
    dev.unlocked = true;
    devSave();
    el.devPanel.hidden = false;
    el.devPanel.classList.remove('is-min');
    devSync();
  }

  function devLock() {
    dev.unlocked = false;
    dev.force = 'off';
    dev.host = dev.port = dev.refreshMs = null;
    dev.source = 'auto';
    retarget();
    el.devPanel.hidden = true;
  }

  // Retarget: repaint the address at once and blank the stale figures, so the
  // page never shows one server's data under another's name.
  function retarget() {
    applyTarget();
    lastRaw = null;
    lastData = null;
    renderTarget();
    el.statIp.textContent = ' ';
    setBadge('checking', t('status.checking'));
    el.statusSub.textContent = t('status.contacting');
    devSave();
    devSync();
    check();
  }

  function devSync() {
    el.devHost.value = CONFIG.host;
    el.devPort.value = String(CONFIG.port);
    el.devSource.value = dev.source;
    el.devInterval.value = String(Math.round(CONFIG.refreshMs / 1000));
    el.devTargetHint.textContent = isOverridden()
      ? 'overridden — default is ' + DEFAULT_TARGET.host + ':' + DEFAULT_TARGET.port
      : 'using the default target';
    Array.prototype.forEach.call(el.devPanel.querySelectorAll('[data-force]'), function (b) {
      b.classList.toggle('is-active', b.dataset.force === dev.force);
    });
    devBanner();
    devDiag();
    devJson();
  }

  function devJson() {
    el.devJson.textContent = lastRaw
      ? JSON.stringify(lastRaw, null, 2)
      : (dev.force !== 'off' ? '(forced state — no network response)' : '—');
  }

  function storageBytes() {
    var total = 0;
    try {
      for (var k in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, k)) {
          total += k.length + (localStorage.getItem(k) || '').length;
        }
      }
    } catch (e) { return null; }
    return total;
  }

  function diagnostics() {
    var bytes = storageBytes();
    return {
      target: serverAddress(),
      'default': DEFAULT_TARGET.host + ':' + DEFAULT_TARGET.port,
      source: dev.source,
      forced: dev.force,
      interval: Math.round(CONFIG.refreshMs / 1000) + 's',
      theme: document.documentElement.getAttribute('data-theme'),
      lang: document.documentElement.getAttribute('lang') + ' / ' + document.documentElement.getAttribute('dir'),
      history: loadHistory().length + ' entries',
      storage: bytes === null ? 'unavailable' : (bytes / 1024).toFixed(1) + ' KB',
      viewport: window.innerWidth + '×' + window.innerHeight + ' @' + (window.devicePixelRatio || 1) + 'x',
      network: navigator.onLine ? 'online' : 'offline',
      agent: navigator.userAgent
    };
  }

  function devDiag() {
    var d = diagnostics();
    el.devDiag.textContent = '';
    Object.keys(d).forEach(function (k) {
      var dt = document.createElement('dt');
      dt.textContent = k;
      var dd = document.createElement('dd');
      dd.textContent = d[k];
      el.devDiag.appendChild(dt);
      el.devDiag.appendChild(dd);
    });
  }

  function devCopy(text, label) {
    var write = navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(text)
      : Promise.reject();
    write.then(function () { toast(label + ' copied', 'ok'); },
               function () { toast('Clipboard unavailable', 'err'); });
  }

  /* -------------------------------------------------------------- purging --- */

  function purgeCache() {
    toast('Purging and reloading…', 'ok');
    try {
      Object.keys(window.localStorage)
        .filter(function (k) { return k.indexOf('weaosmp:') === 0; })
        .forEach(function (k) { window.localStorage.removeItem(k); });
    } catch (e) { /* storage blocked */ }
    try { window.sessionStorage.clear(); } catch (e) { /* ditto */ }

    var jobs = [];
    if (window.caches && window.caches.keys) {
      jobs.push(window.caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return window.caches.delete(k); }));
      }));
    }
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.unregister(); }));
      }));
    }
    // Storage is already gone; the Cache Storage and service-worker sweeps are
    // best-effort. Both can be very slow (getRegistrations has been seen taking
    // 20s+), so never let them hold up the reload the user is waiting on.
    var swept = Promise.all(jobs)['catch'](function () { /* nothing registered */ });
    var cap = new Promise(function (resolve) { setTimeout(resolve, 1500); });
    var reloaded = false;

    Promise.race([swept, cap]).then(function () {
      if (reloaded) return;
      reloaded = true;
      // a fresh URL guarantees the reload misses the HTTP cache too
      window.location.replace(window.location.pathname + '?purged=' + Date.now());
    });
  }

  // two-step: the button arms itself first, then commits
  function armed(btn, label, run) {
    var timer = null;
    btn.addEventListener('click', function () {
      if (btn.classList.contains('is-armed')) {
        clearTimeout(timer);
        btn.classList.remove('is-armed');
        btn.textContent = label;
        run();
        return;
      }
      btn.classList.add('is-armed');
      btn.textContent = 'Confirm?';
      timer = setTimeout(function () {
        btn.classList.remove('is-armed');
        btn.textContent = label;
      }, 4000);
    });
  }

  function initDev() {
    // the unlock code, ignored while typing into a field
    var buffer = '';
    document.addEventListener('keydown', function (e) {
      var node = e.target;
      var tag = (node && node.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (node && node.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!e.key || e.key.length !== 1) return;
      buffer = (buffer + e.key.toLowerCase()).slice(-DEV_CODE.length);
      if (buffer === DEV_CODE) {
        buffer = '';
        devOpen();
        toast('Developer mode unlocked', 'ok');
      }
    });

    el.devMin.addEventListener('click', function () { el.devPanel.classList.toggle('is-min'); });
    el.devClose.addEventListener('click', function () { el.devPanel.hidden = true; });
    el.devLock.addEventListener('click', devLock);

    el.devApply.addEventListener('click', function () {
      var host = el.devHost.value.trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
      var port = parseInt(el.devPort.value, 10);
      if (!host) { toast('Enter a hostname', 'err'); return; }
      if (!port || port < 1 || port > 65535) port = 25565;
      dev.host = host;
      dev.port = port;
      retarget();
    });

    el.devReset.addEventListener('click', function () {
      dev.host = dev.port = null;
      retarget();
    });

    el.devBannerReset.addEventListener('click', function () {
      dev.host = dev.port = null;
      dev.force = 'off';
      retarget();
    });

    el.devSource.addEventListener('change', function () {
      dev.source = el.devSource.value;
      devSave();
      check();
    });

    el.devInterval.addEventListener('change', function () {
      var secs = parseInt(el.devInterval.value, 10);
      if (!secs || secs < 5) secs = 5;
      if (secs > 600) secs = 600;
      dev.refreshMs = secs * 1000;
      applyTarget();
      devSave();
      devSync();
      schedule();
    });

    el.devPing.addEventListener('click', check);

    Array.prototype.forEach.call(el.devPanel.querySelectorAll('[data-force]'), function (btn) {
      btn.addEventListener('click', function () {
        dev.force = btn.dataset.force;
        if (dev.force !== 'off') lastRaw = null;
        devSync();
        check();
      });
    });

    el.devCopyJson.addEventListener('click', function () {
      devCopy(el.devJson.textContent, 'Response');
    });
    el.devCopyDiag.addEventListener('click', function () {
      var d = diagnostics();
      devCopy(Object.keys(d).map(function (k) { return k + ': ' + d[k]; }).join('\n'), 'Diagnostics');
    });

    armed(el.devClearHistory, 'Clear history', function () {
      safeSet(CONFIG.historyKey, '[]');
      renderHistory([]);
      devSync();
      toast('History cleared', 'ok');
    });
    armed(el.devPurge, 'Purge site cache', purgeCache);

    if (dev.unlocked) devOpen();
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
    if (!lastCheckedAt) setBadge('checking', t('status.checking'));

    var request = dev.force === 'off'
      ? queryStatus()
      : (dev.force === 'error'
          ? Promise.reject(new Error('forced error'))
          : Promise.resolve(forcedData(dev.force)));

    request.then(function (data) {
      renderStatus(data);
      renderPlayers(data);
      var hist = pushHistory({
        t: Date.now(),
        online: data.online,
        players: data.online && typeof data.playersOnline === 'number' ? data.playersOnline : null
      });
      renderHistory(hist);
      lastData = data;
      lastCheckedAt = Date.now();
      lastCheckedKey = 'status.lastChecked';
      el.lastChecked.textContent = t(lastCheckedKey, { time: formatTime(lastCheckedAt) });
    }).catch(function (err) {
      setBadge('error', t('status.unreachable'));
      el.icon.classList.add('is-down');
      el.statusSub.textContent = t('status.apiError', { error: err && err.message ? err.message : t('status.networkError') });
      el.playersPill.textContent = t('players.unknown');
      el.playerGrid.textContent = '';
      el.playersEmpty.hidden = false;
      el.playersEmpty.textContent = t('players.apiDown');
      lastData = null;
      lastCheckedAt = Date.now();
      lastCheckedKey = 'status.lastAttempt';
      el.lastChecked.textContent = t(lastCheckedKey, { time: formatTime(lastCheckedAt) });
    }).then(function () {
      inFlight = false;
      setLoading(false);
      nextCheckAt = Date.now() + CONFIG.refreshMs;
      schedule();
      if (!el.devPanel.hidden) devSync();
    });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(check, CONFIG.refreshMs);
  }

  function tickCountdown() {
    if (inFlight) { el.nextCheck.textContent = t('status.checkingNow'); return; }
    if (!nextCheckAt) return;
    var left = Math.max(0, Math.ceil((nextCheckAt - Date.now()) / 1000));
    el.nextCheck.textContent = t('status.nextCheck', { seconds: left });
  }

  /* ------------------------------------------------------------------- init */

  function init() {
    devLoad();
    buildThemeMenu();
    applyTheme(safeGet(CONFIG.themeKey) || 'dark');

    el.themeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (el.themeMenu.hidden) openThemeMenu(); else closeThemeMenu();
    });
    document.addEventListener('click', function (e) {
      if (!el.themeMenu.hidden && !el.themeMenu.contains(e.target)) closeThemeMenu();
      spawnRainAt(e.clientX, e.clientY);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeThemeMenu();
    });

    el.refreshBtn.addEventListener('click', check);

    el.copyBtn.addEventListener('click', function () {
      var write = navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText(serverAddress())
        : Promise.reject();
      write.then(function () {
        toast(t('toast.copied', { address: serverAddress() }), 'ok');
      }, function () {
        toast(t('toast.copyFailed', { address: serverAddress() }), 'err');
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
    initDev();
    devBanner();
    setInterval(tickCountdown, 1000);
    check();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
