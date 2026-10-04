/** Public-UI browser checks for the final-polish discovery and comparison slices.
 * Works against Vite and the built app; no __gm hooks or source-module imports.
 * BASE_URL=http://localhost:5173 npx tsx scripts/polish-smoke.ts
 * Uses system Chromium / SwiftShader. Each CDP request has its own deadline.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const CHECK_FILTER = process.env.CHECK_FILTER ? new RegExp(process.env.CHECK_FILTER, "i") : null;
const REPORT_FILE = process.env.REPORT_FILE ?? "docs/screenshots/polish-results.json";
const CDP_TIMEOUT = Number(process.env.CDP_TIMEOUT ?? 10000);
const PORT = 9400 + Math.floor(Math.random() * 300);
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };
const profile = mkdtempSync(join(tmpdir(), "galaxymaps-polish-"));
const downloads = mkdtempSync(join(tmpdir(), "galaxymaps-polish-downloads-"));
const results: { name: string; ok: boolean; detail: string }[] = [];
const exceptions: string[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const browser = spawn(process.env.CHROMIUM ?? "chromium", [
  "--headless=new", "--no-sandbox", "--hide-scrollbars", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, `--window-size=${DESKTOP.width},${DESKTOP.height}`, "about:blank",
], { stdio: "ignore" });

interface CdpReply { result?: Record<string, unknown>; error?: { message: string } }
let ws: WebSocket | undefined, nextId = 0;
const pending = new Map<number, { resolve(value: Record<string, unknown>): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();

async function debuggerUrl(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(1000) });
      const targets = await response.json() as { type: string; webSocketDebuggerUrl: string }[];
      const page = targets.find((target) => target.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* Browser startup is polled with bounded requests. */ }
    await sleep(150);
  }
  throw new Error("Chromium did not expose a page debugger.");
}

function send<T extends object = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP deadline: ${method}`)); }, CDP_TIMEOUT);
    pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
    ws!.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate<T = unknown>(expression: string): Promise<T> {
  const result = await send<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description: string } } }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression: string, timeout = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate<boolean>(`!!(${expression})`).catch(() => false)) return;
    await sleep(150);
  }
  throw new Error(`Waiting for ${expression}`);
}

async function open(path = "/") {
  const previousDocument = await evaluate<number>("performance.timeOrigin").catch(() => 0);
  await send("Page.navigate", { url: path.startsWith("http") ? path : BASE + path });
  await waitFor(`performance.timeOrigin !== ${previousDocument} && document.querySelector('.map-canvas') && !document.querySelector('.map-loading') && !document.querySelector('.crash')`, 45000);
  await sleep(1000);
}

async function click(selector: string, index = 0): Promise<void> {
  const point = await evaluate<{ x: number; y: number }>(`(() => {
    const element = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!element) throw new Error('Missing control: ' + ${JSON.stringify(selector)});
    if (element.disabled) throw new Error('Disabled control: ' + ${JSON.stringify(selector)});
    element.scrollIntoView({block:'center', inline:'nearest'});
    const rect = element.getBoundingClientRect(); return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
  })()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, clickCount: 1 });
  await sleep(80);
}

async function clickText(selector: string, label: string): Promise<void> {
  const index = await evaluate<number>(`[...document.querySelectorAll(${JSON.stringify(selector)})].findIndex(element => element.textContent.trim() === ${JSON.stringify(label)})`);
  if (index < 0) throw new Error(`Missing ${label} in ${selector}`);
  await click(selector, index);
}

