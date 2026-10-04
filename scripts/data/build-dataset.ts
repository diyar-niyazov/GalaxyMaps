/**
 * Build the bundled GalaxyMaps dataset from cached raw responses in data/raw/.
 * Outputs public/data/{catalog.json, ephemeris.json, stars.bin, star-names.json}.
 * Run with `npm run data:build` (no network required).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { RAW, ROOT, PUBLIC_DATA, readJson, writeJson, parseCsv, exists } from "./lib";
import { SOLAR_BODIES, CURATED, REFERENCE_EPOCH, EPHEMERIS_START, EPHEMERIS_STOP } from "./config";
import { HYG_URL } from "./catalogs";
import type { Catalog, CatalogObject, Ephemeris, Fact, SourceInfo, SpeedReference, DistanceQuality, RouteCapability, ImageRecord, OrbitElements } from "../../src/lib/types";
import { PC_KM, AU_KM, LY_KM } from "../../src/lib/units";
import { assessParallax, cartesianFromRaDecDistance, isValidHygDistance, unitFromRaDec } from "../../src/lib/coords";
import { keplerPosition } from "../../src/lib/kepler";
import { ephemerisPosition } from "../../src/lib/ephemeris";
import { describeSpectralType, hygRouteCapability, hygLabel, CONSTELLATIONS, temperatureFromBV, blackbodyRgb, rgbToHex } from "../../src/lib/stars";
import { distance, length } from "../../src/lib/vec";
import { robustDistance, describeMethod, UNIT_TO_PC } from "../../src/lib/distances";
import { comovingDistanceLy, lightTravelTimeYears, PLANCK18 } from "../../src/lib/cosmology";
import { MISSIONS, NOTABLE_EXOPLANETS } from "./config-extra";
import { CATEGORY_TREE, inCategory } from "../../src/lib/taxonomy";
import { applyEditorialAssets } from "../../src/lib/editorialAssets";

const STAR_MAX_PC = 1000;
const REF_JD = Date.UTC(...(REFERENCE_EPOCH.split("-").map(Number).map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number])) / 86_400_000 + 2_440_587.5;

interface HorizonsRaw {
  retrieved: string;
  bodies: Record<string, { vectors?: { jd: number; state: number[] }[]; orbit?: OrbitElements | null; header?: string; parent?: string; elements?: (OrbitElements & { qKm: number })[]; check?: { jd: number; state: number[] }[] }>;
  parkerPeak: { jd: number; speed: number; window: { start: string; stop: string } };
}
interface SimbadRaw { retrieved: string; objects: Record<string, { basic: Record<string, string> | null; distances: Record<string, string>[] }> }
interface ExoRaw { retrieved: string; rows: Record<string, string>[] }
interface FactRaw { retrieved: string; url: string; table: Record<string, Record<string, string>> }
type RawImage = ImageRecord & { description?: string };
interface MediaRec { summary: { extract: string; url?: string } | null; image: RawImage | null; intro?: string; gallery?: RawImage[] }
interface MediaRaw { retrieved: string; objects: Record<string, MediaRec> }
interface SbdbRaw { retrieved: string; objects: Record<string, { object: { fullname: string; kind: string; orbit_class?: { name: string } }; phys_par: { name: string; value: string; units?: string | null; title?: string }[]; discovery: { date?: string; who?: string; location?: string } | null; orbit: { class?: { name: string }; elements?: { name: string; value: string }[] } }> }

const num = (s: string | undefined) => (s == null || s.trim() === "" ? null : Number(s));

function parseRadius(header = ""): number | null {
  const tries = [
    /Vol\.?\s*mean\s*radius[^=\n]*=\s*([\d.]+)/i,
    /Mean\s*radius[^=\n]*=\s*([\d.]+)/i,
    /^\s*Radius\s*\(km[^=\n]*=\s*([\d.]+)(?:\s*x\s*([\d.]+)\s*x\s*([\d.]+))?/im,
    /RAD=\s*([\d.]+)/,
  ];
  for (const re of tries) {
    const m = header.match(re);
    if (m) {
      const vals = m.slice(1).filter(Boolean).map(Number);
      if (vals.length && vals.every((v) => v > 0)) return vals.length === 3 ? Math.cbrt(vals[0] * vals[1] * vals[2]) : vals[0];
    }
  }
  return null;
}

function qualityFromRel(rel: number | null): DistanceQuality {
  if (rel == null) return "approximate";
  return rel <= 0.01 ? "precise" : rel <= 0.05 ? "good" : rel <= 0.2 ? "approximate" : "uncertain";
}

const fmt = (x: number, d = 2) => x.toLocaleString("en-US", { maximumFractionDigits: d });

function distanceFact(km: number): string {
  if (km < 0.1 * LY_KM) return `${fmt(km / AU_KM, 2)} AU`;
  const ly = km / LY_KM;
  return ly >= 1e6 ? `${fmt(ly / 1e6, 2)} million light-years` : `${fmt(ly, ly < 100 ? 2 : 0)} light-years`;
}

const fmtBillions = (y: number) => (y >= 1e9 ? `${fmt(y / 1e9, 2)} billion` : `${fmt(y / 1e6, 0)} million`);
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");

const RELATION_LABEL: Record<string, string> = { orbits: "Orbits", member: "Member of", satellite: "Satellite of", nucleus: "Nucleus of", feature: "Part of", planet: "Orbits" };
const TYPE_COLOR: Partial<Record<CatalogObject["type"], string>> = {
  galaxy: "#c9b8ff", nebula: "#ff8fa3", "star-cluster": "#9ecbff", "black-hole": "#b48cff", quasar: "#7ad3ff", "white-dwarf": "#dfe8ff",
  "neutron-star": "#7ff0e0", "supernova-remnant": "#ffb38a", "galaxy-group": "#a9b8ff",
};
const CATEGORY_BY_TYPE: Record<string, string> = {
  star: "st-stars", "star-cluster": "cl-open", nebula: "nb-emission", galaxy: "gx-spiral", "black-hole": "cr-black-holes", quasar: "gx-other",
  "white-dwarf": "cr-white-dwarfs", "neutron-star": "cr-neutron", "supernova-remnant": "cr-snr", "galaxy-group": "ls-groups",
};
/** Categories for the original curated records (new records declare their own). */
const DEFAULT_CATEGORY: Record<string, string> = {
  hyades: "cl-open", pleiades: "cl-open", "47-tucanae": "cl-globular", "omega-centauri": "cl-globular", m13: "cl-globular",
  "helix-nebula": "nb-planetary", "ring-nebula": "nb-planetary", "orion-nebula": "nb-emission", "eagle-nebula": "nb-emission", "crab-nebula": "cr-snr",
  "sagittarius-a-star": "cr-black-holes", lmc: "gx-dwarf", smc: "gx-dwarf", andromeda: "gx-spiral", triangulum: "gx-spiral", m81: "gx-spiral",
  "centaurus-a": "gx-other", m87: "gx-elliptical", pinwheel: "gx-spiral", whirlpool: "gx-spiral", sombrero: "gx-spiral", "3c-273": "gx-other", "ton-618": "gx-other",
};
const DEFAULT_TAGS: Record<string, string[]> = {
  "alpha-centauri-a": ["st-multiple"], "alpha-centauri-b": ["st-multiple"], sirius: ["st-multiple"], castor: ["st-multiple"], mizar: ["st-multiple"],
  algol: ["st-multiple"], capella: ["st-multiple"], "61-cygni": ["st-multiple"], procyon: ["st-multiple"], "proxima-centauri": ["st-multiple"],
  "crab-nebula": ["nb-emission"], "orion-nebula": ["cl-open"], "eagle-nebula": ["cl-open"],
};

