import { create } from "zustand";
import type { DataBundle } from "../data/bundle";
import type { Layer, ViewInfo } from "../map/MapEngine";
import { jdTdb } from "../lib/units";
import { clampJd } from "../lib/ephemeris";
import { FICTIONAL_DEFAULTS, type CustomSpeedUnit } from "../lib/transport";

export type Panel = "explore" | "place" | "directions" | "guide" | "transfer";

export interface GuideMessage {
  id: number;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  /** Where the text came from, shown to the user. */
  origin?: "grok" | "offline" | "app";
}

export interface AppState {
  data: DataBundle | null;
  loadError: string | null;
  jd: number;
  layer: Layer;
  panel: Panel;
  selectedId: string | null;
  stops: (string | null)[];
  modeId: string;
  custom: { value: number; unit: CustomSpeedUnit };
  fictional: { enterprise: number; falcon: number };
  playing: boolean;
  progress: number;
  playbackSeconds: number;
  tilt: boolean;
  viewInfo: ViewInfo | null;
  aboutOpen: boolean;
  guide: GuideMessage[];
  transfer: { t: number; playing: boolean };
  /** Incremented to request the map to fit the current route. */
  fitRequest: number;

  setData(d: DataBundle): void;
  setLoadError(e: string): void;
  setLayer(l: Layer): void;
  setPanel(p: Panel): void;
  select(id: string | null): void;
  openDirections(destinationId?: string | null, originId?: string | null): void;
  setStop(index: number, id: string | null): void;
  swapStops(): void;
  addStop(id?: string | null, at?: number): void;
  removeStop(index: number): void;
  moveStop(index: number, dir: -1 | 1): void;
  setMode(id: string): void;
  setCustom(c: { value: number; unit: CustomSpeedUnit }): void;
  setFictional(f: Partial<{ enterprise: number; falcon: number }>): void;
  setPlaying(p: boolean): void;
  setProgress(p: number): void;
  setPlaybackSeconds(s: number): void;
  setTilt(t: boolean): void;
  setViewInfo(v: ViewInfo): void;
  setAboutOpen(o: boolean): void;
  pushGuide(m: Omit<GuideMessage, "id">): void;
  clearGuide(): void;
  setTransfer(t: Partial<{ t: number; playing: boolean }>): void;
  requestFit(): void;
}

let msgId = 1;
export const MAX_STOPS = 5;

export const useStore = create<AppState>((set, get) => ({
  data: null,
  loadError: null,
  jd: jdTdb(new Date()),
  layer: "realistic",
  panel: "explore",
  selectedId: null,
  stops: [null, null],
  modeId: "light",
  custom: { value: 0.1, unit: "c" },
  fictional: { ...FICTIONAL_DEFAULTS },
  playing: false,
  progress: 0,
  playbackSeconds: 10,
  tilt: false,
  viewInfo: null,
  aboutOpen: false,
  guide: [],
  transfer: { t: 0, playing: false },
  fitRequest: 0,

  setData: (d) => set({ data: d, jd: clampJd(d.eph, get().jd) }),
  setLoadError: (e) => set({ loadError: e }),
  setLayer: (l) => set({ layer: l }),
  setPanel: (p) => set({ panel: p, ...(p !== "directions" ? { playing: false } : {}) }),
  select: (id) => set((s) => ({ selectedId: id, panel: id ? (s.panel === "directions" || s.panel === "guide" ? s.panel : "place") : s.panel === "place" ? "explore" : s.panel })),
  openDirections: (destinationId, originId) =>
    set((s) => {
      const stops = [...s.stops];
      if (destinationId !== undefined) stops[stops.length - 1] = destinationId;
      if (originId !== undefined) stops[0] = originId;
      else if (!stops[0] && destinationId !== "earth") stops[0] = "earth";
      return { panel: "directions", stops, progress: 0, playing: false, fitRequest: s.fitRequest + 1 };
    }),
  setStop: (i, id) => set((s) => {
    const stops = [...s.stops];
    stops[i] = id;
    return { stops, progress: 0, playing: false, fitRequest: s.fitRequest + 1 };
  }),
  swapStops: () => set((s) => ({ stops: [...s.stops].reverse(), progress: 0, playing: false, fitRequest: s.fitRequest + 1 })),
  addStop: (id = null, at) => set((s) => {
    if (s.stops.length >= MAX_STOPS) return {};
    const stops = [...s.stops];
    stops.splice(at ?? stops.length - 1, 0, id);
    return { stops, progress: 0, playing: false, fitRequest: s.fitRequest + (id ? 1 : 0) };
  }),
  removeStop: (i) => set((s) => {
    if (s.stops.length <= 2) {
      const stops = [...s.stops];
      stops[i] = null;
      return { stops, progress: 0, playing: false };
    }
    return { stops: s.stops.filter((_, j) => j !== i), progress: 0, playing: false, fitRequest: s.fitRequest + 1 };
  }),
  moveStop: (i, dir) => set((s) => {
    const j = i + dir;
    if (j < 0 || j >= s.stops.length) return {};
    const stops = [...s.stops];
    [stops[i], stops[j]] = [stops[j], stops[i]];
    return { stops, progress: 0, playing: false, fitRequest: s.fitRequest + 1 };
  }),
  setMode: (id) => set({ modeId: id }),
  setCustom: (c) => set({ custom: c, modeId: "custom" }),
  setFictional: (f) => set((s) => ({ fictional: { ...s.fictional, ...f } })),
  setPlaying: (p) => set((s) => ({ playing: p, progress: p && s.progress >= 1 ? 0 : s.progress })),
  setProgress: (p) => set({ progress: p }),
  setPlaybackSeconds: (sec) => set({ playbackSeconds: sec }),
  setTilt: (t) => set({ tilt: t }),
  setViewInfo: (v) => set({ viewInfo: v }),
  setAboutOpen: (o) => set({ aboutOpen: o }),
  pushGuide: (m) => set((s) => ({ guide: [...s.guide, { ...m, id: msgId++ }] })),
  clearGuide: () => set({ guide: [] }),
  setTransfer: (t) => set((s) => ({ transfer: { ...s.transfer, ...t } })),
  requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
}));
