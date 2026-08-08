(function () {
  "use strict";

  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;
  const KEY_STORE = "celestial-streetview.apikey";
  const STATE_STORE = "celestial-streetview.state";
  const MAPS_CALLBACK = "celestialMapsReady";
  const PATH_STEP_MIN = 5;

  const SUN_COLOR = "#ffc945";
  const MOON_COLOR = "#e9eef8";

  const PRESETS = [
    { name: "Eiffel Tower", lat: 48.85837, lon: 2.294481, heading: 250, tz: 120 },
    { name: "Times Square", lat: 40.758, lon: -73.9855, heading: 200, tz: -240 },
    { name: "Shibuya", lat: 35.6595, lon: 139.7005, heading: 60, tz: 540 },
    { name: "Sydney Opera", lat: -33.8568, lon: 151.2153, heading: 300, tz: 600 },
    { name: "Tromsø", lat: 69.6496, lon: 18.956, heading: 180, tz: 120 },
  ];

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
    const fov = clamp(state.fov, 5, 175);
    const f = w / 2 / Math.tan((fov / 2) * RAD);
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

  function recomputeDay() {
    const start = dayStartMs();
    const samples = { sun: [], moon: [] };
    for (let m = 0; m <= 1440; m += PATH_STEP_MIN) {
      const ms = start + m * 60000;
      const at = new Date(ms);
      for (const body of ["sun", "moon"]) {
        const p = Astro.positionOf(body, at, state.lat, state.lon);
        samples[body].push({ ms, minute: m, az: p.az, alt: p.apparentAlt, up: p.up });
      }
    }
    paths = samples;
    events = {
      sun: Astro.riseSet("sun", start, 86400000, state.lat, state.lon),
      moon: Astro.riseSet("moon", start, 86400000, state.lat, state.lon),
    };
  }

  function recomputeNow() {
    const at = new Date(state.utcMs);
    current = {
      sun: Astro.sun(at, state.lat, state.lon),
      moon: Astro.moon(at, state.lat, state.lon),
    };
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

  const SKY_DAY = { top: [58, 110, 190], bottom: [176, 208, 240], ground: [92, 96, 84] };
  const SKY_DUSK = { top: [40, 58, 102], bottom: [223, 141, 80], ground: [52, 48, 46] };
  const SKY_NIGHT = { top: [7, 10, 20], bottom: [22, 30, 54], ground: [14, 16, 20] };

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
  }

  function labelStyle(size, weight) {
    ctx.font = (weight || 500) + " " + size + "px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  }

  function outlinedText(text, x, y, color) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawHorizon(cam, w, h) {
    const horizonY = cam.cy + cam.f * Math.tan(state.pitch * RAD);
    if (horizonY > -50 && horizonY < h + 50) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.lineTo(w, horizonY);
      ctx.stroke();
      ctx.restore();
    }
    labelStyle(11, 600);
    for (let az = 0; az < 360; az += 15) {
      const p = project(cam, vecOf(az, 0));
      if (!p || p.x < 0 || p.x > w) continue;
      const cardinal = az % 45 === 0;
      const y = clamp(p.y, 12, h - 12);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, y - (cardinal ? 7 : 4));
      ctx.lineTo(p.x, y + (cardinal ? 7 : 4));
      ctx.stroke();
      ctx.restore();
      if (cardinal) outlinedText(compassName(az), p.x, y + 18, "#ffffff");
    }
  }

  function drawPath(cam, samples, color, w, h) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.75;
    ctx.setLineDash(color === MOON_COLOR ? [5, 5] : []);
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
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 1;
    labelStyle(10, 500);
    for (const s of samples) {
      if (!s.up || s.minute % 60 !== 0 || s.minute === 1440) continue;
      const p = project(cam, vecOf(s.az, s.alt));
      if (!p || p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (state.showLabels && s.minute % 180 === 0) {
        outlinedText(pad(s.minute / 60) + "h", p.x, p.y - 12, color);
      }
    }
    ctx.restore();
  }

  function drawSunDisc(x, y, r) {
    const glow = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 6);
    glow.addColorStop(0, "rgba(255,201,69,0.55)");
    glow.addColorStop(0.35, "rgba(255,180,60,0.18)");
    glow.addColorStop(1, "rgba(255,180,60,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#fff3cf";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = SUN_COLOR;
    ctx.stroke();
  }

  function drawMoonDisc(x, y, r, illum, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20,26,40,0.55)";
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
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.translate(x, y);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(2, -5);
    ctx.lineTo(2, 5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    if (state.showLabels) {
      labelStyle(11, 600);
      const off = Math.round(Math.hypot(dh, dv));
      outlinedText(label + " " + off + "° away", clamp(x, 60, w - 60), clamp(y + (dy > 0 ? -16 : 18), 14, h - 14), color);
    }
  }

  function drawBody(cam, pos, w, h) {
    const isSun = pos.body === "sun";
    const label = isSun ? "Sun" : "Moon";
    const color = isSun ? SUN_COLOR : MOON_COLOR;
    if (!pos.up) return;

    const v = vecOf(pos.az, pos.apparentAlt);
    const p = project(cam, v);
    const r = Math.max(10, cam.f * Math.tan((pos.angularDiameter / 2) * RAD));
    if (!p || p.x < -r || p.x > w + r || p.y < -r || p.y > h + r) {
      drawOffscreenMarker(cam, pos, label, color, w, h);
      return;
    }

    if (isSun) {
      drawSunDisc(p.x, p.y, r);
    } else {
      const sunVec = vecOf(current.sun.az, current.sun.apparentAlt);
      drawMoonDisc(p.x, p.y, r, pos.illuminated, tangentAngle(cam, v, sunVec, p));
    }

    if (state.showLabels) {
      labelStyle(12, 600);
      outlinedText(label, p.x, p.y - r - 14, color);
      labelStyle(10, 500);
      outlinedText(
        pos.alt.toFixed(1) + "° alt · " + pos.az.toFixed(0) + "° " + compassName(pos.az),
        p.x,
        p.y + r + 14,
        color
      );
    }
  }

  function draw() {
    if (!current) return;
    const { w, h } = sizeCanvas();
    const cam = makeCamera(w, h);
    ctx.clearRect(0, 0, w, h);
    if (mode === "sky") drawSky(cam, w, h);
    if (state.showCompass) drawHorizon(cam, w, h);
    if (state.showPaths && paths) {
      drawPath(cam, paths.moon, MOON_COLOR, w, h);
      drawPath(cam, paths.sun, SUN_COLOR, w, h);
    }
    drawBody(cam, current.moon, w, h);
    drawBody(cam, current.sun, w, h);
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

  function updateReadouts() {
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
    el.moonTimes.textContent = describeEvents(events.moon, "Rise", "Set");

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
      "° fov";
  }

  /* ---------- refresh orchestration ---------- */

  function refresh(fullDay) {
    if (fullDay) recomputeDay();
    recomputeNow();
    updateReadouts();
    draw();
    saveState();
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

  function applyLocation(lat, lon, fromPano) {
    state.lat = clamp(lat, -90, 90);
    state.lon = clamp(lon, -180, 180);
    syncLocationInputs();
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
    for (const k of ["lat", "lon", "tz", "heading", "pitch", "fov"]) {
      if (typeof saved[k] === "number" && isFinite(saved[k])) state[k] = saved[k];
    }
    for (const k of ["showPaths", "showCompass", "showLabels"]) {
      if (typeof saved[k] === "boolean") state[k] = saved[k];
    }
  }

  function storedKey() {
    try {
      return localStorage.getItem(KEY_STORE) || "";
    } catch (err) {
      return "";
    }
  }

  /* ---------- Street View ---------- */

  function zoomToFov(zoom) {
    return clamp(180 / Math.pow(2, zoom), 5, 175);
  }

  function fovToZoom(fov) {
    return clamp(Math.log2(180 / fov), 0, 5);
  }

  function setMode(next) {
    mode = next;
    el.wrap.classList.toggle("street", next === "street");
    el.pano.hidden = next !== "street";
    el.note.textContent =
      next === "street"
        ? "Street View — drag to look around, click the arrows to move along the street."
        : "Sky view — drag to look around, scroll to zoom.";
    if (next === "street") startPovSync();
    else stopPovSync();
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

  function buildPresets() {
    PRESETS.forEach((p, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = p.name;
      btn.dataset.index = String(i);
      btn.addEventListener("click", () => {
        state.tz = p.tz;
        el.tz.value = String(p.tz);
        state.heading = p.heading;
        applyLocation(p.lat, p.lon, false);
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

  el.geolocate.addEventListener("click", () => {
    if (!navigator.geolocation) {
      setStatus("This browser has no geolocation support.");
      return;
    }
    setStatus("Asking the browser for your position…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus("");
        state.tz = -new Date().getTimezoneOffset();
        el.tz.value = String(state.tz);
        applyLocation(pos.coords.latitude, pos.coords.longitude, false);
        syncTimeInputs();
      },
      () => setStatus("Could not get your position (permission denied or unavailable).")
    );
  });

  function onDateTimeChanged() {
    const [y, m, d] = el.date.value.split("-").map(Number);
    const [hh, mm] = el.time.value.split(":").map(Number);
    if (!y || !m || !d || !isFinite(hh) || !isFinite(mm)) return;
    setLocal(y, m - 1, d, hh, mm);
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

  el.canvas.addEventListener("pointerdown", (ev) => {
    if (mode !== "sky") return;
    el.canvas.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    el.canvas.classList.add("dragging");
    if (pointers.size === 1) dragLast = { x: ev.clientX, y: ev.clientY };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), fov: state.fov };
    }
  });

  el.canvas.addEventListener("pointermove", (ev) => {
    if (mode !== "sky" || !pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0) {
        state.fov = clamp((pinchStart.fov * pinchStart.dist) / dist, 10, 140);
        updateReadouts();
        draw();
      }
      return;
    }
    if (!dragLast) return;
    const perPx = state.fov / el.canvas.clientWidth;
    state.heading = Astro.norm360(state.heading - (ev.clientX - dragLast.x) * perPx);
    state.pitch = clamp(state.pitch + (ev.clientY - dragLast.y) * perPx, -89, 89);
    dragLast = { x: ev.clientX, y: ev.clientY };
    updateReadouts();
    draw();
  });

  function endPointer(ev) {
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
      if (mode !== "sky") return;
      ev.preventDefault();
      state.fov = clamp(state.fov * Math.exp(ev.deltaY * 0.0015), 10, 140);
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
    buildTimezones();
    buildPresets();
    loadState();
    el.tz.value = String(state.tz);
    el.showPaths.checked = state.showPaths;
    el.showCompass.checked = state.showCompass;
    el.showLabels.checked = state.showLabels;
    syncLocationInputs();
    syncTimeInputs();
    refresh(true);
    if (storedKey()) enableStreetView();
    else setStatus("No Street View key yet — showing the plain sky view.");
  }

  init();
})();
