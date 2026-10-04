import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { Catalog, CatalogObject, Ephemeris } from "./types";
import type { DataBundle } from "../data/bundle";
import { positionAt } from "../data/bundle";
import { describeView, nearbyObjects } from "./viewDescription";
import { AU_KM } from "./units";

const catalog = JSON.parse(readFileSync("public/data/catalog.json", "utf8")) as Catalog;
const eph = JSON.parse(readFileSync("public/data/ephemeris.json", "utf8")) as Ephemeris;
const data = { catalog, eph, byId: new Map(catalog.objects.map((o) => [o.id, o])) } as DataBundle;
const jd = eph.startJdTdb + 30;
const pos = (o: CatalogObject) => positionAt(data, o, jd);

describe("nearby objects", () => {
  it("are ordered by physical 3D distance from the anchor and exclude it", () => {
    const earth = data.byId.get("earth")!;
    const list = nearbyObjects(catalog.objects, pos, pos(earth)!, { exclude: "earth", radiusKm: 3 * AU_KM });
    expect(list.length).toBeGreaterThan(2);
    expect(list.some((n) => n.obj.id === "earth")).toBe(false);
    expect(list[0].obj.id).toBe("moon");
    for (let i = 1; i < list.length; i++) expect(list[i].km).toBeGreaterThanOrEqual(list[i - 1].km);
  });

  it("fall back to the nearest objects when the radius holds too few", () => {
    const sun = data.byId.get("sun")!;
    const list = nearbyObjects(catalog.objects, pos, pos(sun)!, { exclude: "sun", radiusKm: 1, min: 3, limit: 5 });
    expect(list).toHaveLength(5);
  });
});

describe("view descriptions", () => {
  const nearby = [{ obj: data.byId.get("moon")!, km: 384_400 }];
  it("name the locked object and its type", () => {
    const t = describeView({ mode: "locked", widthKm: 40_000, plane: "Ecliptic", universe: 0, selected: data.byId.get("earth")!, nearby });
    expect(t).toMatch(/^Locked on Earth, a planet\./);
    expect(t).toContain("Moon");
  });
  it("explain the logarithmic universe overview", () => {
    const t = describeView({ mode: "explore", widthKm: 1e22, plane: "Galactic", universe: 1, selected: null, nearby: [] });
    expect(t).toMatch(/compressed logarithmically/);
  });
  it("summarize routes", () => {
    const t = describeView({ mode: "route", widthKm: 4e8, plane: "Ecliptic", universe: 0, selected: null, routeNames: ["Earth", "Mars"], nearby: [] });
    expect(t).toMatch(/route from Earth to Mars/);
  });
});
