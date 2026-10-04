import { describe, it, expect } from "vitest";
import { parseSharedView } from "./urlState";
import { parseLibrary } from "./library";
import { isLocalUrl } from "../lib/share";

const view = { selectedId: "saturn", panel: "place", layer: "realistic", jd: 2461317.5, stops: ["earth", "mars"], modeId: "light", routeModel: "auto", progress: 0, inside: null, sheet: "half", camera: { mode: "locked", lockedId: "saturn" }, view: { center: [1, 2, 3], widthKm: 300000, heading: 1.1, tilt: 0.9 } };
describe("shared navigation boundary", () => {
  it("retains exact epoch camera mode angle and route", () => { expect(parseSharedView(JSON.stringify({ version: 2, view }))?.view).toEqual(view); });
  it("restores an exact sky direction and rejects incompatible or unsafe chart state", () => {
    const sky = { id: "saturn", center: { raDeg: 105, decDeg: -17 }, fieldDeg: 85 };
    expect(parseSharedView(JSON.stringify({ version: 2, view, sky }))?.sky).toEqual(sky);
    for (const bad of [{ ...sky, fieldDeg: 1000 }, { ...sky, center: { raDeg: 360, decDeg: 0 } }, { ...sky, center: { raDeg: 1, decDeg: NaN } }]) expect(parseSharedView(JSON.stringify({ version: 2, view, sky: bad }))).toBeNull();
    expect(parseSharedView(JSON.stringify({ version: 2, view, sky, comparison: { pair: ["earth", "sun"], mode: "true-scale", rotation: [0, 0], zoom: 1 } }))).toBeNull();
  });
  it("rejects old malformed and unbounded physical views", () => {
    for (const raw of [null, "{", JSON.stringify({ version: 1, view }), JSON.stringify({ version: 2, view: { ...view, stops: ["earth"] } }), JSON.stringify({ version: 2, view: { ...view, jd: 1e100 } }), JSON.stringify({ version: 2, view: { ...view, view: { ...view.view, center: [1, 2] } } }), JSON.stringify({ version: 2, view: { ...view, camera: { mode: "pan-forever" } } })]) expect(parseSharedView(raw)).toBeNull();
  });
  it("validates lightweight persisted data and deduplicates identities", () => { expect(parseLibrary("{")).toEqual({ version: 1, favorites: [], recent: [] }); expect(parseLibrary(JSON.stringify({ version: 1, favorites: ["earth", "earth", 12, "bad id"], recent: ["mars"] })).favorites).toEqual(["earth"]); });
  it("labels local URLs honestly", () => { for (const url of ["http://localhost:5174", "http://127.0.0.1", "http://192.168.1.2", "bad"]) expect(isLocalUrl(url)).toBe(true); expect(isLocalUrl("https://maps.example.org")).toBe(false); });
});
