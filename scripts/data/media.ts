import { join, extname } from "node:path";
import { RAW, ROOT, fetchJson, writeJson, readJson, today, download, exists } from "./lib";
import { SOLAR_BODIES, CURATED } from "./config";

const SSS_BASE = "https://www.solarsystemscope.com/textures/download/";
export const TEXTURES = [
  "2k_sun.jpg", "2k_mercury.jpg", "2k_venus_atmosphere.jpg", "2k_earth_daymap.jpg", "2k_moon.jpg", "2k_mars.jpg",
  "2k_jupiter.jpg", "2k_saturn.jpg", "2k_saturn_ring_alpha.png", "2k_uranus.jpg", "2k_neptune.jpg",
];

export async function fetchTextures() {
  for (const t of TEXTURES) {
    const dest = join(ROOT, "public", "textures", t);
    if (await exists(dest)) continue;
    await download(SSS_BASE + t, dest);
  }
  console.log(`  Solar System Scope textures: ${TEXTURES.length}`);
}

interface Summary {
  title: string;
  extract: string;
  description?: string;
  content_urls?: { desktop?: { page?: string } };
  originalimage?: { source: string };
}

interface ImageInfo {
  thumburl: string;
  thumbwidth: number;
  thumbheight: number;
  descriptionurl: string;
  extmetadata?: Record<string, { value: string }>;
}

const stripHtml = (s = "") => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();

