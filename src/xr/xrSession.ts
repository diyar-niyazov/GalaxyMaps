/**
 * Immersive WebXR presentation (immersive-vr; Safari on visionOS, Quest browser, desktop
 * emulators). It reuses the map's WebGL renderer and catalog, builds a stationary scene in
 * metres around the viewer, and never writes to the viewer pose: head tracking is owned by the
 * runtime. Selection uses `select` events from any input source, including visionOS transient
 * pointers that only exist during a pinch.
 */
import * as THREE from "three";
import type { MapEngine } from "../map/MapEngine";
import type { DataBundle } from "../data/bundle";
import { positionAt } from "../data/bundle";
import type { CatalogObject } from "../lib/types";
import { createEarthMaterials } from "../map/earthMaterial";
import { primeMeridian } from "../lib/rotation";
import { unitFromRaDec } from "../lib/coords";
import { cross, normalize } from "../lib/vec";
import { formatDistance } from "../lib/format";
import { TYPE_LABEL } from "../lib/search";

export interface XrCallbacks {
  onSelect(id: string): void;
  onEnd(): void;
}

interface Pickable {
  mesh: THREE.Object3D;
  action: () => void;
}

const SKY_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec3 vDir;
  const float PI = 3.141592653589793;
  void main() {
    vec3 d = normalize(vDir);
    float ra = atan(d.y, d.x);
    float dec = asin(clamp(d.z, -1.0, 1.0));
    gl_FragColor = vec4(texture2D(uMap, vec2(fract(0.5 - ra / (2.0 * PI)), 0.5 + dec / PI)).rgb * 0.85, 1.0);
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

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g);
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

