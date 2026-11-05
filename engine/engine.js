(function () {
// engine.js: deterministic synthetic-data engine. Plain JS, no dependencies.
// Sections are appended above the EXPORT line by later tasks.

// ===== SECTION: constants, PRNG, clock =====
const SEED = 42;
const BASE_EPOCH = 1793714400; // 2026-11-03T14:00:00Z
const STREAM_INDEX = 1; // Stargate

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const makeRng = (salt = 0) => mulberry32(SEED + STREAM_INDEX * 1000 + salt);

const rngPick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const rngRange = (rng, min, max) => min + rng() * (max - min);
const rngGauss = (rng) => { // Box-Muller, mean 0, sd 1
  const u = Math.max(rng(), 1e-12), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const round = (x, dp) => Math.round(x * 10 ** dp) / 10 ** dp;

const pad2 = (n) => (n < 10 ? "0" : "") + n;

// Epoch seconds -> "YYYY-MM-DDTHH:MM:SSZ" using integer civil-date math (no Date).
function isoFromEpoch(epochSeconds) {
  const s = Math.floor(epochSeconds);
  const days = Math.floor(s / 86400);
  const sod = s - days * 86400;
  // days since 1970-01-01 -> civil date (Howard Hinnant's algorithm)
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  const hh = Math.floor(sod / 3600);
  const mm = Math.floor((sod % 3600) / 60);
  const ss = sod % 60;
  return y + "-" + pad2(m) + "-" + pad2(d) + "T" + pad2(hh) + ":" + pad2(mm) + ":" + pad2(ss) + "Z";
}

// ===== SECTION: contract =====
const PATIENT_POOL_SIZE = 40;

const deepFreeze = (o) => {
  Object.values(o).forEach((v) => { if (v && typeof v === "object") deepFreeze(v); });
  return Object.freeze(o);
};

const CONTRACT = deepFreeze({
  fields: [
    { name: "patient_id", type: "string", rule: "^SGH-P-\\d{6}$", sensitive: true },
    { name: "patient_name", type: "string", rule: "free text", sensitive: true },
    { name: "patient_zip5", type: "string", rule: "^\\d{5}$", sensitive: true },
    { name: "birth_date", type: "string", rule: "YYYY-MM-DD", sensitive: true },
    { name: "encounter_epoch", type: "int", rule: "unix seconds UTC", sensitive: true },
    { name: "vital_sequence", type: "int", rule: "at least 1, increments per patient", sensitive: false },
    { name: "vital_code", type: "enum", rule: "8867-4, 8480-6, 59408-5, 8310-5", sensitive: false },
    { name: "vital_value", type: "float", rule: "by code, 1 dp", sensitive: false },
    { name: "unit", type: "enum", rule: "/min, mm[Hg], %, Cel; must match code", sensitive: false },
    { name: "cipher_suite", type: "enum", rule: "TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256", sensitive: false },
  ],
  primaryKey: ["patient_id", "vital_sequence"],
  entityField: "patient_id",
  epochField: "encounter_epoch",
  driftField: "vital_value",
  goldenRows: [
    {"patient_id":"SGH-P-004821","patient_name":"Avery Lindqvist","patient_zip5":"55102","birth_date":"1958-03-14","encounter_epoch":1793714400,"vital_sequence":1,"vital_code":"8867-4","vital_value":88,"unit":"/min","cipher_suite":"TLS_AES_256_GCM_SHA384"},
    {"patient_id":"SGH-P-009317","patient_name":"Marcus Oyelaran","patient_zip5":"55455","birth_date":"1991-07-22","encounter_epoch":1793714700,"vital_sequence":1,"vital_code":"8480-6","vital_value":146,"unit":"mm[Hg]","cipher_suite":"TLS_AES_256_GCM_SHA384"},
    {"patient_id":"SGH-P-001156","patient_name":"Eleanor Brandvold","patient_zip5":"69201","birth_date":"1934-01-09","encounter_epoch":1793715000,"vital_sequence":1,"vital_code":"59408-5","vital_value":91,"unit":"%","cipher_suite":"TLS_CHACHA20_POLY1305_SHA256"},
    {"patient_id":"SGH-P-012004","patient_name":"Diego Ramirez-Holt","patient_zip5":"10001","birth_date":"2004-11-30","encounter_epoch":1793715300,"vital_sequence":1,"vital_code":"8310-5","vital_value":38.4,"unit":"Cel","cipher_suite":"TLS_AES_256_GCM_SHA384"},
    {"patient_id":"SGH-P-007730","patient_name":"Priya Natarajan","patient_zip5":"60614","birth_date":"1976-05-02","encounter_epoch":1793715600,"vital_sequence":1,"vital_code":"8867-4","vital_value":72,"unit":"/min","cipher_suite":"TLS_CHACHA20_POLY1305_SHA256"},
  ],
  names: {
    bronze: "bronze_stargate_vitals",
    silver: "silver_vital_observation",
    gold: ["fct_vital_observation", "dim_patient", "dim_vital_code", "fct_census_daily"],
    kpis: ["Bed Occupancy", "Abnormal Vital Rate", "Avg Length of Stay", "30-Day Readmission Rate"],
  },
  thresholds: {
    heart_rate: { above: 100, below: 50 },
    systolic_bp: { above: 140 },
    spo2: { below: 92 },
    temperature: { atLeast: 38.0 },
  },
  vitalCodes: [
    { code: "8867-4", name: "heart rate", unit: "/min", min: 55, max: 125 },
    { code: "8480-6", name: "systolic BP", unit: "mm[Hg]", min: 95, max: 165 },
    { code: "59408-5", name: "SpO2", unit: "%", min: 88, max: 100 },
    { code: "8310-5", name: "body temperature", unit: "Cel", min: 36.0, max: 39.2 },
  ],
  facility: { beds_staffed: 400 },
});

const getContract = () => JSON.parse(JSON.stringify(CONTRACT));

// A row is evaluable only with a known vital code and a finite numeric value (not a string, null or NaN).
function isEvaluable(row) {
  if (row === null || typeof row !== "object") return false;
  const v = row.vital_value;
  return CONTRACT.vitalCodes.some((c) => c.code === row.vital_code) && typeof v === "number" && Number.isFinite(v);
}

// Not-evaluable rows are never abnormal.
function isAbnormal(row) {
  if (!isEvaluable(row)) return false;
  const v = row.vital_value, t = CONTRACT.thresholds;
  switch (row.vital_code) {
    case "8867-4": return v > t.heart_rate.above || v < t.heart_rate.below;
    case "8480-6": return v > t.systolic_bp.above;
    case "59408-5": return v < t.spo2.below;
    case "8310-5": return v >= t.temperature.atLeast;
    default: return false;
  }
}

// ===== SECTION: patient pool and export generator =====
const FIRST_NAMES = ["Alma", "Bram", "Celia", "Dario", "Esme", "Felix", "Greta", "Hugo", "Ingrid", "Jonas",
  "Kira", "Leif", "Mina", "Nolan", "Odette", "Pavel", "Quinn", "Rosa", "Soren", "Tamsin",
  "Ulrich", "Vera", "Wendell", "Xia", "Yusuf", "Zara"];
const SURNAMES = ["Abernathy", "Brightwater", "Castellano", "Dunmore", "Eriksen", "Fairbanks", "Galloway", "Hollis",
  "Ibarra", "Jorgensen", "Kowalczyk", "Lennox", "Marchetti", "Nakamura", "Okafor", "Pemberton",
  "Quillen", "Rasmussen", "Sandoval", "Thorne", "Underhill", "Vasquez", "Whitlock", "Yamada"];
const ZIP_LIST = ["55101", "55104", "55407", "55414", "55901", "56301", "58102", "57104", "68102", "50309",
  "53202", "60601", "46204", "48201", "43215", "10027", "02115", "30303", "73301", "98101"];
const CIPHERS = ["TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256"];
const CODE_CYCLE = CONTRACT.vitalCodes.map((c) => c.code);
const EXPORT_ROWS = 20;
const EXPORT_PERIOD = 900;
const GOLDEN_COUNT = CONTRACT.goldenRows.length;

function buildPatientPool() {
  const rng = makeRng(1);
  const pool = CONTRACT.goldenRows.map((g) => ({
    patient_id: g.patient_id, patient_name: g.patient_name, patient_zip5: g.patient_zip5, birth_date: g.birth_date,
  }));
  const used = new Set(pool.map((p) => p.patient_id));
  for (let i = GOLDEN_COUNT; i < PATIENT_POOL_SIZE; i++) {
    let id;
    do {
      id = "SGH-P-" + String(100000 + Math.floor(rng() * 900000));
    } while (used.has(id));
    used.add(id);
    const name = rngPick(rng, FIRST_NAMES) + " " + rngPick(rng, SURNAMES);
    const zip = rngPick(rng, ZIP_LIST);
    // Ages 18-95 on 2026-11-03. The first generated patient is forced to 90+.
    const year = i === GOLDEN_COUNT ? 1932 + Math.floor(rng() * 4) : 1931 + Math.floor(rng() * 77);
    const month = 1 + Math.floor(rng() * 12);
    const day = 1 + Math.floor(rng() * 28);
    const birth = year + "-" + pad2(month) + "-" + pad2(day);
    pool.push({ patient_id: id, patient_name: name, patient_zip5: zip, birth_date: birth });
  }
  return pool;
}

const exportRunEpoch = (n) => BASE_EPOCH + 1800 + (n - 1) * EXPORT_PERIOD;

// Per-(n, row) streams, so any export derives from the seed alone.
// Salts in use: 1 = patient pool and per-row stream (cipher), 2 = fault injector, 4 = KPI history,
// 5 = study tokens (reserved for the Brain, not used in this file),
// 6 = abnormal/normal draw (then the value index inside the chosen region).
function rowRng(n, rowIndex, salt = 1) {
  const base = Math.floor(makeRng(salt)() * 4294967296);
  return mulberry32((base ^ Math.imul(n, 0x9E3779B1) ^ Math.imul(rowIndex + 1, 0x85EBCA6B)) >>> 0);
}

// Value regions per vital code, derived from the contract range and thresholds. Integer grid for all
// codes except temperature (0.1 grid). abnormal is a list of [lo, hi] bands clipped to the plausible range.
const GRID_STEP = (code) => (code === "8310-5" ? 0.1 : 1);
const THRESHOLD_KEY = { "8867-4": "heart_rate", "8480-6": "systolic_bp", "59408-5": "spo2", "8310-5": "temperature" };
function vitalRegions(code) {
  const vc = CONTRACT.vitalCodes.find((c) => c.code === code);
  const t = CONTRACT.thresholds[THRESHOLD_KEY[code]];
  const step = GRID_STEP(code), dp = step < 1 ? 1 : 0;
  const clip = (lo, hi) => [Math.max(vc.min, round(lo, dp)), Math.min(vc.max, round(hi, dp))];
  const abnormal = [];
  let nLo = vc.min, nHi = vc.max;
  if (t.below !== undefined) { abnormal.push(clip(vc.min, t.below - step)); nLo = t.below; }
  if (t.above !== undefined) { abnormal.push(clip(t.above + step, vc.max)); nHi = t.above; }
  if (t.atLeast !== undefined) { abnormal.push(clip(t.atLeast, vc.max)); nHi = t.atLeast - step; }
  return { normal: clip(nLo, nHi), abnormal: abnormal.filter(([lo, hi]) => lo <= hi) };
}

// Uniform draw over the grid points of the given bands, one draw from rng.
function drawFromBands(rng, bands, code) {
  const step = GRID_STEP(code), dp = step < 1 ? 1 : 0;
  const counts = bands.map(([lo, hi]) => Math.round((hi - lo) / step) + 1);
  let idx = Math.floor(rng() * counts.reduce((a, b) => a + b, 0));
  for (let i = 0; i < bands.length; i++) {
    if (idx < counts[i]) return round(bands[i][0] + idx * step, dp);
    idx -= counts[i];
  }
  return bands[0][0];
}

// Share of generated rows that are abnormal: the history's 7-day Abnormal Vital Rate as a fraction.
let abnormalShareCache = null;
function abnormalShare() {
  if (abnormalShareCache === null) abnormalShareCache = computeKpis(getHistory()).find((k) => k.name === "Abnormal Vital Rate").value;
  return abnormalShareCache;
}

function assertScenario(s) {
  if (s !== "healthy" && s !== "incident") throw new Error("scenario must be 'healthy' or 'incident'");
}

// NOTE: generateExport (through abnormalShare -> computeKpis(getHistory())) depends on HISTORY_DAYS and
// historyCache, which are defined LATER in this file (KPI history section). A top-level call to generateExport
// or abnormalShare placed above them would throw at load time (temporal dead zone). Call it only inside functions.
function generateExport(n, scenario, opts) {
  assertScenario(scenario);
  const faultExports = opts && Array.isArray(opts.faultExports) ? opts.faultExports : scenario === "incident" ? [3] : [];
  const pool = buildPatientPool();
  const runEpoch = exportRunEpoch(n);
  const block = (n - 1) % 2;
  const appearance = Math.floor((n - 1) / 2) + 1; // 1-based count of this patient's appearances
  const rows = [];
  for (let r = 0; r < EXPORT_ROWS; r++) {
    if (n === 1 && r < GOLDEN_COUNT) {
      rows.push({ ...CONTRACT.goldenRows[r] });
      continue;
    }
    const pi = block * EXPORT_ROWS + r;
    const p = pool[pi];
    const rng = rowRng(n, r);
    const startIdx = pi < GOLDEN_COUNT ? CODE_CYCLE.indexOf(CONTRACT.goldenRows[pi].vital_code) : pi % 4;
    const vc = CONTRACT.vitalCodes[(startIdx + appearance - 1) % 4];
    let epoch;
    if (n === 1) { // 15 generated rows spread evenly across 14:20-14:30
      epoch = BASE_EPOCH + 1200 + Math.round(((r - GOLDEN_COUNT) * 600) / (EXPORT_ROWS - GOLDEN_COUNT - 1));
    } else {
      epoch = runEpoch - EXPORT_PERIOD + Math.round((r * EXPORT_PERIOD) / (EXPORT_ROWS - 1));
    }
    // Two draws are still consumed here so the cipher pick below keeps its old stream position.
    rngGauss(rng);
    const pick = rowRng(n, r, 6); // salt 6: abnormal/normal decided first, then the value inside that region
    const regions = vitalRegions(vc.code);
    const abnormalRow = pick() < abnormalShare();
    const v = drawFromBands(pick, abnormalRow ? regions.abnormal : [regions.normal], vc.code);
    rows.push({
      patient_id: p.patient_id,
      patient_name: p.patient_name,
      patient_zip5: p.patient_zip5,
      birth_date: p.birth_date,
      encounter_epoch: epoch,
      vital_sequence: appearance,
      vital_code: vc.code,
      vital_value: v,
      unit: vc.unit,
      cipher_suite: rngPick(rng, CIPHERS),
    });
  }
  if (faultExports.includes(n)) applyFaults(rows);
  return { n, runEpoch, rows };
}

// ===== SECTION: fault injector =====
const REPAIRABLE_ROWS = [2, 6, 10, 15, 19]; // 1-based: schema drift, repairable
const HARD_FAIL_ROWS = [4, 9, 13, 17]; // 1-based: hard failures, never repairable

const toCamel = (k) => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const CAMEL_TO_SNAKE = Object.fromEntries(CONTRACT.fields.map((f) => [toCamel(f.name), f.name]));

// Positions are fixed. The salt-2 stream only picks the heart-rate value on the mmHg fault row.
function applyFaults(rows) {
  const rng = makeRng(2);
  const hr = CONTRACT.vitalCodes[0];
  const [a, b, c, d] = HARD_FAIL_ROWS.map((p) => rows[p - 1]);
  a.patient_id = null;
  b.vital_code = "59408-5"; b.unit = "%"; b.vital_value = 130;
  c.patient_id = "'; DROP TABLE silver_vital_observation;--";
  d.vital_code = hr.code; d.unit = "mmHg"; d.vital_value = Math.round(rngRange(rng, hr.min, hr.max));
  REPAIRABLE_ROWS.forEach((p) => {
    const row = rows[p - 1], out = {};
    for (const [k, v] of Object.entries(row)) out[toCamel(k)] = k === "vital_value" ? String(v) : v;
    rows[p - 1] = out;
  });
}

function repairRow(row) {
  if (!isObj(row)) return row;
  const keys = Object.keys(row);
  if (!keys.length || !keys.every((k) => k in CAMEL_TO_SNAKE)) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[CAMEL_TO_SNAKE[k]] = CAMEL_TO_SNAKE[k] === "vital_value" ? Number(v) : v;
  return out;
}

// ===== SECTION: quality tests =====
const FIELD_NAMES = CONTRACT.fields.map((f) => f.name);
const FRESHNESS_WINDOW = 24 * 3600;
const isNil = (v) => v === null || v === undefined;
const isObj = (r) => r !== null && typeof r === "object" && !Array.isArray(r);
const codeSpec = (code) => (typeof code === "string" ? CONTRACT.vitalCodes.find((c) => c.code === code) : undefined);
const ENUMS = {
  vital_code: CONTRACT.vitalCodes.map((c) => c.code),
  unit: CONTRACT.vitalCodes.map((c) => c.unit),
  cipher_suite: CIPHERS,
};
const PATTERNS = {
  patient_id: /^SGH-P-\d{6}$/,
  patient_zip5: /^\d{5}$/,
  birth_date: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
};
const keyOf = (r) => {
  const [a, b] = CONTRACT.primaryKey;
  return isNil(r[a]) || isNil(r[b]) ? null : r[a] + "|" + r[b];
};

// Each check: (rows, ctx) -> failing row indexes for one column. Null/missing values are skipped
// where not_null already reports them.
const rowsWhere = (rows, fn) => { const out = []; rows.forEach((r, i) => { if (fn(r, i)) out.push(i); }); return out; };

const QUALITY_TESTS = {
  not_null: { severity: "error", columns: FIELD_NAMES,
    run: (rows, ctx, col) => rowsWhere(rows, (r) => isNil(r[col])) },
  unique_combination_of_columns: { severity: "error", columns: [CONTRACT.primaryKey.join(",")],
    run: (rows, ctx) => {
      const seen = new Map();
      rows.forEach((r, i) => { const k = keyOf(r); if (k !== null) seen.set(k, (seen.get(k) || 0) + 1); });
      return rowsWhere(rows, (r) => { const k = keyOf(r); return k !== null && (seen.get(k) > 1 || ctx.priorKeys.has(k)); });
    } },
  accepted_values: { severity: "error", columns: ["vital_code", "unit", "cipher_suite"],
    run: (rows, ctx, col) => rowsWhere(rows, (r) => !isNil(r[col]) && !ENUMS[col].includes(r[col])) },
  range: { severity: "error", columns: ["vital_value"],
    run: (rows) => rowsWhere(rows, (r) => {
      const spec = codeSpec(r.vital_code), v = r.vital_value;
      if (!spec || isNil(v)) return false;
      return typeof v !== "number" || !Number.isFinite(v) || v < spec.min || v > spec.max;
    }) },
  matches_pattern: { severity: "error", columns: ["patient_id", "patient_zip5", "birth_date"],
    run: (rows, ctx, col) => rowsWhere(rows, (r) => !isNil(r[col]) && !(typeof r[col] === "string" && PATTERNS[col].test(r[col]))) },
  unit_matches_code: { severity: "error", columns: ["unit"],
    run: (rows) => rowsWhere(rows, (r) => {
      const spec = codeSpec(r.vital_code);
      return !!spec && !isNil(r.unit) && r.unit !== spec.unit;
    }) },
  no_unexpected_columns: { severity: "error", columns: ["*"],
    run: (rows) => rowsWhere(rows, (r) => Object.keys(r).some((k) => !FIELD_NAMES.includes(k))) },
  freshness: { severity: "warn", columns: [CONTRACT.epochField],
    run: (rows, ctx) => rowsWhere(rows, (r) => {
      const e = r[CONTRACT.epochField];
      return ctx.refTime !== null && typeof e === "number" && Number.isFinite(e) && ctx.refTime - e > FRESHNESS_WINDOW;
    }) },
  abnormal_vital_flag: { severity: "warn", columns: ["vital_value"],
    run: (rows) => rowsWhere(rows, (r) => isEvaluable(r) && isAbnormal(r)) },
};

// refTime (unix seconds) is the simulation time freshness is measured against. Default: the latest
// numeric encounter_epoch in the batch, so a batch is judged against its own newest row.
function runTests(rows, priorKeys, refTime) {
  const list = (Array.isArray(rows) ? rows : []).map((r) => (isObj(r) ? r : {}));
  let ref = typeof refTime === "number" && Number.isFinite(refTime) ? refTime : null;
  if (ref === null) {
    const epochs = list.map((r) => r[CONTRACT.epochField]).filter((e) => typeof e === "number" && Number.isFinite(e));
    ref = epochs.length ? Math.max(...epochs) : null;
  }
  const ctx = { priorKeys: priorKeys instanceof Set ? priorKeys : new Set(), refTime: ref };
  const results = [];
  const perRow = new Map();
  Object.entries(QUALITY_TESTS).forEach(([test, def]) => {
    def.columns.forEach((column) => {
      const failingRows = def.run(list, ctx, column);
      results.push({ test, severity: def.severity, column, failingRows });
      failingRows.forEach((i) => {
        const t = perRow.get(i) || [];
        if (!t.includes(test)) t.push(test);
        perRow.set(i, t);
      });
    });
  });
  const rowFailures = [...perRow.entries()].sort((a, b) => a[0] - b[0]).map(([rowIndex, tests]) => ({ rowIndex, tests }));
  const hasErrors = results.some((r) => r.severity === "error" && r.failingRows.length > 0);
  return { results, rowFailures, hasErrors };
}

// ===== SECTION: gate, DLQ, alerts, reducer =====
const ALERT_KEY = "dq-stargate-silver_vital_observation";

function initialState(scenario) {
  assertScenario(scenario);
  return {
    scenario,
    clock: { epoch: BASE_EPOCH, iso: isoFromEpoch(BASE_EPOCH) },
    batchesRun: 0, gate: "CLOSED", bronzeRows: 0, productionRows: 0, productionKeys: [], productionData: [],
    staging: [], dlq: [], alerts: [], lastGoodBatchId: null, events: [],
    publishedObservations: 0, publishedAbnormal: 0, publishedNotEvaluable: 0,
  };
}

// Each ACCEPTED operator action moves the simulation clock forward by this many seconds before it logs its event.
// Rejected actions and no-op repeats never advance it. runBatch sets the clock to max(clock, export run epoch).
const OPERATOR_ACTION_SECONDS = 60;
const tick = (s) => {
  const epoch = s.clock.epoch + OPERATOR_ACTION_SECONDS;
  return { ...s, clock: { epoch, iso: isoFromEpoch(epoch) } };
};
const withEvent = (s, type, detail) => ({ ...s, events: [...s.events, { iso: s.clock.iso, type, detail }] });
const reject = (s, detail) => withEvent(s, "ACTION_REJECTED", detail);
const addEvents = (s, list) => list.reduce((acc, [type, detail]) => withEvent(acc, type, detail), s);
const setEntry = (s, dlqId, patch) => ({ ...s, dlq: s.dlq.map((d) => (d.dlqId === dlqId ? { ...d, ...patch } : d)) });
const stagingKeys = (s) => s.staging.map(keyOf).filter((k) => k !== null);

// Error-severity failures only: warn tests (abnormal, stale) never quarantine a row.
function errorFailures(rows, priorKeys, refTime) {
  const res = runTests(rows, new Set(priorKeys), refTime);
  const errors = res.results.filter((r) => r.severity === "error");
  const byRow = new Map();
  res.rowFailures.forEach(({ rowIndex }) => {
    const hits = errors.filter((r) => r.failingRows.includes(rowIndex));
    if (hits.length) byRow.set(rowIndex, hits);
  });
  return byRow;
}

function dlqEntryFor(batchId, n, row, pos, hits) {
  const drift = hits.find((h) => h.test === "no_unexpected_columns");
  const primary = drift || hits[0];
  const column = primary.column;
  let observedValue, reason;
  if (drift) {
    const extra = Object.keys(row).filter((k) => !FIELD_NAMES.includes(k));
    const joined = extra.join(",");
    observedValue = joined.length <= 80 ? joined : extra.length;
    reason = "Unexpected columns (schema drift)";
  } else {
    observedValue = row[column] === undefined ? null : row[column];
    reason = "Failed " + primary.test + " on " + column;
  }
  return {
    dlqId: "dlq-" + n + "-" + pos, batchId,
    failedTests: [...new Set(hits.map((h) => h.test))],
    column, observedValue, reason,
    payload: row, repairable: repairRow(row) !== row, status: "open",
  };
}

function runBatchAction(s, opts) {
  if (s.gate === "OPEN") return reject(s, "gate is OPEN: resolve the DLQ and retry first");
  const n = s.batchesRun + 1, batchId = "batch-" + n;
  const o = opts && Array.isArray(opts.faultExports) ? opts : s.faultExports ? { ...(opts || {}), faultExports: s.faultExports } : opts;
  const exp = generateExport(n, s.scenario, o);
  let next = { ...s, batchesRun: n, bronzeRows: s.bronzeRows + exp.rows.length, clock: s.clock.epoch >= exp.runEpoch ? s.clock : { epoch: exp.runEpoch, iso: isoFromEpoch(exp.runEpoch) } };
  next = withEvent(next, "BATCH_RUN", batchId + " landed " + exp.rows.length + " rows in bronze");
  const failed = errorFailures(exp.rows, s.productionKeys, exp.runEpoch);
  return failed.size === 0 ? publishBatch(next, batchId, exp.rows) : failBatch(next, batchId, n, exp.rows, failed);
}

// The one place the Abnormal Vital Rate formula lives: percent over EVALUABLE rows, 0 when there are none.
function abnormalRatePct(abnormal, observations, notEvaluable) {
  const evaluable = observations - notEvaluable;
  return evaluable > 0 ? (abnormal / evaluable) * 100 : 0;
}

// Counts for a list of published rows. observations includes not-evaluable rows.
function summarizePublished(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const observations = list.length;
  const abnormalCount = list.filter((r) => isAbnormal(r)).length;
  const notEvaluable = list.filter((r) => !isEvaluable(r)).length;
  return { observations, abnormalCount, notEvaluable, abnormalVitalRate: abnormalRatePct(abnormalCount, observations, notEvaluable) };
}

function publishBatch(s, batchId, rows) {
  const published = [...rows, ...s.staging];
  const sum = summarizePublished(published);
  const wasTrial = s.gate === "HALF_OPEN";
  let next = {
    ...s, productionRows: s.productionRows + published.length,
    publishedObservations: (s.publishedObservations || 0) + sum.observations,
    publishedAbnormal: (s.publishedAbnormal || 0) + sum.abnormalCount,
    publishedNotEvaluable: (s.publishedNotEvaluable || 0) + sum.notEvaluable,
    productionKeys: [...s.productionKeys, ...published.map(keyOf).filter((k) => k !== null)],
    productionData: [...(s.productionData || []), ...published],
    staging: [], lastGoodBatchId: batchId, gate: "CLOSED",
  };
  next = withEvent(next, "BATCH_PUBLISHED", batchId + " published " + published.length + " rows to production");
  return wasTrial ? withEvent(next, "GATE_CLOSED", "trial " + batchId + " passed") : next;
}

function failBatch(s, batchId, n, rows, failed) {
  const entries = [...failed.entries()].map(([i, hits]) => dlqEntryFor(batchId, n, rows[i], i + 1, hits));
  let next = { ...s, gate: "OPEN", dlq: [...s.dlq, ...entries], staging: [...s.staging, ...rows.filter((r, i) => !failed.has(i))] };
  next = addEvents(next, [
    ["GATE_OPENED", batchId + " failed " + entries.length + " error-severity rows"],
    ["DLQ_ADDED", entries.length + " rows quarantined from " + batchId],
  ]);
  const live = next.alerts.findIndex((a) => a.dedupeKey === ALERT_KEY && a.status !== "resolved");
  if (live >= 0) {
    const count = next.alerts[live].count + 1;
    next = { ...next, alerts: next.alerts.map((a, i) => (i === live ? { ...a, count } : a)) };
    return withEvent(next, "ALERT_INCREMENTED", ALERT_KEY + " count " + count);
  }
  const alert = {
    dedupeKey: ALERT_KEY, severity: "SEV-2",
    title: "DQ gate opened: " + entries.length + " error-severity failures in batch " + batchId,
    count: 1, status: "open",
  };
  return withEvent({ ...next, alerts: [...next.alerts, alert] }, "ALERT_FIRED", alert.title);
}

function repairRowAction(s, dlqId) {
  const entry = s.dlq.find((d) => d.dlqId === dlqId);
  if (!entry) return reject(s, "unknown DLQ id " + dlqId);
  if (entry.status === "repaired") return s;
  if (entry.status !== "open") return reject(s, dlqId + " is " + entry.status);
  if (!entry.repairable) return reject(s, dlqId + " is not repairable");
  const fixed = repairRow(entry.payload);
  if (errorFailures([fixed], [...s.productionKeys, ...stagingKeys(s)], s.clock.epoch).size > 0) {
    return reject(s, dlqId + " still fails after repair");
  }
  return withEvent(tick({ ...setEntry(s, dlqId, { status: "repaired" }), staging: [...s.staging, fixed] }),
    "ROW_REPAIRED", dlqId + " repaired and moved to staging");
}

function discardRowAction(s, dlqId, reason) {
  const entry = s.dlq.find((d) => d.dlqId === dlqId);
  if (!entry) return reject(s, "unknown DLQ id " + dlqId);
  if (entry.status === "discarded") return s;
  if (entry.status !== "open") return reject(s, dlqId + " is " + entry.status);
  if (typeof reason !== "string" || !reason.trim()) return reject(s, "discard needs a reason");
  return withEvent(tick(setEntry(s, dlqId, { status: "discarded" })), "ROW_DISCARDED", dlqId + " discarded: " + reason);
}

function resolveRetryAction(s) {
  if (s.gate !== "OPEN") return reject(s, "gate is not OPEN");
  const open = s.dlq.filter((d) => d.status === "open").length;
  if (open > 0) return reject(s, open + " DLQ rows unresolved");
  return withEvent(tick({ ...s, gate: "HALF_OPEN" }), "GATE_HALF_OPEN", "retry allowed: next batch is a trial");
}

function ackAlertAction(s) {
  const i = s.alerts.findIndex((a) => a.status === "open");
  if (i >= 0) return withEvent(tick({ ...s, alerts: s.alerts.map((a, j) => (j === i ? { ...a, status: "acknowledged" } : a)) }), "ALERT_ACKNOWLEDGED", ALERT_KEY + " acknowledged");
  return s.alerts.length ? s : reject(s, "no alert to acknowledge");
}

function resolveAlertAction(s) {
  if (!s.alerts.length) return reject(s, "no alert to resolve");
  const i = s.alerts.length - 1;
  if (s.alerts[i].status === "resolved") return s;
  return withEvent(tick({ ...s, alerts: s.alerts.map((a, j) => (j === i ? { ...a, status: "resolved" } : a)) }), "ALERT_RESOLVED", ALERT_KEY + " resolved");
}

function reduce(state, action, opts) {
  const type = action && action.type;
  switch (type) {
    case "runBatch": return runBatchAction(state, opts);
    case "repairRow": return repairRowAction(state, action.dlqId);
    case "discardRow": return discardRowAction(state, action.dlqId, action.reason);
    case "resolveRetry": return resolveRetryAction(state);
    case "ackAlert": return ackAlertAction(state);
    case "resolveAlert": return resolveAlertAction(state);
    default: return reject(state, "unknown action " + String(type));
  }
}

function replay(scenario, actions, opts) {
  assertScenario(scenario);
  const start = initialState(scenario);
  if (opts && Array.isArray(opts.faultExports)) start.faultExports = opts.faultExports.slice();
  return (actions || []).reduce((s, a) => reduce(s, a, opts), start);
}

// ===== SECTION: KPI history, facility profile, tiering =====
const HISTORY_DAYS = 120;
const BED_STAFFED_CAP = () => getContract().facility.beds_staffed;

function buildHistory() {
  const rng = makeRng(4);
  const staffed = BED_STAFFED_CAP();
  const rows = [];
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const epoch = BASE_EPOCH - (HISTORY_DAYS - 1 - i) * 86400;
    const dow = (Math.floor(epoch / 86400) + 4) % 7; // 0 = Sunday
    const weekend = dow === 0 || dow === 6;
    // Fixed number of draws per row keeps the stream stable.
    const nOcc = rngGauss(rng), nDis = rngGauss(rng), nRe = rngGauss(rng), nUn = rngGauss(rng), nAb = rngGauss(rng), nSt = rngGauss(rng);
    const trend = ((i / (HISTORY_DAYS - 1)) - 0.5) * 0.02; // gentle +/-1 pt drift
    const occ = Math.min(0.97, Math.max(0.5, 0.782 + trend - (weekend ? 0.02 : 0) + nOcc * 0.012));
    const occupied = Math.min(staffed, Math.round(staffed * occ));
    const discharges = Math.max(1, Math.round((occupied / 4.5) * (weekend ? 0.7 : 1.08) * (1 + nDis * 0.05)));
    const readAll = Math.min(discharges, Math.max(0, Math.round(discharges * (0.14 + nRe * 0.02))));
    const readUnp = Math.min(readAll, Math.max(0, Math.round(readAll * (0.68 + nUn * 0.08))));
    const observations = occupied * 24;
    const standard = Math.min(observations, Math.max(0, Math.round(observations * (0.06 + nAb * 0.004))));
    const strict = Math.min(standard, Math.max(0, Math.round(standard * (0.55 + nSt * 0.04))));
    rows.push({
      date: isoFromEpoch(epoch).slice(0, 10),
      beds_staffed: staffed,
      beds_occupied: occupied,
      discharges,
      readmits_30d_all: readAll,
      readmits_30d_unplanned: readUnp,
      observations,
      abnormal_obs_strict: strict,
      abnormal_obs_standard: standard,
      patient_days: occupied,
    });
  }
  return rows;
}

let historyCache = null;
function getHistory() {
  if (!historyCache) historyCache = buildHistory();
  return historyCache.map((r) => ({ ...r }));
}

function computeKpis(history, windowDays = 7) {
  const cur = history.slice(-windowDays);
  const pri = history.slice(-2 * windowDays, -windowDays);
  const sum = (rows, f) => rows.reduce((s, r) => s + r[f], 0);
  const defs = [
    ["Bed Occupancy", "beds_occupied", "beds_staffed"],
    ["Abnormal Vital Rate", "abnormal_obs_standard", "observations"],
    ["Avg Length of Stay", "patient_days", "discharges"],
    ["30-Day Readmission Rate", "readmits_30d_all", "discharges"],
  ];
  return defs.map(([name, num, den]) => {
    const value = sum(cur, num) / sum(cur, den);
    const priorValue = sum(pri, num) / sum(pri, den);
    return { name, value, priorValue, deltaPct: ((value - priorValue) / priorValue) * 100 };
  });
}

function facilityProfile(history) {
  const bedsStaffed = BED_STAFFED_CAP();
  const occupancy = computeKpis(history)[0].value;
  const patientsInHouse = Math.round(bedsStaffed * occupancy);
  const obsPerDay = patientsInHouse * 6 * 4; // 6 rounds x 4 vital types per patient
  const obsPerMonth = obsPerDay * 30;
  const sample = generateExport(1, "healthy").rows; // all ASCII: string length equals bytes
  const bytesPerRow = sample.reduce((a, r) => a + JSON.stringify(r).length, 0) / sample.length;
  return { bedsStaffed, patientsInHouse, obsPerDay, obsPer15Min: obsPerDay / 96, obsPerMonth, bytesPerRow, bytesPerMonth: obsPerMonth * bytesPerRow };
}

// Prices are illustrative, not vendor quotes.
const TIER_STORAGE = { hot: 0.080, warm: 0.023, cold: 0.002 }; // $/GB-month
const TIER_RETRIEVAL = { hot: 0, warm: 0, cold: 0.020 }; // $/GB
const TIERING_DEFAULTS = Object.freeze({ hotToWarmDays: 30, warmToColdDays: 180, retentionDays: 2555, dailyGB: 18, halfLifeDays: 45 });

function tieringCost(settings) {
  const s = { ...TIERING_DEFAULTS, ...(settings || {}) };
  const ages = [];
  let totalW = 0;
  for (let a = 0; a < s.retentionDays; a++) {
    const w = Math.pow(2, -a / s.halfLifeDays);
    ages.push(w);
    totalW += w;
  }
  const cost = (tierOf) => {
    let total = 0;
    ages.forEach((w, a) => {
      const t = tierOf(a);
      total += s.dailyGB * TIER_STORAGE[t] + 30 * 1000 * (w / totalW) * 1 * TIER_RETRIEVAL[t];
    });
    return total;
  };
  const monthlyCost = cost((a) => (a < s.hotToWarmDays ? "hot" : a < s.warmToColdDays ? "warm" : "cold"));
  const allHotCost = cost(() => "hot");
  const allWarmCost = cost(() => "warm");
  return {
    monthlyCost, allHotCost, allWarmCost,
    savedVsHotPct: ((allHotCost - monthlyCost) / allHotCost) * 100, // secondary
    savedVsWarmPct: ((allWarmCost - monthlyCost) / allWarmCost) * 100, // headline
  };
}

// ===== SECTION: public interface, business case, auto-play, link params =====
const PHI_FIELDS = ["patient_id", "patient_name", "patient_zip5", "birth_date", "encounter_epoch"];
const PATIENT_ID_RE = /^SGH-P-\d{6}$/;
const runBatchAct = () => ({ type: "runBatch" });

// Discard reasons: the single source for the engine and every page. suggestedReason(entry) picks one from a
// dead-letter entry's failed tests and column; anything it does not recognise (including repairable drift rows) is "Other".
const DISCARD_REASONS = Object.freeze(["Missing patient ID", "Physiologically impossible value", "Malformed or suspicious input", "Wrong unit, source must resend", "Other, see note"]);
function suggestedReason(entry) {
  const tests = (entry && entry.failedTests) || [];
  const has = (n) => tests.indexOf(n) >= 0;
  const column = entry && entry.column;
  if (column === "patient_id" && has("not_null")) return DISCARD_REASONS[0];
  if (column === "vital_value" && has("range")) return DISCARD_REASONS[1];
  if (has("matches_pattern")) return DISCARD_REASONS[2];
  if (column === "unit" && (has("unit_matches_code") || has("accepted_values"))) return DISCARD_REASONS[3];
  return DISCARD_REASONS[4];
}
// The four hard-failure rows of the scripted incident and the reason suggestedReason gives each (a test keeps them in step).
const SCRIPTED_DISCARDS = [["dlq-3-4", DISCARD_REASONS[0]], ["dlq-3-9", DISCARD_REASONS[1]], ["dlq-3-13", DISCARD_REASONS[2]], ["dlq-3-17", DISCARD_REASONS[3]]];

const PRELUDE = { healthy: [], incident: [runBatchAct(), runBatchAct()] };
const AUTOPLAY = {
  healthy: [runBatchAct(), runBatchAct(), runBatchAct(), runBatchAct()],
  incident: [
    runBatchAct(), runBatchAct(), runBatchAct(),
    ...["dlq-3-2", "dlq-3-6", "dlq-3-10", "dlq-3-15", "dlq-3-19"].map((dlqId) => ({ type: "repairRow", dlqId })),
    ...SCRIPTED_DISCARDS.map(([dlqId, reason]) => ({ type: "discardRow", dlqId, reason })),
    { type: "ackAlert" }, { type: "resolveRetry" }, runBatchAct(), { type: "resolveAlert" },
  ],
};

// A naive pipeline joins to dim_patient on patient_id. Renamed-column rows lose EVERY key (including
// patient_id), so they have no usable id and the join drops them. Returns the drop reason, or null.
function naiveDropReason(row) {
  const r = isObj(row) ? row : {};
  if (!("patient_id" in r)) return "renamed columns: patient_id key missing, dropped by join to dim_patient";
  if (r.patient_id === null || r.patient_id === undefined || r.patient_id === "") return "null patient_id: dropped by join to dim_patient";
  if (typeof r.patient_id !== "string" || !PATIENT_ID_RE.test(r.patient_id)) return "patient_id matches no dim_patient row";
  return null;
}

// Models a pipeline with no gate.
// Rows without a usable patient_id are dropped by the join. Rows that pass the join but are not evaluable
// (null, missing, NaN or string vital_value) are "not evaluable": excluded from both numerator and
// denominator, so a missing reading is never treated as a normal one. Unit is ignored.
function naiveAbnormalStats(rows) {
  let dropped = 0, counted = 0, evaluable = 0, abnormal = 0;
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (naiveDropReason(row) !== null) { dropped++; return; }
    counted++;
    if (!isEvaluable(row)) return;
    evaluable++;
    if (isAbnormal(row)) abnormal++;
  });
  return { dropped, counted, evaluable, notEvaluable: counted - evaluable, abnormal, ratePct: evaluable ? (abnormal / evaluable) * 100 : 0 };
}

