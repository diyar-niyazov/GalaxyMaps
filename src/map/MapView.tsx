import { useEffect, useRef } from "react";
import { MapEngine, type Insets } from "./MapEngine";
import { setEngine } from "./engineRef";
import { useStore } from "../state/store";
import { objectForStar, type DataBundle } from "../data/bundle";
import { interactionStart, interactionEnd } from "../state/interaction";
import { focusObject } from "../state/actions";
import { closeTopMenu, hasOpenMenu } from "../ui/menus";
import { useFinishing } from "../state/finishing";

/** Overlap of floating UI (marked with data-map-inset) with the map, so fits use the visible area. */
function measureInsets(map: HTMLElement): Insets {
  const m = map.getBoundingClientRect();
  const out: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const el of document.querySelectorAll<HTMLElement>("[data-map-inset]")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).display === "none") continue;
    if (r.right <= m.left || r.left >= m.right || r.bottom <= m.top || r.top >= m.bottom) continue;
    const side = el.dataset.mapInset as keyof Insets;
    if (side === "top") out.top = Math.max(out.top, r.bottom - m.top);
    else if (side === "bottom") out.bottom = Math.max(out.bottom, m.bottom - r.top);
    else if (side === "left") out.left = Math.max(out.left, r.right - m.left);
    else if (side === "right") out.right = Math.max(out.right, m.right - r.left);
  }
  // Never let panels claim more than ~70% of the map in either direction.
  out.bottom = Math.min(out.bottom, m.height * 0.7);
  out.top = Math.min(out.top, m.height * 0.3);
  return out;
}

export function MapView({ data }: { data: DataBundle }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current!;
    const s = useStore.getState();
    let hoverTimer: ReturnType<typeof setTimeout>;
    const engine = new MapEngine(el, data, s.jd, {
      onViewChange: (info) => useStore.getState().setViewInfo({ ...info, view: { ...info.view } }),
      onPick: (t) => {
        if (!t) return;
        focusObject(t.kind === "object" ? t.id : objectForStar(data, t.index).id);
      },
      onCameraChange: (mode, lockedId) => useStore.getState().setCamera({ mode, lockedId }),
      onInteraction: (active) => {
        if (active) { clearTimeout(hoverTimer); useFinishing.getState().setHover(null); useFinishing.getState().dismissHint(); interactionStart("map"); }
        else interactionEnd("map");
      },
      onHover: (id) => { clearTimeout(hoverTimer); useFinishing.getState().setHover(null); if (id) hoverTimer = setTimeout(() => useFinishing.getState().setHover(id), 240); },
    });
    engine.setLayer(s.layer);
    setEngine(engine);

    let raf = 0;
    const layoutTimers = new Set<ReturnType<typeof setTimeout>>();
    const scheduleLayout = (fn: () => void, delay: number) => { const timer = setTimeout(() => { layoutTimers.delete(timer); fn(); }, delay); layoutTimers.add(timer); };
    const update = () => {
      cancelAnimationFrame(raf);
      clearTimeout(hoverTimer);
      useFinishing.getState().setHover(null);
      raf = requestAnimationFrame(() => {
        const bottom = el.parentElement?.querySelector<HTMLElement>(".map-bottom");
        const height = bottom ? el.getBoundingClientRect().bottom - bottom.getBoundingClientRect().top : 0;
        el.parentElement?.style.setProperty("--map-bottom-offset", `${Math.max(0, height)}px`);
        engine.setInsets(measureInsets(el));
      });
    };
    const ro = new ResizeObserver(update);
    const observeAll = () => {
      ro.disconnect();
      ro.observe(el);
      document.querySelectorAll("[data-map-inset]").forEach((n) => ro.observe(n));
      const bottom = el.parentElement?.querySelector(".map-bottom");
      if (bottom) ro.observe(bottom);
      update();
    };
    observeAll();
    // Panels mount/unmount and animate; re-scan when layout-related state changes.
    const unsub = useStore.subscribe((st, prev) => {
      if (st.sheet !== prev.sheet || st.panel !== prev.panel || st.sidebarCollapsed !== prev.sidebarCollapsed || st.camera !== prev.camera) {
        scheduleLayout(observeAll, 30);
        scheduleLayout(update, 320);
      }
    });
    window.addEventListener("resize", update);
    return () => {
      unsub();
      ro.disconnect();
      window.removeEventListener("resize", update);
      cancelAnimationFrame(raf);
      clearTimeout(hoverTimer);
      layoutTimers.forEach(clearTimeout);
      el.parentElement?.style.removeProperty("--map-bottom-offset");
      useFinishing.getState().setHover(null);
      setEngine(null);
      engine.dispose();
    };
  }, [data]);

  return <div ref={ref} id="space-map" tabIndex={0} className="map" data-testid="map" role="application" aria-label="Space map. Arrow keys pan, or orbit when locked; plus and minus zoom; comma and period step to nearby objects; V describes the view; Esc leaves a locked view." aria-describedby="map-summary" onPointerDownCapture={(e) => {
    if (hasOpenMenu()) { e.stopPropagation(); e.preventDefault(); closeTopMenu(); }
  }} />;
}
