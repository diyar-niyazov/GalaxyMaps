import { useStore } from "../state/store";
import type { CatalogObject } from "../lib/types";
import { breadcrumbsFor, type Crumb } from "../lib/hierarchy";
import { focusObject, exploreInside, goRegion } from "../state/actions";
import { BackIcon } from "./icons";

/** Opens a crumb: regions frame the map; hosts with children open their interior list. */
export function openCrumb(target: Crumb["target"]) {
  const data = useStore.getState().data;
  if (!target || !data) return;
  if (target.kind === "region") return goRegion(target.presetId);
  if (data.catalog.objects.some((o) => o.parentId === target.id && o.type !== "mission")) exploreInside(target.id);
  else {
    focusObject(target.id);
    useStore.getState().setPanel("place");
  }
}

/** Catalog membership path. It does not change with zoom; the region bar shows the camera's scale. */
export function Breadcrumbs({ obj, back = false, currentAction }: { obj: CatalogObject; back?: boolean; currentAction?: () => void }) {
  const data = useStore((s) => s.data)!;
  const crumbs = breadcrumbsFor(data.byId, obj);
  const parent = [...crumbs].reverse().find((c, i) => i > 0 && c.target);
  return (
    <nav className="breadcrumbs" aria-label="Catalog location" title="Where this object belongs in the catalog (independent of the current zoom)">
      {back && parent && (
        <button type="button" className="icon-btn small" aria-label={`Back to ${parent.label}`} onClick={() => openCrumb(parent.target)}>
          <BackIcon size={16} />
        </button>
      )}
      {crumbs.map((c, i) => (
        <span key={`${i}-${c.label}`} className="crumb-item">
          {i > 0 && <span className="crumb-sep" aria-hidden="true">›</span>}
          {c.target ? (
            <button type="button" className="crumb" onClick={() => openCrumb(c.target)}>{c.label}</button>
          ) : currentAction ? (
            <button type="button" className="crumb crumb-cur" aria-current="location" onClick={currentAction}>{c.label}</button>
          ) : (
            <span className="crumb crumb-cur" aria-current="location">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
