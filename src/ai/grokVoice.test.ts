import { afterEach, describe, expect, it, vi } from "vitest";
import { GrokVoiceSession, type VoiceCallbacks } from "./grokVoice";

const RATE = 24000;
const chunk = (amp: number, ms = 40) => new Float32Array((RATE * ms) / 1000).fill(amp);

function session() {
  const cb = { onStatus: vi.fn(), onUserText: vi.fn(), onAssistantText: vi.fn(), onTool: vi.fn(), onSpeaking: vi.fn(), onWake: vi.fn(), onHearing: vi.fn(), onNotice: vi.fn() };
  const s = new GrokVoiceSession(cb as unknown as VoiceCallbacks);
  const sent: unknown[] = [];
  (s as unknown as { send(ev: unknown): void }).send = (ev) => sent.push(ev);
  return { s, cb, sent };
}

/** Feed ~0.6 s of speech then enough silence to end the utterance. */
async function speak(s: GrokVoiceSession) {
  const detect = (s as unknown as { detectSpeech(f: Float32Array): void }).detectSpeech.bind(s);
  for (let i = 0; i < 15; i++) detect(chunk(0.2));
  for (let i = 0; i < 25; i++) detect(chunk(0));
  await (s as unknown as { transcribing: Promise<void> }).transcribing;
}

afterEach(() => vi.unstubAllGlobals());

describe("Grok wake-word session", () => {
  it("sends only commands that start with Grok", async () => {
    const { s, cb, sent } = session();
    s.setWakeWord(true);
    const stt = vi.fn(async () => Response.json({ text: "Grok, take me to Mars" }));
    vi.stubGlobal("fetch", stt);
    await speak(s);
    expect(stt).toHaveBeenCalledWith("/api/stt", expect.objectContaining({ method: "POST" }));
    expect(cb.onUserText).toHaveBeenCalledWith("take me to Mars");
    expect(sent).toContainEqual({ type: "response.create" });

    sent.length = 0;
    cb.onUserText.mockClear();
    stt.mockResolvedValueOnce(Response.json({ text: "what a view" }));
    await speak(s);
    expect(cb.onUserText).not.toHaveBeenCalled();
    expect(sent).not.toContainEqual({ type: "response.create" });
  });

  it("a bare wake word arms the next utterance", async () => {
    const { s, cb } = session();
    s.setWakeWord(true);
    const stt = vi.fn(async () => Response.json({ text: "Grok." }));
    vi.stubGlobal("fetch", stt);
    await speak(s);
    expect(cb.onWake).toHaveBeenLastCalledWith("armed");
    stt.mockResolvedValueOnce(Response.json({ text: "zoom out" }));
    await speak(s);
    expect(cb.onUserText).toHaveBeenCalledWith("zoom out");
  });

  it("ignores silence and never cancels a response that is not running", async () => {
    const { s, sent } = session();
    s.setWakeWord(true);
    const stt = vi.fn();
    vi.stubGlobal("fetch", stt);
    const detect = (s as unknown as { detectSpeech(f: Float32Array): void }).detectSpeech.bind(s);
    for (let i = 0; i < 60; i++) detect(chunk(0.001));
    expect(stt).not.toHaveBeenCalled();
    s.interrupt();
    expect(sent).not.toContainEqual({ type: "response.cancel" });
  });

  it("in VR follows up after a lookup but not after an action it already spoke about", async () => {
    const { s, sent } = session();
    s.setWakeWord(true);
    const ev = (e: unknown) => (s as unknown as { onEvent(ev: unknown): Promise<void> }).onEvent(e);
    const turn = async (id: string, tool: string) => {
      sent.length = 0;
      await ev({ type: "response.created", response: { id } });
      await ev({ type: "response.output_audio.delta", delta: "AAAA" });
      await ev({ type: "response.function_call_arguments.done", name: tool, call_id: `c-${id}`, arguments: "{}" });
      await ev({ type: "response.done", response: { id } });
      await new Promise((r) => setTimeout(r, 5));
      return sent.some((e) => (e as { type: string }).type === "response.create");
    };
    expect(await turn("r1", "searchObjects")).toBe(true);
    expect(await turn("r2", "setZoomTarget")).toBe(false);
  });

  it("a stale response.done does not clear the live response", async () => {
    const { s, sent } = session();
    const ev = (e: unknown) => (s as unknown as { onEvent(ev: unknown): Promise<void> }).onEvent(e);
    await ev({ type: "response.created", response: { id: "new" } });
    await ev({ type: "response.done", response: { id: "old" } });
    s.interrupt();
    expect(sent).toContainEqual({ type: "response.cancel" });
  });

  it("treats 'no active response' as harmless", async () => {
    const { s, cb } = session();
    await (s as unknown as { onEvent(ev: unknown): Promise<void> }).onEvent({ type: "error", error: { message: "no active response found" } });
    expect(cb.onStatus).not.toHaveBeenCalled();
    expect(cb.onNotice).not.toHaveBeenCalled();
  });
});
