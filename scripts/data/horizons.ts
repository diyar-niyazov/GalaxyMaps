import { join } from "node:path";
import { RAW, fetchJson, writeJson, today } from "./lib";
import { SOLAR_BODIES, EPHEMERIS_START, EPHEMERIS_STOP, REFERENCE_EPOCH, PARKER, SPEED_PRESETS } from "./config";

const API = "https://ssd.jpl.nasa.gov/api/horizons.api";

type Params = Record<string, string>;

async function horizons(params: Params): Promise<string> {
  const q = new URLSearchParams({ format: "json", ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, `'${v}'`])) });
  const res = await fetchJson<{ result?: string; error?: string }>(`${API}?${q}`);
  if (res.error) throw new Error(`Horizons error: ${res.error}`);
  if (!res.result) throw new Error("Horizons returned no result");
  // Be polite to the shared service.
  await new Promise((r) => setTimeout(r, 400));
  return res.result;
}

function between(result: string, a = "$$SOE", b = "$$EOE") {
  const i = result.indexOf(a), j = result.indexOf(b);
  if (i < 0 || j < 0) return null;
  return result.slice(i + a.length, j).trim();
}

export function parseVectorCsv(result: string) {
  const block = between(result);
  if (!block) return [];
  return block.split("\n").map((line) => {
    const c = line.split(",").map((s) => s.trim());
    return { jd: Number(c[0]), state: c.slice(2, 8).map(Number) };
  });
}

export function parseElementsCsv(result: string) {
  const block = between(result);
  if (!block) return [];
  return block.split("\n").map((line) => {
    const c = line.split(",").map((s) => s.trim());
    // JDTDB, Cal, EC, QR, IN, OM, W, Tp, N, MA, TA, A, AD, PR
    return {
      epochJdTdb: Number(c[0]), e: Number(c[2]), qKm: Number(c[3]), iDeg: Number(c[4]), omDeg: Number(c[5]),
      wDeg: Number(c[6]), nDegS: Number(c[8]), maDeg: Number(c[9]), aKm: Number(c[11]),
    };
  });
}

const vectorParams = (command: string, center: string, start: string, stop: string, step: string): Params => ({
  COMMAND: command, OBJ_DATA: "YES", MAKE_EPHEM: "YES", EPHEM_TYPE: "VECTORS", CENTER: center,
  REF_PLANE: "FRAME", REF_SYSTEM: "ICRF", START_TIME: start, STOP_TIME: stop, STEP_SIZE: step,
  VEC_TABLE: "2", OUT_UNITS: "KM-S", CSV_FORMAT: "YES", VEC_LABELS: "NO", VEC_CORR: "NONE",
});

const elementParams = (command: string, center: string, start: string, stop: string, step: string): Params => ({
  COMMAND: command, OBJ_DATA: "NO", MAKE_EPHEM: "YES", EPHEM_TYPE: "ELEMENTS", CENTER: center,
  REF_PLANE: "FRAME", REF_SYSTEM: "ICRF", START_TIME: start, STOP_TIME: stop, STEP_SIZE: step,
  OUT_UNITS: "KM-S", CSV_FORMAT: "YES",
});

/** Pull the header text (physical data) that precedes the ephemeris. */
function header(result: string) {
  const i = result.indexOf("Ephemeris /");
  return (i > 0 ? result.slice(0, i) : result.slice(0, 4000)).trim();
}

export async function fetchHorizons() {
  const keyCenter: Record<string, string> = { earth: "500@399", mars: "500@499", jupiter: "500@599", saturn: "500@699", neptune: "500@899", pluto: "500@999" };
  const out: Record<string, unknown> = {};
  for (const b of SOLAR_BODIES) {
    if (b.id === "sun") {
      const r = await horizons({ COMMAND: "10", OBJ_DATA: "YES", MAKE_EPHEM: "NO" });
      out[b.id] = { header: header(r) };
      continue;
    }
    process.stdout.write(`  Horizons ${b.name}… `);
    if (b.parent) {
      // Moons: weekly osculating elements relative to the parent, plus one heliocentric vector set for validation.
      const center = keyCenter[b.parent];
      const el = await horizons(elementParams(b.horizons, center, EPHEMERIS_START, EPHEMERIS_STOP, "7 d"));
      const vec = await horizons(vectorParams(b.horizons, center, REFERENCE_EPOCH, `${REFERENCE_EPOCH} 12:00`, "1 h"));
      out[b.id] = { parent: b.parent, elements: parseElementsCsv(el), check: parseVectorCsv(vec), header: header(vec) };
      console.log("ok");
      continue;
    }
    const vec = await horizons(vectorParams(b.horizons, "500@10", EPHEMERIS_START, EPHEMERIS_STOP, "1 d"));
    const rows = parseVectorCsv(vec);
    let orbit = null;
    if (b.type !== "spacecraft") {
      const el = await horizons(elementParams(b.horizons, "500@10", REFERENCE_EPOCH, `${REFERENCE_EPOCH} 00:01`, "1 d"));
      orbit = parseElementsCsv(el)[0] ?? null;
    }
    out[b.id] = { vectors: rows, orbit, header: header(vec) };
    console.log(`${rows.length} rows`);
  }

  // Parker Solar Probe record perihelion speed.
  process.stdout.write("  Horizons Parker Solar Probe perihelion… ");
  const parker = parseVectorCsv(await horizons(vectorParams(PARKER.horizons, "500@10", PARKER.start, PARKER.stop, PARKER.step)));
  let best = { jd: 0, speed: 0 };
  for (const r of parker) {
    const v = Math.hypot(r.state[3], r.state[4], r.state[5]);
    if (v > best.speed) best = { jd: r.jd, speed: v };
  }
  console.log(`${best.speed.toFixed(2)} km/s`);

  await writeJson(join(RAW, "horizons.json"), {
    retrieved: today(),
    api: API,
    frame: "ICRF, center 500@10 (Sun body center), TDB, km & km/s",
    range: { start: EPHEMERIS_START, stop: EPHEMERIS_STOP },
    referenceEpoch: REFERENCE_EPOCH,
    bodies: out,
    parkerPeak: { horizons: PARKER.horizons, ...best, window: PARKER },
    speedPresets: SPEED_PRESETS,
  });
}
