# GalaxyMaps upgrade: completion report

Scope: every feature in `GalaxyMaps-Cursor-Upgrade-Prompt.md`, implemented in the existing React 19 + TypeScript + Vite + Three.js app (no replacement scaffold). All numbers below were produced on 2026-10-03 by the commands named next to them. Nothing here was deployed, and no public URL exists.

## Verification results

| Check | Command | Result |
| --- | --- | --- |
| Unit tests | `npm test` | 71/71 passed (6 files) |
| Typecheck | `npm run typecheck` | Clean |
| Production build | `npm run build` | OK. JS 965.8 kB (271.2 kB gzip), CSS 44.9 kB, lazy XR chunk 8.8 kB |
| End-to-end browser checks | `npm run smoke -- --screenshots` (dev server) | 17/17 passed |
| Dataset build | `npm run data:build` | Counts below |

The unit tests cover projection and the locked-camera pivot, label collision, the observable-universe radius and logarithmic mapping, the Hohmann transfer (Earth → Mars 250–265 days, outward, departs on or after the map date, benchmark = distance / c), the two travel modes, the Play time clock (starts paused, interaction hold and 1.2 s idle resume, hidden page, clamping), taxonomy and search (type words, catalog IDs, typos, category filter, honest empty results), and catalog integrity and content targets.

The smoke test (headless Chromium, desktop 1440×900 and phone 390×844) checks:

- Home opens locked on a textured Earth exactly at the pivot.
- Drag, wheel and arrow keys keep the object within 2 px of the pivot; there is no pan.
- Esc leaves the lock.
- Search for "black hole" returns 9 results.
- The Browse tree shows real counts.
- The Mars card has 6 fact tiles and the actions Focus, Directions, Explore inside and View images.
- Andromeda Explore inside lists 21 features with breadcrumbs.
- The observable-universe labels are present.
- Earth → Mars shows "8.5 months" with exactly the travel modes Light speed and Voyager 1, in Route framing.
- Play time advances about 17 days in 2.5 s at 1 week/s with Earth held centred.
- The region Galaxies menu works.
- On phone: floating search, collapsed sheet with Earth centred above it, the Saturn card in the half sheet, and "nebula" search.
- No error panels appear.

### Performance (smoke test, headless Chromium with SwiftShader software rendering)

- 30.0 fps in the nearby-stars view at 1440×900 (30.9 fps on the previous run). This is software rendering; no GPU figure was measured.
- 38 MB JS heap; 451 live DOM elements. Fresh pages measure 323–360 elements; the CDP "Nodes" metric also counts earlier navigations not yet garbage-collected.
- The engine renders on demand, so an idle view stops drawing. Labels and symbols come from pooled DOM/SVG nodes updated by the engine, not React, so no React state updates per object per frame. XR scenes release a focus's geometries, materials and textures when the focus changes, and everything on session end.
- Phones (and screens under 700 px or with a coarse pointer) load the 2k sky and low-resolution Earth materials. XR uses the 2k sky.
- Large PNG hero images are converted to JPEG, which shrank `public/media` from 89 MB to 51 MB. List thumbnails are 160 px (1.6 MB total).

### Screenshots (`docs/screenshots/`)

- Desktop: `desktop-home-earth`, `desktop-search-black-hole`, `desktop-browse`, `desktop-card-mars`, `desktop-andromeda-inside`, `desktop-universe`, `desktop-earth-mars-transfer`, `desktop-play-time`, `desktop-regions`.
- Phone: `phone-home-earth`, `phone-card-saturn`, `phone-search`.

## Catalog counts vs targets (`npm run data:build`)

| Target | Required | Built |
| --- | --- | --- |
| Destinations (featured) | 250–500 | 374 |
| Highlights | 75–150 | 126 |
| Galaxies | 40–80 | 68 |
| Andromeda features | ≥ 10 | 21 |
| SpaceX / human spaceflight cards | 6–10 | 10 |

- Highlights by category: Solar System 24, stars 16, compact objects 12, clusters 10, nebulae 18, galaxies 26, structures 6, missions 14.
- Browse category totals (including tags): Solar System 67, stars 648, compact objects 32, clusters 41, nebulae 28, galaxies 70, structures 8, missions 30.
- 919 catalog objects in total, 271 with a hero image, and 109,389 HYG stars within 1,000 pc.
- Gallery images: 475 kept and 218 dropped because they did not mention the object. Wikipedia's page image list includes navigation-template images, such as a Crab Nebula photo on Alnilam's page; the build now filters these out.

## Requirement coverage

- **Rename**: GalaxyMaps in the UI, title, metadata, package name, server user agent, README and docs. The app uses no localStorage or sessionStorage, so no storage keys needed migrating. Object IDs and external URLs are unchanged.
- **Regions**: grouped pills with dropdowns (Solar System, Stars, Milky Way, Galaxies, Observable universe) and an overflow menu. On phone only the overflow menu shows.
- **Search and browse**:
  - An ARIA combobox with a tree of categories, real counts and thumbnails.
  - A filter chip that emphasizes matching markers.
  - "None yet" for empty categories instead of padding.
  - Fuzzy matching over names, aliases, catalog IDs and type words.
  - Search is fully local; there is no online provider, so the prompt's online-search debounce does not apply.
