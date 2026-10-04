import { describe, expect, it } from "vitest";
import type { CatalogObject } from "../lib/types";
import { buildGalaxyParticles, galaxyParams, particleBlend, particleBudget } from "./galaxyModel";

const galaxy = (id: string, morphology: string, extra: Partial<CatalogObject["display"]> = {}) =>
  ({ id, type: "galaxy", category: "gx-spiral", display: { morphology, ...extra } }) as unknown as CatalogObject;

const extent = (a: Float32Array, axis: number) => {
  let lo = Infinity, hi = -Infinity;
  for (let i = axis; i < a.length; i += 3) { lo = Math.min(lo, a[i]); hi = Math.max(hi, a[i]); }
  return hi - lo;
};
const rms = (a: Float32Array, axis: number) => {
  let s = 0;
  for (let i = axis; i < a.length; i += 3) s += a[i] * a[i];
  return Math.sqrt(s / (a.length / 3));
};

describe("galaxy parameters from catalog morphology", () => {
  it("maps Hubble stage to bulge size, arm pitch and colour", () => {
    const sa = galaxyParams(galaxy("a", "SA(s)a"));
    const sc = galaxyParams(galaxy("c", "SA(s)c"));
    expect(sa.kind).toBe("spiral");
    expect(sa.bulge).toBeGreaterThan(sc.bulge);
    expect(sa.pitchDeg).toBeLessThan(sc.pitchDeg);
    expect(sa.warmth).toBeGreaterThan(sc.warmth);
  });

  it("gives barred spirals a bar, weaker for SAB", () => {
    const sb = galaxyParams(galaxy("b", "SB(rs)bc"));
    const sab = galaxyParams(galaxy("ab", "SAB(s)c"));
    expect(sb.kind).toBe("barred");
    expect(sb.bar).toBeGreaterThan(0);
    expect(sab.bar).toBeGreaterThan(0);
    expect(sab.bar).toBeLessThan(galaxyParams(galaxy("sb", "SB(s)c")).bar);
  });

  it("reads elliptical flattening from the En class", () => {
    const e5 = galaxyParams(galaxy("e", "E5pec"));
    expect(e5.kind).toBe("elliptical");
    expect(e5.axes[1]).toBeCloseTo(0.5);
    expect(galaxyParams(galaxy("e0", "E0")).axes[1]).toBeCloseTo(1);
  });

  it("classifies irregulars with clumps and no arms", () => {
    const irr = galaxyParams(galaxy("i", "IB(s)m"));
    expect(irr.kind).toBe("irregular");
    expect(irr.arms).toBe(0);
    expect(irr.clumps).toBeGreaterThanOrEqual(5);
  });
});

describe("galaxy particles", () => {
  it("spirals are thin discs with a bulge and dust", () => {
    const { light, dust } = buildGalaxyParticles(galaxyParams(galaxy("m81", "SA(s)ab")), 20_000);
    expect(light.count).toBe(20_000);
    expect(dust.count).toBeGreaterThan(0);
    expect(rms(light.positions, 2)).toBeLessThan(rms(light.positions, 0) * 0.35);
    expect(extent(light.positions, 0)).toBeLessThanOrEqual(1.0001);
  });

  it("ellipticals are smooth 3D ellipsoids with real depth", () => {
    const { light, dust } = buildGalaxyParticles(galaxyParams(galaxy("m87", "E3")), 20_000);
    expect(dust.count).toBe(0);
    const x = rms(light.positions, 0), y = rms(light.positions, 1), z = rms(light.positions, 2);
    expect(y / x).toBeGreaterThan(0.55);
    expect(y / x).toBeLessThan(0.85);
    expect(z).toBeGreaterThan(y * 0.9);
  });

  it("irregulars are asymmetric", () => {
    const { light } = buildGalaxyParticles(galaxyParams(galaxy("lmc", "SB(s)m")), 20_000);
    const irr = buildGalaxyParticles(galaxyParams(galaxy("ngc6822", "IB(s)m")), 20_000).light;
    let mean = 0;
    for (let i = 0; i < irr.count; i++) mean += irr.positions[i * 3];
    expect(Math.abs(mean / irr.count)).toBeGreaterThan(0.01);
    expect(light.count).toBe(20_000);
  });

  it("is deterministic per object so the shape does not change between visits", () => {
    const a = buildGalaxyParticles(galaxyParams(galaxy("m31", "SA(s)b")), 5_000).light.positions;
    const b = buildGalaxyParticles(galaxyParams(galaxy("m31", "SA(s)b")), 5_000).light.positions;
    const c = buildGalaxyParticles(galaxyParams(galaxy("m33", "SA(s)b")), 5_000).light.positions;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe("level of detail", () => {
  it("fades particles in only once the galaxy is large on screen", () => {
    expect(particleBlend(60)).toBe(0);
    expect(particleBlend(400)).toBe(1);
    expect(particleBudget(100, 60_000)).toBeLessThan(particleBudget(1200, 60_000));
    expect(particleBudget(5000, 60_000)).toBe(60_000);
  });
});
