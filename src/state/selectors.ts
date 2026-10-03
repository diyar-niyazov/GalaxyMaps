import { useMemo } from "react";
import { useStore } from "./store";
import { allModes, customSpeedKmS, type TransportMode } from "../lib/transport";
import { computeRoute, type RouteResult } from "../lib/route";
import type { CatalogObject } from "../lib/types";
import type { DataBundle } from "../data/bundle";
import { LIGHT_MODE } from "../lib/transport";

export function modesFor(data: DataBundle | null, custom: { value: number; unit: "km/s" | "km/h" | "c" }, fictional: { enterprise: number; falcon: number }): TransportMode[] {
  return allModes(data?.catalog.speedReferences ?? [], customSpeedKmS(custom.value, custom.unit), fictional);
}

export function useModes(): TransportMode[] {
  const data = useStore((s) => s.data);
  const custom = useStore((s) => s.custom);
  const fictional = useStore((s) => s.fictional);
  return useMemo(() => modesFor(data, custom, fictional), [data, custom, fictional]);
}

/** The selected mode, or null when it is invalid (e.g. a custom speed above c). */
export function useMode(): TransportMode | null {
  const modes = useModes();
  const modeId = useStore((s) => s.modeId);
  return modes.find((m) => m.id === modeId) ?? (modeId === "custom" ? null : LIGHT_MODE);
}

export function useStopObjects(): (CatalogObject | null)[] {
  const data = useStore((s) => s.data);
  const stops = useStore((s) => s.stops);
  return useMemo(() => stops.map((id) => (id && data ? data.byId.get(id) ?? null : null)), [data, stops]);
}

export function routeFor(data: DataBundle, stopIds: (string | null)[], mode: TransportMode, jd: number): RouteResult | null {
  const objs = stopIds.map((id) => (id ? data.byId.get(id) : undefined));
  if (objs.some((o) => !o)) return null;
  return computeRoute(objs as CatalogObject[], mode, { eph: data.eph, jdTdb: jd });
}

export function useRoute(): RouteResult | null {
  const data = useStore((s) => s.data);
  const stops = useStore((s) => s.stops);
  const jd = useStore((s) => s.jd);
  const mode = useMode();
  return useMemo(() => (data && mode ? routeFor(data, stops, mode, jd) : null), [data, stops, mode, jd]);
}
