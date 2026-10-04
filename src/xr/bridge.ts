/**
 * While an immersive session runs, app actions (voice tools, search) steer the VR view through
 * this handle instead of the paused 2D engine.
 */
import type { Vec3 } from "../lib/types";

export interface XrView {
  flyTo(id: string): boolean;
  /** factor < 1 zooms in, as in the 2D engine's zoomBy. */
  zoom(factor: number): void;
  showRegion(center: Vec3, widthKm: number): void;
  home(): void;
  /** Plain-language description of what the viewer is looking at, for the voice guide. */
  describe(): string;
}

let active: XrView | null = null;
const listeners = new Set<() => void>();

export const xrView = () => active;

export function setXrView(view: XrView | null) {
  active = view;
  xrContextChanged();
}

/** Something the voice guide should know changed (gaze target, destination). */
export function xrContextChanged() {
  for (const l of listeners) l();
}

export function onXrContext(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
