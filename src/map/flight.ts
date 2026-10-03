/**
 * Smooth zoom-and-pan camera paths (van Wijk & Nuij 2003, "Smooth and efficient zooming
 * and panning"), extended to a 3D center. Width is interpolated in log space along the
 * optimal path, so flights across 15 orders of magnitude still feel natural.
 */
import type { Vec3 } from "../lib/types";
import { distance } from "../lib/vec";

const RHO = Math.SQRT2;

export interface FlightPath {
  /** Path length in van Wijk units; proportional to perceived travel. */
  S: number;
  at(t: number): { center: Vec3; widthKm: number };
}

export function flightPath(c0: Vec3, w0: number, c1: Vec3, w1: number): FlightPath {
  const d1 = distance(c0, c1);
  const lerpC = (u: number): Vec3 => [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u];
  if (d1 < 1e-9 * Math.max(w0, w1)) {
    const S = Math.log(w1 / w0) / RHO;
    return { S: Math.abs(S), at: (t) => ({ center: lerpC(t), widthKm: w0 * Math.exp(RHO * t * S) }) };
  }
  const rho2 = RHO * RHO, rho4 = rho2 * rho2;
  const b0 = (w1 * w1 - w0 * w0 + rho4 * d1 * d1) / (2 * w0 * rho2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d1 * d1) / (2 * w1 * rho2 * d1);
  // log(sqrt(b² + 1) − b) == −asinh(b); the asinh form avoids cancellation for huge zoom ranges.
  const r0 = -Math.asinh(b0);
  const r1 = -Math.asinh(b1);
  const S = (r1 - r0) / RHO;
  const coshr0 = Math.cosh(r0), sinhr0 = Math.sinh(r0);
  if (!Number.isFinite(S) || !Number.isFinite(coshr0)) {
    const L = Math.log(w1 / w0);
    return { S: Math.abs(L), at: (t) => ({ center: lerpC(t), widthKm: w0 * Math.exp(L * t) }) };
  }
  return {
    S,
    at(t) {
      if (t >= 1) return { center: c1, widthKm: w1 };
      const s = t * S;
      const u = (w0 / (rho2 * d1)) * (coshr0 * Math.tanh(RHO * s + r0) - sinhr0);
      return { center: lerpC(u), widthKm: (w0 * coshr0) / Math.cosh(RHO * s + r0) };
    },
  };
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Flight duration in ms, bounded so long zooms stay watchable. */
export function flightDuration(S: number, min = 700, max = 4200) {
  return Math.min(max, Math.max(min, Math.abs(S) * 260));
}
