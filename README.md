# GalaxyMaps

**Directions across the universe, on a map that feels familiar.**

### [**www.galaxies.wiki**](https://www.galaxies.wiki)

Mirror: [galaxy-maps.vercel.app](https://galaxy-maps.vercel.app) · Built for **BigRed//Hacks 2026** (theme: Navigation)

<video src="docs/demo.mp4" poster="docs/demo-poster.png" controls muted playsinline width="100%">
  <a href="docs/demo.mp4">Watch the GalaxyMaps demo video</a>
</video>

## Judges: start here (3 minutes)

Open **[www.galaxies.wiki](https://www.galaxies.wiki)**. No install, no account, no API key. Best on a desktop browser. The first four steps show the core idea.

1. **Land on Earth.** The app opens locked on a textured Earth. Drag to orbit. This is the "locked camera" that makes space feel like a map.
2. **Get directions to Mars.** Press `/`, search **Mars**, open its card, and press **Directions** from Earth. You get an idealized Hohmann transfer (about 259 days), the next launch window, Δv, and the arc drawn on the map. Switch **Travel mode** between Light speed and Voyager 1.
3. **Watch it move.** Press `Space` to play time. Planets move and spin on real NASA/JPL Horizons data.
4. **Go far.** Search **M31**, open Andromeda, and press **Explore inside** (21 features). Then try **Surprise me** for a random destination.
5. **Compare sizes.** On the Sun's card, press **Compare sizes** and pick the **Sun / Sirius A** preset.
6. **Take a tour.** Start **Black holes & extremes**, or the five-chapter **SpaceX Demo-2** story.
7. **See it from home.** On a card that offers **View from Earth** (for example Andromeda), press it to open the Earth sky chart.
8. **Present it.** Use **Quiet view** (full-screen icon, right edge) for a clean screen, or **Share this view** for an exact link.
9. **Try VR.** On a WebXR headset (we filmed on Apple Vision Pro), press **Enter VR**, look at an object, and pinch to fly there.

**Why it's trustworthy:** every distance comes from a cited catalog, and every model assumption is shown in the UI. Where the physics is idealized, the app says so. Details: [Scientific model](#scientific-model-and-assumptions).

GalaxyMaps is a continuously zoomable 3D space atlas with a map-app interface. Search for a planet, star, nebula, or galaxy, open an image-led destination card, lock the camera onto it and orbit it, then ask for directions.

- **Planet to planet:** an idealized Hohmann transfer orbit.
- **Everything else:** a straight-line cruise at light speed or at Voyager 1's measured speed.
- **Every distance** comes from a cited catalog, and every model assumption is shown in the interface.

![Home: locked on a textured Earth](docs/screenshots/desktop-home-earth.png)

## Features

- **Search and browse:** 919 catalog objects plus 109,389 HYG stars. Fuzzy, typo-tolerant, fully local search (try "betelgeuze", "M31", "black hole"), and a category tree with real counts.
- **Directions:** Hohmann transfers with departure and arrival dates, Δv, and the next alignment window. Multi-stop journeys (up to 5 stops) with suggested stops.
- **Play time:** planets move and spin on JPL Horizons data.
- **Compare sizes:** audited planet, moon, and star diameters at true scale.
- **Earth sky chart:** an Earth-centered stereographic view of eligible objects.
- **Tours and stories:** four mini-tours and the five-chapter SpaceX Demo-2 mission story.
- **Light delay:** how long light takes to reach you from any compatible object.
- **Share and save:** exact links for object, camera, date, or chart. Saved places live in your browser, no account needed. Export a credited image card.
- **Quiet view:** hides panels and chrome for clean presentation.
- **Voice control** with Grok, and **WebXR** immersive VR.
- **Phone-ready:** bottom sheet, pinch-to-zoom, two-finger rotate.

## Quick start

Requirements: Node.js 22 or newer and npm. The smoke tests also need Chromium (`CHROMIUM=/path/to/chrome` if it is not on `PATH` as `chromium`).

```bash
npm install
npm run dev          # web app on http://localhost:5173, API server on :8787
```

The dataset in `public/data/` is committed, so the app works offline with no API keys or downloads.

For a demo laptop, use the production build:

```bash
npm run build && npm start    # http://localhost:8787
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server and API server together (Vite proxies `/api`) |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm start` | Serve `dist/` and the API from one process on `PORT` (default 8787) |
| `npm test` | Unit tests (projection, camera, transfers, travel modes, clock, search, dataset integrity) |
| `npm run typecheck` | TypeScript only |
| `npm run smoke` | Headless Chromium end-to-end checks against a running dev server (`BASE_URL`, `API_URL`). Add `-- --screenshots` to refresh `docs/screenshots/` |
| `npm run smoke:polish` | Public-UI checks for comparison, export, tours, sharing, sky chart, Quiet view, and phone and failure paths |
| `npm run data` | Re-download all sources, then rebuild the dataset ([docs/DATA.md](docs/DATA.md)) |
| `npm run data:build` | Rebuild the dataset from cached downloads in `data/raw/` (no network) |

## Optional: Grok features

The map, search, cards, routing, Play time, and WebXR need no credentials. Voice, read-aloud, dictation, and image generation need an xAI API key:

```bash
cp .env.example .env
# edit .env and set XAI_API_KEY=...
npm run dev
```

The key stays on the server. For voice, the server issues a short-lived (5-minute) client secret and the browser connects with that token only.

| Feature | How to use it | Endpoint |
| --- | --- | --- |
| **Voice control** | Press `M`, or use the mic button or "Talk to Grok" in Mission Control. Grok operates the app through validated tools only: search, routes, tours, zoom, layers, orbit, Play time, sharing, sky chart, comparisons, accessibility. The app computes every number; Grok explains it. | `/api/voice/session` |
| **Read-aloud** | Listen buttons or "Read replies aloud". Falls back to the browser voice. Adjust under Accessibility › Voice. | `/api/tts` |
| **Dictation** | Mission Control mic. Works in Firefox and Chromium builds without Google speech services. | `/api/stt` |
| **Grok Imagine** | Images section of a destination card. Generated from catalog facts only and labeled **AI reconstruction**. | `/api/imagine` |

The microphone needs HTTPS or localhost. Accessibility › Voice has a **Test microphone** meter. Endpoints are rate-limited per client per 10 minutes.

Without a key, the Guide panel gives clearly labeled **scripted explanations and map actions** built from each object's sourced summary.

## Deploying

The site is not static: `/api/*` runs as a Node server.

**Vercel** (mirror at galaxy-maps.vercel.app; the primary domain is [www.galaxies.wiki](https://www.galaxies.wiki)): `npm run build:vercel` produces Build Output API output, with the Vite build as static files and the Express app bundled into one function at `/api`. `vercel.json` already points at that command.

```bash
npm i -g vercel
vercel link
vercel env add XAI_API_KEY production     # optional; never commit it
vercel deploy --prod
```

The rate limiter is in memory, so on Vercel it applies per function instance rather than globally.

**Heroku:** a single Node web dyno. `Procfile` runs `npm start`, and the Node buildpack runs `npm run build`.

```bash
heroku create galaxymaps
heroku config:set XAI_API_KEY=...          # optional
git push heroku main
```

## Using the map

### Camera

- **Explore:** free pan, zoom, and orbit.
- **Locked:** entered when you pick an object or press Home. The object is the pivot. Dragging orbits with inertia, panning is disabled, and zoom goes toward the pivot. **Back to explore** restores your previous view.
- **Route:** frames a set of directions, with a button back to the destination.

Home is a locked close-up of a textured Earth. Regions (Solar System, Stars, Milky Way, Galaxies) are one click away, and the observable universe is shown as a schematic bubble with a logarithmic distance axis.

Two layers share positions, selections, and routes: **Realistic** and **Atlas**. The Milky Way is a procedural reconstruction from published spiral-arm models, not a photograph.

### Destination cards

Hero image with credit and license, one sourced summary sentence, 3–6 fact tiles, three "Why it's interesting" highlights, related destinations, and expandable Details, Images, and Sources sections. Actions: **Focus**, **Directions**, **Explore inside**, **Compare sizes**, **View from Earth**.

Explore inside Andromeda lists 21 features. There are 10 SpaceX and human-spaceflight cards (inclusion does not imply endorsement).

### Keyboard

| Key | Action |
| --- | --- |
| `/` | Focus search |
| `+` / `-` | Zoom in / out |
| Arrow keys | Orbit when locked, pan in Explore |
| `H` | Home (Earth close-up) |
| `R` | Reset view |
| `F` | Fit the current route |
| `L` | Toggle Realistic / Atlas |
| `M` | Start or end voice control |
| `D` | Directions to the selected place |
| `Space` | Play / pause time |
| `Esc` | Close the active dialog, or restore Quiet view, then menus, camera, and panels |

## WebXR (immersive VR)

**Enter VR** appears only when the browser reports `immersive-vr` support. The demo video was filmed on an **Apple Vision Pro**.

- **Look** with your head, **pinch** what you are looking at to fly there, pinch and drag to turn around it, spread two pinching hands to zoom. A Quest thumbstick does the same.
- **Hold your gaze** for about half a second to open details.
- **Voice:** hands-free. Only utterances that start with "Grok" are sent (for example, "Grok, take me to Saturn").
- Nearby objects stay on a true linear scale. Farther stars and galaxies keep their real directions with log-compressed depth.

Testing on a headset requires a secure context:

- **Quest over USB:** `npm run build && npm start`, then `adb reverse tcp:8787 tcp:8787` and open `http://localhost:8787` in the Quest browser.
- **Any headset on the network:** open [www.galaxies.wiki](https://www.galaxies.wiki), or put the production server behind an HTTPS tunnel or reverse proxy.

Current status and checklist: [docs/polish/xr-status.md](docs/polish/xr-status.md).

## Scientific model and assumptions

- **Positions:** Sun-centered ICRF coordinates in km (float64). Solar System bodies use NASA/JPL Horizons vectors for 2026-09-01 to 2027-03-01, interpolated by date. Outside that window, two-body orbits are used and marked approximate. Stars use HYG v4.4 or SIMBAD parallaxes. Galaxies use published redshift-independent distances.
- **Hohmann transfer:** circular, coplanar orbits with Horizons semi-major axes. `a = (r₁ + r₂)/2`, `t = π√(a³/μ☉)`. Earth → Mars is about 259 days, with alignment windows about 780 days apart. Not a launch-ready mission design.
- **Straight-line cruise:** `time = |destination − origin| / speed` in full 3D. Ignores acceleration, gravity, and target motion. Not a flight plan.
- **Parallaxes:** inverted only when the relative error is 20% or less. Otherwise the object stays searchable and the app explains why no route is offered.
- **Cosmology:** objects at cosmological redshift are searchable but not routable, since expansion makes a fixed-speed trip undefined.
- **Voyager 1 speed:** heliocentric speed from JPL Horizons on a stated date (16.92 km/s).
- **Display vs. physics:** markers are enlarged for visibility, which never affects distances.

## Catalog

- 919 catalog objects (374 featured), plus 109,389 HYG stars within 1,000 pc
- 126 highlights: Solar System 24, stars 16, compact objects 12, clusters 10, nebulae 18, galaxies 26, structures 6, missions 14
- 68 galaxies, 21 Andromeda features, 10 SpaceX and human-spaceflight cards
- 274 hero images, 479 gallery references, 65 source records ([content manifest](docs/polish/content-manifest.md))

## Limitations

- **Headsets.** Demoed on Apple Vision Pro. Meta Quest has not been tested, and GPU performance has not been profiled.
- **Live Grok untested in development.** The integrations follow the xAI docs, but no key was configured during development.
- **Ephemeris window.** Precise positions cover 2026-09-01 to 2027-03-01 only.
- **Images.** Gallery images come from each object's Wikipedia page. Images that don't mention the object are filtered out at build time.
- **Bundle size.** Three.js and the catalog UI exceed Vite's 500 kB advisory. See the [completion report](docs/COMPLETION-REPORT.md).

## Project layout

```
src/lib/        Pure, tested science modules: units, coords, physics, route, transfer, search, taxonomy
src/map/        Three.js map engine: projection, locked camera, labels, flights, sky, Milky Way
src/state/      Zustand store, actions, clock, menus, URL sync
src/ui/         React sidebar, cards, directions, map chrome
src/xr/         WebXR immersive-vr presentation
src/ai/         Validated tool layer, Grok Voice client, audio capture, offline scripted guide
server/         Express API (/api/status, voice, tts, stt, chat, imagine); serves dist/ in production
scripts/data/   Reproducible data pipeline (fetch → data/raw, build → public/data)
scripts/        smoke.ts (end-to-end checks), shot.ts (screenshots)
docs/           Architecture, data, demo script, completion report
```

More: [ARCHITECTURE](docs/ARCHITECTURE.md) · [DATA](docs/DATA.md) · [DEMO](docs/DEMO.md) · [COMPLETION-REPORT](docs/COMPLETION-REPORT.md)

## Data sources and credits

- NASA/JPL Horizons (DE441) for Solar System positions and spacecraft speeds; JPL SBDB for small bodies
- NASA Planetary Fact Sheets (NSSDCA) for planet facts
- HYG Database v4.4 by Astronexus (CC BY-SA 4.0) for star positions
- SIMBAD, CDS Strasbourg, for parallaxes, identifiers, and morphology
- NASA Exoplanet Archive for exoplanets
- Literature distances cited per card (for example GRAVITY Collaboration 2019 for Sgr A*)
- Solar System Scope textures (CC BY 4.0, based on NASA imagery); NASA SVS Deep Star Maps 2020 for the sky panorama
- Wikipedia and Wikimedia Commons for summaries (CC BY-SA 4.0) and images, with license and credit shown per image

GalaxyMaps is not affiliated with Google. The map-app interaction model is a familiar reference only. No Google imagery, logos, or interface assets are used.
