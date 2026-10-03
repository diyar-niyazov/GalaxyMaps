# GalaxyMaps — final product, feature completion, and visual polish

You are the senior product designer, frontend engineer, graphics engineer, and QA owner working in our existing GalaxyMaps repository. Bring the actual application to a polished, coherent, demo-ready finished stage. Implement the selected changes below, inspect the rendered result, and resolve integration problems. Do not stop after a plan, isolated components, placeholder buttons, or a cosmetic homepage.

This is a continuation of an existing product. First inspect AGENTS.md, the repository, package scripts, current renderer, data, assets, tests, server integrations, and deployment configuration. Run the existing application. Read GalaxyMaps-Cursor-Upgrade-Prompt.md and SpaceMaps-Codex-Prompt.md if present, treating this document and the user's latest instructions as authoritative where requirements conflict. Their absence must not block work: the essential requirements are restated here.

Do not assume that a previous prompt being written means every requested feature was implemented. Audit the working app. Preserve useful existing work and complete missing requirements. Reuse the stack, current 3D scene, astronomical calculations, and working integrations. Avoid a framework migration, unnecessary backend, or redesign that discards the familiar map experience.

## 1. The finished experience

GalaxyMaps lets someone explore space through a familiar navigation interface, understand what they are looking at, and discover their next destination effortlessly.

The finished experience should support this loop:

**Discover → focus → understand → compare → explore further → save or share.**

Within the first few seconds, show a beautifully rendered Earth with an obvious search field and clear exploration controls. A visitor can search or browse for a real object, smoothly lock onto it, rotate around it, open a gorgeous information card, compare its size with another object, and continue into a curated journey or the larger universe.

The application must feel coherent across desktop, phone, and supported immersive WebXR browsers. Scientific transparency should appear exactly where it helps someone interpret a result. Technical implementation details belong in documentation or expandable source/model information.

### Retained product decisions

- Product name: **GalaxyMaps**. Use the existing approved logo/assets if available; do not invent a new brand identity.
- Keep the Google Maps-inspired navigation structure, clean light sidebar, original branding, and immersive dark 3D map.
- Preserve continuous zoom, Realistic and Atlas layers, top region bubbles, rich destination cards, and typed/nested-category search.
- **Locked object mode:** rotate around the selected object and zoom toward its center; no application panning. Include an obvious Unlock / Back to explore control.
- Match the supplied Google Earth globe reference in locked Realistic views: detailed object, subtle lighting, deep star panorama, faint Milky Way texture, restrained controls.
- The travel dropdown contains exactly **Light speed** and **Voyager 1**. There is no Custom Speed option, fictional-vehicle menu, or extra transport strip.
- Supported nearby planetary routes use a defined orbital-transfer model. Long-distance routes may use straight-line speed comparisons.
- **Play time** advances supported simulated motion. It is separate from camera orbit and journey preview.
- Expand real destinations, including galaxy interiors where data supports them. Andromeda must offer actual known features to explore.
- Maximum zoom-out includes a labeled **Observable universe** bubble containing the included galaxy catalog, with explicit schematic scaling where needed.
- Use substantial real astronomical imagery and relevant official SpaceX imagery/content.
- Internet-loaded assets and data are allowed; failure of an external service must not break core exploration.
- Preserve existing working Grok/guide features. A new Gemini integration is not a prerequisite.
- Preserve laptop, phone, and Vision Pro/WebXR scope.
- No accounts are required for the core experience, saving favorites locally, or sharing a view.

### Six previously selected ideas to preserve and implement

1. Compare sizes.
2. Surprise me exploration.
3. A polished SpaceX mission story.
4. View from Earth.
5. Share this exact view.
6. Curated mini-tours.

These are product decisions, not a brainstorming list. Implement their focused versions described below; do not turn each into a separate large product.

## 2. Priorities and working discipline

The highest improvement comes from better composition, easier discovery, coherent camera controls, trustworthy results, and a few complete memorable interactions. Increasing feature count alone is not completion.

Use this order:

- **P0 — finish the foundation:** close core gaps, remove broken/dead interactions, improve rendering, complete browsing/cards, expanded destinations, locked focus, and the universe overview.
- **P1 — add the strongest complete experiences:** size comparison, Surprise me, curated tours, one SpaceX story, local favorites/history, and exact-view sharing.
- **P2 — complete the product:** Earth-sky view, light-delay explanations, contextual discovery, responsive/XR parity, accessibility, performance, and final verification.
- **Optional only after acceptance:** decorative 3D spacecraft, more volumetric effects, additional mission stories, additional AI providers.

Implement P0, then P1, then P2 as working vertical slices. Some P2 engineering, particularly responsiveness and accessible controls, belongs in every earlier slice and must not be bolted on at the end.

Make routine reversible decisions without repeatedly asking questions. Report a concrete blocking dependency and continue unaffected work. If a feature cannot be completed because of unavailable credentials, data, or hardware, keep an honest usable state and identify the exact gap. Do not call the whole product complete while required flows remain broken or unverified.

Use a brief internal implementation checklist. Do not spend the task producing another large specification instead of shipping code.

## 3. Extensive improvement inventory

The rows below are the selected scope. Closely related rows should share components and state rather than create new screens or duplicated systems.

