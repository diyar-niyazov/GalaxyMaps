/**
 * Grok mic status in VR: a small head-locked pill at the bottom center of the view. It is not
 * interactive; voice is hands-free ("Grok, …"), so it only reports what the microphone is doing.
 */
import * as THREE from "three";
import { useVoice } from "../state/voice";
import { useStore } from "../state/store";
import { canvasFont } from "../lib/fonts";

const W = 640, H = 128;
const SIZE_M: [number, number] = [0.26, 0.052];
/** Head-space offset: centered, about 18° below the line of sight. */
const OFFSET = new THREE.Vector3(0, -0.33, -1);
const IDLE_OPACITY = 0.55;

export class VoiceHud {
  readonly node: THREE.Mesh;
  private canvas = document.createElement("canvas");
  private texture: THREE.CanvasTexture;
  private material: THREE.MeshBasicMaterial;
  private dirty = true;
  private lastDraw = 0;
  private unsub: (() => void)[];
  private tmp = new THREE.Vector3();

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, opacity: IDLE_OPACITY, depthTest: false, depthWrite: false });
    this.node = new THREE.Mesh(new THREE.PlaneGeometry(...SIZE_M), this.material);
    this.node.renderOrder = 30;
    this.node.frustumCulled = false;
    const mark = () => { this.dirty = true; };
    this.unsub = [useVoice.subscribe(mark), useStore.subscribe((s, p) => { if (s.guide !== p.guide) mark(); })];
  }

  dispose() {
    for (const u of this.unsub) u();
    this.node.removeFromParent();
    this.node.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }

  /** Lock to the head pose; redraw only when voice state changed. */
  update(head: THREE.Vector3, headQ: THREE.Quaternion, time: number) {
    this.node.position.copy(head).add(this.tmp.copy(OFFSET).applyQuaternion(headQ));
    this.node.quaternion.copy(headQ);
    if (this.dirty && time - this.lastDraw > 90) {
      this.draw();
      this.lastDraw = time;
      this.dirty = false;
    }
  }

  private draw() {
    const g = this.canvas.getContext("2d")!;
    const v = useVoice.getState();
    const live = v.status === "live";
    const active = !live || v.speaking || v.wake !== "idle" || !!v.partial;
    this.material.opacity = active ? 0.95 : IDLE_OPACITY;
    g.clearRect(0, 0, W, H);
    g.fillStyle = "rgba(8,13,26,0.78)";
    g.beginPath();
    g.roundRect(2, 2, W - 4, H - 4, (H - 4) / 2);
    g.fill();

    const color = v.status === "error" ? "#ff7a7a"
      : !live ? "#c9d4ea"
      : v.muted ? "#7d8aa3"
      : v.wake === "hearing" || v.wake === "armed" ? "#6fe3a1"
      : v.speaking || v.wake === "thinking" ? "#8ab6f8"
      : "#a9b6cc";
    const cx = 64, cy = H / 2;
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, cy, 38, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#0a101e";
    g.beginPath();
    g.roundRect(cx - 10, cy - 24, 20, 33, 10);
    g.fill();
    g.strokeStyle = "#0a101e";
    g.lineWidth = 5;
    g.beginPath();
    g.arc(cx, cy - 2, 17, 0.15 * Math.PI, 0.85 * Math.PI);
    g.moveTo(cx, cy + 15);
    g.lineTo(cx, cy + 25);
    g.stroke();

    const status = v.status === "connecting" ? "Connecting to Grok…"
      : v.status === "error" ? `Voice unavailable${v.detail ? `: ${v.detail}` : ""}`
      : !live ? "Grok voice is off"
      : v.muted ? "Mic muted"
      : v.speaking ? "Grok is speaking"
      : v.wake === "thinking" || v.partial ? "Thinking…"
      : v.wake === "armed" ? "Listening — go ahead"
      : v.wake === "hearing" ? "Hearing you…"
      : "Say “Grok, …” to ask";
    const x = 122, maxW = W - x - 34;
    g.fillStyle = "#ffffff";
    g.font = canvasFont("600 34px");
    g.textBaseline = "middle";
    const last = [...useStore.getState().guide].reverse().find((m) => m.role === "user" || m.role === "assistant");
    const caption = live ? (v.partial || last?.text || "").replace(/\s+/g, " ").trim() : "";
    if (!caption) {
      g.fillText(status, x, cy, maxW);
    } else {
      g.fillText(status, x, cy - 20, maxW);
      g.fillStyle = last?.role === "user" && !v.partial ? "#a9b6cc" : "#e8eefc";
      g.font = canvasFont("400 26px");
      g.fillText(caption.length > 60 ? `…${caption.slice(-59)}` : caption, x, cy + 22, maxW);
    }
    this.texture.needsUpdate = true;
  }
}
