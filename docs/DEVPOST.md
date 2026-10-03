# Devpost copy

> Before submitting, review every sentence against the current build. If Grok Voice was not tested live with a key, keep the bracketed wording below as is; if it was, update it.

**Tagline:** Explore the universe through a familiar, interactive map.

## Inspiration

Space numbers don't land. "Polaris is 433 light-years away" is a fact nobody can feel. But everyone already knows how to read a map: search a place, tap Directions, compare driving with transit, see an ETA. We wondered what would happen if the universe had the same interface, built on real astronomical data rather than a pretty skybox.

## What it does

SpaceMaps is a continuously zoomable space atlas with a Google-Maps-style sidebar.

- **Explore one map from Earth to other galaxies.** Zoom from the Earth–Moon system through the planets, shown at their real positions for the selected date, out to 109,000 catalog stars, the Milky Way and the Local Group.
- **Search 618 objects.** Planets, moons, spacecraft, named stars, nebulae and galaxies, with typo-tolerant search.
- **Read destination cards.** Each card has sourced facts, a distance with its uncertainty and quality rating, a citation, exoplanets, and an image labeled "Observed image", "Scientific illustration" or "AI reconstruction".
- **Get directions.** Directions between any two supported objects use the true 3D distance and a constant-speed time.
  - Modes: light speed, real spacecraft speeds (Voyager 1, New Horizons, Parker Solar Probe, from JPL), a custom speed with relativistic onboard time below *c*, and, under "More", sci-fi ships and everyday comparisons. Fiction is labeled as fiction.
  - Earth → Polaris: 433 years at light speed, 7.7 million years at Voyager 1's speed.
- **Plan multi-stop trips.** Add up to 5 stops, reorder or remove them. Suggested stops are ranked by the extra distance they actually add, so "on the way" is computed, never guessed.
- **See why real rockets don't fly straight.** An idealized Earth → Mars Hohmann transfer (about 259 days) is animated with its assumptions shown.
- **Ask the guide.** Grok Voice can search the catalog, set routes, add stops and explain the journey, but only through validated tools. SpaceMaps computes every number. [Grok Voice and Grok Imagine are implemented against the xAI API; without an API key the app shows a clearly labeled offline scripted guide instead.]
- **Switch layers.** Realistic (planet textures and a star field) and Atlas (clean symbols and orbits) share the same positions and routes.

## How we built it

- **Frontend:** React 19 + TypeScript + Vite, with zustand for state. The map is a custom Three.js engine. Every position is a float64, Sun-centered ICRF coordinate in kilometres, projected relative to the camera each frame, so one view spans 6,000 km to 10²¹ km without precision loss. Planets are textured spheres; the 109k stars are a single batched point cloud colored by B−V temperature.
  - Labels declutter by priority.
  - The map plane blends from the ecliptic to the galactic plane as you zoom.
  - Camera flights use the van Wijk–Nuij "smooth zoom and pan" algorithm.
- **Data pipeline:** a reproducible TypeScript pipeline pulls from:
  - NASA/JPL Horizons (daily vectors and moon elements);
  - the NASA Planetary Fact Sheets;
  - HYG v4.4;
  - SIMBAD TAP (parallaxes with errors and bibcodes);
  - the NASA Exoplanet Archive TAP;
  - Wikipedia/Commons, with license filtering and imagery classification.

  It bundles everything into about 4.5 MB, so the demo doesn't depend on live APIs.
- **Science core:** pure, unit-tested modules for unit conversion, frame rotations, parallax assessment, Hermite ephemeris interpolation, Kepler propagation for moons, cruise times, special relativity, itinerary and detour evaluation, and the Hohmann transfer.
- **AI layer:** one validated tool layer (`searchObjects`, `setRoute`, `addStop`, `suggestStops`, `compareTravelModes`, …) shared by Grok Voice over the xAI realtime WebSocket and by an offline scripted guide. An Express server keeps the xAI key private and issues 5-minute ephemeral tokens to the browser.
- **Tools:** we built it with Cursor.

## Challenges we ran into

- **Scale.** One map from a few thousand kilometres to millions of light-years, about 17 orders of magnitude, broke naive float32 rendering and naive zoom animation. We moved all math to float64 camera-relative coordinates. We also found and fixed a catastrophic cancellation in the smooth-zoom formula that produced NaN camera positions on very long flights.
- **Honest distances.** Many star parallaxes are too uncertain to invert, and catalogs use sentinel values. Quasars at cosmological redshift don't have a single "distance" at all. We built explicit rules: no inversion above 20% parallax error, no routes to cosmological objects, and a quality label everywhere.
- **"On the way."** Our first stop suggestions recommended the Moon on the way to Polaris, which is technically almost zero detour and completely useless. Detours are now evaluated with cheapest insertion, and trivial stops are excluded.
- **Drawing the Milky Way from inside it.** Our first procedural spiral looked like concentric rings until we limited each arm to its published radial extent.

## Accomplishments that we're proud of

- **A familiar interface.** It feels like a mapping product, not a sci-fi dashboard: a first-time user can search, get directions and compare modes without explanation.
- **Sourced numbers.** Every number on screen traces back to a source or a deterministic calculation, and the assumptions are always one click away.
- **Seamless zoom.** The Earth → Milky Way zoom happens on one continuous map, with no page changes.
- **Testing.** 47 unit tests cover the physics and the dataset integrity, plus a headless browser smoke test of the main flows.

## What we learned

- How astronomers actually measure distance (parallax, Cepheids, the tip of the red giant branch) and why the error bars matter.
- Reference frames: ICRF, ecliptic and galactic coordinates, and TDB time.
- That an AI guide is much more trustworthy when it can't touch the numbers, only ask the app for them.
- Rendering tricks for extreme dynamic range.

## What's next

- Exercise and polish the live Grok Voice narration on more journeys.
- Gaia DR3 stars, with proper uncertainties, to replace HYG beyond 100 pc.
- Real mission trajectories from Horizons (Voyager's actual path) alongside the idealized transfer.
- A mobile layout and offline PWA install for classrooms.

## Built with

TypeScript, React, Vite, Three.js, zustand, Express, Node.js, Vitest, NASA/JPL Horizons API, SIMBAD TAP, NASA Exoplanet Archive TAP, HYG Database, Wikipedia/Wikimedia Commons APIs, xAI Grok Voice (realtime) API, xAI Grok Imagine API, Cursor.
