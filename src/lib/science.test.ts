import { describe, it, expect } from "vitest";
import { C_KM_S, LY_KM, PC_KM, AU_KM, JULIAN_YEAR_S, DAY_S, jdTdb, dateFromJdTdb } from "./units";
import { cruise, properTime, separationKm } from "./physics";
import {
  galacticFromIcrf, unitFromRaDec, cartesianFromRaDecDistance, raDecFromVector, assessParallax,
  isValidHygDistance, ICRF_TO_ECLIPTIC, ICRF_TO_GALACTIC, GALACTIC_TO_ICRF,
} from "./coords";
import { mulMatVec, mulMat, IDENTITY } from "./vec";
import { hohmann } from "./transfer";
import { computeItinerary, evaluateDetour, isOnTheWay } from "./itinerary";
import { formatDuration, formatDistance, durationContext } from "./format";
import { LIGHT_MODE, travelModes } from "./transport";
import { solveKepler, keplerPosition } from "./kepler";
import type { SpeedReference, Vec3 } from "./types";

describe("units", () => {
  it("one light-year at light speed takes one Julian year", () => {
    const r = cruise(LY_KM, C_KM_S);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.seconds / JULIAN_YEAR_S).toBeCloseTo(1, 12);
  });
  it("parsec and light-year conversions are consistent", () => {
    expect(PC_KM / LY_KM).toBeCloseTo(3.26156, 5);
    expect(PC_KM / AU_KM).toBeCloseTo(206264.806, 3);
    expect(AU_KM / C_KM_S).toBeCloseTo(499.004784, 5); // light-time for 1 au (s)
  });
  it("TDB date conversion round-trips", () => {
    const d = new Date("2026-10-04T12:00:00Z");
    expect(dateFromJdTdb(jdTdb(d)).getTime()).toBeCloseTo(d.getTime(), -1);
    expect(jdTdb(new Date("2026-10-04T00:00:00Z")) - 2461317.5).toBeCloseTo(69.184 / DAY_S, 9);
  });
});

describe("cruise physics", () => {
  it("zero distance gives zero time", () => {
    const r = cruise(0, 10);
    expect(r.ok && r.seconds).toBe(0);
  });
  it("rejects invalid speeds and distances", () => {
    expect(cruise(100, 0)).toEqual({ ok: false, error: "invalid-speed" });
    expect(cruise(100, -5)).toEqual({ ok: false, error: "invalid-speed" });
    expect(cruise(100, NaN)).toEqual({ ok: false, error: "invalid-speed" });
    expect(cruise(-1, 5)).toEqual({ ok: false, error: "invalid-distance" });
  });
  it("uses full 3D separation, symmetric, not a difference of distances", () => {
    const a: Vec3 = [10, 0, 0], b: Vec3 = [-10, 0, 0];
    expect(separationKm(a, b)).toBe(20); // both 10 from origin; difference of distances would be 0
    const c: Vec3 = [1, 2, 3], d: Vec3 = [4, 6, 15];
    expect(separationKm(c, d)).toBeCloseTo(13, 12);
    expect(separationKm(d, c)).toBe(separationKm(c, d));
  });
  it("proper time only for 0 < v < c", () => {
    const half = properTime(100, 0.5 * C_KM_S);
    expect(half.ok && half.properSeconds).toBeCloseTo(100 * Math.sqrt(0.75), 10);
    expect(properTime(100, C_KM_S)).toEqual({ ok: false, reason: "at-or-above-light-speed" });
    expect(properTime(100, 2 * C_KM_S)).toEqual({ ok: false, reason: "at-or-above-light-speed" });
    expect(properTime(100, 0).ok).toBe(false);
    const near = properTime(1, 0.999999 * C_KM_S);
    expect(near.ok && near.gamma).toBeCloseTo(707.1, 0);
  });
});

describe("transport", () => {
  const refs: SpeedReference[] = [{ id: "voyager-1-speed", label: "Voyager 1", speedKmS: 16.9995, frame: "heliocentric", epoch: "2026", description: "measured", sourceId: "nasa" }];
  it("offers exactly light speed and Voyager 1", () => {
    const modes = travelModes(refs);
    expect(modes.map((m) => m.label)).toEqual(["Light speed", "Voyager 1"]);
    expect(LIGHT_MODE.speedKmS).toBe(C_KM_S);
    expect(modes[1].speedKmS).toBeLessThan(20);
  });
  it("falls back to light speed alone without a Voyager reference", () => {
    expect(travelModes([]).map((m) => m.id)).toEqual(["light"]);
  });
});

