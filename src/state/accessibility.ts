import { create } from "zustand";

export interface AccessibilitySettings {
  highContrast: boolean;
  largeText: boolean;
  reduceMotion: boolean;
  /** Shows the map-navigation toolbar: describe view, previous/next nearby object. */
  audioNav: boolean;
}

interface AccessibilityState extends AccessibilitySettings {
  open: boolean;
  setOpen(open: boolean): void;
  set<K extends keyof AccessibilitySettings>(key: K, value: AccessibilitySettings[K]): void;
}

const KEY = "galaxymaps.accessibility.v1";
const DEFAULTS: AccessibilitySettings = { highContrast: false, largeText: false, reduceMotion: false, audioNav: false };

function load(): AccessibilitySettings {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<AccessibilitySettings>;
    return Object.fromEntries(Object.entries(DEFAULTS).map(([k, d]) => [k, typeof v[k as keyof AccessibilitySettings] === "boolean" ? v[k as keyof AccessibilitySettings] : d])) as unknown as AccessibilitySettings;
  } catch {
    return DEFAULTS;
  }
}

export function applyAccessibility(s: AccessibilitySettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("a11y-contrast", s.highContrast);
  root.classList.toggle("a11y-large-text", s.largeText);
  if (s.reduceMotion) root.dataset.motion = "reduce";
  else delete root.dataset.motion;
}

export const useAccessibility = create<AccessibilityState>((set, get) => ({
  ...load(),
  open: false,
  setOpen: (open) => set({ open }),
  set: (key, value) => {
    set({ [key]: value } as Partial<AccessibilityState>);
    const { highContrast, largeText, reduceMotion, audioNav } = get();
    const settings = { highContrast, largeText, reduceMotion, audioNav };
    applyAccessibility(settings);
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage unavailable: session only */ }
  },
}));

applyAccessibility(useAccessibility.getState());
