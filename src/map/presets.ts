import type { DataBundle } from "../data/bundle";
import type { Vec3 } from "../lib/types";
import { AU_KM, LY_KM, PC_KM } from "../lib/units";
import { positionAt } from "../data/bundle";
import { lerp } from "../lib/vec";

export interface ScalePreset {
  id: string;
  label: string;
  target(data: DataBundle, jd: number): { center: Vec3; widthKm: number };
}

const at = (data: DataBundle, id: string, jd: number): Vec3 => {
  const o = data.byId.get(id);
  return (o && positionAt(data, o, jd)) || [0, 0, 0];
};

export const SCALE_PRESETS: ScalePreset[] = [
  { id: "earth", label: "Earth & Moon", target: (d, jd) => ({ center: at(d, "earth", jd), widthKm: 1.3e6 }) },
  { id: "inner", label: "Inner planets", target: () => ({ center: [0, 0, 0], widthKm: 4.2 * AU_KM }) },
  { id: "solar", label: "Solar System", target: () => ({ center: [0, 0, 0], widthKm: 85 * AU_KM }) },
  { id: "nearby", label: "Nearby stars", target: () => ({ center: [0, 0, 0], widthKm: 34 * LY_KM }) },
  { id: "neighborhood", label: "Stellar neighborhood", target: () => ({ center: [0, 0, 0], widthKm: 1500 * LY_KM }) },
  { id: "milky-way", label: "Milky Way", target: (d, jd) => ({ center: lerp([0, 0, 0], at(d, "sagittarius-a-star", jd), 0.75), widthKm: 36_000 * PC_KM }) },
  { id: "local-group", label: "Local Group", target: (d, jd) => ({ center: lerp([0, 0, 0], at(d, "andromeda", jd), 0.45), widthKm: 2.4e6 * PC_KM }) },
  { id: "local-volume", label: "Nearby galaxies", target: () => ({ center: [0, 0, 0], widthKm: 4.5e7 * PC_KM }) },
];

export const HOME_PRESET = SCALE_PRESETS[0];
