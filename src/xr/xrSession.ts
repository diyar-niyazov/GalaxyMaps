/**
 * Immersive WebXR presentation (Safari on visionOS, Quest browser, desktop emulators): the
 * viewer stands inside the map with no control panels. Every catalog object and catalog star is
 * drawn in its true direction from the viewer's vantage point, with distances compressed into a
 * few metres. Look around to explore; pinch with both hands and spread (or pinch one hand and
 * push) to fly toward what you are looking at; hold your gaze on an object to see its details.
 * Head tracking is owned by the runtime; the scene never writes the viewer pose.
 */
import * as THREE from "three";
import type { MapEngine } from "../map/MapEngine";
import type { DataBundle } from "../data/bundle";
import { positionAt } from "../data/bundle";
import type { CatalogObject, Vec3 } from "../lib/types";
import { createEarthMaterials } from "../map/earthMaterial";
import { spriteTexture } from "../map/glyphs";
import { primeMeridian } from "../lib/rotation";
import { unitFromRaDec } from "../lib/coords";
import { cross, normalize } from "../lib/vec";
import { formatDistance } from "../lib/format";
import { TYPE_LABEL } from "../lib/search";
import { PC_KM } from "../lib/units";
import { canvasFont } from "../lib/fonts";
import { Dwell, angularRadius, displayDistance, displayRadius, fromXr, pickGaze, pinchFactor, toXr, zoomToward, type GazeCandidate, type Vantage } from "./spaceView";

export interface XrCallbacks {
  /** The object whose details were opened, so the page can show it after VR. */
  onSelect(id: string): void;
  onEnd(): void;
  onExit?(): void;
}

const SPHERE_TYPES = new Set(["star", "planet", "dwarf-planet", "moon", "exoplanet", "white-dwarf", "neutron-star"]);
const SPRITE_TYPES = new Set(["galaxy", "nebula", "supernova-remnant", "star-cluster", "quasar"]);
/** Bodies large enough on screen to get a real sphere or galaxy/nebula model. */
const PROMOTED = 28;
const MODEL_CACHE = 48;
const LABELS = 8;
const LABEL_CACHE = 48;
const STAR_SPHERE_M = 70;
const TAP_MOVE_M = 0.015;
const TAP_MS = 450;

interface Body {
  obj: CatalogObject;
  pos: Vec3;
  kind: "sphere" | "sprite" | "point";
  /** Physical radius, or half the catalog extent for extended objects. */
  radiusKm: number;
  /** Closest approach when zooming toward this body. */
  standoffKm: number;
  // Layout, refreshed whenever the vantage changes.
  dir: Vec3;
  rKm: number;
  d: number;
  angle: number;
  drawR: number;
}

interface Cached { node: THREE.Object3D; res: { dispose(): void }[]; used: number }

interface Pinch { dir: Vec3; target: string | null; last: THREE.Vector3 | null; start: number; moved: number }

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
/** Points with a constant angular size: aSize is a radius in metres at the point's distance. */
const POINT_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 color;
  uniform float uPx;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * 2.0 * uPx / max(-mv.z, 0.01), 0.0, 64.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const POINT_FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.15, length(d));
    if (a < 0.02) discard;
    gl_FragColor = vec4(vColor * a, a);
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

