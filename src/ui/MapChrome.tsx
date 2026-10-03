import { useStore } from "../state/store";
import { getEngine } from "../map/engineRef";
import { SCALE_PRESETS, HOME_PRESET } from "../map/presets";
import { AddIcon, RemoveIcon, HomeIcon, FitIcon, ThreeDIcon, LayersIcon, InfoIcon } from "./icons";
import { AU_KM, LY_KM, PC_KM, dateFromJdTdb, jdTdb } from "../lib/units";
import { useRoute } from "../state/selectors";

const UNITS = [
  { name: "km", km: 1, max: 0.05 * AU_KM },
  { name: "AU", km: AU_KM, max: 0.2 * LY_KM },
  { name: "ly", km: LY_KM, max: 2e5 * LY_KM },
  { name: "million ly", km: 1e6 * LY_KM, max: Infinity },
];

export function niceScale(kmPerPx: number, targetPx = 110) {
  if (!(kmPerPx > 0) || !Number.isFinite(kmPerPx)) return null;
  const km = kmPerPx * targetPx;
  const unit = UNITS.find((u) => km < u.max)!;
  const v = km / unit.km;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = [1, 2, 5, 10].map((k) => k * p).filter((x) => x <= v).pop() ?? p;
  return { label: `${n.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${unit.name}`, px: (n * unit.km) / kmPerPx };
}

export function MapChrome() {
  const data = useStore((s) => s.data);
  const viewInfo = useStore((s) => s.viewInfo);
  const layer = useStore((s) => s.layer);
  const setLayer = useStore((s) => s.setLayer);
  const tilt = useStore((s) => s.tilt);
  const setTilt = useStore((s) => s.setTilt);
  const jd = useStore((s) => s.jd);
  const setAboutOpen = useStore((s) => s.setAboutOpen);
  const requestFit = useStore((s) => s.requestFit);
  const route = useRoute();
  if (!data) return null;

  const scale = viewInfo ? niceScale(viewInfo.kmPerPx) : null;
  const date = dateFromJdTdb(jd);
  const iso = date.toISOString().slice(0, 10);
  const min = dateFromJdTdb(data.eph.startJdTdb).toISOString().slice(0, 10);
  const max = dateFromJdTdb(data.eph.endJdTdb).toISOString().slice(0, 10);
  const width = viewInfo?.view.widthKm ?? 0;

  const go = (id: string) => {
    const p = SCALE_PRESETS.find((x) => x.id === id)!;
    getEngine()?.flyTo(p.target(data, jd));
  };
  const activePreset = SCALE_PRESETS.reduce<{ id: string; d: number } | null>((best, p) => {
    const d = Math.abs(Math.log(p.target(data, jd).widthKm / Math.max(width, 1)));
    return !best || d < best.d ? { id: p.id, d } : best;
  }, null);

  return (
    <>
      <nav className="scale-chips" aria-label="Jump to scale">
        {SCALE_PRESETS.map((p) => (
          <button key={p.id} type="button" className={`chip floating ${activePreset?.id === p.id && activePreset.d < 0.6 ? "selected" : ""}`} onClick={() => go(p.id)}>
            {p.label}
          </button>
        ))}
      </nav>

      <div className="map-controls">
        <button type="button" className="ctrl" aria-label="About SpaceMaps and data sources" title="About & data sources" onClick={() => setAboutOpen(true)}>
          <InfoIcon size={20} />
        </button>
        <button type="button" className={`ctrl ${tilt ? "active" : ""}`} aria-pressed={tilt} aria-label="Toggle 3D tilt" title="3D tilt (or right-drag)" onClick={() => setTilt(!tilt)}>
          <ThreeDIcon size={20} />
        </button>
        <button type="button" className="ctrl" aria-label="Fit route" title="Fit route (F)" disabled={!route?.ok} onClick={requestFit}>
          <FitIcon size={20} />
        </button>
        <button type="button" className="ctrl" aria-label="Back to Earth" title="Back to Earth (H)" onClick={() => go(HOME_PRESET.id)}>
          <HomeIcon size={20} />
        </button>
        <div className="ctrl-group">
          <button type="button" className="ctrl" aria-label="Zoom in" title="Zoom in (+)" onClick={() => getEngine()?.zoomBy(0.5)}>
            <AddIcon size={20} />
          </button>
          <button type="button" className="ctrl" aria-label="Zoom out" title="Zoom out (−)" onClick={() => getEngine()?.zoomBy(2)}>
            <RemoveIcon size={20} />
          </button>
        </div>
      </div>

      <button type="button" className={`layer-toggle preview-${layer === "realistic" ? "atlas" : "realistic"}`} onClick={() => setLayer(layer === "realistic" ? "atlas" : "realistic")} aria-label={`Switch to ${layer === "realistic" ? "Atlas" : "Realistic"} layer`}>
        <span className="layer-thumb" aria-hidden="true" />
        <span className="layer-name">
          <LayersIcon size={14} /> {layer === "realistic" ? "Atlas" : "Realistic"}
        </span>
      </button>

      <div className="map-footer">
        <label className="date-chip" title="Positions of Solar System bodies are computed for this date (JPL Horizons)">
          Positions for
          <input
            type="date"
            value={iso}
            min={min}
            max={max}
            onChange={(e) => {
              if (!e.target.value) return;
              const d = new Date(`${e.target.value}T12:00:00Z`);
              useStore.setState({ jd: Math.min(data.eph.endJdTdb, Math.max(data.eph.startJdTdb, jdTdb(d))) });
            }}
          />
        </label>
        {viewInfo && <span className="plane-chip" title="The map plane rotates from the Solar System's plane to the Milky Way's plane as you zoom out">{viewInfo.plane} plane</span>}
        {scale && (
          <span className="scalebar" aria-label={`Scale: ${scale.label}`}>
            <span className="scalebar-label">{scale.label}</span>
            <span className="scalebar-line" style={{ width: scale.px }} />
          </span>
        )}
        <span className="layer-label">
          {layer === "realistic" ? "Realistic layer · symbols enlarged for visibility" : "Atlas layer · symbols not to scale"}
          {width > 1500 * PC_KM && " · Milky Way: illustration, not a photo"}
        </span>
      </div>
    </>
  );
}
