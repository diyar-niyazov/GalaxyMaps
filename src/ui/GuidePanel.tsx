import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { useServerStatus } from "./useServerStatus";
import { offlineReply } from "../ai/offlineGuide";
import { GrokVoiceSession, type VoiceStatus } from "../ai/grokVoice";
import { useRoute } from "../state/selectors";
import { formatDuration } from "../lib/format";
import { BackIcon, MicIcon, MicOffIcon, SendIcon, InfoIcon, DirectionsIcon } from "./icons";

const PROMPTS = [
  "Take me from Earth to Polaris",
  "Which destinations have rings?",
  "Add Vega as a stop",
  "Compare travel modes",
  "Why don't rockets fly straight to Mars?",
  "Explain this journey",
];

type SpeechRec = { start(): void; stop(): void; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null; lang: string; interimResults: boolean };

export function GuidePanel() {
  const guide = useStore((s) => s.guide);
  const pushGuide = useStore((s) => s.pushGuide);
  const setPanel = useStore((s) => s.setPanel);
  const selectedId = useStore((s) => s.selectedId);
  const route = useRoute();
  const status = useServerStatus();
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<VoiceStatus>("idle");
  const [voiceDetail, setVoiceDetail] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [partial, setPartial] = useState("");
  const [readAloud, setReadAloud] = useState(false);
  const [listening, setListening] = useState(false);
  const session = useRef<GrokVoiceSession | null>(null);
  const rec = useRef<SpeechRec | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const live = voice === "live";
  const grokReady = !!status?.grokConfigured;
  const SR = typeof window !== "undefined" ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition) : undefined;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [guide, partial]);

  useEffect(() => () => session.current?.close(), []);

  const say = (t: string) => {
    if (!readAloud || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(t.replace(/[•→]/g, " ")));
  };

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setText("");
    pushGuide({ role: "user", text: q });
    if (live && session.current) {
      session.current.sendText(q);
      return;
    }
    const reply = await offlineReply(q);
    pushGuide({ role: "assistant", text: reply, origin: "offline" });
    say(reply);
  };

  const startGrok = async () => {
    const s = new GrokVoiceSession({
      onStatus: (st, detail) => {
        setVoice(st);
        setVoiceDetail(detail ?? "");
      },
      onUserText: (t) => pushGuide({ role: "user", text: t }),
      onAssistantText: (t, final) => {
        if (final) {
          setPartial("");
          if (t.trim()) pushGuide({ role: "assistant", text: t, origin: "grok" });
        } else setPartial(t);
      },
      onTool: (name, args) => pushGuide({ role: "tool", text: `${name}(${args && Object.keys(args as object).length ? JSON.stringify(args) : ""})`, origin: "app" }),
      onSpeaking: setSpeaking,
    });
    session.current = s;
    try {
      await s.connect(true);
    } catch (e) {
      setVoice("error");
      setVoiceDetail((e as Error).message);
      s.close();
      session.current = null;
    }
  };

  const stopGrok = () => {
    session.current?.close();
    session.current = null;
    setVoice("idle");
  };

  const toggleBrowserMic = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r: SpeechRec = new SR();
    r.lang = "en-US";
    r.interimResults = false;
    r.onresult = (e) => send(e.results[0][0].transcript);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  return (
    <div className="panel guide">
      <div className="panel-head">
        <button type="button" className="icon-btn" aria-label="Close guide" onClick={() => setPanel(selectedId ? "place" : "explore")}>
          <BackIcon />
        </button>
        <h1>Guide</h1>
        <span className={`status-pill ${live ? "live" : grokReady ? "ready" : "offline"}`}>
          {live ? (speaking ? "Grok speaking…" : "Grok Voice live") : grokReady ? "Grok Voice available" : "Offline guide"}
        </span>
      </div>

      {status && !grokReady && (
        <div className="callout info" role="note">
          <InfoIcon size={18} />
          <span>
            <strong>Live Grok Voice is unavailable</strong>{" "}
            {status.reachable ? "because no XAI_API_KEY is configured on the server." : "because the GalaxyMaps API server isn't running."} You're using the <strong>offline scripted guide</strong>: keyword matching on the same validated map tools, <em>not an AI model</em>.
          </span>
        </div>
      )}
      {grokReady && !live && (
        <div className="voice-start">
          <button type="button" className="btn primary" onClick={startGrok} disabled={voice === "connecting"}>
            <MicIcon size={18} /> {voice === "connecting" ? "Connecting…" : "Talk to Grok"}
          </button>
          <p className="muted small">Uses your microphone. Grok can only search the catalog and use GalaxyMaps' own calculations.</p>
          {voice === "error" && <p className="hint error">{voiceDetail}</p>}
        </div>
      )}
      {live && (
        <div className="voice-start">
          <button type="button" className="btn" onClick={stopGrok}>
            <MicOffIcon size={18} /> End voice session
          </button>
          <span className={`voice-dot ${speaking ? "on" : ""}`} aria-hidden="true" />
        </div>
      )}

      <div className="messages" ref={listRef} aria-live="polite">
        {guide.length === 0 && (
          <div className="prompt-chips">
            <p className="muted">Try asking:</p>
            {PROMPTS.map((p) => (
              <button key={p} type="button" className="chip" onClick={() => send(p)}>
                {p}
              </button>
            ))}
          </div>
        )}
        {guide.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.role === "assistant" && <span className="msg-origin">{m.origin === "grok" ? "Grok" : "Offline guide (scripted)"}</span>}
            {m.role === "tool" && <span className="msg-origin">Map action</span>}
            <p>{m.text}</p>
          </div>
        ))}
        {partial && (
          <div className="msg assistant pending">
            <span className="msg-origin">Grok</span>
            <p>{partial}</p>
          </div>
        )}
      </div>

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

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        {!live && SR && (
          <button type="button" className={`icon-btn ${listening ? "recording" : ""}`} aria-label={listening ? "Stop browser dictation" : "Dictate with browser speech recognition"} title="Browser speech recognition (not Grok)" onClick={toggleBrowserMic}>
            {listening ? <MicOffIcon /> : <MicIcon />}
          </button>
        )}
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={live ? "Type to Grok…" : "Ask the offline guide…"} aria-label="Message the guide" />
        <button type="submit" className="icon-btn primary-ink" aria-label="Send" disabled={!text.trim()}>
          <SendIcon />
        </button>
      </form>
      {!live && (
        <label className="read-aloud">
          <input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} /> Read replies aloud (browser speech, not Grok)
        </label>
      )}
    </div>
  );
}