function solarCategory(b: (typeof SOLAR_BODIES)[number], aKm: number | undefined): { category: string; tags: string[] } {
  if (b.category) return { category: b.category, tags: [] };
  const tno = aKm != null && aKm > 30 * AU_KM;
  switch (b.type) {
    case "star": return { category: "st-stars", tags: [] };
    case "planet": return { category: "ss-planets", tags: [] };
    case "dwarf-planet": return { category: "ss-dwarf", tags: tno ? ["ss-tno"] : ["ss-asteroids"] };
    case "moon": return { category: "ss-moons", tags: [] };
    case "asteroid": return { category: tno ? "ss-tno" : "ss-asteroids", tags: [] };
    case "comet": return { category: "ss-comets", tags: [] };
    case "spacecraft":
      if (b.id === "jwst") return { category: "sc-telescopes", tags: [] };
      if (b.id === "tesla-roadster") return { category: "sc-spacex", tags: [] };
      return { category: "sc-probes", tags: [] };
  }
}

const ABBREV = /\b(e\.g|i\.e|c|ca|St|Dr|Mt|No|approx|vs|U\.S|Jr|Sr|Mr|Mrs|Prof|al|Fig|Jan|Feb|Mar|Apr|Aug|Sept|Oct|Nov|Dec|Ph\.D|[A-Z])\.$/;
export function splitSentences(text: string): string[] {
  const clean = text
    .replace(/\(\s*[;,]?\s*\)/g, "")
    .replace(/\(\s*[;,]\s*/g, "(")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const raw = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(ʻ])/);
  const out: string[] = [];
  for (const piece of raw) {
    if (out.length && ABBREV.test(out[out.length - 1])) out[out.length - 1] += ` ${piece}`;
    else out.push(piece);
  }
  return out.filter((x) => x.length > 1);
}

function wikiSummary(m: MediaRec | undefined, wiki: string): CatalogObject["summary"] {
  if (!m?.summary) return undefined;
  const sentences = splitSentences(m.intro || m.summary.extract);
  if (!sentences.length) return undefined;
  let text = sentences.shift()!;
  if (text.length < 60 && sentences.length) text += ` ${sentences.shift()}`;
  const more: string[] = [];
  while (sentences.length && more.length < 3) {
    const n = sentences.shift()!;
    if (n.length >= 40 && n.length <= 320) more.push(n);
  }
  let details = "";
  for (const x of sentences) {
    if ((details + x).length > 1400) break;
    details += (details ? " " : "") + x;
  }
  return { text, more: more.length ? more : undefined, details: details || undefined, sourceId: "wikipedia", url: m.summary.url ?? `https://en.wikipedia.org/wiki/${wiki}` };
}

function blurbSummary(b: { text: string; source: string; url: string }): CatalogObject["summary"] {
  return { text: b.text, sourceId: `blurb:${b.url}`, url: b.url };
}

function altText(img: RawImage, name: string) {
  const d = img.description ? splitSentences(img.description)[0] : "";
  return (d && d.length <= 180 ? d : `${img.kind === "illustration" ? "Illustration" : "Image"} of ${name}`).replace(/\s+/g, " ");
}

function finishImage(id: string, img: RawImage, kind: string | undefined, name: string): ImageRecord {
  const { description: _d, ...rest } = img;
  const thumbFile = join(ROOT, "public", "media", "thumbs", `${id}.jpg`);
  if (rest.src.startsWith("/media/") && rest.src.endsWith(".png") && !existsSync(join(ROOT, "public", rest.src))) {
    const jpg = rest.src.replace(/\.png$/, ".jpg");
    if (existsSync(join(ROOT, "public", jpg))) rest.src = jpg;
  }
  return { ...rest, kind: (kind as ImageRecord["kind"]) ?? rest.kind, alt: altText(img, name), thumb: existsSync(thumbFile) ? `/media/thumbs/${id}.jpg` : undefined };
}

const GENERIC = new Set(["the", "and", "star", "stars", "nebula", "galaxy", "cluster", "system", "group", "remnant", "supernova", "planet", "moon", "dwarf", "giant", "black", "hole", "space", "mission", "program", "rover", "telescope", "observatory", "comet", "asteroid", "great", "north", "south", "major", "minor"]);
const galleryStats = { kept: 0, dropped: 0 };

/**
 * Wikipedia's page image list includes navigation-template images of other objects, so a gallery
 * image is kept only when its title, description or file name mentions this object.
 */
