import type { SpeedReference } from "./types";
import { C_KM_S, kmhToKms } from "./units";

export type TransportGroup = "light" | "spacecraft" | "custom" | "scifi" | "everyday";
export type SpeedKind = "physical-limit" | "measured" | "user" | "assumption" | "fictional";

export interface TransportMode {
  id: string;
  label: string;
  shortLabel: string;
  group: TransportGroup;
  speedKmS: number;
  kind: SpeedKind;
  description: string;
  /** Reference frame for measured speeds. */
  frame?: string;
  sourceId?: string;
  /** Faster than light: never eligible for relativistic proper time. */
  ftl: boolean;
  adjustable?: boolean;
}

export const LIGHT_MODE: TransportMode = {
  id: "light",
  label: "Speed of light",
  shortLabel: "Light",
  group: "light",
  speedKmS: C_KM_S,
  kind: "physical-limit",
  description: "299,792.458 km/s, exact by SI definition. Nothing with mass can reach it.",
  sourceId: "si-c",
  ftl: false,
};

/** Fictional default multipliers. These are adjustable story assumptions, not measurements. */
export const FICTIONAL_DEFAULTS = {
  enterprise: 1516,
  falcon: 1_000_000,
};

export function fictionalModes(enterpriseC = FICTIONAL_DEFAULTS.enterprise, falconC = FICTIONAL_DEFAULTS.falcon): TransportMode[] {
  return [
    {
      id: "enterprise",
      label: "USS Enterprise (warp 9)",
      shortLabel: "Enterprise",
      group: "scifi",
      speedKmS: enterpriseC * C_KM_S,
      kind: "fictional",
      description: `Fictional. Assumes warp 9 ≈ ${enterpriseC.toLocaleString()}× light speed, a figure from the Star Trek: TNG Technical Manual (1991). Adjustable; not physics.`,
      ftl: true,
      adjustable: true,
    },
    {
      id: "falcon",
      label: "Millennium Falcon",
      shortLabel: "Falcon",
      group: "scifi",
      speedKmS: falconC * C_KM_S,
      kind: "fictional",
      description: `Fictional. Star Wars gives no canonical hyperspace speed; we assume an arbitrary ${falconC.toLocaleString()}× light speed. Adjustable; not physics.`,
      ftl: true,
      adjustable: true,
    },
  ];
}

export const EVERYDAY_MODES: TransportMode[] = [
  { id: "plane", label: "Airliner", shortLabel: "Plane", group: "everyday", speedKmS: kmhToKms(900), kind: "assumption", description: "Assumes 900 km/h, a typical airliner cruise speed. Hypothetical comparison only.", ftl: false },
  { id: "car", label: "Car", shortLabel: "Car", group: "everyday", speedKmS: kmhToKms(100), kind: "assumption", description: "Assumes 100 km/h highway driving, without stops. Hypothetical comparison only.", ftl: false },
  { id: "bike", label: "Bicycle", shortLabel: "Bike", group: "everyday", speedKmS: kmhToKms(20), kind: "assumption", description: "Assumes 20 km/h. Hypothetical comparison only.", ftl: false },
  { id: "walk", label: "Walking", shortLabel: "Walk", group: "everyday", speedKmS: kmhToKms(5), kind: "assumption", description: "Assumes 5 km/h. Hypothetical comparison only.", ftl: false },
];

export function spacecraftModes(refs: SpeedReference[]): TransportMode[] {
  return refs.map((r) => ({
    id: r.id,
    label: r.label,
    shortLabel: r.label.replace(/ \(.*\)$/, ""),
    group: "spacecraft" as const,
    speedKmS: r.speedKmS,
    kind: "measured" as const,
    description: r.description,
    frame: r.frame,
    sourceId: r.sourceId,
    ftl: false,
  }));
}

export type CustomSpeedUnit = "km/s" | "km/h" | "c";

export function customSpeedKmS(value: number, unit: CustomSpeedUnit): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const v = unit === "km/s" ? value : unit === "km/h" ? kmhToKms(value) : value * C_KM_S;
  // Custom speeds are physical comparisons, so cap at light speed.
  if (v > C_KM_S) return null;
  return v;
}

export function customMode(speedKmS: number): TransportMode {
  return {
    id: "custom",
    label: "Custom speed",
    shortLabel: "Custom",
    group: "custom",
    speedKmS,
    kind: "user",
    description: "Your chosen constant speed (up to light speed).",
    ftl: false,
  };
}

export function allModes(refs: SpeedReference[], custom: number | null, fictional = FICTIONAL_DEFAULTS): TransportMode[] {
  return [
    LIGHT_MODE,
    ...spacecraftModes(refs),
    ...(custom ? [customMode(custom)] : []),
    ...fictionalModes(fictional.enterprise, fictional.falcon),
    ...EVERYDAY_MODES,
  ];
}
