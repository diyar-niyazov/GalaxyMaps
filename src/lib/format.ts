import { AU_KM, LY_KM, PC_KM, DAY_S, HOUR_S, JULIAN_YEAR_S, C_KM_S } from "./units";

/** Round to n significant figures (n ≥ 1). */
export function sig(x: number, n = 2): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  const p = Math.ceil(Math.log10(Math.abs(x)));
  const f = 10 ** (n - p);
  return Math.round(x * f) / f;
}

function fmtNum(x: number, n = 2): string {
  const v = sig(x, n);
  return v.toLocaleString("en-US", { maximumFractionDigits: Math.max(0, n - Math.ceil(Math.log10(Math.abs(v) || 1))) });
}

const BIG = [
  { v: 1e12, w: "trillion" },
  { v: 1e9, w: "billion" },
  { v: 1e6, w: "million" },
];

function bigWords(x: number, n = 2): string {
  for (const b of BIG) if (Math.abs(x) >= b.v) return `${fmtNum(x / b.v, n)} ${b.w}`;
  return fmtNum(x, n >= 3 ? n : Math.max(n, Math.ceil(Math.log10(Math.abs(x) + 1))));
}

const plural = (v: string, unit: string) => `${v} ${unit}${v === "1" ? "" : "s"}`;

/** Age of the Universe, Planck 2018 ΛCDM (13.787 ± 0.020 Gyr). */
export const UNIVERSE_AGE_YEARS = 13.787e9;

/**
 * Human-readable duration with deliberately limited precision (2–3 significant figures).
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds === 0) return "0 seconds";
  if (seconds < 1) return `${fmtNum(seconds * 1000, 2)} ms`;
  if (seconds < 60) return plural(fmtNum(seconds, 2), "second");
  if (seconds < HOUR_S) return plural(fmtNum(seconds / 60, 2), "minute");
  if (seconds < DAY_S) return plural(fmtNum(seconds / HOUR_S, 2), "hour");
  if (seconds < 60 * DAY_S) return plural(fmtNum(seconds / DAY_S, 2), "day");
  if (seconds < 2 * JULIAN_YEAR_S) return plural(fmtNum(seconds / (30.4375 * DAY_S), 2), "month");
  const years = seconds / JULIAN_YEAR_S;
  if (years < 1e6) return plural(fmtNum(years, years < 100 ? 2 : 3), "year");
  return `${bigWords(years, 2)} years`;
}

/** Context like "≈ 3× the age of the Universe" for absurd durations. */
export function durationContext(seconds: number): string | null {
  const years = seconds / JULIAN_YEAR_S;
  if (years > UNIVERSE_AGE_YEARS) return `about ${fmtNum(years / UNIVERSE_AGE_YEARS, 2)}× the age of the Universe`;
  if (years > 1e6) return null;
  if (years > 120) return `about ${fmtNum(years / 80, 2)} human lifetimes (80 years each)`;
  return null;
}

export type DistanceStyle = "auto" | "km" | "au" | "ly";

export function formatDistance(km: number, style: DistanceStyle = "auto"): string {
  if (!Number.isFinite(km) || km < 0) return "—";
  if (km === 0) return "0 km";
  const s = style === "auto" ? (km < 0.05 * AU_KM ? "km" : km < 0.02 * LY_KM ? "au" : "ly") : style;
  if (s === "km") return `${bigWords(km, km < 1e6 ? 3 : 3)} km`;
  if (s === "au") return `${fmtNum(km / AU_KM, 3)} AU`;
  const ly = km / LY_KM;
  return `${ly >= 1e6 ? bigWords(ly, 3) : fmtNum(ly, 3)} light-years`;
}

/** Secondary unit line, e.g. "132.6 pc · 8.4 million AU". */
export function formatDistanceSecondary(km: number): string {
  if (km < 0.05 * AU_KM) return `${fmtNum(km / C_KM_S, 2)} light-seconds`;
  if (km < 0.02 * LY_KM) return `${bigWords(km, 3)} km · ${formatDuration(km / C_KM_S)} at light speed`;
  const pc = km / PC_KM;
  if (pc >= 1e6) return `${fmtNum(pc / 1e6, 3)} Mpc`;
  if (pc >= 1e3) return `${fmtNum(pc / 1e3, 3)} kpc`;
  return `${fmtNum(pc, 3)} pc`;
}

export function formatSpeed(kmS: number): string {
  if (!Number.isFinite(kmS) || kmS <= 0) return "—";
  if (kmS >= C_KM_S * 0.999999 && kmS <= C_KM_S * 1.000001) return "299,792 km/s (c)";
  if (kmS > C_KM_S) return `${bigWords(kmS / C_KM_S, 3)}× c`;
  if (kmS >= 1) return `${bigWords(kmS, 3)} km/s`;
  return `${fmtNum(kmS * 3600, 3)} km/h`;
}

export function formatUncertainty(plusKm?: number, minusKm?: number): string | null {
  if (!plusKm && !minusKm) return null;
  const p = plusKm ?? minusKm!, m = minusKm ?? plusKm!;
  const ref = Math.max(p, m);
  const unit = ref < 0.05 * AU_KM ? "km" : ref < 0.02 * LY_KM ? "au" : "ly";
  const f = (x: number) =>
    unit === "km" ? `${fmtNum(x, 2)} km` : unit === "au" ? `${fmtNum(x / AU_KM, 2)} AU` : `${fmtNum(x / LY_KM, 2)} ly`;
  if (Math.abs(p - m) / ref < 0.15) return `± ${f(ref)}`;
  return `+${f(p)} / −${f(m)}`;
}
