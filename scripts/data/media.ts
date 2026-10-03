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

export async function fetchMedia() {
  const entries = [
    ...SOLAR_BODIES.map((b) => ({ id: b.id, wiki: b.wiki, image: undefined as string | null | undefined, imageKind: undefined as string | undefined })),
    ...CURATED.map((c) => ({ id: c.id, wiki: c.wiki, image: c.image, imageKind: c.imageKind })),
  ].filter((e) => e.wiki);

  const rawPath = join(RAW, "media.json");
  const previous = (await exists(rawPath)) ? (await readJson<{ objects: Record<string, { summary: unknown }> }>(rawPath)).objects : {};
  const refresh = process.env.MEDIA_REFRESH === "1";
  const out: Record<string, unknown> = { ...previous };
  for (const e of entries) {
    if (!refresh && previous[e.id]?.summary) continue;
    process.stdout.write(`  Wikipedia ${e.wiki}… `);
    let summary: Summary | null = null;
    try {
      summary = await fetchJson<Summary>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(e.wiki!)}`);
    } catch (err) {
      console.log(`summary failed (${(err as Error).message})`);
    }
    let image: Record<string, unknown> | null = null;
    const file = e.image === null ? null : e.image ?? (summary?.originalimage ? fileFromUrl(summary.originalimage.source) : null);
    if (file && (e.image || !SKIP.test(file))) {
      const info = await commonsInfo(file).catch(() => null);
      const md = info?.extmetadata ?? {};
      const license = stripHtml(md.LicenseShortName?.value);
      const nonFree = md.NonFree?.value === "true" || /fair use|non-free/i.test(license);
      if (info && !nonFree && license) {
        const text = `${file} ${stripHtml(md.ImageDescription?.value)} ${stripHtml(md.ObjectName?.value)} ${md.Categories?.value ?? ""}`;
        const ext = extname(new URL(info.thumburl).pathname).toLowerCase() || ".jpg";
        const local = `/media/${e.id}${ext === ".png" ? ".png" : ".jpg"}`;
        const dest = join(ROOT, "public", local);
        if (!(await exists(dest))) await download(info.thumburl, dest);
        image = {
          src: local,
          width: info.thumbwidth,
          height: info.thumbheight,
          kind: e.imageKind ?? (ILLUSTRATION.test(text) ? "illustration" : "observed"),
          title: stripHtml(md.ObjectName?.value) || file.replace(/_/g, " ").replace(/\.[a-z]+$/i, ""),
          credit: stripHtml(md.Artist?.value || md.Credit?.value).slice(0, 200) || "See source",
          license,
          licenseUrl: md.LicenseUrl?.value,
          sourceUrl: info.descriptionurl,
          description: stripHtml(md.ImageDescription?.value).slice(0, 400),
        };
      }
    }
    out[e.id] = {
      wiki: e.wiki,
      summary: summary ? { title: summary.title, extract: summary.extract, description: summary.description, url: summary.content_urls?.desktop?.page } : null,
      image,
    };
    console.log(image ? `image (${(image as { kind: string }).kind}, ${(image as { license: string }).license})` : "no image");
    await writeJson(rawPath, { retrieved: today(), objects: out });
    await new Promise((r) => setTimeout(r, 1200));
  }
  await writeJson(rawPath, { retrieved: today(), objects: out });
}
