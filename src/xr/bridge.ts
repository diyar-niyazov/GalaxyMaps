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

/** App-owned travel truth. Grok describes this; it does not decide it. */
export type XrNavPhase = "idle" | "moving" | "arrived" | "cancelled";
export interface XrNav { phase: XrNavPhase; id: string | null; name: string | null }

let nav: XrNav = { phase: "idle", id: null, name: null };
export const xrNav = () => nav;
export function setXrNav(next: XrNav) {
  nav = next;
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
