import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { DataBundle } from "../data/bundle";
import type { Catalog, Ephemeris } from "../lib/types";
import { useStore } from "./store";
import { useLibrary } from "./library";
import { useDiscoveryStore } from "./discovery";

// State/navigation checks run without a WebGL canvas. The real focus action still
// selects the valid catalog record; renderer behavior is covered by browser QA.
vi.mock("../map/engineRef", () => ({ getEngine: () => null }));
const catalog = JSON.parse(readFileSync("public/data/catalog.json", "utf8")) as Catalog;
const eph = JSON.parse(readFileSync("public/data/ephemeris.json", "utf8")) as Ephemeris;
const data = { catalog, eph, byId: new Map(catalog.objects.map((object) => [object.id, object])) } as DataBundle;
const appOriginal = useStore.getState();
const discoveryOriginal = useDiscoveryStore.getState();

beforeEach(() => {
  useStore.setState({ data, jd: eph.startJdTdb, selectedId: "mars", panel: "directions", stops: ["earth", "mars"], progress: 0.4, playing: true, orbitCamera: true, camera: { mode: "route", lockedId: null }, time: { ...appOriginal.time, armed: true, running: true } });
  useDiscoveryStore.setState(discoveryOriginal);
  useLibrary.setState({ recent: [], favorites: [] });
});
afterEach(() => {
  useStore.setState(appOriginal);
  useDiscoveryStore.setState(discoveryOriginal);
  vi.restoreAllMocks();
});

describe("reversible tour controls", () => {
  it("opens an overview without selecting another object or moving a camera before Start", () => {
    useDiscoveryStore.getState().openTour("nebulae");
    expect(useDiscoveryStore.getState().started).toBe(false);
    expect(useStore.getState().selectedId).toBe("mars");
    expect(useStore.getState().camera.mode).toBe("route");
    expect(useStore.getState().stops).toEqual(["earth", "mars"]);
    useDiscoveryStore.getState().jumpTo(2);
    expect(useStore.getState().selectedId).toBe("mars");
    useDiscoveryStore.getState().startTour();
    expect(useStore.getState().selectedId).toBe("carina-nebula");
    expect(useStore.getState().time.armed).toBe(false);
    expect(useStore.getState().orbitCamera).toBe(false);
  });

  it("keeps the return snapshot while moving between stops, pausing and resuming", () => {
    const discovery = useDiscoveryStore.getState();
    discovery.openTour("andromeda");
    discovery.startTour();
    discovery.jumpTo(1);
    expect(useStore.getState().selectedId).toBe("ngc-206");
    discovery.pauseTour();
    discovery.jumpTo(3);
    expect(useStore.getState().selectedId).toBe("ngc-206");
    discovery.resumeTour();
    expect(useStore.getState().selectedId).toBe("m32");
    discovery.exitTour();
    expect(useDiscoveryStore.getState().activeTourId).toBeNull();
    expect(useStore.getState().selectedId).toBe("mars");
    expect(useStore.getState().panel).toBe("directions");
    expect(useStore.getState().stops).toEqual(["earth", "mars"]);
    expect(useStore.getState().progress).toBe(0.4);
    expect(useStore.getState().playing).toBe(false);
  });

  it("restores only real deep-linked tours and clamps supported chapter indices", () => {
    expect(useDiscoveryStore.getState().restoreTour("unknown", 0)).toBe(false);
    expect(useDiscoveryStore.getState().restoreTour("nebulae", NaN)).toBe(false);
    expect(useDiscoveryStore.getState().restoreTour("spacex-demo-2", 99)).toBe(true);
    expect(useDiscoveryStore.getState().stopIndex).toBe(4);
    expect(useStore.getState().selectedId).toBe("earth");
    expect(useLibrary.getState().recent[0]).toBe("demo-2");
  });

  it("rejects missing catalog stops without changing the previous view", () => {
    const byId = new Map(data.byId);
    byId.delete("orion-nebula");
    useStore.setState({ data: { ...data, byId } });
    useDiscoveryStore.getState().openTour("nebulae");
    expect(useDiscoveryStore.getState().activeTourId).toBeNull();
    expect(useStore.getState().panel).toBe("directions");
  });
});

describe("surprise selection and history", () => {
  it("Another avoids repeats and Back restores the route preceding the first surprise", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const discovery = useDiscoveryStore.getState();
    discovery.surpriseMe();
    const first = useDiscoveryStore.getState().surprise!.object.id;
    expect(useStore.getState().selectedId).toBe(first);
    expect(useLibrary.getState().recent[0]).toBe(first);
    discovery.surpriseMe();
    expect(useDiscoveryStore.getState().surprise!.object.id).not.toBe(first);
    expect(useStore.getState().stops).toEqual(["earth", "mars"]);
    discovery.exitSurprise();
    expect(useStore.getState().panel).toBe("directions");
    expect(useStore.getState().selectedId).toBe("mars");
    expect(useStore.getState().progress).toBe(0.4);
  });

  it("a failed physical Nearby lookup offers a useful error without recording a visit", () => {
    useDiscoveryStore.getState().setIntent("nearby");
    useDiscoveryStore.getState().setOrigin("demo-2");
    useDiscoveryStore.getState().surpriseMe();
    expect(useDiscoveryStore.getState().error).toContain("Physical proximity is unavailable");
    expect(useStore.getState().selectedId).toBe("mars");
    expect(useLibrary.getState().recent).toEqual([]);
    expect(useDiscoveryStore.getState().recentSurprises).toEqual([]);
  });
});
