import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useStore } from "../state/store";
import { useEarthSky } from "../state/earthSky";
import { buildEarthSkyStars, formatSkyDec, formatSkyRa, projectEarthSky, skyNeighbors, type EarthSkyDirection, type SkyCenter, type SkyStar } from "../lib/earthSky";
import { unitFromRaDec } from "../lib/coords";
import type { Vec3 } from "../lib/types";
import { jdToIsoDate } from "../lib/format";
import { useEscapeLayer } from "./menus";
import { BackIcon, CloseIcon, FocusIcon } from "./icons";
import { shareCurrentView } from "../lib/share";
import { currentShareUrl } from "../state/urlState";
import { canvasFont, loadCanvasFonts } from "../lib/fonts";
import "./skyview.css";

interface ChartGeometry { cx: number; cy: number; radius: number }
function plot(direction: Vec3, center: SkyCenter, field: number, geometry: ChartGeometry) {
  const p = projectEarthSky(direction, center, field);
  return { ...p, x: geometry.cx + p.x * geometry.radius, y: geometry.cy + p.y * geometry.radius };
}

function drawChart(g: CanvasRenderingContext2D, width: number, height: number, center: SkyCenter, field: number, stars: SkyStar[], target: EarthSkyDirection) {
  const geometry = { cx: width / 2, cy: height / 2, radius: Math.min(width, height) * 0.445 };
  const { cx, cy, radius } = geometry;
  g.clearRect(0, 0, width, height);
  const backdrop = g.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
  backdrop.addColorStop(0, "#0d1a2a"); backdrop.addColorStop(1, "#030b16");
  g.fillStyle = backdrop;
  g.beginPath(); g.arc(cx, cy, radius, 0, Math.PI * 2); g.fill();
  g.save();
  g.beginPath(); g.arc(cx, cy, radius - 0.5, 0, Math.PI * 2); g.clip();

  function gridLine(points: Vec3[], equator = false) {
    g.beginPath();
    let drawing = false;
    for (const vector of points) {
      const p = plot(vector, center, field, geometry);
      if (!p.visible) { drawing = false; continue; }
      if (!drawing) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
      drawing = true;
    }
    g.lineWidth = equator ? 0.85 : 0.6;
    g.strokeStyle = equator ? "#6d91b45c" : "#56799e2f";
    g.stroke();
  }
  for (let ra = 0; ra < 360; ra += 30) gridLine(Array.from({ length: 181 }, (_, n) => unitFromRaDec(ra, n - 90)));
  for (let dec = -60; dec <= 60; dec += 30) gridLine(Array.from({ length: 361 }, (_, n) => unitFromRaDec(n, dec)), dec === 0);

  // Brightness and color come from HYG V magnitude / B−V, with a restrained display size.
  for (const star of stars) {
    const p = plot(star.direction, center, field, geometry);
    if (!p.visible) continue;
    const r = Math.min(2.4, Math.max(0.55, 1.8 - star.magnitude * 0.22));
    g.globalAlpha = Math.min(1, Math.max(0.33, 1.12 - star.magnitude * 0.115));
    g.fillStyle = star.color;
    g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
    if (star.magnitude < 1) {
      g.globalAlpha *= 0.15; g.beginPath(); g.arc(p.x, p.y, r * 3, 0, Math.PI * 2); g.fill();
    }
  }
  g.globalAlpha = 1;
  g.font = canvasFont("10px");
  g.textAlign = "left";
  g.textBaseline = "middle";
  const labels: { x: number; y: number; width: number }[] = [];
  const targetPoint = plot(target.direction, center, field, geometry);
  for (const star of stars) {
    if (!star.name || star.magnitude > 3.2) continue;
    const p = plot(star.direction, center, field, geometry);
    if (!p.visible || (targetPoint.visible && Math.hypot(p.x - targetPoint.x, p.y - targetPoint.y) < 38)) continue;
    const textWidth = g.measureText(star.name).width;
    const x = p.x + 7, y = p.y - 7;
    if (Math.hypot(x + textWidth / 2 - cx, y - cy) > radius - 18 || labels.some((label) => Math.abs(label.y - y) < 16 && x < label.x + label.width + 8 && x + textWidth > label.x - 8)) continue;
    g.fillStyle = "#b9cbe0"; g.fillText(star.name, x, y);
    labels.push({ x, y, width: textWidth });
    if (labels.length >= 20) break;
  }
  // RA/Dec are coordinate grid labels, independent of any constellation or local horizon.
  g.font = canvasFont("9px");
  g.fillStyle = "#6483a2";
  g.textAlign = "center";
  for (let ra = 0; ra < 360; ra += 30) {
    const p = plot(unitFromRaDec(ra, 0), center, field, geometry);
    if (p.visible && Math.hypot(p.x - cx, p.y - cy) < radius - 25) g.fillText(`${ra / 15}h`, p.x, p.y + 12);
  }
  g.restore();
  g.lineWidth = 1; g.strokeStyle = "#56779957";
  g.beginPath(); g.arc(cx, cy, radius, 0, Math.PI * 2); g.stroke();
  g.font = canvasFont("9px"); g.fillStyle = "#7190b3"; g.textAlign = "center";
  g.fillText("N", cx, cy - radius - 13); g.fillText("S", cx, cy + radius + 17);
  g.fillText("E", cx - radius - 16, cy + 3); g.fillText("W", cx + radius + 16, cy + 3);

  if (targetPoint.visible) {
    g.strokeStyle = "#7abfff"; g.lineWidth = 1.4;
    g.beginPath(); g.arc(targetPoint.x, targetPoint.y, 9, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(targetPoint.x, targetPoint.y, 15, 0, Math.PI * 2); g.strokeStyle = "#78bfff45"; g.stroke();
    g.fillStyle = "#b8dcff"; g.beginPath(); g.arc(targetPoint.x, targetPoint.y, 2.2, 0, Math.PI * 2); g.fill();
    g.font = canvasFont("600 12px"); g.textAlign = "center";
    const label = target.name;
    const textWidth = g.measureText(label).width;
    const labelX = Math.max(textWidth / 2 + 8, Math.min(width - textWidth / 2 - 8, targetPoint.x));
    const labelY = targetPoint.y + 30 > height - 15 ? targetPoint.y - 25 : targetPoint.y + 30;
    g.fillStyle = "#071222e6"; g.fillRect(labelX - textWidth / 2 - 7, labelY - 11, textWidth + 14, 21);
    g.fillStyle = "#d0e8ff"; g.fillText(label, labelX, labelY + 3);
  } else {
    const deltaX = targetPoint.x - cx, deltaY = targetPoint.y - cy;
    const angle = Math.atan2(deltaY, deltaX);
    const x = cx + Math.cos(angle) * (radius - 9), y = cy + Math.sin(angle) * (radius - 9);
    g.save(); g.translate(x, y); g.rotate(angle);
    g.beginPath(); g.moveTo(5, 0); g.lineTo(-4, -4); g.lineTo(-4, 4); g.closePath(); g.fillStyle = "#8ac8ff"; g.fill(); g.restore();
  }
}

function SkyChart({ target, stars }: { target: EarthSkyDirection; stars: SkyStar[] }) {
  const center = useEarthSky((s) => s.center);
  const fieldDeg = useEarthSky((s) => s.fieldDeg);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [size, setSize] = useState({ width: 600, height: 440 });
  const [failed, setFailed] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let live = true;
    void loadCanvasFonts().then(() => { if (live) setFontsReady(true); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const surface = surfaceRef.current!;
    const resize = () => setSize({ width: Math.max(1, surface.clientWidth), height: Math.max(1, surface.clientHeight) });
    const ro = new ResizeObserver(resize); ro.observe(surface); resize();
    const onWheel = (event: WheelEvent) => {
      event.preventDefault(); event.stopPropagation();
      useEarthSky.getState().zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.002));
    };
    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => { ro.disconnect(); surface.removeEventListener("wheel", onWheel); };
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Sub-pixel star dots rasterize differently on Chromium's GPU and CPU canvas paths; pin one path.
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) { setFailed(true); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.width * dpr); canvas.height = Math.round(size.height * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawChart(g, size.width, size.height, center, fieldDeg, stars, target);
  }, [size, center, fieldDeg, stars, target, fontsReady]);

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId); canvasRef.current?.focus({ preventScroll: true });
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    event.preventDefault(); event.stopPropagation();
    const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const oldDistance = Math.hypot(previous.x - other.x, previous.y - other.y);
      const nextDistance = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      if (oldDistance > 2 && nextDistance > 2) useEarthSky.getState().zoom(nextDistance / oldDistance);
    } else {
      const sensitivity = useEarthSky.getState().fieldDeg / Math.min(size.width, size.height);
      useEarthSky.getState().rotate((event.clientX - previous.x) * sensitivity, (event.clientY - previous.y) * sensitivity);
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKey = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (event.key !== "Tab") event.stopPropagation();
    const sky = useEarthSky.getState();
    switch (event.key) {
      case "ArrowLeft": event.preventDefault(); sky.rotate(6, 0); break;
      case "ArrowRight": event.preventDefault(); sky.rotate(-6, 0); break;
      case "ArrowUp": event.preventDefault(); sky.rotate(0, 6); break;
      case "ArrowDown": event.preventDefault(); sky.rotate(0, -6); break;
      case "+": case "=": event.preventDefault(); sky.zoom(1.2); break;
      case "-": event.preventDefault(); sky.zoom(1 / 1.2); break;
      case "r": case "R": event.preventDefault(); sky.recenter(); break;
      case "Escape": event.preventDefault(); sky.close(); break;
    }
  };
  return <div className="earthsky-surface" ref={surfaceRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
    <canvas ref={canvasRef} tabIndex={0} role="application" aria-label={`Earth-centered sky sphere showing ${target.name}. Arrow keys turn the sky, plus and minus zoom, R centers the target, Escape returns.`} onKeyDown={onKey} />
    {failed && <p className="earthsky-canvas-fallback">The chart canvas is unavailable. The sourced coordinates below still locate this object.</p>}
    <span className="earthsky-chart-label">ICRF equatorial sky</span>
    <span className="earthsky-field-label">{Math.round(fieldDeg)}° window</span>
  </div>;
}

