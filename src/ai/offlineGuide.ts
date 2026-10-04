/**
 * Offline guide: a deterministic, keyword-based script that uses the same validated
 * tools as the live Grok session. It is NOT an AI model and is labeled as such in the UI.
 */
import { runTool as runToolTyped } from "./tools";
import { useStore } from "../state/store";
import { lightDelay, nearbyDestinations } from "../lib/learning";
import { formatDistance } from "../lib/format";
import { resolveOne } from "../lib/search";
import { useTravel } from "../state/travel";

type R = Record<string, any>;
const runTool = (name: string, args: Record<string, unknown>) => runToolTyped(name, args) as Promise<R>;

const MODE_WORDS: [RegExp, string][] = [
  [/\blight\b/, "light"],
  [/voyager/, "voyager-1"],
];

function resolve(name: string) {
  const d = useStore.getState().data;
  if (!d) return null;
  const cleaned = name.replace(/^(the|a|an)\s+/i, "").replace(/[?.!,]+$/, "").trim();
  return cleaned ? resolveOne(d.search, cleaned) : null;
}

function journeyText(j: R): string {
  if (!j.active) return j.error ?? j.message ?? "There is no complete journey yet.";
  const route = j.stops.join(" → ");
  if (j.transfer) {
    return `${route}: ${j.routeKind}. Modeled flight time ${j.modeledFlightTime}, departing ${j.transfer.departure}${j.transfer.departureIsNextAlignment ? " (next idealized alignment)" : ""} and arriving ${j.transfer.arrival}. For comparison, the straight-line distance on ${j.epoch} is ${j.straightLineDistance}, which takes ${j.comparison.directDistanceTime} at ${j.comparison.mode}. ${j.assumptions[0]}`;
  }
  const legs = j.legs.length > 1 ? ` across ${j.legs.length} legs` : "";
  return `${route}: ${j.straightLineDistance}${legs} on ${j.epoch}. At ${j.comparison.mode} (${j.comparison.speed}), that is ${j.modeledFlightTime}${j.modeledFlightTimeContext ? ` (${j.modeledFlightTimeContext})` : ""}. This is a constant-speed straight line; it ignores acceleration, gravity and the targets' own motion.`;
}

const MARS_EXPLAINER =
  "Real spacecraft don't fly straight at Mars. Leaving Earth, a probe already shares Earth's ~30 km/s orbit around the Sun. The cheapest path is a Hohmann transfer: a half-ellipse that touches Earth's orbit and Mars's orbit. Mars must be about 44° ahead of Earth at launch, so these windows open roughly every 26 months. Ask for directions from Earth to Mars to see the idealized transfer drawn on the map, with all assumptions listed.";

const REGION_WORDS: [RegExp, string][] = [
  [/observable universe|whole universe|the universe/, "universe"],
  [/local group/, "local-group"],
  [/virgo/, "virgo"],
  [/milky way/, "milky-way"],
  [/inner (planets|solar system)/, "inner"],
  [/kuiper/, "kuiper"],
  [/solar system/, "solar"],
  [/nearby stars|stellar neighbou?rhood/, "neighborhood"],
];
const TOUR_WORDS: [RegExp, string][] = [
  [/nebula/, "nebulae"], [/black hole|extreme/, "extremes"], [/andromeda/, "andromeda"], [/demo.?2|spacex/, "spacex-demo-2"], [/spaceflight|astronaut/, "human-spaceflight"],
];

