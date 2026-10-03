/**
 * Headless browser smoke test against a running SpaceMaps server.
 *
 *   npm run build && npm start          # serves http://localhost:8787
 *   npm run smoke                       # or BASE_URL=http://localhost:5173 npm run smoke
 *   npm run smoke -- --screenshots      # also writes docs/screenshots/*.png
 *
 * Drives system Chromium (CHROMIUM env var, default "chromium") over the DevTools protocol.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const CHROMIUM = process.env.CHROMIUM ?? "chromium";
const PORT = 9300 + Math.floor(Math.random() * 500);
const SHOTS = process.argv.includes("--screenshots");
const W = 1440, H = 900;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "spacemaps-smoke-"));
const browser = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--hide-scrollbars", `--window-size=${W},${H}`, "--force-device-scale-factor=1",
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });

async function cdpTarget(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    try {
      const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error(`Chromium did not expose DevTools on port ${PORT}`);
}

let ws: WebSocket | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function send(method: string, params: Record<string, unknown> = {}): Promise<any> {
  const id = nextId++;
  ws!.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate<T = unknown>(expression: string): Promise<T> {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value as T;
}

async function waitFor(expression: string, timeoutMs = 15000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await evaluate<boolean>(`!!(${expression})`).catch(() => false)) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function open(path: string) {
  await send("Page.navigate", { url: BASE + path });
  await waitFor(`document.querySelector(".map-canvas") && !document.querySelector(".map-loading")`);
  await sleep(1500);
}

async function shot(name: string) {
  if (!SHOTS) return;
  await sleep(3500);
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  mkdirSync("docs/screenshots", { recursive: true });
  writeFileSync(`docs/screenshots/${name}.png`, Buffer.from(data, "base64"));
}

const text = (sel: string) => `document.querySelector(${JSON.stringify(sel)})?.innerText ?? ""`;

const results: { name: string; ok: boolean; detail: string }[] = [];
async function check(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (e) {
    results.push({ name, ok: false, detail: (e as Error).message });
  }
}
function expect(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

try {
  const sock = new WebSocket(await cdpTarget());
  ws = sock;
  await new Promise((r, j) => {
    sock.onopen = r;
    sock.onerror = () => j(new Error("CDP WebSocket failed"));
  });
  sock.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data));
    const p = msg.id && pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  await check("API status reports Grok configuration honestly", async () => {
    const s = (await (await fetch(`${BASE}/api/status`)).json()) as { grok: { configured: boolean } };
    return `grok.configured = ${s.grok.configured}`;
  });

  await check("Home view loads with Earth", async () => {
    await open("/");
    const labels = await evaluate<string>(`[...document.querySelectorAll(".map-label")].map(e => e.textContent).join(",")`);
    expect(labels.includes("Earth"), `labels: ${labels}`);
    await shot("earth");
    return "Earth label visible";
  });

  await check("Shared URL opens Earth → Polaris at light speed", async () => {
    await open("/?route=earth,polaris&mode=light");
    await waitFor(`document.querySelector(".route-time")`);
    const t = await evaluate<string>(text(".route-time"));
    expect(/^4\d\d years$/.test(t.trim()), `route time "${t}"`);
    await shot("route-polaris");
    return t;
  });

  await check("Journey playback advances", async () => {
    await evaluate(`document.querySelector('[aria-label="Play journey"]').click()`);
    await sleep(3000);
    const v = Number(await evaluate<string>(`document.querySelector('[aria-label="Journey progress"]').value`));
    expect(v > 0, `progress ${v}`);
    return `progress after 3 s of a 10 s playback: ${v} / ${await evaluate<string>(`document.querySelector('[aria-label="Journey progress"]').max`)}`;
  });

  await check("Multi-stop route via URL has two legs", async () => {
    await open("/?route=earth,vega,polaris&mode=voyager-1-speed");
    await waitFor(`document.querySelectorAll(".legs li").length === 2`);
    return await evaluate<string>(`[...document.querySelectorAll(".legs li")].map(l => l.innerText.replace(/\\n/g, " ")).join(" | ")`);
  });

  await check("Place card for Saturn shows provenance", async () => {
    await open("/?place=saturn");
    await waitFor(`document.querySelector(".panel.place")`);
    const body = await evaluate<string>(text(".sidebar"));
    expect(/Saturn/.test(body) && /(Observed image|Scientific illustration|AI reconstruction)/.test(body), "missing name or imagery label");
    await shot("place-saturn");
    return "name, imagery label present";
  });

  await check("Offline guide refuses destinations outside the catalog", async () => {
    await open("/?panel=guide");
    const reply = await evaluate<string>(`(async () => {
      const i = document.querySelector(".composer input");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "take me to the Death Star");
      i.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(r => setTimeout(r, 100));
      document.querySelector(".composer button[type=submit]").click();
      await new Promise(r => setTimeout(r, 800));
      return [...document.querySelectorAll(".msg.assistant")].pop()?.innerText ?? "";
    })()`);
    expect(/couldn.t find/i.test(reply) && /scripted/i.test(reply), reply);
    await shot("guide");
    return reply.replace(/\n+/g, " ");
  });

  await check("Mars transfer demo shows Hohmann numbers", async () => {
    await open("/?panel=transfer");
    const body = await evaluate<string>(text(".sidebar"));
    expect(/2[45]\d days/.test(body), "no transfer duration");
    await shot("transfer");
    return body.match(/2[45]\d days/)![0];
  });

  for (const [view, layer] of [["solar", ""], ["milky-way", ""], ["milky-way", "&layer=atlas"], ["nearby", "&layer=atlas"], ["local-group", ""]] as const) {
    await check(`Scale view ${view}${layer ? " (atlas)" : ""} renders`, async () => {
      await open(`/?view=${view}${layer}`);
      await sleep(2500);
      const scale = await evaluate<string>(text(".scalebar-label"));
      expect(scale.trim().length > 0, "empty scale bar");
      await shot(`${view === "solar" ? "solar-system" : view === "nearby" ? "nearby" : view}${layer ? "-atlas" : ""}`);
      return `scale bar: ${scale.trim()}`;
    });
  }

  const errors = await evaluate<number>(`document.querySelectorAll(".crash").length`);
  results.push({ name: "No error boundary tripped", ok: errors === 0, detail: `${errors} crash panels` });
} catch (e) {
  results.push({ name: "Smoke harness", ok: false, detail: (e as Error).message });
} finally {
  ws?.close();
  browser.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  —  ${r.detail}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed against ${BASE}`);
process.exit(failed ? 1 : 0);
