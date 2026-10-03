import { useEffect, useMemo, useRef } from "react";
import { useStore } from "../state/store";
import { useRoute } from "../state/selectors";
import { getEngine } from "./engineRef";
import { hohmann } from "../lib/transfer";
import { ICRF_TO_ECLIPTIC } from "../lib/coords";
import { mulMatVec } from "../lib/vec";
import { positionAt } from "../data/bundle";

/** Pushes store state into the imperative map engine. Renders nothing. */
export function EngineSync() {
  const data = useStore((s) => s.data);
  const layer = useStore((s) => s.layer);
  const jd = useStore((s) => s.jd);
  const selectedId = useStore((s) => s.selectedId);
  const panel = useStore((s) => s.panel);
  const progress = useStore((s) => s.progress);
  const playing = useStore((s) => s.playing);
  const fitRequest = useStore((s) => s.fitRequest);
  const tilt = useStore((s) => s.tilt);
  const transfer = useStore((s) => s.transfer);
  const route = useRoute();
  const lastFit = useRef(0);

  useEffect(() => getEngine()?.setLayer(layer), [layer]);
  useEffect(() => getEngine()?.setJd(jd), [jd]);
  useEffect(() => getEngine()?.setSelection(selectedId), [selectedId]);
  useEffect(() => getEngine()?.setTilt(tilt ? 0.95 : 0), [tilt]);

  const showRoute = panel !== "transfer" && route?.ok;
  useEffect(() => {
    const e = getEngine();
    if (!e) return;
    e.setRoute(showRoute && route?.ok ? { ids: route.stops.map((s) => s.id), positions: route.positions } : null);
  }, [route, showRoute]);

  useEffect(() => {
    if (fitRequest === lastFit.current) return;
    if (route?.ok) {
      lastFit.current = fitRequest;
      getEngine()?.fitPoints(route.positions);
    }
  }, [fitRequest, route]);

  useEffect(() => getEngine()?.setPlayback(showRoute && (playing || progress > 0) ? progress : null), [progress, playing, showRoute]);

  // Journey playback: animation time is independent of the travel speed.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const st = useStore.getState();
      const p = Math.min(1, st.progress + (now - last) / 1000 / st.playbackSeconds);
      last = now;
      st.setProgress(p);
      if (p >= 1) {
        st.setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Idealized Earth → Mars Hohmann transfer scenario.
  const scenario = useMemo(() => {
    if (!data) return null;
    const e = data.eph.orbits["earth"], m = data.eph.orbits["mars"];
    if (!e || !m) return null;
    const earth = data.byId.get("earth");
    const p = earth ? positionAt(data, earth, jd) : null;
    const ecl = p ? mulMatVec(ICRF_TO_ECLIPTIC, p) : [1, 0, 0];
    return { h: hohmann(e.aKm, m.aKm), lon0: Math.atan2(ecl[1], ecl[0]) };
  }, [data, jd]);

  useEffect(() => {
    const e = getEngine();
    if (!e) return;
    if (panel === "transfer" && scenario) {
      e.setScenario({ h: scenario.h, tSeconds: transfer.t * scenario.h.transferSeconds, lon0: scenario.lon0, originLabel: "Earth", targetLabel: "Mars" });
    } else e.setScenario(null);
  }, [panel, scenario, transfer.t]);

  useEffect(() => {
    if (!transfer.playing || !scenario) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const st = useStore.getState();
      // 259 days in about 12 seconds.
      const t = Math.min(1, st.transfer.t + (now - last) / 12000);
      last = now;
      st.setTransfer({ t, playing: t < 1 });
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [transfer.playing, scenario]);

  return null;
}
