import type { CatalogObject } from "../src/lib/types";

/**
 * Builds a Grok Imagine prompt from catalog data only. The prompt is shown to the user
 * next to the generated image so it's clear what the "AI reconstruction" is based on.
 */
export function buildImaginePrompt(o: CatalogObject): string {
  const facts = o.facts
    .filter((f) => /spectral|type|temperature|diameter|radius|rings|moons|morphology|class|mass/i.test(f.label))
    .slice(0, 6)
    .map((f) => `${f.label}: ${f.value}`);
  const planets = o.exoplanets?.planets.slice(0, 4).map((p) => `${p.name}${p.radiusEarth ? ` (~${p.radiusEarth.toFixed(1)} Earth radii)` : ""}`);
  const parts = [
    `Scientifically grounded artistic visualization of ${o.name}, ${o.subtitle}.`,
    facts.length ? `Known properties: ${facts.join("; ")}.` : "",
    planets?.length ? `Confirmed planets: ${planets.join(", ")}.` : "",
    o.hasRings ? "It has a ring system." : "",
    "Depict only what these properties support; do not add extra stars, planets, moons, spacecraft or people.",
    "Realistic lighting, dark space background, no text, no labels, no logos.",
  ];
  return parts.filter(Boolean).join(" ");
}
