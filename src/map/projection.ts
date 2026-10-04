/**
 * Display projection. Physical positions (ICRF km) are projected onto a map plane whose
 * orientation depends on zoom: the ecliptic at Solar System scales, the Galactic plane at
 * Milky Way scales, blended smoothly in between. This only changes the view; it never
 * changes physical positions or distances.
 */
import type { Vec3 } from "../lib/types";
import { ICRF_TO_ECLIPTIC, ICRF_TO_GALACTIC } from "../lib/coords";
import { PC_KM } from "../lib/units";
import { type Mat3, mulMat, mulMatVec, rotZ, rotX, transpose, quatFromMat, matFromQuat, slerp, sub, add, normalize, scale } from "../lib/vec";

/** Galactic display: Galactic X (toward the Galactic Center) points up the screen. */
const GALACTIC_DISPLAY: Mat3 = mulMat(rotZ(Math.PI / 2), ICRF_TO_GALACTIC);

function rotationAngle(a: Mat3, b: Mat3) {
  const r = mulMat(a, transpose(b));
  return Math.acos(Math.min(1, Math.max(-1, (r[0] + r[4] + r[8] - 1) / 2)));
}

/** In-plane rotation of the ecliptic view that minimizes the blend rotation (pure tilt ≈ 60°). */
const ECLIPTIC_HEADING = (() => {
  let best = 0, bestAngle = Infinity;
  for (let i = 0; i < 3600; i++) {
    const th = (i / 3600) * 2 * Math.PI;
    const a = rotationAngle(mulMat(rotZ(th), ICRF_TO_ECLIPTIC), GALACTIC_DISPLAY);
    if (a < bestAngle) { bestAngle = a; best = th; }
  }
  return best;
})();
const ECLIPTIC_DISPLAY: Mat3 = mulMat(rotZ(ECLIPTIC_HEADING), ICRF_TO_ECLIPTIC);
const Q_ECL = quatFromMat(ECLIPTIC_DISPLAY);
const Q_GAL = quatFromMat(GALACTIC_DISPLAY);

export const PLANE_BLEND_START_KM = 150 * PC_KM;
export const PLANE_BLEND_END_KM = 3000 * PC_KM;