function galleryOf(m: MediaRec | undefined, names: string[]): ImageRecord[] | undefined {
  const flat = (t: string) => t.toLowerCase().replace(/[_\s]+/g, " ");
  const tokens = new Set<string>();
  for (const n of names) {
    const f = flat(n);
    if (/\d/.test(f) && f.length >= 3) tokens.add(f).add(f.replace(/ /g, ""));
    for (const w of f.split(/[\s–\-,()']+/)) if (w.length > 2 && !GENERIC.has(w)) tokens.add(w);
  }
  const relevant = (img: RawImage) => {
    const text = flat(`${img.title} ${img.description ?? ""} ${decodeURIComponent(img.sourceUrl ?? "")}`);
    return [...tokens].some((t) => text.includes(t));
  };
  const raw = m?.gallery ?? [];
  const keep = raw.filter(relevant);
  galleryStats.kept += keep.length;
  galleryStats.dropped += raw.length - keep.length;
  const g = keep.map((img) => {
    const { description: _d, ...rest } = img;
    return { ...rest, alt: altText(img, rest.title) };
  });
  return g.length ? g : undefined;
}

function dedupeFacts(f: Fact[]): Fact[] {
  const seen = new Set<string>();
  return f.filter((x) => (seen.has(x.label) ? false : (seen.add(x.label), true)));
}

function sbdbFacts(rec: SbdbRaw["objects"][string] | undefined): Fact[] {
  if (!rec) return [];
  const f: Fact[] = [];
  const par = (n: string) => rec.phys_par.find((p) => p.name === n);
  const diameter = par("diameter"), rot = par("rot_per"), albedo = par("albedo"), dims = par("extent");
  if (diameter) f.push({ label: "Diameter", value: `${fmt(Number(diameter.value), Number(diameter.value) < 10 ? 2 : 0)} km`, sourceId: "jpl-sbdb" });
  else if (dims) f.push({ label: "Dimensions", value: `${dims.value} km`, sourceId: "jpl-sbdb" });
  if (rot) f.push({ label: "Rotation period", value: `${fmt(Number(rot.value), 2)} hours`, sourceId: "jpl-sbdb" });
  if (albedo) f.push({ label: "Albedo", value: fmt(Number(albedo.value), 3), sourceId: "jpl-sbdb" });
  const cls = rec.orbit?.class?.name;
  if (cls) f.push({ label: "Orbit class", value: cls, sourceId: "jpl-sbdb" });
  const per = rec.orbit?.elements?.find((e) => e.name === "per");
  if (per && Number(per.value) > 0) f.push({ label: "Orbital period", value: `${fmt(Number(per.value) / 365.25, Number(per.value) / 365.25 < 10 ? 2 : 0)} years`, sourceId: "jpl-sbdb" });
  const d = rec.discovery;
  if (d?.date) f.push({ label: "Discovered", value: `${d.date}${d.who ? ` by ${d.who}` : ""}`.slice(0, 120), sourceId: "jpl-sbdb" });
  return f;
}

async function main() {
  const horizons = await readJson<HorizonsRaw>(join(RAW, "horizons.json"));
  const simbad = await readJson<SimbadRaw>(join(RAW, "simbad.json"));
  const exo = await readJson<ExoRaw>(join(RAW, "exoplanets.json"));
  const facts = await readJson<FactRaw>(join(RAW, "factsheet.json"));
  const media: MediaRaw = (await exists(join(RAW, "media.json"))) ? await readJson<MediaRaw>(join(RAW, "media.json")) : { retrieved: "", objects: {} };
  const sbdb: SbdbRaw = (await exists(join(RAW, "sbdb.json"))) ? await readJson<SbdbRaw>(join(RAW, "sbdb.json")) : { retrieved: "", objects: {} };
  const missingHorizons = SOLAR_BODIES.filter((b) => !horizons.bodies[b.id] || (b.parent && !horizons.bodies[b.parent]));
  if (missingHorizons.some((b) => b.priority >= 80)) throw new Error(`Missing Horizons data for core bodies: ${missingHorizons.map((b) => b.id).join(", ")}`);
  if (missingHorizons.length) console.warn(`  Skipping ${missingHorizons.length} bodies without Horizons data: ${missingHorizons.map((b) => b.id).join(", ")}`);
  const solarBodies = SOLAR_BODIES.filter((b) => !missingHorizons.includes(b));

  const sources: Record<string, SourceInfo> = {
    "jpl-horizons": { id: "jpl-horizons", title: "NASA/JPL Horizons System (DE441 ephemeris)", url: "https://ssd.jpl.nasa.gov/horizons/", retrieved: horizons.retrieved, note: `ICRF state vectors relative to the Sun's center, ${EPHEMERIS_START} to ${EPHEMERIS_STOP}, TDB.` },
    "nasa-factsheet": { id: "nasa-factsheet", title: "NASA Planetary Fact Sheet (NSSDCA)", url: facts.url, retrieved: facts.retrieved },
    "nasa-saturn-rings": { id: "nasa-saturn-rings", title: "NASA Saturnian Rings Fact Sheet", url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html" },
    "hyg-v44": { id: "hyg-v44", title: "HYG Database v4.4 (Astronexus)", url: "https://codeberg.org/astronexus/hyg", license: "CC BY-SA 4.0", note: `Downloaded from ${HYG_URL}. Hipparcos/Yale/Gliese star positions, epoch 2000.` },
    simbad: { id: "simbad", title: "SIMBAD Astronomical Database, CDS Strasbourg (Wenger et al. 2000)", url: "https://simbad.cds.unistra.fr/simbad/", retrieved: simbad.retrieved },
    "nasa-exoplanet-archive": { id: "nasa-exoplanet-archive", title: "NASA Exoplanet Archive: Planetary Systems Composite Parameters", url: "https://exoplanetarchive.ipac.caltech.edu/", retrieved: exo.retrieved },
    wikipedia: { id: "wikipedia", title: "Wikipedia (article summaries)", url: "https://en.wikipedia.org/", license: "CC BY-SA 4.0", retrieved: media.retrieved },
    "solar-system-scope": { id: "solar-system-scope", title: "Solar System Scope planet textures (based on NASA imagery)", url: "https://www.solarsystemscope.com/textures/", license: "CC BY 4.0" },
    "iau-wgccre": { id: "iau-wgccre", title: "IAU WGCCRE report on cartographic coordinates (Archinal et al. 2018)", url: "https://doi.org/10.1007/s10569-017-9805-5", note: "Pole directions, used only to orient textures." },
    "si-c": { id: "si-c", title: "SI Brochure (BIPM): speed of light c = 299 792 458 m/s exactly", url: "https://www.bipm.org/en/publications/si-brochure" },
    "jpl-sbdb": { id: "jpl-sbdb", title: "NASA/JPL Small-Body Database", url: "https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html", retrieved: sbdb.retrieved, note: "Physical parameters, orbit class and discovery circumstances of asteroids, comets and dwarf planets." },
    "planck-2018": { id: "planck-2018", title: "Planck Collaboration 2020, A&A 641, A6 (cosmological parameters)", url: "https://doi.org/10.1051/0004-6361/201833910", note: `${PLANCK18.label}. Used only for distances of objects at cosmological redshift and for the schematic universe overview.` },
    "nasa-svs-deep-star-maps": { id: "nasa-svs-deep-star-maps", title: "Deep Star Maps 2020, NASA/Goddard Space Flight Center Scientific Visualization Studio", url: "https://svs.gsfc.nasa.gov/4851", note: "Background sky panorama (celestial coordinates, ICRF/J2000). Star data: Gaia DR2 (ESA/Gaia/DPAC), Hipparcos-2, Tycho-2. Shown as the sky seen from the Solar System; it is a backdrop, not catalog geometry.", license: "NASA media usage guidelines (credit NASA/Goddard SVS)" },
    "solar-system-scope-earth": { id: "solar-system-scope-earth", title: "Solar System Scope Earth day, night and cloud maps (based on NASA Blue Marble / Black Marble)", url: "https://www.solarsystemscope.com/textures/", license: "CC BY 4.0" },
  };
  for (const c of CURATED) if (c.blurb) sources[`blurb:${c.blurb.url}`] = { id: `blurb:${c.blurb.url}`, title: c.blurb.source, url: c.blurb.url };
  const ads = (bibcode: string, title?: string) => {
    const id = `ads-${bibcode}`;
    sources[id] ??= { id, title: title ?? bibcode, url: `https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(bibcode)}` };
    return id;
  };

  // ---------------- Ephemeris ----------------
  const eph: Ephemeris = { frame: "ICRF", center: "Sun (body center)", timeScale: "TDB", startJdTdb: Infinity, endJdTdb: -Infinity, bodies: {}, satellites: {}, orbits: {}, sourceId: "jpl-horizons" };
  for (const b of solarBodies) {
    const raw = horizons.bodies[b.id];
    if (raw.vectors?.length) {
      const v = raw.vectors;
      eph.bodies[b.id] = {
        startJdTdb: v[0].jd,
        stepDays: v[1].jd - v[0].jd,
        states: v.flatMap((r) => [...r.state.slice(0, 3).map((x) => Math.round(x)), ...r.state.slice(3).map((x) => Math.round(x * 1e6) / 1e6)]),
      };
      eph.startJdTdb = Math.min(eph.startJdTdb, v[0].jd);
      eph.endJdTdb = Math.max(eph.endJdTdb, v[v.length - 1].jd);
    }
    if (raw.elements?.length && b.parent) {
      eph.satellites[b.id] = { parentKey: b.parent, sets: raw.elements.map(({ qKm: _q, ...e }) => e) };
      // Validate two-body propagation against Horizons vectors (12 h after the reference epoch).
      let maxErr = 0;
      for (const c of raw.check ?? []) {
        const best = raw.elements.reduce((a, e) => (Math.abs(e.epochJdTdb - c.jd) < Math.abs(a.epochJdTdb - c.jd) ? e : a));
        maxErr = Math.max(maxErr, distance(keplerPosition(best, c.jd), c.state.slice(0, 3) as [number, number, number]));
      }
      const r = length(raw.check![0].state.slice(0, 3) as [number, number, number]);
      console.log(`  ${b.name.padEnd(10)} Kepler vs Horizons max error ${fmt(maxErr, 0)} km (${fmt((maxErr / r) * 100, 2)}% of orbit radius)`);
    }
    if (raw.orbit) eph.orbits[b.id] = raw.orbit;
  }

  // ---------------- Solar System objects ----------------
  const objects: CatalogObject[] = [];
  const posAtRef = (key: string) => ephemerisPosition(eph, key, REF_JD);
  for (const b of solarBodies) {
    const raw = horizons.bodies[b.id];
    const fs = b.factsheet ? facts.table[b.factsheet] : undefined;
    const f: Fact[] = [];
    let radiusKm = parseRadius(raw.header) ?? (fs ? Number(fs["Diameter (km)"].replace(/,/g, "")) / 2 : null);
    if (fs) {
      const get = (k: string) => fs[k]?.replace(/\*$/, "");
      f.push({ label: "Diameter", value: `${get("Diameter (km)")} km`, sourceId: "nasa-factsheet" });
      f.push({ label: "Mass", value: `${get("Mass (1024kg)")} × 10²⁴ kg`, sourceId: "nasa-factsheet" });
      f.push({ label: "Surface gravity", value: `${get("Gravity (m/s2)")} m/s²`, sourceId: "nasa-factsheet" });
      f.push({ label: "Length of day", value: `${get("Length of Day (hours)")} hours`, sourceId: "nasa-factsheet" });
      if (b.id !== "moon") f.push({ label: "Orbital period", value: `${get("Orbital Period (days)")} days`, sourceId: "nasa-factsheet" });
      else f.push({ label: "Orbital period", value: `${get("Orbital Period (days)")} days (around Earth)`, sourceId: "nasa-factsheet" });
      f.push({ label: "Mean temperature", value: `${get("Mean Temperature (C)")} °C`, sourceId: "nasa-factsheet" });
      if (b.id !== "moon") f.push({ label: "Known moons", value: get("Number of Moons")!, sourceId: "nasa-factsheet" });
      f.push({ label: "Ring system", value: get("Ring System?")!, sourceId: "nasa-factsheet" });
    } else {
      const small = sbdbFacts(sbdb.objects[b.id]);
      if (radiusKm && !small.some((x) => x.label === "Diameter" || x.label === "Dimensions")) f.push({ label: "Mean radius", value: `${fmt(radiusKm, radiusKm < 10 ? 2 : 0)} km`, sourceId: "jpl-horizons" });
      f.push(...small);
      const orbit = raw.orbit;
      if (orbit && !small.length && b.type !== "spacecraft" && !b.parent) {
        f.push({ label: "Average distance from the Sun", value: `${fmt(orbit.aKm / AU_KM, 2)} AU`, sourceId: "jpl-horizons" });
        f.push({ label: "Orbital eccentricity", value: fmt(orbit.e, 3), sourceId: "jpl-horizons" });
      }
    }
    if (b.rings) f.push({ label: "Main rings span", value: `${fmt(b.rings.innerKm, 0)}–${fmt(b.rings.outerKm, 0)} km from center`, sourceId: "nasa-saturn-rings" });
    if (b.type === "spacecraft" && raw.vectors) {
      const i = raw.vectors.findIndex((r) => Math.abs(r.jd - REF_JD) < 0.01);
      const s = raw.vectors[Math.max(0, i)].state;
      if (i >= 0) f.push({ label: `Speed relative to the Sun (${REFERENCE_EPOCH})`, value: `${fmt(Math.hypot(s[3], s[4], s[5]), 2)} km/s`, sourceId: "jpl-horizons" });
    }
    if (b.id === "sun") radiusKm = 695_700;
    const p = posAtRef(b.id);
    const m = media.objects[b.id];
    const isMoon = !!b.parent;
    const { category, tags } = solarCategory(b, raw.orbit?.aKm);
    const summary = wikiSummary(m, b.wiki ?? "");
    if (b.id === "earth") f.unshift({ label: "Distance from Earth", value: "0 km — you are here" });
    objects.push({
      id: b.id,
      name: b.name,
      aliases: b.aliases ?? [],
      type: b.type,
      category,
      tags,
      subtitle: b.subtitle,
      region: "solar-system",
      parentId: b.parent ?? (b.id === "sun" ? undefined : "sun"),
      position: { kind: "ephemeris", frame: "ICRF", origin: "Sun", unit: "km", key: b.id, method: isMoon ? "Parent position + two-body propagation of Horizons osculating elements" : "Cubic Hermite interpolation of daily Horizons state vectors" },
      distance: p && b.id !== "sun" ? { valueKm: length(p), type: "ephemeris", quality: "precise", sourceId: "jpl-horizons", note: `Distance from the Sun on ${REFERENCE_EPOCH}` } : undefined,
      route: { supported: true, quality: "precise", note: "Positions from JPL Horizons for the map date. Bodies move, so the straight-line distance changes daily." },
      radiusKm: radiusKm ?? undefined,
      facts: f,
      summary,
      image: m?.image ? finishImage(b.id, m.image, undefined, b.name) : undefined,
      gallery: galleryOf(m, [b.name, ...(b.aliases ?? []), b.wiki ?? ""]),
      relation: b.parent ? "orbits" : undefined,
      hasRings: fs ? fs["Ring System?"] === "Yes" : false,
      display: { color: b.color, priority: b.priority, texture: b.texture, pole: b.pole, rings: b.rings },
      sourceIds: ["jpl-horizons", ...(fs ? ["nasa-factsheet"] : []), ...(sbdb.objects[b.id] ? ["jpl-sbdb"] : []), ...(b.texture ? ["solar-system-scope"] : []), ...(summary ? ["wikipedia"] : [])],
      featured: true,
    });
  }

  // ---------------- HYG stars ----------------
  const hygText = gunzipSync(await readFile(join(RAW, "hyg_v44.csv.gz"))).toString("utf8");
  const hyg = parseCsv(hygText);
  console.log(`  HYG rows: ${hyg.length}`);
  type HygRow = { id: number; hip: number; hd: number; gl: string; proper: string; bayer: string; flam: string; con: string; spect: string; dist: number; mag: number; absmag: number; ci: number | null; x: number; y: number; z: number; lum: number | null };
  const rows: HygRow[] = hyg.map((r) => ({
    id: Number(r.id), hip: Number(r.hip) || 0, hd: Number(r.hd) || 0, gl: r.gl, proper: r.proper, bayer: r.bayer, flam: r.flam, con: r.con, spect: r.spect,
    dist: Number(r.dist), mag: Number(r.mag), absmag: Number(r.absmag), ci: num(r.ci), x: Number(r.x), y: Number(r.y), z: Number(r.z), lum: num(r.lum),
  }));

  // ---------------- Curated deep-sky and star destinations ----------------
  const exoByHost = new Map<string, Record<string, string>[]>();
  for (const r of exo.rows) exoByHost.set(r.hostname, [...(exoByHost.get(r.hostname) ?? []), r]);
  const linkedHyg = new Set<number>();
  const curatedById = new Map<string, CatalogObject>();
  // Hosts must be placed before the features that borrow their distance.
  const ordered = [...CURATED].sort((a, b) => Number(a.distance.kind === "host") - Number(b.distance.kind === "host"));

  for (const c of ordered) {
    const s = simbad.objects[c.id]?.basic;
    if (!s) throw new Error(`No SIMBAD record for ${c.id} (${c.simbad})`);
    const ra = Number(s.ra), dec = Number(s.dec);
    const plx = num(s.plx_value), plxErr = num(s.plx_err);
    const z = num(s.rvz_redshift);
    const f: Fact[] = [];
    let distRec: CatalogObject["distance"];
    let route: RouteCapability;
    let depth: "measured" | "host" = "measured";
    let cosmo: CatalogObject["cosmo"];
    const spec = c.distance;
    const extragalactic = ["galaxy", "quasar", "galaxy-group"].includes(c.type) || ["local-group", "local-volume", "cosmological"].includes(c.region);
    const isGalactic = !extragalactic;

    if (spec.kind === "parallax") {
      if (!isGalactic) throw new Error(`Parallax rule used for extragalactic ${c.id}`);
      const a = assessParallax(plx, plxErr);
      if (a.usable) {
        const plxSrc = s.plx_bibcode ? ads(s.plx_bibcode.trim()) : "simbad";
        distRec = { valueKm: a.distancePc * PC_KM, plusKm: a.plusPc * PC_KM, minusKm: a.minusPc * PC_KM, type: "parallax", quality: a.quality, method: `Parallax ${fmt(plx!, 3)} ± ${fmt(plxErr!, 3)} mas`, sourceId: plxSrc, bibcode: s.plx_bibcode?.trim() };
        route = { supported: true, quality: a.quality };
      } else {
        route = { supported: false, reason: `${a.reason}. We do not invert unreliable parallaxes, so a distance-based route is unavailable.` };
        if (plx != null) f.push({ label: "Parallax", value: `${fmt(plx, 2)} ± ${fmt(plxErr ?? NaN, 2)} mas (too uncertain to invert)`, sourceId: "simbad" });
      }
    } else if (spec.kind === "simbad") {
      const row = simbad.objects[c.id].distances.find((d) => d.bibcode.trim() === spec.bibcode);
      if (!row) throw new Error(`SIMBAD distance ${spec.bibcode} not found for ${c.id}`);
      const k = UNIT_TO_PC[row.unit.trim()];
      if (!k) throw new Error(`Unknown distance unit ${row.unit}`);
      const d = Number(row.dist) * k;
      const plus = num(row.plus_err), minus = num(row.minus_err);
      const rel = plus != null && plus > 0 ? Math.max(Math.abs(plus), Math.abs(minus ?? plus)) * k / d : null;
      const q = qualityFromRel(rel);
      distRec = { valueKm: d * PC_KM, plusKm: plus ? Math.abs(plus) * k * PC_KM : undefined, minusKm: minus ? Math.abs(minus) * k * PC_KM : undefined, type: "literature", quality: q, method: row.method?.trim() || "Literature value", sourceId: ads(spec.bibcode), bibcode: spec.bibcode, note: rel == null ? "No uncertainty reported in SIMBAD for this measurement." : undefined };
      route = { supported: true, quality: q };
    } else if (spec.kind === "literature") {
      distRec = { valueKm: spec.valuePc * PC_KM, plusKm: spec.plusPc ? spec.plusPc * PC_KM : undefined, minusKm: spec.minusPc ? spec.minusPc * PC_KM : undefined, type: "literature", quality: spec.quality, method: spec.citation, sourceId: ads(spec.bibcode, spec.citation), bibcode: spec.bibcode, note: spec.note };
      route = { supported: true, quality: spec.quality, note: spec.note };
    } else if (spec.kind === "auto") {
      const a = isGalactic ? assessParallax(plx, plxErr) : null;
      const measurements = simbad.objects[c.id].distances
        .map((d) => ({ k: UNIT_TO_PC[d.unit.trim()], d }))
        .filter((x) => x.k)
        .map(({ k, d }) => ({ distPc: Number(d.dist) * k, plusPc: num(d.plus_err) != null ? num(d.plus_err)! * k : null, minusPc: num(d.minus_err) != null ? num(d.minus_err)! * k : null, method: d.method ?? "", bibcode: d.bibcode.trim() }));
      const robust = robustDistance(measurements, { extragalactic });
      if (a?.usable) {
        const plxSrc = s.plx_bibcode ? ads(s.plx_bibcode.trim()) : "simbad";
        distRec = { valueKm: a.distancePc * PC_KM, plusKm: a.plusPc * PC_KM, minusKm: a.minusPc * PC_KM, type: "parallax", quality: a.quality, method: `Parallax ${fmt(plx!, 3)} ± ${fmt(plxErr!, 3)} mas`, sourceId: plxSrc, bibcode: s.plx_bibcode?.trim() };
        route = { supported: true, quality: a.quality };
      } else if (robust) {
        const sig = robust.sigmaPc;
        const methodText = robust.n === 1 ? `${describeMethod(robust.methods[0])} (single published value)` : `Median of ${robust.n} published distances (${robust.methods.map(describeMethod).join(", ")})`;
        distRec = {
          valueKm: robust.valuePc * PC_KM, plusKm: sig ? sig * PC_KM : undefined, minusKm: sig ? sig * PC_KM : undefined, type: "literature", quality: robust.quality,
          method: methodText, sourceId: ads(robust.bibcode), bibcode: robust.bibcode,
          note: sig ? (robust.n >= 3 ? "Uncertainty is the scatter between published values (scaled median absolute deviation)." : undefined) : "No uncertainty available; treat as approximate.",
        };
        route = { supported: true, quality: robust.quality };
      } else {
        route = { supported: false, reason: "SIMBAD lists no redshift-independent distance for this object, so it cannot be placed in 3D or routed." };
      }
    } else if (spec.kind === "host") {
      const host = c.parent ? curatedById.get(c.parent) : undefined;
      if (!host?.distance || host.position?.kind !== "static") throw new Error(`Host distance unavailable for ${c.id} (parent ${c.parent})`);
      depth = "host";
      distRec = { ...host.distance, note: `Placed at the distance of ${host.name}; its own depth inside the galaxy is not measured. Fine for the map, not for travel inside ${host.name}.` };
      route = { supported: true, quality: host.distance.quality, note: `Distance is that of ${host.name}. Routes between two features of ${host.name} are not offered, because their true separation along the line of sight is unknown.` };
    } else if (spec.kind === "cosmo") {
      if (z == null || z <= 0) throw new Error(`No redshift for cosmological ${c.id}`);
      cosmo = { z, dir: unitFromRaDec(ra, dec), comovingLy: comovingDistanceLy(z), lightTravelYears: lightTravelTimeYears(z), model: PLANCK18.label, sourceId: "planck-2018" };
      route = { supported: false, reason: `${c.name} is at redshift z ≈ ${fmt(z, z < 1 ? 3 : 2)}. At this distance space expands during any journey, and light-travel, comoving and luminosity distances disagree, so a constant-speed route is not meaningful. It appears only in the schematic Observable universe overview.` };
      f.push({ label: "Light-travel time", value: `${fmtBillions(cosmo.lightTravelYears)} years (light left it this long ago)`, sourceId: "planck-2018" });
      f.push({ label: "Comoving distance today", value: `${fmtBillions(cosmo.comovingLy)} light-years`, sourceId: "planck-2018" });
    } else {
      route = { supported: false, reason: spec.reason };
    }
    if (z != null && (c.type === "galaxy" || c.type === "quasar" || c.type === "galaxy-group") && Math.abs(z) > 0) f.push({ label: "Redshift (z)", value: fmt(z, Math.abs(z) < 0.01 ? 5 : 4), sourceId: "simbad" });

    // Beyond ~100 Mpc cosmic expansion makes a fixed-speed straight line misleading.
    if (distRec && distRec.valueKm > 100e6 * PC_KM) route = { supported: false, reason: `${c.name} is about ${distanceFact(distRec.valueKm)} away, where cosmic expansion makes a constant-speed straight-line trip misleading. Explore it on the map instead.` };

    const position = distRec
      ? { kind: "static" as const, frame: "ICRF" as const, origin: "Sun" as const, epoch: "J2000.0 (ICRS coordinates from SIMBAD)", unit: "km" as const, xyz: cartesianFromRaDecDistance(ra, dec, distRec.valueKm), method: depth === "host" ? "RA/Dec at the host galaxy's distance" : "RA/Dec + vetted distance", depth }
      : undefined;

    // Link to the HYG point cloud by position and brightness.
    let hygRow: HygRow | undefined;
    if (c.type === "star" || c.type === "white-dwarf") {
      const u = unitFromRaDec(ra, dec);
      const vmag = num(s.vmag);
      let best = Infinity;
      for (const r of rows) {
        const rr = Math.hypot(r.x, r.y, r.z);
        if (!rr || !isValidHygDistance(r.dist)) continue;
        const cos = (r.x * u[0] + r.y * u[1] + r.z * u[2]) / rr;
        if (cos < Math.cos((0.02 * Math.PI) / 180)) continue;
        const score = vmag != null ? Math.abs(r.mag - vmag) : 0;
        if (score < best && score < 0.8) { best = score; hygRow = r; }
      }
      if (hygRow && !linkedHyg.has(hygRow.id)) linkedHyg.add(hygRow.id);
      else hygRow = undefined;
    }

    const sp = s.sp_type?.trim();
    const desc = describeSpectralType(sp);
    const con = hygRow?.con ? CONSTELLATIONS[hygRow.con] : undefined;
    const morph = s.morph_type?.trim();
    if (sp && ["star", "white-dwarf", "neutron-star", "black-hole"].includes(c.type)) f.unshift({ label: "Spectral type", value: sp, sourceId: "simbad" });
    if (morph && ["galaxy", "quasar"].includes(c.type)) f.unshift({ label: "Morphology", value: morph, sourceId: "simbad" });
    if (num(s.vmag) != null) f.push({ label: "Apparent magnitude (V)", value: fmt(Number(s.vmag), 2), sourceId: "simbad" });
    if (hygRow?.lum && c.type === "star") f.push({ label: "Luminosity", value: `${fmt(hygRow.lum, hygRow.lum < 10 ? 3 : 0)} × Sun`, sourceId: "hyg-v44" });
    if (con) f.push({ label: "Constellation", value: con, sourceId: "hyg-v44" });
    if (distRec?.type === "parallax") f.push({ label: "Parallax", value: `${distRec.method!.replace("Parallax ", "")}`, sourceId: distRec.sourceId });
    const major = num(s.galdim_majaxis), minor = num(s.galdim_minaxis), pa = num(s.galdim_angle);
    let extentKm: number | undefined, axisRatio: number | undefined;
    if (major && c.type !== "star") {
      f.push({ label: "Apparent size", value: `${fmt(major, 1)}′ × ${fmt(minor ?? major, 1)}′`, sourceId: "simbad" });
      if (distRec) {
        extentKm = (major / 60) * (Math.PI / 180) * distRec.valueKm;
        axisRatio = minor ? Math.min(1, minor / major) : 1;
        f.push({ label: "Approx. physical size", value: `${distanceFact(extentKm)} across (from apparent size × distance)`, sourceId: "simbad" });
      }
    }
    const parent = c.parent ? CURATED.find((x) => x.id === c.parent) : undefined;
    if (parent && c.relation) f.push({ label: RELATION_LABEL[c.relation], value: parent.name });

    let exoplanets: CatalogObject["exoplanets"];
    if (c.exoplanetHost && exoByHost.has(c.exoplanetHost)) {
      const ps = exoByHost.get(c.exoplanetHost)!.sort((a, b) => (num(a.pl_orbper) ?? 0) - (num(b.pl_orbper) ?? 0));
      exoplanets = {
        count: ps.length,
        planets: ps.map((p) => ({ name: p.pl_name, periodDays: num(p.pl_orbper) ?? undefined, radiusEarth: num(p.pl_rade) ?? undefined, massEarth: num(p.pl_bmasse) ?? undefined, discoveryYear: num(p.disc_year) ?? undefined, method: p.discoverymethod })),
        sourceId: "nasa-exoplanet-archive",
      };
      f.push({ label: "Confirmed planets", value: `${ps.length}`, sourceId: "nasa-exoplanet-archive" });
    }

    const m = media.objects[c.id];
    const bv = hygRow?.ci;
    const color = (c.type === "star" || c.type === "white-dwarf") && bv != null ? rgbToHex(blackbodyRgb(temperatureFromBV(bv))) : TYPE_COLOR[c.type] ?? "#fff2d6";
    const subtitle = c.subtitle ?? [desc ?? (c.type === "star" ? "Star" : c.type), con].filter(Boolean).join(" · ");
    if (distRec) f.unshift({ label: depth === "host" ? `Distance from the Sun (that of ${parent?.name ?? "its host"})` : "Distance from the Sun", value: distanceFact(distRec.valueKm), sourceId: distRec.sourceId });
    const image = m?.image ? finishImage(c.id, m.image, c.imageKind, c.name) : undefined;
    const summary = c.blurb ? blurbSummary(c.blurb) : wikiSummary(m, c.wiki);
    const obj: CatalogObject = {
      id: c.id,
      name: c.name,
      aliases: [...(c.aliases ?? []), s.main_id.replace(/\s+/g, " ").replace(/^(NAME|\*|V\*) /, "")].filter((a, i, arr) => a && a !== c.name && arr.indexOf(a) === i),
      type: c.type,
      category: c.category ?? DEFAULT_CATEGORY[c.id] ?? (c.exoplanetHost ? "st-exohosts" : CATEGORY_BY_TYPE[c.type]),
      tags: [...(c.tags ?? []), ...(DEFAULT_TAGS[c.id] ?? []), ...(c.exoplanetHost && c.category && c.category !== "st-exohosts" ? ["st-exohosts"] : [])],
      subtitle,
      region: c.region,
      parentId: c.parent,
      relation: c.relation,
      position,
      distance: distRec,
      cosmo,
      route,
      facts: dedupeFacts(f),
      summary,
      image,
      gallery: galleryOf(m, [c.name, ...(c.aliases ?? []), c.wiki ?? ""]),
      exoplanets,
      hygId: hygRow?.id,
      display: { color, priority: c.priority, extentKm, axisRatio, positionAngle: pa ?? undefined, morphology: morph || undefined },
      sourceIds: ["simbad", ...(distRec?.sourceId && distRec.sourceId !== "simbad" ? [distRec.sourceId] : []), ...(cosmo ? ["planck-2018"] : []), ...(exoplanets ? ["nasa-exoplanet-archive"] : []), ...(hygRow ? ["hyg-v44"] : []), ...(summary ? [summary.sourceId] : [])],
      featured: true,
    };
    curatedById.set(c.id, obj);
    objects.push(obj);

    // Individual exoplanet records, placed at their host star.
    if (c.exoplanetHost && exoByHost.has(c.exoplanetHost) && position) {
      for (const p of exoByHost.get(c.exoplanetHost)!) {
        const pf: Fact[] = [];
        const per = num(p.pl_orbper), a = num(p.pl_orbsmax), rad = num(p.pl_rade), mass = num(p.pl_bmasse), teq = num(p.pl_eqt), yr = num(p.disc_year);
        if (per) pf.push({ label: "Orbital period", value: per < 2 ? `${fmt(per * 24, 1)} hours` : per > 3650 ? `${fmt(per / 365.25, 1)} years` : `${fmt(per, per < 100 ? 2 : 0)} days`, sourceId: "nasa-exoplanet-archive" });
        if (a) pf.push({ label: "Distance from its star", value: `${fmt(a, a < 0.1 ? 4 : 2)} AU`, sourceId: "nasa-exoplanet-archive" });
        if (rad) pf.push({ label: "Radius", value: `${fmt(rad, 2)} × Earth`, sourceId: "nasa-exoplanet-archive" });
        if (mass) pf.push({ label: "Mass", value: `${fmt(mass, mass < 10 ? 2 : 0)} × Earth`, sourceId: "nasa-exoplanet-archive" });
        if (teq) pf.push({ label: "Equilibrium temperature", value: `${fmt(teq, 0)} K`, sourceId: "nasa-exoplanet-archive" });
        if (yr) pf.push({ label: "Discovered", value: `${yr}${p.discoverymethod ? ` · ${p.discoverymethod}` : ""}`, sourceId: "nasa-exoplanet-archive" });
        const id = `exo-${slug(p.pl_name)}`;
        const notable = NOTABLE_EXOPLANETS.includes(p.pl_name);
        objects.push({
          id, name: p.pl_name, aliases: [], type: "exoplanet", category: "st-exoplanets", subtitle: `Exoplanet · orbits ${c.name}`, region: c.region, parentId: c.id, relation: "planet",
          position: { ...position, method: "Placed at its host star (orbit too small to show at this scale)" },
          distance: distRec, route: route.supported ? { supported: true, quality: route.quality, note: `Distance is that of its star, ${c.name}.` } : route,
          facts: [...(distRec ? [{ label: "Distance from the Sun", value: distanceFact(distRec.valueKm), sourceId: distRec.sourceId }] : []), ...pf],
          summary: {
            text: `${p.pl_name} is a confirmed exoplanet orbiting ${c.name}${yr ? `, discovered in ${yr}` : ""}${p.discoverymethod ? ` using the ${p.discoverymethod.toLowerCase()} method` : ""}${p.disc_facility ? ` (${p.disc_facility})` : ""}.`,
            sourceId: "nasa-exoplanet-archive", url: `https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(p.pl_name)}`,
          },
          display: { color: "#8fd0ff", priority: notable ? 30 : 12 },
          sourceIds: ["nasa-exoplanet-archive", ...(distRec ? [distRec.sourceId] : [])],
          featured: notable,
        });
      }
    }
  }

  // ---------------- Missions and vehicles (content cards; no invented trajectories) ----------------
  for (const msn of MISSIONS) {
    const m = media.objects[msn.id];
    const summary = wikiSummary(m, msn.wiki);
    objects.push({
      id: msn.id, name: msn.name, aliases: msn.aliases ?? [], type: "mission", category: msn.category, tags: msn.tags, subtitle: msn.subtitle,
      region: "solar-system", parentId: msn.parent, relation: msn.parent ? "orbits" : undefined,
      route: { supported: false, reason: msn.noPosition },
      facts: [{ label: "Operator", value: msn.operator, sourceId: "wikipedia" }, ...msn.facts.map(([label, value]) => ({ label, value, sourceId: "wikipedia" }))],
      summary,
      image: m?.image ? finishImage(msn.id, m.image, undefined, msn.name) : undefined,
      gallery: galleryOf(m, [msn.name, ...(msn.aliases ?? []), msn.wiki]),
      mission: { operator: msn.operator, status: msn.status, statusNote: msn.statusNote, destinations: msn.destinations },
      display: { color: "#f2c94c", priority: msn.priority },
      sourceIds: ["wikipedia"],
      featured: true,
    });
  }

  // ---------------- HYG named stars (lightweight entries) ----------------
  let named = 0;
  for (const r of rows) {
    if (!r.proper || r.id === 0 || linkedHyg.has(r.id)) continue;
    const valid = isValidHygDistance(r.dist);
    const desc = describeSpectralType(r.spect);
    const con = CONSTELLATIONS[r.con];
    const f: Fact[] = [];
    if (valid) f.push({ label: "Distance from the Sun", value: distanceFact(r.dist * PC_KM), sourceId: "hyg-v44" });
    if (r.spect) f.push({ label: "Spectral type", value: r.spect, sourceId: "hyg-v44" });
    f.push({ label: "Apparent magnitude (V)", value: fmt(r.mag, 2), sourceId: "hyg-v44" });
    if (con) f.push({ label: "Constellation", value: con, sourceId: "hyg-v44" });
    objects.push({
      id: `hyg-${r.id}`,
      name: r.proper,
      category: "st-stars",
      aliases: [hygLabel({ ...r, proper: "" }), r.hip ? `HIP ${r.hip}` : ""].filter((a) => a && a !== r.proper),
      type: "star",
      subtitle: [desc ?? "Star", con].filter(Boolean).join(" · "),
      region: valid && r.dist <= 300 ? "stellar-neighborhood" : "milky-way",
      position: valid ? { kind: "static", frame: "ICRF", origin: "Sun", epoch: "J2000.0 (HYG v4.4)", unit: "km", xyz: [r.x * PC_KM, r.y * PC_KM, r.z * PC_KM], method: "HYG Cartesian coordinates (Hipparcos parallax)" } : undefined,
      distance: valid ? { valueKm: r.dist * PC_KM, type: "catalog", quality: r.dist <= 100 ? "approximate" : "uncertain", sourceId: "hyg-v44", note: "Uncertainty not tabulated in HYG." } : undefined,
      route: hygRouteCapability(r.dist),
      facts: f,
      hygId: r.id,
      display: { color: r.ci != null ? rgbToHex(blackbodyRgb(temperatureFromBV(r.ci))) : "#fff2d6", priority: Math.max(5, Math.min(40, Math.round(30 - r.mag * 4))) },
      sourceIds: ["hyg-v44"],
      featured: false,
    });
    named++;
  }

  // ---------------- Star point cloud ----------------
  const columns = ["x_pc", "y_pc", "z_pc", "absmag", "ci", "mag", "hyg_id", "hip"];
  const starRows = rows.filter((r) => r.id !== 0 && isValidHygDistance(r.dist) && r.dist <= STAR_MAX_PC);
  starRows.sort((a, b) => a.absmag - b.absmag);
  const buf = new Float32Array(starRows.length * columns.length);
  starRows.forEach((r, i) => {
    buf.set([r.x, r.y, r.z, r.absmag, r.ci ?? 0.65, r.mag, r.id, r.hip], i * columns.length);
  });
  const names: Record<number, [string, string, string]> = {};
  for (const r of starRows) if (r.proper || r.bayer || r.flam) names[r.id] = [hygLabel(r), r.spect, r.con];

  // ---------------- Speed references ----------------
  const speedAt = (id: string) => {
    const v = horizons.bodies[id].vectors!.find((r) => Math.abs(r.jd - REF_JD) < 0.01)!.state;
    return Math.hypot(v[3], v[4], v[5]);
  };
  const speedReferences: SpeedReference[] = [
    { id: "voyager-1-speed", label: "Voyager 1", speedKmS: speedAt("voyager-1"), frame: "Heliocentric (relative to the Sun)", epoch: REFERENCE_EPOCH, description: `Voyager 1's speed relative to the Sun on ${REFERENCE_EPOCH} (JPL Horizons). It is coasting after planetary flybys; no rocket has one fixed "travel speed".`, sourceId: "jpl-horizons" },
    { id: "new-horizons-speed", label: "New Horizons", speedKmS: speedAt("new-horizons"), frame: "Heliocentric (relative to the Sun)", epoch: REFERENCE_EPOCH, description: `New Horizons' speed relative to the Sun on ${REFERENCE_EPOCH} (JPL Horizons).`, sourceId: "jpl-horizons" },
    { id: "parker-peak-speed", label: "Parker Solar Probe (peak)", speedKmS: horizons.parkerPeak.speed, frame: "Heliocentric (relative to the Sun)", epoch: "2024-12-24 perihelion", description: "Parker Solar Probe's peak speed relative to the Sun at its record 2024-12-24 perihelion, from JPL Horizons vectors. It only reaches this for minutes, deep in the Sun's gravity well; it is not a cruise speed.", sourceId: "jpl-horizons" },
  ];

  // ---------------- Highlights ----------------
  // Image-led browse picks: the highest-priority illustrated destinations, capped per top-level
  // category so the list stays varied.
  const HIGHLIGHT_CAP: Record<string, number> = { "solar-system": 24, stars: 16, compact: 12, clusters: 10, nebulae: 18, galaxies: 26, structures: 6, missions: 14 };
  const perTop = new Map<string, number>();
  const candidates = objects.filter((o) => o.featured && o.image && o.image.kind !== "texture" && o.type !== "exoplanet").sort((a, b) => b.display.priority - a.display.priority || a.name.localeCompare(b.name));
  for (const o of candidates) {
    const top = CATEGORY_TREE.find((t) => inCategory(o, t.id))?.id ?? "other";
    const n = perTop.get(top) ?? 0;
    if (n >= (HIGHLIGHT_CAP[top] ?? 6)) continue;
    perTop.set(top, n + 1);
    o.highlight = true;
  }

  const catalog: Catalog = {
    version: "1.1.0",
    generated: new Date().toISOString(),
    referenceEpoch: REFERENCE_EPOCH,
    frame: "ICRF axes, origin at the Sun's center, kilometres",
    objects,
    sources,
    speedReferences,
    stars: { file: "/data/stars.bin", count: starRows.length, columns, sourceId: "hyg-v44", maxDistancePc: STAR_MAX_PC },
  };
  applyEditorialAssets(catalog);

  await mkdir(PUBLIC_DATA, { recursive: true });
  await writeJson(join(PUBLIC_DATA, "catalog.json"), catalog, false);
  await writeJson(join(PUBLIC_DATA, "ephemeris.json"), eph, false);
  await writeJson(join(PUBLIC_DATA, "star-names.json"), names, false);
  await writeFile(join(PUBLIC_DATA, "stars.bin"), Buffer.from(buf.buffer));
  const featured = objects.filter((o) => o.featured);
  console.log(`  Catalog: ${objects.length} objects (${featured.length} featured, ${named} HYG named), ${featured.filter((o) => o.image).length} with images`);
  console.log(`  Routable featured: ${featured.filter((o) => o.route.supported).length}; not routable: ${featured.filter((o) => !o.route.supported).map((o) => o.name).join(", ")}`);
  console.log(`  Stars: ${starRows.length} within ${STAR_MAX_PC} pc (${(buf.byteLength / 1e6).toFixed(1)} MB)`);
  const count = (f: (o: CatalogObject) => boolean) => objects.filter(f).length;
  console.log(`  Destinations (featured): ${featured.length}; highlights: ${count((o) => !!o.highlight)} (${[...perTop].map(([k, v]) => `${k} ${v}`).join(", ")})`);
  console.log(`  Gallery images: ${galleryStats.kept} kept, ${galleryStats.dropped} dropped as unrelated to the object`);
  console.log(`  Galaxies: ${count((o) => o.type === "galaxy")}; Andromeda features: ${count((o) => o.parentId === "andromeda")}; SpaceX / human spaceflight: ${count((o) => inCategory(o, "sc-spacex") || inCategory(o, "sc-human"))}`);
  console.log(`  Per category: ${CATEGORY_TREE.map((t) => `${t.id} ${count((o) => inCategory(o, t.id))}`).join(", ")}`);
  console.log(`  Speeds: ${speedReferences.map((s) => `${s.label} ${s.speedKmS.toFixed(2)} km/s`).join(", ")}`);
}

await main();
