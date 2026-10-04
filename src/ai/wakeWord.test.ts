import { describe, expect, it } from "vitest";
import { wakeCommand } from "./wakeWord";

describe("Grok wake word", () => {
  it("strips the wake word and keeps the command", () => {
    expect(wakeCommand("Grok, take me to Saturn.")).toBe("take me to Saturn.");
    expect(wakeCommand("hey grok what am I looking at")).toBe("what am I looking at");
    expect(wakeCommand("Okay, Groq. Zoom in")).toBe("Zoom in");
  });

  it("ignores speech that is not addressed to Grok", () => {
    expect(wakeCommand("take me to Saturn")).toBeNull();
    expect(wakeCommand("I think Grok is cool")).toBeNull();
    expect(wakeCommand("groceries later")).toBeNull();
    expect(wakeCommand("   ")).toBeNull();
  });

  it("arms on a bare wake word and accepts the follow-up", () => {
    expect(wakeCommand("Grok.")).toBe("");
    expect(wakeCommand("take me to Mars", true)).toBe("take me to Mars");
  });
});