export function EarthSkyView() {
  const open = useEarthSky((s) => s.open);
  return open ? <EarthSkyContent /> : null;
}

function EarthSkyContent() {
  const data = useStore((s) => s.data);
  const target = useEarthSky((s) => s.target);
  const open = useEarthSky((s) => s.open);
  const center = useEarthSky((s) => s.center);
  const field = useEarthSky((s) => s.fieldDeg);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<Element | null>(document.activeElement);
  const [shareMessage, setShareMessage] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [sharing, setSharing] = useState(false);
  useEscapeLayer(() => useEarthSky.getState().close(), false);
  const stars = useMemo(() => data && target ? buildEarthSkyStars(data, target.jd) : [], [data, target]);
  const neighbors = useMemo(() => target ? skyNeighbors(target.direction, stars, data?.byId.get(target.objectId)?.hygId) : [], [target, stars, data]);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      // Wait for the underlying panel's inert attribute to clear; StrictMode's rehearsal
      // cleanup must not move focus out of a dialog that remains open.
      queueMicrotask(() => {
        if (!useEarthSky.getState().open && previousFocus.current instanceof HTMLElement && previousFocus.current.isConnected) previousFocus.current.focus({ preventScroll: true });
      });
    };
  }, [open]);
  const onDialogKey = (event: ReactKeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); useEarthSky.getState().close(); return; }
    if (event.key !== "Tab") return;
    const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), summary, [tabindex="0"]') ?? [])].filter((element) => element.getClientRects().length > 0);
    const first = controls[0], last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  };
  const share = async () => {
    setSharing(true); setManualUrl("");
    try {
      const result = await shareCurrentView();
      setShareMessage(result === "local" ? "Local link copied. It opens on this device while GalaxyMaps is running." : result === "shared" ? "Sky view shared." : "Exact sky-view link copied.");
    } catch (error) {
      setShareMessage((error as Error).message || "Copy the sky-view link below.");
      setManualUrl(currentShareUrl());
    } finally { setSharing(false); }
  };
  if (!open || !target || !data) return null;
  const targetVisible = projectEarthSky(target.direction, center, field).visible;
  const sources = target.sourceIds.map((id) => data.catalog.sources[id]).filter((source) => !!source);
  const starSource = data.catalog.sources[data.catalog.stars.sourceId];
  return <section ref={dialogRef} className="earthsky-overlay" role="dialog" aria-modal="true" aria-labelledby="earthsky-title" aria-describedby="earthsky-description" onKeyDown={onDialogKey} onPointerDown={(event) => event.stopPropagation()}>
    <div className="earthsky-panel">
      <header className="earthsky-header"><div><span>View from Earth</span><h1 id="earthsky-title">{target.name} in our sky</h1></div><button ref={closeRef} type="button" className="earthsky-icon" aria-label="Back to object" onClick={() => useEarthSky.getState().close()}><CloseIcon size={18} /></button></header>
      <p id="earthsky-description" className="earthsky-description">An Earth-centered sky sphere. Drag in any direction to explore; the chart has no local horizon.</p>
      <SkyChart target={target} stars={stars} />
      <div className="earthsky-controls"><button type="button" onClick={() => useEarthSky.getState().recenter()}><FocusIcon size={15} />{targetVisible ? "Center object" : "Return to object"}</button><span>Drag to turn · scroll / pinch to zoom</span><button type="button" className="earthsky-icon" aria-label="Zoom in sky chart" onClick={() => useEarthSky.getState().zoom(1.2)}>+</button><button type="button" className="earthsky-icon" aria-label="Zoom out sky chart" onClick={() => useEarthSky.getState().zoom(1 / 1.2)}>−</button></div>
      <div className="earthsky-reading">
        <dl className="earthsky-coordinates"><div><dt>Right ascension</dt><dd>{formatSkyRa(target.raDeg)}</dd></div><div><dt>Declination</dt><dd>{formatSkyDec(target.decDeg)}</dd></div><div><dt>Snapshot date</dt><dd>{jdToIsoDate(target.jd)}</dd></div></dl>
        <p className="earthsky-epoch">{target.epoch}</p>
        {!stars.length && <p className="earthsky-epoch">The star background is unavailable; this object's sourced direction still works.</p>}
        {neighbors.length > 0 && <div className="earthsky-neighbors"><strong>Nearby sky directions <span>angular separation</span></strong><div>{neighbors.map((star) => <button type="button" key={star.hygId} title={`Center the chart on ${star.name}`} onClick={() => useEarthSky.getState().centerOn(star.direction)}>{star.name}<small>{star.angleDeg.toFixed(1)}°</small></button>)}</div></div>}
        <details className="earthsky-sources"><summary>Coordinates & sources</summary><p>{target.note}</p><p>Background stars: HYG catalog epoch J2000.0. Positions are not propagated for stellar proper motion. Marker brightness is illustrative; plotted stars come from the catalog.</p><p>The stereographic window preserves sky directions and angles around its center. It does not show what is above your location or make a tonight's-visibility prediction.</p><ul>{sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}{starSource && !sources.some((source) => source.id === starSource.id) && <li><a href={starSource.url} target="_blank" rel="noreferrer">{starSource.title}</a> · {starSource.license}</li>}</ul></details>
        <footer className="earthsky-footer"><button type="button" onClick={() => useEarthSky.getState().close()}><BackIcon size={14} /> Back to object</button><button type="button" disabled={sharing} onClick={() => void share()}>{sharing ? "Sharing…" : "Share view"}</button><span>{stars.length.toLocaleString()} stars · {starSource ? <a href={starSource.url} target="_blank" rel="noreferrer">HYG v4.4 · {starSource.license}</a> : "HYG catalog"}</span></footer>
        {shareMessage && <p className="earthsky-share-feedback" role="status">{shareMessage}</p>}
        {manualUrl && <label className="earthsky-manual-share">Copy this exact sky-view link<input readOnly value={manualUrl} aria-label="Exact sky-view link" onFocus={(event) => event.target.select()} /></label>}
      </div>
    </div>
  </section>;
}
