import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { DataBundle } from "../data/bundle";
import { useStore } from "./store";
import { configureNavigationUrl, rememberView, handleBrowserPop, useNavigation } from "./navigation";
vi.mock("../map/engineRef", () => ({ getEngine: () => ({ info: () => ({ view: { center: [0, 0, 0], widthKm: 100000, heading: 1, tilt: .7 } }), getJd: () => useStore.getState().jd, setJd: vi.fn(), restoreView: vi.fn() }) }));
const original = useStore.getState();
let browser: { state: unknown; replaceState: ReturnType<typeof vi.fn>; pushState: ReturnType<typeof vi.fn>; back: ReturnType<typeof vi.fn> };
beforeEach(() => {
  browser = { state: { gm: 5 }, replaceState: vi.fn((state) => { browser.state = state; }), pushState: vi.fn((state) => { browser.state = state; }), back: vi.fn() };
  vi.stubGlobal("history", browser); vi.stubGlobal("location", { href: "http://localhost:8788/?state=current" });
  useStore.setState({ data: { byId: new Map(["earth", "mars", "jupiter"].map((id) => [id, { id }])) } as DataBundle, selectedId: "earth", panel: "place", jd: 2461317.5, stops: ["earth", "mars"] });
  useNavigation.setState({ history: [] });
  configureNavigationUrl(() => "http://localhost:8788/?state=current");
});
afterEach(() => { configureNavigationUrl(null); useStore.setState(original); useNavigation.setState({ history: [] }); vi.unstubAllGlobals(); });
describe("browser history after reload and bounded snapshots", () => {
  it("continues the existing entry index after reload and consumes the newly pushed snapshot", () => {
    rememberView(); useStore.setState({ selectedId: "mars" });
    expect(browser.pushState).toHaveBeenLastCalledWith({ gm: 6 }, "", "http://localhost:8788/?state=current");
    expect(handleBrowserPop({ gm: 5 })).toBe(true); expect(useStore.getState().selectedId).toBe("earth");
    expect(useNavigation.getState().history).toHaveLength(0);
    expect(handleBrowserPop({ gm: 4 })).toBe(false);
  });
  it("falls back to the destination URL when a Back jump exceeds cached snapshots", () => {
    rememberView(); useStore.setState({ selectedId: "mars" });
    expect(handleBrowserPop({ gm: 1 })).toBe(false);
    expect(useNavigation.getState().history).toHaveLength(0); expect(useStore.getState().selectedId).toBe("mars");
  });
  it("clears unaligned snapshots on Forward rather than restoring an older object on next Back", () => {
    rememberView(); useStore.setState({ selectedId: "mars" }); rememberView();
    handleBrowserPop({ gm: 6 });
    expect(useNavigation.getState().history).toHaveLength(1);
    expect(handleBrowserPop({ gm: 7 })).toBe(false); expect(useNavigation.getState().history).toHaveLength(0);
    expect(handleBrowserPop({ gm: 6 })).toBe(false);
  });
  it("rejects invalid persisted browser indexes", () => {
    for (const gm of [NaN, Infinity, -1, 1.2, "5"]) {
      browser.state = { gm }; configureNavigationUrl(() => "http://localhost:8788/?state=current"); rememberView();
      expect(browser.pushState).toHaveBeenLastCalledWith({ gm: 1 }, "", "http://localhost:8788/?state=current");
    }
  });
});