| # | Priority | Improvement | Visible completion condition |
|---|---|---|---|
| 01 | P0 | Existing-app audit | Current working features, broken controls, data counts, and integration status are recorded before changes. |
| 02 | P0 | Consistent GalaxyMaps branding | Search, titles, metadata, current docs, and approved logo agree. |
| 03 | P0 | Beautiful initial Earth view | Earth is intentionally framed, textured, lit, and immediately explorable. |
| 04 | P0 | Locked-object inspection | All pan paths are disabled; orbit, centered zoom, reset, and unlock work. |
| 05 | P0 | Quiet, legible star rendering | Important objects and labels remain readable in the dense stellar view. |
| 06 | P0 | Galaxy and object visual hierarchy | Galaxies, planets, nebulae, clusters, and compact objects look distinguishable at useful scales. |
| 07 | P0 | Compact nested category browser | Every supported category is reachable by typing, mouse, keyboard, and touch. |
| 08 | P0 | Region navigation and breadcrumbs | No clipped regions; users always have a clear way back to a broader context. |
| 09 | P0 | Image-led destination cards | Main destinations show a large correct image, concise highlights, and deeper details. |
| 10 | P0 | Reliable imagery and galleries | Credits, captions, loading, failure fallback, and expanded image viewing work. |
| 11 | P0 | Meaningful catalog expansion | New selectable, sourced records exist across the requested categories, not just more particles. |
| 12 | P0 | Andromeda and other galaxy interiors | Explore inside reveals verified children with correct parent relationships. |
| 13 | P0 | Observable-universe overview | The labeled boundary appears, included galaxies remain discoverable, and local navigation is reversible. |
| 14 | P0 | Compact directions | Exactly two travel choices; endpoints, swap, stops, and route framing are clear. |
| 15 | P0 | Validated transfer visualization | A supported Earth–Mars scenario has a calculated curve, moving target, and matching duration. |
| 16 | P0 | Deterministic time controls | Play, pause, reset, idle behavior, model bounds, and route playback do not conflict. |
| 17 | P1 | Compare sizes | Two compatible objects share a truthful scale, with clear handling of extreme ratios. |
| 18 | P1 | Curated comparison presets | Several compelling pairs open instantly and contain verified size data. |
| 19 | P1 | Surprise me | A single action finds a high-quality object, frames it, and explains why it is interesting. |
| 20 | P1 | Discovery intent choices | Beautiful, Strange, and Nearby select from relevant eligible objects. |
| 21 | P1 | Four complete mini-tours | Each has a coherent sequence, readable progress, rich imagery, and working navigation. |
| 22 | P1 | One complete SpaceX mission story | Every chapter works and distinguishes historical facts from illustrations. |
| 23 | P1 | Contextual SpaceX collection | Relevant imagery and sourced mission/vehicle cards appear naturally within exploration. |
| 24 | P1 | Local favorites | Save, unsave, revisit, and persistence work without sign-in. |
| 25 | P1 | Recently explored and Back | Visitors can recover a previous object/view without repeating a search. |
| 26 | P1 | Exact-view deep links | A fresh tab restores the intended object, mode, camera, and supported route. |
| 27 | P1 | Shareable discovery card | An attractive export contains object identity, one verified fact, image credit, and product identity. |
| 28 | P2 | View from Earth | Eligible objects can be located in a clearly described Earth-centered sky view. |
| 29 | P2 | Light-delay insight | Cards explain light-travel/lookback time using an appropriate supported model. |
| 30 | P2 | Nearby and related destinations | Physical proximity and thematic recommendations are visibly distinguished. |
| 31 | P2 | Informative stop suggestions | Adding a stop shows its actual added distance for supported cruise itineraries. |
| 32 | P2 | Scale ladder and orientation | Users understand their current scale and can move among major regions. |
| 33 | P2 | Contextual questions for the guide | Existing live guide receives the selected object's sourced context; unavailable AI is honest. |
| 34 | P2 | Progressive disclosure | First views are concise; facts, sources, assumptions, and credits remain easy to inspect. |
| 35 | P2 | Clean presentation mode | The scene can be viewed with minimal chrome, with an obvious way to restore controls. |
| 36 | P2 | Helpful first-use hints | Compact gesture hints appear where relevant without blocking the map. |
| 37 | P2 | Selection and hover previews | Desktop hover and touch selection reveal useful information without accidental navigation. |
| 38 | P2 | Responsive phone completion | Search, details, tours, comparison, and directions work in stable bottom-sheet layouts. |
| 39 | P2 | Immersive WebXR completion | Supported browsers can enter/exit a usable shared scene; actual test status is documented. |
| 40 | P2 | Accessible interaction | Focus, semantics, contrast, reduced motion, and keyboard operation are verified. |
| 41 | P2 | Image/data resilience | Slow or failed providers leave the app useful and do not cause broken layouts. |
| 42 | P2 | Performance and resource control | Actual delivered data is responsive; texture/geometry resources are managed. |
| 43 | P2 | Units and provenance consistency | Distances, times, sizes, frames, and assumptions are labeled correctly. |
| 44 | P2 | Reversible state transitions | Focus, route, tour, comparison, sky, and XR transitions have predictable exits. |
| 45 | P2 | Complete empty/error states | No dead buttons, raw stack traces, unexplained blank scenes, or fake loading states. |
| 46 | P2 | Demo and production finishing | Real-device/browser evidence, actual run/deploy instructions, and a repeatable demo are ready. |

## 4. Design direction: make every frame intentional

### Overall composition

Keep the map visible and useful throughout the product. Use the light panel for reading and navigation; use the scene for wonder, scale, and orientation.

On a spacious laptop, use approximately 380–420 CSS pixels for the primary sidebar, adapting at smaller widths. Do not size CSS from raw screenshot pixels. Use a stable search header and a scrollable content area. Remove oversized introductory copy and redundant cards that push real destinations below the fold.

Use a consistent spacing rhythm and a modest type scale. Treat major duration/distance values as information hierarchy, not decoration. Use one consistent action blue, subtle neutral separators, and moderate corner rounding. Keep low-priority metadata visually quieter but readable.

