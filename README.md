# GalaxyMaps

**Directions across the universe, on a map that feels familiar.**

GalaxyMaps is a continuously zoomable 3D space atlas with a map-app interface. Search for a planet, star, nebula or galaxy, open an image-led destination card, lock the camera onto it and orbit it, then ask for directions. Planet-to-planet trips use an idealized Hohmann transfer orbit; everything else gets a straight-line cruise at light speed or at Voyager 1's measured speed. Every distance comes from a cited catalog, and every model assumption is shown in the interface.

Built for BigRed//Hacks 2026 (theme: Navigation).

![Home: locked on a textured Earth](docs/screenshots/desktop-home-earth.png)

## Quick start

Requirements: Node.js 22 or newer (tested with Node 26) and npm. The smoke test also needs Chromium (`CHROMIUM=/path/to/chrome` if it is not on `PATH` as `chromium`).

```bash
npm install
npm run dev          # web app on http://localhost:5173, API server on :8787
```

The bundled dataset in `public/data/` is committed, so the app works offline without API keys or data downloads.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server and API server together (Vite proxies `/api`) |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm start` | Serve `dist/` and the API from one process on `PORT` (default 8787) |
| `npm test` | Unit tests (projection and locked camera, transfer and travel modes, clock, schematic universe, taxonomy and search, dataset integrity) |
| `npm run typecheck` | TypeScript only |
| `npm run smoke` | Headless Chromium end-to-end checks against a running dev server (`BASE_URL`, default `http://localhost:5173`; `API_URL`, default `http://localhost:8787`). Add `-- --screenshots` to refresh `docs/screenshots/` |
| `npm run data` | Re-download all sources, then rebuild the dataset (see [docs/DATA.md](docs/DATA.md)) |
| `npm run data:build` | Rebuild the dataset from the cached raw downloads in `data/raw/` (no network) |

For a demo laptop, prefer the production build: `npm run build && npm start`, then open http://localhost:8787 (run the smoke test against it with `BASE_URL=http://localhost:8787`).

## Credentials (optional)

No credentials are needed for the map, search, browsing, cards, routing, Play time or WebXR.

Grok features need an xAI API key:

```bash
cp .env.example .env
# edit .env and set XAI_API_KEY=...
npm run dev
```

- The key stays on the server. For Grok Voice, the server requests a short-lived (5-minute) client secret from `POST https://api.x.ai/v1/realtime/client_secrets`, and the browser opens the realtime WebSocket with that token only.
- **Grok Voice** ("Talk to Grok" in the Guide panel) can only call GalaxyMaps' validated tools (search the catalog, show an object, set a route, add a stop, compare travel modes, explain the journey, suggest stops). The app computes every number; Grok explains it.
- **Grok Imagine** (Images section of a destination card) generates an image from catalog facts only, labeled **AI reconstruction**, never presented as an observation. Static catalog summaries are never labeled as AI.
- The server rate-limits both endpoints (30 voice sessions and 10 images per 10 minutes).

Without a key, the Guide panel says so and falls back to an **offline scripted guide** that calls the same validated tools, labeled "Offline guide (scripted)".

## What you can do

### Map and camera

- **Three camera framings.**
  - **Explore**: free pan, zoom and orbit.
  - **Locked**: entered whenever you pick an object (search, map click, Focus, a related card) or press Home. The object's centre becomes the pivot, centred in the part of the map not covered by panels. Dragging orbits with inertia and pitch limits; every form of panning (mouse, keyboard arrows, two-finger drag) is disabled; zoom goes toward the pivot within limits. A "Locked on X" bar offers **Reset view** and **Back to explore**, which restores the view you had before locking.
  - **Route**: framing a set of directions, with a button back to the destination's lock.
- **Home** is a close-up of a textured Earth (day, night lights, clouds), locked.
- **Regions**: grouped pills with dropdowns (Solar System, Stars, Milky Way, Galaxies) plus an overflow menu. The Galaxies group includes Andromeda, the Local Group, nearby galaxies and the Virgo Cluster region.
- **Observable universe**: a transparent bubble with a ~46-billion-light-year comoving radius, labelled "Schematic overview — logarithmic distance", with distance bands instead of a linear scale bar. Its dots are selected catalog objects, not every galaxy. Picking works through the boundary, and selecting an object returns you to its local frame.
- **Rendering**: textured spheres with IAU rotation, Saturn's rings, distinct symbols for black holes, neutron stars, white dwarfs, quasars, clusters and groups, schematic sprites for nebulae and galaxies (galaxies drawn as discs at their catalogued position angle and axis ratio), label collision avoidance, a panoramic sky behind locked objects, and labels and orbits that fade while locked. Two layers share positions, selections and routes: **Realistic** and **Atlas**.
- **Milky Way**: a procedural reconstruction from published spiral-arm models, labelled "Milky Way (reconstruction)", not a photograph.

