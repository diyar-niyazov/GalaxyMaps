import type { DataBundle } from "../data/bundle";
import type { CatalogObject } from "./types";
import { positionOf } from "./route";
import { distance } from "./vec";
import { C_KM_S, JULIAN_YEAR_S } from "./units";
import { formatDuration } from "./format";

/** Coordinates must describe an individual physical distance, not unknown host depth. */
export function physicalNeighborDistance(a: CatalogObject, b: CatalogObject, data: DataBundle, jd: number): number | null {
  if ([a, b].some((o) => !o.position || o.cosmo || o.position.kind === "static" && o.position.depth === "host" || o.distance?.quality === "uncertain")) return null;
  const positions = [a, b].map((o) => positionOf(o, { eph: data.eph, jdTdb: jd }));
  return positions.every((p) => p?.every(Number.isFinite)) ? distance(positions[0]!, positions[1]!) : null;
}
export function nearbyDestinations(object: CatalogObject, data: DataBundle, jd: number, limit = 3) {
  return data.catalog.objects.filter((o) => o.id !== object.id && o.featured && o.image).map((o) => ({ object: o, km: physicalNeighborDistance(object, o, data, jd) })).filter((entry): entry is { object: CatalogObject; km: number } => entry.km != null && entry.km > 0).sort((a, b) => a.km - b.km).slice(0, limit);
}
export function lightDelay(object: CatalogObject, data: DataBundle, jd: number): { seconds: number; text: string; model: string } | null {
  if (object.id === "earth") return null;
  if (object.cosmo) {
    const years = object.cosmo.lightTravelYears;
    if (!Number.isFinite(years) || years <= 0) return null;
    return { seconds: years * JULIAN_YEAR_S, text: `The light reaching Earth began its journey roughly ${formatDuration(years * JULIAN_YEAR_S)} ago.`, model: `Cosmological lookback time: ${object.cosmo.model}. This is distinct from comoving distance.` };
  }
  const earth = data.byId.get("earth");
  if (!earth) return null;
  const km = physicalNeighborDistance(object, earth, data, jd);
  if (km == null || km <= 0) return null;
  return { seconds: km / C_KM_S, text: `Light takes approximately ${formatDuration(km / C_KM_S)} to cover the distance from ${object.name} to Earth.`, model: "Geometric three-dimensional separation divided by the vacuum speed of light. Static catalog distances and orbital models may be approximate; target motion during light travel is omitted." };
}
export function sourcedGuideContext(data: DataBundle, id: string | null, jd: number): string {
  const o = id ? data.byId.get(id) : null;
  if (!o) return "";
  return JSON.stringify({ selectedObjectId: o.id, name: o.name, kind: o.type, epochJdTdb: jd, summary: o.summary?.text, facts: o.facts, lightDelay: lightDelay(o, data, jd), sources: o.sourceIds.map((key) => data.catalog.sources[key]).filter(Boolean), imagery: o.image ? { kind: o.image.kind, credit: o.image.credit } : undefined });
}