export class XrPresentation {
  private session: XRSession;
  private engine: MapEngine;
  private data: DataBundle;
  private cb: XrCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.05, 200);
  /** World-fixed frame: ICRF directions mapped to XR axes and turned so the start object is ahead. */
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

  private vantage: Vantage = { p: [0, 0, 0], scaleKm: 1e6 };
  private bodies: Body[] = [];
  private byId = new Map<string, Body>();
  private dirty = true;
  private starsAt: Vec3 | null = null;
  private markers: THREE.Points | null = null;
  private stars: THREE.Points | null = null;
  private sky: THREE.ShaderMaterial | null = null;
  private models = new Map<string, Cached>();
  private labels = new Map<string, Cached>();
  private pointMats: THREE.ShaderMaterial[] = [];
  private reticle: THREE.Mesh | null = null;
  private card: { id: string; node: THREE.Mesh; res: { dispose(): void }[]; awayAt: number | null } | null = null;
  private dwell = new Dwell();
  private gazeId: string | null = null;
  private pinches = new Map<XRInputSource, Pinch>();
  private prevSpan: number | null = null;
  private lastTime = 0;

  constructor(session: XRSession, engine: MapEngine, data: DataBundle, focusId: string | null, jd: number, cb: XrCallbacks) {
    this.session = session;
    this.engine = engine;
    this.data = data;
    this.focusId = focusId;
    this.jd = jd;
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
    r.xr.setFramebufferScaleFactor(1);
    try {
      await r.xr.setSession(this.session);
      if (this.disposed) return;
      this.refSpace = r.xr.getReferenceSpace();
      this.buildScene();
      this.session.addEventListener("selectstart", this.onSelectStart);
      this.session.addEventListener("selectend", this.onSelectEnd);
      this.session.addEventListener("select", this.onSelect);
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
    this.restoreRenderer();
    const all = [...this.disposables];
    for (const c of [...this.models.values(), ...this.labels.values()]) all.push(...c.res);
    if (this.card) all.push(...this.card.res);
    for (const d of all) d.dispose();
    this.disposables = [];
    this.models.clear();
    this.labels.clear();
    this.card = null;
    this.pinches.clear();
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

  // ------------------------------------------------------------------ scene

  private buildScene() {
    this.scene.background = new THREE.Color(0x02030a);
    this.scene.add(this.space);

    for (const obj of this.data.catalog.objects) {
      if (obj.id === "milky-way") continue;
      const pos = positionAt(this.data, obj, this.jd);
      if (!pos) continue;
      const radius = obj.radiusKm ?? 0, half = (obj.display.extentKm ?? 0) / 2;
      const kind = SPHERE_TYPES.has(obj.type) && radius ? "sphere" : SPRITE_TYPES.has(obj.type) && half ? "sprite" : "point";
      const size = kind === "sphere" ? radius : kind === "sprite" ? half : radius;
      const b: Body = { obj, pos, kind, radiusKm: size, standoffKm: kind === "sphere" ? size * 1.6 : kind === "sprite" ? size * 0.8 : 2_000, dir: [0, 0, -1], rKm: 1, d: 1, angle: 0, drawR: 0 };
      this.bodies.push(b);
      this.byId.set(obj.id, b);
    }

    // Start just sunward of the selected object so it is ahead, lit, and filling a comfortable part of the view.
    const focus = this.byId.get(this.focusId ?? "earth") ?? this.byId.get("earth") ?? this.bodies[0];
    if (focus) {
      const fromSun = Math.hypot(...focus.pos) > 1 ? normalize(focus.pos) : [1, 0, 0] as Vec3;
      const standoff = focus.kind === "sphere" ? focus.radiusKm * 5 : focus.kind === "sprite" ? focus.radiusKm * 3 : 1.5e8;
      this.vantage = { p: [focus.pos[0] - fromSun[0] * standoff, focus.pos[1] - fromSun[1] * standoff, focus.pos[2] - fromSun[2] * standoff], scaleKm: standoff };
      this.space.quaternion.setFromUnitVectors(v3(toXr(fromSun)), new THREE.Vector3(0, 0, -1));
    }

    const skyTex = this.texture("/textures/sky/milkyway_2k.jpg", this.disposables);
    skyTex.generateMipmaps = false;
    skyTex.minFilter = THREE.LinearFilter;
    this.sky = this.track(new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { uMap: { value: skyTex }, uOpacity: { value: 1 } }, side: THREE.BackSide, depthWrite: false }));
    const sky = new THREE.Mesh(this.track(new THREE.SphereGeometry(80, 64, 32)), this.sky);
    sky.renderOrder = -2;
    this.space.add(sky);

    this.stars = this.pointCloud(this.data.stars.length / this.data.starStride, -1);
    this.markers = this.pointCloud(this.bodies.length, 1);

    const reticleMat = this.track(new THREE.ShaderMaterial({ vertexShader: UV_VERT, fragmentShader: RETICLE_FRAG, uniforms: { uProgress: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false }));
    this.reticle = new THREE.Mesh(this.track(new THREE.PlaneGeometry(0.03, 0.03)), reticleMat);
    this.reticle.renderOrder = 1000;
    this.scene.add(this.reticle);
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

  /** Recompute every body's direction, compressed distance and drawn size from the vantage. */
  private relayout() {
    const { p, scaleKm } = this.vantage;
    for (const b of this.bodies) {
      const v: Vec3 = [b.pos[0] - p[0], b.pos[1] - p[1], b.pos[2] - p[2]];
      b.rKm = Math.max(Math.hypot(v[0], v[1], v[2]), 1e-6);
      b.dir = toXr([v[0] / b.rKm, v[1] / b.rKm, v[2] / b.rKm]);
      b.d = displayDistance(b.rKm, scaleKm);
      b.angle = angularRadius(b.radiusKm, b.rKm);
      b.drawR = displayRadius(b.angle, b.d);
    }
    const promoted = new Set(this.bodies.filter((b) => b.kind !== "point" && b.angle > 0.004).sort((a, b) => b.angle - a.angle).slice(0, PROMOTED).map((b) => b.obj.id));

    const m = this.markers!.geometry;
    const pos = m.attributes.position.array as Float32Array, col = m.attributes.color.array as Float32Array, size = m.attributes.aSize.array as Float32Array;
    const c = new THREE.Color();
    this.bodies.forEach((b, i) => {
      pos.set([b.dir[0] * b.d, b.dir[1] * b.d, b.dir[2] * b.d], i * 3);
      c.set(b.obj.display.color).multiplyScalar(b.obj.featured ? 1 : 0.7);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = promoted.has(b.obj.id) ? 0 : b.drawR * (b.obj.featured ? 1.4 : 1);
    });
    for (const a of ["position", "color", "aSize"]) m.attributes[a].needsUpdate = true;

    for (const [id, cached] of this.models) cached.node.visible = promoted.has(id);
    const now = performance.now();
    const sunDir = this.byId.get("sun");
    for (const id of promoted) {
      const b = this.byId.get(id)!;
      const cached = this.models.get(id) ?? this.buildModel(b);
      cached.used = now;
      cached.node.visible = true;
      cached.node.position.set(b.dir[0] * b.d, b.dir[1] * b.d, b.dir[2] * b.d);
      if (b.kind === "sprite") cached.node.scale.set(b.drawR * 2, b.drawR * 2 * Math.max(0.15, b.obj.display.axisRatio ?? 1), 1);
      else cached.node.scale.setScalar(b.drawR);
      const sun = cached.node.userData.sunDir as THREE.Vector3 | undefined;
      if (sun && sunDir) sun.copy(v3(toXr(normalize([sunDir.pos[0] - b.pos[0], sunDir.pos[1] - b.pos[1], sunDir.pos[2] - b.pos[2]])))).applyQuaternion(this.space.quaternion);
    }
    this.evict(this.models, MODEL_CACHE);

    // Stars: true directions from the vantage. Near the Sun the sky panorama carries the Milky Way.
    const fromSunPc = Math.hypot(...p) / PC_KM;
    if (this.sky) this.sky.uniforms.uOpacity.value = Math.max(0, Math.min(1, 1 - Math.log10(Math.max(fromSunPc, 1e-9) / 0.5)));
    const moved = this.starsAt ? Math.hypot(p[0] - this.starsAt[0], p[1] - this.starsAt[1], p[2] - this.starsAt[2]) / PC_KM : Infinity;
    if (moved > Math.max(0.02, fromSunPc * 0.02)) this.layoutStars();
    this.dirty = false;
  }

  private layoutStars() {
    const p = this.vantage.p, s = this.data.stars, stride = this.data.starStride, g = this.stars!.geometry;
    this.starsAt = [...p];
    const pos = g.attributes.position.array as Float32Array, col = g.attributes.color.array as Float32Array, size = g.attributes.aSize.array as Float32Array;
    const px = p[0] / PC_KM, py = p[1] / PC_KM, pz = p[2] / PC_KM;
    const n = s.length / stride;
    for (let i = 0; i < n; i++) {
      const o = i * stride;
      const x = s[o] - px, y = s[o + 1] - py, z = s[o + 2] - pz;
      const d = Math.max(Math.hypot(x, y, z), 1e-6);
      const mag = s[o + 3] + 5 * Math.log10(d / 10);
      const [X, Y, Z] = toXr([x / d, y / d, z / d]);
      pos[i * 3] = X * STAR_SPHERE_M; pos[i * 3 + 1] = Y * STAR_SPHERE_M; pos[i * 3 + 2] = Z * STAR_SPHERE_M;
      const bright = Math.max(0, Math.min(1, (7.5 - mag) / 7));
      const ci = s[o + 4];
      const warm = Math.max(0, Math.min(1, (ci + 0.3) / 2));
      col[i * 3] = (0.75 + 0.25 * warm) * bright; col[i * 3 + 1] = (0.8 + 0.1 * (1 - Math.abs(warm - 0.5))) * bright; col[i * 3 + 2] = (1 - 0.35 * warm) * bright;
      size[i] = bright > 0 ? STAR_SPHERE_M * (0.0012 + 0.0022 * bright) : 0;
    }
    for (const a of ["position", "color", "aSize"]) g.attributes[a].needsUpdate = true;
  }

  private buildModel(b: Body): Cached {
    const res: { dispose(): void }[] = [];
    const obj = b.obj;
    let node: THREE.Object3D;
    if (b.kind === "sprite") {
      const map = spriteTexture(obj);
      const mat = this.track(new THREE.SpriteMaterial({ map, color: obj.type === "galaxy" || obj.type === "quasar" ? 0xffffff : new THREE.Color(obj.display.color).lerp(new THREE.Color(0xffffff), 0.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, rotation: ((obj.display.positionAngle ?? 0) * Math.PI) / 180 }), res);
      node = new THREE.Sprite(mat);
    } else {
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
      node = holder;
      node.userData.sunDir = sunDir;
    }
    this.space.add(node);
    const cached = { node, res, used: performance.now() };
    this.models.set(obj.id, cached);
    return cached;
  }

  /** Release the least recently used hidden models or labels beyond the cache size. */
  private evict(cache: Map<string, Cached>, max: number) {
    if (cache.size <= max) return;
    const hidden = [...cache.entries()].filter(([, c]) => !c.node.visible).sort((a, b) => a[1].used - b[1].used);
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
    const mat = this.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), res);
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
      g.fillText(source ? `Text: ${source.title}${source.license ? ` · ${source.license}` : ""} · sizes and distances compressed` : "GalaxyMaps catalog · sizes and distances compressed", 44, 572, 812);
    }), res);
    const mat = this.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), res);
    const node = new THREE.Mesh(this.track(new THREE.PlaneGeometry(0.66, 0.44), res), mat);
    node.renderOrder = 20;
    this.scene.add(node);
    this.card = { id, node, res, awayAt: null };
    this.cb.onSelect(id);
  }

  private closeDetails() {
    if (!this.card) return;
    this.card.node.removeFromParent();
    for (const d of this.card.res) d.dispose();
    this.card = null;
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

  /** World direction → ICRF unit vector, and the body (if any) the direction rests on. */
  private aim(worldDir: THREE.Vector3) {
    const local = worldDir.clone().applyQuaternion(this.space.quaternion.clone().invert());
    const target = pickGaze(this.candidates(), [local.x, local.y, local.z], 0.05);
    return { icrf: normalize(fromXr([local.x, local.y, local.z])), target };
  }

  private candidates(): GazeCandidate[] {
    return this.bodies.map((b) => ({ id: b.obj.id, dir: b.dir, angle: Math.atan(b.drawR / b.d) }));
  }

  private onSelectStart = (e: XRInputSourceEvent) => {
    if (this.disposed) return;
    const ray = this.rayFrom(e.inputSource.targetRaySpace, e.frame);
    if (!ray) return;
    const { icrf, target } = this.aim(ray.dir);
    this.pinches.set(e.inputSource, { dir: icrf, target, last: null, start: performance.now(), moved: 0 });
    this.prevSpan = null;
  };

  private onSelectEnd = (e: XRInputSourceEvent) => {
    this.pinches.delete(e.inputSource);
    this.prevSpan = null;
  };

  /** A quick pinch without movement opens the details of the object under the pointer or gaze. */
  private onSelect = (e: XRInputSourceEvent) => {
    if (this.disposed || !this.refSpace) return;
    const pinch = this.pinches.get(e.inputSource);
    if (pinch && (pinch.moved > TAP_MOVE_M || performance.now() - pinch.start > TAP_MS)) return;
    const ray = this.rayFrom(e.inputSource.targetRaySpace, e.frame);
    if (!ray) return;
    const { target } = this.aim(ray.dir);
    if (target) this.openDetails(target);
  };

  private zoom(dir: Vec3, target: string | null, factor: number) {
    if (Math.abs(factor - 1) < 1e-4) return;
    const b = target ? this.byId.get(target) : undefined;
    const targetKm = b ? Math.hypot(b.pos[0] - this.vantage.p[0], b.pos[1] - this.vantage.p[1], b.pos[2] - this.vantage.p[2]) : null;
    this.vantage = zoomToward(this.vantage, dir, targetKm, b?.standoffKm ?? 0, factor);
    this.dirty = true;
  }

  private stepGestures(frame: XRFrame, dt: number) {
    if (!this.refSpace) return;
    const hands: { pinch: Pinch; pos: THREE.Vector3; dir: THREE.Vector3 }[] = [];
    for (const [source, pinch] of this.pinches) {
      const pose = frame.getPose(source.gripSpace ?? source.targetRaySpace, this.refSpace);
      const ray = this.rayFrom(source.targetRaySpace, frame);
      if (!pose || !ray) continue;
      const p = pose.transform.position;
      hands.push({ pinch, pos: new THREE.Vector3(p.x, p.y, p.z), dir: ray.dir });
    }
    if (hands.length >= 2) {
      const span = hands[0].pos.distanceTo(hands[1].pos);
      if (this.prevSpan) this.zoom(hands[0].pinch.dir, hands[0].pinch.target, pinchFactor(this.prevSpan, span, 0));
      this.prevSpan = span;
      for (const h of hands) h.pinch.moved = 1;
    } else if (hands.length === 1) {
      const { pinch, pos, dir } = hands[0];
      if (pinch.last) {
        const step = pos.clone().sub(pinch.last);
        pinch.moved += step.length();
        if (pinch.moved > TAP_MOVE_M) this.zoom(pinch.dir, pinch.target, pinchFactor(null, null, step.dot(dir)));
      }
      pinch.last = pos;
    }
    // Controllers: thumbstick forward flies toward where the controller points.
    for (const source of this.session.inputSources ?? []) {
      const pad = source.gamepad;
      if (!pad || source.hand) continue;
      const y = pad.axes[3] ?? pad.axes[1] ?? 0;
      if (Math.abs(y) < 0.2) continue;
      const ray = this.rayFrom(source.targetRaySpace, frame);
      if (!ray) continue;
      const { icrf, target } = this.aim(ray.dir);
      this.zoom(icrf, target, Math.exp(y * dt * 1.6));
    }
  }

  // ------------------------------------------------------------------ frame

  private frame = (time: number, frame?: XRFrame) => {
    if (this.disposed) return;
    const dt = this.lastTime ? Math.min(0.1, (time - this.lastTime) / 1000) : 0;
    this.lastTime = time;
    if (frame) this.stepGestures(frame, dt);
    if (this.dirty) this.relayout();

    const xrCam = this.renderer.xr.getCamera();
    const head = new THREE.Vector3().setFromMatrixPosition(xrCam.matrixWorld);
    const headQ = new THREE.Quaternion().setFromRotationMatrix(xrCam.matrixWorld);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(headQ);
    const layer = this.session.renderState?.baseLayer;
    const eye = xrCam.cameras?.[0];
    const px = (layer?.framebufferHeight ?? 1800) * 0.5 * (eye?.projectionMatrix.elements[5] ?? 1.2);
    for (const m of this.pointMats) m.uniforms.uPx.value = px;

    // Gaze: the head direction (pages never receive eye tracking) rests on one object at a time.
    const { target } = this.aim(forward);
    this.gazeId = target;
    const dwell = this.dwell.update(target, time);
    if (dwell.fire) this.openDetails(dwell.fire);
    if (this.reticle) {
      this.reticle.position.copy(head).addScaledVector(forward, 1.2);
      this.reticle.quaternion.copy(headQ);
      (this.reticle.material as THREE.ShaderMaterial).uniforms.uProgress.value = this.card?.id === target ? 0 : dwell.progress;
    }
    this.placeLabels(head, headQ, forward);
    this.placeCard(head, headQ, forward, time);
    this.renderer.render(this.scene, this.camera);
  };

  private worldPoint(b: Body, lift = 0) {
    return new THREE.Vector3(b.dir[0] * b.d, b.dir[1] * b.d, b.dir[2] * b.d).applyQuaternion(this.space.quaternion).add(new THREE.Vector3(0, lift, 0));
  }

  /** Names near the gaze only: the looked-at object and a few of the largest around it. */
  private placeLabels(head: THREE.Vector3, headQ: THREE.Quaternion, forward: THREE.Vector3) {
    for (const c of this.labels.values()) c.node.visible = false;
    const fwdLocal = forward.clone().applyQuaternion(this.space.quaternion.clone().invert());
    const near = this.bodies
      .filter((b) => b.obj.id !== this.gazeId && (b.obj.featured || b.angle > 0.01) && b.dir[0] * fwdLocal.x + b.dir[1] * fwdLocal.y + b.dir[2] * fwdLocal.z > Math.cos(0.45))
      .sort((a, b) => b.angle - a.angle || b.obj.display.priority - a.obj.display.priority)
      .slice(0, LABELS);
    const gazed = this.gazeId ? this.byId.get(this.gazeId) : undefined;
    const now = performance.now();
    for (const b of gazed ? [gazed, ...near] : near) {
      const l = this.label(b.obj.id, b.obj.name);
      const at = this.worldPoint(b);
      const dist = at.distanceTo(head);
      // Labels sit just above the drawn object, at most 3 m away so far names stay readable.
      const reach = Math.min(dist, 3) - 0.01;
      const s = reach * (b === gazed ? 0.42 : 0.3);
      const toObj = at.sub(head).normalize();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(headQ);
      const lift = Math.atan(b.drawR / b.d) + 0.03 * (b === gazed ? 1.4 : 1);
      const axis = new THREE.Vector3().crossVectors(toObj, up).normalize();
      l.node.position.copy(head).addScaledVector(toObj.applyAxisAngle(axis, -lift), reach);
      l.node.quaternion.copy(headQ);
      l.node.scale.setScalar(s);
      l.node.visible = true;
      l.used = now;
    }
    this.evict(this.labels, LABEL_CACHE);
  }

  /** The details card floats beside its object and closes once the viewer has looked away for a while. */
  private placeCard(head: THREE.Vector3, headQ: THREE.Quaternion, forward: THREE.Vector3, time: number) {
    const card = this.card;
    if (!card) return;
    const b = this.byId.get(card.id);
    if (!b) { this.closeDetails(); return; }
    const toObj = this.worldPoint(b).sub(head).normalize();
    const right = new THREE.Vector3().crossVectors(toObj, new THREE.Vector3(0, 1, 0).applyQuaternion(headQ)).normalize();
    const dist = Math.min(1.4, Math.max(0.9, this.worldPoint(b).distanceTo(head) - 0.2));
    const angleR = Math.min(0.6, Math.atan(b.drawR / b.d) + 0.36);
    const dir = toObj.clone().multiplyScalar(Math.cos(angleR)).addScaledVector(right, Math.sin(angleR)).normalize();
    card.node.position.copy(head).addScaledVector(dir, dist);
    card.node.lookAt(head);
    const looking = forward.dot(toObj) > Math.cos(0.5) || forward.dot(dir) > Math.cos(0.4);
    if (looking) card.awayAt = null;
    else if (card.awayAt == null) card.awayAt = time;
    else if (time - card.awayAt > 1500) this.closeDetails();
  }
}
