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

function isAbnormal(row) {
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

// Per-(n, row) salt-1 stream, so any export derives from the seed alone.
function rowRng(n, rowIndex) {
  const base = Math.floor(makeRng(1)() * 4294967296);
  return mulberry32((base ^ Math.imul(n, 0x9E3779B1) ^ Math.imul(rowIndex + 1, 0x85EBCA6B)) >>> 0);
}

function generateExport(n, scenario) { // scenario: only "healthy" is implemented here
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
    const mid = (vc.min + vc.max) / 2, sd = (vc.max - vc.min) / 5;
    let v = mid + rngGauss(rng) * sd;
    v = Math.min(vc.max, Math.max(vc.min, v));
    v = vc.code === "8310-5" ? round(v, 1) : Math.round(v);
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
  return { n, runEpoch, rows };
}

// ===== END SECTIONS: add new sections above this line =====

const Engine = {
  SEED, BASE_EPOCH,
  mulberry32, makeRng, isoFromEpoch,
  rngPick, rngRange, rngGauss, round,
  PATIENT_POOL_SIZE, getContract, isAbnormal,
  buildPatientPool, exportRunEpoch, generateExport,
};

// ===== EXPORT =====
if (typeof module !== "undefined") module.exports = Engine; else globalThis.Engine = Engine;
