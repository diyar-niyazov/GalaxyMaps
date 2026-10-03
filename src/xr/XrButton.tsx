import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { getEngine } from "../map/engineRef";
import { VrIcon } from "../ui/icons";
import type { XrPresentation } from "./xrSession";

/**
 * Enter VR, shown only when the browser reports immersive-vr support (progressive enhancement:
 * the page works fully without WebXR). The session is requested from the click (user gesture).
 */
export function XrButton() {
  const supported = useStore((s) => s.xr.supported);
  const active = useStore((s) => s.xr.active);
  const setXr = useStore((s) => s.setXr);
  const [error, setError] = useState<string | null>(null);
  const pres = useRef<XrPresentation | null>(null);

  useEffect(() => {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr) return setXr({ supported: false });
    xr.isSessionSupported("immersive-vr").then((ok) => setXr({ supported: ok }), () => setXr({ supported: false }));
  }, [setXr]);

  if (!supported) return null;

  const enter = async () => {
    setError(null);
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    const st = useStore.getState();
    const eng = getEngine();
    if (!xr || !eng || !st.data) return;
    try {
      const session = await xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "hand-tracking"] });
      const { XrPresentation } = await import("./xrSession");
      setXr({ active: true });
      useStore.getState().setOrbitCamera(false);
      const p = new XrPresentation(session, eng, st.data, st.camera.lockedId ?? st.selectedId, st.jd, {
        onSelect: (id) => useStore.getState().select(id),
        onEnd: () => {
          pres.current = null;
          setXr({ active: false });
          const s2 = useStore.getState();
          if (s2.selectedId) getEngine()?.focus(s2.selectedId);
        },
      });
      pres.current = p;
      await p.start();
    } catch (e) {
      setXr({ active: false });
      setError((e as Error).message || "Could not start VR");
    }
  };

  return (
    <>
      <button type="button" className={`ctrl ${active ? "active" : ""}`} aria-label={active ? "Exit VR" : "Enter VR"} title={error ? `VR unavailable: ${error}` : active ? "Exit VR" : "Enter VR (headset validation pending)"} onClick={() => (active ? pres.current?.end() : enter())}>
        <VrIcon size={20} />
      </button>
      {error && <span className="sr-only" role="alert">VR could not start: {error}</span>}
    </>
  );
}
