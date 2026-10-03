import type { DataBundle } from "../data/bundle";
import type { Vec3 } from "../lib/types";
import { AU_KM, LY_KM, PC_KM } from "../lib/units";
import { positionAt } from "../data/bundle";
import { lerp } from "../lib/vec";

export interface RegionPreset {
  id: string;
  label: string;
  /** Group shown as one pill with a dropdown. */
  group: string;
  /** Sidebar shows this object's children while in the region. */
  insideId?: string;
  target(data: DataBundle, jd: number): { center: Vec3; widthKm: number; tilt?: number; heading?: number };
}

const at = (data: DataBundle, id: string, jd: number): Vec3 => {
  const o = data.byId.get(id);
  return (o && positionAt(data, o, jd)) || [0, 0, 0];
};

export const REGION_GROUPS = [
  { id: "solar", label: "Solar System" },
  { id: "stars", label: "Stars" },
  { id: "milky-way", label: "Milky Way" },
  { id: "galaxies", label: "Galaxies" },
  { id: "universe", label: "Observable universe" },
] as const;

export const REGION_PRESETS: RegionPreset[] = [
  { id: "earth", group: "solar", label: "Earth & Moon", target: (d, jd) => ({ center: at(d, "earth", jd), widthKm: 1.3e6 }) },
  { id: "inner", group: "solar", label: "Inner planets", target: () => ({ center: [0, 0, 0], widthKm: 4.2 * AU_KM }) },
  { id: "solar", group: "solar", label: "Solar System", target: () => ({ center: [0, 0, 0], widthKm: 85 * AU_KM }) },
  { id: "kuiper", group: "solar", label: "Kuiper belt & beyond", target: () => ({ center: [0, 0, 0], widthKm: 260 * AU_KM }) },
  { id: "nearby", group: "stars", label: "Nearby stars", target: () => ({ center: [0, 0, 0], widthKm: 34 * LY_KM }) },
  { id: "neighborhood", group: "stars", label: "Stellar neighborhood", target: () => ({ center: [0, 0, 0], widthKm: 1500 * LY_KM }) },
  { id: "milky-way", group: "milky-way", label: "Milky Way", target: (d, jd) => ({ center: lerp([0, 0, 0], at(d, "sagittarius-a-star", jd), 0.75), widthKm: 36_000 * PC_KM }) },
  { id: "andromeda", group: "galaxies", label: "Andromeda", insideId: "andromeda", target: (d, jd) => ({ center: at(d, "andromeda", jd), widthKm: 260_000 * LY_KM }) },
  { id: "local-group", group: "galaxies", label: "Local Group", target: (d, jd) => ({ center: lerp([0, 0, 0], at(d, "andromeda", jd), 0.45), widthKm: 2.4e6 * PC_KM }) },
  { id: "local-volume", group: "galaxies", label: "Nearby galaxies", target: () => ({ center: [0, 0, 0], widthKm: 4.5e7 * PC_KM }) },
  { id: "virgo", group: "galaxies", label: "Virgo Cluster region", target: () => ({ center: [0, 0, 0], widthKm: 1.4e8 * LY_KM }) },
  { id: "universe", group: "universe", label: "Observable universe", target: () => ({ center: [0, 0, 0], widthKm: 1.6e22, tilt: 0 }) },
];

/** Earth & Moon system framing (kept separately from the Home close-up). */
export const EARTH_MOON_PRESET = REGION_PRESETS[0];
