/**
 * Procedural, schematic face-on Milky Way. This is a scientific illustration, not an
 * image: a four-arm logarithmic spiral (pitch ≈ 12°) plus the Local Arm, a bar inclined
 * ≈ 27° to the Sun–Galactic Center line, and an exponential disk. It is placed with the
 * Galactic Center 8.178 kpc from the Sun (GRAVITY 2019). It never defines catalog positions.
 */
import type { Vec3 } from "../lib/types";
import { GALACTIC_TO_ICRF } from "../lib/coords";
import { mulMatVec } from "../lib/vec";
import { PC_KM } from "../lib/units";

export const R0_KPC = 8.178;
/** Half-size of the texture square, kpc. */
export const HALF_SIZE_KPC = 20;

const K = Math.tan((12 * Math.PI) / 180);
interface Arm { name: string; rSun: number; k: number; strength: number; rStart: number; rEnd: number; thetaRange?: [number, number] }
/** Arm radii where each arm crosses the Sun's Galactocentric azimuth (θ = π); each arm spans rStart–rEnd kpc. */
export const ARMS: Arm[] = [
  { name: "Scutum–Centaurus Arm", rSun: 4.93, k: K, strength: 1, rStart: 3.6, rEnd: 13 },
  { name: "Sagittarius–Carina Arm", rSun: 6.9, k: K, strength: 0.6, rStart: 5.2, rEnd: 11 },
  { name: "Perseus Arm", rSun: 9.66, k: K, strength: 1, rStart: 3.6, rEnd: 14 },
  { name: "Outer Arm", rSun: 13.5, k: K, strength: 0.5, rStart: 7.5, rEnd: 16 },
  { name: "Local Arm (Orion Spur)", rSun: 8.3, k: Math.tan((11.4 * Math.PI) / 180), strength: 0.55, rStart: 0, rEnd: 99, thetaRange: [Math.PI - 0.45, Math.PI + 0.55] },
];
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const BAR_ANGLE = Math.PI - (27 * Math.PI) / 180;

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function armField(r: number, theta: number, arm: Arm) {
  if (r < 2.2) return { v: 0, dr: 99 };
  if (arm.thetaRange) {
    let t = theta;
    while (t < arm.thetaRange[0] - Math.PI) t += 2 * Math.PI;
    while (t > arm.thetaRange[1] + Math.PI) t -= 2 * Math.PI;
    if (t < arm.thetaRange[0] || t > arm.thetaRange[1]) return { v: 0, dr: 99 };
    const ra = arm.rSun * Math.exp(arm.k * (t - Math.PI));
    const dr = r - ra;
    const edge = Math.min(t - arm.thetaRange[0], arm.thetaRange[1] - t);
    return { v: Math.exp(-((dr / 0.35) ** 2)) * Math.min(1, edge / 0.15), dr };
  }
  // Only the windings whose radius lies inside the arm's span, so arms don't repeat every turn.
  const n0 = Math.round((Math.log(r / arm.rSun) / arm.k - (theta - Math.PI)) / (2 * Math.PI));
  let best = { v: 0, dr: 99 };
  for (const n of [n0 - 1, n0, n0 + 1]) {
    const ra = arm.rSun * Math.exp(arm.k * (theta - Math.PI + 2 * Math.PI * n));
    const fin = smooth((ra - arm.rStart) / (arm.rStart * 0.3));
    const fout = smooth((arm.rEnd - ra) / (arm.rEnd * 0.3));
    if (fin * fout <= 0) continue;
    const dr = r - ra;
    if (Math.abs(dr) < Math.abs(best.dr)) {
      const w = 0.42 + 0.055 * ra;
      best = { v: Math.exp(-((dr / w) ** 2)) * fin * fout, dr };
    }
  }
  return best;
}

export type MilkyWayStyle = "realistic" | "atlas";

