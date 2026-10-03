import { describe, it, expect } from "vitest";
import { CATEGORY_TREE, inCategory, findNode, leafParent, isLeaf } from "./taxonomy";
import { buildSearchIndex, search, browse } from "./search";
import type { CatalogObject } from "./types";

const obj = (id: string, name: string, type: string, category: string, extra: Partial<CatalogObject> = {}): CatalogObject =>
  ({ id, name, aliases: [], type, category, featured: false, display: { color: "#fff", priority: 10 }, ...extra }) as unknown as CatalogObject;

const objects = [
  obj("sgr-a", "Sagittarius A*", "black-hole", "cr-black-holes", { aliases: ["Sgr A*"], featured: true }),
  obj("cyg-x1", "Cygnus X-1", "black-hole", "cr-black-holes"),
  obj("ring", "Ring Nebula", "nebula", "nb-planetary", { aliases: ["M57", "Messier 57", "NGC 6720"] }),
  obj("orion", "Orion Nebula", "nebula", "nb-emission", { aliases: ["M42"], featured: true, image: { src: "/x.jpg" } as CatalogObject["image"] }),
  obj("m31", "Andromeda Galaxy", "galaxy", "gx-spiral", { aliases: ["M31", "Messier 31"], featured: true }),
  obj("proxima", "Proxima Centauri", "star", "st-stars", { tags: ["st-exohosts"] }),
];
const index = buildSearchIndex(objects);

describe("taxonomy", () => {
  it("has unique ids and every leaf knows its parent", () => {
    const ids = CATEGORY_TREE.flatMap((t) => [t.id, ...(t.children ?? []).map((c) => c.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of CATEGORY_TREE) for (const c of t.children ?? []) {
      expect(isLeaf(c.id)).toBe(true);
      expect(leafParent(c.id)?.id).toBe(t.id);
      expect(findNode(c.id)?.label).toBe(c.label);
    }
  });
  it("matches leaves, top-level nodes and secondary tags", () => {
    const [sgr, , ring, , , proxima] = objects;
    expect(inCategory(sgr, "cr-black-holes")).toBe(true);
    expect(inCategory(sgr, "compact")).toBe(true);
    expect(inCategory(ring, "cr-black-holes")).toBe(false);
    expect(inCategory(proxima, "st-exohosts")).toBe(true);
    expect(inCategory(proxima, "stars")).toBe(true);
  });
});

describe("search", () => {
  it("finds objects by type words, singular or plural", () => {
    expect(search(index, "black hole").map((r) => r.obj.id).sort()).toEqual(["cyg-x1", "sgr-a"]);
    expect(search(index, "black holes").map((r) => r.obj.id).sort()).toEqual(["cyg-x1", "sgr-a"]);
    expect(search(index, "nebula").map((r) => r.obj.id).sort()).toEqual(["orion", "ring"]);
  });
  it("finds catalog designations and tolerates typos", () => {
    expect(search(index, "M57")[0].obj.id).toBe("ring");
    expect(search(index, "NGC 6720")[0].obj.id).toBe("ring");
    expect(search(index, "andromeda galxy")[0].obj.id).toBe("m31");
    expect(search(index, "sgr a")[0].obj.id).toBe("sgr-a");
  });
  it("restricts to a category filter and returns nothing honest for unknown names", () => {
    expect(search(index, "nebula", 8, "nb-planetary").map((r) => r.obj.id)).toEqual(["ring"]);
    expect(search(index, "death star")).toEqual([]);
  });
  it("browse lists every member, featured and illustrated first", () => {
    expect(browse(index, "nebulae").map((o) => o.id)).toEqual(["orion", "ring"]);
    expect(browse(index, "gx-elliptical")).toEqual([]);
  });
});
