import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import type { DataBundle } from "../data/bundle";
import type { Catalog, Ephemeris } from "./types";
import { availableTours, chooseDiscovery, discoveryCandidates, DISCOVERY_TOURS, isDiscoveryEligible } from "./discovery";
import { positionOf } from "./route";
import { distance } from "./vec";

const catalog = JSON.parse(readFileSync("public/data/catalog.json", "utf8")) as Catalog;
const eph = JSON.parse(readFileSync("public/data/ephemeris.json", "utf8")) as Ephemeris;
const data = { catalog, eph, byId: new Map(catalog.objects.map((object) => [object.id, object])) } as DataBundle;
const jd = eph.startJdTdb;

describe("curated discovery eligibility", () => {
  it("requires an image, sourced content and a usable map destination", () => {
    const earth = data.byId.get("earth")!;
    expect(isDiscoveryEligible(earth)).toBe(true);
    expect(isDiscoveryEligible({ ...earth, image: undefined })).toBe(false);
    expect(isDiscoveryEligible({ ...earth, summary: undefined })).toBe(false);
    expect(isDiscoveryEligible({ ...earth, position: undefined, cosmo: undefined })).toBe(false);
    expect(isDiscoveryEligible(data.byId.get("demo-2")!)).toBe(false);
    expect(isDiscoveryEligible(data.byId.get("3c-273")!)).toBe(false);
  });

  it("has distinct, nonempty Beautiful and Strange pools using real catalog entries", () => {
    const beautiful = discoveryCandidates(data, "beautiful", "earth", jd);
    const strange = discoveryCandidates(data, "strange", "earth", jd);
    expect(beautiful.length).toBeGreaterThanOrEqual(10);
    expect(strange.length).toBeGreaterThanOrEqual(5);
    expect(beautiful.some((pick) => pick.object.id === "orion-nebula")).toBe(true);
    expect(strange.some((pick) => pick.object.id === "crab-pulsar")).toBe(true);
    expect(beautiful.some((pick) => pick.object.id === "crab-pulsar")).toBe(false);
    for (const pick of [...beautiful, ...strange]) {
      expect(data.byId.has(pick.object.id)).toBe(true);
      expect(pick.sourceUrl).toMatch(/^https:\/\//);
      expect(pick.reason.length).toBeGreaterThan(15);
    }
  });

  it("avoids recent repeats and excludes the last choice even after exhausting a pool", () => {
    const picks = discoveryCandidates(data, "beautiful", "earth", jd).slice(0, 3);
    expect(chooseDiscovery(picks, [picks[0].object.id], () => 0)?.object.id).toBe(picks[1].object.id);
    expect(chooseDiscovery(picks, picks.map((pick) => pick.object.id), () => 0)?.object.id).toBe(picks[1].object.id);
    expect(chooseDiscovery([], [], () => 0)).toBeNull();
  });

  it("clamps injected random values so a choice always stays inside the eligible pool", () => {
    const picks = discoveryCandidates(data, "strange", "earth", jd);
    for (const sample of [-1, 0, 0.5, 1, 5, NaN]) expect(picks).toContain(chooseDiscovery(picks, [], () => sample));
  });
});

describe("physical Nearby discovery", () => {
  it("uses spatial separation from the named origin at the same epoch, ordered nearest first", () => {
    const picks = discoveryCandidates(data, "nearby", "earth", jd);
    expect(picks.length).toBeGreaterThan(5);
    const earth = positionOf(data.byId.get("earth")!, { eph, jdTdb: jd })!;
    for (let i = 0; i < picks.length; i++) {
      const pick = picks[i];
      const p = positionOf(pick.object, { eph, jdTdb: jd })!;
      expect(pick.originName).toBe("Earth");
      expect(pick.distanceKm).toBeCloseTo(distance(earth, p), 4);
      expect(pick.object.id).not.toBe("earth");
      if (i) expect(pick.distanceKm!).toBeGreaterThanOrEqual(picks[i - 1].distanceKm!);
    }
  });

  it("does not interpret missing mission trajectories, host depth, or cosmological directions as proximity", () => {
    expect(discoveryCandidates(data, "nearby", "demo-2", jd)).toEqual([]);
    expect(discoveryCandidates(data, "nearby", "ngc-206", jd)).toEqual([]);
    expect(discoveryCandidates(data, "nearby", "3c-273", jd)).toEqual([]);
    expect(discoveryCandidates(data, "nearby", "unknown", jd)).toEqual([]);
  });

  it("supports a selected object as origin and never emits schematic interior features", () => {
    const picks = discoveryCandidates(data, "nearby", "andromeda", jd);
    expect(picks.length).toBeGreaterThan(0);
    for (const pick of picks) {
      expect(pick.originName).toBe("Andromeda Galaxy");
      expect(pick.object.position?.kind === "static" && pick.object.position.depth === "host").toBe(false);
      expect(pick.object.cosmo).toBeUndefined();
    }
  });
});

describe("complete mini-tours and Demo-2 story", () => {
  it("offers four complete tours and one completed mission story from the delivered catalog", () => {
    const tours = availableTours(data);
    expect(tours.length).toBe(5);
    expect(tours.filter((tour) => tour.kind === "tour").map((tour) => tour.id)).toEqual(["nebulae", "extremes", "andromeda", "human-spaceflight"]);
    for (const tour of tours) expect(tour.stops.length).toBeGreaterThanOrEqual(4);
  });

  it("every stop has a valid focus target, highlight, source and existing local photograph", () => {
    for (const tour of DISCOVERY_TOURS) for (const stop of tour.stops) {
      const object = data.byId.get(stop.objectId)!;
      const focus = data.byId.get(stop.focusId ?? stop.objectId)!;
      expect(object).toBeDefined();
      expect(focus.position || focus.cosmo).toBeTruthy();
      expect(stop.highlight.length).toBeGreaterThan(25);
      expect(stop.sourceUrl ?? object.summary?.url).toMatch(/^https:\/\//);
      const image = stop.image ?? object.image!;
      expect(image.credit).toBeTruthy();
      expect(image.license).toBeTruthy();
      expect(existsSync(`public${image.src}`)).toBe(true);
    }
  });

  it("withholds incomplete tours instead of creating unusable stops", () => {
    const byId = new Map(data.byId);
    byId.delete("ngc-206");
    expect(availableTours({ ...data, byId }).map((tour) => tour.id)).not.toContain("andromeda");
  });

  it("labels separate historical dates, scene context and primary mission sources", () => {
    const story = DISCOVERY_TOURS.find((tour) => tour.id === "spacex-demo-2")!;
    expect(story.order).toContain("no flight trajectory");
    expect(story.stops[1].date).toBe("30 May 2020 · 19:22 UTC");
    expect(story.stops[2].date).toBe("31 May 2020 · 14:16 UTC");
    expect(story.stops.at(-1)?.date).toBe("2 August 2020 · 18:48 UTC");
    for (const stop of story.stops) {
      expect(stop.focusId).toBe("earth");
      expect(stop.sourceUrl).toMatch(/^https:\/\/(?:www\.|blogs\.)nasa.gov\//);
      expect(stop.image?.kind).toBe("observed");
    }
  });
});
