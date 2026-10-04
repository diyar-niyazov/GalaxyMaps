/**
 * Mission Control text conversation with Grok through our server (/api/chat). The browser never
 * sees the API key; it only runs the validated tools the model asks for and returns their results.
 */
import { runTool } from "./tools";
import { useStore } from "../state/store";
import { sourcedGuideContext } from "../lib/learning";

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

const MAX_TOOL_ROUNDS = 5;
const MAX_HISTORY = 24;

export class MissionChat {
  private history: ChatTurn[] = [];

  constructor(private onTool: (name: string, args: unknown, result: unknown) => void) {}

  reset() {
    this.history = [];
  }

  /** Send one user message; runs the tool loop and returns Grok's final text. */
  async ask(text: string, signal?: AbortSignal): Promise<string> {
    this.history.push({ role: "user", content: text });
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const reply = await this.post(signal);
      const calls = reply.tool_calls ?? [];
      this.history.push({ role: "assistant", content: reply.content || null, ...(calls.length ? { tool_calls: calls } : {}) });
      if (!calls.length) {
        this.trim();
        return reply.content || "Done.";
      }
      for (const c of calls) {
        let args: Record<string, unknown> | null = null;
        try { args = JSON.parse(c.function.arguments || "{}"); } catch { args = null; }
        const result = args === null ? { error: "Arguments were not valid JSON" } : await runTool(c.function.name, args);
        this.onTool(c.function.name, args, result);
        this.history.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result).slice(0, 6000) });
      }
    }
    this.trim();
    return "I ran several map actions; tell me what you'd like next.";
  }

  private trim() {
    if (this.history.length <= MAX_HISTORY) return;
    // Drop whole exchanges from the front, keeping the history starting at a user turn.
    let i = this.history.length - MAX_HISTORY;
    while (i < this.history.length && this.history[i].role !== "user") i++;
    this.history = this.history.slice(i);
  }

  private async post(signal?: AbortSignal): Promise<{ content: string; tool_calls?: ToolCall[] }> {
    const s = useStore.getState();
    const context = s.data ? sourcedGuideContext(s.data, s.selectedId, s.jd) : "";
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: this.history, context }),
      signal: signal ?? AbortSignal.timeout(60_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // The failed user turn stays out of history so a retry starts clean.
      const last = this.history.map((t) => t.role).lastIndexOf("user");
      if (last >= 0) this.history = this.history.slice(0, last);
      throw new Error(body.error ?? `Mission Control is unavailable (HTTP ${res.status}).`);
    }
    return body;
  }
}