Use the existing GalaxyMaps logo. Keep icon weights consistent. Replace emoji-like or mismatched interface icons where they undermine polish. Never copy Google logos, branded controls, or proprietary imagery.

### Initial view

Open directly into a locked, deliberately composed Earth view. Show a substantial globe in the usable map area with enough breathing room and a quiet star background. Keep search and a few strong discovery choices visible.

Use an object-aware presentation pose. Saturn should reveal its rings; an irregular object should have a readable silhouette; a galaxy should reveal useful structure. These choices change the camera, not source coordinates or scientific dimensions.

Keep Home, Earth & Moon, and Solar System distinct: Home is the Earth close-up; the region views frame their full systems.

### Scene rendering

- Replace the dense field of uniformly bright star particles with graded brightness, restrained size, smooth LOD, and a screen-space density budget.
- Prioritize the selected object's label, endpoints, and a small set of important neighbors. Handle overlaps and occlusion; do not solve clutter by deleting searchable records.
- Add subtle label backing or contrast treatment where necessary instead of making every star darker to invisibility.
- Use object-type-specific visual treatments. Reserve expensive effects for selected/nearby objects.
- Give the Milky Way convincing bar/spiral structure, dust, depth, and restrained highlights. Retain an illustration/reconstruction label.
- Cross-fade between representation levels without visibly duplicating objects or causing a flash of empty space.
- Keep a clearly separate decorative background. It never creates a catalog object, source claim, distance, or route.
- Preserve physical positions independently of marker radius, display offsets, or schematic transforms.
- Realistic and Atlas modes retain the same selection and navigation state.

### Motion language

Use short, interruptible UI transitions and appropriately longer map framing transitions. Prefer easing that settles without overshoot or bouncing. A new user interaction should cancel or retarget an in-progress camera transition cleanly.

Respect reduced motion: use immediate framing or brief fades. Never chain unrequested cinematic camera movement. In immersive VR, head tracking remains authoritative and forced camera motion is disabled.

## 5. Camera modes and navigation state

Create an explicit, small mode/state model. Adapt names to the codebase; do not scatter contradictory boolean flags across components.

Core experiences:

- Explore.
- Locked object.
- Route framing and journey preview.
- Size comparison.
- Earth sky view.
- Guided tour or mission story, which uses appropriate underlying scenes.
- XR presentation of supported scene state.

Keep selection, mode, camera, route, epoch, layer, and panel state well defined. Store the preceding useful view before entering a focused experience. Back should return to that view, not always reset to Earth.

### Locked object requirements

Selecting an object or pressing Focus smoothly centers its actual pivot in the unobscured scene area. Dragging orbits around it; wheel/pinch moves toward/away from the same pivot within safe limits.

Disable every application panning path while locked: modified drags, middle/right drag, touch translation, keyboard movement, and cursor-centered dolly that shifts the target. Interface scrolling and form controls must continue to work.

Provide Locked on [object], Reset view, and Unlock / Back to explore. Reaching the zoom-out limit does not silently unlock. Region selection and route framing explicitly leave object lock. Selecting another object transitions directly to its lock.

If time playback moves the selected object, follow its center while retaining the user's viewing angle and distance. Keep body spin separate from camera movement.

Use a seamless, subtle star panorama with a faint Milky Way band where appropriate. Keep orientation coherent as the camera orbits. Use permitted imagery or a labeled reconstruction; an Earth-based sky panorama is not an exact view from every destination. Keep background assumptions and credits in details.

In XR, keep the selected object in a stable spatial presentation. Do not freeze or overwrite natural head movement to maintain a screen-centered target.

### Reversible navigation

Keep a bounded navigation history of meaningful views, not every animation frame. Browser Back and in-app Back must have predictable behavior. Esc closes the most local menu/dialog first, then exits the focused experience where appropriate.

Do not let a map click behind an open panel accidentally change selection. Dragging must not be interpreted as clicking a distant object. Opening menus must not move the camera.

Persist lightweight user preferences and favorites. Restore a safe view if stored state references an unavailable object or old schema.

## 6. Search, category browsing, and region clarity

Provide a single obvious search field with typed matching and a compact nested category browser. Preserve current region bubbles and make overflow intentional.

Search results include a correct thumbnail or tasteful type fallback, name, type, host/region, and a useful correctly labeled distance when available. Match aliases and catalog identifiers. Prioritize exact matches, common names, and relevance.

Category hierarchy should cover supported planets, dwarf planets, moons, asteroids, comets, trans-Neptunian objects, stars/systems, exoplanets/hosts, compact remnants, black holes, star clusters, nebula subtypes, supernova remnants, galaxies, larger structures, and spacecraft/missions. Use tags for overlapping classifications rather than duplicate objects.

Click/tap a category to drill down. Include breadcrumbs, back, clear filter, and useful counts. Support keyboard navigation and touch; never require hover-only flyouts. Do not open an enormous nested menu beyond the viewport.

On empty search, offer a small set of featured destinations, recent views, and entry points to curated collections. On no matches, offer a spelling/alias hint and a way to clear filters. Do not silently replace a failed query with unrelated results.

Keep category filtering and region scope visible. If an active region excludes a matching object, offer Search all regions. Preserve the selected object and active route while exploring filters.

Use compact breadcrumbs such as Universe / Local Group / Andromeda / G1 where appropriate. Distinguish host membership from the camera's current zoom scale. Avoid claiming the user is physically located at a destination merely because the camera focuses on it.

## 7. Rich cards and imagery: the primary content investment

Build one reusable destination-card system, with type-specific fact selection.

