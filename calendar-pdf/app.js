"use strict";

const MONTHS = {
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const WD_SHORT = {
  fr: ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
const WD_FULL = {
  fr: ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

const HOLIDAY_NAMES = {
  fr: { newyear: "Jour de l'an", labour: "Fête du Travail", victory: "Victoire 1945", national: "Fête nationale", assumption: "Assomption", toussaint: "Toussaint", armistice: "Armistice 1918", christmas: "Noël", eastermon: "Lundi de Pâques", ascension: "Ascension", whitmon: "Lundi de Pentecôte" },
  en: { newyear: "New Year's Day", labour: "Labour Day", victory: "Victory in Europe Day", national: "Bastille Day", assumption: "Assumption Day", toussaint: "All Saints' Day", armistice: "Armistice Day", christmas: "Christmas Day", eastermon: "Easter Monday", ascension: "Ascension Day", whitmon: "Whit Monday" },
};

const VAC_EN = {
  "Vacances de la Toussaint": "All Saints' holidays",
  "Vacances de Noël": "Christmas holidays",
  "Vacances d'Hiver": "Winter holidays",
  "Vacances de Printemps": "Spring holidays",
  "Vacances d'Été": "Summer holidays",
  "Pont de l'Ascension": "Ascension long weekend",
  "Début des Vacances d'Été": "Start of summer holidays",
};

const I18N = {
  en: {
    app_title: "Blank Calendar PDF",
    lede: "Generate a print-ready blank calendar as a PDF. Pick a monthly or weekly layout, choose where the week starts, a print-friendly color scheme, and optionally overlay French public holidays and school-holiday zones (A / B / C).",
    h_range: "Date range", opt_fullyear: "Full year", opt_monthrange: "Month range",
    lbl_year: "Year", lbl_from_month: "From (month)", lbl_to_month: "To (month)",
    h_layout: "Layout", opt_monthly: "Monthly (grid)", opt_weekly: "Weekly (planner)",
    lbl_weekstart: "Week starts on", opt_monday: "Monday", opt_sunday: "Sunday",
    h_colors: "Color scheme", h_page: "Page", lbl_size: "Size",
    h_holidays: "Holidays", chk_publicholidays: "Include French public holidays",
    chk_legend: "Show legend (monthly layout)",
    lbl_zones: "French school-holiday zones",
    sum_addperiod: "+ Add a custom period", lbl_name: "Name", ph_name: "e.g. Trip",
    lbl_start: "Start", lbl_end: "End", btn_addperiod: "Add period", btn_export: "Export PDF",
    theme_grayscale: "Grayscale", theme_blue: "Blue", theme_green: "Green", theme_sepia: "Sepia",
    legend_weekend: "Weekend", legend_holiday: "Public holiday", legend_other: "Other",
    spec_monthly: "monthly", spec_weekly: "weekly", spec_monstart: "Mon start", spec_sunstart: "Sun start",
    st_loading: "Loading school-holiday dates…",
    st_live: "School-holiday dates: live from data.education.gouv.fr.",
    st_offline: "School-holiday dates from offline snapshot (API unavailable).",
    st_mixed: "School-holiday dates: live, with offline snapshot for some years.",
    st_pickdates: "Pick a start and end date for the custom period.",
    st_invalidrange: "The end month is before the start month — adjust the range.",
    st_nothing: "Nothing to export.", st_invalidexport: "Invalid date range.",
    default_period: "Period", file_prefix: "calendar",
    file_monthly: "monthly", file_weekly: "weekly",
  },
  fr: {
    app_title: "Calendrier vierge (PDF)",
    lede: "Générez un calendrier vierge prêt à imprimer au format PDF. Choisissez une disposition mensuelle ou hebdomadaire, le premier jour de la semaine, une palette adaptée à l'impression, et affichez si besoin les jours fériés français et les zones de vacances scolaires (A / B / C).",
    h_range: "Plage de dates", opt_fullyear: "Année entière", opt_monthrange: "Plage de mois",
    lbl_year: "Année", lbl_from_month: "De (mois)", lbl_to_month: "À (mois)",
    h_layout: "Disposition", opt_monthly: "Mensuel (grille)", opt_weekly: "Hebdomadaire (agenda)",
    lbl_weekstart: "La semaine commence le", opt_monday: "Lundi", opt_sunday: "Dimanche",
    h_colors: "Palette de couleurs", h_page: "Page", lbl_size: "Format",
    h_holidays: "Vacances & jours fériés", chk_publicholidays: "Inclure les jours fériés français",
    chk_legend: "Afficher la légende (vue mensuelle)",
    lbl_zones: "Zones de vacances scolaires (France)",
    sum_addperiod: "+ Ajouter une période", lbl_name: "Nom", ph_name: "ex. Voyage",
    lbl_start: "Début", lbl_end: "Fin", btn_addperiod: "Ajouter la période", btn_export: "Exporter le PDF",
    theme_grayscale: "Niveaux de gris", theme_blue: "Bleu", theme_green: "Vert", theme_sepia: "Sépia",
    legend_weekend: "Week-end", legend_holiday: "Jour férié", legend_other: "Autre",
    spec_monthly: "mensuel", spec_weekly: "hebdo", spec_monstart: "début lundi", spec_sunstart: "début dimanche",
    st_loading: "Chargement des dates de vacances…",
    st_live: "Dates de vacances : en direct depuis data.education.gouv.fr.",
    st_offline: "Dates de vacances : instantané hors-ligne (API indisponible).",
    st_mixed: "Dates de vacances : en direct, avec instantané hors-ligne pour certaines années.",
    st_pickdates: "Choisissez une date de début et de fin pour la période.",
    st_invalidrange: "Le mois de fin précède le mois de début — ajustez la plage.",
    st_nothing: "Rien à exporter.", st_invalidexport: "Plage de dates invalide.",
    default_period: "Période", file_prefix: "calendrier",
    file_monthly: "mensuel", file_weekly: "hebdo",
  },
};

let lang = (navigator.language || "en").toLowerCase().startsWith("fr") ? "fr" : "en";

function t(key) {
  return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function translateVacation(desc) {
  return lang === "fr" ? desc : (VAC_EN[desc] || desc);
}
function msgUnavailable(years) {
  return lang === "fr"
    ? `Dates de vacances indisponibles pour ${years} (hors-ligne et absentes de l'instantané).`
    : `School-holiday dates unavailable for ${years} (offline and not in snapshot).`;
}
function msgExported(n) {
  return lang === "fr"
    ? `PDF exporté — ${n} page${n > 1 ? "s" : ""}.`
    : `PDF exported — ${n} page${n > 1 ? "s" : ""}.`;
}
function msgPageCount(n) {
  return lang === "fr" ? `${n} page${n > 1 ? "s" : ""}.` : `${n} page${n > 1 ? "s" : ""}.`;
}
function msgShowing(shown, total) {
  return lang === "fr"
    ? `Aperçu des ${shown} premières pages sur ${total} — le PDF contient les ${total}.`
    : `Showing first ${shown} of ${total} pages — the PDF contains all ${total}.`;
}
function weekTitle(first, last) {
  const m = MONTHS[lang];
  if (lang === "fr") {
    return `Semaine du ${first.getDate()} ${m[first.getMonth()]} au ${last.getDate()} ${m[last.getMonth()]} ${last.getFullYear()}`;
  }
  return `Week of ${m[first.getMonth()]} ${first.getDate()} – ${m[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
}

const CUSTOM_COLOR = "#d9c9ee";

const THEMES = [
  { id: "grayscale", ink: "#1a1a1a", grid: "#c8c8c8", headerBg: "#e9e9e9", headerInk: "#111", weekendBg: "#f3f3f3", holidayBg: "#cfcfcf", holidayInk: "#000", zones: { A: "#e0e0e0", B: "#cccccc", C: "#b6b6b6" }, strip: ["#111", "#e9e9e9", "#f3f3f3", "#cfcfcf"] },
  { id: "blue", ink: "#16233d", grid: "#bcd0ea", headerBg: "#d6e4f7", headerInk: "#1c3f74", weekendBg: "#eef4fc", holidayBg: "#f9dcd2", holidayInk: "#8a2c12", zones: { A: "#cfe0f6", B: "#d3ecd6", C: "#f6e6c9" }, strip: ["#1c3f74", "#d6e4f7", "#eef4fc", "#f9dcd2"] },
  { id: "green", ink: "#17301f", grid: "#bcdcc4", headerBg: "#d8ecdd", headerInk: "#1f4d31", weekendBg: "#eff7f1", holidayBg: "#f7dccf", holidayInk: "#7d3115", zones: { A: "#d5ead9", B: "#cfe3f5", C: "#f4e7c8" }, strip: ["#1f4d31", "#d8ecdd", "#eff7f1", "#f7dccf"] },
  { id: "sepia", ink: "#3a2c1c", grid: "#e0d0b8", headerBg: "#f0e4d2", headerInk: "#6b4a24", weekendBg: "#f7efe3", holidayBg: "#e9cdbb", holidayInk: "#7a3d1c", zones: { A: "#efe0cb", B: "#e2ddc6", C: "#e6cfbc" }, strip: ["#6b4a24", "#f0e4d2", "#f7efe3", "#e9cdbb"] },
];

const EMBEDDED = {
  "2025-2026": {
    A: [
      { description: "Vacances de la Toussaint", start_date: "2025-10-17T22:00:00+00:00", end_date: "2025-11-02T23:00:00+00:00" },
      { description: "Vacances de Noël", start_date: "2025-12-19T23:00:00+00:00", end_date: "2026-01-04T23:00:00+00:00" },
      { description: "Vacances d'Hiver", start_date: "2026-02-06T23:00:00+00:00", end_date: "2026-02-22T23:00:00+00:00" },
      { description: "Vacances de Printemps", start_date: "2026-04-03T22:00:00+00:00", end_date: "2026-04-19T22:00:00+00:00" },
      { description: "Pont de l'Ascension", start_date: "2026-05-13T22:00:00+00:00", end_date: "2026-05-17T22:00:00+00:00" },
      { description: "Vacances d'Été", start_date: "2026-07-03T22:00:00+00:00", end_date: "2026-08-31T22:00:00+00:00" },
    ],
    B: [
      { description: "Vacances de la Toussaint", start_date: "2025-10-17T22:00:00+00:00", end_date: "2025-11-02T23:00:00+00:00" },
      { description: "Vacances de Noël", start_date: "2025-12-19T23:00:00+00:00", end_date: "2026-01-04T23:00:00+00:00" },
      { description: "Vacances d'Hiver", start_date: "2026-02-13T23:00:00+00:00", end_date: "2026-03-01T23:00:00+00:00" },
      { description: "Vacances de Printemps", start_date: "2026-04-10T22:00:00+00:00", end_date: "2026-04-26T22:00:00+00:00" },
      { description: "Pont de l'Ascension", start_date: "2026-05-13T22:00:00+00:00", end_date: "2026-05-17T22:00:00+00:00" },
      { description: "Vacances d'Été", start_date: "2026-07-03T22:00:00+00:00", end_date: "2026-08-31T22:00:00+00:00" },
    ],
    C: [
      { description: "Vacances de la Toussaint", start_date: "2025-10-17T22:00:00+00:00", end_date: "2025-11-02T23:00:00+00:00" },
      { description: "Vacances de Noël", start_date: "2025-12-19T23:00:00+00:00", end_date: "2026-01-04T23:00:00+00:00" },
      { description: "Vacances d'Hiver", start_date: "2026-02-20T23:00:00+00:00", end_date: "2026-03-08T23:00:00+00:00" },
      { description: "Vacances de Printemps", start_date: "2026-04-17T22:00:00+00:00", end_date: "2026-05-03T22:00:00+00:00" },
      { description: "Pont de l'Ascension", start_date: "2026-05-13T22:00:00+00:00", end_date: "2026-05-17T22:00:00+00:00" },
      { description: "Vacances d'Été", start_date: "2026-07-03T22:00:00+00:00", end_date: "2026-08-31T22:00:00+00:00" },
    ],
  },
  "2026-2027": {
    A: [
      { description: "Vacances de la Toussaint", start_date: "2026-10-16T22:00:00+00:00", end_date: "2026-11-01T23:00:00+00:00" },
      { description: "Vacances de Noël", start_date: "2026-12-18T23:00:00+00:00", end_date: "2027-01-03T23:00:00+00:00" },
      { description: "Vacances d'Hiver", start_date: "2027-02-12T23:00:00+00:00", end_date: "2027-02-28T23:00:00+00:00" },
      { description: "Vacances de Printemps", start_date: "2027-04-09T22:00:00+00:00", end_date: "2027-04-25T22:00:00+00:00" },
      { description: "Pont de l'Ascension", start_date: "2027-05-06T22:00:00+00:00", end_date: "2027-05-06T22:00:00+00:00" },
      { description: "Début des Vacances d'Été", start_date: "2027-07-02T22:00:00+00:00", end_date: "2027-07-02T22:00:00+00:00" },
    ],
    B: [
      { description: "Vacances de la Toussaint", start_date: "2026-10-16T22:00:00+00:00", end_date: "2026-11-01T23:00:00+00:00" },
      { description: "Vacances de Noël", start_date: "2026-12-18T23:00:00+00:00", end_date: "2027-01-03T23:00:00+00:00" },
      { description: "Vacances d'Hiver", start_date: "2027-02-19T23:00:00+00:00", end_date: "2027-03-07T23:00:00+00:00" },
      { description: "Vacances de Printemps", start_date: "2027-04-16T22:00:00+00:00", end_date: "2027-05-02T22:00:00+00:00" },
      { description: "Pont de l'Ascension", start_date: "2027-05-06T22:00:00+00:00", end_date: "2027-05-06T22:00:00+00:00" },
      { description: "Début des Vacances d'Été", start_date: "2027-07-02T22:00:00+00:00", end_date: "2027-07-02T22:00:00+00:00" },
    ],
    C: [
      { description: "Vacances de la Toussaint", start_date: "2026-10-16T22:00:00+00:00", end_date: "2026-11-01T23:00:00+00:00" },
      { description: "Vacances de Noël", start_date: "2026-12-18T23:00:00+00:00", end_date: "2027-01-03T23:00:00+00:00" },
      { description: "Vacances d'Hiver", start_date: "2027-02-05T23:00:00+00:00", end_date: "2027-02-21T23:00:00+00:00" },
      { description: "Vacances de Printemps", start_date: "2027-04-02T22:00:00+00:00", end_date: "2027-04-18T22:00:00+00:00" },
      { description: "Pont de l'Ascension", start_date: "2027-05-06T22:00:00+00:00", end_date: "2027-05-06T22:00:00+00:00" },
      { description: "Début des Vacances d'Été", start_date: "2027-07-02T22:00:00+00:00", end_date: "2027-07-02T22:00:00+00:00" },
    ],
  },
};

const API_BASE = "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records";

const nowYear = (() => {
  const y = new Date().getFullYear();
  return Number.isFinite(y) ? y : 2026;
})();

const state = {
  rangeMode: "year",
  year: nowYear,
  startY: nowYear, startM: 0,
  endY: nowYear, endM: 11,
  layout: "month",
  weekStart: 1,
  theme: "grayscale",
  pageSize: "a4",
  orientation: "landscape",
  includeHolidays: true,
  showLegend: true,
  enabledZones: new Set(),
  customPeriods: [],
  removedKeys: new Set(),
  periods: [],
};

const zoneCache = new Map();
let customCounter = 0;
let renderCtx = { holidays: new Map() };

function pad(n) { return String(n).padStart(2, "0"); }
function parseYMD(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12, 0, 0, 0); }
function ymd(dt) { return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`; }
function addDays(dt, n) { return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n, 12, 0, 0, 0); }
function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function truncate(str, widthMm, sizeMm) {
  const maxChars = Math.max(1, Math.floor(widthMm / (sizeMm * 0.55)));
  if (str.length <= maxChars) return str;
  return str.slice(0, Math.max(1, maxChars - 1)) + "…";
}
function theme() { return THEMES.find((x) => x.id === state.theme) || THEMES[0]; }

function computeEaster(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}
function publicHolidays(year) {
  const names = HOLIDAY_NAMES[lang] || HOLIDAY_NAMES.en;
  const map = new Map();
  const easter = computeEaster(year);
  const fixed = [
    [0, 1, "newyear"], [4, 1, "labour"], [4, 8, "victory"], [6, 14, "national"],
    [7, 15, "assumption"], [10, 1, "toussaint"], [10, 11, "armistice"], [11, 25, "christmas"],
  ];
  for (const [m, d, id] of fixed) map.set(ymd(new Date(year, m, d, 12)), names[id]);
  map.set(ymd(addDays(easter, 1)), names.eastermon);
  map.set(ymd(addDays(easter, 39)), names.ascension);
  map.set(ymd(addDays(easter, 50)), names.whitmon);
  return map;
}
function holidayMapForRange(range) {
  const map = new Map();
  for (let y = range.start.getFullYear(); y <= range.end.getFullYear(); y++) {
    publicHolidays(y).forEach((v, k) => map.set(k, v));
  }
  return map;
}

function getRange() {
  if (state.rangeMode === "year") {
    return { start: new Date(state.year, 0, 1, 12), end: new Date(state.year, 11, 31, 12) };
  }
  const start = new Date(state.startY, state.startM, 1, 12);
  const end = new Date(state.endY, state.endM + 1, 0, 12);
  if (start > end) return null;
  return { start, end };
}
function schoolYears(range) {
  const set = new Set();
  let cur = new Date(range.start.getFullYear(), range.start.getMonth(), 1, 12);
  const last = new Date(range.end.getFullYear(), range.end.getMonth(), 1, 12);
  while (cur <= last) {
    const y = cur.getFullYear(), m = cur.getMonth();
    set.add(m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`);
    cur = new Date(y, m + 1, 1, 12);
  }
  return [...set];
}

function parseInterval(rec, zone) {
  const startYMD = addDays(parseYMD(rec.start_date.slice(0, 10)), 1);
  let endYMD = parseYMD(rec.end_date.slice(0, 10));
  if (rec.description.indexOf("Été") !== -1 && rec.start_date.slice(0, 10) === rec.end_date.slice(0, 10)) {
    endYMD = new Date(Number(rec.start_date.slice(0, 4)), 7, 31, 12);
  }
  if (startYMD > endYMD) return null;
  const start = ymd(startYMD), end = ymd(endYMD);
  return { label: rec.description, zone, start, end, key: `${zone}|${start}|${end}` };
}

async function fetchZoneYear(zone, sy) {
  const cacheKey = `${zone}|${sy}`;
  if (zoneCache.has(cacheKey)) return;
  const where = `annee_scolaire="${sy}" and zones="Zone ${zone}" and population in ("-","Élèves")`;
  const url = `${API_BASE}?where=${encodeURIComponent(where)}&select=description,start_date,end_date&limit=100`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const seen = new Set();
    const records = [];
    for (const r of data.results || []) {
      const k = `${r.description}|${r.start_date}|${r.end_date}`;
      if (seen.has(k)) continue;
      seen.add(k);
      records.push({ description: r.description, start_date: r.start_date, end_date: r.end_date });
    }
    zoneCache.set(cacheKey, { records, source: "live" });
  } catch (e) {
    const fallback = EMBEDDED[sy] && EMBEDDED[sy][zone];
    zoneCache.set(cacheKey, { records: fallback || [], source: fallback ? "offline" : "none" });
  }
}

async function loadNeeded() {
  const range = getRange();
  if (!range || state.enabledZones.size === 0) return;
  const years = schoolYears(range);
  const tasks = [];
  for (const zone of state.enabledZones) for (const sy of years) tasks.push(fetchZoneYear(zone, sy));
  await Promise.all(tasks);
}

function zonesStatusText() {
  const el = document.getElementById("zones-status");
  const range = getRange();
  if (!range || state.enabledZones.size === 0) { el.textContent = ""; return; }
  const years = schoolYears(range);
  let live = 0, offline = 0, none = 0;
  const missing = [];
  for (const zone of state.enabledZones) {
    for (const sy of years) {
      const entry = zoneCache.get(`${zone}|${sy}`);
      if (!entry) continue;
      if (entry.source === "live") live++;
      else if (entry.source === "offline") offline++;
      else { none++; if (!missing.includes(sy)) missing.push(sy); }
    }
  }
  if (none > 0 && live === 0 && offline === 0) el.textContent = msgUnavailable(missing.join(", "));
  else if (offline > 0 && live === 0) el.textContent = t("st_offline");
  else if (offline > 0) el.textContent = t("st_mixed");
  else el.textContent = t("st_live");
}

function rebuildPeriods() {
  const range = getRange();
  const periods = [];
  const seen = new Set();
  if (range) {
    const years = schoolYears(range);
    const rEnd = ymd(range.end), rStart = ymd(range.start);
    for (const zone of state.enabledZones) {
      for (const sy of years) {
        const entry = zoneCache.get(`${zone}|${sy}`);
        if (!entry) continue;
        for (const rec of entry.records) {
          const iv = parseInterval(rec, zone);
          if (!iv || state.removedKeys.has(iv.key)) continue;
          if (iv.start > rEnd || iv.end < rStart) continue;
          if (seen.has(iv.key)) continue;
          seen.add(iv.key);
          periods.push(iv);
        }
      }
    }
  }
  for (const cp of state.customPeriods) periods.push(cp);
  periods.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  state.periods = periods;
}

function periodColor(p) { return p.zone ? theme().zones[p.zone] : (p.color || CUSTOM_COLOR); }
function findPeriod(key) {
  for (const p of state.periods) if (p.start <= key && key <= p.end) return p;
  return null;
}

function svgBackend(wmm, hmm) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${wmm} ${hmm}`);
  svg.setAttribute("class", "page-svg");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const bg = document.createElementNS(NS, "rect");
  bg.setAttribute("x", 0); bg.setAttribute("y", 0);
  bg.setAttribute("width", wmm); bg.setAttribute("height", hmm);
  bg.setAttribute("fill", "#ffffff");
  svg.appendChild(bg);
  return {
    node: svg, w: wmm, h: hmm,
    rect(x, y, w, h, o = {}) {
      if (w <= 0 || h <= 0) return;
      const r = document.createElementNS(NS, "rect");
      r.setAttribute("x", x); r.setAttribute("y", y);
      r.setAttribute("width", w); r.setAttribute("height", h);
      r.setAttribute("fill", o.fill || "none");
      if (o.stroke) { r.setAttribute("stroke", o.stroke); r.setAttribute("stroke-width", o.lineWidth == null ? 0.2 : o.lineWidth); }
      svg.appendChild(r);
    },
    line(x1, y1, x2, y2, o = {}) {
      const l = document.createElementNS(NS, "line");
      l.setAttribute("x1", x1); l.setAttribute("y1", y1);
      l.setAttribute("x2", x2); l.setAttribute("y2", y2);
      l.setAttribute("stroke", o.stroke || "#000");
      l.setAttribute("stroke-width", o.lineWidth == null ? 0.2 : o.lineWidth);
      svg.appendChild(l);
    },
    text(x, y, str, o = {}) {
      const el = document.createElementNS(NS, "text");
      el.setAttribute("x", x); el.setAttribute("y", y);
      el.setAttribute("font-size", o.size || 3);
      el.setAttribute("fill", o.color || "#000");
      el.setAttribute("font-family", "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif");
      if (o.bold) el.setAttribute("font-weight", "700");
      el.setAttribute("text-anchor", o.align === "center" ? "middle" : o.align === "right" ? "end" : "start");
      el.setAttribute("dominant-baseline", o.valign === "middle" ? "central" : o.valign === "top" ? "text-before-edge" : "alphabetic");
      el.textContent = str;
      svg.appendChild(el);
    },
  };
}

function pdfBackend(doc) {
  const MM2PT = 2.834645;
  return {
    w: doc.internal.pageSize.getWidth(),
    h: doc.internal.pageSize.getHeight(),
    rect(x, y, w, h, o = {}) {
      if (w <= 0 || h <= 0) return;
      let style = "";
      if (o.fill) { const c = hexToRgb(o.fill); doc.setFillColor(c.r, c.g, c.b); style += "F"; }
      if (o.stroke) { const c = hexToRgb(o.stroke); doc.setDrawColor(c.r, c.g, c.b); doc.setLineWidth(o.lineWidth == null ? 0.2 : o.lineWidth); style = style ? "FD" : "S"; }
      if (!style) return;
      doc.rect(x, y, w, h, style);
    },
    line(x1, y1, x2, y2, o = {}) {
      const c = hexToRgb(o.stroke || "#000");
      doc.setDrawColor(c.r, c.g, c.b);
      doc.setLineWidth(o.lineWidth == null ? 0.2 : o.lineWidth);
      doc.line(x1, y1, x2, y2);
    },
    text(x, y, str, o = {}) {
      const c = hexToRgb(o.color || "#000");
      doc.setTextColor(c.r, c.g, c.b);
      doc.setFont("helvetica", o.bold ? "bold" : "normal");
      doc.setFontSize((o.size || 3) * MM2PT);
      const baseline = o.valign === "middle" ? "middle" : o.valign === "top" ? "top" : "alphabetic";
      doc.text(str, x, y, { align: o.align || "left", baseline });
    },
  };
}

const MARGIN = 12;

function legendItems() {
  const th = theme();
  const items = [{ color: th.weekendBg, label: t("legend_weekend") }];
  if (state.includeHolidays) items.push({ color: th.holidayBg, label: t("legend_holiday") });
  for (const z of ["A", "B", "C"]) if (state.enabledZones.has(z)) items.push({ color: th.zones[z], label: "Zone " + z });
  if (state.customPeriods.length) items.push({ color: CUSTOM_COLOR, label: t("legend_other") });
  return items;
}

function drawLegend(be, x, y, w) {
  const th = theme();
  const size = 2.4;
  let cx = x;
  for (const it of legendItems()) {
    if (cx > x + w - 20) break;
    be.rect(cx, y - 2.6, 3, 3, { fill: it.color, stroke: th.grid, lineWidth: 0.15 });
    be.text(cx + 4, y, it.label, { size, color: th.ink, valign: "alphabetic" });
    cx += 5 + it.label.length * size * 0.62 + 4;
  }
}

function cellStatusFill(key, dow) {
  const th = theme();
  if (state.includeHolidays && renderCtx.holidays.has(key)) return th.holidayBg;
  const p = findPeriod(key);
  if (p) return periodColor(p);
  if (dow === 0 || dow === 6) return th.weekendBg;
  return null;
}

function drawMonthPage(be, year, month) {
  const th = theme();
  const w = be.w, h = be.h;
  const inW = w - 2 * MARGIN;
  let cy = MARGIN;

  be.text(w / 2, cy + 7, `${capitalize(MONTHS[lang][month])} ${year}`, { size: 7, bold: true, color: th.ink, align: "center", valign: "alphabetic" });
  cy += 11;

  const colW = inW / 7;
  const headerH = 7;
  be.rect(MARGIN, cy, inW, headerH, { fill: th.headerBg });
  for (let c = 0; c < 7; c++) {
    const dow = (state.weekStart + c) % 7;
    be.text(MARGIN + colW * (c + 0.5), cy + headerH / 2, WD_SHORT[lang][dow], { size: 3, bold: true, color: th.headerInk, align: "center", valign: "middle" });
  }
  be.rect(MARGIN, cy, inW, headerH, { stroke: th.grid });
  for (let c = 1; c < 7; c++) be.line(MARGIN + colW * c, cy, MARGIN + colW * c, cy + headerH, { stroke: th.grid });
  cy += headerH;

  const legendH = state.showLegend ? 7 : 0;
  const gridTop = cy;
  const gridH = h - MARGIN - legendH - gridTop;

  const first = new Date(year, month, 1, 12);
  const startOffset = (first.getDay() - state.weekStart + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rows = Math.ceil((startOffset + daysInMonth) / 7);
  const cellH = gridH / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 7; c++) {
      const x = MARGIN + c * colW;
      const y = gridTop + r * cellH;
      const idx = r * 7 + c;
      const dayNum = idx - startOffset + 1;
      if (dayNum >= 1 && dayNum <= daysInMonth) {
        const key = ymd(new Date(year, month, dayNum, 12));
        const dow = (state.weekStart + c) % 7;
        const fill = cellStatusFill(key, dow);
        if (fill) be.rect(x, y, colW, cellH, { fill });
        be.rect(x, y, colW, cellH, { stroke: th.grid });
        be.text(x + 1.6, y + 1.6, String(dayNum), { size: 3.6, color: th.ink, valign: "top" });
        const hol = state.includeHolidays ? renderCtx.holidays.get(key) : null;
        if (hol) be.text(x + 1.6, y + cellH - 1.6, truncate(hol, colW - 2.5, 2), { size: 2, color: th.holidayInk, valign: "alphabetic" });
      } else {
        be.rect(x, y, colW, cellH, { stroke: th.grid });
      }
    }
  }
  if (state.showLegend) drawLegend(be, MARGIN, h - MARGIN - 1.5, inW);
}

function drawWeekPage(be, weekStartDate) {
  const th = theme();
  const w = be.w, h = be.h;
  const inW = w - 2 * MARGIN;
  const days = [];
  for (let i = 0; i < 7; i++) days.push(addDays(weekStartDate, i));

  let cy = MARGIN;
  be.text(MARGIN, cy + 6, weekTitle(days[0], days[6]), { size: 6, bold: true, color: th.ink, valign: "alphabetic" });
  cy += 11;

  const top = cy;
  const rowH = (h - MARGIN - top) / 7;
  const labelW = 34;

  for (let i = 0; i < 7; i++) {
    const date = days[i];
    const y = top + i * rowH;
    const key = ymd(date);
    const dow = date.getDay();
    const fill = cellStatusFill(key, dow);
    if (fill) be.rect(MARGIN, y, labelW, rowH, { fill });
    be.rect(MARGIN, y, inW, rowH, { stroke: th.grid });
    be.rect(MARGIN, y, labelW, rowH, { stroke: th.grid });

    be.text(MARGIN + 2.5, y + 5, WD_FULL[lang][dow], { size: 3.2, bold: true, color: th.ink, valign: "alphabetic" });
    be.text(MARGIN + 2.5, y + 12, `${date.getDate()} ${MONTHS[lang][date.getMonth()].slice(0, 4)}.`, { size: 5, bold: true, color: th.ink, valign: "alphabetic" });
    const hol = state.includeHolidays ? renderCtx.holidays.get(key) : null;
    if (hol) be.text(MARGIN + 2.5, y + rowH - 3, truncate(hol, labelW - 3, 2.2), { size: 2.2, color: th.holidayInk, valign: "alphabetic" });

    const lineCount = Math.max(2, Math.floor((rowH - 6) / 7));
    const gap = (rowH - 4) / (lineCount + 1);
    for (let k = 1; k <= lineCount; k++) {
      const ly = y + gap * k + 2;
      be.line(MARGIN + labelW + 3, ly, MARGIN + inW - 3, ly, { stroke: th.grid, lineWidth: 0.15 });
    }
  }
}

function getPageDims() {
  let dims = state.pageSize === "letter" ? [215.9, 279.4] : [210, 297];
  if (state.orientation === "landscape") dims = [dims[1], dims[0]];
  return { w: dims[0], h: dims[1] };
}

function buildPages() {
  const range = getRange();
  if (!range) return [];
  const pages = [];
  if (state.layout === "month") {
    let cur = new Date(range.start.getFullYear(), range.start.getMonth(), 1, 12);
    const last = new Date(range.end.getFullYear(), range.end.getMonth(), 1, 12);
    while (cur <= last) {
      pages.push({ type: "month", year: cur.getFullYear(), month: cur.getMonth() });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1, 12);
    }
  } else {
    const offset = (range.start.getDay() - state.weekStart + 7) % 7;
    let cur = addDays(range.start, -offset);
    while (cur <= range.end) { pages.push({ type: "week", start: cur }); cur = addDays(cur, 7); }
  }
  return pages;
}

function drawPage(be, page) {
  if (page.type === "month") drawMonthPage(be, page.year, page.month);
  else drawWeekPage(be, page.start);
}

function prepareRenderCtx() {
  const range = getRange();
  renderCtx = { holidays: range ? holidayMapForRange(range) : new Map() };
}

let resizeTimer = null;
function renderPreview() {
  const container = document.getElementById("pages-preview");
  const note = document.getElementById("preview-note");
  container.innerHTML = "";
  const range = getRange();
  if (!range) {
    note.textContent = t("st_invalidrange");
    return;
  }
  prepareRenderCtx();
  const dims = getPageDims();
  const allPages = buildPages();
  const MAX = 6;
  const pages = allPages.slice(0, MAX);

  const cw = container.clientWidth || 600;
  const perRow = cw > 680 && dims.w <= dims.h ? 2 : 1;
  const sheetW = Math.min(340, Math.floor((cw - 20 * (perRow - 1)) / perRow));
  container.style.setProperty("--sheet-w", sheetW + "px");

  for (const page of pages) {
    const be = svgBackend(dims.w, dims.h);
    drawPage(be, page);
    container.appendChild(be.node);
  }
  note.textContent = allPages.length > pages.length ? msgShowing(pages.length, allPages.length) : msgPageCount(allPages.length);
}

function exportPDF() {
  const status = document.getElementById("status-msg");
  const range = getRange();
  if (!range) { status.textContent = t("st_invalidexport"); return; }
  const pages = buildPages();
  if (!pages.length) { status.textContent = t("st_nothing"); return; }

  prepareRenderCtx();
  const { jsPDF } = window.jspdf;
  const format = state.pageSize === "letter" ? "letter" : "a4";
  const doc = new jsPDF({ unit: "mm", format, orientation: state.orientation });
  pages.forEach((page, i) => {
    if (i > 0) doc.addPage(format, state.orientation);
    drawPage(pdfBackend(doc), page);
  });

  let name;
  if (state.rangeMode === "year") name = `${t("file_prefix")}-${state.year}`;
  else name = `${t("file_prefix")}-${state.startY}-${pad(state.startM + 1)}_${state.endY}-${pad(state.endM + 1)}`;
  doc.save(`${name}-${state.layout === "month" ? t("file_monthly") : t("file_weekly")}.pdf`);
  status.textContent = msgExported(pages.length);
}

function renderPeriodList() {
  const list = document.getElementById("period-list");
  const tpl = document.getElementById("period-item-template");
  list.innerHTML = "";
  for (const p of state.periods) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".period-swatch").style.background = periodColor(p);
    const label = p.zone ? `Zone ${p.zone} — ${translateVacation(p.label)}` : p.label;
    node.querySelector(".period-text").textContent = `${label} (${p.start} → ${p.end})`;
    node.querySelector(".remove-period-btn").addEventListener("click", () => {
      if (p.zone) state.removedKeys.add(p.key);
      else state.customPeriods = state.customPeriods.filter((c) => c.key !== p.key);
      rebuildPeriods();
      renderPeriodList();
      renderPreview();
    });
    list.appendChild(node);
  }
}

