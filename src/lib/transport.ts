import type { SpeedReference } from "./types";
import { C_KM_S } from "./units";

export type SpeedKind = "physical-limit" | "measured";

/** A constant comparison speed for the direct-distance benchmark. */
export interface TransportMode {
  id: "light" | "voyager-1";
  label: string;
  shortLabel: string;
  speedKmS: number;
  kind: SpeedKind;
  description: string;
  /** Reference frame for measured speeds. */
  frame?: string;
  sourceId?: string;
}

export const LIGHT_MODE: TransportMode = {
  id: "light",
  label: "Light speed",
  shortLabel: "Light",
  speedKmS: C_KM_S,
  kind: "physical-limit",
  description: "299,792.458 km/s, exact by SI definition. Nothing with mass can reach it.",
  sourceId: "si-c",
};

export function voyagerMode(refs: SpeedReference[]): TransportMode | null {
  const r = refs.find((x) => x.id === "voyager-1-speed");
  if (!r) return null;
  return {
    id: "voyager-1",
    label: "Voyager 1",
    shortLabel: "Voyager 1",
    speedKmS: r.speedKmS,
    kind: "measured",
    description: r.description,
    frame: r.frame,
    sourceId: r.sourceId,
  };
}

/** The travel-mode chooser offers exactly these two comparisons. */
export function travelModes(refs: SpeedReference[]): TransportMode[] {
  const v = voyagerMode(refs);
  return v ? [LIGHT_MODE, v] : [LIGHT_MODE];
}
