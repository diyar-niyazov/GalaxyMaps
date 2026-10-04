# GalaxyMaps architecture and stable interfaces

This document is the contract between the four work areas: UI, map, data/physics, and voice/content. If you change one of the interfaces below, update this file in the same commit.

```
public/data/*  ──loadBundle()──▶  DataBundle ──▶ zustand store (src/state/store.ts)
                                                │            │
                                   React panels ◀┘            └▶ EngineSync ──▶ MapEngine (Three.js)
                                        │                                         │
                          src/ai/tools.ts (validated) ◀── Grok Voice / offline guide
                                        │
                              src/lib/* pure science modules (no DOM, unit tested)
```

## 1. Data bundle (data area owns)

`npm run data:build` writes four files to `public/data/`; the app loads them with `loadBundle()` in `src/data/bundle.ts`.

The builder and loader both apply the idempotent `applyEditorialAssets` overlay for audited local NASA/EHT photographs; metadata and credits stay with their actual catalog records. Essential data requests have bounded timeouts; optional star names may fail without blocking core exploration.

| File | Contents |
| --- | --- |
| `catalog.json` | `Catalog`: `objects: CatalogObject[]`, `sources: Record<id, SourceInfo>`, `speedReferences`, `stars` metadata |
| `ephemeris.json` | `Ephemeris`: daily ICRF state vectors per body (cubic Hermite interpolation), satellite osculating elements, orbit elements for drawing |
| `stars.bin` | `Float32Array`, 8 columns per star: `x_pc, y_pc, z_pc, absmag, ci, mag, hyg_id, hip` (ICRF, Sun-centered, parsecs) |
| `star-names.json` | `hyg_id → [label, spectral type, constellation]` for stars without a catalog card |

The types live in `src/lib/types.ts`. Key rules:

- Every `CatalogObject` has a stable `id` (kebab-case, e.g. `polaris`, `alpha-centauri-a`, `hyg-12345` for point-cloud stars). These IDs appear in URLs and AI tool calls, so never rename one without a redirect.
- `position` is either `{kind: "static", frame: "ICRF", origin: "Sun", unit: "km", xyz}` or `{kind: "ephemeris", key}`. Use `positionOf(obj, {eph, jdTdb})` from `src/lib/route.ts`; never read `xyz` directly for moving bodies.
- `distance` is informational (distance from the Sun with uncertainty, quality, `sourceId`, optional `bibcode`). Routes always use positions, never `distance`.
- `route` is `{supported: true, quality}` or `{supported: false, reason}`. The UI and AI must surface `reason` verbatim instead of computing a route.
- `image.kind` is one of `observed | illustration | ai-reconstruction | texture`. The UI maps these to the labels "Observed image", "Scientific illustration" and "AI reconstruction".
- Every `Fact` should carry a `sourceId` that exists in `catalog.sources`. `src/lib/dataset.test.ts` enforces source integrity.

## 2. Science modules (data/physics area owns)

All of these are pure TypeScript with no DOM access, covered by `src/lib/science.test.ts` and `src/lib/dataset.test.ts`.

| Module | Main exports |
| --- | --- |
| `units.ts` | `C_KM_S`, `AU_KM`, `LY_KM`, `PC_KM`, `jdTdb(date)`, `dateFromJdTdb(jd)` |
| `coords.ts` | ICRF↔ecliptic/galactic matrices, `cartesianFromRaDecDistance`, `assessParallax(plx, err)` (rejects relative error > 20%), `isValidHygDistance` |
| `ephemeris.ts` | `ephemerisPosition(eph, key, jd)`, `clampJd` |
| `physics.ts` | `cruise(distanceKm, speedKmS)`, `separationKm(a, b)`, `properTime(t, v)` (returns `{ok: false}` unless 0 < v < c) |
| `itinerary.ts` | `computeItinerary(positions, speed)`, `evaluateDetour(positions, candidate)` (cheapest insertion), `isOnTheWay(detour, 0.05)` |
| `route.ts` | `positionOf(obj, ctx)`, `computeRoute(stops, mode, ctx): RouteResult` |
| `transport.ts` | `TransportMode`, `travelModes(speedRefs)` (exactly Light speed and Voyager 1) |
| `transfer.ts` | `hohmann(r1, r2)`, `hohmannState(h, t)` |
| `search.ts` | `buildSearchIndex(objects)`, `search(index, q, limit)`, `resolveOne(index, q)` |
| `format.ts` | `formatDistance`, `formatDuration`, `formatSpeed`, `formatUncertainty`, `durationContext` |
| `comparison.ts` | audited diameter conversion, uncertainty, eligibility, ratio and verified presets |
| `earthSky.ts` | Earth-relative direction, stereographic projection, HYG brightness/sky neighbors and coordinate formatting |
| `learning.ts` | compatible physical proximity, geometric/cosmological light delay and sourced selected-object context |

