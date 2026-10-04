import type { DataBundle } from "../data/bundle";
import type { CatalogObject, Vec3 } from "./types";
import { positionOf } from "./route";
import { ephemerisAccuracy } from "./ephemeris";
import { raDecFromVector, unitFromRaDec } from "./coords";
import { cross, dot, length, normalize, sub } from "./vec";
import { PC_KM } from "./units";
import { blackbodyRgb, rgbToHex, temperatureFromBV } from "./stars";

export interface EarthSkyDirection {
  objectId: string;
  name: string;
  direction: Vec3;
  raDeg: number;
  decDeg: number;
  jd: number;
  kind: "solar-system" | "catalog" | "cosmological";
  epoch: string;
  note: string;
  sourceIds: string[];
}
export interface SkyStar {
  index: number;
  hygId: number;
  name?: string;
  direction: Vec3;
  magnitude: number;
  color: string;
}
export interface SkyCenter { raDeg: number; decDeg: number }
const RAD = Math.PI / 180;

function finiteVector(p: Vec3 | null | undefined): p is Vec3 {
  return !!(p && p.length === 3 && p.every(Number.isFinite) && length(p) > 1e-12);
}

/** Geometric ICRF direction from Earth's center, with explicit source-epoch limits. */
export function earthSkyDirection(object: CatalogObject, data: DataBundle, jd: number): EarthSkyDirection | null {
  if (object.id === "earth" || !Number.isFinite(jd) || !object.sourceIds.length) return null;
  let vector: Vec3 | null;
  let kind: EarthSkyDirection["kind"];
  let epoch: string;
  let note: string;
  const earth = data.byId.get("earth");
  if (object.cosmo) {
    vector = object.cosmo.dir;
    kind = "cosmological";
    epoch = "Catalog direction · ICRF / J2000 axes";
    note = "A sourced catalog sky direction. This chart does not derive apparent motion or a physical route from redshift.";
  } else if (object.position) {
    if (object.position.frame !== "ICRF" || object.position.origin !== "Sun" || object.position.unit !== "km" || !earth) return null;
    const pe = positionOf(earth, { eph: data.eph, jdTdb: jd });
    const po = positionOf(object, { eph: data.eph, jdTdb: jd });
    if (!pe?.every(Number.isFinite) || !po?.every(Number.isFinite)) return null;
    vector = sub(po, pe);
    if (object.position.kind === "ephemeris") {
      kind = "solar-system";
      const satellite = !!data.eph.satellites[object.position.key];
      const approximate = satellite || ephemerisAccuracy(data.eph, jd) === "approximate";
      epoch = satellite ? "Map date · satellite orbital approximation" : approximate ? "Map date · approximate orbital model" : "Map date · JPL Horizons geometric positions";
      note = `Earth and target positions are evaluated at the same map date. ${satellite ? "This moon uses parent-relative two-body propagation of Horizons orbital elements. " : ""}Light-time, aberration, precession, nutation and atmospheric refraction are omitted.`;
    } else {
      kind = "catalog";
      epoch = `Catalog epoch: ${object.position.epoch}`;
      note = "Catalog positions with a geometric Earth offset at the map date. Stellar proper motion and apparent-position corrections are not propagated.";
    }
  } else return null;
  if (!finiteVector(vector)) return null;
  const direction = normalize(vector);
  const angles = raDecFromVector(direction);
  return { objectId: object.id, name: object.name, direction, ...angles, jd, kind, epoch, note, sourceIds: [...new Set([...object.sourceIds, ...(kind !== "cosmological" ? [data.eph.sourceId] : [])])] };
}

export function eligibleEarthSky(object: CatalogObject, data: DataBundle, jd: number): boolean {
  return earthSkyDirection(object, data, jd) !== null;
}

