import type { CatalogObject, DistanceQuality, Ephemeris, Vec3 } from "./types";
import { ephemerisPosition, clampJd } from "./ephemeris";
import { computeItinerary, type Leg } from "./itinerary";
import { properTime, type ProperTimeResult } from "./physics";
import type { TransportMode } from "./transport";
import { sub, dot, length, normalize } from "./vec";

export interface PositionContext {
  eph: Ephemeris;
  jdTdb: number;
}

/** Heliocentric ICRF position (km) of an object, or null if it has no usable 3D position. */
export function positionOf(obj: CatalogObject, ctx: PositionContext): Vec3 | null {
  const p = obj.position;
  if (!p) return null;
  if (p.kind === "static") return p.xyz;
  return ephemerisPosition(ctx.eph, p.key, clampJd(ctx.eph, ctx.jdTdb));
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

export type RouteResult =
  | {
      ok: true;
      stops: CatalogObject[];
      positions: Vec3[];
      legs: (Leg & { sigmaKm: number | null })[];
      totalKm: number;
      totalSeconds: number;
      totalSigmaKm: number | null;
      mode: TransportMode;
      proper: Extract<ProperTimeResult, { ok: true }> | null;
      quality: DistanceQuality;
      usesEphemeris: boolean;
      notes: string[];
    }
  | { ok: false; error: string; objectId?: string };

export function computeRoute(stops: CatalogObject[], mode: TransportMode, ctx: PositionContext): RouteResult {
  if (stops.length < 2) return { ok: false, error: "Choose a starting point and a destination." };
  if (!(mode.speedKmS > 0) || !Number.isFinite(mode.speedKmS)) return { ok: false, error: "Choose a valid speed greater than zero." };
  const positions: Vec3[] = [];
  for (const s of stops) {
    if (!s.route.supported) return { ok: false, error: `${s.name}: ${s.route.reason}`, objectId: s.id };
    const p = positionOf(s, ctx);
    if (!p) return { ok: false, error: `${s.name} has no usable 3D position for this date.`, objectId: s.id };
    positions.push(p);
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
  const proper = mode.ftl ? null : properTime(it.totalSeconds, mode.speedKmS);
  return {
    ok: true,
    stops,
    positions,
    legs,
    totalKm: it.totalKm,
    totalSeconds: it.totalSeconds,
    totalSigmaKm,
    mode,
    proper: proper && proper.ok ? proper : null,
    quality,
    usesEphemeris,
    notes,
  };
}
