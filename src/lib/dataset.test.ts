/** Integration tests against the actual bundled dataset in public/data and raw Horizons cache. */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Catalog, Ephemeris, CatalogObject } from "./types";
import { interpolateBody, ephemerisPosition, ephemerisAccuracy } from "./ephemeris";
import { computeRoute, positionOf } from "./route";
import { LIGHT_MODE, voyagerMode } from "./transport";
import { LY_KM, AU_KM, PC_KM, JULIAN_YEAR_S } from "./units";
import { buildSearchIndex, search, resolveOne } from "./search";
import { distance } from "./vec";
import { inCategory } from "./taxonomy";

const root = join(__dirname, "..", "..");
let catalog: Catalog;
let eph: Ephemeris;
const JD = 2461317.5; // 2026-10-04 00:00 TDB
const get = (id: string) => catalog.objects.find((o) => o.id === id)!;

beforeAll(() => {
  catalog = JSON.parse(readFileSync(join(root, "public/data/catalog.json"), "utf8"));
  eph = JSON.parse(readFileSync(join(root, "public/data/ephemeris.json"), "utf8"));
});

describe("ephemeris", () => {
  it("Hermite interpolation reproduces Horizons samples it did not use", () => {
    const rawPath = join(root, "data/raw/horizons.json");
    if (!existsSync(rawPath)) return;
    const raw = JSON.parse(readFileSync(rawPath, "utf8"));
    for (const id of ["earth", "mercury", "mars", "voyager-1"]) {
      const v = raw.bodies[id].vectors as { jd: number; state: number[] }[];
      // Build a 2-day table and test at the skipped odd days.
      const even = v.filter((_, i) => i % 2 === 0);
      const body = { startJdTdb: even[0].jd, stepDays: 2, states: even.flatMap((r) => r.state) };
      let maxErr = 0;
      for (let i = 1; i < v.length - 1; i += 2) {
        const p = interpolateBody(body, v[i].jd)!;
        maxErr = Math.max(maxErr, distance(p, v[i].state.slice(0, 3) as [number, number, number]));
      }
      // Even with half the samples, errors stay far below Earth's radius (6371 km).
      expect(maxErr).toBeLessThan(id === "mercury" ? 500 : 50);
    }
  });
  it("puts Earth about 1 AU from the Sun and the Moon ~384,000 km from Earth", () => {
    const e = ephemerisPosition(eph, "earth", JD)!;
    expect(Math.hypot(...e) / AU_KM).toBeGreaterThan(0.983);
    expect(Math.hypot(...e) / AU_KM).toBeLessThan(1.017);
    const m = ephemerisPosition(eph, "moon", JD)!;
    const d = distance(e, m);
    expect(d).toBeGreaterThan(356_000);
    expect(d).toBeLessThan(407_000);
  });
  it("falls back to two-body orbits outside the bundled date range", () => {
    const p = ephemerisPosition(eph, "earth", eph.endJdTdb + 10);
    expect(p).not.toBeNull();
    expect(Math.hypot(...p!) / AU_KM).toBeCloseTo(1, 1);
    expect(ephemerisAccuracy(eph, eph.endJdTdb + 10)).toBe("approximate");
    expect(ephemerisAccuracy(eph, eph.startJdTdb + 1)).toBe("precise");
  });
});

