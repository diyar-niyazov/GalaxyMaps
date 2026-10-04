/**
 * Immersive WebXR presentation (Safari on visionOS, Quest browser, desktop emulators). The viewer
 * stands inside one rigid, linear scale model of space, the same geometry as the 2D map: every
 * object, catalog star and label sits at its true position times a single scale, so head motion
 * gives true parallax and stereo depth. Galaxies are 3D particle discs, nebulae and clusters
 * volumetric particle clouds, planets and stars lit spheres. Look at something and pinch to fly
 * there; pinch and drag to turn the world around it; spread two pinching hands to zoom; hold your
 * gaze on an object for its details. Grok Voice is hands-free: say "Grok, …" (status pill at the bottom of the view).
 * Head tracking is owned by the runtime; the scene never writes the viewer pose.
 */
import * as THREE from "three";
import type { MapEngine } from "../map/MapEngine";
import type { DataBundle } from "../data/bundle";
import { positionAt } from "../data/bundle";
import type { CatalogObject, Vec3 } from "../lib/types";
import { createEarthMaterials } from "../map/earthMaterial";
import { buildGalaxyParticles, galaxyParams, particleBudget, skyFrame, type GalaxyParams, type GalaxyParticles } from "../map/galaxyModel";
import { GALAXY_DUST_FRAGMENT, GALAXY_LIGHT_FRAGMENT } from "../map/galaxyShaders";
import { primeMeridian } from "../lib/rotation";
import { GALACTIC_TO_ICRF, unitFromRaDec } from "../lib/coords";
import { cross, mulMatVec, normalize } from "../lib/vec";
import { formatDistance } from "../lib/format";
import { TYPE_LABEL } from "../lib/search";
import { PC_KM } from "../lib/units";
import { canvasFont } from "../lib/fonts";
import { buildCloudParticles, cloudKind, type CloudKind } from "./cloudModel";
import type { ParticleJob } from "./particleWorker";
import { setXrNav, setXrView, xrContextChanged, type XrView } from "./bridge";
import { VoiceHud } from "./voiceHud";
import { useVoice } from "../state/voice";
import { useStore } from "../state/store";
import { reducedMotion } from "../lib/motion";
import {
  Dwell, FAR_M, FOCUS_M, GAZE_TOLERANCE, LINEAR_M, LOG_MAX, LOG_REF_M, MIN_ANGLE, ORBIT_RAD_PER_M, STICKY, displayDistance, displayRadius, flightAt, fromXr, objectZoomLimits, pickGaze, pinchFactor,
  planFlight, toXr, zoomVantage, type Flight, type GazeCandidate, type Vantage,
} from "./spaceView";

export interface XrCallbacks {
  /** The object whose details were opened, so the page can show it after VR. */
  onSelect(id: string): void;
  onEnd(): void;
  onExit?(): void;
}

const SPHERE_TYPES = new Set(["star", "planet", "dwarf-planet", "moon", "exoplanet", "white-dwarf", "neutron-star"]);
/** Models (spheres, particle galaxies and clouds) drawn at once, of which particle models. */
const PROMOTED = 36;
const PARTICLE_MODELS = 12;
const MODEL_CACHE = 48;
const GALAXY_COUNT = 40_000;
const CLOUD_COUNT = 16_000;
/** Additive particles drawn across all models at once; dense fields share it (GPU fill rate). */
const PARTICLE_FILL = 150_000;
/** Spheres built per layout pass; the rest stay markers until the next frame. */
const SPHERE_BUILDS = 3;
const LABELS = 12;
const LABEL_CACHE = 96;
/** Labels are re-chosen at this interval (or on a large head turn) and repositioned every frame. */
const LABEL_PICK_MS = 120;
const NEW_LABELS_PER_PICK = 2;
const SKY_M = 1500;
const TAP_MOVE_M = 0.028;
const TAP_MS = 500;
/** A drag decides once whether it orbits (sideways) or pushes to zoom (along the ray). */
const DRAG_DECIDE_M = 0.03;
/** Turn around the pinched object only when it is this close; otherwise turn around the viewer. */
const ORBIT_PIVOT_M = 40;
const MILKY_WAY_RADIUS_KM = 15_000 * PC_KM;

type Kind = "sphere" | "galaxy" | "cloud" | "point";

interface Body {
  obj: CatalogObject;
  pos: Vec3;
  kind: Kind;
  cloud: CloudKind | null;
  /** Physical radius, or half the catalog extent for extended objects. */
  radiusKm: number;
  /** Where a flight to this body ends (comfortable inspection). */
  standoffKm: number;
  /** Closest useful zoom, matching desktop lock-framing. */
  minKm: number;
  maxKm: number;
  /** Orientation of particle models in the space frame. */
  frame: THREE.Quaternion | null;
  // Layout, refreshed whenever the vantage or the world rotation changes.
  local: THREE.Vector3;
  world: THREE.Vector3;
  rKm: number;
  d: number;
  drawR: number;
  /** Drawn radius of the marker or model, whichever is shown. */
  shownR: number;
  angle: number;
  promoted: boolean;
  hidden: boolean;
}

interface Cached { node: THREE.Object3D; res: { dispose(): void }[]; used: number; particles?: { light: THREE.Points; dust: THREE.Points | null; max: number; mats: THREE.ShaderMaterial[] } }

interface Pinch {
  target: string | null;
  /** ICRF direction of the ray at pinch start. */
  dir: Vec3;
  origin: THREE.Vector3 | null;
  last: THREE.Vector3 | null;
  start: number;
  moved: number;
  mode: "undecided" | "orbit" | "push";
}

const SKY_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec3 vDir;
  const float PI = 3.141592653589793;
  void main() {
    vec3 d = normalize(vDir);
    float ra = atan(d.y, d.x);
    float dec = asin(clamp(d.z, -1.0, 1.0));
    gl_FragColor = vec4(texture2D(uMap, vec2(fract(0.5 - ra / (2.0 * PI)), 0.5 + dec / PI)).rgb * 0.85 * uOpacity, 1.0);
    #include <colorspace_fragment>
  }
`;
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    // ICRF z (celestial north) is +Y in the XR scene.
    vDir = vec3(-position.z, -position.x, position.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
/**
 * Hidden points are dropped by placing them beyond the far plane. A gl_PointSize of 0 is undefined
 * in GLSL: some GPUs still rasterise it with a NaN gl_PointCoord, which shows as flickering colour noise.
 */
const CULLED = /* glsl */ `const vec4 CULLED = vec4(0.0, 0.0, 2.0, 1.0);`;
/**
 * Catalog stars on the GPU, on the same linear scale as everything else: position is parsecs from
 * a rebasing origin near the viewer (so float precision holds while flying past a star), and
 * brightness follows the true distance from the vantage.
 */
const STAR_VERT = /* glsl */ `
  ${CULLED}
  attribute float aMag;
  attribute float aCi;
  uniform vec3 uVantage;
  uniform float uMPerPc;
  uniform float uLinear;
  uniform float uFar;
  uniform float uLogRef;
  uniform float uLogMax;
  uniform float uPx;
  varying vec3 vColor;
  float compress(float linear) {
    if (linear <= uLinear) return linear;
    return uLinear + (uFar - uLinear) * clamp(log(1.0 + (linear - uLinear) / uLogRef) / uLogMax, 0.0, 1.0);
  }
  void main() {
    vec3 v = position - uVantage;
    float d = max(length(v), 1e-9);
    float mag = aMag + 5.0 * log(d / 10.0) / log(10.0);
    float bright = clamp((7.5 - mag) / 7.0, 0.0, 1.0);
    float warm = clamp((aCi + 0.3) / 2.0, 0.0, 1.0);
    vColor = vec3(0.75 + 0.25 * warm, 0.8 + 0.1 * (1.0 - abs(warm - 0.5)), 1.0 - 0.35 * warm) * bright;
    vec3 p = vec3(-v.y, v.z, -v.x) / d * compress(d * uMPerPc);
    gl_PointSize = clamp((0.0012 + 0.0022 * bright) * 2.0 * uPx, 1.0, 48.0);
    gl_Position = bright > 0.0 ? projectionMatrix * modelViewMatrix * vec4(p, 1.0) : CULLED;
  }
