import { describe, expect, it } from "vitest";
import { buildCloudParticles, cloudKind, type CloudKind } from "./cloudModel";
import type { CatalogObject } from "../lib/types";

const obj = (id: string, type: string, category: string) => ({ id, type, category, display: { color: "#fff", priority: 1, axisRatio: 0.6 } }) as unknown as CatalogObject;

describe("volumetric cloud models", () => {
  it("classifies nebulae, clusters and remnants", () => {
    expect(cloudKind(obj("m42", "nebula", "nb-emission"))).toBe("emission");
    expect(cloudKind(obj("m57", "nebula", "nb-planetary"))).toBe("planetary");
    expect(cloudKind(obj("b68", "nebula", "nb-dark"))).toBe("dark");
    expect(cloudKind(obj("m13", "star-cluster", "cl-globular"))).toBe("globular");
    expect(cloudKind(obj("m45", "star-cluster", "cl-open"))).toBe("open");
    expect(cloudKind(obj("m1", "supernova-remnant", "cr-snr"))).toBe("remnant");
    expect(cloudKind(obj("m31", "galaxy", "gx-spiral"))).toBeNull();
  });

  it("fills a 3D volume inside the unit frame, with real depth along the line of sight", () => {
    for (const kind of ["emission", "reflection", "planetary", "remnant", "globular", "open"] as CloudKind[]) {
      const { light } = buildCloudParticles(obj(`x-${kind}`, "nebula", ""), kind, 4000);
      expect(light.count).toBeGreaterThan(200);
      let maxR = 0, zSpread = 0;
      for (let i = 0; i < light.count; i++) {
        const [x, y, z] = [light.positions[i * 3], light.positions[i * 3 + 1], light.positions[i * 3 + 2]];
        maxR = Math.max(maxR, Math.hypot(x, y, z));
        zSpread = Math.max(zSpread, Math.abs(z));
      }
      expect(maxR).toBeLessThanOrEqual(0.5001);
      expect(zSpread).toBeGreaterThan(0.05);
    }
    const dark = buildCloudParticles(obj("b68", "nebula", "nb-dark"), "dark", 4000);
    expect(dark.light.count).toBe(0);
    expect(dark.dust.count).toBeGreaterThan(100);
  });

  it("is deterministic per object", () => {
    const a = buildCloudParticles(obj("m42", "nebula", "nb-emission"), "emission", 2000);
    const b = buildCloudParticles(obj("m42", "nebula", "nb-emission"), "emission", 2000);
    expect(Array.from(a.light.positions.slice(0, 30))).toEqual(Array.from(b.light.positions.slice(0, 30)));
  });
});
