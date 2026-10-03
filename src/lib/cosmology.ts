/**
 * Flat ΛCDM distances with Planck 2018 parameters (Planck Collaboration 2020, A&A 641, A6, TT,TE,EE+lowE+lensing+BAO).
 * Used only to describe redshift-only objects and to place them in the schematic universe overview;
 * these distances never enter a constant-speed route.
 */
import { LY_KM, PC_KM } from "./units";

export const PLANCK18 = { H0: 67.66, Om: 0.3111, Or: 9.1e-5, label: "Flat ΛCDM, Planck 2018 (H₀ = 67.66 km/s/Mpc, Ωm = 0.311)" } as const;
const C_KM_S = 299_792.458;
const MPC_LY = (1e6 * PC_KM) / LY_KM;
/** Hubble time 1/H₀ in years. */
const HUBBLE_TIME_YR = (1e6 * PC_KM) / PLANCK18.H0 / (365.25 * 86_400);

const E = (z: number) => {
  const a = 1 + z;
  return Math.sqrt(PLANCK18.Or * a ** 4 + PLANCK18.Om * a ** 3 + (1 - PLANCK18.Om - PLANCK18.Or));
};

/** Simpson integration of f over [0, z] in log(1+z) so high redshifts stay accurate. */
function integrate(f: (z: number) => number, z: number, n = 2000) {
  const u1 = Math.log1p(z);
  const h = u1 / n;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const u = i * h;
    const zz = Math.expm1(u);
    const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
    s += w * f(zz) * (1 + zz);
  }
  return (s * h) / 3;
}

/** Line-of-sight comoving distance today, in light-years. */
export function comovingDistanceLy(z: number): number {
  if (!(z > 0)) return 0;
  return ((C_KM_S / PLANCK18.H0) * integrate((x) => 1 / E(x), z)) * MPC_LY;
}

/** Light-travel (lookback) time, in years. */
export function lightTravelTimeYears(z: number): number {
  if (!(z > 0)) return 0;
  return HUBBLE_TIME_YR * integrate((x) => 1 / ((1 + x) * E(x)), z);
}

/** Comoving radius of the observable universe (particle horizon), in light-years. */
export function observableUniverseRadiusLy(): number {
  return comovingDistanceLy(1e7);
}
