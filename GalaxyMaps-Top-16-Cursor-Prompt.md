# GalaxyMaps — Top 16 Improvements

Implement these improvements in the existing GalaxyMaps app. Reuse working code, components, data, and assets; change only what is missing or deficient.

## 1. Beautiful initial Earth view

Open on a detailed, deliberately framed Earth that immediately invites exploration.

- Start in locked-object mode, with Earth centered in the map area remaining beside the sidebar.
- Use a high-quality Earth texture, subtle atmospheric lighting, and a quiet star background.
- Choose camera distance and lighting that make the globe clearly readable without clipping.
- Keep search and essential controls visible. Adapt framing when the sidebar or phone sheet changes size.
- Keep Home as the Earth close-up; Earth & Moon and Solar System should frame their respective systems.

## 2. Locked-object inspection

Selecting an object should provide predictable orbit and centered zoom.

- Set the object's actual center as the camera-control target. Drag orbits; scroll/pinch zooms toward that same target.
- Disable all application panning while locked, including modified drags, middle/right drag, touch translation, keyboard movement, and cursor-centered zoom that shifts the target.
- Set object-aware near/far zoom limits. Reaching a limit must not silently unlock.
- Add “Locked on [object],” Reset view, and Unlock/Back controls.
- Selecting another object retargets the lock. Region navigation and route framing explicitly leave it.
- If an existing simulation moves the object, follow its center while preserving the viewing angle and distance.
- Keep panel scrolling separate from map gestures.

## 3. Existing-app audit

Identify the actual gaps before editing.

- Read repository instructions and package scripts, then run the app.
- Inspect the renderer, camera controls, navigation state, catalog, imagery, directions, and existing comparison support.
- Check each of these 16 improvements in the browser and record a short working/missing/broken checklist.
- Distinguish real selectable catalog records from decorative particles and aliases.
- Preserve completed work and stabilize partial changes before building on them.

## 4. Reversible state transitions

Every focused experience should have a predictable way back.

- Use explicit modes for exploration, locked object, route, and comparison rather than conflicting boolean flags.
- Save the previous useful view before switching modes: selection, camera pose/target, layer, region, and supported route state.
- Restore that view on Back or exit. Reset changes the current view; it should not unexpectedly discard the whole session.
- Keep a bounded history of meaningful navigation events, not animation frames. Make browser Back and in-app Back consistent.
- Escape closes the nearest menu/dialog before exiting the underlying experience.
- Cancel or retarget camera transitions when new input arrives.
- Prevent drags from becoming object clicks and prevent clicks through panels from changing the map.

## 5. Compact nested category browser

Make destinations easy to find through typing or browsing.

- Reuse one catalog search across names, aliases, and identifiers. Rank exact and common-name matches first.
- Show a thumbnail/type fallback, name, type, host/region, and correctly labeled distance when available.
- Group supported objects into compact nested categories. Use tags for overlapping classifications instead of duplicate records.
- Provide drill-down, breadcrumbs, Back, clear filter, and accurate counts.
- Keep category and region filters visible; offer “Search all regions” when the current region excludes a match.
- Support keyboard and touch without hover-only menus. Keep menus within the viewport.
- Show featured destinations on empty search and a helpful no-results state without replacing the query with unrelated results.

## 6. Image-led destination cards

Make each selected destination informative and visually compelling.

- Build one reusable card with type-specific facts.
- Lead with a correct hero image, object name, type, parent location, and one concise sourced reason to care.
- Show three to six relevant facts and a few short highlights; place deeper facts and sources behind a disclosure.
- Offer Focus, Directions, Explore inside, and Compare sizes only when supported.
- Keep stable image proportions and a scrollable content area. Avoid large empty blocks and long generic descriptions.
- Preserve already-working secondary actions without adding new feature systems.

## 7. Galaxy and object visual hierarchy

Give different astronomical objects recognizable appearances at useful scales.

- Use appropriate geometry, imagery, or lightweight visual treatments for planets, stars, galaxies, nebulae, clusters, and compact objects.
- Give the Milky Way recognizable bar/spiral structure, dust, and restrained highlights; label it as a reconstruction.
- Use object-aware camera poses, such as an angle that reveals Saturn's rings.
- Apply detailed effects mainly to selected or nearby objects; use simpler representations farther away.
- Cross-fade representation levels without duplicate objects, sudden blank scenes, or excessive glow.
- Keep physical coordinates and dimensions separate from marker sizes and display offsets.
- Preserve selection and navigation state when switching Realistic and Atlas layers.

## 8. Quiet, legible star rendering

Make dense stellar scenes readable.

- Replace uniformly bright particles with graded brightness and restrained sizes.
- Limit decorative star density by screen area and zoom level using smooth level-of-detail transitions.
- Prioritize labels for the selected object, route endpoints, and important neighbors.
- Resolve label overlap and occlusion; use subtle backing where needed.
- Keep searchable records available even when their labels or markers are suppressed.
- Keep decorative backgrounds separate from catalog objects and scientific calculations.

## 9. Region navigation and breadcrumbs

Keep users oriented and make broader views easy to reach.

