import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Catalog } from "../lib/types";
import type { DataBundle } from "../data/bundle";
import { useStore } from "./store";
import { comparisonUrlState, configureComparisonNavigation, hydrateComparison, openComparison, useComparison } from "./comparison";

const catalog: Catalog = JSON.parse(readFileSync(join(__dirname, "../../public/data/catalog.json"), "utf8"));
const bundle = { catalog, byId: new Map(catalog.objects.map((obj) => [obj.id, obj])) } as DataBundle;
const original = useStore.getState();
const snapshot = { selectedId: "mars", camera: { relativeZoom: 4 }, route: ["earth", "mars"] };
const capture = vi.fn(() => snapshot);
const restore = vi.fn();

beforeEach(() => {
  useStore.setState({ data: bundle, panel: "directions", selectedId: "mars", stops: ["earth", "mars"], playing: true, orbitCamera: true, time: { ...original.time, running: true, armed: true } });
  useComparison.setState({ open: false, leftId: null, rightId: null, initialPair: null });
  capture.mockClear(); restore.mockClear();
  configureComparisonNavigation(capture, restore);
});
afterEach(() => { useComparison.getState().close(); useStore.setState(original); });

describe("comparison entry and return", () => {
  it("preserves an itinerary and captures the previous view only once", () => {
    expect(openComparison("earth", "jupiter")).toBe(true);
    expect(useStore.getState().stops).toEqual(["earth", "mars"]);
    expect(useStore.getState().selectedId).toBe("mars");
    expect(useStore.getState().playing).toBe(false);
    expect(useStore.getState().time.running).toBe(false);
    expect(openComparison("sun", "sirius")).toBe(true);
    expect(capture).toHaveBeenCalledTimes(1);
    useComparison.getState().close();
    expect(restore).toHaveBeenCalledWith(snapshot);
    expect(useComparison.getState().open).toBe(false);
  });
  it("rejects unsupported entry without pausing or capturing a view", () => {
    expect(openComparison("polaris")).toBe(false);
    expect(capture).not.toHaveBeenCalled();
    expect(useStore.getState().playing).toBe(true);
  });
  it("swap and reset preserve source values and restore the opening pair", () => {
    openComparison("earth", "sun");
    useComparison.getState().setDisplayMode("fit-both");
    useComparison.getState().swap();
    expect(comparisonUrlState()?.pair).toEqual(["sun", "earth"]);
    useComparison.getState().setObject("left", "moon");
    useComparison.getState().reset();
    expect(comparisonUrlState()).toEqual({ pair: ["earth", "sun"], mode: "true-scale", rotation: [0.12, -0.45], zoom: 1 });
    expect(useComparison.getState().setObject("right", "polaris")).toBe(false);
    expect(comparisonUrlState()?.pair).toEqual(["earth", "sun"]);
  });
  it("hydrates validated pairs and clamps only the visual parameters", () => {
    expect(hydrateComparison({ pair: ["sun", "sirius"], mode: "fit-both", rotation: [10, 400], zoom: 200 })).toBe(true);
    const state = comparisonUrlState()!;
    expect(state.pair).toEqual(["sun", "sirius"]);
    expect(state.mode).toBe("fit-both");
    expect(state.rotation[0]).toBe(Math.PI / 2);
    expect(Math.abs(state.rotation[1])).toBeLessThanOrEqual(Math.PI);
    expect(state.zoom).toBe(1.6);
  });
  it("rejects missing IDs, incompatible sizes, and nonfinite shared state", () => {
    const state = { pair: ["earth", "sun"] as [string, string], mode: "true-scale" as const, rotation: [0, 0] as [number, number], zoom: 1 };
    expect(hydrateComparison({ ...state, pair: ["earth", "unknown"] })).toBe(false);
    expect(hydrateComparison({ ...state, pair: ["earth", "polaris"] })).toBe(false);
    expect(hydrateComparison({ ...state, rotation: [Infinity, 0] })).toBe(false);
    expect(hydrateComparison({ ...state, zoom: NaN })).toBe(false);
    expect(useComparison.getState().open).toBe(false);
  });
});
