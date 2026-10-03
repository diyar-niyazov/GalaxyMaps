import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RAW = join(ROOT, "data", "raw");
export const PUBLIC_DATA = join(ROOT, "public", "data");

export const USER_AGENT = "GalaxyMaps/1.0 (BigRed//Hacks 2026 student project; data ingestion script)";

export async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function writeJson(path: string, data: unknown, pretty = true) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, pretty ? JSON.stringify(data, null, 1) : JSON.stringify(data));
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url: string, init: RequestInit = {}, tries = 5): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    let wait = 1500 * 2 ** i;
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(30_000),
        headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) },
      });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        if (retryAfter > 0) wait = Math.min(retryAfter * 1000, 60_000);
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(wait);
    }
  }
  throw lastErr;
}

export async function fetchText(url: string, init?: RequestInit) {
  const res = await fetchWithRetry(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithRetry(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

export async function download(url: string, dest: string) {
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

export const today = () => new Date().toISOString().slice(0, 10);

/** Minimal RFC 4180 CSV parser (handles quoted fields with commas/quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}
