# GalaxyMaps Q&A cheat sheet

Answers are from the repository, bundled data, and the running app. Anything the repo cannot establish is marked **TEAM MUST CONFIRM**.

---

**1. Where does the astronomical data come from?**

Bundled in `public/data/`, built from: NASA/JPL Horizons DE441 (Solar System vectors, 2026-09-01–2027-03-01), NASA Planetary Fact Sheets, HYG v4.4 (109,389 stars), SIMBAD TAP, NASA Exoplanet Archive TAP, Wikipedia/Commons media with licenses, and cited papers (e.g. GRAVITY 2019 for Sgr A*). The live demo does not query those APIs.

**2. How do you calculate distances?**

Routes use 3D positions, not the card’s “distance” field. `separationKm` on Sun-centered ICRF kilometres (`src/lib/physics.ts`, `src/lib/route.ts`). Solar System bodies come from Horizons interpolation; stars from HYG / SIMBAD parallax or literature.

**3. How do you calculate travel times?**

Planet pairs: idealized Hohmann `t = π√(a³/μ☉)` (`src/lib/transfer.ts`). Everything else: `time = distance / speed` (`cruise`). Modes are exactly light speed and Voyager 1’s Horizons heliocentric speed. Earth → Mars ≈ 259 days. Earth → Polaris ≈ 433 years at *c*, ≈ 7.7 million years at Voyager 1.

**4. Are the routes physically accurate?**

Honestly modeled, not flight-ready. Hohmann assumes circular coplanar orbits. Straight-line cruise ignores acceleration, gravity, and target motion. The UI labels the model. Cosmological-redshift objects are not routable.

**5. Why is this different from Google Earth / NASA Eyes / Stellarium / Universe Sandbox?**

Those are globes, sky charts, or sandboxes. GalaxyMaps is a **navigation** product: search → card → directions → travel mode → ETA, on one zoomable map, with cited numbers and a tool-constrained guide. We are not affiliated with Google or NASA.

**6. What exactly does Grok do?**

Speech-to-speech Mission Control over xAI realtime WebSocket, plus TTS, STT, and on-demand Imagine. It may only call validated tools in `src/ai/toolDefs.ts` (search, select, routes, tours, zoom, layers, Play time, accessibility, share, …). This laptop’s `/api/status` reports Grok configured; Mission Control shows “Grok connected.”

**7. Why use AI at all?**

Hands-free control and explanation. Judges can talk to the map the way they would talk to a navigator. The AI is not the astronomy engine.

**8. How do you prevent Grok hallucinations?**

Instructions: never invent IDs, distances, or times; always `searchObjects` first; quote tool-formatted numbers. `runTool` validates IDs and ranges. No LLM-generated catalog data. Imagine images are labeled **AI reconstruction**.

**9. What did your team actually build during the hackathon?**

**TEAM MUST CONFIRM** exact split of pre-existing vs weekend work. The repo is a full app: data pipeline, science modules, Three.js engine, React UI, Grok Voice, WebXR, tests.

**10. What was technically hardest?**

Scale: one map from ~10³ km to ~10²¹ km. Float64 camera-relative projection. Smooth zoom on huge flights. Honest parallax (do not invert bad σ). “On the way” had to be cheapest insertion, not vibes. Drawing the Milky Way from inside it.

**11. How does Apple Vision Pro / WebXR work?**

`immersive-vr` from a user gesture. Same catalog and positions. Nearby linear metres; far objects log-compressed so galaxies sit at different depths. Head gaze (not eye tracking), pinch to fly, ~480 ms dwell. Grok Voice HUD in-session.

**12. Did you test it on actual Vision Pro hardware?**

No. Session lifecycle and math are tested. A physical Vision Pro / Quest pass is still pending. Do not claim otherwise.

**13. How is this accessible to a blind user?**

Not a replacement for a sighted map, and we say so. Skip links, live regions, ARIA search, destination facts as text, “Describe current view” (`V`) and previous/next nearby objects, Grok/offline voice, listen buttons. The WebGL canvas itself is visual.

**14. Is it ADA compliant?**

No legal determination. The UI copy says we **aim to meet WCAG 2.2 AA**. Do not say ADA compliant or certified.

**15. What happens if the AI API is down?**

Map, search, routes, Play time, and WebXR still work offline after load. Mission Control falls back to a clearly labeled **offline scripted guide** using the same tools. TTS can fall back to the browser voice.

**16. What is real imagery versus reconstruction?**

Each image is labeled: Observed image, Scientific illustration, or AI reconstruction, plus credit/license. Planet textures are Solar System Scope (based on NASA). The Milky Way disk is a procedural reconstruction. Orion quiet view is a projected observed image.

**17. How do you represent galaxies at huge differences in scale?**

Catalogued position, position angle, and axis ratio. On the 2D map they are oriented discs / particle volumes, not photographs glued to the sky. The observable-universe view is schematic and logarithmic. Inside Andromeda, child objects have sky position but **unknown depth** — the UI says so and does not offer internal routes.

**18. What would you build next?**

Honest options, not a pitch: Gaia DR3 with uncertainties, real Horizons mission trajectories, a classroom PWA, a completed headset pass. Do not pretend these are done.

**19. Who is the target user?**

Anyone who can use a map app and wants astronomical scale to feel navigable: students, curious visitors, hackathon judges. Not a mission-design tool.

**20. Why does this fit the Navigation theme?**

The entire interaction is navigation: search a destination, get directions, compare modes, travel, and (where supported) move through the map in VR. Theme word is on slide 1.

**21. How did you use Cursor?**

The project was built with Cursor (agents, refactors, tests, this deck). **TEAM MUST CONFIRM** any extra color (Composer, transcripts, etc.).

**22. How did you use Grok / xAI?**

Grok Voice realtime, TTS, STT, chat, and Imagine. Key is `XAI_API_KEY` on the server only. Browser gets a ~5-minute client secret from `POST /api/voice/session`.

**23. What is the most impressive technical component?**

Pick one and stay there: the float64 map across ~17 orders of magnitude, **or** the honest routing/parallax rules, **or** tool-constrained Grok that actually drives the app.

**24. How much of this is AI-generated versus deterministic code?**

Catalog, physics, routes, and rendering are deterministic TypeScript. Grok generates speech, optional chat, and optional Imagine pictures. No LLM-written science numbers in the dataset.

**25. What did each team member contribute?**

**TEAM MUST CONFIRM.** Submission notes mention four first-time hackers. Only the GitHub owner (`diyar-niyazov`) is known from the repo. Do not invent names or roles.

---

## Fast facts

| Claim | Value | Source |
| --- | --- | --- |
| Catalog objects | 919 (374 featured) | `docs/DATA.md` / build |
| HYG stars | 109,389 | `stars.bin` |
| Earth → Polaris | ≈ 433 ly / 433 yr at *c* | `dataset.test.ts` |
| Earth → Mars Hohmann | ≈ 259 days | `transfer` + tests |
| Travel modes | Light speed, Voyager 1 | `transport.ts` |
| Font / brand | Inter, `#1a73e8` | `src/styles.css` |
| Live public URL | Not verified (`galaxies.wiki` returned 500) | fetched 2026-10-04 |
| GitHub | https://github.com/diyar-niyazov/GalaxyMaps | HTTP 200 |
