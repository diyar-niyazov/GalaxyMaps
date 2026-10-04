import { describe, it, expect } from "vitest";
import { Resampler, encodeWav, rms, micErrorMessage } from "./audio";
import { speechChunks } from "../lib/speech";

describe("Resampler", () => {
  it("halves 48 kHz to 24 kHz across chunk boundaries without drift", () => {
    const r = new Resampler(48000, 24000);
    const ramp = Float32Array.from({ length: 4800 }, (_, i) => i / 4800);
    const out = [...r.push(ramp.subarray(0, 1000)), ...r.push(ramp.subarray(1000, 3333)), ...r.push(ramp.subarray(3333))];
    expect(Math.abs(out.length - 2400)).toBeLessThanOrEqual(1);
    for (let i = 2; i < out.length; i++) expect(out[i] - out[i - 1]).toBeCloseTo(2 / 4800, 5);
  });

  it("converts 44.1 kHz to 16 kHz at the right rate and passes equal rates through", () => {
    const r = new Resampler(44100, 16000);
    let n = 0;
    for (let k = 0; k < 44; k++) n += r.push(new Float32Array(1002)).length;
    expect(Math.abs(n - (44 * 1002 * 16000) / 44100)).toBeLessThanOrEqual(1);
    const same = new Float32Array([0.1, 0.2]);
    expect(new Resampler(24000, 24000).push(same)).toBe(same);
  });
});

describe("encodeWav", () => {
  it("writes a 16-bit mono PCM header and clamps samples", async () => {
    const blob = encodeWav([new Float32Array([0, 1, -1]), new Float32Array([2])], 16000);
    const v = new DataView(await blob.arrayBuffer());
    expect(blob.type).toBe("audio/wav");
    expect(v.byteLength).toBe(44 + 8);
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe("RIFF");
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint32(40, true)).toBe(8);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true)]).toEqual([0, 32767, -32768, 32767]);
  });
});

describe("audio helpers", () => {
  it("computes RMS and explains common microphone failures", () => {
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
    expect(micErrorMessage({ name: "NotAllowedError" })).toMatch(/blocked/);
    expect(micErrorMessage({ name: "InsecureContext" })).toMatch(/HTTPS or on localhost/);
    expect(micErrorMessage({ name: "NotReadableError" })).toMatch(/busy/);
  });
});

describe("speechChunks", () => {
  it("splits long text at sentences within the limit and keeps every word", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is about Saturn's rings.`).join(" ");
    const chunks = speechChunks(text, 200);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.length <= 200)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text);
  });

  it("breaks an overlong sentence at spaces", () => {
    const chunks = speechChunks("word ".repeat(200), 100);
    expect(chunks.every((c) => c.length <= 100 && !c.startsWith(" "))).toBe(true);
    expect(chunks.join(" ").split(" ").length).toBe(200);
  });
});