First view:

1. Correct, high-quality hero image with a stable aspect ratio.
2. Name, alternate identifier where useful, type, and parent location.
3. One concise, sourced reason to care.
4. Three to six relevant fact tiles.
5. Primary Focus / Directions / Explore inside actions according to capability.
6. Save, Compare sizes when eligible, and Share as restrained secondary actions.
7. Three short highlights and an obvious path to deeper information.

Additional areas:

- Image gallery with captions and attribution.
- More facts, units, uncertainty, and provenance.
- Related destinations and physically nearby objects, clearly separated.
- Relevant mission content.
- Contextual guide questions when supported.

Avoid long generic descriptions. Prefer specific facts about the selected object. Do not invent missing values to fill a visually symmetrical grid.

Images must match the named object. Do not substitute a generic nebula photograph without labeling the substitution. Differentiate observations, composites/processed imagery, illustrations, and AI reconstructions. Place captions/credits accessibly without overwhelming the first view.

Use responsive images, suitable crops, thumbnails, lazy loading, and bounded caches. Load only the selected gallery's higher-resolution images. Avoid blank hero rectangles, layout shifts, broken image icons, and endless skeletons.

Featured tours, Surprise me selections, and the demo path should have dependable cached or bundled imagery. The larger catalog may load on demand. Always show an honest useful fallback if a provider fails.

## 8. Catalog completion and galaxy interiors

Audit actual counts before expansion. Report distinct catalog records separately from decorative points, aliases, image assets, and mission-story chapters.

Aim for broad category coverage and several hundred genuinely useful curated destinations, with a substantial set of exceptional image-rich highlights. Preserve or expand an existing valid larger star catalog. Do not damage performance or invent entries to reach a count.

Every curated featured destination needs:

- Stable identity and useful aliases.
- Correct type and parent relationships.
- Usable coordinates or an explicit placement limitation.
- Appropriate sourced facts.
- A matching image or clearly labeled visual treatment.
- An intentional initial camera pose.
- Declared capabilities: focus, route, compare, Earth sky view, explore children.
- Sources and credits.

Ensure strong Solar System coverage and a richer Milky Way. Include black holes, compact remnants, nebulae, clusters, asteroids, comets, and exoplanet systems. Avoid turning all nonplanetary bodies into indistinguishable points.

For Andromeda, build an actual Explore inside flow with verified objects such as its nucleus, NGC 206, G1/Mayall II, and additional supported features. Verify each record. Keep halo objects, internal disk objects, and companion galaxies distinct. Extend this hierarchy to other nearby galaxies where source quality permits.

Unknown internal depth must remain unknown or explicitly approximate. Host-distance placement may support a display; it does not automatically support a precise internal travel distance. Keep poorly constrained objects explorable without fabricating routes.

Keep ingestion reproducible, normalize units/frames/epochs, reject duplicates and invalid catalog sentinels, and respect source licenses and request limits. Never use an LLM as the authoritative catalog or calculator.

## 9. Compare sizes — the strongest new interaction

Implement a focused, beautiful size-comparison experience using real dimensions.

### Entry and controls

Add Compare sizes to eligible object cards and a few curated comparison presets in discovery. Default the first object to the selected one, then suggest a familiar compatible reference.

Show two labeled selectors, Swap, Reset, a common scale, and an explicit choice between True scale and Fit both for inspection. Search within selectors reuses the catalog and only exposes supported comparison capabilities.

### Scientific behavior

- Compare compatible size definitions. Use diameter or another clearly specified physical extent.
- Distinguish radius from diameter; convert units deterministically.
- For irregular bodies, identify the adopted mean/equivalent dimension.
- Preserve uncertainty and avoid excessive precision.
- Do not mix a black hole's event-horizon diameter, a galaxy's arbitrary visible extent, and a planet's surface diameter under one unlabeled measure.
- Start with well-supported planets, moons, and stars. Add other classes only when the metric is clearly meaningful.
- Missing data disables that comparison with an explanation, not a guessed dimension.

### Visual behavior

In True scale, both objects share one physical scale. Do not impose a minimum visual radius that silently falsifies the ratio. If the smaller object becomes tiny, retain a locator and an explicitly magnified inset.

In Fit both, allow each object to be inspected at a different visual scale and label that clearly. The numeric ratio still comes from physical data.

Show one strong comparison sentence and the underlying diameters. Avoid volume claims unless you actually calculate and label the appropriate geometric approximation.

Use crisp, suitable imagery or meshes with attractive lighting. Keep labels clear, shareable composition intentional, and transitions smooth. On phones stack the information if necessary while keeping the actual shared-scale visual intelligible.

Prepare several verified presets using familiar objects, including a planet–planet pair, planet–star pair, and star–star pair. Choose exact pairs from the available reliable dataset rather than inventing missing sizes.

### Done when

A fresh user can open a comparison from a card, choose another object, understand the ratio, distinguish the two display modes, swap, share, and return to the original view. Changing visual mode never changes the physical values.

## 10. Surprise me — a polished discovery engine

Add one obvious but restrained Surprise me action to discovery. Offer optional intent choices: Something beautiful, Something strange, and Somewhere nearby.

Use a curated eligibility pool with valid IDs, strong imagery, complete cards, working focus, and verified editorial tags. Do not draw uniformly from thousands of obscure records or unresolved assets.

Avoid repeating recently shown objects. Record history only after a selection succeeds. If loading fails, recover with another eligible destination or a clear retry; never trap the user in an endless search animation.

One action should:

1. Choose an eligible real destination.
2. Load its essential content.
3. Smoothly enter its locked view.
4. Open a concise “Why this is worth seeing” highlight.
5. Offer Another, Save, and Explore more.

