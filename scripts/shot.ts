/**
 * One-off headless screenshot of the dev server, for visual review.
 *
 *   npx tsx scripts/shot.ts "/?place=saturn" out.png [width] [height] [js-to-run-before-capture]
 *   CLIP="x,y,w,h" crops the capture to a region at native resolution.
 *   FAKE_MIC=1 grants microphone access and feeds Chromium's synthetic test tone.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [path = "/", out = "/tmp/shot.png", w = "1440", h = "900", js = ""] = process.argv.slice(2);
const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const PORT = 9800 + Math.floor(Math.random() * 150);
const width = Number(w), height = Number(h);
const mobile = width < 720;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "galaxymaps-shot-"));
const browser = spawn(process.env.CHROMIUM ?? "chromium", [
  "--headless=new", "--no-sandbox", "--hide-scrollbars", `--window-size=${width},${height}`,
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  ...(process.env.FAKE_MIC ? ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] : []),
  "about:blank",
], { stdio: "ignore" });

let url = "";
for (let i = 0; i < 50 && !url; i++) {
  try {
    const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
    url = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? "";
  } catch {
    /* not up yet */
  }
  if (!url) await sleep(200);
}
const ws = new WebSocket(url);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map<number, (v: { result?: Record<string, unknown>; error?: { message: string } }) => void>();
ws.onmessage = (ev) => {
  const m = JSON.parse(String(ev.data));
  pending.get(m.id)?.(m);
  pending.delete(m.id);
};
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<Record<string, unknown>>((resolve, reject) => {
    const n = ++id;
    pending.set(n, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result ?? {})));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expression: string) => {
  const r = (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })) as { result?: { value?: unknown }; exceptionDetails?: { text: string } };
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result?.value;
};

try {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Page.navigate", { url: BASE + path });
  for (let i = 0; i < 120; i++) {
    if (await evaluate(`!!(document.querySelector(".map-canvas") && !document.querySelector(".map-loading") && globalThis.__gm?.engine())`).catch(() => false)) break;
    await sleep(150);
  }
  await sleep(2500);
  if (js) console.log(JSON.stringify(await evaluate(`(async () => { ${js} })()`)));
  await sleep(2500);
  const clip = process.env.CLIP?.split(",").map(Number);
  const { data } = (await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { x: clip[0], y: clip[1], width: clip[2], height: clip[3], scale: 1 } } : {}) })) as { data: string };
  writeFileSync(out, Buffer.from(data, "base64"));
  console.log(`wrote ${out}`);
} finally {
  ws.close();
  browser.kill();
  await sleep(200);
  rmSync(profile, { recursive: true, force: true });
}