function updateSpec() {
  const parts = [];
  parts.push(state.pageSize === "letter" ? "Letter" : "A4");
  parts.push(state.layout === "month" ? t("spec_monthly") : t("spec_weekly"));
  if (state.rangeMode === "year") parts.push(String(state.year));
  else parts.push(`${capitalize(MONTHS[lang][state.startM])} ${state.startY} → ${capitalize(MONTHS[lang][state.endM])} ${state.endY}`);
  parts.push(state.weekStart === 1 ? t("spec_monstart") : t("spec_sunstart"));
  document.getElementById("spec-line").textContent = parts.join(" · ");
}

function refresh() {
  rebuildPeriods();
  renderPeriodList();
  zonesStatusText();
  updateSpec();
  renderPreview();
}

async function refreshWithFetch() {
  const status = document.getElementById("zones-status");
  if (state.enabledZones.size > 0) status.textContent = t("st_loading");
  await loadNeeded();
  refresh();
}

function applyI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll(".theme-swatch").forEach((btn) => {
    const labelEl = btn.querySelector(".swatch-label");
    if (labelEl) labelEl.textContent = t("theme_" + btn.dataset.theme);
  });
  document.querySelectorAll(".lang-btn").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.lang === lang)));
  setMonthOptionLabels();
}