`;
/** Markers with a size in metres at the marker's distance. */
const POINT_VERT = /* glsl */ `
  ${CULLED}
  attribute float aSize;
  attribute vec3 color;
  uniform float uPx;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float px = aSize * 2.0 * uPx / max(-mv.z, 0.01);
    gl_PointSize = clamp(px, 1.0, 64.0);
    gl_Position = px > 0.0 ? projectionMatrix * mv : CULLED;
  }
`;
const POINT_FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = 1.0 - smoothstep(0.15, 0.5, length(d));
    if (!(a >= 0.02)) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`;
/**
 * Particle galaxies and clouds: each particle is sized by its own depth, so a nearby galaxy's near
 * side is larger than its far side, as in the 2D map's galaxy shader (sizes are authored for a
 * model 1000 px across).
 */
const PARTICLE_VERT = /* glsl */ `
  ${CULLED}
  attribute float aSize;
  attribute vec3 color;
  uniform float uDiam;
  uniform float uPx;
  uniform float uStarCap;
  varying vec3 vColor;
  varying float vEnergy;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float z = max(-mv.z, 0.14);
    float s = uDiam * uPx / z / 1000.0;
    float px = aSize * (aSize < 12.0 ? min(s, uStarCap) : min(s, 36.0));
    vEnergy = min(1.0, px * px);
    gl_PointSize = clamp(px, 1.0, 28.0);
    gl_Position = -mv.z < 0.1 ? CULLED : projectionMatrix * mv;
  }
`;
const LIT_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;
const LIT_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform vec3 uColor;
  uniform vec3 uSunDir;
  uniform float uEmissive;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vec3 base = uHasMap > 0.5 ? texture2D(uMap, vUv).rgb : uColor;
    float light = uEmissive > 0.5 ? 1.0 : 0.05 + 1.05 * max(dot(normalize(vNormal), uSunDir), 0.0);
    gl_FragColor = vec4(base * light, 1.0);
    #include <colorspace_fragment>
  }
`;
const RETICLE_FRAG = /* glsl */ `
  uniform float uProgress;
  varying vec2 vUv;
  const float PI = 3.141592653589793;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ring = smoothstep(0.72, 0.78, r) * (1.0 - smoothstep(0.92, 0.98, r));
    float a = fract(atan(p.x, p.y) / (2.0 * PI) + 1.0);
    float filled = step(a, uProgress) * step(0.001, uProgress);
    float dot = 1.0 - smoothstep(0.14, 0.2, r);
    vec3 col = mix(vec3(1.0), vec3(0.54, 0.71, 0.97), filled);
    float alpha = max(ring * (0.28 + 0.62 * filled), dot * 0.5);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;
const UV_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function wrapText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number) {
  const words = text.split(/\s+/);
  let line = "", lines = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y + lines * lineH);
      line = w;
      if (++lines >= maxLines - 1) break;
    } else line = test;
  }
  if (line && lines < maxLines) g.fillText(lines === maxLines - 1 && words.length ? `${line}…` : line, x, y + lines * lineH);
}

const v3 = (v: Vec3) => new THREE.Vector3(v[0], v[1], v[2]);
const arr = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];

/** Orientation, in the space frame, of a model whose unit-frame axes are the given ICRF vectors. */
function frameQuaternion(axes: [Vec3, Vec3, Vec3]) {
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(v3(toXr(axes[0])), v3(toXr(axes[1])), v3(toXr(axes[2]))));
}

/** The Milky Way's disc in its true orientation: x from the centre toward the Sun, z the north galactic pole. */
function milkyWayFrame(): [Vec3, Vec3, Vec3] {
  const ex = mulMatVec(GALACTIC_TO_ICRF, [1, 0, 0]), ey = mulMatVec(GALACTIC_TO_ICRF, [0, 1, 0]), ez = mulMatVec(GALACTIC_TO_ICRF, [0, 0, 1]);
  return [[-ex[0], -ex[1], -ex[2]], [-ey[0], -ey[1], -ey[2]], ez];
}

/** Generic barred spiral of the Milky Way's class (bar about 27° from the Sun–centre line); illustrative. */
function milkyWayParams(o: CatalogObject): GalaxyParams {
  return { ...galaxyParams(o), kind: "barred", stage: 2.5, arms: 2, pitchDeg: 13, bar: 0.27, bulge: 0.12, rotation: (27 * Math.PI) / 180 };
}

