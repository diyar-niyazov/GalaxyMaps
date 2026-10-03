import type { Ephemeris, EphemerisBody, SatelliteElements, Vec3 } from "./types";
import { keplerPosition } from "./kepler";
import { add } from "./vec";

/**
 * Cubic Hermite interpolation of a sampled state-vector table. Exact at nodes and
 * matches velocities; error for daily planetary samples is far below a body radius.
 */
export function interpolateBody(body: EphemerisBody, jdTdb: number): Vec3 | null {
  const n = body.states.length / 6;
  const t = (jdTdb - body.startJdTdb) / body.stepDays;
  if (t < 0 || t > n - 1) return null;
  const i = Math.min(Math.floor(t), n - 2);
  const u = t - i;
  const h = body.stepDays * 86_400;
  const s = body.states;
  const a = i * 6, b = (i + 1) * 6;
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  return [0, 1, 2].map(
    (k) => h00 * s[a + k] + h10 * h * s[a + 3 + k] + h01 * s[b + k] + h11 * h * s[b + 3 + k],
  ) as Vec3;
}

export function velocityAt(body: EphemerisBody, jdTdb: number): Vec3 | null {
  const n = body.states.length / 6;
  const t = Math.round((jdTdb - body.startJdTdb) / body.stepDays);
  if (t < 0 || t > n - 1) return null;
  return [body.states[t * 6 + 3], body.states[t * 6 + 4], body.states[t * 6 + 5]];
}

export function satelliteOffset(sat: SatelliteElements, jdTdb: number): Vec3 {
  let best = sat.sets[0];
  for (const s of sat.sets) if (Math.abs(s.epochJdTdb - jdTdb) < Math.abs(best.epochJdTdb - jdTdb)) best = s;
  return keplerPosition(best, jdTdb);
}

/** Heliocentric ICRF position (km) of an ephemeris key at jdTdb, or null if out of range. */
export function ephemerisPosition(eph: Ephemeris, key: string, jdTdb: number): Vec3 | null {
  if (key === "sun") return [0, 0, 0];
  const body = eph.bodies[key];
  if (body) return interpolateBody(body, jdTdb);
  const sat = eph.satellites[key];
  if (sat) {
    const parent = ephemerisPosition(eph, sat.parentKey, jdTdb);
    if (!parent) return null;
    return add(parent, satelliteOffset(sat, jdTdb));
  }
  return null;
}

/** Clamp a requested date to the ephemeris coverage. */
export function clampJd(eph: Ephemeris, jdTdb: number): number {
  return Math.min(Math.max(jdTdb, eph.startJdTdb), eph.endJdTdb);
}
