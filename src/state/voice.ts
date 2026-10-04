/**
 * App-wide voice control. The live Grok voice session lives here rather than in a panel, so desktop
 * can keep listening while you move around, VR can switch to push-to-talk, and any surface can
 * start, mute or end it.
 */
import { create } from "zustand";
import { GrokVoiceSession, type VoiceStatus } from "../ai/grokVoice";
import { micErrorMessage, recordUtterance, setPreferredMic } from "../ai/audio";
import { stopSpeaking } from "../lib/speech";
import { useStore } from "./store";
import { announce } from "./announcer";
import { onXrContext } from "../xr/bridge";

interface VoiceState {
  status: VoiceStatus;
  detail: string;
  micNote: string;
  micLabel: string;
  level: number;
  listening: boolean;
  speaking: boolean;
  partial: string;
  muted: boolean;
  /** Push-to-talk is open (VR mic toggle is unmuted). */
  holding: boolean;
  /** One-shot dictation (Grok speech-to-text) in progress. */
  dictation: "idle" | "recording" | "transcribing";
  start(opts?: { pushToTalk?: boolean }): Promise<void>;
  stop(): void;
  toggle(): void;
  toggleMute(): void;
  setPushToTalk(on: boolean): void;
  beginTalk(): void;
  endTalk(opts?: { send?: boolean }): void;
  /** VR mic toggle: unmute to talk, unmute-again to send. */
  toggleTalk(): void;
  interrupt(): void;
  replay(): boolean;
  sendText(text: string): boolean;
  /** Have Grok speak without logging a user line (VR welcome). */
  speakAsGuide(instructions: string): boolean;
  /** Ends the live session after the current answer finishes playing. */
  endAfterSpeaking(): void;
  chooseMic(id: string): Promise<void>;
  dictate(onText: (text: string) => void): Promise<void>;
  stopDictation(): void;
}

let session: GrokVoiceSession | null = null;
let dictation: { stop(): void } | null = null;
/** Pinch arrived while the voice socket was still connecting. */
let wantTalk = false;

const logTool = (name: string, args: unknown) =>
  useStore.getState().pushGuide({ role: "tool", text: `${name}(${args && Object.keys(args as object).length ? JSON.stringify(args) : ""})`, origin: "app" });

export const useVoice = create<VoiceState>((set, get) => ({
  status: "idle", detail: "", micNote: "", micLabel: "", level: 0, listening: false, speaking: false, partial: "", muted: false, holding: false, dictation: "idle",

  start: async (opts) => {
    if (session) {
      if (opts?.pushToTalk) session.setPushToTalk(true);
      return;
    }
    stopSpeaking();
    get().stopDictation();
    set({ micNote: "", detail: "", muted: !!opts?.pushToTalk, partial: "", holding: false });
    const s = new GrokVoiceSession({
      onStatus: (status, detail) => {
        if (session !== s) return;
        set({ status, detail: detail ?? "" });
        if (status === "live") {
          announce("Grok voice is live. Speak to control GalaxyMaps, or type a message.");
          if (wantTalk) { wantTalk = false; get().beginTalk(); }
        } else if (status === "error") {
          wantTalk = false;
          announce(`Voice error: ${detail ?? "connection problem"}`, true);
        } else if (status === "idle") {
          session = null;
          wantTalk = false;
          set({ listening: false, speaking: false, partial: "", level: 0, holding: false });
        }
      },
      onUserText: (t) => useStore.getState().pushGuide({ role: "user", text: t }),
      onAssistantText: (t, final) => {
        if (!final) return set({ partial: t });
        set({ partial: "" });
        if (t.trim()) useStore.getState().pushGuide({ role: "assistant", text: t, origin: "grok" });
      },
      onTool: logTool,
      onSpeaking: (speaking) => set({ speaking }),
      onListening: (listening) => set({ listening }),
      onMicError: (m) => { set({ micNote: m }); announce(m, true); },
      onMic: (label) => set({ micLabel: label, micNote: "" }),
      onLevel: (level) => { if (Math.abs(level - get().level) > 0.02 || level === 0) set({ level }); },
    });
    session = s;
    try {
      await s.connect(true, { pushToTalk: !!opts?.pushToTalk });
    } catch (e) {
      if (session === s) session = null;
      wantTalk = false;
      s.close();
      set({ status: "error", detail: (e as Error).message });
    }
  },

  stop: () => {
    const s = session;
    session = null;
    wantTalk = false;
    s?.close();
    set({ status: "idle", listening: false, speaking: false, partial: "", level: 0, micLabel: "", holding: false });
    announce("Voice session ended.");
  },

  toggle: () => (session ? get().stop() : void get().start()),

  setPushToTalk: (on) => { session?.setPushToTalk(on); if (on) set({ muted: true, holding: false }); },
  beginTalk: () => { wantTalk = false; session?.beginTalk(); set({ holding: true, muted: false, listening: true }); },
  endTalk: (opts) => { session?.endTalk(opts); set({ holding: false, muted: true, listening: false }); },
  toggleTalk: () => {
    if (get().holding) { wantTalk = false; get().endTalk(); return; }
    if (get().status === "connecting" || get().status === "idle" || get().status === "error" || !session) {
      wantTalk = true;
      if (get().status !== "connecting") void get().start({ pushToTalk: true });
      return;
    }
    get().interrupt();
    get().beginTalk();
  },

  toggleMute: () => {
    const muted = !get().muted;
    session?.setMuted(muted);
    set({ muted });
    announce(muted ? "Microphone muted." : "Microphone on.");
  },

  interrupt: () => session?.interrupt(),
  replay: () => session?.replay() ?? false,
  sendText: (text) => {
    if (!session || get().status !== "live") return false;
    session.sendText(text);
    return true;
  },
  speakAsGuide: (instructions) => {
    if (!session || get().status !== "live") return false;
    session.speakAsGuide(instructions);
    return true;
  },
  endAfterSpeaking: () => session?.endAfterSpeaking(),

  chooseMic: async (id) => {
    setPreferredMic(id);
    if (session?.micOn) await session.restartMic();
  },

  dictate: async (onText) => {
    if (dictation) return get().stopDictation();
    stopSpeaking();
    set({ dictation: "recording", micNote: "" });
    const rec = recordUtterance({
      onLevel: (level) => { if (Math.abs(level - get().level) > 0.02 || level === 0) set({ level }); },
      onSilent: (label) => set({ micNote: `No sound is coming from "${label}". Check that it isn't muted, or choose another microphone in Voice settings.` }),
    });
    dictation = rec;
    let wav: Blob | null;
    try {
      wav = await rec.result;
    } catch (e) {
      dictation = null;
      set({ dictation: "idle", level: 0, micNote: micErrorMessage(e) });
      return;
    }
    dictation = null;
    set({ level: 0 });
    if (!wav) { set({ dictation: "idle", micNote: get().micNote || "Didn't hear anything. Try again a little closer to the microphone." }); return; }
    try {
      set({ dictation: "transcribing" });
      const r = await fetch("/api/stt", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? `Transcription failed (HTTP ${r.status})`);
      set({ dictation: "idle" });
      if (body.text) onText(body.text);
      else set({ micNote: "Grok couldn't make out any words. Try again." });
    } catch (e) {
      set({ dictation: "idle", micNote: `Transcription failed: ${(e as Error).message}` });
    }
  },

  stopDictation: () => { dictation?.stop(); },
}));

useStore.subscribe((s, prev) => { if (s.selectedId !== prev.selectedId) session?.refreshContext(); });
onXrContext(() => session?.refreshContext());
