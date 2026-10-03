import type { CatalogObject, ObjectType } from "../lib/types";

const GLYPH: Record<ObjectType, string> = {
  star: "✦",
  planet: "●",
  "dwarf-planet": "●",
  moon: "◐",
  asteroid: "◆",
  comet: "☄",
  spacecraft: "✈",
  "star-cluster": "⁂",
  nebula: "☁",
  galaxy: "◎",
  "black-hole": "◉",
  quasar: "✺",
};

export function ObjectIcon({ obj, size = 32 }: { obj: CatalogObject; size?: number }) {
  return (
    <span className="obj-icon" style={{ width: size, height: size, background: obj.display.color, fontSize: size * 0.5 }} aria-hidden="true">
      {GLYPH[obj.type]}
    </span>
  );
}
