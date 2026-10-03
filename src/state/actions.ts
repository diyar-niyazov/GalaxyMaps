import { useStore } from "./store";
import { getEngine } from "../map/engineRef";
import { REGION_PRESETS } from "../map/presets";
import { LY_KM } from "../lib/units";

/** Select an object and enter its Locked object view (or the universe overview for redshift-only objects). */
export function focusObject(id: string) {
  const st = useStore.getState();
  st.select(id);
  getEngine()?.focus(id);
}

/** Home: a locked close-up of Earth. */
export function goHome() {
  useStore.getState().setInside(null);
  getEngine()?.homeEarth();
}

/** Deliberately enter an exploration frame for a region preset. */
export function goRegion(presetId: string) {
  const st = useStore.getState();
  const p = REGION_PRESETS.find((x) => x.id === presetId);
  if (!p || !st.data) return;
  st.setInside(p.insideId ?? null);
  getEngine()?.exploreTo(p.target(st.data, st.jd));
}

/** Frame a galaxy or system so its catalogued children are visible, and list them in the sidebar. */
export function exploreInside(id: string) {
  const st = useStore.getState();
  const data = st.data;
  const eng = getEngine();
  const obj = data?.byId.get(id);
  if (!data || !eng || !obj) return;
  const pos = eng.getObjectPosition(id);
  if (!pos) return;
  st.setInside(id);
  st.setPanel("explore");
  const children = data.catalog.objects.filter((o) => o.parentId === id);
  let widthKm: number;
  if (obj.display.extentKm) widthKm = obj.display.extentKm * 1.5;
  else if (obj.region === "solar-system") widthKm = eng.focusWidth(obj);
  else {
    const far = Math.max(0, ...children.map((c) => {
      const p = eng.getObjectPosition(c.id);
      return p ? Math.hypot(p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]) : 0;
    }));
    widthKm = Math.max(far * 2.6, 2 * LY_KM);
  }
  const vp = eng.getViewport();
  const usableW = vp.cx != null ? Math.min(vp.cx * 2, (vp.width - vp.cx) * 2) : vp.width;
  eng.exploreTo({ center: pos, widthKm: (widthKm * vp.width) / Math.max(200, Math.min(usableW, vp.height)) });
}

/** Esc: leave Route/Locked framing. Returns true if it did something. */
export function escapeCamera(): boolean {
  const eng = getEngine();
  if (eng && eng.getMode() !== "explore") {
    eng.unlock();
    return true;
  }
  return false;
}
