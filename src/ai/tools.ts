/**
 * Validated tools exposed to Mission Control (Grok text, live Grok Voice, or the offline scripted
 * guide). The app supplies sourced records and deterministic calculations; the model may only
 * call these functions. Every ID and argument is validated before touching app state.
 */
import { useStore, MAX_STOPS } from "../state/store";
import { focusObject, goHome, goRegion, escapeCamera } from "../state/actions";
import { modesFor, routeFor } from "../state/selectors";
import { search } from "../lib/search";
import { evaluateDetour, isOnTheWay } from "../lib/itinerary";
import { positionOf } from "../lib/route";
import { distance } from "../lib/vec";
import { formatDistance, formatDuration, formatSpeed, formatUncertainty, durationContext, jdToIsoDate } from "../lib/format";
import { TYPE_LABEL } from "../lib/search";
import { findNode } from "../lib/taxonomy";
import { availableTours } from "../lib/discovery";
import { comparisonSize, comparisonUnavailableReason } from "../lib/comparison";
import { openComparison } from "../state/comparison";
import { useDiscoveryStore } from "../state/discovery";
import { useLibrary } from "../state/library";
import { useAccessibility } from "../state/accessibility";
import { currentViewDescription } from "../state/audioNav";
import { useTravel, beginTravel, startTravel, pauseTravel, resumeTravel, skipTravel, cancelTravel, startJourney } from "../state/travel";
import { getEngine } from "../map/engineRef";
import { xrNav, xrView } from "../xr/bridge";
import { MODE_IDS, FEATURES, JOURNEY_IDS, TOUR_IDS, REGION_IDS, ZOOM_TARGETS, SIMULATION_ACTIONS, JOURNEY_ACTIONS, SURPRISE_INTENTS, PANELS, LAYERS, VIEW_SETTINGS, TIME_RATE_IDS, TOUR_ACTIONS, A11Y_SETTINGS } from "./toolDefs";
import { TIME_RATES } from "../state/store";
import { useFinishing } from "../state/finishing";
import { useNavigation } from "../state/navigation";
import { useComparison } from "../state/comparison";
import { useEarthSky, openEarthSky } from "../state/earthSky";
import { useVoice } from "../state/voice";
import { getTour } from "../lib/discovery";
import { clampPlayJd } from "../lib/ephemeris";
import { jdTdb } from "../lib/units";
import type { CatalogObject } from "../lib/types";
import type { DataBundle } from "../data/bundle";

export { TOOL_DEFS, type ToolDef } from "./toolDefs";

const oneOf = <T extends string>(v: unknown, list: readonly T[], name: string): T => {
  const s = str(v, name, 40);
  if (!(list as readonly string[]).includes(s)) throw new ToolError(`Unknown ${name} "${s}". Use one of: ${list.join(", ")}`);
  return s as T;
};

type Args = Record<string, unknown>;
type Result = Record<string, unknown>;

const str = (v: unknown, name: string, max = 120): string => {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw new ToolError(`Argument "${name}" must be a non-empty string`);
  return v.trim();
};

export class ToolError extends Error {}

