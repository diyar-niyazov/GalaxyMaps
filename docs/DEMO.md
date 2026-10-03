# SpaceMaps demo scripts

All numbers below come from the app on the bundled dataset, with the map date set to 2026-10-04. Solar System distances change daily; star and galaxy numbers do not.

## Setup (do this before judging)

```bash
npm run build && npm start        # http://localhost:8787, one process, no dev overlay
```

- Use Chrome or Edge at full screen (1440×900 or larger) and zoom the browser to 100%.
- Open http://localhost:8787. Click **Earth & Moon** so you start at home.
- **If an xAI key is configured:** open the Guide once and check that the pill says "Grok Voice available". Check the microphone permission.
- **If no key is configured:** the Guide shows "Offline guide". Present it honestly as the scripted fallback; do not call it Grok.
- Keep these tabs ready as fallbacks:
  - `http://localhost:8787/?route=earth,polaris&mode=light`
  - `http://localhost:8787/?panel=transfer`
  - `http://localhost:8787/?route=earth,sirius,vega,polaris&mode=light`
- Close Slack, notifications and other heavy tabs. The Milky Way views use WebGL.

---

## Two-minute preliminary demo

| Time | On screen | Say |
| --- | --- | --- |
| 0:00–0:15 | Earth & Moon view | "Everyone knows how to use Google Maps. SpaceMaps is that same interface for the universe: search a place, get directions, compare how you'd get there, using real astronomical data." |
| 0:15–0:45 | Click the scale chips **Inner planets → Solar System → Nearby stars**, or scroll to zoom out | "This is one continuous map, from the Earth–Moon system to the planets at today's JPL Horizons positions, out to the nearest stars. Labels declutter as you zoom, and the map plane switches from the Solar System's plane to the galaxy's." |
| 0:45–1:10 | Search **Polaris** → **Directions**. The camera fits Earth and Polaris. Click the **Voyager 1** tab, then **More → USS Enterprise** | "Polaris is 433 light-years away. That's a real 3D distance from catalog positions, with its uncertainty shown. At light speed it's 433 years. At Voyager 1's actual speed it's 7.7 million years. The Enterprise at warp 9 makes it in 3.4 months, and we label that as fiction." |
| 1:10–1:35 | Back to **Light**. Under "Add a stop along the way?" click **Add** next to **Vega**. Press **Play** | "Multi-stop trips work like Google Maps. We don't just call something 'on the way'; we compute the detour. Vega adds 2.3%. Playback is always ten seconds, whatever the speed." |
| 1:35–1:50 | **Ask the guide**: "Why don't rockets fly straight to Mars?" (voice if Grok is live, typed otherwise). Optionally open **Earth → Mars transfer** from Explore | With Grok: "Grok can only use our validated tools; it can't invent destinations or numbers." Offline: "Without an API key it falls back to a clearly labeled scripted guide that calls the same tools." |
| 1:50–2:00 | Click a destination card's source line, or open ⓘ About | "Every number has a source: JPL Horizons, SIMBAD, HYG, the NASA Exoplanet Archive. Assumptions are always on screen. It's a navigation app that teaches scale honestly." |

---

## Four-minute finalist demo

### 0:00–0:20 Hook

"Space distances are numbers nobody can feel. But everyone already knows how to read a map, a route and an ETA. SpaceMaps turns the universe into a map you already know how to use."

### 0:20–1:00 Continuous zoom (Earth → Milky Way)

- Start at **Earth & Moon**. Scroll out slowly, or use the scale chips up to **Milky Way**.
- "Same map, same camera. Earth, the Moon's orbit, the inner planets at today's real positions from NASA JPL Horizons, the Kuiper belt, then 109,000 real stars from the HYG catalog."
- At **Milky Way**: "This disk is a scientific illustration built from published spiral-arm models, and the map says so in the corner. No one has photographed our galaxy from outside. The 'You are here' marker is where the Sun really sits, about 8 kiloparsecs from the center."
- Press **L** to toggle the **Atlas** layer: "Atlas is the clean 'map' style. Both layers share the same positions and routes."

