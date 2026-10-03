import * as THREE from "three";
import type { CatalogObject, Vec3 } from "../lib/types";
import type { DataBundle } from "../data/bundle";
import { positionAt } from "../data/bundle";
import { makeProjector, zoomAround, fitView, planeName, unproject, type View, type Viewport, type Projector } from "./projection";
import { flightPath, flightDuration, easeInOut } from "./flight";
import { declutter, type LabelCandidate } from "./labels";
import { renderMilkyWay, HALF_SIZE_KPC, R0_KPC, armLabelAnchors, galactocentricToIcrf } from "./milkyWay";
import { orbitPolyline } from "../lib/kepler";
import { GALACTIC_TO_ICRF, ICRF_TO_ECLIPTIC, unitFromRaDec } from "../lib/coords";
import { mulMatVec, transpose, cross, normalize, sub, add, lerp, length, type Mat3 } from "../lib/vec";
import { AU_KM, LY_KM, PC_KM } from "../lib/units";
import { hohmannState, type HohmannResult } from "../lib/transfer";

export type Layer = "realistic" | "atlas";
export type PickTarget = { kind: "object"; id: string } | { kind: "star"; index: number };

export interface ViewInfo {
  view: View;
  kmPerPx: number;
  plane: string;
  vp: Viewport;
}

export interface EngineCallbacks {
  onViewChange?(info: ViewInfo): void;
  onPick?(target: PickTarget | null): void;
}

export interface RouteDisplay {
  ids: string[];
  positions: Vec3[];
}

export interface Scenario {
  h: HohmannResult;
  tSeconds: number;
  /** Ecliptic longitude (rad) of the origin planet at departure. */
  lon0: number;
  originLabel: string;
  targetLabel: string;
}

const SVGNS = "http://www.w3.org/2000/svg";
const MIN_WIDTH_KM = 6_000;
const MAX_WIDTH_KM = 2.5e21;
const ROUTE_BLUE = "#2f6fed";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function softDiscTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grd.addColorStop(0.6, "rgba(255,255,255,0.12)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const STAR_VERT = /* glsl */ `
  attribute float absmag;
  attribute float ci;
  uniform mat3 uM;
  uniform vec3 uCenter;
  uniform float uPxPerPc;
  uniform float uLimit;
  uniform float uFade;
  uniform float uDpr;
  uniform float uAtlas;
  varying vec3 vColor;
  varying float vAlpha;
  vec3 bv2rgb(float bv) {
    float t = 4600.0 * (1.0 / (0.92 * bv + 1.7) + 1.0 / (0.92 * bv + 0.62)) / 100.0;
    float r = t <= 66.0 ? 1.0 : clamp(329.698727446 * pow(t - 60.0, -0.1332047592) / 255.0, 0.0, 1.0);
    float g = t <= 66.0 ? clamp((99.4708025861 * log(t) - 161.1195681661) / 255.0, 0.0, 1.0) : clamp(288.1221695283 * pow(t - 60.0, -0.0755148492) / 255.0, 0.0, 1.0);
    float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp((138.5177312231 * log(t - 10.0) - 305.0447927307) / 255.0, 0.0, 1.0));
    return vec3(r, g, b);
  }
  void main() {
    vec3 rel = position - uCenter;
    vec3 p = uM * rel * uPxPerPc;
    gl_Position = projectionMatrix * vec4(p.xy, 0.0, 1.0);
    float m = uLimit - absmag;
    float a = clamp(m / 3.0 + 0.15, 0.0, 1.0);
    gl_PointSize = clamp(1.2 + m * 0.33, 1.2, 5.5) * uDpr;
    vAlpha = a * uFade;
    vColor = uAtlas > 0.5 ? vec3(0.22, 0.27, 0.36) : mix(bv2rgb(ci), vec3(1.0), 0.15);
  }
