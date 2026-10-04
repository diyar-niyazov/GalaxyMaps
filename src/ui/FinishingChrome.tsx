import { useStore } from "../state/store";
import { useFinishing } from "../state/finishing";
import { getEngine } from "../map/engineRef";
import { CloseIcon, QuietViewIcon } from "./icons";
import { ObjectIcon } from "./ObjectIcon";
import { TYPE_LABEL } from "../lib/search";
import { useComparison } from "../state/comparison";
import { useEarthSky } from "../state/earthSky";
import "./finishing.css";

export function FinishingChrome() {
  const data = useStore((s) => s.data), camera = useStore((s) => s.camera), selectedId = useStore((s) => s.selectedId);
  const presentation = useFinishing((s) => s.presentation), dismissed = useFinishing((s) => s.hintDismissed), hoverId = useFinishing((s) => s.hoverId);
  const comparing = useComparison((s) => s.open), sky = useEarthSky((s) => s.open);
  const viewInfo = useStore((s) => s.viewInfo);
  const share = useFinishing((s) => s.share);
  const object = data?.byId.get(camera.lockedId ?? selectedId ?? ""), hovered = hoverId ? data?.byId.get(hoverId) : null;
  if (!data || comparing || sky) return null;
  return <>
    {presentation && <div className="finish-controls quiet">
      <span className="quiet-identity">GalaxyMaps{object ? ` · ${object.name}` : ""}<small>{viewInfo?.projectedImage ? `Projected observed image · ${viewInfo.projectedImage.credit}` : <>{viewInfo?.schematicObject ? "Schematic reconstruction · catalog morphology · " : viewInfo?.illustrativeBody ? "Illustrative sphere · no observed surface map · " : object?.display.texture || object?.id === "earth" ? "Textures: Solar System Scope · " : ""}{viewInfo?.background === "sky-panorama" ? "Sky: NASA SVS · decorative panorama" : "Catalog: HYG / SIMBAD · display reconstruction"}</>}</small></span>
      <button type="button" className="camera-btn" aria-pressed="true" onClick={() => useFinishing.getState().setPresentation(false)}><QuietViewIcon size={16} />Restore controls</button>
    </div>}
    {share && !presentation && <div className="share-feedback" role="status"><button type="button" className="icon-btn small" aria-label="Dismiss share feedback" onClick={() => useFinishing.getState().clearShare()}><CloseIcon size={16} /></button><p>{share.message}</p>{share.manual && <input aria-label="Copy exact-view link" readOnly value={share.manual} onFocus={(e) => e.target.select()} />}</div>}
    {!presentation && !dismissed && <div className="map-hint"><span>{camera.mode === "locked" ? "Drag to rotate · Scroll or pinch to zoom · Unlock to pan" : "Drag to explore · Scroll or pinch to zoom · Select a destination"}</span><button type="button" className="icon-btn small" aria-label="Dismiss gesture hint" onClick={() => useFinishing.getState().dismissHint()}><CloseIcon size={14} /></button></div>}
    {!presentation && hovered && <div className="hover-preview"><ObjectIcon obj={hovered} size={42} /><span><strong>{hovered.name}</strong><small>{TYPE_LABEL[hovered.type]} · Select to explore</small></span></div>}
    {!presentation && selectedId && camera.mode === "explore" && <button type="button" className="selected-locator camera-btn" onClick={() => getEngine()?.focus(selectedId)}>Focus {data.byId.get(selectedId)?.name ?? "selected object"}</button>}
  </>;
}
