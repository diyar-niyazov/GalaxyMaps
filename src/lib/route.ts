import type { CatalogObject, DistanceQuality, Ephemeris, Vec3 } from "./types";
import { ephemerisPosition, ephemerisAccuracy } from "./ephemeris";
import { computeItinerary, type Leg } from "./itinerary";
import type { TransportMode } from "./transport";
import { hohmann, transferArcLengthKm, type HohmannResult } from "./transfer";
import { ICRF_TO_ECLIPTIC } from "./coords";
import { sub, dot, length, normalize, mulMatVec } from "./vec";
import { DAY_S } from "./units";

export interface PositionContext {
  eph: Ephemeris;
  jdTdb: number;
}

/** Heliocentric ICRF position (km) of an object, or null if it has no usable 3D position. */
export function positionOf(obj: CatalogObject, ctx: PositionContext): Vec3 | null {
  const p = obj.position;
  if (!p) return null;
  if (p.kind === "static") return p.xyz;
  return ephemerisPosition(ctx.eph, p.key, ctx.jdTdb);
}

const QUALITY_ORDER: DistanceQuality[] = ["precise", "good", "approximate", "uncertain"];
export const worstQuality = (qs: DistanceQuality[]): DistanceQuality =>
  qs.reduce((w, q) => (QUALITY_ORDER.indexOf(q) > QUALITY_ORDER.indexOf(w) ? q : w), "precise" as DistanceQuality);

/** 1σ radial distance uncertainty from the Sun (km), if the catalog provides one. */
export function radialSigmaKm(obj: CatalogObject): number | null {
  if (obj.position?.kind === "ephemeris") return 0;
  const d = obj.distance;
  if (!d || (d.plusKm == null && d.minusKm == null)) return null;
  return Math.max(d.plusKm ?? 0, d.minusKm ?? 0);
}

/**
 * Linear propagation of radial (line-of-sight) distance errors into a leg length.
 * Sky directions are known far better than distances, so radial errors dominate.
 */
export function legSigmaKm(a: Vec3, b: Vec3, sigmaA: number, sigmaB: number): number {
  const ab = sub(b, a);
  const L = length(ab);
  if (L === 0) return Math.hypot(sigmaA, sigmaB);
  const u = normalize(ab);
  const dA = length(a) > 0 ? Math.abs(dot(normalize(a), u)) : 0;
  const dB = length(b) > 0 ? Math.abs(dot(normalize(b), u)) : 0;
  return Math.hypot(dA * sigmaA, dB * sigmaB);
}

export type RouteKind = "orbital-transfer" | "straight-line";
export type RouteModelPreference = "auto" | "straight-line";

/** Idealized Hohmann transfer between two planets (circular, coplanar orbits). */
export interface TransferPlan {
  h: HohmannResult;
  inward: boolean;
  originId: string;
  targetId: string;
  /** Departure date: next date the real planets reach the required phase angle, if found. */
  departJd: number;
  arriveJd: number;
  windowFound: boolean;
  /** Ecliptic longitude of the origin planet at departure (rad). */
  lon0: number;
  /** Length of the half-ellipse flown, km. */
  pathKm: number;
}

export type RouteResult =
  | {
      ok: true;
      kind: RouteKind;
      stops: CatalogObject[];
      /** Positions of the stops at the map date (straight-line geometry). */
      positions: Vec3[];
      legs: (Leg & { sigmaKm: number | null })[];
      /** Straight-line distance through all stops at the map date, km. */
      totalKm: number;
      totalSigmaKm: number | null;
      /** Distance along the modeled path: the transfer arc, or the straight line. */
      pathKm: number;
      /** Primary modeled flight time, seconds. */
      modeledSeconds: number;
      /** Direct-distance benchmark: straight-line distance at the comparison speed. */
      comparison: { mode: TransportMode; seconds: number; distanceKm: number };
      /** Map date the geometry refers to (JD TDB). */
      epochJd: number;
      quality: DistanceQuality;
      usesEphemeris: boolean;
      notes: string[];
      assumptions: string[];
      transfer?: TransferPlan;
    }
  | { ok: false; error: string; objectId?: string };

const ORBITAL_TYPES = new Set(["planet"]);

/** Planet pairs that the idealized heliocentric transfer covers. */
export function supportsOrbitalTransfer(a: CatalogObject, b: CatalogObject, eph: Ephemeris): boolean {
  return a.id !== b.id && ORBITAL_TYPES.has(a.type) && ORBITAL_TYPES.has(b.type) && !!eph.orbits[a.id] && !!eph.orbits[b.id] && (a.parentId ?? "sun") === "sun" && (b.parentId ?? "sun") === "sun";
}

const eclLon = (p: Vec3) => {
  const e = mulMatVec(ICRF_TO_ECLIPTIC, p);
  return Math.atan2(e[1], e[0]);
};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Next date (within `horizonDays`) when the target leads the origin by the Hohmann phase angle. */
export function findTransferWindow(eph: Ephemeris, originKey: string, targetKey: string, phase: number, startJd: number, horizonDays = 1100): number | null {
  let prev: number | null = null;
  for (let d = 0; d <= horizonDays; d++) {
    const jd = startJd + d;
    const po = ephemerisPosition(eph, originKey, jd), pt = ephemerisPosition(eph, targetKey, jd);
    if (!po || !pt) return null;
    const diff = wrap(eclLon(pt) - eclLon(po) - phase);
    if (prev != null && Math.abs(diff - prev) < Math.PI && Math.sign(diff) !== Math.sign(prev)) {
      const f = prev / (prev - diff);
      return jd - 1 + f;
    }
    if (d === 0 && Math.abs(diff) < 1e-3) return jd;
    prev = diff;
  }
  return null;
}