- Preserve existing region controls with intentional scrolling or overflow instead of clipped buttons.
- Frame each region's contents when selected and leave object lock explicitly.
- Show meaningful hierarchy, such as Universe / Local Group / Andromeda / G1.
- Distinguish catalog host membership from the camera's zoom level.
- Make parent regions reachable without resetting unrelated navigation state.
- Keep controls usable beside the desktop sidebar and above phone sheets.

## 10. Reliable imagery and galleries

Display correct images with clear attribution and robust loading.

- Associate each image with its object, caption, credit, source, and image type: observation, composite, illustration, or reconstruction.
- Use responsive thumbnails and suitable crops; load full-resolution gallery images only when opened.
- Add an expanded gallery viewer with close, previous/next, captions, and credits.
- Use bounded caches and cancel stale requests when selection changes.
- Provide dependable bundled or cached images for the demo destinations where permitted.
- Handle failures with a labeled fallback and retry rather than broken icons, blank rectangles, or endless skeletons.
- Verify assets load in the deployed app and WebGL where used.

## 11. Compact directions

Deliver a clear, familiar space-navigation interface.

- Keep origin, destination, swap, supported stops, route summary, and fit-to-route controls compact.
- Offer exactly two travel benchmarks: **Light speed** and **Voyager 1**.
- Calculate compatible routes from full spatial separation, not the difference between two Earth-distance values.
- Calculate benchmark duration as distance divided by the adopted speed, with units and simplifying assumptions visible.
- Retain the source and reference frame for Voyager's adopted speed.
- Frame the entire supported route and distinguish route endpoints and stops.
- Preserve valid existing orbital transfers, but label their model duration separately from direct-distance speed benchmarks.
- Disable unsupported legs with a useful explanation. Do not invent curved trajectories, fastest-route claims, or cosmological routing.
- Preserve entered endpoints and stops after a failed request.

## 12. Units and provenance consistency

Keep displayed values scientifically interpretable.

- Centralize conversions and formatting for distances, durations, dimensions, and speeds.
- Distinguish radius from diameter, physical distance from angular separation, and true coordinates from schematic display positions.
- Label the origin of distances and retain applicable coordinate frames, epochs, uncertainties, and source references.
- Use sensible significant figures and readable large-number formatting.
- Earth viewed from Earth should not display an unlabeled 1 AU; label heliocentric distance or orbital radius separately.
- Never let marker sizes, visual offsets, or nonlinear overview scaling alter calculations.
- Show unavailable or approximate data honestly. Keep deeper source/model details accessible without cluttering the primary view.

## 13. Compare sizes

Provide a beautiful comparison using real physical dimensions.

- Add Compare sizes to eligible cards, defaulting the first selector to the selected object.
- Reuse catalog search for two selectors; include Swap and Reset.
- Normalize supported size definitions and units. Begin with reliably sourced planets, moons, and stars.
- Show both dimensions, their numeric ratio, and one clear comparison sentence.
- In **True scale**, use one common physical scale. Never enlarge the smaller object silently.
- For extreme ratios, preserve a locator and provide an explicitly magnified inset.
- In **Fit both**, allow separate display scales and clearly label that the objects are not shown at a shared scale.
- Preserve uncertainty and label irregular-body size conventions. Disable missing or incompatible measurements with an explanation.
- Use attractive imagery/meshes and clear labels. Exit returns to the preceding view.

## 14. Curated comparison presets

Make the strongest size comparisons immediately accessible.

- Add a small set of presets near discovery and within comparison.
- Include a planet–planet, planet–star, and star–star example chosen from verified available dimensions.
- Store presets as object IDs and a short explanatory label; derive dimensions and ratios from the shared data.
- Open each preset directly in the comparison view with both objects loaded.
- Include one extreme-ratio example that demonstrates the locator/inset correctly.
- Validate that every preset resolves to supported objects and returns cleanly to exploration.

## 15. Andromeda and other galaxy interiors

Let users explore verified features inside supported galaxies.

- Add an Explore inside action when a galaxy has verified child records.
- Include supported Andromeda features such as its nucleus, NGC 206, and G1/Mayall II after verifying their identity and membership.
- Distinguish internal disk objects, halo objects, and companion galaxies.
- Give each child a stable ID, parent relationship, sourced facts, appropriate imagery, declared capabilities, and intentional focus pose.
- Keep child records searchable and accessible through the parent card and breadcrumbs.
- Label approximate placement and unknown depth. Host-distance placement must not imply a precise internal travel distance.
- Support selecting a child, opening its card, and returning to the galaxy.
- Extend to other galaxies only where reliable existing data supports it; add only records needed for these flows.

## 16. Observable-universe overview

Provide a clear maximum-scale view with a reliable path back.

- Add a labeled **Observable universe** boundary containing the included galaxy catalog.
- Use an explicitly labeled logarithmic or schematic representation where literal scale would make nearby galaxies unusable.
- Preserve angular directions where supported and store display transforms separately from physical coordinates.
- Use distance bands or a scale explanation instead of a misleading uniform linear scale bar.
- Keep included galaxies selectable, preserve a locator for the selected object, and make the boundary nonblocking for picking.
- Selecting a galaxy or region returns to an appropriate local scale with usable framing.
- Explain the adopted observable-radius convention and source in details.
- State that the map contains a selected catalog and that the boundary is observational, not a physical wall or routable destination.

