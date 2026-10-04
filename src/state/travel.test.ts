import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Catalog, Ephemeris } from "../lib/types";
import type { DataBundle } from "../data/bundle";
import { useStore } from "./store";
import { modesFor, routeFor } from "./selectors";
import { beginTravel, startTravel, useTravel } from "./travel";

const engine = {
  setJd: vi.fn(),
  setTravel: vi.fn(),
  getJd: () => useStore.getState().jd,
  info: () => ({ view: { center: [0, 0, 0] as [number, number, number], widthKm: 1e8, heading: 0, tilt: 0 } }),
};
vi.mock("../map/engineRef", () => ({ getEngine: () => engine }));
vi.mock("../lib/motion", () => ({ reducedMotion: () => false }));

const catalog = JSON.parse(readFileSync("public/data/catalog.json", "utf8")) as Catalog;
const eph = JSON.parse(readFileSync("public/data/ephemeris.json", "utf8")) as Ephemeris;
const data = { catalog, eph, byId: new Map(catalog.objects.map((object) => [object.id, object])) } as DataBundle;
const original = useStore.getState();
const travelOriginal = useTravel.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useTravel.setState(travelOriginal);
  useStore.setState({
    data, jd: eph.startJdTdb, selectedId: "mars", panel: "directions",
    stops: ["earth", "mars"], modeId: "light", routeModel: "auto",
    progress: 0, playing: false, camera: { mode: "route", lockedId: null },
    time: { ...original.time, armed: true, running: true },
  });
});
afterEach(() => {
  useStore.setState(original);
  useTravel.setState(travelOriginal);
});

describe("journey departure clock", () => {
  it("jumps Play time to the Hohmann departure date when the journey starts", () => {
    const mode = modesFor(data)[0];
    const planned = routeFor(data, ["earth", "mars"], mode, eph.startJdTdb, "auto");
    expect(planned?.ok && planned.transfer).toBeTruthy();
    if (!planned?.ok || !planned.transfer) return;
    expect(planned.transfer.departJd).toBeGreaterThan(eph.startJdTdb);

    expect(beginTravel()).toBe(true);
    expect(useStore.getState().jd).toBe(eph.startJdTdb);
    startTravel();
    expect(useStore.getState().jd).toBeCloseTo(planned.transfer.departJd);
    expect(useStore.getState().time.running).toBe(false);
    expect(engine.setJd).toHaveBeenCalledWith(planned.transfer.departJd);
  });

  it("leaves the date alone for a straight-line benchmark with no transfer window", () => {
    useStore.setState({ stops: ["earth", "proxima-centauri"] });
    expect(beginTravel()).toBe(true);
    startTravel();
    expect(useStore.getState().jd).toBe(eph.startJdTdb);
  });
});
