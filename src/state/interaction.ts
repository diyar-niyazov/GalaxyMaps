import { useStore } from "./store";

/**
 * Armed Play time pauses while the user directly interacts (dragging, pinching, searching) and
 * resumes after a short idle delay, but only if it is still armed.
 */
const active = new Set<string>();
let timer = 0;
const IDLE_MS = 1200;

export function interactionStart(source: string) {
  active.add(source);
  clearTimeout(timer);
  useStore.getState().suspendTime(true);
}

export function interactionEnd(source: string) {
  active.delete(source);
  if (active.size) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (!active.size && !document.hidden) useStore.getState().suspendTime(false);
  }, IDLE_MS);
}

/** True while the clock is armed but held by interaction (for the UI hint). */
export const isInteractionHold = () => active.size > 0;
