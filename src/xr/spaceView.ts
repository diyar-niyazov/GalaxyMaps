/**
 * Pure geometry for the immersive "look around" view. The viewer stands at a vantage point in
 * ICRF kilometres; every object is drawn in its true direction from there. Distances are
 * compressed logarithmically into a few metres so near and far objects are visible together,
 * while angular sizes are kept true whenever they are large enough to see.
 */
import type { Vec3 } from "../lib/types";

export const NEAR_M = 0.9;
export const GROW_M = 2.2;
export const FAR_M = 60;
/** Smallest drawn angular radius (≈0.3°), so point-like objects remain visible and gazeable. */
export const MIN_ANGLE = 0.005;
/** Hold the head on an object this long to open its details. */
export const DWELL_MS = 1100;
const MAX_ANGLE = 0.6;
const MIN_SCALE_KM = 50;
const MAX_SCALE_KM = 1e24;

/** ICRF (z = celestial north) → XR scene axes (+Y up), the same mapping as the sky shader. */
export const toXr = (v: Vec3): Vec3 => [-v[1], v[2], -v[0]];
export const fromXr = (v: Vec3): Vec3 => [-v[2], -v[0], v[1]];

const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function displayDistance(rKm: number, scaleKm: number) {
  return Math.min(FAR_M, NEAR_M + GROW_M * Math.log1p(Math.max(0, rKm) / scaleKm));
}

/** True angular radius of a body of `radiusKm` seen from `rKm`, capped so it never engulfs the viewer. */
export function angularRadius(radiusKm: number | undefined, rKm: number) {
  if (!radiusKm || radiusKm <= 0) return 0;
  return Math.asin(Math.min(Math.sin(MAX_ANGLE), radiusKm / Math.max(rKm, radiusKm)));
}

/** Drawn radius in metres at display distance `d` (true angular size, at least MIN_ANGLE). */
export const displayRadius = (angle: number, d: number) => d * Math.tan(Math.max(angle, MIN_ANGLE));

export interface Vantage {
  p: Vec3;
  /** Distance scale of the compression: objects about this far away sit ~2.4 m from the viewer. */
  scaleKm: number;
}

/**
 * Zoom toward what the viewer is looking at. `factor` < 1 zooms in. The vantage moves along
 * `dir` so that the target's distance shrinks by `factor`, but never closer than `standoffKm`.
 */
export function zoomToward(v: Vantage, dir: Vec3, targetKm: number | null, standoffKm: number, factor: number): Vantage {
  const dist = targetKm ?? v.scaleKm * 3;
  let move = dist * (1 - factor);
  if (dist - move < standoffKm) move = Math.max(0, dist - standoffKm);
  const p: Vec3 = [v.p[0] + dir[0] * move, v.p[1] + dir[1] * move, v.p[2] + dir[2] * move];
  const reach = len(p);
  const capped: Vec3 = reach > MAX_SCALE_KM ? [p[0] / reach * MAX_SCALE_KM, p[1] / reach * MAX_SCALE_KM, p[2] / reach * MAX_SCALE_KM] : p;
  return { p: capped, scaleKm: clamp(v.scaleKm * factor, MIN_SCALE_KM, MAX_SCALE_KM) };
}

export interface GazeCandidate {
  id: string;
  /** Unit direction from the viewer, in the same frame as the gaze. */
  dir: Vec3;
  /** Drawn angular radius. */
  angle: number;
}

/** The object the gaze is resting on: inside its drawn disc, or within a small tolerance of it. */
export function pickGaze(cands: GazeCandidate[], gaze: Vec3, tolerance = 0.035): string | null {
  let best: string | null = null, bestScore = 1;
  for (const c of cands) {
    const cos = c.dir[0] * gaze[0] + c.dir[1] * gaze[1] + c.dir[2] * gaze[2];
    const off = Math.acos(clamp(cos, -1, 1));
    const reach = Math.max(c.angle * 1.15, tolerance);
    const score = off / reach;
    if (score < bestScore) { bestScore = score; best = c.id; }
  }
  return best;
}

/** Tracks how long the gaze has rested on one object; fires once per continuous stare. */
export class Dwell {
  id: string | null = null;
  private since = 0;
  private fired = false;
  constructor(private ms = DWELL_MS) {}

  update(id: string | null, now: number): { progress: number; fire: string | null } {
    if (id !== this.id) {
      this.id = id;
      this.since = now;
      this.fired = false;
    }
    if (!id) return { progress: 0, fire: null };
    const progress = Math.min(1, (now - this.since) / this.ms);
    if (progress >= 1 && !this.fired) {
      this.fired = true;
      return { progress, fire: id };
    }
    return { progress: this.fired ? 0 : progress, fire: null };
  }
}

/**
 * Zoom factor for one frame of a pinch gesture. Two hands: their separation ratio (spread to
 * zoom in). One hand: pushing toward the scene zooms in, pulling back zooms out.
 */
export function pinchFactor(prevSpan: number | null, span: number | null, pushM: number) {
  if (prevSpan && span) return clamp(prevSpan / span, 0.5, 2) ** 2.2;
  return clamp(Math.exp(-pushM * 9), 0.5, 2);
}
