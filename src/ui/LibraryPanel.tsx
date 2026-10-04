import { useState } from "react";
import { useStore } from "../state/store";
import { useLibrary } from "../state/library";
import { focusObject } from "../state/actions";
import { ObjectIcon } from "./ObjectIcon";
import { typeLabel } from "./describe";

const FIRST = 3;

export function LibraryPanel() {
  const data = useStore((s) => s.data), favorites = useLibrary((s) => s.favorites), recent = useLibrary((s) => s.recent);
  const unavailable = useLibrary((s) => s.storageUnavailable);
  const [all, setAll] = useState(false);
  const [removed, setRemoved] = useState<string | null>(null);
  if (!data) return null;
  const saved = favorites.filter((id) => data.byId.has(id));
  const recents = recent.filter((id) => data.byId.has(id) && !saved.includes(id));
  const empty = !saved.length && !recents.length;
  const groups = [{ label: "Saved", ids: saved, removable: true }, { label: "Recently explored", ids: recents, removable: false }].filter((g) => g.ids.length);
  return <section className="explore-section library-panel" aria-labelledby="library-title">
    <h2 id="library-title" className="section-title">Saved & recently explored</h2>
    {empty ? <p className="muted small">Places you save or explore will appear here.</p> : <>
      {groups.map((group) => <div key={group.label} className="library-group">
        <h3 className="mini-title">{group.label}</h3>
        <ul className="library-list">{(all ? group.ids : group.ids.slice(0, FIRST)).map((id) => {
          const o = data.byId.get(id)!;
          return <li key={id}>
            <button type="button" onClick={() => focusObject(id)}><ObjectIcon obj={o} size={28} /><span className="library-text"><strong>{o.name}</strong><small>{typeLabel(o)}</small></span></button>
            {group.removable && <button type="button" className="text-btn" aria-label={`Remove ${o.name} from saved places`} onClick={() => { useLibrary.getState().toggleFavorite(id); setRemoved(id); }}>Remove</button>}
          </li>;
        })}</ul>
      </div>)}
      {removed && !favorites.includes(removed) && <p className="action-feedback" role="status">Removed {data.byId.get(removed)?.name}. <button type="button" className="text-btn" onClick={() => { useLibrary.getState().toggleFavorite(removed); setRemoved(null); }}>Undo</button></p>}
      {(saved.length > FIRST || recents.length > FIRST) && <button type="button" className="text-btn show-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show less" : "Show all"}</button>}
      <p className="muted small">{unavailable ? "Browser storage is unavailable; saved places last for this session." : "Saved on this browser. No account needed."}</p>
    </>}
  </section>;
}
