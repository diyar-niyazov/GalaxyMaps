import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { DataBundle } from "../data/bundle";
import type { Catalog, Ephemeris, Vec3 } from "./types";
import { positionOf } from "./route";
import { raDecFromVector, unitFromRaDec } from "./coords";
import { normalize, sub } from "./vec";
import { buildEarthSkyStars, earthSkyDirection, eligibleEarthSky, formatSkyDec, formatSkyRa, projectEarthSky, skyAngularSeparation, skyNeighbors } from "./earthSky";

const catalog = JSON.parse(readFileSync("public/data/catalog.json", "utf8")) as Catalog;
const eph = JSON.parse(readFileSync("public/data/ephemeris.json", "utf8")) as Ephemeris;
const bytes = readFileSync("public/data/stars.bin");
const stars = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const starNames = JSON.parse(readFileSync("public/data/star-names.json", "utf8"));
const data = { catalog, eph, stars, starNames, starStride: catalog.stars.columns.length, byId: new Map(catalog.objects.map((object) => [object.id, object])) } as DataBundle;
const jd = eph.startJdTdb + 30;

describe("geometric Earth-centered directions", () => {
  it("evaluates the planet minus Earth's position at the chosen date, not a heliocentric sky angle", () => {
    const mars = data.byId.get("mars")!, earth = data.byId.get("earth")!;
    const direction = earthSkyDirection(mars, data, jd)!;
    const ctx = { eph, jdTdb: jd };
    const expected = normalize(sub(positionOf(mars, ctx)!, positionOf(earth, ctx)!));
    expect(direction.direction).toEqual(expected);
    expect(direction.raDeg).toBeCloseTo(raDecFromVector(expected).raDeg, 10);
    expect(direction.kind).toBe("solar-system");
    expect(direction.epoch).toContain("JPL Horizons");
    expect(skyAngularSeparation(direction.direction, normalize(positionOf(mars, ctx)!))).toBeGreaterThan(0.1);
  });

  it("moves the planetary sky direction when the snapshot date changes", () => {
    const mars = data.byId.get("mars")!;
    const a = earthSkyDirection(mars, data, jd)!;
    const b = earthSkyDirection(mars, data, jd + 20)!;
    expect(skyAngularSeparation(a.direction, b.direction)).toBeGreaterThan(1);
  });

  it("labels moon orbital propagation and out-of-table planetary positions as approximations", () => {
    const moon = earthSkyDirection(data.byId.get("moon")!, data, jd)!;
    expect(moon.epoch).toContain("satellite orbital approximation");
    expect(moon.note).toContain("two-body");
    const oldMars = earthSkyDirection(data.byId.get("mars")!, data, eph.startJdTdb - 500)!;
    expect(oldMars.epoch).toContain("approximate orbital model");
  });

  it("retains static catalog epochs and does not claim apparent-position corrections", () => {
    const sirius = earthSkyDirection(data.byId.get("sirius")!, data, jd)!;
    expect(sirius.kind).toBe("catalog");
    expect(sirius.epoch).toContain("J2000.0");
    expect(sirius.note).toContain("proper motion");
    expect(sirius.note).toContain("not propagated");
    expect(sirius.raDeg).toBeCloseTo(101.287, 2);
    expect(sirius.decDeg).toBeCloseTo(-16.716, 2);
  });

  it("accepts sourced direction-only cosmological records without inventing spatial coordinates", () => {
    const quasar = earthSkyDirection(data.byId.get("3c-273")!, data, jd)!;
    expect(quasar.kind).toBe("cosmological");
    expect(quasar.direction).toEqual(normalize(data.byId.get("3c-273")!.cosmo!.dir));
    expect(quasar.note).toContain("catalog sky direction");
  });

  it("withholds self-directions, unsupported mission locations, missing positions and invalid vectors", () => {
    for (const id of ["earth", "demo-2", "falcon-9", "horsehead-nebula"]) expect(eligibleEarthSky(data.byId.get(id)!, data, jd)).toBe(false);
    const mars = data.byId.get("mars")!;
    expect(eligibleEarthSky(mars, data, NaN)).toBe(false);
    const sirius = data.byId.get("sirius")!;
    if (sirius.position?.kind !== "static") throw new Error("test requires static Sirius");
    expect(eligibleEarthSky({ ...sirius, position: { ...sirius.position, xyz: [NaN, 2, 3] } }, data, jd)).toBe(false);
  });
});

