import { describe, expect, it } from "vitest";
import { flightPath } from "./flight";
import { LY_KM } from "../lib/units";
import type { Vec3 } from "../lib/types";

describe("flightPath", () => {
  const cases: [string, Vec3, number, Vec3, number][] = [
    ["Earth view → Polaris route", [1.4e8, 3e7, 1e7], 1.3e6, [1.5e15, 1e15, 3.5e15], 600 * LY_KM],
    ["galaxy scale → Moon", [2e19, 1e19, 0], 2e21, [1.5e8, 0, 0], 1e6],
    ["pure zoom", [0, 0, 0], 1e6, [0, 0, 0], 1e12],
    ["pan only", [0, 0, 0], 1e9, [5e9, 0, 0], 1e9],
  ];
  for (const [name, c0, w0, c1, w1] of cases) {
    it(`stays finite and hits endpoints: ${name}`, () => {
      const p = flightPath(c0, w0, c1, w1);
      expect(Number.isFinite(p.S)).toBe(true);
      for (let i = 0; i <= 50; i++) {
        const s = p.at(i / 50);
        expect(Number.isFinite(s.widthKm) && s.widthKm > 0).toBe(true);
        expect(s.center.every(Number.isFinite)).toBe(true);
      }
      const start = p.at(0), end = p.at(1);
      expect(start.widthKm / w0).toBeCloseTo(1, 6);
      expect(end.widthKm / w1).toBeCloseTo(1, 6);
      for (let k = 0; k < 3; k++) expect(Math.abs(end.center[k] - c1[k])).toBeLessThanOrEqual(1e-6 * Math.max(w1, Math.abs(c1[k])));
    });
  }
});
