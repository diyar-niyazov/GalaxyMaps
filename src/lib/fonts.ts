/** Canvas text must name the bundled family; "Inter" alone only matches a locally installed copy. */
export const FONT_STACK = '"Inter Variable", Inter, system-ui, sans-serif';

export const canvasFont = (spec: string) => `${spec} ${FONT_STACK}`;

/** Canvas drawing does not reliably trigger web-font loading, so request the faces explicitly. */
export function loadCanvasFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  return Promise.all(["400", "500", "600", "700"].map((w) => document.fonts.load(`${w} 16px "Inter Variable"`)))
    .then(() => undefined, () => undefined);
}
