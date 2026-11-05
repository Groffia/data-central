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

// ===== END SECTIONS: add new sections above this line =====

const Engine = {
  SEED, BASE_EPOCH,
  mulberry32, makeRng, isoFromEpoch,
  rngPick, rngRange, rngGauss, round,
};

// ===== EXPORT =====
if (typeof module !== "undefined") module.exports = Engine; else globalThis.Engine = Engine;
