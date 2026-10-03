import { useMemo } from "react";
import { useStore, TIME_RATES, type TimeRateId } from "../state/store";
import { getEngine } from "../map/engineRef";
import { REGION_PRESETS, REGION_GROUPS, type RegionPreset } from "../map/presets";
import { AddIcon, RemoveIcon, HomeIcon, FitIcon, ThreeDIcon, LayersIcon, InfoIcon, ChevronDownIcon, MoreIcon, LockIcon, PlayIcon, PauseIcon, ReplayIcon, OrbitIcon, BackIcon, FocusIcon } from "./icons";
import { dateFromJdTdb, jdTdb } from "../lib/units";
import { niceScale } from "./describe";
import { PLAY_MIN_JD, PLAY_MAX_JD, ephemerisAccuracy, clampPlayJd } from "../lib/ephemeris";
import { useRoute } from "../state/selectors";
import { goHome, goRegion, focusObject } from "../state/actions";
import { useMenu } from "./menus";
import { XrButton } from "../xr/XrButton";
import { DISTANCE_BANDS_LY, bandLabel } from "../map/universe";

function useActivePreset(): string | null {
  const data = useStore((s) => s.data);
  const width = useStore((s) => s.viewInfo?.view.widthKm ?? 0);
  const mode = useStore((s) => s.camera.mode);
  return useMemo(() => {
    if (!data || mode !== "explore" || !width) return null;
    let best: { id: string; d: number } | null = null;
    for (const p of REGION_PRESETS) {
      const d = Math.abs(Math.log(p.target(data, data.eph.startJdTdb).widthKm / width));
      if (!best || d < best.d) best = { id: p.id, d };
    }
    return best && best.d < 0.5 ? best.id : null;
  }, [data, width, mode]);
}

