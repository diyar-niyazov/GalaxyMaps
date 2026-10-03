import { useEffect } from "react";
import { useStore } from "./state/store";
import { loadBundle } from "./data/bundle";
import { MapView } from "./map/MapView";
import { EngineSync } from "./map/EngineSync";
import { getEngine } from "./map/engineRef";
import { Sidebar } from "./ui/Sidebar";
import { searchInputRef } from "./ui/describe";
import { MapChrome } from "./ui/MapChrome";
import { AboutDialog } from "./ui/AboutDialog";
import { applyUrlState, startUrlSync } from "./state/urlState";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { goHome, escapeCamera } from "./state/actions";
import { closeTopMenu } from "./ui/menus";

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

export function App() {
  const data = useStore((s) => s.data);
  const loadError = useStore((s) => s.loadError);
  const aboutOpen = useStore((s) => s.aboutOpen);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const sheet = useStore((s) => s.sheet);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    loadBundle()
      .then((d) => {
        if (cancelled) return;
        useStore.getState().setData(d);
        // Defer so the map engine exists before applying camera moves.
        setTimeout(() => {
          if (cancelled) return;
          if (!applyUrlState()) getEngine()?.homeEarth(true);
          unsub = startUrlSync();
        }, 0);
      })
      .catch((e) => useStore.getState().setLoadError(`Could not load the GalaxyMaps dataset (${(e as Error).message}). Run "npm run data:build" and reload.`));
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Menus first, then the locked/route camera, then panels.
        if (closeTopMenu()) return e.preventDefault();
        if (isTyping(e)) return;
        if (escapeCamera()) return;
        const st = useStore.getState();
        if (st.categoryFilter) return st.setCategoryFilter(null);
        if (st.panel === "place") st.select(null);
        else if (st.panel !== "explore") st.setPanel(st.selectedId ? "place" : "explore");
        else if (st.inside) st.setInside(null);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
      const st = useStore.getState();
      const eng = getEngine();
      const locked = eng?.getMode() === "locked";
      switch (e.key) {
        case "/":
          e.preventDefault();
          if (st.panel !== "explore" && st.panel !== "place") st.setPanel("explore");
          setTimeout(() => searchInputRef.current?.focus(), 0);
          break;
        case "+":
        case "=":
          eng?.zoomBy(0.5);
          break;
        case "-":
        case "_":
          eng?.zoomBy(2);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (locked) eng?.orbitBy(-0.12, 0);
          else eng?.panBy(-120, 0);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (locked) eng?.orbitBy(0.12, 0);
          else eng?.panBy(120, 0);
          break;
        case "ArrowUp":
          e.preventDefault();
          if (locked) eng?.orbitBy(0, -0.1);
          else eng?.panBy(0, -120);
          break;
        case "ArrowDown":
          e.preventDefault();
          if (locked) eng?.orbitBy(0, 0.1);
          else eng?.panBy(0, 120);
          break;
        case "h":
        case "H":
          goHome();
          break;
        case "r":
        case "R":
          eng?.resetView();
          break;
        case "f":
        case "F":
          st.requestFit();
          break;
        case "l":
        case "L":
          st.setLayer(st.layer === "realistic" ? "atlas" : "realistic");
          break;
        case "d":
        case "D":
          st.openDirections(st.panel === "place" ? st.selectedId : undefined);
          break;
        case " ":
          e.preventDefault();
          if (st.time.armed) st.pauseTime();
          else st.playTime();
          break;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`app ${collapsed ? "sidebar-collapsed" : ""} sheet-${sheet}`}>
      <ErrorBoundary label="The side panel">
        <Sidebar />
      </ErrorBoundary>
      <main className="map-wrap">
        {data ? (
          <ErrorBoundary label="The map">
            <MapView data={data} />
            <MapChrome />
            <EngineSync />
          </ErrorBoundary>
        ) : (
          <div className="map-loading" role="status">
            {loadError ? <p className="error">{loadError}</p> : <><span className="spinner" aria-hidden="true" /><p>Loading the universe…</p></>}
          </div>
        )}
      </main>
      {aboutOpen && <AboutDialog />}
    </div>
  );
}
