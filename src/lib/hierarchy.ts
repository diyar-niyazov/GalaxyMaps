import type { CatalogObject, Region } from "./types";

/**
 * Catalog membership (host → child), independent of where the camera is. The region bar reports
 * the camera's scale; these helpers report what an object belongs to.
 */

export const REGION_CRUMB: Record<Region, { label: string; presetId: string }> = {
  "solar-system": { label: "Solar System", presetId: "solar" },
  "stellar-neighborhood": { label: "Stellar neighborhood", presetId: "neighborhood" },
  "milky-way": { label: "Milky Way", presetId: "milky-way" },
  "local-group": { label: "Local Group", presetId: "local-group" },
  "local-volume": { label: "Nearby galaxies", presetId: "local-volume" },
  cosmological: { label: "Distant universe", presetId: "universe" },
};

/** Ancestors from the outermost host down to the object itself. Cycles are cut defensively. */
export function hostChain(byId: Map<string, CatalogObject>, obj: CatalogObject): CatalogObject[] {
  const chain: CatalogObject[] = [];
  const seen = new Set<string>();
  for (let p: CatalogObject | undefined = obj; p && !seen.has(p.id); p = p.parentId ? byId.get(p.parentId) : undefined) {
    seen.add(p.id);
    chain.unshift(p);
  }
  return chain;
}

export interface Crumb {
  label: string;
  /** Region preset to frame, or catalog object to open. The last crumb is the current place. */
  target: { kind: "region"; presetId: string } | { kind: "object"; id: string } | null;
}

/** Universe › region › hosts › object, e.g. Universe › Local Group › Andromeda Galaxy › Mayall II (G1). */
export function breadcrumbsFor(byId: Map<string, CatalogObject>, obj: CatalogObject): Crumb[] {
  const chain = hostChain(byId, obj);
  const crumbs: Crumb[] = [{ label: "Universe", target: { kind: "region", presetId: "universe" } }];
  const region = REGION_CRUMB[chain[0].region];
  if (chain[0].region !== "cosmological" && region.label.toLowerCase() !== chain[0].name.toLowerCase()) {
    crumbs.push({ label: region.label, target: { kind: "region", presetId: region.presetId } });
  }
  chain.forEach((o, i) => crumbs.push({ label: o.name, target: i === chain.length - 1 ? null : { kind: "object", id: o.id } }));
  return crumbs;
}

export interface InsideGroup {
  id: "nucleus" | "disk" | "halo" | "companions" | "moons" | "planets" | "members";
  label: string;
  note?: string;
}

const GROUP_ORDER: InsideGroup["id"][] = ["nucleus", "disk", "halo", "companions", "planets", "moons", "members"];

/**
 * Where a child sits relative to its host. For galaxies: the nucleus, internal disk/bulge features,
 * the globular-cluster (halo) population, and companion galaxies, which are separate systems.
 */
export function insideGroup(child: CatalogObject, host: CatalogObject): InsideGroup {
  if (child.relation === "satellite") return { id: "companions", label: "Companion galaxies", note: "Separate galaxies orbiting the host, each with its own measured distance." };
  if (child.relation === "nucleus") return { id: "nucleus", label: "Nucleus" };
  if (child.type === "exoplanet" || child.relation === "planet") return { id: "planets", label: "Planets" };
  if (child.type === "moon") return { id: "moons", label: "Moons" };
  if (host.type === "galaxy") {
    if (child.category === "cl-globular") return { id: "halo", label: "Halo: globular clusters", note: "Old clusters of the bulge and halo population; their depth inside the galaxy is not measured." };
    return { id: "disk", label: "Disk and bulge features", note: "Star clouds, stars and remnants seen against the galaxy's disk or bulge." };
  }
  return { id: "members", label: "Members" };
}

export function groupChildren(children: CatalogObject[], host: CatalogObject): { group: InsideGroup; items: CatalogObject[] }[] {
  const m = new Map<InsideGroup["id"], { group: InsideGroup; items: CatalogObject[] }>();
  for (const c of children) {
    const g = insideGroup(c, host);
    const entry = m.get(g.id) ?? { group: g, items: [] };
    entry.items.push(c);
    m.set(g.id, entry);
  }
  for (const v of m.values()) v.items.sort((a, b) => Number(!!b.image) - Number(!!a.image) || b.display.priority - a.display.priority || a.name.localeCompare(b.name));
  return GROUP_ORDER.filter((id) => m.has(id)).map((id) => m.get(id)!);
}

/** True when the child's position is its sky direction at the host's distance (depth unknown). */
export const placedAtHostDistance = (o: CatalogObject) => o.position?.kind === "static" && o.position.depth === "host";