- **Observable universe**: a transparent bubble with a ~46 Gly comoving radius, labelled "Schematic overview — logarithmic distance" with a selected-catalog caption. It has distance bands and no linear scale bar. Picking works through the boundary, and selecting an object returns to its local frame.
- **Screenshot-audit fixes**:
  - Home is a textured Earth close-up.
  - Star field and label hierarchy are calmer.
  - The Milky Way is labelled "Milky Way (reconstruction)".
  - Sidebar: shorter intro, image-led journey cards and highlights, and a compact status bar with expandable "Sources and model details".
  - The vehicle strip became a two-option Travel mode dropdown.
  - Distance labels: "You are here", "1 AU from the Sun", and Earth to Earth = 0.
- **Desktop layout**:
  - Sidebar of 380–420 px with a collapse button.
  - Framing uses the unobscured map area.
  - 8 px spacing rhythm and one blue accent.
- **Map rendering**:
  - Textured planets and the Moon with IAU spin.
  - Saturn's rings, fixed this round: their opacity was being applied twice.
  - Label collision avoidance, including for forced labels.
  - Distinct glyphs for compact objects, quasars and groups.
  - Galaxy discs at catalogued position angle and inclination; the spiral texture was fixed to draw two symmetric arms.
  - Realistic and Atlas layers stay coherent.
- **Locked object view**:
  - Explore, Locked and Route framings, entered as the prompt requires.
  - Pivot centred in the usable area; orbit with inertia and pitch limits; all panning disabled; zoom toward the pivot within limits.
  - "Locked on X" indicator, Reset view, and Back to explore (restores the saved view).
  - Esc closes menus, then the lock.
  - Route framing with a way back to the destination's lock.
  - Moving bodies stay centred during Play time; the locked view re-centres on the same frame the date changes.
  - Seamless panorama sky; labels and orbits fade while locked; optional Orbit camera.
- **Destination cards**:
  - Hero and gallery with lightbox; name, alternate name, type, parent and category.
  - One sourced sentence; 3–6 fact tiles, distance first, with no duplicate Sun/Earth distance tile outside the Solar System.
  - The four actions; three highlights; related destinations and missions.
  - Details, Images and Sources expanders.
  - Grok Imagine output is labelled "AI reconstruction"; static summaries are never labelled AI.
- **Directions**:
  - Travel mode dropdown with exactly Light speed and Voyager 1.
  - Hohmann transfer first for planet pairs (Earth → Mars about 259 days, shown as 8.5 months), with a separate direct-distance benchmark.
  - Straight-line cruise otherwise, with the model outputs listed.
  - The route preview uses its own clock and pauses Play time.
- **Play time**:
  - Play/Pause, Reset and five rate presets; starts paused.
  - Pauses during map interaction and search and resumes after 1.2 s idle if still armed; pauses on a hidden page.
  - Respects reduced motion; outside the Horizons window it shows an "Approximate orbits" flag; bodies spin.
- **Phone**: floating search, a collapsed/half/full bottom sheet, safe-area insets, pinch-to-zoom and two-finger rotate, and the locked object centred above the sheet.
- **WebXR**:
  - immersive-vr capability detection, with Enter VR started from a user gesture.
  - `select` from any input source, including transient pointers.
  - Spatial card and control bar built from the same catalog record.
  - The viewer pose is never written; Recenter moves the content.
  - The README documents headset testing over USB with `adb reverse`, or through your own trusted HTTPS endpoint.
- **Security and honesty**:
  - The xAI key stays server-side.
  - There is no image proxy: images are local files or direct Wikimedia URLs.
  - No Google assets are used, and no data was fabricated.
  - Grok usage is unchanged and rate-limited.
  - No external service is queried per frame.

## Known gaps and limitations

- **Headset validation pending.** The WebXR code is typechecked and wired, but it has not been run on a physical headset.
- **Live Grok untested.** No xAI key was configured, so Voice and Imagine ran only through their no-key paths, and the offline guide was the one exercised.
- **GPU performance not measured.** The only frame rate figures come from software rendering in headless Chromium.
- **Not every phone gesture is automated.** The full sheet state and two-finger rotate are implemented, but the smoke test checks only the collapsed and half states.
- **No bloom pass.** There is no post-processing bloom; the Sun uses a glow sprite. This keeps phone and XR frame time low.
- **Untextured moons.** Moons other than the Moon have no bundled texture and render as shaded spheres in their catalog colour.
- **Unmeasured depth.** Galaxy features (for example inside Andromeda) have measured sky positions but unmeasured depth, and the UI says so.
- **Large bundle.** The main JS bundle exceeds Vite's 500 kB advisory size; only the XR module is code-split.
- **Approximate image filter.** The gallery filter matches on names and aliases, so it can drop a relevant image whose title doesn't mention the object (for example one artist's impression of Gaia BH1).
