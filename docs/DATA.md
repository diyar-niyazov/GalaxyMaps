# Data sources and preparation

SpaceMaps ships with a prebuilt dataset in `public/data/`, so the demo never depends on live astronomy APIs. Everything in it can be regenerated with two commands:

```bash
npm run data:fetch   # downloads every upstream source into data/raw/   (network, ~2–5 min)
npm run data:build   # builds public/data/ from data/raw/               (offline, seconds)
# or both:
npm run data
```

You can fetch a subset by naming steps: `npm run data:fetch -- simbad media`. The steps are `hyg`, `factsheet`, `simbad`, `exoplanets`, `horizons`, `textures`, `media`. Media summaries are cached; set `MEDIA_REFRESH=1` to re-download them.

The raw responses in `data/raw/` are meant to be committed, except the 13 MB HYG archive and the image sources, which `.gitignore` excludes. A fresh clone can therefore run `npm run data:build` immediately, as long as `data/raw/hyg_v44.csv.gz` exists; otherwise run `npm run data:fetch -- hyg` first.

## Sources

| Step | Source | Endpoint | Used for |
| --- | --- | --- | --- |
| `horizons` | NASA/JPL Horizons API (DE441) | `https://ssd.jpl.nasa.gov/api/horizons.api` | Daily Sun-centered ICRF vectors (2026-09-01 → 2027-03-01) for the planets, dwarf planets, small bodies and spacecraft. Weekly osculating elements for moons relative to their planet. Orbit elements for drawing. Spacecraft speeds, including Parker's 2024-12-24 perihelion peak. |
| `factsheet` | NASA Planetary Fact Sheet (NSSDCA) | `https://nssdc.gsfc.nasa.gov/planetary/factsheet/` | Planet radius, mass, day length, moons, mean temperature |
| `hyg` | HYG Database v4.4, Astronexus (CC BY-SA 4.0) | `https://codeberg.org/astronexus/hyg` (`hyg_v44.csv.gz`) | 109,389 stars within 1,000 pc for the star field, plus fallback names |
| `simbad` | SIMBAD TAP, CDS Strasbourg | `https://simbad.cds.unistra.fr/simbad/sim-tap/sync` | Featured stars and deep-sky objects: coordinates, parallax and error with bibcode, spectral type, identifiers, measured distances (`mesDistance`) |
| `exoplanets` | NASA Exoplanet Archive TAP (`pscomppars`) | `https://exoplanetarchive.ipac.caltech.edu/TAP/sync` | Planets of featured host stars |
| `textures` | Solar System Scope (CC BY 4.0, based on NASA imagery) | `https://www.solarsystemscope.com/textures/` | Equirectangular planet textures for the Realistic layer |
| `media` | Wikipedia REST summaries + Wikimedia Commons `imageinfo` | `en.wikipedia.org/api/rest_v1/page/summary/…`, `commons.wikimedia.org/w/api.php` | Short summaries (CC BY-SA 4.0) and lead images with per-image credit and license |
| curated | Peer-reviewed literature, cited by ADS bibcode in `scripts/data/config.ts` | `https://ui.adsabs.harvard.edu/` | Distances that are better than SIMBAD's default, e.g. Sgr A* (GRAVITY 2019), the LMC (Pietrzyński 2019), the SMC (Graczyk 2020), the Orion Nebula (Menten 2007, VLBA parallax) |

Every `Fact`, distance and image in `catalog.json` records its `sourceId`, and `catalog.sources` holds the title, URL, license and retrieval date. `npm test` checks that every referenced source exists.

## Rules applied during the build (`scripts/data/build-dataset.ts`)

- **Frames and units.**
  - Positions are Sun-centered ICRF in km (float64 in the app). Horizons is queried with center `500@10` (Sun body center), TDB time scale, km and km/s.
  - The reference epoch for distances quoted on cards is 2026-10-04 (demo day).
  - Star positions are HYG J2000 Cartesian coordinates. Proper motion is not propagated; the error is negligible at map scale.
- **Parallaxes are never inverted blindly.**
  - SIMBAD parallaxes are converted to distance only if the parallax is positive and has a reported error with σ/ϖ ≤ 20%.
  - Quality is labeled from the relative error: precise ≤ 1%, good ≤ 5%, approximate ≤ 20%. Asymmetric uncertainties are kept (+/−).
  - Otherwise the object is searchable but not routable, and the reason is shown. For example, Alnilam's parallax error is too large.
- **HYG sentinels and limits.**
  - HYG's `dist ≥ 100000` pc sentinel means "no usable parallax" and is excluded.
  - HYG stars beyond 100 pc appear in the star field but are not routable, because HYG does not tabulate parallax errors.
- **Galaxies and cosmology.**
  - Local Group and Local Volume galaxies use redshift-independent distances (Cepheids, TRGB, eclipsing binaries) from the cited literature.
  - Objects at cosmological redshift (3C 273 at z ≈ 0.158, TON 618 at z ≈ 2.2) get no distance and no route. Light-travel, comoving and luminosity distances differ there, and expansion makes a constant-speed trip undefined.
- **Images.**
  - Images whose filenames look like constellation charts, maps, diagrams or size comparisons are skipped. Non-free (fair-use) images are rejected.
  - Images whose Commons metadata says "artist's impression", "illustration", "simulation" and similar are labeled **Scientific illustration**; everything else is **Observed image**.
  - The Milky Way disk on the map is a procedural illustration (`src/map/milkyWay.ts`) and is labeled as such. It never affects coordinates.
- **No LLM-generated data.** Every number comes from a fetched response or a cited literature entry. Grok Imagine images are generated only on demand in the app, labeled **AI reconstruction**, and never written into the dataset.

## Output (`public/data/`)

| File | Size | Contents |
| --- | --- | --- |
| `catalog.json` | ~750 kB | 618 objects: 105 featured destination cards (102 routable) plus named HYG stars; sources; spacecraft speed references |
| `ephemeris.json` | ~280 kB | Daily vectors, satellite elements, orbit elements |
| `stars.bin` | ~3.5 MB | 109,389 × 8 float32 columns (`x_pc, y_pc, z_pc, absmag, ci, mag, hyg_id, hip`) |
| `star-names.json` | ~110 kB | Labels, spectral types and constellations for point-cloud stars |

The build prints a summary, e.g.:

```
Catalog: 618 objects (105 featured, … HYG named), 66 with images
Routable featured: 102; not routable: Alnilam, 3C 273, TON 618
```

## Adding a destination

1. Add an entry to `CURATED` (or `SOLAR_BODIES`) in `scripts/data/config.ts`, with a SIMBAD identifier and either `distance: {kind: "parallax"}`, a literature value with its bibcode, or `{kind: "none", reason}`.
2. Run `npm run data:fetch -- simbad media` and then `npm run data:build`.
3. Run `npm test`. The dataset tests check IDs, sources, positions and route capabilities.