// Returns a percent 0..100 (0 when nothing is evaluable).
const naiveAbnormalRate = (rows) => naiveAbnormalStats(rows).ratePct;

const snakeKey = (k) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());

function holdsPhi(payload) {
  return Object.entries(isObj(payload) ? payload : {}).some(([k, v]) => PHI_FIELDS.includes(snakeKey(k)) && v !== null && v !== undefined);
}

// How many rows now in production fail an error-severity contract test (the gate's own tests, run over the
// production rows themselves). The gate should keep this at 0; a non-zero value means invalid data got through.
function invalidRowsInProduction(state) {
  const rows = (state && Array.isArray(state.productionData)) ? state.productionData : [];
  if (!rows.length) return 0;
  const refTime = state.clock && Number.isFinite(state.clock.epoch) ? state.clock.epoch : undefined;
  return errorFailures(rows, [], refTime).size;
}

function computeBusinessCase(state) {
  const dlq = state.dlq;
  const first = dlq.length ? dlq[0] : null;
  let distortionAvoidedPts = 0, distortionBatchId = null;
  if (first) {
    distortionBatchId = first.batchId;
    const n = Number(first.batchId.slice(6));
    const rows = generateExport(n, state.scenario, { faultExports: state.faultExports ?? undefined }).rows;
    const failed = errorFailures(rows, [], exportRunEpoch(n));
    distortionAvoidedPts = naiveAbnormalRate(rows) - naiveAbnormalRate(rows.filter((r, i) => !failed.has(i)));
  }
  // Outcome counts describe what a naive pipeline would have done with every DLQ entry ever created.
  const silentlyDroppedRows = [], invalidRowsListing = [];
  dlq.forEach((d) => {
    const reason = naiveDropReason(d.payload);
    if (reason !== null) { silentlyDroppedRows.push({ dlqId: d.dlqId, reason }); return; }
    const p = d.payload;
    invalidRowsListing.push({
      dlqId: d.dlqId, patient_id: p.patient_id, vital_code: p.vital_code,
      vital_value: p.vital_value, unit: p.unit, failedTests: d.failedTests.slice(),
    });
  });
  const tiering = tieringCost();
  return {
    rowsStopped: dlq.length,
    rowsSilentlyDropped: silentlyDroppedRows.length,
    silentlyDroppedRows,
    invalidRowsReachingDashboard: invalidRowsListing.length,
    invalidRowsListing,
    invalidRowsInProduction: invalidRowsInProduction(state),
    // SECONDARY: signed (naive minus valid), can be negative, so it must not be headlined.
    distortionAvoidedPts,
    distortionBatchId,
    minutesToDetectWithGate: dlq.length ? 15 : null, // export cadence, an upper bound
    hoursToDetectWithoutGate: 24, // assumption: a next-day report review would catch it
    phiRowsQuarantined: dlq.filter((d) => holdsPhi(d.payload)).length,
    storageSavedVsWarmPct: tiering.savedVsWarmPct, // headline
    storageSavedVsHotPct: tiering.savedVsHotPct, // secondary
  };
}

