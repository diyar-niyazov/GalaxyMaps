import { create } from "zustand";
import { useStore } from "./store";
import { comparisonSize, suggestedComparisonId, type ComparisonDisplayMode } from "../lib/comparison";

export interface ComparisonViewState {
  pair: [string, string];
  mode: ComparisonDisplayMode;
  rotation: [number, number];
  zoom: number;
}

interface ComparisonState {
  open: boolean;
  leftId: string | null;
  rightId: string | null;
  initialPair: [string, string] | null;
  displayMode: ComparisonDisplayMode;
  rotation: [number, number];
  zoom: number;
  setObject(side: "left" | "right", id: string): boolean;
  swap(): void;
  reset(): void;
  setDisplayMode(mode: ComparisonDisplayMode): void;
  setRotation(rotation: [number, number]): void;
  setZoom(zoom: number): void;
  close(): void;
}

type NavigationHooks = { capture(): unknown; restore(snapshot: unknown): void };
let previousView: unknown;
let navigation: NavigationHooks | null = null;

/** Root configures the exact camera/navigation snapshot without coupling stores together. */
export function configureComparisonNavigation<T>(capture: () => T, restore: (snapshot: T) => void): void {
  navigation = { capture, restore: (snapshot) => restore(snapshot as T) };
}

export const useComparison = create<ComparisonState>((set, get) => ({
  open: false,
  leftId: null,
  rightId: null,
  initialPair: null,
  displayMode: "true-scale",
  rotation: [0.12, -0.45],
  zoom: 1,
  setObject: (side, id) => {
    const object = useStore.getState().data?.byId.get(id);
    if (!object || !comparisonSize(object)) return false;
    set(side === "left" ? { leftId: id } : { rightId: id });
    return true;
  },
  swap: () => set((s) => ({ leftId: s.rightId, rightId: s.leftId })),
  reset: () => {
    const pair = get().initialPair;
    set({ ...(pair ? { leftId: pair[0], rightId: pair[1] } : {}), displayMode: "true-scale", rotation: [0.12, -0.45], zoom: 1 });
  },
  setDisplayMode: (mode) => set({ displayMode: mode === "fit-both" ? mode : "true-scale", zoom: 1 }),
  setRotation: ([x, y]) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    set({ rotation: [Math.max(-Math.PI / 2, Math.min(Math.PI / 2, x)), ((y + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI] });
  },
  setZoom: (zoom) => { if (Number.isFinite(zoom)) set({ zoom: Math.max(0.6, Math.min(1.6, zoom)) }); },
  close: () => {
    set({ open: false });
    if (navigation && previousView !== undefined) navigation.restore(previousView);
    previousView = undefined;
  },
}));

export function openComparison(id: string, otherId?: string): boolean {
  const st = useStore.getState();
  const object = st.data?.byId.get(id);
  if (!object || !comparisonSize(object) || !st.data) return false;
  const other = otherId ? st.data.byId.get(otherId) : null;
  const rightId = other && comparisonSize(other) ? other.id : suggestedComparisonId(object, st.data.byId);
  if (!rightId) return false;
  if (!useComparison.getState().open) previousView = navigation?.capture();
  useComparison.setState({ open: true, leftId: id, rightId, initialPair: [id, rightId], displayMode: "true-scale", rotation: [0.12, -0.45], zoom: 1 });
  // The comparison doesn't move the map. Pause the two clocks while inspecting it.
  st.setPlaying(false);
  st.pauseTime();
  st.setOrbitCamera(false);
  if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 720px)").matches) st.setSheet("full");
  return true;
}

export function comparisonUrlState(): ComparisonViewState | null {
  const state = useComparison.getState();
  if (!state.open || !state.leftId || !state.rightId) return null;
  return { pair: [state.leftId, state.rightId], mode: state.displayMode, rotation: [...state.rotation], zoom: state.zoom };
}

/** Catalog IDs and sourced capabilities are validated again after the bundle loads. */
export function hydrateComparison(state: ComparisonViewState): boolean {
  if (!state || !Array.isArray(state.pair) || state.pair.length !== 2 || state.pair.some((id) => typeof id !== "string" || id.length > 100)) return false;
  const data = useStore.getState().data;
  if (!data || state.pair.some((id) => { const obj = data.byId.get(id); return !obj || !comparisonSize(obj); })) return false;
  if (state.mode !== "true-scale" && state.mode !== "fit-both") return false;
  if (!Array.isArray(state.rotation) || state.rotation.length !== 2 || !state.rotation.every(Number.isFinite) || !Number.isFinite(state.zoom)) return false;
  if (!openComparison(state.pair[0], state.pair[1])) return false;
  const store = useComparison.getState();
  store.setDisplayMode(state.mode);
  store.setRotation(state.rotation);
  store.setZoom(state.zoom);
  return true;
}
