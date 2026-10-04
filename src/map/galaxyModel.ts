/**
 * Parametric 2.5D galaxy model: layered star, haze and dust particles generated from the catalog
 * morphology code. Positions are in a unit frame (disc radius 0.5, x/y in the disc plane, z along
 * the disc normal) so one buffer serves every display size. The shapes are generic for the
 * morphology class; they are not reconstructions of any individual galaxy.
 */
import type { CatalogObject } from "../lib/types";
import { galaxyKind, type GalaxyKind } from "./glyphs";

export interface GalaxyParams {
  kind: GalaxyKind;
  /** Hubble stage 0 (S0/Sa) … 5 (Sm); drives bulge size, arm pitch and colour. */
  stage: number;
  arms: number;
  pitchDeg: number;
  /** Bar half-length as a fraction of the disc radius (0 = no bar). */
  bar: number;
  /** Bulge radius as a fraction of the disc radius. */
  bulge: number;
  /** Disc half-thickness as a fraction of the disc radius. */
  thickness: number;
  /** Axes (x, y, z) relative to the major axis: ellipsoid shape, or the flattening of irregulars. */
  axes: [number, number, number];
  /** 0 = blue, star-forming … 1 = old, red stellar population. */
  warmth: number;
  /** Star-forming clumps (irregulars and Magellanic spirals). */
  clumps: number;
  /** Bar/bulge displacement from the disc centre as a fraction of the radius (Magellanic types). */
  offset: number;
  rotation: number;
  seed: number;
}

export interface GalaxyParticles {
  /** Additive light: stars, H II knots and diffuse haze, shuffled so any prefix is a fair sample. */
  light: { positions: Float32Array; colors: Float32Array; sizes: Float32Array; count: number };
  /** Absorbing dust drawn over the light (disc galaxies with arms). */
  dust: { positions: Float32Array; sizes: Float32Array; count: number };
}

const STAGES: Record<string, number> = { "0": 0, a: 1, ab: 1.5, b: 2, bc: 2.5, c: 3, cd: 3.5, d: 4, dm: 4.5, m: 5 };

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function galaxyParams(o: CatalogObject): GalaxyParams {
  const kind = galaxyKind(o);
  const code = (o.display.morphology ?? "").replace(/\(.*?\)|[\s_?]|pec|x$/g, "");
  const seed = hash(o.id);
  const q = clamp(o.display.axisRatio ?? 0.8, 0.2, 1);
  const spiral = /^S(AB|A|B)?(0|ab|a|bc|b|cd|c|dm|d|m)?/.exec(code);
  const stage = spiral?.[2] != null ? STAGES[spiral[2]] : kind === "irregular" ? 5 : kind === "lenticular" ? 0 : 2.5;
  const magellanic = stage >= 4.5;
  const base: GalaxyParams = {
    kind, stage, seed, rotation: (seed % 6283) / 1000,
    arms: magellanic ? 1 : 2, pitchDeg: 11 + stage * 3.5, bar: 0, bulge: clamp(0.3 - stage * 0.05, 0.05, 0.3),
    thickness: 0.04, axes: [1, 1, 1], warmth: clamp(0.78 - stage * 0.11, 0.15, 0.8),
    clumps: magellanic ? 6 + (seed % 4) : 0, offset: magellanic ? 0.14 : 0,
  };
  if (kind === "barred") return { ...base, bar: clamp(0.34 - stage * 0.03, 0.16, 0.34) * (/^SAB/.test(code) ? 0.65 : 1) };
  if (kind === "lenticular") return { ...base, arms: 0, bulge: 0.34, thickness: 0.06, warmth: 0.85 };
  if (kind === "elliptical") {
    const e = /E(\d)/.exec(code);
    const b = e ? 1 - Number(e[1]) / 10 : q;
    const dwarf = /^d/.test(code) || o.category === "gx-dwarf";
    // Triaxial: the unseen depth axis sits between the visible major and minor axes.
    return { ...base, arms: 0, bulge: 1, axes: [1, b, (1 + b) / 2], warmth: dwarf ? 0.7 : 0.92, thickness: 0, clumps: 0, offset: 0 };
  }
  if (kind === "irregular") return { ...base, arms: 0, bulge: 0.05, thickness: 0.14, warmth: 0.18, clumps: 6 + (seed % 5), axes: [1, q, 1], offset: 0.1 };
  return base;
}