### Search and browse

- **Search** 919 catalog objects (fuzzy and typo-tolerant across names, aliases, catalog IDs and type words, e.g. "betelgeuze", "M31", "black hole"), plus 109,389 HYG star points. Results show thumbnails and distances. The search box is an ARIA combobox.
- **Browse categories**: a nested tree (eight top-level groups) with real counts. Choosing a category shows a filter chip, emphasizes matching markers on the map, and limits search to that category. Empty categories say "none yet" instead of padding the list.
- Search is entirely local; no online search provider is queried, so there is nothing to debounce or rate-limit.

### Destination cards

- Hero image with an imagery label (Observed image, Scientific illustration, AI reconstruction) and credit/license, plus a gallery and lightbox.
- Name, alternate name, type, parent and category; one sourced summary sentence; 3–6 fact tiles, with a correctly referenced distance first ("Distance from Earth: 0 km · you are here" on Earth; "From Earth on {date}" in the Solar System).
- Actions: **Focus**, **Directions**, **Explore inside** (galaxies, planets with moons, groups) and **View images**.
- Three "Why it's interesting" highlights, related destinations and missions, and expandable **Details**, **Images** and **Sources** sections.
- **Explore inside Andromeda** lists 21 features (companion galaxies, the M31* nucleus, globular clusters, novae, a supernova) with breadcrumbs Universe › Local Group › Andromeda Galaxy.
- **SpaceX and human spaceflight**: 10 cards (Falcon 9, Falcon Heavy, Dragon, Starship, Crew Dragon Demo-2, Inspiration4, Polaris Dawn, the Tesla Roadster, the ISS and Apollo 11), with status and operator. A disclaimer on each says inclusion does not imply endorsement.

### Directions

- **Planet pairs** (for example Earth → Mars): the primary result is an **idealized Hohmann transfer**, about 259 days (shown as "8.5 months") for Earth → Mars, with the next alignment window, departure and arrival dates, Δv and the synodic period. The transfer arc is drawn on the map and can be previewed on its own clock, which pauses Play time. A separate **speed comparison** gives the direct-distance benchmark on the map date.
- **Everything else**: a straight-line cruise with the model outputs spelled out.
- **Travel mode** is a dropdown with exactly two options: **Light speed** and **Voyager 1** (its measured heliocentric speed from JPL Horizons).
- Multi-stop journeys (up to 5 stops) with suggested stops ranked by extra distance.

### Play time

- Play/Pause, Reset and rate presets (1 hour, day, week, month or year per second). The clock starts paused.
- It pauses while you drag, zoom or search and resumes after about 1.2 s of idle if it is still armed. It also pauses when the page is hidden.
- Planets move and spin; a locked moving body stays centred. Reduced-motion preferences are respected.
- Outside the bundled ephemeris window (2026-09-01 to 2027-03-01), positions fall back to two-body orbits, and the time bar marks them as approximate.

### Phone

Floating search at the top, a bottom sheet with collapsed, half and full states, safe-area insets, and pinch-to-zoom and two-finger rotate. The locked object stays centred above the sheet.

### WebXR (immersive VR)

- **Enter VR** appears only when `navigator.xr.isSessionSupported("immersive-vr")` resolves true, and the session starts from a user gesture.
- The scene places the focused object 1.6 m ahead, with related destinations on a ring, a spatial card built from the same record as the page card, and a control bar (Focus, Next, Smaller, Larger, Recenter, Exit VR).
- Selection uses `select` events from any input source, including visionOS transient pointers. The app never writes the viewer pose; Recenter moves the content, not the user.
- Phone and XR load the 2k sky texture and low-resolution Earth materials.
- **Headset validation pending**: the code paths are typechecked and the 2D app is tested, but no physical headset was available.

**Testing on a headset.** WebXR requires a secure context:

- **Quest over USB**: run `npm run build && npm start`, then `adb reverse tcp:8787 tcp:8787`, and open `http://localhost:8787` in the Quest browser (localhost counts as secure).
- **Any headset on the network**: put the production server behind a trusted HTTPS endpoint you control, such as a tunnel or reverse proxy with a valid certificate, and open that URL. No public deployment exists for this project; use your own.

### Keyboard

| Key | Action |
| --- | --- |
| `/` | Focus search |
| `+` / `-` | Zoom in / out (toward the pivot when locked) |
| Arrow keys | Orbit when locked, pan in Explore |
| `H` | Home (Earth close-up, locked) |
| `R` | Reset view |
| `F` | Fit the current route |
| `L` | Toggle Realistic / Atlas layer |
| `D` | Directions (to the selected place) |
| `Space` | Play / pause time |
| `Esc` | Close menus first, then leave the lock or route framing, then close panels |

