/**
 * Validated tools exposed to the AI guide (live Grok Voice or the offline scripted guide).
 * The app supplies sourced records and deterministic calculations; the model may only
 * call these functions. Every ID and argument is validated before touching app state.
 */
import { useStore, MAX_STOPS } from "../state/store";
import { focusObject } from "../state/actions";
import { modesFor, routeFor } from "../state/selectors";
import { search } from "../lib/search";
import { evaluateDetour, isOnTheWay } from "../lib/itinerary";
import { positionOf } from "../lib/route";
import { distance } from "../lib/vec";
import { formatDistance, formatDuration, formatSpeed, formatUncertainty, durationContext, jdToIsoDate } from "../lib/format";
import { TYPE_LABEL } from "../lib/search";
import type { CatalogObject } from "../lib/types";
import type { DataBundle } from "../data/bundle";

export interface ToolDef {
  type: "function";
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties?: boolean };
}

const MODE_IDS = ["light", "voyager-1"];
const FEATURES = ["rings", "exoplanets", "nearby-stars", "galaxies", "nebulae", "spacecraft", "moons", "black-holes"] as const;

export const TOOL_DEFS: ToolDef[] = [
  { type: "function", name: "searchObjects", description: "Search the GalaxyMaps catalog by name or alias. Returns matching object IDs. Always use this to find IDs; never guess IDs.", parameters: { type: "object", properties: { query: { type: "string", description: "Name to look up, e.g. 'Polaris'" } }, required: ["query"], additionalProperties: false } },
  { type: "function", name: "getObjectDetails", description: "Get sourced facts, distance (with uncertainty) and route availability for one catalog object.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false } },
  { type: "function", name: "showObject", description: "Select an object on the map and move the camera to it.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false } },
  { type: "function", name: "setRoute", description: "Show directions between two catalog objects. Planet pairs use an idealized orbital (Hohmann) transfer; everything else a straight line. The mode sets the comparison speed (light speed or Voyager 1). Returns the app's computed results.", parameters: { type: "object", properties: { originId: { type: "string" }, destinationId: { type: "string" }, mode: { type: "string", enum: MODE_IDS } }, required: ["originId", "destinationId"], additionalProperties: false } },
  { type: "function", name: "addStop", description: "Add a stop to the current journey at the position that adds the least distance. Returns the added distance.", parameters: { type: "object", properties: { objectId: { type: "string" } }, required: ["objectId"], additionalProperties: false } },
  { type: "function", name: "compareTravelModes", description: "Compare the current journey's direct-distance time at light speed and at Voyager 1's speed.", parameters: { type: "object", properties: {}, required: [], additionalProperties: false } },
  { type: "function", name: "explainCurrentJourney", description: "Get the computed facts and assumptions for the current journey so you can explain them.", parameters: { type: "object", properties: {}, required: [], additionalProperties: false } },
  { type: "function", name: "suggestStops", description: "Rank catalog destinations by how little distance they add to the current journey (detour evaluated, not assumed).", parameters: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 5 } }, required: [], additionalProperties: false } },
  { type: "function", name: "recommendDestinations", description: "List catalog destinations with a feature.", parameters: { type: "object", properties: { feature: { type: "string", enum: [...FEATURES] } }, required: ["feature"], additionalProperties: false } },
];

type Args = Record<string, unknown>;
type Result = Record<string, unknown>;

const str = (v: unknown, name: string, max = 120): string => {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw new ToolError(`Argument "${name}" must be a non-empty string`);
  return v.trim();
};

export class ToolError extends Error {}

function data(): DataBundle {
  const d = useStore.getState().data;
  if (!d) throw new ToolError("Catalog not loaded yet");
  return d;
}

function lookup(id: unknown, name = "id"): CatalogObject {
  const key = str(id, name, 80);
  const obj = data().byId.get(key);
  if (!obj) throw new ToolError(`Unknown object ID "${key}". Use searchObjects to find valid IDs.`);
  return obj;
}

function brief(o: CatalogObject) {
  return {
    id: o.id,
    name: o.name,
    type: TYPE_LABEL[o.type],
    subtitle: o.subtitle,
    routable: o.route.supported,
    distanceFromSun: o.distance ? formatDistance(o.distance.valueKm) : null,
  };
}