/** Particles drawn for a galaxy `extPx` pixels across: a fair prefix of the shuffled buffer. */
export function particleBudget(extPx: number, max: number) {
  return Math.round(max * clamp(0.22 + (0.78 * (extPx - 90)) / 1100, 0.22, 1));
}

/** Particle layer opacity: 0 while the flat impostor sprite is enough, 1 once the galaxy is large. */
export function particleBlend(extPx: number) {
  const t = clamp((extPx - 90) / 170, 0, 1);
  return t * t * (3 - 2 * t);
}

type Color = [number, number, number];
const OLD: Color = [1, 0.84, 0.64];
const DISC: Color = [0.95, 0.9, 0.84];
const YOUNG: Color = [0.62, 0.74, 1];
const HII: Color = [1, 0.52, 0.72];

export function buildGalaxyParticles(p: GalaxyParams, count: number): GalaxyParticles {
  const r = rng(p.seed);
  const gauss = () => {
    const u = Math.max(r(), 1e-9), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const pos: number[] = [], col: number[] = [], size: number[] = [];
  const dPos: number[] = [], dSize: number[] = [];
  const mix = (a: Color, b: Color, t: number): Color => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const warmTint = mix(YOUNG, OLD, p.warmth);
  const push = (x: number, y: number, z: number, c: Color, s: number, gain = 1) => {
    const j = 0.85 + r() * 0.3;
    pos.push(x, y, z);
    col.push(c[0] * j * gain, c[1] * j * gain, c[2] * j * gain);
    size.push(s);
  };
  const star = () => 1 + r() * r() * 2.6;
  const haze = () => 30 + r() * 50;
  const R = 0.5;
  const hazeN = Math.round(count * 0.12);
  const starN = count - hazeN;

  /** Radius ≤ R from a concentrated profile, resampled rather than clamped so no rim forms. */
  const radial = (sample: () => number) => {
    for (let i = 0; i < 12; i++) {
      const v = sample();
      if (v <= R) return v;
    }
    return r() * R;
  };
  /**
   * Point in a centrally concentrated ellipsoid. `concentration` 1 is exponential; higher values
   * approach de Vaucouleurs, which saturates under additive blending, so whole ellipticals use a
   * display-stretched, flatter profile.
   */
  const spheroid = (scale: number, ax: [number, number, number], concentration = 1.7): Color => {
    const rad = radial(() => scale * Math.pow(-Math.log(1 - r() * 0.999), concentration) * 0.16);
    const z = 2 * r() - 1, phi = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    return [Math.cos(phi) * s * rad * ax[0], Math.sin(phi) * s * rad * ax[1], z * rad * ax[2]];
  };
  /** Exponential disc radius with scale length h (fraction of R). */
  const discRadius = (h: number) => radial(() => -Math.log(1 - r() * 0.9999) * h * R);

  const centres = Array.from({ length: p.clumps }, () => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.3;
    return { x: Math.cos(a) * d + p.offset * R * 0.5, y: Math.sin(a) * d * p.axes[1], rad: 0.03 + r() * 0.07, w: 0.4 + r() };
  });
  const pick = () => {
    let t = r() * centres.reduce((s, c) => s + c.w, 0);
    for (const c of centres) if ((t -= c.w) <= 0) return c;
    return centres[0];
  };
  const clump = (spread: number, zScale: number) => {
    const c = pick();
    return [c.x + gauss() * c.rad * spread, c.y + gauss() * c.rad * spread, gauss() * zScale] as const;
  };

  if (p.kind === "elliptical") {
    for (let i = 0; i < starN; i++) {
      const [x, y, z] = spheroid(R * 1.8, p.axes, r() < 0.15 ? 1.8 : 1);
      push(x, y, z, mix(OLD, DISC, r() * 0.35), star(), 0.55);
    }
    for (let i = 0; i < hazeN; i++) {
      const [x, y, z] = spheroid(R * 1.6, p.axes, 1);
      push(x, y, z, mix(warmTint, OLD, 0.5), haze(), 0.025);
    }
  } else if (p.kind === "irregular") {
    for (let i = 0; i < starN; i++) {
      const u = r();
      if (u < 0.55) {
        const [x, y, z] = clump(1, p.thickness * 0.5);
        const hii = r() < 0.1;
        push(x, y, z, hii ? HII : YOUNG, hii ? 2.4 + r() * 2.4 : star(), hii ? 1.3 : 1);
      } else {
        // Diffuse, lopsided body: skewed towards +x so no two halves mirror each other.
        const x = gauss() * 0.14 + (r() < 0.35 ? 0.07 : 0), y = gauss() * 0.1 * p.axes[1];
        if (Math.hypot(x, y) > R) { i--; continue; }
        push(x, y, gauss() * p.thickness, mix(YOUNG, DISC, 0.5), star(), 0.75);
      }
    }
    for (let i = 0; i < hazeN; i++) {
      const [x, y, z] = clump(1.8, p.thickness * 0.4);
      push(x, y, z, mix(YOUNG, DISC, 0.3), haze() * 0.7, 0.025);
    }
  } else {
    const bulgeAx: [number, number, number] = [1, 1, 0.6];
    const cx = p.offset * R, cy = 0;
    const bulgeShare = p.offset ? 0.015 : p.arms ? 0.06 + p.bulge * 0.5 : 0.4;
    const discScale = p.offset ? 0.5 : p.arms ? 0.3 : 0.24;
    const barShare = p.bar ? 0.1 : 0;
    const discShare = p.arms ? 0.26 : 1 - bulgeShare;
    const clumpShare = p.clumps ? 0.15 : 0;
    const k = 1 / Math.tan((p.pitchDeg * Math.PI) / 180);
    const r0 = Math.max(p.bar, p.bulge * 0.8, 0.1) * R;
    const armAngle = (rad: number, arm: number) => p.rotation + (arm * 2 * Math.PI) / p.arms + Math.log(rad / r0) * k;
    // Star-forming knots strung along each arm make the arms patchy rather than ribbon-like.
    const knots = Array.from({ length: p.arms * 26 }, (_, i) => {
      const rad = r0 * 1.2 + r() * (R * 0.92 - r0 * 1.2);
      return { arm: i % Math.max(1, p.arms), rad, th: 0 };
    }).map((kn) => ({ ...kn, th: armAngle(kn.rad, kn.arm) + gauss() * 0.06 }));
    const armStar = (spreadScale: number): [number, number, number, number] => {
      const arm = Math.floor(r() * p.arms);
      // A lone arm thins out towards its root so it does not read as a second nucleus.
      const rad = r0 + (p.arms === 1 ? Math.sqrt(r()) : r()) * (R * 0.97 - r0);
      const spread = (0.014 + 0.035 * (rad / R)) * R * spreadScale;
      // Spurs: some stars trail off the arm at a shallower angle.
      const spur = r() < 0.2 ? Math.abs(gauss()) * 0.25 : 0;
      const th = armAngle(rad, arm) + gauss() * 0.04 + spur;
      const off = gauss() * spread;
      return [cx + Math.cos(th) * (rad + off), cy + Math.sin(th) * (rad + off), rad, th];
    };
    for (let i = 0; i < starN; i++) {
      const u = r();
      if (u < bulgeShare) {
        const [x, y, z] = spheroid(p.bulge * R * 3, bulgeAx);
        push(cx + x, cy + y, z, OLD, star(), 0.65);
      } else if (u < bulgeShare + barShare) {
        const t = (r() * 2 - 1) * p.bar * R;
        const c = Math.cos(p.rotation), s = Math.sin(p.rotation);
        const w = gauss() * p.bar * R * 0.16;
        push(cx + t * c - w * s, cy + t * s + w * c, gauss() * p.thickness * 0.8 * R, mix(OLD, DISC, 0.3), star(), 0.85);
      } else if (u < bulgeShare + barShare + clumpShare) {
        const [x, y, z] = clump(1, p.thickness * R * 0.6);
        const hii = r() < 0.12;
        push(x, y, z, hii ? HII : YOUNG, hii ? 2.4 + r() * 2.4 : star(), hii ? 1.3 : 1);
      } else if (u < bulgeShare + barShare + clumpShare + discShare || !p.arms) {
        const rad = discRadius(discScale);
        const a = r() * Math.PI * 2;
        const flare = 1 + (rad / R) * 0.8;
        push(Math.cos(a) * rad, Math.sin(a) * rad, gauss() * p.thickness * R * flare, mix(DISC, warmTint, 0.4), star(), 0.6);
      } else if (r() < 0.3) {
        const kn = knots[Math.floor(r() * knots.length)];
        const sp = (0.008 + 0.012 * r()) * R * 2;
        const hii = r() < 0.09;
        push(cx + Math.cos(kn.th) * kn.rad + gauss() * sp, cy + Math.sin(kn.th) * kn.rad + gauss() * sp, gauss() * p.thickness * R * 0.3, hii ? HII : YOUNG, hii ? 2.2 + r() * 2.2 : star(), hii ? 1.25 : 1.1);
      } else {
        const [x, y] = armStar(2);
        push(x, y, gauss() * p.thickness * R * 0.45, mix(YOUNG, DISC, r() * 0.35), star(), 1.15);
      }
    }
    for (let i = 0; i < hazeN; i++) {
      const u = r();
      if (u < 0.3) {
        const [x, y, z] = spheroid(p.bulge * R * 2.6, bulgeAx);
        push(cx + x, cy + y, z, OLD, haze() * 0.8, 0.03);
      } else if (p.arms && u < 0.72) {
        const [x, y] = armStar(3);
        push(x, y, gauss() * p.thickness * R * 0.4, mix(YOUNG, DISC, 0.25), haze() * 0.7, 0.036);
      } else {
        const rad = discRadius(discScale), a = r() * Math.PI * 2;
        push(Math.cos(a) * rad, Math.sin(a) * rad, gauss() * p.thickness * R, mix(DISC, warmTint, 0.5), haze(), 0.026);
      }
    }
    if (p.arms) {
      const dustN = Math.round(count * 0.08);
      for (let i = 0; i < dustN; i++) {
        if (r() < 0.7) {
          // Lanes trail just inside each arm.
          const arm = Math.floor(r() * p.arms);
          const rad = r0 * 1.15 + r() * (R * 0.9 - r0 * 1.15);
          const th = armAngle(rad, arm) - 0.14 - Math.abs(gauss()) * 0.06;
          const off = gauss() * 0.012 * R * 2;
          dPos.push(cx + Math.cos(th) * (rad + off), cy + Math.sin(th) * (rad + off), gauss() * p.thickness * R * 0.2);
          dSize.push(6 + r() * 12);
        } else {
          // A thin mid-plane layer that reads as a dust lane when the disc is seen edge-on.
          const rad = r0 + r() * (R * 0.85 - r0), a = r() * Math.PI * 2;
          dPos.push(Math.cos(a) * rad, Math.sin(a) * rad, gauss() * p.thickness * R * 0.12);
          dSize.push(8 + r() * 14);
        }
      }
    }
  }

  // Fisher–Yates over particle indices so any drawRange prefix is an unbiased level of detail.
  const n = size.length;
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const positions = new Float32Array(n * 3), colors = new Float32Array(n * 3), sizes = new Float32Array(n);
  for (let dst = 0; dst < n; dst++) {
    const src = order[dst];
    for (let c = 0; c < 3; c++) {
      positions[dst * 3 + c] = pos[src * 3 + c];
      colors[dst * 3 + c] = col[src * 3 + c];
    }
    sizes[dst] = size[src];
  }
  return {
    light: { positions, colors, sizes, count: n },
    dust: { positions: new Float32Array(dPos), sizes: new Float32Array(dSize), count: dSize.length },
  };
}
