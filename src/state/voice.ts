/**
 * App-wide voice control. The live Grok voice session lives here rather than in a panel, so it keeps
 * listening while you move around the app, and any surface can start, mute or end it.
 */
import { create } from "zustand";
import { GrokVoiceSession, type VoiceStatus } from "../ai/grokVoice";
import { micErrorMessage, recordUtterance, setPreferredMic } from "../ai/audio";
import { stopSpeaking } from "../lib/speech";
import { useStore } from "./store";
import { announce } from "./announcer";

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
  /** One-shot dictation (Grok speech-to-text) in progress. */
  dictation: "idle" | "recording" | "transcribing";
  start(): Promise<void>;
  stop(): void;
  toggle(): void;
  toggleMute(): void;
  interrupt(): void;
  replay(): boolean;
  sendText(text: string): boolean;
  /** Ends the live session after the current answer finishes playing. */
  endAfterSpeaking(): void;
  chooseMic(id: string): Promise<void>;
  dictate(onText: (text: string) => void): Promise<void>;
  stopDictation(): void;
}

let session: GrokVoiceSession | null = null;
let dictation: { stop(): void } | null = null;

const logTool = (name: string, args: unknown) =>
  useStore.getState().pushGuide({ role: "tool", text: `${name}(${args && Object.keys(args as object).length ? JSON.stringify(args) : ""})`, origin: "app" });

export const useVoice = create<VoiceState>((set, get) => ({
  status: "idle", detail: "", micNote: "", micLabel: "", level: 0, listening: false, speaking: false, partial: "", muted: false, dictation: "idle",

  start: async () => {
    if (session) return;
    stopSpeaking();
    get().stopDictation();
    set({ micNote: "", detail: "", muted: false, partial: "" });
    const s = new GrokVoiceSession({
      onStatus: (status, detail) => {
        if (session !== s) return;
        set({ status, detail: detail ?? "" });
        if (status === "live") announce("Grok voice is live. Speak to control GalaxyMaps, or type a message.");
        else if (status === "error") announce(`Voice error: ${detail ?? "connection problem"}`, true);
        else if (status === "idle") {
          session = null;
          set({ listening: false, speaking: false, partial: "", level: 0 });
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
      await s.connect(true);
    } catch (e) {
      if (session === s) session = null;
      s.close();
      set({ status: "error", detail: (e as Error).message });
    }
  },

  stop: () => {
    const s = session;
    session = null;
    s?.close();
    set({ status: "idle", listening: false, speaking: false, partial: "", level: 0, micLabel: "" });
    announce("Voice session ended.");
  },

  toggle: () => (session ? get().stop() : void get().start()),

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
