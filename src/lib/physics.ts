import type { Vec3 } from "./types";
import { C_KM_S } from "./units";
import { distance } from "./vec";

export type CruiseResult =
  | { ok: true; distanceKm: number; speedKmS: number; seconds: number }
  | { ok: false; error: "invalid-speed" | "invalid-distance" };

/**
 * Hypothetical constant-speed cruise: duration = distance / speed.
 * Excludes acceleration, braking, gravity and target motion.
 */
export function cruise(distanceKm: number, speedKmS: number): CruiseResult {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return { ok: false, error: "invalid-distance" };
  if (!Number.isFinite(speedKmS) || speedKmS <= 0) return { ok: false, error: "invalid-speed" };
  return { ok: true, distanceKm, speedKmS, seconds: distanceKm / speedKmS };
}

/** Full 3D separation between two positions in the same frame (never a difference of distances from Earth). */
export function separationKm(a: Vec3, b: Vec3): number {
  return distance(a, b);
}

export type ProperTimeResult =
  | { ok: true; properSeconds: number; gamma: number; beta: number }
  | { ok: false; reason: "at-or-above-light-speed" | "invalid-speed" };

/**
 * Traveler proper time for constant speed 0 < v < c (special relativity, no acceleration):
 * τ = t·sqrt(1 − v²/c²). Undefined at or above light speed.
 */
export function properTime(coordinateSeconds: number, speedKmS: number): ProperTimeResult {
  if (!Number.isFinite(speedKmS) || speedKmS <= 0) return { ok: false, reason: "invalid-speed" };
  if (speedKmS >= C_KM_S) return { ok: false, reason: "at-or-above-light-speed" };
  const beta = speedKmS / C_KM_S;
  // 1 − β² computed as (1−β)(1+β) for accuracy near c.
  const factor = Math.sqrt((1 - beta) * (1 + beta));
  return { ok: true, properSeconds: coordinateSeconds * factor, gamma: 1 / factor, beta };
}