`RouteResult` is a discriminated success/error union. Success identifies `kind` (orbital transfer or straight-line cruise), `modeledSeconds`, compatible positions/legs and a separately labeled direct-distance `comparison`. Transfer results contain the defined Hohmann scenario; unsupported pairs carry a reason.

## 3. App state (UI area owns)

`useStore` in `src/state/store.ts` (zustand). Components read state with selectors and change it only through the actions.

- **State:**
  - `data`, `jd` (TDB Julian date), `layer` (`"realistic" | "atlas"`)
  - `panel` (`"explore" | "place" | "directions" | "guide"`), `selectedId`
  - `stops: (string | null)[]` (2–5 entries, `MAX_STOPS = 5`), `modeId` (`light` / `voyager-1`), `routeModel`
  - `playing`, `progress` (0–1), `playbackSeconds`, `time`, `orbitCamera`, `camera`, `tilt`, `viewInfo`, `guide` messages, `fitRequest`
- **Actions:**
  - Panels and selection: `select(id)`, `openDirections(dest?, origin?)`, `setPanel`, `setLayer`
  - Stops: `setStop(i, id)`, `swapStops()`, `addStop(id, at?)`, `removeStop(i)`, `moveStop(i, ±1)`
  - Modes: `setMode(id)`, `setRouteModel`, with separate preview, simulation and camera-orbit controls
  - Playback and view: `setPlaying`, `setProgress`, `requestFit()`
  - Guide: `pushGuide`
- **Derived selectors** (`src/state/selectors.ts`): `useModes()` (Light speed and Voyager 1), `useMode()`, `useStopObjects()`, `useRoute()`, and the non-hook `routeFor(data, stops, mode, jd)`.
- **Focused experience:** selectors give sky/comparison precedence over the underlying Explore/Locked/Route camera. Tour/story state uses these same scenes. Entering comparison/sky pauses both clocks and camera orbit; Back restores a snapshot.
- **URL sync** (`src/state/urlState.ts`): version2 validates finite bounded camera/date/route state plus comparison, tour stop or sky direction. Locked camera centers are relative to a stable `anchorId`; the loader resolves the physical pivot at the shared epoch. Legacy place/route/region links still load. Browser Back/Forward and in-app Back use the destination URL when a snapshot is unavailable, including after reload or a jump past the bounded cache.
- **Navigation:** `captureView` uses the engine's actual rendered date, then records selection, panel, layer, route, camera and sheet. History is bounded to24 snapshots. Restoring a route updates reset targets without changing its saved pose.
- **Small stores:** `comparison`, `discovery`, `earthSky`, `library` and `finishing` own their focused UI. Library storage holds stable IDs and preferences (100 favorites,20 recent) under `galaxymaps.library.v1`; malformed data or denied storage leaves the session usable.

## 4. Map engine (map area owns)

`MapEngine` in `src/map/MapEngine.ts` is an imperative Three.js renderer. React never touches it directly except through `src/map/EngineSync.tsx`, which pushes store state into it, and `getEngine()` for camera commands.

```ts
new MapEngine(container, data, jd, { onViewChange(info: ViewInfo), onPick(target: PickTarget | null), onHover? })
setLayer(layer) · setJd(jd) · setSelection(id) · setRoute({ids, positions} | null) · setPlayback(progress | null)
setTilt(rad) · setAutoOrbit(on) · setInsets(insets) · setPaused(paused)
focus(id) · lockOn(id, pose?) · unlock() · homeEarth(instant?) · frameRoute(points)
flyTo({center, widthKm, tilt?}, instant?) · restoreView(view, mode, lockedId) · fitPoints(points, pad?)
zoomBy(factor) · panBy(dx, dy) · orbitBy(heading, tilt) · getJd() · getObjectPosition(id) · getViewport() · dispose()
```

- **Rendering model:**
  - All positions are float64 ICRF km. Each frame projects them relative to the camera center into pixel space, so there is no float32 precision loss from Earth scale to Mpc scale.
  - The camera is orthographic over a pixel-space scene. An SVG layer draws orbits and routes, and DOM labels are decluttered by priority.
