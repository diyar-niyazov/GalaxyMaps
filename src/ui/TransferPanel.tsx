import { useEffect, useMemo } from "react";
import { useStore } from "../state/store";
import { hohmann } from "../lib/transfer";
import { getEngine } from "../map/engineRef";
import { AU_KM } from "../lib/units";
import { BackIcon, PlayIcon, PauseIcon, ReplayIcon } from "./icons";

const deg = (r: number) => (r * 180) / Math.PI;

export function TransferPanel() {
  const data = useStore((s) => s.data)!;
  const transfer = useStore((s) => s.transfer);
  const setTransfer = useStore((s) => s.setTransfer);
  const setPanel = useStore((s) => s.setPanel);
  const e = data.eph.orbits["earth"], m = data.eph.orbits["mars"];
  const h = useMemo(() => (e && m ? hohmann(e.aKm, m.aKm) : null), [e, m]);

  useEffect(() => {
    getEngine()?.flyTo({ center: [0, 0, 0], widthKm: 4.6 * AU_KM });
    return () => setTransfer({ playing: false });
  }, [setTransfer]);

  if (!h) return <p className="empty">Orbit data for Earth and Mars is missing from the dataset.</p>;
  const day = Math.round(transfer.t * h.transferDays);

  return (
    <div className="panel transfer">
      <div className="panel-head">
        <button type="button" className="icon-btn" aria-label="Back" onClick={() => setPanel("explore")}>
          <BackIcon />
        </button>
        <h1>Earth → Mars, the real way</h1>
      </div>
      <p>
        A straight line works for comparing distances, but spacecraft coast along orbits. The cheapest classic path is a <strong>Hohmann transfer</strong>: half an ellipse that touches Earth's orbit and Mars's orbit.
      </p>

      <div className="route-card selected">
        <h2 className="route-time">{Math.round(h.transferDays)} days</h2>
        <p className="route-dist">Idealized Hohmann transfer time</p>
        <dl className="mini-facts">
          <div><dt>Mars ahead of Earth at launch</dt><dd>{deg(h.phaseAngleRad).toFixed(0)}°</dd></div>
          <div><dt>Launch windows repeat every</dt><dd>{Math.round(h.synodicDays)} days (~{(h.synodicDays / 30.44).toFixed(0)} months)</dd></div>
          <div><dt>Transfer orbit semi-major axis</dt><dd>{(h.aKm / AU_KM).toFixed(3)} AU</dd></div>
          <div><dt>Speed change leaving Earth's orbit</dt><dd>{h.dv1KmS.toFixed(2)} km/s</dd></div>
          <div><dt>Speed change matching Mars's orbit</dt><dd>{h.dv2KmS.toFixed(2)} km/s</dd></div>
        </dl>
      </div>

      <div className="playback">
        <button type="button" className="icon-btn filled" aria-label={transfer.playing ? "Pause" : transfer.t >= 1 ? "Replay" : "Play"} onClick={() => setTransfer(transfer.t >= 1 && !transfer.playing ? { t: 0, playing: true } : { playing: !transfer.playing })}>
          {transfer.playing ? <PauseIcon /> : transfer.t >= 1 ? <ReplayIcon /> : <PlayIcon />}
        </button>
        <input type="range" min={0} max={1000} value={Math.round(transfer.t * 1000)} aria-label="Days since launch" onChange={(ev) => setTransfer({ t: Number(ev.target.value) / 1000, playing: false })} />
        <span className="playback-time">Day {day}</span>
      </div>

      <h2 className="section-title">Assumptions</h2>
      <ul className="assumptions">
        <li>Circular, coplanar orbits using Earth's and Mars's semi-major axes from JPL Horizons osculating elements.</li>
        <li>Only the Sun's gravity (μ = 1.3271244 × 10¹¹ km³/s²); planets' gravity, launch and capture are ignored.</li>
        <li>Instant burns. Speed changes are heliocentric, not the Δv a rocket needs from Earth's surface.</li>
        <li>Planet positions in this animation are idealized, not the actual 2026 ephemeris. Real missions launch in specific windows and take roughly 7–9 months.</li>
      </ul>
    </div>
  );
}
