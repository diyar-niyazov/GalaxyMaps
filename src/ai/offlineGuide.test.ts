import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import type { Catalog, Ephemeris } from "../lib/types";
import type { DataBundle } from "../data/bundle";
import { useStore } from "../state/store";
import { offlineReply } from "./offlineGuide";
import { useTravel } from "../state/travel";
import { buildSearchIndex } from "../lib/search";
const catalog = JSON.parse(readFileSync("public/data/catalog.json", "utf8")) as Catalog;
const eph = JSON.parse(readFileSync("public/data/ephemeris.json", "utf8")) as Ephemeris;
const data = { catalog, eph, byId: new Map(catalog.objects.map((o) => [o.id, o])), search: buildSearchIndex(catalog.objects) } as DataBundle;
const original = useStore.getState();
afterEach(() => { useStore.setState(original); useTravel.setState({ phase: "idle", summary: null }); });
describe("selected-object scripted explanations", () => {
  it("answers from the selected object's sourced summary without changing navigation", async () => {
    useStore.setState({ data, selectedId: "saturn", jd: eph.startJdTdb + 30 });
    expect(await offlineReply("What makes Saturn interesting?")).toContain(data.byId.get("saturn")!.summary!.url);
    expect(useStore.getState().selectedId).toBe("saturn");
  });
  it("distinguishes geometric light delay from journey duration", async () => {
    useStore.setState({ data, selectedId: "sun", jd: eph.startJdTdb + 30 });
    const reply = await offlineReply("Explain this light delay");
    expect(reply).toContain("minutes"); expect(reply).toContain("separate from spacecraft duration");
  });
  it("previews a cinematic journey and starts it on request", async () => {
    useStore.setState({ data, jd: eph.startJdTdb + 30 });
    const preview = await offlineReply("Begin a journey to Mars");
    expect(preview).toMatch(/Ready to travel Earth → Mars/);
    expect(preview).toMatch(/compresses/);
    expect(useTravel.getState().phase).toBe("preview");
    expect(await offlineReply("start")).toMatch(/Journey started/);
    expect(useTravel.getState().phase).toBe("flying");
    expect(await offlineReply("cancel")).toMatch(/cancelled/);
    expect(useTravel.getState().phase).toBe("idle");
  });
  it("does not treat 'go to' as starting a journey", async () => {
    useStore.setState({ data, jd: eph.startJdTdb + 30 });
    await offlineReply("go to Saturn");
    expect(useTravel.getState().phase).toBe("idle");
  });
  it("opens size comparisons by name", async () => {
    useStore.setState({ data, jd: eph.startJdTdb + 30 });
    expect(await offlineReply("Compare Earth and Jupiter")).toBe("Comparing Earth and Jupiter side by side.");
  });
  it("withholds physical nearness for unknown Andromeda internal depth", async () => {
    useStore.setState({ data, selectedId: "ngc-206", jd: eph.startJdTdb + 30 });
    const reply = await offlineReply("What should I explore next?");
    expect(reply).toContain("Related destinations"); expect(reply).not.toContain("Physically nearby");
  });
});