const text = (selector: string) => evaluate<string>(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`);
const exists = (selector: string) => evaluate<boolean>(`!!document.querySelector(${JSON.stringify(selector)})`);
function expect(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

async function drag(selector: string, dx: number, dy: number): Promise<void> {
  const point = await evaluate<{ x: number; y: number }>(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.scrollIntoView({block:'center'}); const r = element.getBoundingClientRect(); return {x:r.left + r.width * .45, y:r.top + r.height * .48}; })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1 });
  for (let step = 1; step <= 8; step++) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x + dx * step / 8, y: point.y + dy * step / 8, button: "left", buttons: 1 });
    await sleep(30);
  }
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x + dx, y: point.y + dy, button: "left", buttons: 0 });
  await sleep(450);
}

/** Mean luminance of 8×8 device-pixel blocks. Chromium may switch a 2D canvas between GPU and CPU
 * rasterization after readbacks, which changes a few anti-aliased pixels but not the chart. */
type ChartSignature = { size: string; blocks: number[] };
const chartSignature = () => evaluate<ChartSignature>(`(() => {
  const c = document.querySelector('.earthsky-surface canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, blocks = [];
  for (let by = 0; by < c.height; by += 8) for (let bx = 0; bx < c.width; bx += 8) {
    let sum = 0, n = 0;
    for (let y = by; y < Math.min(by + 8, c.height); y++) for (let x = bx; x < Math.min(bx + 8, c.width); x++) { const i = (y * c.width + x) * 4; sum += d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722; n++; }
    blocks.push(Math.round(sum / n));
  }
  return { size: c.width + 'x' + c.height, blocks };
})()`);
function sameChart(a: ChartSignature, b: ChartSignature): boolean {
  if (a.size !== b.size || a.blocks.length !== b.blocks.length) return false;
  const changed = a.blocks.filter((value, i) => Math.abs(value - b.blocks[i]) > 3).length;
  return changed / a.blocks.length < 0.003;
}
const skyWindow = async () => Number.parseFloat(await text(".earthsky-field-label"));
type SharedSky = { id: string; center: { raDeg: number; decDeg: number }; fieldDeg: number };
const skyState = () => evaluate<{ sky: SharedSky; jd: number }>(`(() => { const state=JSON.parse(new URLSearchParams(location.search).get('state')); return {sky:state.sky,jd:state.view.jd}; })()`);
function expectSameSky(before: { sky: SharedSky; jd: number }, after: { sky: SharedSky; jd: number }): void {
  expect(after.sky?.id === before.sky.id && after.jd === before.jd, "Sky sharing changed the target or frozen epoch");
  expect(Math.abs(after.sky.fieldDeg - before.sky.fieldDeg) < 1e-9 && Math.abs(after.sky.center.raDeg - before.sky.center.raDeg) < 1e-9 && Math.abs(after.sky.center.decDeg - before.sky.center.decDeg) < 1e-9, "Sky sharing changed the exact angular center or field");
}
async function sharedUrl(): Promise<string> {
  const sky = await exists(".earthsky-overlay");
  if (await exists('[aria-label="Dismiss share feedback"]')) await click('[aria-label="Dismiss share feedback"]');
  if (sky) await clickText(".earthsky-footer button", "Share view"); else await click('[aria-label="Share this view"]');
  await waitFor(`document.querySelector(${JSON.stringify(sky ? ".earthsky-share-feedback" : ".share-feedback")})`);
  let url = await evaluate<string>("navigator.clipboard?.readText()").catch(() => "");
  if (!url.includes("state=")) url = await evaluate<string>(`document.querySelector(${JSON.stringify(sky ? ".earthsky-manual-share input" : ".share-feedback input")})?.value ?? ''`);
  expect(url.startsWith(new URL(BASE).origin) && new URL(url).searchParams.has("state"), "Share action did not provide a current exact-view URL");
  return url;
}

type CameraSnapshot = { camera: { mode: string; lockedId: string | null }; view: { widthKm: number; heading: number; tilt: number; center: number[] }; selectedId: string | null; jd: number };
/** Orbit drags release with inertia that can glide for ~2 s; capture only once the view stops moving. */
async function settledCamera(): Promise<CameraSnapshot> {
  const read = async () => JSON.parse(new URL(await sharedUrl()).searchParams.get("state")!).view as CameraSnapshot;
  let previous = await read();
  for (let attempt = 0; attempt < 12; attempt++) {
    await sleep(400);
    const next = await read();
    if (Math.abs(next.view.heading - previous.view.heading) < 1e-9 && Math.abs(next.view.tilt - previous.view.tilt) < 1e-9) return next;
    previous = next;
  }
  throw new Error("The map camera did not settle after the orbit drag");
}
function expectSameCamera(before: CameraSnapshot, after: CameraSnapshot): void {
  expect(after.camera.mode === before.camera.mode && after.camera.lockedId === before.camera.lockedId && after.selectedId === before.selectedId, "Back changed the preceding camera mode or selected object");
  expect(Math.abs(after.view.widthKm / before.view.widthKm - 1) < 1e-6, `Back changed camera zoom: ${before.view.widthKm} → ${after.view.widthKm}`);
  expect(Math.abs(after.view.heading - before.view.heading) < 1e-6 && Math.abs(after.view.tilt - before.view.tilt) < 1e-6, `Back changed preceding orbit orientation: heading ${before.view.heading} → ${after.view.heading}, tilt ${before.view.tilt} → ${after.view.tilt}`);
  expect(after.jd === before.jd, "Back changed the preceding epoch");
  expect(after.view.center.every((value, i) => Math.abs(value - before.view.center[i]) < Math.max(0.0001, Math.abs(before.view.center[i]) * 1e-9)), "Back changed the preceding pivot");
}

async function quietView(phone = false): Promise<string> {
  await open("/");
  await click('.map-controls [aria-label="Quiet view"]');
  await waitFor(`document.querySelector('.presentation') && document.querySelector('.finish-controls.quiet')`);
  const quiet = await evaluate<{ sidebar: string; regions: string; restore: boolean; brand: string }>(`(() => ({sidebar:getComputedStyle(document.querySelector('.sidebar')).display,regions:getComputedStyle(document.querySelector('.region-bar')).display,restore:[...document.querySelectorAll('.finish-controls button')].some(button=>button.textContent.trim()==='Restore controls'),brand:document.querySelector('.quiet-identity')?.innerText ?? ''}))()`);
  expect(quiet.sidebar === "none" && quiet.regions === "none" && quiet.restore && quiet.brand.includes("GalaxyMaps"), `Quiet view cannot be reversed or lost its identity: ${JSON.stringify(quiet)}`);
  if (phone) await phoneFits(".finish-controls.quiet");
  await screenshot(`${phone ? "phone-" : ""}quiet-view`);
  await clickText(".finish-controls button", "Restore controls");
  await waitFor(`!document.querySelector('.presentation') && getComputedStyle(document.querySelector('.sidebar')).display !== 'none'`);
  expect(await exists(".main-search input"), "Restore controls did not return search");
  await open("/?place=orion-nebula");
  await sleep(4500);
  if (phone && await exists(".sheet-full")) await click(".sheet-handle");
  await click('.map-controls [aria-label="Quiet view"]');
  await waitFor(`document.querySelector('.quiet-identity')?.innerText.includes('Projected observed image') && document.querySelector('.quiet-identity')?.innerText.includes('NASA, ESA, M. Robberto')`);
  const credit = await text(".quiet-identity");
  expect(credit.includes("Orion Nebula") && credit.includes("Orion Treasury Project Team"), "Quiet view lost the displayed Orion observation's complete credit");
  await expectExposedControl(".finish-controls.quiet button");
  if (phone) await phoneFits(".finish-controls.quiet");
  await screenshot(`${phone ? "phone-" : ""}quiet-orion`);
  await clickText(".finish-controls button", "Restore controls");
  await waitFor(`!document.querySelector('.presentation') && document.querySelector('.place-head h1')?.textContent === 'Orion Nebula'`);
  return "Quiet view hides chrome, retains GalaxyMaps identity and the loaded Orion observation credit, and Restore controls returns navigation";
}

async function key(key: string): Promise<void> {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: key === "Enter" ? 13 : key === "Escape" ? 27 : key === "Tab" ? 9 : 0 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key });
}

async function fill(selector: string, value: string, index = 0): Promise<void> {
  await click(selector, index);
  await evaluate(`document.querySelectorAll(${JSON.stringify(selector)})[${index}].select()`);
  await send("Input.insertText", { text: value });
}

async function screenshot(name: string, selector?: string): Promise<void> {
  if (selector) await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'start',inline:'nearest'})`);
  await sleep(650);
  const { data } = await send<{ data: string }>("Page.captureScreenshot", { format: "png" });
  mkdirSync("docs/screenshots", { recursive: true });
  writeFileSync(`docs/screenshots/polish-${name}.png`, Buffer.from(data, "base64"));
}