Nearby means actual supported physical distance relative to an explicitly chosen origin. If physical proximity cannot be established, use Related rather than mislabeling it nearby.

Respect reduced motion and allow interruption. Surprise me must not discard an in-progress itinerary without preserving a way back.

## 11. Curated mini-tours

Build at least four complete, short tours from the actual verified catalog:

- Beautiful nebulae.
- Black holes and other extreme objects.
- Inside Andromeda.
- Human spaceflight.

A strong tour has approximately four to six stops, a clear reason for its ordering, excellent images, and one memorable sourced highlight per stop. Replace any proposed stop that lacks dependable content rather than leaving a placeholder.

Tour UI:

- Image-led overview with stop count and theme.
- Start, previous/next, progress, pause/exit, and jump to a stop.
- Smooth focus transitions and a concise stop card.
- Optional guide narration only if the existing provider actually works.
- A clear return to free exploration and the previous view.

A tour is an editorial sequence, not automatically an optimized physical route. Do not imply that its objects are on the way to each other. Offer Make an itinerary only when every selected leg has an appropriate supported route model; calculate the actual distance then.

Keep controls stable between stops. Do not autoplay camera movement before the visitor starts the tour. Support a deep link to a tour and a selected stop.

## 12. One excellent SpaceX mission story

Build one complete visual mission story before adding many partial stories. Choose a documented completed mission with reliable images and a clear sequence, verifying primary sources during implementation.

Present a small number of chapters with:

- A mission overview and striking authentic image.
- Verified dates or elapsed mission time.
- A short explanation of each milestone.
- Relevant Earth/orbit/destination context.
- Previous/next controls and visible progress.
- Sources and credits.

If reliable trajectory data exists, use it. Otherwise show a clearly labeled schematic or image-led sequence. Never animate a made-up path and call it the actual flight trajectory.

Separate launch vehicle, spacecraft, mission, destination, and generic vehicle model in the data. Do not show a generic Starship at an invented current location. Verify planned versus completed status for all content.

Build a tasteful SpaceX / Human spaceflight collection around the story with appropriate Falcon, Dragon, and Starship imagery and sourced cards. Use this content where it helps explain exploration; do not add a wall of sponsor logos.

Keep the two-option Light speed / Voyager 1 dropdown unchanged. SpaceX editorial content is not permission to invent a universal rocket cruising speed.

Do not claim SpaceX challenge eligibility from imagery. Preserve any functioning Grok integration and document actual integration status separately.

## 13. Save, recently explored, and share

### Local favorites and history

Provide a simple Save/Unsave action on object cards and a Saved collection. Persist locally with a versioned schema. No sign-in, server database, or social graph is needed.

Keep a bounded Recently explored list with useful thumbnails and names. Avoid duplicates and record meaningful visits, not every transient hover. Support undo for an accidental unsave.

Store stable IDs and lightweight presentation state, not huge image blobs or complete upstream catalog dumps.

### Share this exact view

Create a versioned, validated URL state that can restore:

- Selected object or comparison pair.
- View mode and layer.
- Orbit orientation and relative zoom when relevant.
- Supported itinerary.
- Tour/story and stop.
- Relevant epoch or snapshot when meaningful.

Use stable IDs and compact relative camera parameters rather than enormous absolute coordinates. Cap input lengths, clamp numeric ranges, and reject unsupported modes. Never include credentials, private tokens, executable input, or arbitrary asset URLs.

A fresh tab should restore the essential view after its data loads. Handle old links, missing objects, and provider failure gracefully.

Use an actual deployed HTTPS base URL for externally shareable links. If only localhost is available, say that the link is local rather than presenting it as publicly accessible.

Prefer native share where supported; provide Copy link with clear success/failure feedback. Clipboard denial must not result in a fake success toast.

### Discovery-card export

Export a clean image with the object or comparison, name, one verified highlight, GalaxyMaps branding, and necessary credit. Use permitted assets and a predictable aspect ratio.

Handle canvas cross-origin restrictions properly. Do not promise an export that only works with cached development assets. If scene capture is impractical, render a designed card from approved images and text.

Do not build video recording, social accounts, or a community feed for this milestone.

## 14. View from Earth

Implement a carefully scoped Earth-centered sky view for objects with usable directions.

The interaction should answer: “Where does this object appear in our sky?”

- Add View from Earth to eligible cards.
- Transition to a sky-sphere representation using the relevant sourced directions and a clearly identified epoch.
- Highlight the selected object, show useful neighboring stars, and provide Back to object.
- Reuse reliable positions and coordinate-transform code.
- For Solar System bodies, use the appropriate Earth-relative direction at the selected epoch.
- For catalog stars/deep-sky objects, identify catalog-epoch or geometric approximations where apparent-position corrections are omitted.
- Keep decorative panoramas separate from the astrometric reference. A pretty background is not a star-position database.

Start with an Earth-centered all-sky view. It does not require the user's location. Do not claim that it shows tonight's local horizon or what is above their house unless observer coordinates, date/time, horizon transformation, and relevant assumptions are actually implemented.

If adding constellations, use a verified line/boundary dataset with attribution. Do not draw arbitrary connections and label them as official constellations.

No camera-based AR, phone-compass alignment, or geolocation permission is required for this release. If precise directions are unavailable, keep the card useful and explain that this view is unsupported.

## 15. Light delay, contextual discovery, and learning

### Light-delay insight

For eligible objects, add a small, memorable card explaining the time taken by the light we receive.

