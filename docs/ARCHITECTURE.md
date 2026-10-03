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
| `transport.ts` | `TransportMode`, `allModes(speedRefs, customKmS, fictional)`, `customSpeedKmS(value, unit)` (null if ≤ 0 or > c) |
| `transfer.ts` | `hohmann(r1, r2)`, `hohmannState(h, t)` |
| `search.ts` | `buildSearchIndex(objects)`, `search(index, q, limit)`, `resolveOne(index, q)` |
| `format.ts` | `formatDistance`, `formatDuration`, `formatSpeed`, `formatUncertainty`, `durationContext` |

`RouteResult` is either `{ok: true, stops, positions, legs, totalKm, totalSeconds, totalSigmaKm, mode, proper, quality, notes}` or `{ok: false, error, objectId?}`.

## 3. App state (UI area owns)

`useStore` in `src/state/store.ts` (zustand). Components read state with selectors and change it only through the actions.

- **State:**
  - `data`, `jd` (TDB Julian date), `layer` (`"realistic" | "atlas"`)
  - `panel` (`"explore" | "place" | "directions" | "guide" | "transfer"`), `selectedId`
  - `stops: (string | null)[]` (2–5 entries, `MAX_STOPS = 5`), `modeId`, `custom`, `fictional`
  - `playing`, `progress` (0–1), `playbackSeconds`, `tilt`, `viewInfo`, `guide` messages, `transfer`, `fitRequest`
- **Actions:**
  - Panels and selection: `select(id)`, `openDirections(dest?, origin?)`, `setPanel`, `setLayer`
  - Stops: `setStop(i, id)`, `swapStops()`, `addStop(id, at?)`, `removeStop(i)`, `moveStop(i, ±1)`
  - Modes: `setMode(id)`, `setCustom`, `setFictional`
  - Playback and view: `setPlaying`, `setProgress`, `requestFit()`
  - Guide: `pushGuide`
- **Derived selectors** (`src/state/selectors.ts`): `useModes()` (Light speed and Voyager 1), `useMode()`, `useStopObjects()`, `useRoute()`, and the non-hook `routeFor(data, stops, mode, jd)`.
- **URL sync** (`src/state/urlState.ts`): `route`, `mode`, `place`, `panel` (`transfer`/`guide`), `layer`, and `view` (scale preset id) are read once on load and written with `history.replaceState`.

## 4. Map engine (map area owns)

`MapEngine` in `src/map/MapEngine.ts` is an imperative Three.js renderer. React never touches it directly except through `src/map/EngineSync.tsx`, which pushes store state into it, and `getEngine()` for camera commands.

```ts
new MapEngine(container, data, jd, { onViewChange(info: ViewInfo), onPick(target: PickTarget | null), onHover? })
setLayer(layer) · setJd(jd) · setSelection(id) · setRoute({ids, positions} | null) · setPlayback(progress | null)
setScenario(hohmannScenario | null) · setTilt(rad)
flyTo({center, widthKm, tilt?}, instant?) · flyToObject(id, widthKm?) · fitPoints(points, pad?)
zoomBy(factor) · panBy(dx, dy) · getObjectPosition(id) · getViewport() · dispose()
```

- **Rendering model:**
  - All positions are float64 ICRF km. Each frame projects them relative to the camera center into pixel space, so there is no float32 precision loss from Earth scale to Mpc scale.
  - The camera is orthographic over a pixel-space scene. An SVG layer draws orbits and routes, and DOM labels are decluttered by priority.
- **Plane:** the map plane blends from the ecliptic to the galactic plane between 150 and 3000 pc (`plane` in `ViewInfo`).
- **Camera flights:** van Wijk–Nuij smooth zoom/pan (`src/map/flight.ts`), 0.7–4.2 s, instant under `prefers-reduced-motion`.
- **Presets:** scale presets are in `src/map/presets.ts` (`SCALE_PRESETS`, `HOME_PRESET`).
- **Milky Way:** the disk is a procedural model in `src/map/milkyWay.ts` (bar, bulge, four major arms and the Local Arm). It is labeled as an illustration and never used for coordinates.

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
- New transport modes go in `src/lib/transport.ts`. Give each one a `kind` (`measured`, `assumption`, `fictional`, …) so the UI can label it.
- Do not put numbers into UI copy or AI prompts by hand; derive them from the catalog or the science modules.