### 1:00–1:50 Directions: Earth → Polaris

- Press **H** (home), then **/**, type `polaris`, and choose **Directions**.
- "Directions from Earth. The camera fits both ends. 433 light-years, ± 6.4, computed as a full 3D distance between catalog positions. The map is a projection, but the math never is."
- Click through the modes:
  - **Light**: 433 years. "Even light needs five human lifetimes."
  - **Voyager 1**: 7.7 million years. "That's Voyager's real speed from JPL, relative to the Sun, on a stated date. We say clearly that rockets don't have one fixed speed."
  - **Custom** at 0.99 c: "437 years for people on Earth, but only 62 onboard. That's special relativity, and we only show it below light speed."
  - **More → Enterprise**: 3.4 months, labeled fictional.
- Open **Show assumptions**: "Constant speed, straight line, no acceleration or gravity. A comparison, not a mission plan."

### 1:50–2:30 Why not a straight line? Earth → Mars transfer

- From Explore choose **Why not straight to Mars?** (or open `?panel=transfer`). Press **Play**.
- "Real spacecraft don't drive in straight lines; they coast on orbits. This is the classic Hohmann transfer: about 259 days, launched when Mars is about 44° ahead, which is why windows open every 26 months. It's an idealized textbook model with circular, coplanar orbits, and the assumptions are listed right here."

### 2:30–3:10 Multi-stop journey + grounded guide

- Open the **Multi-stop star tour** card (Earth → Sirius → Vega → Polaris, 459 light-years).
- "Each leg is computed and summed. Suggested stops are ranked by the extra distance they actually add."
- Open the Guide.
  - **If Grok is live**, say: "Take me from Earth to Betelgeuse, then suggest a stop on the way." Point out the "Map action" lines: Grok called `searchObjects`, `setRoute` and `suggestStops`, and read back our numbers.
  - **If offline**: type `take me to the Death Star`. "It refuses, because it's not in the catalog. The AI layer, live or scripted, can't make things up. It can only call validated tools."

### 3:10–3:40 Data honesty

- Search **Betelgeuse** and show the card: 498 light-years, +72/−56, quality "Approximate", Hipparcos parallax with its bibcode.
- Search **3C 273**: "Route unavailable. At cosmological redshift a constant-speed trip isn't meaningful, so we explain why instead of faking a number."

### 3:40–4:00 Close

"SpaceMaps is a real-data space atlas with a familiar interface. 618 catalog objects, 109,000 stars, live-date planet positions, every number sourced, every assumption visible. Navigation that teaches the true scale of the universe. Thank you!"

---

## Likely Q&A

- **Where does the data come from?** NASA/JPL Horizons, the NASA fact sheets, the HYG v4.4 star catalog, SIMBAD, the NASA Exoplanet Archive, and cited papers for galaxy distances. It is preprocessed into a bundle, so the demo runs offline. See `docs/DATA.md`.
- **How do you handle bad parallaxes?** We only invert a parallax when its error is at most 20%. Otherwise the object is searchable but has no route. Example: Alnilam.
- **Is the 2D map distorting distances?** No. Distances are always full 3D. The map is a projection, and enlarged markers are display only.
- **Is the Milky Way image real?** It's a procedural illustration from published arm models, labeled as such.
- **What does Grok actually do?** It talks and decides which tool to call. SpaceMaps does every lookup and calculation, and Grok reads the results back. The API key never reaches the browser; the server hands out a 5-minute ephemeral token.
- **Why not show the fastest route?** We have no optimization model for interstellar trajectories, so we never claim "fastest". The Hohmann demo shows what an actual orbital model looks like.
- **What was hardest?** One map that spans view widths from 6,000 km to about 2.5 × 10²¹ km (17 orders of magnitude) without float precision problems: everything is computed in float64, relative to the camera. Also making zoom flights across that range feel smooth, and keeping every number honest.