export function renderMilkyWay(style: MilkyWayStyle, N = 1024): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(N, N);
  const px = img.data;
  for (let j = 0; j < N; j++) {
    const Y = (1 - (2 * (j + 0.5)) / N) * HALF_SIZE_KPC;
    for (let i = 0; i < N; i++) {
      const X = ((2 * (i + 0.5)) / N - 1) * HALF_SIZE_KPC;
      const r = Math.hypot(X, Y);
      const theta = Math.atan2(Y, X);
      const disk = Math.exp(-r / 2.6) * Math.exp(-Math.max(0, r - 14) / 1.5);
      let arms = 0, dust = 0;
      for (const a of ARMS) {
        const f = armField(r, theta, a);
        arms = Math.max(arms, f.v * a.strength);
        dust = Math.max(dust, Math.exp(-(((f.dr + 0.38) / 0.13) ** 2)) * (f.v > 0.01 || Math.abs(f.dr) < 0.8 ? 1 : 0) * a.strength);
      }
      // Bar and bulge in a frame aligned with the bar.
      const c = Math.cos(BAR_ANGLE), s = Math.sin(BAR_ANGLE);
      const bx = X * c + Y * s, by = -X * s + Y * c;
      const bar = Math.exp(-((bx / 4.4) ** 2 + (by / 1.05) ** 2) * 1.8);
      const bulge = Math.exp(-((r / 0.8) ** 2));
      const o = (j * N + i) * 4;
      if (style === "realistic") {
        const n = (0.45 + 0.9 * valueNoise(X * 0.55 + 7, Y * 0.55 + 3)) * (0.65 + 0.7 * (0.6 * valueNoise(X * 2.2, Y * 2.2) + 0.4 * valueNoise(X * 6.1, Y * 6.1)));
        const armL = arms * n * (1 - 0.35 * dust);
        const warm = Math.min(1, 1.6 * bulge + 0.9 * bar + 0.35 * disk);
        const lum = Math.min(1, 0.34 * disk + 0.62 * armL + 0.6 * bar + 0.9 * bulge);
        const cool = armL / (armL + warm + 1e-6);
        px[o] = 255 * Math.min(1, lum * (0.78 + 0.22 * (1 - cool)));
        px[o + 1] = 255 * Math.min(1, lum * (0.8 + 0.08 * (1 - cool)));
        px[o + 2] = 255 * Math.min(1, lum * (0.72 + 0.28 * cool));
        px[o + 3] = 255 * Math.min(1, lum * 1.15);
      } else {
        const a = Math.min(1, 0.22 * disk / 0.4 + 0.55 * arms + 0.7 * bar + 0.9 * bulge);
        const arm = arms / (arms + bar + bulge + 0.05);
        px[o] = 168 + 40 * (1 - arm);
        px[o + 1] = 160 + 30 * (1 - arm);
        px[o + 2] = 222;
        px[o + 3] = 255 * a * 0.85;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Galactocentric plane coordinates (kpc, X toward Sun→GC direction) to heliocentric ICRF km. */
export function galactocentricToIcrf(X: number, Y: number): Vec3 {
  const g: Vec3 = [(X + R0_KPC) * 1000 * PC_KM, Y * 1000 * PC_KM, 0];
  return mulMatVec(GALACTIC_TO_ICRF, g);
}

/** Label anchors along each arm (for the atlas layer). */
export function armLabelAnchors(): { name: string; pos: Vec3 }[] {
  const at: Record<string, number> = {
    "Scutum–Centaurus Arm": Math.PI * 0.35,
    "Sagittarius–Carina Arm": Math.PI * 0.8,
    "Perseus Arm": Math.PI * 1.25,
    "Outer Arm": Math.PI * 0.75,
    "Local Arm (Orion Spur)": Math.PI + 0.3,
  };
  return ARMS.map((a) => {
    const th = at[a.name];
    let r = a.rSun * Math.exp(a.k * (th - Math.PI));
    if (!a.thetaRange) while (r < 4) r *= Math.exp(a.k * 2 * Math.PI);
    return { name: a.name, pos: galactocentricToIcrf(r * Math.cos(th), r * Math.sin(th)) };
  });
}