function fileFromUrl(url: string): string | null {
  const m = url.match(/\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const SKIP = /constellation|_map|location|diagram|chart|comparison|size|orbit|position|sky ?map|finder|\.svg$|\.gif$|\.tif/i;
const ILLUSTRATION = /artist|artistic|impression|illustration|concept|render|simulat|imagined|depiction|visuali[sz]ation/i;

async function commonsInfo(file: string): Promise<ImageInfo | null> {
  const url = `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
    action: "query", titles: `File:${file}`, prop: "imageinfo", iiprop: "url|extmetadata|size", iiurlwidth: "800", format: "json", origin: "*",
  })}`;
  const r = await fetchJson<{ query: { pages: Record<string, { missing?: string; imageinfo?: ImageInfo[] }> } }>(url);
  const page = Object.values(r.query.pages)[0];
  if (!page || page.missing !== undefined || !page.imageinfo?.length) return null;
  return page.imageinfo[0];
}

const GALLERY_SKIP = /logo|icon|flag|symbol|commons|wiki|question_book|ambox|edit-|nuvola|crystal|padlock|portal|stub|signature|seal|insignia|patch|emblem|audio|speaker|\.ogg$|\.webm$|\.pdf$|\.djvu$|ideogram|template|button|arrow|disambig|text-x|folder|lock-|semi-protection|oojs/i;
const FREE = (license: string, md: Record<string, { value: string }>) => license && !(md.NonFree?.value === "true" || /fair use|non-free/i.test(license));

interface MediaEntry { id: string; wiki: string; image?: string | null; imageKind?: string; gallery: boolean }

async function commonsInfoMany(files: string[], width = 800): Promise<Map<string, ImageInfo>> {
  const out = new Map<string, ImageInfo>();
  for (let i = 0; i < files.length; i += 40) {
    const chunk = files.slice(i, i + 40);
    const url = `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
      action: "query", titles: chunk.map((f) => `File:${f}`).join("|"), prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: String(width), format: "json", origin: "*",
    })}`;
    const r = await fetchJson<{ query: { normalized?: { from: string; to: string }[]; pages: Record<string, { title: string; missing?: string; imageinfo?: (ImageInfo & { mime?: string })[] }> } }>(url);
    const back = new Map((r.query.normalized ?? []).map((n) => [n.to, n.from]));
    for (const p of Object.values(r.query.pages)) {
      if (p.missing !== undefined || !p.imageinfo?.length) continue;
      if (!/image\/(jpeg|png)/.test(p.imageinfo[0].mime ?? "image/jpeg")) continue;
      out.set((back.get(p.title) ?? p.title).replace(/^File:/, ""), p.imageinfo[0]);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return out;
}

function imageRecord(file: string, info: ImageInfo, kind: string | undefined, src: string) {
  const md = info.extmetadata ?? {};
  const desc = stripHtml(md.ImageDescription?.value);
  const text = `${file} ${desc} ${stripHtml(md.ObjectName?.value)} ${md.Categories?.value ?? ""}`;
  return {
    src,
    width: info.thumbwidth,
    height: info.thumbheight,
    kind: kind ?? (ILLUSTRATION.test(text) ? "illustration" : "observed"),
    title: stripHtml(md.ObjectName?.value) || file.replace(/_/g, " ").replace(/\.[a-z]+$/i, ""),
    credit: stripHtml(md.Artist?.value || md.Credit?.value).slice(0, 200) || "See source",
    license: stripHtml(md.LicenseShortName?.value),
    licenseUrl: md.LicenseUrl?.value,
    sourceUrl: info.descriptionurl,
    description: desc.slice(0, 400),
  };
}

/** Full plain-text lead sections, 20 articles per request. */
async function fetchIntros(titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < titles.length; i += 20) {
    const chunk = titles.slice(i, i + 20);
    const url = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
      action: "query", prop: "extracts", exintro: "1", explaintext: "1", exlimit: "20", redirects: "1", titles: chunk.join("|"), format: "json", origin: "*",
    })}`;
    const r = await fetchJson<{ query: { normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[]; pages: Record<string, { title: string; extract?: string }> } }>(url);
    const byTitle = new Map(Object.values(r.query.pages).map((p) => [p.title, p.extract ?? ""]));
    for (const t of chunk) {
      let k = t.replace(/_/g, " ");
      for (const n of r.query.normalized ?? []) if (n.from === k) k = n.to;
      for (const n of r.query.redirects ?? []) if (n.from === k) k = n.to;
      const ex = byTitle.get(k);
      if (ex) out.set(t, ex);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return out;
}

async function galleryFor(e: MediaEntry, heroFile: string | null, name: string) {
  const url = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({ action: "query", prop: "images", imlimit: "80", redirects: "1", titles: e.wiki, format: "json", origin: "*" })}`;
  const r = await fetchJson<{ query: { pages: Record<string, { images?: { title: string }[] }> } }>(url);
  const files = (Object.values(r.query.pages)[0]?.images ?? [])
    .map((i) => i.title.replace(/^File:/, "").replace(/ /g, "_"))
    .filter((f) => /\.(jpe?g|png)$/i.test(f) && !GALLERY_SKIP.test(f) && !SKIP.test(f) && f !== heroFile);
  // Prefer files that mention the object, then everything else, in article order.
  const tokens = name.toLowerCase().split(/[\s–-]+/).filter((t) => t.length > 2);
  files.sort((a, b) => Number(tokens.some((t) => b.toLowerCase().includes(t))) - Number(tokens.some((t) => a.toLowerCase().includes(t))));
  const info = await commonsInfoMany(files.slice(0, 12));
  const out = [];
  for (const f of files.slice(0, 12)) {
    const i = info.get(f);
    if (!i || i.thumbwidth < 320) continue;
    const license = stripHtml(i.extmetadata?.LicenseShortName?.value);
    if (!FREE(license, i.extmetadata ?? {})) continue;
    out.push(imageRecord(f, i, undefined, i.thumburl));
    if (out.length >= 5) break;
  }
  return out;
}

export async function fetchMedia() {
  const { MISSIONS } = await import("./config-extra");
  const entries = [
    ...SOLAR_BODIES.map((b) => ({ id: b.id, wiki: b.wiki, gallery: b.priority >= 40, name: b.name })),
    ...CURATED.map((c) => ({ id: c.id, wiki: c.wiki, image: c.image, imageKind: c.imageKind, gallery: c.priority >= 45, name: c.name })),
    ...MISSIONS.map((m) => ({ id: m.id, wiki: m.wiki, image: m.image, gallery: m.priority >= 40, name: m.name })),
  ].filter((e): e is typeof e & MediaEntry => !!e.wiki);
  const names = new Map([...SOLAR_BODIES, ...CURATED, ...MISSIONS].map((x) => [x.id, x.name]));

  const rawPath = join(RAW, "media.json");
  type Rec = { wiki?: string; summary: unknown; image: { sourceUrl?: string } | null; intro?: string; gallery?: unknown[] };
  const previous = (await exists(rawPath)) ? (await readJson<{ objects: Record<string, Rec> }>(rawPath)).objects : {};
  const refresh = process.env.MEDIA_REFRESH === "1";
  const out: Record<string, Rec> = { ...previous };
  const save = () => writeJson(rawPath, { retrieved: today(), objects: out });

  for (const e of entries) {
    if (!refresh && previous[e.id]?.summary && previous[e.id]?.wiki === e.wiki) continue;
    process.stdout.write(`  Wikipedia ${e.wiki}… `);
    let summary: Summary | null = null;
    try {
      summary = await fetchJson<Summary>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(e.wiki)}`);
    } catch (err) {
      console.log(`summary failed (${(err as Error).message})`);
    }
    let image: Rec["image"] = null;
    const file = e.image === null ? null : e.image ?? (summary?.originalimage ? fileFromUrl(summary.originalimage.source) : null);
    if (file && (e.image || !SKIP.test(file))) {
      const info = await commonsInfo(file).catch(() => null);
      const md = info?.extmetadata ?? {};
      const license = stripHtml(md.LicenseShortName?.value);
      if (info && FREE(license, md)) {
        const ext = extname(new URL(info.thumburl).pathname).toLowerCase() || ".jpg";
        const local = `/media/${e.id}${ext === ".png" ? ".png" : ".jpg"}`;
        const dest = join(ROOT, "public", local);
        if (!(await exists(dest)) || refresh) await download(info.thumburl, dest);
        image = imageRecord(file, info, e.imageKind, local);
      }
    }
    out[e.id] = { ...out[e.id], wiki: e.wiki, summary: summary ? { title: summary.title, extract: summary.extract, description: summary.description, url: summary.content_urls?.desktop?.page } : null, image };
    console.log(image ? `image (${(image as { kind?: string }).kind})` : "no image");
    await save();
    await new Promise((r) => setTimeout(r, 1000));
  }

  const needIntro = entries.filter((e) => refresh || out[e.id]?.intro === undefined);
  if (needIntro.length) {
    console.log(`  Wikipedia lead sections for ${needIntro.length} articles…`);
    const intros = await fetchIntros(needIntro.map((e) => e.wiki));
    for (const e of needIntro) if (out[e.id]) out[e.id].intro = intros.get(e.wiki) ?? "";
    await save();
  }

  for (const e of entries.filter((x) => x.gallery && (refresh || !out[x.id]?.gallery))) {
    process.stdout.write(`  Gallery ${e.wiki}… `);
    try {
      const hero = out[e.id]?.image?.sourceUrl?.split("File:")[1] ?? null;
      out[e.id].gallery = await galleryFor(e, hero ? decodeURIComponent(hero) : null, names.get(e.id) ?? e.wiki);
      console.log(`${out[e.id].gallery!.length} images`);
    } catch (err) {
      console.log(`failed (${(err as Error).message})`);
    }
    await save();
    await new Promise((r) => setTimeout(r, 800));
  }
  await save();
}

/** Small square-ish thumbnails for search results, generated locally from the cached hero images. */
export async function makeThumbs() {
  const { readdir, mkdir } = await import("node:fs/promises");
  const { execFileSync } = await import("node:child_process");
  const dir = join(ROOT, "public", "media");
  const thumbs = join(dir, "thumbs");
  await mkdir(thumbs, { recursive: true });
  let n = 0;
  // Large PNG heroes become JPEGs (flattened on black like the card hero); the build prefers the .jpg.
  const { stat, unlink } = await import("node:fs/promises");
  for (const f of await readdir(dir)) {
    if (!/\.png$/i.test(f) || (await stat(join(dir, f))).size < 400_000) continue;
    execFileSync("magick", [join(dir, f), "-background", "#000000", "-flatten", "-strip", "-quality", "85", join(dir, f.replace(/\.png$/i, ".jpg"))]);
    await unlink(join(dir, f));
  }
  for (const f of await readdir(dir)) {
    if (!/\.(jpe?g|png)$/i.test(f)) continue;
    const dest = join(thumbs, f.replace(/\.png$/i, ".jpg"));
    if (await exists(dest)) continue;
    execFileSync("magick", [join(dir, f), "-background", "#05070d", "-flatten", "-resize", "160x160^", "-gravity", "center", "-extent", "160x160", "-strip", "-quality", "78", dest]);
    n++;
  }
  console.log(`  thumbnails: ${n} generated`);
}
