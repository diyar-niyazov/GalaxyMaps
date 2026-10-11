# GalaxyMaps — Cursor upgrade prompt

You are the lead engineer and product designer working inside our existing project. Implement the upgrades below. Continue through integration, visual review, and verification; a plan alone is not the deliverable.

## 1. Existing project and latest decisions

The previous SpaceMaps-Codex-Prompt.md has already been implemented. The app runs locally at http://localhost:5173/ and already supports dragging a genuinely three-dimensional map. Inspect the repository, AGENTS.md, package scripts, installed dependencies, current data providers, renderer, routing, and deployment before editing. Preserve working features and the current stack. Do not scaffold a replacement app or downgrade the 3D map.

Rename the product to **GalaxyMaps** throughout visible UI, search placeholders, browser title, metadata, appropriate assets, and maintained documentation. Check branded storage keys before changing them; migrate persisted preferences if necessary. Keep identifiers and external URLs stable where renaming would break them. Do not rewrite old third-party citations or historical records simply because they contain the former name.

The product remains a familiar, polished navigation interface for exploring space. Keep the light Google Maps-inspired sidebar, dark interactive universe, destination search, directions, real data, and continuous zoom. Use our own identity.

These latest decisions supersede conflicting parts of the old prompt:

- Full 3D already exists and must remain.
- Selecting or focusing an object enters a **Locked object** view closely matching the supplied Google Earth globe reference: orbit around the selected object, disable panning, and present it against a beautiful immersive star background. This is a required interaction, not an optional camera effect.
- Planet images now work. Preserve them and expand the visual experience.
- The vehicle dropdown has exactly **Light speed** and **Voyager 1**. Remove Custom Speed and the previous extra transport options from the user-facing chooser.
- Search supports typed queries and nested category browsing.
- Keep the existing region bubbles at the top. Group overlapping regions when useful, without replacing this navigation with an unrelated region selector.
- Add many more real destinations, especially inside the Milky Way and Andromeda, plus other galaxies, black holes, asteroids, and a broad range of celestial objects.
- Every object uses an attractive, image-led information card with concise highlights and deeper sourced details.
- Images and additional catalog data may load over the internet as needed.
- The fully zoomed-out view shows our included galaxies inside a labeled **Observable universe** bubble.
- A **Play time** control animates supported physical motion. This is different from merely rotating the camera.
- Nearby planetary journeys should offer simple modeled orbital trajectories. Long-distance journeys can retain straight-line comparisons.
- The same website must work on laptop and phone, and support immersive WebXR in Safari on Apple Vision Pro where available.
- Gemini explanations are a future extension. Do not let adding Gemini block these upgrades; preserve an existing working guide integration.
- A moving 3D spacecraft model is optional.

The user’s top delivery priorities are **expanded destinations, dropdown navigation, and the observable-universe view**. Visual polish applies throughout. Complete these before spending substantial time on optional models or new AI integrations. Do not silently omit the required simulation, trajectory, or WebXR work; report actual limitations precisely.

## 2. Screenshot audit: what to improve

The supplied screenshots show these specific issues. If the screenshot files are unavailable in this checkout, use this audit and inspect the running app yourself.

1. The opening Earth-and-Moon view leaves most of the map empty while Earth appears as a tiny marker. Give the Home view a deliberate, beautiful Earth close-up. Keep Earth & Moon as a separate useful system-wide framing.
2. The stellar-neighborhood view is overwhelmed by thousands of similarly bright points. Labels disappear into the particle field. Improve density, apparent size, opacity, and label hierarchy before adding more rendered points.
3. The Milky Way resembles a few luminous rings with a central glow. Improve its bar, spiral structure, dust, depth, and perspective using a restrained, clearly labeled reconstruction.
4. The sidebar spends substantial vertical space on introductory text, four large text-only trip tiles, and many category pills. Bring photography and useful destinations higher on the screen.
5. Region pills extend offscreen with a partially clipped pill. Provide obvious overflow behavior and predictable access to every region.
6. Directions begin with a crowded horizontal vehicle strip. Replace it with one compact dropdown near the origin/destination fields.
7. The existing information bar is visually heavy and truncates text. Use a quieter compact status treatment, with detailed provenance in a useful expandable area.
8. Search mixes attractive destination names with generic icons. Use real thumbnails where available while preserving fast, readable results.
9. One screenshot shows Earth as “You are here” with “1 AU.” Check what that number means. A distance from the selected Earth origin should be zero; an orbital radius or heliocentric distance needs its own explicit label. Audit all distance labels for a consistent reference point and epoch.
10. Phrases such as “Good distances” are vague. Replace them with specific metadata or put uncertainty and provenance under a clear Sources and model details control.

## 3. Visual direction and layout

Make this feel like a finished map product whose content is extraordinary. Rich imagery, composition, smooth interaction, and readable hierarchy should create the impact.

### Desktop

