/**
 * Schematic sprites for extended objects and SVG symbols for point objects. Galaxy sprites are
 * generic shapes chosen from the SIMBAD morphology code and oriented by the catalog position
 * angle and axis ratio; they are labelled as schematic, never as images of the object.
 */
import * as THREE from "three";
import type { CatalogObject, ObjectType } from "../lib/types";

export type GalaxyKind = "spiral" | "barred" | "elliptical" | "lenticular" | "irregular";

export function galaxyKind(o: CatalogObject): GalaxyKind {
  const m = (o.display.morphology ?? "").replace(/\s+/g, "");
  if (/^c?D|^E|^dE|dSph|^Sph/i.test(m) && !/^S/.test(m)) return "elliptical";
  if (/^S(A|B|AB)?0|^SB?0|^S0/.test(m)) return "lenticular";
  if (/^SB|^SAB/.test(m)) return "barred";
  if (/^S/.test(m)) return "spiral";
  if (/^I|Irr|Im|dIrr/i.test(m)) return "irregular";
  return o.category === "gx-elliptical" ? "elliptical" : o.category === "gx-dwarf" ? "irregular" : o.category === "gx-other" ? "lenticular" : "spiral";
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(n = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = n;
  return { c, g: c.getContext("2d")! };
}

function toTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function drawGalaxy(kind: GalaxyKind): HTMLCanvasElement {
  const N = 256, h = N / 2;
  const { c, g } = canvas(N);
  const r = rng(kind.length * 7919);
  g.globalCompositeOperation = "lighter";
  const blob = (x: number, y: number, rad: number, color: string, a: number) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, color.replace("A", String(a)));
    grd.addColorStop(1, color.replace("A", "0"));
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  };
  if (kind === "elliptical" || kind === "lenticular") {
    blob(h, h, h * 0.95, "rgba(255,226,190,A)", kind === "elliptical" ? 0.55 : 0.4);
    blob(h, h, h * 0.45, "rgba(255,236,205,A)", 0.7);
    if (kind === "lenticular") {
      g.save();
      g.translate(h, h);
      g.scale(1, 0.18);
      blob(0, 0, h * 0.95, "rgba(230,225,215,A)", 0.45);
      g.restore();
    }
    blob(h, h, h * 0.14, "rgba(255,248,230,A)", 0.95);
    return c;
  }
  if (kind === "irregular") {
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * h * 0.75;
      blob(h + Math.cos(a) * d * 1.1, h + Math.sin(a) * d * 0.8, 10 + r() * 26, r() < 0.25 ? "rgba(255,150,190,A)" : "rgba(175,200,255,A)", 0.12 + r() * 0.12);
    }
    return c;
  }
  // Spirals: bulge, disc and two logarithmic arms with knots.
  blob(h, h, h * 0.92, "rgba(170,190,255,A)", 0.18);
  const k = Math.tan((14 * Math.PI) / 180);
  const barLen = kind === "barred" ? h * 0.32 : 0;
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < 420; i++) {
      const t = i / 420;
      const wind = t * Math.PI * 2.4;
      const th = arm * Math.PI + wind;
      const rad = (barLen || h * 0.12) * Math.exp(k * wind * 1.3);
      if (rad > h * 0.95) break;
      const jitter = (r() - 0.5) * 10;
      const x = h + Math.cos(th) * (rad + jitter), y = h + Math.sin(th) * (rad + jitter);
      blob(x, y, 9 + 12 * (1 - t), "rgba(190,210,255,A)", 0.085 * Math.min(1, rad / (h * 0.45)) ** 1.5);
      if (r() < 0.06) blob(x, y, 4, "rgba(255,140,185,A)", 0.45);
    }
  }
  if (barLen) {
    g.save();
    g.translate(h, h);
    g.scale(1, 0.28);
    blob(0, 0, barLen * 1.15, "rgba(255,225,185,A)", 0.55);
    g.restore();
  }
  blob(h, h, h * 0.22, "rgba(255,226,180,A)", 0.75);
  blob(h, h, h * 0.07, "rgba(255,248,230,A)", 0.95);
  return c;
}

