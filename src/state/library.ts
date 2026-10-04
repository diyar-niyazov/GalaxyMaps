import { create } from "zustand";
import { useStore, TIME_RATES } from "./store";

const KEY = "galaxymaps.library.v1";
type LibraryData = { version: 1; favorites: string[]; recent: string[]; layer?: "realistic" | "atlas"; rate?: string };
const ids = (v: unknown) => Array.isArray(v) ? [...new Set(v.filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9._-]{1,100}$/.test(id)))].slice(0, 100) : [];
export function parseLibrary(raw: string | null): LibraryData {
  try { const v = JSON.parse(raw ?? "null"); if (v?.version === 1) return { version: 1, favorites: ids(v.favorites), recent: ids(v.recent).slice(0, 20), layer: v.layer === "atlas" ? "atlas" : "realistic", rate: TIME_RATES.some((r) => r.id === v.rate) ? v.rate : "day" }; } catch { /* invalid local data is safely ignored */ }
  return { version: 1, favorites: [], recent: [] };
}
function read() { try { return parseLibrary(localStorage.getItem(KEY)); } catch { return parseLibrary(null); } }
function persist() { try { const l = useLibrary.getState(), s = useStore.getState(); localStorage.setItem(KEY, JSON.stringify({ version: 1, favorites: l.favorites, recent: l.recent, layer: s.layer, rate: s.time.rate })); } catch { useLibrary.setState({ storageUnavailable: true }); } }
export const useLibrary = create<{ favorites: string[]; recent: string[]; storageUnavailable: boolean; toggleFavorite(id: string): void; remember(id: string): void }>((set) => ({
  ...read(), storageUnavailable: false,
  toggleFavorite: (id) => { if (!useStore.getState().data?.byId.has(id)) return; set((s) => ({ favorites: s.favorites.includes(id) ? s.favorites.filter((x) => x !== id) : [...s.favorites, id].slice(-100) })); persist(); },
  remember: (id) => { if (!useStore.getState().data?.byId.has(id)) return; set((s) => ({ recent: [id, ...s.recent.filter((x) => x !== id)].slice(0, 20) })); persist(); },
}));
export function initializeLibrary() {
  const p = read();
  if (p.layer) useStore.getState().setLayer(p.layer);
  const rate = TIME_RATES.find((r) => r.id === p.rate);
  if (rate) useStore.getState().setTimeRate(rate.id);
  return useStore.subscribe((s, prev) => { if (s.layer !== prev.layer || s.time.rate !== prev.time.rate) persist(); });
}
