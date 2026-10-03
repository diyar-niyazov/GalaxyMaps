You are our lead engineer, product designer, and technical cofounder. Build SpaceMaps into a working, polished hackathon project. Implement the product; do not stop after proposing a plan.

PROJECT CONTEXT

We are four first-time hackers: three CS freshmen and one economics master’s student. We are using AI coding tools heavily. We have no existing SpaceMaps code and no API credentials configured yet.

Event: BigRed//Hacks 2026.
Theme: Navigation.
Hard submission deadline: Sunday, October 4, 2026, at 8:30 AM America/New_York.
Internal submission target: 6:30 AM.
Primary demo device: laptop.

Target tracks: BigRed, Software, Design, Beginner, People’s Choice, and the SpaceX sponsor challenge if eligible.

The supplied SpaceX challenge requires building with Cursor and using the Grok Imagine or Voice API with real space data. Do not claim eligibility until those requirements are actually satisfied. Other sponsor integrations are optional and should not distract from the product.

PRODUCT VISION

SpaceMaps: “Explore the universe through a familiar, interactive map.”

Build a professional, continuously zoomable space atlas and educational journey simulator. Users explore Earth, the Solar System, nearby stars, the Milky Way, and selected galaxies; search destinations; request directions; compare hypothetical travel times; learn facts; and ask an AI guide to explain their journey.

Our signature interaction:
1. Start at Earth.
2. Smoothly zoom out through the Solar System into nearby stars.
3. Search for Polaris and request directions from Earth.
4. Animate the camera to fit both destinations.
5. Display the route, actual catalog-based distance, travel assumptions, and estimated duration.
6. Switch transportation modes and see the estimate update.
7. Ask the guide to explain the journey or recommend a stop.

Priorities:
1. Entertaining, intuitive interaction.
2. Exceptional visual polish.
3. Technical depth.
4. Scientific accuracy and transparent assumptions.

Accuracy is a baseline: do not fabricate data or present hypothetical comparisons as executable missions.

DESIGN DIRECTION

Make the interface strongly inspired by the familiar Google Maps interaction model, with our own SpaceMaps identity. It should feel like a finished mapping product.

Use:
- A clean white/light sidebar approximately 360–400 px wide on desktop.
- A large map canvas occupying the remaining viewport.
- Clear sans-serif typography, restrained color, subtle shadows.
- Familiar search fields, origin/destination fields, swap button, “Add stop,” route cards, destination cards, and map controls.
- A distinct blue route with tasteful endpoint markers.
- Search results with useful object categories and readable names.
- Smooth transitions and thoughtful loading, empty, and error states.
- Accessible contrast, keyboard controls, and reduced-motion support.

Avoid:
- Sci-fi cockpit dashboards.
- Excessive neon, glowing panels, giant gradients, decorative gauges.
- Generic landing pages preceding the actual product.
- Google logos or claims of Google affiliation.
- Exposing implementation details in the normal user interface.

Default directly into the interactive map.

MAP AND CAMERA

Build one 2D-first map experience backed by real spatial coordinates. Use WebGL where useful. Full freely rotating 3D is a stretch feature, not a prerequisite.

Continuous zoom is essential:
Earth → Solar System → nearby stars → Milky Way context → selected extragalactic context.

Implement scale-dependent rendering, camera-relative coordinates/local origins, progressive detail, batched points, and label decluttering as needed. Blend scale transitions without abrupt page changes.

Keep physical coordinates separate from display coordinates. Enlarged planet/star markers are acceptable for visibility; their visual radius must not affect distance calculations.

Earth and Polaris must occupy scientifically reasonable positions. Do not place them on opposite sides of the Milky Way to exaggerate the route. Use an inset or local-scale framing when necessary.

Provide:
- Zoom and pan.
- Home/reset view.
- Selected-object highlighting.
- Route fit-to-view.
- Scale indicator appropriate to the current projection and units.
- Clickable destinations.
- Smooth journey playback, with playback speed independent of travel speed.

TWO VISUAL LAYERS

1. Realistic:
   Observed planet textures, astronomical imagery, restrained lighting, and clearly labeled reconstructions.

2. Atlas:
   Simplified symbols, clean colors, readable labels, and orbit/route lines.

Both layers share the same selections, underlying positions, and routes.

Distinguish “Observed image,” “Scientific illustration,” and “AI reconstruction” wherever relevant. An external Milky Way view is a reconstruction, not an actual photograph taken from outside our galaxy.

Generated backgrounds must not introduce fake catalog objects or determine coordinates.

REAL DATA

Use real astronomical sources. An LLM must never be our database or authoritative calculator.

Candidate sources:
- NASA/JPL Horizons for Solar System ephemerides:
  https://ssd.jpl.nasa.gov/horizons/
  https://ssd-api.jpl.nasa.gov/doc/horizons.html
