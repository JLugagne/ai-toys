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
  // A planet is a point source, so only refraction lifts it over the horizon.
  const POINT_HORIZON = -0.5667;

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

  /* Orbital elements at epoch 2000 Jan 0.0 with their daily rates, from the
     same Schlyter reference as the Sun and Moon above. Accuracy is roughly
     1-2 arcmin for the inner planets and better than 5 arcmin for the outer
     ones once the Jupiter/Saturn/Uranus perturbations below are applied —
     far finer than a panorama overlay can express. */
  const PLANETS = {
    mercury: { N: [48.3313, 3.24587e-5], i: [7.0047, 5.0e-8], w: [29.1241, 1.01444e-5], a: [0.387098, 0], e: [0.205635, 5.59e-10], M: [168.6562, 4.0923344368], radiusKm: 2439.7, mag: [-0.36, 0.027, 2.2e-13, 6] },
    venus: { N: [76.6799, 2.4659e-5], i: [3.3946, 2.75e-8], w: [54.891, 1.38374e-5], a: [0.72333, 0], e: [0.006773, -1.302e-9], M: [48.0052, 1.6021302244], radiusKm: 6051.8, mag: [-4.34, 0.013, 4.2e-7, 3] },
    mars: { N: [49.5574, 2.11081e-5], i: [1.8497, -1.78e-8], w: [286.5016, 2.92961e-5], a: [1.523688, 0], e: [0.093405, 2.516e-9], M: [18.6021, 0.5240207766], radiusKm: 3389.5, mag: [-1.51, 0.016, 0, 1] },
    jupiter: { N: [100.4542, 2.76854e-5], i: [1.303, -1.557e-7], w: [273.8777, 1.64505e-5], a: [5.20256, 0], e: [0.048498, 4.469e-9], M: [19.895, 0.0830853001], radiusKm: 69911, mag: [-9.25, 0.014, 0, 1] },
    saturn: { N: [113.6634, 2.3898e-5], i: [2.4886, -1.081e-7], w: [339.3939, 2.97661e-5], a: [9.55475, 0], e: [0.055546, -9.499e-9], M: [316.967, 0.0334442282], radiusKm: 58232, mag: [-9.0, 0.044, 0, 1] },
    uranus: { N: [74.0005, 1.3978e-5], i: [0.7733, 1.9e-8], w: [96.6612, 3.0565e-5], a: [19.18171, -1.55e-8], e: [0.047318, 7.45e-9], M: [142.5905, 0.011725806], radiusKm: 25362, mag: [-7.15, 0.001, 0, 1] },
    neptune: { N: [131.7806, 3.0173e-5], i: [1.77, -2.55e-7], w: [272.8461, -6.027e-6], a: [30.05826, 3.313e-8], e: [0.008606, 2.15e-9], M: [260.2471, 0.005995147], radiusKm: 24622, mag: [-6.9, 0.001, 0, 1] },
  };

  const AU_KM_EXACT = AU_KM;

  function elementsAt(p, d) {
    return {
      N: norm360(p.N[0] + p.N[1] * d),
      i: p.i[0] + p.i[1] * d,
      w: norm360(p.w[0] + p.w[1] * d),
      a: p.a[0] + p.a[1] * d,
      e: p.e[0] + p.e[1] * d,
      M: norm360(p.M[0] + p.M[1] * d),
    };
  }

  function heliocentric(el) {
    let E = el.M + el.e * DEG * sin(el.M) * (1 + el.e * cos(el.M));
    for (let k = 0; k < 10; k++) {
      const dE = (E - el.e * DEG * sin(E) - el.M) / (1 - el.e * cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-10) break;
    }
    const xv = el.a * (cos(E) - el.e);
    const yv = el.a * Math.sqrt(1 - el.e * el.e) * sin(E);
    const v = atan2(yv, xv);
    const r = Math.hypot(xv, yv);
    const u = v + el.w;
    return {
      lon: norm360(atan2(sin(el.N) * cos(u) + cos(el.N) * sin(u) * cos(el.i), cos(el.N) * cos(u) - sin(el.N) * sin(u) * cos(el.i))),
      lat: asin(sin(u) * sin(el.i)),
      r,
    };
  }

  // Jupiter, Saturn and Uranus are pulled around by each other by up to half a
  // degree; without these the giants drift visibly.
  function giantPerturbations(name, d, out) {
    const Mj = norm360(PLANETS.jupiter.M[0] + PLANETS.jupiter.M[1] * d);
    const Ms = norm360(PLANETS.saturn.M[0] + PLANETS.saturn.M[1] * d);
    const Mu = norm360(PLANETS.uranus.M[0] + PLANETS.uranus.M[1] * d);
    if (name === "jupiter") {
      out.lon +=
        -0.332 * sin(2 * Mj - 5 * Ms - 67.6) -
        0.056 * sin(2 * Mj - 2 * Ms + 21) +
        0.042 * sin(3 * Mj - 5 * Ms + 21) -
        0.036 * sin(Mj - 2 * Ms) +
        0.022 * cos(Mj - Ms) +
        0.023 * sin(2 * Mj - 3 * Ms + 52) -
        0.016 * sin(Mj - 5 * Ms - 69);
    } else if (name === "saturn") {
      out.lon +=
        0.812 * sin(2 * Mj - 5 * Ms - 67.6) -
        0.229 * cos(2 * Mj - 4 * Ms - 2) +
        0.119 * sin(Mj - 2 * Ms - 3) +
        0.046 * sin(2 * Mj - 6 * Ms - 69) +
        0.014 * sin(Mj - 3 * Ms + 32);
      out.lat += -0.02 * cos(2 * Mj - 4 * Ms - 2) + 0.018 * sin(2 * Mj - 6 * Ms - 49);
    } else if (name === "uranus") {
      out.lon += 0.04 * sin(Ms - 2 * Mu + 6) + 0.035 * sin(Ms - 3 * Mu + 33) - 0.015 * sin(Mj - Mu + 20);
    }
  }

  function planetMagnitude(name, r, R, phaseAngle, lon, lat, d) {
    const [base, k1, k2, power] = PLANETS[name].mag;
    let m = base + 5 * Math.log10(r * R) + k1 * phaseAngle + k2 * Math.pow(phaseAngle, power);
    if (name === "saturn") {
      // The rings dominate Saturn's brightness, swinging it by about 1 mag
      // between edge-on and wide open.
      const ir = 28.06;
      const Nr = 169.51 + 3.82e-5 * d;
      const B = asin(sin(lat) * cos(ir) - cos(lat) * sin(ir) * sin(lon - Nr));
      m += -2.6 * sin(Math.abs(B)) + 1.2 * Math.pow(sin(B), 2);
    }
    return m;
  }

  function planet(name, date, lat, lon) {
    const d = dayNumber(date);
    const ecl = obliquity(d);
    const s = sunEcliptic(d);
    const helio = heliocentric(elementsAt(PLANETS[name], d));
    giantPerturbations(name, d, helio);

    const xh = helio.r * cos(helio.lat) * cos(helio.lon);
    const yh = helio.r * cos(helio.lat) * sin(helio.lon);
    const zh = helio.r * sin(helio.lat);
    const xs = s.dist * cos(s.lon);
    const ys = s.dist * sin(s.lon);
    const xg = xh + xs;
    const yg = yh + ys;
    const zg = zh;

    const geoLon = norm360(atan2(yg, xg));
    const geoLat = atan2(zg, Math.hypot(xg, yg));
    const R = Math.hypot(xg, yg, zg);

    const eq = eclipticToEquatorial(geoLon, geoLat, ecl);
    const hz = equatorialToHorizontal(eq.ra, eq.dec, lat, siderealTime(d, date, lon));
    const phaseAngle = acos((helio.r * helio.r + R * R - s.dist * s.dist) / (2 * helio.r * R));
    const distKm = R * AU_KM_EXACT;

    return {
      body: name,
      az: hz.az,
      alt: hz.alt,
      apparentAlt: hz.alt + refraction(hz.alt),
      hourAngle: hz.hourAngle,
      ra: eq.ra,
      dec: eq.dec,
      eclipticLon: geoLon,
      eclipticLat: geoLat,
      distanceKm: distKm,
      distanceAu: R,
      heliocentricAu: helio.r,
      heliocentricLon: helio.lon,
      angularDiameter: 2 * Math.atan(PLANETS[name].radiusKm / distKm) * DEG,
      illuminated: (1 + cos(phaseAngle)) / 2,
      phaseAngle,
      elongation: acos(cos(s.lon - geoLon) * cos(geoLat)),
      magnitude: planetMagnitude(name, helio.r, R, phaseAngle, geoLon, geoLat, d),
      horizonAlt: POINT_HORIZON,
      up: hz.alt > POINT_HORIZON,
    };
  }

  function positionOf(body, date, lat, lon) {
    if (body === "moon") return moon(date, lat, lon);
    if (body === "sun") return sun(date, lat, lon);
    if (PLANETS[body]) return planet(body, date, lat, lon);
    throw new Error("unknown body: " + body);
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
    planet,
    planetNames: Object.keys(PLANETS),
    positionOf,
    riseSet,
    refraction,
    norm360,
    norm180,
    RAD,
    DEG,
  };
})(window);
