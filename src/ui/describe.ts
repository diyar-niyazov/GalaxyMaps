/** Shared, non-component helpers for the UI (kept out of component modules for Fast Refresh). */
import type { RefObject } from "react";
import type { CatalogObject, ImageryKind, Region } from "../lib/types";
import type { DataBundle } from "../data/bundle";
import { formatDistance } from "../lib/format";
import { AU_KM, LY_KM } from "../lib/units";

/** Shared so the "/" shortcut can focus the main search box. */
export const searchInputRef: RefObject<HTMLInputElement | null> = { current: null };

export const IMAGERY_LABEL: Record<ImageryKind, string> = {
  observed: "Observed image",
  illustration: "Scientific illustration",
  texture: "Texture map",
  "ai-reconstruction": "AI reconstruction",
};

const REGION_LABEL: Record<Region, string> = {
  "solar-system": "Solar System",
  "stellar-neighborhood": "Stellar neighborhood",
  "milky-way": "Milky Way",
  "local-group": "Local Group",
  "local-volume": "Nearby galaxies",
  cosmological: "Distant universe",
};

/** Where the object is: its parent system/galaxy, else its region. */
export function locationOf(data: DataBundle, o: CatalogObject): string {
  const p = o.parentId ? data.byId.get(o.parentId) : undefined;
  if (o.mission) return o.mission.operator;
  return p ? p.name : REGION_LABEL[o.region];
}

/** Distance with an explicit reference point (catalog distances are heliocentric). */
export function distanceLabel(o: CatalogObject): string {
  if (o.id === "sun") return "";
  if (o.cosmo) return `z = ${o.cosmo.z < 1 ? o.cosmo.z.toFixed(3) : o.cosmo.z.toFixed(2)}`;
  if (!o.distance) return "";
  return `${formatDistance(o.distance.valueKm)} from Sun`;
}

const UNITS = [
  { name: "km", km: 1, max: 0.05 * AU_KM },
  { name: "AU", km: AU_KM, max: 0.2 * LY_KM },
  { name: "ly", km: LY_KM, max: 2e5 * LY_KM },
  { name: "million ly", km: 1e6 * LY_KM, max: Infinity },
];

export function niceScale(kmPerPx: number, targetPx = 110) {
  if (!(kmPerPx > 0) || !Number.isFinite(kmPerPx)) return null;
  const km = kmPerPx * targetPx;
  const unit = UNITS.find((u) => km < u.max)!;
  const v = km / unit.km;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = [1, 2, 5, 10].map((k) => k * p).filter((x) => x <= v).pop() ?? p;
  return { label: `${n.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${unit.name}`, px: (n * unit.km) / kmPerPx };
}
