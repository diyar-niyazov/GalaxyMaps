import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// A placeholder key set before import: dotenv never overrides it, and xAI is stubbed below.
process.env.XAI_API_KEY = "test-key";
process.env.VERCEL = "1";

const realFetch = globalThis.fetch;
const xai = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
let server: Server;
let base = "";

beforeAll(async () => {
  vi.stubGlobal("fetch", (url: string | URL, init?: RequestInit) => (String(url).startsWith("https://api.x.ai/") ? xai(String(url), init ?? {}) : realFetch(url, init)));
  const { default: app } = await import("./index");
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server?.close(); vi.unstubAllGlobals(); });

describe("speech proxies", () => {
  it("/api/tts sends text to xAI TTS with the configured voice and returns MP3", async () => {
    xai.mockResolvedValueOnce(new Response(new Uint8Array([0xff, 0xfb, 1, 2]), { status: 200 }));
    const r = await realFetch(`${base}/api/tts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Saturn has rings." }) });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/audio\/mpeg/);
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([0xff, 0xfb, 1, 2]);
    const [url, init] = xai.mock.calls.at(-1)!;
    expect(url).toBe("https://api.x.ai/v1/tts");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(JSON.parse(String(init.body))).toMatchObject({ text: "Saturn has rings.", language: "en", voice_id: expect.any(String) });
  });

  it("/api/tts serves repeats from cache and rejects empty or oversized text", async () => {
    const calls = xai.mock.calls.length;
    const again = await realFetch(`${base}/api/tts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Saturn has rings." }) });
    expect(again.status).toBe(200);
    expect(xai.mock.calls.length).toBe(calls);
    for (const text of ["", "x".repeat(1501)]) {
      const r = await realFetch(`${base}/api/tts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      expect(r.status).toBe(400);
    }
  });

  it("/api/stt forwards the WAV as multipart and returns the transcript", async () => {
    xai.mockResolvedValueOnce(Response.json({ text: " Show me Betelgeuse. " }));
    const wav = new Uint8Array(400).fill(1);
    const r = await realFetch(`${base}/api/stt`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav });
    expect(await r.json()).toEqual({ text: "Show me Betelgeuse." });
    const [url, init] = xai.mock.calls.at(-1)!;
    expect(url).toBe("https://api.x.ai/v1/stt");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("grok-voice-transcribe-2.0");
    expect(form.getAll("keyterm").length).toBeGreaterThan(10);
    expect((form.get("file") as Blob).size).toBe(400);
    expect([...form.keys()].at(-1)).toBe("file");
  });

  it("/api/stt rejects a missing recording and reports xAI failures", async () => {
    expect((await realFetch(`${base}/api/stt`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: new Uint8Array(10) })).status).toBe(400);
    xai.mockResolvedValueOnce(Response.json({ error: "quota" }, { status: 429 }));
    const r = await realFetch(`${base}/api/stt`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: new Uint8Array(400) });
    expect(r.status).toBe(502);
  });
});
