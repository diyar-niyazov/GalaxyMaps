import { useMemo, useState } from "react";
import { useStore, MAX_STOPS } from "../state/store";
import { useMode, useModes, useRoute, useStopObjects, routeFor } from "../state/selectors";
import { ObjectSearch } from "./ObjectSearch";
import { ModePicker } from "./ModePicker";
import { BackIcon, SwapIcon, AddIcon, CloseIcon, ArrowUpIcon, ArrowDownIcon, PlayIcon, PauseIcon, ReplayIcon, FitIcon, WarningIcon, InfoIcon } from "./icons";
import { formatDistance, formatDistanceSecondary, formatDuration, formatSpeed, formatUncertainty, durationContext } from "../lib/format";
import { evaluateDetour, isOnTheWay } from "../lib/itinerary";
import { positionOf } from "../lib/route";
import type { CatalogObject } from "../lib/types";
import { distance } from "../lib/vec";

const QUALITY_LABEL = { precise: "Precise distances", good: "Good distances", approximate: "Approximate distances", uncertain: "Uncertain distances" } as const;
const STOP_LETTERS = "ABCDE";

export function DirectionsPanel() {
  const stops = useStore((s) => s.stops);
  const setStop = useStore((s) => s.setStop);
  const swapStops = useStore((s) => s.swapStops);
  const addStop = useStore((s) => s.addStop);
  const removeStop = useStore((s) => s.removeStop);
  const moveStop = useStore((s) => s.moveStop);
  const setPanel = useStore((s) => s.setPanel);
  const selectedId = useStore((s) => s.selectedId);
  const stopObjs = useStopObjects();
  const route = useRoute();
  const mode = useMode();

  return (
    <div className="panel directions">
      <div className="dir-head">
        <button type="button" className="icon-btn" aria-label="Close directions" onClick={() => setPanel(selectedId ? "place" : "explore")}>
          <BackIcon />
        </button>
        <ModePicker />
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
                  </>
                )}
                {stops.length > 2 && (
                  <button type="button" className="icon-btn small" aria-label={`Remove stop ${i + 1}`} onClick={() => removeStop(i)}>
                    <CloseIcon size={18} />
                  </button>
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
      {stops.length < MAX_STOPS && (
        <button type="button" className="text-btn add-stop" onClick={() => addStop(null)}>
          <AddIcon size={18} /> Add stop
        </button>
      )}

      <div className="divider" />

      {!mode && <EmptyState text="Enter a custom speed greater than 0 and no faster than light." />}
      {mode && !route && <EmptyState text={stops.every((s) => !s) ? "Choose a starting point and a destination, or click anything on the map." : "Choose the remaining stops to see directions."} />}
      {route && !route.ok && (
        <div className="callout warn" role="alert">
          <WarningIcon size={18} />
          <span>{route.error}</span>
        </div>
      )}
      {route?.ok && mode && <RouteDetails />}
      {route?.ok && stopObjs.every(Boolean) && <DetourSuggestions stops={stopObjs as CatalogObject[]} />}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}

function RouteDetails() {
  const route = useRoute();
  const mode = useMode()!;
  const playing = useStore((s) => s.playing);
  const progress = useStore((s) => s.progress);
  const setPlaying = useStore((s) => s.setPlaying);
  const setProgress = useStore((s) => s.setProgress);
  const playbackSeconds = useStore((s) => s.playbackSeconds);
  const setPlaybackSeconds = useStore((s) => s.setPlaybackSeconds);
  const requestFit = useStore((s) => s.requestFit);
  const [showAssumptions, setShowAssumptions] = useState(false);
  if (!route?.ok) return null;

  const ctx = durationContext(route.totalSeconds);
  const unc = route.totalSigmaKm != null && route.totalSigmaKm > 0 ? formatUncertainty(route.totalSigmaKm, route.totalSigmaKm) : null;
  const multi = route.legs.length > 1;

  return (
    <section className="route" aria-labelledby="route-h" aria-live="polite">
      <div className="route-card selected">
        <div className="route-main">
          <h2 id="route-h" className="route-time">{formatDuration(route.totalSeconds)}</h2>
          <p className="route-dist">
            {formatDistance(route.totalKm)} <span className="muted">· {formatDistanceSecondary(route.totalKm)}</span>
          </p>
        </div>
        <p className="route-via">
          {mode.id === "light" ? "Straight line at the speed of light" : `Straight line · ${mode.label} · ${formatSpeed(mode.speedKmS)}`}
          {mode.kind === "fictional" && <span className="tag fiction">Fictional</span>}
        </p>
        {ctx && <p className="route-context">{ctx}</p>}
        {unc && <p className="muted small">Distance uncertainty {unc}</p>}
        {route.proper && route.proper.gamma > 1.0001 && (
          <p className="route-proper">
            Onboard clocks: <strong>{formatDuration(route.proper.properSeconds)}</strong> <span className="muted">(time dilation, γ = {route.proper.gamma < 100 ? route.proper.gamma.toFixed(3) : route.proper.gamma.toExponential(2)})</span>
          </p>
        )}
        {mode.id === "light" && <p className="muted small">Even light needs this long. Nothing with mass can reach light speed, so onboard time isn't defined here.</p>}
        <p className={`quality q-${route.quality}`}>{QUALITY_LABEL[route.quality]}</p>
      </div>

      <div className="playback" aria-label="Journey playback">
        <button type="button" className="icon-btn filled" aria-label={playing ? "Pause journey" : progress >= 1 ? "Replay journey" : "Play journey"} onClick={() => setPlaying(!playing)}>
          {playing ? <PauseIcon /> : progress >= 1 ? <ReplayIcon /> : <PlayIcon />}
        </button>
        <input type="range" min={0} max={1000} value={Math.round(progress * 1000)} aria-label="Journey progress" onChange={(e) => { setPlaying(false); setProgress(Number(e.target.value) / 1000); }} />
        <span className="playback-time" title="Elapsed journey time at the selected speed">{formatDuration(progress * route.totalSeconds)}</span>
        <select aria-label="Playback length" value={playbackSeconds} onChange={(e) => setPlaybackSeconds(Number(e.target.value))}>
          <option value={5}>5 s</option>
          <option value={10}>10 s</option>
          <option value={20}>20 s</option>
          <option value={40}>40 s</option>
        </select>
        <button type="button" className="icon-btn" aria-label="Fit route on map" title="Fit route" onClick={requestFit}>
          <FitIcon size={18} />
        </button>
      </div>
      <p className="muted small">Playback compresses the whole trip into {playbackSeconds} seconds regardless of speed.</p>

      {multi && (
        <ol className="legs" aria-label="Legs">
          {route.legs.map((l) => (
            <li key={l.fromIndex}>
              <span className="leg-route">
                {route.stops[l.fromIndex].name} → {route.stops[l.toIndex].name}
              </span>
              <span className="leg-nums">
                {formatDistance(l.distanceKm)} · {formatDuration(l.seconds)}
              </span>
            </li>
          ))}
        </ol>
      )}

      <button type="button" className="text-btn" aria-expanded={showAssumptions} onClick={() => setShowAssumptions((v) => !v)}>
        <InfoIcon size={16} /> {showAssumptions ? "Hide" : "Show"} assumptions
      </button>
      {showAssumptions && (
        <ul className="assumptions">
          <li>Hypothetical constant-speed travel along a straight 3D line: time = distance ÷ speed.</li>
          <li>No acceleration, braking, fuel, gravity assists or orbital mechanics.</li>
          {route.usesEphemeris && <li>Solar System positions are for the map date (JPL Horizons). Targets keep moving; real missions follow curved orbits.</li>}
          {route.stops.some((s) => s.position?.kind === "static") && <li>Star and galaxy positions are catalog positions at their epoch; motion over the trip is ignored.</li>}
          <li>{mode.description}</li>
          {mode.ftl && <li>Faster than light: no relativistic proper time is computed.</li>}
          {route.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      <CompareModes />
    </section>
  );
}

function CompareModes() {
  const data = useStore((s) => s.data)!;
  const stops = useStore((s) => s.stops);
  const jd = useStore((s) => s.jd);
  const modeId = useStore((s) => s.modeId);
  const setMode = useStore((s) => s.setMode);
  const modes = useModes();
  const rows = useMemo(
    () =>
      modes.map((m) => {
        const r = routeFor(data, stops, m, jd);
        return { m, seconds: r && r.ok ? r.totalSeconds : null };
      }),
    [modes, data, stops, jd],
  );
  return (
    <details className="compare">
      <summary>Compare travel modes</summary>
      <table>
        <tbody>
          {rows.map(({ m, seconds }) => (
            <tr key={m.id} className={m.id === modeId ? "current" : ""}>
              <th scope="row">
                <button type="button" className="link-btn" onClick={() => setMode(m.id)}>
                  {m.label}
                </button>
                {m.kind === "fictional" && <span className="tag fiction">Fictional</span>}
              </th>
              <td>{seconds != null ? formatDuration(seconds) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function DetourSuggestions({ stops }: { stops: CatalogObject[] }) {
  const data = useStore((s) => s.data)!;
  const jd = useStore((s) => s.jd);
  const addStop = useStore((s) => s.addStop);
  const n = stops.length;
  const suggestions = useMemo(() => {
    const ctx = { eph: data.eph, jdTdb: jd };
    const positions = stops.map((s) => positionOf(s, ctx)!);
    const ids = new Set(stops.map((s) => s.id));
    const total = positions.slice(1).reduce((sum, p, i) => sum + distance(p, positions[i]), 0);
    return data.catalog.objects
      .filter((o) => o.featured && o.route.supported && !ids.has(o.id) && o.id !== "sun")
      .map((o) => ({ o, p: positionOf(o, ctx)! }))
      // Skip candidates that sit essentially on top of an existing stop (e.g. the Moon on a trip from Earth).
      .filter(({ p }) => p && Math.min(...positions.map((q) => distance(p, q))) > 0.03 * total)
      .map(({ o, p }) => ({ o, det: evaluateDetour(positions, p) }))
      .filter((x): x is { o: CatalogObject; det: NonNullable<typeof x.det> } => !!x.det)
      .sort((a, b) => a.det.addedKm - b.det.addedKm)
      .slice(0, 3);
  }, [data, jd, stops]);
  if (n >= MAX_STOPS || !suggestions.length) return null;
  return (
    <section className="detours" aria-labelledby="detour-h">
      <h2 id="detour-h" className="section-title">Add a stop along the way?</h2>
      <p className="muted small">Ranked by the extra distance each stop adds (detour evaluated, not assumed).</p>
      <ul>
        {suggestions.map(({ o, det }) => (
          <li key={o.id}>
            <span className="detour-text">
              <strong>{o.name}</strong>
              <span className="muted small">
                +{formatDistance(det.addedKm)} (+{det.addedFraction < 0.001 ? "<0.1" : (det.addedFraction * 100).toFixed(det.addedFraction < 0.1 ? 1 : 0)}%)
              </span>
            </span>
            {isOnTheWay(det) ? <span className="tag ok">On the way</span> : <span className="tag">Detour</span>}
            <button
              type="button"
              className="text-btn"
              onClick={() => addStop(o.id, det.insertAt)}
            >
              <AddIcon size={16} /> Add
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
