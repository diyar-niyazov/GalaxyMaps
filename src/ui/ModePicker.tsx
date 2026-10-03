import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { useModes } from "../state/selectors";
import type { TransportMode } from "../lib/transport";
import { C_KM_S } from "../lib/units";
import { formatSpeed } from "../lib/format";
import { LightIcon, RocketIcon, SpeedIcon, MoreIcon, StarshipIcon, CarIcon } from "./icons";

const TAB_LABEL: Record<string, string> = {
  "voyager-1-speed": "Voyager 1",
  "new-horizons-speed": "New Horizons",
  "parker-peak-speed": "Parker",
};

function ModeIcon({ m }: { m: TransportMode }) {
  if (m.group === "light") return <LightIcon size={18} />;
  if (m.group === "spacecraft") return <RocketIcon size={18} />;
  if (m.group === "custom") return <SpeedIcon size={18} />;
  if (m.group === "scifi") return <StarshipIcon size={18} />;
  return <CarIcon size={18} />;
}

export function ModePicker() {
  const modes = useModes();
  const modeId = useStore((s) => s.modeId);
  const setMode = useStore((s) => s.setMode);
  const custom = useStore((s) => s.custom);
  const setCustom = useStore((s) => s.setCustom);
  const fictional = useStore((s) => s.fictional);
  const setFictional = useStore((s) => s.setFictional);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const moreRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const primary = modes.filter((m) => m.group === "light" || m.group === "spacecraft");
  const more = modes.filter((m) => m.group === "scifi" || m.group === "everyday");
  const current = modes.find((m) => m.id === modeId);
  const inMore = current && (current.group === "scifi" || current.group === "everyday");

  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>(".mode-tab.selected")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [modeId]);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [moreOpen]);

  return (
    <div className="modes">
      <div className="mode-tabs" role="radiogroup" aria-label="Travel mode" ref={tabsRef}>
        {primary.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={modeId === m.id} className={`mode-tab ${modeId === m.id ? "selected" : ""}`} onClick={() => setMode(m.id)} title={`${m.label}: ${formatSpeed(m.speedKmS)}`}>
            <ModeIcon m={m} />
            <span>{TAB_LABEL[m.id] ?? m.shortLabel}</span>
          </button>
        ))}
        <button type="button" role="radio" aria-checked={modeId === "custom"} className={`mode-tab ${modeId === "custom" ? "selected" : ""}`} onClick={() => setCustom(custom)}>
          <SpeedIcon size={18} />
          <span>Custom</span>
        </button>
        <div className="more-wrap" ref={moreRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            className={`mode-tab ${inMore ? "selected" : ""}`}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenuPos({ top: r.bottom + 4, left: Math.max(8, r.right - 270) });
              setMoreOpen((o) => !o);
            }}
          >
            {inMore && current ? <ModeIcon m={current} /> : <MoreIcon size={18} />}
            <span>{inMore && current ? current.shortLabel : "More"}</span>
          </button>
          {moreOpen && (
            <div className="menu" role="menu" style={menuPos}>
              <div className="menu-label">Science fiction (not real physics)</div>
              {more.filter((m) => m.group === "scifi").map((m) => (
                <button key={m.id} type="button" role="menuitemradio" aria-checked={modeId === m.id} className="menu-item" onClick={() => { setMode(m.id); setMoreOpen(false); }}>
                  <StarshipIcon size={18} />
                  <span>{m.label}<small>{formatSpeed(m.speedKmS)} · fictional</small></span>
                </button>
              ))}
              <div className="menu-label">Everyday comparisons</div>
              {more.filter((m) => m.group === "everyday").map((m) => (
                <button key={m.id} type="button" role="menuitemradio" aria-checked={modeId === m.id} className="menu-item" onClick={() => { setMode(m.id); setMoreOpen(false); }}>
                  <CarIcon size={18} />
                  <span>{m.label}<small>{formatSpeed(m.speedKmS)}</small></span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {modeId === "custom" && (
        <div className="custom-speed">
          <label htmlFor="custom-v">Speed</label>
          <input
            id="custom-v"
            type="number"
            min={0}
            step="any"
            value={custom.value}
            onChange={(e) => setCustom({ ...custom, value: Number(e.target.value) })}
          />
          <select aria-label="Unit" value={custom.unit} onChange={(e) => setCustom({ ...custom, unit: e.target.value as typeof custom.unit })}>
            <option value="c">× light speed (c)</option>
            <option value="km/s">km/s</option>
            <option value="km/h">km/h</option>
          </select>
          {!current && <p className="hint error">Enter a speed above 0 and at most light speed ({C_KM_S.toLocaleString()} km/s).</p>}
        </div>
      )}
      {current?.group === "scifi" && (
        <div className="custom-speed">
          <label htmlFor="fict-v">Assumed speed</label>
          <input
            id="fict-v"
            type="number"
            min={1}
            step="any"
            value={fictional[current.id as "enterprise" | "falcon"]}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v > 0 && Number.isFinite(v)) setFictional({ [current.id]: v });
            }}
          />
          <span className="unit">× c</span>
        </div>
      )}
    </div>
  );
}
