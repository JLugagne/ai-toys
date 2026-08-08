/* Positions of celestial bodies as seen from a point on Earth — self-contained,
   no dependencies, no network. So far the Sun and the Moon; `positionOf` is the
   seam where further bodies plug in, and every consumer goes through it.
   Based on Paul Schlyter's "How to compute planetary positions" (truncated
   lunar theory with the main perturbation terms). Accuracy is roughly
   0.01 deg for the Sun and 2 arcmin for the Moon, which is well below what
   a panorama overlay can show. */
(function (global) {
  "use strict";

  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;

  const EARTH_RADIUS_KM = 6378.14;
  const MOON_RADIUS_KM = 1737.4;
  const SUN_RADIUS_KM = 695700;
  const AU_KM = 149597870.7;

  // Geometric altitude of the disc centre when the upper limb touches the
  // horizon: refraction (-34') plus semi-diameter (-16' sun / -15' moon).
  const SUN_HORIZON = -0.833;
  const MOON_HORIZON = -0.8;

  function norm360(x) {
    const v = x % 360;
    return v < 0 ? v + 360 : v;
  }

  function norm180(x) {
    const v = norm360(x);
    return v > 180 ? v - 360 : v;
  }

  function sin(d) {
    return Math.sin(d * RAD);
  }

  function cos(d) {
    return Math.cos(d * RAD);
  }

  function tan(d) {
    return Math.tan(d * RAD);
  }

  function asin(x) {
    return Math.asin(Math.max(-1, Math.min(1, x))) * DEG;
  }

  function acos(x) {
    return Math.acos(Math.max(-1, Math.min(1, x))) * DEG;
  }

  function atan2(y, x) {
    return Math.atan2(y, x) * DEG;
  }

  // Days since the epoch 2000 Jan 0.0 UT (= JD 2451543.5).
  function dayNumber(date) {
    return date.getTime() / 86400000 + 2440587.5 - 2451543.5;
  }

  function obliquity(d) {
    return 23.4393 - 3.563e-7 * d;
  }

  function utHours(date) {
    return (
      date.getUTCHours() +
      date.getUTCMinutes() / 60 +
      date.getUTCSeconds() / 3600 +
      date.getUTCMilliseconds() / 3600000
    );
  }

  function sunEcliptic(d) {
    const w = 282.9404 + 4.70935e-5 * d;
    const e = 0.016709 - 1.151e-9 * d;
    const M = norm360(356.047 + 0.9856002585 * d);
    let E = M + e * DEG * sin(M) * (1 + e * cos(M));
    for (let i = 0; i < 3; i++) {
      E -= (E - e * DEG * sin(E) - M) / (1 - e * cos(E));
    }
    const xv = cos(E) - e;
    const yv = Math.sqrt(1 - e * e) * sin(E);
    return {
      lon: norm360(atan2(yv, xv) + w),
      lat: 0,
      dist: Math.hypot(xv, yv),
      meanAnomaly: M,
      meanLon: norm360(w + M),
    };
  }

  function moonEcliptic(d, sun) {
    const N = 125.1228 - 0.0529538083 * d;
    const i = 5.1454;
    const w = 318.0634 + 0.1643573223 * d;
    const a = 60.2666;
    const e = 0.0549;
    const M = norm360(115.3654 + 13.0649929509 * d);

    let E = M + e * DEG * sin(M) * (1 + e * cos(M));
    for (let k = 0; k < 6; k++) {
      const dE = (E - e * DEG * sin(E) - M) / (1 - e * cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-9) break;
    }

    const xv = a * (cos(E) - e);
    const yv = a * Math.sqrt(1 - e * e) * sin(E);
    const v = atan2(yv, xv);
    const r = Math.hypot(xv, yv);

    const xh = r * (cos(N) * cos(v + w) - sin(N) * sin(v + w) * cos(i));
    const yh = r * (sin(N) * cos(v + w) + cos(N) * sin(v + w) * cos(i));
    const zh = r * sin(v + w) * sin(i);

    let lon = atan2(yh, xh);
    let lat = atan2(zh, Math.hypot(xh, yh));
    let dist = r;

    const Ms = sun.meanAnomaly;
    const Ls = sun.meanLon;
    const Mm = M;
    const Lm = norm360(N + w + M);
    const D = norm360(Lm - Ls);
    const F = norm360(Lm - N);

    lon +=
      -1.274 * sin(Mm - 2 * D) +
      0.658 * sin(2 * D) -
      0.186 * sin(Ms) -
      0.059 * sin(2 * Mm - 2 * D) -
      0.057 * sin(Mm - 2 * D + Ms) +
      0.053 * sin(Mm + 2 * D) +
      0.046 * sin(2 * D - Ms) +
      0.041 * sin(Mm - Ms) -
      0.035 * sin(D) -
      0.031 * sin(Mm + Ms) -
      0.015 * sin(2 * F - 2 * D) +
      0.011 * sin(Mm - 4 * D);

    lat +=
      -0.173 * sin(F - 2 * D) -
      0.055 * sin(Mm - F - 2 * D) -
      0.046 * sin(Mm + F - 2 * D) +
      0.033 * sin(F + 2 * D) +
      0.017 * sin(2 * Mm + F);

    dist += -0.58 * cos(Mm - 2 * D) - 0.46 * cos(2 * D);

    return { lon: norm360(lon), lat, dist };
  }

  function eclipticToEquatorial(lon, lat, ecl) {
    const x = cos(lat) * cos(lon);
    const y = cos(lat) * sin(lon);
    const z = sin(lat);
    const ye = y * cos(ecl) - z * sin(ecl);
    const ze = y * sin(ecl) + z * cos(ecl);
    return { ra: norm360(atan2(ye, x)), dec: atan2(ze, Math.hypot(x, ye)) };
  }

  function siderealTime(d, date, lonEast) {
    return norm360(sunEcliptic(d).meanLon + 180 + utHours(date) * 15 + lonEast);
  }

  function equatorialToHorizontal(ra, dec, lat, lst) {
    const H = norm360(lst - ra);
    const alt = asin(sin(dec) * sin(lat) + cos(dec) * cos(lat) * cos(H));
    const north = cos(lat) * sin(dec) - sin(lat) * cos(dec) * cos(H);
    const east = -cos(dec) * sin(H);
    return { alt, az: norm360(atan2(east, north)), hourAngle: H };
  }

  // Bennett's formula, in degrees, for a true (unrefracted) altitude.
  function refraction(alt) {
    const a = Math.max(alt, -1);
    return 1 / tan(a + 7.31 / (a + 4.4)) / 60;
  }

  function phaseName(angle) {
    if (angle < 7.5 || angle >= 352.5) return "New moon";
    if (angle < 82.5) return "Waxing crescent";
    if (angle < 97.5) return "First quarter";
    if (angle < 172.5) return "Waxing gibbous";
    if (angle < 187.5) return "Full moon";
    if (angle < 262.5) return "Waning gibbous";
    if (angle < 277.5) return "Last quarter";
    return "Waning crescent";
  }

  function sun(date, lat, lon) {
    const d = dayNumber(date);
    const ecl = obliquity(d);
    const s = sunEcliptic(d);
    const eq = eclipticToEquatorial(s.lon, s.lat, ecl);
    const hz = equatorialToHorizontal(eq.ra, eq.dec, lat, siderealTime(d, date, lon));
    const distKm = s.dist * AU_KM;
    return {
      body: "sun",
      az: hz.az,
      alt: hz.alt,
      apparentAlt: hz.alt + refraction(hz.alt),
      hourAngle: hz.hourAngle,
      ra: eq.ra,
      dec: eq.dec,
      eclipticLon: s.lon,
      eclipticLat: 0,
      distanceKm: distKm,
      angularDiameter: 2 * Math.atan(SUN_RADIUS_KM / distKm) * DEG,
      horizonAlt: SUN_HORIZON,
      up: hz.alt > SUN_HORIZON,
    };
  }

  function moon(date, lat, lon) {
    const d = dayNumber(date);
    const ecl = obliquity(d);
    const s = sunEcliptic(d);
    const m = moonEcliptic(d, s);
    const eq = eclipticToEquatorial(m.lon, m.lat, ecl);
    const hz = equatorialToHorizontal(eq.ra, eq.dec, lat, siderealTime(d, date, lon));

    // The Moon is close enough that the observer's offset from the Earth's
    // centre shifts it by up to ~1 deg, almost entirely in altitude.
    const parallax = asin(1 / m.dist);
    const alt = hz.alt - parallax * cos(hz.alt);

    const elongation = acos(cos(s.lon - m.lon) * cos(m.lat));
    const phaseAngle = norm360(m.lon - s.lon);
    const distKm = m.dist * EARTH_RADIUS_KM;

    return {
      body: "moon",
      az: hz.az,
      alt,
      apparentAlt: alt + refraction(alt),
      hourAngle: hz.hourAngle,
      ra: eq.ra,
      dec: eq.dec,
      eclipticLon: m.lon,
      eclipticLat: m.lat,
      distanceKm: distKm,
      angularDiameter: 2 * Math.atan(MOON_RADIUS_KM / distKm) * DEG,
      illuminated: (1 - cos(elongation)) / 2,
      elongation,
      phaseAngle,
      phaseName: phaseName(phaseAngle),
      waxing: phaseAngle < 180,
      horizonAlt: MOON_HORIZON,
      up: alt > MOON_HORIZON,
    };
  }

  function positionOf(body, date, lat, lon) {
    return body === "moon" ? moon(date, lat, lon) : sun(date, lat, lon);
  }

  /* Scans [startMs, startMs + spanMs] for horizon crossings of `body`.
     Returns every rise and set found (the Moon can have none, or two, in a
     civil day), plus the highest point reached. Times are epoch ms. */
  function riseSet(body, startMs, spanMs, lat, lon) {
    const stepMs = 10 * 60000;
    const steps = Math.ceil(spanMs / stepMs);
    const rises = [];
    const sets = [];

    const sample = (ms) => {
      const p = positionOf(body, new Date(ms), lat, lon);
      return p.alt - p.horizonAlt;
    };

    let prevMs = startMs;
    let prev = sample(prevMs);
    let peakMs = prevMs;
    let peak = prev;

    for (let i = 1; i <= steps; i++) {
      const ms = Math.min(startMs + i * stepMs, startMs + spanMs);
      const cur = sample(ms);
      if (cur > peak) {
        peak = cur;
        peakMs = ms;
      }
      if (prev <= 0 && cur > 0) rises.push(refineCrossing(sample, prevMs, ms));
      if (prev > 0 && cur <= 0) sets.push(refineCrossing(sample, prevMs, ms));
      prevMs = ms;
      prev = cur;
    }

    return {
      rises,
      sets,
      transit: refinePeak(sample, peakMs - stepMs, peakMs + stepMs),
      alwaysUp: rises.length === 0 && sets.length === 0 && peak > 0,
      alwaysDown: rises.length === 0 && sets.length === 0 && peak <= 0,
    };
  }

  function refineCrossing(sample, loMs, hiMs) {
    let lo = loMs;
    let hi = hiMs;
    let vLo = sample(lo);
    for (let i = 0; i < 24 && hi - lo > 500; i++) {
      const mid = (lo + hi) / 2;
      const vMid = sample(mid);
      if (vLo <= 0 === vMid <= 0) {
        lo = mid;
        vLo = vMid;
      } else {
        hi = mid;
      }
    }
    return Math.round((lo + hi) / 2);
  }

  function refinePeak(sample, loMs, hiMs) {
    let lo = loMs;
    let hi = hiMs;
    for (let i = 0; i < 40 && hi - lo > 1000; i++) {
      const a = lo + (hi - lo) / 3;
      const b = hi - (hi - lo) / 3;
      if (sample(a) < sample(b)) lo = a;
      else hi = b;
    }
    return Math.round((lo + hi) / 2);
  }

  global.Astro = {
    sun,
    moon,
    positionOf,
    riseSet,
    refraction,
    norm360,
    norm180,
    RAD,
    DEG,
  };
})(window);