- Use a sidebar around 380–420 CSS pixels on spacious laptop screens, adapting to available width. Do not derive CSS dimensions directly from screenshot pixel dimensions.
- Use a compact search area, a short title/subtitle, a category browser, and immediately visible photographic destinations.
- Turn text-only suggested trips into a small set of image-led journey cards. Keep navigation one click away; no marketing landing page.
- Let the map dominate. Provide a sidebar collapse button and use the unobscured canvas area when fitting a destination or route.
- Maintain a consistent type scale, 8-pixel spacing rhythm, soft borders, controlled shadows, and moderately rounded corners. Use strong dark text on white surfaces and one consistent blue action/route accent.
- Keep default prose short. Avoid stacks of explanatory paragraphs above the map or destination content.
- Use real images with intentional crops and consistent aspect ratios. Avoid using a distant galaxy image as a texture for an unrelated object.

### Map rendering

- On Home, frame Earth as a substantial textured sphere with plausible illumination, restrained atmosphere, and a useful scale context. Avoid a tiny Earth dot centered in a blank screen.
- At system scale, maintain orbit visibility and appropriately enlarged markers. At close range, transition to textured meshes. Preserve physical centers and calculate distances independently of visual radii.
- In the stellar view, make most background points dimmer and smaller; reserve stronger contrast for selected, nearby, or important objects. Use a screen-space density budget and smooth level-of-detail transitions.
- Give readable labels to a limited prioritized set. Selected object and route endpoints win conflicts; remaining labels use collision handling and gentle fades. Preserve searchable records even when their labels or sprites are culled.
- Use meaningful stellar color variation where supported. Decorative stars remain a clearly separate rendering layer and never become fake searchable catalog entries.
- Improve the Milky Way with a central bar, irregular spiral arms, dark dust lanes, thickness, and restrained lighting. A reconstruction must stay labeled as one.
- Use distinct silhouettes or subtle symbols for black holes, nebulae, clusters, small bodies, and galaxies. Zoom into richer imagery or geometry only when it improves the experience.
- Use bloom sparingly; avoid white visual noise, opaque glow clouds, and illegible labels.
- Keep Realistic and Atlas layers coherent. Selection, positions, filters, and routes survive switching layers.

### Locked object view — match the supplied globe reference

The latest reference is a Google Earth screenshot: a detailed illuminated Earth floats against a deep black sky with fine stars and a faint, softly textured Milky Way band. The globe remains the visual focus, with restrained floating controls and generous space around it. Match that composition, interaction clarity, and visual finish as closely as possible while retaining GalaxyMaps branding and our useful destination cards.

**This is a required camera mode.** Implement distinct Explore, Locked object, and Route framing states so free navigation cannot accidentally leak into an object inspection.

#### Enter, orbit, and exit

- Selecting a destination from search, clicking a catalog object, or pressing its Focus action smoothly enters Locked object mode. Use the same behavior for the Home Earth close-up. Merely opening a search menu does not move the camera.
- Make the selected object's center the fixed orbit pivot. Center it in the usable map area, accounting for the sidebar or phone sheet. Frame its visible extent, including rings or a galaxy/nebula's extent, with comfortable margins.
- Dragging rotates the camera around the object in yaw and pitch. Keep the object anchored in the frame with smooth, restrained inertia and sensible pitch limits. Never turn a drag into lateral translation while locked.
- Disable all application panning paths in this mode: right/middle drag, modified mouse gestures, two-finger translation, keyboard panning, and any conflicting handlers. UI controls and card scrolling must continue to work normally.
- Wheel/pinch and plus/minus may zoom toward or away from the same pivot within useful limits. Disable cursor-centered zoom that shifts the target. Do not cross through the object's surface or let excessive zoom leave it as a tiny lost speck.
- Scrolling to the maximum locked zoom-out distance does not silently unlock the object. Provide an obvious **Back to explore** or **Unlock view** control, a subtle **Locked on [object]** indicator, and a **Reset view** action.
- Back to explore restores the saved broader exploration view and its normal pan/zoom controls. Reset view only restores the current object's initial framing and orientation. Esc follows the current UI hierarchy: close an open menu first, then exit the locked view when appropriate.
- Selecting another object transitions directly to its locked view. Choosing a region or Explore inside deliberately enters the relevant exploration frame. Opening a route deliberately enters Route framing to show both endpoints; offer an easy way back to the destination's locked view.
- If Play time moves the selected body, follow its updated center without losing the user's orbit angle or zoom. Body spin, time simulation, optional auto-orbit, and manual inspection remain separate controls. Locking onto an object never starts unwanted animation.

#### Background and visual treatment