function getState(scenario, actions, opts) {
  const state = replay(scenario, actions, opts);
  const history = getHistory();
  const held = state.gate === "OPEN";
  const asOfBatchId = state.lastGoodBatchId;
  const asOfIso = isoFromEpoch(asOfBatchId === null ? BASE_EPOCH : exportRunEpoch(Number(asOfBatchId.slice(6))));
  const obs = state.publishedObservations || 0, abnormal = state.publishedAbnormal || 0, notEval = state.publishedNotEvaluable || 0;
  return {
    ...state,
    kpis: computeKpis(history).map((k) => ({ ...k, asOfBatchId, asOfIso, held })),
    held,
    todaySoFar: {
      label: "Live sample: published exports today.",
      note: "The first five readings are hand-picked edge cases, so early batches run above the 7-day rate.",
      observations: obs, abnormalCount: abnormal, notEvaluable: notEval,
      abnormalVitalRate: abnormalRatePct(abnormal, obs, notEval),
    },
    facility: facilityProfile(history),
    businessCase: computeBusinessCase(state),
  };
}

const getTimeline = (scenario, actions, opts) => getState(scenario, actions, opts).events;

function parseLinkParams(search) {
  const out = { scenario: "healthy", step: 0 };
  if (typeof search !== "string") return out;
  search.replace(/^\?/, "").split("&").forEach((pair) => {
    const i = pair.indexOf("=");
    const k = i < 0 ? pair : pair.slice(0, i), v = i < 0 ? "" : pair.slice(i + 1);
    if (k === "scenario" && (v === "healthy" || v === "incident")) out.scenario = v;
    if (k === "step" && /^\d+$/.test(v)) out.step = Number(v);
  });
  return out;
}

