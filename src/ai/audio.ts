/**
 * Shared browser audio: one AudioContext for Grok voice playback, text-to-speech and microphone
 * capture, plus microphone selection and level metering.
 *
 * The context runs at the device's native rate. Forcing a rate (e.g. 24 kHz) breaks microphone
 * capture in Firefox, which refuses to connect a MediaStream to a context with a different rate;
 * audio is resampled in JavaScript instead.
 */

let ctx: AudioContext | null = null;

/** Create or resume the shared context. Call synchronously inside a user gesture (Safari requires it). */
export function primeAudio(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  if (!ctx || ctx.state === "closed") ctx = new AudioContext({ latencyHint: "interactive" });
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

export function audioContext(): AudioContext | null {
  return ctx && ctx.state !== "closed" ? ctx : null;
}

/** Unlock audio on the first pointer or key gesture anywhere, so later async playback is allowed. */
export function installAudioUnlock(): void {
  if (typeof window === "undefined") return;
  const unlock = () => {
    const c = primeAudio();
    if (c?.state === "running") for (const t of ["pointerdown", "keydown", "touchend"]) window.removeEventListener(t, unlock, true);
  };
  for (const t of ["pointerdown", "keydown", "touchend"]) window.addEventListener(t, unlock, true);
}

export function micErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "InsecureContext") return "The microphone needs a secure page. Open GalaxyMaps over HTTPS or on localhost, or keep typing.";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access is blocked. Allow the microphone for this site in your browser's site settings (and in your system privacy settings), then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found. Connect one or choose another in Voice settings, or keep typing.";
  if (name === "NotReadableError" || name === "AbortError") return "The microphone is busy or unavailable. Close other apps using it, or choose another microphone in Voice settings.";
  return `The microphone could not start${(e as Error)?.message ? ` (${(e as Error).message})` : ""}. You can keep typing.`;
}

const MIC_KEY = "galaxymaps.mic.v1";
export const preferredMic = (): string => { try { return localStorage.getItem(MIC_KEY) ?? ""; } catch { return ""; } };
export const setPreferredMic = (id: string) => { try { if (id) localStorage.setItem(MIC_KEY, id); else localStorage.removeItem(MIC_KEY); } catch { /* session only */ } };

export interface MicInfo { id: string; label: string }

/** Audio inputs; labels are empty until the user has granted microphone access once. */
export async function listMics(): Promise<MicInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "audioinput" && d.deviceId).map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
}

/** Streaming linear-interpolation resampler for mono Float32 audio. */
export class Resampler {
  private pos = 0;
  private prev = 0;
  private readonly step: number;
  constructor(readonly from: number, readonly to: number) {
    this.step = from / to;
  }
  push(input: Float32Array): Float32Array {
    if (this.from === this.to) return input;
    const out: number[] = [];
    // `pos` indexes the virtual sequence [prev, ...input]; index 0 is the last sample of the previous chunk.
    while (this.pos < input.length) {
      const i = Math.floor(this.pos), frac = this.pos - i;
      const a = i === 0 ? this.prev : input[i - 1], b = input[i];
      out.push(a + (b - a) * frac);
      this.pos += this.step;
    }
    this.pos -= input.length;
    if (input.length) this.prev = input[input.length - 1];
    return Float32Array.from(out);
  }
}