describe("catalog integrity", () => {
  it("has 250–500 featured destinations with sources", () => {
    const featured = catalog.objects.filter((o) => o.featured);
    expect(featured.length).toBeGreaterThanOrEqual(250);
    expect(featured.length).toBeLessThanOrEqual(500);
    for (const o of featured) {
      expect(o.sourceIds.length).toBeGreaterThan(0);
      for (const s of o.sourceIds) expect(catalog.sources[s], `${o.id} → ${s}`).toBeDefined();
    }
  });
  it("meets the curated-content targets", () => {
    const highlights = catalog.objects.filter((o) => o.highlight);
    expect(highlights.length).toBeGreaterThanOrEqual(75);
    expect(highlights.length).toBeLessThanOrEqual(150);
    const galaxies = catalog.objects.filter((o) => o.featured && inCategory(o, "galaxies"));
    expect(galaxies.length).toBeGreaterThanOrEqual(40);
    expect(galaxies.length).toBeLessThanOrEqual(80);
    expect(catalog.objects.filter((o) => o.parentId === "andromeda").length).toBeGreaterThanOrEqual(10);
    const spaceflight = catalog.objects.filter((o) => inCategory(o, "sc-spacex") || inCategory(o, "sc-human"));
    expect(spaceflight.length).toBeGreaterThanOrEqual(6);
    expect(spaceflight.length).toBeLessThanOrEqual(10);
  });
  it("every routable object has a finite position; unroutable ones explain why", () => {
    for (const o of catalog.objects) {
      if (o.route.supported) {
        expect(o.position, o.id).toBeDefined();
        const p = positionOf(o, { eph, jdTdb: JD });
        expect(p, o.id).not.toBeNull();
        p!.forEach((x) => expect(Number.isFinite(x)).toBe(true));
      } else {
        expect(o.route.reason.length).toBeGreaterThan(20);
      }
    }
  });
  it("never routes to cosmological-redshift objects", () => {
    for (const o of catalog.objects.filter((o) => o.region === "cosmological")) expect(o.route.supported).toBe(false);
  });
  it("labels every image with imagery type and license", () => {
    for (const o of catalog.objects.filter((o) => o.image)) {
      expect(["observed", "illustration", "ai-reconstruction", "texture"]).toContain(o.image!.kind);
      expect(o.image!.license.length).toBeGreaterThan(0);
      expect(o.image!.sourceUrl).toMatch(/^https:/);
    }
  });
  it("stars binary matches its declared size", () => {
    const buf = readFileSync(join(root, "public", catalog.stars.file));
    expect(buf.byteLength).toBe(catalog.stars.count * catalog.stars.columns.length * 4);
    expect(catalog.stars.count).toBeGreaterThan(10_000);
  });
});