describe("sky chart projection and coordinates", () => {
  it("centers the selected direction and places increasing RA left and north above", () => {
    const center = { raDeg: 0, decDeg: 0 };
    expect(projectEarthSky([1, 0, 0], center, 90)).toEqual({ x: -0, y: -0, visible: true, angleDeg: 0 });
    expect(projectEarthSky(unitFromRaDec(45, 0), center, 90).x).toBeCloseTo(-1, 10);
    expect(projectEarthSky(unitFromRaDec(315, 0), center, 90).x).toBeCloseTo(1, 10);
    expect(projectEarthSky(unitFromRaDec(0, 45), center, 90).y).toBeCloseTo(-1, 10);
    expect(projectEarthSky(unitFromRaDec(0, -45), center, 90).y).toBeCloseTo(1, 10);
  });

  it("marks the opposite direction outside the window without dividing by zero", () => {
    const projected = projectEarthSky([-1, 0, 0], { raDeg: 0, decDeg: 0 }, 120);
    expect(projected.visible).toBe(false);
    expect(projected.angleDeg).toBe(180);
    expect(Number.isFinite(projected.x) && Number.isFinite(projected.y)).toBe(true);
  });

  it("formats hours and signed angles without a 24h or 60-minute rollover", () => {
    expect(formatSkyRa(359.999)).toBe("0h 00m");
    expect(formatSkyRa(-15)).toBe("23h 00m");
    expect(formatSkyDec(-16.716)).toBe("−16° 43′");
    expect(formatSkyDec(12.9999)).toBe("+13° 00′");
  });
});

describe("sourced neighboring star field", () => {
  it("loads bounded actual HYG stars with finite unit directions and visible-magnitude data", () => {
    const plotted = buildEarthSkyStars(data, jd, 6, 1500);
    expect(plotted.length).toBe(1500);
    for (const star of plotted) {
      expect(star.magnitude).toBeLessThanOrEqual(6);
      expect(Math.hypot(...star.direction)).toBeCloseTo(1, 10);
      expect(star.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(data.stars[star.index * data.starStride + 6]).toBe(star.hygId);
    }
    expect(plotted.some((star) => star.name === "Sirius")).toBe(true);
  });

  it("describes neighbors by angular separation and excludes the selected star", () => {
    const plotted = buildEarthSkyStars(data, jd);
    const sirius = plotted.find((star) => star.name === "Sirius")!;
    const neighbors = skyNeighbors(sirius.direction, plotted, sirius.hygId, 30);
    expect(neighbors.length).toBeGreaterThan(0);
    for (const neighbor of neighbors) {
      expect(neighbor.hygId).not.toBe(sirius.hygId);
      expect(neighbor.angleDeg).toBeLessThanOrEqual(30);
      expect(neighbor.angleDeg).toBeCloseTo(skyAngularSeparation(sirius.direction, neighbor.direction), 10);
    }
    expect(skyAngularSeparation([1, 0, 0], [0, 1, 0])).toBe(90);
  });

  it("keeps target coordinates useful when the optional star field is unavailable", () => {
    expect(buildEarthSkyStars({ ...data, stars: new Float32Array() }, jd)).toEqual([]);
    expect(earthSkyDirection(data.byId.get("mars")!, { ...data, stars: new Float32Array() }, jd)).not.toBeNull();
    expect(Number.isNaN(skyAngularSeparation([0, 0, 0] as Vec3, [1, 0, 0]))).toBe(true);
  });
});
