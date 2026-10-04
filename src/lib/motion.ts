/**
 * Reduced motion: the in-app setting (`<html data-motion="reduce">`) or the operating-system
 * preference. Checked at call time so a settings change applies immediately.
 */
export function reducedMotion(): boolean {
  if (typeof document !== "undefined" && document.documentElement.dataset.motion === "reduce") return true;
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
