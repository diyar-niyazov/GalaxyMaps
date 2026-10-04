import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles.css";
import { App } from "./App";
import { useStore } from "./state/store";
import { getEngine } from "./map/engineRef";
import { focusObject, exploreInside, goRegion, goHome, directionsTo } from "./state/actions";
import { openComparison, useComparison } from "./state/comparison";
import { useNavigation } from "./state/navigation";
import { installAudioUnlock } from "./ai/audio";

installAudioUnlock();

// Development-only hooks for the headless smoke test (scripts/smoke.ts).
if (import.meta.env.DEV) {
  Object.assign(globalThis, {
    __gm: { store: useStore, engine: getEngine, comparison: useComparison, navigation: useNavigation, actions: { focusObject, exploreInside, goRegion, goHome, directionsTo, openComparison } },
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