- **Plane:** the map plane blends from the ecliptic to the galactic plane between 150 and 3000 pc (`plane` in `ViewInfo`).
- **Camera flights:** van Wijk–Nuij smooth zoom/pan (`src/map/flight.ts`), 0.7–4.2 s, instant under `prefers-reduced-motion`.
- **Presets:** grouped region targets are in `src/map/presets.ts` (`REGION_PRESETS`, `REGION_GROUPS`); Home frames Earth separately.
- **Milky Way:** the disk is a procedural model in `src/map/milkyWay.ts` (bar, bulge, four major arms and the Local Arm). It is labeled as an illustration and never used for coordinates.
- **Lifetime:** map input listeners belong to an AbortController, layout/hover/zoom timers are canceled on teardown, and late texture callbacks dispose rather than update a dead scene. Earth shader textures have explicit material ownership. Galleries and source dialogs isolate keyboard focus from map shortcuts.
- **Earth sky:** a modal2D canvas inside the shared app, with an inert underlying sidebar and isolated controls. Angular sky neighbors are distinct from physical nearby destinations; no local horizon is inferred.
- **WebXR:** a lazily loaded spatial presentation reuses the renderer and catalog. `ImmersiveEntry` owns acquired sessions across lazy-import/startup failures; teardown restores renderer state after runtime/Three end handlers. The runtime owns head pose. Spatial browse/tour selection commits on ordinary-page return. Device acceptance and supported controls are documented in [XR status](polish/xr-status.md).

## 5. AI tools (voice/content area owns)

`src/ai/tools.ts` is the only way an AI, live or scripted, can read data or change state.

| Tool | Arguments | Effect / result |
| --- | --- | --- |
| `searchObjects` | `query` | Up to 6 catalog matches: id, name, type, routable, distance from the Sun |
| `getObjectDetails` | `id` | Sourced facts, distance + quality + uncertainty + source, route availability |
| `showObject` | `id` | Selects the object and flies the camera to it |
| `setRoute` | `originId`, `destinationId`, `mode?` | Sets a 2-stop journey; returns the computed summary |
| `addStop` | `objectId` | Inserts the stop at the cheapest position; returns the added distance and whether it is "on the way" (≤ 5%) |
| `compareTravelModes` | none | The current journey's time in every mode |
| `explainCurrentJourney` | none | The computed summary of the current journey |
| `suggestStops` | `limit?` (1–5) | Featured objects ranked by evaluated detour cost |
| `recommendDestinations` | `feature` (`rings`, `exoplanets`, `nearby-stars`, `galaxies`, `nebulae`, `spacecraft`, `moons`, `black-holes`) | Catalog-derived list |

`runTool(name, args)` validates every ID against the catalog, every mode against `MODE_IDS`, and every numeric range. It returns `{error}` instead of throwing to the model, so the model can recover. Numbers in results are pre-formatted by the app; the voice instructions tell Grok to quote them, not compute them.

- **Live:** `src/ai/grokVoice.ts` (`GrokVoiceSession`) fetches an ephemeral token from `/api/voice/session` and opens `wss://api.x.ai/v1/realtime`. It sends `session.update` with the tool definitions, streams 24 kHz PCM16 microphone audio, plays audio deltas, executes function calls through `runTool`, and returns `function_call_output` followed by `response.create`.
- **Offline:** `src/ai/offlineGuide.ts` (`offlineReply(text)`) matches keywords and regexes to the same tools. It is always labeled "Offline guide (scripted)".

## 6. Server

`server/index.ts` (Express 5):

| Route | Purpose |
| --- | --- |
| `GET /api/status` | `{grok: {configured, voiceModel, imageModel}, catalog}`; never reveals the key |
| `POST /api/voice/session` | 503 without `XAI_API_KEY`; otherwise returns a 300-second xAI client secret |
| `POST /api/imagine` | `{objectId}` for a featured object → Grok Imagine image built from catalog facts (`server/imaginePrompt.ts`); cached in memory |

In production (`npm start`) it also serves `dist/` with an SPA fallback.

## Conventions

- New destinations go in `scripts/data/config.ts` with a cited distance source. Then run `npm run data:build` and `npm test`.
- Travel choices stay exactly Light speed and Voyager 1; editorial spacecraft content does not introduce a universal rocket speed.
- Do not put numbers into UI copy or AI prompts by hand; derive them from the catalog or the science modules.
