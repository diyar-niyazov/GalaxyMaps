import { describe, expect, it } from "vitest";
import { experienceOf } from "./selectors";

describe("explicit experience modes", () => {
  it("comparison takes precedence over the camera mode it overlays", () => {
    expect(experienceOf("locked", true)).toBe("comparison");
    expect(experienceOf("route", true)).toBe("comparison");
    expect(experienceOf("explore", true)).toBe("comparison");
  });
  it("otherwise reports exactly one camera mode", () => {
    expect(experienceOf("explore", false)).toBe("explore");
    expect(experienceOf("locked", false)).toBe("locked");
    expect(experienceOf("route", false)).toBe("route");
  });
});
