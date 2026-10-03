import { join } from "node:path";
import { RAW, fetchText, writeJson, readJson, today, parseCsv, download, exists } from "./lib";
import { CURATED, SOLAR_BODIES } from "./config";

const SIMBAD_TAP = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync";
const EXO_TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync";
export const HYG_URL = "https://codeberg.org/astronexus/hyg/media/branch/main/data/hyg/CURRENT/hyg_v44.csv.gz";

async function simbad(query: string) {
  const body = new URLSearchParams({ request: "doQuery", lang: "adql", format: "csv", query });
  return parseCsv(await fetchText(SIMBAD_TAP, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } }));
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

export async function fetchSimbad() {
  const ids = CURATED.map((c) => c.simbad);
  const inList = ids.map(quote).join(",");
  const basic = await simbad(
    `SELECT i.id AS query_id, b.main_id, b.otype, b.ra, b.dec, b.coo_bibcode, b.plx_value, b.plx_err, b.plx_bibcode, b.sp_type, b.rvz_redshift, b.rvz_type, b.galdim_majaxis, b.galdim_minaxis, b.galdim_angle, b.morph_type, f.V AS vmag
     FROM ident AS i JOIN basic AS b ON b.oid = i.oidref LEFT JOIN allfluxes AS f ON f.oidref = b.oid WHERE i.id IN (${inList})`,
  );
  const distances = await simbad(
    `SELECT i.id AS query_id, d.dist, d.plus_err, d.minus_err, d.unit, d.method, d.bibcode
     FROM ident AS i JOIN mesDistance AS d ON d.oidref = i.oidref WHERE i.id IN (${inList})`,
  );
  const byId: Record<string, { basic: Record<string, string> | null; distances: Record<string, string>[] }> = {};
  for (const c of CURATED) byId[c.id] = { basic: null, distances: [] };
  for (const row of basic) {
    for (const c of CURATED.filter((x) => norm(x.simbad).toLowerCase() === norm(row.query_id).toLowerCase())) byId[c.id].basic = row;
  }
  for (const row of distances) {
    for (const c of CURATED.filter((x) => norm(x.simbad).toLowerCase() === norm(row.query_id).toLowerCase())) byId[c.id].distances.push(row);
  }
  const missing = CURATED.filter((c) => !byId[c.id].basic).map((c) => `${c.id} (${c.simbad})`);
  if (missing.length) console.warn(`  SIMBAD: no match for ${missing.length}:\n    ${missing.join("\n    ")}`);
  await writeJson(join(RAW, "simbad.json"), { retrieved: today(), endpoint: SIMBAD_TAP, objects: byId });
  console.log(`  SIMBAD: ${basic.length} objects, ${distances.length} distance measurements`);
}

export async function fetchExoplanets() {
  const hosts = [...new Set(CURATED.map((c) => c.exoplanetHost).filter(Boolean))] as string[];
  const query = `select hostname,pl_name,pl_letter,sy_dist,sy_disterr1,sy_disterr2,sy_pnum,pl_orbper,pl_orbsmax,pl_rade,pl_bmasse,pl_eqt,disc_year,discoverymethod,disc_facility from pscomppars where hostname in (${hosts.map(quote).join(",")})`;
  const url = `${EXO_TAP}?${new URLSearchParams({ query, format: "csv" })}`;
  const rows = parseCsv(await fetchText(url));
  await writeJson(join(RAW, "exoplanets.json"), { retrieved: today(), endpoint: EXO_TAP, table: "pscomppars", query, rows });
  const found = new Set(rows.map((r) => r.hostname));
  console.log(`  Exoplanet Archive: ${rows.length} planets; hosts without planets: ${hosts.filter((h) => !found.has(h)).join(", ") || "none"}`);
}

export async function fetchFactsheet() {
  const url = "https://nssdc.gsfc.nasa.gov/planetary/factsheet/";
  const html = await fetchText(url);
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      c[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim(),
    ),
  );
  const head = rows.find((r) => r.includes("EARTH"))!;
  const table: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    if (r === head || !r[0] || r.includes("EARTH")) continue;
    for (let i = 1; i < head.length; i++) (table[head[i]] ??= {})[r[0]] = r[i];
  }
  await writeJson(join(RAW, "factsheet.json"), { retrieved: today(), url, table });
  console.log(`  NASA fact sheet: ${Object.keys(table).length} bodies`);
}

const SBDB = "https://ssd-api.jpl.nasa.gov/sbdb.api";

/** JPL Small-Body Database physical parameters and discovery data for asteroids, comets and dwarf planets. */
export async function fetchSbdb() {
  const dest = join(RAW, "sbdb.json");
  const previous = (await exists(dest)) ? (await readJson<{ objects: Record<string, unknown> }>(dest)).objects : {};
  const out: Record<string, unknown> = { ...previous };
  for (const b of SOLAR_BODIES) {
    if (!["asteroid", "comet", "dwarf-planet"].includes(b.type) || out[b.id]) continue;
    const sstr = b.horizons.startsWith("DES=") ? b.horizons.slice(4).split(";")[0] : b.horizons.replace(/;$/, "");
    try {
      const r = await fetchText(`${SBDB}?${new URLSearchParams({ sstr, "phys-par": "1", discovery: "1" })}`);
      const j = JSON.parse(r);
      if (j.object) out[b.id] = { object: j.object, phys_par: j.phys_par ?? [], discovery: j.discovery ?? null, orbit: { class: j.orbit?.class, elements: j.orbit?.elements?.filter((e: { name: string }) => ["e", "a", "q", "i", "per"].includes(e.name)) } };
      else console.warn(`  SBDB: no object for ${b.id} (${sstr})`);
    } catch (e) {
      console.warn(`  SBDB: ${b.id} failed (${(e as Error).message})`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  await writeJson(dest, { retrieved: today(), endpoint: SBDB, objects: out });
  console.log(`  SBDB: ${Object.keys(out).length} small bodies`);
}

export async function fetchHyg() {
  const dest = join(RAW, "hyg_v44.csv.gz");
  if (await exists(dest)) {
    console.log("  HYG v4.4 already downloaded");
    return;
  }
  await download(HYG_URL, dest);
  console.log("  HYG v4.4 downloaded");
}
