import { create } from "zustand";
import { useStore } from "./store";
import { captureView, restoreView, type ViewSnapshot } from "./navigation";
import { focusObject } from "./actions";
import { getEngine } from "../map/engineRef";
import { availableTours, chooseDiscovery, discoveryCandidates, getTour, type DiscoveryIntent, type DiscoveryPick } from "../lib/discovery";
import { useLibrary } from "./library";

interface DiscoveryState {
  intent: DiscoveryIntent;
  originId: string;
  surprise: DiscoveryPick | null;
  recentSurprises: string[];
  error: string | null;
  activeTourId: string | null;
  stopIndex: number;
  started: boolean;
  paused: boolean;
  previousView: ViewSnapshot | null;
  setIntent(intent: DiscoveryIntent): void;
  setOrigin(id: string): void;
  surpriseMe(): void;
  dismissSurprise(): void;
  exitSurprise(): void;
  openTour(id: string): void;
  startTour(): void;
  jumpTo(index: number): void;
  pauseTour(): void;
  resumeTour(): void;
  exitTour(): void;
  restoreTour(id: string, stop: number): boolean;
}

function focusStop(tourId: string, index: number) {
  const stop = getTour(tourId)?.stops[index];
  if (!stop) return;
  useStore.getState().pauseTime();
  useStore.getState().setOrbitCamera(false);
  focusObject(stop.focusId ?? stop.objectId, true);
  useStore.getState().setPanel("explore");
  useLibrary.getState().remember(stop.objectId);
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  intent: "beautiful", originId: "earth", surprise: null, recentSurprises: [], error: null,
  activeTourId: null, stopIndex: 0, started: false, paused: false, previousView: null,
  setIntent: (intent) => set({ intent, error: null }),
  setOrigin: (originId) => set({ originId, error: null }),
  surpriseMe: () => {
    const app = useStore.getState();
    const s = get();
    if (!app.data) return;
    const picks = discoveryCandidates(app.data, s.intent, s.originId, app.jd);
    const pick = chooseDiscovery(picks, s.recentSurprises);
    if (!pick) {
      set({ error: s.intent === "nearby" ? "Physical proximity is unavailable from this origin. Choose Earth, Beautiful or Strange instead." : "No image-rich destinations are available for this theme yet. Try another theme." });
      return;
    }
    const previousView = s.surprise ? s.previousView : captureView();
    set({ surprise: pick, recentSurprises: [pick.object.id, ...s.recentSurprises.filter((id) => id !== pick.object.id)].slice(0, 12), previousView, activeTourId: null, error: null });
    app.pauseTime();
    app.setOrbitCamera(false);
    focusObject(pick.object.id);
    useStore.getState().setPanel("place");
    useLibrary.getState().remember(pick.object.id);
  },
  dismissSurprise: () => set({ surprise: null, previousView: null }),
  exitSurprise: () => {
    const previousView = get().previousView;
    set({ surprise: null, previousView: null });
    if (previousView) restoreView(previousView);
  },
  openTour: (id) => {
    const data = useStore.getState().data;
    if (!data || !availableTours(data).some((tour) => tour.id === id)) return;
    const previousView = get().activeTourId ? get().previousView : captureView();
    set({ activeTourId: id, stopIndex: 0, started: false, paused: false, surprise: null, previousView, error: null });
    // Overview changes only the panel. The camera waits for an explicit Start.
    useStore.getState().setPanel("explore");
  },
  startTour: () => {
    const s = get();
    if (!s.activeTourId) return;
    set({ started: true, paused: false });
    focusStop(s.activeTourId, s.stopIndex);
  },
  jumpTo: (index) => {
    const s = get();
    const tour = getTour(s.activeTourId);
    if (!tour || !Number.isFinite(index)) return;
    const stopIndex = Math.min(tour.stops.length - 1, Math.max(0, Math.trunc(index)));
    set({ stopIndex });
    if (s.started && !s.paused) focusStop(tour.id, stopIndex);
  },
  pauseTour: () => {
    if (!get().started) return;
    set({ paused: true });
    getEngine()?.unlock();
  },
  resumeTour: () => {
    const s = get();
    if (!s.activeTourId) return;
    set({ paused: false, started: true });
    focusStop(s.activeTourId, s.stopIndex);
  },
  exitTour: () => {
    const previousView = get().previousView;
    set({ activeTourId: null, stopIndex: 0, started: false, paused: false, previousView: null });
    if (previousView) restoreView(previousView);
    else useStore.getState().setPanel("explore");
  },
  restoreTour: (id, index) => {
    const data = useStore.getState().data;
    const tour = data && availableTours(data).find((t) => t.id === id);
    if (!tour || !Number.isFinite(index)) return false;
    const stopIndex = Math.min(tour.stops.length - 1, Math.max(0, Math.trunc(index)));
    set({ activeTourId: id, stopIndex, started: true, paused: false, surprise: null, previousView: captureView(), error: null });
    focusStop(id, stopIndex);
    return true;
  },
}));
