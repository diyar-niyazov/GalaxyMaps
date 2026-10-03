import { useMemo } from "react";
import { useStore, MAX_STOPS } from "../state/store";
import { useMode, useModes, useRoute, useStopObjects } from "../state/selectors";
import { ObjectSearch } from "./ObjectSearch";
import { BackIcon, SwapIcon, AddIcon, CloseIcon, ArrowUpIcon, ArrowDownIcon, PlayIcon, PauseIcon, ReplayIcon, FitIcon, WarningIcon, LightIcon, RocketIcon, ChevronDownIcon, OrbitIcon } from "./icons";
import { formatDistance, formatDistanceSecondary, formatDuration, formatSpeed, formatUncertainty, durationContext, jdToIsoDate } from "../lib/format";
import { evaluateDetour, isOnTheWay } from "../lib/itinerary";
import { positionOf, supportsOrbitalTransfer, type RouteResult } from "../lib/route";
import type { CatalogObject } from "../lib/types";
import type { TransportMode } from "../lib/transport";
import { distance } from "../lib/vec";
import { useMenu } from "./menus";

const STOP_LETTERS = "ABCDE";

function ModeIcon({ mode, size = 20 }: { mode: TransportMode; size?: number }) {
  return mode.id === "light" ? <LightIcon size={size} /> : <RocketIcon size={size} />;
}

