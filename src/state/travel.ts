import { create } from "zustand";
import { useStore } from "./store";
import { getEngine } from "../map/engineRef";
import { modesFor, routeFor } from "./selectors";
import { focusObject } from "./actions";
import { rememberView } from "./navigation";
import { announce } from "./announcer";
import { formatDuration } from "../lib/format";
import type { RouteResult } from "../lib/route";
import { reducedMotion } from "../lib/motion";

export const JOURNEYS = [
  { id: "earth-mars", stops: ["earth", "mars"], mode: "light", title: "Earth → Mars" },
  { id: "earth-proxima", stops: ["earth", "proxima-centauri"], mode: "voyager-1", title: "Earth → Proxima Centauri" },
  { id: "star-tour", stops: ["earth", "sirius", "vega", "polaris"], mode: "light", title: "Star tour at light speed" },
] as const;

export type TravelPhase = "idle" | "preview" | "flying" | "paused";

/** Visualization speeds: the animation length only, never the vehicle's physical speed. */
export const TRAVEL_SPEEDS = [
  { id: 0.5, label: "Slow", seconds: 28 },
  { id: 1, label: "Normal", seconds: 16 },
  { id: 2, label: "Fast", seconds: 8 },
] as const;

export interface TravelSummary {
  stops: string[];
  originName: string;
  destinationId: string;
  destinationName: string;
  vehicle: string;
  duration: string;
  model: string;
  modelKind: "modeled" | "benchmark";
}

interface TravelState {
  phase: TravelPhase;
  speed: (typeof TRAVEL_SPEEDS)[number]["id"];
  summary: TravelSummary | null;
  setSpeed(speed: TravelState["speed"]): void;
}

export const useTravel = create<TravelState>((set) => ({
  phase: "idle",
  speed: 1,
  summary: null,
  setSpeed: (speed) => {
    set({ speed });
    useStore.getState().setPlaybackSeconds(TRAVEL_SPEEDS.find((s) => s.id === speed)!.seconds);
  },
}));


function currentRoute(): { route: Extract<RouteResult, { ok: true }>; vehicle: string } | null {
  const st = useStore.getState();
  if (!st.data) return null;
  const mode = modesFor(st.data).find((m) => m.id === st.modeId) ?? modesFor(st.data)[0];
  const r = routeFor(st.data, st.stops, mode, st.jd, st.routeModel);
  return r?.ok ? { route: r, vehicle: mode.label } : null;
}

export function describeRoute(): TravelSummary | null {
  const cur = currentRoute();
  if (!cur) return null;
  const { route, vehicle } = cur;
  const dest = route.stops[route.stops.length - 1];
  const orbital = route.kind === "orbital-transfer";
  return {
    stops: route.stops.map((o) => o.id),
    originName: route.stops[0].name,
    destinationId: dest.id,
    destinationName: dest.name,
    vehicle: orbital ? "Idealized spacecraft transfer" : vehicle,
    duration: formatDuration(route.modeledSeconds),
    model: orbital
      ? "Idealized Hohmann transfer, calculated by GalaxyMaps. The animation compresses the real flight time."
      : "Straight-line, constant-speed benchmark. The path is illustrative, not a mission trajectory, and the animation is compressed.",
    modelKind: orbital ? "modeled" : "benchmark",
  };
}

/** Show the Begin-journey preview for the current complete route. Returns false if none. */
export function beginTravel(): boolean {
  const summary = describeRoute();
  if (!summary) return false;
  const st = useStore.getState();
  st.setPlaying(false);
  st.setProgress(0);
  st.setPanel("directions");
  st.requestFit();
  useTravel.setState({ phase: "preview", summary });
  announce(`Journey ready: ${summary.originName} to ${summary.destinationName}. ${summary.vehicle}, ${summary.duration}. ${summary.model} Choose Start or Cancel.`);
  return true;
}

export function startTravel(): void {
  const t = useTravel.getState();
  if (!t.summary) return;
  rememberView();
  const st = useStore.getState();
  st.pauseTime();
  if (reducedMotion()) {
    announce(`Reduced motion: skipping the travel animation.`);
    arrive();
    return;
  }
  st.setPlaybackSeconds(TRAVEL_SPEEDS.find((s) => s.id === t.speed)!.seconds);
  st.setProgress(0);
  // The engine follows the playback position once playback has a route to follow.
  getEngine()?.setTravel(true);
  st.setPlaying(true);
  useTravel.setState({ phase: "flying" });
  announce(`Departing ${t.summary.originName}.`);
}

export function pauseTravel(): void {
  if (useTravel.getState().phase !== "flying") return;
  useStore.getState().setPlaying(false);
  useTravel.setState({ phase: "paused" });
  announce("Journey paused.");
}

export function resumeTravel(): void {
  if (useTravel.getState().phase !== "paused") return;
  const st = useStore.getState();
  if (st.panel !== "directions") st.setPanel("directions");
  getEngine()?.setTravel(true);
  st.setPlaying(true);
  useTravel.setState({ phase: "flying" });
  announce("Journey resumed.");
}

export function skipTravel(): void {
  if (useTravel.getState().phase === "idle") return;
  arrive();
}

export function cancelTravel(): void {
  if (useTravel.getState().phase === "idle") return;
  getEngine()?.setTravel(false);
  const st = useStore.getState();
  st.setPlaying(false);
  st.setProgress(0);
  useTravel.setState({ phase: "idle" });
  st.requestFit();
  announce("Journey cancelled. The route is still shown.");
}

function arrive(): void {
  const t = useTravel.getState();
  const summary = t.summary;
  getEngine()?.setTravel(false);
  useTravel.setState({ phase: "idle" });
  const st = useStore.getState();
  st.setPlaying(false);
  st.setProgress(1);
  if (!summary) return;
  focusObject(summary.destinationId);
  useStore.getState().setPanel("place");
  announce(`Arrived at ${summary.destinationName}. The camera is locked to it and its destination card is open. Calculated journey: ${summary.duration} by ${summary.vehicle}.`);
}

/** Playback reaching the end while flying completes the journey. */
useStore.subscribe((s, prev) => {
  const phase = useTravel.getState().phase;
  if (phase === "idle") return;
  if (s.stops !== prev.stops) { cancelTravel(); return; }
  if (phase !== "flying") return;
  if (s.progress >= 1 && prev.progress < 1) arrive();
  else if (!s.playing && prev.playing) useTravel.setState({ phase: "paused" });
});

/** Load a curated journey into Directions; `travel` also opens the Begin-journey preview. */
export function startJourney(id: string, travel = false): boolean {
  const j = JOURNEYS.find((x) => x.id === id);
  const st = useStore.getState();
  if (!j || !st.data || j.stops.some((s) => !st.data!.byId.has(s))) return false;
  rememberView();
  st.setMode(j.mode);
  st.setRouteModel("auto");
  useStore.setState({ stops: [...j.stops], progress: 0, playing: false });
  st.setPanel("directions");
  st.requestFit();
  announce(`Journey loaded: ${j.title}. Directions are open${travel ? "" : "; choose Begin journey to travel"}.`);
  if (travel) beginTravel();
  return true;
}
