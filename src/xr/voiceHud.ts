/**
 * Mission Control mic in VR: a compact head-relative HUD at lower-center.
 * Look at it and pinch to unmute or mute. It stays in view from the first frame
 * and only damps when already in front, so it does not need a pan to become hittable.
 */
import * as THREE from "three";
import { useVoice } from "../state/voice";
import { useStore } from "../state/store";
import { canvasFont } from "../lib/fonts";

const W = 1024, H = 220;
const SIZE_M: [number, number] = [0.48, 0.12];
const DISTANCE_M = 0.82;
const DROP_RAD = 0.22;
const SNAP_RAD = 0.38;

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean), lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.length > maxLines ? ["…" + lines.slice(-maxLines)[0], ...lines.slice(-maxLines + 1)] : lines;
}

function offsetDir(yaw: number) {
  return new THREE.Vector3(Math.sin(yaw) * Math.cos(DROP_RAD), -Math.sin(DROP_RAD), -Math.cos(yaw) * Math.cos(DROP_RAD));
}

export class VoiceHud {
  readonly node: THREE.Mesh;
  private canvas = document.createElement("canvas");
  private texture: THREE.CanvasTexture;
  private dirty = true;
  private lastDraw = 0;
  private yaw: number | null = null;
  private unsub: (() => void)[];
  private hover = false;

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    this.node = new THREE.Mesh(new THREE.PlaneGeometry(...SIZE_M), mat);
    this.node.renderOrder = 30;
    const mark = () => { this.dirty = true; };
    this.unsub = [useVoice.subscribe(mark), useStore.subscribe((s, p) => { if (s.guide !== p.guide) mark(); })];
  }

  dispose() {
    for (const u of this.unsub) u();
    this.node.removeFromParent();
    this.node.geometry.dispose();
    (this.node.material as THREE.Material).dispose();
    this.texture.dispose();
  }

  /** Look + pinch toggles listening. Pinch again mutes and sends. */
  toggle() {
    useVoice.getState().toggleTalk();
  }

  /**
   * Place the panel under the current gaze. Snap if it is off-screen (including the first
   * frames when the XR camera pose is still settling); damp only when already in view.
   */
  follow(head: THREE.Vector3, forward: THREE.Vector3) {
    const yaw = Math.atan2(forward.x, -forward.z);
    const placed = offsetDir(this.yaw ?? yaw);
    if (this.yaw == null || forward.angleTo(placed) > SNAP_RAD) this.yaw = yaw;
    else this.yaw += Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw)) * 0.08;
    const dir = offsetDir(this.yaw);
    this.node.position.copy(head).addScaledVector(dir, DISTANCE_M);
    this.node.lookAt(head);
    this.node.updateWorldMatrix(true, false);
  }

  hit(origin: THREE.Vector3, dir: THREE.Vector3) {
    if (!this.node.visible) return false;
    this.node.updateWorldMatrix(true, false);
    const to = this.node.position.clone().sub(origin);
    const dist = to.dot(dir);
    if (dist < 0.15) return false;
    const local = this.node.worldToLocal(origin.clone().addScaledVector(dir, dist));
    const hx = SIZE_M[0] / 2 * 1.5, hy = SIZE_M[1] / 2 * 2;
    if (Math.abs(local.x) <= hx && Math.abs(local.y) <= hy) return true;
    return dir.angleTo(to) < 0.22;
  }

  update(head: THREE.Vector3, forward: THREE.Vector3, time: number, hover: boolean) {
    this.follow(head, forward);
    if (hover !== this.hover) { this.hover = hover; this.dirty = true; }
    const v = useVoice.getState();
    const liveMeter = v.holding || v.speaking;
    if ((this.dirty || liveMeter) && time - this.lastDraw > 90) {
      this.draw();
      this.lastDraw = time;
      this.dirty = false;
    }
  }

  private draw() {
    const g = this.canvas.getContext("2d")!;
    const v = useVoice.getState();
    g.clearRect(0, 0, W, H);
    g.fillStyle = this.hover ? "rgba(26,40,70,0.92)" : "rgba(10,16,30,0.72)";
    g.beginPath();
    g.roundRect(4, 4, W - 8, H - 8, 48);
    g.fill();
    if (this.hover) { g.strokeStyle = "rgba(138,182,248,0.9)"; g.lineWidth = 4; g.stroke(); }

    const live = v.status === "live";
    const color = v.status === "error" ? "#ff7a7a"
      : v.status === "connecting" ? "#c9d4ea"
      : v.holding ? "#6fe3a1"
      : v.speaking ? "#8ab6f8"
      : !live ? "#c9d4ea"
      : "#7d8aa3";
    const cx = 118, cy = H / 2;
    if (v.holding) {
      g.fillStyle = `${color}33`;
      g.beginPath();
      g.arc(cx, cy, 52 + Math.min(1, v.level * 3) * 28, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, cy, 48, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#0a101e";
    g.beginPath();
    g.roundRect(cx - 13, cy - 30, 26, 42, 13);
    g.fill();
    g.strokeStyle = "#0a101e";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy - 2, 22, 0.15 * Math.PI, 0.85 * Math.PI);
    g.moveTo(cx, cy + 20);
    g.lineTo(cx, cy + 32);
    g.stroke();

    const status = v.status === "connecting" ? "Connecting to Grok…"
      : v.status === "error" ? `Voice unavailable${v.detail ? `: ${v.detail}` : ""}`
      : v.holding ? "Listening… pinch to send"
      : v.speaking ? "Grok is speaking"
      : v.status === "live" && v.partial ? "Thinking…"
      : !live ? "Look here · pinch to talk"
      : "Pinch to talk · pinch again to send";
    g.fillStyle = "#ffffff";
    g.font = canvasFont("600 38px");
    g.textBaseline = "alphabetic";
    g.fillText(status, 200, 80, W - 240);

    const last = [...useStore.getState().guide].reverse().find((m) => m.role === "user" || m.role === "assistant");
    const caption = (v.partial || last?.text || "").slice(0, 180);
    g.fillStyle = last?.role === "user" && !v.partial ? "#a9b6cc" : "#e8eefc";
    g.font = canvasFont("400 30px");
    if (caption) wrap(g, caption, W - 240, 2).forEach((l, i) => g.fillText(l, 200, 128 + i * 36, W - 240));
    else {
      g.fillStyle = "#8b95a8";
      g.fillText("“Take me to Saturn.”", 200, 128, W - 240);
    }
    this.texture.needsUpdate = true;
  }
}
