import type { CatalogObject } from "./types";
import { currentShareUrl } from "../state/urlState";
import { useStore } from "../state/store";
import { canvasFont, loadCanvasFonts } from "./fonts";

export const isLocalUrl = (url: string) => { try { const h = new URL(url).hostname; return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h); } catch { return true; } };
export async function shareCurrentView(): Promise<"copied" | "shared" | "local"> {
  const url = currentShareUrl(), local = isLocalUrl(url);
  if (navigator.share && !local) { await navigator.share({ title: "GalaxyMaps · this exact view", url }); return "shared"; }
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable. Copy the link below.");
  await navigator.clipboard.writeText(url);
  return local ? "local" : "copied";
}
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, line: number, maxLines: number) {
  const words = text.split(/\s+/); let row = "", lines = 0;
  for (const word of words) { const next = row ? `${row} ${word}` : word; if (ctx.measureText(next).width > width && row) { ctx.fillText(row, x, y); y += line; row = word; if (++lines >= maxLines - 1) break; } else row = next; }
  if (lines < maxLines) ctx.fillText(row, x, y); return y + line;
}
export async function exportDiscoveryCard(obj: CatalogObject): Promise<void> {
  const canvas = document.createElement("canvas"); canvas.width = 1440; canvas.height = 900;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Image export is unavailable in this browser.");
  await loadCanvasFonts();
  ctx.fillStyle = "#080f20"; ctx.fillRect(0, 0, 1440, 900);
  let shown = false;
  if (obj.image?.src.startsWith("/") && !obj.image.src.startsWith("//")) {
    try { const response = await fetch(obj.image.src, { signal: AbortSignal.timeout(8000) }); if (!response.ok) throw new Error("image unavailable"); const bitmap = await createImageBitmap(await response.blob()); const fit = Math.min(800 / bitmap.width, 690 / bitmap.height); ctx.drawImage(bitmap, 40 + (800 - bitmap.width * fit) / 2, 100 + (690 - bitmap.height * fit) / 2, bitmap.width * fit, bitmap.height * fit); bitmap.close(); shown = true; } catch { /* Textual fallback remains exportable. */ }
  }
  if (!shown) { ctx.fillStyle = obj.display.color; ctx.beginPath(); ctx.arc(430, 440, 170, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#cbd5e1"; ctx.font = canvasFont("22px"); ctx.fillText("Schematic symbol · image unavailable", 220, 690); }
  ctx.fillStyle = "#88b6ff"; ctx.font = canvasFont("600 28px"); ctx.fillText("GalaxyMaps", 54, 58);
  ctx.fillStyle = "#ffffff"; ctx.font = canvasFont("600 52px"); const y = wrap(ctx, obj.name, 890, 190, 490, 62, 3);
  ctx.fillStyle = "#a7c7ff"; ctx.font = canvasFont("24px"); ctx.fillText(obj.subtitle.slice(0, 40), 890, y + 12);
  const fact = obj.facts.find((f) => f.sourceId) ?? obj.facts[0];
  const source = fact?.sourceId ? useStore.getState().data?.catalog.sources[fact.sourceId] : undefined;
  ctx.fillStyle = "#e2e8f0"; ctx.font = canvasFont("30px"); wrap(ctx, fact ? `${fact.label}: ${fact.value}` : obj.summary?.text ?? "Explore this real catalog destination.", 890, y + 110, 470, 43, 5);
  ctx.fillStyle = "#a9b5ca"; ctx.font = canvasFont("18px");
  wrap(ctx, `${shown ? `${obj.image!.title} · ${obj.image!.credit} · ${obj.image!.license}` : "Schematic symbol"}. ${source ? `Fact source: ${source.title} · ${source.url}` : obj.summary?.url ?? ""}`, 54, 815, 1330, 24, 3);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png")); if (!blob) throw new Error("Could not create the discovery card.");
  const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = `GalaxyMaps-${obj.id}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