/** HYG stars retain their J2000 catalog positions; the dot field is astrometric data. */
export function buildEarthSkyStars(data: DataBundle, jd: number, maxMagnitude = 6, budget = 2200): SkyStar[] {
  const earth = data.byId.get("earth");
  const pe = earth && positionOf(earth, { eph: data.eph, jdTdb: jd });
  if (!pe?.every(Number.isFinite) || !data.stars?.length || !data.starStride) return [];
  const earthPc: Vec3 = [pe[0] / PC_KM, pe[1] / PC_KM, pe[2] / PC_KM];
  const catalogNames = new Map(data.catalog.objects.filter((o) => o.hygId != null).map((o) => [o.hygId!, o.name]));
  const stars: SkyStar[] = [];
  for (let index = 0; index < data.stars.length / data.starStride; index++) {
    const at = index * data.starStride;
    const magnitude = data.stars[at + 5];
    if (!Number.isFinite(magnitude) || magnitude > maxMagnitude) continue;
    const raw: Vec3 = [data.stars[at], data.stars[at + 1], data.stars[at + 2]];
    // Reject the Sun/invalid entries before subtracting the Earth's displacement.
    if (!finiteVector(raw)) continue;
    const vector = sub(raw, earthPc);
    if (!finiteVector(vector)) continue;
    const hygId = data.stars[at + 6];
    const ci = data.stars[at + 4];
    stars.push({ index, hygId, name: (catalogNames.get(hygId) ?? data.starNames?.[String(hygId)]?.[0]) || undefined, direction: normalize(vector), magnitude, color: rgbToHex(blackbodyRgb(temperatureFromBV(Number.isFinite(ci) ? ci : 0.6))) });
  }
  return stars.sort((a, b) => a.magnitude - b.magnitude).slice(0, Math.max(0, Math.trunc(budget)));
}

/** Angular separation only. Never used as physical proximity or route distance. */
export function skyAngularSeparation(a: Vec3, b: Vec3): number {
  if (!finiteVector(a) || !finiteVector(b)) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b))))) / RAD;
}

export function skyNeighbors(target: Vec3, stars: SkyStar[], hygId?: number, maxAngle = 25): (SkyStar & { angleDeg: number })[] {
  return stars.filter((star) => star.name && star.hygId !== hygId).map((star) => ({ ...star, angleDeg: skyAngularSeparation(target, star.direction) })).filter((star) => star.angleDeg > 0.001 && star.angleDeg <= maxAngle).sort((a, b) => a.angleDeg - b.angleDeg).slice(0, 5);
}

/** Stereographic sky window: north up, increasing right ascension to the left. */
export function projectEarthSky(direction: Vec3, center: SkyCenter, fieldDeg: number): { x: number; y: number; visible: boolean; angleDeg: number } {
  const forward = unitFromRaDec(center.raDeg, center.decDeg);
  const east: Vec3 = [-Math.sin(center.raDeg * RAD), Math.cos(center.raDeg * RAD), 0];
  const north = cross(forward, east);
  const d = normalize(direction);
  const z = Math.max(-1, Math.min(1, dot(forward, d)));
  const angular = Math.acos(z) / RAD;
  const radius = 2 * Math.tan(fieldDeg * RAD / 4);
  const k = 2 / Math.max(1e-10, 1 + z);
  return { x: -dot(d, east) * k / radius, y: -dot(d, north) * k / radius, visible: angular <= fieldDeg / 2, angleDeg: angular };
}

export function normalizedSkyCenter(center: SkyCenter): SkyCenter {
  return { raDeg: ((center.raDeg % 360) + 360) % 360, decDeg: Math.max(-89.9, Math.min(89.9, center.decDeg)) };
}

export function formatSkyRa(raDeg: number): string {
  const hours = (((raDeg % 360) + 360) % 360) / 15;
  let minutes = Math.round(hours * 60);
  minutes %= 1440;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
export function formatSkyDec(decDeg: number): string {
  const magnitude = Math.round(Math.abs(decDeg) * 60);
  return `${decDeg < 0 ? "−" : "+"}${Math.floor(magnitude / 60)}° ${String(magnitude % 60).padStart(2, "0")}′`;
}
