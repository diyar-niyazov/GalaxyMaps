/**
 * Fetch every upstream source into data/raw/. Run with `npm run data:fetch`.
 * Pass step names to run a subset, e.g. `npm run data:fetch -- simbad media`.
 */
import { fetchHorizons } from "./horizons";
import { fetchSimbad, fetchExoplanets, fetchFactsheet, fetchHyg, fetchSbdb } from "./catalogs";
import { fetchMedia, fetchTextures, makeThumbs } from "./media";

const steps: Record<string, () => Promise<void>> = {
  hyg: fetchHyg,
  factsheet: fetchFactsheet,
  simbad: fetchSimbad,
  exoplanets: fetchExoplanets,
  horizons: fetchHorizons,
  sbdb: fetchSbdb,
  textures: fetchTextures,
  media: fetchMedia,
  thumbs: makeThumbs,
};

const wanted = process.argv.slice(2);
for (const [name, fn] of Object.entries(steps)) {
  if (wanted.length && !wanted.includes(name)) continue;
  console.log(`▸ ${name}`);
  await fn();
}
console.log("Done. Now run `npm run data:build`.");
