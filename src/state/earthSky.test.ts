import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Catalog, Ephemeris } from "../lib/types";
import type { DataBundle } from "../data/bundle";
import { useStore } from "./store";
import { openEarthSky, useEarthSky } from "./earthSky";
vi.mock("../map/engineRef", () => ({ getEngine: () => null }));
const catalog = JSON.parse(readFileSync("public/data/catalog.json", "utf8")) as Catalog;
const eph = JSON.parse(readFileSync("public/data/ephemeris.json", "utf8")) as Ephemeris;
const data = { catalog, eph, byId: new Map(catalog.objects.map((object) => [object.id, object])) } as DataBundle;
const original = useStore.getState();
const skyOriginal = useEarthSky.getState();
beforeEach(() => {
  useStore.setState({ data, jd: eph.startJdTdb + 30, panel: "place", selectedId: "mars", stops: ["earth", "mars"], progress: 0.35, playing: true, orbitCamera: true, xr: { active: false, supported: false }, time: { ...original.time, armed: true, running: true } });
  useEarthSky.setState(skyOriginal);
});
afterEach(() => { useStore.setState(original); useEarthSky.setState(skyOriginal); });

describe("Earth sky entry and return", () => {
  it("pauses motion without changing the selected scene, route or epoch", () => {
    const jd = useStore.getState().jd;
    expect(openEarthSky("mars")).toBe(true);
    expect(useEarthSky.getState().target?.name).toBe("Mars");
    expect(useStore.getState().selectedId).toBe("mars");
    expect(useStore.getState().stops).toEqual(["earth", "mars"]);
    expect(useStore.getState().jd).toBe(jd);
    expect(useStore.getState().time.running).toBe(false);
    expect(useStore.getState().playing).toBe(false);
    expect(useStore.getState().orbitCamera).toBe(false);
  });

  it("returns to the original object view after retargeting and interacting with the chart", () => {
    openEarthSky("mars");
    openEarthSky("moon");
    useEarthSky.getState().rotate(500, 150);
    useEarthSky.getState().zoom(1e6);
    expect(useEarthSky.getState().center.raDeg).toBeLessThan(360);
    expect(useEarthSky.getState().center.decDeg).toBe(89.9);
    expect(useEarthSky.getState().fieldDeg).toBe(35);
    useStore.setState({ selectedId: "moon", panel: "explore" });
    useEarthSky.getState().close();
    expect(useStore.getState().selectedId).toBe("mars");
    expect(useStore.getState().panel).toBe("place");
    expect(useStore.getState().progress).toBe(0.35);
  });

  it("can dismiss the chart for an explicit new navigation without restoring the old view", () => {
    openEarthSky("mars");
    useStore.setState({ selectedId: "saturn" });
    useEarthSky.getState().close(false);
    expect(useStore.getState().selectedId).toBe("saturn");
  });

  it("rejects unsupported records and immersive entry without altering exploration", () => {
    expect(openEarthSky("earth")).toBe(false);
    expect(openEarthSky("demo-2")).toBe(false);
    expect(openEarthSky("missing")).toBe(false);
    expect(useStore.getState().playing).toBe(true);
    useStore.setState({ xr: { supported: true, active: true } });
    expect(openEarthSky("mars")).toBe(false);
    expect(useEarthSky.getState().error).toContain("outside immersive VR");
    expect(useEarthSky.getState().open).toBe(false);
  });

  it("recenter restores the selected direction and safely ignores invalid gestures", () => {
    openEarthSky("mars");
    const initial = useEarthSky.getState().center;
    useEarthSky.getState().rotate(NaN, Infinity);
    useEarthSky.getState().zoom(-2);
    expect(useEarthSky.getState().center).toEqual(initial);
    useEarthSky.getState().rotate(50, 20);
    useEarthSky.getState().zoom(2);
    useEarthSky.getState().recenter();
    expect(useEarthSky.getState().center).toEqual(initial);
    expect(useEarthSky.getState().fieldDeg).toBe(120);
  });
});
