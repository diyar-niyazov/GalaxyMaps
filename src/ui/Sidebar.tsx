import { useMemo, useRef } from "react";
import { VoiceButton } from "./VoiceControls";
import { useStore, type SheetState } from "../state/store";
import { ObjectSearch } from "./ObjectSearch";
import { SearchIcon, DirectionsIcon, ChatIcon, ChevronLeftIcon, ChevronRightIcon, AccessibilityIcon } from "./icons";
import { openAccessibilitySettings } from "./A11yChrome";
import { ExplorePanel } from "./ExplorePanel";
import { PlaceCard } from "./PlaceCard";
import { DirectionsPanel } from "./DirectionsPanel";
import { GuidePanel } from "./GuidePanel";
import { focusObject, directionsTo, goHome } from "../state/actions";
import { searchInputRef } from "./describe";
import { useComparison } from "../state/comparison";
import { ComparisonPanel } from "./ComparisonPanel";
import { useDiscoveryStore } from "../state/discovery";
import { TourPanel, PausedTourBanner } from "./DiscoveryPanel";
import { shareCurrentView } from "../lib/share";
import { useNavigation } from "../state/navigation";
import brandLogo from "../../icon.png";


const SHEET_ORDER: SheetState[] = ["collapsed", "half", "full"];

/** Drag handle for the phone bottom sheet: drag or tap to move between collapsed / half / full. */
function SheetHandle() {
  const sheet = useStore((s) => s.sheet);
  const setSheet = useStore((s) => s.setSheet);
  const start = useRef<{ y: number; moved: boolean } | null>(null);
  return (
    <div
      className="sheet-handle"
      role="button"
      tabIndex={0}
      aria-label={`Panel ${sheet}. Activate to resize.`}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { y: e.clientY, moved: false };
      }}
      onPointerMove={(e) => {
        if (start.current && Math.abs(e.clientY - start.current.y) > 8) start.current.moved = true;
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const i = SHEET_ORDER.indexOf(sheet);
        if (!s.moved) return setSheet(SHEET_ORDER[(i + 1) % 3]);
        const dy = e.clientY - s.y;
        setSheet(SHEET_ORDER[Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1) * (Math.abs(dy) > 220 ? 2 : 1)))]);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setSheet(SHEET_ORDER[(SHEET_ORDER.indexOf(sheet) + 1) % 3]);
        }
      }}
    >
      <span />
    </div>
  );
}

export function Sidebar() {
  const data = useStore((s) => s.data);
  const panel = useStore((s) => s.panel);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const setPanel = useStore((s) => s.setPanel);
  const openDirections = directionsTo;
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const setCollapsed = useStore((s) => s.setSidebarCollapsed);
  const setSheet = useStore((s) => s.setSheet);
  const selected = selectedId && data ? data.byId.get(selectedId) ?? null : null;
  const comparing = useComparison((s) => s.open);
  const activeTour = useDiscoveryStore((s) => s.activeTourId);
  const tourPaused = useDiscoveryStore((s) => s.paused);
  const backCount = useNavigation((s) => s.history.length);

  const suggestions = useMemo(
    () => (data ? data.catalog.objects.filter((o) => o.highlight && o.image).sort((a, b) => b.display.priority - a.display.priority).slice(0, 8) : []),
    [data],
  );

  const touring = !!activeTour && !tourPaused;
  const showSearch = !comparing && (panel === "explore" || panel === "place");
  const returnHome = () => {
    if (useComparison.getState().open) useComparison.getState().close();
    useDiscoveryStore.setState({
      activeTourId: null,
      stopIndex: 0,
      started: false,
      paused: false,
      previousView: null,
      surprise: null,
      error: null,
    });
    goHome();
  };

  return (
    <>
      <aside className="sidebar" aria-label="GalaxyMaps panel" data-map-inset="bottom">
        <SheetHandle />
        <header className="sidebar-brand">
          {backCount > 0 && !comparing && !touring && <button type="button" className="icon-btn small" aria-label="Back to previous view" onClick={() => useNavigation.getState().back()}><ChevronLeftIcon /></button>}
          <button type="button" className="brand-home" aria-label="GalaxyMaps home" title="Return to the Earth home view" onClick={returnHome}>
            <img className="brand-logo" src={brandLogo} alt="" aria-hidden="true" />
            <span className="brand-text">
              <strong>GalaxyMaps</strong>
              <small>Directions across the universe</small>
            </span>
          </button>
          <button type="button" className="icon-btn collapse-btn" aria-label="Collapse side panel" title="Collapse side panel" onClick={() => setCollapsed(true)}>
            <ChevronLeftIcon />
          </button>
        </header>
        {showSearch && (
          <div className="sidebar-search" data-map-inset="top">
            <ObjectSearch
              className="main-search"
              label="Search GalaxyMaps"
              placeholder="Search planets, stars, galaxies…"
              value={panel === "place" ? selected : null}
              inputRef={searchInputRef}
              suggestions={suggestions}
              browseable
              leading={
                <span className="brand-mark" aria-hidden="true">
                  <SearchIcon size={20} />
                </span>
              }
              trailing={
                <button type="button" className="icon-btn primary-ink" aria-label="Directions" title="Directions" onClick={() => openDirections(selected?.id ?? null)}>
                  <DirectionsIcon size={22} />
                </button>
              }
              onSelect={(o) => {
                if (o) {
                  focusObject(o.id);
                  setPanel("place");
                  setSheet("half");
                } else select(null);
              }}
            />
          </div>
        )}
        <div className="sidebar-body" id="sidebar-body" tabIndex={-1}>
          {comparing ? <ComparisonPanel onShare={shareCurrentView} /> : touring ? <TourPanel /> : <>
            <PausedTourBanner />
            {panel === "explore" && <ExplorePanel />}
            {panel === "place" && selected && <PlaceCard key={selected.id} obj={selected} />}
            {panel === "place" && !selected && <ExplorePanel />}
            {panel === "directions" && <DirectionsPanel />}
            {panel === "guide" && <GuidePanel />}
          </>}
        </div>
        {panel !== "guide" && !comparing && !touring && (
          <div className="sidebar-footer">
            <button type="button" className="guide-fab" onClick={() => { if (activeTour && !tourPaused) useDiscoveryStore.getState().pauseTour(); setPanel("guide"); }}>
              <ChatIcon size={18} /> Mission Control
            </button>
            <VoiceButton className="icon-btn a11y-btn" />
            <button type="button" className="icon-btn a11y-btn" aria-label="Accessibility settings" title="Accessibility settings" onClick={openAccessibilitySettings}>
              <AccessibilityIcon size={20} />
            </button>
          </div>
        )}
      </aside>
      {collapsed && (
        <button type="button" className="sidebar-expand" aria-label="Open side panel" title="Open side panel" onClick={() => setCollapsed(false)}>
          <SearchIcon size={18} /> <span>GalaxyMaps</span> <ChevronRightIcon size={18} />
        </button>
      )}
    </>
  );
}