- Give locked views a high-quality panoramic star environment with a deep near-black base, delicate points of light, restrained brightness variation, and a subtle Milky Way band where appropriate. It should feel like the supplied reference rather than the earlier noisy, uniformly bright particle cloud.
- Use a suitable licensed astronomical panorama or a carefully prepared, labeled reconstruction. Keep image credits and background assumptions in the existing provenance/details UI. Do not extract Google's imagery, logos, or interface assets from the screenshot.
- Render the environment as a distant sky sphere/cubemap or equivalent. It should respond coherently to camera orientation, have no visible seams or flat billboard edges, and avoid artificial nearby-star parallax or visible translation when zooming around the object.
- Keep this scenic sky separate from physical catalog geometry, clickable destinations, and distance calculations. Avoid drawing the same stars twice at distracting brightness. A panorama captured from Earth is not an accurate sky from every other galaxy; label illustrative backgrounds appropriately or use a suitable contextual alternative.
- In the Realistic layer, show sharp object textures, plausible directional lighting, a soft day/night transition, and atmosphere, clouds, rings, or surface detail where appropriate. Keep highlights controlled and the dark side readable without making every object glow.
- Give galaxies, nebulae, and clusters the same centered inspection interaction, adapting imagery/geometry to the object's nature. Keep astronomical photographs labeled as observations and any reconstructed 3D depth explicit.
- Fade nonessential neighboring labels, orbit lines, and background clutter during close inspection. Keep the selected name, useful controls, and access to its rich information card. Route-specific overlays return in Route framing.
- Keep the background subtle enough that Earth, Saturn, a selected nebula, or a galaxy remains the first thing the viewer notices. On phones and XR, load an appropriately sized environment texture rather than an unnecessarily large asset.

In the Atlas layer retain the same lock/pivot behavior with its simplified visual styling. The most photographically rich reference-matching presentation belongs to Realistic mode.

**Vision Pro adaptation:** lock the selected object in the spatial presentation and disable application-level panning of that presentation, but preserve normal head tracking and physical movement. Never freeze, recenter continuously, or overwrite the viewer's tracked pose to enforce a screen-centered object. Use explicit inspection/recenter controls instead; desktop auto-orbit remains off in immersive VR.

### Region navigation

Keep top region bubbles. Retain quick access to the current region and major scales. Group close relatives into small click/tap dropdowns, for example Earth & Moon / Inner planets / Solar System, or Nearby stars / Stellar neighborhood. Include discoverable access to Andromeda, Local Group, more galaxies, and Observable universe.

Do not introduce a row of dozens of galaxies. Put an individual galaxy’s children inside its contextual browser and information card. On narrow screens use a clearly scrollable pill strip and an accessible overflow menu. No inaccessible clipped controls.

## 4. Beautiful, fact-rich object cards

Use one flexible destination-card system across all supported categories. Every selected catalog object should have a meaningful card; completeness depends on real available data.

Recommended card structure:

1. A large hero image, approximately 16:9 or 3:2, with a gallery affordance when multiple real images exist.
2. Name, useful alternate name, object type, and parent system/galaxy.
3. One short, sourced sentence explaining what makes it interesting.
4. Three to six compact fact tiles, chosen for that object type.
5. Clear actions: Focus, Directions when supported, Explore inside for a system/galaxy, and View images.
6. Three short “Why it’s interesting” highlights.
7. Nearby or related destinations and relevant mission cards.
8. Expandable Details, Images, and Sources areas for deeper reading.

Examples of useful facts:

- Planets/moons: distance from the selected origin, size, rotation/orbital period, atmosphere or surface feature, important missions.
- Stars: distance, spectral class, temperature/radius when sourced, system membership.
- Clusters/nebulae: subtype, host galaxy, approximate extent, distance with its definition, a notable observed feature.
- Black holes: host system, mass estimate where available, evidence or observation type, and imagery classification.
- Galaxies: distance definition, morphology, approximate size, and known features available to explore.
- Asteroids/comets: body class, sourced size estimate, orbit-related facts, mission encounters.
- Missions/vehicles: operator, role, historical or planned status, relevant destinations, and sourced images. Keep vehicle specifications distinct from astronomical object facts.

Use dynamic labels for units and uncertainty. Do not fill missing data with invented values or generic claims that look sourced. Avoid repeating the same description in multiple places. A strong first view should be simple, while opening details reveals substantial information.

Prepare the card/context interfaces so a later Gemini or existing guide integration can receive the selected object’s facts and references. Do not label static sourced summaries as live AI output.

## 5. Search and nested category dropdowns

Replace the large category-pill block in the sidebar with a compact **Browse categories** control integrated with search. Typing always remains available, including while browsing.

Use a hierarchy such as:

- Solar System bodies: planets; dwarf planets; moons; asteroids; comets; trans-Neptunian objects.
- Stars and systems: stars; multiple-star systems; exoplanet hosts; exoplanets.
- Stellar remnants and compact objects: white dwarfs; neutron stars and pulsars; black holes; supernova remnants.
- Star clusters and associations: open clusters; globular clusters; stellar associations.
- Nebulae: emission/H II regions; reflection; dark; planetary; other supported classifications.
- Galaxies: spiral/barred spiral; elliptical; irregular/dwarf; other supported types.
- Large-scale structures: galaxy groups; galaxy clusters; other genuinely supported structures.
- Spacecraft and missions: probes; space telescopes; human spaceflight; SpaceX vehicles and mission stories.

This is a navigation taxonomy, not a claim that each object fits exactly one scientific bucket. Support canonical types and additional tags without duplicating object identities.

Required behavior:

