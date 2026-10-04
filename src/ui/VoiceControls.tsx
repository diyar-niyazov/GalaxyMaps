import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { useVoice } from "../state/voice";
import { useSpeechPrefs, speak, stopSpeaking } from "../lib/speech";
import { listMics, preferredMic, MicCapture, micErrorMessage, primeAudio, type MicInfo } from "../ai/audio";
import { useServerStatus } from "./useServerStatus";
import { MicIcon, MicOffIcon, StopIcon, CloseIcon } from "./icons";
import "./mission.css";
import "./voice.css";

/** Live microphone level bar; reads the shared voice level unless a level is passed. */
export function MicLevel({ level }: { level?: number }) {
  const shared = useVoice((s) => s.level);
  const v = level ?? shared;
  return (
    <span className="mic-level" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <span style={{ transform: `scaleX(${Math.max(0.02, v)})` }} />
    </span>
  );
}

/** Starts or ends the app-wide Grok voice session. */
export function VoiceButton({ className = "icon-btn" }: { className?: string }) {
  const status = useServerStatus();
  const voice = useVoice((s) => s.status);
  if (!status?.grokConfigured) return null;
  const live = voice === "live" || voice === "connecting";
  return (
    <button type="button" className={`${className} voice-btn ${live ? "on" : ""}`} aria-pressed={live} aria-keyshortcuts="m" aria-label={live ? "End voice control" : "Talk to Grok: control GalaxyMaps by voice"} title={live ? "End voice (M)" : "Talk to Grok (M)"} onClick={() => useVoice.getState().toggle()}>
      {live ? <MicOffIcon size={18} /> : <MicIcon size={18} />}
    </button>
  );
}

/** Floating state for the live session while Mission Control is not open. */
export function VoiceDock() {
  const v = useVoice();
  const panel = useStore((s) => s.panel);
  const lastAssistant = useStore((s) => [...s.guide].reverse().find((m) => m.role === "assistant" && m.origin === "grok"));
  if (v.status === "idle" || panel === "guide") return null;
  const state = v.status === "connecting" ? "Connecting…" : v.status === "error" ? v.detail || "Voice error" : v.muted ? "Muted" : v.listening ? "Listening…" : v.speaking ? "Grok speaking…" : "Say a command";
  const caption = v.partial || (v.speaking ? lastAssistant?.text : "");
  return (
    <section className={`voice-dock ${v.status}`} aria-label="Voice control">
      <div className="voice-dock-row">
        <span className={`voice-state ${v.listening ? "listening" : v.speaking ? "speaking" : ""}`} aria-hidden="true"><i /><i /><i /></span>
        <span className="voice-dock-state" role="status">{state}</span>
        {v.status === "live" && <MicLevel />}
        {v.status === "live" && (
          <button type="button" className="icon-btn small" aria-pressed={v.muted} aria-label={v.muted ? "Unmute microphone" : "Mute microphone"} onClick={v.toggleMute} disabled={!v.micLabel}>
            {v.muted ? <MicIcon size={16} /> : <MicOffIcon size={16} />}
          </button>
        )}
        {v.speaking && <button type="button" className="icon-btn small" aria-label="Interrupt Grok" onClick={v.interrupt}><StopIcon size={16} /></button>}
        <button type="button" className="icon-btn small" aria-label="End voice control" onClick={v.stop}><CloseIcon size={16} /></button>
      </div>
      {v.micNote && <p className="voice-dock-note" role="alert">{v.micNote}</p>}
      {caption && <p className="voice-dock-caption" aria-hidden="true">{caption}</p>}
    </section>
  );
}

/** Voice section of the accessibility dialog: Grok read-aloud, speed, microphone choice and test. */
export function VoiceSettings() {
  const status = useServerStatus();
  const prefs = useSpeechPrefs();
  const [mics, setMics] = useState<MicInfo[]>([]);
  const [chosen, setChosen] = useState(preferredMic());
  const [testLevel, setTestLevel] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const heard = useRef(0);
  const test = useRef<MicCapture | null>(null);

  const refresh = () => void listMics().then(setMics).catch(() => setMics([]));
  useEffect(() => {
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => { navigator.mediaDevices?.removeEventListener?.("devicechange", refresh); test.current?.close(); };
  }, []);

  const stopTest = () => {
    test.current?.close();
    test.current = null;
    setTestLevel(null);
    setNote(heard.current > 0.15 ? "Your microphone is working." : "Very little sound was picked up. Try another microphone, move closer, or check your system input volume.");
  };
  const startTest = async () => {
    setNote("");
    heard.current = 0;
    primeAudio();
    try {
      test.current = await MicCapture.open({
        rate: 16000,
        onChunk: () => {},
        onLevel: (l) => { heard.current = Math.max(heard.current, l); setTestLevel(l); },
        onSilent: (label) => setNote(`No sound is coming from "${label}". It may be muted or the wrong device.`),
      });
      setTestLevel(0);
      refresh();
      setTimeout(() => { if (test.current) stopTest(); }, 8000);
    } catch (e) {
      setNote(micErrorMessage(e));
    }
  };

  const choose = (id: string) => {
    setChosen(id);
    void useVoice.getState().chooseMic(id);
    if (test.current) { stopTest(); void startTest(); }
  };

  return (
    <>
      <h2>Voice</h2>
      <div className="a11y-toggles">
        {status?.grokConfigured && (
          <label className="a11y-toggle">
            <input type="checkbox" role="switch" checked={prefs.grokVoice} aria-describedby="grokVoice-hint" onChange={(e) => prefs.set({ grokVoice: e.target.checked })} />
            <span><strong>Read aloud with Grok's voice</strong><small id="grokVoice-hint">Listen buttons and read-aloud use Grok text-to-speech. Off: your browser's built-in voice.</small></span>
          </label>
        )}
        <label className="voice-setting">
          <strong>Speaking speed</strong>
          <select value={prefs.speed} onChange={(e) => prefs.set({ speed: Number(e.target.value) })}>
            {[0.8, 0.9, 1, 1.15, 1.3].map((s) => <option key={s} value={s}>{s === 1 ? "Normal" : `${s}×`}</option>)}
          </select>
          <button type="button" className="btn small" onClick={() => { stopSpeaking(); speak("This is how GalaxyMaps will sound when it reads to you."); }}>Preview</button>
        </label>
        <label className="voice-setting">
          <strong>Microphone</strong>
          <select value={chosen} onChange={(e) => choose(e.target.value)}>
            <option value="">System default</option>
            {mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          {testLevel === null
            ? <button type="button" className="btn small" onClick={() => void startTest()}>Test microphone</button>
            : <button type="button" className="btn small" onClick={stopTest}>Stop test</button>}
        </label>
        {testLevel !== null && <p className="voice-test">Speak now: <MicLevel level={testLevel} /></p>}
        {note && <p className="muted small" role="status">{note}</p>}
        <p className="muted small">{status?.grokConfigured ? <>Press <kbd>M</kbd> anywhere, or the microphone button, to control GalaxyMaps by voice with Grok. Microphone names appear after you allow access once.</> : "Grok voice control needs XAI_API_KEY on the server. Read-aloud uses your browser's voice."}</p>
      </div>
    </>
  );
}
