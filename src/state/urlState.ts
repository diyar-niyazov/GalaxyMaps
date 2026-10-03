import { useStore, MAX_STOPS, type Panel } from "./store";
import { getEngine } from "../map/engineRef";
import { REGION_PRESETS } from "../map/presets";

/**
 * Shareable URLs, e.g. /?route=earth,polaris&mode=light or /?place=saturn&layer=atlas.
 * Supported: route, mode, layer, place, panel (guide), view (region preset id), inside.
 * Returns true if the URL positioned the camera.
 */
export function applyUrlState(): boolean {
  const q = new URLSearchParams(location.search);
  const st = useStore.getState();
  const data = st.data;
  if (!data) return false;
  let moved = false;
  const layer = q.get("layer");
  if (layer === "atlas" || layer === "realistic") st.setLayer(layer);
  const mode = q.get("mode");
  if (mode) st.setMode(mode);
  const place = q.get("place");
  if (place && data.byId.has(place)) {
    st.select(place);
    st.setPanel("place");
    moved = !!getEngine()?.focus(place);
  }
  const route = q.get("route")?.split(",").filter((id) => data.byId.has(id)).slice(0, MAX_STOPS);
  if (route && route.length >= 2) {
    useStore.setState({ stops: route, panel: "directions" });
    st.requestFit();
    moved = true;
  }
  const panel = q.get("panel") as Panel | null;
  if (panel === "guide") st.setPanel(panel);
  const view = REGION_PRESETS.find((p) => p.id === q.get("view"));
  if (view && !moved) {
    getEngine()?.exploreTo(view.target(data, useStore.getState().jd));
    if (view.insideId) st.setInside(view.insideId);
    moved = true;
  }
  return moved;
}

export function startUrlSync() {
  return useStore.subscribe((s, prev) => {
    if (s.stops === prev.stops && s.modeId === prev.modeId && s.layer === prev.layer && s.selectedId === prev.selectedId && s.panel === prev.panel) return;
    const q = new URLSearchParams();
    if (s.panel === "directions" && s.stops.every(Boolean)) {
      q.set("route", s.stops.join(","));
      q.set("mode", s.modeId);
    } else if (s.panel === "place" && s.selectedId) q.set("place", s.selectedId);
    else if (s.panel === "guide") q.set("panel", s.panel);
    if (s.layer === "atlas") q.set("layer", "atlas");
    const str = q.toString().replace(/%2C/g, ",");
    history.replaceState(null, "", str ? `?${str}` : location.pathname);
  });
}
