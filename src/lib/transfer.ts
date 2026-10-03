import { GM_SUN_KM3_S2, DAY_S } from "./units";

/**
 * Idealized Hohmann transfer between circular, coplanar heliocentric orbits.
 * Educational model only: ignores eccentricity, inclination, planetary gravity,
 * launch windows from real ephemerides and finite burns.
 */
export interface HohmannResult {
  r1Km: number;
  r2Km: number;
  aKm: number;
  eTransfer: number;
  transferSeconds: number;
  transferDays: number;
  /** Speed change at departure and arrival (heliocentric, km/s). */
  dv1KmS: number;
  dv2KmS: number;
  /** Required lead angle of the target at departure (rad): target ahead of origin. */
  phaseAngleRad: number;
  originPeriodDays: number;
  targetPeriodDays: number;
  /** Time between successive alignments of this kind. */
  synodicDays: number;
}

export function hohmann(r1Km: number, r2Km: number, mu = GM_SUN_KM3_S2): HohmannResult {
  if (!(r1Km > 0 && r2Km > 0) || r1Km === r2Km) throw new Error("Orbit radii must be positive and different");
  const a = (r1Km + r2Km) / 2;
  const t = Math.PI * Math.sqrt(a ** 3 / mu);
  const v1 = Math.sqrt(mu / r1Km), v2 = Math.sqrt(mu / r2Km);
  const vp = Math.sqrt(mu * (2 / r1Km - 1 / a));
  const va = Math.sqrt(mu * (2 / r2Km - 1 / a));
  const n2 = Math.sqrt(mu / r2Km ** 3);
  const T1 = 2 * Math.PI * Math.sqrt(r1Km ** 3 / mu);
  const T2 = 2 * Math.PI * Math.sqrt(r2Km ** 3 / mu);
  return {
    r1Km,
    r2Km,
    aKm: a,
    eTransfer: Math.abs(r2Km - r1Km) / (r1Km + r2Km),
    transferSeconds: t,
    transferDays: t / DAY_S,
    dv1KmS: Math.abs(vp - v1),
    dv2KmS: Math.abs(v2 - va),
    phaseAngleRad: Math.PI - n2 * t,
    originPeriodDays: T1 / DAY_S,
    targetPeriodDays: T2 / DAY_S,
    synodicDays: 1 / Math.abs(1 / (T1 / DAY_S) - 1 / (T2 / DAY_S)),
  };
}

/** State of the idealized scenario at time t (s) after departure, angles in the orbital plane. */
export function hohmannState(h: HohmannResult, tSeconds: number, mu = GM_SUN_KM3_S2) {
  const n1 = Math.sqrt(mu / h.r1Km ** 3), n2 = Math.sqrt(mu / h.r2Km ** 3);
  const originAngle = n1 * tSeconds;
  const targetAngle = h.phaseAngleRad + n2 * tSeconds;
  // Transfer ellipse: perihelion at r1 (angle 0), aphelion at r2 (angle π) for outward transfers.
  const tt = Math.min(Math.max(tSeconds, 0), h.transferSeconds);
  const e = h.eTransfer;
  const nT = Math.sqrt(mu / h.aKm ** 3);
  const M = nT * tt;
  let E = M;
  for (let i = 0; i < 30; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const r = h.aKm * (1 - e * Math.cos(E));
  return {
    origin: { angle: originAngle, r: h.r1Km },
    target: { angle: targetAngle, r: h.r2Km },
    craft: { angle: nu, r },
  };
}
