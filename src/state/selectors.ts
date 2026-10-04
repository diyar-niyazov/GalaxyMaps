import { useMemo } from "react";
import { useStore } from "./store";
import { travelModes, LIGHT_MODE, type TransportMode } from "../lib/transport";
import { computeRoute, type RouteModelPreference, type RouteResult } from "../lib/route";
import type { CatalogObject } from "../lib/types";
import type { DataBundle } from "../data/bundle";
import type { CameraMode } from "../map/MapEngine";
import { useComparison } from "./comparison";
import { useEarthSky } from "./earthSky";

/**
 * The one focused experience the user is in. Comparison overlays the map without moving it, so it
 * takes precedence over the camera mode underneath; Back/Esc leave it first.
 */
export type Experience = "explore" | "locked" | "route" | "comparison" | "sky";
export const experienceOf = (camera: CameraMode, comparing: boolean, sky = false): Experience => sky ? "sky" : comparing ? "comparison" : camera;
export const currentExperience = (): Experience => experienceOf(useStore.getState().camera.mode, useComparison.getState().open, useEarthSky.getState().open);
export function useExperience(): Experience {
  const camera = useStore((s) => s.camera.mode);
  const comparing = useComparison((s) => s.open);
  const sky = useEarthSky((s) => s.open);
  return experienceOf(camera, comparing, sky);
}

export function modesFor(data: DataBundle | null): TransportMode[] {
  return travelModes(data?.catalog.speedReferences ?? []);
}

export function useModes(): TransportMode[] {
  const data = useStore((s) => s.data);
  return useMemo(() => modesFor(data), [data]);
}

export function useMode(): TransportMode {
  const modes = useModes();
  const modeId = useStore((s) => s.modeId);
  return modes.find((m) => m.id === modeId) ?? LIGHT_MODE;
}

export function useStopObjects(): (CatalogObject | null)[] {
  const data = useStore((s) => s.data);
  const stops = useStore((s) => s.stops);
  return useMemo(() => stops.map((id) => (id && data ? data.byId.get(id) ?? null : null)), [data, stops]);
}

export function routeFor(data: DataBundle, stopIds: (string | null)[], mode: TransportMode, jd: number, model: RouteModelPreference = "auto"): RouteResult | null {
  const objs = stopIds.map((id) => (id ? data.byId.get(id) : undefined));
  if (objs.some((o) => !o)) return null;
  return computeRoute(objs as CatalogObject[], mode, { eph: data.eph, jdTdb: jd }, model);
}

/** Use the same epoch as cards and the renderer; store clock updates are already bounded. */
export function useRoute(): RouteResult | null {
  const data = useStore((s) => s.data);
  const stops = useStore((s) => s.stops);
  const day = useStore((s) => s.jd);
  const model = useStore((s) => s.routeModel);
  const mode = useMode();
  return useMemo(() => (data ? routeFor(data, stops, mode, day, model) : null), [data, stops, mode, day, model]);
}