describe("coordinate frames", () => {
  it("Sgr A* lies at the Galactic Center direction", () => {
    const g = galacticFromIcrf(unitFromRaDec(266.41681662, -29.00782497));
    expect(Math.min(g.lDeg, 360 - g.lDeg)).toBeLessThan(0.1);
    expect(Math.abs(g.bDeg)).toBeLessThan(0.1);
  });
  it("North Galactic Pole is at RA 192.86°, Dec +27.13°", () => {
    const g = galacticFromIcrf(unitFromRaDec(192.85948, 27.12825));
    expect(g.bDeg).toBeCloseTo(90, 3);
  });
  it("frame matrices are orthonormal rotations", () => {
    for (const m of [ICRF_TO_ECLIPTIC, ICRF_TO_GALACTIC]) {
      const mt = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]] as typeof m;
      mulMat(m, mt).forEach((v, i) => expect(v).toBeCloseTo(IDENTITY[i], 9));
    }
    mulMat(ICRF_TO_GALACTIC, GALACTIC_TO_ICRF).forEach((v, i) => expect(v).toBeCloseTo(IDENTITY[i], 9));
  });
  it("the celestial pole sits 23.44° from the ecliptic pole", () => {
    const z = mulMatVec(ICRF_TO_ECLIPTIC, [0, 0, 1]);
    expect((Math.acos(z[2]) * 180) / Math.PI).toBeCloseTo(23.4393, 3);
  });
  it("RA/Dec + distance round-trips and requires a distance", () => {
    const v = cartesianFromRaDecDistance(37.95, 89.26, 132.6);
    const back = raDecFromVector(v);
    expect(back.raDeg).toBeCloseTo(37.95, 9);
    expect(back.decDeg).toBeCloseTo(89.26, 9);
    expect(Math.hypot(...v)).toBeCloseTo(132.6, 9);
    expect(() => cartesianFromRaDecDistance(10, 10, NaN)).toThrow();
    expect(() => cartesianFromRaDecDistance(10, 10, 0)).toThrow();
  });
});

describe("catalog value hygiene", () => {
  it("only inverts parallaxes with ≤20% error", () => {
    expect(assessParallax(7.54, 0.11)).toMatchObject({ usable: true, quality: "good" });
    expect(assessParallax(768.067, 0.05)).toMatchObject({ usable: true, quality: "precise" });
    expect(assessParallax(1.65, 0.45).usable).toBe(false); // Alnilam
    expect(assessParallax(-0.5, 0.2).usable).toBe(false);
    expect(assessParallax(5, null).usable).toBe(false);
    expect(assessParallax(null, null).usable).toBe(false);
  });
  it("treats the HYG 100000 pc sentinel as missing", () => {
    expect(isValidHygDistance(100000)).toBe(false);
    expect(isValidHygDistance(132.6)).toBe(true);
    expect(isValidHygDistance(0)).toBe(false);
    expect(isValidHygDistance(NaN)).toBe(false);
  });
});

describe("idealized Hohmann transfer", () => {
  it("Earth → Mars takes about 259 days", () => {
    const h = hohmann(1.0 * AU_KM, 1.523679 * AU_KM);
    expect(h.transferDays).toBeGreaterThan(257);
    expect(h.transferDays).toBeLessThan(261);
    expect((h.phaseAngleRad * 180) / Math.PI).toBeCloseTo(44.3, 0);
    expect(h.synodicDays).toBeCloseTo(780, -1);
  });
  it("rejects degenerate orbits", () => {
    expect(() => hohmann(AU_KM, AU_KM)).toThrow();
    expect(() => hohmann(-1, AU_KM)).toThrow();
  });
});

describe("itinerary", () => {
  const pts: Vec3[] = [[0, 0, 0], [3, 4, 0], [3, 4, 12]];
  it("sums legs", () => {
    const r = computeItinerary(pts, 1);
    expect(r.legs.map((l) => l.distanceKm)).toEqual([5, 12]);
    expect(r.totalKm).toBe(17);
    expect(r.totalSeconds).toBe(17);
  });
  it("evaluates detours instead of assuming a stop is on the way", () => {
    const line: Vec3[] = [[0, 0, 0], [100, 0, 0]];
    const onLine = evaluateDetour(line, [50, 0, 0])!;
    expect(onLine.addedKm).toBeCloseTo(0, 9);
    expect(isOnTheWay(onLine)).toBe(true);
    const off = evaluateDetour(line, [50, 50, 0])!;
    expect(off.addedKm).toBeCloseTo(2 * Math.hypot(50, 50) - 100, 9);
    expect(isOnTheWay(off)).toBe(false);
  });
});

describe("formatting", () => {
  it("formats durations with limited precision", () => {
    expect(formatDuration(0)).toBe("0 seconds");
    expect(formatDuration(1.28)).toBe("1.3 seconds");
    expect(formatDuration(499)).toBe("8.3 minutes");
    expect(formatDuration(432.6 * JULIAN_YEAR_S)).toBe("433 years");
    expect(formatDuration(2.5e6 * JULIAN_YEAR_S)).toBe("2.5 million years");
    expect(formatDuration(NaN)).toBe("—");
    expect(durationContext(3e10 * JULIAN_YEAR_S)).toMatch(/age of the Universe/);
  });
  it("chooses sensible distance units", () => {
    expect(formatDistance(384_400)).toBe("384,000 km");
    expect(formatDistance(AU_KM)).toBe("1 AU");
    expect(formatDistance(432.6 * LY_KM)).toBe("433 light-years");
  });
});

describe("Kepler propagation", () => {
  it("solves Kepler's equation", () => {
    for (const e of [0, 0.1, 0.5, 0.9, 0.97]) {
      const M = 1.234;
      const E = solveKepler(M, e);
      expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
    }
  });
  it("a circular orbit keeps constant radius", () => {
    const el = { aKm: 1000, e: 0, iDeg: 30, omDeg: 40, wDeg: 50, maDeg: 0, nDegS: 0.01, epochJdTdb: 0 };
    for (const t of [0, 0.1, 0.37]) expect(Math.hypot(...keplerPosition(el, t))).toBeCloseTo(1000, 6);
  });
});
