# GalaxyMaps speaker notes

Deck files (all under `presentation/`):

- `GalaxyMaps-BigRedHacks-2026-Deck.html` — present this (arrow keys). Add `?print=1` to show every slide.
- `GalaxyMaps-BigRedHacks-2026-Deck.pdf` — Devpost / Drive upload
- `GalaxyMaps-BigRedHacks-2026-Deck.pptx` — same 10 slides, full-bleed images

Regenerate the PDF after HTML edits:

```bash
python3 -m http.server 8765 --directory presentation
chromium --headless=new --no-sandbox --no-pdf-header-footer \
  --print-to-pdf=presentation/GalaxyMaps-BigRedHacks-2026-Deck.pdf \
  "http://127.0.0.1:8765/GalaxyMaps-BigRedHacks-2026-Deck.html?print=1"
```

Core slides are 1–6. Slides 7–10 are backup only.

The live product is the hero. Do not narrate every slide. Slide 3 is the demo launchpad.

---

## Slide notes

### 1 — Hero

**On screen:** Quiet Earth. One idea only.

**Say:** “Space has maps, catalogs, and incredible data — but no familiar way to navigate it. So we built GalaxyMaps: Google Maps for the universe.”

Do not list features.

### 2 — Why this should exist

**Say:** “Polaris is 433 light-years away. That number does not land. Everyone already knows how to search a place, tap Directions, and read an ETA. We applied that interface to real astronomical data.”

Advance as soon as the judge nods. Do not explain the universe schematic.

### 3 — The experience / DEMO

**Say this line, then switch:** “Pick anywhere. Get directions. Go.”

> **Switch to live demo now.**

Do not read the four callouts. Show them in the app instead.

If the demo is dead, stay on this slide for 20 seconds, point at Earth → Polaris (433 years), then jump to slide 4.

### 4 — What makes it technically real

**Say:** “Real catalogs go in. A physics layer computes every distance and travel time. Three.js draws one continuous map. Grok can talk and drive the UI — but only through validated tools. AI explains and controls. Code calculates.”

One breath. Then slide 5 or back to the app.

### 5 — Differentiators

**Say only if you still have time after the demo:** “You can see the map, hear it through Grok Mission Control, and step inside it in WebXR.”

Do not say ADA certified. Do not say we tested on a Vision Pro.

### 6 — Close

**Say:** “GalaxyMaps makes the universe navigable using an interface we already understand.”

Point at the GitHub QR if they want the repo. Do not say thank you. Do not open a roadmap.

---

## A. Preliminary judging — 2 minutes

Target **1:40–1:50**. Hard stop at 2:00.

| Time | Slide / app | Script |
| --- | --- | --- |
| 0:00–0:15 | Slide 1 | “Space has maps, catalogs, and incredible data — but no familiar way to navigate it. So we built GalaxyMaps: Google Maps for the universe.” |
| 0:15–0:30 | Slide 2 | “Distances stay abstract. Polaris is 433 light-years away. Everyone already knows how to use a map: search, directions, ETA. That is the whole product.” |
| 0:30 | Slide 3 | “Pick anywhere. Get directions. Go.” **Switch to live demo now.** |
| 0:30–1:25 | **Live app** | See demo sequence below. This is most of the pitch. |
| 1:25–1:42 | Slide 4 | “JPL, SIMBAD, and HYG go in. Deterministic physics computes routes. Three.js renders one map. Grok Voice can operate it through tools. AI explains and controls. Code calculates.” |
| 1:42–1:50 | Slide 6 | “GalaxyMaps makes the universe navigable using an interface we already understand.” |

### Live demo sequence (0:30–1:25)

Start already on Earth (`H` if needed). Browser at 100% zoom. Notifications off.

1. Orbit Earth once. “You start at home, locked on Earth.”
2. Search **Polaris**. Open the card. Click **Directions**.
3. Show **433 years** at light speed. Switch travel mode to **Voyager 1**. “Same distance. Different clock.”
4. Switch back to light speed. Click **Begin journey** if the fly-through is smooth; otherwise leave the route framed.
5. One Grok moment: press **M** or **Talk to Grok** and say “What am I looking at?” If voice fails, type that in Mission Control or use the offline guide — **say that it is scripted** if the pill is not “Grok”.
6. One wow: **Quiet view** on Earth, or **Observable universe**, or **Compare sizes** Earth/Jupiter. Pick the one that is already warm.

Do not demo tours, Demo-2, sky chart, share, and VR in the 2-minute round.

---

## B. Finalist demo — 4 minutes

Target **3:30–3:40**. Hard stop at 4:00.

| Time | Where | What |
| --- | --- | --- |
| 0:00–0:15 | Slide 1 | Same hook. |
| 0:15–0:25 | Slide 2 | Same problem, shorter. |
| 0:25 | Slide 3 | “Live demo.” Switch. |
| 0:25–2:40 | App | Richer demo below. |
| 2:40–3:10 | Slide 4 + talk | Architecture + “AI explains and controls. Code calculates.” |
| 3:10–3:25 | Slide 5 *or* app | Accessibility keyboard (`/`, `H`, `V`) **or** Enter VR only if a headset is already in session. |
| 3:25–3:40 | Slide 6 | Close line. QR. Stop talking. |

### Richer live demo

1. Earth lock + orbit.
2. Search Polaris → Directions → 433 years → Voyager 1 comparison.
3. Begin journey (compressed camera travel).
4. Grok: “Take me from Earth to Mars.” Show the Hohmann panel: 8.5 months, next window, not a straight line.
5. Extra wow — pick **one**:
   - Compare sizes: Earth / Jupiter, say “eleven times, true scale.”
   - Observable universe, then click Andromeda and return locally.
   - Quiet view on Orion.
6. Only if headset is live: Enter VR, pinch toward Saturn, ask Grok “what am I looking at?” If it is not already running, skip. Do not fumble pairing on stage.

---

## Lines to avoid

- Usage numbers, user counts, benchmarks we did not measure.
- “ADA compliant.”
- “Tested on Apple Vision Pro.”
- “Real-time telescope data.”
- “Google / NASA / SpaceX / xAI endorses this.”
- “Grok calculates the distances.”
- Calling the offline guide “Grok.”
- A roadmap close.