export class XrPresentation {
  private session: XRSession;
  private engine: MapEngine;
  private data: DataBundle;
  private cb: XrCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.05, 5000);
  /** World-fixed frame: ICRF axes mapped to XR axes and turned by look-around and orbit gestures. */
  private space = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private refSpace: XRReferenceSpace | null = null;
  private jd: number;
  private focusId: string | null;
  private savedSize = new THREE.Vector2();
  private savedRatio = 1;
  private savedAutoClear = false;
  private prepared = false;
  private disposed = false;

  private vantage: Vantage = { p: [0, 0, 0], mPerKm: 1e-6 };
  private bodies: Body[] = [];
  private byId = new Map<string, Body>();
  private dirty = true;
  private markers: THREE.Points | null = null;
  private stars: THREE.Points | null = null;
  private starMat: THREE.ShaderMaterial | null = null;
  /** Rebasing origin of the star buffer, parsecs. */
  private starOrigin: Vec3 | null = null;
  private sky: THREE.ShaderMaterial | null = null;
  private milkyWayFade = 0;
  private models = new Map<string, Cached>();
  private labels = new Map<string, Cached>();
  private pointMats: THREE.ShaderMaterial[] = [];
  private px = 1000;
  private reticle: THREE.Mesh | null = null;
  private hud: VoiceHud | null = null;
  private card: { id: string; node: THREE.Mesh; res: { dispose(): void }[]; awayAt: number | null } | null = null;
  private dwell = new Dwell();
  private gazeId: string | null = null;
  private gazeSince = 0;
  private gazeReported: string | null = null;
  private pinches = new Map<XRInputSource, Pinch>();
  private prevSpan: number | null = null;
  private flight: { plan: Flight; start: number } | null = null;
  /** Pending voice-requested zoom, as a natural log of the factor still to apply. */
  private zoomLeft = 0;
  private lastTime = 0;
  private pendingArrival: { id: string; name: string } | null = null;
  private lastJd = 0;
  private lastLook = new THREE.Vector3(0, 0, -1);
  private faceLook: THREE.Vector3 | null = null;
  private lastPinch = new Map<XRInputSource, Pinch>();
  private worker: Worker | null = null;
  private building = new Set<string>();
  private labelPick: Body[] = [];
  private labelPickAt = -Infinity;
  private labelPickDir = new THREE.Vector3();
  private gazeCands: GazeCandidate[] = [];
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();

  constructor(session: XRSession, engine: MapEngine, data: DataBundle, focusId: string | null, jd: number, cb: XrCallbacks) {
    this.session = session;
    this.engine = engine;
    this.data = data;
    this.focusId = focusId;
    this.jd = jd;
    this.lastJd = jd;
    this.cb = cb;
    this.renderer = engine.getRenderer();
  }

  async start() {
    if (this.disposed) return;
    const r = this.renderer;
    r.getSize(this.savedSize);
    this.savedRatio = r.getPixelRatio();
    this.savedAutoClear = r.autoClear;
    this.prepared = true;
    this.session.addEventListener("end", this.onEnd);
    this.engine.setPaused(true);
    r.autoClear = true;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType("local");
    r.xr.setFramebufferScaleFactor(0.9);
    try {
      await r.xr.setSession(this.session);
      if (this.disposed) return;
      r.xr.setFoveation?.(1);
      this.refSpace = r.xr.getReferenceSpace();
      this.buildScene();
      this.lastJd = 0;
      this.syncClock();
      this.session.addEventListener("selectstart", this.onSelectStart);
      this.session.addEventListener("selectend", this.onSelectEnd);
      this.session.addEventListener("select", this.onSelect);
      setXrView(this.view);
      useVoice.getState().setWakeWord(true);
      r.setAnimationLoop(this.frame);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /** Leaving VR uses the system gesture (Digital Crown, headset menu); this is the programmatic path. */
  end() {
    if (this.cb.onExit) { this.cb.onExit(); return; }
    if (!this.disposed) this.session.end().catch(() => this.dispose());
  }

  private onEnd = () => this.dispose();

  /** Idempotent cleanup also covers failed initialization and runtime/system exit. */
  dispose() {
    if (this.disposed) { this.restoreRenderer(); return; }
    this.disposed = true;
    this.session.removeEventListener("selectstart", this.onSelectStart);
    this.session.removeEventListener("selectend", this.onSelectEnd);
    this.session.removeEventListener("select", this.onSelect);
    this.session.removeEventListener("end", this.onEnd);
    setXrView(null);
    setXrNav({ phase: "idle", id: null, name: null });
    if (useVoice.getState().wakeWord) useVoice.getState().setWakeWord(false);
    this.worker?.terminate();
    this.worker = null;
    this.building.clear();
    this.labelPick = [];
    this.restoreRenderer();
    const all = [...this.disposables];
    for (const c of [...this.models.values(), ...this.labels.values()]) all.push(...c.res);
    if (this.card) all.push(...this.card.res);
    for (const d of all) d.dispose();
    this.hud?.dispose();
    this.hud = null;
    this.disposables = [];
    this.models.clear();
    this.labels.clear();
    this.card = null;
    this.pinches.clear();
    this.lastPinch.clear();
    this.refSpace = null;
    this.scene.clear();
    if (this.prepared) this.engine.setPaused(false);
    this.cb.onEnd();
  }

  private restoreRenderer() {
    if (!this.prepared) return;
    const r = this.renderer;
    r.setAnimationLoop(null);
    r.xr.enabled = false;
    r.autoClear = this.savedAutoClear;
    r.setPixelRatio(this.savedRatio);
    r.setSize(this.savedSize.x, this.savedSize.y, false);
  }

  private track<T extends { dispose(): void }>(d: T, into = this.disposables): T {
    into.push(d);
    return d;
  }

  private texture(path: string, into: { dispose(): void }[]) {
    let released = false;
    const texture = new THREE.TextureLoader().load(path, (loaded) => {
      if (released || this.disposed) { loaded.dispose(); return; }
      loaded.colorSpace = THREE.SRGBColorSpace;
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.addEventListener("dispose", () => { released = true; });
    return this.track(texture, into);
  }

  // ------------------------------------------------------------------ voice and app bridge

  private view: XrView = {
    flyTo: (id) => {
      if (!this.byId.has(id)) return false;
      this.flyTo(id);
      this.openDetails(id);
      return true;
    },
    zoom: (factor) => { this.zoomLeft += Math.log(factor); },
    showRegion: (center, widthKm) => {
      this.closeDetails();
      this.focusId = null;
      this.startFlight(planFlight(this.vantage, center, widthKm * 0.55));
    },
    home: () => { this.closeDetails(); this.flyTo("earth"); },
    describe: () => {
      const name = (id: string | null) => (id ? this.byId.get(id)?.obj.name ?? null : null);
      const gaze = name(this.gazeId), focus = name(this.focusId), card = name(this.card?.id ?? null);
      const metre = formatDistance(1 / this.vantage.mPerKm);
      return [
        gaze ? `They are looking at ${gaze}.` : "They are looking at empty space.",
        focus ? `They flew to ${focus}.` : "",
        card ? `The details card for ${card} is open.` : "",
        `At the current scale one metre in VR is ${metre}.`,
      ].filter(Boolean).join(" ");
    },
  };

  // ------------------------------------------------------------------ scene

  private buildScene() {
    this.scene.background = new THREE.Color(0x02030a);
    this.scene.add(this.space);

    for (const obj of this.data.catalog.objects) {
      const pos = positionAt(this.data, obj, this.jd);
      if (!pos) continue;
      const milkyWay = obj.id === "milky-way";
      const radius = obj.radiusKm ?? 0, half = milkyWay ? MILKY_WAY_RADIUS_KM : (obj.display.extentKm ?? 0) / 2;
      const cloud = cloudKind(obj);
      const kind: Kind = SPHERE_TYPES.has(obj.type) && radius ? "sphere"
        : (obj.type === "galaxy" || obj.type === "quasar") && half ? "galaxy"
        : cloud && half ? "cloud" : "point";
      const size = kind === "sphere" ? radius : kind === "point" ? radius : half;
      const lim = objectZoomLimits(kind, size);
      const frame = kind === "galaxy" || kind === "cloud" ? frameQuaternion(milkyWay ? milkyWayFrame() : skyFrame(obj, pos).axes) : null;
      const b: Body = {
        obj, pos, kind, cloud, radiusKm: size, frame,
        standoffKm: lim.arriveKm, minKm: lim.minKm, maxKm: lim.maxKm,
        local: new THREE.Vector3(), world: new THREE.Vector3(), rKm: 1, d: 1, drawR: 0, shownR: 0, angle: 0, promoted: false, hidden: false,
      };
      this.bodies.push(b);
      this.byId.set(obj.id, b);
    }

    // Start at the selected object's flight end, sunward of it so it is ahead and lit.
    const focus = this.byId.get(this.focusId ?? "earth") ?? this.byId.get("earth") ?? this.bodies[0];
    if (focus) {
      let toViewer: Vec3 = Math.hypot(...focus.pos) > 1 ? normalize(focus.pos).map((v) => -v) as Vec3 : [-1, 0, 0];
      if (focus.obj.id === "milky-way") {
        // Above the disc, looking down at it from the Sun's side.
        const [x, , z] = milkyWayFrame();
        toViewer = normalize([x[0] * 0.6 + z[0] * 0.8, x[1] * 0.6 + z[1] * 0.8, x[2] * 0.6 + z[2] * 0.8]);
      }
      const r = focus.standoffKm;
      this.vantage = { p: [focus.pos[0] + toViewer[0] * r, focus.pos[1] + toViewer[1] * r, focus.pos[2] + toViewer[2] * r], mPerKm: FOCUS_M / r };
      this.space.quaternion.setFromUnitVectors(v3(toXr(toViewer)).negate(), new THREE.Vector3(0, 0, -1));
      this.focusId = focus.obj.id;
    }

    const skyTex = this.texture("/textures/sky/milkyway_2k.jpg", this.disposables);
    skyTex.generateMipmaps = false;
    skyTex.minFilter = THREE.LinearFilter;
    this.sky = this.track(new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { uMap: { value: skyTex }, uOpacity: { value: 1 } }, side: THREE.BackSide, depthWrite: false }));
    const sky = new THREE.Mesh(this.track(new THREE.SphereGeometry(SKY_M, 64, 32)), this.sky);
    sky.renderOrder = -2;
    this.space.add(sky);

    this.buildStars();
    this.markers = this.pointCloud(this.bodies.length, 1);
    const col = this.markers.geometry.attributes.color.array as Float32Array, c = new THREE.Color();
    this.bodies.forEach((b, i) => {
      c.set(b.obj.display.color).multiplyScalar(b.obj.featured ? 1 : 0.7);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    });
    this.markers.geometry.attributes.color.needsUpdate = true;

    const reticleMat = this.track(new THREE.ShaderMaterial({ vertexShader: UV_VERT, fragmentShader: RETICLE_FRAG, uniforms: { uProgress: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false }));
    this.reticle = new THREE.Mesh(this.track(new THREE.PlaneGeometry(1, 1)), reticleMat);
    this.reticle.renderOrder = 1000;
    this.scene.add(this.reticle);

    this.hud = new VoiceHud();
    this.scene.add(this.hud.node);
  }

  private buildStars() {
    const n = this.data.stars.length / this.data.starStride;
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mag = new Float32Array(n), ci = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      mag[i] = this.data.stars[i * this.data.starStride + 3];
      ci[i] = this.data.stars[i * this.data.starStride + 4];
    }
    geo.setAttribute("aMag", new THREE.BufferAttribute(mag, 1));
    geo.setAttribute("aCi", new THREE.BufferAttribute(ci, 1));
    this.starMat = this.track(new THREE.ShaderMaterial({
      vertexShader: STAR_VERT, fragmentShader: POINT_FRAG,
      uniforms: { uVantage: { value: new THREE.Vector3() }, uMPerPc: { value: 1 }, uLinear: { value: LINEAR_M }, uFar: { value: FAR_M }, uLogRef: { value: LOG_REF_M }, uLogMax: { value: LOG_MAX }, uPx: { value: 1000 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.pointMats.push(this.starMat);
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -1;
    this.space.add(this.stars);
  }

  /**
   * Re-centre the star buffer near the viewer whenever float precision would start to show. The
   * offset that float32 tolerates grows as the scale shrinks (about a millimetre of display error),
   * so zooming through interstellar space does not rewrite and re-upload every star each frame.
   */
  private placeStars() {
    if (!this.stars || !this.starMat) return;
    const p: Vec3 = [this.vantage.p[0] / PC_KM, this.vantage.p[1] / PC_KM, this.vantage.p[2] / PC_KM];
    const o = this.starOrigin;
    const mPerPc = this.vantage.mPerKm * PC_KM;
    if (!o || Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2]) > Math.max(1e-3, 4000 / mPerPc)) {
      const s = this.data.stars, stride = this.data.starStride;
      const pos = this.stars.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < pos.length / 3; i++) {
        pos[i * 3] = s[i * stride] - p[0];
        pos[i * 3 + 1] = s[i * stride + 1] - p[1];
        pos[i * 3 + 2] = s[i * stride + 2] - p[2];
      }
      this.stars.geometry.attributes.position.needsUpdate = true;
      this.starOrigin = p;
    }
    const origin = this.starOrigin!;
    this.starMat.uniforms.uVantage.value.set(p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]);
    this.starMat.uniforms.uMPerPc.value = mPerPc;
  }

  private pointCloud(n: number, order: number) {
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(n), 1));
    const mat = this.track(new THREE.ShaderMaterial({ vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, uniforms: { uPx: { value: 1000 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.pointMats.push(mat);
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = order;
    this.space.add(pts);
    return pts;
  }

  /** Place every body on the linear scale from the vantage, and choose which get full models. */
  private relayout() {
    const { p, mPerKm } = this.vantage;
    const fromSunPc = Math.hypot(...p) / PC_KM;
    // Inside the Milky Way the sky panorama carries it; the particle disc takes over farther out.
    this.milkyWayFade = Math.min(1, Math.max(0, (Math.log10(Math.max(fromSunPc, 1e-9)) - Math.log10(300)) / 1));
    if (this.sky) this.sky.uniforms.uOpacity.value = Math.max(0, Math.min(1, 1 - Math.log10(Math.max(fromSunPc, 1e-9) / 0.5)));
    const R = this.space.quaternion;
    for (const b of this.bodies) {
      const v: Vec3 = [b.pos[0] - p[0], b.pos[1] - p[1], b.pos[2] - p[2]];
      b.rKm = Math.max(Math.hypot(v[0], v[1], v[2]), 1e-9);
      b.d = displayDistance(b.rKm, mPerKm);
      const [x, y, z] = toXr([v[0] / b.rKm, v[1] / b.rKm, v[2] / b.rKm]);
      b.local.set(x * b.d, y * b.d, z * b.d);
      b.world.copy(b.local).applyQuaternion(R);
      b.drawR = displayRadius(b.radiusKm, b.rKm, mPerKm);
      b.angle = Math.atan2(b.drawR, b.d);
      b.hidden = b.obj.id === "milky-way" && (this.milkyWayFade < 0.02 || b.rKm < b.radiusKm);
    }
    const ranked = this.bodies
      .filter((b) => !b.hidden && b.kind !== "point" && b.angle > (b.kind === "sphere" ? 0.002 : 0.003))
      .sort((a, b) => b.angle - a.angle);
    const wanted = new Set<string>();
    let particles = 0;
    for (const b of ranked) {
      if (wanted.size >= PROMOTED) break;
      if (b.kind !== "sphere" && ++particles > PARTICLE_MODELS) continue;
      wanted.add(b.obj.id);
    }

    // Models are built a few per frame (particles in a worker); until then a body stays a marker.
    const promoted = new Set<string>();
    let sphereBuilds = 0, syncBuilds = 0, deferred = false;
    for (const id of wanted) {
      const b = this.byId.get(id)!;
      if (this.models.has(id)) promoted.add(id);
      else if (b.kind === "sphere") {
        if (sphereBuilds++ < SPHERE_BUILDS) { this.sphereModel(b); promoted.add(id); } else deferred = true;
      } else if (this.worker || this.startWorker()) this.requestParticles(b);
      else if (syncBuilds++ < 1) { this.particleModel(b, this.buildParticles(this.particleJob(b))); promoted.add(id); }
      else deferred = true;
    }

    const m = this.markers!.geometry;
    const pos = m.attributes.position.array as Float32Array, size = m.attributes.aSize.array as Float32Array;
    this.bodies.forEach((b, i) => {
      b.promoted = promoted.has(b.obj.id);
      pos[i * 3] = b.local.x; pos[i * 3 + 1] = b.local.y; pos[i * 3 + 2] = b.local.z;
      const marker = Math.max(b.kind === "galaxy" || b.kind === "cloud" ? b.drawR * 0.6 : b.drawR, MIN_ANGLE * b.d) * (b.obj.featured ? 1.3 : 1);
      b.shownR = b.promoted ? b.drawR : marker;
      size[i] = b.promoted || b.hidden ? 0 : marker;
    });
    m.attributes.position.needsUpdate = true;
    m.attributes.aSize.needsUpdate = true;

    for (const [id, cached] of this.models) cached.node.visible = promoted.has(id);
    const now = performance.now();
    const sun = this.byId.get("sun");
    const fills: { cached: Cached; n: number; opacity: number }[] = [];
    let fillTotal = 0;
    for (const id of promoted) {
      const b = this.byId.get(id)!;
      const cached = this.models.get(id)!;
      cached.used = now;
      cached.node.visible = true;
      cached.node.position.copy(b.local);
      if (cached.particles) {
        // Face size follows the true angular size. Depth is exaggerated so a disc has stereo
        // thickness you can look around — the 2D map's tilt illusion, in metres.
        const face = Math.max(b.drawR * 2, 0.02);
        const thick = Math.max(face * 0.28, Math.min(0.7, face * 0.55));
        cached.node.scale.set(face, face, thick);
        const extPx = (face * this.px) / Math.max(b.d, 0.05);
        let n = particleBudget(extPx, cached.particles.max);
        const fadeIn = Math.min(1, (b.angle - 0.004) / 0.004);
        let opacity = fadeIn * (b.obj.id === "milky-way" ? this.milkyWayFade : 1);
        // Inside the volume, huge additive sprites become TV-static — keep a quieter core.
        if (b.d < b.drawR * 0.5) {
          n = Math.max(80, Math.floor(n * 0.28));
          opacity *= 0.4;
        }
        for (const mat of cached.particles.mats) mat.uniforms.uDiam.value = b.drawR * 2;
        fills.push({ cached, n, opacity });
        fillTotal += n;
      } else {
        cached.node.scale.setScalar(b.drawR);
        const spin = cached.node.userData.spin as THREE.Object3D | undefined;
        if (spin) spin.rotation.y = primeMeridian(id, this.jd);
        const sunDir = cached.node.userData.sunDir as THREE.Vector3 | undefined;
        if (sunDir && sun) sunDir.copy(v3(toXr(normalize([sun.pos[0] - b.pos[0], sun.pos[1] - b.pos[1], sun.pos[2] - b.pos[2]])))).applyQuaternion(R);
      }
    }
    // Many overlapping additive models are fill-rate bound: share one particle budget among them.
    const share = fillTotal > PARTICLE_FILL ? PARTICLE_FILL / fillTotal : 1;
    for (const { cached, n: want, opacity } of fills) {
      const p = cached.particles!;
      const n = Math.max(80, Math.floor(want * share));
      p.light.geometry.setDrawRange(0, n);
      for (const mat of p.mats) mat.uniforms.uOpacity.value = mat === p.light.material ? opacity * Math.min(2.4, Math.sqrt(p.max / n) * 0.7) : opacity;
    }
    this.evict(this.models, MODEL_CACHE);
    this.placeStars();
    if (this.stars) {
      const focus = this.focusId ? this.byId.get(this.focusId) : undefined;
      this.stars.visible = !focus || focus.drawR < 7;
    }
    this.dirty = deferred;
  }

  private workerFailed = false;

  /** The particle worker, or null where module workers are unavailable (then builds run inline). */
  private startWorker(): Worker | null {
    if (this.workerFailed || typeof Worker === "undefined") return null;
    try {
      const w = new Worker(new URL("./particleWorker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<{ id: string; parts: GalaxyParticles }>) => {
        const { id, parts } = e.data;
        if (this.disposed || !this.building.delete(id)) return;
        const b = this.byId.get(id);
        if (b && !this.models.has(id)) { this.particleModel(b, parts); this.dirty = true; }
      };
      w.onerror = () => {
        // Fall back to inline builds; pending requests are retried by the next layout.
        this.workerFailed = true;
        w.terminate();
        if (this.worker === w) this.worker = null;
        this.building.clear();
        this.dirty = true;
      };
      this.worker = w;
      return w;
    } catch {
      this.workerFailed = true;
      return null;
    }
  }

  private particleJob(b: Body): ParticleJob {
    return b.kind === "galaxy"
      ? { id: b.obj.id, kind: "galaxy", params: b.obj.id === "milky-way" ? milkyWayParams(b.obj) : galaxyParams(b.obj), count: GALAXY_COUNT }
      : { id: b.obj.id, kind: "cloud", obj: b.obj, cloud: b.cloud!, count: CLOUD_COUNT };
  }

  private buildParticles(job: ParticleJob): GalaxyParticles {
    return job.kind === "galaxy" ? buildGalaxyParticles(job.params, job.count) : buildCloudParticles(job.obj, job.cloud, job.count);
  }

  private requestParticles(b: Body) {
    if (this.building.has(b.obj.id) || !this.worker) return;
    this.building.add(b.obj.id);
    this.worker.postMessage(this.particleJob(b));
  }

  /** Shared Play-time clock: XR reads the same jd the desktop store advances. */
  private syncClock() {
    const jd = useStore.getState().jd;
    if (jd === this.lastJd) return;
    this.lastJd = jd;
    this.jd = jd;
    for (const b of this.bodies) {
      const pos = positionAt(this.data, b.obj, jd);
      if (pos) b.pos = pos;
    }
    this.dirty = true;
  }

  private sphereModel(b: Body): Cached {
    const res: { dispose(): void }[] = [];
    const obj = b.obj;
    const geo = this.track(new THREE.SphereGeometry(1, 64, 48), res);
    let mat: THREE.Material;
    let sunDir: THREE.Vector3;
    if (obj.id === "earth") {
      const mats = createEarthMaterials("low", () => {});
      this.track(mats.surface, res);
      this.track(mats.halo, res);
      mat = mats.surface;
      sunDir = mats.surface.uniforms.uSunDir.value as THREE.Vector3;
    } else {
      const emissive = obj.type === "star" || obj.type === "white-dwarf" || obj.type === "neutron-star";
      const map = obj.display.texture ? this.texture(`/textures/${obj.display.texture}`, res) : null;
      const shader = new THREE.ShaderMaterial({
        vertexShader: LIT_VERT, fragmentShader: LIT_FRAG,
        uniforms: { uMap: { value: map }, uHasMap: { value: map ? 1 : 0 }, uColor: { value: new THREE.Color(obj.display.color) }, uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uEmissive: { value: emissive ? 1 : 0 } },
      });
      mat = this.track(shader, res);
      sunDir = shader.uniforms.uSunDir.value as THREE.Vector3;
    }
    const sphere = new THREE.Mesh(geo, mat);
    sphere.rotation.y = primeMeridian(obj.id, this.jd);
    const holder = new THREE.Group();
    if (obj.display.pole) {
      // Spin axis from the IAU pole (ICRF), mapped into the XR frame.
      const pole = unitFromRaDec(obj.display.pole.ra, obj.display.pole.dec);
      const node0 = normalize(cross([0, 0, 1], pole));
      const Y = v3(toXr(pole)), X = v3(toXr(node0)), Z = new THREE.Vector3().crossVectors(X, Y);
      holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    }
    holder.add(sphere);
    holder.userData.spin = sphere;
    if (obj.display.rings && obj.radiusKm) {
      const inner = obj.display.rings.innerKm / obj.radiusKm, outer = obj.display.rings.outerKm / obj.radiusKm;
      const ringGeo = this.track(new THREE.RingGeometry(inner, outer, 128), res);
      const positions = ringGeo.attributes.position, uv = ringGeo.attributes.uv;
      for (let i = 0; i < positions.count; i++) uv.setXY(i, (Math.hypot(positions.getX(i), positions.getY(i)) - inner) / (outer - inner), 0.5);
      const ringMat = this.track(new THREE.MeshBasicMaterial({ color: "#c9bc96", map: obj.display.rings.texture ? this.texture(`/textures/${obj.display.rings.texture}`, res) : null, transparent: true, side: THREE.DoubleSide, depthWrite: false }), res);
      const rings = new THREE.Mesh(ringGeo, ringMat);
      rings.rotation.x = -Math.PI / 2;
      holder.add(rings);
    }
    holder.userData.sunDir = sunDir;
    this.space.add(holder);
    const cached = { node: holder, res, used: performance.now() };
    this.models.set(obj.id, cached);
    return cached;
  }

  /** A galaxy, nebula, cluster or remnant as a real 3D particle model, in its true orientation. */
  private particleModel(b: Body, parts: GalaxyParticles): Cached {
    const res: { dispose(): void }[] = [];
    const group = new THREE.Group();
    group.quaternion.copy(b.frame!);
    const mats: THREE.ShaderMaterial[] = [];
    const points = (positions: Float32Array, sizes: Float32Array, colors: Float32Array | null, fragmentShader: string, blending: THREE.Blending, order: number) => {
      const geo = this.track(new THREE.BufferGeometry(), res);
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
      if (colors) geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mat = this.track(new THREE.ShaderMaterial({
        uniforms: { uDiam: { value: 1 }, uPx: { value: this.px }, uStarCap: { value: 1.6 }, uOpacity: { value: 0 } },
        vertexShader: PARTICLE_VERT, fragmentShader, transparent: true, depthWrite: false, blending,
      }), res);
      mats.push(mat);
      // Culled against the combined eye frustum: off-view models cost no fill while looking around.
      const pts = new THREE.Points(geo, mat);
      pts.renderOrder = order;
      group.add(pts);
      return pts;
    };
    const light = points(parts.light.positions, parts.light.sizes, parts.light.colors, GALAXY_LIGHT_FRAGMENT, THREE.AdditiveBlending, 2);
    const dust = parts.dust.count ? points(parts.dust.positions, parts.dust.sizes, null, GALAXY_DUST_FRAGMENT, THREE.NormalBlending, 3) : null;
    // A dim volumetric body so the galaxy has a silhouette from every angle, not a camera-facing stamp.
    const vol = b.kind === "galaxy"
      ? this.track(new THREE.SphereGeometry(0.42, 24, 16), res)
      : this.track(new THREE.SphereGeometry(0.38, 18, 14), res);
    const volMat = this.track(new THREE.MeshBasicMaterial({
      color: new THREE.Color(b.obj.display.color),
      transparent: true,
      opacity: b.kind === "galaxy" ? 0.22 : 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    }), res);
    const volume = new THREE.Mesh(vol, volMat);
    volume.scale.set(1, b.obj.display.axisRatio ?? 0.7, 0.55);
    volume.renderOrder = 1;
    group.add(volume);
    this.space.add(group);
    const cached: Cached = { node: group, res, used: performance.now(), particles: { light, dust, max: parts.light.count, mats } };
    this.models.set(b.obj.id, cached);
    return cached;
  }

  /** Release the least recently used hidden models or labels beyond the cache size. */
  private evict(cache: Map<string, Cached>, max: number, inUse = (c: Cached, _id: string) => c.node.visible) {
    if (cache.size <= max) return;
    const hidden = [...cache.entries()].filter(([id, c]) => !inUse(c, id)).sort((a, b) => a[1].used - b[1].used);
    for (const [id, c] of hidden.slice(0, cache.size - max)) {
      c.node.removeFromParent();
      for (const d of c.res) d.dispose();
      cache.delete(id);
    }
  }

  private label(id: string, text: string): Cached {
    const existing = this.labels.get(id);
    if (existing) return existing;
    const res: { dispose(): void }[] = [];
    const tex = this.track(canvasTexture(512, 88, (g) => {
      g.font = canvasFont("600 38px");
      const w = Math.min(500, g.measureText(text).width + 40);
      g.fillStyle = "rgba(10,16,30,0.72)";
      g.beginPath();
      g.roundRect((512 - w) / 2, 4, w, 80, 40);
      g.fill();
      g.fillStyle = "#ffffff";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, 256, 46, 480);
    }), res);
    const mat = this.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }), res);
    const node = new THREE.Mesh(this.track(new THREE.PlaneGeometry(0.512, 0.088), res), mat);
    node.renderOrder = 10;
    this.scene.add(node);
    const cached = { node, res, used: performance.now() };
    this.labels.set(id, cached);
    return cached;
  }

  // ------------------------------------------------------------------ details card

  private openDetails(id: string) {
    const b = this.byId.get(id);
    if (!b) return;
    if (this.card?.id === id) { this.card.awayAt = null; return; }
    this.closeDetails();
    const res: { dispose(): void }[] = [];
    const obj = b.obj;
    const earth = this.byId.get("earth");
    const dist = obj.id === "earth" ? "You are here" : earth ? formatDistance(Math.hypot(b.pos[0] - earth.pos[0], b.pos[1] - earth.pos[1], b.pos[2] - earth.pos[2])) : null;
    const tex = this.track(canvasTexture(900, 600, (g) => {
      g.fillStyle = "rgba(10,16,30,0.88)";
      g.beginPath();
      g.roundRect(0, 0, 900, 600, 36);
      g.fill();
      g.fillStyle = "#ffffff";
      g.font = canvasFont("700 54px");
      g.fillText(obj.name, 44, 88, 812);
      g.fillStyle = "#a9b6cc";
      g.font = canvasFont("500 28px");
      g.fillText(`${TYPE_LABEL[obj.type]}${obj.subtitle ? ` · ${obj.subtitle}` : ""}`.slice(0, 70), 44, 136, 812);
      g.fillStyle = "#e8eefc";
      g.font = canvasFont("400 29px");
      if (obj.summary) wrapText(g, obj.summary.text, 44, 196, 812, 40, 4);
      let y = 384;
      const facts = [...(dist ? [{ label: "From Earth", value: dist }] : []), ...obj.facts].slice(0, 4);
      g.font = canvasFont("500 26px");
      for (const f of facts) {
        g.fillStyle = "#a9b6cc";
        g.fillText(f.label.slice(0, 26), 44, y);
        g.fillStyle = "#ffffff";
        g.fillText(f.value.slice(0, 40), 400, y);
        y += 46;
      }
      const source = obj.summary && this.data.catalog.sources[obj.summary.sourceId];
      g.fillStyle = "#7d8aa3";
      g.font = canvasFont("400 20px");
      const note = b.kind === "galaxy" || b.kind === "cloud" ? "true size and position · 3D shape is generic for its type" : "true size and position";
      g.fillText(source ? `Text: ${source.title}${source.license ? ` · ${source.license}` : ""} · ${note}` : `GalaxyMaps catalog · ${note}`, 44, 572, 812);
    }), res);
    const mat = this.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }), res);
    const node = new THREE.Mesh(this.track(new THREE.PlaneGeometry(0.66, 0.44), res), mat);
    node.renderOrder = 20;
    this.scene.add(node);
    this.card = { id, node, res, awayAt: null };
    this.cb.onSelect(id);
    xrContextChanged();
  }

  private closeDetails() {
    if (!this.card) return;
    this.card.node.removeFromParent();
    for (const d of this.card.res) d.dispose();
    this.card = null;
  }

  // ------------------------------------------------------------------ movement

  private startFlight(plan: Flight, dest?: { id: string; name: string }) {
    this.zoomLeft = 0;
    this.faceLook = this.lastLook.clone();
    this.faceTarget(plan.target, this.faceLook);
    if (dest) {
      this.pendingArrival = dest;
      setXrNav({ phase: "moving", id: dest.id, name: dest.name });
    }
    if (reducedMotion()) {
      this.vantage = flightAt(plan, 1);
      this.dirty = true;
      this.finishFlight();
      return;
    }
    this.flight = { plan, start: performance.now() };
    xrContextChanged();
  }

  private finishFlight() {
    this.flight = null;
    const dest = this.pendingArrival;
    this.pendingArrival = null;
    if (this.faceLook) {
      const pos = (this.focusId ? this.byId.get(this.focusId)?.pos : undefined) ?? (dest ? this.byId.get(dest.id)?.pos : undefined);
      this.faceTarget(pos, this.faceLook);
    }
    if (dest && this.focusId === dest.id) setXrNav({ phase: "arrived", id: dest.id, name: dest.name });
    xrContextChanged();
  }

  /** Rotate the space model so `target` sits along the look direction captured when travel started. */
  private faceTarget(target: Vec3 | undefined, look: THREE.Vector3) {
    if (!target || look.lengthSq() < 1e-8) return;
    const off: Vec3 = [target[0] - this.vantage.p[0], target[1] - this.vantage.p[1], target[2] - this.vantage.p[2]];
    const xr = v3(toXr(off));
    if (xr.lengthSq() < 1e-12) return;
    this.space.quaternion.setFromUnitVectors(xr.normalize(), look.clone().normalize());
    this.dirty = true;
  }

  private cancelFlight() {
    if (!this.flight && !this.pendingArrival) { this.flight = null; return; }
    this.flight = null;
    if (this.pendingArrival) {
      setXrNav({ phase: "cancelled", id: this.pendingArrival.id, name: this.pendingArrival.name });
      this.pendingArrival = null;
    }
  }

  private flyTo(id: string) {
    const b = this.byId.get(id);
    if (!b) return;
    this.focusId = id;
    this.startFlight(planFlight(this.vantage, b.pos, b.standoffKm), { id, name: b.obj.name });
  }

  /** Zoom around a body (or a point ahead along `dir` when there is none). */
  private zoomAt(target: string | null, dir: Vec3, factor: number) {
    if (Math.abs(factor - 1) < 1e-4) return;
    const b = target ? this.byId.get(target) : undefined;
    const ahead = (FOCUS_M * 2) / this.vantage.mPerKm;
    const pivot: Vec3 = b ? b.pos : [this.vantage.p[0] + dir[0] * ahead, this.vantage.p[1] + dir[1] * ahead, this.vantage.p[2] + dir[2] * ahead];
    this.vantage = zoomVantage(this.vantage, pivot, b?.minKm ?? 0, factor, b?.maxKm);
    this.dirty = true;
  }

  /**
   * Turn the world by `yaw` about the vertical and `pitch` about the head's right axis, around the
   * pinched (or focused) object if it is near, otherwise around the viewer's head.
   */
  private orbit(target: string | null, yaw: number, pitch: number, head: THREE.Vector3, right: THREE.Vector3) {
    if (Math.abs(yaw) + Math.abs(pitch) < 1e-6) return;
    const R = this.space.quaternion.clone(), m = this.vantage.mPerKm, P = this.vantage.p;
    const b = this.byId.get(target ?? this.focusId ?? "");
    let pivot: Vec3, c: THREE.Vector3;
    if (b && !b.hidden && b.d < ORBIT_PIVOT_M) {
      pivot = b.pos;
      c = b.world.clone();
    } else {
      const local = fromXr(arr(head.clone().applyQuaternion(R.clone().invert())));
      pivot = [P[0] + local[0] / m, P[1] + local[1] / m, P[2] + local[2] / m];
      c = head.clone();
    }
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(right, pitch));
    const R2 = q.multiply(R);
    const back = fromXr(arr(c.clone().applyQuaternion(R2.clone().invert())));
    this.space.quaternion.copy(R2);
    this.vantage = { p: [pivot[0] - back[0] / m, pivot[1] - back[1] / m, pivot[2] - back[2] / m], mPerKm: m };
    this.dirty = true;
  }

  // ------------------------------------------------------------------ input

  private rayFrom(space: XRSpace, frame: XRFrame) {
    if (!this.refSpace) return null;
    const pose = frame.getPose(space, this.refSpace);
    if (!pose) return null;
    const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
    return {
      origin: new THREE.Vector3().setFromMatrixPosition(m),
      dir: new THREE.Vector3(0, 0, -1).applyMatrix4(new THREE.Matrix4().extractRotation(m)).normalize(),
    };
  }

  /** The body a ray rests on, with generous hitboxes and occlusion by nearer planets. */
  private aim(origin: THREE.Vector3, worldDir: THREE.Vector3, sticky: string | null = null) {
    return { icrf: this.icrfOf(worldDir), target: this.gazeAt(origin, worldDir, sticky) };
  }

  private icrfOf(worldDir: THREE.Vector3): Vec3 {
    const local = this.tmpB.copy(worldDir).applyQuaternion(this.tmpQ.copy(this.space.quaternion).invert());
    return normalize(fromXr([local.x, local.y, local.z]));
  }

  /**
   * Only bodies whose hitbox could contain the ray become candidates (pickGaze's widest reach is
   * max(angle·1.85, tolerance)·STICKY), so a dense field costs no per-body allocations.
   */
  private gazeAt(origin: THREE.Vector3, worldDir: THREE.Vector3, sticky: string | null): string | null {
    const cands = this.gazeCands;
    cands.length = 0;
    const to = this.tmpA;
    for (const b of this.bodies) {
      if (b.hidden || (b.obj.id === "milky-way" && b.rKm < b.radiusKm * 1.2)) continue;
      to.copy(b.world).sub(origin);
      const dist = to.length();
      if (dist < 1e-6) continue;
      const pad = b.obj.featured ? 1.25 : 1;
      const angle = Math.atan2(b.shownR, dist) * pad;
      const reach = Math.min(Math.PI, Math.max(angle * 1.85, GAZE_TOLERANCE) * STICKY * 1.05);
      if (to.dot(worldDir) < dist * Math.cos(reach)) continue;
      to.divideScalar(dist);
      cands.push({ id: b.obj.id, dir: [to.x, to.y, to.z], angle, dist, solid: b.promoted && b.kind === "sphere" });
    }
    return pickGaze(cands, arr(worldDir), sticky);
  }

  private onSelectStart = (e: XRInputSourceEvent) => {
    if (this.disposed) return;
    const ray = this.rayFrom(e.inputSource.targetRaySpace, e.frame);
    if (!ray) return;
    const { icrf, target } = this.aim(ray.origin, ray.dir);
    const pinch: Pinch = { dir: icrf, target, origin: null, last: null, start: performance.now(), moved: 0, mode: "undecided" };
    this.pinches.set(e.inputSource, pinch);
    this.lastPinch.set(e.inputSource, pinch);
    this.prevSpan = null;
  };

  private onSelectEnd = (e: XRInputSourceEvent) => {
    this.pinches.delete(e.inputSource);
    this.prevSpan = null;
  };

  /** A quick pinch on an object flies there; on empty space it closes the details card. */
  private onSelect = (e: XRInputSourceEvent) => {
    if (this.disposed || !this.refSpace) return;
    const pinch = this.pinches.get(e.inputSource) ?? this.lastPinch.get(e.inputSource);
    this.lastPinch.delete(e.inputSource);
    if (pinch && (pinch.moved > TAP_MOVE_M || performance.now() - pinch.start > TAP_MS)) return;
    const ray = this.rayFrom(e.inputSource.targetRaySpace, e.frame);
    if (!ray) return;
    const target = pinch ? pinch.target : this.aim(ray.origin, ray.dir).target;
    if (target) {
      this.flyTo(target);
      this.openDetails(target);
    } else this.closeDetails();
  };

  private stepGestures(frame: XRFrame, dt: number, head: THREE.Vector3, headQ: THREE.Quaternion) {
    if (!this.refSpace) return;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(headQ);
    const hands: { pinch: Pinch; pos: THREE.Vector3; dir: THREE.Vector3 }[] = [];
    for (const [source, pinch] of this.pinches) {
      const pose = frame.getPose(source.gripSpace ?? source.targetRaySpace, this.refSpace);
      const ray = this.rayFrom(source.targetRaySpace, frame);
      if (!pose || !ray) continue;
      const p = pose.transform.position;
      hands.push({ pinch, pos: new THREE.Vector3(p.x, p.y, p.z), dir: ray.dir });
    }
    if (hands.length) this.cancelFlight();
    if (hands.length >= 2) {
      // Two hands: spread to zoom in toward what the first hand pinched, close to zoom out.
      const span = hands[0].pos.distanceTo(hands[1].pos);
      if (this.prevSpan) this.zoomAt(hands[0].pinch.target, hands[0].pinch.dir, pinchFactor(this.prevSpan, span, 0));
      this.prevSpan = span;
      for (const h of hands) h.pinch.moved = 1;
    } else if (hands.length === 1) {
      // One hand: drag sideways to turn the world around the object, or push/pull to zoom.
      const { pinch, pos, dir } = hands[0];
      pinch.origin ??= pos.clone();
      if (pinch.last) {
        const step = pos.clone().sub(pinch.last);
        pinch.moved += step.length();
        if (pinch.mode === "undecided") {
          const total = pos.clone().sub(pinch.origin);
          if (total.length() > DRAG_DECIDE_M) {
            const along = Math.abs(total.dot(dir)), side = Math.hypot(total.dot(right), total.y);
            pinch.mode = along > side * 1.2 ? "push" : "orbit";
          }
        }
        if (pinch.mode === "push") this.zoomAt(pinch.target, pinch.dir, pinchFactor(null, null, step.dot(dir)));
        else if (pinch.mode === "orbit") this.orbit(pinch.target, step.dot(right) * ORBIT_RAD_PER_M, -step.y * ORBIT_RAD_PER_M, head, right);
      }
      pinch.last = pos;
    }
    // Controllers: thumbstick forward/back zooms toward where the controller points, sideways turns.
    for (const source of this.session.inputSources ?? []) {
      const pad = source.gamepad;
      if (!pad || source.hand) continue;
      const x = pad.axes[2] ?? pad.axes[0] ?? 0, y = pad.axes[3] ?? pad.axes[1] ?? 0;
      if (Math.abs(x) < 0.2 && Math.abs(y) < 0.2) continue;
      const ray = this.rayFrom(source.targetRaySpace, frame);
      if (!ray) continue;
      this.cancelFlight();
      const { icrf, target } = this.aim(ray.origin, ray.dir);
      if (Math.abs(y) >= 0.2) this.zoomAt(target, icrf, Math.exp(y * dt * 1.15));
      if (Math.abs(x) >= 0.2) this.orbit(null, -x * dt * 1.2, 0, head, right);
    }
  }

  // ------------------------------------------------------------------ frame

  private frame = (time: number, frame?: XRFrame) => {
    if (this.disposed) return;
    const dt = this.lastTime ? Math.min(0.1, (time - this.lastTime) / 1000) : 0;
    this.lastTime = time;

    // three only refreshes the combined XR camera inside render(); use this frame's pose for
    // head-locked content (mic pill, reticle) so it does not swim a frame behind the head.
    this.renderer.xr.updateCamera?.(this.camera);
    const xrCam = this.renderer.xr.getCamera();
    const head = new THREE.Vector3().setFromMatrixPosition(xrCam.matrixWorld);
    const headQ = new THREE.Quaternion().setFromRotationMatrix(xrCam.matrixWorld);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(headQ);

    this.lastLook.copy(forward);
    this.syncClock();
    if (this.flight) {
      const t = (performance.now() - this.flight.start) / this.flight.plan.ms;
      this.vantage = flightAt(this.flight.plan, t);
      this.dirty = true;
      if (this.faceLook) this.faceTarget(this.flight.plan.target, this.faceLook);
      if (t >= 1) this.finishFlight();
    } else if (Math.abs(this.zoomLeft) > 1e-3) {
      const step = Math.sign(this.zoomLeft) * Math.min(Math.abs(this.zoomLeft), dt * 1.8);
      this.zoomLeft -= step;
      this.zoomAt(this.focusId, this.icrfOf(forward), Math.exp(step));
    }
    if (frame) this.stepGestures(frame, dt, head, headQ);
    if (this.dirty) this.relayout();

    const layer = this.session.renderState?.baseLayer;
    const eye = xrCam.cameras?.[0];
    this.px = (layer?.framebufferHeight ?? 1800) * 0.5 * (eye?.projectionMatrix.elements[5] ?? 1.2);
    for (const m of this.pointMats) m.uniforms.uPx.value = this.px;
    for (const c of this.models.values()) if (c.node.visible && c.particles) for (const m of c.particles.mats) m.uniforms.uPx.value = this.px;

    const target = this.gazeAt(head, forward, this.gazeId);
    if (target !== this.gazeId) { this.gazeId = target; this.gazeSince = time; }
    if (this.gazeId !== this.gazeReported && time - this.gazeSince > 400) {
      this.gazeReported = this.gazeId;
      xrContextChanged();
    }
    const dwell = this.dwell.update(this.flight ? null : target, time);
    if (dwell.fire) this.openDetails(dwell.fire);
    if (this.reticle) {
      const gazed = target ? this.byId.get(target) : undefined;
      const dist = gazed ? Math.min(gazed.world.distanceTo(head), 60) * 0.98 : 3;
      this.reticle.position.copy(head).addScaledVector(forward, dist);
      this.reticle.quaternion.copy(headQ);
      this.reticle.scale.setScalar(dist * 0.024);
      (this.reticle.material as THREE.ShaderMaterial).uniforms.uProgress.value = this.card?.id === target ? 0 : dwell.progress;
    }
    this.placeLabels(head, headQ, forward, time);
    this.placeCard(head, headQ, forward, time);
    this.hud?.update(head, headQ, time);
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Names sit on the same ray as the object, a small angular lift above it, at the object's own
   * depth so both eyes and a moving head keep the name glued to the star or galaxy.
   */
  private placeLabels(head: THREE.Vector3, headQ: THREE.Quaternion, forward: THREE.Vector3, time: number) {
    const gazed = this.gazeId ? this.byId.get(this.gazeId) : undefined;
    if (time - this.labelPickAt > LABEL_PICK_MS || forward.dot(this.labelPickDir) < Math.cos(0.15) || (!!gazed && this.labelPick[0] !== gazed)) {
      this.pickLabels(head, forward, gazed);
      this.labelPickAt = time;
      this.labelPickDir.copy(forward);
    }
    for (const c of this.labels.values()) c.node.visible = false;
    const headUp = this.tmpA.set(0, 1, 0).applyQuaternion(headQ);
    const dir = this.tmpB, lift = new THREE.Vector3();
    const now = performance.now();
    for (const b of this.labelPick) {
      const l = this.labels.get(b.obj.id);
      if (!l || b.hidden) continue;
      dir.copy(b.world).sub(head);
      const dist = dir.length();
      if (dist < 1e-4) continue;
      dir.divideScalar(dist);
      lift.copy(headUp).addScaledVector(dir, -headUp.dot(dir));
      if (lift.lengthSq() < 1e-6) lift.set(0, 1, 0);
      else lift.normalize();
      l.node.position.copy(head).addScaledVector(dir, dist).addScaledVector(lift, Math.max(b.shownR * 1.08, dist * 0.016));
      l.node.quaternion.copy(headQ);
      l.node.scale.setScalar(dist * (b === gazed ? 0.2 : 0.155));
      l.node.renderOrder = b === gazed ? 12 : 10;
      l.node.visible = true;
      l.used = now;
    }
    if (this.labels.size > LABEL_CACHE) {
      const keep = new Set(this.labelPick.map((b) => b.obj.id));
      this.evict(this.labels, LABEL_CACHE, (c, id) => c.node.visible || keep.has(id));
    }
  }

  /**
   * Which names to show: the gazed object, then the biggest nearby ones in a cone ahead, skipping
   * crowded or occluded ones. New label textures are rate-limited so sweeping across a dense
   * field does not stall on canvas uploads.
   */
  private pickLabels(head: THREE.Vector3, forward: THREE.Vector3, gazed: Body | undefined) {
    const cone = Math.cos(0.48), to = this.tmpA;
    const near: { b: Body; dir: THREE.Vector3; dist: number }[] = [];
    const solids: { b: Body; dir: THREE.Vector3; dist: number }[] = [];
    const entry = (b: Body) => {
      const dir = b.world.clone().sub(head);
      const dist = dir.length();
      return { b, dir: dir.divideScalar(Math.max(dist, 1e-9)), dist };
    };
    for (const b of this.bodies) {
      if (b.hidden) continue;
      if (b.promoted && b.kind === "sphere") solids.push(entry(b));
      if (b === gazed || !(b.obj.featured || b.promoted || b.angle > 0.01)) continue;
      to.copy(b.world).sub(head);
      const dist = to.length();
      if (dist > 1e-4 && to.dot(forward) > dist * cone) near.push(entry(b));
    }
    near.sort((a, b) => Number(b.b.promoted) - Number(a.b.promoted) || b.b.angle - a.b.angle || b.b.obj.display.priority - a.b.obj.display.priority);
    const occluded = (e: { b: Body; dir: THREE.Vector3; dist: number }) =>
      solids.some((s) => s.b !== e.b && s.dist < e.dist && s.dir.angleTo(e.dir) < Math.atan2(s.b.drawR, s.dist));
    const placed: THREE.Vector3[] = [];
    const picked: Body[] = [];
    let fresh = 0;
    const take = (b: Body) => {
      if (!this.labels.has(b.obj.id)) {
        if (b !== gazed && fresh >= NEW_LABELS_PER_PICK) return false;
        fresh++;
        this.label(b.obj.id, b.obj.name);
      }
      picked.push(b);
      return true;
    };
    if (gazed && !gazed.hidden) { const e = entry(gazed); if (e.dist > 1e-4 && take(gazed)) placed.push(e.dir); }
    for (const e of near) {
      if (placed.length >= LABELS + (gazed ? 1 : 0)) break;
      if (e.dist < 1e-4 || placed.some((p) => p.angleTo(e.dir) < 0.06) || occluded(e)) continue;
      if (take(e.b)) placed.push(e.dir);
    }
    this.labelPick = picked;
  }

  /** The details card floats beside its object at reading distance and closes after looking away. */
  private placeCard(head: THREE.Vector3, headQ: THREE.Quaternion, forward: THREE.Vector3, time: number) {
    const card = this.card;
    if (!card) return;
    const b = this.byId.get(card.id);
    if (!b) { this.closeDetails(); return; }
    const toObj = b.world.clone().sub(head).normalize();
    const right = new THREE.Vector3().crossVectors(toObj, new THREE.Vector3(0, 1, 0).applyQuaternion(headQ)).normalize();
    const dist = Math.min(1.3, Math.max(0.9, b.world.distanceTo(head) - 0.3));
    const angleR = Math.min(0.6, Math.atan2(b.shownR, b.world.distanceTo(head)) + 0.36);
    const dir = toObj.clone().multiplyScalar(Math.cos(angleR)).addScaledVector(right, Math.sin(angleR)).normalize();
    card.node.position.copy(head).addScaledVector(dir, dist);
    card.node.lookAt(head);
    const looking = this.flight || forward.dot(toObj) > Math.cos(0.5) || forward.dot(dir) > Math.cos(0.4);
    if (looking) card.awayAt = null;
    else if (card.awayAt == null) card.awayAt = time;
    else if (time - card.awayAt > 1500) this.closeDetails();
  }
}