`;
const STAR_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    float a = smoothstep(1.0, 0.25, r) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

interface Renderable {
  obj: CatalogObject;
  pos: Vec3 | null;
  sx: number;
  sy: number;
  depth: number;
  rPx: number;
  visible: boolean;
  mesh?: THREE.Group;
  glow?: THREE.Sprite;
  orbit?: { pts: Vec3[]; aKm: number; parent: string | null; line: THREE.Line };
}

export class MapEngine {
  private container: HTMLElement;
  private data: DataBundle;
  private cb: EngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1e7, 1e7);
  private svg: SVGSVGElement;
  private labelLayer: HTMLDivElement;
  private vp: Viewport = { width: 1, height: 1 };
  private dpr = 1;
  view: View;
  private layer: Layer = "realistic";
  private jd: number;
  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private route: RouteDisplay | null = null;
  private playback: number | null = null;
  private scenario: Scenario | null = null;
  private renderables: Renderable[] = [];
  private byId = new Map<string, Renderable>();
  private stars!: THREE.Points;
  private starMat!: THREE.ShaderMaterial;
  private milkyWay!: THREE.Mesh;
  private mwTextures: Partial<Record<Layer, THREE.Texture>> = {};
  private sunLight = new THREE.PointLight(0xffffff, 2.6, 0, 0);
  private ambient = new THREE.AmbientLight(0xffffff, 0.07);
  private discTex = softDiscTexture();
  private texLoader = new THREE.TextureLoader();
  private raf = 0;
  private flight: { path: ReturnType<typeof flightPath>; start: number; duration: number; tilt0: number; tilt1: number } | null = null;
  private zoomAnim: { target: number; x: number; y: number } | null = null;
  private drag: { x: number; y: number; moved: boolean; rotate: boolean; view: View } | null = null;
  private svgPool = new Map<string, SVGElement>();
  private svgUsed = new Set<string>();
  private labelPool = new Map<string, HTMLDivElement>();
  private textWidthCache = new Map<string, number>();
  private measureCtx = document.createElement("canvas").getContext("2d")!;
  private lastInfo = 0;
  private armAnchors = armLabelAnchors();
  private resizeObs: ResizeObserver;
  private disposed = false;
  private needsRender = true;

  constructor(container: HTMLElement, data: DataBundle, jd: number, cb: EngineCallbacks = {}) {
    this.container = container;
    this.data = data;
    this.cb = cb;
    this.jd = jd;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.className = "map-canvas";
    container.appendChild(canvas);
    this.svg = document.createElementNS(SVGNS, "svg");
    this.svg.setAttribute("class", "map-svg");
    container.appendChild(this.svg);
    this.labelLayer = document.createElement("div");
    this.labelLayer.className = "map-labels";
    container.appendChild(this.labelLayer);
    this.measureCtx.font = "500 12px Inter, system-ui, sans-serif";

    const earth = data.byId.get("earth")!;
    this.view = { center: positionAt(data, earth, jd)!, widthKm: 2.2e6, heading: 0, tilt: 0 };

    this.scene.add(this.ambient, this.sunLight);
    this.buildStars();
    this.buildMilkyWay();
    this.buildRenderables();
    this.attachInput();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.setLayer("realistic");
    this.loop();
  }

  // ---------------------------------------------------------------- setup
  private buildStars() {
    const { stars, starStride } = this.data;
    const n = stars.length / starStride;
    const pos = new Float32Array(n * 3), absmag = new Float32Array(n), ci = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * starStride;
      pos[i * 3] = stars[o]; pos[i * 3 + 1] = stars[o + 1]; pos[i * 3 + 2] = stars[o + 2];
      absmag[i] = stars[o + 3]; ci[i] = stars[o + 4];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("absmag", new THREE.BufferAttribute(absmag, 1));
    g.setAttribute("ci", new THREE.BufferAttribute(ci, 1));
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uM: { value: new THREE.Matrix3() }, uCenter: { value: new THREE.Vector3() }, uPxPerPc: { value: 1 },
        uLimit: { value: 10 }, uFade: { value: 1 }, uDpr: { value: 1 }, uAtlas: { value: 0 },
      },
    });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = 1;
    this.scene.add(this.stars);
  }

  private buildMilkyWay() {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    this.milkyWay = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.milkyWay.matrixAutoUpdate = false;
    this.milkyWay.frustumCulled = false;
    this.milkyWay.renderOrder = 0;
    this.scene.add(this.milkyWay);
  }

  private mwTexture(layer: Layer) {
    if (!this.mwTextures[layer]) {
      const t = new THREE.CanvasTexture(renderMilkyWay(layer));
      t.colorSpace = THREE.SRGBColorSpace;
      this.mwTextures[layer] = t;
    }
    return this.mwTextures[layer]!;
  }

  private buildRenderables() {
    const sphere = new THREE.SphereGeometry(1, 64, 40);
    for (const obj of this.data.catalog.objects) {
      if (!obj.position) continue;
      const r: Renderable = { obj, pos: null, sx: 0, sy: 0, depth: 0, rPx: 0, visible: false };
      if (obj.region === "solar-system" && obj.type !== "spacecraft") {
        const group = new THREE.Group();
        group.matrixAutoUpdate = false;
        let mat: THREE.Material;
        if (obj.id === "sun") {
          mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        } else {
          mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(obj.display.color), emissive: new THREE.Color(obj.display.color) });
        }
        if (obj.display.texture) {
          this.texLoader.load(`/textures/${obj.display.texture}`, (t) => {
            t.colorSpace = THREE.SRGBColorSpace;
            t.anisotropy = 4;
            (mat as THREE.MeshLambertMaterial).map = t;
            (mat as THREE.MeshLambertMaterial).color.set(0xffffff);
            if (obj.id !== "sun") {
              (mat as THREE.MeshLambertMaterial).emissiveMap = t;
              (mat as THREE.MeshLambertMaterial).emissive.set(0xffffff);
            }
            mat.needsUpdate = true;
            this.needsRender = true;
          });
        }
        const mesh = new THREE.Mesh(sphere, mat);
        group.add(mesh);
        if (obj.display.rings) {
          const ringGeo = new THREE.RingGeometry(obj.display.rings.innerKm / obj.radiusKm!, obj.display.rings.outerKm / obj.radiusKm!, 160, 1);
          const uv = ringGeo.attributes.uv as THREE.BufferAttribute;
          const p = ringGeo.attributes.position as THREE.BufferAttribute;
          const inner = obj.display.rings.innerKm / obj.radiusKm!, outer = obj.display.rings.outerKm / obj.radiusKm!;
          for (let i = 0; i < p.count; i++) {
            const rr = Math.hypot(p.getX(i), p.getY(i));
            uv.setXY(i, (rr - inner) / (outer - inner), 0.5);
          }
          const ringMat = new THREE.MeshLambertMaterial({ color: 0xd9c7a0, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.9 });
          if (obj.display.rings.texture) {
            this.texLoader.load(`/textures/${obj.display.rings.texture}`, (t) => {
              t.colorSpace = THREE.SRGBColorSpace;
              ringMat.map = t;
              ringMat.alphaMap = t;
              ringMat.color.set(0xffffff);
              ringMat.needsUpdate = true;
            });
          }
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.rotation.x = -Math.PI / 2;
          group.add(ring);
        }
        group.renderOrder = 3;
        this.scene.add(group);
        r.mesh = group;
        if (obj.id === "sun") {
          const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.discTex, color: 0xffc56b, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
          glow.renderOrder = 2;
          this.scene.add(glow);
          r.glow = glow;
        }
      }
      if ((obj.type === "galaxy" || obj.type === "nebula" || obj.type === "star-cluster") && obj.display.extentKm) {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.discTex, color: new THREE.Color(obj.display.color), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
        glow.renderOrder = 2;
        this.scene.add(glow);
        r.glow = glow;
      }
      const orbitEl = this.data.eph.orbits[obj.id];
      const sat = this.data.eph.satellites[obj.id];
      const el = orbitEl ?? sat?.sets[0];
      if (el && el.e < 1) {
        const pts = orbitPolyline(el, 720);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts.length * 3), 3));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthTest: false }));
        line.frustumCulled = false;
        line.renderOrder = 1;
        this.scene.add(line);
        r.orbit = { pts, aKm: el.aKm, parent: sat ? sat.parentKey : "sun", line };
      }
      this.renderables.push(r);
      this.byId.set(obj.id, r);
    }
    this.updatePositions();
  }

  private updatePositions() {
    for (const r of this.renderables) r.pos = positionAt(this.data, r.obj, this.jd);
  }

  // ---------------------------------------------------------------- public API
  setLayer(layer: Layer) {
    this.layer = layer;
    this.container.dataset.layer = layer;
    const atlas = layer === "atlas";
    this.starMat.uniforms.uAtlas.value = atlas ? 1 : 0;
    this.starMat.blending = atlas ? THREE.NormalBlending : THREE.AdditiveBlending;
    this.starMat.needsUpdate = true;
    const mwMat = this.milkyWay.material as THREE.MeshBasicMaterial;
    mwMat.map = this.mwTexture(layer);
    mwMat.blending = atlas ? THREE.NormalBlending : THREE.AdditiveBlending;
    mwMat.needsUpdate = true;
    for (const r of this.renderables) {
      if (r.orbit) {
        const m = r.orbit.line.material as THREE.LineBasicMaterial;
        m.color.set(atlas ? 0x8794aa : 0xa9c1ff);
      }
    }
    this.needsRender = true;
  }

  setJd(jd: number) {
    this.jd = jd;
    this.updatePositions();
    this.needsRender = true;
  }

  setSelection(id: string | null) {
    this.selectedId = id;
    this.needsRender = true;
  }

  setHover(id: string | null) {
    this.hoverId = id;
    this.needsRender = true;
  }

  setRoute(route: RouteDisplay | null) {
    this.route = route;
    this.needsRender = true;
  }

  setPlayback(progress: number | null) {
    this.playback = progress;
    this.needsRender = true;
  }

  setScenario(s: Scenario | null) {
    this.scenario = s;
    this.needsRender = true;
  }

  getObjectPosition(id: string): Vec3 | null {
    const r = this.byId.get(id);
    if (r) return r.pos;
    const o = this.data.byId.get(id);
    return o ? positionAt(this.data, o, this.jd) : null;
  }

  flyTo(target: { center: Vec3; widthKm: number; tilt?: number }, instant = false) {
    const w1 = Math.min(MAX_WIDTH_KM, Math.max(MIN_WIDTH_KM, target.widthKm));
    this.zoomAnim = null;
    if (instant || reducedMotion()) {
      this.view = { ...this.view, center: target.center, widthKm: w1, tilt: target.tilt ?? this.view.tilt };
      this.flight = null;
      this.needsRender = true;
      return;
    }
    const path = flightPath(this.view.center, this.view.widthKm, target.center, w1);
    this.flight = { path, start: performance.now(), duration: flightDuration(path.S), tilt0: this.view.tilt, tilt1: target.tilt ?? this.view.tilt };
  }

  /** A comfortable framing width for an object. */
  focusWidth(obj: CatalogObject): number {
    if (obj.region === "solar-system") {
      if (obj.id === "sun") return 4 * AU_KM;
      if (obj.type === "spacecraft") return obj.id === "jwst" ? 6e6 : 30 * AU_KM;
      const moons = this.data.catalog.objects.filter((o) => o.parentId === obj.id && this.data.eph.satellites[o.id]);
      if (moons.length) return Math.max(...moons.map((m) => this.data.eph.satellites[m.id].sets[0].aKm)) * 3.2;
      if (obj.type === "moon") {
        const a = this.data.eph.satellites[obj.id]?.sets[0].aKm ?? 1e5;
        return a * 2.6;
      }
      return Math.max((obj.radiusKm ?? 1000) * 60, 2e6);
    }
    if (obj.display.extentKm) return Math.max(obj.display.extentKm * 3, 20 * LY_KM);
    const d = obj.distance?.valueKm ?? 10 * LY_KM;
    return Math.min(Math.max(d * 0.35, 6 * LY_KM), 2000 * LY_KM);
  }

  flyToObject(id: string, widthKm?: number) {
    const p = this.getObjectPosition(id);
    const obj = this.data.byId.get(id);
    if (!p || !obj) return;
    this.flyTo({ center: p, widthKm: widthKm ?? this.focusWidth(obj) });
  }

  fitPoints(points: Vec3[], pad?: { left: number; right: number; top: number; bottom: number }) {
    if (!points.length) return;
    const v = fitView(points, this.vp, { ...this.view, tilt: this.view.tilt }, pad ?? { left: 90, right: 90, top: 110, bottom: 110 }, 2e5);
    this.flyTo({ center: v.center, widthKm: v.widthKm });
  }

  zoomBy(factor: number) {
    this.flight = null;
    const cur = this.zoomAnim?.target ?? Math.log(this.view.widthKm);
    this.zoomAnim = { target: cur + Math.log(factor), x: this.vp.width / 2, y: this.vp.height / 2 };
    if (reducedMotion()) {
      this.view = zoomAround(this.view, this.vp, factor, this.vp.width / 2, this.vp.height / 2);
      this.zoomAnim = null;
      this.needsRender = true;
    }
  }

  panBy(dx: number, dy: number) {
    this.flight = null;
    const a = unproject(this.view, this.vp, this.vp.width / 2, this.vp.height / 2);
    const b = unproject(this.view, this.vp, this.vp.width / 2 + dx, this.vp.height / 2 + dy);
    this.view = { ...this.view, center: add(this.view.center, sub(b, a)) };
    this.needsRender = true;
  }

  setTilt(tilt: number) {
    this.flyTo({ center: this.view.center, widthKm: this.view.widthKm * 1.0001, tilt });
  }

  getViewport() {
    return this.vp;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.renderer.dispose();
    this.container.innerHTML = "";
  }

  // ---------------------------------------------------------------- input
  private attachInput() {
    const el = this.container;
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.flight = null;
      const rect = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const cur = this.zoomAnim?.target ?? Math.log(this.view.widthKm);
      const target = Math.min(Math.log(MAX_WIDTH_KM), Math.max(Math.log(MIN_WIDTH_KM), cur + delta * 0.0022));
      this.zoomAnim = { target, x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (reducedMotion()) {
        this.view = zoomAround(this.view, this.vp, Math.exp(target - Math.log(this.view.widthKm)), this.zoomAnim.x, this.zoomAnim.y);
        this.zoomAnim = null;
      }
    }, { passive: false });
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      el.setPointerCapture(e.pointerId);
      this.flight = null;
      this.drag = { x: e.clientX, y: e.clientY, moved: false, rotate: e.button === 2 || e.shiftKey, view: this.view };
      el.classList.add("dragging");
    });
    el.addEventListener("pointermove", (e) => {
      const rect = el.getBoundingClientRect();
      if (!this.drag) {
        const hit = this.hitTest(e.clientX - rect.left, e.clientY - rect.top, false);
        const id = hit?.kind === "object" ? hit.id : null;
        el.style.cursor = hit ? "pointer" : "";
        if (id !== this.hoverId) this.setHover(id);
        return;
      }
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
      if (!this.drag.moved) return;
      if (this.drag.rotate) {
        const v = this.drag.view;
        this.view = { ...this.view, heading: v.heading + dx * 0.005, tilt: Math.min(1.35, Math.max(0, v.tilt + dy * 0.005)) };
      } else {
        const v = this.drag.view;
        const a = unproject(v, this.vp, this.drag.x - rect.left, this.drag.y - rect.top);
        const b = unproject(v, this.vp, e.clientX - rect.left, e.clientY - rect.top);
        this.view = { ...this.view, center: add(v.center, sub(a, b)) };
      }
      this.needsRender = true;
    });
    const end = (e: PointerEvent) => {
      if (!this.drag) return;
      const rect = el.getBoundingClientRect();
      if (!this.drag.moved && e.button === 0) this.cb.onPick?.(this.hitTest(e.clientX - rect.left, e.clientY - rect.top));
      this.drag = null;
      el.classList.remove("dragging");
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", () => { this.drag = null; el.classList.remove("dragging"); });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("dblclick", (e) => {
      const rect = el.getBoundingClientRect();
      const cur = this.zoomAnim?.target ?? Math.log(this.view.widthKm);
      this.zoomAnim = { target: cur + Math.log(e.shiftKey ? 2.5 : 0.4), x: e.clientX - rect.left, y: e.clientY - rect.top };
    });
  }

  private hitTest(x: number, y: number, includeStars = true): PickTarget | null {
    let best: { id: string; d: number; pri: number } | null = null;
    for (const r of this.renderables) {
      if (!r.visible) continue;
      const d = Math.hypot(r.sx - x, r.sy - y);
      const radius = Math.max(r.rPx, 5) + 5;
      if (d <= radius && (!best || d - r.obj.display.priority * 0.05 < best.d - best.pri * 0.05)) best = { id: r.obj.id, d, pri: r.obj.display.priority };
    }
    if (best) return { kind: "object", id: best.id };
    if (!includeStars) return null;
    // Star point cloud (only stars bright enough to be drawn).
    const proj = makeProjector(this.view, this.vp);
    const fade = this.starMat.uniforms.uFade.value as number;
    if (fade < 0.2) return null;
    const limit = this.starMat.uniforms.uLimit.value as number;
    const { stars, starStride } = this.data;
    let bestStar = -1, bestD = 7;
    const p: Vec3 = [0, 0, 0];
    for (let i = 0; i < stars.length / starStride; i++) {
      const o = i * starStride;
      if (limit - stars[o + 3] < -0.3) continue;
      p[0] = stars[o] * PC_KM; p[1] = stars[o + 1] * PC_KM; p[2] = stars[o + 2] * PC_KM;
      const s = proj.project(p);
      const d = Math.hypot(s[0] - x, s[1] - y);
      if (d < bestD) { bestD = d; bestStar = i; }
    }
    return bestStar >= 0 ? { kind: "star", index: bestStar } : null;
  }

  // ---------------------------------------------------------------- frame
  private resize() {
    const rect = this.container.getBoundingClientRect();
    this.vp = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.vp.width, this.vp.height, false);
    this.camera.left = -this.vp.width / 2;
    this.camera.right = this.vp.width / 2;
    this.camera.top = this.vp.height / 2;
    this.camera.bottom = -this.vp.height / 2;
    this.camera.updateProjectionMatrix();
    this.svg.setAttribute("viewBox", `0 0 ${this.vp.width} ${this.vp.height}`);
    this.needsRender = true;
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let animating = false;
    if (this.flight) {
      const t = Math.min(1, (now - this.flight.start) / this.flight.duration);
      const s = this.flight.path.at(easeInOut(t));
      if (Number.isFinite(s.widthKm) && s.center.every(Number.isFinite)) {
        this.view = { ...this.view, center: s.center, widthKm: s.widthKm, tilt: this.flight.tilt0 + (this.flight.tilt1 - this.flight.tilt0) * easeInOut(t) };
      } else this.flight = null;
      if (t >= 1) this.flight = null;
      animating = true;
    } else if (this.zoomAnim) {
      this.zoomAnim.target = Math.min(Math.log(MAX_WIDTH_KM), Math.max(Math.log(MIN_WIDTH_KM), this.zoomAnim.target));
      const cur = Math.log(this.view.widthKm);
      const diff = this.zoomAnim.target - cur;
      const step = Math.abs(diff) < 0.002 ? diff : diff * 0.22;
      this.view = zoomAround(this.view, this.vp, Math.exp(step), this.zoomAnim.x, this.zoomAnim.y);
      if (step === diff) this.zoomAnim = null;
      animating = true;
    }
    this.view.widthKm = Math.min(MAX_WIDTH_KM, Math.max(MIN_WIDTH_KM, this.view.widthKm));
    if (!animating && !this.needsRender && !this.drag) return;
    this.frame();
    if (now - this.lastInfo > 60 || !animating) {
      this.lastInfo = now;
      this.cb.onViewChange?.({ view: this.view, kmPerPx: this.view.widthKm / this.vp.width, plane: planeName(this.view.widthKm), vp: this.vp });
    }
  };

  private frame() {
    const proj = makeProjector(this.view, this.vp);
    const atlas = this.layer === "atlas";
    const W = this.view.widthKm;
    this.svgUsed.clear();

    // Stars
    const widthPc = W / PC_KM;
    const m = proj.m;
    (this.starMat.uniforms.uM.value as THREE.Matrix3).set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]);
    const c = this.view.center;
    (this.starMat.uniforms.uCenter.value as THREE.Vector3).set(c[0] / PC_KM, c[1] / PC_KM, c[2] / PC_KM);
    this.starMat.uniforms.uPxPerPc.value = proj.k * PC_KM;
    this.starMat.uniforms.uLimit.value = Math.max(-3, Math.min(17, 15.5 - 4.6 * Math.log10(Math.max(widthPc, 1e-6) / 4)));
    const starFade = Math.min(1, Math.max(0, Math.log10(widthPc / 0.02) / 1.3));
    const farFade = 1 - Math.min(1, Math.max(0, Math.log10(widthPc / 30_000) / 0.8));
    this.starMat.uniforms.uFade.value = starFade * farFade * (atlas ? 0.9 : 1);
    this.starMat.uniforms.uDpr.value = this.dpr;
    this.stars.visible = starFade * farFade > 0.01;

    // Milky Way illustration
    const mwFade = Math.min(1, Math.max(0, Math.log10(widthPc / 600) / 0.9));
    this.milkyWay.visible = mwFade > 0.01;
    if (this.milkyWay.visible) {
      const gc = galactocentricToIcrf(0, 0);
      const s = proj.project(gc);
      const ex = mulMatVec(m, mulMatVec(GALACTIC_TO_ICRF, [1, 0, 0]));
      const ey = mulMatVec(m, mulMatVec(GALACTIC_TO_ICRF, [0, 1, 0]));
      const ez = mulMatVec(m, mulMatVec(GALACTIC_TO_ICRF, [0, 0, 1]));
      const size = 2 * HALF_SIZE_KPC * 1000 * PC_KM * proj.k;
      const mat4 = new THREE.Matrix4().makeBasis(new THREE.Vector3(...ex), new THREE.Vector3(...ey), new THREE.Vector3(...ez));
      mat4.scale(new THREE.Vector3(size, size, 1));
      mat4.setPosition(s[0] - this.vp.width / 2, this.vp.height / 2 - s[1], 0);
      this.milkyWay.matrix.copy(mat4);
      this.milkyWay.matrixWorldNeedsUpdate = true;
      (this.milkyWay.material as THREE.MeshBasicMaterial).opacity = mwFade * (atlas ? 0.9 : 0.95);
    }

    // Objects
    const sun = this.byId.get("sun")!;
    const sunPos = sun.pos!;
    const sunS = proj.project(sunPos);
    const sunRpx = Math.max(695_700 * proj.k, 5);
    this.sunLight.position.set(sunS[0] - this.vp.width / 2, this.vp.height / 2 - sunS[1], Math.max(-5e6, Math.min(5e6, sunS[2])));
    this.ambient.intensity = atlas ? 1.2 : 0.06;

    const scenarioOn = !!this.scenario;
    const routeIds = new Set(this.route?.ids ?? []);
    const labelCands: LabelCandidate[] = [];

    for (const r of this.renderables) {
      r.visible = false;
      if (r.mesh) r.mesh.visible = false;
      if (r.glow) r.glow.visible = false;
      if (r.orbit) r.orbit.line.visible = false;
      if (!r.pos) continue;
      const o = r.obj;
      const s = proj.project(r.pos);
      r.sx = s[0]; r.sy = s[1]; r.depth = s[2];
      const onScreen = s[0] > -200 && s[0] < this.vp.width + 200 && s[1] > -200 && s[1] < this.vp.height + 200;
      const isSel = o.id === this.selectedId, inRoute = routeIds.has(o.id);
      const solar = o.region === "solar-system";

      // Orbit lines (drawn even if the body itself is off screen)
      if (r.orbit && !scenarioOn) {
        const aPx = r.orbit.aKm * proj.k;
        const parent = r.orbit.parent ? this.byId.get(r.orbit.parent)?.pos : sunPos;
        const show = aPx > 14 && aPx < 40_000 && parent && (o.featured || isSel);
        if (show) {
          const arr = (r.orbit.line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
          for (let i = 0; i < r.orbit.pts.length; i++) {
            const q = r.orbit.pts[i];
            const ps = proj.project([parent![0] + q[0], parent![1] + q[1], parent![2] + q[2]]);
            arr[i * 3] = ps[0] - this.vp.width / 2; arr[i * 3 + 1] = this.vp.height / 2 - ps[1]; arr[i * 3 + 2] = 0;
          }
          r.orbit.line.geometry.attributes.position.needsUpdate = true;
          const fadeIn = Math.min(1, (aPx - 14) / 40), fadeOut = Math.min(1, (40_000 - aPx) / 15_000);
          const base = o.type === "planet" ? 0.32 : o.type === "moon" ? 0.22 : 0.16;
          const mat = r.orbit.line.material as THREE.LineBasicMaterial;
          mat.opacity = (isSel ? 0.85 : atlas ? base * 2 : base) * fadeIn * fadeOut;
          mat.color.set(isSel ? ROUTE_BLUE : atlas ? 0x8794aa : 0xa9c1ff);
          r.orbit.line.visible = true;
        }
      }
      if (!onScreen) continue;

      // Visibility relative to the parent (moons collapse into planets, planets into the Sun)
      let rPx = 0;
      let visible = true;
      if (solar) {
        const minPx = o.id === "sun" ? 6 : o.type === "planet" ? 5.5 : o.type === "spacecraft" ? 3.5 : o.type === "moon" ? 3 : 2.5;
        rPx = Math.max((o.radiusKm ?? 1) * proj.k, minPx);
        if (o.id !== "sun") {
          const parentId = o.parentId ?? "sun";
          const parent = this.byId.get(parentId);
          if (parent?.pos) {
            const ps = proj.project(parent.pos);
            const pr = parentId === "sun" ? sunRpx : Math.max((parent.obj.radiusKm ?? 1) * proj.k, 4.5);
            const sep = Math.hypot(ps[0] - s[0], ps[1] - s[1]);
            if (sep < pr + rPx + (o.type === "moon" ? 6 : 8)) visible = isSel || inRoute ? sep > 1.5 : false;
          }
          if (o.type === "spacecraft" && o.id === "jwst") {
            const e = this.byId.get("earth")!;
            const es = proj.project(e.pos!);
            if (Math.hypot(es[0] - s[0], es[1] - s[1]) < 10) visible = isSel || inRoute;
          }
        }
        if (scenarioOn && (o.id === "earth" || o.id === "mars")) visible = false;
      } else {
        // Interstellar objects: hide when they collapse into the Sun's position at tiny scales.
        if (Math.hypot(s[0] - sunS[0], s[1] - sunS[1]) < 6 && !isSel) visible = false;
        if (!o.featured && !isSel && !inRoute) {
          // Lightweight HYG names only appear once their star is bright enough to be drawn.
          visible = visible && widthPc < 400 && widthPc > 0.5;
        }
        rPx = o.display.extentKm ? Math.max(o.display.extentKm * proj.k * 0.5, 6) : 3;
      }
      r.visible = visible;
      r.rPx = rPx;
      if (!visible) continue;

      // Meshes
      if (r.mesh && !atlas && !(o.id === "sun" && widthPc > 5000)) {
        this.placeSphere(r, proj, rPx);
      }
      if (r.glow) {
        if (o.id === "sun") {
          if (!atlas && widthPc < 5000) {
            const gs = Math.max(rPx * 5, 34);
            r.glow.scale.set(gs, gs, 1);
            r.glow.position.set(s[0] - this.vp.width / 2, this.vp.height / 2 - s[1], 0);
            r.glow.visible = true;
          }
        } else if (!atlas) {
          const ext = Math.max((o.display.extentKm ?? 0) * proj.k, 12);
          r.glow.scale.set(ext, ext * (o.display.axisRatio ?? 1), 1);
          r.glow.position.set(s[0] - this.vp.width / 2, this.vp.height / 2 - s[1], 0);
          (r.glow.material as THREE.SpriteMaterial).opacity = o.type === "galaxy" ? 0.9 : 0.7;
          r.glow.visible = true;
        }
      }

      // SVG symbols
      if (atlas) {
        if (solar) {
          this.svgCircle(`sym-${o.id}`, s[0], s[1], rPx, o.display.color, "#ffffff", o.type === "spacecraft" ? 1.2 : 1.5, 1);
        } else if (o.display.extentKm) {
          const rx = Math.max(o.display.extentKm * proj.k * 0.5, 6);
          this.svgEllipse(`sym-${o.id}`, s[0], s[1], rx, rx * (o.display.axisRatio ?? 1), o.display.color, 0.35);
        } else if (o.featured) {
          this.svgCircle(`sym-${o.id}`, s[0], s[1], 3, "#3b4a63", "#ffffff", 1, 1);
        }
      } else if (!solar && !o.display.extentKm && (o.featured || isSel || inRoute) && !o.hygId) {
        this.svgCircle(`sym-${o.id}`, s[0], s[1], 2.4, o.display.color, "none", 0, 0.95);
      } else if (o.type === "spacecraft") {
        this.svgCircle(`sym-${o.id}`, s[0], s[1], 3.2, "#f2c94c", "#1b1f2a", 1, 1);
      }

      // Labels
      let pri = o.display.priority;
      if (solar && W < 200 * AU_KM) pri += 25;
      if (!solar && W > 50_000 * PC_KM && o.region !== "local-group" && o.region !== "local-volume") pri -= 40;
      if (o.id === "sagittarius-a-star" && widthPc > 30_000) continue;
      if (solar && widthPc > 2 && !isSel && !inRoute) continue;
      labelCands.push({ id: o.id, x: s[0], y: s[1], width: this.textWidth(o.name), height: 16, priority: pri, offset: rPx + 5, force: isSel || inRoute });
    }

    // Milky Way and spiral-arm labels
    if (this.milkyWay.visible) {
      if (widthPc > 30_000) {
        const s = proj.project(galactocentricToIcrf(0, 0));
        labelCands.push({ id: "__mw", x: s[0], y: s[1], width: this.textWidth("Milky Way (illustration)"), height: 16, priority: 99, offset: 8 });
      }
      if (atlas && widthPc > 4000 && widthPc < 120_000) {
        for (const a of this.armAnchors) {
          const s = proj.project(a.pos);
          labelCands.push({ id: `__arm-${a.name}`, x: s[0], y: s[1], width: this.textWidth(a.name), height: 16, priority: 20, offset: 0 });
        }
      }
    }
    if (widthPc > 1.5 && widthPc < 400_000) {
      labelCands.push({ id: "__here", x: sunS[0], y: sunS[1], width: this.textWidth("You are here"), height: 16, priority: 120, offset: 8 });
    }

    this.drawDistanceRings(proj, sunS, atlas);
    if (this.scenario) this.drawScenario(proj);
    this.drawRoute(proj);
    this.drawSelection(proj);

    // Hide unused SVG
    for (const [id, el] of this.svgPool) if (!this.svgUsed.has(id)) el.setAttribute("display", "none");

    this.placeLabels(declutter(labelCands, this.vp.width, this.vp.height, 70));
    this.renderer.render(this.scene, this.camera);
    this.needsRender = false;
  }

  private placeSphere(r: Renderable, proj: Projector, rPx: number) {
    const o = r.obj;
    const m: Mat3 = proj.m;
    const pole = o.display.pole ? unitFromRaDec(o.display.pole.ra, o.display.pole.dec) : ([0, 0, 1] as Vec3);
    let node = cross([0, 0, 1], pole);
    if (length(node) < 1e-6) node = [1, 0, 0];
    node = normalize(node);
    // Prime-meridian angle W from the IAU model for Earth; other bodies are not spun.
    const d = this.jd - 2451545.0;
    const W = o.id === "earth" ? ((190.147 + 360.9856235 * d) * Math.PI) / 180 : 0;
    const east = cross(pole, node);
    const prime: Vec3 = add(lerp([0, 0, 0], node, Math.cos(W)), lerp([0, 0, 0], east, Math.sin(W)));
    const east90 = cross(pole, prime);
    const X = mulMatVec(m, prime), Y = mulMatVec(m, pole), Z = mulMatVec(m, east90).map((v) => -v) as Vec3;
    const toThree = (v: Vec3) => new THREE.Vector3(v[0], v[1], v[2]);
    const mat4 = new THREE.Matrix4().makeBasis(toThree(X), toThree(Y), toThree(Z));
    mat4.scale(new THREE.Vector3(rPx, rPx, rPx));
    mat4.setPosition(r.sx - this.vp.width / 2, this.vp.height / 2 - r.sy, Math.max(-5e6, Math.min(5e6, r.depth)));
    r.mesh!.matrix.copy(mat4);
    r.mesh!.matrixWorldNeedsUpdate = true;
    r.mesh!.visible = true;
    // Enlarged symbols get self-illumination so they stay legible; true-scale spheres show real phases.
    const lambert = (r.mesh!.children[0] as THREE.Mesh).material;
    if (lambert instanceof THREE.MeshLambertMaterial) {
      const truePx = (o.radiusKm ?? 1) * proj.k;
      lambert.emissiveIntensity = 0.12 + 0.6 * Math.min(1, Math.max(0, (30 - truePx) / 27));
    }
  }

  // ---------------------------------------------------------------- SVG helpers
  private svgEl<K extends keyof SVGElementTagNameMap>(id: string, tag: K, layer = 0): SVGElementTagNameMap[K] {
    let el = this.svgPool.get(id) as SVGElementTagNameMap[K] | undefined;
    if (!el) {
      el = document.createElementNS(SVGNS, tag) as SVGElementTagNameMap[K];
      el.dataset.layer = String(layer);
      // Keep z-order: insert before the first element of a higher layer.
      const after = [...this.svg.children].find((c) => Number((c as SVGElement).dataset.layer) > layer);
      this.svg.insertBefore(el, after ?? null);
      this.svgPool.set(id, el);
    }
    el.removeAttribute("display");
    this.svgUsed.add(id);
    return el;
  }

  private svgCircle(id: string, x: number, y: number, r: number, fill: string, stroke: string, sw: number, opacity: number, layer = 1) {
    const el = this.svgEl(id, "circle", layer);
    el.setAttribute("cx", x.toFixed(1)); el.setAttribute("cy", y.toFixed(1)); el.setAttribute("r", r.toFixed(1));
    el.setAttribute("fill", fill); el.setAttribute("stroke", stroke); el.setAttribute("stroke-width", String(sw)); el.setAttribute("opacity", String(opacity));
  }

  private svgEllipse(id: string, x: number, y: number, rx: number, ry: number, color: string, fillOpacity: number) {
    const el = this.svgEl(id, "ellipse", 1);
    el.setAttribute("cx", x.toFixed(1)); el.setAttribute("cy", y.toFixed(1)); el.setAttribute("rx", rx.toFixed(1)); el.setAttribute("ry", ry.toFixed(1));
    el.setAttribute("fill", color); el.setAttribute("fill-opacity", String(fillOpacity)); el.setAttribute("stroke", color); el.setAttribute("stroke-width", "1.2");
  }

  private svgPath(id: string, d: string, stroke: string, width: number, opts: { opacity?: number; dash?: string; fill?: string; layer?: number; linecap?: string } = {}) {
    const el = this.svgEl(id, "path", opts.layer ?? 2);
    el.setAttribute("d", d); el.setAttribute("stroke", stroke); el.setAttribute("stroke-width", String(width));
    el.setAttribute("fill", opts.fill ?? "none"); el.setAttribute("opacity", String(opts.opacity ?? 1));
    el.setAttribute("stroke-linecap", opts.linecap ?? "round"); el.setAttribute("stroke-linejoin", "round");
    if (opts.dash) el.setAttribute("stroke-dasharray", opts.dash); else el.removeAttribute("stroke-dasharray");
  }

  private svgText(id: string, x: number, y: number, text: string, cls: string) {
    const el = this.svgEl(id, "text", 3);
    el.setAttribute("x", x.toFixed(1)); el.setAttribute("y", y.toFixed(1)); el.setAttribute("class", cls);
    if (el.textContent !== text) el.textContent = text;
  }

  private drawDistanceRings(proj: Projector, sunS: [number, number, number], atlas: boolean) {
    const rings: { km: number; label: string }[] = [];
    for (const au of [0.1, 1, 10, 100, 1000, 10_000]) rings.push({ km: au * AU_KM, label: `${au.toLocaleString()} AU` });
    for (const ly of [1, 10, 100, 1000, 10_000, 100_000, 1e6, 1e7, 1e8]) rings.push({ km: ly * LY_KM, label: ly >= 1e6 ? `${ly / 1e6} million ly` : `${ly.toLocaleString()} ly` });
    const cosT = Math.cos(this.view.tilt);
    for (const ring of rings) {
      const r = ring.km * proj.k;
      const id = `ring-${ring.label}`;
      if (r < 70 || r > Math.max(this.vp.width, this.vp.height) * 1.6) continue;
      const el = this.svgEl(id, "ellipse", 0);
      el.setAttribute("cx", sunS[0].toFixed(1)); el.setAttribute("cy", sunS[1].toFixed(1));
      el.setAttribute("rx", r.toFixed(1)); el.setAttribute("ry", (r * cosT).toFixed(1));
      el.setAttribute("fill", "none");
      el.setAttribute("stroke", atlas ? "#c3cad6" : "#ffffff");
      el.setAttribute("stroke-opacity", atlas ? "0.9" : "0.09");
      el.setAttribute("stroke-dasharray", "2 5");
      this.svgText(`ringl-${ring.label}`, sunS[0] + 4, sunS[1] - r * cosT - 4, ring.label, "ring-label");
    }
  }

  private drawRoute(proj: Projector) {
    if (!this.route || this.route.positions.length < 2) return;
    const pts = this.route.positions.map((p) => proj.project(p));
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const atlas = this.layer === "atlas";
    this.svgPath("route-casing", d, atlas ? "#ffffff" : "#0b1220", 9, { opacity: atlas ? 1 : 0.65 });
    this.svgPath("route-line", d, ROUTE_BLUE, 5);
    // Endpoints and stops
    pts.forEach((p, i) => {
      const last = i === pts.length - 1;
      if (i === 0) {
        this.svgCircle(`route-start`, p[0], p[1], 6.5, "#ffffff", "#1d2433", 2.5, 1, 4);
      } else if (last) {
        const pin = `M${p[0]},${p[1]} c-1.5,-6 -9,-10 -9,-17 a9,9 0 1 1 18,0 c0,7 -7.5,11 -9,17z`;
        this.svgPath("route-pin", pin, "#a3262b", 1.2, { fill: "#e5484d", layer: 4, linecap: "butt" });
        this.svgCircle("route-pin-dot", p[0], p[1] - 17, 3.4, "#7d1b1f", "none", 0, 1, 5);
      } else {
        this.svgCircle(`route-stop-${i}`, p[0], p[1], 6, "#ffffff", "#1d2433", 2.2, 1, 4);
      }
    });
    if (this.playback != null) {
      // Position along the route by distance fraction.
      const lens = this.route.positions.slice(1).map((p, i) => length(sub(p, this.route!.positions[i])));
      const total = lens.reduce((a, b) => a + b, 0);
      let target = this.playback * total, i = 0;
      while (i < lens.length - 1 && target > lens[i]) { target -= lens[i]; i++; }
      const f = lens[i] > 0 ? Math.min(1, target / lens[i]) : 0;
      const pos = lerp(this.route.positions[i], this.route.positions[i + 1], f);
      const s = proj.project(pos);
      const done = pts.slice(0, i + 1).map((p, j) => `${j ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + ` L${s[0].toFixed(1)},${s[1].toFixed(1)}`;
      this.svgPath("route-done", done, "#9fbfff", 5, { opacity: 0.95 });
      this.svgCircle("route-craft-halo", s[0], s[1], 11, ROUTE_BLUE, "none", 0, 0.25, 5);
      this.svgCircle("route-craft", s[0], s[1], 6, "#ffffff", ROUTE_BLUE, 3, 1, 5);
    }
  }

  private drawSelection(proj: Projector) {
    const ids = [this.selectedId, this.hoverId].filter(Boolean) as string[];
    for (const id of ids) {
      const r = this.byId.get(id);
      const pos = r?.pos ?? this.getObjectPosition(id);
      if (!pos) continue;
      const s = proj.project(pos);
      const rad = Math.max(r?.rPx ?? 3, 3) + (id === this.selectedId ? 7 : 5);
      this.svgCircle(`sel-${id === this.selectedId ? "a" : "h"}`, s[0], s[1], rad, "none", id === this.selectedId ? ROUTE_BLUE : this.layer === "atlas" ? "#5b6b85" : "#ffffff", id === this.selectedId ? 2.5 : 1.5, id === this.selectedId ? 1 : 0.6, 4);
    }
  }

  private drawScenario(proj: Projector) {
    const sc = this.scenario!;
    const ecl2icrf = transpose(ICRF_TO_ECLIPTIC);
    const sun = this.byId.get("sun")!.pos!;
    const pt = (r: number, ang: number): [number, number, number] => proj.project(add(sun, mulMatVec(ecl2icrf, [r * Math.cos(ang + sc.lon0), r * Math.sin(ang + sc.lon0), 0])));
    const circle = (r: number) => {
      let d = "";
      for (let i = 0; i <= 180; i++) { const p = pt(r, (i / 180) * 2 * Math.PI); d += `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)} `; }
      return d;
    };
    const atlas = this.layer === "atlas";
    this.svgPath("sc-o1", circle(sc.h.r1Km), atlas ? "#7a8aa5" : "#7fa3ff", 1.5, { opacity: 0.8, dash: "4 4" });
    this.svgPath("sc-o2", circle(sc.h.r2Km), atlas ? "#b07a6a" : "#ff9b7a", 1.5, { opacity: 0.8, dash: "4 4" });
    // Transfer half-ellipse from perihelion (angle 0) to aphelion (π).
    const h = sc.h, e = h.eTransfer;
    let d = "";
    for (let i = 0; i <= 120; i++) {
      const nu = (i / 120) * Math.PI;
      const r = (h.aKm * (1 - e * e)) / (1 + e * Math.cos(nu));
      const p = pt(r, nu);
      d += `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)} `;
    }
    this.svgPath("sc-transfer", d, ROUTE_BLUE, 3.5, { opacity: 0.95 });
    const st = hohmannState(h, sc.tSeconds);
    const o = pt(st.origin.r, st.origin.angle), t = pt(st.target.r, st.target.angle), cr = pt(st.craft.r, st.craft.angle);
    this.svgCircle("sc-origin", o[0], o[1], 7, "#3d7be0", "#fff", 2, 1, 4);
    this.svgCircle("sc-target", t[0], t[1], 6, "#c8643c", "#fff", 2, 1, 4);
    if (sc.tSeconds <= h.transferSeconds) this.svgCircle("sc-craft", cr[0], cr[1], 4.5, "#ffffff", ROUTE_BLUE, 2.5, 1, 5);
    this.svgText("sc-origin-l", o[0] + 11, o[1] + 4, `${sc.originLabel} (idealized)`, "sc-label");
    this.svgText("sc-target-l", t[0] + 10, t[1] + 4, `${sc.targetLabel} (idealized)`, "sc-label");
  }

  // ---------------------------------------------------------------- labels
  private textWidth(text: string) {
    let w = this.textWidthCache.get(text);
    if (w == null) {
      w = this.measureCtx.measureText(text).width + 2;
      this.textWidthCache.set(text, w);
    }
    return w;
  }

  private placeLabels(placed: ReturnType<typeof declutter>) {
    const used = new Set<string>();
    for (const p of placed) {
      used.add(p.id);
      let el = this.labelPool.get(p.id);
      if (!el) {
        el = document.createElement("div");
        el.className = "map-label";
        const o = this.data.byId.get(p.id);
        el.textContent = p.id === "__mw" ? "Milky Way (illustration)" : p.id === "__here" ? "You are here" : p.id.startsWith("__arm-") ? p.id.slice(6) : o?.name ?? p.id;
        if (p.id.startsWith("__arm-")) el.classList.add("arm");
        if (p.id === "__here") el.classList.add("here");
        if (p.id === "__mw") el.classList.add("mw");
        if (o?.region === "solar-system" && (o.type === "planet" || o.id === "sun")) el.classList.add("major");
        if (o && (o.type === "galaxy")) el.classList.add("galaxy");
        this.labelLayer.appendChild(el);
        this.labelPool.set(p.id, el);
      }
      el.classList.toggle("selected", p.id === this.selectedId);
      el.style.transform = `translate(${p.left.toFixed(1)}px, ${p.top.toFixed(1)}px)`;
      el.style.display = "";
    }
    for (const [id, el] of this.labelPool) if (!used.has(id)) el.style.display = "none";
  }

  /** Heliocentric display constants used by the UI for zoom presets. */
  static readonly R0_KPC = R0_KPC;
}
