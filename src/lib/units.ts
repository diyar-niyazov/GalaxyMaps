/** Physical constants and unit conversions. All internal distances are km, times are seconds. */

/** Speed of light in vacuum, exact by SI definition (km/s). */
export const C_KM_S = 299_792.458;
/** Astronomical unit, exact by IAU 2012 Resolution B2 (km). */
export const AU_KM = 149_597_870.7;
/** Parsec, IAU 2015 Resolution B2: 648000/π au (km). */
export const PC_KM = (AU_KM * 648_000) / Math.PI;
/** Julian year (s), the year used in the IAU light-year definition. */
export const JULIAN_YEAR_S = 365.25 * 86_400;
/** Light-year: distance light travels in one Julian year (km). */
export const LY_KM = C_KM_S * JULIAN_YEAR_S;
export const DAY_S = 86_400;
export const HOUR_S = 3_600;
/** Heliocentric gravitational constant GM☉, IAU 2015 nominal value (km^3/s^2). */
export const GM_SUN_KM3_S2 = 1.3271244e11;
/** TT − UTC = 32.184 s + 37 leap seconds (in effect since 2017-01-01). TDB ≈ TT within 2 ms. */
export const TT_MINUS_UTC_S = 69.184;

export const kmToAu = (km: number) => km / AU_KM;
export const kmToLy = (km: number) => km / LY_KM;
export const kmToPc = (km: number) => km / PC_KM;
export const auToKm = (au: number) => au * AU_KM;
export const lyToKm = (ly: number) => ly * LY_KM;
export const pcToKm = (pc: number) => pc * PC_KM;
export const kmhToKms = (kmh: number) => kmh / 3600;

/** Julian Date (UTC) for a JS Date. */
export function jdUtc(date: Date): number {
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

/** Approximate TDB Julian Date for a UTC JS Date. */
export function jdTdb(date: Date): number {
  return jdUtc(date) + TT_MINUS_UTC_S / DAY_S;
}

export function dateFromJdTdb(jd: number): Date {
  return new Date((jd - TT_MINUS_UTC_S / DAY_S - 2_440_587.5) * 86_400_000);
}
