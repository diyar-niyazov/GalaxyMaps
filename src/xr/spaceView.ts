/**
 * Pure geometry for the immersive view. Like the 2D map, it is one rigid, linear scale model of
 * space: the viewer stands at a vantage point in ICRF kilometres and every object sits at its true
 * offset times a single metres-per-kilometre scale, so moving your head gives true parallax and
 * stereo depth. Nearby objects stay linear; farther ones keep their true direction and angular size
 * with log-compressed depth so galaxies at different distances still separate in stereo.
 * Zooming and flying change the vantage and the scale continuously, as the 2D zoom does.
 */
import type { Vec3 } from "../lib/types";

/** Display distance an object settles at after flying to it. */
export const FOCUS_M = 2.2;
/**
 * Distances shorter than this stay linear (true stereo, like standing next to Earth or the Moon).
 * Farther objects keep their true direction and angular size, but depth is log-compressed so
 * Andromeda, Virgo and a distant quasar sit at different depths instead of on one sky-sphere.
 */
export const LINEAR_M = 36;
/** Farthest an object is ever drawn. */
export const FAR_M = 110;
/** Matches `LINEAR_M` in the star shader: log(1 + (linear − LINEAR) / LINEAR). */
export const LOG_REF_M = LINEAR_M;
/** Caps the log so a 10^12-fold excess distance reaches FAR_M. */
export const LOG_MAX = Math.log(1 + 1e12);
/** Smallest drawn marker radius (≈0.3°), so point-like objects remain visible. */
export const MIN_ANGLE = 0.005;
/** Gaze and pinch hitbox: at least this angular radius (≈6.3°) around every object. */
export const GAZE_TOLERANCE = 0.11;
/** The current target's hitbox grows by this factor, so the gaze doesn't flicker between neighbours. */
export const STICKY = 1.65;
/** Hold your gaze on an object this long to open its details. Short enough for Vision Pro, long enough not to fire while looking around. */
export const DWELL_MS = 480;
const MIN_M_PER_KM = 1e-26;
const MAX_M_PER_KM = 1;

/** ICRF (z = celestial north) → XR scene axes (+Y up), the same mapping as the sky shader. */
export const toXr = (v: Vec3): Vec3 => [-v[1], v[2], -v[0]];
export const fromXr = (v: Vec3): Vec3 => [-v[2], -v[0], v[1]];

const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface Vantage {
  p: Vec3;
  /** Metres of display per kilometre of space. */
  mPerKm: number;
}

/** Compress a linear display distance the same way the star shader does. */
export function compressDistance(linear: number) {
  if (linear <= LINEAR_M) return linear;
  return LINEAR_M + (FAR_M - LINEAR_M) * Math.min(1, Math.log(1 + (linear - LINEAR_M) / LOG_REF_M) / LOG_MAX);
}

/** Display distance of something `rKm` away. */
export const displayDistance = (rKm: number, mPerKm: number) => compressDistance(rKm * mPerKm);

/** Drawn radius in metres: true angular size at the (possibly compressed) display distance. */
export function displayRadius(radiusKm: number, rKm: number, mPerKm: number) {
  return radiusKm * (displayDistance(rKm, mPerKm) / Math.max(rKm, 1e-9));
}

/**
 * Zoom toward (factor < 1) or away from (factor > 1) a pivot point. Zooming in flies toward the
 * pivot (never closer than `standoffKm`): while it is far it also rushes in faster than the world
 * scale, then it holds at its display distance and the world grows around it. Zooming out shrinks
 * the world around the pivot.
 */
