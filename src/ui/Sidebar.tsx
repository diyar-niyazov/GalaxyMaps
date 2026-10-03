import { useMemo, type RefObject } from "react";
import { useStore } from "../state/store";
import { ObjectSearch } from "./ObjectSearch";
import { SearchIcon, DirectionsIcon, ChatIcon } from "./icons";
import { ExplorePanel } from "./ExplorePanel";
import { PlaceCard } from "./PlaceCard";
import { DirectionsPanel } from "./DirectionsPanel";
import { GuidePanel } from "./GuidePanel";
import { TransferPanel } from "./TransferPanel";
import { getEngine } from "../map/engineRef";

/** Shared so the "/" shortcut can focus the main search box. */
export const searchInputRef: RefObject<HTMLInputElement | null> = { current: null };

export function Sidebar() {
  const data = useStore((s) => s.data);
  const panel = useStore((s) => s.panel);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const setPanel = useStore((s) => s.setPanel);
  const openDirections = useStore((s) => s.openDirections);
  const selected = selectedId && data ? data.byId.get(selectedId) ?? null : null;

  const suggestions = useMemo(
    () => (data ? ["earth", "mars", "saturn", "proxima-centauri", "polaris", "betelgeuse", "orion-nebula", "andromeda"].map((id) => data.byId.get(id)!).filter(Boolean) : []),
    [data],
  );

  const showSearch = panel === "explore" || panel === "place";

  return (
    <aside className="sidebar" aria-label="SpaceMaps panel">
      {showSearch && (
        <div className="sidebar-search">
          <ObjectSearch
            className="main-search"
            label="Search SpaceMaps"
            placeholder="Search SpaceMaps"
            value={panel === "place" ? selected : null}
            inputRef={searchInputRef}
            suggestions={suggestions}
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
                select(o.id);
                setPanel("place");
                getEngine()?.flyToObject(o.id);
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
        {panel === "transfer" && <TransferPanel />}
      </div>
      {panel !== "guide" && (
        <div className="sidebar-footer">
          <button type="button" className="guide-fab" onClick={() => setPanel("guide")}>
            <ChatIcon size={18} /> Ask the guide
          </button>
        </div>
      )}
    </aside>
  );
}