function journeySummary() {
  const s = useStore.getState();
  const d = data();
  const mode = modesFor(d).find((m) => m.id === s.modeId) ?? modesFor(d)[0];
  const r = routeFor(d, s.stops, mode, s.jd, s.routeModel);
  if (!r) return { active: false, message: "No complete journey yet. Use setRoute first." };
  if (!r.ok) return { active: false, error: r.error };
  return {
    active: true,
    routeKind: r.kind === "orbital-transfer" ? "Idealized orbital transfer (Hohmann)" : "Straight-line cruise at constant speed",
    stops: r.stops.map((o) => o.name),
    epoch: jdToIsoDate(r.epochJd),
    straightLineDistance: formatDistance(r.totalKm),
    distanceUncertainty: r.totalSigmaKm != null ? formatUncertainty(r.totalSigmaKm, r.totalSigmaKm) : "not available for every stop",
    modeledPathLength: formatDistance(r.pathKm),
    modeledFlightTime: formatDuration(r.modeledSeconds),
    modeledFlightTimeContext: durationContext(r.modeledSeconds),
    transfer: r.transfer ? { departure: jdToIsoDate(r.transfer.departJd), arrival: jdToIsoDate(r.transfer.arriveJd), departureIsNextAlignment: r.transfer.windowFound, direction: r.transfer.inward ? "inward" : "outward" } : null,
    comparison: { mode: mode.label, speed: formatSpeed(mode.speedKmS), modeKind: mode.kind, modeNote: mode.description, directDistanceTime: formatDuration(r.comparison.seconds) },
    legs: r.legs.map((l) => ({ from: r.stops[l.fromIndex].name, to: r.stops[l.toIndex].name, distance: formatDistance(l.distanceKm), timeAtComparisonSpeed: formatDuration(l.seconds) })),
    distanceQuality: r.quality,
    assumptions: r.assumptions,
    notes: r.notes,
  };
}

