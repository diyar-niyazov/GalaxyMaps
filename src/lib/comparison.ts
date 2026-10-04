import type { CatalogObject, SourceInfo } from "./types";

export type ComparisonDisplayMode = "true-scale" | "fit-both";

export interface ComparisonSize {
  object: CatalogObject;
  name: string;
  diameterKm: number;
  uncertaintyKm?: number;
  definition: string;
  note: string;
  source: SourceInfo;
}

const HORIZONS: SourceInfo = {
  id: "jpl-horizons",
  title: "NASA/JPL Horizons physical body parameters",
  url: "https://ssd.jpl.nasa.gov/horizons/",
};
const IAU: SourceInfo = {
  id: "iau-nominal-solar-radius",
  title: "IAU 2015 Resolution B3: nominal solar radius",
  url: "https://arxiv.org/abs/1510.07674",
};
const SIRIUS: SourceInfo = {
  id: "davis-2010-sirius",
  title: "Davis et al. (2010): angular diameter and radius of Sirius A",
  url: "https://arxiv.org/abs/1010.3790",
};

/** Radius uncertainty (km), transcribed from the bundled JPL Horizons physical headers.
 * These belong to the adopted mean radius, not the equatorial diameter in the fact cards.
 * Undefined means the source did not supply an uncertainty, never a claim of exactness.
 */
const AUDITED_RADII: Record<string, { error?: number; equivalent?: boolean }> = {
  mercury: { error: 0.1 }, venus: { error: 0.01 }, earth: { error: 0.02 },
  moon: { error: 0.03 }, mars: { error: 0.04 }, jupiter: { error: 6 },
  saturn: { error: 6 }, uranus: { error: 12 }, neptune: { error: 21 },
  io: {}, europa: { error: 0.3 }, ganymede: { error: 1.7 }, callisto: { error: 1.5 },
  enceladus: { error: 0.6 }, titan: { error: 2 }, triton: { error: 2.4 },
  pluto: { error: 1.6 }, charon: { error: 0.5 }, mimas: { error: 1.5 },
  tethys: { error: 1.5 }, dione: { error: 5 }, rhea: { error: 2 },
  iapetus: { error: 4 }, hyperion: { error: 8, equivalent: true },
  phobos: { equivalent: true }, deimos: { equivalent: true },
  miranda: { equivalent: true }, ariel: { equivalent: true },
  umbriel: { error: 2.8 }, titania: { error: 1.8 }, oberon: { error: 2.6 },
  proteus: { error: 8, equivalent: true },
};
const GAS_GIANTS = new Set(["jupiter", "saturn", "uranus", "neptune"]);
const NOMINAL_SOLAR_RADIUS_KM = 695_700;

/** Only physical body/stellar disks with audited, compatible radius provenance are eligible.
 * No radius is inferred from a marker, an image, luminosity, distance, or visible extent.
 */
export function comparisonSize(object: CatalogObject): ComparisonSize | null {
  if (object.id === "sirius" && object.type === "star") {
    // Davis et al. 2010, abstract: 1.713 ± 0.009 R_sun. Adopts the IAU nominal
    // solar radius for the deterministic kilometre conversion; compares Sirius A alone.
    return {
      object, name: "Sirius A", diameterKm: 2 * 1.713 * NOMINAL_SOLAR_RADIUS_KM,
      uncertaintyKm: 2 * 0.009 * NOMINAL_SOLAR_RADIUS_KM,
      definition: "Limb-darkened stellar diameter",
      note: "Primary star only, not the Sirius binary system. Radius 1.713 ± 0.009 solar radii; converted with the IAU nominal solar radius.",
      source: SIRIUS,
    };
  }
  if (!Number.isFinite(object.radiusKm) || object.radiusKm! <= 0) return null;
  if (object.id === "sun" && object.type === "star") {
    return {
      object, name: object.name, diameterKm: object.radiusKm! * 2,
      definition: "Nominal solar diameter",
      note: "IAU nominal radius of 695,700 km, an adopted reference constant rather than an exact measurement of the variable photosphere.",
      source: IAU,
    };
  }
  const audited = AUDITED_RADII[object.id];
  if (!audited || !["planet", "moon", "dwarf-planet"].includes(object.type) || !object.sourceIds.includes("jpl-horizons")) return null;
  return {
    object, name: object.name, diameterKm: object.radiusKm! * 2,
    uncertaintyKm: audited.error == null ? undefined : audited.error * 2,
    definition: audited.equivalent ? "Mean / equivalent body diameter" : "Mean body diameter",
    note: audited.equivalent
      ? "Irregular body shown as a sphere of the adopted mean/equivalent radius. For three tabulated axes, radius = cube root of their product. Shape is schematic."
      : GAS_GIANTS.has(object.id)
        ? "Twice the volume-mean radius; the outer body is defined at the 1-bar pressure level. Rings are excluded."
        : "Twice the adopted mean radius. This can differ from the equatorial diameter in the object's facts.",
    source: HORIZONS,
  };
}

