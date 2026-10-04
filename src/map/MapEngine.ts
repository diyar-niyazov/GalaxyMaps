import * as THREE from "three";
import type { CatalogObject, ImageRecord, Vec3 } from "../lib/types";
import type { DataBundle } from "../data/bundle";
import { positionAt } from "../data/bundle";
import { makeProjector, zoomAround, fitView, planeMatrix, planeName, unproject, centerOf, sunFacingPose, type View, type Viewport, type Projector } from "./projection";
import { flightPath, flightDuration, easeInOut } from "./flight";
import { declutter, type LabelCandidate } from "./labels";
import { renderMilkyWay, HALF_SIZE_KPC, R0_KPC, armLabelAnchors, galactocentricToIcrf } from "./milkyWay";
import { SkySphere } from "./sky";
import { createEarthMaterials, type EarthMaterials } from "./earthMaterial";
import { spriteTexture, galaxyKind, MAP_GLYPH } from "./glyphs";
import { buildGalaxyParticles, galaxyParams, particleBlend, particleBudget, type GalaxyParams } from "./galaxyModel";
import { OBSERVABLE_RADIUS_LY, logRadius, DISTANCE_BANDS_LY, bandLabel, universeBlend } from "./universe";
import { orbitPolyline } from "../lib/kepler";
import { GALACTIC_TO_ICRF, ICRF_TO_ECLIPTIC, unitFromRaDec } from "../lib/coords";
import { mulMatVec, transpose, cross, normalize, sub, add, lerp, length, scale, type Mat3 } from "../lib/vec";
import { AU_KM, LY_KM, PC_KM } from "../lib/units";
import { primeMeridian } from "../lib/rotation";
import { hohmannState, transferRadius } from "../lib/transfer";
import type { TransferPlan } from "../lib/route";
import { canvasFont, loadCanvasFonts } from "../lib/fonts";
import { reducedMotion } from "../lib/motion";

export type Layer = "realistic" | "atlas";
export type PickTarget = { kind: "object"; id: string } | { kind: "star"; index: number };
/** Explore: free pan/zoom/rotate. Locked: orbit around one object, no panning. Route: framing a route. */
export type CameraMode = "explore" | "locked" | "route";

export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ViewInfo {
  view: View;
  kmPerPx: number;
  plane: string;
  vp: Viewport;
  mode: CameraMode;
  lockedId: string | null;
  /** 0 = linear map, 1 = schematic observable-universe overview. */
  universe: number;
  /** Which background is visible, for provenance. */
  background: "sky-panorama" | "catalog-stars" | "milky-way" | "universe" | "none";
  /** An observation actually loaded and visible in the locked inspection view. */
  projectedImage?: ImageRecord | null;
  illustrativeBody?: boolean;
  schematicObject?: boolean;
  /** Generic 3D particle model shown for the locked galaxy, e.g. "barred spiral · SB(rs)bc". */
  galaxyModel?: string | null;
}

export interface EngineCallbacks {
  onViewChange?(info: ViewInfo): void;
  onPick?(target: PickTarget | null): void;
  onCameraChange?(mode: CameraMode, lockedId: string | null): void;
  /** True while the user is dragging, pinching or scrolling the map. */
  onInteraction?(active: boolean): void;
  onHover?(id: string | null): void;
}

export interface RouteDisplay {
  ids: string[];
  positions: Vec3[];
  transfer?: TransferPlan & { originLabel: string; targetLabel: string };
}

const SVGNS = "http://www.w3.org/2000/svg";
const MIN_WIDTH_KM = 6_000;
const MAX_WIDTH_KM = 1.6e22;
const ROUTE_BLUE = "#2f6fed";
const LOCK_TILT_MIN = 0.02;
const LOCK_TILT_MAX = Math.PI - 0.25;
const EXPLORE_TILT_MAX = 1.35;
const SPHERICAL_TYPES = new Set(["star", "planet", "dwarf-planet", "moon", "exoplanet", "white-dwarf", "neutron-star"]);
const EXTENDED_TYPES = new Set(["galaxy", "nebula", "supernova-remnant", "star-cluster", "quasar", "black-hole"]);

/** Particles per galaxy at full detail; small or low-density screens get half. */
const GALAXY_PARTICLES = typeof window !== "undefined" && Math.max(window.screen?.width ?? 0, window.screen?.height ?? 0) * (window.devicePixelRatio || 1) >= 1600 ? 90_000 : 45_000;
/** Galaxy particle buffers kept on the GPU; older invisible ones are released. */
const GALAXY_CACHE = 6;
const GALAXY_KIND_LABEL = { spiral: "spiral", barred: "barred spiral", elliptical: "elliptical", lenticular: "lenticular", irregular: "irregular" } as const;

interface GalaxyLod {
  group: THREE.Group;
  light: THREE.Points;
  dust: THREE.Points | null;
  params: GalaxyParams;
  max: number;
}

const GALAXY_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec3 color;
  uniform float uScale;
  uniform float uStarScale;
  varying vec3 vColor;
  varying float vEnergy;
  void main() {
    vColor = color;
    // Stars and knots (small sizes) stay point-like at any zoom; haze grows with the galaxy.
    float px = aSize * (aSize < 12.0 ? uStarScale : uScale);
    // Points below one pixel keep their total light instead of brightening when clamped.
    vEnergy = min(1.0, px * px);
    gl_PointSize = clamp(px, 1.0, 160.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const GALAXY_LIGHT_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vEnergy;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d) * 4.0;
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(vColor * exp(-r2 * 4.0) * vEnergy * uOpacity, 1.0);
  }`;
const GALAXY_DUST_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying float vEnergy;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d) * 4.0;
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(0.05, 0.03, 0.02, exp(-r2 * 3.0) * 0.32 * vEnergy * uOpacity);
  }`;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

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

// Catalog stars (HYG). Most points are small and dim; only intrinsically bright or nearby stars
// get size and contrast, so labels stay readable against the field.
const STAR_VERT = /* glsl */ `
  attribute float absmag;
  attribute float ci;
  uniform mat3 uM;
  uniform vec3 uCenter;
  uniform vec2 uOffset;
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
    gl_Position = projectionMatrix * vec4(p.xy + uOffset, 0.0, 1.0);
    float m = uLimit - absmag;
    float a = pow(clamp(m / 4.5, 0.0, 1.0), 1.5);
    gl_PointSize = clamp(0.8 + m * 0.24, 0.8, 3.8) * uDpr;
    vAlpha = a * uFade * 0.85;
    vColor = uAtlas > 0.5 ? vec3(0.22, 0.27, 0.36) : mix(bv2rgb(ci), vec3(1.0), 0.08);
  }
`;
const STAR_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    float a = smoothstep(1.0, 0.2, r) * vAlpha;
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
  /** Schematic galaxy/nebula/cluster sprite, oriented on the sky plane. */
  sprite?: THREE.Mesh | null;
  /** Near-field 2.5D particle model that replaces the flat sprite as a galaxy grows on screen. */
  galaxy?: GalaxyLod;
  orbit?: { pts: Vec3[]; aKm: number; parent: string | null; line: THREE.Line };
}

interface Flight {
  path: ReturnType<typeof flightPath>;
  start: number;
  duration: number;
  tilt0: number;
  tilt1: number;
  heading0: number;
  heading1: number;
  /** Keep a moving object centred while flying to it. */
  follow?: { id: string; at0: Vec3 };
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
  private insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  private dpr = 1;
  view: View;
  private layer: Layer = "realistic";
  private jd: number;
  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private emphasis: Set<string> | null = null;
  private route: RouteDisplay | null = null;
  private playback: number | null = null;
  private renderables: Renderable[] = [];
  private byId = new Map<string, Renderable>();
  private stars!: THREE.Points;
  private starMat!: THREE.ShaderMaterial;
  private milkyWay!: THREE.Mesh;
  private mwTextures: Partial<Record<Layer, THREE.Texture>> = {};
  private sky: SkySphere;
  private earthMats: EarthMaterials | null = null;
  private sunLight = new THREE.PointLight(0xffffff, 2.6, 0, 0);
  private ambient = new THREE.AmbientLight(0xffffff, 0.07);
  private discTex = softDiscTexture();
  private plane = new THREE.PlaneGeometry(1, 1);
  private inspectionSphere: THREE.Mesh;
  private texLoader = new THREE.TextureLoader();
  private raf = 0;
  private flight: Flight | null = null;
  private zoomAnim: { target: number; x: number; y: number } | null = null;
  private drag: { x: number; y: number; moved: boolean; rotate: boolean; view: View; lastX: number; lastY: number; lastT: number; vh: number; vt: number } | null = null;
  private pointers = new Map<number, { x: number; y: number; type: string }>();
  private pinch: { d0: number; a0: number; mid0: [number, number]; view: View } | null = null;
  private inertia: { vh: number; vt: number; t: number } | null = null;
  private travel: { w0: number; w1: number; wMid: number; c0: Vec3; wStart: number } | null = null;
  private wheelIdle = 0;
  private inputAbort = new AbortController();
  private mode: CameraMode = "explore";
  private lockedId: string | null = null;
  private exploreSaved: View | null = null;
  private lockHome: { widthKm: number; heading: number; tilt: number } | null = null;
  private routeFit: Vec3[] | null = null;
  private autoOrbit = false;
  private lastFrameT = performance.now();
  private universePts: { id: string; x: number; y: number }[] = [];
  private universe = 0;
  private svgPool = new Map<string, SVGElement>();
  private svgUsed = new Set<string>();
  private labelPool = new Map<string, HTMLDivElement>();
  private labelText = new Map<string, string>();
  private textWidthCache = new Map<string, number>();
  private measureCtx = document.createElement("canvas").getContext("2d")!;
  private lastInfo = 0;
  private armAnchors = armLabelAnchors();
  private resizeObs: ResizeObserver;
  private disposed = false;
  private needsRender = true;
  private paused = false;

