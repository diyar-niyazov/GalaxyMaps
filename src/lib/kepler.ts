import type { Vec3 } from "./types";
import { mulMatVec, mulMat, rotZ, rotX } from "./vec";

const DEG = Math.PI / 180;

/** Solve Kepler's equation M = E − e·sin E for elliptical orbits (e < 1). */
export function solveKepler(meanAnomalyRad: number, e: number): number {
  if (e < 0 || e >= 1) throw new Error("solveKepler supports 0 ≤ e < 1");
  const M = ((meanAnomalyRad % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let i = 0; i < 50; i++) {
    const f = E - e * Math.sin(E) - M;
    const dE = f / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-14) break;
  }
  return E;
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
}

/** Rotation from the perifocal frame to the reference frame: Rz(Ω)·Rx(i)·Rz(ω). */
function perifocalToFrame(el: KeplerElements) {
  return mulMat(mulMat(rotZ(el.omDeg * DEG), rotX(el.iDeg * DEG)), rotZ(el.wDeg * DEG));
}

/** Position (km) relative to the focus at time jdTdb by two-body propagation. */
export function keplerPosition(el: KeplerElements, jdTdb: number): Vec3 {
  const dt = (jdTdb - el.epochJdTdb) * 86_400;
  const M = (el.maDeg + el.nDegS * dt) * DEG;
  const E = solveKepler(M, el.e);
  const xp = el.aKm * (Math.cos(E) - el.e);
  const yp = el.aKm * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  return mulMatVec(perifocalToFrame(el), [xp, yp, 0]);
}

/** Sampled closed orbit (elliptical) as points relative to the focus, km. */
export function orbitPolyline(el: Omit<KeplerElements, "maDeg" | "nDegS" | "epochJdTdb">, segments = 256): Vec3[] {
  const R = perifocalToFrame({ ...el, maDeg: 0, nDegS: 0, epochJdTdb: 0 });
  const pts: Vec3[] = [];
  const b = el.aKm * Math.sqrt(1 - el.e * el.e);
  for (let k = 0; k <= segments; k++) {
    // Sample in eccentric anomaly, denser near perihelion for eccentric orbits.
    const E = (k / segments) * 2 * Math.PI;
    pts.push(mulMatVec(R, [el.aKm * (Math.cos(E) - el.e), b * Math.sin(E), 0]));
  }
  return pts;
}
