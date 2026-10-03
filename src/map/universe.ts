/**
 * Schematic overview of the observable universe. Directions are preserved; distances are
 * compressed logarithmically so the Local Group and the most distant catalog galaxies fit in
 * one picture. This is a display mapping only; physical calculations never use it.
 */
import { LY_KM } from "../lib/units";
import { observableUniverseRadiusLy } from "../lib/cosmology";

/** Comoving radius of the observable universe (Planck 2018 flat ΛCDM), light-years. */
export const OBSERVABLE_RADIUS_LY = observableUniverseRadiusLy();
/** Inner scale of the logarithm: distances below this sit near the centre. */
const D0_LY = 1e5;

/** Display radius in [0, 1] of the bubble for a distance in light-years. */
export function logRadius(ly: number): number {
  const v = Math.log10(1 + Math.max(0, ly) / D0_LY) / Math.log10(1 + OBSERVABLE_RADIUS_LY / D0_LY);
  return Math.min(1, Math.max(0, v));
}

export const DISTANCE_BANDS_LY = [1e6, 1e7, 1e8, 1e9, 1e10];
export const bandLabel = (ly: number) => (ly >= 1e9 ? `${ly / 1e9} billion ly` : `${ly / 1e6} million ly`);

/** Map widths (km) between which the linear map cross-fades into the schematic overview. */
export const UNIVERSE_FADE_START_KM = 4e8 * LY_KM;
export const UNIVERSE_FADE_END_KM = 1.2e9 * LY_KM;

export function universeBlend(widthKm: number): number {
  const t = Math.log(widthKm / UNIVERSE_FADE_START_KM) / Math.log(UNIVERSE_FADE_END_KM / UNIVERSE_FADE_START_KM);
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}