export function encodeWav(chunks: Float32Array[], rate: number): Blob {
  const n = chunks.reduce((s, c) => s + c.length, 0);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 2, true);
  let o = 44;
  for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, c[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

export function rms(f: Float32Array): number {
  let s = 0;
  for (let i = 0; i < f.length; i++) s += f[i] * f[i];
  return f.length ? Math.sqrt(s / f.length) : 0;
}

const WORKLET = `
class GmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.len = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      this.buf.push(new Float32Array(ch)); this.len += ch.length;
      if (this.len >= 1024) {
        const out = new Float32Array(this.len); let o = 0;
        for (const b of this.buf) { out.set(b, o); o += b.length; }
        this.port.postMessage(out, [out.buffer]); this.buf = []; this.len = 0;
      }
    }
    return true;
  }
}
registerProcessor("gm-capture", GmCapture);`;

const workletLoaded = new WeakMap<AudioContext, Promise<void>>();
function loadWorklet(c: AudioContext): Promise<void> {
  let p = workletLoaded.get(c);
  if (!p) {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    p = c.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    workletLoaded.set(c, p);
  }
  return p;
}

export interface MicOptions {
  /** Output sample rate delivered to onChunk. */
  rate: number;
  onChunk(samples: Float32Array): void;
  /** Smoothed input level 0–1, about 20 times a second. */
  onLevel?(level: number): void;
  /** No signal at all for a few seconds: likely a muted or wrong input device. */
  onSilent?(label: string): void;
}

/** Live microphone capture through the shared context. */
export class MicCapture {
  private node: AudioWorkletNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private sink: GainNode | null = null;
  private level = 0;
  private peak = 0;
  private silentTimer: ReturnType<typeof setTimeout> | null = null;
  private lastLevelAt = 0;
  enabled = true;

  private constructor(readonly stream: MediaStream, readonly label: string) {}

  static async open(opts: MicOptions): Promise<MicCapture> {
    if (typeof window !== "undefined" && !window.isSecureContext) throw Object.assign(new Error("insecure"), { name: "InsecureContext" });
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("getUserMedia unavailable"), { name: "NotFoundError" });
    const c = primeAudio();
    if (!c) throw new Error("Web Audio is not supported in this browser");
    const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
    const want = preferredMic();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: want ? { ...base, deviceId: { exact: want } } : base });
    } catch (e) {
      const name = (e as { name?: string }).name;
      if (!want || (name !== "OverconstrainedError" && name !== "NotFoundError")) throw e;
      // The saved device is gone; fall back to the system default.
      setPreferredMic("");
      stream = await navigator.mediaDevices.getUserMedia({ audio: base });
    }
    const track = stream.getAudioTracks()[0];
    const mic = new MicCapture(stream, track?.label || "Microphone");
    try {
      await mic.start(c, opts);
    } catch (e) {
      mic.close();
      throw e;
    }
    return mic;
  }

  private async start(c: AudioContext, opts: MicOptions) {
    if (c.state !== "running") await c.resume().catch(() => {});
    await loadWorklet(c);
    this.src = c.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(c, "gm-capture");
    // Keep the capture node pulled by the render graph without making it audible.
    this.sink = c.createGain();
    this.sink.gain.value = 0;
    this.node.connect(this.sink).connect(c.destination);
    const resampler = new Resampler(c.sampleRate, opts.rate);
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      const r = rms(e.data);
      this.level = Math.max(r, this.level * 0.85);
      this.peak = Math.max(this.peak, r);
      const now = performance.now();
      if (opts.onLevel && now - this.lastLevelAt > 50) {
        this.lastLevelAt = now;
        opts.onLevel(Math.min(1, this.level * 6));
      }
      if (this.enabled) opts.onChunk(resampler.push(e.data));
    };
    this.src.connect(this.node);
    if (opts.onSilent) this.silentTimer = setTimeout(() => { if (this.peak < 0.0005) opts.onSilent!(this.label); }, 3500);
  }

  close() {
    if (this.silentTimer) clearTimeout(this.silentTimer);
    this.src?.disconnect();
    this.node?.disconnect();
    this.sink?.disconnect();
    if (this.node) this.node.port.onmessage = null;
    this.stream.getTracks().forEach((t) => t.stop());
    this.node = this.src = this.sink = null;
  }
}

/**
 * Record one spoken utterance: stops after ~1.2 s of silence following speech, after `maxMs`, or
 * when `stop()` is called. Resolves with 16 kHz WAV, or null if nothing was said.
 */
export function recordUtterance(opts: { maxMs?: number; onLevel?(level: number): void; onSilent?(label: string): void } = {}) {
  const RATE = 16000;
  const chunks: Float32Array[] = [];
  let heard = false, quietMs = 0, totalMs = 0, done = false;
  let finish: (() => void) | null = null;
  let mic: MicCapture | null = null;
  const result = (async () => {
    mic = await MicCapture.open({
      rate: RATE,
      onLevel: opts.onLevel,
      onSilent: opts.onSilent,
      onChunk: (s) => {
        if (done) return;
        chunks.push(s);
        const ms = (s.length / RATE) * 1000;
        totalMs += ms;
        if (rms(s) > 0.012) { heard = true; quietMs = 0; } else quietMs += ms;
        if ((heard && quietMs > 1200) || totalMs > (opts.maxMs ?? 30_000) || (!heard && totalMs > 8000)) finish?.();
      },
    });
    await new Promise<void>((r) => { finish = r; if (done) r(); });
    done = true;
    mic.close();
    return heard ? encodeWav(chunks, RATE) : null;
  })();
  return {
    result,
    stop: () => { done = true; finish?.(); },
  };
}
