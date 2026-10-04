import { describe, it, expect } from "vitest";
import type { CatalogObject } from "./types";
import type { DataBundle } from "../data/bundle";
import { lightDelay, physicalNeighborDistance } from "./learning";
import { C_KM_S } from "./units";
const body = (id: string, xyz: [number, number, number]) => ({ id, name: id, position: { kind: "static", frame: "ICRF", origin: "Sun", unit: "km", epoch: "J2000", xyz } }) as CatalogObject;
const earth = body("earth", [0, 0, 0]), target = body("target", [3, 4, 12]);
const data = { byId: new Map([["earth", earth]]), eph: {} } as DataBundle;
describe("grounded contextual learning", () => {
  it("uses full separation rather than radial-distance subtraction", () => { expect(physicalNeighborDistance(earth, target, data, 2451545)).toBe(13); expect(lightDelay(target, data, 2451545)?.seconds).toBe(13 / C_KM_S); });
  it("withholds unmeasured host depth and zero-distance claims", () => { expect(physicalNeighborDistance(earth, { ...target, position: { ...target.position!, kind: "static", depth: "host" } } as CatalogObject, data, 2451545)).toBeNull(); expect(lightDelay(earth, data, 2451545)).toBeNull(); });
  it("cosmological lookback uses the model value instead of comoving distance/c", () => { const o = { ...target, cosmo: { lightTravelYears: 1e9, comovingLy: 3e9, model: "Planck" } } as CatalogObject; expect(lightDelay(o, data, 2451545)?.seconds).toBeCloseTo(1e9 * 365.25 * 86400); expect(lightDelay(o, data, 2451545)?.model).toContain("lookback"); });
});
