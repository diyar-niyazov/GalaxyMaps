/** Shared, non-component helpers for the UI (kept out of component modules for Fast Refresh). */
import type { RefObject } from "react";
import type { CatalogObject, ImageRecord, ImageryKind, Region } from "../lib/types";
import type { DataBundle } from "../data/bundle";
import { formatDistance } from "../lib/format";
import { AU_KM, LY_KM } from "../lib/units";
import { TYPE_LABEL } from "../lib/search";

/** Shared so the "/" shortcut can focus the main search box. */
export const searchInputRef: RefObject<HTMLInputElement | null> = { current: null };

export const IMAGERY_LABEL: Record<ImageryKind, string> = {
  observed: "Observed image",
  illustration: "Scientific illustration",
  texture: "Texture map",
  "ai-reconstruction": "AI reconstruction",
};

const COMPOSITE = /\b(composite|mosaic|false[- ]colou?r|multi-?wavelength|combined)\b/i;

/** Observation, composite, illustration or reconstruction; composites are observed data assembled or recoloured. */
export function imageryLabel(image: ImageRecord): string {
  if (image.kind === "observed" && COMPOSITE.test(`${image.title} ${image.credit}`)) return "Composite image";
  return IMAGERY_LABEL[image.kind];
}

const REGION_LABEL: Record<Region, string> = {
  "solar-system": "Solar System",
  "stellar-neighborhood": "Stellar neighborhood",
  "milky-way": "Milky Way",
  "local-group": "Local Group",
  "local-volume": "Nearby galaxies",
  cosmological: "Distant universe",
};

export const regionLabel = (r: Region) => REGION_LABEL[r];

/** Spaceflight records share the catalog type "mission"; these are the accurate kinds people expect. */
const SPACEFLIGHT_KIND: Record<string, string> = {
  "falcon-9": "Launch vehicle",
  "falcon-heavy": "Launch vehicle",
  starship: "Launch vehicle & spacecraft",
  dragon: "Spacecraft",
  iss: "Space station",
  hubble: "Space telescope",
  chandra: "Space telescope",
  curiosity: "Rover",
  perseverance: "Rover",
  "tesla-roadster": "Payload",
};

/** Type label for display: the catalog type, refined for spaceflight records. */
export function typeLabel(o: CatalogObject): string {
  return SPACEFLIGHT_KIND[o.id] ?? TYPE_LABEL[o.type];
}

const ENTITY: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

/** Image credits come from Commons/NASA metadata; strip wiki markup and decode HTML entities. */
export function cleanCredit(text: string): string {
  return text
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITY[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

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
