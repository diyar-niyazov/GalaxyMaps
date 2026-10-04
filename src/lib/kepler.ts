import type { Vec3 } from "./types";
import { mulMatVec, mulMat, rotZ, rotX } from "./vec";

const DEG = Math.PI / 180;
const ELLIPSE_MAX_E = 1 - 1e-8;

/** Solve Kepler's equation M = E − e·sin E for elliptical orbits (0 ≤ e < 1). */
export function solveKepler(meanAnomalyRad: number, e: number): number {
  const ecc = Number.isFinite(e) ? Math.min(ELLIPSE_MAX_E, Math.max(0, e)) : 0;
  const M = ((meanAnomalyRad % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  let E = ecc < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let i = 0; i < 50; i++) {
    const f = E - ecc * Math.sin(E) - M;
    const dE = f / (1 - ecc * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-14) break;
  }
  return E;
}

/** Solve M = e sinh H − H for hyperbolic orbits (e > 1). Mean anomaly is not 2π-periodic. */
export function solveKeplerHyperbolic(meanAnomalyRad: number, e: number): number {
  const ecc = Math.max(e, 1 + 1e-8);
  const M = Number.isFinite(meanAnomalyRad) ? meanAnomalyRad : 0;
  let H = Math.sign(M || 1) * Math.log(2 * Math.abs(M) / ecc + 1.8);
  if (!Number.isFinite(H)) H = Math.sign(M || 1);
  for (let i = 0; i < 50; i++) {
    const f = ecc * Math.sinh(H) - H - M;
    const dH = f / Math.max(ecc * Math.cosh(H) - 1, 1e-12);
    H -= dH;
    if (Math.abs(dH) < 1e-12) break;
  }
  return H;
}

/** Barker's equation M = D + D³/3 for a parabola (e = 1). */
export function solveBarker(meanAnomalyRad: number): number {
  const M = Number.isFinite(meanAnomalyRad) ? meanAnomalyRad : 0;
  let D = Math.sign(M || 1) * Math.cbrt(3 * Math.abs(M));
  for (let i = 0; i < 30; i++) {
    const f = D + D ** 3 / 3 - M;
    D -= f / Math.max(1 + D * D, 1e-12);
    if (Math.abs(f) < 1e-12) break;
  }
  return D;
}

export interface KeplerElements {
  aKm: number;
  e: number;
  iDeg: number;
  omDeg: number;
  wDeg: number;
  maDeg: number;
  nDegS: number;
  epochJdTdb: number;
  qKm?: number;
}

/** Rotation from the perifocal frame to the reference frame: Rz(Ω)·Rx(i)·Rz(ω). */
function perifocalToFrame(el: KeplerElements) {
  return mulMat(mulMat(rotZ(el.omDeg * DEG), rotX(el.iDeg * DEG)), rotZ(el.wDeg * DEG));
}

/** Position (km) relative to the focus at time jdTdb by two-body propagation (ellipse, parabola or hyperbola). */
export function keplerPosition(el: KeplerElements, jdTdb: number): Vec3 {
  const dt = (jdTdb - el.epochJdTdb) * 86_400;
  const M = (el.maDeg + el.nDegS * dt) * DEG;
  const e = Number.isFinite(el.e) ? el.e : 0;
  let perifocal: Vec3;
  if (e < ELLIPSE_MAX_E && el.aKm > 0) {
    const E = solveKepler(M, Math.max(0, e));
    perifocal = [el.aKm * (Math.cos(E) - e), el.aKm * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E), 0];
  } else if (e > 1 + 1e-8 || el.aKm < 0) {
    const a = el.aKm < 0 ? -el.aKm : el.qKm && e > 1 ? el.qKm / (e - 1) : Math.abs(el.aKm);
    const H = solveKeplerHyperbolic(M, Math.max(e, 1 + 1e-8));
    perifocal = [a * (e - Math.cosh(H)), a * Math.sqrt(Math.max(0, e * e - 1)) * Math.sinh(H), 0];
  } else {
    const q = el.qKm && el.qKm > 0 ? el.qKm : Math.abs(el.aKm) * Math.max(1e-9, 1 - e);
    const D = solveBarker(M);
    perifocal = [q * (1 - D * D), 2 * q * D, 0];
  }
  if (!perifocal.every(Number.isFinite)) return mulMatVec(perifocalToFrame(el), [Math.abs(el.qKm || el.aKm) || 1, 0, 0]);
  return mulMatVec(perifocalToFrame(el), perifocal);
}

/** Sampled closed orbit (elliptical) as points relative to the focus, km. */
export function orbitPolyline(el: Omit<KeplerElements, "maDeg" | "nDegS" | "epochJdTdb">, segments = 256): Vec3[] {
  if (!(el.e < ELLIPSE_MAX_E) || !(el.aKm > 0)) return [];
  const R = perifocalToFrame({ ...el, maDeg: 0, nDegS: 0, epochJdTdb: 0 });
  const pts: Vec3[] = [];
  const b = el.aKm * Math.sqrt(Math.max(0, 1 - el.e * el.e));
  for (let k = 0; k <= segments; k++) {
    // Sample in eccentric anomaly, denser near perihelion for eccentric orbits.
    const E = (k / segments) * 2 * Math.PI;
    pts.push(mulMatVec(R, [el.aKm * (Math.cos(E) - el.e), b * Math.sin(E), 0]));
  }
  return pts;
}