- HYG or a manageable Gaia-derived subset for stars. Verify the current repository, schema, license, and distance conventions.
- NASA Exoplanet Archive:
  https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html
- NASA/IPAC Extragalactic Database:
  https://ned.ipac.caltech.edu/
- Suitable deep-sky catalogs for curated additional destinations.

Verify current official documentation before integration. Do not assume legacy endpoints still work.

Implementation targets, subject to quality and performance:
- Excellent Solar System coverage.
- 50–100 rich, recognizable destination cards.
- Roughly 10,000–100,000 filtered stellar points if feasible.
- Selected galaxies and other notable deep-sky destinations.

Do not attempt to load every known object. Prioritize a broad, credible, responsive experience.

Create a reproducible data-ingestion process and bundle/cache a usable dataset so the main demo is not dependent on live astronomy APIs.

Records should include, as applicable:
- Stable ID and aliases.
- Name, object type, and parent system.
- Coordinates, coordinate frame, epoch, and units.
- Distance, distance type, and uncertainty when available.
- Route capabilities.
- Sourced facts.
- Source URL and retrieval metadata.
- Image attribution, license, and imagery type.

Handle missing values and catalog sentinels. Right ascension and declination alone do not provide 3D position. Do not blindly invert unreliable parallaxes.

Only calculate routes between objects with compatible, usable spatial data. Other objects may remain searchable with a clear explanation that a distance-based route is unavailable.

Do not mix cosmological distance definitions or treat high-redshift galaxies as simple nearby Euclidean points. Limit numerical intergalactic routing to a defensible supported subset.

NAVIGATION AND PHYSICS

Implement two distinct models.

A. Cruise comparison — core feature

For compatible spatial coordinates:
distance = length(destinationPosition - originPosition)
duration = distance / assumedSpeed

Use full spatial distance even if the map shows a 2D projection. Do not subtract the objects’ distances from Earth.

Explain concisely that this is a hypothetical constant-speed comparison, excluding acceleration, braking, gravity, and target motion.

Do not call it a feasible flight plan or “fastest route” without an actual optimization model.

B. Idealized orbital transfer — valuable extension

If time permits, implement and validate an educational Earth–Mars Hohmann transfer:
- Circular, coplanar orbits.
- Suitable initial planetary alignment.
- Transfer ellipse.
- Moving planets during the animation.
- Transfer time calculated from the model.
- Assumptions visible.

For orbital radii r1 and r2:
a = (r1 + r2) / 2
transferTime = π × sqrt(a³ / μSun)

The ideal Earth–Mars example should be approximately 259 days using appropriate constants.

Clearly distinguish this idealized scenario from present-day ephemerides and a launch-ready mission. Do not imply arbitrary departure dates work. Do not attempt universal mission planning.

TRANSPORT OPTIONS

Primary:
- Light speed: the default comparison benchmark.
- Real spacecraft: a few sourced reference-speed presets, such as Voyager 1 and New Horizons.
- Custom speed, including fractions of light speed.

Under “More”:
- Sci-fi: USS Enterprise and Millennium Falcon.
- Everyday: plane, car, bike, walking.

Keep the primary interface uncluttered.

Record reference frames and source assumptions for actual spacecraft speeds. A rocket does not have a single universal travel speed.

Fictional speeds must be explicitly labeled adjustable fictional assumptions, not established physical measurements.

Everyday modes are hypothetical distance comparisons.

Use readable time formatting for enormous durations and avoid misleading precision. Handle zero distance and invalid speeds.

Optional relativity:
For 0 < v < c, provide coordinate time and traveler proper time using:
τ = t × sqrt(1 - v²/c²)

State that acceleration and braking are excluded. Do not calculate traveler proper time at light speed or for fictional faster-than-light travel.

MULTI-STOP JOURNEYS

Support an ordered itinerary of approximately 3–5 destinations after the single-route experience works.

For cruise comparisons:
- Calculate each leg.
- Sum distance and time.
- Show the selected stops.
- Allow removal and, if straightforward, reordering.
- Calculate additional distance from a proposed stop.

Never describe a destination as “on the way” without evaluating the detour.

Defer multi-leg orbital mission planning.

AI AND VOICE

Prefer a genuine Grok Voice integration, subject to credentials and current API availability:
https://docs.x.ai/

Useful requests:
- “Take me from Earth to Polaris.”
- “Explain how far this is.”
- “Recommend a destination with rings.”
- “Suggest an interesting stop.”
- “Narrate this journey.”
- “Why can’t a spacecraft just point straight at Mars?”

The application supplies sourced object records and deterministic calculations. The model explains them and requests supported actions.

Define validated tools such as:
- searchObjects(query)
- getObjectDetails(id)
- setRoute(originId, destinationId, mode)
- addStop(objectId)
- compareTravelModes()
- explainCurrentJourney()

