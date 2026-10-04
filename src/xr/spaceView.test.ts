import { describe, expect, it } from "vitest";
import { Dwell, FAR_M, NEAR_M, angularRadius, displayDistance, displayRadius, fromXr, pickGaze, pinchFactor, toXr, zoomToward, MIN_ANGLE } from "./spaceView";

describe("immersive look-around geometry", () => {
  it("compresses distance monotonically into a reachable range", () => {
    const d = [0, 1e3, 1e6, 1e9, 1e15, 1e23].map((r) => displayDistance(r, 1e5));
    expect(d[0]).toBe(NEAR_M);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]);
    expect(d.at(-1)).toBeLessThanOrEqual(FAR_M);
  });

  it("keeps true angular size when visible and a minimum otherwise", () => {
    const moonFromEarth = angularRadius(1737, 384_400);
    expect(moonFromEarth).toBeCloseTo(0.00452, 4);
    expect(displayRadius(moonFromEarth, 2)).toBeCloseTo(2 * Math.tan(MIN_ANGLE));
    const close = angularRadius(6371, 20_000);
    expect(displayRadius(close, 2) / 2).toBeCloseTo(Math.tan(close));
    expect(angularRadius(6371, 1)).toBeLessThan(0.61);
  });

  it("round-trips the ICRF ↔ XR axis mapping", () => {
    expect(fromXr(toXr([1, 2, 3]))).toEqual([1, 2, 3]);
    expect(toXr([0, 0, 1])).toEqual([-0, 1, -0]);
  });

  it("zooms toward the gazed target without passing its standoff", () => {
    const v = { p: [0, 0, 0] as [number, number, number], scaleKm: 1e6 };
    const inward = zoomToward(v, [1, 0, 0], 1e6, 1e4, 0.5);
    expect(inward.p[0]).toBeCloseTo(5e5);
    expect(inward.scaleKm).toBeCloseTo(5e5);
    const stop = zoomToward(v, [1, 0, 0], 1e6, 9e5, 0.1);
    expect(stop.p[0]).toBeCloseTo(1e5);
    const out = zoomToward(v, [1, 0, 0], 1e6, 1e4, 2);
    expect(out.p[0]).toBeCloseTo(-1e6);
  });

  it("picks the object under the gaze, preferring the one most centred", () => {
    const n = (x: number, y: number, z: number): [number, number, number] => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
    const cands = [
      { id: "mars", dir: n(0.02, 0, -1), angle: 0.01 },
      { id: "jupiter", dir: n(0.3, 0, -1), angle: 0.05 },
    ];
    expect(pickGaze(cands, [0, 0, -1])).toBe("mars");
    expect(pickGaze(cands, n(0.3, 0, -1))).toBe("jupiter");
    expect(pickGaze(cands, n(-1, 0, -1))).toBeNull();
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
