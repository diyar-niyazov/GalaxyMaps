/**
 * Live Grok Voice (xAI Speech to Speech API) client.
 *
 * - The permanent XAI_API_KEY stays on our server; the browser receives a short-lived
 *   ephemeral client secret from POST /api/voice/session.
 * - The browser connects with the `xai-client-secret.<token>` WebSocket subprotocol.
 * - Grok can only act through the validated tools in ./tools.ts.
 */
import { TOOL_DEFS, runTool } from "./tools";
import { useStore } from "../state/store";

export type VoiceStatus = "idle" | "connecting" | "live" | "error";

export interface VoiceCallbacks {
  onStatus(s: VoiceStatus, detail?: string): void;
  onUserText(text: string): void;
  onAssistantText(text: string, final: boolean): void;
  onTool(name: string, args: unknown, result: unknown): void;
  onSpeaking(speaking: boolean): void;
}

const INSTRUCTIONS = `You are the GalaxyMaps guide, a friendly navigator in a Google-Maps-style app for exploring space.

Rules:
- Only talk about destinations the tools return. If searchObjects finds nothing, say the object is not in the GalaxyMaps catalog. Never invent objects, IDs, distances or travel times.
- Always use tools for numbers. Read back distances and times exactly as the tools format them; do not compute your own.
- To route, first call searchObjects for each place to get IDs, then setRoute. Default origin is Earth.
- Never call a stop "on the way" unless suggestStops or addStop says onTheWay is true.
- Planet-to-planet routes are idealized orbital transfers; say "idealized". Light-speed and Voyager 1 times are direct-distance benchmarks, not mission plans.
- If a tool returns an error or says routing is unavailable, explain the reason briefly.
- Keep spoken answers short: two or three sentences.`;

const WORKLET = `
class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.len = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      this.buf.push(new Float32Array(ch)); this.len += ch.length;
      if (this.len >= 2400) {
        const out = new Float32Array(this.len); let o = 0;
        for (const b of this.buf) { out.set(b, o); o += b.length; }
        this.port.postMessage(out, [out.buffer]); this.buf = []; this.len = 0;
      }
    }
    return true;
  }
}
registerProcessor("capture", Capture);`;

const RATE = 24000;

function floatToPcm16Base64(f: Float32Array): string {
  const bytes = new Uint8Array(f.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function pcm16Base64ToFloat(b64: string): Float32Array {
  const bin = atob(b64);
  const n = bin.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    out[i] = v / 0x8000;
  }
  return out;
}

export class GrokVoiceSession {
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private mic: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private playHead = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private assistantText = "";
  private calls: Promise<void>[] = [];
  private closed = false;

  constructor(private cb: VoiceCallbacks) {}

  async connect(withMic: boolean) {
    this.cb.onStatus("connecting");
    const res = await fetch("/api/voice/session", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.value) throw new Error(body.error ?? `Voice session unavailable (HTTP ${res.status})`);
    this.ctx = new AudioContext({ sampleRate: RATE });
    const ws = new WebSocket(`wss://api.x.ai/v1/realtime?model=${encodeURIComponent(body.model)}`, [`xai-client-secret.${body.value}`]);
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("Could not connect to Grok Voice"));
    });
    ws.onmessage = (m) => this.onEvent(JSON.parse(typeof m.data === "string" ? m.data : ""));
    ws.onclose = () => {
      if (!this.closed) this.cb.onStatus("error", "Grok Voice connection closed");
      this.stopMic();
    };
    ws.onerror = () => this.cb.onStatus("error", "Grok Voice connection error");
    const names = (useStore.getState().data?.catalog.objects ?? [])
      .filter((o) => o.featured)
      .sort((a, b) => b.display.priority - a.display.priority)
      .map((o) => o.name.slice(0, 50))
      .slice(0, 100);
    this.send({
      type: "session.update",
      session: {
        voice: body.voice,
        instructions: INSTRUCTIONS,
        turn_detection: { type: "server_vad" },
        tools: TOOL_DEFS,
        audio: {
          input: { format: { type: "audio/pcm", rate: RATE }, transcription: { keyterms: names } },
          output: { format: { type: "audio/pcm", rate: RATE } },
        },
      },
    });
    if (withMic) await this.startMic();
    this.cb.onStatus("live");
  }

  private send(ev: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(ev));
  }

  async startMic() {
    if (!this.ctx || this.mic) return;
    this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = this.ctx.createMediaStreamSource(this.mic);
    this.node = new AudioWorkletNode(this.ctx, "capture");
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => this.send({ type: "input_audio_buffer.append", audio: floatToPcm16Base64(e.data) });
    src.connect(this.node);
  }

  stopMic() {
    this.node?.disconnect();
    this.node = null;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
  }

  get micOn() {
    return !!this.mic;
  }

  sendText(text: string) {
    this.send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
    this.send({ type: "response.create" });
  }

  private stopPlayback() {
    for (const s of this.sources) s.stop();
    this.sources.clear();
    this.playHead = 0;
    this.cb.onSpeaking(false);
  }

  private play(b64: string) {
    if (!this.ctx) return;
    const data = pcm16Base64ToFloat(b64);
    if (!data.length) return;
    const buf = this.ctx.createBuffer(1, data.length, RATE);
    buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    const start = Math.max(this.ctx.currentTime + 0.02, this.playHead);
    src.start(start);
    this.playHead = start + buf.duration;
    this.sources.add(src);
    this.cb.onSpeaking(true);
    src.onended = () => {
      this.sources.delete(src);
      if (!this.sources.size) this.cb.onSpeaking(false);
    };
  }

  private remainingPlaybackMs() {
    return this.ctx ? Math.max(0, (this.playHead - this.ctx.currentTime) * 1000) : 0;
  }

  private async onEvent(ev: any) {
    switch (ev.type) {
      case "response.output_audio.delta":
      case "response.audio.delta":
        this.play(ev.delta);
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        this.assistantText += ev.delta ?? "";
        this.cb.onAssistantText(this.assistantText, false);
        break;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
        this.cb.onAssistantText(ev.transcript ?? this.assistantText, true);
        this.assistantText = "";
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (ev.transcript) this.cb.onUserText(ev.transcript);
        break;
      case "input_audio_buffer.speech_started":
        this.stopPlayback();
        break;
      case "response.function_call_arguments.done": {
        let args: unknown = {};
        try {
          args = JSON.parse(ev.arguments || "{}");
        } catch {
          args = null;
        }
        const call = (async () => {
          const result = args === null ? { error: "Arguments were not valid JSON" } : await runTool(ev.name, args as Record<string, unknown>);
          this.cb.onTool(ev.name, args, result);
          this.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: ev.call_id, output: JSON.stringify(result) } });
        })();
        this.calls.push(call);
        break;
      }
      case "response.done": {
        if (!this.calls.length) break;
        const calls = this.calls;
        this.calls = [];
        await Promise.all(calls);
        // All results are in; let the current spoken turn finish before the follow-up response.
        setTimeout(() => this.send({ type: "response.create" }), this.remainingPlaybackMs());
        break;
      }
      case "error":
        this.cb.onStatus("error", ev.error?.message ?? "Grok Voice error");
        break;
    }
  }

  close() {
    this.closed = true;
    this.stopMic();
    this.stopPlayback();
    this.ws?.close();
    this.ctx?.close();
    this.ws = null;
    this.ctx = null;
    this.cb.onStatus("idle");
  }
}
