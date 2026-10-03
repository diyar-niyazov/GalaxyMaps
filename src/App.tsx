import { useEffect } from "react";
import { useStore } from "./state/store";
import { loadBundle } from "./data/bundle";
import { MapView } from "./map/MapView";
import { EngineSync } from "./map/EngineSync";
import { getEngine } from "./map/engineRef";
import { HOME_PRESET } from "./map/presets";
import { Sidebar, searchInputRef } from "./ui/Sidebar";
import { MapChrome } from "./ui/MapChrome";
import { AboutDialog } from "./ui/AboutDialog";
import { applyUrlState, startUrlSync } from "./state/urlState";
import { ErrorBoundary } from "./ui/ErrorBoundary";

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

export function App() {
  const data = useStore((s) => s.data);
  const loadError = useStore((s) => s.loadError);
  const aboutOpen = useStore((s) => s.aboutOpen);

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
          applyUrlState();
          unsub = startUrlSync();
        }, 0);
      })
      .catch((e) => useStore.getState().setLoadError(`Could not load the SpaceMaps dataset (${(e as Error).message}). Run "npm run data:build" and reload.`));
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
      const st = useStore.getState();
      const eng = getEngine();
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
          eng?.panBy(-120, 0);
          break;
        case "ArrowRight":
          eng?.panBy(120, 0);
          break;
        case "ArrowUp":
          eng?.panBy(0, -120);
          break;
        case "ArrowDown":
          eng?.panBy(0, 120);
          break;
        case "h":
        case "H":
          if (st.data) eng?.flyTo(HOME_PRESET.target(st.data, st.jd));
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
        case "Escape":
          if (st.panel === "place") st.select(null);
          else if (st.panel !== "explore") st.setPanel(st.selectedId ? "place" : "explore");
          break;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
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
