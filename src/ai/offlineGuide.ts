/**
 * Offline guide: a deterministic, keyword-based script that uses the same validated
 * tools as the live Grok session. It is NOT an AI model and is labeled as such in the UI.
 */
import { runTool as runToolTyped } from "./tools";
import { useStore } from "../state/store";
import { resolveOne } from "../lib/search";

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

export async function offlineReply(input: string): Promise<string> {
  const q = input.toLowerCase().trim();
  if (!q) return "Type a request, e.g. “Take me from Earth to Polaris”.";
  const st = useStore.getState();

  if (/why|straight|curv|hohmann|transfer/.test(q) && /mars/.test(q)) return MARS_EXPLAINER;

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

  return "I'm the offline scripted guide, so I understand a few patterns: “take me from Earth to Polaris”, “by Voyager”, “add Vega”, “suggest stops”, “compare light speed and Voyager”, “explain this journey”, “show me Saturn”, “which destinations have rings?”, or “why don't rockets fly straight to Mars?”";
}
