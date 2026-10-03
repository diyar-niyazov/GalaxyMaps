import type { Vec3 } from "./types";
import { distance } from "./vec";

export interface Leg {
  fromIndex: number;
  toIndex: number;
  distanceKm: number;
  seconds: number;
}

export interface ItineraryResult {
  legs: Leg[];
  totalKm: number;
  totalSeconds: number;
}

/** Sum straight-line legs between consecutive stops at a constant speed. */
export function computeItinerary(positions: Vec3[], speedKmS: number): ItineraryResult {
  if (!(speedKmS > 0) || !Number.isFinite(speedKmS)) throw new Error("Speed must be positive and finite");
  const legs: Leg[] = [];
  for (let i = 0; i + 1 < positions.length; i++) {
    const d = distance(positions[i], positions[i + 1]);
    legs.push({ fromIndex: i, toIndex: i + 1, distanceKm: d, seconds: d / speedKmS });
  }
  return {
    legs,
    totalKm: legs.reduce((s, l) => s + l.distanceKm, 0),
    totalSeconds: legs.reduce((s, l) => s + l.seconds, 0),
  };
}

export interface DetourResult {
  /** Index in the stop list where the candidate would be inserted. */
  insertAt: number;
  addedKm: number;
  /** Added distance relative to the original total (0.1 = +10%). */
  addedFraction: number;
}

/**
 * Cheapest insertion of a candidate stop into an ordered itinerary (origin and final
 * destination stay fixed). This is how we decide whether something is "on the way".
 */
export function evaluateDetour(positions: Vec3[], candidate: Vec3): DetourResult | null {
  if (positions.length < 2) return null;
  let best: DetourResult | null = null;
  const total = positions.slice(1).reduce((s, p, i) => s + distance(positions[i], p), 0);
  for (let i = 0; i + 1 < positions.length; i++) {
    const a = positions[i], b = positions[i + 1];
    const added = distance(a, candidate) + distance(candidate, b) - distance(a, b);
    if (!best || added < best.addedKm) best = { insertAt: i + 1, addedKm: added, addedFraction: total > 0 ? added / total : Infinity };
  }
  return best;
}

/** A stop is "on the way" only if the detour adds at most `threshold` of the trip length. */
export function isOnTheWay(d: DetourResult, threshold = 0.05): boolean {
  return d.addedFraction <= threshold;
}
