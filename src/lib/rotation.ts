/**
 * Prime-meridian angle W = W0 + Ẇ·d (degrees, d = days from J2000.0 TDB) from the IAU WGCCRE
 * report (Archinal et al. 2018). Used only to spin textured spheres; the small periodic terms
 * are omitted, so surface orientation is approximate (well under a degree for planets).
 */
export const ROTATION: Record<string, { w0: number; rate: number }> = {
  sun: { w0: 84.176, rate: 14.1844 },
  mercury: { w0: 329.5988, rate: 6.1385108 },
  venus: { w0: 160.2, rate: -1.4813688 },
  earth: { w0: 190.147, rate: 360.9856235 },
  moon: { w0: 38.3213, rate: 13.17635815 },
  mars: { w0: 176.049863, rate: 350.891982443297 },
  jupiter: { w0: 284.95, rate: 870.536 },
  saturn: { w0: 38.9, rate: 810.7939024 },
  uranus: { w0: 203.81, rate: -501.1600928 },
  neptune: { w0: 249.978, rate: 541.1397757 },
  pluto: { w0: 302.695, rate: 56.3625225 },
};

/** Prime-meridian angle in radians, or 0 when no rotation model is known. */
export function primeMeridian(id: string, jdTdb: number): number {
  const r = ROTATION[id];
  if (!r) return 0;
  const d = jdTdb - 2_451_545.0;
  return (((r.w0 + r.rate * d) % 360) * Math.PI) / 180;
}
