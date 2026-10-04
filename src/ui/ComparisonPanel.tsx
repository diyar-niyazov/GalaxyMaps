import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import * as THREE from "three";
import { useStore } from "../state/store";
import { openComparison, useComparison } from "../state/comparison";
import { currentShareUrl } from "../state/urlState";
import { buildSearchIndex, search } from "../lib/search";
import {
  COMPARISON_PRESETS, comparisonLayout, comparisonSentence, comparisonSize, formatDiameter, formatRatio,
  type ComparisonSize, type ComparisonLayout,
} from "../lib/comparison";
import type { CatalogObject } from "../lib/types";
import { ObjectIcon } from "./ObjectIcon";
import { BackIcon, CloseIcon, ExternalIcon, SwapIcon } from "./icons";
import "./comparison.css";
import { canvasFont } from "../lib/fonts";

function SizeSelector({ label, value, objects, onSelect }: { label: string; value: CatalogObject; objects: CatalogObject[]; onSelect(id: string): void }) {
  const [query, setQuery] = useState(value.name);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const index = useMemo(() => buildSearchIndex(objects), [objects]);
  useEffect(() => setQuery(value.name), [value]);
  useEffect(() => { if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" }); }, [active, open]);
  const results = query.trim() && query !== value.name ? search(index, query, 16).map((r) => r.obj) : objects;
  const choose = (object: CatalogObject) => {
    onSelect(object.id);
    setQuery(object.name);
    setOpen(false);
    input.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => Math.max(0, Math.min(results.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === "Enter" && open && results[active]) {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setQuery(value.name);
    }
  };
  return (
    <div className="comparison-selector" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setQuery(value.name); } }}>
      <label htmlFor={id}>{label}</label>
      <div className="comparison-selector-field">
        <ObjectIcon obj={value} size={30} />
        <input ref={input} id={id} value={query} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open && results[active] ? `${id}-${active}` : undefined}
          placeholder="Search supported objects" spellCheck={false}
          onFocus={(event) => { setOpen(true); setActive(0); event.target.select(); }}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }} onKeyDown={onKeyDown} />
        <button type="button" className="icon-btn small" aria-label={`Browse ${label.toLowerCase()}`} aria-expanded={open} onClick={() => { setOpen(!open); if (!open) input.current?.focus(); }}><span aria-hidden="true">⌄</span></button>
      </div>
      {open && <ul ref={list} className="comparison-options" id={`${id}-list`} role="listbox" aria-label={`${label} supported objects`}>
        {results.map((object, i) => {
          const size = comparisonSize(object)!;
          return <li key={object.id} id={`${id}-${i}`} role="option" aria-selected={object.id === value.id} className={i === active ? "is-active" : ""} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(object)}>
            <ObjectIcon obj={object} size={32} /><span><strong>{size.name}</strong><small>{size.definition}</small></span><span className="comparison-option-size">{formatDiameter(size).split(" ± ")[0]}</span>
          </li>;
        })}
        {!results.length && <li className="comparison-empty" role="presentation">No supported object matches. Only verified body and stellar diameters are included.</li>}
      </ul>}
    </div>
  );
}

interface RenderScene {
  update(layout: ComparisonLayout, rotation: [number, number]): void;
  canvas: HTMLCanvasElement;
  dispose(): void;
}

