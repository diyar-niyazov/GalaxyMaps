import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useStore, TIME_RATES } from "./store";
import { advancePlayJd, PLAY_MIN_JD, PLAY_MAX_JD } from "../lib/ephemeris";

describe("Play time clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("document", { hidden: false });
    useStore.setState({ jd: 2461317.5 });
    useStore.getState().pauseTime();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts paused", () => {
    const t = useStore.getState().time;
    expect(t.armed).toBe(false);
    expect(t.running).toBe(false);
  });

  it("route preview and exploration time cannot run together", () => {
    useStore.getState().playTime();
    useStore.getState().setPlaying(true);
    expect(useStore.getState().time).toMatchObject({ armed: false, running: false });
    useStore.getState().setProgress(0.5);
    useStore.getState().playTime();
    expect(useStore.getState()).toMatchObject({ playing: false, progress: 0 });
    expect(useStore.getState().time.running).toBe(true);
    useStore.getState().pauseTime();
  });

  it("play arms and runs; pause disarms; reset returns to the start date", () => {
    const s = useStore.getState();
    s.playTime();
    expect(useStore.getState().time).toMatchObject({ armed: true, running: true, startJd: 2461317.5 });
    useStore.getState().setJd(2461400);
    useStore.getState().pauseTime();
    expect(useStore.getState().time.running).toBe(false);
    useStore.getState().resetTime();
    expect(useStore.getState().jd).toBe(2461317.5);
  });

  it("interaction holds the clock and resumes after idle only if still armed", async () => {
    const { interactionStart, interactionEnd } = await import("./interaction");
    useStore.getState().playTime();
    interactionStart("map");
    expect(useStore.getState().time).toMatchObject({ armed: true, running: false });
    interactionEnd("map");
    vi.advanceTimersByTime(1000);
    expect(useStore.getState().time.running).toBe(false);
    vi.advanceTimersByTime(400);
    expect(useStore.getState().time.running).toBe(true);

    interactionStart("search");
    useStore.getState().pauseTime();
    interactionEnd("search");
    vi.advanceTimersByTime(2000);
    expect(useStore.getState().time).toMatchObject({ armed: false, running: false });
  });

  it("a hidden page suspends without disarming", () => {
    useStore.getState().playTime();
    useStore.getState().suspendTime(true);
    expect(useStore.getState().time).toMatchObject({ armed: true, running: false });
    useStore.getState().suspendTime(false);
    expect(useStore.getState().time.running).toBe(true);
  });

  it("suspend never starts a paused clock", () => {
    useStore.getState().suspendTime(false);
    expect(useStore.getState().time.running).toBe(false);
  });

  it("steps at the chosen rate and clamps to the supported date range", () => {
    const week = TIME_RATES.find((r) => r.id === "week")!.daysPerSecond;
    expect(advancePlayJd(2461317.5, week, 500)).toBeCloseTo(2461321, 9);
    expect(advancePlayJd(PLAY_MAX_JD - 1, 365.25, 10_000)).toBe(PLAY_MAX_JD);
    expect(advancePlayJd(PLAY_MIN_JD + 1, -365.25, 10_000)).toBe(PLAY_MIN_JD);
  });
});
