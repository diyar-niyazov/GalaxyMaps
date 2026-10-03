import type { Vec3 } from "./types";
import { type Mat3, mulMatVec, transpose, rotX } from "./vec";

const DEG = Math.PI / 180;

/** Mean obliquity of the ecliptic at J2000.0, IAU 2006: 84381.406 arcsec. */
export const OBLIQUITY_J2000_RAD = (84_381.406 / 3600) * DEG;

/**
 * ICRF (equatorial) → ecliptic J2000. Rotation about +X by the obliquity.
 * v_ecl = M · v_icrf.
 */
export const ICRF_TO_ECLIPTIC: Mat3 = rotX(-OBLIQUITY_J2000_RAD);

/**
 * ICRS → Galactic rotation matrix (Hipparcos/ESA 1997, Vol. 1 §1.5.3), rows are the
 * Galactic X (toward l=0,b=0), Y (l=90°) and Z (North Galactic Pole) axes in ICRS.
 */
export const ICRF_TO_GALACTIC: Mat3 = [
  -0.0548755604162154, -0.8734370902348850, -0.4838350155487132,
  0.4941094278755837, -0.4448296299600112, 0.7469822444972189,
  -0.8676661490190047, -0.1980763734312015, 0.4559837761750669,
];
export const GALACTIC_TO_ICRF: Mat3 = transpose(ICRF_TO_GALACTIC);

/** Unit vector for RA/Dec (degrees) in the ICRF frame. */
export function unitFromRaDec(raDeg: number, decDeg: number): Vec3 {
  const ra = raDeg * DEG, dec = decDeg * DEG;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

/**
 * Cartesian position from RA/Dec plus a distance. RA/Dec alone do not give a 3D
 * position; callers must supply a vetted distance.
 */
export function cartesianFromRaDecDistance(raDeg: number, decDeg: number, distance: number): Vec3 {
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new Error("A positive, finite distance is required for a 3D position");
  }
  const u = unitFromRaDec(raDeg, decDeg);
  return [u[0] * distance, u[1] * distance, u[2] * distance];
}

export function raDecFromVector(v: Vec3): { raDeg: number; decDeg: number } {
  const r = Math.hypot(v[0], v[1], v[2]);
  let ra = Math.atan2(v[1], v[0]) / DEG;
  if (ra < 0) ra += 360;
  return { raDeg: ra, decDeg: Math.asin(v[2] / r) / DEG };
}

export function galacticFromIcrf(v: Vec3): { lDeg: number; bDeg: number } {
  const g = mulMatVec(ICRF_TO_GALACTIC, v);
  const r = Math.hypot(g[0], g[1], g[2]);
  let l = Math.atan2(g[1], g[0]) / DEG;
  if (l < 0) l += 360;
  return { lDeg: l, bDeg: Math.asin(g[2] / r) / DEG };
}

/** Distance in parsecs from a parallax in milliarcseconds (only valid for significant parallaxes). */
export function parallaxToParsec(parallaxMas: number): number {
  if (!(parallaxMas > 0)) throw new Error("Parallax must be positive");
  return 1000 / parallaxMas;
}

export type ParallaxAssessment =
  | { usable: true; distancePc: number; plusPc: number; minusPc: number; relError: number; quality: "precise" | "good" | "approximate" }
  | { usable: false; reason: string };

/**
 * Decide whether a parallax can be inverted into a distance. Inverting a parallax is only
 * reasonable when the fractional error is small; we require σϖ/ϖ ≤ 20%.
 */
export function assessParallax(parallaxMas: number | null | undefined, errorMas: number | null | undefined): ParallaxAssessment {
  if (parallaxMas == null || !Number.isFinite(parallaxMas)) return { usable: false, reason: "No parallax measurement" };
  if (parallaxMas <= 0) return { usable: false, reason: "Non-positive parallax (distance indeterminate)" };
  if (errorMas == null || !Number.isFinite(errorMas) || errorMas <= 0)
    return { usable: false, reason: "Parallax has no reported uncertainty" };
  const rel = errorMas / parallaxMas;
  if (rel > 0.2) return { usable: false, reason: `Parallax uncertainty is ${(rel * 100).toFixed(0)}%, too large to invert reliably` };
  const d = 1000 / parallaxMas;
  return {
    usable: true,
    distancePc: d,
    plusPc: 1000 / (parallaxMas - errorMas) - d,
    minusPc: d - 1000 / (parallaxMas + errorMas),
    relError: rel,
    quality: rel <= 0.01 ? "precise" : rel <= 0.05 ? "good" : "approximate",
  };
}

/** HYG uses dist ≥ 100000 pc as a sentinel for missing/dubious parallaxes. */
export const HYG_DISTANCE_SENTINEL_PC = 100_000;

export function isValidHygDistance(distPc: number | null | undefined): distPc is number {
  return distPc != null && Number.isFinite(distPc) && distPc > 0 && distPc < HYG_DISTANCE_SENTINEL_PC;
}