describe("routes on real data", () => {
  const ctx = () => ({ eph, jdTdb: JD });
  it("Earth → Polaris is ~433 light-years and ~433 years at light speed", () => {
    const r = computeRoute([get("earth"), get("polaris")], LIGHT_MODE, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.totalKm / LY_KM).toBeGreaterThan(425);
    expect(r.totalKm / LY_KM).toBeLessThan(440);
    expect(r.modeledSeconds / JULIAN_YEAR_S).toBeCloseTo(r.totalKm / LY_KM, 6);
    expect(r.kind).toBe("straight-line");
    expect(r.totalSigmaKm! / LY_KM).toBeGreaterThan(3); // parallax error propagates
  });
  it("is symmetric and switching modes changes time but not distance", () => {
    const a = computeRoute([get("earth"), get("polaris")], LIGHT_MODE, ctx());
    const b = computeRoute([get("polaris"), get("earth")], voyagerMode(catalog.speedReferences)!, ctx());
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.totalKm).toBeCloseTo(b.totalKm, 0);
      expect(b.modeledSeconds).toBeGreaterThan(a.modeledSeconds * 1e4);
    }
  });
  it("Earth → Mars defaults to a ~259-day Hohmann transfer with a separate benchmark", () => {
    const r = computeRoute([get("earth"), get("mars")], LIGHT_MODE, ctx());
    expect(r.ok && r.kind).toBe("orbital-transfer");
    if (!r.ok || !r.transfer) return;
    expect(r.modeledSeconds / 86400).toBeGreaterThan(250);
    expect(r.modeledSeconds / 86400).toBeLessThan(265);
    expect(r.transfer.inward).toBe(false);
    expect(r.transfer.departJd).toBeGreaterThanOrEqual(JD);
    expect(r.comparison.seconds).toBeCloseTo(r.totalKm / LIGHT_MODE.speedKmS, 3);
    const s = computeRoute([get("earth"), get("mars")], LIGHT_MODE, ctx(), "straight-line");
    expect(s.ok && s.kind).toBe("straight-line");
  });
  it("Earth → Mars uses ephemeris positions for the date", () => {
    const r = computeRoute([get("earth"), get("mars")], LIGHT_MODE, ctx());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.usesEphemeris).toBe(true);
      expect(r.totalKm / AU_KM).toBeGreaterThan(0.37);
      expect(r.totalKm / AU_KM).toBeLessThan(2.68);
    }
  });
  it("Proxima Centauri is ~4.24 light-years away", () => {
    const r = computeRoute([get("earth"), get("proxima-centauri")], LIGHT_MODE, ctx());
    expect(r.ok && r.totalKm / LY_KM).toBeCloseTo(4.246, 2);
  });
  it("multi-stop totals equal the sum of legs", () => {
    const r = computeRoute([get("earth"), get("sirius"), get("polaris"), get("vega")], LIGHT_MODE, ctx());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.legs.length).toBe(3);
      expect(r.totalKm).toBeCloseTo(r.legs.reduce((s, l) => s + l.distanceKm, 0), 0);
    }
  });
  it("refuses unsupported destinations with a reason", () => {
    const r = computeRoute([get("earth"), get("3c-273")], LIGHT_MODE, ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/redshift/);
    const alnilam = computeRoute([get("earth"), get("alnilam")], LIGHT_MODE, ctx());
    expect(alnilam.ok).toBe(false);
  });
  it("never implies an internal travel distance for features placed at their host's distance", () => {
    const sibling = computeRoute([get("ngc-206"), get("mayall-ii")], LIGHT_MODE, ctx());
    expect(sibling.ok).toBe(false);
    for (const pair of [["andromeda", "mayall-ii"], ["mayall-ii", "andromeda"]]) {
      const r = computeRoute(pair.map(get), LIGHT_MODE, ctx());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/depth inside Andromeda/);
    }
    expect(computeRoute([get("earth"), get("mayall-ii")], LIGHT_MODE, ctx()).ok).toBe(true);
    expect(computeRoute([get("andromeda"), get("m32")], LIGHT_MODE, ctx()).ok).toBe(true);
  });
  it("Andromeda is a Local Group distance (~2.5 million ly)", () => {
    const m31 = get("andromeda");
    expect(m31.distance!.valueKm / PC_KM).toBeCloseTo(761_000, -3);
  });
});

describe("search", () => {
  let idx: ReturnType<typeof buildSearchIndex>;
  beforeAll(() => { idx = buildSearchIndex(catalog.objects); });
  const top = (q: string) => search(idx, q, 3)[0]?.obj.id;
  it("finds names, aliases and catalog numbers", () => {
    expect(top("Polaris")).toBe("polaris");
    expect(top("north star")).toBe("polaris");
    expect(top("m31")).toBe("andromeda");
    expect(top("Messier 31")).toBe("andromeda");
    expect(top("mars")).toBe("mars");
    expect(top("alpha centauri")).toMatch(/alpha-centauri/);
    expect(top("sgr a*")).toBe("sagittarius-a-star");
  });
  it("tolerates small typos", () => {
    expect(top("betelguese")).toBe("betelgeuse");
    expect(top("andromedda")).toBe("andromeda");
  });
  it("resolves only reasonably unambiguous text", () => {
    expect(resolveOne(idx, "Earth")?.id).toBe("earth");
    expect(resolveOne(idx, "zzzzqqq")).toBeNull();
  });
  it("includes named HYG stars beyond the curated set", () => {
    const hits = search(idx, "Mintaka", 3);
    expect(hits[0]?.obj.name).toBe("Mintaka");
    expect((hits[0]?.obj as CatalogObject).featured).toBe(false);
  });
});