function makeScene(container: HTMLDivElement, sizes: [ComparisonSize, ComparisonSize], width: number, height: number): RenderScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 2000);
  camera.position.z = 1000;
  const ambient = new THREE.HemisphereLight(0xc8dfff, 0x111622, 1.35);
  scene.add(ambient);
  const light = new THREE.DirectionalLight(0xfff7e7, 3.0);
  light.position.set(-width, height, 700);
  scene.add(light);
  const geometry = new THREE.SphereGeometry(1, 64, 40);
  const textures: THREE.Texture[] = [];
  let disposed = false;
  let lastLayout: ComparisonLayout | null = null;
  let lastRotation: [number, number] = [0, 0];
  const loader = new THREE.TextureLoader();
  const materials = sizes.map((size) => {
    const star = size.object.type === "star";
    const material = new THREE.MeshStandardMaterial({ color: size.object.display.color, roughness: 0.92, metalness: 0, emissive: star ? size.object.display.color : 0, emissiveIntensity: star ? 0.42 : 0 });
    if (size.object.display.texture) {
      loader.load(`/textures/${size.object.display.texture}`, (texture) => {
        if (disposed) { texture.dispose(); return; }
        textures.push(texture);
        texture.colorSpace = THREE.SRGBColorSpace;
        material.map = texture;
        material.color.set(0xffffff);
        material.needsUpdate = true;
        if (lastLayout) update(lastLayout, lastRotation);
      }, undefined, () => { /* The solid-color schematic surface remains available. */ });
    }
    return material;
  });
  const meshes = materials.map((material) => new THREE.Mesh(geometry, material));
  const insetMeshes = materials.map((material) => new THREE.Mesh(geometry, material));
  meshes.forEach((mesh) => scene.add(mesh));
  insetMeshes.forEach((mesh) => scene.add(mesh));
  function update(layout: ComparisonLayout, rotation: [number, number]) {
    lastLayout = layout;
    lastRotation = rotation;
    meshes.forEach((mesh, i) => {
      mesh.position.set(layout.centers[i][0] - width / 2, height / 2 - layout.centers[i][1], 0);
      mesh.scale.setScalar(layout.diameters[i] / 2);
      mesh.rotation.set(rotation[0], rotation[1], 0);
      const inset = insetMeshes[i];
      inset.visible = layout.tinyIndex === i;
      inset.position.set(layout.centers[i][0] - width / 2, height / 2 - 70, 0);
      inset.scale.setScalar(25);
      inset.rotation.copy(mesh.rotation);
    });
    renderer.render(scene, camera);
  }
  return {
    update, canvas: renderer.domElement,
    dispose: () => { disposed = true; geometry.dispose(); materials.forEach((material) => material.dispose()); textures.forEach((texture) => texture.dispose()); renderer.dispose(); renderer.domElement.remove(); },
  };
}