For nearby objects, derive the simple light-travel benchmark from compatible physical distance and c. For cosmological distances, use an appropriate sourced lookback-time value/model or withhold the numerical claim. Do not treat luminosity distance divided by c as a universal lookback time.

Use readable language such as “The light reaching Earth now began its journey roughly … ago,” only where the data supports that statement. Avoid historical-event comparisons unless those are separately sourced and genuinely help.

Do not confuse this insight with spacecraft travel duration or a simulated camera animation.

### Nearby versus related

Offer small, high-quality destination recommendations:

- Nearby: calculated physical proximity with a named origin and compatible coordinates.
- Related: same host, category, mission, or curated theme.
- Explore inside: verified children of the selected system/galaxy.

Do not use sky-angle proximity as a substitute for physical distance.

For suggested cruise-itinerary stops, show the additional total distance. Avoid “on the way” unless the detour was evaluated. Unsupported route legs stay out of automatic itineraries.

### Grounded guide entry points

If a live guide already works, provide two or three useful contextual questions such as “What makes this unusual?”, “Explain this distance,” or “What should I explore next?”

Supply validated object IDs, sourced facts, and deterministic calculations. Validate any app actions requested by the model. Keep provider credentials server-side.

If no provider is available, the destination content still works. Do not simulate a live answer or show a prominently broken chat feature. Keep any static explanation clearly distinguishable from live AI.

A new Gemini implementation is optional after the finished core.

## 16. Routes and time must remain scientifically coherent

### Directions

Keep endpoint inputs, swap, Add stop, model identification, fit-to-route, and preview clear and compact. Exactly two benchmark choices remain: Light speed and Voyager 1.

Retain the source and reference frame for Voyager's adopted speed. A benchmark is not an assertion that the spacecraft can perform every route.

### Orbital transfers

Use a calculated educational transfer for supported planet pairs. The required reference example is Earth–Mars with a defined circular, coplanar two-body scenario and suitable alignment.

For orbital radii r1 and r2, a = (r1 + r2) / 2 and transfer time = pi * sqrt(a^3 / muSun). Verify constants and units; the standard idealized Earth–Mars example is approximately 259 days.

The rendered curve, moving planets, and arrival must agree with the model. Do not add arbitrary curvature to a straight line and label it realistic. Do not advance along a Keplerian ellipse with uniform angle and call that a physically consistent time evolution.

A modeled transfer duration is separate from a selected vehicle's direct-distance speed benchmark. Label both if displayed together. Light should not appear to follow a spacecraft transfer ellipse simply because it is the chosen comparison speed.

Unsupported Earth–Moon, small-body, or arbitrary-date transfers need honest limits. Do not pass all objects through the same Sun-centered formula.

### Cruise comparisons

For compatible interstellar/nearby intergalactic positions, calculate full spatial separation and distance divided by assumed speed. Do not subtract distances from Earth.

Keep the simplifying assumptions accessible. No unimplemented fastest-route claims or arbitrary cosmological routes.

### Play time

Start paused. Play arms simulation; active interaction may temporarily pause it; explicit Pause disarms it. Reset restores the intended epoch/scenario.

Use deterministic elapsed time, bounded frame deltas, and page-visibility handling. Respect ephemeris validity intervals. Galactic illustrative motion must not silently mutate catalog-epoch physical data.

Keep exploration time, route preview time, selected travel speed, and optional camera auto-orbit distinct. In XR, do not use automatic camera orbit.

## 17. Observable universe and scale orientation

Retain the fully zoomed-out bubble labeled Observable universe, containing included galaxies with appropriate detail and selection.

Nearby galaxies occupy a tiny part of a literal universe-scale display. Use an explicitly labeled logarithmic/schematic overview where needed; preserve angular directions where possible and keep true data separate.

Do not present a uniform linear scale bar across a nonlinear transform. Use distance bands or an explanation, then restore a locally appropriate scale bar when entering a region.

Keep the adopted observable-radius convention and source in details. The boundary is an observational concept, not a solid wall or a routable object. The map contains a selected catalog, not every galaxy.

A scale ladder should provide quick access to Earth, Earth & Moon, Solar System, stars, Milky Way, Local Group, and Observable universe. It complements smooth zoom rather than replacing it with disconnected pages.

When a selected object becomes too small to label normally, preserve a restrained locator/focus action. Do not leave users searching for a vanished selection. Keep the boundary transparent and nonblocking for picking.

## 18. Small finishing features with high value

### Presentation mode

Offer a quiet-view control that minimizes panels and secondary labels while preserving a small exit affordance, object identity, and essential credits. It should produce a beautiful scene for showing judges or taking a screenshot.

Do not hide the only path back to controls. Support keyboard and touch recovery. Presentation mode must not change underlying data or start camera movement.

### First-use hints

Use short contextual hints: drag to rotate, pinch/scroll to zoom, unlock to pan, and how to return from a focused view. Dismiss or fade them after successful use. Avoid a blocking onboarding carousel.

### Hover and selection

On desktop, a lightweight hover preview may show name, type, and a thumbnail after a short deliberate dwell. Do not fetch a full gallery on every pointer movement.

Touch uses explicit selection. Do not emulate hover with repeated accidental taps. Keep previews out of the way of the selected object and labels.

### Formatting

Use consistent astronomical units, readable enormous durations, clear approximate values, and sensible significant figures. Explain the origin of displayed distances.

An Earth result labeled “You are here” must not show an unlabeled 1 AU as if it were distance from the Earth origin. Place orbital radius and heliocentric distance under their correct labels.

### Feedback

Show immediate visual acknowledgement of meaningful actions: Saved, Link copied, Loading Andromeda features, or a specific failure. Avoid success toasts before an operation actually completes.

