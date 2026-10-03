/**
 * Build the bundled SpaceMaps dataset from cached raw responses in data/raw/.
 * Outputs public/data/{catalog.json, ephemeris.json, stars.bin, star-names.json}.
 * Run with `npm run data:build` (no network required).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { RAW, PUBLIC_DATA, readJson, writeJson, parseCsv, exists } from "./lib";
import { SOLAR_BODIES, CURATED, REFERENCE_EPOCH, EPHEMERIS_START, EPHEMERIS_STOP } from "./config";
import { HYG_URL } from "./catalogs";
import type { Catalog, CatalogObject, Ephemeris, Fact, SourceInfo, SpeedReference, DistanceQuality, RouteCapability, ImageRecord, OrbitElements } from "../../src/lib/types";
import { PC_KM, AU_KM, LY_KM } from "../../src/lib/units";
import { assessParallax, cartesianFromRaDecDistance, isValidHygDistance, unitFromRaDec } from "../../src/lib/coords";
import { keplerPosition } from "../../src/lib/kepler";
import { ephemerisPosition } from "../../src/lib/ephemeris";
import { describeSpectralType, hygRouteCapability, hygLabel, CONSTELLATIONS, temperatureFromBV, blackbodyRgb, rgbToHex } from "../../src/lib/stars";
import { distance, length } from "../../src/lib/vec";

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
interface MediaRaw { retrieved: string; objects: Record<string, { summary: { extract: string; url?: string } | null; image: (ImageRecord & { description?: string }) | null }> }

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

function firstSentences(text: string, max = 420) {
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  let out = "";
  for (const p of parts) {
    if ((out + p).length > max && out) break;
    out += p;
  }
  return out.trim();
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

async function main() {
  const horizons = await readJson<HorizonsRaw>(join(RAW, "horizons.json"));
  const simbad = await readJson<SimbadRaw>(join(RAW, "simbad.json"));
  const exo = await readJson<ExoRaw>(join(RAW, "exoplanets.json"));
  const facts = await readJson<FactRaw>(join(RAW, "factsheet.json"));
  const media: MediaRaw = (await exists(join(RAW, "media.json"))) ? await readJson<MediaRaw>(join(RAW, "media.json")) : { retrieved: "", objects: {} };

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
  };
  const ads = (bibcode: string, title?: string) => {
    const id = `ads-${bibcode}`;
    sources[id] ??= { id, title: title ?? bibcode, url: `https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(bibcode)}` };
    return id;
  };

  // ---------------- Ephemeris ----------------
  const eph: Ephemeris = { frame: "ICRF", center: "Sun (body center)", timeScale: "TDB", startJdTdb: Infinity, endJdTdb: -Infinity, bodies: {}, satellites: {}, orbits: {}, sourceId: "jpl-horizons" };
  for (const b of SOLAR_BODIES) {
    const raw = horizons.bodies[b.id];
    if (!raw) throw new Error(`Missing Horizons data for ${b.id}`);
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
  for (const b of SOLAR_BODIES) {
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
    } else if (radiusKm) {
      f.push({ label: "Mean radius", value: `${fmt(radiusKm, radiusKm < 10 ? 2 : 0)} km`, sourceId: "jpl-horizons" });
    }
    if (b.rings) f.push({ label: "Main rings span", value: `${fmt(b.rings.innerKm, 0)}–${fmt(b.rings.outerKm, 0)} km from center`, sourceId: "nasa-saturn-rings" });
    if (b.type === "spacecraft" && raw.vectors) {
      const i = raw.vectors.findIndex((r) => Math.abs(r.jd - REF_JD) < 0.01);
      const s = raw.vectors[i].state;
      f.push({ label: `Speed relative to the Sun (${REFERENCE_EPOCH})`, value: `${fmt(Math.hypot(s[3], s[4], s[5]), 2)} km/s`, sourceId: "jpl-horizons" });
    }
    if (b.id === "sun") radiusKm = 695_700;
    const p = posAtRef(b.id);
    const m = media.objects[b.id];
    const isMoon = !!b.parent;
    objects.push({
      id: b.id,
      name: b.name,
      aliases: b.aliases ?? [],
      type: b.type,
      subtitle: b.subtitle,
      region: "solar-system",
      parentId: b.parent ?? (b.id === "sun" ? undefined : "sun"),
      position: { kind: "ephemeris", frame: "ICRF", origin: "Sun", unit: "km", key: b.id, method: isMoon ? "Parent position + two-body propagation of Horizons osculating elements" : "Cubic Hermite interpolation of daily Horizons state vectors" },
      distance: p && b.id !== "sun" ? { valueKm: length(p), type: "ephemeris", quality: "precise", sourceId: "jpl-horizons", note: `Distance from the Sun on ${REFERENCE_EPOCH}` } : undefined,
      route: { supported: true, quality: "precise", note: "Positions from JPL Horizons for the map date. Bodies move, so the straight-line distance changes daily." },
      radiusKm: radiusKm ?? undefined,
      facts: f,
      summary: m?.summary ? { text: firstSentences(m.summary.extract), sourceId: "wikipedia", url: m.summary.url ?? `https://en.wikipedia.org/wiki/${b.wiki}` } : undefined,
      image: m?.image ? stripDesc(m.image) : undefined,
      hasRings: fs ? fs["Ring System?"] === "Yes" : false,
      display: { color: b.color, priority: b.priority, texture: b.texture, pole: b.pole, rings: b.rings },
      sourceIds: ["jpl-horizons", ...(fs ? ["nasa-factsheet"] : []), ...(b.texture ? ["solar-system-scope"] : []), ...(m?.summary ? ["wikipedia"] : [])],
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

  for (const c of CURATED) {
    const s = simbad.objects[c.id]?.basic;
    if (!s) throw new Error(`No SIMBAD record for ${c.id} (${c.simbad})`);
    const ra = Number(s.ra), dec = Number(s.dec);
    const plx = num(s.plx_value), plxErr = num(s.plx_err);
    const f: Fact[] = [];
    let distRec: CatalogObject["distance"];
    let route: RouteCapability;
    const spec = c.distance;
    const isGalactic = c.type === "star" || c.type === "star-cluster" || c.type === "nebula";

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
      const unit = row.unit.trim();
      const k = unit === "pc" ? 1 : unit === "kpc" ? 1e3 : unit === "Mpc" ? 1e6 : NaN;
      if (!Number.isFinite(k)) throw new Error(`Unknown distance unit ${unit}`);
      const d = Number(row.dist) * k;
      const plus = num(row.plus_err), minus = num(row.minus_err);
      const rel = plus != null && plus > 0 ? Math.max(Math.abs(plus), Math.abs(minus ?? plus)) * k / d : null;
      const q = qualityFromRel(rel);
      distRec = { valueKm: d * PC_KM, plusKm: plus ? Math.abs(plus) * k * PC_KM : undefined, minusKm: minus ? Math.abs(minus) * k * PC_KM : undefined, type: "literature", quality: q, method: row.method?.trim() || "Literature value", sourceId: ads(spec.bibcode), bibcode: spec.bibcode, note: rel == null ? "No uncertainty reported in SIMBAD for this measurement." : undefined };
      route = { supported: true, quality: q };
    } else if (spec.kind === "literature") {
      distRec = { valueKm: spec.valuePc * PC_KM, plusKm: spec.plusPc ? spec.plusPc * PC_KM : undefined, minusKm: spec.minusPc ? spec.minusPc * PC_KM : undefined, type: "literature", quality: spec.quality, method: spec.citation, sourceId: ads(spec.bibcode, spec.citation), bibcode: spec.bibcode, note: spec.note };
      route = { supported: true, quality: spec.quality, note: spec.note };
    } else {
      route = { supported: false, reason: spec.reason };
      const z = num(s.rvz_redshift);
      if (z != null) f.push({ label: "Redshift (z)", value: fmt(z, 4), sourceId: "simbad" });
    }

    const position = distRec
      ? { kind: "static" as const, frame: "ICRF" as const, origin: "Sun" as const, epoch: "J2000.0 (ICRS coordinates from SIMBAD)", unit: "km" as const, xyz: cartesianFromRaDecDistance(ra, dec, distRec.valueKm), method: "RA/Dec + vetted distance" }
      : undefined;

    // Link to the HYG point cloud by position and brightness.
    let hygRow: HygRow | undefined;
    if (c.type === "star") {
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
      if (hygRow) linkedHyg.add(hygRow.id);
    }

    const sp = s.sp_type?.trim();
    const desc = describeSpectralType(sp);
    const con = hygRow?.con ? CONSTELLATIONS[hygRow.con] : undefined;
    if (sp) f.unshift({ label: "Spectral type", value: sp, sourceId: "simbad" });
    if (num(s.vmag) != null) f.push({ label: "Apparent magnitude (V)", value: fmt(Number(s.vmag), 2), sourceId: "simbad" });
    if (hygRow?.lum && c.type === "star") f.push({ label: "Luminosity", value: `${fmt(hygRow.lum, hygRow.lum < 10 ? 3 : 0)} × Sun`, sourceId: "hyg-v44" });
    if (con) f.push({ label: "Constellation", value: con, sourceId: "hyg-v44" });
    if (distRec?.type === "parallax") f.push({ label: "Parallax", value: `${distRec.method!.replace("Parallax ", "")}`, sourceId: distRec.sourceId });
    const major = num(s.galdim_majaxis), minor = num(s.galdim_minaxis);
    let extentKm: number | undefined, axisRatio: number | undefined;
    if (major && distRec && c.type !== "star") {
      extentKm = (major / 60) * (Math.PI / 180) * distRec.valueKm;
      axisRatio = minor ? Math.min(1, minor / major) : 1;
      f.push({ label: "Apparent size", value: `${fmt(major, 1)}′ × ${fmt(minor ?? major, 1)}′`, sourceId: "simbad" });
      f.push({ label: "Approx. physical size", value: distanceFact(extentKm), sourceId: "simbad" });
    }

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
    const color = c.type === "star" && bv != null ? rgbToHex(blackbodyRgb(temperatureFromBV(bv))) : c.type === "galaxy" ? "#c9b8ff" : c.type === "nebula" ? "#ff8fa3" : c.type === "star-cluster" ? "#9ecbff" : c.type === "black-hole" ? "#222" : c.type === "quasar" ? "#7ad3ff" : "#fff2d6";
    const subtitle = c.subtitle ?? [desc ?? (c.type === "star" ? "Star" : c.type), con].filter(Boolean).join(" · ");
    if (distRec) f.unshift({ label: "Distance from the Sun", value: distanceFact(distRec.valueKm), sourceId: distRec.sourceId });
    const image = m?.image ? stripDesc(m.image, c.imageKind) : undefined;
    objects.push({
      id: c.id,
      name: c.name,
      aliases: [...(c.aliases ?? []), s.main_id.replace(/\s+/g, " ").replace(/^(NAME|\*|V\*) /, "")].filter((a, i, arr) => a && a !== c.name && arr.indexOf(a) === i),
      type: c.type,
      subtitle,
      region: c.region,
      position,
      distance: distRec,
      route,
      facts: f,
      summary: m?.summary ? { text: firstSentences(m.summary.extract), sourceId: "wikipedia", url: m.summary.url ?? `https://en.wikipedia.org/wiki/${c.wiki}` } : undefined,
      image,
      exoplanets,
      hygId: hygRow?.id,
      display: { color, priority: c.priority, extentKm, axisRatio },
      sourceIds: ["simbad", ...(distRec?.sourceId && distRec.sourceId !== "simbad" ? [distRec.sourceId] : []), ...(exoplanets ? ["nasa-exoplanet-archive"] : []), ...(hygRow ? ["hyg-v44"] : []), ...(m?.summary ? ["wikipedia"] : [])],
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

  const catalog: Catalog = {
    version: "1.0.0",
    generated: new Date().toISOString(),
    referenceEpoch: REFERENCE_EPOCH,
    frame: "ICRF axes, origin at the Sun's center, kilometres",
    objects,
    sources,
    speedReferences,
    stars: { file: "/data/stars.bin", count: starRows.length, columns, sourceId: "hyg-v44", maxDistancePc: STAR_MAX_PC },
  };

  await mkdir(PUBLIC_DATA, { recursive: true });
  await writeJson(join(PUBLIC_DATA, "catalog.json"), catalog, false);
  await writeJson(join(PUBLIC_DATA, "ephemeris.json"), eph, false);
  await writeJson(join(PUBLIC_DATA, "star-names.json"), names, false);
  await writeFile(join(PUBLIC_DATA, "stars.bin"), Buffer.from(buf.buffer));
  const featured = objects.filter((o) => o.featured);
  console.log(`  Catalog: ${objects.length} objects (${featured.length} featured, ${named} HYG named), ${featured.filter((o) => o.image).length} with images`);
  console.log(`  Routable featured: ${featured.filter((o) => o.route.supported).length}; not routable: ${featured.filter((o) => !o.route.supported).map((o) => o.name).join(", ")}`);
  console.log(`  Stars: ${starRows.length} within ${STAR_MAX_PC} pc (${(buf.byteLength / 1e6).toFixed(1)} MB)`);
  console.log(`  Speeds: ${speedReferences.map((s) => `${s.label} ${s.speedKmS.toFixed(2)} km/s`).join(", ")}`);
}

function stripDesc(img: ImageRecord & { description?: string }, kind?: string): ImageRecord {
  const { description: _d, ...rest } = img;
  return { ...rest, kind: (kind as ImageRecord["kind"]) ?? rest.kind };
}

await main();