function RegionGroup({ group, items, active }: { group: { id: string; label: string }; items: RegionPreset[]; active: string | null }) {
  const menu = useMenu();
  const activeItem = items.find((i) => i.id === active);
  if (items.length === 1) {
    const p = items[0];
    return (
      <button type="button" className={`chip floating ${active === p.id ? "selected" : ""}`} aria-pressed={active === p.id} onClick={() => goRegion(p.id)}>
        {p.label}
      </button>
    );
  }
  return (
    <div className="region-group" ref={menu.ref}>
      <button type="button" className={`chip floating ${activeItem ? "selected" : ""}`} aria-haspopup="menu" aria-expanded={menu.open} onClick={menu.toggle}>
        {activeItem?.label ?? group.label}
        <ChevronDownIcon size={16} />
      </button>
      {menu.open && (
        <div className="menu" role="menu" aria-label={group.label}>
          {items.map((p) => (
            <button key={p.id} type="button" role="menuitemradio" aria-checked={active === p.id} className="menu-item" onClick={() => { menu.setOpen(false); goRegion(p.id); }}>
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RegionBar() {
  const active = useActivePreset();
  const more = useMenu();
  return (
    <nav className="region-bar" aria-label="Regions" data-map-inset="top">
      <div className="region-strip">
        {REGION_GROUPS.map((g) => (
          <RegionGroup key={g.id} group={g} items={REGION_PRESETS.filter((p) => p.group === g.id)} active={active} />
        ))}
      </div>
      <div className="region-group" ref={more.ref}>
        <button type="button" className="chip floating icon-only" aria-label="All regions" title="All regions" aria-haspopup="menu" aria-expanded={more.open} onClick={more.toggle}>
          <MoreIcon size={18} />
        </button>
        {more.open && (
          <div className="menu menu-right" role="menu" aria-label="All regions">
            <button type="button" role="menuitem" className="menu-item" onClick={() => { more.setOpen(false); goHome(); }}>Home: Earth close-up</button>
            {REGION_GROUPS.map((g) => (
              <div key={g.id} role="group" aria-label={g.label}>
                <div className="menu-heading">{g.label}</div>
                {REGION_PRESETS.filter((p) => p.group === g.id).map((p) => (
                  <button key={p.id} type="button" role="menuitemradio" aria-checked={active === p.id} className="menu-item" onClick={() => { more.setOpen(false); goRegion(p.id); }}>
                    {p.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}

function CameraBar() {
  const data = useStore((s) => s.data);
  const camera = useStore((s) => s.camera);
  const stops = useStore((s) => s.stops);
  if (!data || camera.mode === "explore") return null;
  const eng = getEngine();
  if (camera.mode === "locked" && camera.lockedId) {
    const obj = data.byId.get(camera.lockedId);
    return (
      <div className="camera-bar" role="status" aria-live="polite">
        <span className="camera-state"><LockIcon size={14} /> <span className="lock-prefix">Locked on</span> <strong>{obj?.name ?? camera.lockedId}</strong></span>
        <button type="button" className="camera-btn" onClick={() => eng?.resetView()} title="Restore this object's initial framing (R)" aria-label="Reset view">
          <ReplayIcon size={16} /> <span className="btn-label">Reset view</span>
        </button>
        <button type="button" className="camera-btn primary" onClick={() => eng?.unlock()} title="Back to free exploration (Esc)">Back to explore</button>
      </div>
    );
  }
  const dest = stops[stops.length - 1];
  return (
    <div className="camera-bar" role="status" aria-live="polite">
      <span className="camera-state">Route view</span>
      {dest && data.byId.get(dest)?.position && (
        <button type="button" className="camera-btn" onClick={() => focusObject(dest)}>
          <FocusIcon size={16} /> Focus {data.byId.get(dest)!.name}
        </button>
      )}
      <button type="button" className="camera-btn primary" onClick={() => eng?.unlock()}>Back to explore</button>
    </div>
  );
}

function TimeBar() {
  const data = useStore((s) => s.data)!;
  const jd = useStore((s) => s.jd);
  const time = useStore((s) => s.time);
  const playTime = useStore((s) => s.playTime);
  const pauseTime = useStore((s) => s.pauseTime);
  const resetTime = useStore((s) => s.resetTime);
  const setTimeRate = useStore((s) => s.setTimeRate);
  const iso = dateFromJdTdb(jd).toISOString().slice(0, 10);
  const min = dateFromJdTdb(PLAY_MIN_JD).toISOString().slice(0, 10);
  const max = dateFromJdTdb(PLAY_MAX_JD).toISOString().slice(0, 10);
  const approx = ephemerisAccuracy(data.eph, jd) === "approximate";
  const elapsed = time.armed || jd !== time.startJd ? jd - time.startJd : 0;
  const state = time.running ? "Playing" : time.armed ? "Held while you interact" : "Paused";
  const fmtElapsed = (d: number) => {
    const a = Math.abs(d);
    const s = d < 0 ? "−" : "+";
    return a < 2 ? `${s}${(a * 24).toFixed(0)} h` : a < 730 ? `${s}${a.toFixed(0)} days` : `${s}${(a / 365.25).toFixed(1)} years`;
  };
  return (
    <div className="time-bar" role="group" aria-label="Simulated time" data-map-inset="bottom">
      <button type="button" className={`time-play ${time.armed ? "on" : ""}`} onClick={() => (time.armed ? pauseTime() : playTime())} aria-pressed={time.armed} title="Play time (Space)">
        {time.armed ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        <span>{time.armed ? "Pause" : "Play time"}</span>
      </button>
      <label className="time-date" title="Date used for Solar System positions">
        <span className="sr-only">Map date</span>
        <input
          type="date"
          value={iso}
          min={min}
          max={max}
          onChange={(e) => {
            if (!e.target.value) return;
            pauseTime();
            useStore.getState().setJd(clampPlayJd(jdTdb(new Date(`${e.target.value}T12:00:00Z`))));
          }}
        />
      </label>
      <select className="time-rate" aria-label="Time rate" value={time.rate} onChange={(e) => setTimeRate(e.target.value as TimeRateId)}>
        {TIME_RATES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
      <button type="button" className="icon-btn small" aria-label="Reset time" title="Reset time to where Play started" onClick={resetTime} disabled={!elapsed && !time.armed}>
        <ReplayIcon size={18} />
      </button>
      <span className={`time-state ${time.running ? "running" : time.armed ? "held" : ""}`} aria-live="polite">
        {state}{elapsed ? ` · ${fmtElapsed(elapsed)}` : ""}
      </span>
      {approx && <span className="time-warn" title="Outside the JPL Horizons table (2026-09-01 to 2027-03-01): planets follow two-body Kepler orbits; spacecraft are hidden.">Approximate orbits</span>}
    </div>
  );
}

function StatusBar() {
  const data = useStore((s) => s.data)!;
  const viewInfo = useStore((s) => s.viewInfo);
  const layer = useStore((s) => s.layer);
  const menu = useMenu();
  const scale = viewInfo && viewInfo.universe < 0.5 ? niceScale(viewInfo.kmPerPx) : null;
  const src = (id: string) => data.catalog.sources[id];
  const bg = viewInfo?.background;
  const svs = src("nasa-svs-deep-star-maps");
  return (
    <div className="status-bar" ref={menu.ref} data-map-inset="bottom">
      {scale ? (
        <span className="scalebar" aria-label={`Scale: ${scale.label}`}>
          <span className="scalebar-label">{scale.label}</span>
          <span className="scalebar-line" style={{ width: scale.px }} />
        </span>
      ) : viewInfo && viewInfo.universe >= 0.5 ? (
        <span className="status-text">Logarithmic distance · no linear scale</span>
      ) : null}
      {viewInfo && viewInfo.universe < 0.5 && <span className="status-text plane-chip">{viewInfo.plane} plane</span>}
      <button type="button" className="status-more" aria-expanded={menu.open} onClick={menu.toggle}>
        Sources and model details <ChevronDownIcon size={14} />
      </button>
      {menu.open && (
        <div className="status-pop" role="dialog" aria-label="Sources and model details">
          <dl>
            <div><dt>Layer</dt><dd>{layer === "realistic" ? "Realistic: textured bodies; markers are enlarged so small bodies stay visible. Distances never use marker sizes." : "Atlas: simplified symbols, not to scale."}</dd></div>
            {bg === "sky-panorama" && svs && <div><dt>Background</dt><dd>The sky as seen from Earth: <a href={svs.url} target="_blank" rel="noreferrer">{svs.title}</a>. Decorative only; not clickable and not used for distances.</dd></div>}
            {bg === "catalog-stars" && <div><dt>Stars</dt><dd>Real stars from the <a href={src("hyg-v44")?.url} target="_blank" rel="noreferrer">HYG catalog</a> at their measured 3D positions; dim stars are drawn small.</dd></div>}
            {bg === "milky-way" && <div><dt>Milky Way</dt><dd>A labeled reconstruction (bar, four arms, dust lanes) placed 8.18 kpc from the Sun; nobody has photographed our galaxy from outside.</dd></div>}
            {bg === "universe" && <div><dt>Overview</dt><dd>Schematic: directions are true, distances are compressed logarithmically. Radius ≈ 46 billion light-years is the comoving distance to the particle horizon in the Planck 2018 flat ΛCDM model. Bands: {DISTANCE_BANDS_LY.map(bandLabel).join(", ")}.</dd></div>}
            <div><dt>Positions</dt><dd>Solar System bodies from <a href={src("jpl-horizons")?.url} target="_blank" rel="noreferrer">JPL Horizons</a> for 2026-09-01 to 2027-03-01, two-body orbits outside that range. Stars, nebulae and galaxies: SIMBAD coordinates with vetted distances.</dd></div>
            <div><dt>Plane</dt><dd>The map rotates from the ecliptic (Solar System) to the Galactic plane as you zoom out. This only changes the view.</dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}

export function MapChrome() {
  const data = useStore((s) => s.data);
  const layer = useStore((s) => s.layer);
  const setLayer = useStore((s) => s.setLayer);
  const tilt = useStore((s) => s.tilt);
  const setTilt = useStore((s) => s.setTilt);
  const setAboutOpen = useStore((s) => s.setAboutOpen);
  const requestFit = useStore((s) => s.requestFit);
  const camera = useStore((s) => s.camera);
  const orbitCamera = useStore((s) => s.orbitCamera);
  const setOrbitCamera = useStore((s) => s.setOrbitCamera);
  const panel = useStore((s) => s.panel);
  const route = useRoute();
  if (!data) return null;
  const locked = camera.mode === "locked";

  return (
    <>
      <RegionBar />
      <CameraBar />

      <div className="map-controls" data-map-inset="right">
        <button type="button" className="ctrl" aria-label="About GalaxyMaps and data sources" title="About & data sources" onClick={() => setAboutOpen(true)}>
          <InfoIcon size={20} />
        </button>
        {locked ? (
          <button type="button" className={`ctrl ${orbitCamera ? "active" : ""}`} aria-pressed={orbitCamera} aria-label="Orbit camera" title="Slowly orbit the locked object while idle" onClick={() => setOrbitCamera(!orbitCamera)}>
            <OrbitIcon size={20} />
          </button>
        ) : (
          <button type="button" className={`ctrl ${tilt ? "active" : ""}`} aria-pressed={tilt} aria-label="Toggle 3D tilt" title="3D tilt (or right-drag)" onClick={() => setTilt(!tilt)}>
            <ThreeDIcon size={20} />
          </button>
        )}
        <button type="button" className="ctrl" aria-label="Fit route" title="Fit route (F)" disabled={!route?.ok || panel !== "directions"} onClick={requestFit}>
          <FitIcon size={20} />
        </button>
        <button type="button" className="ctrl" aria-label="Home: Earth close-up" title="Home: Earth close-up (H)" onClick={goHome}>
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
        <XrButton />
      </div>

      <div className="map-bottom">
        <button type="button" className={`layer-toggle preview-${layer === "realistic" ? "atlas" : "realistic"}`} onClick={() => setLayer(layer === "realistic" ? "atlas" : "realistic")} aria-label={`Switch to ${layer === "realistic" ? "Atlas" : "Realistic"} layer`}>
          <span className="layer-thumb" aria-hidden="true" />
          <span className="layer-name">
            <LayersIcon size={14} /> {layer === "realistic" ? "Atlas" : "Realistic"}
          </span>
        </button>
        <StatusBar />
        <TimeBar />
      </div>
      {camera.mode === "route" && panel !== "directions" && (
        <button type="button" className="camera-btn floating-back" onClick={() => getEngine()?.unlock()}>
          <BackIcon size={16} /> Back to explore
        </button>
      )}
    </>
  );
}
