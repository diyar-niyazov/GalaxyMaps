import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import type { Catalog, Ephemeris } from "../lib/types";
import type { DataBundle } from "../data/bundle";
import { useStore } from "../state/store";
import { REGION_PRESETS } from "../map/presets";
import { CATEGORY_TREE } from "../lib/taxonomy";
import { DISCOVERY_TOURS } from "../lib/discovery";
import { JOURNEYS, useTravel } from "../state/travel";
import { TOOL_DEFS, REGION_IDS, CATEGORY_IDS, TOUR_IDS, JOURNEY_IDS } from "./toolDefs";
import { runTool } from "./tools";

const catalog = JSON.parse(readFileSync("public/data/catalog.json", "utf8")) as Catalog;
const eph = JSON.parse(readFileSync("public/data/ephemeris.json", "utf8")) as Ephemeris;
const data = { catalog, eph, byId: new Map(catalog.objects.map((o) => [o.id, o])) } as DataBundle;
const original = useStore.getState();
afterEach(() => { useStore.setState(original); useTravel.setState({ phase: "idle", summary: null }); });

describe("Mission Control tool schemas", () => {
  it("list exactly the app's region, category, tour and journey IDs", () => {
    expect([...REGION_IDS].sort()).toEqual(REGION_PRESETS.map((p) => p.id).sort());
    expect([...CATEGORY_IDS].sort()).toEqual(CATEGORY_TREE.map((c) => c.id).sort());
    expect([...TOUR_IDS].sort()).toEqual(DISCOVERY_TOURS.map((t) => t.id).sort());
    expect([...JOURNEY_IDS].sort()).toEqual(JOURNEYS.map((j) => j.id).sort());
  });

  it("are all implemented and reject invalid arguments without throwing", async () => {
    useStore.setState({ data, jd: eph.startJdTdb + 30 });
    for (const t of TOOL_DEFS) {
      const r = await runTool(t.name, { id: "not-a-real-object", query: "", journeyId: "x", tourId: "x", region: "x", target: "x", action: "x", firstId: "x", secondId: "y", originId: "x", destinationId: "y", objectId: "x", categoryId: "x", feature: "x", intent: "x" });
      expect(String(r.error ?? "")).not.toMatch(/Unknown tool/);
    }
  });

  it("refuses unknown object IDs and enum values", async () => {
    useStore.setState({ data, jd: eph.startJdTdb + 30 });
    expect((await runTool("selectObject", { id: "planet-nine" })).error).toMatch(/Unknown object ID/);
    expect((await runTool("setRegion", { region: "narnia" })).error).toMatch(/Unknown region/);
    expect((await runTool("startTour", { tourId: "fake" })).error).toMatch(/Unknown tourId/);
  });

  it("loads a curated journey and previews travel with honest labels", async () => {
    useStore.setState({ data, jd: eph.startJdTdb + 30 });
    const r = await runTool("startJourney", { journeyId: "earth-proxima" });
    expect(r.ok).toBe(true);
    expect(useStore.getState().stops).toEqual(["earth", "proxima-centauri"]);
    const p = await runTool("controlJourney", { action: "preview" });
    expect(p.ok).toBe(true);
    expect(useTravel.getState().phase).toBe("preview");
    const summary = useTravel.getState().summary!;
    expect(summary.modelKind).toBe("benchmark");
    expect(summary.model).toMatch(/compressed/);
    expect(summary.duration).toMatch(/years/);
  });

  it("controls journeys only when one exists", async () => {
    useStore.setState({ data, jd: eph.startJdTdb + 30 });
    expect((await runTool("controlJourney", { action: "pause" })).ok).toBe(false);
  });

  it("drives the app's own controls by voice", async () => {
    useStore.setState({ data, jd: eph.startJdTdb + 30 });
    expect((await runTool("setLayer", { layer: "atlas" })).ok).toBe(true);
    expect(useStore.getState().layer).toBe("atlas");
    expect((await runTool("setViewSetting", { setting: "tilt", on: true })).ok).toBe(true);
    expect(useStore.getState().tilt).toBe(true);
    expect((await runTool("setViewSetting", { setting: "orbit", on: true })).ok).toBe(false);
    expect((await runTool("setViewSetting", { setting: "tilt", on: "yes" })).error).toMatch(/true or false/);
    expect((await runTool("setTimeRate", { rate: "week" })).ok).toBe(true);
    expect(useStore.getState().time.rate).toBe("week");
    const d = await runTool("setDate", { date: "2026-12-25" });
    expect(d).toMatchObject({ ok: true, date: "2026-12-25" });
    expect((await runTool("setDate", { date: "Christmas" })).error).toMatch(/YYYY-MM-DD/);
    expect((await runTool("openPanel", { panel: "place" })).ok).toBe(false);
    expect((await runTool("openPanel", { panel: "directions" })).ok).toBe(true);
    expect(useStore.getState().panel).toBe("directions");
    expect((await runTool("controlTour", { action: "next" })).ok).toBe(false);
    expect((await runTool("closeOverlay", {})).ok).toBe(false);
  });

  it("compares sizes only for objects with verified diameters", async () => {
    useStore.setState({ data, jd: eph.startJdTdb + 30 });
    const bad = await runTool("compareSizes", { firstId: "earth", secondId: "andromeda" });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBeTruthy();
  });
});
