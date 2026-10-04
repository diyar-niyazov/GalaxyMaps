import { describe, expect, it } from "vitest";
import { Dwell, FAR_M, FOCUS_M, GAZE_TOLERANCE, LINEAR_M, compressDistance, displayDistance, displayRadius, flightAt, fromXr, pickGaze, pinchFactor, planFlight, toXr, zoomVantage } from "./spaceView";
import type { Vec3 } from "../lib/types";

const n = (x: number, y: number, z: number): Vec3 => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };

describe("immersive scale model", () => {
  it("is linear nearby, then log-compresses depth so far objects still separate", () => {
    const m = 1e-5;
    expect(displayDistance(1e5, m)).toBeCloseTo(1);
    expect(displayDistance(2e5, m)).toBeCloseTo(2);
    expect(compressDistance(LINEAR_M)).toBe(LINEAR_M);
    expect(compressDistance(LINEAR_M * 10)).toBeGreaterThan(LINEAR_M);
    expect(compressDistance(LINEAR_M * 10)).toBeLessThan(compressDistance(LINEAR_M * 1e6));
    expect(compressDistance(LINEAR_M * 1e20)).toBeCloseTo(FAR_M, 0);
    // A 10× jump in true distance still opens a gap after compression (not one sky-sphere).
    const nearG = displayDistance(2.4e19, 1e-16), farG = displayDistance(2.4e21, 1e-16);
    expect(farG).toBeGreaterThan(nearG + 4);
    const rKm = 1e9, radius = 1e6;
    expect(displayRadius(radius, rKm, m) / displayDistance(rKm, m)).toBeCloseTo(radius / rKm);
    expect(displayRadius(radius, 1e5, m)).toBeCloseTo(radius * m);
  });

  it("round-trips the ICRF ↔ XR axis mapping", () => {
    expect(fromXr(toXr([1, 2, 3]))).toEqual([1, 2, 3]);
    expect(toXr([0, 0, 1])).toEqual([-0, 1, -0]);
  });

  it("zooms in by approaching the target, never past its standoff, then grows the world around it", () => {
    const far = { p: [0, 0, 0] as Vec3, mPerKm: 1e-3 }; // target 1000 m away
    const a = zoomVantage(far, [1e6, 0, 0], 1e4, 0.5);
    expect(a.p[0]).toBeCloseTo(5e5);
    expect((1e6 - a.p[0]) * a.mPerKm).toBeLessThan(1000 * 0.5); // rushes in faster than it approaches
    const at = { p: [0, 0, 0] as Vec3, mPerKm: FOCUS_M / 1e6 };
    const b = zoomVantage(at, [1e6, 0, 0], 1e4, 0.5);
    expect((1e6 - b.p[0]) * b.mPerKm).toBeCloseTo(FOCUS_M); // holds its display distance
    const stop = zoomVantage(at, [1e6, 0, 0], 9e5, 0.1);
    expect(stop.p[0]).toBeCloseTo(1e5);
    const out = zoomVantage(at, [1e6, 0, 0], 1e4, 2);
    expect(out.p[0]).toBeCloseTo(-1e6);
    expect(out.mPerKm).toBeCloseTo(at.mPerKm / 2);
  });

  it("flies geometrically to the standoff and ends with the target at the focus distance", () => {
    const f = planFlight({ p: [0, 0, 0], mPerKm: 1e-9 }, [1e15, 0, 0], 1e6);
    const start = flightAt(f, 0), mid = flightAt(f, 0.5), end = flightAt(f, 1);
    expect(start.p[0]).toBeCloseTo(0, -3);
    expect(1e15 - mid.p[0]).toBeCloseTo(Math.sqrt(1e15 * 1e6), -3);
    expect(1e15 - end.p[0]).toBeCloseTo(1e6, -1);
    expect((1e15 - end.p[0]) * end.mPerKm).toBeCloseTo(FOCUS_M);
    expect(f.ms).toBeGreaterThan(1200);
    expect(f.ms).toBeLessThanOrEqual(4200);
  });

  it("gives small objects a generous hitbox and prefers the most centred", () => {
    const cands = [
      { id: "mars", dir: n(0.02, 0, -1), angle: 0.001, dist: 5 },
      { id: "jupiter", dir: n(0.3, 0, -1), angle: 0.05, dist: 8 },
    ];
    expect(pickGaze(cands, [0, 0, -1])).toBe("mars");
    expect(pickGaze(cands, n(0.3, 0, -1))).toBe("jupiter");
    expect(pickGaze(cands, n(-1, 0, -1))).toBeNull();
    // A tiny object about 5–6° off-centre is still hit (Vision Pro head gaze is coarse).
    expect(pickGaze([{ id: "pluto", dir: n(Math.tan(GAZE_TOLERANCE * 0.9), 0, -1), angle: 0.0005, dist: 50 }], [0, 0, -1])).toBe("pluto");
  });

  it("keeps the current target under a wandering gaze, and nothing hidden behind a planet is picked", () => {
    const off = n(Math.tan(GAZE_TOLERANCE * 1.2), 0, -1);
    const cands = [{ id: "io", dir: [0, 0, -1] as Vec3, angle: 0.001, dist: 3 }];
    expect(pickGaze(cands, off)).toBeNull();
    expect(pickGaze(cands, off, "io")).toBe("io");
    const behind = [
      { id: "earth", dir: [0, 0, -1] as Vec3, angle: 0.3, dist: 2, solid: true },
      { id: "star", dir: n(0.01, 0, -1), angle: 0.001, dist: 300 },
    ];
    expect(pickGaze(behind, n(0.01, 0, -1))).toBe("earth");
  });

  it("fires details once per continuous stare", () => {
    const d = new Dwell(1000);
    expect(d.update("mars", 0).fire).toBeNull();
    expect(d.update("mars", 500).progress).toBeCloseTo(0.5);
    expect(d.update("mars", 1000).fire).toBe("mars");
    expect(d.update("mars", 2000).fire).toBeNull();
    d.update(null, 2100);
    d.update("mars", 2200);
    expect(d.update("mars", 3200).fire).toBe("mars");
  });

  it("maps finger gestures to zoom: spread or push in, close or pull out", () => {
    expect(pinchFactor(0.2, 0.3, 0)).toBeLessThan(1);
    expect(pinchFactor(0.3, 0.2, 0)).toBeGreaterThan(1);
    expect(pinchFactor(null, null, 0.05)).toBeLessThan(1);
    expect(pinchFactor(null, null, -0.05)).toBeGreaterThan(1);
    expect(pinchFactor(null, null, 0)).toBe(1);
  });
});