## Scientific model and assumptions

- **Positions.**
  - Frame: Sun-centered ICRF coordinates in kilometres (float64).
  - Solar System bodies: NASA/JPL Horizons vectors for 2026-09-01 to 2027-03-01, interpolated by date. Moons use osculating elements relative to their planet. Outside the window, two-body orbits are used and marked approximate.
  - Stars: HYG v4.4 coordinates, or SIMBAD parallaxes and literature distances for featured stars.
  - Galaxies: published redshift-independent distances. Galaxy features have measured sky positions but unmeasured depth, and the Explore-inside view says so.
- **Hohmann transfer (planet pairs).** Circular, coplanar orbits with radii equal to the Horizons semi-major axes: `a = (r₁ + r₂)/2`, `t = π√(a³/μ☉)`. Earth → Mars: about 259 days; alignment windows about 780 days apart. It is not a launch-ready mission design.
- **Straight-line cruise (everything else).** `distance = |destination − origin|` in full 3D and `time = distance / speed`. It ignores acceleration, gravity and target motion. It is not a flight plan.
- **Parallaxes.** A parallax is inverted only when its relative error is ≤ 20%. Otherwise the object stays searchable and explains why no route is offered (for example Alnilam, at 27%).
- **Cosmology.** Objects at cosmological redshift are searchable but not routable: expansion makes a fixed-speed trip undefined. The observable-universe view is schematic, with a logarithmic distance axis.
- **Voyager 1 speed.** Heliocentric speed from JPL Horizons on a stated date (16.92 km/s). A spacecraft has no single travel speed, and the UI says so.
- **Display vs. physics.** Markers are enlarged for visibility; this never affects distances. The map plane blends from the ecliptic (Solar System) to the galactic plane.

## Catalog (as built)

From `npm run data:build`:

- 919 catalog objects, of which 374 are featured destinations, plus 109,389 HYG stars within 1,000 pc.
- 126 highlights: Solar System 24, stars 16, compact objects 12, clusters 10, nebulae 18, galaxies 26, structures 6, missions 14.
- 68 galaxies, 21 Andromeda features, 10 SpaceX and human-spaceflight cards.

## Limitations

- **Headset validation pending.** WebXR has not been run on a physical headset.
- **Live Grok untested here.** The Grok Voice and Imagine integrations follow the xAI documentation, but no key was configured during development.
- **Ephemeris window.** Precise positions cover 2026-09-01 to 2027-03-01; outside it, two-body orbits are approximate.
- **Images.** Gallery images come from each object's Wikipedia page. Images that don't mention the object are filtered out at build time, which removes images from navigation templates.
- **Bundle size.** The JS bundle is about 970 kB (about 270 kB gzipped).

## Project layout

```
src/lib/        Pure, tested science modules: units, coords, physics, route, transfer, transport, search, taxonomy
src/map/        Three.js map engine (projection, locked camera, labels, flights, sky, Milky Way, universe schematic)
src/state/      Zustand store, actions, clock, menus, URL sync
src/ui/         React sidebar, cards, directions, map chrome
src/xr/         WebXR immersive-vr presentation
src/ai/         Validated tool layer, Grok Voice client, offline scripted guide
server/         Express: /api/status, /api/voice/session, /api/imagine; serves dist/ in production
scripts/data/   Reproducible data pipeline (fetch → data/raw, build → public/data)
scripts/        smoke.ts (end-to-end checks), shot.ts (one-off screenshots)
docs/           Architecture, data, demo script, completion report
```

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA.md](docs/DATA.md), [docs/DEMO.md](docs/DEMO.md), [docs/COMPLETION-REPORT.md](docs/COMPLETION-REPORT.md).

## Data sources and credits

- NASA/JPL Horizons (DE441) for Solar System positions and spacecraft speeds; JPL SBDB for small bodies.
- NASA Planetary Fact Sheets (NSSDCA) for planet facts.
- HYG Database v4.4 by Astronexus (CC BY-SA 4.0) for star positions.
- SIMBAD, CDS Strasbourg, for parallaxes, identifiers and morphology.
- NASA Exoplanet Archive (Planetary Systems Composite Parameters) for exoplanets.
- Literature distances cited per card (for example GRAVITY Collaboration 2019 for Sgr A*, Pietrzyński et al. 2019 for the LMC).
- Solar System Scope textures (CC BY 4.0, based on NASA imagery); NASA SVS Deep Star Maps 2020 for the sky panorama.
- Wikipedia and Wikimedia Commons for summaries (CC BY-SA 4.0) and images; license and credit are shown per image.

GalaxyMaps is not affiliated with Google. The map-app interaction model is a familiar reference only; no Google imagery, logos or interface assets are used.
