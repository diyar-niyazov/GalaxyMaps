/**
 * Volumetric particle models for nebulae, star clusters and supernova remnants, in the same unit
 * frame and size convention as the galaxy model (radius 0.5; x = major axis, y = minor axis,
 * z = line of sight; star sizes < 12, haze sizes larger with low gain). Shapes are generic for the
 * object class, stretched to the catalogued axis ratio; they are not reconstructions of the
 * individual object.
 */
import type { CatalogObject } from "../lib/types";
import { hash, rng, type GalaxyParticles } from "../map/galaxyModel";

type Color = [number, number, number];
const H_ALPHA: Color = [1, 0.36, 0.46];
const OIII: Color = [0.34, 0.86, 0.84];
const BLUE: Color = [0.58, 0.72, 1];
const HOT: Color = [0.78, 0.86, 1];
const WARM: Color = [1, 0.86, 0.66];
const EMBER: Color = [1, 0.62, 0.36];

export type CloudKind = "emission" | "reflection" | "planetary" | "dark" | "remnant" | "globular" | "open";

export function cloudKind(o: CatalogObject): CloudKind | null {
  if (o.type === "supernova-remnant" || o.category === "cr-snr") return "remnant";
  if (o.type === "star-cluster") return o.category === "cl-globular" ? "globular" : "open";
  if (o.type !== "nebula") return null;
  if (o.category === "nb-planetary") return "planetary";
  if (o.category === "nb-dark") return "dark";
  if (o.category === "nb-reflection") return "reflection";
  return "emission";
}