export function planeBlend(widthKm: number): number {
  const t = Math.log(widthKm / PLANE_BLEND_START_KM) / Math.log(PLANE_BLEND_END_KM / PLANE_BLEND_START_KM);
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

export function planeMatrix(widthKm: number): Mat3 {
  const t = planeBlend(widthKm);
  if (t <= 0) return ECLIPTIC_DISPLAY;
  if (t >= 1) return GALACTIC_DISPLAY;
  return matFromQuat(slerp(Q_ECL, Q_GAL, t));
}

export function planeName(widthKm: number): "Ecliptic" | "Galactic" | "Ecliptic → Galactic" {
  const t = planeBlend(widthKm);
  return t <= 0.02 ? "Ecliptic" : t >= 0.98 ? "Galactic" : "Ecliptic → Galactic";
}

export interface View {
  /** Map center, ICRF km. */
  center: Vec3;
  /** Visible map width, km. */
  widthKm: number;
  /** Rotation about the view axis (rad), used in 3D mode. */
  heading: number;
  /** Tilt away from top-down (rad). 0 = straight down onto the plane. */
  tilt: number;
}

export interface Viewport {
  width: number;
  height: number;
  /** Screen centre of the unobscured map area (defaults to the canvas centre). */
  cx?: number;
  cy?: number;
}

export const centerOf = (vp: Viewport): [number, number] => [vp.cx ?? vp.width / 2, vp.cy ?? vp.height / 2];

/** Orientation that is rotated by heading/tilt; also used for the background sky. */
export function viewMatrix(view: View): Mat3 {
  return mulMat(rotX(-view.tilt), mulMat(rotZ(view.heading), planeMatrix(view.widthKm)));
}

/** Orient a centered inspection camera toward an object's Sun-facing side. */
export function sunFacingPose(position: Vec3, widthKm: number): Pick<View, "heading" | "tilt"> {
  const direction = mulMatVec(planeMatrix(widthKm), scale(normalize(position), -1));
  return { heading: Math.atan2(-direction[0], -direction[1]), tilt: Math.acos(Math.min(1, Math.max(-1, direction[2]))) };
}

export interface Projector {
  m: Mat3;
  /** Pixels per km. */
  k: number;
  view: View;
  vp: Viewport;
  /** Screen x, y (px, y down) and depth toward the viewer (px). */
  project(p: Vec3): [number, number, number];
}

export function makeProjector(view: View, vp: Viewport): Projector {
  const m = viewMatrix(view);
  const k = vp.width / view.widthKm;
  const [cx, cy] = centerOf(vp);
  const c = view.center;
  return {
    m, k, view, vp,
    project(p) {
      const d: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
      const x = m[0] * d[0] + m[1] * d[1] + m[2] * d[2];
      const y = m[3] * d[0] + m[4] * d[1] + m[5] * d[2];
      const z = m[6] * d[0] + m[7] * d[1] + m[8] * d[2];
      return [cx + x * k, cy - y * k, z * k];
    },
  };
}

/** Physical point on the plane through the view center under a screen pixel. */
export function unproject(view: View, vp: Viewport, sx: number, sy: number): Vec3 {
  const m = viewMatrix(view);
  const k = vp.width / view.widthKm;
  const [cx, cy] = centerOf(vp);
  const local: Vec3 = [(sx - cx) / k, -(sy - cy) / k, 0];
  return add(view.center, mulMatVec(transpose(m), local));
}

/** Zoom by factor around a screen point, keeping that point fixed (top-down plane). */
export function zoomAround(view: View, vp: Viewport, factor: number, sx: number, sy: number): View {
  const before = unproject(view, vp, sx, sy);
  const next = { ...view, widthKm: view.widthKm * factor };
  const after = unproject(next, vp, sx, sy);
  return { ...next, center: add(next.center, sub(before, after)) };
}

/**
 * Smallest view (center, width) that contains all points with padding, accounting for the
 * zoom-dependent plane orientation (iterated because orientation depends on width).
 */
export function fitView(points: Vec3[], vp: Viewport, base: View, pad = { left: 60, right: 60, top: 80, bottom: 80 }, minWidthKm = 1e4): View {
  if (!points.length) return base;
  let width = base.widthKm;
  let center: Vec3 = points.reduce((a, p) => add(a, p), [0, 0, 0] as Vec3).map((v) => v / points.length) as Vec3;
  for (let iter = 0; iter < 6; iter++) {
    const m = viewMatrix({ ...base, widthKm: width });
    const local = points.map((p) => mulMatVec(m, p));
    const xs = local.map((l) => l[0]), ys = local.map((l) => l[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const availW = Math.max(50, vp.width - pad.left - pad.right), availH = Math.max(50, vp.height - pad.top - pad.bottom);
    const spanW = Math.max(maxX - minX, ((maxY - minY) * availW) / availH);
    width = Math.max(minWidthKm, (spanW * vp.width) / availW);
    const k = vp.width / width;
    // Center so the box sits inside the padded area (relative to the projector's screen centre).
    const [scx, scy] = centerOf(vp);
    const cxLocal = (minX + maxX) / 2 - ((pad.left + (vp.width - pad.right)) / 2 - scx) / k;
    const cyLocal = (minY + maxY) / 2 + ((pad.top + (vp.height - pad.bottom)) / 2 - scy) / k;
    const mt = transpose(m);
    const depth = local.reduce((s, l) => s + l[2], 0) / local.length;
    center = mulMatVec(mt, [cxLocal, cyLocal, depth]);
  }
  return { ...base, center, widthKm: width };
}