async function check(name: string, run: () => Promise<string>) {
  if (CHECK_FILTER && !CHECK_FILTER.test(name)) return;
  console.log(`CHECK ${name}`);
  try { const detail = await run(); results.push({ name, ok: true, detail }); console.log(`PASS  ${name} — ${detail}`); }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail }); console.log(`FAIL  ${name} — ${detail}`);
    await screenshot(`failure-${results.length}`).catch(() => {});
  }
}

async function chooseComparisonObject(side: 0 | 1, name: string): Promise<void> {
  await fill(".comparison-selector input", name, side);
  await waitFor(`document.querySelector('.comparison-options [role=option]')`);
  await key("Enter");
  await waitFor(`document.querySelectorAll('.comparison-selector input')[${side}]?.value === ${JSON.stringify(name)}`);
}

async function phoneFits(selector: string): Promise<string> {
  const metrics = await evaluate<{ width: number; page: number; panel: number; scroll: number; rectLeft: number; rectRight: number; viewportHeight: number }>(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)}), rect = element.getBoundingClientRect();
    return {width:innerWidth,page:document.documentElement.scrollWidth,panel:element.clientWidth,scroll:element.scrollWidth,rectLeft:rect.left,rectRight:rect.right,viewportHeight:innerHeight};
  })()`);
  expect(metrics.page <= metrics.width + 1, `Page horizontal overflow: ${JSON.stringify(metrics)}`);
  expect(metrics.scroll <= metrics.panel + 1, `Panel horizontal overflow: ${JSON.stringify(metrics)}`);
  expect(metrics.rectLeft >= -1 && metrics.rectRight <= metrics.width + 1, `Panel exceeds phone edges: ${JSON.stringify(metrics)}`);
  return `${metrics.width}px viewport; panel ${metrics.panel}px; no horizontal overflow`;
}

async function expectExposedControl(selector: string, index = 0): Promise<void> {
  const hit = await evaluate<{ visible: boolean; target: string; covering: string }>(`(() => {
    const element = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!element) return {visible:false,target:${JSON.stringify(selector)},covering:'missing'};
    element.scrollIntoView({block:'nearest',inline:'nearest'});
    const rect = element.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const painted = document.elementFromPoint(x,y);
    return {visible:rect.width > 0 && rect.height > 0 && x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && !!painted && (painted === element || element.contains(painted)),target:element.getAttribute('aria-label') || element.textContent.trim(),covering:painted ? painted.tagName + '.' + painted.className : 'outside viewport'};
  })()`);
  expect(hit.visible, `Essential control ${hit.target} is obscured by ${hit.covering}`);
}

async function testTour(title: string, story = false): Promise<string> {
  if (!await exists(".panel.explore .discovery-prompt") || await exists(".discovery-active") || await exists(".discovery-paused-banner")) await open("/");
  if (title === "Beautiful nebulae" && !story) {
    expect(await evaluate<boolean>(`!!(document.querySelector('.explore > .comparison-presets')?.compareDocumentPosition(document.querySelector('#guided-tours-title')) & Node.DOCUMENT_POSITION_FOLLOWING)`), "Compare sizes is missing or below Guided tours");
    await screenshot("home", ".panel.explore");
  }
  if (!story && !(await evaluate<boolean>(`[...document.querySelectorAll('.discovery-tour-card strong')].some((e) => e.textContent === ${JSON.stringify(title)})`))) await clickText(".show-more", "Show all tours");
  await clickText(story ? ".discovery-story-card strong" : ".discovery-tour-card strong", title);
  await waitFor(`document.querySelector('.discovery-active .discovery-start')`);
  const overview = await text(".discovery-active h1");
  expect(overview === title, `Wrong overview: ${overview}`);
  expect(!await exists(".discovery-progress"), "Tour started before visitor pressed Start");
  const count = await evaluate<number>(`document.querySelectorAll('.discovery-stop-list li').length`);
  expect(count >= 4 && count <= 6, `${count} stops`);
  await click(".discovery-start");
  await waitFor(`document.querySelector('.discovery-progress progress')?.value === 1`);
  for (let stop = 0; stop < count; stop++) {
    await waitFor(`document.querySelector('.discovery-progress progress')?.value === ${stop + 1}`);
    const info = await evaluate<{ heading: string; imageOk: boolean; source: boolean; highlight: string; controls: number }>(`(() => {
      const image = document.querySelector('.discovery-stop-image');
      return {heading:document.querySelector('.discovery-stop-copy h2')?.textContent, imageOk: image?.complete && image.naturalWidth > 0, source:!!document.querySelector('.discovery-fact-source[href]'), highlight:document.querySelector('.discovery-stop-copy')?.innerText, controls:document.querySelectorAll('.discovery-stop-controls button').length};
    })()`);
    if (!info.imageOk) await waitFor(`document.querySelector('.discovery-stop-image')?.complete && document.querySelector('.discovery-stop-image')?.naturalWidth > 0`, 12000);
    expect(info.heading && info.source && info.highlight.length > 50 && info.controls === 3, `Incomplete stop ${stop + 1}: ${JSON.stringify(info)}`);
    console.log(`  STOP ${stop + 1}/${count}: ${info.heading}`);
    const blackHoleObservation = title === "Black holes & extremes" && (stop === 2 || stop === 3);
    if (stop === 0 || stop === count - 1 || blackHoleObservation) {
      await sleep(4500); // Include the completed maximum-duration camera flight in review evidence.
      await screenshot(`${story ? "story" : title.toLowerCase().replace(/[^a-z]+/g, "-")}-${stop + 1}`, ".discovery-active");
      if (blackHoleObservation) {
        await click(".status-more");
        await waitFor(`document.querySelector('.status-pop')?.innerText.includes('Observed image projected onto a flat plane')`);
        expect((await text(".status-pop")).includes("Event Horizon") || (await text(".status-pop")).includes("EHT"), `Black-hole stop ${stop + 1} lost its EHT observation credit`);
        await screenshot(`black-hole-observation-${stop + 1}`);
        await click(".status-more");
      }
    }
    if (stop === 1) {
      await clickText(".discovery-stop-controls button", "Previous");
      await waitFor(`document.querySelector('.discovery-progress progress')?.value === 1`);
      await clickText(".discovery-stop-controls button", "Next");
      await waitFor(`document.querySelector('.discovery-progress progress')?.value === 2`);
      await clickText(".discovery-stop-controls button", "Pause");
      await waitFor(`document.querySelector('.discovery-paused-banner')`);
      expect(!await exists(".discovery-active"), "Tour did not release the exploration panel while paused");
      await clickText(".discovery-paused-banner button", "Resume");
      await waitFor(`document.querySelector('.discovery-progress progress')?.value === 2`);
    }
    if (stop < count - 1) await clickText(".discovery-stop-controls button", "Next");
  }
  await clickText(".discovery-stop-controls button", "Finish");
  await waitFor(`!document.querySelector('.discovery-active') && document.querySelector('.panel.explore .discovery-prompt')`);
  return `${count} sourced illustrated stops; Previous/Pause/Resume/Next/Finish and return all work`;
}

let comparisonUrl = "", skyUrl = "";

try {
  ws = new WebSocket(await debuggerUrl());
  await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("WebSocket startup deadline")), CDP_TIMEOUT); ws!.onopen = () => { clearTimeout(timer); resolve(); }; ws!.onerror = () => { clearTimeout(timer); reject(new Error("CDP connection failed")); }; });
  ws.onmessage = (event) => {
    const reply = JSON.parse(String(event.data)) as CdpReply & { id?: number; method?: string; params?: { exceptionDetails?: { exception?: { description?: string }; text?: string } } };
    if (reply.method === "Runtime.exceptionThrown") { const detail = reply.params?.exceptionDetails; exceptions.push(detail?.exception?.description ?? detail?.text ?? "Unknown page exception"); }
    const item = reply.id && pending.get(reply.id);
    if (!item || !reply.id) return;
    clearTimeout(item.timer); pending.delete(reply.id);
    if (reply.error) item.reject(new Error(reply.error.message)); else item.resolve(reply.result ?? {});
  };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", DESKTOP);
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true });
  await send("Browser.grantPermissions", { origin: new URL(BASE).origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] }).catch(() => {});

  await check("Comparison card entry uses one physical scale", async () => {
    await open("/?place=earth");
    await clickText(".action-row button", "Compare sizes");
    await waitFor(`document.querySelector('.comparison-panel')`);
    expect(await evaluate<boolean>(`document.querySelector('.comparison-display-switch button[aria-pressed=true]')?.textContent === 'True scale'`), "True scale is not the default");
    expect((await text(".comparison-stage-mode")).toLowerCase() === "one shared scale", "No shared physical scale label");
    expect(await exists(".comparison-scale-bar") && await exists(".comparison-surface canvas"), "Missing common scale or rendered objects");
    expect((await text(".comparison-statement")).includes("Jupiter"), "No compatible familiar reference");
    await screenshot("comparison-earth-jupiter", ".comparison-panel");
    return await text(".comparison-statement");
  });

  await check("Earth/Sun extreme ratio keeps a locator and labelled magnified inset", async () => {
    if (!await exists(".comparison-panel")) { await open("/?place=earth"); await clickText(".action-row button", "Compare sizes"); }
    await chooseComparisonObject(1, "Sun");
    await waitFor(`document.querySelector('.comparison-inset') && document.querySelector('.comparison-locator')`);
    const inset = await text(".comparison-inset");
    expect(/Magnified ×/.test(inset), `Unlabelled inset: ${inset}`);
    expect((await text(".comparison-statement")).includes("109 times"), "Unexpected physical Earth/Sun ratio");
    await screenshot("comparison-earth-sun", ".comparison-panel");
    return `${await text(".comparison-statement")} ${inset}`;
  });

  await check("Swap and Fit both retain the physical dimensions; comparison export downloads a PNG", async () => {
    const before = await text(".comparison-statement");
    const diameters = await evaluate<string[]>(`[...document.querySelectorAll('.comparison-diameters dd')].map(element => element.textContent)`);
    await click('[aria-label="Swap comparison objects"]');
    await clickText(".comparison-display-switch button", "Fit both");
    expect((await text(".comparison-statement")) === before, "Mode/swap changed the physical ratio");
    expect(JSON.stringify(await evaluate<string[]>(`[...document.querySelectorAll('.comparison-diameters dd')].map(element => element.textContent)`)) === JSON.stringify([...diameters].reverse()), "Physical dimensions changed");
    expect(!await exists(".comparison-scale-bar") && (await text(".comparison-stage-mode")).toLowerCase() === "different visual scales", "Independent visual scales are not explicit");
    await clickText(".comparison-actions button", "Save image");
    const started = Date.now(); let file = "";
    while (Date.now() - started < 10000) { file = readdirSync(downloads).find((name) => name.endsWith(".png")) ?? ""; if (file) break; await sleep(150); }
    expect(file, `No exported PNG; feedback: ${await text(".comparison-feedback")}`);
    const buffer = readFileSync(join(downloads, file));
    expect(buffer.subarray(1, 4).toString() === "PNG" && buffer.readUInt32BE(16) === 1200 && buffer.readUInt32BE(20) === 920, "Export is not the expected standalone PNG");
    mkdirSync("docs/screenshots", { recursive: true }); writeFileSync("docs/screenshots/polish-comparison-export.png", buffer);
    await screenshot("comparison-fit-both", ".comparison-panel");
    return `Same ratio and dimensions; ${file}, ${buffer.length} bytes, 1200×920`;
  });

  await check("Shared comparison restores both selected objects and Fit both in a fresh document", async () => {
    await clickText(".comparison-actions button", "Share comparison");
    await waitFor(`document.querySelector('.comparison-feedback')?.textContent.includes('link copied')`);
    await waitFor(`(() => { try { return JSON.parse(new URLSearchParams(location.search).get('state')).comparison?.mode === 'fit-both'; } catch { return false; } })()`);
    comparisonUrl = await evaluate<string>("location.href");
    expect(comparisonUrl.includes("state="), "No versioned state URL");
    const state = JSON.parse(new URL(comparisonUrl).searchParams.get("state")!);
    expect(state.comparison.pair.join(",") === "sun,earth", "Shared pair does not match the selected objects");
    await open(comparisonUrl);
    await waitFor(`document.querySelector('.comparison-panel')`);
    const values = await evaluate<string[]>(`[...document.querySelectorAll('.comparison-selector input')].map(element => element.value)`);
    expect(values.join(",") === "Sun,Earth", `Restored ${values.join(",")}`);
    expect((await text(".comparison-stage-mode")).toLowerCase() === "different visual scales", "Shared mode did not restore");
    await click('[aria-label="Close size comparison"]');
    await waitFor(`document.querySelector('.place-head h1')?.textContent === 'Earth'`);
    return "Fresh navigation restores Sun / Earth, independent inspection, and Back returns to Earth";
  });

  await check("Clipboard denial offers the actual comparison link without a success message", async () => {
    expect(comparisonUrl, "No comparison URL available"); await open(comparisonUrl);
    await waitFor(`document.querySelector('.comparison-panel')`);
    await evaluate(`Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async()=>{throw new DOMException('Clipboard permission denied', 'NotAllowedError');}}})`);
    try {
      await clickText(".comparison-actions button", "Share comparison");
      await waitFor(`document.querySelector('[aria-label="Comparison exact-view link"]')`);
      const value = await evaluate<string>(`document.querySelector('[aria-label="Comparison exact-view link"]').value`);
      const state = JSON.parse(new URL(value).searchParams.get("state")!);
      expect(state.comparison.pair.join(",") === "sun,earth" && state.comparison.mode === "fit-both", "Manual fallback has stale or missing comparison state");
      expect(!/link copied|shared\./i.test(await text(".comparison-feedback")), "Clipboard denial produced fake success");
      await screenshot("comparison-share-fallback", ".comparison-actions");
      return "Permission denial shows a selectable, current versioned comparison URL";
    } finally { await evaluate(`delete navigator.clipboard`); }
  });

  for (const title of ["Beautiful nebulae", "Black holes & extremes", "Inside Andromeda", "Human spaceflight"]) await check(`Complete mini-tour: ${title}`, () => testTour(title));
  await check("Complete SpaceX Demo-2 mission story", () => testTour("Demo-2: launch to homecoming", true));

  await check("Surprise me visits distinct sourced destinations and returns to the previous view", async () => {
    if (!await exists(".panel.explore .discovery-prompt")) await open("/"); await click(".discovery-surprise");
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      await waitFor(`document.querySelector('.discovery-highlight') && document.querySelector('.place-head h1')`);
      const name = await text(".place-head h1");
      expect(!seen.includes(name), `Recent Surprise repeated ${name}`); seen.push(name);
      expect(await exists(".discovery-highlight a[href]"), `No verified highlight source for ${name}`);
      if (i === 0) await screenshot("surprise", ".place-head");
      if (i < 3) await clickText(".discovery-highlight-actions button", "Another");
    }
    await clickText(".discovery-back-link", "Back to previous view");
    await waitFor(`document.querySelector('.panel.explore .discovery-prompt') && !document.querySelector('.discovery-highlight')`);
    return seen.join(" → ");
  });

  await check("Favorites persist across reload and appear in Saved", async () => {
    await open("/?place=mars");
    const button = await evaluate<string>(`[...document.querySelectorAll('.secondary-actions button')].find(element => /^(Save|Saved)$/.test(element.textContent.trim()))?.textContent.trim()`);
    if (button !== "Saved") await clickText(".secondary-actions button", "Save");
    await waitFor(`document.querySelector('.secondary-actions button[aria-pressed=true]')?.textContent.trim() === 'Saved'`);
    await open("/?place=mars");
    expect(await evaluate<boolean>(`[...document.querySelectorAll('.secondary-actions button')].some(element => element.textContent.trim() === 'Saved' && element.getAttribute('aria-pressed') === 'true')`), "Saved state did not survive reload");
    await open("/");
    expect((await text(".library-panel")).includes("Mars"), "Mars is absent from Saved collection");
    expect((await text(".library-panel")).includes("Saved on this browser. No account needed."), "Saved section lacks the storage note");
    await screenshot("saved", ".library-panel");
    return "Mars remains saved after full reload and is visible in Saved";
  });

  await check("Explore home follows the specified section order", async () => {
    await open("/");
    const titles = await evaluate<string[]>(`[...document.querySelectorAll('.panel.explore h2')].map((h) => h.textContent.trim())`);
    const order = ["Your next discovery", "Featured destinations", "Journeys", "Compare sizes", "Guided tours", "SpaceX & human spaceflight", "Browse all categories", "Saved & recently explored"];
    const positions = order.map((t) => titles.indexOf(t));
    expect(positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1])), `Section order is ${titles.join(" | ")}`);
    expect((await evaluate<number>(`document.querySelectorAll('#featured-grid li').length`)) === 6, "Featured destinations should show six first");
    expect((await evaluate<number>(`document.querySelectorAll('.discovery-tour-card').length`)) === 2, "Guided tours should show two first");
    const journeys = await text(".journey-list");
    expect(/Earth → Mars/.test(journeys) && /Proxima Centauri/.test(journeys) && /Star tour/.test(journeys) && !/Inside Andromeda/.test(journeys), `Journeys: ${journeys}`);
    return titles.join(" → ");
  });

  await check("Begin journey shows honest labels, travels the route and arrives at the destination card", async () => {
    await open("/");
    await clickText(".journey-card strong", "Earth → Mars");
    await waitFor(`document.querySelector('.begin-journey')`);
    await click(".begin-journey");
    await waitFor(`document.querySelector('.travel-preview')`);
    const preview = await text(".travel-preview");
    expect(/compress/i.test(preview) && /Calculated duration/.test(preview) && /Animation speed/.test(preview), `Preview lacks honest labels: ${preview}`);
    await screenshot("travel-preview");
    await clickText(".travel-speed button", "2×");
    await clickText(".travel-primary", "Start journey");
    await waitFor(`document.querySelector('.travel-hud')`);
    await sleep(2500);
    const progress = await evaluate<number>(`Number(document.querySelector('.travel-progress')?.getAttribute('aria-valuenow'))`);
    expect(progress > 0 && progress < 100, `Travel progress ${progress}`);
    await screenshot("travel-flying");
    await clickText(".travel-hud button", "Pause");
    const paused = await evaluate<number>(`Number(document.querySelector('.travel-progress').getAttribute('aria-valuenow'))`);
    await sleep(800);
    expect(paused === await evaluate<number>(`Number(document.querySelector('.travel-progress').getAttribute('aria-valuenow'))`), "Pause did not hold progress");
    await clickText(".travel-hud button", "Skip to arrival");
    await waitFor(`!document.querySelector('.travel-hud') && document.querySelector('.place-head h1')?.textContent === 'Mars'`);
    await waitFor(`document.querySelector('[role=status][aria-live=polite]')?.textContent.includes('Arrived at Mars')`, 5000);
    return `Preview labelled compressed; progress ${progress}% at 2×; pause held; skip arrived at Mars card with announcement`;
  });

  await check("Accessibility: skip link, settings, describe view and nearby navigation", async () => {
    await open("/?place=earth");
    await evaluate(`document.activeElement?.blur(); document.body.focus()`);
    await key("Tab");
    expect((await evaluate<string>(`document.activeElement?.textContent ?? ''`)) === "Skip to map", "First Tab stop is not the Skip to map link");
    await key("Enter");
    expect((await evaluate<string>(`document.activeElement?.id ?? ''`)) === "space-map", "Skip link did not focus the map");
    await key("v");
    await waitFor(`document.querySelector('[role=status][aria-live=polite]')?.textContent.length > 40`, 5000);
    const description = await text('[role=status][aria-live=polite]');
    await key(".");
    await waitFor(`/ of \\d+\\./.test(document.querySelector('[role=status][aria-live=polite]')?.textContent ?? '')`, 5000);
    const nearby = await text('[role=status][aria-live=polite]');
    await click(".a11y-btn");
    await waitFor(`document.querySelector('dialog.a11y-dialog[open]')`);
    await evaluate(`document.querySelectorAll('.a11y-toggle input')[0].click()`);
    expect(await evaluate<boolean>(`document.documentElement.classList.contains('a11y-contrast')`), "High contrast did not apply");
    expect((await text(".a11y-dialog")).includes("WCAG 2.2") && !(await text(".a11y-dialog")).includes("ADA compliant"), "Accessibility statement missing or overclaims");
    await screenshot("a11y-settings");
    await evaluate(`document.querySelectorAll('.a11y-toggle input')[0].click(); document.querySelector('dialog.a11y-dialog').close()`);
    return `Skip link → map; V: “${description.slice(0, 80)}…”; “.”: “${nearby.slice(0, 60)}”; high contrast toggles`;
  });

  await check("View from Earth supports drag, keyboard, zoom and recenter; Back preserves the preceding camera", async () => {
    await open("/?place=mars");
    await drag(".map", 85, -25);
    const before = await settledCamera();
    expect(before.view && before.camera.lockedId === "mars", "Cannot capture the preceding Mars camera");
    await clickText(".panel.place button", "View from Earth");
    await waitFor(`document.querySelector('.earthsky-surface canvas')`);
    expect((await text(".earthsky-header h1")).includes("Mars") && (await text(".earthsky-description")).includes("no local horizon"), "Sky view lacks target or viewing-model context");
    await evaluate("document.fonts.ready.then(() => true)");
    await click(".earthsky-controls > button", 0); await sleep(650);
    const centered = await chartSignature();
    const centeredState = await skyState();
    await drag(".earthsky-surface", 100, 40);
    expect(!sameChart(await chartSignature(), centered), "Dragging did not turn the sky chart");
    const dragged = await chartSignature(); await key("ArrowLeft"); await sleep(150);
    expect(!sameChart(await chartSignature(), dragged), "Arrow key did not turn the focused sky chart");
    const windowBefore = await skyWindow(); await key("+"); await sleep(150);
    expect(await skyWindow() < windowBefore, "Keyboard plus did not zoom the sky");
    await key("r"); await sleep(650);
    expect(await skyWindow() === 120 && sameChart(await chartSignature(), centered), "Keyboard R did not restore the centered target and default field");
    expectSameSky(centeredState, await skyState());
    const wheelPoint = await evaluate<{ x: number; y: number }>(`(() => { const r=document.querySelector('.earthsky-surface').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: wheelPoint.x, y: wheelPoint.y, deltaX: 0, deltaY: -150 }); await sleep(150);
    expect(await skyWindow() < 120, "Wheel zoom did not zoom the sky window");
    await click(".earthsky-controls > button", 0); await sleep(150);
    await click('[aria-label="Zoom in sky chart"]');
    expect(await skyWindow() < 120, "Accessible Zoom in did not zoom the sky");
    await click(".earthsky-controls > button", 0); await sleep(150);
    expect(sameChart(await chartSignature(), centered), "Center object button did not recenter");
    await click(".earthsky-sources summary");
    expect((await text(".earthsky-sources")).includes("not show what is above your location"), "Chart is presented as a local visibility prediction");
    await screenshot("earth-sky-mars");
    await click('[aria-label="Back to object"]');
    await waitFor(`!document.querySelector('.earthsky-overlay') && document.querySelector('.place-head h1')?.textContent === 'Mars'`);
    const after = JSON.parse(new URL(await sharedUrl()).searchParams.get("state")!).view as CameraSnapshot;
    expectSameCamera(before, after);
    return "Actual chart pixels change for drag/arrow/zoom; recenter restores them; Back retains Mars, zoom, orbit, pivot and epoch";
  });

  await check("Exact Earth-sky share restores the target, field and panned sky in a fresh page", async () => {
    await clickText(".panel.place button", "View from Earth");
    await waitFor(`document.querySelector('.earthsky-surface canvas')`);
    await drag(".earthsky-surface", 70, -30);
    await click('[aria-label="Zoom in sky chart"]');
    await sleep(200);
    const expectedChart = await chartSignature(), expectedWindow = await skyWindow();
    skyUrl = await sharedUrl();
    const expectedState = JSON.parse(new URL(skyUrl).searchParams.get("state")!);
    const originalDocument = await evaluate<number>("performance.timeOrigin");
    await open(skyUrl); await waitFor(`document.querySelector('.earthsky-surface canvas')`);
    expect(await evaluate<number>("performance.timeOrigin") !== originalDocument, "Share check did not create a fresh document");
    await evaluate("document.fonts.ready.then(() => true)"); await sleep(300);
    expect((await text(".earthsky-header h1")).includes("Mars") && await skyWindow() === expectedWindow, "Target or angular field did not restore");
    expect(sameChart(await chartSignature(), expectedChart), "Fresh share restored different sky directions or chart geometry");
    const freshState = JSON.parse(new URL(await sharedUrl()).searchParams.get("state")!);
    expectSameSky({ sky: expectedState.sky, jd: expectedState.view.jd }, { sky: freshState.sky, jd: freshState.view.jd });
    await screenshot("earth-sky-shared");
    await click('[aria-label="Back to object"]'); await waitFor(`!document.querySelector('.earthsky-overlay')`);
    return `Fresh document restores Mars and the same panned chart at ${expectedWindow}°`;
  });

  await check("Desktop Quiet view keeps an obvious way to restore navigation", () => quietView());

  await check("Light delay uses the correct distance model and separates physical neighbors from related objects", async () => {
    await open("/?place=sun");
    await waitFor(`document.querySelector('.light-delay') && document.querySelector('.nearby-list li')`);
    const delay = await text(".light-delay > p");
    expect((await text(".light-delay h2")) === "Light delay" && /(?:8\.[0-9]|[89]) minutes/.test(delay) && delay.includes("Sun to Earth"), `Unexpected solar light delay: ${delay}`);
    await click(".light-delay summary");
    expect((await text(".light-delay details")).includes("three-dimensional separation"), "Solar delay lacks its geometric model");
    const nearby = await text(".learning-insights");
    expect(nearby.includes("Physically nearby") && nearby.includes("Three-dimensional separation from Sun"), "Physical neighbors lack their explicit origin and definition");
    await screenshot("light-delay", ".learning-insights");
    await open("/?place=ngc-206");
    expect(!await exists(".nearby-list") && !await exists(".light-delay"), "Unknown host-depth object received unsupported physical proximity or a geometric light delay");
    expect((await text(".panel.place")).includes("Related destinations") && (await text(".panel.place")).includes("Andromeda"), "Unknown-depth object lost its related destinations");
    return "Sun light delay is about 8 minutes using 3D Earth separation; NGC206 has related objects without invented physical proximity";
  });

  await check("A fresh exact route share retains its pose and Reset/Fit use the restored route", async () => {
    await open("/?route=earth,mars&mode=voyager-1");
    await waitFor(`document.querySelector('.route-time') && document.querySelector('[aria-label="Fit route on map"]')`);
    await clickText('[role="radiogroup"][aria-label="Route model"] button', "Straight-line comparison");
    await click('[aria-label="Fit route on map"]'); await sleep(4500);
    const framed = JSON.parse(new URL(await sharedUrl()).searchParams.get("state")!).view as CameraSnapshot;
    expect(framed.camera.mode === "route", "Current route did not enter route framing");
    const summary = await text(".route-card");
    await drag(".map", 110, -35); await sleep(1200);
    const url = await sharedUrl();
    type RouteSnapshot = CameraSnapshot & { stops: string[]; modeId: string; routeModel: string; panel: string };
    const expected = JSON.parse(new URL(url).searchParams.get("state")!).view as RouteSnapshot;
    expect(expected.stops.join(",") === "earth,mars" && expected.modeId === "voyager-1" && expected.routeModel === "straight-line", "Route share did not include endpoints, mode and model");
    expect(expected.view.center.some((value, i) => Math.abs(value - framed.view.center[i]) > 1000), "Route was not panned before sharing");
    await open(url); await waitFor(`document.querySelector('.route-time')`);
    const restored = JSON.parse(new URL(await sharedUrl()).searchParams.get("state")!).view as RouteSnapshot;
    expectSameCamera(expected, restored);
    expect(restored.stops.join(",") === expected.stops.join(",") && restored.modeId === expected.modeId && restored.routeModel === expected.routeModel && restored.panel === "directions", "Fresh route share changed endpoints, mode, model or panel");
    expect(await text(".route-card") === summary, "Fresh route share changed its duration or selected epoch");
    await evaluate("document.activeElement?.blur()"); await key("r"); await sleep(4500);
    const reset = JSON.parse(new URL(await sharedUrl()).searchParams.get("state")!).view as CameraSnapshot;
    expectSameCamera(framed, reset);
    await drag(".map", -95, 20); await sleep(1200);
    await click('[aria-label="Fit route on map"]'); await sleep(4500);
    const fitted = JSON.parse(new URL(await sharedUrl()).searchParams.get("state")!).view as CameraSnapshot;
    expectSameCamera(framed, fitted);
    await screenshot("route-exact-share");
    return "Earth → Mars, Voyager 1, straight-line model, epoch and panned pose survive fresh load; R and Fit restore the current route bounds";
  });

  await check("A missing hero image falls back to its thumbnail, then to a labelled Retry, while exploration keeps working", async () => {
    await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Network.setBlockedURLs", { urls: ["*/media/mars.jpg*"] });
    try {
      await open("/?place=mars");
      await waitFor(`document.querySelector('.place-hero img')?.complete && document.querySelector('.place-hero img')?.naturalWidth > 0 && document.querySelector('.place-hero img').currentSrc.includes('/thumbs/')`, 20000);
      await send("Network.setBlockedURLs", { urls: ["*/media/mars.jpg*", "*/media/thumbs/mars.jpg*"] });
      await open("/?place=mars");
      await waitFor(`document.querySelector('.place-hero .img-fallback')`);
      expect((await text(".place-hero .img-fallback")).includes("Image unavailable") && await exists(".place-hero .img-retry"), "Missing hero image does not explain failure or offer retry");
      expect((await text(".place-head h1")) === "Mars" && await exists(".fact-tiles .tile"), "Image failure broke the sourced destination card");
      await clickText(".action-row button", "Focus");
      expect((await text(".camera-bar")).includes("Mars"), "Core focus stopped working after image failure");
      await screenshot("image-fallback", ".panel.place");
      await send("Network.setBlockedURLs", { urls: [] }); await click(".place-hero .img-retry");
      await waitFor(`document.querySelector('.place-hero img')?.complete && document.querySelector('.place-hero img')?.naturalWidth > 0`);
      return "Blocked hero shows its bundled thumbnail; with both blocked it retries once, shows Image unavailable, preserves facts/Focus, and user Retry recovers the actual image";
    } finally { await send("Network.setBlockedURLs", { urls: [] }); await send("Network.setCacheDisabled", { cacheDisabled: false }); }
  });

  await check("Browser Back preserves destination history after reload and a new selection", async () => {
    await open("/?place=mars");
    const choose = async (name: string, id: string) => {
      await fill(".main-search input", name);
      await waitFor(`document.querySelector('.main-search .osearch-name')?.textContent === ${JSON.stringify(name)}`);
      await key("Enter");
      await waitFor(`document.querySelector('.place-head h1')?.textContent === ${JSON.stringify(name)} && (() => { try { return JSON.parse(new URLSearchParams(location.search).get('state')).view.selectedId === ${JSON.stringify(id)}; } catch { return false; } })()`);
    };
    await choose("Saturn", "saturn");
    const previousDocument = await evaluate<number>("performance.timeOrigin");
    await send("Page.reload");
    await waitFor(`performance.timeOrigin !== ${previousDocument} && document.querySelector('.map-canvas') && !document.querySelector('.map-loading') && document.querySelector('.place-head h1')?.textContent === 'Saturn'`, 45000);
    await choose("Moon", "moon");
    for (const [name, id] of [["Saturn", "saturn"], ["Mars", "mars"]]) {
      const history = await send<{ currentIndex: number; entries: { id: number }[] }>("Page.getNavigationHistory");
      expect(history.currentIndex > 0, "Browser has no preceding destination entry");
      await send("Page.navigateToHistoryEntry", { entryId: history.entries[history.currentIndex - 1].id });
      await waitFor(`document.querySelector('.place-head h1')?.textContent === ${JSON.stringify(name)} && (() => { try { return JSON.parse(new URLSearchParams(location.search).get('state')).view.selectedId === ${JSON.stringify(id)}; } catch { return false; } })()`, 45000);
      expect((await text(".camera-bar")).includes(name), `Browser Back returned a stale camera while showing ${name}`);
    }
    await screenshot("history-reload-back");
    return "Mars → Saturn → full reload → Moon → browser Back Saturn → browser Back Mars, with matching URL and camera";
  });

  await send("Emulation.setDeviceMetricsOverride", PHONE);
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  await check("Phone comparison restores without overflow and retains accessible scale controls", async () => {
    expect(comparisonUrl, "No desktop comparison URL available"); await open(comparisonUrl);
    await waitFor(`document.querySelector('.comparison-panel')`);
    await clickText(".comparison-display-switch button", "True scale");
    await waitFor(`document.querySelector('.comparison-inset')`);
    const detail = await phoneFits(".comparison-panel");
    expect(await exists('[aria-label="Rotate comparison left"]') && await exists('[aria-label="Zoom comparison in"]'), "Phone lacks keyboard camera alternatives");
    await screenshot("phone-comparison", ".comparison-panel");
    await click('[aria-label="Close size comparison"]');
    await waitFor(`!document.querySelector('.comparison-panel')`);
    return detail;
  });

  await check("Phone mini-tour keeps stable controls and readable content without overflow", async () => {
    await open("/"); await clickText(".show-more", "Show all tours"); await clickText(".discovery-tour-card strong", "Inside Andromeda"); await click(".discovery-start");
    await waitFor(`document.querySelector('.discovery-progress progress')?.value === 1`);
    const detail = await phoneFits(".discovery-active");
    await clickText(".discovery-stop-controls button", "Next");
    await waitFor(`document.querySelector('.discovery-progress progress')?.value === 2`);
    await phoneFits(".discovery-active");
    await sleep(4500);
    await screenshot("phone-tour", ".discovery-active");
    await click('[aria-label="Exit tour and return to previous view"]'); await waitFor(`document.querySelector('.panel.explore .discovery-prompt')`);
    return `${detail}; Next and explicit exit work`;
  });

  await check("Phone directions keep both supported travel modes and no horizontal overflow", async () => {
    await open("/?route=earth,mars&mode=light"); await waitFor(`document.querySelector('.route-time')`);
    const detail = await phoneFits(".panel.directions");
    await click(".travel-mode-btn");
    const options = await evaluate<string[]>(`[...document.querySelectorAll('.travel-mode-menu [role=option]')].map(element => element.innerText.split(String.fromCharCode(10))[0])`);
    expect(options.join(",") === "Light speed,Voyager 1", `Unsupported travel menu: ${options.join(",")}`);
    await key("Escape"); await screenshot("phone-directions", ".panel.directions");
    return `${detail}; ${await text(".route-time")}; Light speed / Voyager 1`;
  });

  await check("Phone Earth-sky share keeps the chart and essential controls inside the viewport", async () => {
    expect(skyUrl, "No shared Earth-sky URL available"); await open(skyUrl);
    await waitFor(`document.querySelector('.earthsky-panel')`);
    const detail = await phoneFits(".earthsky-panel");
    expect(await exists('[aria-label="Zoom in sky chart"]') && await exists('[aria-label="Back to object"]'), "Phone sky lacks zoom or Back controls");
    await expectExposedControl('[aria-label="Back to object"]');
    await expectExposedControl('[aria-label="Zoom in sky chart"]');
    await expectExposedControl(".earthsky-controls > button", 0);
    const initialField = await skyWindow();
    await click('[aria-label="Zoom in sky chart"]'); const zoomed = await skyWindow();
    expect(zoomed < initialField, "The painted phone Zoom in control did not change the angular field");
    await click(".earthsky-controls > button", 0); expect(await skyWindow() === 120 && zoomed < 120, "Phone sky zoom/recenter failed");
    await screenshot("phone-earth-sky");
    await click('[aria-label="Back to object"]'); await waitFor(`!document.querySelector('.earthsky-overlay')`);
    return `${detail}; Back/zoom/recenter pass paint hit-tests and actual CDP clicks work`;
  });

  await check("Phone Quiet view can restore the search and bottom sheet", () => quietView(true));

  await check("No application error boundary or uncaught page exception", async () => {
    expect(!await exists(".crash"), "An application error boundary is visible");
    expect(exceptions.length === 0, exceptions.join("\n").slice(0, 1500));
    return "No crash panel or uncaught exception during public UI checks";
  });
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  results.push({ name: "Polish smoke harness", ok: false, detail }); console.log(`FAIL  Polish smoke harness — ${detail}`);
} finally {
  for (const [id, item] of pending) { clearTimeout(item.timer); item.reject(new Error("Harness closed")); pending.delete(id); }
  ws?.close(); browser.kill(); await sleep(300);
  rmSync(profile, { recursive: true, force: true }); rmSync(downloads, { recursive: true, force: true });
}

mkdirSync("docs/screenshots", { recursive: true });
writeFileSync(REPORT_FILE, JSON.stringify({ baseUrl: BASE, finished: new Date().toISOString(), results }, null, 2));
const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} final-polish checks passed against ${BASE}`);
process.exitCode = failed ? 1 : 0;
