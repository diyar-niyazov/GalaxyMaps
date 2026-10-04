import { useEffect, useRef, useState } from "react";

/**
 * Stack of open popovers so Esc closes the topmost menu before anything else (camera lock,
 * panels). Each menu registers its close function while open.
 */
const stack: { close: () => void; blockMap: boolean }[] = [];

export const hasOpenMenu = () => stack.some((entry) => entry.blockMap);

export function closeTopMenu(): boolean {
  const entry = stack.pop();
  if (!entry) return false;
  entry.close();
  return true;
}

/** Open/close state for a popover with outside-click and Esc handling. */
export function useMenu<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const entry = { close, blockMap: true };
    stack.push(entry);
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open]);
  return { open, setOpen, ref, toggle: () => setOpen((o) => !o) };
}

/** Register an always-open overlay (dialog, lightbox) with the Esc stack while mounted. */
export function useEscapeLayer(close: () => void, blockMap = true) {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    const entry = { close: () => ref.current(), blockMap };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [blockMap]);
}