export function planTransfer(origin: CatalogObject, target: CatalogObject, eph: Ephemeris, jd: number): TransferPlan | null {
  const r1 = eph.orbits[origin.id]?.aKm, r2 = eph.orbits[target.id]?.aKm;
  if (!r1 || !r2 || r1 === r2) return null;
  const h = hohmann(r1, r2);
  const window = findTransferWindow(eph, origin.id, target.id, h.phaseAngleRad, jd);
  const departJd = window ?? jd;
  const po = ephemerisPosition(eph, origin.id, departJd);
  if (!po) return null;
  return {
    h, inward: r2 < r1, originId: origin.id, targetId: target.id,
    departJd, arriveJd: departJd + h.transferSeconds / DAY_S, windowFound: window != null,
    lon0: eclLon(po), pathKm: transferArcLengthKm(h),
  };
}

export function computeRoute(stops: CatalogObject[], mode: TransportMode, ctx: PositionContext, model: RouteModelPreference = "auto"): RouteResult {
  if (stops.length < 2) return { ok: false, error: "Choose a starting point and a destination." };
  if (!(mode.speedKmS > 0) || !Number.isFinite(mode.speedKmS)) return { ok: false, error: "Choose a valid comparison speed." };
  const positions: Vec3[] = [];
  for (const s of stops) {
    if (!s.route.supported) return { ok: false, error: `${s.name}: ${s.route.reason}`, objectId: s.id };
    const p = positionOf(s, ctx);
    if (!p) return { ok: false, error: `${s.name} has no usable 3D position for this date.`, objectId: s.id };
    positions.push(p);
  }
  const hostDepth = (o: CatalogObject) => o.position?.kind === "static" && o.position.depth === "host";
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    if (a.parentId && a.parentId === b.parentId && hostDepth(a) && hostDepth(b)) {
      return { ok: false, error: `${a.name} and ${b.name} are both placed at the distance of their host galaxy; their true separation along the line of sight is unknown, so no route is offered between them.`, objectId: b.id };
    }
    const child = b.parentId === a.id ? b : a.parentId === b.id ? a : null;
    if (child && hostDepth(child)) {
      const host = child === a ? b : a;
      return { ok: false, error: `${child.name} is placed at the distance of ${host.name}; its depth inside ${host.name} is not measured, so no internal travel distance is offered.`, objectId: child.id };
    }
  }
  const it = computeItinerary(positions, mode.speedKmS);
  const sigmas = stops.map(radialSigmaKm);
  const legs = it.legs.map((l) => {
    const sa = sigmas[l.fromIndex], sb = sigmas[l.toIndex];
    return { ...l, sigmaKm: sa == null || sb == null ? null : legSigmaKm(positions[l.fromIndex], positions[l.toIndex], sa, sb) };
  });
  const totalSigmaKm = legs.some((l) => l.sigmaKm == null) ? null : Math.hypot(...legs.map((l) => l.sigmaKm!));
  const quality = worstQuality(stops.map((s) => (s.route.supported ? s.route.quality : "uncertain")));
  const usesEphemeris = stops.some((s) => s.position?.kind === "ephemeris");
  const notes: string[] = [];
  for (const s of stops) if (s.route.supported && s.route.note && s.position?.kind !== "ephemeris") notes.push(`${s.name}: ${s.route.note}`);
  if (usesEphemeris && ephemerisAccuracy(ctx.eph, ctx.jdTdb) === "approximate") notes.push("This date is outside the JPL Horizons table; Solar System positions use approximate two-body orbits.");
  const comparison = { mode, seconds: it.totalSeconds, distanceKm: it.totalKm };

  const base = { stops, positions, legs, totalKm: it.totalKm, totalSigmaKm, comparison, epochJd: ctx.jdTdb, quality, usesEphemeris, notes };
  if (model === "auto" && stops.length === 2 && supportsOrbitalTransfer(stops[0], stops[1], ctx.eph)) {
    const plan = planTransfer(stops[0], stops[1], ctx.eph, ctx.jdTdb);
    if (plan) {
      return {
        ok: true, kind: "orbital-transfer", ...base, pathKm: plan.pathKm, modeledSeconds: plan.h.transferSeconds, transfer: plan,
        assumptions: [
          "Idealized Hohmann transfer: both planets on circular, coplanar orbits with radii equal to their semi-major axes.",
          "The Sun's gravity only; no planetary gravity, launch, capture or course corrections.",
          plan.windowFound ? "Departure is the next date the real planets reach the required alignment." : "No alignment found within three years; the transfer is shown departing on the map date.",
          `Comparison time is the straight-line distance on the map date at ${mode.label.toLowerCase()}, a benchmark rather than a trajectory.`,
        ],
      };
    }
  }
  const crossesSolar = stops.some((s) => s.region === "solar-system") && stops.length === 2 && stops.every((s) => s.region === "solar-system");
  return {
    ok: true, kind: "straight-line", ...base, pathKm: it.totalKm, modeledSeconds: it.totalSeconds,
    assumptions: [
      `Straight line through the stops at a constant ${mode.label.toLowerCase()} (${mode.kind === "measured" ? "measured" : "exact"} speed); no acceleration or gravity.`,
      "Positions are frozen at the map date; real targets keep moving during the trip.",
      ...(crossesSolar && model === "auto" ? ["The orbital-transfer model covers pairs of planets only (moons and small bodies need multi-body trajectories)."] : []),
    ],
  };
}
