import { useStore, MAX_STOPS } from "./store";
import { getEngine } from "../map/engineRef";
import { REGION_PRESETS } from "../map/presets";
import { captureView, restoreView, configureNavigationUrl, handleBrowserPop, type ViewSnapshot } from "./navigation";
import { comparisonUrlState, hydrateComparison, useComparison, type ComparisonViewState } from "./comparison";
import { useDiscoveryStore } from "./discovery";
import { PLAY_MIN_JD, PLAY_MAX_JD } from "../lib/ephemeris";
import { restoreCatalogId } from "../data/bundle";
import { openEarthSky, useEarthSky } from "./earthSky";
import { positionOf } from "../lib/route";

export interface SharedView { version: 2; view: ViewSnapshot; anchorId?: string; comparison?: ComparisonViewState; sky?: { id: string; center: { raDeg: number; decDeg: number }; fieldDeg: number }; tour?: { id: string; stop: number; started: boolean; paused?: boolean } }
export function parseSharedView(raw: string | null): SharedView | null {
  if (!raw || raw.length > 12000) return null;
  try {
    const state = JSON.parse(raw) as SharedView, v = state.view;
    if (state.version !== 2 || !v || !["explore", "place", "directions", "guide"].includes(v.panel) || !["realistic", "atlas"].includes(v.layer) || !Number.isFinite(v.jd) || v.jd < PLAY_MIN_JD || v.jd > PLAY_MAX_JD) return null;
    if (!Array.isArray(v.stops) || v.stops.length < 2 || v.stops.length > MAX_STOPS || v.stops.some((id) => id !== null && (typeof id !== "string" || id.length > 100))) return null;
    if (!v.camera || !["explore", "locked", "route"].includes(v.camera.mode) || !["light", "voyager-1"].includes(v.modeId) || !["auto", "straight-line"].includes(v.routeModel) || !["collapsed", "half", "full"].includes(v.sheet)) return null;
    if (![v.selectedId, v.inside, v.camera.lockedId].every((id) => id === null || typeof id === "string" && id.length <= 100) || !Number.isFinite(v.progress) || v.progress < 0 || v.progress > 1) return null;
    if (v.view && (!Array.isArray(v.view.center) || v.view.center.length !== 3 || !v.view.center.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e24) || !Number.isFinite(v.view.widthKm) || v.view.widthKm < 1 || v.view.widthKm > 2e22 || !Number.isFinite(v.view.heading) || !Number.isFinite(v.view.tilt))) return null;
    if (state.anchorId != null && (typeof state.anchorId !== "string" || state.anchorId !== v.camera.lockedId || v.camera.mode !== "locked" || !v.view)) return null;
    if (state.tour && (typeof state.tour.id !== "string" || !Number.isInteger(state.tour.stop) || state.tour.stop < 0 || typeof state.tour.started !== "boolean" || state.tour.paused != null && typeof state.tour.paused !== "boolean")) return null;
    if (state.comparison && (!Array.isArray(state.comparison.pair) || state.comparison.pair.length !== 2 || state.comparison.pair.some((id) => typeof id !== "string" || id.length > 100) || !["true-scale", "fit-both"].includes(state.comparison.mode) || !Array.isArray(state.comparison.rotation) || state.comparison.rotation.length !== 2 || !state.comparison.rotation.every((v) => Number.isFinite(v) && Math.abs(v) <= Math.PI) || !Number.isFinite(state.comparison.zoom) || state.comparison.zoom < .6 || state.comparison.zoom > 1.6)) return null;
    const sky = state.sky;
    if (sky && (state.comparison || typeof sky.id !== "string" || sky.id.length > 100 || !sky.center || !Number.isFinite(sky.center.raDeg) || sky.center.raDeg < 0 || sky.center.raDeg >= 360 || !Number.isFinite(sky.center.decDeg) || Math.abs(sky.center.decDeg) > 90 || !Number.isFinite(sky.fieldDeg) || sky.fieldDeg < 35 || sky.fieldDeg > 240)) return null;
    return state;
  } catch { return null; }
}
export function currentShareUrl(): string {
  const comparison = comparisonUrlState(), d = useDiscoveryStore.getState(), chart = useEarthSky.getState();
  const sky = chart.open && chart.target ? { id: chart.target.objectId, center: { ...chart.center }, fieldDeg: chart.fieldDeg } : null;
  const view = captureView();
  // A locked camera is centered on this stable catalog ID: no enormous absolute coordinates.
  const anchorId = view.camera.mode === "locked" && view.camera.lockedId && view.view ? view.camera.lockedId : undefined;
  if (anchorId && view.view) view.view.center = [0, 0, 0];
  const state: SharedView = { version: 2, view, ...(anchorId ? { anchorId } : {}), ...(comparison ? { comparison } : {}), ...(sky ? { sky } : {}), ...(d.activeTourId ? { tour: { id: d.activeTourId, stop: d.stopIndex, started: d.started, paused: d.paused } } : {}) };
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set("gm", "2"); url.searchParams.set("state", JSON.stringify(state));
  return url.href;
}
export function applyUrlState(): boolean {
  const q = new URLSearchParams(location.search), st = useStore.getState(), data = st.data;
  if (!data) return false;
  const exact = parseSharedView(q.get("state"));
  if (exact) {
    if (exact.anchorId && exact.view.view) {
      if (!restoreCatalogId(data, exact.anchorId)) return false;
      const p = positionOf(data.byId.get(exact.anchorId)!, { eph: data.eph, jdTdb: exact.view.jd });
      if (!p) return false;
      exact.view.view.center = p;
    }
    restoreView(exact.view);
    if (exact.tour) {
      if (exact.tour.started) useDiscoveryStore.getState().restoreTour(exact.tour.id, exact.tour.stop);
      else useDiscoveryStore.getState().openTour(exact.tour.id);
      if (exact.tour.paused) useDiscoveryStore.getState().pauseTour();
      if (exact.view.view) getEngine()?.restoreView(exact.view.view, exact.view.camera.mode, exact.view.camera.lockedId);
    }
    if (exact.comparison) hydrateComparison(exact.comparison);
    if (exact.sky && openEarthSky(exact.sky.id)) useEarthSky.setState({ center: { ...exact.sky.center }, fieldDeg: exact.sky.fieldDeg });
    return !!exact.view.view;
  }
  let moved = false;
  const layer = q.get("layer"); if (layer === "atlas" || layer === "realistic") st.setLayer(layer);
  const mode = q.get("mode"); if (mode) st.setMode(mode);
  const place = q.get("place");
  if (place) restoreCatalogId(data, place);
  if (place && data.byId.has(place)) { st.select(place); st.setPanel("place"); moved = !!getEngine()?.focus(place); }
  const route = q.get("route")?.split(",").filter((id) => restoreCatalogId(data, id)).slice(0, MAX_STOPS);
  if (route && route.length >= 2) { useStore.setState({ stops: route, panel: "directions" }); st.requestFit(); moved = true; }
  if (q.get("panel") === "guide") st.setPanel("guide");
  const inside = q.get("inside"); if (inside && data.byId.has(inside)) st.setInside(inside);
  const view = REGION_PRESETS.find((p) => p.id === q.get("view"));
  if (view && !moved) { getEngine()?.exploreTo(view.target(data, st.jd)); st.setInside(view.insideId ?? null); moved = true; }
  return moved;
}
export function startUrlSync() {
  configureNavigationUrl(currentShareUrl);
  let timer: ReturnType<typeof setTimeout>, applying = false;
  const sync = () => { if (applying) return; clearTimeout(timer); timer = setTimeout(() => { if (!applying) history.replaceState(history.state, "", currentShareUrl()); }, 300); };
  const unsub = useStore.subscribe((s, p) => { if (s.selectedId !== p.selectedId || s.panel !== p.panel || s.layer !== p.layer || s.jd !== p.jd || s.modeId !== p.modeId || s.routeModel !== p.routeModel || s.stops !== p.stops || s.inside !== p.inside || s.camera !== p.camera || s.viewInfo !== p.viewInfo) sync(); });
  const comp = useComparison.subscribe(sync), skyUnsub = useEarthSky.subscribe(sync), discovery = useDiscoveryStore.subscribe((s, p) => { if (s.activeTourId !== p.activeTourId || s.stopIndex !== p.stopIndex || s.started !== p.started || s.paused !== p.paused) sync(); });
  const pop = (e: PopStateEvent) => {
    applying = true;
    clearTimeout(timer);
    useComparison.setState({ open: false });
    useEarthSky.getState().close(false);
    useDiscoveryStore.setState({ activeTourId: null, surprise: null });
    if (!handleBrowserPop(e.state) && !applyUrlState()) getEngine()?.homeEarth(true);
    applying = false;
  };
  window.addEventListener("popstate", pop);
  return () => { configureNavigationUrl(null); clearTimeout(timer); unsub(); comp(); skyUnsub(); discovery(); window.removeEventListener("popstate", pop); };
}
