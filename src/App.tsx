import { useEffect } from "react";
import { useStore } from "./state/store";
import { loadBundle, restoreCatalogId } from "./data/bundle";
import { MapView } from "./map/MapView";
import { EngineSync } from "./map/EngineSync";
import { getEngine } from "./map/engineRef";
import { Sidebar } from "./ui/Sidebar";
import { searchInputRef } from "./ui/describe";
import { MapChrome } from "./ui/MapChrome";
import { AboutDialog } from "./ui/AboutDialog";
import { applyUrlState, startUrlSync } from "./state/urlState";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { goHome, escapeCamera, directionsTo } from "./state/actions";
import { closeTopMenu } from "./ui/menus";
import { captureView, restoreView } from "./state/navigation";
import { configureComparisonNavigation, useComparison } from "./state/comparison";
import { initializeLibrary, useLibrary } from "./state/library";
import { currentExperience } from "./state/selectors";
import { EarthSkyView } from "./ui/EarthSkyView";
import { FinishingChrome } from "./ui/FinishingChrome";
import { VoiceDock } from "./ui/VoiceControls";
import { useVoice } from "./state/voice";
import { useFinishing } from "./state/finishing";
import { useEarthSky } from "./state/earthSky";
import { useTravel, pauseTravel, resumeTravel } from "./state/travel";
import { describeCurrentView, stepNearby } from "./state/audioNav";
import { SkipLinks, LiveRegions, MapSummary, CameraAnnouncements, AudioNavBar, AccessibilityDialog } from "./ui/A11yChrome";

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
  const presentation = useFinishing((s) => s.presentation);
  const skyOpen = useEarthSky((s) => s.open), comparing = useComparison((s) => s.open);

  useEffect(() => {
    configureComparisonNavigation(captureView, restoreView);
    return initializeLibrary();
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    loadBundle()
      .then((d) => {
        if (cancelled) return;
        [...useLibrary.getState().favorites, ...useLibrary.getState().recent].forEach((id) => restoreCatalogId(d, id));
        useStore.getState().setData(d);
        // Defer so the map engine exists before applying camera moves.
        setTimeout(() => {
          if (cancelled) return;
          if (!applyUrlState()) getEngine()?.homeEarth(true);
          unsub = startUrlSync();
        }, 0);
      })
      .catch(() => { if (!cancelled) useStore.getState().setLoadError("GalaxyMaps couldn't load its catalog. Check your connection and try again."); });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") {
        // One layer per press: menus, then comparison, then the locked/route camera, then panels.
        // A nested handler (comparison panel, selector popovers) that already consumed Esc wins.
        if (e.defaultPrevented) return;
        if (useFinishing.getState().presentation) { e.preventDefault(); useFinishing.getState().setPresentation(false); return; }
        if (closeTopMenu()) return e.preventDefault();
        if (useEarthSky.getState().open) { e.preventDefault(); useEarthSky.getState().close(); return; }
        if (currentExperience() === "comparison") { e.preventDefault(); useComparison.getState().close(); return; }
        if (isTyping(e)) return;
        if (escapeCamera()) return;
        const st = useStore.getState();
        if (st.categoryFilter) return st.setCategoryFilter(null);
        if (st.panel === "place") st.select(null);
        else if (st.panel !== "explore") st.setPanel(st.selectedId ? "place" : "explore");
        else if (st.inside) st.setInside(null);
        return;
      }
      if ((e.target as HTMLElement | null)?.closest("button, a, [role='button']")) return;
      const experience = currentExperience();
      if (experience === "comparison" || experience === "sky" || useStore.getState().xr.active) return;
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
      const st = useStore.getState();
      const eng = getEngine();
      const locked = experience === "locked";
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
          directionsTo(st.panel === "place" ? st.selectedId : undefined);
          break;
        case " ": {
          e.preventDefault();
          const travel = useTravel.getState().phase;
          if (travel === "flying") pauseTravel();
          else if (travel === "paused") resumeTravel();
          else if (st.time.armed) st.pauseTime();
          else st.playTime();
          break;
        }
        case ",":
        case "<":
          stepNearby(-1);
          break;
        case ".":
        case ">":
          stepNearby(1);
          break;
        case "v":
        case "V":
          describeCurrentView();
          break;
        case "m":
        case "M":
          useVoice.getState().toggle();
          break;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`app ${collapsed ? "sidebar-collapsed" : ""} ${presentation ? "presentation" : ""} ${skyOpen ? "sky-view" : ""} sheet-${sheet}`}>
      <SkipLinks />
      <LiveRegions />
      <ErrorBoundary label="The side panel">
        <div className="sidebar-region" inert={skyOpen}><Sidebar /></div>
      </ErrorBoundary>
      <main className="map-wrap" inert={comparing}>
        {data ? (
          <ErrorBoundary label="The map">
            <MapView data={data} />
            <MapSummary />
            <CameraAnnouncements />
            <MapChrome />
            <AudioNavBar />
            <FinishingChrome />
            <VoiceDock />
            <EarthSkyView />
            <EngineSync />
          </ErrorBoundary>
        ) : (
          <div className="map-loading" role="status">
            {loadError ? <div><p className="error">{loadError}</p><button type="button" className="btn" onClick={() => location.reload()}>Reload GalaxyMaps</button></div> : <><span className="spinner" aria-hidden="true" /><p>Loading the universe…</p></>}
          </div>
        )}
      </main>
      {aboutOpen && <AboutDialog />}
      <AccessibilityDialog />
    </div>
  );
}
