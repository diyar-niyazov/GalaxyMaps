import { useEffect, useMemo, useRef } from "react";
import { useStore, TIME_RATES } from "../state/store";
import { useRoute } from "../state/selectors";
import { getEngine } from "./engineRef";
import { inCategory } from "../lib/taxonomy";
import { advancePlayJd, PLAY_MAX_JD, PLAY_MIN_JD } from "../lib/ephemeris";
import { ICRF_TO_ECLIPTIC } from "../lib/coords";
import { mulMatVec, transpose } from "../lib/vec";
import type { Vec3 } from "../lib/types";
import { reducedMotion } from "../lib/motion";

/** Pushes store state into the imperative map engine and runs the clocks. Renders nothing. */
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
  const running = useStore((s) => s.time.running);
  const orbitCamera = useStore((s) => s.orbitCamera);
  const categoryFilter = useStore((s) => s.categoryFilter);
  const route = useRoute();
  const lastFit = useRef(0);

  useEffect(() => getEngine()?.setLayer(layer), [layer]);
  useEffect(() => getEngine()?.setJd(jd), [jd]);
  useEffect(() => getEngine()?.setSelection(selectedId), [selectedId]);
  useEffect(() => {
    const e = getEngine();
    if (e && e.getMode() === "explore") e.setTilt(tilt ? 0.95 : 0);
  }, [tilt]);
  useEffect(() => getEngine()?.setAutoOrbit(orbitCamera), [orbitCamera]);

  const emphasis = useMemo(() => {
    if (!data || !categoryFilter) return null;
    return new Set(data.catalog.objects.filter((o) => inCategory(o, categoryFilter)).map((o) => o.id));
  }, [data, categoryFilter]);
  useEffect(() => getEngine()?.setEmphasis(emphasis), [emphasis]);

  const showRoute = panel === "directions" && route?.ok;
  const routeDisplay = useMemo(() => {
    if (!showRoute || !route?.ok) return null;
    const t = route.transfer;
    return {
      ids: route.stops.map((s) => s.id),
      positions: route.positions,
      transfer: t ? { ...t, originLabel: route.stops[0].name, targetLabel: route.stops[1].name } : undefined,
    };
  }, [route, showRoute]);
  useEffect(() => getEngine()?.setRoute(routeDisplay), [routeDisplay]);

  // Opening or changing a route deliberately enters Route framing.
  useEffect(() => {
    if (fitRequest === lastFit.current || !route?.ok || panel !== "directions") return;
    lastFit.current = fitRequest;
    const e = getEngine();
    if (!e) return;
    if (route.transfer) {
      const r = Math.max(route.transfer.h.r1Km, route.transfer.h.r2Km) * 1.08;
      const ecl2icrf = transpose(ICRF_TO_ECLIPTIC);
      const pts: Vec3[] = [0, 1, 2, 3].map((i) => mulMatVec(ecl2icrf, [r * Math.cos((i * Math.PI) / 2), r * Math.sin((i * Math.PI) / 2), 0]));
      e.frameRoute(pts);
    } else e.frameRoute(route.positions);
  }, [fitRequest, route, panel]);

  useEffect(() => getEngine()?.setPlayback(showRoute && (playing || progress > 0) ? progress : null), [progress, playing, showRoute]);

  // Journey preview uses its own clock and freezes exploration time so endpoints do not drift.
  useEffect(() => {
    if (!playing) return;
    useStore.getState().pauseTime();
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const st = useStore.getState();
      const p = Math.min(1, st.progress + (document.hidden ? 0 : Math.max(0, Math.min(250, now - last))) / 1000 / st.playbackSeconds);
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

  // Exploration clock (Play time). The engine gets every frame; the store is updated ~8×/s so
  // React panels do not re-render per frame. With reduced motion the map steps once per second.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let lastStore = 0;
    let simJd = useStore.getState().jd;
    const stepMs = reducedMotion() ? 1000 : 0;
    let acc = 0;
    const tick = (now: number) => {
      const st = useStore.getState();
      const rate = TIME_RATES.find((r) => r.id === st.time.rate)!.daysPerSecond;
      const dt = Math.max(0, Math.min(250, now - last));
      last = now;
      acc += dt;
      if (acc >= stepMs) {
        simJd = advancePlayJd(simJd, rate, acc);
        acc = 0;
        getEngine()?.setJd(simJd);
        if (now - lastStore > 120 || stepMs) {
          lastStore = now;
          st.setJd(simJd);
        }
        if (simJd >= PLAY_MAX_JD || simJd <= PLAY_MIN_JD) {
          st.setJd(simJd);
          st.pauseTime();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      useStore.getState().setJd(simJd);
    };
  }, [running]);

  // Hidden page: suspend the clock; resume when visible again if still armed.
  useEffect(() => {
    const onVis = () => useStore.getState().suspendTime(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return null;
}
