import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Catalog, CatalogObject } from "./types";
import { breadcrumbsFor, groupChildren, hostChain, insideGroup, placedAtHostDistance } from "./hierarchy";

const catalog: Catalog = JSON.parse(readFileSync(join(__dirname, "../../public/data/catalog.json"), "utf8"));
const byId = new Map(catalog.objects.map((o) => [o.id, o]));
const get = (id: string) => byId.get(id)!;

describe("catalog hierarchy and breadcrumbs", () => {
  it("shows Universe / Local Group / Andromeda / G1 with every ancestor reachable", () => {
    const crumbs = breadcrumbsFor(byId, get("mayall-ii"));
    expect(crumbs.map((c) => c.label)).toEqual(["Universe", "Local Group", "Andromeda Galaxy", "Mayall II (G1)"]);
    expect(crumbs[0].target).toEqual({ kind: "region", presetId: "universe" });
    expect(crumbs[1].target).toEqual({ kind: "region", presetId: "local-group" });
    expect(crumbs[2].target).toEqual({ kind: "object", id: "andromeda" });
    expect(crumbs[3].target).toBeNull();
  });
  it("does not repeat a region that is itself the outermost host", () => {
    const sgr = catalog.objects.find((o) => o.parentId === "milky-way")!;
    const labels = breadcrumbsFor(byId, sgr).map((c) => c.label);
    expect(labels.filter((l) => l.startsWith("Milky Way")).length).toBe(1);
  });
  it("survives a malformed parent cycle", () => {
    const a = { ...get("moon"), id: "a", parentId: "b" } as CatalogObject;
    const b = { ...get("moon"), id: "b", parentId: "a" } as CatalogObject;
    const m = new Map([["a", a], ["b", b]]);
    expect(hostChain(m, a).length).toBe(2);
  });
});

describe("galaxy interiors", () => {
  const m31 = get("andromeda");
  const kids = catalog.objects.filter((o) => o.parentId === "andromeda");
  it("includes the verified nucleus, NGC 206 and G1", () => {
    expect(kids.map((k) => k.id)).toEqual(expect.arrayContaining(["m31-star", "ngc-206", "mayall-ii"]));
  });
  it("distinguishes nucleus, disk, halo and companion galaxies", () => {
    expect(insideGroup(get("m31-star"), m31).id).toBe("nucleus");
    expect(insideGroup(get("ngc-206"), m31).id).toBe("disk");
    expect(insideGroup(get("mayall-ii"), m31).id).toBe("halo");
    expect(insideGroup(get("m32"), m31).id).toBe("companions");
    const order = groupChildren(kids, m31).map((g) => g.group.id);
    expect(order).toEqual(["nucleus", "disk", "halo", "companions"]);
    expect(groupChildren(kids, m31).reduce((n, g) => n + g.items.length, 0)).toBe(kids.length);
  });
  it("internal features are host-placed, companions have their own distance", () => {
    expect(placedAtHostDistance(get("mayall-ii"))).toBe(true);
    expect(placedAtHostDistance(get("ngc-206"))).toBe(true);
    expect(placedAtHostDistance(get("m32"))).toBe(false);
  });
  it("every child has a stable ID, its parent relationship and a source", () => {
    for (const k of kids) {
      expect(k.id).toMatch(/^[a-z0-9-]+$/);
      expect(k.relation, k.id).toBeTruthy();
      expect(k.sourceIds.length, k.id).toBeGreaterThan(0);
    }
  });
});
