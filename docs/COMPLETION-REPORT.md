# GalaxyMaps final polish: implementation and verification

> Historical report: generated browser screenshots and JSON reports are no longer tracked. [View the original evidence](https://github.com/diyar-niyazov/GalaxyMaps/tree/8a0e967f5423d9164f958f5b47f6eec3b6b307a7/docs/screenshots). Running `npm run smoke:polish` creates fresh ignored files in `docs/screenshots/`.

Implemented the selected scope in `GalaxyMaps-Final-Polish-Cursor-Prompt.md` in the existing React/TypeScript/Three.js app. Work proceeded through three phases with delegated file ownership and independent review. The original branding, light navigation panel, astronomical calculations and continuous map remain in use.

No public deployment or HTTPS headset URL exists in this workspace. Verification uses the built app at **http://localhost:8788** and development app at **http://localhost:5174** (5173 was occupied). Normal production startup defaults to 8787.

## Checks on 2026-10-03

| Check | Result |
| --- | --- |
| Unit tests | **165/165 passed** in 20 files, including rejected spatial Exit, renderer restoration and galaxy viewing geometry |
| Typecheck and production build | Passed; main JS 1,071.13 kB / 304.82 kB gzip, CSS 72.91 kB / 15.38 kB gzip, lazy XR 11.20 kB / 4.55 kB gzip |
| Foundation development browser suite | **17/17 passed** |
| Phase B public-UI browser gate | **16/16 passed**; [polish-results-phase-b.json](https://github.com/diyar-niyazov/GalaxyMaps/blob/8a0e967f5423d9164f958f5b47f6eec3b6b307a7/docs/screenshots/polish-results-phase-b.json) |
| Final built-app public-UI browser gate | **25/25 checks resolved** across the full run and clean focused rerun; original reports and run provenance are retained in [polish-results.json](https://github.com/diyar-niyazov/GalaxyMaps/blob/8a0e967f5423d9164f958f5b47f6eec3b6b307a7/docs/screenshots/polish-results.json) |
| Dataset build from cached raw data | Passed, without new network downloads |
| Whitespace check | Clean |

Browser evidence uses Chromium with SwiftShader software rendering at 1440×900 and 390×844 phone emulation. Actual screenshots, real input, focus and paint hit-testing are inspected. Emulation is not a physical phone test. Independent review checked exact sky Back/focus, phone overlay controls, Quiet-tour Escape recovery, contextual guide answers, resource ownership and browser history after reload. Physical headset/simulator acceptance and live Grok remain pending.

The first production run passed 23/25 checks. Two sky-chart pixel-identity checks differed through canvas rasterization while numerical view state matched. A clean 9/9 focused run verified exact public target/center/field/date, perceptual chart agreement and actual controls; the original 23/25 and focused reports remain available. Final visual review also caught an unsuitable spherical nebula proxy; matching projected observations and explicit illustration labels now distinguish extended objects from spherical bodies.

Affected imagery checks then passed 9/9 and final scene/label checks passed 3/3, with both reports retained. A final production Chromium check on `index-Vu8OcNyo.js` verified wrapped Time controls have a 12 px gap from Back/Share/Quiet (`finishBottom=760`, `timeTop=772`) and the source popover's final Plane text is painted above other controls. Evidence: [polish-wrapped-map-controls.png](https://github.com/diyar-niyazov/GalaxyMaps/blob/8a0e967f5423d9164f958f5b47f6eec3b6b307a7/docs/screenshots/polish-wrapped-map-controls.png). The final source/layout change does not alter astronomy, sharing or tour state.

Galaxy finishing preserves morphology: only spiral/barred/lenticular reconstructions use inclined discs; elliptical/irregular sprites remain camera-facing. Initial galaxy inspection uses the Sun-facing direction so catalog axis ratios are legible. An independent review and the geometry regression test verify the camera rotation; explicit shared-view orientation remains authoritative.

The final built-app Andromeda rerun passed 2/2 on `index-CBIiEIQe.js`, with all five stops intact and corrected first/last screenshots. Independent Phase C review approved the source and actual desktop/phone evidence; no blocking defect remains in the tested ordinary-page flows.

The final browser suite covers truthful comparisons, extreme ratios/insets, Fit both, swapping and actual PNG download; fresh comparison/sky links and clipboard denial; all 24 stops across four tours and the story; Previous/Next/Pause/Resume/jump/return; nonrepeating Surprise picks; saved-place persistence; exact route pose/model/endpoints and Reset/Fit; reload/Back history; sky drag/keyboard/zoom/recenter/Back; Quiet view; physical nearby versus related learning; phone comparison/tours/directions/sky; and blocked-image recovery.

## Implemented experience

**Foundation:** Earth deliberately fills the usable map; Saturn's pose reveals its rings. The panorama is quieter, labels retain selection/endpoints and physical positions stay separate from display sizing. Galaxies use explicitly schematic catalog-morphology reconstructions; eligible nebulae, remnants, clusters and EHT black holes use matching projected observations with visible-image provenance. Spherical body fallbacks are labeled illustrations. Search/categories, galaxy interiors and the schematic observable universe remain available. Native gallery dialogs isolate keyboard focus. Preview, simulation and camera orbit have separate clocks with bounded elapsed time and visibility handling.

**Discovery loop:** audited planet/moon/star comparisons use one truthful scale, a labeled magnification inset, explicit independent Fit both scales, presets, provenance, swap, sharing and export. Surprise me has Beautiful, Strange and supported physical Nearby pools with sourced reasons and recent-repeat avoidance. Four image-led tours and five authentic Demo-2 chapters have complete navigation. These editorial sequences are distinct from physical routes; mission scenes show destination context without an invented trajectory.

**Save/share/return:** favorites and bounded recent visits persist in versioned lightweight local storage; unsave has Undo. Back restores selection, camera, panel, layer, route and epoch, including reload and jumps beyond the snapshot cache. Validated version-2 links retain legacy support and use stable object anchors for locked views. Local links are labeled local; denied clipboard access produces a selectable manual URL. Designed exports include identity, a sourced fact and image credits.

**Finishing:** eligible cards open an Earth-centered stereographic sky chart with actual HYG stars, selected-date planetary directions, source/epoch disclosure and angular neighbors. It makes no local-horizon prediction. Light delay uses compatible full 3D separation/c or sourced cosmological lookback time; unknown depth and unsupported data withhold numbers. Physical nearby and thematic related recommendations are distinguished. Live guide requests receive validated object context; offline explanations are clearly scripted. Quiet view retains identity, credits and an obvious exit. Hints dismiss on use; desktop hover waits for deliberate dwell.

**Responsive and resilient:** phone sky controls paint above the sheet; comparison/tours/directions fit without page overflow. Sky focus is confined and restored to its opener. Escape restores Quiet controls before exiting a hidden tour. Failed images retain a labeled fallback and Retry. Provider/essential-data requests have deadlines; optional star-name failure does not block core exploration. Input listeners, timers, superseded focus resources and late textures are cleaned up.

**WebXR:** capability-driven entry stays in a user gesture. Session-level transient-pointer selection avoids controller-index assumptions. Spatial inspection, sourced facts, related/tour Previous/Next, focus/recenter/scale and exit reuse catalog data. Head pose remains runtime-owned; flat camera orbit and clocks pause. Acquired sessions are released across import/startup failures, renderer teardown follows Three.js end handling, and unchanged exit restores the exact ordinary-page view. Spatial and ordinary Exit share the session owner. Mocked lifecycle tests establish ownership/state behavior, not headset comfort. See [XR status and actual-device checklist](polish/xr-status.md).

## Delivered content

| Content | Count |
| --- | ---: |
| Distinct catalog objects | 919 |
| Featured destinations | 374 |
| Hero images | 274 |
| Additional gallery references | 479 |
| Source records | 65 |
| Galaxies | 68 |
| Andromeda children | 21 |
| SpaceX / human-spaceflight cards | 10 |
| Separate HYG stars | 109,389 |

Counts exclude aliases/decorative particles. Six local story assets comprise four NASA photographs and two EHT observations. Matching real cards receive the same audited assets through the reproducible builder. Primary URLs, dates, credits and comparison provenance: [content manifest](polish/content-manifest.md), [discovery source audit](polish/discovery-sources.md).

## Evidence and repeatable run

Foundation screenshots are under `docs/screenshots/desktop-*` and `phone-*`. Production screenshots use `polish-*`: comparisons/export, every tour and story, Saved, sky, Quiet and phone interactions. JSON reports identify the actual base URL and assertions.

Run `npm run build` then `npm start`; verify with `BASE_URL=http://localhost:8787 npm run smoke:polish`. The original foundation suite needs a development server: `BASE_URL=http://localhost:5173 API_URL=http://localhost:8787 npm run smoke`. Chromium is required (`CHROMIUM` can supply its path). Follow [DEMO.md](DEMO.md) and the [phase checklist](polish/IMPLEMENTATION.md).

## Exact remaining limits

- No physical phone, Vision Pro, visionOS Simulator or other headset was available. Secure-origin deployment and XR input/stereo/performance need the documented device run.
- No xAI credentials were configured. Voice/Imagine were preserved but not exercised; core exploration and scripted explanations work without a key.
- No public hosting destination was configured. Links generated here are local and the app says so.
- The main bundle exceeds Vite's 500 kB advisory. Rendering runs on demand and phone/XR texture profiles are smaller. No GPU frame-rate claim is made; concurrent software-rendered timing is not a device benchmark.
- Transfers are circular, coplanar educational models. Precise ephemerides cover 2026-09-01 through 2027-03-01; outside that range positions are approximate and labeled. Galaxy internal depth is often unknown; most moons use shaded illustrative spheres rather than new surface textures.