/** Map actions beyond routing: journeys, tours, comparisons, regions, clock, saving, accessibility. */
async function appCommand(q: string): Promise<string | null> {
  const fail = (r: R) => r.error ?? r.reason ?? null;
  const phase = useTravel.getState().phase;
  if ((phase === "preview" && /^(start|go|engage|yes|let's go)\b|start (the )?journey/.test(q)) || /^start (the )?journey$/.test(q)) {
    const r = await runTool("controlJourney", { action: "start" });
    return r.ok ? "Journey started. Space pauses, Escape exits, and Skip jumps to arrival." : r.reason;
  }
  if (/(begin|start|launch).*(journey|trip|travel)|take off|travel there/.test(q)) {
    const dest = q.match(/(?:journey|trip|travel)\s+to\s+(.+)$/);
    if (dest) {
      const o = resolve(dest[1]);
      if (!o) return `I couldn't find “${dest[1]}” in the catalog.`;
      const r = await runTool("startRoute", { originId: "earth", destinationId: o.id });
      if (r.error || r.ok === false) return fail(r) ?? "That route is unavailable.";
    }
    const p = await runTool("controlJourney", { action: "preview" });
    if (p.ok === false) return p.reason;
    const j = p.journey;
    return `Ready to travel ${j.originName} → ${j.destinationName}: ${j.vehicle}, ${j.duration}. ${j.model} Press Start journey, or say “start”.`;
  }
  const DONE = { pause: "paused", resume: "resumed", skip: "skipped to arrival", cancel: "cancelled" } as const;
  for (const action of ["pause", "resume", "skip", "cancel"] as const) {
    if (new RegExp(`\\b${action}\\b.*(journey|trip|travel)|^${action}$`).test(q) || (phase !== "idle" && new RegExp(`^${action}\\b`).test(q))) {
      const r = await runTool("controlJourney", { action });
      return r.ok ? `Journey ${DONE[action]}.` : r.reason;
    }
  }
  const cmp = q.match(/compare (?:the size of )?(.+?) (?:and|with|to|vs\.?) (.+?)(?: sizes?)?$/);
  if (cmp && !/mode|speed/.test(q)) {
    const a = resolve(cmp[1]), b = resolve(cmp[2]);
    if (!a || !b) return `I couldn't find “${!a ? cmp[1] : cmp[2]}” in the catalog.`;
    const r = await runTool("compareSizes", { firstId: a.id, secondId: b.id });
    return r.ok ? `Comparing ${a.name} and ${b.name} side by side.` : `${r.object ? `${r.object}: ` : ""}${fail(r)}`;
  }
  if (/\btour\b/.test(q)) {
    const t = TOUR_WORDS.find(([re]) => re.test(q))?.[1];
    if (t) {
      const r = await runTool("startTour", { tourId: t });
      return r.ok ? `Opening “${r.tour}”, ${r.stops} stops.` : r.reason;
    }
  }
  if (/zoom|go to|take me to|show( me)?|fly to/.test(q)) {
    const region = REGION_WORDS.find(([re]) => re.test(q))?.[1];
    if (region) {
      await runTool("setRegion", { region });
      return region === "universe" ? "Showing the observable universe. Directions are true; distances are compressed logarithmically." : "Moving the map there.";
    }
  }
  if (/^zoom in\b/.test(q)) { await runTool("setZoomTarget", { target: "in" }); return "Zoomed in."; }
  if (/^zoom out\b/.test(q)) { await runTool("setZoomTarget", { target: "out" }); return "Zoomed out."; }
  if (/\b(go )?home\b/.test(q) && q.length < 20) { await runTool("setZoomTarget", { target: "home" }); return "Back home to Earth."; }
  if (/unlock|free (camera|explore)|stop following/.test(q)) { await runTool("unlockCamera", {}); return "Camera unlocked; the map pans freely."; }
  if (/(play|start|run) (the )?(time|simulation|clock)/.test(q)) { await runTool("controlSimulation", { action: "play" }); return "Simulation running: planets and moons are moving."; }
  if (/(pause|stop) (the )?(time|simulation|clock)/.test(q)) { await runTool("controlSimulation", { action: "pause" }); return "Simulation paused."; }
  if (/surprise me/.test(q)) {
    const r = await runTool("surpriseMe", {});
    return r.ok ? `${r.destination.name}: ${r.reason}` : r.reason;
  }
  if (/\b(save|bookmark)\b/.test(q)) {
    const m = q.match(/(?:save|bookmark)\s+(.+?)(?:\s+for later)?$/);
    const st = useStore.getState();
    const o = m && !/^(this|it|that)( place)?$/.test(m[1]) ? resolve(m[1]) : st.data?.byId.get(st.selectedId ?? "") ?? null;
    if (!o) return "Select a destination first, or say “save Saturn”.";
    await runTool("savePlace", { id: o.id });
    return `Saved ${o.name} on this browser.`;
  }
  if (/describe (the |this |current )?(view|map|screen)|what am i (looking at|seeing)/.test(q)) return (await runTool("describeView", {})).description;
  if (/accessib|high contrast|larger text|bigger text|reduce motion/.test(q)) { await runTool("openAccessibilitySettings", {}); return "Opened accessibility settings: high contrast, larger text, reduced motion and the map navigation toolbar."; }
  return null;
}

export async function offlineReply(input: string): Promise<string> {
  const q = input.toLowerCase().trim();
  if (!q) return "Type a request, e.g. “Take me from Earth to Polaris”.";
  const st = useStore.getState();
  const selected = st.data?.byId.get(st.selectedId ?? "");
  if (selected && st.data) {
    if (/what makes|unusual|interesting/.test(q)) {
      const summary = selected.summary;
      return summary ? `${selected.name}: ${summary.text}\nSource: ${summary.url}` : `${selected.name}: ${selected.facts.slice(0, 2).map((f) => `${f.label}: ${f.value}`).join(". ")}. More source details are in this object's card.`;
    }
    if (/light delay|light.travel|light reaching/.test(q)) {
      const delay = lightDelay(selected, st.data, st.jd);
      return delay ? `${delay.text}\n${delay.model}\nThis is a light-travel insight, separate from spacecraft duration.` : `A numerical light delay is unavailable for ${selected.name}: its record has no compatible measured Earth separation or sourced cosmological lookback time.`;
    }
    if (/explore next/.test(q)) {
      const nearby = nearbyDestinations(selected, st.data, st.jd);
      if (nearby.length) return `Physically nearby ${selected.name}, using three-dimensional positions:\n${nearby.map(({ object, km }) => `• ${object.name}: ${formatDistance(km)} from ${selected.name}`).join("\n")}\nOpen a name from the object's card to continue.`;
      const related = st.data.catalog.objects.filter((o) => o.id !== selected.id && o.image && o.featured && (selected.parentId ? o.parentId === selected.parentId : o.category === selected.category)).slice(0, 3);
      return related.length ? `Related destinations: ${related.map((o) => o.name).join(", ")}. These share a host or category; no physical-nearness claim is made.` : `Try Surprise me or a curated tour for a sourced next destination. Physical proximity isn't available for ${selected.name}.`;
    }
  }

  if (/why|straight|curv|hohmann|transfer/.test(q) && /mars/.test(q)) return MARS_EXPLAINER;

  const action = await appCommand(q);
  if (action) return action;

  const routeMatch = q.match(/(?:from\s+(.+?)\s+)?to\s+(.+?)(?:\s+(?:by|at|with|using|via)\s+(.+))?$/);
  if (/(take me|route|directions|go|travel|fly|get|journey|trip)/.test(q) && routeMatch) {
    const origin = routeMatch[1] ? resolve(routeMatch[1]) : st.data?.byId.get(st.stops[0] ?? "earth") ?? null;
    const dest = resolve(routeMatch[2]);
    if (!dest) return `I couldn't find “${routeMatch[2]}” in the GalaxyMaps catalog, so I can't route there.`;
    if (!origin) return `I couldn't find “${routeMatch[1]}” in the catalog.`;
    const modeText = routeMatch[3] ?? q;
    const mode = MODE_WORDS.find(([re]) => re.test(modeText))?.[1];
    const r = await runTool("setRoute", { originId: origin.id, destinationId: dest.id, ...(mode ? { mode } : {}) });
    if (r.error) return r.error;
    if (r.ok === false) return `${r.object}: ${r.reason}`;
    return journeyText(r);
  }

  if (/add|stop at|via|on the way|detour|stops?\b/.test(q)) {
    const m = q.match(/(?:add|stop at|via)\s+(.+?)(?:\s+(?:as a stop|on the way))?$/);
    if (m && !/^(a )?stops?$/.test(m[1])) {
      const o = resolve(m[1]);
      if (!o) return `I couldn't find “${m[1]}” in the catalog.`;
      const r = await runTool("addStop", { objectId: o.id });
      if (r.error) return r.error;
      if (r.ok === false) return r.reason;
      return `Added ${r.added}. It adds ${r.addedDistance} (${r.addedPercent}% longer), so it ${r.onTheWay ? "is roughly on the way" : "is a real detour, not on the way"}. ${journeyText(r.journey)}`;
    }
    const r = await runTool("suggestStops", { limit: 3 });
    if (r.error) return r.error;
    return "Cheapest stops to add, by evaluated detour:\n" + r.suggestions.map((s: R) => `• ${s.name}: +${s.addedDistance} (+${s.addedPercent}%)${s.onTheWay ? ", on the way" : ""}`).join("\n");
  }

  if (/compare|which (mode|ship|speed)|all modes/.test(q)) {
    const r = await runTool("compareTravelModes", {});
    if (r.error) return r.error;
    return r.comparisons.map((c: R) => `• ${c.mode}: ${c.time}`).join("\n") + `\n${r.note}`;
  }

  if (/explain|how far|how long|narrate|tell me about (this|the) (trip|journey|route)|summar/.test(q)) {
    return journeyText(await runTool("explainCurrentJourney", {}));
  }

  if (/ring/.test(q)) {
    const r = await runTool("recommendDestinations", { feature: "rings" });
    return `Destinations with rings in the catalog: ${r.destinations.map((d: R) => d.name).join(", ")}.`;
  }
  if (/exoplanet|planets around|other planets/.test(q)) {
    const r = await runTool("recommendDestinations", { feature: "exoplanets" });
    return `Stars with confirmed exoplanets (NASA Exoplanet Archive): ${r.destinations.map((d: R) => d.name).join(", ")}.`;
  }
  if (/galax/.test(q)) {
    const r = await runTool("recommendDestinations", { feature: "galaxies" });
    return `Galaxies you can select: ${r.destinations.map((d: R) => d.name).join(", ")}. Routes beyond the Local Group use simplified static distances.`;
  }

  const show = q.match(/(?:show( me)?|where is|find|go to|what is|tell me about)\s+(.+)$/);
  if (show) {
    const o = resolve(show[2]);
    if (!o) return `“${show[2]}” isn't in the GalaxyMaps catalog.`;
    await runTool("showObject", { id: o.id });
    const d = await runTool("getObjectDetails", { id: o.id });
    return `${d.name}: ${d.subtitle}.${d.distanceFromSun ? ` ${d.distanceFromSun} from the Sun.` : ""}${d.routeUnavailableReason ? ` Routing unavailable: ${d.routeUnavailableReason}` : ""}`;
  }

  const direct = resolve(q);
  if (direct) {
    await runTool("showObject", { id: direct.id });
    return `Showing ${direct.name}. Say “take me to ${direct.name}” for directions.`;
  }

  return "I'm the offline scripted guide, so I understand a few patterns: “take me from Earth to Polaris”, “begin a journey to Mars”, “compare Earth and Jupiter”, “start the nebulae tour”, “zoom out to the observable universe”, “add Vega”, “explain this journey”, “show me Saturn”, “describe the view”, “play the simulation”, or “why don't rockets fly straight to Mars?”";
}
