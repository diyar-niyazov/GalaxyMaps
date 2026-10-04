import { create } from "zustand";
import { useStore } from "./store";
import { captureView, restoreView, type ViewSnapshot } from "./navigation";
import { earthSkyDirection, normalizedSkyCenter, type EarthSkyDirection, type SkyCenter } from "../lib/earthSky";
import { raDecFromVector } from "../lib/coords";
import type { Vec3 } from "../lib/types";

interface EarthSkyState {
  open: boolean;
  target: EarthSkyDirection | null;
  center: SkyCenter;
  fieldDeg: number;
  previousView: ViewSnapshot | null;
  error: string | null;
  rotate(raDelta: number, decDelta: number): void;
  centerOn(direction: Vec3): void;
  recenter(): void;
  zoom(factor: number): void;
  close(restore?: boolean): void;
}

export const useEarthSky = create<EarthSkyState>((set, get) => ({
  open: false, target: null, center: { raDeg: 0, decDeg: 0 }, fieldDeg: 120, previousView: null, error: null,
  rotate: (raDelta, decDelta) => {
    if (!Number.isFinite(raDelta) || !Number.isFinite(decDelta)) return;
    const c = get().center;
    set({ center: normalizedSkyCenter({ raDeg: c.raDeg + raDelta, decDeg: c.decDeg + decDelta }) });
  },
  centerOn: (direction) => {
    if (direction.length !== 3 || !direction.every(Number.isFinite) || Math.hypot(...direction) === 0) return;
    set({ center: normalizedSkyCenter(raDecFromVector(direction)) });
  },
  recenter: () => {
    const target = get().target;
    if (target) set({ center: normalizedSkyCenter(target), fieldDeg: 120 });
  },
  zoom: (factor) => {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const degrees = 4 * Math.atan(Math.tan(get().fieldDeg * Math.PI / 720) / factor) * 180 / Math.PI;
    set({ fieldDeg: Math.max(35, Math.min(240, degrees)) });
  },
  close: (restore = true) => {
    const previous = get().previousView;
    set({ open: false, target: null, previousView: null, error: null });
    if (restore && previous) restoreView(previous);
  },
}));

/** Opens a flat, Earth-centered astrometric chart without moving the underlying map. */
export function openEarthSky(id: string): boolean {
  const app = useStore.getState();
  const object = app.data?.byId.get(id);
  if (app.xr.active) {
    useEarthSky.setState({ error: "The Earth sky chart is available outside immersive VR. Exit VR to open this view." });
    return false;
  }
  if (!app.data || !object) return false;
  const snapshot = captureView();
  const target = earthSkyDirection(object, app.data, snapshot.jd);
  if (!target) {
    useEarthSky.setState({ error: "This record has no usable direction from Earth for the selected date." });
    return false;
  }
  const previousView = useEarthSky.getState().open ? useEarthSky.getState().previousView : snapshot;
  app.pauseTime();
  app.setJd(snapshot.jd);
  app.setOrbitCamera(false);
  app.setPlaying(false);
  useEarthSky.setState({ open: true, target, center: normalizedSkyCenter(target), fieldDeg: 120, previousView, error: null });
  return true;
}