/** "Travel mode" dropdown with exactly the two benchmark speeds. */
export function TravelModeSelect({ label = "Travel mode" }: { label?: string }) {
  const modes = useModes();
  const mode = useMode();
  const setMode = useStore((s) => s.setMode);
  const menu = useMenu();
  return (
    <div className="travel-mode" ref={menu.ref}>
      <span className="field-label" id="travel-mode-label">{label}</span>
      <button type="button" className="travel-mode-btn" aria-haspopup="listbox" aria-expanded={menu.open} aria-labelledby="travel-mode-label travel-mode-value" onClick={menu.toggle}>
        <ModeIcon mode={mode} />
        <span id="travel-mode-value" className="travel-mode-value">
          <strong>{mode.label}</strong>
          <small>{formatSpeed(mode.speedKmS)}</small>
        </span>
        <ChevronDownIcon size={18} />
      </button>
      {menu.open && (
        <ul className="menu travel-mode-menu" role="listbox" aria-labelledby="travel-mode-label">
          {modes.map((m) => (
            <li key={m.id} role="option" aria-selected={m.id === mode.id}>
              <button type="button" className={`menu-item mode-option ${m.id === mode.id ? "selected" : ""}`} onClick={() => { setMode(m.id); menu.setOpen(false); }}>
                <ModeIcon mode={m} />
                <span>
                  <strong>{m.label}</strong> <span className="muted">{formatSpeed(m.speedKmS)}</span>
                  <small>{m.description}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DirectionsPanel() {
  const data = useStore((s) => s.data)!;
  const stops = useStore((s) => s.stops);
  const setStop = useStore((s) => s.setStop);
  const swapStops = useStore((s) => s.swapStops);
  const addStop = useStore((s) => s.addStop);
  const removeStop = useStore((s) => s.removeStop);
  const moveStop = useStore((s) => s.moveStop);
  const setPanel = useStore((s) => s.setPanel);
  const selectedId = useStore((s) => s.selectedId);
  const routeModel = useStore((s) => s.routeModel);
  const setRouteModel = useStore((s) => s.setRouteModel);
  const stopObjs = useStopObjects();
  const route = useRoute();
  const transferEligible = stopObjs.length === 2 && stopObjs[0] && stopObjs[1] && supportsOrbitalTransfer(stopObjs[0], stopObjs[1], data.eph);
  const isTransfer = route?.ok && route.kind === "orbital-transfer";

  return (
    <div className="panel directions">
      <div className="dir-head">
        <button type="button" className="icon-btn" aria-label="Close directions" onClick={() => setPanel(selectedId ? "place" : "explore")}>
          <BackIcon />
        </button>
        <h1 className="dir-title">Directions</h1>
      </div>

      <ol className="stops" aria-label="Stops">
        {stops.map((id, i) => {
          const last = i === stops.length - 1;
          return (
            <li key={`${i}-${id ?? "empty"}`} className="stop">
              <span className={`stop-marker ${i === 0 ? "origin" : last ? "dest" : "via"}`} aria-hidden="true">
                {i === 0 ? "" : last ? "" : STOP_LETTERS[i]}
              </span>
              <ObjectSearch
                className="stop-search"
                label={i === 0 ? "Starting point" : last ? "Destination" : `Stop ${i}`}
                placeholder={i === 0 ? "Choose starting point" : last ? "Choose destination" : "Add a stop"}
                value={stopObjs[i]}
                autoFocus={!id && i === stops.length - 1 && !!stops[0]}
                onSelect={(o) => setStop(i, o?.id ?? null)}
              />
              <span className="stop-tools">
                {stops.length > 2 && (
                  <>
                    <button type="button" className="icon-btn small" aria-label={`Move stop ${i + 1} up`} disabled={i === 0} onClick={() => moveStop(i, -1)}>
                      <ArrowUpIcon size={18} />
                    </button>
                    <button type="button" className="icon-btn small" aria-label={`Move stop ${i + 1} down`} disabled={last} onClick={() => moveStop(i, 1)}>
                      <ArrowDownIcon size={18} />
                    </button>
                    <button type="button" className="icon-btn small" aria-label={`Remove stop ${i + 1}`} onClick={() => removeStop(i)}>
                      <CloseIcon size={18} />
                    </button>
                  </>
                )}
              </span>
            </li>
          );
        })}
        {stops.length === 2 && (
          <button type="button" className="icon-btn swap" aria-label="Swap starting point and destination" title="Reverse starting point and destination" onClick={swapStops}>
            <SwapIcon />
          </button>
        )}
      </ol>
      <div className="dir-tools">
        {stops.length < MAX_STOPS && (
          <button type="button" className="text-btn add-stop" onClick={() => addStop(null)}>
            <AddIcon size={18} /> Add stop
          </button>
        )}
      </div>

      {transferEligible && (
        <div className="segmented" role="radiogroup" aria-label="Route model">
          <button type="button" role="radio" aria-checked={routeModel === "auto"} className={routeModel === "auto" ? "on" : ""} onClick={() => setRouteModel("auto")}>
            <OrbitIcon size={16} /> Orbital transfer
          </button>
          <button type="button" role="radio" aria-checked={routeModel === "straight-line"} className={routeModel === "straight-line" ? "on" : ""} onClick={() => setRouteModel("straight-line")}>
            Straight-line comparison
          </button>
        </div>
      )}
      {!isTransfer && <TravelModeSelect />}

      {!route && <p className="empty">{stops.every((s) => !s) ? "Choose a starting point and a destination, or click anything on the map." : "Choose the remaining stops to see directions."}</p>}
      {route && !route.ok && (
        <div className="callout warn" role="alert">
          <WarningIcon size={18} />
          <span>{route.error}</span>
        </div>
      )}
      {route?.ok && <RouteDetails route={route} />}
      {route?.ok && !isTransfer && stopObjs.every(Boolean) && <DetourSuggestions stops={stopObjs as CatalogObject[]} />}
    </div>
  );
}

type OkRoute = Extract<RouteResult, { ok: true }>;

function RouteDetails({ route }: { route: OkRoute }) {
  const data = useStore((s) => s.data)!;
  const mode = useMode();
  const playing = useStore((s) => s.playing);
  const progress = useStore((s) => s.progress);
  const setPlaying = useStore((s) => s.setPlaying);
  const setProgress = useStore((s) => s.setProgress);
  const playbackSeconds = useStore((s) => s.playbackSeconds);
  const setPlaybackSeconds = useStore((s) => s.setPlaybackSeconds);
  const requestFit = useStore((s) => s.requestFit);
  const t = route.transfer;
  const ctx = durationContext(route.modeledSeconds);
  const unc = route.totalSigmaKm != null && route.totalSigmaKm > 0 ? formatUncertainty(route.totalSigmaKm, route.totalSigmaKm) : null;
  const multi = route.legs.length > 1;
  const src = (id?: string) => (id ? data.catalog.sources[id] : undefined);
  const elapsed = progress * route.modeledSeconds;

  return (
    <section className="route" aria-labelledby="route-h" aria-live="polite">
      <div className="route-card selected">
        <p className="route-kind">{t ? "Orbital transfer · idealized Hohmann" : `Straight-line cruise · ${mode.label}`}</p>
        <div className="route-main">
          <h2 id="route-h" className="route-time">{formatDuration(route.modeledSeconds)}</h2>
          <p className="route-dist">
            {t ? <>{formatDistance(route.pathKm)} along the transfer arc</> : <>{formatDistance(route.totalKm)} <span className="muted">· {formatDistanceSecondary(route.totalKm)}</span></>}
          </p>
        </div>
        {t ? (
          <p className="route-via">
            {t.windowFound ? "Next alignment" : "Idealized scenario"}: depart <strong>{jdToIsoDate(t.departJd)}</strong>, arrive <strong>{jdToIsoDate(t.arriveJd)}</strong>
            <br />
            <span className="muted small">Δv {t.h.dv1KmS.toFixed(2)} km/s at departure, {t.h.dv2KmS.toFixed(2)} km/s at arrival (heliocentric) · alignments every {Math.round(t.h.synodicDays)} days</span>
          </p>
        ) : (
          <p className="route-via">{mode.label} · {formatSpeed(mode.speedKmS)} · positions on {jdToIsoDate(route.epochJd)}</p>
        )}
        {ctx && <p className="route-context">{ctx}</p>}
        {unc && <p className="muted small">Distance uncertainty {unc}</p>}
      </div>

      <div className="playback" aria-label="Journey preview">
        <button type="button" className="icon-btn filled" aria-label={playing ? "Pause preview" : progress >= 1 ? "Replay preview" : "Play preview"} onClick={() => setPlaying(!playing)}>
          {playing ? <PauseIcon /> : progress >= 1 ? <ReplayIcon /> : <PlayIcon />}
        </button>
        <input type="range" min={0} max={1000} value={Math.round(progress * 1000)} aria-label="Journey progress" onChange={(e) => { setPlaying(false); setProgress(Number(e.target.value) / 1000); }} />
        <span className="playback-time">{t ? `Day ${Math.round(elapsed / 86400)} of ${Math.round(t.h.transferDays)}` : formatDuration(elapsed)}</span>
        <select aria-label="Preview length" value={playbackSeconds} onChange={(e) => setPlaybackSeconds(Number(e.target.value))}>
          <option value={5}>5 s</option>
          <option value={10}>10 s</option>
          <option value={20}>20 s</option>
          <option value={40}>40 s</option>
        </select>
        <button type="button" className="icon-btn" aria-label="Fit route on map" title="Fit route" onClick={requestFit}>
          <FitIcon size={18} />
        </button>
      </div>
      <p className="muted small">The preview has its own clock ({playbackSeconds} s for the whole trip); Play time is paused while it runs.</p>

      {multi && (
        <ol className="legs" aria-label="Legs">
          {route.legs.map((l) => (
            <li key={l.fromIndex}>
              <span className="leg-route">{route.stops[l.fromIndex].name} → {route.stops[l.toIndex].name}</span>
              <span className="leg-nums">{formatDistance(l.distanceKm)} · {formatDuration(l.seconds)}</span>
            </li>
          ))}
        </ol>
      )}

      {t && (
        <section className="benchmark" aria-labelledby="bench-h">
          <h2 id="bench-h" className="section-title">Speed comparison</h2>
          <p className="muted small">Direct-distance benchmark: the straight-line distance on {jdToIsoDate(route.epochJd)} ({formatDistance(route.totalKm)}) at a constant speed. Light does not follow the transfer orbit.</p>
          <TravelModeSelect label="Compare at" />
          <p className="bench-result"><strong>{formatDuration(route.comparison.seconds)}</strong> at {route.comparison.mode.label.toLowerCase()}</p>
        </section>
      )}

      <details className="assumptions-box">
        <summary>Sources and model details</summary>
        <ul className="assumptions">
          {route.assumptions.map((a) => <li key={a}>{a}</li>)}
          {route.notes.map((n) => <li key={n}>{n}</li>)}
          {!t && mode.sourceId && src(mode.sourceId) && (
            <li>
              Speed: {mode.description}{mode.frame ? ` (${mode.frame})` : ""} · <a href={src(mode.sourceId)!.url} target="_blank" rel="noreferrer">{src(mode.sourceId)!.title}</a>
            </li>
          )}
        </ul>
        <h3 className="mini-title">Distance basis</h3>
        <ul className="assumptions">
          {route.stops.map((s) => (
            <li key={s.id}>
              <strong>{s.name}:</strong>{" "}
              {s.position?.kind === "ephemeris"
                ? "JPL Horizons position on the map date"
                : s.distance
                  ? <>{s.distance.method ?? s.distance.type}{s.distance.plusKm ? ` (${formatUncertainty(s.distance.plusKm, s.distance.minusKm)})` : ""}{src(s.distance.sourceId) ? <> · <a href={src(s.distance.sourceId)!.url} target="_blank" rel="noreferrer">{src(s.distance.sourceId)!.title}</a></> : null}</>
                  : "No distance"}
              {s.distance?.note ? <span className="note"> {s.distance.note}</span> : null}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function DetourSuggestions({ stops }: { stops: CatalogObject[] }) {
  const data = useStore((s) => s.data)!;
  const jd = useStore((s) => s.jd);
  const addStop = useStore((s) => s.addStop);
  const n = stops.length;
  const day = Math.round(jd);
  const suggestions = useMemo(() => {
    const ctx = { eph: data.eph, jdTdb: day };
    const positions = stops.map((s) => positionOf(s, ctx)!);
    const ids = new Set(stops.map((s) => s.id));
    const total = positions.slice(1).reduce((sum, p, i) => sum + distance(p, positions[i]), 0);
    return data.catalog.objects
      .filter((o) => o.featured && o.route.supported && !ids.has(o.id) && o.id !== "sun" && o.type !== "exoplanet")
      .map((o) => ({ o, p: positionOf(o, ctx)! }))
      .filter(({ p }) => p && Math.min(...positions.map((q) => distance(p, q))) > 0.03 * total)
      .map(({ o, p }) => ({ o, det: evaluateDetour(positions, p) }))
      .filter((x): x is { o: CatalogObject; det: NonNullable<typeof x.det> } => !!x.det)
      .sort((a, b) => a.det.addedKm - b.det.addedKm)
      .slice(0, 3);
  }, [data, day, stops]);
  if (n >= MAX_STOPS || !suggestions.length) return null;
  return (
    <section className="detours" aria-labelledby="detour-h">
      <h2 id="detour-h" className="section-title">Add a stop along the way?</h2>
      <ul>
        {suggestions.map(({ o, det }) => (
          <li key={o.id}>
            <span className="detour-text">
              <strong>{o.name}</strong>
              <span className="muted small">+{formatDistance(det.addedKm)} (+{det.addedFraction < 0.001 ? "<0.1" : (det.addedFraction * 100).toFixed(det.addedFraction < 0.1 ? 1 : 0)}%)</span>
            </span>
            {isOnTheWay(det) ? <span className="tag ok">On the way</span> : <span className="tag">Detour</span>}
            <button type="button" className="text-btn" onClick={() => addStop(o.id, det.insertAt)}>
              <AddIcon size={16} /> Add
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