export class XrPresentation {
  private session: XRSession;
  private engine: MapEngine;
  private data: DataBundle;
  private cb: XrCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.05, 200);
  private content = new THREE.Group();
  private focusGroup = new THREE.Group();
  private card: THREE.Mesh | null = null;
  private pickables: Pickable[] = [];
  private disposables: { dispose(): void }[] = [];
  /** Resources of the currently focused object, released when the focus changes. */
  private focusDisposables: { dispose(): void }[] = [];
  private scope: { dispose(): void }[] | null = null;
  private refSpace: XRReferenceSpace | null = null;
  private jd: number;
  private focusId: string | null;
  private spinner: { mesh: THREE.Object3D; id: string } | null = null;
  private browse: CatalogObject[] = [];
  private browseIndex = 0;
  private savedSize = new THREE.Vector2();
  private savedRatio = 1;

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
    const r = this.renderer;
    r.getSize(this.savedSize);
    this.savedRatio = r.getPixelRatio();
    this.engine.setPaused(true);
    r.autoClear = true;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType("local");
    r.xr.setFramebufferScaleFactor(1);
    await r.xr.setSession(this.session);
    this.refSpace = r.xr.getReferenceSpace();
    this.buildScene();
    this.session.addEventListener("select", this.onSelect);
    this.session.addEventListener("end", this.onEnd);
    r.setAnimationLoop(this.frame);
  }

  end() {
    this.session.end().catch(() => this.onEnd());
  }

  private onEnd = () => {
    const r = this.renderer;
    this.session.removeEventListener("select", this.onSelect);
    this.session.removeEventListener("end", this.onEnd);
    r.setAnimationLoop(null);
    r.xr.enabled = false;
    r.autoClear = false;
    r.setPixelRatio(this.savedRatio);
    r.setSize(this.savedSize.x, this.savedSize.y, false);
    for (const d of [...this.disposables, ...this.focusDisposables]) d.dispose();
    this.disposables = [];
    this.focusDisposables = [];
    this.engine.setPaused(false);
    this.cb.onEnd();
  };

  private track<T extends { dispose(): void }>(d: T): T {
    (this.scope ?? this.disposables).push(d);
    return d;
  }

  private buildScene() {
    this.scene.background = new THREE.Color(0x02030a);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.08));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-2, 1, 1.5);
    this.scene.add(sun);

    // Sky sphere (2k texture for stereo rendering), seen from the inside.
    const skyTex = this.track(new THREE.TextureLoader().load("/textures/sky/milkyway_2k.jpg", (t) => { t.colorSpace = THREE.SRGBColorSpace; }));
    skyTex.generateMipmaps = false;
    skyTex.minFilter = THREE.LinearFilter;
    const skyMat = this.track(new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { uMap: { value: skyTex } }, side: THREE.BackSide, depthWrite: false }));
    const skyGeo = this.track(new THREE.SphereGeometry(80, 64, 32));
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));

    // Content sits 1.6 m ahead at eye height of a seated or standing user ("local" space origin is the head at start).
    this.content.position.set(0, -0.1, -1.6);
    this.scene.add(this.content);
    this.content.add(this.focusGroup);
    this.buildControls();
    this.showFocus(this.focusId ?? "earth");
  }

  private label(text: string, w = 512, h = 96, size = 40, bg = "rgba(255,255,255,0.92)", fg = "#1f2937") {
    const tex = this.track(canvasTexture(w, h, (g) => {
      g.fillStyle = bg;
      const r = h / 2;
      g.beginPath();
      g.roundRect(0, 0, w, h, r);
      g.fill();
      g.fillStyle = fg;
      g.font = `600 ${size}px Inter, system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, w / 2, h / 2 + 2);
    }));
    const mat = this.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    const geo = this.track(new THREE.PlaneGeometry(w / 1000, h / 1000));
    return new THREE.Mesh(geo, mat);
  }

  private buildControls() {
    const bar = new THREE.Group();
    bar.position.set(0, -0.55, 0.35);
    bar.rotation.x = -0.35;
    const buttons: [string, () => void][] = [
      ["Focus", () => this.focusId && this.cb.onSelect(this.focusId)],
      ["Next", () => this.next(1)],
      ["Smaller", () => this.content.scale.multiplyScalar(0.8)],
      ["Larger", () => this.content.scale.multiplyScalar(1.25)],
      ["Recenter", () => this.recenter()],
      ["Exit VR", () => this.end()],
    ];
    buttons.forEach(([text, action], i) => {
      const b = this.label(text, 300, 96, 38, text === "Exit VR" ? "rgba(47,111,237,0.95)" : "rgba(255,255,255,0.92)", text === "Exit VR" ? "#ffffff" : "#1f2937");
      b.position.set((i - (buttons.length - 1) / 2) * 0.33, 0, 0);
      bar.add(b);
      this.pickables.push({ mesh: b, action });
    });
    this.content.add(bar);
  }

  /** Explicit recenter: move content in front of the current head pose, once. */
  private recenter() {
    const xrCam = this.renderer.xr.getCamera();
    const pos = new THREE.Vector3().setFromMatrixPosition(xrCam.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(xrCam.matrixWorld));
    dir.y = 0;
    dir.normalize();
    this.content.position.copy(pos).addScaledVector(dir, 1.6).add(new THREE.Vector3(0, -0.1, 0));
    this.content.lookAt(pos.x, this.content.position.y, pos.z);
  }

  private next(step: number) {
    if (!this.browse.length) return;
    this.browseIndex = (this.browseIndex + step + this.browse.length) % this.browse.length;
    const o = this.browse[this.browseIndex];
    this.showFocus(o.id);
    this.cb.onSelect(o.id);
  }

  /** Focused object in the centre with up to 12 related destinations around it. */
  private showFocus(id: string) {
    const obj = this.data.byId.get(id) ?? this.data.byId.get("earth")!;
    this.focusId = obj.id;
    for (const c of [...this.focusGroup.children]) this.focusGroup.remove(c);
    if (this.card) this.content.remove(this.card);
    this.card = null;
    for (const d of this.focusDisposables) d.dispose();
    this.focusDisposables = [];
    this.scope = this.focusDisposables;
    this.pickables = this.pickables.filter((p) => !this.focusGroupHas(p.mesh));
    this.spinner = null;

    const R = 0.28;
    const geo = this.track(new THREE.SphereGeometry(1, 64, 48));
    let main: THREE.Object3D;
    if (obj.id === "earth") {
      const mats = createEarthMaterials("low", () => {});
      this.track(mats.surface);
      this.track(mats.halo);
      const sunDir = new THREE.Vector3(-2, 1, 1.5).normalize();
      (mats.surface.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
      main = new THREE.Mesh(geo, mats.surface);
    } else if (obj.display.texture) {
      const tex = this.track(new THREE.TextureLoader().load(`/textures/${obj.display.texture}`, (t) => { t.colorSpace = THREE.SRGBColorSpace; }));
      main = new THREE.Mesh(geo, this.track(obj.id === "sun" ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })));
    } else {
      main = new THREE.Mesh(geo, this.track(new THREE.MeshBasicMaterial({ color: new THREE.Color(obj.display.color) })));
    }
    main.scale.setScalar(R);
    const holder = new THREE.Group();
    if (obj.display.pole) {
      // Orient the spin axis using the IAU pole (ICRF) mapped into the XR frame (ICRF z → +Y).
      const p = unitFromRaDec(obj.display.pole.ra, obj.display.pole.dec);
      const node = normalize(cross([0, 0, 1], p));
      const toXr = (v: number[]) => new THREE.Vector3(-v[1], v[2], -v[0]);
      const Y = toXr(p), X = toXr(node), Z = new THREE.Vector3().crossVectors(X, Y);
      holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    }
    holder.add(main);
    this.focusGroup.add(holder);
    this.spinner = { mesh: main, id: obj.id };
    const name = this.label(obj.name, 640, 110, 52);
    name.position.set(0, R + 0.12, 0);
    this.focusGroup.add(name);

    // Related destinations: children, else siblings, placed on a ring (directions schematic, sizes not to scale).
    const children = this.data.catalog.objects.filter((o) => o.parentId === obj.id && o.featured);
    const siblings = obj.parentId ? this.data.catalog.objects.filter((o) => o.parentId === obj.parentId && o.id !== obj.id && o.featured) : [];
    const related = (children.length ? children : siblings).sort((a, b) => b.display.priority - a.display.priority).slice(0, 12);
    this.browse = related.length ? [obj, ...related] : this.data.catalog.objects.filter((o) => o.highlight && o.position).slice(0, 30);
    this.browseIndex = 0;
    related.forEach((o, i) => {
      const a = (i / related.length) * Math.PI * 2;
      const s = new THREE.Mesh(geo, this.track(new THREE.MeshBasicMaterial({ color: new THREE.Color(o.display.color) })));
      s.scale.setScalar(0.035);
      s.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.16, Math.sin(a) * 0.3);
      this.focusGroup.add(s);
      const l = this.label(o.name, 420, 80, 34, "rgba(15,23,42,0.75)", "#ffffff");
      l.scale.setScalar(0.6);
      l.position.copy(s.position).add(new THREE.Vector3(0, 0.06, 0));
      this.focusGroup.add(l);
      const act = () => { this.showFocus(o.id); this.cb.onSelect(o.id); };
      this.pickables.push({ mesh: s, action: act }, { mesh: l, action: act });
    });
    this.buildCard(obj);
    this.scope = null;
  }

  private focusGroupHas(m: THREE.Object3D) {
    let p: THREE.Object3D | null = m;
    while (p) {
      if (p === this.focusGroup) return true;
      p = p.parent;
    }
    return false;
  }

  /** Minimal readable spatial card built from the same record as the page card. */
  private buildCard(obj: CatalogObject) {
    const pos = positionAt(this.data, obj, this.jd);
    const earth = positionAt(this.data, this.data.byId.get("earth")!, this.jd);
    const dist = pos && earth && obj.id !== "earth" ? formatDistance(Math.hypot(pos[0] - earth[0], pos[1] - earth[1], pos[2] - earth[2])) : obj.id === "earth" ? "You are here" : null;
    const tex = this.track(canvasTexture(900, 620, (g) => {
      g.fillStyle = "rgba(255,255,255,0.95)";
      g.beginPath();
      g.roundRect(0, 0, 900, 620, 36);
      g.fill();
      g.fillStyle = "#111827";
      g.font = "700 56px Inter, system-ui, sans-serif";
      g.fillText(obj.name, 44, 92);
      g.fillStyle = "#4b5563";
      g.font = "500 30px Inter, system-ui, sans-serif";
      g.fillText(`${TYPE_LABEL[obj.type]} · ${obj.subtitle}`.slice(0, 54), 44, 142);
      g.fillStyle = "#1f2937";
      g.font = "400 30px Inter, system-ui, sans-serif";
      if (obj.summary) wrapText(g, obj.summary.text, 44, 210, 812, 40, 4);
      let y = 400;
      const facts = [...(dist ? [{ label: "From Earth (map date)", value: dist }] : []), ...obj.facts].slice(0, 4);
      g.font = "500 26px Inter, system-ui, sans-serif";
      for (const f of facts) {
        g.fillStyle = "#6b7280";
        g.fillText(f.label, 44, y);
        g.fillStyle = "#111827";
        g.fillText(f.value.slice(0, 40), 400, y);
        y += 46;
      }
      if (obj.summary) {
        g.fillStyle = "#9ca3af";
        g.font = "400 22px Inter, system-ui, sans-serif";
        g.fillText("Text: Wikipedia (CC BY-SA 4.0) · GalaxyMaps catalog", 44, 598);
      }
    }));
    const mat = this.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    const geo = this.track(new THREE.PlaneGeometry(0.72, 0.496));
    this.card = new THREE.Mesh(geo, mat);
    this.card.position.set(-0.95, 0.05, 0.25);
    this.card.rotation.y = 0.45;
    this.content.add(this.card);
  }

  private onSelect = (e: XRInputSourceEvent) => {
    if (!this.refSpace) return;
    const pose = e.frame.getPose(e.inputSource.targetRaySpace, this.refSpace);
    if (!pose) return;
    const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
    const origin = new THREE.Vector3().setFromMatrixPosition(m);
    const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(new THREE.Matrix4().extractRotation(m)).normalize();
    const ray = new THREE.Raycaster(origin, dir, 0, 20);
    const hits = ray.intersectObjects(this.pickables.map((p) => p.mesh), false);
    if (!hits.length) return;
    this.pickables.find((p) => p.mesh === hits[0].object)?.action();
  };

  private frame = (time: number) => {
    // Simulated rotation only; the observer stays put.
    if (this.spinner) {
      this.spinner.mesh.rotation.y = primeMeridian(this.spinner.id, this.jd + (time / 86_400_000) * 600);
    }
    this.renderer.render(this.scene, this.camera);
  };
}
