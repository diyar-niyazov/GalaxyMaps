import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { getEngine } from "../map/engineRef";
import { VrIcon } from "../ui/icons";
import { captureView } from "../state/navigation";
import { ImmersiveEntry, pauseForXr, returnFromXr } from "./lifecycle";
import { useVoice } from "../state/voice";
import { useSpeechPrefs } from "../lib/speech";

/**
 * Progressive WebXR entry. The runtime request remains in the initiating user gesture.
 */
export function XrButton() {
  const supported = useStore((s) => s.xr.supported);
  const active = useStore((s) => s.xr.active);
  const setXr = useStore((s) => s.setXr);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const entry = useRef<ImmersiveEntry | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr) setXr({ supported: false });
    else xr.isSessionSupported("immersive-vr").then((ok) => { if (!cancelled) setXr({ supported: ok }); }, () => { if (!cancelled) setXr({ supported: false }); });
    return () => { cancelled = true; mounted.current = false; void entry.current?.end(); };
  }, [setXr]);

  const enter = async () => {
    if (entry.current) return;
    setError(null);
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    const st = useStore.getState();
    const eng = getEngine();
    if (!xr || !eng || !st.data) return;
    const previousView = captureView();
    let selectedId: string | null = null;
    const run = new ImmersiveEntry(() => {
      if (entry.current === run) entry.current = null;
      setXr({ active: false });
      returnFromXr(previousView, selectedId);
      if (mounted.current) setStarting(false);
    });
    entry.current = run;
    setStarting(true);
    try {
      const acquisition = xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "hand-tracking", "transient-pointer"] });
      // Start Grok Voice in the same click: audio and microphone access need the user gesture,
      // and inside VR the conversation is the main way to ask for things.
      const voice = useVoice.getState();
      if (useSpeechPrefs.getState().grokAvailable && voice.status !== "live" && voice.status !== "connecting") void voice.start();
      pauseForXr();
      st.setJd(previousView.jd);
      const start = st.camera.lockedId ?? st.selectedId ?? st.stops[st.stops.length - 1] ?? null;
      const ready = await run.start(acquisition, async (session) => {
        const { XrPresentation } = await import("./xrSession");
        return new XrPresentation(session, eng, st.data!, start, previousView.jd, {
          onSelect: (id) => { selectedId = id; useStore.getState().select(id); },
          // ImmersiveEntry handles both runtime exit and failures before construction.
          onEnd: () => {},
          onExit: () => { void run.end(); },
        });
      });
      if (ready && mounted.current && entry.current === run) setXr({ active: true });
    } catch (e) {
      await run.end();
      if (mounted.current) setError((e as Error).message || "Could not start VR");
    } finally {
      if (mounted.current) setStarting(false);
    }
  };

  // Enter VR appears only where immersive VR is supported (headset browsers over HTTPS).
  if (supported !== true && !active && !error) return null;
  const label = active ? "Exit VR" : starting ? "Starting VR…" : "Enter VR";
  return (
    <>
      {(supported === true || active) && (
        <button type="button" className={`ctrl xr-enter ${active ? "active" : ""}`} disabled={!active && starting} aria-label={label} title={active ? "Exit VR" : "Enter VR: look around, pinch what you're looking at to fly there, pinch and drag to turn, spread both hands to zoom. Grok talks with you the whole time."} onClick={() => active ? void entry.current?.end() : void enter()}>
          <VrIcon size={20} /><span className="xr-enter-text">{active ? "Exit VR" : "VR"}</span>
        </button>
      )}
      {error && <div className="xr-feedback" role="alert"><p>VR couldn't start. Try Enter VR again, or continue exploring here.</p><details><summary>Browser message</summary><p>{error.slice(0, 300)}</p></details><button type="button" className="text-btn" onClick={() => setError(null)}>Dismiss</button></div>}
    </>
  );
}
