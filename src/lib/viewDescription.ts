import type { CatalogObject, Vec3 } from "./types";
import { formatDistance } from "./format";
import { distance } from "./vec";
import { TYPE_LABEL } from "./search";

export interface Nearby {
  obj: CatalogObject;
  km: number;
}

const SKIP_TYPES = new Set(["mission"]);

/**
 * Catalog objects nearest to `center` (3D, physical), for audio navigation and view descriptions.
 * Objects inside `radiusKm` come first; if fewer than `min` fall inside, the nearest are used.
 */
export function nearbyObjects(objects: CatalogObject[], pos: (o: CatalogObject) => Vec3 | null, center: Vec3, opts: { exclude?: string; radiusKm?: number; limit?: number; min?: number } = {}): Nearby[] {
  const { exclude, radiusKm = Infinity, limit = 12, min = 4 } = opts;
  const all: Nearby[] = [];
  for (const obj of objects) {
    if (obj.id === exclude || SKIP_TYPES.has(obj.type)) continue;
    const p = pos(obj);
    if (!p) continue;
    const km = distance(p, center);
    if (Number.isFinite(km)) all.push({ obj, km });
  }
  all.sort((a, b) => a.km - b.km || b.obj.display.priority - a.obj.display.priority);
  const inside = all.filter((n) => n.km <= radiusKm);
  return (inside.length >= min ? inside : all).slice(0, limit);
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");
export const kindOf = (o: CatalogObject) => (TYPE_LABEL[o.type] ?? o.type).toLowerCase();
/** "Mars, planet" but just "Moon" when the type repeats the name. */
export const nameWithKind = (o: CatalogObject) => (kindOf(o) === o.name.toLowerCase() ? o.name : `${o.name}, ${kindOf(o)}`);

export interface ViewSummaryInput {
  mode: "explore" | "locked" | "route";
  widthKm: number;
  plane: string;
  universe: number;
  selected: CatalogObject | null;
  routeNames?: string[];
  nearby: Nearby[];
}

/** One plain-language paragraph describing what the map is showing. */
export function describeView(v: ViewSummaryInput): string {
  const names = (list: Nearby[]) => list.slice(0, 5).map((n) => n.obj.name).join(", ");
  if (v.universe >= 0.5) {
    return `Observable universe overview. Directions are true but distances are compressed logarithmically. ${v.nearby.length ? `Labelled destinations include ${names(v.nearby)}.` : ""}`.trim();
  }
  const parts: string[] = [];
  if (v.mode === "route" && v.routeNames && v.routeNames.length >= 2) {
    parts.push(`Showing the route from ${v.routeNames[0]} to ${v.routeNames[v.routeNames.length - 1]}${v.routeNames.length > 2 ? ` with ${v.routeNames.length - 2} stop${v.routeNames.length > 3 ? "s" : ""} in between` : ""}.`);
  } else if (v.mode === "locked" && v.selected) {
    const k = kindOf(v.selected);
    parts.push(`Locked on ${v.selected.name}, ${article(k)} ${k}.`);
  } else if (v.selected) {
    const k = kindOf(v.selected);
    parts.push(`${v.selected.name} is selected, ${article(k)} ${k}.`);
  }
  parts.push(`The view is about ${formatDistance(v.widthKm)} across, aligned to the ${v.plane.replace("→", "to").toLowerCase()} plane.`);
  if (v.nearby.length) parts.push(`Nearest catalogued destinations: ${v.nearby.slice(0, 5).map((n) => `${n.obj.name} (${formatDistance(n.km)})`).join(", ")}.`);
  return parts.join(" ");
}