Preserve entered search and itinerary state after a failed request. Use contextual retry rather than resetting the entire app.

## 19. Responsive design and accessibility

Desktop: persistent search, useful sidebar, dominant map, compact map controls. Keep minimum touch-friendly targets where appropriate without oversized empty tiles.

Phone: floating search, horizontally usable region navigation, and a bottom sheet with predictable collapsed/expanded behavior. Details, menus, comparisons, and tours must fit without horizontal page overflow.

Do not intercept card scrolling as camera motion. Account for safe areas, browser chrome, and the on-screen keyboard. Keep selected objects visible above partially open sheets.

Accessibility requirements:

- Logical focus order and visible focus.
- Appropriate dialog, combobox, list/tree, button, and disclosure semantics.
- Keyboard access to major flows.
- Escape behavior respecting the active UI layer.
- Labels for icon-only controls.
- Information not communicated by color alone.
- Readable contrast and usable text sizing.
- Reduced motion and pause controls.
- No continuous screen-reader announcements for every simulation frame.
- An accessible textual route summary and object facts even when the 3D canvas cannot convey them.

Offer a clear recoverable message if rendering capabilities are unavailable; retain searchable information where practical rather than displaying a blank page.

## 20. Vision Pro and WebXR finishing

Use one website with shared data and scene logic. Do not create a parallel native app.

Use capability detection for immersive-vr, a user-initiated Enter VR action, graceful errors, and an actual secure HTTPS origin for headset access. The laptop's localhost URL is not a public headset URL.

Recheck the current official WebKit/WebXR documentation and installed framework integration. Support Vision Pro's transient-pointer selection lifecycle; do not assume permanently present controller inputs.

Create a small usable spatial interface for selected-object information, focus, scale, next/previous tour stops where supported, back, and exit. Ordinary HTML sidebars must not be assumed visible in an immersive session.

Users can select/search before entry. A full VR keyboard is not required. Keep the XR presentation stationary and comfortable, with deliberate controls for repositioning/scaling the content.

Let the runtime own tracked view matrices. Never overwrite head pose to enforce object lock. Disable desktop camera auto-orbit and forced travel. Simulated body motion can continue under explicit user control.

Use suitable meter-based display scaling, bounded labels, optimized textures, and stereo-aware quality settings. Clean up sessions and preserve the normal-page state on exit.

Clearly document which immersive actions work. At minimum, inspection, selection of supported objects, useful facts, focus/recenter/scale, and exit must be coherent. More complex editing can remain in the normal page with a clear return path.

If hardware or a simulator is unavailable, say headset validation pending and provide precise test steps. Do not claim that successful desktop rendering validates headset behavior.

## 21. Performance, data, and asset engineering

Use the existing renderer effectively. Batch or instance repeated geometry, limit transparent overdraw, reuse materials, and dispose of superseded textures and geometry.

Do not update React state once per object per frame. Keep animation and bulk scene updates in an appropriate rendering loop.

Use quality profiles based on measured capability and user choice. Reduce decorative density and effects before removing useful data or interaction.

Load region bundles, selected galleries, and tour content progressively. Avoid downloading all full-resolution images at startup. Bound caches and deduplicate requests. Cancel stale searches or destination requests.

Ensure required images work in production, in WebGL, and in share exports. Handle CORS through permitted assets and appropriate server/caching arrangements, not an unrestricted open proxy.

Normalize and validate all external data. Retain source versions, units, frames, epochs, image credits, and usage terms. Protect provider secrets. Respect rate limits and retain valid cached content.

No analytics service, account system, database, payment flow, or broad new infrastructure is needed for this release. Use the simplest reliable existing tools.

## 22. Implementation sequence and completion gates

### Gate A — the existing product is coherent

Audit, run, fix broken interactions, preserve the app, and complete P0. Test the actual visual result on desktop and phone before adding new feature surfaces.

Required outcomes: beautiful Earth, correct locked interaction, usable search/categories, rich cards, expanded destinations, Andromeda children, universe overview, understandable directions, and consistent time controls.

### Gate B — the signature experiences are complete

Implement size comparison and Surprise me first. Reuse their selection/card infrastructure for four tours and one SpaceX story. Complete saving/history and sharing.

Each experience must have entry, loading, success, failure, back/exit, responsive layout, and verified content. Do not leave a grid of polished cards leading to unfinished screens.

### Gate C — the product is ready to show

Complete Earth-sky view, contextual learning/recommendations, accessibility, XR integration, performance work, and final visual consistency. Resolve any conflicts among modes.

Run real production builds and inspect the built app where practical, not just hot-reload development. Test the actual deployment/HTTPS path if available.

### Gate D — stop adding and verify

Stop feature expansion once selected scope works. Spend the remaining effort fixing broken states, content errors, rendering glitches, loading behavior, and demo continuity.

Do not add new speculative features during this gate. If required work remains blocked, give a precise honest status rather than declaring a perfect product.

## 23. Verification matrix

Use existing checks plus focused tests for meaningful risk. Do not write trivial tests that mirror styling or repeat implementation.

