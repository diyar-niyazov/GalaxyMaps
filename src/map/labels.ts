/** Greedy label decluttering: place labels in priority order, skipping overlaps. */
export interface LabelCandidate {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
  /** Pixel offset from the anchor (labels sit to the right of their marker). */
  offset: number;
  force?: boolean;
}

export interface PlacedLabel extends LabelCandidate {
  left: number;
  top: number;
}

export function declutter(cands: LabelCandidate[], vpWidth: number, vpHeight: number, max = 60): PlacedLabel[] {
  const sorted = [...cands].sort((a, b) => Number(!!b.force) - Number(!!a.force) || b.priority - a.priority);
  const placed: PlacedLabel[] = [];
  const boxes: [number, number, number, number][] = [];
  for (const c of sorted) {
    if (placed.length >= max && !c.force) break;
    const left = c.x + c.offset, top = c.y - c.height / 2;
    if (!c.force && (left > vpWidth || top > vpHeight || left + c.width < 0 || top + c.height < 0)) continue;
    const box: [number, number, number, number] = [left - 3, top - 2, left + c.width + 3, top + c.height + 2];
    if (!c.force && boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    boxes.push(box);
    placed.push({ ...c, left, top });
  }
  return placed;
}