- Categories expand into subcategories and then searchable results, with a breadcrumb/back action.
- Use click, touch, and keyboard navigation; never require hovering to open a submenu.
- On phone, use a drill-down sheet instead of flyout menus that overflow the viewport.
- Every supported catalog type is reachable. Categories with no loaded results show an honest load or empty state; do not advertise fabricated availability.
- Search names, aliases, common catalog identifiers, and object types. Normalize case/spacing and support useful fuzzy matching.
- Prefer exact or recognizable matches over obscure substring matches. Display thumbnail, name, type, parent location, and a correctly labeled distance when known.
- Category browsing filters the result list and emphasizes matching map markers without hiding the selected object or an active route. Explain any broader map filtering through a visible filter chip and clear action.
- Selection, Esc/back, keyboard focus, and clicks outside the popover behave predictably. Use appropriate accessible combobox/tree/list semantics.
- Search and browser counts refer to real records, not decorative particles.
- Debounce online search, cancel stale requests, handle rate limits, and virtualize long lists if needed.

## 6. Expand the real catalog and support galaxy interiors

First inventory current counts by type, region, routable records, and image coverage. Expand the actual dataset substantially. Do not merely increase the background star count.

Planning targets, to revise only with a specific source or performance reason:

- Approximately 250–500 curated, interesting destinations spanning the supported categories, with useful sourced cards.
- At least 75–150 especially polished image-rich highlights, including the principal planets, moons, important nebulae, clusters, black holes, and galaxies.
- A larger searchable background catalog loaded incrementally where appropriate. Preserve or expand the existing stellar catalog after fixing its visual density.
- Around 40–80 recognizable galaxies, including useful Local Group coverage and more distant highlights where data supports them.
- At least 10–20 verified features associated with Andromeda, plus additional internal features for other well-supported nearby galaxies where feasible.

These are implementation targets, not permission to fabricate entries. Report actual delivered counts and gaps. Prioritize strong category coverage and rich visual destinations over nominal totals.

Examples to investigate and source:

- Solar System: major moons, recognized dwarf planets, Ceres, Vesta, Bennu, Ryugu, Eros, Itokawa, Halley, and 67P.
- Milky Way: Sagittarius A*, Cygnus X-1, Orion, Eagle, Carina, Lagoon and other nebulae; Crab and other supernova remnants; Pleiades, Hyades, Omega Centauri, and well-known globular clusters; supported exoplanet systems and pulsars.
- Andromeda: its nucleus, NGC 206, G1/Mayall II, and other verified clusters or stellar features from suitable catalogs. G1 belongs to Andromeda’s halo; do not force every object into a thin disk. M32 and M110 are companion galaxies, not internal star clusters.
- Other galaxies: Triangulum, the Magellanic Clouds, M81/M82, M87, Centaurus A, Sombrero, Whirlpool, and other cataloged examples. Known internal features can include suitable star-forming regions or clusters where membership and coordinates are supported.

When selecting Andromeda or another supported galaxy, **Explore inside** should smoothly frame its local scene, reveal verified children, and show a contextual destination list. Support a breadcrumb such as Universe / Local Group / Andromeda / selected feature.

Physical data rules:

- Use stable IDs, aliases, category tags, host/parent IDs, coordinate frame, units, epoch, distance definition, uncertainty, provenance, and route capability.
- Right ascension and declination without a usable distance do not establish an accurate 3D position.
- Retain objects with partial data as explorable records. Make approximate placements or unavailable routes explicit.
- For a feature inside another galaxy, record whether its depth is measured, unknown, or approximated using its host. A labeled host-distance placement is acceptable for display; it must not silently become a precise internal travel distance.
- Do not invent individual planets, stars, or depths inside Andromeda to fill its scene.
- Preserve host membership, orientation, and uncertainty. Carefully handle transforms between galaxy-local coordinates and the shared physical frame.
- Keep sourced positions distinct from visual offsets, expanded glyph sizes, and schematic universe transforms.
- Do not mix redshift, luminosity distance, angular-diameter distance, and comoving distance as interchangeable Euclidean coordinates.
- Very distant galaxies can be exploration-only when a valid routing model is absent.
- Remove duplicates and rejected/nonexistent catalog entries; keep aliases to their canonical objects.

Use the existing valid providers first, then evaluate NASA/JPL Horizons and SBDB, the NASA Exoplanet Archive, OpenNGC, and appropriate SIMBAD/VizieR/NED or other primary catalog services. Verify current schemas, access conditions, and licenses. OpenNGC is useful for deep-sky names, classifications, and sky positions; it is not a complete 3D distance database. Keep its attribution and applicable data license with redistributed derivatives.

Implement reproducible ingestion and small region/category bundles with versioned caches. Load further data on demand. The main map and core highlights must remain usable when a provider is slow or unavailable. Respect upstream limits and avoid querying external services per rendered frame.

## 7. Real imagery and SpaceX content

Use many authentic space images, with well-chosen crops, captions, and credits. Prioritize NASA, ESA, Hubble, Webb, JPL, and other appropriate primary archives. Use official SpaceX imagery and source material for SpaceX content, checking each asset’s applicable terms.

For each image store the asset URL or local file, source page, credit, applicable license/usage terms, object association, imagery type, and alt text. Distinguish observed images, processed/composite observations where relevant, scientific illustrations, and AI reconstructions. Do not describe a false-color scientific image as a natural-color photograph.

