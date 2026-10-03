import { useState } from "react";
import type { CatalogObject, ObjectType } from "../lib/types";

/** Distinct, small schematic symbols per object class (24×24 viewBox, drawn in currentColor). */
export function TypeGlyph({ type, size = 16 }: { type: ObjectType; size?: number }) {
  const s = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true } as const;
  switch (type) {
    case "star":
    case "white-dwarf":
      return <svg {...s}><path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" fill="currentColor" stroke="none" /></svg>;
    case "planet":
    case "dwarf-planet":
    case "exoplanet":
      return <svg {...s}><circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" /><ellipse cx="12" cy="12" rx="10.5" ry="3.2" transform="rotate(-18 12 12)" /></svg>;
    case "moon":
      return <svg {...s}><path d="M15 4a8 8 0 1 0 5 13A7 7 0 0 1 15 4z" fill="currentColor" stroke="none" /></svg>;
    case "asteroid":
      return <svg {...s}><path d="M7 6l6-2 6 4 1 6-4 6-7 0-4-5z" fill="currentColor" stroke="none" /></svg>;
    case "comet":
      return <svg {...s}><circle cx="16.5" cy="7.5" r="3.2" fill="currentColor" stroke="none" /><path d="M14 10L4 20M13 8.5L5 14M15.5 10.8L10 19" /></svg>;
    case "spacecraft":
    case "mission":
      return <svg {...s}><rect x="9.5" y="9" width="5" height="6" rx="1" fill="currentColor" stroke="none" /><path d="M3 8v8M21 8v8M3 12h6.5M14.5 12H21M12 9V5" /></svg>;
    case "star-cluster":
      return <svg {...s} stroke="none" fill="currentColor"><circle cx="12" cy="12" r="2.2" /><circle cx="6.5" cy="9" r="1.5" /><circle cx="17" cy="8" r="1.5" /><circle cx="8" cy="16.5" r="1.5" /><circle cx="16.5" cy="16" r="1.5" /><circle cx="12" cy="5" r="1.1" /><circle cx="12" cy="19.5" r="1.1" /></svg>;
    case "nebula":
      return <svg {...s}><path d="M5 15c-2-3 1-7 4-6 1-3 6-4 8-1 3 0 4 4 2 6 1 3-3 5-5 3-2 2-6 2-7-1-1 0-2 0-2-1z" fill="currentColor" fillOpacity="0.45" /></svg>;
    case "supernova-remnant":
      return <svg {...s}><circle cx="12" cy="12" r="7.5" strokeDasharray="3 2" /><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" /></svg>;
    case "galaxy":
      return <svg {...s}><path d="M12 12c0-3 3-5 6-3M12 12c0 3-3 5-6 3M12 12c3 0 5 3 3 6M12 12c-3 0-5-3-3-6" /><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" /></svg>;
    case "galaxy-group":
      return <svg {...s}><ellipse cx="8" cy="9" rx="4" ry="2.2" fill="currentColor" fillOpacity="0.6" /><ellipse cx="16" cy="15" rx="4" ry="2.2" fill="currentColor" fillOpacity="0.6" transform="rotate(25 16 15)" /><ellipse cx="17" cy="6.5" rx="2.2" ry="1.3" fill="currentColor" stroke="none" /></svg>;
    case "black-hole":
      return <svg {...s}><ellipse cx="12" cy="12" rx="10" ry="3.6" /><circle cx="12" cy="12" r="4.6" fill="#000" stroke="currentColor" strokeWidth="2" /></svg>;
    case "neutron-star":
      return <svg {...s}><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" /><path d="M7 3l3.4 6M17 21l-3.4-6" strokeWidth="2" /></svg>;
    case "quasar":
      return <svg {...s}><circle cx="12" cy="12" r="2.8" fill="currentColor" stroke="none" /><path d="M12 2v6M12 16v6" strokeWidth="2.2" /><ellipse cx="12" cy="12" rx="7" ry="2.2" /></svg>;
  }
}

export function ObjectIcon({ obj, size = 32, preferImage = true }: { obj: CatalogObject; size?: number; preferImage?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = obj.image?.thumb ?? obj.image?.src;
  if (preferImage && src && !failed) {
    return (
      <span className="obj-icon obj-icon-img" style={{ width: size, height: size }} aria-hidden="true">
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span className="obj-icon" style={{ width: size, height: size, color: obj.display.color }} aria-hidden="true">
      <TypeGlyph type={obj.type} size={Math.round(size * 0.62)} />
    </span>
  );
}
