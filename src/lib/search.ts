import type { CatalogObject, ObjectType } from "./types";
import { leafLabel, inCategory } from "./taxonomy";

const GREEK: Record<string, string> = {
  α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "epsilon", ζ: "zeta", η: "eta", θ: "theta", ι: "iota", κ: "kappa", λ: "lambda", μ: "mu", ν: "nu", ξ: "xi", ο: "omicron", π: "pi", ρ: "rho", σ: "sigma", τ: "tau", υ: "upsilon", φ: "phi", χ: "chi", ψ: "psi", ω: "omega",
};

export function normalize(s: string): string {
  return s
    .replace(/[α-ω]/g, (c) => `${GREEK[c] ?? c} `)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9*+]+/g, " ")
    .replace(/\b(messier|m) ?(\d+)\b/g, "m$2")
    .trim();
}

export const TYPE_LABEL: Record<ObjectType, string> = {
  star: "Star",
  planet: "Planet",
  "dwarf-planet": "Dwarf planet",
  moon: "Moon",
  asteroid: "Asteroid",
  comet: "Comet",
  spacecraft: "Spacecraft",
  "star-cluster": "Star cluster",
  nebula: "Nebula",
  galaxy: "Galaxy",
  "black-hole": "Black hole",
  quasar: "Quasar",
  exoplanet: "Exoplanet",
  "white-dwarf": "White dwarf",
  "neutron-star": "Neutron star",
  "supernova-remnant": "Supernova remnant",
  "galaxy-group": "Galaxy group",
  mission: "Mission",
};

interface Entry {
  obj: CatalogObject;
  keys: string[];
  /** Object type and category names ("black hole", "globular clusters"), matched with lower rank. */
  typeKeys: string[];
}

export interface SearchIndex {
  entries: Entry[];
}

export function buildSearchIndex(objects: CatalogObject[]): SearchIndex {
  return {
    entries: objects.map((obj) => ({
      obj,
      keys: [obj.name, ...obj.aliases].map(normalize).filter(Boolean),
      typeKeys: [obj.type, obj.category, ...(obj.tags ?? [])].filter(Boolean).map((k, i) => normalize(i ? leafLabel(k) : TYPE_LABEL[obj.type])).filter(Boolean),
    })),
  };
}

/** Damerau–Levenshtein distance capped at 2 (enough for typo tolerance). */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

function scoreKey(key: string, q: string, tokens: string[]): number {
  if (key === q) return 1000;
  if (key.startsWith(q)) return 700 - Math.min(100, key.length - q.length);
  const words = key.split(" ");
  if (words.some((w) => w.startsWith(q))) return 500;
  if (tokens.length > 1 && tokens.every((t) => words.some((w) => w.startsWith(t)))) return 450;
  if (key.includes(q)) return 300;
  if (q.length >= 4) {
    const prefix = key.slice(0, q.length);
    const dist = editDistance(prefix, q);
    if (dist <= (q.length >= 7 ? 2 : 1)) return 200 - dist * 40;
  }
  return 0;
}

export interface SearchResult {
  obj: CatalogObject;
  score: number;
}

/** Singular/plural-insensitive match of a query against a type or category name. */
function typeScore(key: string, q: string): number {
  const stem = (w: string) => w.replace(/(es|s)$/, "");
  const kw = key.split(" ").map(stem), qw = q.split(" ").map(stem);
  if (qw.length && qw.every((w) => w.length >= 3 && kw.some((k) => k.startsWith(w)))) return 160;
  return 0;
}

export function search(index: SearchIndex, query: string, limit = 8, category?: string | null): SearchResult[] {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(" ");
  const out: SearchResult[] = [];
  for (const e of index.entries) {
    if (category && !inCategory(e.obj, category)) continue;
    let best = 0;
    for (const k of e.keys) best = Math.max(best, scoreKey(k, q, tokens));
    if (best < 160) for (const k of e.typeKeys) best = Math.max(best, typeScore(k, q));
    if (best > 0) out.push({ obj: e.obj, score: best + e.obj.display.priority * 2 + (e.obj.featured ? 60 : 0) + (e.obj.image ? 20 : 0) });
  }
  out.sort((a, b) => b.score - a.score || a.obj.name.localeCompare(b.obj.name));
  return out.slice(0, limit);
}

/** Resolve free text to a single object when the match is unambiguous enough. */
export function resolveOne(index: SearchIndex, query: string): CatalogObject | null {
  const r = search(index, query, 2);
  if (!r.length) return null;
  if (r.length === 1 || r[0].score >= 900 || r[0].score - r[1].score > 150) return r[0].obj;
  return r[0].score >= 600 ? r[0].obj : null;
}

/** All records in a category, best first (featured, imaged, priority). */
export function browse(index: SearchIndex, category: string): CatalogObject[] {
  return index.entries
    .filter((e) => inCategory(e.obj, category))
    .map((e) => e.obj)
    .sort((a, b) => Number(b.featured) - Number(a.featured) || Number(!!b.image) - Number(!!a.image) || b.display.priority - a.display.priority || a.name.localeCompare(b.name));
}
