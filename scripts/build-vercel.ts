/**
 * Vercel build (Build Output API v3). Run after `vite build`:
 *   - dist/                      → .vercel/output/static (served by Vercel's CDN)
 *   - server/index.ts + deps     → .vercel/output/functions/api.func (one Node function for /api/*)
 *   - public/data/catalog.json   → bundled beside the function for server-side catalog lookups
 * Deep links fall back to index.html so the single-page app handles routing.
 */
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, ".vercel/output");
const fn = resolve(out, "functions/api.func");

rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });
cpSync(resolve(root, "dist"), resolve(out, "static"), { recursive: true });

await build({
  entryPoints: [resolve(root, "server/index.ts")],
  outfile: resolve(fn, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: "linked",
  // Express and its dependencies are CommonJS; give the ESM bundle a real `require`.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
});
mkdirSync(resolve(fn, "data"));
cpSync(resolve(root, "public/data/catalog.json"), resolve(fn, "data/catalog.json"));

writeFileSync(resolve(fn, ".vc-config.json"), JSON.stringify({
  runtime: process.env.VERCEL_NODE_RUNTIME ?? "nodejs22.x",
  handler: "index.mjs",
  launcherType: "Nodejs",
  shouldAddHelpers: false,
  maxDuration: 60,
}, null, 2));

writeFileSync(resolve(out, "config.json"), JSON.stringify({
  version: 3,
  routes: [
    { src: "/assets/(.*)", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
    { handle: "filesystem" },
    { src: "/api(?:/.*)?", dest: "/api" },
    { src: "/(.*)", dest: "/index.html" },
  ],
}, null, 2));

console.log("Wrote .vercel/output (static site + /api function)");
