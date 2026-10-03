/**
 * Navigation taxonomy for browsing the catalog. This is a browsing aid, not a claim that an
 * object belongs to exactly one scientific class: every record has one primary `category`
 * leaf and may carry extra `tags` (other leaf ids) so it appears in several places.
 */
import type { CatalogObject } from "./types";

export interface CategoryNode {
  id: string;
  label: string;
  /** Short description shown in the browser. */
  hint?: string;
  children?: CategoryNode[];
}

export const CATEGORY_TREE: CategoryNode[] = [
  {
    id: "solar-system", label: "Solar System bodies", hint: "Planets, moons and small bodies",
    children: [
      { id: "ss-planets", label: "Planets" },
      { id: "ss-dwarf", label: "Dwarf planets" },
      { id: "ss-moons", label: "Moons" },
      { id: "ss-asteroids", label: "Asteroids" },
      { id: "ss-comets", label: "Comets & interstellar visitors" },
      { id: "ss-tno", label: "Trans-Neptunian objects" },
    ],
  },
  {
    id: "stars", label: "Stars and systems", hint: "Stars, multiples and planetary systems",
    children: [
      { id: "st-stars", label: "Stars" },
      { id: "st-multiple", label: "Multiple-star systems" },
      { id: "st-exohosts", label: "Exoplanet hosts" },
      { id: "st-exoplanets", label: "Exoplanets" },
    ],
  },
  {
    id: "compact", label: "Stellar remnants & compact objects", hint: "White dwarfs, pulsars, black holes",
    children: [
      { id: "cr-white-dwarfs", label: "White dwarfs" },
      { id: "cr-neutron", label: "Neutron stars & pulsars" },
      { id: "cr-black-holes", label: "Black holes" },
      { id: "cr-snr", label: "Supernova remnants" },
    ],
  },
  {
    id: "clusters", label: "Star clusters & associations", hint: "Open and globular clusters",
    children: [
      { id: "cl-open", label: "Open & young massive clusters" },
      { id: "cl-globular", label: "Globular clusters" },
      { id: "cl-assoc", label: "Stellar associations" },
    ],
  },
  {
    id: "nebulae", label: "Nebulae", hint: "Star nurseries and dying stars",
    children: [
      { id: "nb-emission", label: "Emission / H II regions" },
      { id: "nb-reflection", label: "Reflection nebulae" },
      { id: "nb-dark", label: "Dark nebulae" },
      { id: "nb-planetary", label: "Planetary nebulae" },
    ],
  },
  {
    id: "galaxies", label: "Galaxies", hint: "Our neighbours and beyond",
    children: [
      { id: "gx-spiral", label: "Spiral & barred spiral" },
      { id: "gx-elliptical", label: "Elliptical" },
      { id: "gx-dwarf", label: "Irregular & dwarf" },
      { id: "gx-other", label: "Lenticular, interacting & active" },
    ],
  },
  {
    id: "structures", label: "Large-scale structures", hint: "Groups, clusters and superclusters",
    children: [
      { id: "ls-groups", label: "Galaxy groups" },
      { id: "ls-clusters", label: "Galaxy clusters" },
      { id: "ls-other", label: "Superclusters" },
    ],
  },
  {
    id: "missions", label: "Spacecraft and missions", hint: "Probes, telescopes, human spaceflight",
    children: [
      { id: "sc-probes", label: "Robotic probes" },
      { id: "sc-telescopes", label: "Space telescopes" },
      { id: "sc-human", label: "Human spaceflight" },
      { id: "sc-spacex", label: "SpaceX vehicles & missions" },
    ],
  },
];

const LEAVES = new Map<string, { node: CategoryNode; parent: CategoryNode }>();
for (const top of CATEGORY_TREE) for (const c of top.children ?? []) LEAVES.set(c.id, { node: c, parent: top });

export const LEAF_IDS = [...LEAVES.keys()];
export const isLeaf = (id: string) => LEAVES.has(id);
export const leafLabel = (id: string) => LEAVES.get(id)?.node.label ?? id;
export const leafParent = (id: string) => LEAVES.get(id)?.parent;
export const findNode = (id: string): CategoryNode | undefined => CATEGORY_TREE.find((t) => t.id === id) ?? LEAVES.get(id)?.node;

/** True if the object belongs to a leaf or to any leaf under a top-level node. */
export function inCategory(o: CatalogObject, id: string): boolean {
  const leaves = LEAVES.has(id) ? [id] : (CATEGORY_TREE.find((t) => t.id === id)?.children ?? []).map((c) => c.id);
  return leaves.includes(o.category) || (o.tags ?? []).some((t) => leaves.includes(t));
}