// The actions a page applies for the `step` link parameter: the first `step` scripted actions, never fewer than
// the scenario's prelude and never more than the whole script. Anything that is not a non-negative integer
// becomes the floor. Returns fresh copies, so callers cannot change AUTOPLAY.
function actionsForStep(scenario, step) {
  assertScenario(scenario);
  const floor = PRELUDE[scenario].length, ceil = AUTOPLAY[scenario].length;
  const n = Number.isInteger(step) && step >= 0 ? Math.min(Math.max(step, floor), ceil) : floor;
  return AUTOPLAY[scenario].slice(0, n).map((a) => ({ ...a }));
}

// ===== SECTION: self-test =====
function hashValues(values) {
  let h = 0x811c9dc5;
  const text = values.map((v) => v.toFixed(12)).join(",");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
const DETERMINISM_HASH = "1f8ea357"; // hashValues of the first 100 values from makeRng(1)
const GENERATOR_HASH = "bc1e18dc"; // hashValues of every vital_value of healthy exports 1-8, in row order
function generatorHash() {
  const vals = [];
  for (let n = 1; n <= 8; n++) generateExport(n, "healthy").rows.forEach((r) => vals.push(r.vital_value));
  return hashValues(vals);
}

function selfTest() {
  const gateTrail = (actions, opts) => {
    const trail = [];
    for (let i = 1; i <= actions.length; i++) trail.push(replay("incident", actions.slice(0, i), opts).gate);
    return trail;
  };
  const defs = [
    ["determinism_hash", () => {
      const rng = makeRng(1);
      const h = hashValues(Array.from({ length: 100 }, () => rng()));
      if (h !== DETERMINISM_HASH) return "got " + h;
      const g = generatorHash();
      return g === GENERATOR_HASH ? null : "generator hash got " + g;
    }],
    ["golden_rows_first", () => {
      const rows = generateExport(1, "healthy").rows;
      const ok = CONTRACT.goldenRows.every((g, i) => JSON.stringify(rows[i]) === JSON.stringify(g));
      return ok ? null : "golden rows changed";
    }],
    ["healthy_exports_pass", () => {
      for (let n = 1; n <= 4; n++) if (runTests(generateExport(n, "healthy").rows).hasErrors) return "export " + n + " has errors";
      return null;
    }],
    ["incident_export_blocks", () => {
      const s = replay("incident", [runBatchAct(), runBatchAct(), runBatchAct()]);
      const ok = s.dlq.length === 9 && s.alerts.length === 1 && s.productionRows === 40;
      return ok ? null : "dlq " + s.dlq.length + ", alerts " + s.alerts.length + ", production " + s.productionRows;
    }],
    ["breaker_path", () => {
      const trail = gateTrail(AUTOPLAY.incident);
      const iOpen = trail.indexOf("OPEN"), iHalf = trail.indexOf("HALF_OPEN");
      if (iOpen < 0 || iHalf < iOpen || trail[trail.length - 1] !== "CLOSED") return "autoplay path " + trail.join(",");
      const acts = [runBatchAct(), runBatchAct(), runBatchAct()];
      const open = replay("incident", acts);
      const fix = open.dlq.map((d) => (d.repairable ? { type: "repairRow", dlqId: d.dlqId } : { type: "discardRow", dlqId: d.dlqId, reason: suggestedReason(d) }));
      const t = gateTrail([...acts, ...fix, { type: "resolveRetry" }, runBatchAct()], { faultExports: [3, 4] });
      const n = t.length;
      return t[n - 2] === "HALF_OPEN" && t[n - 1] === "OPEN" ? null : "failing trial path " + t.slice(-2).join(",");
    }],
    ["repair_only_drift", () => {
      const open = replay("incident", [runBatchAct(), runBatchAct(), runBatchAct()]);
      const drift = open.dlq.find((d) => d.repairable), hard = open.dlq.find((d) => !d.repairable);
      const last = (s) => s.events[s.events.length - 1].type;
      if (last(reduce(open, { type: "repairRow", dlqId: drift.dlqId })) !== "ROW_REPAIRED") return "drift repair not accepted";
      return last(reduce(open, { type: "repairRow", dlqId: hard.dlqId })) === "ACTION_REJECTED" ? null : "hard failure repair not rejected";
    }],
    ["state_deterministic", () => {
      const a = JSON.stringify(getState("incident", AUTOPLAY.incident)), b = JSON.stringify(getState("incident", AUTOPLAY.incident));
      return a === b ? null : "states differ";
    }],
    ["facility_reconciles", () => {
      const s = getState("healthy", []);
      const f = s.facility;
      if (!getHistory().every((r) => r.beds_staffed === f.bedsStaffed)) return "beds_staffed mismatch";
      return f.obsPer15Min === (f.patientsInHouse * 24) / 96 ? null : "obsPer15Min mismatch";
    }],
  ];
  const checks = defs.map(([name, fn]) => {
    try {
      const detail = fn();
      return detail === null ? { name, ok: true } : { name, ok: false, detail };
    } catch (e) {
      return { name, ok: false, detail: String(e && e.message ? e.message : e) };
    }
  });
  return { passed: checks.every((c) => c.ok), checks };
}

// ===== END SECTIONS: add new sections above this line =====

const Engine = {
  SEED, BASE_EPOCH,
  mulberry32, makeRng, isoFromEpoch,
  rngPick, rngRange, rngGauss, round,
  PATIENT_POOL_SIZE, getContract, isAbnormal, isEvaluable, summarizePublished,
  buildPatientPool, exportRunEpoch, generateExport, assertScenario,
  REPAIRABLE_ROWS, HARD_FAIL_ROWS, repairRow,
  runTests,
  initialState, reduce, replay,
  getHistory, computeKpis, facilityProfile, tieringCost, TIERING_DEFAULTS,
  getState, getTimeline, AUTOPLAY, PRELUDE, parseLinkParams, actionsForStep,naiveAbnormalRate, naiveAbnormalStats,
  DISCARD_REASONS, suggestedReason, invalidRowsInProduction, computeBusinessCase,
  selfTest, hashValues, DETERMINISM_HASH, GENERATOR_HASH, abnormalShare,
};

// ===== EXPORT =====
if (typeof module !== "undefined") module.exports = Engine; else globalThis.Engine = Engine;
})();
