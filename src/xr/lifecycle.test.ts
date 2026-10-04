import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Catalog, Ephemeris } from "../lib/types";
import type { DataBundle } from "../data/bundle";
import { useStore } from "../state/store";
import { captureView } from "../state/navigation";
import { ImmersiveEntry, pauseForXr, returnFromXr } from "./lifecycle";

const { engine } = vi.hoisted(() => ({ engine: {
  info: vi.fn(() => ({ view: { center: [1, 2, 3], widthKm: 800000, yaw: 0.42, pitch: -0.2 } })),
  setJd: vi.fn(), restoreView: vi.fn(), focus: vi.fn(),
  getJd: vi.fn(),
} }));
vi.mock("../map/engineRef", () => ({ getEngine: () => engine }));
const catalog = JSON.parse(readFileSync("public/data/catalog.json", "utf8")) as Catalog;
const eph = JSON.parse(readFileSync("public/data/ephemeris.json", "utf8")) as Ephemeris;
const data = { catalog, eph, byId: new Map(catalog.objects.map((object) => [object.id, object])) } as DataBundle;
const original = useStore.getState();

class RuntimeSession extends EventTarget {
  end = vi.fn(async () => { this.dispatchEvent(new Event("end")); });
  xr = () => this as unknown as XRSession;
}
const presentation = () => ({ start: vi.fn(async () => {}), dispose: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({ data, selectedId: "saturn", panel: "directions", jd: eph.startJdTdb + 17, camera: { mode: "locked", lockedId: "saturn" }, stops: ["earth", "saturn"], progress: 0.62, playing: true, orbitCamera: true, time: { ...original.time, armed: true, running: true } });
  engine.getJd.mockImplementation(() => useStore.getState().jd);
});
afterEach(() => useStore.setState(original));

describe("immersive session acquisition and cleanup", () => {
  it("restores after denied acquisition without constructing a presentation", async () => {
    const done = vi.fn(), factory = vi.fn(), run = new ImmersiveEntry(done);
    await expect(run.start(Promise.reject(new Error("Permission denied")), factory)).rejects.toThrow("Permission denied");
    expect(factory).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledOnce();
  });

  it("ends the acquired session when the lazy presentation import fails", async () => {
    const session = new RuntimeSession(), done = vi.fn();
    const run = new ImmersiveEntry(done);
    await expect(run.start(Promise.resolve(session.xr()), async () => { throw new Error("Module unavailable"); })).rejects.toThrow("Module unavailable");
    expect(session.end).toHaveBeenCalledOnce();
    expect(done).toHaveBeenCalledOnce();
  });

  it("ends and disposes an acquired session after renderer initialization fails", async () => {
    const session = new RuntimeSession(), done = vi.fn(), scene = presentation();
    scene.start.mockRejectedValue(new Error("XR framebuffer failed"));
    const run = new ImmersiveEntry(done);
    await expect(run.start(Promise.resolve(session.xr()), async () => scene)).rejects.toThrow("XR framebuffer failed");
    expect(session.end).toHaveBeenCalledOnce();
    expect(scene.dispose).toHaveBeenCalledOnce();
    expect(done).toHaveBeenCalledOnce();
  });

  it("handles runtime/system exit and repeated application exit exactly once", async () => {
    const session = new RuntimeSession(), done = vi.fn(), scene = presentation();
    const run = new ImmersiveEntry(done);
    expect(await run.start(Promise.resolve(session.xr()), async () => scene)).toBe(true);
    session.dispatchEvent(new Event("end"));
    await Promise.resolve();
    await run.end(); await run.end();
    expect(scene.dispose).toHaveBeenCalledOnce();
    expect(done).toHaveBeenCalledOnce();
    expect(session.end).not.toHaveBeenCalled();
  });

  it("releases a session arriving after the entry was cancelled", async () => {
    let resolve!: (session: XRSession) => void;
    const acquisition = new Promise<XRSession>((r) => { resolve = r; });
    const session = new RuntimeSession(), done = vi.fn(), factory = vi.fn();
    const run = new ImmersiveEntry(done), pending = run.start(acquisition, factory);
    await run.end(); resolve(session.xr());
    expect(await pending).toBe(false);
    expect(session.end).toHaveBeenCalledOnce();
    expect(factory).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledOnce();
  });

  it("cleans up even if the runtime rejects session.end", async () => {
    const session = new RuntimeSession(), done = vi.fn(), scene = presentation();
    session.end.mockRejectedValue(new Error("Already ended"));
    const run = new ImmersiveEntry(done);
    await run.start(Promise.resolve(session.xr()), async () => scene);
    await run.end();
    expect(scene.dispose).toHaveBeenCalledOnce();
    expect(done).toHaveBeenCalledOnce();
  });
});

describe("flat-view return from immersion", () => {
  it("pauses route preview and orbit but keeps Play time running at the same date", () => {
    const before = captureView(); pauseForXr();
    expect(useStore.getState().playing).toBe(false);
    expect(useStore.getState().orbitCamera).toBe(false);
    expect(useStore.getState().time.running).toBe(true);
    expect(useStore.getState().jd).toBe(before.jd);
    expect(useStore.getState().stops).toEqual(before.stops);
    expect(useStore.getState().progress).toBe(before.progress);
  });

  it("returns the exact preceding pose, panel and route, keeping Play-advanced time", () => {
    const before = captureView(); pauseForXr();
    useStore.setState({ selectedId: "earth", panel: "place", jd: before.jd + 10, stops: [null, null], progress: 0 });
    returnFromXr(before, null);
    expect(useStore.getState().selectedId).toBe("saturn");
    expect(useStore.getState().panel).toBe("directions");
    expect(useStore.getState().jd).toBe(before.jd + 10);
    expect(useStore.getState().time.running).toBe(true);
    expect(useStore.getState().stops).toEqual(["earth", "saturn"]);
    expect(useStore.getState().progress).toBe(0.62);
    expect(engine.restoreView).toHaveBeenCalledWith(before.view, "locked", "saturn");
    expect(engine.focus).not.toHaveBeenCalled();
  });

  it("retains an intentionally chosen XR destination while preserving the prior route and epoch", () => {
    const before = captureView(); pauseForXr(); returnFromXr(before, "moon");
    expect(useStore.getState().selectedId).toBe("moon");
    expect(useStore.getState().panel).toBe("place");
    expect(useStore.getState().stops).toEqual(before.stops);
    expect(useStore.getState().jd).toBe(before.jd);
    expect(engine.focus).toHaveBeenCalledWith("moon");
  });
});