Use a consistent image component with responsive sizes, loading states, useful failure fallbacks, gallery viewing, and credits. Download/cache permitted core images to avoid fragile hotlinks. Use thumbnails in search and higher resolution only in cards or selected close views. Ensure cross-origin textures can actually load in WebGL; use permitted local assets or an allowlisted server path when needed, not an unrestricted image proxy.

Create a prominent, coherent **SpaceX / Human spaceflight** collection:

- Several high-quality visual cards, ideally 6–10 where valid material is available, covering Falcon 9, Falcon Heavy, Dragon, Starship, and selected verified missions or milestones.
- Connect Earth-orbit content to Dragon/ISS stories and Mars exploration content to clearly dated SpaceX plans or engineering context.
- Use beautiful launch, vehicle, and orbital photographs within relevant galleries and featured exploration cards.
- Treat a reusable vehicle model or mission story as content unless a specific flight object has reliable ephemerides. Do not put a generic Starship at an invented current space location.
- Verify mission dates and status. Keep historical facts, plans, and completed achievements distinct.
- Do not invent a universal Starship/Falcon cruise speed or silently add them to the two-option travel dropdown.
- Keep the primary brand GalaxyMaps. Imagery and relevant content should provide the SpaceX connection without implying endorsement or inventing sponsor eligibility.

Preserve a functioning Grok integration if present. SpaceX imagery or a future Gemini feature does not by itself establish a Grok API integration. No new API credentials are required to deliver the core upgrade.

## 8. Directions, the vehicle dropdown, and orbital trajectories

Replace the horizontal transport strip with one accessible dropdown labeled **Travel mode** or **Compare at**, placed beside/below the endpoint controls. It contains exactly Light speed and Voyager 1, with a concise icon and description. The chosen benchmark updates deterministic comparison results immediately. Keep the existing sourced Voyager reference-speed assumption and reference frame, or correct them from an authoritative source if needed.

Keep origin, destination, swap, Add stop, fit-to-route, and route preview easy to find. Use clean route cards with a strong duration, secondary distance, model name, and expandable assumptions.

Implement an explicit route-model distinction:

### A. Idealized orbital transfer for supported nearby planetary pairs

The map should draw an actual calculated transfer ellipse, not an arbitrary curved spline used to disguise a straight-line calculation. Make Earth–Mars the required validated example and generalize to other eligible heliocentric planet pairs after validation.

Use a simple two-body Hohmann-style educational model with circular, coplanar planet orbits and appropriate departure alignment. Calculate the trajectory, duration, and moving target from the same model. For orbital radii r1 and r2, a = (r1 + r2) / 2 and transfer duration = pi * sqrt(a^3 / muSun). Earth–Mars should be approximately 259 days with suitable constants.

Use an explicitly identified idealized scenario if the current epoch lacks the needed alignment. Show departure and arrival positions and make the target reach the endpoint at arrival. Advance along the ellipse consistently with orbital time; do not use uniform angle steps and call them Keplerian motion. Show faint orbit traces, a restrained blue transfer arc, clear endpoints, and a small moving marker.

The orbital-transfer flight time is determined by the orbital model. It must not become arc length divided by the Voyager speed or by c. Selecting a comparison vehicle must not falsely change the physics of a transfer orbit.

UI resolution: show the transfer’s own duration as the primary result. Keep the two-option vehicle dropdown in a clearly separate speed-comparison section for the same selected endpoints. Label the comparison as a direct-distance benchmark, and do not portray light as following the spacecraft transfer ellipse. For supported planet pairs, default the main visualization to Orbital transfer; provide the existing comparison view as an explicit alternative.

Handle inward transfers, equal orbit radii, invalid data, and unsupported pairs. Earth–Moon and arbitrary small-body missions need their own valid assumptions; do not pass them through a Sun-centered planet-transfer formula. If an orbital model is unsupported, say so and keep the destination explorable. A separately labeled speed benchmark can still be available without drawing an invented local flight plan.

### B. Long-distance cruise comparisons

For supported interstellar and nearby intergalactic routes, preserve straight-line 3D separation and distance/speed comparisons. Keep a tasteful thin blue route, sensible endpoint markers, and camera framing that respects the open sidebar. This is the user-approved straight-line case.

Preserve the exclusions for acceleration, braking, gravity, and moving targets, with concise expandable wording. Do not label a comparison “fastest route” without an actual optimizer. Do not enable naive distance/c routing to arbitrary high-redshift destinations or to the observable-universe boundary.

Keep model outputs explicit: route kind, physical distance when defined, modeled flight time, optional independent comparison time, epoch/scenario, and assumptions. A generic timeSeconds field must not ambiguously mix different models.

An actual 3D rocket/probe along the route is optional after the path and math work. A clean marker is enough. If implemented, use a suitable probe appearance for Voyager; do not depict Voyager as a Falcon rocket or a light benchmark as a physical spacecraft.

## 9. Play time and optional camera orbit

The user wants the universe to feel alive, with motion caused by advancing simulated time. A camera orbit alone does not satisfy this feature.