function setMonthOptionLabels() {
  for (const id of ["start-month", "end-month"]) {
    const sel = document.getElementById(id);
    if (!sel) continue;
    [...sel.options].forEach((o, i) => { o.textContent = capitalize(MONTHS[lang][i]); });
  }
}

function buildThemeSwatches() {
  const wrap = document.getElementById("theme-swatches");
  for (const th of THEMES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-swatch";
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", String(th.id === state.theme));
    btn.dataset.theme = th.id;
    const strip = document.createElement("span");
    strip.className = "swatch-strip";
    for (const c of th.strip) { const s = document.createElement("span"); s.style.background = c; strip.appendChild(s); }
    const label = document.createElement("span");
    label.className = "swatch-label";
    label.textContent = t("theme_" + th.id);
    btn.appendChild(strip);
    btn.appendChild(label);
    btn.addEventListener("click", () => {
      state.theme = th.id;
      wrap.querySelectorAll(".theme-swatch").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.theme === th.id)));
      refresh();
    });
    wrap.appendChild(btn);
  }
}

function populateSelects() {
  const yearSel = document.getElementById("year-select");
  const startYear = document.getElementById("start-year");
  const endYear = document.getElementById("end-year");
  for (let y = nowYear - 3; y <= nowYear + 6; y++) {
    for (const sel of [yearSel, startYear, endYear]) {
      const o = document.createElement("option");
      o.value = String(y); o.textContent = String(y);
      sel.appendChild(o);
    }
  }
  yearSel.value = String(state.year);
  startYear.value = String(state.startY);
  endYear.value = String(state.endY);

  const startMonth = document.getElementById("start-month");
  const endMonth = document.getElementById("end-month");
  MONTHS.en.forEach((_, i) => {
    const o1 = document.createElement("option"); o1.value = String(i); startMonth.appendChild(o1);
    const o2 = document.createElement("option"); o2.value = String(i); endMonth.appendChild(o2);
  });
  startMonth.value = String(state.startM);
  endMonth.value = String(state.endM);
  setMonthOptionLabels();
}

