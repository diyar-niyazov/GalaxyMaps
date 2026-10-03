import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles.css";
import { App } from "./App";
import { useStore } from "./state/store";
import { getEngine } from "./map/engineRef";

// Development-only hooks for the headless smoke test (scripts/smoke.ts).
if (import.meta.env.DEV) Object.assign(globalThis, { __gm: { store: useStore, engine: getEngine } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