export async function runTool(name: string, args: Args = {}): Promise<Result> {
  try {
    if (typeof args !== "object" || args === null || Array.isArray(args)) throw new ToolError("Arguments must be an object");
    const s = useStore.getState();
    switch (name) {
      case "searchObjects": {
        const q = str(args.query, "query");
        const hits = search(data().search, q, 6);
        return { results: hits.map((h) => brief(h.obj)), note: hits.length ? undefined : `Nothing named "${q}" is in the GalaxyMaps catalog.` };
      }
      case "getObjectDetails": {
        const o = lookup(args.id);
        return {
          ...brief(o),
          facts: o.facts.map((f) => `${f.label}: ${f.value}`),
          distanceQuality: o.distance?.quality ?? null,
          distanceUncertainty: o.distance ? formatUncertainty(o.distance.plusKm, o.distance.minusKm) : null,
          distanceSource: o.distance ? data().catalog.sources[o.distance.sourceId]?.title : null,
          distanceNote: o.distance?.note ?? null,
          routeUnavailableReason: o.route.supported ? null : o.route.reason,
          hasRings: !!o.hasRings,
          exoplanets: o.exoplanets?.planets.map((p) => p.name) ?? [],
          summary: o.summary?.text ?? null,
        };
      }
      case "showObject": {
        const o = lookup(args.id);
        focusObject(o.id);
        return { ok: true, shown: o.name };
      }
      case "setRoute": {
        const a = lookup(args.originId, "originId"), b = lookup(args.destinationId, "destinationId");
        if (a.id === b.id) throw new ToolError("Origin and destination must differ");
        for (const o of [a, b]) if (!o.route.supported) return { ok: false, object: o.name, reason: o.route.reason };
        if (args.mode !== undefined) {
          const m = str(args.mode, "mode");
          if (!MODE_IDS.includes(m)) throw new ToolError(`Unknown mode "${m}"`);
          s.setMode(m);
        }
        useStore.setState((st) => ({ stops: [a.id, b.id], progress: 0, playing: false, panel: st.panel === "guide" ? "guide" : "directions" }));
        s.requestFit();
        return journeySummary();
      }
      case "addStop": {
        const o = lookup(args.objectId, "objectId");
        if (!o.route.supported) return { ok: false, reason: o.route.reason };
        const st = useStore.getState();
        if (st.stops.some((x) => !x)) throw new ToolError("Set a complete route before adding stops");
        if (st.stops.length >= MAX_STOPS) throw new ToolError(`Journeys are limited to ${MAX_STOPS} stops`);
        if (st.stops.includes(o.id)) throw new ToolError(`${o.name} is already part of the journey`);
        const ctx = { eph: data().eph, jdTdb: st.jd };
        const positions = st.stops.map((id) => positionOf(data().byId.get(id!)!, ctx)!);
        const det = evaluateDetour(positions, positionOf(o, ctx)!);
        if (!det) throw new ToolError("Could not evaluate the detour");
        st.addStop(o.id, det.insertAt);
        return { ok: true, added: o.name, insertedAsStop: det.insertAt, addedDistance: formatDistance(det.addedKm), addedPercent: Math.round(det.addedFraction * 1000) / 10, onTheWay: isOnTheWay(det), journey: journeySummary() };
      }
      case "compareTravelModes": {
        const st = useStore.getState();
        const d = data();
        const rows = modesFor(d).map((m) => {
          const r = routeFor(d, st.stops, m, st.jd, "straight-line");
          return r && r.ok ? { mode: m.label, kind: m.kind, speed: formatSpeed(m.speedKmS), time: formatDuration(r.comparison.seconds) } : null;
        });
        if (rows.some((r) => !r)) return { error: "No complete, routable journey to compare." };
        return { comparisons: rows, note: "Direct-distance benchmarks: straight-line distance on the map date at a constant speed." };
      }
      case "explainCurrentJourney":
        return journeySummary();
      case "suggestStops": {
        const limit = args.limit === undefined ? 3 : Number(args.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw new ToolError("limit must be an integer 1–5");
        const st = useStore.getState();
        const d = data();
        if (st.stops.some((x) => !x)) throw new ToolError("Set a complete route first");
        const ctx = { eph: d.eph, jdTdb: st.jd };
        const positions = st.stops.map((id) => positionOf(d.byId.get(id!)!, ctx)!);
        const total = positions.slice(1).reduce((sum, p, i) => sum + distance(p, positions[i]), 0);
        const ranked = d.catalog.objects
          .filter((o) => o.featured && o.route.supported && !st.stops.includes(o.id) && o.id !== "sun")
          .map((o) => ({ o, p: positionOf(o, ctx)! }))
          .filter(({ p }) => p && Math.min(...positions.map((q) => distance(p, q))) > 0.03 * total)
          .map(({ o, p }) => ({ o, det: evaluateDetour(positions, p)! }))
          .filter((x) => x.det)
          .sort((a, b) => a.det.addedKm - b.det.addedKm)
          .slice(0, limit);
        return { suggestions: ranked.map(({ o, det }) => ({ id: o.id, name: o.name, subtitle: o.subtitle, addedDistance: formatDistance(det.addedKm), addedPercent: Math.round(det.addedFraction * 1000) / 10, onTheWay: isOnTheWay(det) })), rule: "'onTheWay' is true only if the detour adds at most 5% to the trip." };
      }
      case "recommendDestinations": {
        const f = str(args.feature, "feature");
        if (!(FEATURES as readonly string[]).includes(f)) throw new ToolError(`Unknown feature "${f}"`);
        const all = data().catalog.objects.filter((o) => o.featured);
        const pick: Record<string, (o: CatalogObject) => boolean> = {
          rings: (o) => !!o.hasRings,
          exoplanets: (o) => !!o.exoplanets?.count,
          "nearby-stars": (o) => o.type === "star" && o.region === "stellar-neighborhood" && (o.distance?.valueKm ?? Infinity) < 20 * 9.4607e12,
          galaxies: (o) => o.type === "galaxy",
          nebulae: (o) => o.type === "nebula",
          spacecraft: (o) => o.type === "spacecraft",
          moons: (o) => o.type === "moon",
          "black-holes": (o) => o.type === "black-hole",
        };
        return { destinations: all.filter(pick[f]).sort((a, b) => b.display.priority - a.display.priority).slice(0, 8).map(brief) };
      }
      default:
        throw new ToolError(`Unknown tool "${name}"`);
    }
  } catch (e) {
    return { error: e instanceof ToolError ? e.message : `Tool failed: ${(e as Error).message}` };
  }
}
