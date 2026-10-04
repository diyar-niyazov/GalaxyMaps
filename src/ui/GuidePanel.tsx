import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { useServerStatus } from "./useServerStatus";
import { offlineReply } from "../ai/offlineGuide";
import { MissionChat } from "../ai/missionChat";
import { useRoute } from "../state/selectors";
import { formatDuration } from "../lib/format";
import { reducedMotion } from "../lib/motion";
import { canSpeak, speak, stopSpeaking, speechEngineLabel, useSpeechPrefs } from "../lib/speech";
import { useVoice } from "../state/voice";
import { MicLevel } from "./VoiceControls";
import { BackIcon, MicIcon, MicOffIcon, SendIcon, InfoIcon, DirectionsIcon, ReplayIcon, StopIcon, SpeakerIcon } from "./icons";
import "./mission.css";

const PROMPTS = [
  "Take me from Earth to Mars",
  "Begin a journey to Proxima Centauri",
  "Compare Earth and Jupiter",
  "Show me the Andromeda Galaxy",
  "Start the beautiful nebulae tour",
  "Zoom out to the observable universe",
];

type SpeechRec = { start(): void; stop(): void; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null; lang: string; interimResults: boolean };

export function GuidePanel() {
  const guide = useStore((s) => s.guide);
  const pushGuide = useStore((s) => s.pushGuide);
  const setPanel = useStore((s) => s.setPanel);
  const selectedId = useStore((s) => s.selectedId);
  const object = useStore((s) => s.data?.byId.get(s.selectedId ?? ""));
  const route = useRoute();
  const status = useServerStatus();
  const voice = useVoice();
  const grokSpeech = useSpeechPrefs((s) => s.grokAvailable && s.grokVoice);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [chatError, setChatError] = useState("");
  const [readAloud, setReadAloud] = useState(false);
  const [browserDictating, setBrowserDictating] = useState(false);
  const [listenId, setListenId] = useState<number | null>(null);
  const chat = useRef<MissionChat | null>(null);
  const rec = useRef<SpeechRec | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const live = voice.status === "live";
  const grokReady = !!status?.grokConfigured;
  const SR = typeof window !== "undefined" ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition) : undefined;
  const dictating = voice.dictation !== "idle" || browserDictating;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reducedMotion() ? "instant" : "smooth" });
  }, [guide, voice.partial, thinking]);
  useEffect(() => () => { stopSpeaking(); useVoice.getState().stopDictation(); }, []);

  const logTool = (name: string, args: unknown) => pushGuide({ role: "tool", text: `${name}(${args && Object.keys(args as object).length ? JSON.stringify(args) : ""})`, origin: "app" });

  const reply = (t: string, origin: "grok" | "offline") => {
    pushGuide({ role: "assistant", text: t, origin });
    if (readAloud) speak(t);
  };

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || thinking) return;
    setText("");
    setChatError("");
    pushGuide({ role: "user", text: q });
    if (useVoice.getState().sendText(q)) return;
    if (grokReady) {
      chat.current ??= new MissionChat(logTool);
      setThinking(true);
      try {
        reply(await chat.current.ask(q), "grok");
      } catch (e) {
        setChatError(`${(e as Error).message} Answering with the offline guide instead.`);
        reply(await offlineReply(q), "offline");
      } finally {
        setThinking(false);
      }
      return;
    }
    reply(await offlineReply(q), "offline");
  };

  const toggleDictation = () => {
    if (grokReady) {
      if (voice.dictation !== "idle") voice.stopDictation();
      else void voice.dictate((t) => void send(t));
      return;
    }
    if (browserDictating) { rec.current?.stop(); return; }
    const r: SpeechRec = new SR();
    r.lang = "en-US";
    r.interimResults = false;
    r.onresult = (e) => send(e.results[0][0].transcript);
    r.onend = () => setBrowserDictating(false);
    r.onerror = (e) => {
      setBrowserDictating(false);
      setChatError(e?.error === "not-allowed" || e?.error === "service-not-allowed" ? "Microphone access is blocked. Allow the microphone for this site in your browser settings." : e?.error === "network" ? "This browser's speech recognition service is unavailable. Type instead, or connect Grok for voice." : `Speech recognition failed (${e?.error ?? "unknown"}).`);
    };
    rec.current = r;
    r.start();
    setBrowserDictating(true);
  };

  const listen = (id: number, t: string) => {
    if (listenId === id) { stopSpeaking(); setListenId(null); return; }
    if (speak(t, () => setListenId((cur) => (cur === id ? null : cur)))) setListenId(id);
  };

  const pill = live ? (voice.listening ? "Listening…" : voice.speaking ? "Grok speaking…" : "Grok voice live") : grokReady ? "Grok connected" : "Offline guide";
  const lastAssistant = [...guide].reverse().find((m) => m.role === "assistant");
  const canDictate = grokReady || !!SR;

  return (
    <div className="panel guide mission">
      <div className="panel-head">
        <button type="button" className="icon-btn" aria-label="Close Mission Control" onClick={() => setPanel(selectedId ? "place" : "explore")}>
          <BackIcon />
        </button>
        <h1>Mission Control</h1>
        <span className={`status-pill ${live ? "live" : grokReady ? "ready" : "offline"}`}>{pill}</span>
      </div>

      {status && !grokReady && (
        <div className="callout info" role="note">
          <InfoIcon size={18} />
          <span>
            <strong>Grok isn't connected for this installation.</strong>{" "}
            You're using <strong>scripted explanations and map actions</strong> based on the catalog. The map, routes and calculations all work.
          </span>
        </div>
      )}

      {grokReady && !live && (
        <div className="voice-start">
          <button type="button" className="btn primary" onClick={() => void voice.start()} disabled={voice.status === "connecting"}>
            <MicIcon size={18} /> {voice.status === "connecting" ? "Connecting…" : "Talk to Grok"}
          </button>
          <p className="muted small">Speak to control the whole app: "show me Saturn", "switch to atlas", "play time", "go back". Voice keeps listening while you browse; press <kbd>M</kbd> anywhere to start or end it. Grok can only use GalaxyMaps' own tools and calculations.</p>
          {voice.status === "error" && <p className="hint error" role="alert">{voice.detail}</p>}
        </div>
      )}

      {live && (
        <div className="voice-controls" role="group" aria-label="Voice controls">
          <span className={`voice-state ${voice.listening ? "listening" : voice.speaking ? "speaking" : ""}`} aria-hidden="true"><i /><i /><i /></span>
          <MicLevel />
          <button type="button" className="btn small" aria-pressed={voice.muted} onClick={voice.toggleMute} disabled={!voice.micLabel}>
            {voice.muted ? <MicIcon size={16} /> : <MicOffIcon size={16} />} {voice.muted ? "Unmute" : "Mute"}
          </button>
          <button type="button" className="btn small" onClick={voice.interrupt} disabled={!voice.speaking}>
            <StopIcon size={16} /> Interrupt
          </button>
          <button type="button" className="btn small" onClick={voice.replay} disabled={voice.speaking || !lastAssistant}>
            <ReplayIcon size={16} /> Replay
          </button>
          <button type="button" className="btn small danger-ink" onClick={voice.stop}>End voice</button>
        </div>
      )}
      {live && voice.micLabel && <p className="muted small mission-note">Microphone: {voice.micLabel}</p>}
      {voice.micNote && <p className="hint error mission-note" role="alert">{voice.micNote}</p>}
      {live && voice.partial && <p className="voice-caption" aria-hidden="true">{voice.partial}</p>}

      <div className="messages" ref={listRef} role="log" aria-live="polite" aria-label="Conversation">
        {guide.length === 0 && (
          <div className="prompt-chips">
            <p className="muted">Try asking:</p>
            {[...(object ? [`What makes ${object.name} interesting?`, "Explain this light delay", "What should I explore next?"] : []), ...PROMPTS.slice(0, object ? 3 : 6)].map((p) => (
              <button key={p} type="button" className="chip" onClick={() => send(p)}>
                {p}
              </button>
            ))}
          </div>
        )}
        {guide.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.role === "assistant" && <span className="msg-origin">{m.origin === "grok" ? "Grok" : "Offline guide (scripted)"}</span>}
            {m.role === "tool" ? <details><summary>Map action details</summary><p>{m.text}</p></details> : <p>{m.text}</p>}
            {m.role === "assistant" && canSpeak() && !live && (
              <button type="button" className="text-btn msg-listen" aria-pressed={listenId === m.id} onClick={() => listen(m.id, m.text)}>
                <SpeakerIcon size={14} /> {listenId === m.id ? "Stop" : "Listen"}
              </button>
            )}
          </div>
        ))}
        {thinking && <div className="msg assistant pending"><span className="msg-origin">Grok</span><p>Working on it…</p></div>}
      </div>
      {chatError && <p className="hint error mission-note" role="alert">{chatError}</p>}

      {route?.ok && (
        <div className="guide-route">
          <div>
            <strong>{formatDuration(route.modeledSeconds)}</strong>
            <span className="muted small">
              {route.stops.map((o) => o.name).join(" → ")} · {route.kind === "orbital-transfer" ? "orbital transfer" : route.comparison.mode.label}
            </span>
          </div>
          <button type="button" className="btn small" onClick={() => setPanel("directions")}>
            <DirectionsIcon size={16} /> Directions
          </button>
        </div>
      )}

      {voice.dictation !== "idle" && (
        <p className="dictation-state" role="status">
          {voice.dictation === "recording" ? <>Listening… <MicLevel /> <span className="muted small">stops when you pause</span></> : "Transcribing with Grok…"}
        </p>
      )}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        {!live && canDictate && (
          <button type="button" className={`icon-btn ${dictating ? "recording" : ""}`} aria-label={dictating ? "Stop dictation" : grokReady ? "Dictate a message (Grok speech-to-text)" : "Dictate a message (browser speech recognition)"} title={grokReady ? "Dictate with Grok" : "Browser speech recognition"} onClick={toggleDictation} disabled={voice.dictation === "transcribing"}>
            {dictating ? <MicOffIcon /> : <MicIcon />}
          </button>
        )}
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={live ? "Type to Grok…" : grokReady ? "Ask Mission Control…" : "Ask the offline guide…"} aria-label="Message Mission Control" />
        <button type="submit" className="icon-btn primary-ink" aria-label="Send" disabled={!text.trim() || thinking}>
          <SendIcon />
        </button>
      </form>
      {!live && canSpeak() && (
        <label className="read-aloud">
          <input type="checkbox" checked={readAloud} onChange={(e) => { setReadAloud(e.target.checked); if (!e.target.checked) stopSpeaking(); }} /> Read replies aloud ({grokSpeech ? "Grok voice" : speechEngineLabel()})
        </label>
      )}
    </div>
  );
}
