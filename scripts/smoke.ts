/**
 * Headless browser smoke test against the GalaxyMaps dev server (uses dev-only hooks on globalThis.__gm).
 *
 *   npm run dev                          # serves http://localhost:5173 (+ API on :8787)
 *   npm run smoke                        # or BASE_URL=http://localhost:5173 npm run smoke
 *   npm run smoke -- --screenshots       # also writes docs/screenshots/*.png
 *
 * Drives system Chromium (CHROMIUM env var, default "chromium") over the DevTools protocol with
 * SwiftShader (software WebGL), so frame rates measured here are a lower bound, not GPU numbers.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const API = process.env.API_URL ?? "http://localhost:8787";
const CHROMIUM = process.env.CHROMIUM ?? "chromium";
const PORT = 9300 + Math.floor(Math.random() * 500);
const SHOTS = process.argv.includes("--screenshots");
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "galaxymaps-smoke-"));
const browser = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--hide-scrollbars", `--window-size=${DESKTOP.width},${DESKTOP.height}`,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

async function waitFor(expression: string, timeoutMs = 20000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await evaluate<boolean>(`!!(${expression})`).catch(() => false)) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function open(path: string) {
  await send("Page.navigate", { url: BASE + path });
  await waitFor(`document.querySelector(".map-canvas") && !document.querySelector(".map-loading") && globalThis.__gm?.engine()`);
  await sleep(1800);
}

async function shot(name: string, settleMs = 2500) {
  if (!SHOTS) return;
  await sleep(settleMs);
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  mkdirSync("docs/screenshots", { recursive: true });
  writeFileSync(`docs/screenshots/${name}.png`, Buffer.from(data, "base64"));
}

const click = (sel: string) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error("no element ${sel.replace(/"/g, "'")}"); el.click(); })()`);
const text = (sel: string) => evaluate<string>(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ""`);
const key = async (k: string, code = k) => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: k === "Escape" ? 27 : k === "ArrowLeft" ? 37 : 0 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code });
};
const engineState = () =>
  evaluate<{ mode: string; locked: string | null; pivot: [number, number]; screen: [number, number] | null; heading: number; width: number }>(`(() => {
    const e = globalThis.__gm.engine(); const i = e.info(); const id = e.getLockedId();
    return { mode: e.getMode(), locked: id, pivot: [i.vp.cx ?? i.vp.width / 2, i.vp.cy ?? i.vp.height / 2], screen: id ? e.screenOf(id) : null, heading: i.view.heading, width: i.view.widthKm };
  })()`);
const settleOn = (id: string) =>
  waitFor(`(() => { const e = globalThis.__gm.engine(); const i = e.info(); const s = e.screenOf(${JSON.stringify(id)}); return e.getLockedId() === ${JSON.stringify(id)} && s && Math.hypot(s[0] - (i.vp.cx ?? i.vp.width / 2), s[1] - (i.vp.cy ?? i.vp.height / 2)) < 2; })()`, 10000);
const mapRect = () => evaluate<{ x: number; y: number; w: number; h: number }>(`(() => { const r = document.querySelector(".map").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);

async function drag(x0: number, y0: number, dx: number, dy: number) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0, y: y0 });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: x0, y: y0, button: "left", buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 10; i++) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0 + (dx * i) / 10, y: y0 + (dy * i) / 10, button: "left", buttons: 1 });
    await sleep(16);
  }
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x0 + dx, y: y0 + dy, button: "left", buttons: 0, clickCount: 1 });
}

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
const near = (a: [number, number] | null, b: [number, number], tol = 2) => !!a && Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
const fmt = (p: [number, number] | null) => (p ? `(${p[0].toFixed(1)}, ${p[1].toFixed(1)})` : "null");

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
  await send("Performance.enable");
  await send("Emulation.setDeviceMetricsOverride", DESKTOP);

  await check("API status reports Grok configuration honestly", async () => {
    const s = (await (await fetch(`${API}/api/status`)).json()) as { grok: { configured: boolean }; catalog: { objects: number } };
    return `grok.configured = ${s.grok.configured}, catalog objects = ${s.catalog.objects}`;
  });

  await check("Home opens locked on a textured Earth, centred in the usable map", async () => {
    await open("/");
    const s = await engineState();
    expect(s.mode === "locked" && s.locked === "earth", `mode ${s.mode} ${s.locked}`);
    expect(near(s.screen, s.pivot), `Earth at ${fmt(s.screen)} vs pivot ${fmt(s.pivot)}`);
    const bar = await text(".camera-bar");
    expect(/Locked on\s*Earth/.test(bar), `camera bar "${bar}"`);
    await shot("desktop-home-earth");
    return `Earth at ${fmt(s.screen)}, pivot ${fmt(s.pivot)}; "${bar.replace(/\n/g, " ")}"`;
  });

  await check("Locked: drag orbits, wheel and arrow keys keep the object at the pivot (no pan)", async () => {
    const r = await mapRect();
    const before = await engineState();
    await drag(r.x + r.w * 0.3, r.y + r.h * 0.6, 220, -60);
    await sleep(900);
    const afterDrag = await engineState();
    expect(near(afterDrag.screen, afterDrag.pivot), `after drag ${fmt(afterDrag.screen)} vs ${fmt(afterDrag.pivot)}`);
    expect(Math.abs(afterDrag.heading - before.heading) > 0.2, "heading did not change");
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: r.x + r.w * 0.85, y: r.y + r.h * 0.2, deltaX: 0, deltaY: -400 });
    await sleep(900);
    const afterWheel = await engineState();
    expect(near(afterWheel.screen, afterWheel.pivot), `after off-centre wheel ${fmt(afterWheel.screen)}`);
    expect(afterWheel.width < afterDrag.width, "wheel did not zoom in");
    await evaluate(`document.activeElement?.blur()`);
    await key("ArrowLeft");
    await sleep(500);
    const afterKey = await engineState();
    expect(near(afterKey.screen, afterKey.pivot), `after ArrowLeft ${fmt(afterKey.screen)}`);
    return `heading ${before.heading.toFixed(2)} → ${afterDrag.heading.toFixed(2)} rad; width ${afterDrag.width.toExponential(2)} → ${afterWheel.width.toExponential(2)} km; pivot held within 2 px`;
  });

  await check("Esc leaves the lock; Back to explore restores free exploration", async () => {
    await key("Escape");
    await sleep(900);
    const s = await engineState();
    expect(s.mode === "explore", `mode ${s.mode}`);
    const bar = await evaluate<boolean>(`!!document.querySelector(".camera-bar")`);
    expect(!bar, "camera bar still visible");
    return "mode explore after Esc";
  });

  await check("Search \"black hole\" lists catalog black holes with thumbnails/icons", async () => {
    await open("/");
    await evaluate(`document.querySelector(".main-search input").focus()`);
    await send("Input.insertText", { text: "black hole" });
    await waitFor(`document.querySelectorAll(".main-search [role=option]").length > 0`);
    const names = await evaluate<string[]>(`[...document.querySelectorAll(".main-search [role=option] .osearch-name")].map(e => e.textContent)`);
    await shot("desktop-search-black-hole", 800);
    return `${names.length} results: ${names.slice(0, 6).join(", ")}`;
  });

  await check("Browse categories opens a tree with real counts", async () => {
    await click('.main-search [aria-label="Browse categories"]');
    await waitFor(`document.querySelectorAll(".main-search [role=treeitem]").length > 0`);
    const rows = await evaluate<string[]>(`[...document.querySelectorAll(".main-search [role=treeitem]")].map(e => e.innerText.replace(/\\n/g, " "))`);
    await shot("desktop-browse", 800);
    return rows.join(" | ");
  });

  await check("Mars card: image-led card with 3–6 fact tiles and the four actions; locked on Mars", async () => {
    await open("/?place=mars");
    await waitFor(`document.querySelector(".panel.place")`);
    await settleOn("mars");
    const tiles = await evaluate<number>(`document.querySelectorAll(".fact-tiles .tile").length`);
    const actions = await evaluate<string[]>(`[...document.querySelectorAll(".action-row .action")].map(b => b.textContent.trim())`);
    expect(tiles >= 3 && tiles <= 6, `${tiles} tiles`);
    expect(actions.includes("Focus") && actions.includes("Directions"), actions.join(","));
    const s = await engineState();
    expect(s.mode === "locked" && s.locked === "mars", `mode ${s.mode} ${s.locked}`);
    expect(near(s.screen, s.pivot), `Mars at ${fmt(s.screen)} vs ${fmt(s.pivot)}`);
    await shot("desktop-card-mars");
    return `${tiles} tiles; actions: ${actions.join(", ")}`;
  });

  await check("Andromeda: Explore inside lists its features with breadcrumbs", async () => {
    await open("/?view=andromeda");
    await waitFor(`document.querySelector(".panel.inside")`);
    const crumbs = await text(".breadcrumbs");
    const n = await evaluate<number>(`document.querySelectorAll(".panel.inside .place-row").length`);
    expect(/Andromeda/.test(crumbs), crumbs);
    await shot("desktop-andromeda-inside");
    return `breadcrumbs "${crumbs.replace(/\n/g, " ")}", ${n} features listed`;
  });

  await check("Observable-universe overview is labelled schematic with no linear scale", async () => {
    await open("/?view=universe");
    await sleep(2500);
    const svg = await evaluate<string>(`[...document.querySelectorAll(".map-svg text")].map(t => t.textContent).join(" | ")`);
    const status = await text(".status-bar");
    expect(/Observable universe/.test(svg) && /logarithmic distance/i.test(svg), svg.slice(0, 200));
    expect(/no linear scale/i.test(status), status);
    await shot("desktop-universe");
    return `${svg.split(" | ").filter((t) => /universe|Schematic|catalog/i.test(t)).join(" / ")}`;
  });

  await check("Earth → Mars directions: Hohmann transfer first, exactly two travel modes, route framing", async () => {
    await open("/?route=earth,mars&mode=light");
    await waitFor(`document.querySelector(".route-time")`);
    const t = (await text(".route-time")).trim();
    expect(/^(2[45]\d days|8\.[45] months)$/.test(t), `route time "${t}"`);
    await click(".travel-mode-btn");
    const modes = await evaluate<string[]>(`[...document.querySelectorAll(".travel-mode-menu [role=option]")].map(o => o.innerText.split("\\n")[0])`);
    await key("Escape");
    expect(modes.length === 2 && modes[0] === "Light speed" && modes[1] === "Voyager 1", modes.join(","));
    const s = await engineState();
    expect(s.mode === "route", `camera ${s.mode}`);
    await shot("desktop-earth-mars-transfer");
    return `${t}; travel modes: ${modes.join(", ")}; camera ${s.mode}`;
  });

  await check("Play time advances the clock, then pauses; time starts paused", async () => {
    await open("/");
    const st0 = await evaluate<{ jd: number; armed: boolean }>(`(() => { const s = globalThis.__gm.store.getState(); return { jd: s.jd, armed: s.time.armed }; })()`);
    expect(!st0.armed, "time armed on load");
    await evaluate(`globalThis.__gm.store.getState().setTimeRate("week")`);
    await click(".time-play");
    await sleep(2500);
    const st1 = await evaluate<{ jd: number; running: boolean }>(`(() => { const s = globalThis.__gm.store.getState(); return { jd: s.jd, running: s.time.running }; })()`);
    const s = await engineState();
    expect(st1.jd > st0.jd, `jd ${st0.jd} → ${st1.jd}`);
    expect(s.mode === "locked" && near(s.screen, s.pivot, 3), `Earth drifted to ${fmt(s.screen)} while playing`);
    await shot("desktop-play-time", 500);
    await click(".time-play");
    return `jd advanced by ${(st1.jd - st0.jd).toFixed(2)} days in 2.5 s; Earth stayed centred`;
  });

  await check("Region dropdowns: Galaxies group lists Andromeda", async () => {
    await open("/?view=solar");
    const labels = await evaluate<string[]>(`[...document.querySelectorAll(".region-strip > *")].map(e => e.innerText.trim())`);
    const btn = await evaluate<boolean>(`(() => { const b = [...document.querySelectorAll(".region-strip button")].find(b => /Galax/.test(b.textContent)); b?.click(); return !!b; })()`);
    expect(btn, `no Galaxies group in ${labels.join(",")}`);
    const items = await evaluate<string[]>(`[...document.querySelectorAll(".region-strip .menu .menu-item")].map(e => e.textContent)`);
    expect(items.some((i) => /Andromeda/.test(i)), items.join(","));
    await shot("desktop-regions", 600);
    await key("Escape");
    return `groups: ${labels.join(" · ")}; Galaxies menu: ${items.join(", ")}`;
  });

  await check("Performance (SwiftShader, desktop 1440×900)", async () => {
    await open("/?view=nearby");
    const fps = await evaluate<number>(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = (t) => { n++; if (t - t0 < 3000) requestAnimationFrame(f); else r(n / ((t - t0) / 1000)); }; requestAnimationFrame(f); })`);
    const m = await send("Performance.getMetrics");
    const get = (k: string) => (m.metrics as { name: string; value: number }[]).find((x) => x.name === k)?.value ?? 0;
    const live = await evaluate<number>(`document.querySelectorAll("*").length`);
    return `${fps.toFixed(1)} fps (software rendering), JS heap ${(get("JSHeapUsedSize") / 1048576).toFixed(0)} MB, ${live} live elements (CDP Nodes ${get("Nodes")}, includes earlier navigations not yet collected)`;
  });

  await send("Emulation.setDeviceMetricsOverride", PHONE);
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  await check("Phone: floating search at top, collapsed bottom sheet, Earth centred above it", async () => {
    await open("/");
    const top = await evaluate<number>(`document.querySelector(".sidebar-search").getBoundingClientRect().top`);
    const sheetTop = await evaluate<number>(`document.querySelector(".sidebar").getBoundingClientRect().top`);
    const s = await engineState();
    expect(top < 24, `search top ${top}`);
    expect(sheetTop > 600, `sheet top ${sheetTop}`);
    expect(near(s.screen, s.pivot) && s.pivot[1] < sheetTop, `Earth ${fmt(s.screen)} pivot ${fmt(s.pivot)}`);
    await shot("phone-home-earth");
    return `search top ${top}px, sheet top ${sheetTop}px, pivot ${fmt(s.pivot)}`;
  });

  await check("Phone: Saturn card in the half sheet", async () => {
    await open("/?place=saturn");
    await evaluate(`globalThis.__gm.store.getState().setSheet("half")`);
    await sleep(800);
    await settleOn("saturn");
    const s = await engineState();
    expect(s.locked === "saturn" && near(s.screen, s.pivot, 3), `Saturn ${fmt(s.screen)} pivot ${fmt(s.pivot)}`);
    await shot("phone-card-saturn");
    return `Saturn centred at ${fmt(s.screen)} above the sheet`;
  });

  await check("Phone: search results", async () => {
    await open("/");
    await evaluate(`document.querySelector(".main-search input").focus()`);
    await send("Input.insertText", { text: "nebula" });
    await waitFor(`document.querySelectorAll(".main-search [role=option]").length > 0`);
    const n = await evaluate<number>(`document.querySelectorAll(".main-search [role=option]").length`);
    await shot("phone-search", 800);
    return `${n} results for "nebula"`;
  });

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
