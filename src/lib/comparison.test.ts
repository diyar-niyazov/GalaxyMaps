import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Catalog, CatalogObject } from "./types";
import { COMPARISON_PRESETS, comparisonLayout, comparisonSentence, comparisonSize, comparisonUnavailableReason, formatDiameter } from "./comparison";

const catalog: Catalog = JSON.parse(readFileSync(join(__dirname, "../../public/data/catalog.json"), "utf8"));
const objects = new Map(catalog.objects.map((object) => [object.id, object]));
const get = (id: string) => objects.get(id)!;
const size = (id: string) => comparisonSize(get(id))!;

describe("sourced size comparisons", () => {
  it("uses the mean radius, not the different equatorial diameter fact", () => {
    const earth = size("earth");
    expect(earth.diameterKm).toBe(2 * get("earth").radiusKm!);
    expect(earth.diameterKm).toBeCloseTo(12_742.02, 4);
    expect(earth.diameterKm).not.toBe(12_756);
    expect(earth.uncertaintyKm).toBe(0.04);
    expect(size("saturn").note).toMatch(/Rings are excluded/);
  });
  it("retains irregular-body equivalent definitions and raw-header uncertainty", () => {
    const phobos = size("phobos");
    expect(phobos.diameterKm).toBeCloseTo(2 * Math.cbrt(13.1 * 11.1 * 9.3), 10);
    expect(phobos.definition).toMatch(/equivalent/);
    expect(phobos.uncertaintyKm).toBeUndefined();
    expect(size("hyperion").uncertaintyKm).toBe(16);
  });
  it("excludes missing, nonphysical, and incompatible definitions rather than inventing sizes", () => {
    const badRadius = { ...get("earth"), radiusKm: NaN };
    expect(comparisonSize(badRadius)).toBeNull();
    expect(comparisonSize({ ...get("earth"), radiusKm: -1 })).toBeNull();
    const galaxy = { ...get("earth"), type: "galaxy" } as CatalogObject;
    expect(comparisonSize(galaxy)).toBeNull();
    expect(comparisonUnavailableReason(galaxy)).toMatch(/different definition/);
    expect(comparisonSize(get("polaris"))).toBeNull();
    expect(comparisonSize({ ...get("moon"), sourceIds: [] })).toBeNull();
  });
  it("makes a primary-sourced star pair without attributing a system size to Sirius", () => {
    const sirius = size("sirius");
    expect(sirius.name).toBe("Sirius A");
    expect(sirius.diameterKm / size("sun").diameterKm).toBeCloseTo(1.713, 12);
    expect(sirius.uncertaintyKm).toBeCloseTo(2 * 0.009 * 695_700, 8);
    expect(sirius.source.url).toBe("https://arxiv.org/abs/1010.3790");
    expect(sirius.note).toMatch(/not the Sirius binary system/);
  });
  it("all curated presets resolve to compatible, finite, sourced dimensions", () => {
    for (const preset of COMPARISON_PRESETS) for (const id of preset.pair) {
      const dimension = size(id);
      expect(dimension, id).toBeTruthy();
      expect(Number.isFinite(dimension.diameterKm)).toBe(true);
      expect(dimension.diameterKm).toBeGreaterThan(0);
      expect(dimension.source.url).toMatch(/^https:/);
    }
    expect(COMPARISON_PRESETS.some(({ pair }) => pair.every((id) => get(id).type === "planet"))).toBe(true);
    expect(COMPARISON_PRESETS.some(({ pair }) => pair.every((id) => get(id).type === "star"))).toBe(true);
    expect(COMPARISON_PRESETS.some(({ pair }) => pair.map((id) => get(id).type).sort().join() === "planet,star")).toBe(true);
    for (const preset of COMPARISON_PRESETS) {
      const types = preset.pair.map((id) => get(id).type);
      if (preset.kind !== "planet-moon") expect(preset.kind.split("-").sort(), preset.id).toEqual([...types].sort());
    }
  });
  it("the extreme-ratio preset triggers the locator and labelled inset on desktop and phone panels", () => {
    const extreme = COMPARISON_PRESETS.filter((p) => p.extreme);
    expect(extreme.length).toBe(1);
    const [a, b] = extreme[0].pair.map((id) => size(id).diameterKm);
    for (const [width, height] of [[360, 275], [280, 275]]) {
      const layout = comparisonLayout(a, b, width, height, "true-scale");
      expect(layout.tinyIndex, `${width}px`).not.toBeNull();
      expect(layout.insetMagnification!).toBeGreaterThan(1);
    }
    for (const preset of COMPARISON_PRESETS.filter((p) => !p.extreme)) {
      const [x, y] = preset.pair.map((id) => size(id).diameterKm);
      expect(comparisonLayout(x, y, 360, 275, "true-scale").tinyIndex, preset.id).toBeNull();
    }
  });
  it("does not report an uncertain star diameter to unjustified kilometre precision", () => {
    expect(formatDiameter(size("sirius"))).toBe("2,383,000 ± 13,000 km");
    expect(formatDiameter(size("earth"))).toBe("12,742.02 ± 0.04 km");
    expect(comparisonSentence(size("earth"), size("sun"))).toBe(comparisonSentence(size("sun"), size("earth")));
    expect(comparisonSentence(size("sun"), size("sirius"))).toContain("1.71 times");
  });
});

describe("truthful comparison rendering", () => {
  it("a common physical scale exactly preserves diameter ratios on desktop and phones", () => {
    for (const [width, height] of [[360, 275], [280, 275], [1000, 600]]) {
      const a = size("earth").diameterKm, b = size("jupiter").diameterKm;
      const layout = comparisonLayout(a, b, width, height, "true-scale");
      expect(layout.diameters[0] / layout.diameters[1]).toBeCloseTo(a / b, 12);
      expect(layout.diameters[0] * layout.kmPerPixel!).toBeCloseTo(a, 8);
      expect(layout.scaleBarPx * layout.kmPerPixel!).toBeCloseTo(layout.scaleBarKm, 8);
    }
  });
  it("never applies a minimum radius, even to a subpixel moon, and identifies the inset separately", () => {
    const layout = comparisonLayout(size("phobos").diameterKm, size("sun").diameterKm, 360, 275, "true-scale");
    expect(layout.diameters[0]).toBeLessThan(0.01);
    expect(layout.tinyIndex).toBe(0);
    expect(layout.diameters[0] * layout.insetMagnification!).toBeCloseTo(50, 12);
    const swapped = comparisonLayout(size("sun").diameterKm, size("phobos").diameterKm, 360, 275, "true-scale");
    expect(swapped.tinyIndex).toBe(1);
  });
  it("independent inspection mode explicitly has no shared physical scale", () => {
    const a = size("earth"), b = size("sun");
    const fit = comparisonLayout(a.diameterKm, b.diameterKm, 360, 275, "fit-both");
    expect(fit.diameters[0]).toBe(fit.diameters[1]);
    expect(fit.kmPerPixel).toBeNull();
    expect(fit.tinyIndex).toBeNull();
    expect(a.diameterKm).toBe(12_742.02);
    expect(b.diameterKm).toBe(1_391_400);
  });
});
