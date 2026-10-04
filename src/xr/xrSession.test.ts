import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { MapEngine } from "../map/MapEngine";
import type { DataBundle } from "../data/bundle";
import { XrPresentation, type XrCallbacks } from "./xrSession";
import { ImmersiveEntry } from "./lifecycle";

function fixture() {
  const session = new EventTarget() as EventTarget & { end: () => Promise<void> };
  session.end = vi.fn(async () => { session.dispatchEvent(new Event("end")); });
  const space = {} as XRReferenceSpace;
  const renderer = {
    autoClear: false,
    getSize: vi.fn((v: THREE.Vector2) => v.set(1250, 740)), getPixelRatio: vi.fn(() => 1.5),
    setPixelRatio: vi.fn(), setSize: vi.fn(), setAnimationLoop: vi.fn(), render: vi.fn(),
    xr: { enabled: false, setReferenceSpaceType: vi.fn(), setFramebufferScaleFactor: vi.fn(), setSession: vi.fn(async () => {}), getReferenceSpace: vi.fn(() => space) },
  };
  const engine = { getRenderer: () => renderer, setPaused: vi.fn() };
  const onEnd = vi.fn(), onSelect = vi.fn();
  const scene = new XrPresentation(session as unknown as XRSession, engine as unknown as MapEngine, {} as DataBundle, "earth", 2460000, { onEnd, onSelect });
  // These checks exercise lifecycle and real session input without requiring a DOM or GPU.
  const buildScene = vi.spyOn(scene as unknown as { buildScene(): void }, "buildScene").mockImplementation(() => {});
  return { session, renderer, engine, scene, buildScene, space, onEnd, onSelect };
}

describe("WebXR renderer ownership", () => {
  it("restores renderer state and releases scene resources once on repeated exit", async () => {
    const f = fixture(), resource = { dispose: vi.fn() };
    (f.scene as unknown as { disposables: { dispose(): void }[] }).disposables.push(resource);
    await f.scene.start();
    expect(f.engine.setPaused).toHaveBeenCalledWith(true);
    expect(f.renderer.xr.enabled).toBe(true);
    f.session.dispatchEvent(new Event("end")); f.scene.dispose();
    expect(resource.dispose).toHaveBeenCalledOnce();
    expect(f.onEnd).toHaveBeenCalledOnce();
    expect(f.renderer.xr.enabled).toBe(false);
    expect(f.renderer.autoClear).toBe(false);
    expect(f.renderer.setPixelRatio).toHaveBeenCalledWith(1.5);
    expect(f.renderer.setSize).toHaveBeenCalledWith(1250, 740, false);
    expect(f.engine.setPaused).toHaveBeenLastCalledWith(false);
  });

  it("releases renderer ownership if XR compatibility initialization rejects", async () => {
    const f = fixture(); f.renderer.xr.setSession.mockRejectedValue(new Error("Context unavailable"));
    await expect(f.scene.start()).rejects.toThrow("Context unavailable");
    expect(f.buildScene).not.toHaveBeenCalled();
    expect(f.renderer.xr.enabled).toBe(false);
    expect(f.engine.setPaused).toHaveBeenLastCalledWith(false);
    expect(f.onEnd).toHaveBeenCalledOnce();
  });

  it("does not install a stale render loop when the runtime exits during initialization", async () => {
    const f = fixture(); let ready!: () => void;
    f.renderer.xr.setSession.mockImplementation(() => new Promise<void>((r) => { ready = r; }));
    const start = f.scene.start(); f.session.dispatchEvent(new Event("end")); ready(); await start;
    expect(f.buildScene).not.toHaveBeenCalled();
    expect(f.renderer.setAnimationLoop).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("uses the select event's transient source and safely ignores unavailable poses", async () => {
    const f = fixture(); await f.scene.start();
    const targetRaySpace = {} as XRSpace, getPose = vi.fn(() => null);
    const event = new Event("select");
    Object.assign(event, { inputSource: { targetRayMode: "transient-pointer", targetRaySpace }, frame: { getPose } });
    f.session.dispatchEvent(event);
    expect(getPose).toHaveBeenCalledExactlyOnceWith(targetRaySpace, f.space);
    expect(f.onSelect).not.toHaveBeenCalled(); f.scene.dispose();
  });

  it("restores saved renderer dimensions after Three.js's own failed-start teardown", async () => {
    const f = fixture(), returned = vi.fn(), entry = new ImmersiveEntry(returned);
    f.renderer.xr.setSession.mockImplementation(async () => {
      // Installed Three.js adds its listener before makeXRCompatible resolves, but
      // captures the prior dimensions only afterward. A rejection can restore zeros.
      f.session.addEventListener("end", () => { f.renderer.setPixelRatio(0); f.renderer.setSize(0, 0, false); });
      throw new Error("makeXRCompatible failed");
    });
    await expect(entry.start(Promise.resolve(f.session as unknown as XRSession), async () => f.scene)).rejects.toThrow("makeXRCompatible failed");
    expect(f.renderer.setPixelRatio).toHaveBeenLastCalledWith(1.5);
    expect(f.renderer.setSize).toHaveBeenLastCalledWith(1250, 740, false);
    expect(returned).toHaveBeenCalledOnce();
  });

  it("routes spatial Exit through the session owner when the runtime rejects without an end event", async () => {
    const f = fixture(), returned = vi.fn(), entry = new ImmersiveEntry(returned);
    const internal = f.scene as unknown as { cb: XrCallbacks };
    let exit!: Promise<void>;
    internal.cb.onExit = () => { exit = entry.end(); };
    vi.mocked(f.session.end).mockRejectedValue(new Error("Runtime disconnected"));
    await entry.start(Promise.resolve(f.session as unknown as XRSession), async () => f.scene);
    f.scene.end(); await exit;
    expect(returned).toHaveBeenCalledOnce();
    expect(f.onEnd).toHaveBeenCalledOnce();
    expect(f.engine.setPaused).toHaveBeenLastCalledWith(false);
    expect(f.renderer.xr.enabled).toBe(false);
  });

  it("treats a pinch that moved as a zoom gesture, not a request for details", async () => {
    const f = fixture(); await f.scene.start();
    const source = { targetRayMode: "transient-pointer", targetRaySpace: {} as XRSpace };
    const internal = f.scene as unknown as { pinches: Map<unknown, { moved: number; start: number }> };
    internal.pinches.set(source, { moved: 0.08, start: performance.now() } as never);
    const getPose = vi.fn(() => null);
    const event = new Event("select");
    Object.assign(event, { inputSource: source, frame: { getPose } });
    f.session.dispatchEvent(event);
    expect(getPose).not.toHaveBeenCalled();
    expect(f.onSelect).not.toHaveBeenCalled(); f.scene.dispose();
  });
});
