import { describe, it, expect } from "vitest";
import { logRadius, universeBlend, OBSERVABLE_RADIUS_LY, UNIVERSE_FADE_START_KM, UNIVERSE_FADE_END_KM, DISTANCE_BANDS_LY } from "./universe";
import { declutter, type LabelCandidate } from "./labels";
import { makeProjector, unproject, fitView, centerOf, type View, type Viewport } from "./projection";
import { LY_KM } from "../lib/units";
import type { Vec3 } from "../lib/types";

describe("observable-universe schematic", () => {
  it("uses the Planck 2018 comoving radius (~46 billion ly)", () => {
    expect(OBSERVABLE_RADIUS_LY / 1e9).toBeGreaterThan(45);
    expect(OBSERVABLE_RADIUS_LY / 1e9).toBeLessThan(47.5);
  });
  it("logRadius is monotonic, 0 at the centre and 1 at the edge", () => {
    expect(logRadius(0)).toBe(0);
    expect(logRadius(OBSERVABLE_RADIUS_LY)).toBeCloseTo(1, 12);
    expect(logRadius(10 * OBSERVABLE_RADIUS_LY)).toBe(1);
    let prev = -1;
    for (const ly of [1e3, 2.5e6, ...DISTANCE_BANDS_LY].sort((a, b) => a - b)) {
      const r = logRadius(ly);
      expect(r).toBeGreaterThan(prev);
      prev = r;
    }
  });
  it("keeps Andromeda well inside and 10 billion ly near the edge", () => {
    expect(logRadius(2.5e6)).toBeLessThan(0.3);
    expect(logRadius(1e10)).toBeGreaterThan(0.8);
  });
  it("cross-fades smoothly between the linear map and the overview", () => {
    expect(universeBlend(UNIVERSE_FADE_START_KM / 2)).toBe(0);
    expect(universeBlend(UNIVERSE_FADE_END_KM * 2)).toBe(1);
    const mid = universeBlend(Math.sqrt(UNIVERSE_FADE_START_KM * UNIVERSE_FADE_END_KM));
    expect(mid).toBeCloseTo(0.5, 6);
    expect(universeBlend(2.5e6 * LY_KM)).toBe(0);
  });
});

describe("label decluttering", () => {
  const c = (id: string, x: number, y: number, priority: number, extra: Partial<LabelCandidate> = {}): LabelCandidate => ({ id, x, y, width: 60, height: 16, priority, offset: 6, ...extra });
  it("never overlaps two placed labels", () => {
    const placed = declutter([c("a", 100, 100, 5), c("b", 104, 102, 4), c("c", 108, 98, 3), c("d", 300, 300, 1)], 800, 600);
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        const overlap = a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    expect(placed.map((p) => p.id)).toContain("d");
  });
  it("places higher priority first and always keeps forced labels", () => {
    const placed = declutter([c("low", 100, 100, 1), c("high", 100, 100, 9), c("sel", 100, 100, 0, { force: true })], 800, 600);
    expect(placed[0].id).toBe("sel");
    expect(placed.map((p) => p.id)).toContain("high");
  });
  it("respects blocked areas (e.g. the universe 'you are here' caption)", () => {
    const placed = declutter([c("x", 100, 100, 5, { fixed: true })], 800, 600, 60, [[90, 80, 200, 120]]);
    expect(placed).toHaveLength(0);
  });
});

describe("projection with an off-centre usable area", () => {
  const vp: Viewport = { width: 1000, height: 800, cx: 620, cy: 380 };
  const view: View = { center: [1e6, -2e6, 3e5], widthKm: 5e5, heading: 0.7, tilt: 0.9 };
  it("projects the view centre onto the pivot", () => {
    const s = makeProjector(view, vp).project(view.center);
    expect(s[0]).toBeCloseTo(620, 6);
    expect(s[1]).toBeCloseTo(380, 6);
    expect(centerOf({ width: 10, height: 20 })).toEqual([5, 10]);
  });
  it("unproject inverts project on the view plane", () => {
    const p = unproject(view, vp, 700, 300);
    const s = makeProjector(view, vp).project(p);
    expect(s[0]).toBeCloseTo(700, 4);
    expect(s[1]).toBeCloseTo(300, 4);
  });
  it("fitView keeps every point inside the padded area", () => {
    const pts: Vec3[] = [[0, 0, 0], [4e8, 1e8, 0], [-2e8, 3e8, 1e7]];
    const pad = { left: 420, right: 80, top: 120, bottom: 140 };
    const v = fitView(pts, vp, { ...view, tilt: 0, heading: 0 }, pad);
    const pr = makeProjector(v, vp);
    for (const p of pts) {
      const [x, y] = pr.project(p);
      expect(x).toBeGreaterThanOrEqual(pad.left - 1);
      expect(x).toBeLessThanOrEqual(vp.width - pad.right + 1);
      expect(y).toBeGreaterThanOrEqual(pad.top - 1);
      expect(y).toBeLessThanOrEqual(vp.height - pad.bottom + 1);
    }
  });
});
