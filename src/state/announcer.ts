import { create } from "zustand";

interface AnnouncerState {
  polite: string;
  assertive: string;
  /** Last few announcements, so "Repeat last announcement" and captions have a source. */
  history: string[];
  lastAt: number;
  announce(text: string, urgent?: boolean): void;
}

let seq = 0;

/**
 * Screen-reader announcements for meaningful state changes only (selection, routes, tours,
 * voice status, errors). Never for continuous camera motion.
 */
export const useAnnouncer = create<AnnouncerState>((set) => ({
  polite: "",
  assertive: "",
  history: [],
  lastAt: 0,
  announce: (text, urgent = false) => {
    const t = text.trim();
    if (!t) return;
    // A zero-width suffix forces re-announcement of identical consecutive messages.
    const value = `${t}${"\u200b".repeat(++seq % 2)}`;
    set((s) => ({ ...(urgent ? { assertive: value } : { polite: value }), history: [t, ...s.history].slice(0, 10), lastAt: Date.now() }));
  },
}));

export const announce = (text: string, urgent = false) => useAnnouncer.getState().announce(text, urgent);

/** Announce only if nothing else was announced in the last `quietMs` (avoids clobbering). */
export const announceIfQuiet = (text: string, quietMs = 2000) => {
  if (Date.now() - useAnnouncer.getState().lastAt >= quietMs) announce(text);
};