Validate all returned IDs and arguments. The model must not invent destinations, calculate authoritative route numbers, or modify arbitrary application state.

Keep permanent credentials server-side. Use ephemeral client credentials if required by the official real-time API flow.

No credentials are configured yet:
- Build the entire map and calculation experience to work without them.
- Provide .env.example and straightforward setup instructions.
- Use honest unavailable states for AI features.
- A clearly labeled scripted demo or browser-speech fallback is acceptable, but must not masquerade as live Grok.
- Do not assume ChatGPT/Claude subscriptions or Cursor credits supply runtime API access.

Do not add Gemini, ElevenLabs, banking, blockchain, or biometric integrations merely to collect sponsor logos.

TECHNICAL APPROACH

First inspect the repository and any AGENTS.md instructions. Preserve useful existing work. If empty, scaffold a suitable project.

Suggested approach:
- React + TypeScript.
- A WebGL map using Three.js where appropriate.
- A small server layer for protected AI/API access.
- Preprocessed, bundled astronomical data.
- Pure, independently testable coordinate and physics modules.
- Shared types between data, map, routing, and AI tools.

Choose the simplest maintained stack that supports the product. Avoid unnecessary infrastructure, accounts, databases, and architectural complexity.

Organize work into independent areas:
1. UI/search/destination cards.
2. Map/camera/layers.
3. Data/coordinates/physics.
4. Voice/content/demo/submission.

Document stable interfaces so teammates can contribute without conflicting implementations.

IMPLEMENTATION ORDER

1. Inspect the repo, establish a concise plan, and start implementing.
2. Render Earth and Mars; make both searchable/selectable.
3. Complete one end-to-end route with deterministic distance and time.
4. Build the polished directions sidebar.
5. Implement smooth Solar System and nearby-star zoom.
6. Complete Earth → Polaris with camera fitting.
7. Add both coherent visual layers.
8. Expand the validated catalog and destination cards.
9. Add Grok voice if credentials are available.
10. Add multi-stop journeys and the validated orbital-transfer demo as time allows.
11. Fix usability/performance issues, capture the demo, and finish submission materials.

Do not build a large disconnected collection of components. Keep a working vertical slice throughout development.

Make reasonable reversible decisions without asking repeated questions. Ask only when a missing answer genuinely blocks progress. If an API is blocked, continue unaffected work and report the exact dependency.

VERIFICATION

Test meaningful scientific and integration risks:
- Unit conversions.
- One light-year at c is approximately one year using consistent definitions.
- Zero distance and distance symmetry.
- Correct 3D separation.
- Coordinate frames and epochs.
- Missing/invalid catalog values.
- Layer switching never changes physical distances.
- Itinerary totals.
- Relativity domain restrictions.
- Ideal transfer duration if implemented.
- Search, route selection, fit-to-view, and transport switching.
- Missing credentials and API failures.
- Performance with the actual bundled dataset.

Run available build/type checks and inspect the actual rendered app using available browser tools. Do not claim browser verification if unavailable.

No fabricated test results, source claims, working integrations, or performance numbers.

DEMO AND SUBMISSION

Prepare:
- README with installation, commands, credentials, data sources, assumptions, and limitations.
- .env.example with no secrets.
- Reproducible data preparation instructions.
- A two-minute preliminary demo script.
- A four-minute finalist demo script.
- Devpost copy: Inspiration, What it does, How we built it, Challenges, Accomplishments, What we learned, What’s next.
- A concise presentation deck outline, and a PDF if tooling permits.
- Submission checklist noting that organizers require the entire-project link and a Google Drive link to the PDF deck.
- Accurate track eligibility notes.

Preliminary judging: two-minute presentation plus two-minute Q&A.
Finalist judging: four-minute presentation plus two-minute Q&A.

Suggested demo:
0–15 seconds: explain the idea.
15–45: Earth → Solar System → nearby stars zoom.
45–70: Earth → Polaris, switch travel modes.
70–95: validated Earth–Mars transfer, or multi-stop itinerary if transfer is unfinished.
95–110: grounded voice interaction if available.
110–120: real data, technical contribution, educational value.

Build toward a stable submission before the hard deadline. Cut stretch features before sacrificing the core map, truthful calculations, or presentation quality.

DEFINITION OF DONE

A new user can open SpaceMaps, explore smoothly, find a real destination, request a supported route, compare travel assumptions, switch visual layers, and understand the displayed result without explanation from our team.

The app runs without AI credentials. Data provenance and model limitations are available. The demo is polished and repeatable. Documentation reflects what was actually built.

Start by inspecting the repository, then implement the first working end-to-end experience. Continue through integration and verification. At completion, report what works, what was tested, what remains blocked, and the exact commands to run it.