const bool = (v: unknown, name: string): boolean => {
  if (typeof v !== "boolean") throw new ToolError(`Argument "${name}" must be true or false`);
  return v;
};

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
      case "getCatalogFacts":
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
      case "selectObject":
      case "showObject": {
        const o = lookup(args.id);
        focusObject(o.id);
        if (s.panel !== "guide") useStore.getState().setPanel("place");
        const flying = !!xrView();
        return {
          ok: true, shown: o.name, camera: flying ? "immersive-vr" : "locked", card: "open",
          navigation: flying ? "moving" : "arrived",
          speak: flying ? `Say you are taking them to ${o.name}. Do not say you have arrived.` : undefined,
        };
      }
      case "unlockCamera":
        return { ok: escapeCamera(), camera: "explore" };
      case "getSelectedObjectContext": {
        const d = data();
        const sel = s.selectedId ? d.byId.get(s.selectedId) : undefined;
        const xr = xrView()?.describe() ?? null;
        return {
          selected: sel ? { ...brief(sel), facts: sel.facts.slice(0, 6).map((f) => `${f.label}: ${f.value}`) } : null,
          camera: xr ? "immersive-vr" : s.camera.mode,
          lockedOn: s.camera.lockedId ? d.byId.get(s.camera.lockedId)?.name ?? null : null,
          panel: s.panel,
          view: xr ?? currentViewDescription(),
          navigation: xrNav(),
        };
      }
      case "describeView":
        return { description: xrView()?.describe() ?? currentViewDescription() };
      case "startJourney": {
        const j = oneOf(args.journeyId, JOURNEY_IDS, "journeyId");
        if (!startJourney(j)) return { ok: false, reason: "That journey's destinations are not available." };
        return { ok: true, ...journeySummary(), next: "Use controlJourney preview to show the Begin-journey card." };
      }
      case "controlJourney": {
        const a = oneOf(args.action, JOURNEY_ACTIONS, "action");
        const phase = useTravel.getState().phase;
        if (a === "preview") return beginTravel() ? { ok: true, phase: "preview", journey: useTravel.getState().summary } : { ok: false, reason: "No complete route. Use startRoute or startJourney first." };
        if (a === "start") {
          if (phase === "idle" && !beginTravel()) return { ok: false, reason: "No complete route to travel." };
          startTravel();
          return { ok: true, phase: useTravel.getState().phase, note: "Compressed visualization; the calculated duration is unchanged." };
        }
        if (phase === "idle") return { ok: false, reason: "No journey is in progress." };
        ({ pause: pauseTravel, resume: resumeTravel, skip: skipTravel, cancel: cancelTravel } as const)[a]();
        return { ok: true, phase: useTravel.getState().phase };
      }
      case "startTour": {
        const t = oneOf(args.tourId, TOUR_IDS, "tourId");
        const tour = availableTours(data()).find((x) => x.id === t);
        if (!tour) return { ok: false, reason: "That tour's destinations are not available in this catalog." };
        useDiscoveryStore.getState().openTour(t);
        return { ok: true, tour: tour.title, stops: tour.stops.length };
      }
      case "compareSizes": {
        const a = lookup(args.firstId, "firstId"), b = lookup(args.secondId, "secondId");
        if (a.id === b.id) throw new ToolError("Choose two different objects");
        for (const o of [a, b]) if (!comparisonSize(o)) return { ok: false, object: o.name, reason: comparisonUnavailableReason(o) };
        return openComparison(a.id, b.id) ? { ok: true, comparing: [a.name, b.name] } : { ok: false, reason: "The comparison could not be opened." };
      }
      case "setRegion": {
        const r = oneOf(args.region, REGION_IDS, "region");
        goRegion(r);
        return { ok: true, region: r, navigation: xrView() ? "moving" : "arrived" };
      }
      case "setCategory": {
        const c = str(args.categoryId, "categoryId", 40);
        if (c === "none" || c === "null") { s.setCategoryFilter(null); return { ok: true, category: null }; }
        const node = findNode(c);
        if (!node) throw new ToolError(`Unknown category "${c}"`);
        s.setCategoryFilter(c);
        if (s.panel !== "guide") s.setPanel("explore");
        return { ok: true, category: node.label };
      }
      case "setZoomTarget": {
        const t = oneOf(args.target, ZOOM_TARGETS, "target");
        const eng = getEngine(), xr = xrView();
        if (t === "in") xr ? xr.zoom(0.5) : eng?.zoomBy(0.5);
        else if (t === "out") xr ? xr.zoom(2) : eng?.zoomBy(2);
        else if (t === "home") goHome();
        else if (t === "universe") goRegion("universe");
        else {
          if (!routeFor(data(), s.stops, modesFor(data())[0], s.jd, s.routeModel)?.ok) return { ok: false, reason: "No complete route to fit." };
          if (s.panel !== "directions" && s.panel !== "guide") s.setPanel("directions");
          s.requestFit();
        }
        return { ok: true, target: t };
      }
      case "controlSimulation": {
        const a = oneOf(args.action, SIMULATION_ACTIONS, "action");
        if (a === "play") s.playTime();
        else if (a === "pause") s.pauseTime();
        else s.resetTime();
        return { ok: true, simulation: a === "play" ? "running" : "paused", date: jdToIsoDate(useStore.getState().jd) };
      }
      case "surpriseMe": {
        const d = useDiscoveryStore.getState();
        if (args.intent !== undefined) d.setIntent(oneOf(args.intent, SURPRISE_INTENTS, "intent"));
        useDiscoveryStore.getState().surpriseMe();
        const after = useDiscoveryStore.getState();
        return after.surprise ? { ok: true, destination: brief(after.surprise.object), reason: after.surprise.reason } : { ok: false, reason: after.error ?? "No destination available." };
      }
      case "savePlace": {
        const o = lookup(args.id);
        const lib = useLibrary.getState();
        if (!lib.favorites.includes(o.id)) lib.toggleFavorite(o.id);
        return { ok: true, saved: o.name, note: "Saved on this browser." };
      }
      case "openAccessibilitySettings":
        useAccessibility.getState().setOpen(true);
        return { ok: true };
      case "openPanel": {
        const p = oneOf(args.panel, PANELS, "panel");
        if (p === "place" && !s.selectedId) return { ok: false, reason: "No object is selected. Use selectObject first." };
        s.setPanel(p);
        if (s.sheet === "collapsed") useStore.setState({ sheet: "half" });
        return { ok: true, panel: p };
      }
      case "setLayer": {
        const l = oneOf(args.layer, LAYERS, "layer");
        s.setLayer(l);
        return { ok: true, layer: l };
      }
      case "setViewSetting": {
        const setting = oneOf(args.setting, VIEW_SETTINGS, "setting");
        const on = bool(args.on, "on");
        if (setting === "tilt") s.setTilt(on);
        else if (setting === "orbit") {
          if (on && s.camera.mode !== "locked") return { ok: false, reason: "Orbit needs a locked object. Select one first." };
          s.setOrbitCamera(on);
        } else if (setting === "quiet-view") useFinishing.getState().setPresentation(on);
        else useAccessibility.getState().set("audioNav", on);
        return { ok: true, setting, on };
      }
      case "setAccessibility": {
        const setting = oneOf(args.setting, A11Y_SETTINGS, "setting");
        const on = bool(args.on, "on");
        useAccessibility.getState().set(({ "high-contrast": "highContrast", "larger-text": "largeText", "reduce-motion": "reduceMotion" } as const)[setting], on);
        return { ok: true, setting, on };
      }
      case "resetView":
        getEngine()?.resetView();
        xrView()?.home();
        return { ok: true };
      case "goBack":
        return useNavigation.getState().back() ? { ok: true } : { ok: false, reason: "There is no previous view." };
      case "shareView":
        await useFinishing.getState().shareView();
        return { ok: !!useFinishing.getState().share && !useFinishing.getState().share!.manual, result: useFinishing.getState().share?.message ?? "No result" };
      case "setDate": {
        const raw = str(args.date, "date", 20);
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
        const date = m ? new Date(`${raw}T12:00:00Z`) : null;
        if (!date || Number.isNaN(date.getTime())) throw new ToolError("date must be YYYY-MM-DD");
        s.pauseTime();
        s.setJd(clampPlayJd(jdTdb(date)));
        const set = jdToIsoDate(useStore.getState().jd);
        return { ok: true, date: set, clamped: set !== raw ? "The date was limited to the supported range." : undefined };
      }
      case "setTimeRate": {
        const r = oneOf(args.rate, TIME_RATE_IDS, "rate");
        s.setTimeRate(r);
        return { ok: true, rate: TIME_RATES.find((x) => x.id === r)!.label };
      }
      case "controlTour": {
        const a = oneOf(args.action, TOUR_ACTIONS, "action");
        const d = useDiscoveryStore.getState();
        if (!d.activeTourId) return { ok: false, reason: "No tour is open. Use startTour first." };
        if (a === "start") d.startTour();
        else if (a === "next" || a === "previous") {
          if (!d.started) d.startTour();
          useDiscoveryStore.getState().jumpTo(useDiscoveryStore.getState().stopIndex + (a === "next" ? 1 : -1));
        } else if (a === "pause") d.pauseTour();
        else if (a === "resume") d.resumeTour();
        else d.exitTour();
        const after = useDiscoveryStore.getState();
        const stop = after.activeTourId ? getTour(after.activeTourId)?.stops[after.stopIndex] : undefined;
        return { ok: true, action: a, stop: stop ? { index: after.stopIndex + 1, of: getTour(after.activeTourId)!.stops.length, title: stop.title } : null };
      }
      case "openEarthSky": {
        const o = lookup(args.id);
        return openEarthSky(o.id) ? { ok: true, showing: o.name, note: "Earth-centered sky chart; not a local horizon prediction." } : { ok: false, reason: `${o.name} has no direction available for the sky chart.` };
      }
      case "closeOverlay": {
        const closed: string[] = [];
        if (useComparison.getState().open) { useComparison.getState().close(); closed.push("comparison"); }
        if (useEarthSky.getState().open) { useEarthSky.getState().close(); closed.push("sky chart"); }
        if (useTravel.getState().phase === "preview") { cancelTravel(); closed.push("journey preview"); }
        if (useAccessibility.getState().open) { useAccessibility.getState().setOpen(false); closed.push("settings"); }
        if (useFinishing.getState().presentation) { useFinishing.getState().setPresentation(false); closed.push("quiet view"); }
        if (useStore.getState().aboutOpen) { useStore.getState().setAboutOpen(false); closed.push("about"); }
        return closed.length ? { ok: true, closed } : { ok: false, reason: "Nothing was open." };
      }
      case "endVoiceSession":
        useVoice.getState().endAfterSpeaking();
        return { ok: true, note: "The conversation ends after this reply." };
      case "startRoute":
      case "setRoute": {
        const a = lookup(args.originId, "originId"), b = lookup(args.destinationId, "destinationId");
        if (a.id === b.id) throw new ToolError("Origin and destination must differ");
        for (const o of [a, b]) if (!o.route.supported) return { ok: false, object: o.name, reason: o.route.reason };
        if (args.mode !== undefined) s.setMode(oneOf(args.mode, MODE_IDS, "mode"));
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
      case "getRouteContext":
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
