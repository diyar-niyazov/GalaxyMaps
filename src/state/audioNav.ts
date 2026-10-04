import { useStore } from "./store";
import { positionAt } from "../data/bundle";
import { describeView, nameWithKind, nearbyObjects, type Nearby } from "../lib/viewDescription";
import { formatDistance } from "../lib/format";
import { focusObject } from "./actions";
import { announce } from "./announcer";
import type { Vec3 } from "../lib/types";

/** Nearby objects relative to the selected object, else to the map center. */
export function currentNearby(limit = 12): { anchorName: string | null; anchorId: string | null; list: Nearby[] } {
  const st = useStore.getState();
  const data = st.data;
  const info = st.viewInfo;
  if (!data || !info) return { anchorName: null, anchorId: null, list: [] };
  const pos = (o: Parameters<typeof positionAt>[1]) => positionAt(data, o, st.jd);
  const sel = st.selectedId ? data.byId.get(st.selectedId) ?? null : null;
  const anchor: Vec3 | null = (sel && pos(sel)) || info.view.center;
  const list = nearbyObjects(data.catalog.objects, pos, anchor, { exclude: sel?.id, radiusKm: info.view.widthKm, limit });
  return { anchorName: sel?.name ?? null, anchorId: sel?.id ?? null, list };
}

export function currentViewDescription(): string {
  const st = useStore.getState();
  const data = st.data, info = st.viewInfo;
  if (!data || !info) return "The map is still loading.";
  const sel = st.selectedId ? data.byId.get(st.selectedId) ?? null : null;
  const routeNames = st.panel === "directions" ? st.stops.filter((s): s is string => !!s).map((id) => data.byId.get(id)?.name ?? id) : undefined;
  return describeView({ mode: info.mode, widthKm: info.view.widthKm, plane: info.plane, universe: info.universe, selected: sel, routeNames, nearby: currentNearby(5).list });
}

export function describeCurrentView(): string {
  const text = currentViewDescription();
  announce(text);
  return text;
}

let cycle: { anchorId: string | null; ids: string[] } | null = null;

/** Move to the previous/next object near the current anchor, lock onto it and announce it. */
export function stepNearby(dir: 1 | -1): string | null {
  const st = useStore.getState();
  const data = st.data;
  if (!data) return null;
  // Keep the same ring while the user cycles; rebuild when they selected something else.
  if (!cycle || (st.selectedId !== cycle.anchorId && !cycle.ids.includes(st.selectedId ?? ""))) {
    const { anchorId, list } = currentNearby();
    cycle = { anchorId, ids: [...(anchorId ? [anchorId] : []), ...list.map((n) => n.obj.id)] };
  }
  const ids = cycle.ids;
  if (ids.length === 0) { announce("No catalogued destinations nearby."); return null; }
  const i = st.selectedId ? ids.indexOf(st.selectedId) : -1;
  const next = ids[(i + dir + ids.length) % ids.length];
  const obj = data.byId.get(next)!;
  focusObject(next);
  const anchor = cycle.anchorId ? data.byId.get(cycle.anchorId) : null;
  const a = anchor && anchor.id !== next ? positionAt(data, anchor, st.jd) : null;
  const b = positionAt(data, obj, st.jd);
  const rel = a && b ? ` ${formatDistance(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))} from ${anchor!.name}.` : "";
  const text = `${nameWithKind(obj)}.${rel} ${ids.indexOf(next) + 1} of ${ids.length}.`;
  announce(text);
  return text;
}