export function comparisonUnavailableReason(object: CatalogObject): string {
  if (comparisonSize(object)) return "";
  if (["black-hole", "galaxy", "nebula", "star-cluster", "quasar", "supernova-remnant"].includes(object.type)) {
    return "This object's horizon or extended visible size uses a different definition from a body diameter.";
  }
  return "A verified mean body or stellar diameter is not available for this object.";
}

export function comparisonSentence(a: ComparisonSize, b: ComparisonSize): string {
  if (a.diameterKm === b.diameterKm) return `${a.name} and ${b.name} have the same adopted diameter.`;
  const [big, small] = a.diameterKm > b.diameterKm ? [a, b] : [b, a];
  const ratio = big.diameterKm / small.diameterKm;
  return `${big.name} is about ${formatRatio(ratio)} times the diameter of ${small.name}.`;
}

export function formatRatio(ratio: number): string {
  return ratio.toLocaleString("en-US", { maximumSignificantDigits: 3 });
}

/** Display precision follows the source uncertainty; exact computation retains catalog values. */
export function formatDiameter(size: ComparisonSize): string {
  const error = size.uncertaintyKm;
  if (error == null) return `≈ ${size.diameterKm.toLocaleString("en-US", size.object.id === "sun" ? { maximumFractionDigits: 0 } : { maximumSignificantDigits: 3 })} km`;
  const place = Math.floor(Math.log10(error)) - 1;
  const rounded = Math.round(size.diameterKm / 10 ** place) * 10 ** place;
  const digits = Math.min(3, Math.max(0, -place));
  const value = rounded.toLocaleString("en-US", { maximumFractionDigits: digits });
  const uncertainty = error.toLocaleString("en-US", { maximumSignificantDigits: 2 });
  return `${value} ± ${uncertainty} km`;
}

export interface ComparisonLayout {
  diameters: [number, number];
  centers: [[number, number], [number, number]];
  kmPerPixel: number | null;
  tinyIndex: 0 | 1 | null;
  insetMagnification: number | null;
  scaleBarKm: number;
  scaleBarPx: number;
}

/** All main-scene diameters use the same km/pixel in True scale, with no minimum size. */
export function comparisonLayout(aKm: number, bKm: number, width: number, height: number, mode: ComparisonDisplayMode, zoom = 1): ComparisonLayout {
  const maxKm = Math.max(aKm, bKm);
  const maxPx = Math.min(width * 0.42, height * 0.63) * zoom;
  const kmPerPixel = maxKm / maxPx;
  const diameters: [number, number] = mode === "true-scale" ? [aKm / kmPerPixel, bKm / kmPerPixel] : [maxPx, maxPx];
  const baseline = height * 0.72;
  const centers: [[number, number], [number, number]] = [
    [width * 0.26, mode === "true-scale" ? baseline - diameters[0] / 2 : height * 0.43],
    [width * 0.74, mode === "true-scale" ? baseline - diameters[1] / 2 : height * 0.43],
  ];
  const tinyIndex = mode === "true-scale" && Math.min(...diameters) < 8 ? aKm < bKm ? 0 : 1 : null;
  const power = 10 ** Math.floor(Math.log10(kmPerPixel * width * 0.22));
  const step = (kmPerPixel * width * 0.22) / power;
  const scaleBarKm = (step >= 5 ? 5 : step >= 2 ? 2 : 1) * power;
  return {
    diameters, centers, kmPerPixel: mode === "true-scale" ? kmPerPixel : null, tinyIndex,
    insetMagnification: tinyIndex == null ? null : 50 / diameters[tinyIndex],
    scaleBarKm, scaleBarPx: scaleBarKm / kmPerPixel,
  };
}

/**
 * Curated pairs stored as catalog IDs plus a short label. Dimensions and ratios always come from
 * comparisonSize(); `extreme` marks the pair that demonstrates the True-scale locator and inset.
 */
export const COMPARISON_PRESETS = [
  { id: "earth-jupiter", kind: "planet-planet", pair: ["earth", "jupiter"], title: "Earth & Jupiter", subtitle: "Our world, the giant", extreme: false },
  { id: "earth-sun", kind: "planet-star", pair: ["earth", "sun"], title: "Earth & Sun", subtitle: "Meet our nearest star", extreme: true },
  { id: "sun-sirius", kind: "star-star", pair: ["sun", "sirius"], title: "Sun & Sirius A", subtitle: "Two stellar disks", extreme: false },
  { id: "earth-moon", kind: "planet-moon", pair: ["earth", "moon"], title: "Earth & Moon", subtitle: "A familiar companion", extreme: false },
] as const;

export function suggestedComparisonId(object: CatalogObject, objects: Map<string, CatalogObject>): string | null {
  for (const id of object.id === "earth" ? ["jupiter", "moon", "sun"] : ["earth", "sun", "jupiter"]) {
    const candidate = objects.get(id);
    if (id !== object.id && candidate && comparisonSize(candidate)) return id;
  }
  return [...objects.values()].find((candidate) => candidate.id !== object.id && comparisonSize(candidate))?.id ?? null;
}