function wireEvents() {
  document.querySelectorAll('input[name="range-mode"]').forEach((el) =>
    el.addEventListener("change", (e) => {
      state.rangeMode = e.target.value;
      document.getElementById("year-fields").hidden = state.rangeMode !== "year";
      document.getElementById("months-fields").hidden = state.rangeMode !== "months";
      refreshWithFetch();
    })
  );
  document.getElementById("year-select").addEventListener("change", (e) => { state.year = Number(e.target.value); refreshWithFetch(); });
  document.getElementById("start-year").addEventListener("change", (e) => { state.startY = Number(e.target.value); refreshWithFetch(); });
  document.getElementById("end-year").addEventListener("change", (e) => { state.endY = Number(e.target.value); refreshWithFetch(); });
  document.getElementById("start-month").addEventListener("change", (e) => { state.startM = Number(e.target.value); refreshWithFetch(); });
  document.getElementById("end-month").addEventListener("change", (e) => { state.endM = Number(e.target.value); refreshWithFetch(); });

  document.querySelectorAll('input[name="layout"]').forEach((el) => el.addEventListener("change", (e) => { state.layout = e.target.value; refresh(); }));
  document.querySelectorAll('input[name="week-start"]').forEach((el) => el.addEventListener("change", (e) => { state.weekStart = Number(e.target.value); refresh(); }));
  document.getElementById("page-size").addEventListener("change", (e) => { state.pageSize = e.target.value; refresh(); });
  document.querySelectorAll('input[name="orientation"]').forEach((el) => el.addEventListener("change", (e) => { state.orientation = e.target.value; refresh(); }));
  document.getElementById("include-holidays").addEventListener("change", (e) => { state.includeHolidays = e.target.checked; refresh(); });
  document.getElementById("show-legend").addEventListener("change", (e) => { state.showLegend = e.target.checked; refresh(); });

  document.querySelectorAll(".zone-toggle").forEach((el) =>
    el.addEventListener("change", (e) => {
      const zone = e.target.value;
      if (e.target.checked) state.enabledZones.add(zone);
      else {
        state.enabledZones.delete(zone);
        [...state.removedKeys].forEach((k) => { if (k.startsWith(zone + "|")) state.removedKeys.delete(k); });
      }
      refreshWithFetch();
    })
  );

  document.getElementById("add-period-btn").addEventListener("click", () => {
    const labelEl = document.getElementById("custom-label");
    const startEl = document.getElementById("custom-start");
    const endEl = document.getElementById("custom-end");
    const status = document.getElementById("zones-status");
    if (!startEl.value || !endEl.value) { status.textContent = t("st_pickdates"); return; }
    let start = startEl.value, end = endEl.value;
    if (start > end) { const tmp = start; start = end; end = tmp; }
    customCounter++;
    state.customPeriods.push({ label: labelEl.value.trim() || t("default_period"), start, end, color: CUSTOM_COLOR, key: `custom-${customCounter}` });
    labelEl.value = ""; startEl.value = ""; endEl.value = "";
    refresh();
  });

  document.getElementById("export-btn").addEventListener("click", exportPDF);

  document.querySelectorAll(".lang-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      lang = btn.dataset.lang === "fr" ? "fr" : "en";
      applyI18n();
      refresh();
    })
  );

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderPreview, 150);
  });
}

function init() {
  buildThemeSwatches();
  populateSelects();
  wireEvents();
  applyI18n();
  refresh();
}

init();