function ComparisonVisual({ sizes, onCanvas }: { sizes: [ComparisonSize, ComparisonSize]; onCanvas(canvas: HTMLCanvasElement | null): void }) {
  const mode = useComparison((s) => s.displayMode);
  const rotation = useComparison((s) => s.rotation);
  const zoom = useComparison((s) => s.zoom);
  const setRotation = useComparison((s) => s.setRotation);
  const holder = useRef<HTMLDivElement>(null);
  const sceneHolder = useRef<HTMLDivElement>(null);
  const renderScene = useRef<RenderScene | null>(null);
  const drag = useRef<{ x: number; y: number; rotation: [number, number] } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 360, height: 275 });
  const [fallback, setFallback] = useState(false);
  const layout = comparisonLayout(sizes[0].diameterKm, sizes[1].diameterKm, dimensions.width, dimensions.height, mode, zoom);
  useEffect(() => {
    if (!holder.current) return;
    const observer = new ResizeObserver(([entry]) => setDimensions({ width: entry.contentRect.width, height: 275 }));
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!sceneHolder.current || dimensions.width < 1) return;
    let scene: RenderScene;
    try { scene = makeScene(sceneHolder.current, sizes, dimensions.width, dimensions.height); }
    catch { setFallback(true); onCanvas(null); return; }
    setFallback(false);
    renderScene.current = scene;
    onCanvas(scene.canvas);
    return () => { scene.dispose(); renderScene.current = null; onCanvas(null); };
    // Surface objects are immutable while a comparison is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizes[0].object.id, sizes[1].object.id, dimensions.width, dimensions.height]);
  useEffect(() => { renderScene.current?.update(layout, rotation); });
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    drag.current = { x: event.clientX, y: event.clientY, rotation: [...rotation] };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  return <div ref={holder} className="comparison-visual" role="group" aria-label={`${mode === "true-scale" ? "Shared physical scale" : "Independent inspection scales"}: ${comparisonSentence(...sizes)}`}>
    <div className="comparison-surface" ref={sceneHolder} onPointerDown={onPointerDown} onPointerMove={(event) => {
      if (!drag.current) return;
      setRotation([drag.current.rotation[0] + (event.clientY - drag.current.y) * 0.008, drag.current.rotation[1] + (event.clientX - drag.current.x) * 0.008]);
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
    {fallback && sizes.map((size, i) => <div key={size.object.id} className="comparison-fallback-sphere" style={{ left: layout.centers[i][0], top: layout.centers[i][1], width: layout.diameters[i], height: layout.diameters[i], backgroundColor: size.object.display.color }} />)}
    {fallback && layout.tinyIndex != null && <div className="comparison-fallback-sphere" style={{ left: layout.centers[layout.tinyIndex][0], top: 70, width: 50, height: 50, backgroundColor: sizes[layout.tinyIndex].object.display.color }} />}
    <span className="comparison-stage-mode">{mode === "true-scale" ? "One shared scale" : "Different visual scales"}</span>
    {layout.tinyIndex != null && <>
      <div className="comparison-inset" style={{ left: layout.centers[layout.tinyIndex][0] }}><span>Magnified ×{formatRatio(layout.insetMagnification!)}</span></div>
      <div className="comparison-locator" style={{ left: layout.centers[layout.tinyIndex][0], top: layout.centers[layout.tinyIndex][1] }} aria-hidden="true" />
    </>}
    {sizes.map((size, i) => <span className="comparison-stage-label" key={`${i}-${size.object.id}`} style={{ left: layout.centers[i][0], top: dimensions.height * 0.79 }}>{size.name}</span>)}
    {mode === "true-scale" ? <div className="comparison-scale-bar"><i style={{ width: layout.scaleBarPx }} /><span>{layout.scaleBarKm.toLocaleString("en-US")} km</span></div> : <span className="comparison-independent-note">Equal display sizes · physical ratio unchanged</span>}
    <span className="comparison-drag-hint">Drag to rotate</span>
  </div>;
}

function exportComparison(canvas: HTMLCanvasElement | null, sizes: [ComparisonSize, ComparisonSize], mode: "true-scale" | "fit-both", zoom: number): void {
  if (!canvas) throw new Error("The image is unavailable without a graphics renderer.");
  const output = document.createElement("canvas");
  output.width = 1200;
  output.height = 920;
  const ctx = output.getContext("2d");
  if (!ctx) throw new Error("Image export is unavailable in this browser.");
  ctx.fillStyle = "#07101f"; ctx.fillRect(0, 0, output.width, output.height);
  ctx.fillStyle = "#dae7ff"; ctx.font = canvasFont("600 25px"); ctx.fillText("GalaxyMaps  /  Compare sizes", 65, 65);
  ctx.fillStyle = "#ffffff"; ctx.font = canvasFont("600 40px"); ctx.fillText(`${sizes[0].name} & ${sizes[1].name}`, 65, 128);
  ctx.font = canvasFont("25px"); ctx.fillStyle = "#b7c8e1"; ctx.fillText(mode === "true-scale" ? "True scale · one common physical scale" : "Fit both · different visual scales", 65, 178);
  const sourceWidth = canvas.clientWidth, sourceHeight = canvas.clientHeight;
  const scale = Math.min(1100 / sourceWidth, 520 / sourceHeight);
  const drawWidth = sourceWidth * scale, drawHeight = sourceHeight * scale;
  const offsetX = (output.width - drawWidth) / 2;
  ctx.drawImage(canvas, offsetX, 202, drawWidth, drawHeight);
  const layout = comparisonLayout(sizes[0].diameterKm, sizes[1].diameterKm, sourceWidth, sourceHeight, mode, zoom);
  ctx.font = canvasFont("600 23px"); ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
  sizes.forEach((size, i) => ctx.fillText(size.name, offsetX + layout.centers[i][0] * scale, 202 + sourceHeight * 0.81 * scale));
  if (layout.tinyIndex != null) {
    ctx.font = canvasFont("18px"); ctx.fillStyle = "#bacce5";
    const center = layout.centers[layout.tinyIndex];
    const insetX = offsetX + center[0] * scale;
    ctx.fillText(`Inset ×${formatRatio(layout.insetMagnification!)}`, insetX, 202 + 110 * scale);
    ctx.strokeStyle = "#b2c7e0"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
    ctx.strokeRect(insetX - 37.5 * scale, 202 + 31 * scale, 75 * scale, 99 * scale);
    ctx.beginPath(); ctx.arc(insetX, 202 + center[1] * scale, 7 * scale, 0, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.textAlign = "left";
  if (mode === "true-scale") {
    ctx.strokeStyle = "#a5bbd7"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(offsetX + 15 * scale, 202 + 256 * scale); ctx.lineTo(offsetX + (15 + layout.scaleBarPx) * scale, 202 + 256 * scale); ctx.stroke();
    ctx.font = canvasFont("17px"); ctx.fillStyle = "#b8cde8";
    ctx.fillText(`${layout.scaleBarKm.toLocaleString("en-US")} km`, offsetX + (23 + layout.scaleBarPx) * scale, 202 + 259 * scale);
  }
  ctx.fillStyle = "#ffffff"; ctx.font = canvasFont("600 26px"); ctx.fillText(comparisonSentence(...sizes), 65, 780);
  ctx.font = canvasFont("23px"); ctx.fillStyle = "#bccde6";
  ctx.fillText(sizes.map((size) => `${size.name}: ${formatDiameter(size)}`).join("   ·   "), 65, 824);
  ctx.font = canvasFont("17px");
  ctx.fillText("Mean / adopted body diameters. Textured spheres are illustrations; rings excluded.", 65, 865);
  ctx.fillText("Sizes: JPL Horizons / IAU / Davis et al. 2010. Textures: Solar System Scope, CC BY 4.0.", 65, 890);
  const link = document.createElement("a");
  link.download = `GalaxyMaps-${sizes[0].object.id}-${sizes[1].object.id}.png`;
  link.href = output.toDataURL("image/png");
  link.click();
}

export function ComparisonPanel({ onShare }: { onShare?: () => Promise<"copied" | "shared" | "local"> }) {
  const data = useStore((s) => s.data);
  const state = useComparison();
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState("");
  const [sharing, setSharing] = useState(false);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => { if (state.open) closeButton.current?.focus(); }, [state.open]);
  useEffect(() => { setMessage(""); setManual(""); }, [state.leftId, state.rightId, state.displayMode, state.rotation, state.zoom]);
  useEffect(() => {
    if (!state.open) return;
    const close = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); useComparison.getState().close(); } };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [state.open]);
  const eligible = useMemo(() => data?.catalog.objects.filter((obj) => comparisonSize(obj)).sort((a, b) => (b.display.priority - a.display.priority) || a.name.localeCompare(b.name)) ?? [], [data]);
  const left = state.leftId && data?.byId.get(state.leftId);
  const right = state.rightId && data?.byId.get(state.rightId);
  if (!state.open || !data || !left || !right) return null;
  const a = comparisonSize(left), b = comparisonSize(right);
  if (!a || !b) return null;
  const sizes: [ComparisonSize, ComparisonSize] = [a, b];
  const share = async () => {
    if (!onShare) { setMessage("Sharing is unavailable in this view."); return; }
    setManual("");
    setSharing(true);
    try {
      const result = await onShare();
      setMessage(result === "shared" ? "Comparison shared." : result === "local" ? "Local comparison link copied. Open it on this device." : "Comparison link copied.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not share. Copy the link below."); setManual(currentShareUrl()); }
    finally { setSharing(false); }
  };
  return <article className="comparison-panel" aria-labelledby={id}>
    <header className="comparison-header"><button ref={closeButton} type="button" className="text-btn" onClick={state.close}><BackIcon size={18} /> Back to your view</button><button type="button" className="icon-btn" onClick={state.close} aria-label="Close size comparison"><CloseIcon size={20} /></button></header>
    <h1 id={id}>Compare sizes</h1><p className="comparison-intro">A different perspective on familiar worlds.</p>
    <div className="comparison-selectors"><SizeSelector label="First object" value={left} objects={eligible} onSelect={(selected) => { state.setObject("left", selected); setMessage(""); }} /><SizeSelector label="Second object" value={right} objects={eligible} onSelect={(selected) => { state.setObject("right", selected); setMessage(""); }} /></div>
    <div className="comparison-toolbar"><div className="comparison-display-switch" role="group" aria-label="Comparison display mode"><button type="button" aria-pressed={state.displayMode === "true-scale"} onClick={() => state.setDisplayMode("true-scale")}>True scale</button><button type="button" aria-pressed={state.displayMode === "fit-both"} onClick={() => state.setDisplayMode("fit-both")}>Fit both</button></div><button type="button" className="icon-btn" onClick={state.swap} aria-label="Swap comparison objects" title="Swap objects"><SwapIcon size={18} /></button><button type="button" className="text-btn" onClick={state.reset}>Reset</button></div>
    <ComparisonVisual sizes={sizes} onCanvas={(element) => { canvas.current = element; }} />
    <div className="comparison-camera-controls" role="group" aria-label="Inspect comparison objects"><button type="button" className="icon-btn small" aria-label="Rotate comparison left" title="Rotate left" onClick={() => state.setRotation([state.rotation[0], state.rotation[1] - 0.25])}>↶</button><button type="button" className="icon-btn small" aria-label="Rotate comparison right" title="Rotate right" onClick={() => state.setRotation([state.rotation[0], state.rotation[1] + 0.25])}>↷</button><span>{state.displayMode === "true-scale" ? "Zoom both together" : "Inspection zoom"}</span><button type="button" className="icon-btn small" aria-label="Zoom comparison out" title="Zoom out" disabled={state.zoom <= 0.6} onClick={() => state.setZoom(state.zoom - 0.1)}>−</button><button type="button" className="icon-btn small" aria-label="Zoom comparison in" title="Zoom in" disabled={state.zoom >= 1.6} onClick={() => state.setZoom(state.zoom + 0.1)}>+</button></div>
    <p className="comparison-mode-note">{state.displayMode === "true-scale" ? "Both disks use one physical scale. A locator and labelled magnification reveal objects too small to inspect." : "Each disk is enlarged independently for inspection. Their displayed sizes do not express the physical ratio."}</p>
    <p className="comparison-statement" aria-live="polite">{comparisonSentence(a, b)}</p>
    <dl className="comparison-diameters">{sizes.map((size, i) => <div key={i}><dt>{size.name}</dt><dd>{formatDiameter(size)}</dd><span>{size.definition}</span></div>)}</dl>
    <div className="comparison-actions"><button type="button" className="btn primary" onClick={share} disabled={sharing || !onShare}>{sharing ? "Sharing…" : "Share comparison"}</button><button type="button" className="btn" onClick={() => { try { exportComparison(canvas.current, sizes, state.displayMode, state.zoom); setMessage("Comparison image downloaded."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not export this image."); } }}>Save image</button></div>
    {message && <p className="comparison-feedback" role="status">{message}</p>}
    {manual && <label className="comparison-manual-share">Copy this comparison link<input readOnly value={manual} aria-label="Comparison exact-view link" onFocus={(event) => event.target.select()} /></label>}
    <details className="expander comparison-sources"><summary>Dimensions, sources & imagery</summary>{sizes.map((size, i) => <div key={i}><strong>{size.name}</strong><p>{size.note}</p><a href={size.source.url} target="_blank" rel="noreferrer">{size.source.title} <ExternalIcon size={12} /></a>{size.uncertaintyKm == null && size.object.id !== "sun" && <p>Uncertainty was not supplied in the adopted source.</p>}</div>)}<p>The physical ratio uses the unrounded dimensions. Three-dimensional spheres and their surface textures are illustrative; they do not reproduce irregular shapes, stellar details, or rings. Textures: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">Solar System Scope</a>, CC BY 4.0.</p></details>
    <ComparisonPresets compact />
  </article>;
}

export function ComparisonPresets({ compact = false }: { compact?: boolean }) {
  const data = useStore((s) => s.data);
  if (!data) return null;
  const presets = COMPARISON_PRESETS.filter((preset) => preset.pair.every((id) => { const obj = data.byId.get(id); return obj && comparisonSize(obj); }));
  return <section className={`comparison-presets ${compact ? "is-compact" : ""}`} aria-labelledby={compact ? undefined : "compare-sizes-title"} aria-label={compact ? "Compare sizes" : undefined}><h2 className="section-title" id={compact ? undefined : "compare-sizes-title"}>Compare sizes</h2><div className="comparison-preset-grid">{presets.map((preset) => {
    const a = data.byId.get(preset.pair[0])!, b = data.byId.get(preset.pair[1])!;
    const sentence = comparisonSentence(comparisonSize(a)!, comparisonSize(b)!);
    return <button type="button" key={preset.id} className="comparison-preset" aria-label={`Compare ${a.name} and ${b.name}. ${sentence}`} onClick={() => openComparison(preset.pair[0], preset.pair[1])} style={{ "--comparison-color": b.display.color } as CSSProperties}><span className="comparison-preset-orbs" aria-hidden="true"><ObjectIcon obj={a} size={26} /><ObjectIcon obj={b} size={40} /></span><strong>{preset.title}</strong><small>{sentence}</small></button>;
  })}</div></section>;
}
