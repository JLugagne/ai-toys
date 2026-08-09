(function () {
  "use strict";

  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;
  const KEY_STORE = "celestial-streetview.apikey";
  const STATE_STORE = "celestial-streetview.state";
  const MAPS_CALLBACK = "celestialMapsReady";
  const PATH_STEP_MIN = 5;

  // HUD ink. These are canvas *content* colors drawn over photography, not site
  // chrome, so they deliberately sit outside the shared light/dark tokens.
  // readHudTokens() replaces them with the --hud-* custom properties from
  // style.css, so changing --hud-hue there recolors the canvas too. The
  // literals below are the fallback when getComputedStyle is unavailable.
  let HUD_INK = "#7de3ff";
  let HUD_DIM = "rgba(125,227,255,0.52)";
  let HUD_FAINT = "rgba(125,227,255,0.16)";
  let HUD_PANEL = "rgba(4,16,26,0.55)";
  let SUN_COLOR = "#ffc24a";
  let MOON_COLOR = "#cfe3ff";
  const HUD_HALO = "rgba(0,8,16,0.8)";
  const HUD_SHADE = "rgba(0,10,20,0.6)";
  const HUD_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  // Keeps the canvas chrome clear of the DOM header bar; must match --hud-top.
  const HUD_TOP = 46;
  const PLANET_COLORS = {
    mercury: "#c3b8a8",
    venus: "#f6e7c2",
    mars: "#e2724a",
    jupiter: "#e6c79b",
    saturn: "#ead9a6",
    uranus: "#9fe0e8",
    neptune: "#93a9ff",
  };

  const BODY_ORDER = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"];
  const BODY_LABELS = {
    sun: "Sol",
    moon: "Luna",
    mercury: "Mercury",
    venus: "Venus",
    mars: "Mars",
    jupiter: "Jupiter",
    saturn: "Saturn",
    uranus: "Uranus",
    neptune: "Neptune",
  };

  function bodyColor(key) {
    if (key === "sun") return SUN_COLOR;
    if (key === "moon") return MOON_COLOR;
    return PLANET_COLORS[key] || HUD_INK;
  }

  function enabledBodies() {
    return BODY_ORDER.filter((key) => state.bodies[key]);
  }

  function readHudTokens() {
    if (typeof getComputedStyle !== "function") return;
    const style = getComputedStyle(document.body);
    const pick = (name, fallback) => {
      const value = style.getPropertyValue(name);
      return value && value.trim() ? value.trim() : fallback;
    };
    HUD_INK = pick("--hud-ink", HUD_INK);
    HUD_DIM = pick("--hud-ink-dim", HUD_DIM);
    HUD_FAINT = pick("--hud-faint", HUD_FAINT);
    HUD_PANEL = pick("--hud-canvas-panel", HUD_PANEL);
    SUN_COLOR = pick("--hud-sun", SUN_COLOR);
    MOON_COLOR = pick("--hud-moon", MOON_COLOR);
  }

  const PRESETS = [
    { name: "Eiffel Tower", lat: 48.85837, lon: 2.294481, heading: 250, zone: "Europe/Paris" },
    { name: "Times Square", lat: 40.758, lon: -73.9855, heading: 200, zone: "America/New_York" },
    { name: "Shibuya", lat: 35.6595, lon: 139.7005, heading: 60, zone: "Asia/Tokyo" },
    { name: "Sydney Opera", lat: -33.8568, lon: 151.2153, heading: 300, zone: "Australia/Sydney" },
    { name: "Tromsø", lat: 69.6496, lon: 18.956, heading: 180, zone: "Europe/Oslo" },
  ];

  /* Country code -> IANA zone. The browser already ships a full tz database
     with every DST rule ever legislated, so the only thing missing is which
     zone a point falls in. A country code (from the geocoder) resolves that for
     all but a dozen wide countries, which are split by longitude below. */
  const ZONE_BY_COUNTRY = ("ad:Europe/Andorra,ae:Asia/Dubai,af:Asia/Kabul,al:Europe/Tirane,am:Asia/Yerevan,ao:Africa/Luanda,ar:America/Argentina/Buenos_Aires," +
    "at:Europe/Vienna,az:Asia/Baku,ba:Europe/Sarajevo,bd:Asia/Dhaka,be:Europe/Brussels,bf:Africa/Ouagadougou,bg:Europe/Sofia,bh:Asia/Bahrain,bi:Africa/Bujumbura," +
    "bj:Africa/Porto-Novo,bo:America/La_Paz,bw:Africa/Gaborone,by:Europe/Minsk,bz:America/Belize,ch:Europe/Zurich,ci:Africa/Abidjan,cm:Africa/Douala,cn:Asia/Shanghai," +
    "co:America/Bogota,cr:America/Costa_Rica,cu:America/Havana,cy:Asia/Nicosia,cz:Europe/Prague,de:Europe/Berlin,dk:Europe/Copenhagen,do:America/Santo_Domingo," +
    "dz:Africa/Algiers,ee:Europe/Tallinn,eg:Africa/Cairo,er:Africa/Asmara,et:Africa/Addis_Ababa,fi:Europe/Helsinki,fj:Pacific/Fiji,fr:Europe/Paris,fo:Atlantic/Faroe," +
    "gf:America/Cayenne,gi:Europe/Gibraltar,gp:America/Guadeloupe,li:Europe/Vaduz,mc:Europe/Monaco,mq:America/Martinique,nc:Pacific/Noumea,pf:Pacific/Tahiti," +
    "re:Indian/Reunion,sm:Europe/San_Marino,va:Europe/Vatican,yt:Indian/Mayotte,gb:Europe/London,ge:Asia/Tbilisi," +
    "gh:Africa/Accra,gr:Europe/Athens,gt:America/Guatemala,hk:Asia/Hong_Kong,hn:America/Tegucigalpa,hr:Europe/Zagreb,ht:America/Port-au-Prince,hu:Europe/Budapest," +
    "ie:Europe/Dublin,il:Asia/Jerusalem,in:Asia/Kolkata,iq:Asia/Baghdad,ir:Asia/Tehran,is:Atlantic/Reykjavik,it:Europe/Rome,jm:America/Jamaica,jo:Asia/Amman," +
    "jp:Asia/Tokyo,ke:Africa/Nairobi,kg:Asia/Bishkek,kh:Asia/Phnom_Penh,kp:Asia/Pyongyang,kr:Asia/Seoul,kw:Asia/Kuwait,la:Asia/Vientiane,lb:Asia/Beirut," +
    "lk:Asia/Colombo,lt:Europe/Vilnius,lu:Europe/Luxembourg,lv:Europe/Riga,ly:Africa/Tripoli,ma:Africa/Casablanca,md:Europe/Chisinau,me:Europe/Podgorica," +
    "mg:Indian/Antananarivo,mk:Europe/Skopje,mm:Asia/Yangon,mn:Asia/Ulaanbaatar,mt:Europe/Malta,mu:Indian/Mauritius,mw:Africa/Blantyre,my:Asia/Kuala_Lumpur," +
    "mz:Africa/Maputo,na:Africa/Windhoek,ne:Africa/Niamey,ng:Africa/Lagos,ni:America/Managua,nl:Europe/Amsterdam,no:Europe/Oslo,np:Asia/Kathmandu,nz:Pacific/Auckland," +
    "om:Asia/Muscat,pa:America/Panama,pe:America/Lima,ph:Asia/Manila,pk:Asia/Karachi,pl:Europe/Warsaw,pr:America/Puerto_Rico,py:America/Asuncion,qa:Asia/Qatar," +
    "ro:Europe/Bucharest,rs:Europe/Belgrade,rw:Africa/Kigali,sa:Asia/Riyadh,sd:Africa/Khartoum,se:Europe/Stockholm,sg:Asia/Singapore,si:Europe/Ljubljana," +
    "sk:Europe/Bratislava,sn:Africa/Dakar,so:Africa/Mogadishu,sr:America/Paramaribo,sv:America/El_Salvador,sy:Asia/Damascus,td:Africa/Ndjamena,tg:Africa/Lome," +
    "th:Asia/Bangkok,tj:Asia/Dushanbe,tm:Asia/Ashgabat,tn:Africa/Tunis,tr:Europe/Istanbul,tt:America/Port_of_Spain,tw:Asia/Taipei,tz:Africa/Dar_es_Salaam," +
    "ua:Europe/Kyiv,ug:Africa/Kampala,uy:America/Montevideo,uz:Asia/Tashkent,ve:America/Caracas,vn:Asia/Ho_Chi_Minh,ye:Asia/Aden,za:Africa/Johannesburg," +
    "zm:Africa/Lusaka,zw:Africa/Harare").split(",").reduce((map, pair) => {
    const [code, zone] = pair.split(":");
    map[code] = zone;
    return map;
  }, {});

  // Wide countries, split west to east: the first entry whose bound the
  // longitude falls under wins.
  const ZONE_BY_LONGITUDE = {
    us: [[-150, "Pacific/Honolulu"], [-130, "America/Anchorage"], [-114, "America/Los_Angeles"], [-102, "America/Denver"], [-87, "America/Chicago"], [999, "America/New_York"]],
    ca: [[-130, "America/Vancouver"], [-110, "America/Edmonton"], [-90, "America/Winnipeg"], [-68, "America/Toronto"], [999, "America/Halifax"]],
    ru: [[30, "Europe/Moscow"], [50, "Europe/Samara"], [70, "Asia/Yekaterinburg"], [85, "Asia/Omsk"], [100, "Asia/Krasnoyarsk"], [115, "Asia/Irkutsk"], [130, "Asia/Yakutsk"], [145, "Asia/Vladivostok"], [999, "Asia/Kamchatka"]],
    au: [[129, "Australia/Perth"], [141, "Australia/Adelaide"], [999, "Australia/Sydney"]],
    br: [[-60, "America/Manaus"], [999, "America/Sao_Paulo"]],
    mx: [[-110, "America/Tijuana"], [-102, "America/Chihuahua"], [999, "America/Mexico_City"]],
    id: [[112, "Asia/Jakarta"], [128, "Asia/Makassar"], [999, "Asia/Jayapura"]],
    kz: [[64, "Asia/Aqtobe"], [999, "Asia/Almaty"]],
    cd: [[22, "Africa/Kinshasa"], [999, "Africa/Lubumbashi"]],
    cl: [[-80, "Pacific/Easter"], [999, "America/Santiago"]],
    es: [[-12, "Atlantic/Canary"], [999, "Europe/Madrid"]],
    pt: [[-20, "Atlantic/Azores"], [999, "Europe/Lisbon"]],
    ec: [[-85, "Pacific/Galapagos"], [999, "America/Guayaquil"]],
    gl: [[-40, "America/Nuuk"], [999, "America/Scoresbysund"]],
  };

  function zoneFor(countryCode, lon) {
    const code = String(countryCode || "").toLowerCase();
    const split = ZONE_BY_LONGITUDE[code];
    if (split) {
      for (const [bound, zone] of split) {
        if (lon < bound) return zone;
      }
    }
    return ZONE_BY_COUNTRY[code] || null;
  }

  /* The browser's own tz database resolves DST exactly, for any date, without a
     network call — we only ever needed the zone name. */
  function offsetForZone(zone, utcMs) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(new Date(utcMs));
      const name = parts.find((p) => p.type === "timeZoneName");
      const m = name && /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name.value);
      if (!m) return null;
      return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
    } catch (err) {
      return null;
    }
  }

  const state = {
    lat: 48.85837,
    lon: 2.294481,
    tz: -new Date().getTimezoneOffset(),
    utcMs: Date.now(),
    heading: 250,
    pitch: 8,
    fov: 90,
    showPaths: true,
    showCompass: true,
    showLabels: true,
    visor: 0.25,
    fovTrim: 1,
    fovBasis: "width",
    autoTz: true,
    zone: null,
    mapZoom: 17,
    bodies: { sun: true, moon: true },
    showSensorRaw: false,
    arFov: 65,
    headingOffset: 0,
    locationPinned: false,
  };

  const el = {
    lat: document.getElementById("lat"),
    lon: document.getElementById("lon"),
    date: document.getElementById("date"),
    time: document.getElementById("time"),
    tz: document.getElementById("tz"),
    slider: document.getElementById("time-slider"),
    presets: document.getElementById("presets"),
    geolocate: document.getElementById("geolocate-btn"),
    prevDay: document.getElementById("prev-day"),
    nextDay: document.getElementById("next-day"),
    now: document.getElementById("now-btn"),
    showPaths: document.getElementById("show-paths"),
    showCompass: document.getElementById("show-compass"),
    showLabels: document.getElementById("show-labels"),
    keyBtn: document.getElementById("key-btn"),
    status: document.getElementById("status-msg"),
    spec: document.getElementById("spec-line"),
    wrap: document.getElementById("view-wrap"),
    pano: document.getElementById("pano"),
    canvas: document.getElementById("overlay"),
    note: document.getElementById("view-note"),
    sunPosition: document.getElementById("sun-position"),
    sunTimes: document.getElementById("sun-times"),
    moonPosition: document.getElementById("moon-position"),
    moonPhase: document.getElementById("moon-phase"),
    moonTimes: document.getElementById("moon-times"),
    dialog: document.getElementById("key-dialog"),
    keyInput: document.getElementById("key-input"),
    keySave: document.getElementById("key-save"),
    keyRemove: document.getElementById("key-remove"),
    keyStatus: document.getElementById("key-status"),
    searchInput: document.getElementById("search-input"),
    searchBtn: document.getElementById("search-btn"),
    searchResults: document.getElementById("search-results"),
    searchStatus: document.getElementById("search-status"),
    panelsToggle: document.getElementById("panels-toggle"),
    modeRow: document.getElementById("mode-row"),
    bodyList: document.getElementById("body-list"),
    panelTabs: document.getElementById("panel-tabs"),
    cam: document.getElementById("cam"),
    useSensors: document.getElementById("use-sensors"),
    sensorStatus: document.getElementById("sensor-status"),
    sensorRaw: document.getElementById("sensor-raw"),
    showSensorRaw: document.getElementById("show-sensor-raw"),
    alignBlock: document.getElementById("align-block"),
    alignStart: document.getElementById("align-start"),
    alignConfirm: document.getElementById("align-confirm"),
    alignReset: document.getElementById("align-reset"),
    alignPicker: document.getElementById("align-picker"),
    alignStatus: document.getElementById("align-status"),
    visorRow: document.getElementById("visor-row"),
    autoTz: document.getElementById("auto-tz"),
    tzStatus: document.getElementById("tz-status"),
    basisRow: document.getElementById("basis-row"),
    trim: document.getElementById("fov-trim"),
    trimValue: document.getElementById("trim-value"),
  };

  const ctx = el.canvas.getContext("2d");

  let mode = "sky";
  let panorama = null;
  let mapsPromise = null;
  let rafId = 0;
  let suppressPanoMove = false;
  let paths = null;
  let events = null;
  let current = null;

  /* ---------- time helpers ---------- */

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function localDate() {
    return new Date(state.utcMs + state.tz * 60000);
  }

  function setLocal(y, m, d, hh, mm) {
    state.utcMs = Date.UTC(y, m, d, hh, mm) - state.tz * 60000;
  }

  function dayStartMs() {
    const l = localDate();
    return Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) - state.tz * 60000;
  }

  function minutesOfDay() {
    return Math.round((state.utcMs - dayStartMs()) / 60000);
  }

  function fmtTime(ms) {
    if (ms === null || ms === undefined) return "—";
    const l = new Date(ms + state.tz * 60000);
    return pad(l.getUTCHours()) + ":" + pad(l.getUTCMinutes());
  }

  function fmtOffset(min) {
    const sign = min < 0 ? "-" : "+";
    const a = Math.abs(min);
    return "UTC" + sign + pad(Math.floor(a / 60)) + ":" + pad(a % 60);
  }

  /* ---------- geometry ---------- */

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function vecOf(az, alt) {
    const a = az * RAD;
    const e = alt * RAD;
    return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function makeCamera(w, h) {
    // A phone camera reports no field of view either, so AR starts from a
    // typical rear-camera value and leans on the same trim control.
    const fov = clamp(mode === "ar" ? state.arFov : state.fov, 5, 175);
    // Street View exposes a zoom level, not a field of view; fov = 180/2^zoom is
    // the community-derived relation, and it is the one number in this pipeline
    // that no reference confirms. A wrong focal length is invisible at the view
    // centre and grows towards the edges, so it reads as bodies sliding off the
    // scenery when you pan. The trim lets you settle it by eye; it applies only
    // over real imagery, since the sky view sets its own field of view exactly.
    // Google reports a zoom level but never the field of view it renders, and
    // there is no metadata for it: StreetViewTileData carries centerHeading,
    // worldSize and tile URLs, none of which describe the viewport camera. So
    // the basis (which screen dimension 180/2^zoom refers to) is a choice, not
    // a fact. Pick the one that holds still when you pan; the trim then takes
    // out any residual. Both apply over imagery only — the sky view sets its
    // own field of view exactly and needs no correction.
    const trim = mode === "street" || mode === "ar" ? clamp(state.fovTrim, 0.5, 2) : 1;
    const basis = mode === "street" || mode === "ar" ? state.fovBasis : "width";
    const ref = basis === "height" ? h : basis === "diagonal" ? Math.hypot(w, h) : w;
    let f = (trim * ref) / 2 / Math.tan((fov / 2) * RAD);

    // The camera feed is laid out with object-fit: cover, which scales the
    // stream until it covers the viewport and throws the overflow away. The
    // field of view actually on screen is therefore NOT the camera's own, and
    // treating the canvas width as if it spanned arFov puts the focal length
    // out by the crop factor — four-fold for a landscape stream in a portrait
    // viewport. Derive it from the stream's real pixels instead.
    if (mode === "ar" && el.cam && el.cam.videoWidth > 0 && el.cam.videoHeight > 0) {
      const cover = Math.max(w / el.cam.videoWidth, h / el.cam.videoHeight);
      f = trim * ((el.cam.videoWidth / 2) / Math.tan((fov / 2) * RAD)) * cover;
    }
    const hd = state.heading * RAD;
    const p = state.pitch * RAD;
    return {
      f,
      cx: w / 2,
      cy: h / 2,
      fwd: [Math.sin(hd) * Math.cos(p), Math.cos(hd) * Math.cos(p), Math.sin(p)],
      right: [Math.cos(hd), -Math.sin(hd), 0],
      up: [-Math.sin(hd) * Math.sin(p), -Math.cos(hd) * Math.sin(p), Math.cos(p)],
    };
  }

  function project(cam, v) {
    const z = dot(v, cam.fwd);
    if (z <= 1e-3) return null;
    return {
      x: cam.cx + (cam.f * dot(v, cam.right)) / z,
      y: cam.cy - (cam.f * dot(v, cam.up)) / z,
    };
  }

  // Screen angle of the direction from `v` towards `target` on the sky sphere.
  function tangentAngle(cam, v, target, at) {
    const d = dot(target, v);
    const t = [target[0] - d * v[0], target[1] - d * v[1], target[2] - d * v[2]];
    const n = Math.hypot(t[0], t[1], t[2]);
    if (n < 1e-9) return 0;
    const step = 0.02 / n;
    const nudged = [v[0] + t[0] * step, v[1] + t[1] * step, v[2] + t[2] * step];
    const p = project(cam, nudged);
    if (!p) return 0;
    return Math.atan2(p.y - at.y, p.x - at.x);
  }

  function compassName(az) {
    const names = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return names[Math.round(Astro.norm360(az) / 22.5) % 16];
  }

  /* ---------- astronomy state ---------- */

  // Only what is switched on gets sampled: a full day of tracks for nine bodies
  // is nine times the work, and most of it would never be drawn.
  function tracked() {
    const list = enabledBodies();
    // The Sun is always computed even when hidden — the Moon's terminator and
    // every phase angle are measured from it.
    if (!list.includes("sun")) list.push("sun");
    return list;
  }

  function recomputeDay() {
    const start = dayStartMs();
    const bodies = tracked();
    const samples = {};
    for (const body of bodies) samples[body] = [];
    for (let m = 0; m <= 1440; m += PATH_STEP_MIN) {
      const ms = start + m * 60000;
      const at = new Date(ms);
      for (const body of bodies) {
        const p = Astro.positionOf(body, at, state.lat, state.lon);
        samples[body].push({ ms, minute: m, az: p.az, alt: p.apparentAlt, up: p.up });
      }
    }
    paths = samples;
    events = {};
    for (const body of bodies) {
      events[body] = Astro.riseSet(body, start, 86400000, state.lat, state.lon);
    }
  }

  function recomputeNow() {
    const at = new Date(state.utcMs);
    current = {};
    for (const body of tracked()) {
      current[body] = Astro.positionOf(body, at, state.lat, state.lon);
    }
    if (!current.moon) current.moon = Astro.moon(at, state.lat, state.lon);
  }

  /* ---------- canvas ---------- */

  let canvasSize = { w: 0, h: 0, dpr: 0 };

  function sizeCanvas() {
    const rect = el.wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w !== canvasSize.w || h !== canvasSize.h || dpr !== canvasSize.dpr) {
      el.canvas.width = Math.round(w * dpr);
      el.canvas.height = Math.round(h * dpr);
      el.canvas.style.width = w + "px";
      el.canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      canvasSize = { w, h, dpr };
    }
    return { w, h };
  }

  function mix(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  }

  function rgb(c) {
    return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
  }

  const SKY_DAY = { top: [26, 68, 132], bottom: [116, 164, 212], ground: [46, 54, 52] };
  const SKY_DUSK = { top: [20, 30, 62], bottom: [178, 98, 58], ground: [28, 28, 32] };
  const SKY_NIGHT = { top: [2, 5, 10], bottom: [8, 18, 34], ground: [6, 9, 13] };

  function skyPalette(sunAlt) {
    if (sunAlt >= 6) return SKY_DAY;
    if (sunAlt >= 0) {
      const t = sunAlt / 6;
      return {
        top: mix(SKY_DUSK.top, SKY_DAY.top, t),
        bottom: mix(SKY_DUSK.bottom, SKY_DAY.bottom, t),
        ground: mix(SKY_DUSK.ground, SKY_DAY.ground, t),
      };
    }
    const t = clamp((sunAlt + 12) / 12, 0, 1);
    return {
      top: mix(SKY_NIGHT.top, SKY_DUSK.top, t),
      bottom: mix(SKY_NIGHT.bottom, SKY_DUSK.bottom, t),
      ground: mix(SKY_NIGHT.ground, SKY_DUSK.ground, t),
    };
  }

  function drawSky(cam, w, h) {
    const pal = skyPalette(current.sun.alt);
    const horizonY = cam.cy + cam.f * Math.tan(state.pitch * RAD);
    const skyBottom = clamp(horizonY, 0, h);
    const grad = ctx.createLinearGradient(0, -h * 0.5, 0, skyBottom);
    grad.addColorStop(0, rgb(pal.top));
    grad.addColorStop(1, rgb(pal.bottom));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, skyBottom);
    ctx.fillStyle = rgb(pal.ground);
    ctx.fillRect(0, skyBottom, w, h - skyBottom);

    if (skyBottom > 0 && skyBottom < h) {
      const glow = ctx.createLinearGradient(0, skyBottom - 90, 0, skyBottom);
      glow.addColorStop(0, "rgba(125,227,255,0)");
      glow.addColorStop(1, "rgba(125,227,255,0.1)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, Math.max(0, skyBottom - 90), w, Math.min(90, skyBottom));
    }
  }

  /* --- 2D map -----------------------------------------------------------
     A slippy map drawn straight onto the same canvas: Web Mercator tiles from
     OpenStreetMap, no key and no library, so picking a spot works before you
     ever supply a Street View key. The pin is fixed at the centre and the world
     slides under it, which makes "put the site exactly here" one gesture.
     OSM's tile policy asks for attribution and light use; both are honoured —
     tiles are cached and only fetched for the visible viewport. */

  const TILE = 256;
  const OSM_TILES = "https://tile.openstreetmap.org/";
  const tileCache = new Map();

  function lonToWorldX(lon, z) {
    return ((lon + 180) / 360) * Math.pow(2, z);
  }

  function latToWorldY(lat, z) {
    const s = Math.sin(clamp(lat, -85.05, 85.05) * RAD);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * Math.pow(2, z);
  }

  function worldXToLon(x, z) {
    return (x / Math.pow(2, z)) * 360 - 180;
  }

  function worldYToLat(y, z) {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return DEG * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  function getTile(z, x, y) {
    const key = z + "/" + x + "/" + y;
    const cached = tileCache.get(key);
    if (cached) return cached;
    if (tileCache.size > 400) {
      for (const stale of Array.from(tileCache.keys()).slice(0, 150)) tileCache.delete(stale);
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.addEventListener("load", () => {
      if (mode === "map") draw();
    });
    img.addEventListener("error", () => tileCache.delete(key));
    img.src = OSM_TILES + z + "/" + x + "/" + y + ".png";
    tileCache.set(key, img);
    return img;
  }

  // mapZoom is continuous so a pinch can scale smoothly; tiles are fetched at
  // the nearest integer level and drawn at the fractional scale between.
  function mapGeometry(w, h) {
    const z = clamp(state.mapZoom, 2, 19);
    const zi = Math.round(z);
    const scale = Math.pow(2, z - zi);
    const size = TILE * scale;
    return {
      zi,
      size,
      span: Math.pow(2, zi),
      left: lonToWorldX(state.lon, zi) * size - w / 2,
      top: latToWorldY(state.lat, zi) * size - h / 2,
    };
  }

  function drawMap(w, h) {
    const g = mapGeometry(w, h);

    ctx.fillStyle = "#0a1520";
    ctx.fillRect(0, 0, w, h);

    const x0 = Math.floor(g.left / g.size);
    const y0 = Math.floor(g.top / g.size);
    const x1 = Math.floor((g.left + w) / g.size);
    const y1 = Math.floor((g.top + h) / g.size);
    for (let ty = y0; ty <= y1; ty++) {
      if (ty < 0 || ty >= g.span) continue;
      for (let tx = x0; tx <= x1; tx++) {
        const wrapped = ((tx % g.span) + g.span) % g.span;
        const img = getTile(g.zi, wrapped, ty);
        if (!img.complete || !img.naturalWidth) continue;
        // Round up by a pixel so neighbouring tiles never show a seam.
        ctx.drawImage(img, tx * g.size - g.left, ty * g.size - g.top, g.size + 1, g.size + 1);
      }
    }

    drawMapOverlay(w, h);
  }

  function drawMapOverlay(w, h) {
    const cx = w / 2;
    const cy = h / 2;

    // Which way the panorama is facing, and where the bodies are, as bearings
    // from the pin — the map's honest analogue of the horizon view.
    const rayLen = Math.min(w, h) * 0.42;
    const bearingRay = (az, color, dash) => {
      const a = (az - 90) * RAD;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * rayLen, cy + Math.sin(a) * rayLen);
      inkStroke(color, 2, dash);
    };

    ctx.save();
    const cone = 22;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rayLen * 0.8, (state.heading - 90 - cone / 2) * RAD, (state.heading - 90 + cone / 2) * RAD);
    ctx.closePath();
    ctx.fillStyle = "oklch(0.87 0.13 205 / 0.16)";
    ctx.fill();
    ctx.restore();

    for (const key of enabledBodies()) {
      const pos = current[key];
      if (pos && pos.up) bearingRay(pos.az, bodyColor(key), key === "sun" ? [9, 4] : [3, 5]);
    }

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos((state.heading - 90) * RAD) * rayLen * 0.8, cy + Math.sin((state.heading - 90) * RAD) * rayLen * 0.8);
    inkStroke(HUD_INK, 1.5);

    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    inkStroke(HUD_INK, 2);
    inkRect(cx, cy, 3, HUD_INK);

    hudFont(10, 700);
    for (const key of enabledBodies()) {
      const pos = current[key];
      if (!pos || !pos.up) continue;
      const a = (pos.az - 90) * RAD;
      hudLabel(
        (BODY_LABELS[key] || key).toUpperCase() + " " + pos.az.toFixed(0) + "°",
        clamp(cx + Math.cos(a) * (rayLen + 22), 60, w - 60),
        clamp(cy + Math.sin(a) * (rayLen + 22), 40, h - 30),
        bodyColor(key),
        "center"
      );
    }

    // Put the number on the ray: the spec line is hidden on a narrow screen,
    // so this is the only place the heading can be checked against reality.
    const ha = (state.heading - 90) * RAD;
    hudFont(10, 700);
    hudLabel(
      "VIEW " + Math.round(Astro.norm360(state.heading)) + "° " + compassName(state.heading) +
        (Math.abs(state.headingOffset) > 0.5 ? "  (TRIM " + (state.headingOffset >= 0 ? "+" : "") + Math.round(state.headingOffset) + "°)" : ""),
      clamp(cx + Math.cos(ha) * (rayLen * 0.8 + 20), 70, w - 70),
      clamp(cy + Math.sin(ha) * (rayLen * 0.8 + 20), 40, h - 30),
      HUD_INK,
      "center"
    );

    hudFont(9, 600);
    for (const [az, tag] of [[0, "N"], [90, "E"], [180, "S"], [270, "W"]]) {
      const a = (az - 90) * RAD;
      hudLabel(tag, cx + Math.cos(a) * (rayLen + 34), cy + Math.sin(a) * (rayLen + 34), HUD_DIM, "center");
    }
    hudLabel("Z" + Math.round(state.mapZoom) + " · DRAG TO MOVE THE SITE · CLICK TO JUMP", cx, 26, HUD_DIM, "center");
    hudFont(9, 500);
    hudLabel("© OpenStreetMap contributors", w - 12, h - 12, HUD_DIM, "right");
    drawFrame(w, h);
  }

  function mapPointToLatLon(px, py, w, h) {
    const g = mapGeometry(w, h);
    return {
      lat: worldYToLat((g.top + py) / g.size, g.zi),
      lon: worldXToLon((g.left + px) / g.size, g.zi),
    };
  }

  function drawVignette(w, h) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,6,12,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function hudFont(size, weight) {
    ctx.font = (weight || 500) + " " + size + "px " + HUD_MONO;
  }

  /* Strokes the current path twice: a wider dark backing, then the ink. Without
     it, cyan line work disappears into a bright sky or pale masonry — and
     dimming the photograph enough to fix that would defeat the point. */
  function inkStroke(color, width, dash) {
    if (dash) ctx.setLineDash(dash);
    ctx.lineWidth = width + 2.5;
    ctx.strokeStyle = HUD_SHADE;
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }

  function inkRect(x, y, size, color) {
    ctx.fillStyle = HUD_SHADE;
    ctx.fillRect(x - size / 2 - 1.5, y - size / 2 - 1.5, size + 3, size + 3);
    ctx.fillStyle = color;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }

  function hudLabel(text, x, y, color, align, baseline) {
    ctx.textAlign = align || "center";
    ctx.textBaseline = baseline || "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = HUD_HALO;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // Lines of constant azimuth and altitude below the horizon: a radar-style
  // ground plane for the imageless sky view.
  function drawGroundGrid(cam, w, h) {
    ctx.save();
    ctx.strokeStyle = HUD_FAINT;
    ctx.lineWidth = 1;
    for (let az = 0; az < 360; az += 15) {
      ctx.beginPath();
      let pen = false;
      for (let alt = -1; alt >= -85; alt -= 4) {
        const p = project(cam, vecOf(az, alt));
        if (!p) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
        pen = true;
      }
      ctx.stroke();
    }
    for (const alt of [-5, -12, -25, -45]) {
      ctx.beginPath();
      let pen = false;
      for (let d = -90; d <= 90; d += 3) {
        const p = project(cam, vecOf(state.heading + d, alt));
        if (!p) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
        pen = true;
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Rungs of constant altitude. They are small circles, not great circles, so
  // they genuinely curve — sampling in azimuth keeps them honest.
  function drawPitchLadder(cam, w, h) {
    const halfFov = clamp(state.fov * 0.62, 10, 88);
    ctx.save();
    hudFont(10, 600);
    for (let alt = -80; alt <= 80; alt += 10) {
      if (alt === 0 || Math.abs(alt - state.pitch) > halfFov + 20) continue;
      const pts = [];
      for (let d = -halfFov; d <= halfFov + 0.01; d += 2.5) {
        if (Math.abs(d) < 5) {
          pts.push(null);
          continue;
        }
        const p = project(cam, vecOf(state.heading + d, alt));
        pts.push(p && p.y > -80 && p.y < h + 80 ? p : null);
      }
      ctx.beginPath();
      let pen = false;
      let first = null;
      let last = null;
      for (const p of pts) {
        if (!p) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
        pen = true;
        if (!first) first = p;
        last = p;
      }
      inkStroke(alt > 0 ? HUD_DIM : HUD_FAINT, 1.25, alt > 0 ? null : [4, 5]);
      const tag = (alt > 0 ? "+" : "") + alt;
      if (first && first.x > 34) hudLabel(tag, clamp(first.x - 7, 22, w - 22), first.y, HUD_DIM, "right");
      if (last && last.x < w - 34) hudLabel(tag, clamp(last.x + 7, 22, w - 22), last.y, HUD_DIM, "left");
    }
    ctx.restore();
  }

  function drawHorizon(cam, w, h) {
    const horizonY = cam.cy + cam.f * Math.tan(state.pitch * RAD);
    const gap = 30;
    if (horizonY > -60 && horizonY < h + 60) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.lineTo(w / 2 - gap, horizonY);
      ctx.moveTo(w / 2 + gap, horizonY);
      ctx.lineTo(w, horizonY);
      inkStroke(HUD_INK, 1.75);
      ctx.beginPath();
      ctx.moveTo(w / 2 - gap, horizonY);
      ctx.lineTo(w / 2 - gap, horizonY + 7);
      ctx.moveTo(w / 2 + gap, horizonY);
      ctx.lineTo(w / 2 + gap, horizonY + 7);
      inkStroke(HUD_INK, 1.5);
      ctx.restore();
    }
    hudFont(11, 700);
    for (let az = 0; az < 360; az += 45) {
      const p = project(cam, vecOf(az, 0));
      if (!p || p.x < 14 || p.x > w - 14) continue;
      const y = clamp(p.y, 16, h - 26);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p.x, y - 6);
      ctx.lineTo(p.x, y + 6);
      inkStroke(HUD_INK, 1.5);
      ctx.restore();
      hudLabel(compassName(az), p.x, y + 18, HUD_INK, "center");
    }
  }

  function drawBearingTape(cam, w, h) {
    const band = HUD_TOP + 44;
    const tickBase = HUD_TOP + 38;
    const span = Math.min(80, Math.max(state.fov * 0.75, 20));
    ctx.save();
    ctx.fillStyle = HUD_PANEL;
    ctx.fillRect(0, HUD_TOP, w, 44);
    ctx.strokeStyle = HUD_FAINT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, band + 0.5);
    ctx.lineTo(w, band + 0.5);
    ctx.stroke();

    hudFont(9, 600);
    const start = Math.floor((state.heading - span) / 5) * 5;
    for (let az = start; az <= state.heading + span; az += 5) {
      const d = Astro.norm180(az - state.heading);
      if (Math.abs(d) > span) continue;
      const x = w / 2 + cam.f * Math.tan(d * RAD);
      if (x < 10 || x > w - 10) continue;
      const whole = Astro.norm360(az);
      const cardinal = whole % 45 === 0;
      const major = whole % 15 === 0;
      ctx.beginPath();
      ctx.moveTo(x, tickBase);
      ctx.lineTo(x, tickBase - (cardinal ? 11 : major ? 8 : 5));
      inkStroke(cardinal ? HUD_INK : HUD_DIM, cardinal ? 1.75 : 1.25);
      if (cardinal) hudLabel(compassName(whole), x, HUD_TOP + 18, HUD_INK, "center");
      else if (major) hudLabel(String(Math.round(whole)), x, HUD_TOP + 18, HUD_DIM, "center");
    }

    ctx.beginPath();
    ctx.moveTo(w / 2, tickBase + 5);
    ctx.lineTo(w / 2 - 5, tickBase + 13);
    ctx.lineTo(w / 2 + 5, tickBase + 13);
    ctx.closePath();
    ctx.fillStyle = HUD_INK;
    ctx.fill();
    ctx.restore();
  }

  function drawReticle(w, h) {
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    inkStroke(HUD_INK, 1.5);
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(cx + dx * 12, cy + dy * 12);
      ctx.lineTo(cx + dx * 21, cy + dy * 21);
    }
    inkStroke(HUD_INK, 1.5);
    inkRect(cx, cy, 2, HUD_INK);
    ctx.restore();
  }

  function drawFrame(w, h) {
    const arm = Math.min(34, w * 0.07);
    const m = 9;
    const t = HUD_TOP + 52;
    ctx.save();
    for (const [x, y, sx, sy] of [[m, t, 1, 1], [w - m, t, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(x + sx * arm, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + sy * arm);
      inkStroke(HUD_DIM, 1.75);
    }
    ctx.restore();
  }


  function drawPath(cam, samples, color, w, h) {
    ctx.save();
    ctx.beginPath();
    let pen = false;
    for (const s of samples) {
      const p = s.up ? project(cam, vecOf(s.az, s.alt)) : null;
      if (!p) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
      pen = true;
    }
    inkStroke(color, 2, color === MOON_COLOR ? [3, 5] : [9, 4]);

    hudFont(9, 600);
    for (const s of samples) {
      if (!s.up || s.minute % 60 !== 0 || s.minute === 1440) continue;
      const p = project(cam, vecOf(s.az, s.alt));
      if (!p || p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue;
      const major = s.minute % 180 === 0;
      inkRect(p.x, p.y, major ? 5 : 3, color);
      if (state.showLabels && major) {
        hudLabel(pad(s.minute / 60) + "00", p.x, p.y - 12, color, "center");
      }
    }
    ctx.restore();
  }

  function drawSunDisc(x, y, r) {
    const glow = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 6);
    glow.addColorStop(0, "rgba(255,194,74,0.5)");
    glow.addColorStop(0.35, "rgba(255,170,60,0.16)");
    glow.addColorStop(1, "rgba(255,170,60,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#fff3cf";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = SUN_COLOR;
    ctx.stroke();
  }

  function drawTargetBracket(x, y, size, color) {
    const arm = size * 0.42;
    ctx.save();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(x + sx * size - sx * arm, y + sy * size);
      ctx.lineTo(x + sx * size, y + sy * size);
      ctx.lineTo(x + sx * size, y + sy * size - sy * arm);
      inkStroke(color, 1.75);
    }
    ctx.restore();
  }

  function drawCallout(x, y, size, title, detail, color, w, h) {
    const flip = x > w - 150;
    const dir = flip ? -1 : 1;
    const lx = x + dir * (size + 6);
    const ly = y - size - 6;
    const tx = lx + dir * 20;
    const ty = ly - 12;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + dir * size * 0.72, y - size * 0.72);
    ctx.lineTo(lx, ly);
    ctx.lineTo(tx, ty);
    inkStroke(color, 1.25);
    ctx.restore();

    const anchor = flip ? "right" : "left";
    hudFont(11, 700);
    hudLabel(title, tx + dir * 4, ty - 7, color, anchor);
    hudFont(9, 500);
    hudLabel(detail, tx + dir * 4, ty + 6, color, anchor);
  }

  function drawMoonDisc(x, y, r, illum, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Near-opaque: the unlit limb genuinely blocks what is behind it, which is
    // what makes the Moon read as passing in front of the Sun.
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(14,20,32,0.92)";
    ctx.fill();

    const half = r * (1 - 2 * clamp(illum, 0, 1));
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.ellipse(0, 0, Math.max(Math.abs(half), 0.01), r, 0, Math.PI / 2, half > 0 ? -Math.PI / 2 : (3 * Math.PI) / 2, half > 0);
    ctx.closePath();
    ctx.fillStyle = MOON_COLOR;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(233,238,248,0.85)";
    ctx.stroke();
    ctx.restore();
  }

  function drawOffscreenMarker(cam, pos, label, color, w, h) {
    const dh = Astro.norm180(pos.az - state.heading);
    const dv = pos.apparentAlt - state.pitch;
    let dx = dh;
    let dy = -dv;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    dx /= len;
    dy /= len;

    const margin = 30;
    const cx = w / 2;
    const cy = h / 2;
    const tx = dx > 0 ? (w - margin - cx) / dx : dx < 0 ? (margin - cx) / dx : Infinity;
    const ty = dy > 0 ? (h - margin - cy) / dy : dy < 0 ? (margin - cy) / dy : Infinity;
    const t = Math.min(tx, ty);
    if (!isFinite(t)) return;
    const x = cx + dx * t;
    const y = cy + dy * t;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    inkStroke(color, 1.5);

    ctx.translate(x, y);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(7, -5);
    ctx.lineTo(7, 5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    if (state.showLabels) {
      hudFont(9, 700);
      const off = Math.round(Math.hypot(dh, dv));
      hudLabel(
        label.toUpperCase() + " " + off + "° OFF-AXIS",
        clamp(x, 72, w - 72),
        clamp(y + (dy > 0 ? -18 : 20), 16, h - 16),
        color,
        "center"
      );
    }
  }

  // A planet is a point to the eye — Jupiter at its best spans 50 arcsec, well
  // under a pixel here — so it gets a legibility floor scaled by apparent
  // magnitude rather than its true angular size.
  function drawPlanetDisc(x, y, r, color) {
    const glow = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 4.5);
    glow.addColorStop(0, "rgba(255,255,255,0.3)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    inkStroke(HUD_SHADE, 1);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function planetRadius(magnitude) {
    return clamp(7 - magnitude * 0.9, 3.5, 11);
  }

  function drawBody(cam, pos, w, h) {
    if (!pos.up) return;
    const key = pos.body;
    const isSun = key === "sun";
    const isMoon = key === "moon";
    const label = BODY_LABELS[key] || key;
    const color = bodyColor(key);

    const v = vecOf(pos.az, pos.apparentAlt);
    const p = project(cam, v);
    const r =
      isSun || isMoon
        ? Math.max(10, cam.f * Math.tan((pos.angularDiameter / 2) * RAD))
        : planetRadius(pos.magnitude);
    if (!p || p.x < -r || p.x > w + r || p.y < -r || p.y > h + r) {
      drawOffscreenMarker(cam, pos, label, color, w, h);
      return;
    }

    if (isSun) {
      drawSunDisc(p.x, p.y, r);
    } else if (isMoon) {
      const sunVec = vecOf(current.sun.az, current.sun.apparentAlt);
      drawMoonDisc(p.x, p.y, r, pos.illuminated, tangentAngle(cam, v, sunVec, p));
    } else {
      drawPlanetDisc(p.x, p.y, r, color);
    }

    drawTargetBracket(p.x, p.y, Math.max(r * 2.1, 18), color);

    if (state.showLabels) {
      drawCallout(
        p.x,
        p.y,
        Math.max(r * 2.1, 18),
        label.toUpperCase(),
        (pos.alt >= 0 ? "+" : "") + pos.alt.toFixed(1) + "° / " + pos.az.toFixed(1) + "° " + compassName(pos.az) +
          (isSun || isMoon ? "" : "  m" + pos.magnitude.toFixed(1)),
        color,
        w,
        h
      );
    }
  }

  function draw() {
    if (!current) return;
    const { w, h } = sizeCanvas();
    ctx.clearRect(0, 0, w, h);
    // The map is a plan view: a horizon line, a pitch ladder and a bearing tape
    // would all be meaningless looking straight down.
    if (mode === "map") {
      drawMap(w, h);
      return;
    }
    const cam = makeCamera(w, h);
    if (mode === "sky") {
      drawSky(cam, w, h);
      drawGroundGrid(cam, w, h);
    }
    if (mode !== "ar") drawVignette(w, h);
    if (state.showCompass) {
      drawPitchLadder(cam, w, h);
      drawHorizon(cam, w, h);
    }
    const shown = enabledBodies().filter((key) => current[key]);
    if (state.showPaths && paths) {
      for (const key of shown) {
        if (paths[key]) drawPath(cam, paths[key], bodyColor(key), w, h);
      }
    }
    // Painter's algorithm on real distance: the Moon is ~390x closer than the
    // Sun, so it occludes it — which is exactly what a solar eclipse looks like.
    // Sorting rather than hard-coding the pair keeps this right for the planets.
    for (const pos of shown.map((key) => current[key]).sort((a, b) => b.distanceKm - a.distanceKm)) {
      drawBody(cam, pos, w, h);
    }
    if (state.showCompass) {
      drawBearingTape(cam, w, h);
      drawReticle(w, h);
    }
    if (alignTarget && current[alignTarget]) {
      hudFont(11, 700);
      hudLabel(
        "ALIGN · PUT " + (BODY_LABELS[alignTarget] || alignTarget).toUpperCase() + " ON THE RETICLE",
        w / 2,
        h / 2 + 40,
        bodyColor(alignTarget),
        "center"
      );
    }
    drawFrame(w, h);
  }

  /* ---------- readouts ---------- */

  function describeAltAz(pos) {
    if (!pos.up) return "Below the horizon — not drawn.";
    return (
      "Altitude " + pos.alt.toFixed(1) + "° · azimuth " + pos.az.toFixed(1) + "° (" + compassName(pos.az) + ")"
    );
  }

  function describeEvents(ev, riseWord, setWord) {
    if (ev.alwaysUp) return "Up all day.";
    if (ev.alwaysDown) return "Never rises today.";
    const parts = [];
    if (ev.rises.length) parts.push(riseWord + " " + ev.rises.map(fmtTime).join(", "));
    if (ev.sets.length) parts.push(setWord + " " + ev.sets.map(fmtTime).join(", "));
    parts.push("highest " + fmtTime(ev.transit));
    return parts.join(" · ");
  }

  function updateBodyList() {
    for (const key of BODY_ORDER) {
      const row = bodyRows[key];
      if (!row) continue;
      const pos = current && current[key];
      row.box.checked = !!state.bodies[key];
      if (!state.bodies[key] || !pos) {
        row.value.textContent = "";
        continue;
      }
      row.value.textContent = pos.up
        ? (pos.alt >= 0 ? "+" : "") + pos.alt.toFixed(0) + "° " + pos.az.toFixed(0) + "° " + compassName(pos.az) +
          (pos.magnitude === undefined ? "" : " m" + pos.magnitude.toFixed(1))
        : "below";
      row.item.classList.toggle("is-up", pos.up);
    }
  }

  function updateReadouts() {
    if (!current || !events) return;
    updateBodyList();
    el.sunPosition.textContent = describeAltAz(current.sun);
    el.sunTimes.textContent = describeEvents(events.sun, "Rise", "Set");
    el.moonPosition.textContent = describeAltAz(current.moon);
    el.moonPhase.textContent =
      current.moon.phaseName +
      " · " +
      Math.round(current.moon.illuminated * 100) +
      "% lit · " +
      Math.round(current.moon.distanceKm).toLocaleString("en-US") +
      " km";
    el.moonTimes.textContent = events.moon ? describeEvents(events.moon, "Rise", "Set") : "—";

    const l = localDate();
    el.spec.textContent =
      state.lat.toFixed(5) +
      ", " +
      state.lon.toFixed(5) +
      " · " +
      l.getUTCFullYear() +
      "-" +
      pad(l.getUTCMonth() + 1) +
      "-" +
      pad(l.getUTCDate()) +
      " " +
      pad(l.getUTCHours()) +
      ":" +
      pad(l.getUTCMinutes()) +
      " " +
      fmtOffset(state.tz) +
      " · view " +
      Math.round(Astro.norm360(state.heading)) +
      "° " +
      compassName(state.heading) +
      " / " +
      (state.pitch >= 0 ? "+" : "") +
      state.pitch.toFixed(0) +
      "° / " +
      Math.round(state.fov) +
      "° fov" +
      (Math.abs(state.headingOffset) > 0.5
        ? " · trim " + (state.headingOffset >= 0 ? "+" : "") + Math.round(state.headingOffset) + "°"
        : "");
  }

  /* ---------- refresh orchestration ---------- */

  function refresh(fullDay) {
    if (fullDay) recomputeDay();
    recomputeNow();
    updateReadouts();
    draw();
    saveState();
  }

  /* Applies the site's real offset for the instant being shown, keeping the
     wall-clock reading fixed — step across a DST boundary and the offset moves
     under you, which is exactly what a clock on site would do. */
  function applyAutoTz() {
    if (!state.autoTz || !state.zone) {
      el.tzStatus.textContent = state.autoTz ? "No timezone known for this point yet — set the offset by hand." : "";
      return;
    }
    let offset = offsetForZone(state.zone, state.utcMs);
    if (offset === null) {
      el.tzStatus.textContent = "This browser cannot resolve " + state.zone + " — set the offset by hand.";
      return;
    }
    // The instant depends on the offset we are solving for, so settle it once.
    const l = localDate();
    const parts = [l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate(), l.getUTCHours(), l.getUTCMinutes()];
    const settled = offsetForZone(state.zone, Date.UTC(...parts) - offset * 60000);
    if (settled !== null) offset = settled;

    if (offset !== state.tz) {
      state.tz = offset;
      state.utcMs = Date.UTC(...parts) - offset * 60000;
      el.tz.value = String(state.tz);
    }
    el.tzStatus.textContent = state.zone + " · " + fmtOffset(offset);
  }

  function syncTimeInputs() {
    const l = localDate();
    el.date.value = l.getUTCFullYear() + "-" + pad(l.getUTCMonth() + 1) + "-" + pad(l.getUTCDate());
    el.time.value = pad(l.getUTCHours()) + ":" + pad(l.getUTCMinutes());
    el.slider.value = String(clamp(minutesOfDay(), 0, 1439));
  }

  function syncLocationInputs() {
    el.lat.value = state.lat.toFixed(6);
    el.lon.value = state.lon.toFixed(6);
    for (const btn of el.presets.children) {
      const p = PRESETS[Number(btn.dataset.index)];
      const same = Math.abs(p.lat - state.lat) < 1e-4 && Math.abs(p.lon - state.lon) < 1e-4;
      btn.setAttribute("aria-pressed", same ? "true" : "false");
    }
  }

  let zoneSeq = 0;
  let zoneAnchor = null;

  /* Reverse-geocodes only to learn the country, and only when the site has
     moved far enough to plausibly change zone — walking down a street must not
     fire a request per step, both for Nominatim's 1 req/s policy and because
     the answer cannot have changed. */
  async function resolveZone(lat, lon, countryCode) {
    if (countryCode) {
      state.zone = zoneFor(countryCode, lon);
      zoneAnchor = { lat, lon };
      return;
    }
    if (!state.autoTz) return;
    if (zoneAnchor && Math.abs(zoneAnchor.lat - lat) < 0.25 && Math.abs(zoneAnchor.lon - lon) < 0.25) return;
    const seq = ++zoneSeq;
    try {
      const url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=5&lat=" + lat + "&lon=" + lon;
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (seq !== zoneSeq) return;
      state.zone = zoneFor(data && data.address && data.address.country_code, lon);
      zoneAnchor = { lat, lon };
      applyAutoTz();
      syncTimeInputs();
      refresh(true);
    } catch (err) {
      if (seq !== zoneSeq) return;
      el.tzStatus.textContent = "Timezone lookup needs the network — set the offset by hand.";
    }
  }

  function applyLocation(lat, lon, fromPano, countryCode) {
    state.lat = clamp(lat, -90, 90);
    state.lon = clamp(lon, -180, 180);
    syncLocationInputs();
    if (state.autoTz) {
      resolveZone(state.lat, state.lon, countryCode);
      applyAutoTz();
      syncTimeInputs();
    }
    refresh(true);
    if (!fromPano && mode === "street") showPanoramaAt(state.lat, state.lon);
  }

  /* ---------- persistence ---------- */

  let saveTimer = 0;

  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeState, 400);
  }

  function writeState() {
    try {
      localStorage.setItem(
        STATE_STORE,
        JSON.stringify({
          lat: state.lat,
          lon: state.lon,
          tz: state.tz,
          heading: state.heading,
          pitch: state.pitch,
          fov: state.fov,
          showPaths: state.showPaths,
          showCompass: state.showCompass,
          showLabels: state.showLabels,
          visor: state.visor,
          fovTrim: state.fovTrim,
          fovBasis: state.fovBasis,
          autoTz: state.autoTz,
          zone: state.zone,
          mapZoom: state.mapZoom,
          bodies: state.bodies,
          arFov: state.arFov,
          headingOffset: state.headingOffset,
          locationPinned: state.locationPinned,
          showSensorRaw: state.showSensorRaw,
        })
      );
    } catch (err) {
      /* storage disabled — the tool still works, it just forgets settings */
    }
  }

  function loadState() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STATE_STORE) || "null");
    } catch (err) {
      saved = null;
    }
    if (!saved) return;
    for (const k of ["lat", "lon", "tz", "heading", "pitch", "fov", "visor", "fovTrim", "mapZoom", "arFov", "headingOffset"]) {
      if (typeof saved[k] === "number" && isFinite(saved[k])) state[k] = saved[k];
    }
    for (const k of ["showPaths", "showCompass", "showLabels", "autoTz", "locationPinned", "showSensorRaw"]) {
      if (typeof saved[k] === "boolean") state[k] = saved[k];
    }
    if (typeof saved.zone === "string" && offsetForZone(saved.zone, Date.now()) !== null) {
      state.zone = saved.zone;
      zoneAnchor = { lat: state.lat, lon: state.lon };
    }
    if (["width", "height", "diagonal"].includes(saved.fovBasis)) state.fovBasis = saved.fovBasis;
    if (saved.bodies && typeof saved.bodies === "object") {
      const restored = {};
      for (const key of BODY_ORDER) if (saved.bodies[key] === true) restored[key] = true;
      if (Object.keys(restored).length) state.bodies = restored;
    }
  }

  /* Accepts a key handed in by the link — ?apikey=… or #apikey=… — stores it,
     then rewrites the address bar without it. Leaving it in the URL would put
     the key in the history, in bookmarks, in autocomplete, and above all in the
     clipboard the moment the link is shared. The hash form never reaches a
     server at all, so it is the safer of the two. */
  function consumeKeyFromUrl() {
    let query;
    let hash;
    try {
      query = new URLSearchParams(location.search);
      hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    } catch (err) {
      return "";
    }
    const key = (hash.get("apikey") || query.get("apikey") || "").trim();
    if (!key) return "";

    try {
      localStorage.setItem(KEY_STORE, key);
    } catch (err) {
      /* storage refused; the key still applies for this page load */
    }

    query.delete("apikey");
    hash.delete("apikey");
    try {
      const q = query.toString();
      const h = hash.toString();
      history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + (h ? "#" + h : ""));
    } catch (err) {
      /* file:// or a browser that refuses; the key is stored either way */
    }
    return key;
  }

  function storedKey() {
    try {
      return localStorage.getItem(KEY_STORE) || "";
    } catch (err) {
      return "";
    }
  }

  /* ---------- Street View ---------- */

  /* Google publishes a zoom -> field-of-view table (0:180, 1:90, 2:45, 3:22.5)
     but that table describes tile selection, not the camera the WebGL renderer
     actually uses; it is only exact at zoom 1. Each zoom step halves
     tan(fov/2), not fov, so the real curve is fov = 2*atan(2^(1-zoom)):

         zoom | rendered | 180/2^zoom
         -----+----------+-----------
            0 |   126.9  |   180
            1 |    90.0  |    90
            2 |    53.1  |    45      <- documented value is 18% narrow
            3 |    28.1  |    22.5
            4 |    14.25 |    11.25   <- 27% narrow

     Two independent empirical derivations agree on this within 0.4 deg:
     PanoMarker measured the renderer directly (github.com/marmat/
     google-maps-api-addons), and B. McPherson fitted it by comparing live
     panoramas against Static API renders at known fov. Using the documented
     table put every body too close to the view centre by a factor that grows
     with the off-axis angle — which reads as the sky sliding over the scenery
     as you pan, while staying pinned dead centre. Collapsed to a focal length
     the relation is simply f = width * 2^zoom / 4. */
  function zoomToFov(zoom) {
    return clamp((2 * Math.atan(Math.pow(2, 1 - zoom))) / RAD, 5, 175);
  }

  function fovToZoom(fov) {
    return clamp(1 - Math.log2(Math.tan((fov / 2) * RAD)), 0, 5);
  }

  function setMode(next) {
    mode = next;
    el.wrap.classList.toggle("street", next === "street");
    el.wrap.classList.toggle("map", next === "map");
    el.wrap.classList.toggle("ar", next === "ar");
    el.pano.hidden = next !== "street";
    el.cam.hidden = next !== "ar";
    if (next !== "ar") stopCamera();
    el.note.textContent =
      next === "street"
        ? "STREET VIEW · DRAG TO SLEW · ARROWS TO ADVANCE"
        : next === "map"
        ? "MAP · DRAG TO MOVE THE SITE · SCROLL TO ZOOM"
        : next === "ar"
        ? "LIVE CAMERA · POINT THE PHONE AT THE SKY · DRAG TO TRIM THE COMPASS"
        : "SKY VIEW · DRAG TO SLEW · SCROLL TO ZOOM";
    for (const btn of el.modeRow.querySelectorAll("[data-mode]")) {
      btn.setAttribute("aria-pressed", btn.dataset.mode === next ? "true" : "false");
    }
    if (next === "street") startPovSync();
    else stopPovSync();
    updateReadouts();
    draw();
  }

  function startPovSync() {
    if (rafId) return;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      if (mode !== "street" || !panorama) return;
      const pov = panorama.getPov();
      const fov = zoomToFov(panorama.getZoom());
      if (
        Math.abs(Astro.norm180(pov.heading - state.heading)) > 0.01 ||
        Math.abs(pov.pitch - state.pitch) > 0.01 ||
        Math.abs(fov - state.fov) > 0.01
      ) {
        state.heading = pov.heading;
        state.pitch = pov.pitch;
        state.fov = fov;
        updateReadouts();
        draw();
      }
    };
    rafId = requestAnimationFrame(tick);
  }

  function stopPovSync() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function loadMaps(key) {
    if (mapsPromise) return mapsPromise;
    mapsPromise = new Promise((resolve, reject) => {
      window[MAPS_CALLBACK] = () => resolve();
      window.gm_authFailure = () => {
        setMode("sky");
        setStatus("Google rejected this API key (check that the Maps JavaScript API is enabled and the referrer restriction allows this page). Reload the page to try another key.");
      };
      const script = document.createElement("script");
      script.src =
        "https://maps.googleapis.com/maps/api/js?key=" +
        encodeURIComponent(key) +
        "&v=weekly&loading=async&callback=" +
        MAPS_CALLBACK;
      script.async = true;
      script.onerror = () => reject(new Error("Could not reach Google Maps."));
      document.head.appendChild(script);
    });
    return mapsPromise;
  }

  function setStatus(text) {
    el.status.textContent = text;
  }

  function showPanoramaAt(lat, lon) {
    if (!window.google || !window.google.maps) return;
    const service = new google.maps.StreetViewService();
    service.getPanorama(
      { location: { lat, lng: lon }, radius: 250, source: google.maps.StreetViewSource.OUTDOOR },
      (data, status) => {
        if (status !== "OK" || !data) {
          setMode("sky");
          setStatus("No Street View imagery within 250 m of this point — showing the plain sky view.");
          return;
        }
        setStatus("");
        setMode("street");
        if (!panorama) {
          panorama = new google.maps.StreetViewPanorama(el.pano, {
            pano: data.location.pano,
            pov: { heading: state.heading, pitch: state.pitch },
            zoom: fovToZoom(state.fov),
            addressControl: false,
            fullscreenControl: false,
            motionTracking: false,
            motionTrackingControl: false,
            showRoadLabels: false,
            panControl: false,
          });
          panorama.addListener("position_changed", () => {
            const pos = panorama.getPosition();
            if (!pos || suppressPanoMove) return;
            const lat2 = pos.lat();
            const lon2 = pos.lng();
            if (Math.abs(lat2 - state.lat) < 1e-7 && Math.abs(lon2 - state.lon) < 1e-7) return;
            applyLocation(lat2, lon2, true);
          });
        } else {
          suppressPanoMove = true;
          panorama.setPano(data.location.pano);
          suppressPanoMove = false;
        }
      }
    );
  }

  async function enableStreetView() {
    const key = storedKey();
    if (!key) {
      openKeyDialog();
      return;
    }
    setStatus("Loading Street View…");
    try {
      await loadMaps(key);
    } catch (err) {
      setStatus("Could not load Google Maps — check your network connection.");
      return;
    }
    showPanoramaAt(state.lat, state.lon);
  }

  /* ---------- Phone sensors ----------
     The device-orientation frame is X=east, Y=north, Z=up, the same ENU frame
     vecOf() already uses, so the camera axis maps straight onto a heading and
     an altitude with no extra bookkeeping. The rear camera looks along -Z of
     the device, and the W3C rotation is Rz(alpha)Rx(beta)Ry(gamma), so the
     third column of that matrix, negated, is where the phone is pointed.
     Screen rotation is a spin about that same axis, so it changes the roll we
     do not model and can be ignored. */

  let sensorsOn = false;

  function orientationToView(alpha, beta, gamma) {
    const a = alpha * RAD;
    const b = beta * RAD;
    const g = gamma * RAD;
    const cA = Math.cos(a);
    const sA = Math.sin(a);
    const cB = Math.cos(b);
    const sB = Math.sin(b);
    const cG = Math.cos(g);
    const sG = Math.sin(g);
    const east = -(cA * sG + sA * sB * cG);
    const north = -(sA * sG - cA * sB * cG);
    const up = -(cB * cG);
    return {
      heading: Astro.norm360(Math.atan2(east, north) * DEG),
      pitch: clamp(Math.asin(clamp(up, -1, 1)) * DEG, -89, 89),
    };
  }

  let pendingView = null;
  let sensorFrame = 0;
  let smoothHeading = null;
  let smoothPitch = null;

  // Wrap-aware low pass. Raw fused orientation is noisy enough that the sky
  // visibly shivers; 0.25 settles in a few frames without feeling laggy.
  function smoothAngle(prev, next, k) {
    if (prev === null) return next;
    return prev + Astro.norm180(next - prev) * k;
  }

  function applyPendingView() {
    sensorFrame = 0;
    if (!pendingView) return;
    // The map is a plan view: while you are reading it the phone is lying in
    // your hand pointing at the floor, which is not the direction the cone is
    // meant to show. Only a first-person view should be steered by the sensor.
    if (mode === "map") return;
    // Straight up and straight down have no azimuth: the horizontal part of
    // the camera axis vanishes and atan2 snaps to whatever the rounding says —
    // a phone resting flat reads due south rather than "unknown". Hold the last
    // usable bearing through that cone instead of letting it flip.
    const degenerate = Math.abs(pendingView.pitch) > 85 && smoothHeading !== null;
    if (!degenerate) smoothHeading = smoothAngle(smoothHeading, pendingView.heading, 0.25);
    smoothPitch = smoothPitch === null ? pendingView.pitch : smoothPitch + (pendingView.pitch - smoothPitch) * 0.25;
    // The magnetometer is routinely a good ten degrees out; headingOffset is
    // the correction the viewer dials in by dragging, and it must survive
    // every sensor update.
    state.heading = Astro.norm360(smoothHeading + state.headingOffset);
    state.pitch = clamp(smoothPitch, -89, 89);
    if (state.showSensorRaw) {
      const r = pendingView.raw;
      el.sensorRaw.textContent =
        (r.absolute ? "abs" : "rel") +
        (r.compass === null ? "" : " compass " + r.compass.toFixed(0)) +
        " · a " + r.alpha.toFixed(0) + " b " + r.beta.toFixed(0) + " g " + r.gamma.toFixed(0) +
        " · screen " + r.screen + "°" +
        " → raw " + Math.round(Astro.norm360(smoothHeading)) +
        (Math.abs(state.headingOffset) > 0.5 ? " trim " + (state.headingOffset >= 0 ? "+" : "") + state.headingOffset.toFixed(0) : "") +
        " = hdg " + Math.round(state.heading) + " pitch " + Math.round(state.pitch) +
        (degenerate ? " (near vertical: bearing held)" : "");
    }
    updateReadouts();
    draw();
  }

  function onOrientation(ev) {
    let alpha = ev.alpha;
    // iOS reports a relative alpha but supplies a true-north compass heading.
    if (typeof ev.webkitCompassHeading === "number" && !isNaN(ev.webkitCompassHeading)) {
      alpha = 360 - ev.webkitCompassHeading;
    }
    if (alpha === null || ev.beta === null || ev.gamma === null) return;
    // Sensors fire faster than the display refreshes; coalesce to one repaint
    // per frame instead of redrawing per event.
    pendingView = orientationToView(alpha, ev.beta, ev.gamma);
    pendingView.raw = {
      alpha: alpha,
      beta: ev.beta,
      gamma: ev.gamma,
      absolute: ev.absolute === true || ev.type === "deviceorientationabsolute",
      compass: typeof ev.webkitCompassHeading === "number" ? ev.webkitCompassHeading : null,
      screen: (screen.orientation && screen.orientation.angle) || 0,
    };
    if (!sensorFrame) sensorFrame = requestAnimationFrame(applyPendingView);
  }

  async function startSensors() {
    if (sensorsOn) return true;
    if (typeof DeviceOrientationEvent === "undefined") {
      el.sensorStatus.textContent = "This device exposes no orientation sensors.";
      return false;
    }
    // iOS 13+ only hands them over from inside a user gesture.
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        const granted = await DeviceOrientationEvent.requestPermission();
        if (granted !== "granted") {
          el.sensorStatus.textContent = "Motion access refused — drag to look around instead.";
          return false;
        }
      } catch (err) {
        el.sensorStatus.textContent = "Motion access must be granted from a tap.";
        return false;
      }
    }
    const absolute = "ondeviceorientationabsolute" in window;
    window.addEventListener(absolute ? "deviceorientationabsolute" : "deviceorientation", onOrientation, true);
    sensorsOn = true;
    el.useSensors.checked = true;
    syncTrimVisibility();
    el.sensorStatus.textContent = absolute
      ? "Pointing with the phone. If north looks wrong, drag sideways to trim the compass."
      : "Pointing with the phone on a relative compass — drag sideways to line north up with a landmark.";
    return true;
  }

  function stopSensors() {
    if (!sensorsOn) return;
    window.removeEventListener("deviceorientationabsolute", onOrientation, true);
    window.removeEventListener("deviceorientation", onOrientation, true);
    sensorsOn = false;
    cancelAlignment();
    syncTrimVisibility();
    if (sensorFrame) cancelAnimationFrame(sensorFrame);
    sensorFrame = 0;
    pendingView = null;
    smoothHeading = null;
    smoothPitch = null;
    el.useSensors.checked = false;
    el.sensorStatus.textContent = "";
  }

  /* ---------- Optional: trim the compass against a real body ----------
     A phone magnetometer is routinely ten or more degrees out, and nothing on
     the device can tell you by how much. A celestial body can: its azimuth is
     known to a fraction of a degree from the ephemeris, so putting it on the
     reticle turns it into an absolute reference. Nothing here runs unless the
     viewer asks for it. */

  let alignTarget = null;

  function alignCandidates() {
    return enabledBodies().filter((key) => current && current[key] && current[key].up);
  }

  function cancelAlignment() {
    alignTarget = null;
    el.alignPicker.hidden = true;
    el.alignConfirm.hidden = true;
  }

  function openAlignPicker() {
    const candidates = alignCandidates();
    el.alignPicker.innerHTML = "";
    if (!candidates.length) {
      el.alignPicker.hidden = true;
      el.alignStatus.textContent = "Nothing you have selected is above the horizon to sight on.";
      return;
    }
    for (const key of candidates) {
      const pos = current[key];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = BODY_LABELS[key] + " " + pos.az.toFixed(0) + "° / " + pos.alt.toFixed(0) + "°";
      btn.addEventListener("click", () => {
        alignTarget = key;
        el.alignPicker.hidden = true;
        el.alignConfirm.hidden = false;
        el.alignStatus.textContent = "Put " + BODY_LABELS[key] + " on the reticle, then tap Confirm.";
        draw();
      });
      el.alignPicker.appendChild(btn);
    }
    el.alignPicker.hidden = false;
    el.alignStatus.textContent = "Pick something you can actually see.";
  }

  function confirmAlignment() {
    const pos = alignTarget && current[alignTarget];
    if (!pos) {
      cancelAlignment();
      return;
    }
    const previous = state.headingOffset;
    // The reticle is the view centre, so state.heading is exactly where the
    // phone is aimed; the gap to the true azimuth is the compass error.
    const correction = Astro.norm180(pos.az - state.heading);
    const tiltError = pos.apparentAlt - state.pitch;
    state.headingOffset = Astro.norm180(state.headingOffset + correction);
    state.heading = pos.az;
    el.alignStatus.textContent =
      "Trimmed " + (correction >= 0 ? "+" : "") + correction.toFixed(1) + "° on " + BODY_LABELS[alignTarget] +
      " (offset now " + (state.headingOffset >= 0 ? "+" : "") + state.headingOffset.toFixed(1) +
      "°, was " + (previous >= 0 ? "+" : "") + previous.toFixed(1) + "°). Tilt was out by " + tiltError.toFixed(1) + "°.";
    cancelAlignment();
    syncTrimVisibility();
    saveState();
    updateReadouts();
    draw();
  }

  function resetTrim() {
    state.headingOffset = 0;
    cancelAlignment();
    el.alignStatus.textContent = "Compass trim cleared.";
    syncTrimVisibility();
    saveState();
    updateReadouts();
    draw();
  }

  el.alignStart.addEventListener("click", openAlignPicker);
  el.alignConfirm.addEventListener("click", confirmAlignment);
  el.alignReset.addEventListener("click", resetTrim);

  /* ---------- Live camera ---------- */

  let cameraStream = null;

  async function startCamera() {
    if (cameraStream) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("This browser exposes no camera. AR needs a secure context (https or localhost).");
      return false;
    }
    try {
      const wrap = el.wrap.getBoundingClientRect();
      cameraStream = await navigator.mediaDevices.getUserMedia({
        // Asking for the viewport's shape keeps object-fit: cover from
        // discarding most of the camera's field of view.
        video: {
          facingMode: { ideal: "environment" },
          aspectRatio: { ideal: wrap.width / Math.max(1, wrap.height) },
        },
        audio: false,
      });
    } catch (err) {
      setStatus("Camera refused or unavailable — " + (err && err.name ? err.name : "unknown error") + ".");
      return false;
    }
    el.cam.srcObject = cameraStream;
    try {
      await el.cam.play();
    } catch (err) {
      /* autoplay attribute covers the usual case */
    }
    el.cam.addEventListener("loadedmetadata", reportCamera, { once: true });
    reportCamera();
    return true;
  }

  // The crop factor decides the focal length, so show the numbers it came from.
  function reportCamera() {
    if (!el.cam.videoWidth) return;
    const rect = el.wrap.getBoundingClientRect();
    const cover = Math.max(rect.width / el.cam.videoWidth, rect.height / el.cam.videoHeight);
    const shownFov = 2 * Math.atan(rect.width / 2 / (((el.cam.videoWidth / 2) / Math.tan((state.arFov / 2) * RAD)) * cover)) * DEG;
    setStatus(
      "Camera " + el.cam.videoWidth + "×" + el.cam.videoHeight +
      " · assuming " + Math.round(state.arFov) + "° across the frame" +
      " · " + shownFov.toFixed(0) + "° visible after crop"
    );
    draw();
  }

  function stopCamera() {
    if (!cameraStream) return;
    for (const track of cameraStream.getTracks()) track.stop();
    cameraStream = null;
    el.cam.srcObject = null;
  }

  async function enableAr() {
    setStatus("Starting the camera…");
    if (!(await startCamera())) return;
    setStatus("");
    setMode("ar");
    // Pointing by hand is the whole idea, but a refusal still leaves a usable
    // drag-to-look AR view.
    await startSensors();
    draw();
  }

  /* ---------- API key dialog ---------- */

  function openKeyDialog() {
    el.keyInput.value = storedKey();
    el.keyStatus.textContent = storedKey() ? "A key is already saved in this browser." : "";
    el.dialog.showModal();
  }

  el.keyBtn.addEventListener("click", () => {
    if (mode === "street") {
      openKeyDialog();
      return;
    }
    if (storedKey()) enableStreetView();
    else openKeyDialog();
  });

  el.keySave.addEventListener("click", () => {
    const key = el.keyInput.value.trim();
    if (!key) {
      el.keyStatus.textContent = "Paste a key first.";
      return;
    }
    try {
      localStorage.setItem(KEY_STORE, key);
    } catch (err) {
      el.keyStatus.textContent = "This browser refuses to store the key; it will only last for this page load.";
    }
    el.dialog.close();
    enableStreetView();
  });

  el.keyRemove.addEventListener("click", () => {
    try {
      localStorage.removeItem(KEY_STORE);
    } catch (err) {
      /* nothing to remove */
    }
    el.keyInput.value = "";
    el.keyStatus.textContent = "Key removed from this browser.";
    setMode("sky");
    setStatus("Street View key removed. Reload the page to fully unload Google Maps.");
  });

  /* ---------- inputs ---------- */

  const bodyRows = {};

  function buildBodyList() {
    for (const key of BODY_ORDER) {
      const item = document.createElement("li");
      item.className = "body-item";
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !!state.bodies[key];
      const swatch = document.createElement("span");
      swatch.className = "body-dot";
      swatch.style.background = bodyColor(key);
      const name = document.createElement("span");
      name.className = "body-name";
      name.textContent = BODY_LABELS[key];
      const value = document.createElement("span");
      value.className = "body-value";
      label.appendChild(box);
      label.appendChild(swatch);
      label.appendChild(name);
      label.appendChild(value);
      item.appendChild(label);
      el.bodyList.appendChild(item);
      bodyRows[key] = { item, box, value };
      box.addEventListener("change", () => {
        state.bodies[key] = box.checked;
        saveState();
        // A newly enabled body has no track or rise/set yet.
        refresh(true);
      });
    }
  }

  function buildPresets() {
    PRESETS.forEach((p, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = p.name;
      btn.dataset.index = String(i);
      btn.addEventListener("click", () => {
        state.locationPinned = true;
        state.zone = p.zone;
        zoneAnchor = { lat: p.lat, lon: p.lon };
        state.heading = p.heading;
        applyLocation(p.lat, p.lon, false);
        applyAutoTz();
        syncTimeInputs();
      });
      el.presets.appendChild(btn);
    });
  }

  function buildTimezones() {
    for (let min = -12 * 60; min <= 14 * 60; min += 15) {
      const opt = document.createElement("option");
      opt.value = String(min);
      opt.textContent = fmtOffset(min);
      el.tz.appendChild(opt);
    }
  }

  function parseCoords(text) {
    const at = text.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (at) return { lat: +at[1], lon: +at[2] };
    const bang = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (bang) return { lat: +bang[1], lon: +bang[2] };
    const query = text.match(/[?&](?:q|query|ll|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i);
    if (query) return { lat: +query[1], lon: +query[2] };
    const pair = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
    if (pair) return { lat: +pair[1], lon: +pair[2] };
    return null;
  }

  for (const input of [el.lat, el.lon]) {
    input.addEventListener("change", () => {
      const lat = parseFloat(el.lat.value);
      const lon = parseFloat(el.lon.value);
      if (!isFinite(lat) || !isFinite(lon)) return;
      state.locationPinned = true;
      applyLocation(lat, lon, false);
    });
    input.addEventListener("paste", (ev) => {
      const text = (ev.clipboardData || window.clipboardData).getData("text");
      const coords = parseCoords(text || "");
      if (!coords) return;
      ev.preventDefault();
      applyLocation(coords.lat, coords.lon, false);
    });
  }

  /* ---------- address search ----------
     OpenStreetMap's Nominatim: keyless, CORS-enabled and read-only, so it fits
     the no-backend rule. Its usage policy caps callers at one request per
     second, which is why this only fires on an explicit submit — never per
     keystroke. Everything else in the tool keeps working when it is offline. */

  const NOMINATIM = "https://nominatim.openstreetmap.org/search";
  let searchSeq = 0;

  function clearResults() {
    el.searchResults.innerHTML = "";
    el.searchResults.hidden = true;
  }

  function guessOffsetFromLongitude(lon) {
    return Math.round(lon / 15) * 60;
  }

  function applySearchHit(hit) {
    state.locationPinned = true;
    clearResults();
    el.searchInput.value = hit.display_name;
    el.searchStatus.textContent = hit.display_name;
    const lat = parseFloat(hit.lat);
    const lon = parseFloat(hit.lon);
    // The search result already carries the country, so the zone costs no
    // extra request.
    applyLocation(lat, lon, false, hit.address && hit.address.country_code);
    applyAutoTz();
    syncTimeInputs();
    if (!state.autoTz) {
      const guess = guessOffsetFromLongitude(lon);
      if (Math.abs(guess - state.tz) > 120) {
        el.searchStatus.textContent =
          hit.display_name + " — local time there is probably around " + fmtOffset(guess) + "; adjust the UTC offset if needed.";
      }
    }
  }

  function renderResults(hits) {
    el.searchResults.innerHTML = "";
    for (const hit of hits) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "result-btn";
      btn.textContent = hit.display_name;
      btn.addEventListener("click", () => applySearchHit(hit));
      li.appendChild(btn);
      el.searchResults.appendChild(li);
    }
    el.searchResults.hidden = hits.length === 0;
  }

  async function runSearch() {
    const query = el.searchInput.value.trim();
    if (!query) return;

    const coords = parseCoords(query);
    if (coords) {
      clearResults();
      el.searchStatus.textContent = "Coordinates recognised.";
      applyLocation(coords.lat, coords.lon, false);
      return;
    }

    const seq = ++searchSeq;
    el.searchStatus.textContent = "Searching…";
    clearResults();
    try {
      const url = NOMINATIM + "?format=jsonv2&addressdetails=1&limit=5&q=" + encodeURIComponent(query);
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const hits = await response.json();
      if (seq !== searchSeq) return;
      if (!Array.isArray(hits) || hits.length === 0) {
        el.searchStatus.textContent = "No place matched that. Try adding a city or country.";
        return;
      }
      if (hits.length === 1) {
        applySearchHit(hits[0]);
        return;
      }
      el.searchStatus.textContent = hits.length + " matches — pick one:";
      renderResults(hits);
    } catch (err) {
      if (seq !== searchSeq) return;
      el.searchStatus.textContent = "Address lookup unavailable offline — enter coordinates instead.";
    }
  }

  el.searchBtn.addEventListener("click", runSearch);
  el.searchInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      runSearch();
    }
  });

  /* The visor is a scrim between the panorama and the overlay: it buys HUD
     contrast at the cost of image brightness, so how far to push it is the
     viewer's call, not ours. */
  function applyVisor() {
    document.body.style.setProperty("--visor", String(state.visor));
    for (const btn of el.visorRow.querySelectorAll("[data-visor]")) {
      btn.setAttribute("aria-pressed", Number(btn.dataset.visor) === state.visor ? "true" : "false");
    }
  }

  function syncTrimVisibility() {
    // A leftover trim is applied in every mode, so its undo button cannot be
    // hidden behind the sensor toggle that happened to create it.
    el.alignBlock.hidden = !sensorsOn && Math.abs(state.headingOffset) <= 0.5;
    el.alignStart.hidden = !sensorsOn;
  }

  function applyCalibration() {
    el.trimValue.textContent = "×" + state.fovTrim.toFixed(2);
    el.trim.value = String(state.fovTrim);
    for (const btn of el.basisRow.querySelectorAll("[data-basis]")) {
      btn.setAttribute("aria-pressed", btn.dataset.basis === state.fovBasis ? "true" : "false");
    }
    updateReadouts();
    draw();
  }

  el.basisRow.addEventListener("click", (ev) => {
    const btn = ev.target.closest ? ev.target.closest("[data-basis]") : null;
    if (!btn) return;
    state.fovBasis = btn.dataset.basis;
    applyCalibration();
    saveState();
  });

  el.trim.addEventListener("input", () => {
    state.fovTrim = Number(el.trim.value);
    applyCalibration();
    saveState();
  });

  el.visorRow.addEventListener("click", (ev) => {
    const btn = ev.target.closest ? ev.target.closest("[data-visor]") : null;
    if (!btn) return;
    state.visor = Number(btn.dataset.visor);
    applyVisor();
    saveState();
  });

  el.modeRow.addEventListener("click", (ev) => {
    const btn = ev.target.closest ? ev.target.closest("[data-mode]") : null;
    if (!btn) return;
    if (btn.dataset.mode === "street") {
      enableStreetView();
      return;
    }
    if (btn.dataset.mode === "ar") {
      enableAr();
      return;
    }
    setMode(btn.dataset.mode);
    saveState();
  });

  el.panelsToggle.addEventListener("click", () => {
    const off = document.body.classList.toggle("panels-off");
    el.panelsToggle.setAttribute("aria-expanded", off ? "false" : "true");
    draw();
  });

  function locate(explicit) {
    if (!navigator.geolocation) {
      if (explicit) setStatus("This browser has no geolocation support.");
      return;
    }
    setStatus("Asking the browser for your position…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus("");
        if (explicit) state.locationPinned = true;
        applyLocation(pos.coords.latitude, pos.coords.longitude, false);
        syncTimeInputs();
        saveState();
      },
      () => {
        // A refusal must not nag on every load.
        state.locationPinned = true;
        saveState();
        setStatus(explicit ? "Could not get your position (permission denied or unavailable)." : "");
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }
    );
  }

  el.geolocate.addEventListener("click", () => locate(true));

  el.showSensorRaw.addEventListener("change", () => {
    state.showSensorRaw = el.showSensorRaw.checked;
    if (!state.showSensorRaw) el.sensorRaw.textContent = "";
    saveState();
  });

  el.useSensors.addEventListener("change", () => {
    if (el.useSensors.checked) startSensors();
    else stopSensors();
  });

  el.panelTabs.addEventListener("click", (ev) => {
    const btn = ev.target.closest ? ev.target.closest("[data-panel]") : null;
    if (!btn) return;
    document.body.classList.toggle("panel-right-active", btn.dataset.panel === "right");
    for (const tab of el.panelTabs.querySelectorAll("[data-panel]")) {
      tab.setAttribute("aria-pressed", tab === btn ? "true" : "false");
    }
  });

  function onDateTimeChanged() {
    const [y, m, d] = el.date.value.split("-").map(Number);
    const time = /^\s*(\d{1,2})\s*[:hH.]?\s*(\d{2})?\s*$/.exec(el.time.value);
    if (!y || !m || !d || !time) {
      syncTimeInputs();
      return;
    }
    const hh = clamp(Number(time[1]), 0, 23);
    const mm = clamp(Number(time[2] || 0), 0, 59);
    setLocal(y, m - 1, d, hh, mm);
    applyAutoTz();
    syncTimeInputs();
    refresh(true);
  }

  el.date.addEventListener("change", onDateTimeChanged);
  el.time.addEventListener("change", onDateTimeChanged);

  el.tz.addEventListener("change", () => {
    const l = localDate();
    const parts = [l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate(), l.getUTCHours(), l.getUTCMinutes()];
    state.tz = Number(el.tz.value);
    setLocal(parts[0], parts[1], parts[2], parts[3], parts[4]);
    if (state.autoTz) {
      state.autoTz = false;
      el.autoTz.checked = false;
      el.tzStatus.textContent = "Auto offset off — you set this one by hand.";
    }
    syncTimeInputs();
    refresh(true);
  });

  el.autoTz.addEventListener("change", () => {
    state.autoTz = el.autoTz.checked;
    if (state.autoTz && !state.zone) resolveZone(state.lat, state.lon);
    applyAutoTz();
    syncTimeInputs();
    refresh(true);
  });

  el.slider.addEventListener("input", () => {
    state.utcMs = dayStartMs() + Number(el.slider.value) * 60000;
    syncTimeInputs();
    refresh(false);
  });

  function shiftDay(days) {
    const l = localDate();
    setLocal(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + days, l.getUTCHours(), l.getUTCMinutes());
    applyAutoTz();
    syncTimeInputs();
    refresh(true);
  }

  el.prevDay.addEventListener("click", () => shiftDay(-1));
  el.nextDay.addEventListener("click", () => shiftDay(1));
  el.now.addEventListener("click", () => {
    state.utcMs = Date.now();
    syncTimeInputs();
    refresh(true);
  });

  for (const [box, key] of [
    [el.showPaths, "showPaths"],
    [el.showCompass, "showCompass"],
    [el.showLabels, "showLabels"],
  ]) {
    box.addEventListener("change", () => {
      state[key] = box.checked;
      saveState();
      draw();
    });
  }

  /* ---------- sky-view camera control ---------- */

  const pointers = new Map();
  let dragLast = null;
  let pinchStart = null;

  let mapDrag = null;
  let mapPinch = null;

  el.canvas.addEventListener("pointerdown", (ev) => {
    if (mode === "map") {
      el.canvas.setPointerCapture(ev.pointerId);
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      el.canvas.classList.add("dragging");
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        mapPinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: state.mapZoom };
        mapDrag = null;
      } else if (pointers.size === 1) {
        mapDrag = { x: ev.clientX, y: ev.clientY, moved: 0 };
      }
      return;
    }
    if (mode === "street") return;
    el.canvas.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    el.canvas.classList.add("dragging");
    if (pointers.size === 1) dragLast = { x: ev.clientX, y: ev.clientY };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), fov: mode === "ar" ? state.arFov : state.fov };
    }
  });

  el.canvas.addEventListener("pointermove", (ev) => {
    if (mode === "map") {
      if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 2 && mapPinch) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist > 0 && mapPinch.dist > 0) {
          state.mapZoom = clamp(mapPinch.zoom + Math.log2(dist / mapPinch.dist), 2, 19);
          updateReadouts();
          draw();
          saveState();
        }
        return;
      }
      if (!mapDrag) return;
      const dx = ev.clientX - mapDrag.x;
      const dy = ev.clientY - mapDrag.y;
      mapDrag.moved += Math.abs(dx) + Math.abs(dy);
      const g = mapGeometry(el.canvas.clientWidth, el.canvas.clientHeight);
      // Dragging moves the site itself; only the map repaints until release, so
      // the astronomy is recomputed once rather than every frame.
      state.lon = clamp(worldXToLon(lonToWorldX(state.lon, g.zi) - dx / g.size, g.zi), -180, 180);
      state.lat = clamp(worldYToLat(latToWorldY(state.lat, g.zi) - dy / g.size, g.zi), -85, 85);
      mapDrag.x = ev.clientX;
      mapDrag.y = ev.clientY;
      syncLocationInputs();
      draw();
      return;
    }
    if (mode === "street" || !pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0) {
        const zoomed = (pinchStart.fov * pinchStart.dist) / dist;
        if (mode === "ar") state.arFov = clamp(zoomed, 20, 120);
        else state.fov = clamp(zoomed, 10, 140);
        updateReadouts();
        draw();
      }
      return;
    }
    if (!dragLast) return;
    const perPx = (mode === "ar" ? state.arFov : state.fov) / el.canvas.clientWidth;
    const dx = (ev.clientX - dragLast.x) * perPx;
    const dy = (ev.clientY - dragLast.y) * perPx;
    if (mode === "ar" && sensorsOn) {
      // The phone decides where it points; a drag can only trim the compass.
      // Pitch comes from gravity and is trustworthy, so it stays untouched.
      state.headingOffset = Astro.norm180(state.headingOffset - dx);
      state.heading = Astro.norm360(state.heading - dx);
      el.sensorStatus.textContent = "Compass trimmed by " + state.headingOffset.toFixed(0) + "°.";
    } else {
      state.heading = Astro.norm360(state.heading - dx);
      state.pitch = clamp(state.pitch + dy, -89, 89);
    }
    dragLast = { x: ev.clientX, y: ev.clientY };
    updateReadouts();
    draw();
  });

  function endPointer(ev) {
    if (mode === "map") {
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) mapPinch = null;
      if (pointers.size === 1) {
        // A finger lifted mid-pinch: keep panning from where the other one is,
        // and make sure its eventual release is not read as a tap.
        const [only] = [...pointers.values()];
        mapDrag = { x: only.x, y: only.y, moved: 99 };
        return;
      }
      if (!mapDrag) {
        el.canvas.classList.remove("dragging");
        return;
      }
      const rect = el.canvas.getBoundingClientRect();
      const tapped = mapDrag.moved < 5;
      mapDrag = null;
      el.canvas.classList.remove("dragging");
      if (tapped) {
        const hit = mapPointToLatLon(ev.clientX - rect.left, ev.clientY - rect.top, rect.width, rect.height);
        applyLocation(hit.lat, hit.lon, true);
      } else {
        applyLocation(state.lat, state.lon, true);
      }
      return;
    }
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) {
      dragLast = null;
      el.canvas.classList.remove("dragging");
      saveState();
    } else {
      const first = [...pointers.values()][0];
      dragLast = { x: first.x, y: first.y };
    }
  }

  el.canvas.addEventListener("pointerup", endPointer);
  el.canvas.addEventListener("pointercancel", endPointer);

  el.canvas.addEventListener(
    "wheel",
    (ev) => {
      if (mode === "map") {
        ev.preventDefault();
        state.mapZoom = clamp(state.mapZoom + (ev.deltaY < 0 ? 1 : -1), 2, 19);
        updateReadouts();
        draw();
        saveState();
        return;
      }
      if (mode === "street") return;
      ev.preventDefault();
      if (mode === "ar") {
        state.arFov = clamp(state.arFov * Math.exp(ev.deltaY * 0.0015), 20, 120);
      } else {
        state.fov = clamp(state.fov * Math.exp(ev.deltaY * 0.0015), 10, 140);
      }
      updateReadouts();
      draw();
      saveState();
    },
    { passive: false }
  );

  window.addEventListener("resize", draw);
  if (window.ResizeObserver) new ResizeObserver(draw).observe(el.wrap);

  /* ---------- boot ---------- */

  function init() {
    if (window.matchMedia && window.matchMedia("(max-width: 860px)").matches) {
      document.body.classList.add("panels-off");
      el.panelsToggle.setAttribute("aria-expanded", "false");
    }
    readHudTokens();
    buildTimezones();
    buildPresets();
    buildBodyList();
    loadState();
    el.tz.value = String(state.tz);
    el.showPaths.checked = state.showPaths;
    el.showCompass.checked = state.showCompass;
    el.showLabels.checked = state.showLabels;
    el.autoTz.checked = state.autoTz;
    el.showSensorRaw.checked = state.showSensorRaw;
    syncTrimVisibility();
    applyVisor();
    el.trim.value = String(state.fovTrim);
    el.trimValue.textContent = "×" + state.fovTrim.toFixed(2);
    for (const btn of el.basisRow.querySelectorAll("[data-basis]")) {
      btn.setAttribute("aria-pressed", btn.dataset.basis === state.fovBasis ? "true" : "false");
    }
    syncLocationInputs();
    if (state.autoTz) {
      if (!state.zone) resolveZone(state.lat, state.lon);
      applyAutoTz();
    }
    syncTimeInputs();
    setMode("sky");
    refresh(true);
    const fromUrl = consumeKeyFromUrl();
    if (fromUrl) {
      enableStreetView();
      setStatus("API key taken from the link, saved in this browser and stripped from the address bar.");
    } else if (storedKey()) {
      enableStreetView();
    } else {
      setStatus("No Street View key yet — sky, map and AR need no key.");
    }
    // First visit: offer to start from where the visitor actually is. Once a
    // site has been chosen deliberately — or geolocation refused — never again.
    if (!state.locationPinned) locate(false);
  }

  init();
})();
