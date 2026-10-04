/**
 * Read-aloud for Listen buttons and Mission Control replies. Uses Grok text-to-speech through the
 * server (/api/tts) when it is configured and enabled, and the browser's built-in voice otherwise
 * or if a Grok request fails.
 */
import { create } from "zustand";
import { loadServerStatus } from "../ui/useServerStatus";
import { primeAudio, audioContext } from "../ai/audio";

const PREF_KEY = "galaxymaps.speech.v1";
type Prefs = { grokVoice: boolean; speed: number };
const loadPrefs = (): Prefs => {
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}") as Partial<Prefs>;
    return { grokVoice: v.grokVoice !== false, speed: typeof v.speed === "number" && v.speed >= 0.7 && v.speed <= 1.5 ? v.speed : 1 };
  } catch {
    return { grokVoice: true, speed: 1 };
  }
};

export const useSpeechPrefs = create<Prefs & { grokAvailable: boolean; set(p: Partial<Prefs>): void }>((set, get) => ({
  ...loadPrefs(),
  grokAvailable: false,
  set: (p) => {
    set(p);
    const { grokVoice, speed } = get();
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ grokVoice, speed })); } catch { /* session only */ }
  },
}));
if (typeof window !== "undefined") void loadServerStatus().then((s) => useSpeechPrefs.setState({ grokAvailable: s.grokConfigured }));

const browserVoice = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
const useGrok = () => { const p = useSpeechPrefs.getState(); return p.grokAvailable && p.grokVoice && typeof AudioContext !== "undefined"; };

export const canSpeak = () => useGrok() || browserVoice();
export const speechEngineLabel = () => (useGrok() ? "Grok voice" : "browser voice");

const clean = (text: string) => text.replace(/[•→]/g, " ").replace(/\s+/g, " ").trim();

/** Sentence-aligned chunks of at most `max` characters, so playback can start after the first. */
export function speechChunks(text: string, max = 400): string[] {
  const sentences = clean(text).match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) ?? [];
  const out: string[] = [];
  let cur = "";
  for (const raw of sentences) {
    for (let s = raw; s; ) {
      const piece = s.length > max ? s.slice(0, s.lastIndexOf(" ", max) > 0 ? s.lastIndexOf(" ", max) : max) : s;
      s = s.slice(piece.length);
      if (cur && (cur + piece).length > max) { out.push(cur.trim()); cur = ""; }
      cur += piece;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const decoded = new Map<string, AudioBuffer>();
async function synth(text: string, signal: AbortSignal): Promise<AudioBuffer> {
  const speed = useSpeechPrefs.getState().speed;
  const key = `${speed}|${text}`;
  const hit = decoded.get(key);
  if (hit) return hit;
  const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, speed }), signal });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Speech failed (HTTP ${r.status})`);
  const ctx = audioContext() ?? primeAudio();
  if (!ctx) throw new Error("Web Audio unavailable");
  const buf = await ctx.decodeAudioData(await r.arrayBuffer());
  decoded.set(key, buf);
  if (decoded.size > 40) decoded.delete(decoded.keys().next().value!);
  return buf;
}

let run: { abort: AbortController; source: AudioBufferSourceNode | null } | null = null;

function speakBrowser(text: string, onEnd?: () => void): boolean {
  if (!browserVoice()) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean(text));
  u.lang = "en-US";
  u.rate = useSpeechPrefs.getState().speed;
  u.onend = u.onerror = () => onEnd?.();
  speechSynthesis.speak(u);
  return true;
}

/** Start speaking; returns false if no voice is available. `onEnd` runs once when speech stops for any reason. */
export function speak(text: string, onEnd?: () => void): boolean {
  stopSpeaking();
  let ended = false;
  const end = () => { if (!ended) { ended = true; onEnd?.(); } };
  if (!useGrok()) return speakBrowser(text, end);
  const ctx = primeAudio();
  if (!ctx) return speakBrowser(text, end);
  const me = { abort: new AbortController(), source: null as AudioBufferSourceNode | null };
  run = me;
  const chunks = speechChunks(text);
  const pending = chunks.map((c) => synth(c, me.abort.signal));
  pending.forEach((p) => p.catch(() => {}));
  void (async () => {
    try {
      for (const p of pending) {
        const buf = await p;
        if (run !== me) return;
        await new Promise<void>((resolve) => {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.onended = () => resolve();
          me.source = src;
          src.start();
        });
        if (run !== me) return;
      }
      run = null;
      end();
    } catch {
      if (run !== me) return;
      run = null;
      // Grok speech failed (network, quota): finish with the browser voice instead of going silent.
      if (!speakBrowser(text, end)) end();
    }
  })();
  me.abort.signal.addEventListener("abort", end);
  return true;
}

export function stopSpeaking() {
  const r = run;
  run = null;
  if (r) {
    try { r.source?.stop(); } catch { /* already stopped */ }
    r.abort.abort();
  }
  if (browserVoice()) speechSynthesis.cancel();
}