Add a small persistent timeline/control group with **Play time / Pause**, **Reset time**, the simulated date or elapsed time, and a small set of contextual time-rate presets. These are simulation rates, not the removed Custom Speed travel option.

Behavior:

- Start paused. Pressing Play arms playback.
- Pause temporarily during active dragging, searching, or other direct interaction; resume after a short idle delay only if playback remains armed.
- Pressing Pause explicitly disarms playback. It must not restart by itself afterward.
- Make the distinction between playing, temporarily paused for interaction, and stopped understandable without a wall of text.
- Pause when the page is hidden and avoid large time jumps when it becomes visible again. Honor reduced-motion preferences; motion remains user-controlled.
- Keep flight preview, exploration time, and camera orbit as separate state. Starting a transfer preview uses its own scenario clock and freezes unrelated exploration motion so endpoint positions do not drift unpredictably.

Motion model:

- In the Solar System, use the existing valid ephemeris path, sampled cached vectors, or a documented approximate orbital model. Move supported bodies along their orbits and rotate textured bodies using sourced periods where practical.
- Respect the model’s time-validity range. Never extrapolate a limited planetary ephemeris millions of years while labeling it accurate.
- Use meaningful speed presets for the current scene; days for planetary motion and much larger illustrative time scales for galactic dynamics.
- At stellar/galactic scales, implement a lightweight, clearly identified approximate motion visualization only where an appropriate model exists. For example, internal galactic rotation may use an illustrative differential-rotation model; unknown detailed stellar trajectories remain unknown.
- Do not rotate all galaxies around Earth or rotate the whole universe as one physical object. An individual galaxy’s internal motion and a camera orbit are different.
- Keep any illustrative large-timescale motion separate from catalog-epoch coordinates used for precise facts and route calculations. Surface the relevant snapshot/model plainly.
- Avoid building an N-body simulator for this update. Spend effort on coherent motion, controls, and visual quality.

An optional **Orbit camera** toggle may slowly orbit the current focus on desktop/phone while idle. Keep it separate from Play time and optional if time is tight. Disable automatic camera/world-orbit motion on entering immersive VR; headset tracking owns the viewer pose.

## 10. Observable-universe overview

Extend continuous zoom to a final overview containing the galaxies included in our catalog, surrounded by a beautiful, subtle bubble with the readable label **Observable universe** inside it. Include a direct region-bubble shortcut as well as scroll/pinch access.

Requirements:

- Use a transparent spherical boundary with a restrained rim, not an opaque shell that hides galaxies. It must not block picking objects inside it.
- Represent the observable region centered on Earth/the observer. This is an informational boundary, not a physical wall or a navigable destination.
- Use a sourced approximate current radius around 46 billion light-years, with the adopted cosmological convention stated in details. Do not confuse radius with diameter or light-travel age with present distance.
- Show our actual included galaxies with useful level-of-detail and selection, plus a small “Selected catalog” or similar label. Do not imply every galaxy in the universe has been mapped by the app.
- Our nearby galaxies would collapse into a tiny area at a literal universe-wide linear scale. Solve this intentionally: transition smoothly into a **Schematic overview — logarithmic distance** display, preserving angular directions while compressing radial distance. Clearly label that display. Alternatively retain a true-scale option and a local-detail inset if straightforward, but keep the overview useful.
- Keep physical coordinates and calculations unchanged. The schematic rendering transformation must never feed back into route distances or object records.
- A uniform linear scale bar is invalid across a nonlinear overview. Use labeled distance bands or a relevant scale explanation there, then restore a normal scale bar in locally linear scenes.
- Selecting a galaxy should smoothly return to its appropriate local physical frame and enable exploring its supported children. Preserve selection during the transition.
- No invisible zoom barrier before the bubble, clipping artifacts, sudden empty scene, extreme depth flicker, or opaque geometry enclosing the camera.
- A cosmic-web illustration is optional. The requested bubble and current galaxy catalog are the required scope; decorative structures cannot become fake observed objects.

## 11. Phone, laptop, and Apple Vision Pro

Deliver one responsive web application with shared data and scene logic. A native visionOS app is not required.

### Phone and ordinary browsers

- Use a floating top search control and a bottom sheet for results, details, and directions. Support collapsed/half/full sheet states where practical.
- Keep map interaction accessible when the sheet is partly open. Respect safe areas and avoid hijacking scrolling inside cards.
- Provide pinch zoom, touch rotation, accessible tap targets, predictable back behavior, and reduced-motion settings. Touch panning is available in Explore mode and disabled in Locked object mode, which keeps orbit and centered zoom.
- Adapt dropdowns to sheets or drill-down panels. Avoid hover-only actions.
- The normal website must work fully without WebXR. Do not assume mobile Safari has the same immersive capabilities as Vision Pro.

### Immersive WebXR

Safari on visionOS supports immersive-vr WebXR; verify current documentation and the project’s installed renderer/framework before integrating. Use progressive enhancement and actual capability detection.