| Area | Required evidence |
|---|---|
| Existing functionality | Core routes, search, layers, and 3D interaction survive the upgrade. |
| Locked mode | Every pan input is blocked while orbit/centered zoom and UI scrolling remain usable. |
| Mode changes | Back, reset, selection changes, tour exit, route entry, comparison exit, and XR exit restore sensible state. |
| Comparison | Unit conversion, radius/diameter handling, ratio, uncertainty, extreme size differences, and missing values are correct. |
| Discovery | Surprise me chooses valid eligible records, avoids immediate repetition, and recovers from load failure. |
| Tours/story | Every stop/chapter has real content, working navigation, correct labels, and valid credits. |
| Catalog | Counts exclude aliases/decorative particles; parent membership and source metadata are verified. |
| Distances | Full 3D separation, origin labels, units, zero-distance behavior, and compatible frames are correct. |
| Transfers | Model time/curve/arrival agree; Earth–Mars ideal duration is plausible; unsupported pairs fail honestly. |
| Time | Explicit pause stays paused; hidden tabs do not jump; clocks remain independent; validity bounds hold. |
| Universe overview | Display compression cannot alter physical calculations; picking, labels, zoom, and local return work. |
| Sky view | Directions/epochs are consistent and no unsupported local-horizon claim is made. |
| Share | Fresh-tab restoration, bad/old links, clipboard denial, local-only URLs, and image export are handled. |
| Persistence | Favorites/history survive reload; bad or old local data cannot crash startup. |
| Imagery | Real assets load, crops work, source associations are correct, and failures preserve layout. |
| Mobile | Search, sheets, keyboard, nested menus, comparison, tour controls, and map gestures work at narrow widths. |
| Accessibility | Main flows work by keyboard; focus and reduced-motion behavior are checked. |
| XR | Capability/session failure, selection, state preservation, tracked pose, and exit are checked; device status is explicit. |
| Performance | Measure the delivered app/data on named environments; do not invent FPS or universal performance claims. |
| Build | Available type/build/lint checks pass or remaining failures are identified specifically. |

Capture and inspect actual rendered views:

1. Initial locked Earth.
2. A selected ringed planet or other visually distinct body.
3. Dense stellar neighborhood with readable labels.
4. Milky Way overview.
5. Andromeda interior and a selected child.
6. Observable-universe bubble.
7. Nested category search.
8. Rich image card and expanded gallery.
9. True-scale size comparison with an extreme-ratio case.
10. Surprise me result.
11. Tour and SpaceX story chapters.
12. Orbital-transfer preview.
13. Earth-sky view.
14. Phone discovery/card/directions layouts.
15. XR scene if hardware/simulator access permits.

Fix obvious visual defects before completion: clipped pills, blank images, excessive glow, illegible labels, huge unused panel space, overlays hiding controls, camera clipping, unexpected pans, and broken return navigation.

## 24. Final demo and delivery

Prepare a repeatable approximately two-minute demonstration, adjusted to actual measured transition/loading times:

- Open on the polished Earth view and show orbit-only inspection.
- Open a compelling object through category search or Surprise me.
- Show the image-led highlights and size comparison.
- Enter Andromeda and select an internal feature.
- Zoom to the Observable universe overview.
- Show the strongest short SpaceX story moment or validated transfer.
- Save/share a view and briefly show VR if it is genuinely ready.

Do not force every feature into the presentation. Choose the smoothest verified path and retain alternate examples if an external provider is unavailable.

Update README and maintained product documentation with actual commands, features, assumptions, sources, assets, deployment details, and device test status. Keep a small internal content/source manifest and the implementation checklist so teammates can continue safely.

The final implementation report should state:

- What was completed.
- Actual catalog and image coverage.
- What was tested, with browser/device context.
- Any remaining blocked or unverified features.
- The actual local and deployed URLs, where available.
- Exact steps for the team to run the demo and test Vision Pro.

Do not produce fabricated test results, placeholder public URLs, invented astronomy, unverified mission achievements, or unsupported sponsor claims.

## 25. Deliberate scope exclusions

The following are deliberately excluded because they would dilute this finishing pass:

- Universal executable spacecraft mission planning.
- Every known astronomical object or a fabricated complete universe.
- A full N-body dynamics engine.
- Photorealistic volumetric simulation for every nebula.
- Multiplayer, accounts, social feeds, comments, leaderboards, or payment systems.
- A native visionOS application or passthrough-camera dependence.
- A full Earth terrain/street map or planetary GIS platform.
- Camera-based constellation AR and phone compass calibration.
- Unlimited AI-generated facts or imagery used as scientific evidence.
- A large collection of fictional vehicles or a restored Custom Speed control.
- Video export before still-image sharing works reliably.
- Broad unrelated sponsor integrations.
- A marketing landing page that delays access to the actual map.

## 26. Reference starting points

Verify current documentation, schemas, and asset terms before integrating. These are starting points, not evidence that an integration already works:

- JPL Horizons API: https://ssd-api.jpl.nasa.gov/doc/horizons.html
- JPL approximate planetary positions: https://ssd.jpl.nasa.gov/planets/approx_pos.html
- JPL Small-Body Database API: https://ssd-api.jpl.nasa.gov/doc/sbdb.html
- JPL educational transfer model: https://www.jpl.nasa.gov/edu/resources/lesson-plan/lets-go-to-mars-calculating-launch-windows/
- NASA transfer explanation: https://pwg.gsfc.nasa.gov/stargaze/Smars1.htm
- NASA Exoplanet Archive: https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html
- OpenNGC: https://github.com/mattiaverga/OpenNGC
- NASA imagery API: https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf
- Official SpaceX imagery: https://www.flickr.com/photos/spacex
- WebKit spatial web support: https://webkit.org/blog/15865/webkit-features-in-safari-18-0/
- WebKit natural input: https://webkit.org/blog/15162/introducing-natural-input-for-webxr-in-apple-vision-pro/
- WebXR specification: https://immersive-web.github.io/webxr/
- NASA observable-universe scale: https://www.nasa.gov/science-research/astrophysics/how-big-is-space-we-asked-a-nasa-expert-episode-61/

Start by inspecting and running the current application. Then implement the prioritized scope through real visual review, integration, and verification.

