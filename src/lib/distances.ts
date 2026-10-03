/**
 * Robust distance from a set of published SIMBAD measurements (mesDistance).
 * Redshift-derived values are excluded: they depend on a cosmology and on peculiar velocities,
 * so mixing them with standard-candle distances would be inconsistent.
 */
import type { DistanceQuality } from "./types";

export interface DistanceMeasurement {
  distPc: number;
  plusPc?: number | null;
  minusPc?: number | null;
  method: string;
  bibcode: string;
}

export interface RobustDistance {
  valuePc: number;
  /** Robust 1σ estimate (scaled MAD), or the reported error for a single measurement. */
  sigmaPc: number | null;
  n: number;
  methods: string[];
  /** Bibcode of the measurement closest to the adopted value. */
  bibcode: string;
  quality: DistanceQuality;
}

const REDSHIFT_BASED = /^(redshift|z|zh|flow|hubble|vh|vlg)$/i;
const KINEMATIC = /^kin$/i;
/** Redshift-independent indicators: Cepheids, tip of the red giant branch, surface brightness fluctuations, Tully–Fisher, parallax, etc. */
const STANDARD = /^(cep|ceph|t-rgb|trgb|t-rdb|sbf|t-f|pnlf|st-l|paral|plx|rrlyr|bs|mult|sed-fit|caiihk|pm|eb|maser|sn ?ia)$/i;

export const UNIT_TO_PC: Record<string, number> = { pc: 1, kpc: 1e3, Mpc: 1e6 };

export function qualityFromRelative(rel: number | null): DistanceQuality {
  if (rel == null) return "approximate";
  return rel <= 0.01 ? "precise" : rel <= 0.05 ? "good" : rel <= 0.2 ? "approximate" : "uncertain";
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function robustDistance(all: DistanceMeasurement[], opts: { extragalactic: boolean }): RobustDistance | null {
  const valid = all.filter(
    (d) => Number.isFinite(d.distPc) && d.distPc > 0 && !REDSHIFT_BASED.test(d.method.trim()) && !(opts.extragalactic && KINEMATIC.test(d.method.trim())),
  );
  const standard = valid.filter((d) => STANDARD.test(d.method.trim()));
  const pool = standard.length ? standard : valid;
  if (!pool.length) return null;
  const values = pool.map((d) => d.distPc);
  const value = median(values);
  let sigma: number | null = null;
  if (pool.length >= 3) sigma = 1.4826 * median(values.map((v) => Math.abs(v - value)));
  else if (pool.length === 2) sigma = Math.abs(values[0] - values[1]) / 2;
  else {
    const d = pool[0];
    const e = Math.max(Math.abs(d.plusPc ?? 0), Math.abs(d.minusPc ?? 0));
    sigma = e > 0 ? e : null;
  }
  // Identical repeated values give MAD = 0; that is not evidence of a perfect distance.
  if (sigma === 0) sigma = null;
  const closest = pool.reduce((a, b) => (Math.abs(b.distPc - value) < Math.abs(a.distPc - value) ? b : a));
  const methods = [...new Set(pool.map((d) => d.method.trim() || "unspecified"))];
  return { valuePc: value, sigmaPc: sigma, n: pool.length, methods, bibcode: closest.bibcode, quality: qualityFromRelative(sigma == null ? null : sigma / value) };
}

const METHOD_NAMES: Record<string, string> = {
  cep: "Cepheids", ceph: "Cepheids", "t-rgb": "tip of the red giant branch", trgb: "tip of the red giant branch", "t-rdb": "tip of the red giant branch",
  sbf: "surface brightness fluctuations", "t-f": "Tully–Fisher relation", pnlf: "planetary nebula luminosity function", "st-l": "stellar luminosity",
  paral: "parallax", plx: "parallax", rrlyr: "RR Lyrae stars", bs: "brightest stars", kin: "kinematics", pm: "proper motions", unspecified: "unspecified method",
};

export const describeMethod = (m: string) => METHOD_NAMES[m.toLowerCase()] ?? m;