- Check navigator.xr and isSessionSupported('immersive-vr'); handle rejection or session-start failure gracefully. Request a session from a user gesture through an **Enter VR** button.
- Use HTTPS for a headset-accessible test/deployment URL. The laptop’s localhost:5173 URL refers to the headset itself when opened there. A plain HTTP LAN address is not a substitute for a secure XR origin.
- Use the existing deployment path or document a working trusted HTTPS preview setup. Do not invent a public URL or claim deployment without performing it.
- Reuse the astronomy model and suitable rendering assets in an XR scene with sensible meter-based presentation scale and camera-relative/local coordinates.
- Start in a comfortable stationary presentation of the current region or selected object. Users can look around and select destinations. Use explicit focus/recenter/scale controls rather than forcing flight or continuous scene rotation.
- Support Vision Pro’s transient-pointer interaction: inputs can appear only during a pinch. Handle input-source lifecycle and select events; do not assume persistent game controllers or fixed input indices.
- Make optional hand tracking genuinely optional. Do not require it merely to select an object.
- Normal HTML sidebars do not automatically become usable inside an immersive session. Provide a minimal readable spatial card and essential in-scene controls for selection, focus, scale, back, and exit. Reuse card data rather than duplicating the catalog.
- Do not require a full virtual keyboard in VR for this milestone. Users can select/search a destination before entry and browse featured objects/children through spatial controls inside VR.
- Preserve the selected object, route, and normal-page state when entering and exiting. Clean up session listeners and GPU resources.
- Support ordinary browser mode on Vision Pro as well. Do not depend on passthrough AR, private camera access, or universal DOM-overlay support.
- Adapt resolution, textures, star density, and effects for sustained stereo rendering. Desktop effects must not be required for usability.

Use a renderer-appropriate XR animation loop. Keep XR view matrices owned by the runtime; desktop camera tweens or auto-orbit must not overwrite headset tracking. A simulated planet may rotate while the observer remains stationary.

Document an actual Vision Pro smoke test. If hardware or a simulator is unavailable, deliver the integration and report “headset validation pending,” with exact steps for the team. Desktop tests or an Enter VR button are not evidence of a completed headset test.

## 12. Implementation and performance

Inspect before choosing architecture. Reuse existing search, state, rendering, and physics modules where sound. Make focused refactors and keep a working app after each phase.

Useful boundaries, adapted to the actual project:

- Catalog records and provider adapters.
- Image metadata/cache and reusable destination-card components.
- Category tree and search index.
- Physical coordinates, transformations, and route-model outputs.
- Exploration simulation clock and orbital motion.
- Display projection/level-of-detail, including the schematic universe overview.
- Shared desktop/mobile scene and XR presentation adapter.

Use batched points/instancing where appropriate, avoid React state updates per object per frame, and dispose of unused textures/geometry. Limit expensive transparent layers and oversized textures. Use a quality profile for laptop, phone, and XR, with measured fallback behavior.

Keep app startup light: do not fetch every full-resolution image, every catalog, or every galaxy interior before rendering the first useful view. Cache core content, load visible region data, and prefetch a small amount around the selected destination. Show useful progress and recoverable failure states.

For online data, validate provider responses, normalize units and identifiers, record retrieval/version metadata, and keep stale-but-valid cached data usable. Keep secrets server-side. Follow provider limits and licensing; do not introduce an open proxy.

## 13. Delivery sequence

1. Inspect the code, run the existing app/checks, record current feature/data coverage, and establish a brief implementation plan.
2. Apply the GalaxyMaps name, replace the vehicle strip, add nested category search, and preserve region bubbles with clear overflow.
3. Improve star-density/label handling, implement the required Locked object view with its panoramic background, and build the shared image-rich card system; preserve the working planet imagery.
4. Expand verified destinations and imagery, including Andromeda children and the SpaceX collection. Keep typed search, focus, and card selection working end to end.
5. Add the continuous observable-universe overview and navigation back into galaxies.
6. Implement Play time and the validated orbital-transfer experience, integrating route/model labels and deterministic clocks.
7. Complete responsive phone behavior and the shared WebXR presentation, then test the actual available browsers/devices.
8. Polish transitions and visual hierarchy, resolve scientific/state inconsistencies, and update documentation and demo steps.

Optional work after the above: detailed spacecraft meshes, more elaborate nebula volumes, a cosmic-web illustration, and a new Gemini integration.

Make routine reversible decisions yourself. Ask only when a concrete missing credential, access requirement, or irreducible product conflict blocks progress. If a provider fails, continue the unaffected work with honest cached/fallback content. Do not stop after implementing only the simplest rename or dropdown.

## 14. Meaningful verification and acceptance criteria

Run the project’s existing build/type/lint checks and relevant tests. Add focused tests for calculations, transforms, state, and ingestion risks; avoid tests that simply repeat CSS or implementation details.

Verify:

