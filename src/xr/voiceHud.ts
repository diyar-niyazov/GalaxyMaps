/**
 * Grok Voice inside VR: a small panel that rests below the line of sight and follows the body
 * lazily, showing whether Grok is listening or speaking and a live caption. Look at it and pinch
 * to start the conversation, or to mute and unmute.
 */
import * as THREE from "three";
import { useVoice } from "../state/voice";
import { useStore } from "../state/store";
import { canvasFont } from "../lib/fonts";

const W = 1024, H = 236;
const SIZE_M: [number, number] = [0.46, 0.106];
const DISTANCE_M = 0.95;
const DROP_RAD = 0.42;
/** The panel re-centres once the head has turned this far away from it. */
const FOLLOW_RAD = 0.5;

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
  // Keep the newest words: captions grow at the end.
  return lines.length > maxLines ? ["…" + lines.slice(-maxLines)[0], ...lines.slice(-maxLines + 1)] : lines;
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
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false });
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

  /** Look at the panel and pinch: start the conversation, or mute/unmute a live one. */
  activate() {
    const v = useVoice.getState();
    if (v.status === "live") v.toggleMute();
    else if (v.status !== "connecting") void v.start();
  }

  /** Is the ray from `origin` along `dir` on the panel? */
  hit(origin: THREE.Vector3, dir: THREE.Vector3) {
    if (!this.node.visible) return false;
    const to = this.node.position.clone().sub(origin);
    const d = to.length();
    return dir.angleTo(to) < Math.atan(Math.hypot(SIZE_M[0], SIZE_M[1]) / 2 / d) * 0.9;
  }

  update(head: THREE.Vector3, forward: THREE.Vector3, time: number, hover: boolean) {
    const yaw = Math.atan2(forward.x, -forward.z);
    if (this.yaw == null || Math.abs(Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw))) > FOLLOW_RAD) this.yaw = yaw;
    else this.yaw += Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw)) * 0.02;
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(DROP_RAD), -Math.sin(DROP_RAD), -Math.cos(this.yaw) * Math.cos(DROP_RAD));
    this.node.position.copy(head).addScaledVector(dir, DISTANCE_M);
    this.node.lookAt(head);
    if (hover !== this.hover) { this.hover = hover; this.dirty = true; }
    const v = useVoice.getState();
    // The level meter animates while live; otherwise redraw only on change.
    if ((this.dirty || (v.status === "live" && !v.muted)) && time - this.lastDraw > 80) {
      this.draw();
      this.lastDraw = time;
      this.dirty = false;
    }
  }

  private draw() {
    const g = this.canvas.getContext("2d")!;
    const v = useVoice.getState();
    g.clearRect(0, 0, W, H);
    g.fillStyle = this.hover ? "rgba(26,40,70,0.9)" : "rgba(10,16,30,0.78)";
    g.beginPath();
    g.roundRect(4, 4, W - 8, H - 8, 48);
    g.fill();
    if (this.hover) { g.strokeStyle = "rgba(138,182,248,0.9)"; g.lineWidth = 4; g.stroke(); }

    const live = v.status === "live";
    const color = v.status === "error" ? "#ff7a7a" : !live ? "#c9d4ea" : v.muted ? "#7d8aa3" : v.speaking ? "#8ab6f8" : "#6fe3a1";
    const cx = 118, cy = H / 2;
    if (live && !v.muted) {
      g.fillStyle = `${color}33`;
      g.beginPath();
      g.arc(cx, cy, 52 + Math.min(1, v.level * 3) * 30, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, cy, 48, 0, Math.PI * 2);
    g.fill();
    // Microphone glyph
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
    if (v.muted) {
      g.beginPath();
      g.moveTo(cx - 30, cy - 30);
      g.lineTo(cx + 30, cy + 30);
      g.stroke();
    }

    const status = v.status === "connecting" ? "Connecting to Grok…"
      : v.status === "error" ? `Voice unavailable${v.detail ? `: ${v.detail}` : ""}`
      : !live ? "Look here and pinch — Grok will talk with you"
      : v.muted ? "Muted · pinch here to unmute"
      : v.speaking ? "Grok is speaking" : v.listening ? "Listening…" : "Grok is with you · just talk";
    g.fillStyle = "#ffffff";
    g.font = canvasFont("600 40px");
    g.textBaseline = "alphabetic";
    g.fillText(status, 200, 84, W - 240);

    const last = [...useStore.getState().guide].reverse().find((m) => m.role === "user" || m.role === "assistant");
    const caption = v.partial || (live ? last?.text ?? "" : v.micNote) || (live ? "“Take me to Saturn.” “What am I looking at?”" : "Voice stays on for the whole flight.");
    g.fillStyle = last?.role === "user" && !v.partial ? "#a9b6cc" : "#e8eefc";
    g.font = canvasFont("400 32px");
    wrap(g, caption, W - 240, 3).forEach((l, i) => g.fillText(l, 200, 132 + i * 38, W - 240));
    this.texture.needsUpdate = true;
  }
}
