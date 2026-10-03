import { useEffect, useRef, useState } from "react";

/**
 * Stack of open popovers so Esc closes the topmost menu before anything else (camera lock,
 * panels). Each menu registers its close function while open.
 */
const stack: (() => void)[] = [];

export function closeTopMenu(): boolean {
  const close = stack.pop();
  if (!close) return false;
  close();
  return true;
}

/** Open/close state for a popover with outside-click and Esc handling. */
export function useMenu<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    stack.push(close);
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      const i = stack.indexOf(close);
      if (i >= 0) stack.splice(i, 1);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open]);
  return { open, setOpen, ref, toggle: () => setOpen((o) => !o) };
}

/** Register an always-open overlay (dialog, lightbox) with the Esc stack while mounted. */
export function useEscapeLayer(close: () => void) {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    const fn = () => ref.current();
    stack.push(fn);
    return () => {
      const i = stack.indexOf(fn);
      if (i >= 0) stack.splice(i, 1);
    };
  }, []);
}