function drawNebula(seed: number, tint: [number, number, number]): HTMLCanvasElement {
  const N = 256, h = N / 2;
  const { c, g } = canvas(N);
  const r = rng(seed);
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * h * 0.7;
    const x = h + Math.cos(a) * d, y = h + Math.sin(a) * d, rad = 12 + r() * 34;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const [R, G, B] = tint.map((v) => Math.round(v * (0.75 + 0.5 * r())));
    grd.addColorStop(0, `rgba(${R},${G},${B},${0.08 + r() * 0.1})`);
    grd.addColorStop(1, `rgba(${R},${G},${B},0)`);
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return c;
}

function drawCluster(globular: boolean): HTMLCanvasElement {
  const N = 256, h = N / 2;
  const { c, g } = canvas(N);
  const r = rng(globular ? 11 : 23);
  const n = globular ? 900 : 120;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = globular ? h * 0.9 * Math.pow(r(), 2.2) : h * 0.85 * Math.sqrt(r());
    const x = h + Math.cos(a) * d, y = h + Math.sin(a) * d;
    const s = globular ? 0.8 + r() * 1.4 : 1.2 + r() * 2.4;
    g.fillStyle = globular ? `rgba(255,${220 + r() * 30},${180 + r() * 50},${0.5 + r() * 0.5})` : `rgba(${190 + r() * 60},${210 + r() * 40},255,${0.6 + r() * 0.4})`;
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

const cache = new Map<string, THREE.Texture>();
export function spriteTexture(o: CatalogObject): THREE.Texture | null {
  let key: string;
  let make: () => HTMLCanvasElement;
  if (o.type === "galaxy" || o.type === "quasar") {
    const k = galaxyKind(o);
    key = `g-${k}`;
    make = () => drawGalaxy(k);
  } else if (o.type === "nebula" || o.type === "supernova-remnant") {
    const planetary = o.category === "nb-planetary";
    const tint: [number, number, number] = o.type === "supernova-remnant" ? [255, 170, 130] : planetary ? [120, 230, 220] : o.category === "nb-reflection" ? [140, 170, 255] : o.category === "nb-dark" ? [90, 80, 70] : [255, 120, 160];
    key = `n-${o.category}-${o.type}`;
    make = () => drawNebula(key.length * 131, tint);
  } else if (o.type === "star-cluster") {
    const glob = o.category === "cl-globular";
    key = `c-${glob}`;
    make = () => drawCluster(glob);
  } else return null;
  let t = cache.get(key);
  if (!t) {
    t = toTexture(make());
    cache.set(key, t);
  }
  return t;
}

/** SVG path data (24×24 box, centred on 12,12) for point-like map symbols. */
export const MAP_GLYPH: Partial<Record<ObjectType, { d: string; fill: boolean }>> = {
  "black-hole": { d: "M2 12a10 3.6 0 1 0 20 0a10 3.6 0 1 0-20 0M7.4 12a4.6 4.6 0 1 0 9.2 0a4.6 4.6 0 1 0-9.2 0", fill: false },
  "neutron-star": { d: "M9.4 12a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M7 3l3.4 6M17 21l-3.4-6", fill: false },
  "white-dwarf": { d: "M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0", fill: false },
  quasar: { d: "M9.2 12a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0M12 2v6M12 16v6", fill: false },
  asteroid: { d: "M7 6l6-2 6 4 1 6-4 6-7 0-4-5z", fill: true },
  comet: { d: "M13.3 7.5a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0M14 10L4 20M13 8.5L5 14M15.5 10.8L10 19", fill: false },
  "galaxy-group": { d: "M4 9a4 2.2 0 1 0 8 0a4 2.2 0 1 0-8 0M12 15a4 2.2 0 1 0 8 0a4 2.2 0 1 0-8 0M14.8 6.5a2.2 1.3 0 1 0 4.4 0a2.2 1.3 0 1 0-4.4 0", fill: false },
  "supernova-remnant": { d: "M4.5 12a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0-15 0", fill: false },
};
