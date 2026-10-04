import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { useTravel, TRAVEL_SPEEDS, startTravel, pauseTravel, resumeTravel, skipTravel, cancelTravel } from "../state/travel";
import { useEscapeLayer } from "./menus";
import { formatDuration } from "../lib/format";
import { CloseIcon, PauseIcon, PlayIcon, RocketIcon, ChevronRightIcon } from "./icons";
import "./travel.css";

/** Begin-journey preview and in-flight controls, layered over the map. */
export function TravelOverlay() {
  const phase = useTravel((s) => s.phase);
  if (phase === "idle") return null;
  return phase === "preview" ? <TravelPreview /> : <TravelControls />;
}

function TravelPreview() {
  const summary = useTravel((s) => s.summary)!;
  const speed = useTravel((s) => s.speed);
  const startRef = useRef<HTMLButtonElement>(null);
  useEscapeLayer(cancelTravel);
  useEffect(() => startRef.current?.focus(), []);
  return (
    <section className="travel-preview" role="dialog" aria-modal="false" aria-labelledby="travel-title" aria-describedby="travel-model">
      <p className="travel-eyebrow"><RocketIcon size={14} /> Begin journey</p>
      <h2 id="travel-title">{summary.originName} → {summary.destinationName}</h2>
      <dl className="travel-facts">
        <div><dt>Travel</dt><dd>{summary.vehicle}</dd></div>
        <div><dt>Calculated duration</dt><dd>{summary.duration}</dd></div>
        <div><dt>Route model</dt><dd>{summary.modelKind === "modeled" ? "Physically modeled transfer" : "Constant-speed benchmark"}</dd></div>
      </dl>
      <p id="travel-model" className="travel-note">{summary.model}</p>
      <SpeedPicker value={speed} />
      <div className="travel-actions">
        <button type="button" className="travel-secondary" onClick={cancelTravel}>Cancel</button>
        <button type="button" ref={startRef} className="travel-primary" onClick={startTravel}>Start journey <ChevronRightIcon size={16} /></button>
      </div>
    </section>
  );
}

function TravelControls() {
  const phase = useTravel((s) => s.phase);
  const summary = useTravel((s) => s.summary)!;
  const speed = useTravel((s) => s.speed);
  const progress = useStore((s) => s.progress);
  useEscapeLayer(cancelTravel, false);
  const flying = phase === "flying";
  const pct = Math.round(progress * 100);
  return (
    <section className="travel-hud" aria-label={`Journey to ${summary.destinationName}`}>
      <div className="travel-hud-head">
        <span className="travel-hud-title"><strong>{summary.originName} → {summary.destinationName}</strong><small>{summary.vehicle} · {summary.duration} · compressed visualization</small></span>
        <button type="button" className="icon-btn" aria-label="Exit journey" title="Exit journey (Esc)" onClick={cancelTravel}><CloseIcon size={18} /></button>
      </div>
      <div className="travel-progress" role="progressbar" aria-label="Journey progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${pct}% of the way to ${summary.destinationName}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="travel-hud-actions">
        <button type="button" className="travel-primary small" onClick={flying ? pauseTravel : resumeTravel} aria-label={flying ? "Pause journey" : "Resume journey"}>
          {flying ? <PauseIcon size={16} /> : <PlayIcon size={16} />} {flying ? "Pause" : "Resume"}
        </button>
        <button type="button" className="travel-secondary small" onClick={skipTravel}>Skip to arrival</button>
        <SpeedPicker value={speed} compact />
      </div>
    </section>
  );
}

function SpeedPicker({ value, compact = false }: { value: number; compact?: boolean }) {
  return (
    <fieldset className={`travel-speed ${compact ? "compact" : ""}`}>
      <legend>{compact ? "Animation speed" : `Animation speed (visual only; ${formatDuration(TRAVEL_SPEEDS.find((s) => s.id === value)!.seconds)} on screen)`}</legend>
      <div role="radiogroup" aria-label="Animation speed">
        {TRAVEL_SPEEDS.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={value === s.id} className={value === s.id ? "active" : ""} onClick={() => useTravel.getState().setSpeed(s.id)}>
            {s.id}×
          </button>
        ))}
      </div>
    </fieldset>
  );
}
