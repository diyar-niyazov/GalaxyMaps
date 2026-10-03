import { useMemo } from "react";
import { useStore } from "./store";
import { travelModes, LIGHT_MODE, type TransportMode } from "../lib/transport";
import { computeRoute, type RouteModelPreference, type RouteResult } from "../lib/route";
import type { CatalogObject } from "../lib/types";
import type { DataBundle } from "../data/bundle";

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

/** Route recomputation is throttled to whole days so the Play-time clock does not rerun it every tick. */
export function useRoute(): RouteResult | null {
  const data = useStore((s) => s.data);
  const stops = useStore((s) => s.stops);
  const day = useStore((s) => Math.round(s.jd * 4) / 4);
  const model = useStore((s) => s.routeModel);
  const mode = useMode();
  return useMemo(() => (data ? routeFor(data, stops, mode, day, model) : null), [data, stops, mode, day, model]);
}
