import { create } from "zustand";
import type { DataBundle } from "../data/bundle";
import type { Layer, ViewInfo, CameraMode } from "../map/MapEngine";
import { jdTdb } from "../lib/units";
import { clampPlayJd } from "../lib/ephemeris";
import type { RouteModelPreference } from "../lib/route";

export type Panel = "explore" | "place" | "directions" | "guide";
export type SheetState = "collapsed" | "half" | "full";
export type ModeId = "light" | "voyager-1";

export interface GuideMessage {
  id: number;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  /** Where the text came from, shown to the user. */
  origin?: "grok" | "offline" | "app";
}

/** Simulation-clock rates, in simulated days per real second. */
export const TIME_RATES = [
  { id: "hour", label: "1 hour / s", daysPerSecond: 1 / 24 },
  { id: "day", label: "1 day / s", daysPerSecond: 1 },
  { id: "week", label: "1 week / s", daysPerSecond: 7 },
  { id: "month", label: "1 month / s", daysPerSecond: 30.4375 },
  { id: "year", label: "1 year / s", daysPerSecond: 365.25 },
] as const;
export type TimeRateId = (typeof TIME_RATES)[number]["id"];

export interface TimeState {
  /** The user pressed Play and has not pressed Pause. */
  armed: boolean;
  /** Clock currently advancing (armed and not suspended by interaction or a hidden page). */
  running: boolean;
  rate: TimeRateId;
  /** Date the clock started from, for Reset and the elapsed readout. */
  startJd: number;
}

export interface AppState {
  data: DataBundle | null;
  loadError: string | null;
  jd: number;
  layer: Layer;
  panel: Panel;
  selectedId: string | null;
  stops: (string | null)[];
  modeId: ModeId;
  routeModel: RouteModelPreference;
  playing: boolean;
  progress: number;
  playbackSeconds: number;
  tilt: boolean;
  viewInfo: ViewInfo | null;
  aboutOpen: boolean;
  guide: GuideMessage[];
  /** Incremented to request the map to fit the current route. */
  fitRequest: number;
  camera: { mode: CameraMode; lockedId: string | null };
  time: TimeState;
  orbitCamera: boolean;
  sidebarCollapsed: boolean;
  sheet: SheetState;
  /** Category filter emphasizing matching markers on the map (null = none). */
  categoryFilter: string | null;
  xr: { supported: boolean | null; active: boolean };
  /** Galaxy or system whose children the sidebar lists (Explore inside). */
  inside: string | null;

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
  setRouteModel(m: RouteModelPreference): void;
  setPlaying(p: boolean): void;
  setProgress(p: number): void;
  setPlaybackSeconds(s: number): void;
  setTilt(t: boolean): void;
  setViewInfo(v: ViewInfo): void;
  setAboutOpen(o: boolean): void;
  pushGuide(m: Omit<GuideMessage, "id">): void;
  clearGuide(): void;
  requestFit(): void;
  setCamera(c: { mode: CameraMode; lockedId: string | null }): void;
  setJd(jd: number): void;
  playTime(): void;
  pauseTime(): void;
  suspendTime(suspended: boolean): void;
  resetTime(): void;
  setTimeRate(r: TimeRateId): void;
  setOrbitCamera(o: boolean): void;
  setSidebarCollapsed(c: boolean): void;
  setSheet(s: SheetState): void;
  setCategoryFilter(id: string | null): void;
  setXr(x: Partial<{ supported: boolean | null; active: boolean }>): void;
  setInside(id: string | null): void;
}

let msgId = 1;
export const MAX_STOPS = 5;
const now = jdTdb(new Date());

export const useStore = create<AppState>((set, get) => ({
  data: null,
  loadError: null,
  jd: now,
  layer: "realistic",
  panel: "explore",
  selectedId: null,
  stops: [null, null],
  modeId: "light",
  routeModel: "auto",
  playing: false,
  progress: 0,
  playbackSeconds: 10,
  tilt: false,
  viewInfo: null,
  aboutOpen: false,
  guide: [],
  fitRequest: 0,
  camera: { mode: "explore", lockedId: null },
  time: { armed: false, running: false, rate: "day", startJd: now },
  orbitCamera: false,
  sidebarCollapsed: false,
  sheet: "collapsed",
  categoryFilter: null,
  xr: { supported: null, active: false },
  inside: null,

  setData: (d) => set({ data: d, jd: clampPlayJd(get().jd) }),
  setLoadError: (e) => set({ loadError: e }),
  setLayer: (l) => set({ layer: l }),
  setPanel: (p) => set({ panel: p, ...(p !== "directions" ? { playing: false } : {}) }),
  select: (id) => set((s) => ({ selectedId: id, panel: id ? (s.panel === "directions" || s.panel === "guide" ? s.panel : "place") : s.panel === "place" ? "explore" : s.panel, sheet: id && s.sheet === "collapsed" ? "half" : s.sheet })),
  openDirections: (destinationId, originId) =>
    set((s) => {
      const stops = [...s.stops];
      if (destinationId !== undefined) stops[stops.length - 1] = destinationId;
      if (originId !== undefined) stops[0] = originId;
      else if (!stops[0] && destinationId !== "earth") stops[0] = "earth";
      return { panel: "directions", stops, progress: 0, playing: false, fitRequest: s.fitRequest + 1, sheet: s.sheet === "collapsed" ? "half" : s.sheet };
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
  setMode: (id) => set({ modeId: id === "voyager-1" || id === "voyager-1-speed" ? "voyager-1" : "light" }),
  setRouteModel: (m) => set({ routeModel: m, progress: 0, playing: false }),
  setPlaying: (p) => set((s) => ({ playing: p, progress: p && s.progress >= 1 ? 0 : s.progress, ...(p ? { time: { ...s.time, armed: false, running: false } } : {}) })),
  setProgress: (p) => set({ progress: p }),
  setPlaybackSeconds: (sec) => set({ playbackSeconds: sec }),
  setTilt: (t) => set({ tilt: t }),
  setViewInfo: (v) => set({ viewInfo: v }),
  setAboutOpen: (o) => set({ aboutOpen: o }),
  pushGuide: (m) => set((s) => ({ guide: [...s.guide, { ...m, id: msgId++ }] })),
  clearGuide: () => set({ guide: [] }),
  requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
  setCamera: (c) => set({ camera: c }),
  setJd: (jd) => set({ jd: clampPlayJd(jd) }),
  playTime: () => set((s) => ({ playing: false, progress: 0, time: { ...s.time, armed: true, running: true, startJd: s.time.armed || s.time.running ? s.time.startJd : s.jd } })),
  pauseTime: () => set((s) => ({ time: { ...s.time, armed: false, running: false } })),
  suspendTime: (suspended) => set((s) => (s.time.armed ? { time: { ...s.time, running: !suspended } } : {})),
  resetTime: () => set((s) => ({ jd: s.time.startJd, time: { ...s.time, armed: false, running: false } })),
  setTimeRate: (r) => set((s) => ({ time: { ...s.time, rate: r } })),
  setOrbitCamera: (o) => set({ orbitCamera: o }),
  setSidebarCollapsed: (c) => set({ sidebarCollapsed: c }),
  setSheet: (sheet) => set({ sheet }),
  setCategoryFilter: (id) => set({ categoryFilter: id }),
  setXr: (x) => set((s) => ({ xr: { ...s.xr, ...x } })),
  setInside: (id) => set({ inside: id }),
}));
