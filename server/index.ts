import "dotenv/config";
import express from "express";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Catalog, CatalogObject } from "../src/lib/types";
import { buildImaginePrompt } from "./imaginePrompt";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 8787);
const PROD = process.env.NODE_ENV === "production";
const KEY = process.env.XAI_API_KEY?.trim() || "";
const VOICE_MODEL = process.env.XAI_VOICE_MODEL || "grok-voice-latest";
const VOICE_NAME = process.env.XAI_VOICE_NAME || "eve";
const IMAGE_MODEL = process.env.XAI_IMAGE_MODEL || "grok-imagine-image-2.0";
const XAI = "https://api.x.ai/v1";

const catalogPath = [resolve(ROOT, "dist/data/catalog.json"), resolve(ROOT, "public/data/catalog.json")].find(existsSync);
const catalog: Catalog | null = catalogPath ? JSON.parse(readFileSync(catalogPath, "utf8")) : null;
const byId = new Map<string, CatalogObject>(catalog?.objects.map((o) => [o.id, o]) ?? []);

/** Small in-memory limiter so a demo laptop can't burn through API credits. */
function limiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    const key = req.ip ?? "local";
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      res.status(429).json({ error: "Too many requests, try again in a few minutes." });
      return;
    }
    list.push(now);
    hits.set(key, list);
    next();
  };
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/api/status", (_req, res) => {
  res.json({
    grok: { configured: !!KEY, voiceModel: VOICE_MODEL, imageModel: IMAGE_MODEL },
    catalog: catalog ? { version: catalog.version, objects: catalog.objects.length } : null,
  });
});

app.post("/api/voice/session", limiter(30, 10 * 60_000), async (_req, res) => {
  if (!KEY) {
    res.status(503).json({ error: "Grok Voice is not configured: set XAI_API_KEY in .env and restart the server." });
    return;
  }
  try {
    const r = await fetch(`${XAI}/realtime/client_secrets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await r.json().catch(() => ({}))) as { value?: string; expires_at?: number; error?: unknown };
    if (!r.ok || !body.value) {
      res.status(502).json({ error: `xAI refused the voice session (HTTP ${r.status}).` });
      return;
    }
    res.json({ value: body.value, expires_at: body.expires_at, model: VOICE_MODEL, voice: VOICE_NAME });
  } catch (e) {
    res.status(502).json({ error: `Could not reach xAI: ${(e as Error).message}` });
  }
});

const imageCache = new Map<string, { image: string; prompt: string; model: string; created: string }>();

app.post("/api/imagine", limiter(10, 10 * 60_000), async (req, res) => {
  const id = typeof req.body?.objectId === "string" ? req.body.objectId : "";
  const obj = byId.get(id);
  if (!obj || !obj.featured) {
    res.status(400).json({ error: "Unknown destination" });
    return;
  }
  if (!KEY) {
    res.status(503).json({ error: "Grok Imagine is not configured: set XAI_API_KEY in .env and restart the server." });
    return;
  }
  const cached = imageCache.get(id);
  if (cached) {
    res.json(cached);
    return;
  }
  const prompt = buildImaginePrompt(obj);
  try {
    const r = await fetch(`${XAI}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: IMAGE_MODEL, prompt, n: 1, response_format: "b64_json" }),
      signal: AbortSignal.timeout(90_000),
    });
    const body = (await r.json().catch(() => ({}))) as { data?: { b64_json?: string; url?: string }[] };
    const item = body.data?.[0];
    const image = item?.b64_json ? `data:image/jpeg;base64,${item.b64_json}` : item?.url;
    if (!r.ok || !image) {
      res.status(502).json({ error: `xAI image generation failed (HTTP ${r.status}).` });
      return;
    }
    const out = { image, prompt, model: IMAGE_MODEL, created: new Date().toISOString() };
    imageCache.set(id, out);
    res.json(out);
  } catch (e) {
    res.status(502).json({ error: `Could not reach xAI: ${(e as Error).message}` });
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

if (PROD) {
  const dist = resolve(ROOT, "dist");
  app.use(express.static(dist, { maxAge: "1h" }));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`GalaxyMaps server on http://localhost:${PORT} (${PROD ? "production" : "API only; open the Vite URL"})`);
  console.log(`Grok: ${KEY ? "XAI_API_KEY configured" : "not configured (map and calculations still work)"}`);
});
