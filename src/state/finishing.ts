import { create } from "zustand";
import { shareCurrentView } from "../lib/share";
import { currentShareUrl } from "./urlState";
const hintSeen = () => { try { return localStorage.getItem("galaxymaps.hints.v1") === "seen"; } catch { return false; } };
type ShareFeedback = { message: string; manual: string };
export const useFinishing = create<{ presentation: boolean; hintDismissed: boolean; hoverId: string | null; share: ShareFeedback | null; setPresentation(v: boolean): void; dismissHint(): void; setHover(id: string | null): void; shareView(): Promise<void>; clearShare(): void }>((set) => ({
  presentation: false, hintDismissed: hintSeen(), hoverId: null, share: null,
  setPresentation: (presentation) => set({ presentation, hoverId: null, share: null }),
  dismissHint: () => { set({ hintDismissed: true }); try { localStorage.setItem("galaxymaps.hints.v1", "seen"); } catch { /* optional preference */ } },
  setHover: (hoverId) => set({ hoverId }),
  shareView: async () => {
    set({ share: null });
    try {
      const result = await shareCurrentView();
      set({ share: { message: result === "local" ? "Local view link copied. Open on this device while GalaxyMaps is running." : result === "shared" ? "View shared." : "View link copied.", manual: "" } });
    } catch (e) {
      set({ share: { message: (e as Error).message, manual: currentShareUrl() } });
    }
  },
  clearShare: () => set({ share: null }),
}));
