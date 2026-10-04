import { useState } from "react";
import type { CatalogObject } from "../lib/types";
import { useLibrary } from "../state/library";
import { useStore } from "../state/store";
import { eligibleEarthSky } from "../lib/earthSky";
import { openEarthSky, useEarthSky } from "../state/earthSky";
import { currentShareUrl } from "../state/urlState";
import { shareCurrentView, exportDiscoveryCard } from "../lib/share";

export function DestinationTools({ obj }: { obj: CatalogObject }) {
  const favorites = useLibrary((s) => s.favorites);
  const data = useStore((s) => s.data), jd = useStore((s) => s.jd);
  const skyError = useEarthSky((s) => s.error);
  const [message, setMessage] = useState(""), [manual, setManual] = useState(""), [busy, setBusy] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const saved = favorites.includes(obj.id), sky = data ? eligibleEarthSky(obj, data, jd) : false;
  const share = async () => { setBusy(true); setManual(""); try { const result = await shareCurrentView(); setMessage(result === "local" ? "Local link copied. It opens on this device while GalaxyMaps is running." : result === "shared" ? "View shared." : "Exact-view link copied."); } catch (e) { setMessage((e as Error).message); setManual(currentShareUrl()); } finally { setBusy(false); } };
  return <div className="destination-tools">
    <div className="secondary-actions">
      <button type="button" className="btn" aria-pressed={saved} onClick={() => { useLibrary.getState().toggleFavorite(obj.id); setCanUndo(saved); setMessage(saved ? "Removed from saved places." : useLibrary.getState().storageUnavailable ? "Saved for this session." : "Saved on this browser."); }}>{saved ? "Saved" : "Save"}</button>
      <button type="button" className="btn" disabled={!sky} title={sky ? "Find this object on an Earth-centered sky sphere" : "No supported direction from Earth for this record and date"} onClick={() => openEarthSky(obj.id)}>View from Earth</button>
      <button type="button" className="btn" disabled={busy} onClick={share}>Share view</button>
      <button type="button" className="text-btn" disabled={busy} onClick={async () => { setBusy(true); try { await exportDiscoveryCard(obj); setMessage("Discovery card downloaded."); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); } }}>Save image</button>
    </div>
    {message && <p className="action-feedback" role="status">{message}{canUndo && !saved && <button type="button" className="text-btn" onClick={() => { useLibrary.getState().toggleFavorite(obj.id); setCanUndo(false); setMessage("Restored to saved places."); }}>Undo</button>}</p>}
    {!sky && <p className="muted small">A sky direction from Earth is unavailable for this record.</p>}
    {skyError && <p className="action-feedback" role="status">{skyError}</p>}
    {manual && <label className="manual-share">Copy this exact-view link<input readOnly value={manual} aria-label="Exact-view link" onFocus={(e) => e.target.select()} /></label>}
  </div>;
}
