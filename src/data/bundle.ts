import type { Catalog, CatalogObject, Ephemeris, Vec3 } from "../lib/types";
import { buildSearchIndex, type SearchIndex } from "../lib/search";
import { positionOf } from "../lib/route";
import { hygRouteCapability, hygLabel, describeSpectralType, CONSTELLATIONS, temperatureFromBV, blackbodyRgb, rgbToHex } from "../lib/stars";
import { PC_KM } from "../lib/units";

export interface DataBundle {
  catalog: Catalog;
  eph: Ephemeris;
  /** Interleaved star columns, see catalog.stars.columns. */
  stars: Float32Array;
  starStride: number;
  starNames: Record<string, [string, string, string]>;
  byId: Map<string, CatalogObject>;
  hygIndex: Map<number, number>;
  search: SearchIndex;
}

export async function loadBundle(): Promise<DataBundle> {
  const [catalog, eph, starsBuf, starNames] = await Promise.all([
    fetch("/data/catalog.json").then((r) => { if (!r.ok) throw new Error("catalog"); return r.json() as Promise<Catalog>; }),
    fetch("/data/ephemeris.json").then((r) => { if (!r.ok) throw new Error("ephemeris"); return r.json() as Promise<Ephemeris>; }),
    fetch("/data/stars.bin").then((r) => { if (!r.ok) throw new Error("stars"); return r.arrayBuffer(); }),
    fetch("/data/star-names.json").then((r) => (r.ok ? r.json() : {})),
  ]);
  const stars = new Float32Array(starsBuf);
  const starStride = catalog.stars.columns.length;
  const byId = new Map(catalog.objects.map((o) => [o.id, o]));
  const hygIndex = new Map<number, number>();
  for (let i = 0; i < stars.length / starStride; i++) hygIndex.set(stars[i * starStride + 6], i);
  return { catalog, eph, stars, starStride, starNames, byId, hygIndex, search: buildSearchIndex(catalog.objects) };
}

export function positionAt(bundle: DataBundle, obj: CatalogObject, jdTdb: number): Vec3 | null {
  return positionOf(obj, { eph: bundle.eph, jdTdb });
}

/**
 * Create (or reuse) a lightweight catalog record for a star picked from the point cloud.
 * Only HYG data is used; routing follows the HYG distance rule.
 */
export function objectForStar(bundle: DataBundle, index: number): CatalogObject {
  const s = bundle.stars, o = index * bundle.starStride;
  const hygId = s[o + 6], hip = s[o + 7];
  const existing = [...bundle.byId.values()].find((x) => x.hygId === hygId);
  if (existing) return existing;
  const id = `hyg-${hygId}`;
  const cached = bundle.byId.get(id);
  if (cached) return cached;
  const x = s[o], y = s[o + 1], z = s[o + 2];
  const distPc = Math.hypot(x, y, z);
  const meta = bundle.starNames[String(hygId)];
  const name = meta?.[0] ?? hygLabel({ id: hygId, hip: hip || undefined });
  const desc = describeSpectralType(meta?.[1]);
  const con = meta?.[2] ? CONSTELLATIONS[meta[2]] : undefined;
  const obj: CatalogObject = {
    id,
    name,
    aliases: hip ? [`HIP ${hip}`] : [],
    type: "star",
    subtitle: [desc ?? "Star", con].filter(Boolean).join(" · "),
    region: distPc <= 300 ? "stellar-neighborhood" : "milky-way",
    position: { kind: "static", frame: "ICRF", origin: "Sun", epoch: "J2000.0 (HYG v4.4)", unit: "km", xyz: [x * PC_KM, y * PC_KM, z * PC_KM], method: "HYG Cartesian coordinates (Hipparcos parallax)" },
    distance: { valueKm: distPc * PC_KM, type: "catalog", quality: distPc <= 100 ? "approximate" : "uncertain", sourceId: "hyg-v44", note: "Uncertainty not tabulated in HYG." },
    route: hygRouteCapability(distPc),
    facts: [
      ...(meta?.[1] ? [{ label: "Spectral type", value: meta[1], sourceId: "hyg-v44" }] : []),
      { label: "Apparent magnitude (V)", value: s[o + 5].toFixed(2), sourceId: "hyg-v44" },
      { label: "Absolute magnitude", value: s[o + 3].toFixed(2), sourceId: "hyg-v44" },
      { label: "Est. surface temperature", value: `≈ ${Math.round(temperatureFromBV(s[o + 4]) / 100) * 100} K (from B−V colour)`, sourceId: "hyg-v44" },
      ...(con ? [{ label: "Constellation", value: con, sourceId: "hyg-v44" }] : []),
    ],
    hygId,
    display: { color: rgbToHex(blackbodyRgb(temperatureFromBV(s[o + 4]))), priority: 20 },
    sourceIds: ["hyg-v44"],
    featured: false,
  };
  bundle.byId.set(id, obj);
  return obj;
}
