import { useMemo, useRef } from "react";
import { useStore, type SheetState } from "../state/store";
import { ObjectSearch } from "./ObjectSearch";
import { SearchIcon, DirectionsIcon, ChatIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { ExplorePanel } from "./ExplorePanel";
import { PlaceCard } from "./PlaceCard";
import { DirectionsPanel } from "./DirectionsPanel";
import { GuidePanel } from "./GuidePanel";
import { focusObject } from "../state/actions";
import { searchInputRef } from "./describe";


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
  const openDirections = useStore((s) => s.openDirections);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const setCollapsed = useStore((s) => s.setSidebarCollapsed);
  const setSheet = useStore((s) => s.setSheet);
  const selected = selectedId && data ? data.byId.get(selectedId) ?? null : null;

  const suggestions = useMemo(
    () => (data ? data.catalog.objects.filter((o) => o.highlight && o.image).sort((a, b) => b.display.priority - a.display.priority).slice(0, 8) : []),
    [data],
  );

  const showSearch = panel === "explore" || panel === "place";

  return (
    <>
      <aside className="sidebar" aria-label="GalaxyMaps panel" data-map-inset="bottom" aria-hidden={collapsed || undefined}>
        <SheetHandle />
        <header className="sidebar-brand">
          <span className="brand-logo" aria-hidden="true" />
          <span className="brand-text">
            <strong>GalaxyMaps</strong>
            <small>Directions across the universe</small>
          </span>
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
        <div className="sidebar-body">
          {panel === "explore" && <ExplorePanel />}
          {panel === "place" && selected && <PlaceCard obj={selected} />}
          {panel === "place" && !selected && <ExplorePanel />}
          {panel === "directions" && <DirectionsPanel />}
          {panel === "guide" && <GuidePanel />}
        </div>
        {panel !== "guide" && (
          <div className="sidebar-footer">
            <button type="button" className="guide-fab" onClick={() => setPanel("guide")}>
              <ChatIcon size={18} /> Ask the guide
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
