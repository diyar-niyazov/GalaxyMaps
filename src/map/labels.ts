/**
 * Greedy label placement: labels are placed in priority order, each trying right, left, above
 * and below its marker, and skipped if every position collides with a higher-priority label.
 * Forced labels (selection, route stops) are never skipped; they fall back to the right-hand spot.
 */
export interface LabelCandidate {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
  /** Pixel offset from the anchor (marker radius plus a gap). */
  offset: number;
  force?: boolean;
  /** Only try the preferred right-hand position (e.g. region captions). */
  fixed?: boolean;
}

export interface PlacedLabel extends LabelCandidate {
  left: number;
  top: number;
}

type Box = [number, number, number, number];
const overlaps = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/**
 * `bounds` is the part of the map not covered by floating controls (left, top, right, bottom).
 * Optional labels must fit inside it entirely; forced labels may extend past it.
 */
export function declutter(cands: LabelCandidate[], vpWidth: number, vpHeight: number, max = 60, blocked: Box[] = [], bounds: Box = [0, 0, vpWidth, vpHeight]): PlacedLabel[] {
  const sorted = [...cands].sort((a, b) => Number(!!b.force) - Number(!!a.force) || b.priority - a.priority);
  const placed: PlacedLabel[] = [];
  const boxes: Box[] = [...blocked];
  for (const c of sorted) {
    if (placed.length >= max && !c.force) break;
    const options: [number, number][] = [
      [c.x + c.offset, c.y - c.height / 2],
      [c.x - c.offset - c.width, c.y - c.height / 2],
      [c.x - c.width / 2, c.y - c.offset - c.height],
      [c.x - c.width / 2, c.y + c.offset],
    ];
    let chosen: [number, number] | null = null;
    for (const [left, top] of c.fixed ? options.slice(0, 1) : options) {
      if (left > vpWidth || top > vpHeight || left + c.width < 0 || top + c.height < 0) continue;
      if (!c.force && (left < bounds[0] + 2 || top < bounds[1] + 2 || left + c.width > bounds[2] - 2 || top + c.height > bounds[3] - 2)) continue;
      const box: Box = [left - 3, top - 2, left + c.width + 3, top + c.height + 2];
      if (boxes.some((b) => overlaps(box, b))) continue;
      chosen = [left, top];
      boxes.push(box);
      break;
    }
    if (!chosen && c.force) {
      chosen = options[0];
      boxes.push([chosen[0] - 3, chosen[1] - 2, chosen[0] + c.width + 3, chosen[1] + c.height + 2]);
    }
    if (chosen) placed.push({ ...c, left: chosen[0], top: chosen[1] });
  }
  return placed;
}
