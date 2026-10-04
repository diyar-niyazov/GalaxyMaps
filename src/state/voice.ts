/**
 * App-wide voice control. The live Grok voice session lives here rather than in a panel, so desktop
 * can keep listening while you move around, VR can switch to the hands-free "Grok, …" wake word,
 * and any surface can start, mute or end it.
 */
import { create } from "zustand";
import { GrokVoiceSession, type VoiceStatus } from "../ai/grokVoice";
import { micErrorMessage, recordUtterance, setPreferredMic } from "../ai/audio";
import { stopSpeaking } from "../lib/speech";
import { useStore } from "./store";
import { announce } from "./announcer";
import { onXrContext } from "../xr/bridge";

export type WakeState = "idle" | "hearing" | "armed" | "thinking";

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
  /** Hands-free wake word is on (VR): only "Grok, …" utterances reach Grok. */
  wakeWord: boolean;
  wake: WakeState;
  /** One-shot dictation (Grok speech-to-text) in progress. */
  dictation: "idle" | "recording" | "transcribing";
  start(opts?: { wakeWord?: boolean }): Promise<void>;
  stop(): void;
  toggle(): void;
  toggleMute(): void;
  setWakeWord(on: boolean): void;
  interrupt(): void;
  replay(): boolean;
  sendText(text: string): boolean;
  /** Have Grok speak without logging a user line. */
  speakAsGuide(instructions: string): boolean;
  /** Ends the live session after the current answer finishes playing. */
  endAfterSpeaking(): void;
  chooseMic(id: string): Promise<void>;
  dictate(onText: (text: string) => void): Promise<void>;
  stopDictation(): void;
}

let session: GrokVoiceSession | null = null;
let dictation: { stop(): void } | null = null;
let wakeTimer: ReturnType<typeof setTimeout> | undefined;

const logTool = (name: string, args: unknown) =>
  useStore.getState().pushGuide({ role: "tool", text: `${name}(${args && Object.keys(args as object).length ? JSON.stringify(args) : ""})`, origin: "app" });

export const useVoice = create<VoiceState>((set, get) => {
  /** "armed" and "thinking" fall back to idle on their own if nothing follows. */
  const setWake = (wake: WakeState, ms = 0) => {
    clearTimeout(wakeTimer);
    if (get().wake !== wake) set({ wake });
    if (ms) wakeTimer = setTimeout(() => set({ wake: "idle" }), ms);
  };

  return {
    status: "idle", detail: "", micNote: "", micLabel: "", level: 0, listening: false, speaking: false, partial: "", muted: false, wakeWord: false, wake: "idle", dictation: "idle",

    start: async (opts) => {
      if (session && get().status === "error") {
        // A dead socket keeps its session object; replace it rather than staying unavailable.
        const dead = session;
        session = null;
        dead.close();
      }
      if (session) {
        if (opts?.wakeWord) get().setWakeWord(true);
        return;
      }
      stopSpeaking();
      get().stopDictation();
      set({ micNote: "", detail: "", muted: false, partial: "", wakeWord: !!opts?.wakeWord, wake: "idle" });
      const s = new GrokVoiceSession({
        onStatus: (status, detail) => {
          if (session !== s) return;
          set({ status, detail: detail ?? "" });
          if (status === "live") {
            announce(get().wakeWord ? "Grok voice is live. Say “Grok” before a command." : "Grok voice is live. Speak to control GalaxyMaps, or type a message.");
          } else if (status === "error") {
            announce(`Voice error: ${detail ?? "connection problem"}`, true);
          } else if (status === "idle") {
            session = null;
            clearTimeout(wakeTimer);
            set({ listening: false, speaking: false, partial: "", level: 0, wake: "idle" });
          }
        },
        onUserText: (t) => useStore.getState().pushGuide({ role: "user", text: t }),
        onAssistantText: (t, final) => {
          if (!final) return set({ partial: t });
          set({ partial: "" });
          if (t.trim()) useStore.getState().pushGuide({ role: "assistant", text: t, origin: "grok" });
        },
        onTool: logTool,
        onSpeaking: (speaking) => {
          set({ speaking });
          if (speaking && get().wake === "thinking") setWake("idle");
        },
        onListening: (listening) => set({ listening }),
        onHearing: (hearing) => {
          if (hearing && get().wake === "idle") setWake("hearing");
          else if (!hearing && get().wake === "hearing") setWake("idle");
        },
        onWake: (w) => {
          if (w === "armed") setWake("armed", 6000);
          else if (w === "sent") setWake("thinking", 8000);
          else setWake("idle");
        },
        onNotice: (m) => { set({ detail: m }); announce(`Grok: ${m}`); },
        onMicError: (m) => { set({ micNote: m }); announce(m, true); },
        onMic: (label) => set({ micLabel: label, micNote: "" }),
        onLevel: (level) => { if (Math.abs(level - get().level) > 0.02 || level === 0) set({ level }); },
      });
      session = s;
      try {
        await s.connect(true, { wakeWord: get().wakeWord });
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
      clearTimeout(wakeTimer);
      set({ status: "idle", listening: false, speaking: false, partial: "", level: 0, micLabel: "", wake: "idle" });
      announce("Voice session ended.");
    },

    toggle: () => (session ? get().stop() : void get().start()),

    /** On: always listening for "Grok, …". Off: leaves the session muted (back on desktop). */
    setWakeWord: (on) => {
      session?.setWakeWord(on);
      setWake("idle");
      set({ wakeWord: on, muted: !on, listening: false });
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
  };
});

useStore.subscribe((s, prev) => { if (s.selectedId !== prev.selectedId) session?.refreshContext(); });
onXrContext(() => session?.refreshContext());