export function buildCloudParticles(o: CatalogObject, kind: CloudKind, count: number): GalaxyParticles {
  const r = rng(hash(o.id));
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-9))) * Math.cos(2 * Math.PI * r());
  const q = Math.min(1, Math.max(0.3, o.display.axisRatio ?? 0.85));
  const ax: Color = [1, q, (1 + q) / 2];
  const pos: number[] = [], col: number[] = [], size: number[] = [];
  const dPos: number[] = [], dSize: number[] = [];
  const mix = (a: Color, b: Color, t: number): Color => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const push = (x: number, y: number, z: number, c: Color, s: number, gain: number) => {
    if (x * x + y * y + z * z > 0.25) return;
    const j = 0.85 + r() * 0.3;
    pos.push(x * ax[0], y * ax[1], z * ax[2]);
    col.push(c[0] * j * gain, c[1] * j * gain, c[2] * j * gain);
    size.push(s);
  };
  const star = () => 1.2 + r() * r() * 3;
  const dir = () => {
    const z = 2 * r() - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    return [Math.cos(a) * s, Math.sin(a) * s, z] as const;
  };
  /** Lumpy cloud: gas gathered around a random walk of clumps, so no two nebulae look alike. */
  const clumps = Array.from({ length: 18 + (hash(o.id) % 14) }, () => {
    const [x, y, z] = dir(), d = Math.pow(r(), 0.7) * 0.32;
    return { x: x * d, y: y * d, z: z * d * 0.7, s: 0.04 + r() * 0.1 };
  });
  const inClump = (spread: number): [number, number, number] => {
    const c = clumps[Math.floor(r() * clumps.length)];
    return [c.x + gauss() * c.s * spread, c.y + gauss() * c.s * spread, c.z + gauss() * c.s * spread];
  };

  if (kind === "globular" || kind === "open") {
    // Plummer sphere (globular) or a loose Gaussian swarm (open cluster / association).
    const n = kind === "globular" ? count : Math.round(count * 0.12);
    for (let i = 0; i < n; i++) {
      let x: number, y: number, z: number;
      if (kind === "globular") {
        const rad = 0.06 / Math.sqrt(Math.pow(Math.max(r(), 1e-6), -2 / 3) - 1);
        [x, y, z] = dir().map((v) => v * rad) as [number, number, number];
      } else [x, y, z] = [gauss() * 0.16, gauss() * 0.16, gauss() * 0.16];
      const c = kind === "globular" ? mix(WARM, HOT, r() * 0.4) : mix(HOT, WARM, r() * r() * 0.6);
      push(x, y, z, c, kind === "globular" ? star() : star() * 1.6, kind === "globular" ? 0.6 : 1.1);
    }
    if (kind === "globular") for (let i = 0; i < count * 0.04; i++) push(gauss() * 0.07, gauss() * 0.07, gauss() * 0.07, WARM, 40 + r() * 40, 0.02);
  } else if (kind === "planetary" || kind === "remnant") {
    // A thin, wrinkled shell; planetaries glow teal inside and red outside, remnants in filaments.
    const lobes = 1 + (hash(o.id) % 3);
    const ripple = (x: number, y: number, z: number) => 1 + 0.12 * Math.sin(x * 7 + lobes) * Math.cos(y * 5) + 0.08 * Math.sin(z * 9);
    for (let i = 0; i < count; i++) {
      const [x, y, z] = dir();
      const shell = kind === "planetary" ? 0.3 + gauss() * 0.04 : 0.42 + gauss() * 0.025;
      const rad = shell * ripple(x, y, z) * (kind === "planetary" ? 1 + 0.35 * x * x * (lobes > 1 ? 1 : 0) : 1);
      const t = Math.min(1, Math.max(0, (rad - 0.22) / 0.2));
      const c = kind === "planetary" ? mix(OIII, H_ALPHA, t) : r() < 0.6 ? mix(EMBER, H_ALPHA, r()) : OIII;
      const haze = r() < 0.35;
      push(x * rad, y * rad, z * rad, c, haze ? 18 + r() * 30 : star(), haze ? 0.05 : 0.5);
    }
    if (kind === "planetary") push(0, 0, 0, HOT, 9, 2);
    else for (let i = 0; i < count * 0.1; i++) push(gauss() * 0.08, gauss() * 0.08, gauss() * 0.08, OIII, 24 + r() * 30, 0.02);
  } else if (kind === "dark") {
    // Absorbing dust only: it dims the stars and glow behind it.
    for (let i = 0; i < count * 0.25; i++) {
      const [x, y, z] = inClump(1.6);
      if (x * x + y * y + z * z > 0.25) continue;
      dPos.push(x * ax[0], y * ax[1], z * ax[2]);
      dSize.push(40 + r() * 60);
    }
  } else {
    // Emission and reflection nebulae: glowing gas in clumps, ionised hotter near the centre,
    // threaded with dust lanes and young stars.
    const reflection = kind === "reflection";
    for (let i = 0; i < count * 0.8; i++) {
      const [x, y, z] = inClump(1);
      const t = Math.min(1, Math.hypot(x, y, z) / 0.4);
      const c = reflection ? mix(BLUE, HOT, r() * 0.4) : r() < 0.25 ? mix(OIII, H_ALPHA, t) : mix(H_ALPHA, EMBER, r() * 0.3);
      const haze = r() < 0.55;
      push(x, y, z, c, haze ? 26 + r() * 50 : star() * 0.9, haze ? 0.04 : 0.35);
    }
    for (let i = 0; i < count * 0.02; i++) {
      const [x, y, z] = inClump(0.6);
      push(x, y, z, HOT, 2.5 + r() * 3.5, 1.4);
    }
    for (let i = 0; i < count * 0.08; i++) {
      const [x, y, z] = inClump(1.3);
      if (x * x + y * y + z * z > 0.25) continue;
      dPos.push(x * ax[0], y * ax[1], z * ax[2]);
      dSize.push(14 + r() * 30);
    }
  }

  // Shuffle so any drawRange prefix is a fair level of detail.
  const n = size.length, order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const positions = new Float32Array(n * 3), colors = new Float32Array(n * 3), sizes = new Float32Array(n);
  order.forEach((src, dst) => {
    for (let c = 0; c < 3; c++) { positions[dst * 3 + c] = pos[src * 3 + c]; colors[dst * 3 + c] = col[src * 3 + c]; }
    sizes[dst] = size[src];
  });
  return {
    light: { positions, colors, sizes, count: n },
    dust: { positions: new Float32Array(dPos), sizes: new Float32Array(dSize), count: dSize.length },
  };
}