export function zoomVantage(v: Vantage, pivot: Vec3, standoffKm: number, factor: number): Vantage {
  const off: Vec3 = [v.p[0] - pivot[0], v.p[1] - pivot[1], v.p[2] - pivot[2]];
  const r = Math.max(len(off), 1e-9);
  let r2 = r * factor;
  if (factor < 1) r2 = Math.max(r2, Math.min(r, standoffKm));
  const d = r * v.mPerKm;
  const d2 = factor < 1 && d > FOCUS_M ? Math.max(FOCUS_M, d * factor ** 3) : d;
  const k = r2 / r;
  return {
    p: [pivot[0] + off[0] * k, pivot[1] + off[1] * k, pivot[2] + off[2] * k],
    mPerKm: clamp(d2 / r2, MIN_M_PER_KM, MAX_M_PER_KM),
  };
}

export interface Flight {
  target: Vec3;
  /** Unit direction from the target to the viewer, kept for the whole flight. */
  u: Vec3;
  r0: number;
  r1: number;
  m0: number;
  m1: number;
  ms: number;
}

/**
 * A straight flight toward `target` that ends `standoffKm` from it with the target `endM` metres
 * away. Distance and scale change geometrically, so a jump across galaxies feels like the same
 * motion as a hop between moons.
 */
export function planFlight(v: Vantage, target: Vec3, standoffKm: number, endM = FOCUS_M): Flight {
  const off: Vec3 = [v.p[0] - target[0], v.p[1] - target[1], v.p[2] - target[2]];
  const r0 = Math.max(len(off), 1e-9);
  const u: Vec3 = r0 > 1e-6 ? [off[0] / r0, off[1] / r0, off[2] / r0] : [1, 0, 0];
  const r1 = Math.max(standoffKm, 1e-6);
  const decades = Math.abs(Math.log10(r0 / r1)) + Math.abs(Math.log10((r1 * v.mPerKm) / endM)) * 0.3;
  return { target, u, r0, r1, m0: v.mPerKm, m1: clamp(endM / r1, MIN_M_PER_KM, MAX_M_PER_KM), ms: clamp(1200 + decades * 220, 1200, 4200) };
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function flightAt(f: Flight, t: number): Vantage {
  const s = easeInOut(clamp(t, 0, 1));
  const r = Math.exp(lerp(Math.log(f.r0), Math.log(f.r1), s));
  const m = Math.exp(lerp(Math.log(f.m0), Math.log(f.m1), s));
  return { p: [f.target[0] + f.u[0] * r, f.target[1] + f.u[1] * r, f.target[2] + f.u[2] * r], mPerKm: m };
}

export interface GazeCandidate {
  id: string;
  /** Unit direction from the eye or hand, in the same frame as the gaze. */
  dir: Vec3;
  /** Drawn angular radius. */
  angle: number;
  /** Display distance from the eye, metres. */
  dist: number;
  /** Opaque bodies hide whatever is behind them. */
  solid?: boolean;
}

/**
 * The object the gaze rests on: inside its drawn disc or within a generous hitbox of it, preferring
 * the most centred. Objects behind an opaque body under the gaze are excluded; the current target
 * (`sticky`) keeps a larger hitbox.
 */
export function pickGaze(cands: GazeCandidate[], gaze: Vec3, sticky: string | null = null, tolerance = GAZE_TOLERANCE): string | null {
  const offs = cands.map((c) => Math.acos(clamp(c.dir[0] * gaze[0] + c.dir[1] * gaze[1] + c.dir[2] * gaze[2], -1, 1)));
  let wall = Infinity, wallId: string | null = null;
  cands.forEach((c, i) => { if (c.solid && offs[i] < c.angle && c.dist < wall) { wall = c.dist; wallId = c.id; } });
  let best: string | null = null, bestScore = 1;
  cands.forEach((c, i) => {
    if (c.dist > wall && c.id !== wallId) return;
    const reach = Math.max(c.angle * 1.85, tolerance) * (c.id === sticky ? STICKY : 1);
    const score = offs[i] / reach;
    if (score < bestScore) { bestScore = score; best = c.id; }
  });
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

/** Orbit angles (yaw, pitch in radians) for a one-hand drag: grab the world and turn it. */
export const ORBIT_RAD_PER_M = 2.6;