  constructor(container: HTMLElement, data: DataBundle, jd: number, cb: EngineCallbacks = {}) {
    this.container = container;
    this.data = data;
    this.cb = cb;
    this.jd = jd;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    const canvas = this.renderer.domElement;
    canvas.className = "map-canvas";
    container.appendChild(canvas);
    this.svg = document.createElementNS(SVGNS, "svg");
    this.svg.setAttribute("class", "map-svg");
    this.svg.innerHTML = `<defs><radialGradient id="gm-bubble" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#6d8cff" stop-opacity="0"/><stop offset="82%" stop-color="#6d8cff" stop-opacity="0.04"/><stop offset="100%" stop-color="#9db4ff" stop-opacity="0.16"/></radialGradient></defs>`;
    container.appendChild(this.svg);
    this.labelLayer = document.createElement("div");
    this.labelLayer.className = "map-labels";
    container.appendChild(this.labelLayer);
    this.measureCtx.font = canvasFont("500 12px");
    void loadCanvasFonts().then(() => {
      if (this.disposed) return;
      this.measureCtx.font = canvasFont("500 12px");
      this.textWidthCache.clear();
      this.needsRender = true;
    });

    const rect = container.getBoundingClientRect();
    const small = Math.min(rect.width || 1024, rect.height || 768) < 700 || window.matchMedia?.("(pointer: coarse)").matches;
    this.sky = new SkySphere(`/textures/sky/milkyway_${small ? "2k" : "4k"}.jpg`, () => (this.needsRender = true));

    const earth = data.byId.get("earth")!;
    this.view = { center: positionAt(data, earth, jd)!, widthKm: 2.2e6, heading: 0, tilt: 0 };

    this.scene.add(this.ambient, this.sunLight);
    this.inspectionSphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.14 }),
    );
    this.inspectionSphere.matrixAutoUpdate = false;
    this.inspectionSphere.frustumCulled = false;
    this.inspectionSphere.renderOrder = 3;
    this.inspectionSphere.visible = false;
    this.scene.add(this.inspectionSphere);
    this.buildStars();
    this.buildMilkyWay();
    this.buildRenderables(small ? "low" : "high");
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
        uM: { value: new THREE.Matrix3() }, uCenter: { value: new THREE.Vector3() }, uOffset: { value: new THREE.Vector2() }, uPxPerPc: { value: 1 },
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
    this.milkyWay = new THREE.Mesh(this.plane, mat);
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

  private buildRenderables(quality: "high" | "low") {
    const sphere = new THREE.SphereGeometry(1, 96, 64);
    for (const obj of this.data.catalog.objects) {
      if (!obj.position) continue;
      const r: Renderable = { obj, pos: null, sx: 0, sy: 0, depth: 0, rPx: 0, visible: false };
      if (obj.region === "solar-system" && obj.type !== "spacecraft" && obj.radiusKm) {
        const group = new THREE.Group();
        group.matrixAutoUpdate = false;
        if (obj.id === "earth") {
          this.earthMats = createEarthMaterials(quality, () => (this.needsRender = true));
          group.add(new THREE.Mesh(sphere, this.earthMats.surface));
          const halo = new THREE.Mesh(sphere, this.earthMats.halo);
          halo.scale.setScalar(1.025);
          halo.renderOrder = 4;
          group.add(halo);
        } else {
          let mat: THREE.Material;
          if (obj.id === "sun") {
            mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
          } else {
            mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(obj.display.color), emissive: new THREE.Color(obj.display.color) });
          }
          if (obj.display.texture) {
            this.texLoader.load(`/textures/${obj.display.texture}`, (t) => {
              if (this.disposed) { t.dispose(); return; }
              t.colorSpace = THREE.SRGBColorSpace;
              t.anisotropy = 8;
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
          group.add(new THREE.Mesh(sphere, mat));
        }
        if (obj.display.rings) {
          const inner = obj.display.rings.innerKm / obj.radiusKm, outer = obj.display.rings.outerKm / obj.radiusKm;
          const ringGeo = new THREE.RingGeometry(inner, outer, 192, 1);
          const uv = ringGeo.attributes.uv as THREE.BufferAttribute;
          const p = ringGeo.attributes.position as THREE.BufferAttribute;
          for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.hypot(p.getX(i), p.getY(i)) - inner) / (outer - inner), 0.5);
          // Rings scatter light even when the Sun is near the ring plane, so they get some self-illumination.
          const ringMat = new THREE.MeshLambertMaterial({ color: 0xd9c7a0, emissive: 0x6b6250, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.9 });
          if (obj.display.rings.texture) {
            this.texLoader.load(`/textures/${obj.display.rings.texture}`, (t) => {
              if (this.disposed) { t.dispose(); return; }
              t.colorSpace = THREE.SRGBColorSpace;
              ringMat.map = t;
              ringMat.emissiveMap = t;
              ringMat.emissive.set(0x9a9080);
              ringMat.color.set(0xffffff);
              ringMat.needsUpdate = true;
              this.needsRender = true;
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

  private spriteFor(r: Renderable): THREE.Mesh | null {
    if (r.sprite !== undefined) return r.sprite;
    const modelled = r.obj.type === "galaxy" || r.obj.type === "quasar";
    const observed = !modelled && EXTENDED_TYPES.has(r.obj.type) && r.obj.image?.kind === "observed" ? r.obj.image : null;
    const tex = spriteTexture(r.obj) ?? (observed ? this.discTex : null);
    if (!tex) return (r.sprite = null);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.plane, mat);
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    if (observed) {
      const applyPhoto = (photo: THREE.Texture) => {
        if (this.disposed) { photo.dispose(); return; }
        photo.colorSpace = THREE.SRGBColorSpace;
        photo.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        if (mat.map && mat.map !== tex) mat.map.dispose();
        mat.map = photo;
        mat.blending = THREE.NormalBlending;
        mat.needsUpdate = true;
        mesh.userData.observedAspect = observed.width && observed.height ? observed.width / observed.height : 1;
        mesh.userData.projectedImage = observed;
        this.needsRender = true;
      };
      this.texLoader.load(observed.src, applyPhoto);
    }
    return (r.sprite = mesh);
  }

  private galaxyLods: Renderable[] = [];

  private galaxyFor(r: Renderable): GalaxyLod {
    if (r.galaxy) {
      this.galaxyLods.splice(this.galaxyLods.indexOf(r), 1);
      this.galaxyLods.push(r);
      return r.galaxy;
    }
    const params = galaxyParams(r.obj);
    const { light, dust } = buildGalaxyParticles(params, GALAXY_PARTICLES);
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    group.renderOrder = 2;
    const points = (positions: Float32Array, sizes: Float32Array, colors: Float32Array | null, fragmentShader: string, blending: THREE.Blending) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
      if (colors) geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 1 }, uStarScale: { value: 1 }, uOpacity: { value: 0 } },
        vertexShader: GALAXY_VERTEX, fragmentShader, transparent: true, depthTest: false, depthWrite: false, blending,
      });
      const p = new THREE.Points(geo, mat);
      p.frustumCulled = false;
      group.add(p);
      return p;
    };
    const lightPts = points(light.positions, light.sizes, light.colors, GALAXY_LIGHT_FRAGMENT, THREE.AdditiveBlending);
    lightPts.renderOrder = 2;
    let dustPts: THREE.Points | null = null;
    if (dust.count) {
      dustPts = points(dust.positions, dust.sizes, null, GALAXY_DUST_FRAGMENT, THREE.NormalBlending);
      dustPts.renderOrder = 3;
    }
    this.scene.add(group);
    r.galaxy = { group, light: lightPts, dust: dustPts, params, max: light.count };
    this.galaxyLods.push(r);
    while (this.galaxyLods.length > GALAXY_CACHE) {
      const old = this.galaxyLods.find((g) => !g.galaxy!.group.visible);
      if (!old) break;
      this.releaseGalaxy(old);
    }
    return r.galaxy;
  }

  private releaseGalaxy(r: Renderable) {
    const g = r.galaxy;
    if (!g) return;
    for (const p of [g.light, g.dust]) {
      if (!p) continue;
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    }
    this.scene.remove(g.group);
    this.galaxyLods.splice(this.galaxyLods.indexOf(r), 1);
    r.galaxy = undefined;
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
    this.needsRender = true;
  }

  setJd(jd: number) {
    if (jd === this.jd) return;
    this.jd = jd;
    this.updatePositions();
    const p = this.mode === "locked" && this.lockedId && !this.flight ? this.byId.get(this.lockedId)?.pos : null;
    if (p) this.view = { ...this.view, center: p };
    this.needsRender = true;
  }

  setSelection(id: string | null) {
    this.selectedId = id;
    this.needsRender = true;
  }

  setHover(id: string | null) {
    if (this.hoverId === id) return;
    this.hoverId = id;
    this.cb.onHover?.(id);
    this.needsRender = true;
  }

  /** Emphasize a set of objects (category browsing); others are dimmed. */
  setEmphasis(ids: Set<string> | null) {
    this.emphasis = ids && ids.size ? ids : null;
    this.needsRender = true;
  }

  setRoute(route: RouteDisplay | null) {
    this.route = route;
    // Refresh reset targets without disturbing a deliberately restored camera pose.
    if (this.mode === "route") this.routeFit = route ? this.routeFramePoints(route) : null;
    this.needsRender = true;
  }

  private routeFramePoints(route: RouteDisplay): Vec3[] {
    if (!route.transfer) return route.positions;
    const radius = Math.max(route.transfer.h.r1Km, route.transfer.h.r2Km) * 1.08;
    const ecl2icrf = transpose(ICRF_TO_ECLIPTIC);
    return [0, 1, 2, 3].map((i) => mulMatVec(ecl2icrf, [radius * Math.cos(i * Math.PI / 2), radius * Math.sin(i * Math.PI / 2), 0]));
  }

  setPlayback(progress: number | null) {
    this.playback = progress;
    this.needsRender = true;
  }

  /**
   * Cinematic travel: while route playback runs, the camera follows the craft along the drawn
   * route (transfer ellipse or straight segments), widening mid-journey to keep context.
   */
  setTravel(on: boolean): boolean {
    if (!on || !this.route || this.route.ids.length < 2) {
      this.travel = null;
      this.needsRender = true;
      return false;
    }
    const origin = this.data.byId.get(this.route.ids[0]), dest = this.data.byId.get(this.route.ids[this.route.ids.length - 1]);
    if (!origin || !dest) return false;
    const pts = this.route.positions;
    let extent = 0;
    for (const a of pts) for (const b of pts) extent = Math.max(extent, length(sub(a, b)));
    if (this.route.transfer) extent = Math.max(extent, 2 * this.route.transfer.h.r2Km);
    const w0 = this.focusWidth(origin), w1 = this.focusWidth(dest);
    this.flight = null;
    this.zoomAnim = null;
    this.inertia = null;
    this.travel = { w0, w1, wMid: Math.max(w0, w1, extent * 0.9), c0: this.view.center, wStart: this.view.widthKm };
    this.needsRender = true;
    return true;
  }

  /** World position of the travelling craft at the current playback progress. */
  private playbackPosition(): Vec3 | null {
    if (!this.route || this.playback == null || this.route.positions.length < 2) return null;
    const plan = this.route.transfer;
    if (plan) {
      const st = hohmannState(plan.h, this.playback * plan.h.transferSeconds);
      const sun = this.byId.get("sun")?.pos;
      if (!sun) return null;
      const a = st.craft.angle + plan.lon0;
      return add(sun, mulMatVec(transpose(ICRF_TO_ECLIPTIC), [st.craft.r * Math.cos(a), st.craft.r * Math.sin(a), 0]));
    }
    const P = this.route.positions;
    const lens = P.slice(1).map((p, i) => length(sub(p, P[i])));
    const total = lens.reduce((x, y) => x + y, 0);
    let target = this.playback * total, i = 0;
    while (i < lens.length - 1 && target > lens[i]) { target -= lens[i]; i++; }
    return lerp(P[i], P[i + 1], lens[i] > 0 ? Math.min(1, target / lens[i]) : 0);
  }

  setAutoOrbit(on: boolean) {
    this.autoOrbit = on;
    this.needsRender = true;
  }

  /** Space covered by UI panels; fits and the locked pivot use the remaining area. */
  setInsets(insets: Insets) {
    const i = this.insets;
    if (i.left === insets.left && i.right === insets.right && i.top === insets.top && i.bottom === insets.bottom) return;
    this.insets = { ...insets };
    this.applyViewport();
  }

  /** Stop drawing (e.g. while an immersive XR session owns the GPU). */
  setPaused(paused: boolean) {
    this.paused = paused;
    this.needsRender = true;
  }

  getRenderer() {
    return this.renderer;
  }

  getMode(): CameraMode {
    return this.mode;
  }

  /** The rendered epoch can be ahead of the throttled React clock by one store interval. */
  getJd(): number { return this.jd; }

  getLockedId() {
    return this.lockedId;
  }

  /** Restore a meaningful saved view without replaying a framing animation. */
  restoreView(view: View, mode: CameraMode, lockedId: string | null) {
    if (mode === "locked" && lockedId && this.lockOn(lockedId, { widthKm: view.widthKm, heading: view.heading, tilt: view.tilt, instant: true })) return;
    this.routeFit = mode === "route" && this.route ? this.routeFramePoints(this.route) : null;
    this.setMode(mode === "route" ? "route" : "explore", null);
    this.flyTo(view, true);
  }

  getObjectPosition(id: string): Vec3 | null {
    const r = this.byId.get(id);
    if (r) return r.pos;
    const o = this.data.byId.get(id);
    return o ? positionAt(this.data, o, this.jd) : null;
  }

  /** Screen position (CSS px, relative to the map) of a catalog object at the current view. */
  screenOf(id: string): [number, number] | null {
    const p = this.getObjectPosition(id);
    if (!p) return null;
    const s = makeProjector(this.view, this.vp).project(p);
    return [s[0], s[1]];
  }

  private usable() {
    const w = Math.max(80, this.vp.width - this.insets.left - this.insets.right);
    const h = Math.max(80, this.vp.height - this.insets.top - this.insets.bottom);
    return { w, h, min: Math.min(w, h) };
  }

  private setMode(mode: CameraMode, lockedId: string | null) {
    const changed = mode !== this.mode || lockedId !== this.lockedId;
    this.mode = mode;
    this.lockedId = lockedId;
    this.container.dataset.camera = mode;
    if (changed) this.cb.onCameraChange?.(mode, lockedId);
    this.needsRender = true;
  }

  private widthLimits(): [number, number] {
    if (this.mode === "locked" && this.lockedId) {
      const obj = this.data.byId.get(this.lockedId);
      if (obj) return this.lockLimits(obj);
    }
    return [MIN_WIDTH_KM, MAX_WIDTH_KM];
  }

  /** Visible radius used to frame an object (rings and galaxy/nebula extents included). */
  private frameRadiusKm(obj: CatalogObject): number | null {
    if (obj.region === "solar-system" && obj.radiusKm && obj.type !== "spacecraft") return obj.display.rings ? obj.display.rings.outerKm : obj.radiusKm;
    if (obj.display.extentKm) return obj.display.extentKm / 2;
    return null;
  }

  /** Initial locked width and zoom limits: never through the surface, never a lost speck. */
  private lockFraming(obj: CatalogObject): { initial: number; min: number; max: number } {
    const u = this.usable();
    const toWidth = (diameterKm: number, fraction: number) => (diameterKm * this.vp.width) / (fraction * u.min);
    const R = this.frameRadiusKm(obj);
    const focus = this.focusWidth(obj);
    if (R && obj.region === "solar-system") {
      const initial = toWidth(2 * R, obj.display.rings ? 0.82 : this.vp.width < 700 ? 0.8 : 0.86);
      return { initial, min: toWidth(2 * (obj.radiusKm ?? R), 0.96), max: Math.max(initial * 6, focus * 3) };
    }
    if (R) {
      const initial = toWidth(2 * R, 0.9);
      return { initial, min: initial * 0.03, max: initial * 40 };
    }
    return { initial: focus, min: focus * 2e-4, max: focus * 40 };
  }

  private lockLimits(obj: CatalogObject): [number, number] {
    const f = this.lockFraming(obj);
    return [Math.max(MIN_WIDTH_KM * 0.05, f.min), Math.min(MAX_WIDTH_KM, f.max)];
  }

  flyTo(target: { center: Vec3; widthKm: number; tilt?: number; heading?: number }, opts: boolean | { instant?: boolean; follow?: string } = false) {
    const o = typeof opts === "boolean" ? { instant: opts } : opts;
    const [lo, hi] = this.widthLimits();
    const w1 = clamp(target.widthKm, lo, hi);
    const tilt1 = target.tilt ?? this.view.tilt, heading1 = target.heading ?? this.view.heading;
    this.zoomAnim = null;
    this.inertia = null;
    this.travel = null;
    if (o.instant || reducedMotion()) {
      this.view = { center: target.center, widthKm: w1, tilt: tilt1, heading: heading1 };
      this.flight = null;
      this.needsRender = true;
      return;
    }
    const path = flightPath(this.view.center, this.view.widthKm, target.center, w1);
    this.flight = {
      path, start: performance.now(), duration: flightDuration(path.S),
      tilt0: this.view.tilt, tilt1, heading0: this.view.heading, heading1: this.view.heading + wrapAngle(heading1 - this.view.heading),
      follow: o.follow ? { id: o.follow, at0: target.center } : undefined,
    };
  }

  /** A comfortable explore-mode framing width for an object. */
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

  /**
   * Enter Locked object mode: the object's centre becomes the orbit pivot, centred in the usable
   * area. Returns false when the object has no map position.
   */
  lockOn(id: string, opts: { widthKm?: number; heading?: number; tilt?: number; instant?: boolean } = {}): boolean {
    const obj = this.data.byId.get(id);
    const pos = this.getObjectPosition(id);
    if (!obj || !pos) return false;
    if (this.mode === "explore") this.exploreSaved = { ...this.view };
    const framing = this.lockFraming(obj);
    const pole = obj.display.rings && obj.display.pole ? mulMatVec(planeMatrix(framing.initial), unitFromRaDec(obj.display.pole.ra, obj.display.pole.dec)) : null;
    // Start galaxy inspection from the Sun-facing direction so the catalog axis ratio is legible.
    const galaxyView = obj.type === "galaxy" ? sunFacingPose(pos, framing.initial) : null;
    const heading = opts.heading ?? (galaxyView?.heading ?? (pole ? Math.atan2(-pole[1], pole[0]) : this.view.heading));
    const tilt = clamp(opts.tilt ?? (galaxyView?.tilt ?? (pole ? 1.1 : Math.max(this.view.tilt, obj.region === "solar-system" && this.frameRadiusKm(obj) ? 0.9 : this.view.tilt))), LOCK_TILT_MIN, LOCK_TILT_MAX);
    const widthKm = clamp(opts.widthKm ?? framing.initial, framing.min, framing.max);
    this.lockHome = { widthKm, heading, tilt };
    this.setMode("locked", id);
    this.flyTo({ center: pos, widthKm, heading, tilt }, { instant: opts.instant, follow: id });
    return true;
  }

  /**
   * Focus action: lock onto an object with a map position; objects known only by redshift open the
   * observable-universe overview instead.
   */
  focus(id: string): boolean {
    if (this.lockOn(id)) return true;
    const obj = this.data.byId.get(id);
    if (obj?.cosmo) {
      this.exploreTo({ center: [0, 0, 0], widthKm: MAX_WIDTH_KM, tilt: 0 });
      return true;
    }
    return false;
  }

  /** Locked framing for Home: Earth lit from slightly in front, ecliptic seen nearly edge-on. */
  homeEarth(instant = false) {
    const earth = this.getObjectPosition("earth"), sun = this.getObjectPosition("sun");
    if (!earth || !sun) return;
    const tilt = 1.2;
    const planeM = makeProjector({ ...this.view, heading: 0, tilt: 0, widthKm: 1e5 }, this.vp).m;
    const inPlane = mulMatVec(planeM, sub(sun, earth));
    const heading = (-65 * Math.PI) / 180 - Math.atan2(inPlane[1], inPlane[0]);
    this.lockOn("earth", { heading, tilt, instant });
  }

  /** Leave Locked/Route framing and restore the saved exploration view. */
  unlock() {
    if (this.mode === "explore") return;
    const back = this.exploreSaved;
    this.exploreSaved = null;
    this.lockHome = null;
    this.routeFit = null;
    this.setMode("explore", null);
    if (back) this.flyTo({ center: back.center, widthKm: back.widthKm, heading: back.heading, tilt: Math.min(back.tilt, EXPLORE_TILT_MAX) });
    else this.flyTo({ center: this.view.center, widthKm: this.view.widthKm, tilt: Math.min(this.view.tilt, EXPLORE_TILT_MAX) });
  }

  /** Restore the current object's initial framing, or a level view in Explore. */
  resetView() {
    if (this.mode === "locked" && this.lockedId && this.lockHome) {
      const pos = this.getObjectPosition(this.lockedId);
      if (pos) this.flyTo({ center: pos, ...this.lockHome }, { follow: this.lockedId });
    } else if (this.mode === "route" && this.routeFit) {
      this.fitPoints(this.routeFit);
    } else {
      this.flyTo({ center: this.view.center, widthKm: this.view.widthKm, heading: 0, tilt: 0 });
    }
  }

  /** Deliberately enter an exploration frame (regions, Explore inside). */
  exploreTo(target: { center: Vec3; widthKm: number; tilt?: number; heading?: number }) {
    this.exploreSaved = null;
    this.lockHome = null;
    this.routeFit = null;
    this.setMode("explore", null);
    this.flyTo({ ...target, tilt: Math.min(target.tilt ?? this.view.tilt, EXPLORE_TILT_MAX) });
  }

  /** Enter Route framing showing all points. */
  frameRoute(points: Vec3[]) {
    if (!points.length) return;
    if (this.mode === "explore") this.exploreSaved = { ...this.view };
    this.routeFit = points;
    this.setMode("route", null);
    this.fitPoints(points);
  }

  orbitBy(dHeading: number, dTilt: number) {
    if (this.mode !== "locked") return;
    this.flight = null;
    this.view = { ...this.view, heading: this.view.heading + dHeading, tilt: clamp(this.view.tilt + dTilt, LOCK_TILT_MIN, LOCK_TILT_MAX) };
    this.needsRender = true;
  }

  fitPoints(points: Vec3[], pad?: Insets) {
    if (!points.length) return;
    const base = { ...this.view, tilt: Math.min(this.view.tilt, EXPLORE_TILT_MAX) };
    const p = pad ?? { left: this.insets.left + 72, right: this.insets.right + 72, top: this.insets.top + 96, bottom: this.insets.bottom + 72 };
    const v = fitView(points, this.vp, base, p, 2e5);
    this.flyTo({ center: v.center, widthKm: v.widthKm, tilt: base.tilt });
  }

  zoomBy(factor: number) {
    this.flight = null;
    const [lo, hi] = this.widthLimits();
    const [cx, cy] = centerOf(this.vp);
    const cur = this.zoomAnim?.target ?? Math.log(this.view.widthKm);
    this.zoomAnim = { target: clamp(cur + Math.log(factor), Math.log(lo), Math.log(hi)), x: cx, y: cy };
    if (reducedMotion()) {
      this.view = zoomAround(this.view, this.vp, Math.exp(this.zoomAnim.target - Math.log(this.view.widthKm)), cx, cy);
      this.zoomAnim = null;
      this.needsRender = true;
    }
  }

  /** Screen-space pan (Explore and Route only; ignored while locked). */
  panBy(dx: number, dy: number) {
    if (this.mode === "locked") return;
    this.flight = null;
    const [cx, cy] = centerOf(this.vp);
    const a = unproject(this.view, this.vp, cx, cy);
    const b = unproject(this.view, this.vp, cx + dx, cy + dy);
    this.view = { ...this.view, center: add(this.view.center, sub(b, a)) };
    this.needsRender = true;
  }

  setTilt(tilt: number) {
    this.flyTo({ center: this.view.center, widthKm: this.view.widthKm * 1.0001, tilt }, { follow: this.mode === "locked" ? this.lockedId ?? undefined : undefined });
  }

  getViewport() {
    return this.vp;
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.wheelIdle);
    this.inputAbort.abort();
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    for (const t of Object.values(this.mwTextures)) t?.dispose();
    this.discTex.dispose();
    this.sky.dispose();
    this.renderer.dispose();
    this.container.innerHTML = "";
  }

  // ---------------------------------------------------------------- input
  private interaction(active: boolean) {
    this.cb.onInteraction?.(active);
  }

  private attachInput() {
    const el = this.container;
    const signal = this.inputAbort.signal;
    el.addEventListener("pointerleave", () => { this.setHover(null); el.style.cursor = ""; }, { signal });
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.flight = null;
      this.inertia = null;
      const rect = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const [lo, hi] = this.widthLimits();
      const cur = this.zoomAnim?.target ?? Math.log(this.view.widthKm);
      const target = clamp(cur + delta * 0.0022, Math.log(lo), Math.log(hi));
      // Locked: zoom toward the pivot, never toward the cursor.
      const [cx, cy] = centerOf(this.vp);
      const locked = this.mode === "locked";
      this.zoomAnim = { target, x: locked ? cx : e.clientX - rect.left, y: locked ? cy : e.clientY - rect.top };
      if (reducedMotion()) {
        this.view = zoomAround(this.view, this.vp, Math.exp(target - Math.log(this.view.widthKm)), this.zoomAnim.x, this.zoomAnim.y);
        this.zoomAnim = null;
      }
      this.interaction(true);
      clearTimeout(this.wheelIdle);
      this.wheelIdle = window.setTimeout(() => this.interaction(false), 450);
    }, { passive: false, signal });

    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      // Synthetic or already-released pointers cannot be captured; the drag still works without capture.
      try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      this.flight = null;
      this.inertia = null;
      this.zoomAnim = null;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const rect = el.getBoundingClientRect();
        this.pinch = { d0: Math.hypot(b.x - a.x, b.y - a.y), a0: Math.atan2(b.y - a.y, b.x - a.x), mid0: [(a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top], view: { ...this.view } };
        this.drag = null;
      } else if (this.pointers.size === 1) {
        this.startDrag(e.clientX, e.clientY, e.button === 2 || (e.button === 0 && e.shiftKey));
      }
      el.classList.add("dragging");
      this.interaction(true);
    }, { signal });

    el.addEventListener("pointermove", (e) => {
      const rect = el.getBoundingClientRect();
      const p = this.pointers.get(e.pointerId);
      if (!p) {
        if (e.pointerType !== "mouse") return;
        const hit = this.hitTest(e.clientX - rect.left, e.clientY - rect.top, false);
        const id = hit?.kind === "object" ? hit.id : null;
        el.style.cursor = hit ? "pointer" : "";
        if (id !== this.hoverId) this.setHover(id);
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
      if (this.pinch && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
        const mid: [number, number] = [(a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top];
        const [lo, hi] = this.widthLimits();
        const v0 = this.pinch.view;
        const widthKm = clamp(v0.widthKm * (this.pinch.d0 / Math.max(d, 1)), lo, hi);
        const heading = v0.heading - wrapAngle(ang - this.pinch.a0);
        if (this.mode === "locked") {
          this.view = { ...this.view, widthKm, heading };
        } else {
          const next: View = { ...v0, widthKm, heading };
          const before = unproject(v0, this.vp, this.pinch.mid0[0], this.pinch.mid0[1]);
          const after = unproject(next, this.vp, mid[0], mid[1]);
          this.view = { ...next, center: add(next.center, sub(before, after)) };
        }
        this.needsRender = true;
        return;
      }
      const dr = this.drag;
      if (!dr) return;
      const dx = e.clientX - dr.x, dy = e.clientY - dr.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) dr.moved = true;
      if (!dr.moved) return;
      const now = performance.now();
      if (this.mode === "locked") {
        const ddx = e.clientX - dr.lastX, ddy = e.clientY - dr.lastY, dt = Math.max(1, now - dr.lastT);
        const k = 0.0055;
        this.view = { ...this.view, heading: this.view.heading + ddx * k, tilt: clamp(this.view.tilt - ddy * k, LOCK_TILT_MIN, LOCK_TILT_MAX) };
        dr.vh = 0.7 * dr.vh + 0.3 * ((ddx * k) / dt);
        dr.vt = 0.7 * dr.vt + 0.3 * ((-ddy * k) / dt);
      } else if (dr.rotate) {
        const v = dr.view;
        this.view = { ...this.view, heading: v.heading + dx * 0.005, tilt: clamp(v.tilt + dy * 0.005, 0, EXPLORE_TILT_MAX) };
      } else {
        const v = dr.view;
        const a = unproject(v, this.vp, dr.x - rect.left, dr.y - rect.top);
        const b = unproject(v, this.vp, e.clientX - rect.left, e.clientY - rect.top);
        this.view = { ...this.view, center: add(v.center, sub(a, b)) };
      }
      dr.lastX = e.clientX; dr.lastY = e.clientY; dr.lastT = now;
      this.needsRender = true;
    }, { signal });

    const end = (e: PointerEvent, cancelled: boolean) => {
      const rect = el.getBoundingClientRect();
      const dr = this.drag;
      this.pointers.delete(e.pointerId);
      if (this.pinch) {
        if (this.pointers.size < 2) {
          this.pinch = null;
          const rest = [...this.pointers.values()][0];
          if (rest) {
            this.startDrag(rest.x, rest.y, false);
            this.drag!.moved = true;
          }
        }
      } else if (dr) {
        if (!cancelled && !dr.moved && (e.pointerType !== "mouse" || e.button === 0)) {
          this.cb.onPick?.(this.hitTest(e.clientX - rect.left, e.clientY - rect.top));
        }
        if (this.mode === "locked" && dr.moved && !reducedMotion() && performance.now() - dr.lastT < 80 && Math.hypot(dr.vh, dr.vt) > 1e-4) {
          this.inertia = { vh: dr.vh, vt: dr.vt, t: performance.now() };
        }
        this.drag = null;
      }
      if (!this.pointers.size) {
        el.classList.remove("dragging");
        this.interaction(false);
      }
    };
    el.addEventListener("pointerup", (e) => end(e, false), { signal });
    el.addEventListener("pointercancel", (e) => end(e, true), { signal });
    el.addEventListener("contextmenu", (e) => e.preventDefault(), { signal });
    el.addEventListener("dblclick", (e) => {
      const rect = el.getBoundingClientRect();
      const [lo, hi] = this.widthLimits();
      const [cx, cy] = centerOf(this.vp);
      const cur = this.zoomAnim?.target ?? Math.log(this.view.widthKm);
      const locked = this.mode === "locked";
      this.zoomAnim = { target: clamp(cur + Math.log(e.shiftKey ? 2.5 : 0.4), Math.log(lo), Math.log(hi)), x: locked ? cx : e.clientX - rect.left, y: locked ? cy : e.clientY - rect.top };
      if (reducedMotion()) {
        this.view = zoomAround(this.view, this.vp, Math.exp(this.zoomAnim.target - Math.log(this.view.widthKm)), this.zoomAnim.x, this.zoomAnim.y);
        this.zoomAnim = null;
        this.needsRender = true;
      }
    }, { signal });
  }

  private startDrag(x: number, y: number, rotate: boolean) {
    this.drag = { x, y, moved: false, rotate, view: { ...this.view }, lastX: x, lastY: y, lastT: performance.now(), vh: 0, vt: 0 };
  }

  private hitTest(x: number, y: number, includeStars = true): PickTarget | null {
    if (this.universe > 0.5) {
      let best: { id: string; d: number } | null = null;
      for (const p of this.universePts) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < 10 && (!best || d < best.d)) best = { id: p.id, d };
      }
      return best ? { kind: "object", id: best.id } : null;
    }
    let best: { id: string; d: number; pri: number } | null = null;
    for (const r of this.renderables) {
      if (!r.visible) continue;
      const d = Math.hypot(r.sx - x, r.sy - y);
      const radius = Math.max(r.rPx, 5) + 5;
      if (d <= radius && (!best || d - r.obj.display.priority * 0.05 < best.d - best.pri * 0.05)) best = { id: r.obj.id, d, pri: r.obj.display.priority };
    }
    if (best) return { kind: "object", id: best.id };
    if (!includeStars) return null;
    const proj = makeProjector(this.view, this.vp);
    const fade = this.starMat.uniforms.uFade.value as number;
    if (fade < 0.2 || !this.stars.visible) return null;
    const limit = this.starMat.uniforms.uLimit.value as number;
    const { stars, starStride } = this.data;
    let bestStar = -1, bestD = 7;
    const p: Vec3 = [0, 0, 0];
    for (let i = 0; i < stars.length / starStride; i++) {
      const o = i * starStride;
      if (limit - stars[o + 3] < 0.6) continue;
      p[0] = stars[o] * PC_KM; p[1] = stars[o + 1] * PC_KM; p[2] = stars[o + 2] * PC_KM;
      const s = proj.project(p);
      const d = Math.hypot(s[0] - x, s[1] - y);
      if (d < bestD) { bestD = d; bestStar = i; }
    }
    return bestStar >= 0 ? { kind: "star", index: bestStar } : null;
  }

  // ---------------------------------------------------------------- frame
  private applyViewport() {
    const w = this.vp.width, h = this.vp.height;
    const uw = Math.max(80, w - this.insets.left - this.insets.right), uh = Math.max(80, h - this.insets.top - this.insets.bottom);
    this.vp = { width: w, height: h, cx: this.insets.left + uw / 2, cy: this.insets.top + uh / 2 };
    this.needsRender = true;
  }

  private resize() {
    const rect = this.container.getBoundingClientRect();
    this.vp = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    this.applyViewport();
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
    if (this.paused) return;
    const now = performance.now();
    const dt = Math.min(64, now - this.lastFrameT);
    this.lastFrameT = now;
    let animating = false;
    const lockedPos = this.mode === "locked" && this.lockedId ? this.byId.get(this.lockedId)?.pos ?? null : null;
    if (this.flight) {
      const f = this.flight;
      const t = Math.min(1, (now - f.start) / f.duration);
      const e = easeInOut(t);
      const s = f.path.at(e);
      if (Number.isFinite(s.widthKm) && s.center.every(Number.isFinite)) {
        let center = s.center;
        // A moving target (Play time) keeps drifting during the flight; blend in its displacement.
        const fp = f.follow ? this.byId.get(f.follow.id)?.pos : null;
        if (f.follow && fp) center = add(center, scale(sub(fp, f.follow.at0), e));
        this.view = { center, widthKm: s.widthKm, tilt: f.tilt0 + (f.tilt1 - f.tilt0) * e, heading: f.heading0 + (f.heading1 - f.heading0) * e };
      } else this.flight = null;
      if (t >= 1) this.flight = null;
      animating = true;
    } else {
      if (this.zoomAnim) {
        const [lo, hi] = this.widthLimits();
        this.zoomAnim.target = clamp(this.zoomAnim.target, Math.log(lo), Math.log(hi));
        const cur = Math.log(this.view.widthKm);
        const diff = this.zoomAnim.target - cur;
        const step = Math.abs(diff) < 0.002 ? diff : diff * 0.22;
        this.view = zoomAround(this.view, this.vp, Math.exp(step), this.zoomAnim.x, this.zoomAnim.y);
        if (step === diff) this.zoomAnim = null;
        animating = true;
      }
      if (this.inertia) {
        const decay = Math.exp(-dt / 260);
        this.view = { ...this.view, heading: this.view.heading + this.inertia.vh * dt, tilt: clamp(this.view.tilt + this.inertia.vt * dt, LOCK_TILT_MIN, LOCK_TILT_MAX) };
        this.inertia.vh *= decay; this.inertia.vt *= decay;
        if (Math.hypot(this.inertia.vh, this.inertia.vt) < 2e-6) this.inertia = null;
        animating = true;
      }
      if (this.autoOrbit && this.mode === "locked" && !this.drag && !this.pinch && !this.inertia && !reducedMotion()) {
        this.view = { ...this.view, heading: this.view.heading + dt * 0.00012 };
        animating = true;
      }
      if (lockedPos) this.view = { ...this.view, center: lockedPos };
    }
    const craft = this.travel ? this.playbackPosition() : null;
    if (this.travel && craft) {
      const p = this.playback ?? 0, t = this.travel;
      const smooth = (x: number) => x * x * (3 - 2 * x);
      const lw = Math.log(t.w0) + (Math.log(t.w1) - Math.log(t.w0)) * smooth(p) + (Math.log(t.wMid) - Math.max(Math.log(t.w0), Math.log(t.w1))) * Math.sin(Math.PI * p);
      const b = smooth(clamp(p / 0.12, 0, 1));
      this.view = { ...this.view, center: lerp(t.c0, craft, b), widthKm: Math.exp(Math.log(t.wStart) + (lw - Math.log(t.wStart)) * b) };
      animating = true;
    }
    const [lo, hi] = this.widthLimits();
    if (this.travel) this.view.widthKm = clamp(this.view.widthKm, MIN_WIDTH_KM * 0.05, MAX_WIDTH_KM);
    else if (!this.flight) this.view.widthKm = clamp(this.view.widthKm, lo, hi);
    else this.view.widthKm = clamp(this.view.widthKm, MIN_WIDTH_KM * 0.05, MAX_WIDTH_KM);
    if (!animating && !this.needsRender && !this.drag && !this.pinch) return;
    this.frame();
    if (now - this.lastInfo > 60 || !animating) {
      this.lastInfo = now;
      this.cb.onViewChange?.(this.info());
    }
  };

  private background: ViewInfo["background"] = "none";

  info(): ViewInfo {
    const lockedR = this.mode === "locked" && this.lockedId ? this.byId.get(this.lockedId) : undefined;
    const sprite = lockedR?.sprite;
    const g = lockedR?.galaxy?.group.visible ? lockedR.galaxy : null;
    const morphology = lockedR?.obj.display.morphology;
    return {
      galaxyModel: g ? `${GALAXY_KIND_LABEL[g.params.kind]}${morphology ? ` · ${morphology}` : " · morphology not catalogued"}` : null,
      view: this.view, kmPerPx: this.view.widthKm / this.vp.width, plane: planeName(this.view.widthKm), vp: this.vp,
      mode: this.mode, lockedId: this.lockedId, universe: this.universe, background: this.background,
      projectedImage: sprite?.visible ? sprite.userData.projectedImage ?? null : null,
      illustrativeBody: this.mode === "locked" && this.inspectionSphere.visible,
      schematicObject: !!sprite?.visible && !sprite.userData.projectedImage,
    };
  }

  private frame() {
    const proj = makeProjector(this.view, this.vp);
    const atlas = this.layer === "atlas";
    const W = this.view.widthKm;
    const locked = this.mode === "locked" && !!this.lockedId;
    this.svgUsed.clear();
    const [cx, cy] = centerOf(this.vp);
    const u = universeBlend(W);
    this.universe = u;
    const linear = 1 - u;

    // Stars (catalog point cloud): dimmer while inspecting a locked object.
    const widthPc = W / PC_KM;
    const m = proj.m;
    (this.starMat.uniforms.uM.value as THREE.Matrix3).set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]);
    const c = this.view.center;
    (this.starMat.uniforms.uCenter.value as THREE.Vector3).set(c[0] / PC_KM, c[1] / PC_KM, c[2] / PC_KM);
    (this.starMat.uniforms.uOffset.value as THREE.Vector2).set(cx - this.vp.width / 2, this.vp.height / 2 - cy);
    this.starMat.uniforms.uPxPerPc.value = proj.k * PC_KM;
    // Keep the number of stars per screen area roughly constant: small screens get a brighter limit.
    const areaTerm = clamp(1.1 * Math.log10((this.vp.width * this.vp.height) / (1440 * 900)), -1, 0.5);
    this.starMat.uniforms.uLimit.value = Math.max(-3, Math.min(15.5, 13.6 - 4.6 * Math.log10(Math.max(widthPc, 1e-6) / 4) + areaTerm));
    const starFade = clamp(Math.log10(widthPc / 0.3) / 1.2, 0, 1);
    const farFade = 1 - clamp(Math.log10(widthPc / 30_000) / 0.8, 0, 1);
    const starAlpha = starFade * farFade * (atlas ? 0.9 : 1) * (locked ? 0.55 : 1);
    this.starMat.uniforms.uFade.value = starAlpha;
    this.starMat.uniforms.uDpr.value = this.dpr;
    this.stars.visible = starAlpha > 0.01;

    // Sky panorama: the sky as seen from Earth, appropriate at Solar System scales. Around a
    // locked extragalactic object it is shown faintly as an illustrative backdrop.
    const solarSky = 1 - clamp(Math.log10(widthPc / 0.05) / 1.2, 0, 1);
    const lockedObj = locked ? this.data.byId.get(this.lockedId!) : undefined;
    const backdrop = lockedObj && lockedObj.region !== "solar-system" && lockedObj.region !== "stellar-neighborhood" ? 0.35 : 0;
    const skyOpacity = atlas ? 0 : Math.max(solarSky, backdrop) * linear;
    this.background = u > 0.5 ? "universe" : skyOpacity > 0.05 ? "sky-panorama" : starAlpha > 0.05 ? "catalog-stars" : widthPc > 600 ? "milky-way" : "none";

    // Milky Way illustration
    const mwFade = clamp(Math.log10(widthPc / 600) / 0.9, 0, 1) * linear;
    const gc = galactocentricToIcrf(0, 0);
    const s = proj.project(gc);
    // The orthographic map has no camera position. While inspecting another galaxy the viewer is
    // nominally a few view-widths in front of it, so our own galaxy, which lies on the Sun-facing
    // line of sight, is behind the viewer and must not be drawn over the target.
    const mwBehindViewer = locked && s[2] > this.vp.width * 2;
    this.milkyWay.visible = mwFade > 0.01 && !mwBehindViewer;
    if (this.milkyWay.visible) {
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

    // Lighting: a point light at the Sun. Its direction is exact; distant positions are scaled down
    // to stay within float range (direction preserved for every on-screen body).
    const sun = this.byId.get("sun")!;
    const sunPos = sun.pos!;
    const sunS = proj.project(sunPos);
    const sunRpx = Math.max(695_700 * proj.k, 5);
    const L = new THREE.Vector3(sunS[0] - this.vp.width / 2, this.vp.height / 2 - sunS[1], sunS[2]);
    if (L.length() > 1e8) L.setLength(1e8);
    this.sunLight.position.copy(L);
    this.ambient.intensity = atlas ? 1.2 : 0.05;

    const transfer = this.route?.transfer;
    const routeIds = new Set(this.route?.ids ?? []);
    const labelCands: LabelCandidate[] = [];
    this.inspectionSphere.visible = false;
    const lockedChildren = new Set<string>();
    if (locked) for (const o of this.data.catalog.objects) if (o.parentId === this.lockedId) lockedChildren.add(o.id);

    for (const r of this.renderables) {
      r.visible = false;
      if (r.mesh) r.mesh.visible = false;
      if (r.glow) r.glow.visible = false;
      if (r.sprite) r.sprite.visible = false;
      if (r.galaxy) r.galaxy.group.visible = false;
      if (r.orbit) r.orbit.line.visible = false;
      if (!r.pos || u > 0.98) continue;
      const o = r.obj;
      const s = proj.project(r.pos);
      r.sx = s[0]; r.sy = s[1]; r.depth = s[2];
      const onScreen = s[0] > -400 && s[0] < this.vp.width + 400 && s[1] > -400 && s[1] < this.vp.height + 400;
      const isSel = o.id === this.selectedId, inRoute = routeIds.has(o.id), isLocked = o.id === this.lockedId;
      const solar = o.region === "solar-system";
      const emph = this.emphasis ? this.emphasis.has(o.id) : null;

      // Orbit lines (drawn even if the body itself is off screen). While locked, only the
      // locked body's moons keep faint orbits.
      if (r.orbit && !transfer && (!locked || lockedChildren.has(o.id))) {
        const aPx = r.orbit.aKm * proj.k;
        const parent = r.orbit.parent ? this.byId.get(r.orbit.parent)?.pos : sunPos;
        const show = aPx > 14 && aPx < 40_000 && parent && (o.featured || isSel) && (o.display.priority >= 40 || isSel || aPx > 60);
        if (show) {
          const arr = (r.orbit.line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
          for (let i = 0; i < r.orbit.pts.length; i++) {
            const q = r.orbit.pts[i];
            const ps = proj.project([parent![0] + q[0], parent![1] + q[1], parent![2] + q[2]]);
            arr[i * 3] = ps[0] - this.vp.width / 2; arr[i * 3 + 1] = this.vp.height / 2 - ps[1]; arr[i * 3 + 2] = 0;
          }
          r.orbit.line.geometry.attributes.position.needsUpdate = true;
          const fadeIn = Math.min(1, (aPx - 14) / 40), fadeOut = Math.min(1, (40_000 - aPx) / 15_000);
          const base = o.type === "planet" ? 0.3 : o.type === "moon" ? 0.2 : o.type === "dwarf-planet" ? 0.14 : 0.08;
          const mat = r.orbit.line.material as THREE.LineBasicMaterial;
          mat.opacity = (isSel && !locked ? 0.85 : atlas ? base * 2 : base) * fadeIn * fadeOut * (locked ? 0.5 : 1) * (emph === false ? 0.3 : 1);
          mat.color.set(isSel && !locked ? ROUTE_BLUE : atlas ? 0x8794aa : 0xa9c1ff);
          r.orbit.line.visible = true;
        }
      }
      if (!onScreen) continue;

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
            if (sep < pr + rPx + (o.type === "moon" ? 6 : 8)) visible = isSel || inRoute || isLocked ? sep > 1.5 : false;
          }
          if (o.type === "spacecraft" && o.id === "jwst") {
            const e = this.byId.get("earth")!;
            const es = proj.project(e.pos!);
            if (Math.hypot(es[0] - s[0], es[1] - s[1]) < 10) visible = isSel || inRoute;
          }
          // Small bodies only appear when relevant to keep the system view readable.
          if ((o.type === "asteroid" || o.type === "comet") && !isSel && !inRoute && !emph && o.display.priority < 40 && W > 12 * AU_KM) visible = false;
        }
        if (transfer && (o.id === transfer.originId || o.id === transfer.targetId)) visible = false;
      } else {
        if (Math.hypot(s[0] - sunS[0], s[1] - sunS[1]) < 6 && !isSel && !isLocked) visible = false;
        if (o.type === "exoplanet" && !isSel && !isLocked) visible = false;
        if (!o.featured && !isSel && !inRoute && !emph) visible = visible && widthPc < 400 && widthPc > 0.5;
        // Internal features of a galaxy appear once the galaxy fills a good part of the screen.
        const parent = o.parentId ? this.byId.get(o.parentId) : undefined;
        if (parent?.pos && parent.obj.display.extentKm) {
          const parentPx = parent.obj.display.extentKm * proj.k;
          if ((o.relation === "feature" || o.relation === "nucleus" || o.relation === "member") && parent.obj.type === "galaxy" && parentPx < 140 && !isSel && !inRoute && !isLocked) visible = false;
          if (o.relation === "satellite" && !isSel && !isLocked) {
            const ps = proj.project(parent.pos);
            if (Math.hypot(ps[0] - s[0], ps[1] - s[1]) < 9) visible = false;
          }
        }
        rPx = o.display.extentKm ? Math.max(o.display.extentKm * proj.k * 0.5, 6) : 3;
      }
      const syntheticScale = (this.lockHome?.widthKm ?? W) / W;
      if (isLocked && !r.mesh && SPHERICAL_TYPES.has(o.type)) {
        rPx = Math.max(rPx, clamp(this.usable().min * 0.43 * syntheticScale, 4, this.usable().min * 4));
      }
      r.visible = visible;
      r.rPx = rPx;
      if (!visible) continue;
      const dim = (emph === false ? 0.3 : 1) * linear;

      // Meshes
      if (r.mesh && !atlas && !(o.id === "sun" && widthPc > 5000)) this.placeSphere(r, proj, rPx);
      else if (isLocked && SPHERICAL_TYPES.has(o.type) && !atlas) this.placeInspectionSphere(r, rPx);
      if (r.glow && o.id === "sun" && !atlas && widthPc < 5000) {
        const gs = Math.max(rPx * 5, 34);
        r.glow.scale.set(gs, gs, 1);
        r.glow.position.set(s[0] - this.vp.width / 2, this.vp.height / 2 - s[1], 0);
        r.glow.visible = true;
      }

      // Extended objects: schematic sprite on the sky plane once large enough, else a symbol.
      let extPx = (o.display.extentKm ?? 0) * proj.k;
      if (isLocked && EXTENDED_TYPES.has(o.type) && extPx <= 0) {
        extPx = clamp(this.usable().min * 0.86 * syntheticScale, 8, this.usable().min * 8);
        r.rPx = extPx / 2;
      }
      let drewSprite = false;
      if (!solar && extPx > 7 && !atlas) {
        const sp = this.spriteFor(r);
        if (sp) {
          const fade = dim * (locked && !isLocked ? 0.5 : 1);
          const blend = o.type === "galaxy" || o.type === "quasar" ? particleBlend(extPx) : 0;
          this.placeSkySprite(sp, r, proj, extPx);
          (sp.material as THREE.MeshBasicMaterial).opacity = clamp((extPx - 7) / 18, 0, 1) * (o.type === "galaxy" ? 0.95 : 0.8) * fade * (1 - blend);
          sp.visible = true;
          drewSprite = extPx > 16;
          if (blend > 0) this.placeGalaxy(this.galaxyFor(r), r, proj, extPx, blend * fade);
        }
      }

      // SVG symbols
      const symbolOpacity = dim * (locked && !isLocked && !lockedChildren.has(o.id) ? 0.45 : 1);
      if (atlas) {
        if (solar) {
          this.svgCircle(`sym-${o.id}`, s[0], s[1], rPx, o.display.color, "#ffffff", o.type === "spacecraft" ? 1.2 : 1.5, symbolOpacity);
        } else if (o.display.extentKm && extPx > 7) {
          const rx = Math.max(extPx * 0.5, 6);
          this.svgEllipse(`sym-${o.id}`, s[0], s[1], rx, rx * (o.display.axisRatio ?? 1), o.display.color, 0.3 * symbolOpacity);
        } else if (MAP_GLYPH[o.type]) {
          this.svgGlyph(`sym-${o.id}`, o.type, s[0], s[1], 16, "#33415a", symbolOpacity);
        } else if (o.featured) {
          this.svgCircle(`sym-${o.id}`, s[0], s[1], 3, "#3b4a63", "#ffffff", 1, symbolOpacity);
        }
      } else if (!drewSprite) {
        if (MAP_GLYPH[o.type] && !solar) {
          this.svgGlyph(`sym-${o.id}`, o.type, s[0], s[1], 16, o.type === "black-hole" ? "#ffb36b" : o.display.color, symbolOpacity);
        } else if ((o.type === "asteroid" || o.type === "comet") && solar && rPx < 4) {
          this.svgGlyph(`sym-${o.id}`, o.type, s[0], s[1], 12, "#cbb89a", symbolOpacity);
        } else if (o.type === "spacecraft") {
          this.svgCircle(`sym-${o.id}`, s[0], s[1], 3.2, "#f2c94c", "#1b1f2a", 1, symbolOpacity);
        } else if (!solar && o.display.extentKm) {
          this.svgCircle(`sym-${o.id}`, s[0], s[1], 3.2, "none", o.display.color, 1.4, 0.9 * symbolOpacity);
        } else if (!solar && (o.featured || isSel || inRoute || emph) && !o.hygId) {
          this.svgCircle(`sym-${o.id}`, s[0], s[1], 2.4, o.display.color, "none", 0, 0.95 * symbolOpacity);
        } else if (!solar && o.hygId && (o.featured || emph)) {
          this.svgCircle(`sym-${o.id}`, s[0], s[1], 2.2, o.display.color, "none", 0, 0.9 * symbolOpacity);
        }
      }

      // Labels: locked inspection keeps the locked object, its moons, route stops and hover.
      if (u > 0.35) continue;
      if (locked && !isLocked && !lockedChildren.has(o.id) && !inRoute && o.id !== this.hoverId) continue;
      // A shown route keeps its endpoints and major neighbours readable; minor bodies keep markers only.
      if (this.route && !inRoute && !isSel && o.id !== this.hoverId && (o.type === "asteroid" || o.type === "comet" || o.type === "spacecraft" || o.type === "mission")) continue;
      let pri = o.display.priority;
      if (solar && W < 200 * AU_KM) pri += 25;
      if (!solar && W > 50_000 * PC_KM && o.region !== "local-group" && o.region !== "local-volume") pri -= 40;
      if (o.hygId && !o.featured) pri -= 15;
      if (emph === true) pri += 30;
      if (emph === false) pri -= 40;
      if (o.id === "sagittarius-a-star" && widthPc > 30_000) continue;
      if (solar && widthPc > 2 && !isSel && !inRoute) continue;
      if (o.hygId && !o.featured && !isSel && !emph && pri < 8 && widthPc > 20) continue;
      let labelName = o.name;
      if (o.id === "milky-way") {
        labelName = this.milkyWay.visible ? `${o.name} (reconstruction)` : o.name;
        this.setLabelText(o.id, labelName);
      } else {
        if (isLocked && drewSprite && !r.sprite?.userData.projectedImage) labelName += " (schematic)";
        this.setLabelText(o.id, labelName);
      }
      labelCands.push({ id: o.id, x: s[0], y: s[1], width: this.textWidth(labelName), height: 16, priority: pri, offset: Math.min(rPx, 400) + 6, force: isSel || inRoute || isLocked || o.id === this.hoverId || (o.id === "earth" && solar && W < 60 * AU_KM) });
    }

    // Milky Way and spiral-arm labels
    if (this.milkyWay.visible && u < 0.35 && !locked) {
      if (widthPc > 30_000 && !this.byId.get("milky-way")?.visible) {
        const s = proj.project(galactocentricToIcrf(0, 0));
        labelCands.push({ id: "__mw", x: s[0], y: s[1], width: this.textWidth("Milky Way (reconstruction)"), height: 16, priority: 99, offset: 8 });
      }
      if (atlas && widthPc > 4000 && widthPc < 120_000) {
        for (const a of this.armAnchors) {
          const s = proj.project(a.pos);
          labelCands.push({ id: `__arm-${a.name}`, x: s[0], y: s[1], width: this.textWidth(a.name), height: 16, priority: 20, offset: 0, fixed: true });
        }
      }
    }
    // "You are here": at Earth on Solar System scales, at the Sun (the Solar System) beyond.
    if (!locked && u < 0.35) {
      const earth = this.byId.get("earth");
      if (W < 2 * LY_KM && W > 0.02 * AU_KM && earth?.pos) {
        const es = proj.project(earth.pos);
        this.setLabelText("__here", "You are here");
        labelCands.push({ id: "__here", x: es[0], y: es[1], width: this.textWidth("You are here") + 14, height: 20, priority: 200, offset: 8, force: W < 60 * AU_KM });
      } else if (W >= 2 * LY_KM && widthPc < 400_000) {
        const t = "You are here (Solar System)";
        this.setLabelText("__here", t);
        labelCands.push({ id: "__here", x: sunS[0], y: sunS[1], width: this.textWidth(t), height: 16, priority: 120, offset: 8 });
      }
    }

    if (!locked && u < 0.5) this.drawDistanceRings(proj, sunS, atlas, linear);
    if (transfer) this.drawTransfer(proj, transfer);
    else this.drawRoute(proj);
    if (u < 0.5) this.drawSelection(proj);
    this.universePts = [];
    const blocked: [number, number, number, number][] = [];
    if (u > 0.01) this.drawUniverse(proj, u, labelCands, blocked);

    for (const [id, el] of this.svgPool) if (!this.svgUsed.has(id)) el.setAttribute("display", "none");

    const ins = this.insets;
    this.placeLabels(declutter(labelCands, this.vp.width, this.vp.height, locked ? 24 : 55, blocked, [ins.left, ins.top, this.vp.width - ins.right, this.vp.height - ins.bottom]));

    this.renderer.clear();
    if (skyOpacity > 0.01 && this.sky.loaded) {
      this.sky.update(m, this.vp.width / this.vp.height, skyOpacity * 0.22);
      this.renderer.render(this.sky.scene, this.sky.camera);
    }
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
    // Prime meridian from the IAU rotation model (bodies without one are not spun).
    const W = primeMeridian(o.id, this.jd);
    const east = cross(pole, node);
    const prime: Vec3 = add(lerp([0, 0, 0], node, Math.cos(W)), lerp([0, 0, 0], east, Math.sin(W)));
    const east90 = cross(pole, prime);
    const X = mulMatVec(m, prime), Y = mulMatVec(m, pole), Z = mulMatVec(m, east90).map((v) => -v) as Vec3;
    const toThree = (v: Vec3) => new THREE.Vector3(v[0], v[1], v[2]);
    const mat4 = new THREE.Matrix4().makeBasis(toThree(X), toThree(Y), toThree(Z));
    mat4.scale(new THREE.Vector3(rPx, rPx, rPx));
    mat4.setPosition(r.sx - this.vp.width / 2, this.vp.height / 2 - r.sy, clamp(r.depth, -5e6, 5e6));
    r.mesh!.matrix.copy(mat4);
    r.mesh!.matrixWorldNeedsUpdate = true;
    r.mesh!.visible = true;
    const truePx = (o.radiusKm ?? 1) * proj.k;
    // Enlarged symbols get self-illumination so they stay legible; true-scale spheres show real phases.
    const boost = Math.min(1, Math.max(0, (30 - truePx) / 27));
    const surface = (r.mesh!.children[0] as THREE.Mesh).material;
    if (o.id === "earth" && this.earthMats) {
      const sun = this.byId.get("sun")!.pos!;
      const d = normalize(mulMatVec(m, sub(sun, r.pos!)));
      (this.earthMats.surface.uniforms.uSunDir.value as THREE.Vector3).set(d[0], d[1], d[2]);
      this.earthMats.surface.uniforms.uBoost.value = 0.55 * boost;
      this.earthMats.halo.uniforms.uOpacity.value = 1 - boost;
    } else if (surface instanceof THREE.MeshLambertMaterial) {
      surface.emissiveIntensity = 0.04 + 0.6 * boost;
    }
  }

  /** Shaded illustration for spherical bodies without a dedicated textured body mesh. */
  private placeInspectionSphere(r: Renderable, rPx: number) {
    const color = new THREE.Color(r.obj.display.color);
    const material = this.inspectionSphere.material as THREE.MeshLambertMaterial;
    material.color.copy(color);
    material.emissive.copy(color);
    const matrix = new THREE.Matrix4().makeScale(rPx, rPx, rPx);
    matrix.setPosition(r.sx - this.vp.width / 2, this.vp.height / 2 - r.sy, clamp(r.depth, -5e6, 5e6));
    this.inspectionSphere.matrix.copy(matrix);
    this.inspectionSphere.matrixWorldNeedsUpdate = true;
    this.inspectionSphere.visible = true;
  }

  /**
   * Orient a schematic sprite. Disc galaxies use a major axis along the observed
   * position angle, inclined so that seen from the Sun the disc has the catalogued axis ratio
   * (cos i = b/a; which side is nearer is unknown). Other extended objects face the camera;
   * an elliptical galaxy's axis ratio does not establish a disc inclination.
   */
  private placeSkySprite(sp: THREE.Mesh, r: Renderable, proj: Projector, extPx: number) {
    const o = r.obj;
    const observedAspect = Number(sp.userData.observedAspect);
    if (Number.isFinite(observedAspect) && observedAspect > 0) {
      const mat4 = new THREE.Matrix4().makeScale(extPx, extPx / observedAspect, 1);
      mat4.setPosition(r.sx - this.vp.width / 2, this.vp.height / 2 - r.sy, 0);
      sp.matrix.copy(mat4);
      sp.matrixWorldNeedsUpdate = true;
      return;
    }
    const q = o.display.axisRatio ?? 1;
    let X: Vec3 = [1, 0, 0], Y: Vec3 = [0, clamp(q, 0.12, 1), 0], Z: Vec3 = [0, 0, 1];
    if (o.type === "galaxy" || o.type === "quasar") {
      const frame = this.galaxyFrame(o, r.pos!, proj);
      if (frame.disc) [X, Y, Z] = frame.axes;
      else {
        // Ellipsoids and irregulars face the camera, with the major axis along the position angle.
        const s = Math.hypot(frame.axes[0][0], frame.axes[0][1]) || 1;
        const mx = frame.axes[0][0] / s, my = frame.axes[0][1] / s, b = clamp(q, 0.12, 1);
        X = [mx, my, 0]; Y = [-my * b, mx * b, 0];
      }
    }
    const mat4 = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(X[0] * extPx, X[1] * extPx, X[2] * extPx),
      new THREE.Vector3(Y[0] * extPx, Y[1] * extPx, Y[2] * extPx),
      new THREE.Vector3(Z[0], Z[1], Z[2]),
    );
    mat4.setPosition(r.sx - this.vp.width / 2, this.vp.height / 2 - r.sy, 0);
    sp.matrix.copy(mat4);
    sp.matrixWorldNeedsUpdate = true;
  }

  /**
   * World-fixed galaxy axes in view space. Disc galaxies: major axis along the observed position
   * angle, inclined so that from the Sun the disc shows the catalogued axis ratio (cos i = b/a;
   * which side is nearer is unknown). Other galaxies: major, minor and line-of-sight axes.
   */
  private galaxyFrame(o: CatalogObject, pos: Vec3, proj: Projector): { disc: boolean; axes: [Vec3, Vec3, Vec3] } {
    const los = normalize(pos);
    let east = cross([0, 0, 1], los);
    if (length(east) < 1e-9) east = [1, 0, 0];
    east = normalize(east);
    const north = cross(los, east);
    const pa = ((o.display.positionAngle ?? 0) * Math.PI) / 180;
    const major = add(scale(north, Math.cos(pa)), scale(east, Math.sin(pa)));
    const minor = cross(los, major);
    const kind = galaxyKind(o);
    if (o.type === "galaxy" && (kind === "spiral" || kind === "barred" || kind === "lenticular")) {
      const cosI = clamp(o.display.axisRatio ?? 1, 0.12, 1);
      const inPlane = add(scale(minor, cosI), scale(los, Math.sqrt(1 - cosI * cosI)));
      return { disc: true, axes: [mulMatVec(proj.m, major), mulMatVec(proj.m, inPlane), mulMatVec(proj.m, normalize(cross(major, inPlane)))] };
    }
    return { disc: false, axes: [mulMatVec(proj.m, major), mulMatVec(proj.m, minor), mulMatVec(proj.m, los)] };
  }

  /** Particle galaxy in the same world-fixed frame as its sprite, with thickness along the normal. */
  private placeGalaxy(g: GalaxyLod, r: Renderable, proj: Projector, extPx: number, opacity: number) {
    const { axes } = this.galaxyFrame(r.obj, r.pos!, proj);
    const [X, Y, Z] = axes.map((a) => new THREE.Vector3(a[0] * extPx, a[1] * extPx, a[2] * extPx));
    g.group.matrix.makeBasis(X, Y, Z).setPosition(r.sx - this.vp.width / 2, this.vp.height / 2 - r.sy, 0);
    g.group.matrixWorldNeedsUpdate = true;
    const n = particleBudget(extPx, g.max);
    // Fewer particles at distance: each carries proportionally more light.
    const gain = Math.sqrt(g.max / n) * 0.7;
    const uScale = (extPx / 1000) * this.dpr;
    g.light.geometry.setDrawRange(0, n);
    const lm = g.light.material as THREE.ShaderMaterial;
    lm.uniforms.uScale.value = uScale;
    lm.uniforms.uStarScale.value = Math.min(uScale, 1.1 * this.dpr);
    lm.uniforms.uOpacity.value = opacity * gain;
    if (g.dust) {
      const dm = g.dust.material as THREE.ShaderMaterial;
      dm.uniforms.uScale.value = dm.uniforms.uStarScale.value = uScale;
      dm.uniforms.uOpacity.value = opacity;
    }
    g.group.visible = true;
  }

  // ---------------------------------------------------------------- SVG helpers
  private svgEl<K extends keyof SVGElementTagNameMap>(id: string, tag: K, layer = 0): SVGElementTagNameMap[K] {
    let el = this.svgPool.get(id) as SVGElementTagNameMap[K] | undefined;
    if (!el) {
      el = document.createElementNS(SVGNS, tag) as SVGElementTagNameMap[K];
      el.dataset.layer = String(layer);
      const after = [...this.svg.children].find((c) => c.tagName !== "defs" && Number((c as SVGElement).dataset.layer) > layer);
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
    el.setAttribute("fill", fill); el.setAttribute("stroke", stroke); el.setAttribute("stroke-width", String(sw)); el.setAttribute("opacity", opacity.toFixed(3));
  }

  private svgEllipse(id: string, x: number, y: number, rx: number, ry: number, color: string, fillOpacity: number) {
    const el = this.svgEl(id, "ellipse", 1);
    el.setAttribute("cx", x.toFixed(1)); el.setAttribute("cy", y.toFixed(1)); el.setAttribute("rx", rx.toFixed(1)); el.setAttribute("ry", ry.toFixed(1));
    el.setAttribute("fill", color); el.setAttribute("fill-opacity", String(fillOpacity)); el.setAttribute("stroke", color); el.setAttribute("stroke-width", "1.2");
    el.removeAttribute("transform");
  }

  private svgGlyph(id: string, type: CatalogObject["type"], x: number, y: number, size: number, color: string, opacity: number) {
    const g = MAP_GLYPH[type];
    if (!g) return;
    const el = this.svgEl(id, "path", 1);
    const k = size / 24;
    el.setAttribute("d", g.d);
    el.setAttribute("transform", `translate(${(x - 12 * k).toFixed(1)},${(y - 12 * k).toFixed(1)}) scale(${k.toFixed(3)})`);
    el.setAttribute("fill", g.fill ? color : "none");
    el.setAttribute("fill-opacity", g.fill ? "0.85" : "0");
    el.setAttribute("stroke", color);
    el.setAttribute("stroke-width", (1.6 / k).toFixed(2));
    el.setAttribute("vector-effect", "non-scaling-stroke");
    el.setAttribute("opacity", opacity.toFixed(3));
  }

  private svgPath(id: string, d: string, stroke: string, width: number, opts: { opacity?: number; dash?: string; fill?: string; layer?: number; linecap?: string } = {}) {
    const el = this.svgEl(id, "path", opts.layer ?? 2);
    el.setAttribute("d", d); el.setAttribute("stroke", stroke); el.setAttribute("stroke-width", String(width));
    el.setAttribute("fill", opts.fill ?? "none"); el.setAttribute("opacity", String(opts.opacity ?? 1));
    el.setAttribute("stroke-linecap", opts.linecap ?? "round"); el.setAttribute("stroke-linejoin", "round");
    el.removeAttribute("transform");
    if (opts.dash) el.setAttribute("stroke-dasharray", opts.dash); else el.removeAttribute("stroke-dasharray");
  }

  private svgText(id: string, x: number, y: number, text: string, cls: string, opacity = 1, anchor = "start") {
    const el = this.svgEl(id, "text", 3);
    el.setAttribute("x", x.toFixed(1)); el.setAttribute("y", y.toFixed(1)); el.setAttribute("class", cls);
    el.setAttribute("opacity", opacity.toFixed(3)); el.setAttribute("text-anchor", anchor);
    if (el.textContent !== text) el.textContent = text;
  }

  private drawDistanceRings(proj: Projector, sunS: [number, number, number], atlas: boolean, alpha: number) {
    const rings: { km: number; label: string }[] = [];
    for (const au of [0.1, 1, 10, 100, 1000, 10_000]) rings.push({ km: au * AU_KM, label: `${au.toLocaleString()} AU from the Sun` });
    for (const ly of [1, 10, 100, 1000, 10_000, 100_000, 1e6, 1e7, 1e8]) rings.push({ km: ly * LY_KM, label: `${ly >= 1e6 ? `${ly / 1e6} million` : ly.toLocaleString()} light-year${ly === 1 ? "" : "s"} from the Sun` });
    const cosT = Math.cos(this.view.tilt);
    for (const ring of rings) {
      const r = ring.km * proj.k;
      const id = `ring-${ring.km}`;
      if (r < 70 || r > Math.max(this.vp.width, this.vp.height) * 1.6) continue;
      const el = this.svgEl(id, "ellipse", 0);
      el.setAttribute("cx", sunS[0].toFixed(1)); el.setAttribute("cy", sunS[1].toFixed(1));
      el.setAttribute("rx", r.toFixed(1)); el.setAttribute("ry", Math.abs(r * cosT).toFixed(1));
      el.setAttribute("fill", "none");
      el.setAttribute("stroke", atlas ? "#c3cad6" : "#ffffff");
      el.setAttribute("stroke-opacity", String((atlas ? 0.9 : 0.09) * alpha));
      el.setAttribute("stroke-dasharray", "2 5");
      this.svgText(`ringl-${ring.km}`, sunS[0] + 4, sunS[1] - Math.abs(r * cosT) - 4, ring.label, "ring-label", alpha);
    }
  }

  private drawRoute(proj: Projector) {
    if (!this.route || this.route.positions.length < 2) return;
    const pts = this.route.positions.map((p) => proj.project(p));
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const atlas = this.layer === "atlas";
    this.svgPath("route-casing", d, atlas ? "#ffffff" : "#0b1220", 7, { opacity: atlas ? 1 : 0.6 });
    this.svgPath("route-line", d, ROUTE_BLUE, 3.5);
    pts.forEach((p, i) => {
      const last = i === pts.length - 1;
      if (i === 0) this.svgCircle(`route-start`, p[0], p[1], 6, "#ffffff", "#1d2433", 2.5, 1, 4);
      else if (last) this.routePin(p);
      else this.svgCircle(`route-stop-${i}`, p[0], p[1], 5.5, "#ffffff", "#1d2433", 2.2, 1, 4);
    });
    if (this.playback != null) {
      const lens = this.route.positions.slice(1).map((p, i) => length(sub(p, this.route!.positions[i])));
      const total = lens.reduce((a, b) => a + b, 0);
      let target = this.playback * total, i = 0;
      while (i < lens.length - 1 && target > lens[i]) { target -= lens[i]; i++; }
      const f = lens[i] > 0 ? Math.min(1, target / lens[i]) : 0;
      const pos = lerp(this.route.positions[i], this.route.positions[i + 1], f);
      const s = proj.project(pos);
      const done = pts.slice(0, i + 1).map((p, j) => `${j ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + ` L${s[0].toFixed(1)},${s[1].toFixed(1)}`;
      this.svgPath("route-done", done, "#9fbfff", 3.5, { opacity: 0.95 });
      this.svgCircle("route-craft-halo", s[0], s[1], 10, ROUTE_BLUE, "none", 0, 0.25, 5);
      this.svgCircle("route-craft", s[0], s[1], 5.5, "#ffffff", ROUTE_BLUE, 3, 1, 5);
    }
  }

  private routePin(p: [number, number, number]) {
    const pin = `M${p[0]},${p[1]} c-1.5,-6 -9,-10 -9,-17 a9,9 0 1 1 18,0 c0,7 -7.5,11 -9,17z`;
    this.svgPath("route-pin", pin, "#a3262b", 1.2, { fill: "#e5484d", layer: 4, linecap: "butt" });
    this.svgCircle("route-pin-dot", p[0], p[1] - 17, 3.4, "#7d1b1f", "none", 0, 1, 5);
  }

  /** Idealized Hohmann transfer: both orbits as circles, the half-ellipse, and idealized planets. */
  private drawTransfer(proj: Projector, plan: NonNullable<RouteDisplay["transfer"]>) {
    const ecl2icrf = transpose(ICRF_TO_ECLIPTIC);
    const sun = this.byId.get("sun")!.pos!;
    // Angles in the orbital plane measured from the departure direction, prograde.
    const pt = (r: number, ang: number) => proj.project(add(sun, mulMatVec(ecl2icrf, [r * Math.cos(ang + plan.lon0), r * Math.sin(ang + plan.lon0), 0])));
    const circle = (r: number) => {
      let d = "";
      for (let i = 0; i <= 180; i++) { const p = pt(r, (i / 180) * 2 * Math.PI); d += `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)} `; }
      return d;
    };
    const atlas = this.layer === "atlas";
    const h = plan.h;
    this.svgPath("tr-o1", circle(h.r1Km), atlas ? "#7a8aa5" : "#7fa3ff", 1.3, { opacity: 0.75, dash: "4 4" });
    this.svgPath("tr-o2", circle(h.r2Km), atlas ? "#b07a6a" : "#ff9b7a", 1.3, { opacity: 0.75, dash: "4 4" });
    let d = "";
    for (let i = 0; i <= 160; i++) {
      const th = (i / 160) * Math.PI;
      const p = pt(transferRadius(h, th), th);
      d += `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)} `;
    }
    this.svgPath("tr-casing", d, atlas ? "#ffffff" : "#0b1220", 6, { opacity: atlas ? 1 : 0.55 });
    this.svgPath("tr-path", d, ROUTE_BLUE, 3.2, { opacity: 0.95 });
    const t = (this.playback ?? 0) * h.transferSeconds;
    const st = hohmannState(h, t);
    const o = pt(st.origin.r, st.origin.angle), tg = pt(st.target.r, st.target.angle), cr = pt(st.craft.r, st.craft.angle);
    const dep = pt(h.r1Km, 0), arr = pt(h.r2Km, Math.PI);
    this.svgCircle("tr-dep", dep[0], dep[1], 4, "none", "#ffffff", 1.5, 0.8, 4);
    this.svgCircle("tr-arr", arr[0], arr[1], 4, "none", "#ffffff", 1.5, 0.8, 4);
    this.svgCircle("tr-origin", o[0], o[1], 6.5, "#3d7be0", "#fff", 2, 1, 4);
    this.svgCircle("tr-target", tg[0], tg[1], 6, "#c8643c", "#fff", 2, 1, 4);
    if (this.playback != null) {
      let dd = "";
      const steps = 80;
      for (let i = 0; i <= steps; i++) {
        const th = (i / steps) * st.craft.angle;
        const p = pt(transferRadius(h, th), th);
        dd += `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)} `;
      }
      this.svgPath("tr-done", dd, "#9fbfff", 3.2, { opacity: 0.95 });
      this.svgCircle("tr-craft-halo", cr[0], cr[1], 10, ROUTE_BLUE, "none", 0, 0.25, 5);
      this.svgCircle("tr-craft", cr[0], cr[1], 5, "#ffffff", ROUTE_BLUE, 2.5, 1, 5);
    }
    this.svgText("tr-origin-l", o[0] + 11, o[1] + 4, `${plan.originLabel} (idealized orbit)`, "sc-label");
    this.svgText("tr-target-l", tg[0] + 10, tg[1] + 4, `${plan.targetLabel} (idealized orbit)`, "sc-label");
    this.svgText("tr-dep-l", dep[0] + 8, dep[1] - 8, "Departure", "sc-label dim");
    this.svgText("tr-arr-l", arr[0] + 8, arr[1] - 8, "Arrival", "sc-label dim");
  }

  /** Schematic, logarithmic overview of the observable universe (directions preserved). */
  private drawUniverse(proj: Projector, u: number, labelCands: LabelCandidate[], blocked: [number, number, number, number][]) {
    const [cx, cy] = centerOf(this.vp);
    const us = this.usable();
    const R = 0.4 * us.min;
    const a = u;
    const bubble = this.svgEl("uni-bubble", "circle", 0);
    bubble.setAttribute("cx", cx.toFixed(1)); bubble.setAttribute("cy", cy.toFixed(1)); bubble.setAttribute("r", R.toFixed(1));
    bubble.setAttribute("fill", "url(#gm-bubble)"); bubble.setAttribute("stroke", "#9db4ff"); bubble.setAttribute("stroke-opacity", "0.45");
    bubble.setAttribute("stroke-width", "1.2"); bubble.setAttribute("opacity", a.toFixed(3)); bubble.setAttribute("pointer-events", "none");
    for (const ly of DISTANCE_BANDS_LY) {
      const r = logRadius(ly) * R;
      const el = this.svgEl(`uni-band-${ly}`, "circle", 0);
      el.setAttribute("cx", cx.toFixed(1)); el.setAttribute("cy", cy.toFixed(1)); el.setAttribute("r", r.toFixed(1));
      el.setAttribute("fill", "none"); el.setAttribute("stroke", "#c9d6ff"); el.setAttribute("stroke-opacity", "0.16");
      el.setAttribute("stroke-dasharray", "2 5"); el.setAttribute("opacity", a.toFixed(3));
      this.svgText(`uni-bandl-${ly}`, cx + 4, cy - r - 4, bandLabel(ly), "ring-label", a);
    }
    const gly = (OBSERVABLE_RADIUS_LY / 1e9).toFixed(0);
    this.svgText("uni-title", cx, cy - R - 26, "Observable universe", "uni-title", a, "middle");
    this.svgText("uni-sub", cx, cy - R - 10, `≈ ${gly} billion light-years to the edge (comoving radius, Planck 2018)`, "uni-sub", a, "middle");
    this.svgText("uni-scale", cx, cy + R + 22, "Schematic overview — logarithmic distance", "uni-sub", a, "middle");
    this.svgText("uni-catalog", cx, cy + R + 38, "Dots: selected GalaxyMaps catalog objects, not every galaxy", "uni-sub dim", a, "middle");
    this.svgText("uni-edge", cx, cy + R + 54, "The edge is an observational horizon, not a physical wall or a destination", "uni-sub dim", a, "middle");
    this.svgCircle("uni-here", cx, cy, 3.5, "#ffffff", ROUTE_BLUE, 2, a, 4);
    const hereText = "Milky Way (you are here)";
    this.svgText("uni-here-l", cx + 8, cy + 4, hereText, "uni-label", a);
    if (u > 0.5) blocked.push([cx - 6, cy - 9, cx + 12 + this.textWidth(hereText), cy + 8]);

    const m = proj.m;
    for (const o of this.data.catalog.objects) {
      let dir: Vec3 | null = null, ly = 0;
      if (o.cosmo) { dir = o.cosmo.dir; ly = o.cosmo.comovingLy; }
      else if (o.position?.kind === "static" && (o.type === "galaxy" || o.type === "galaxy-group" || o.type === "quasar") && o.region !== "milky-way") {
        const p = o.position.xyz;
        const len = length(p);
        if (len <= 0) continue;
        dir = scale(p, 1 / len);
        ly = len / LY_KM;
      }
      if (!dir || !dir.every(Number.isFinite)) continue;
      const v = mulMatVec(m, dir);
      const rr = logRadius(ly) * R;
      const x = cx + v[0] * rr, y = cy - v[1] * rr;
      const front = v[2] >= 0;
      const isSel = o.id === this.selectedId;
      const emph = this.emphasis ? this.emphasis.has(o.id) : null;
      const color = o.type === "quasar" ? "#ffd27a" : o.type === "galaxy-group" ? "#c8b6ff" : "#9fc2ff";
      this.svgCircle(`uni-${o.id}`, x, y, isSel ? 4.5 : o.highlight ? 3 : 2.2, color, isSel ? "#ffffff" : "none", isSel ? 2 : 0, a * (front ? 1 : 0.5) * (emph === false ? 0.3 : 1), 2);
      this.universePts.push({ id: o.id, x, y });
      if (u > 0.5) labelCands.push({ id: o.id, x, y, width: this.textWidth(o.name), height: 16, priority: o.display.priority + (o.cosmo ? 20 : 0) + (emph ? 30 : 0), offset: 6, force: isSel });
    }
    if (this.selectedId) {
      const p = this.universePts.find((q) => q.id === this.selectedId);
      if (p) this.svgCircle("uni-sel", p.x, p.y, 9, "none", ROUTE_BLUE, 2.5, a, 4);
    }
  }

  private drawSelection(proj: Projector) {
    const ids = [this.selectedId, this.hoverId].filter(Boolean) as string[];
    for (const id of ids) {
      if (id === this.lockedId && id === this.selectedId) continue;
      const r = this.byId.get(id);
      const pos = r?.pos ?? this.getObjectPosition(id);
      if (!pos) continue;
      const s = proj.project(pos);
      const rad = Math.min(Math.max(r?.rPx ?? 3, 3), 600) + (id === this.selectedId ? 7 : 5);
      this.svgCircle(`sel-${id === this.selectedId ? "a" : "h"}`, s[0], s[1], rad, "none", id === this.selectedId ? ROUTE_BLUE : this.layer === "atlas" ? "#5b6b85" : "#ffffff", id === this.selectedId ? 2.5 : 1.5, id === this.selectedId ? 1 : 0.6, 4);
    }
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

  private setLabelText(id: string, text: string) {
    this.labelText.set(id, text);
  }

  private placeLabels(placed: ReturnType<typeof declutter>) {
    const used = new Set<string>();
    for (const p of placed) {
      used.add(p.id);
      let el = this.labelPool.get(p.id);
      const o = this.data.byId.get(p.id);
      if (!el) {
        el = document.createElement("div");
        el.className = "map-label";
        if (p.id.startsWith("__arm-")) el.classList.add("arm");
        if (p.id === "__here") el.classList.add("here");
        if (p.id === "__mw") el.classList.add("mw");
        if (o?.region === "solar-system" && (o.type === "planet" || o.id === "sun")) el.classList.add("major");
        if (o && o.type === "galaxy") el.classList.add("galaxy");
        this.labelLayer.appendChild(el);
        this.labelPool.set(p.id, el);
      }
      const text = this.labelText.get(p.id) ?? (p.id === "__mw" ? "Milky Way (reconstruction)" : p.id.startsWith("__arm-") ? p.id.slice(6) : o?.name ?? p.id);
      if (el.textContent !== text) el.textContent = text;
      el.classList.toggle("selected", p.id === this.selectedId || p.id === this.lockedId);
      el.style.transform = `translate(${p.left.toFixed(1)}px, ${p.top.toFixed(1)}px)`;
      el.style.display = "";
    }
    for (const [id, el] of this.labelPool) if (!used.has(id)) el.style.display = "none";
  }

  /** Heliocentric display constants used by the UI for zoom presets. */
  static readonly R0_KPC = R0_KPC;
}