- Existing routes and 3D interaction still work; GalaxyMaps appears in all current user-facing brand locations.
- Only Light speed and Voyager 1 appear in the travel dropdown. Switching them updates only the appropriate comparison result.
- Every supported category is reachable through nested browsing and typed search, including aliases, empty results, keyboard navigation, and touch behavior.
- The delivered catalog actually grew. Report distinct records by type and region, rich-image-card coverage, and Andromeda child counts; exclude decorative points and duplicated aliases.
- Main planets, representative black holes, asteroids, nebulae, clusters, and galaxies open correct images and useful sourced cards.
- Selected-object and endpoint labels remain readable in the previously overcrowded stellar view. Home opens an intentional, visually compelling scene.
- Locked object mode keeps the chosen pivot fixed under mouse, touch, keyboard, and trackpad interaction; orbit and centered zoom work, every application pan path is disabled, and card/menu interaction remains usable.
- Locking, switching objects, Reset view, Back to explore, region selection, and route framing transition predictably. A moving selected body remains in focus during time playback. XR head tracking remains unrestricted.
- Inspect locked Earth and at least one other object against the supplied reference: detailed object, soft realistic lighting, subtle panoramic stars/Milky Way context, no background seams, no particle overload, and no accidental translation or clipping while rotating.
- Search distance labels have a defined origin. Earth-to-Earth is zero; AU/parsec/light-year conversions and full 3D separation remain consistent.
- Layer changes, camera rotation, exaggerated visual sizes, and logarithmic overview transformations never change physical route calculations.
- Andromeda interior selection preserves parent relationships and labels approximate depth accurately; unknown depths do not become precise route distances.
- The universe bubble appears at maximum zoom, all loaded galaxy records remain accessible, labels stay legible, picking works through the boundary, and returning to a local scene is smooth.
- Play time respects pause/idle/reset and page visibility. Frame rate does not change simulated time. Ephemeris bounds are respected. Explicit Pause never silently restarts.
- Earth–Mars transfer duration is approximately 259 days; the curve starts at departure, the destination reaches the arrival point at the modeled time, and the model does not pass through the Sun. Time progression follows the chosen mechanics.
- Unsupported transfers and distant cosmological routes show accurate capability limits without fabricated results.
- Browser/layout checks cover laptop and narrow phone widths, scrolling cards, menus, safe areas, and reduced motion.
- Failed images and network/API errors have usable fallbacks. Check the real loaded assets rather than claiming image URLs were verified from their names.
- XR capability/session errors preserve the normal app. XR entry/exit preserves state; no automatic camera rotation overrides tracking. Test look-and-pinch selection when hardware/simulator access permits.
- Measure performance with the delivered data and imagery. Report device/browser and observed results; do not invent FPS or claim real-device tests from a mock.

Inspect actual rendered screenshots after implementation. Iterate on obvious defects: clipped pills, unreadable labels, low-resolution hero images, excessive star density, unbalanced empty space, overflowing menus, crowded cards, and controls obscured by overlays.

## 15. Completion report and demo

Update the README with actual run commands, data/image provenance, relevant assumptions, the timeline behavior, route models, and the headset test/deployment procedure. Preserve any existing submission materials and update product naming where appropriate; a new deck is not required for this update.

Finish with:

- What changed and works.
- Actual destination/category/image coverage.
- Checks performed and rendered views inspected.
- Any blocked integrations or untested devices.
- Exact commands and actual local/test URLs.
- A short repeatable demo: beautiful locked Earth view with orbit-only inspection; category search for a black hole or nebula; rich image card; Andromeda and its children; zoom to Observable universe; return to Solar System and play time; show a modeled Earth–Mars transfer; enter VR if verified.

## 16. Primary references to verify during implementation

These sources informed this update prompt on October 3, 2026. Check current versions and access terms while implementing; their inclusion is not a claim that the project already integrates them.

- WebKit, Safari 18 spatial web support: https://webkit.org/blog/15865/webkit-features-in-safari-18-0/
- WebKit, Vision Pro natural input: https://webkit.org/blog/15162/introducing-natural-input-for-webxr-in-apple-vision-pro/ — useful for the interaction model; its old beta/feature-flag setup instructions are historical, so use current device guidance.
- WebXR Device API: https://immersive-web.github.io/webxr/
- JPL, approximate planetary positions and validity intervals: https://ssd.jpl.nasa.gov/planets/approx_pos.html
- JPL Horizons API: https://ssd-api.jpl.nasa.gov/doc/horizons.html
- JPL Small-Body Database API: https://ssd-api.jpl.nasa.gov/doc/sbdb.html
- JPL, educational Mars transfer and alignment: https://www.jpl.nasa.gov/edu/resources/lesson-plan/lets-go-to-mars-calculating-launch-windows/
- NASA, transfer-time explanation: https://pwg.gsfc.nasa.gov/stargaze/Smars1.htm
- NASA Exoplanet Archive TAP: https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html
- OpenNGC owner repository and schema: https://github.com/mattiaverga/OpenNGC and https://github.com/mattiaverga/OpenNGC/blob/master/NGC_guide.txt
- NASA Images API documentation: https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf
- NASA observed imagery for G1/Mayall II: https://science.nasa.gov/asset/hubble/globular-cluster-mayall-ii-in-the-neighboring-andromeda-galaxy-m31/
- Official SpaceX photographs: https://www.flickr.com/photos/spacex
- NASA, observable-universe scale: https://www.nasa.gov/science-research/astrophysics/how-big-is-space-we-asked-a-nasa-expert-episode-61/

Begin by inspecting the existing repository and the running application, then implement this upgrade through verification.
