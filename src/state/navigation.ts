import { create } from "zustand";
import { useStore, type Panel, type ModeId, type SheetState } from "./store";
import { getEngine } from "../map/engineRef";
import type { View } from "../map/projection";
import type { Layer, CameraMode } from "../map/MapEngine";
import type { RouteModelPreference } from "../lib/route";
import { restoreCatalogId } from "../data/bundle";

export interface ViewSnapshot {
  selectedId: string | null; panel: Panel; layer: Layer; jd: number;
  stops: (string | null)[]; modeId: ModeId; routeModel: RouteModelPreference;
  progress: number; inside: string | null; sheet: SheetState;
  camera: { mode: CameraMode; lockedId: string | null }; view: View | null;
}
export function captureView(): ViewSnapshot {
  const s = useStore.getState();
  const engine = getEngine(), v = engine?.info().view;
  return { selectedId: s.selectedId, panel: s.panel, layer: s.layer, jd: engine?.getJd() ?? s.jd, stops: [...s.stops], modeId: s.modeId, routeModel: s.routeModel, progress: s.progress, inside: s.inside, sheet: s.sheet, camera: { ...s.camera }, view: v ? { ...v, center: [...v.center] } : null };
}
export function restoreView(v: ViewSnapshot) {
  const data = useStore.getState().data;
  if (!data) return;
  [v.selectedId, v.camera.lockedId, ...v.stops].forEach((id) => { if (id) restoreCatalogId(data, id); });
  const selectedId = v.selectedId && data.byId.has(v.selectedId) ? v.selectedId : null;
  useStore.getState().pauseTime();
  useStore.setState({ selectedId, panel: v.panel === "place" && !selectedId ? "explore" : v.panel, layer: v.layer, jd: v.jd, stops: v.stops.map((id) => id && data.byId.has(id) ? id : null), modeId: v.modeId, routeModel: v.routeModel, progress: v.progress, playing: false, inside: v.inside && data.byId.has(v.inside) ? v.inside : null, sheet: v.sheet, orbitCamera: false });
  const e = getEngine();
  if (!e || !v.view) return;
  e.setJd(v.jd);
  e.restoreView(v.view, v.camera.mode, v.camera.lockedId);
}
const MAX_HISTORY = 24;
let snapshotUrl: (() => string) | null = null;
/** Index of the current browser history entry among the entries rememberView pushed. */
let browserIndex = 0;
const browserLinked = () => snapshotUrl != null && typeof history !== "undefined";

export const useNavigation = create<{ history: ViewSnapshot[]; back(): boolean; restoreSteps(n: number): boolean }>((set, get) => ({
  history: [],
  /** In-app Back goes through the browser so both Back buttons walk the same history. */
  back: () => {
    if (!get().history.length) return false;
    if (browserLinked()) history.back();
    else get().restoreSteps(1);
    return true;
  },
  restoreSteps: (n) => {
    const stack = get().history;
    if (n < 1 || !stack.length) return false;
    const k = Math.min(n, stack.length);
    const v = stack[stack.length - k];
    set({ history: stack.slice(0, stack.length - k) });
    restoreView(v);
    return true;
  },
}));
const validatedIndex = (state: unknown) => { const n = (state as { gm?: unknown } | null)?.gm; return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : 0; };
export const configureNavigationUrl = (serialize: (() => string) | null) => {
  snapshotUrl = serialize;
  if (serialize && typeof history !== "undefined") browserIndex = validatedIndex(history.state);
};
export const historyState = () => ({ gm: browserIndex });

/**
 * Browser popstate: going back to an entry we pushed restores the matching in-memory snapshot
 * (exact camera pose). Returns false when the caller should fall back to the URL (forward
 * navigation, or entries from before this page load).
 */
export function handleBrowserPop(state: unknown): boolean {
  const idx = validatedIndex(state);
  const steps = browserIndex - idx;
  browserIndex = idx;
  // Forward/reloaded entries and jumps beyond the bounded cache restore their own URL.
  if (steps <= 0 || steps > useNavigation.getState().history.length) { useNavigation.setState({ history: [] }); return false; }
  return useNavigation.getState().restoreSteps(steps);
}

export function rememberView() {
  const v = captureView();
  if (!v.view) return;
  useNavigation.setState((s) => ({ history: [...s.history, v].slice(-MAX_HISTORY) }));
  if (browserLinked()) {
    history.replaceState(history.state, "", snapshotUrl!());
    browserIndex += 1;
    history.pushState(historyState(), "", location.href);
  }
}
