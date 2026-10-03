# GalaxyMaps demo script

Numbers below come from the bundled dataset (catalog 1.1.0). Solar System distances change with the map date; star and galaxy distances do not.

## Setup

```bash
npm run build && npm start        # http://localhost:8787, one process, no dev overlay
```

- Use Chrome or Edge, full screen (1440×900 or larger), browser zoom at 100%.
- Open http://localhost:8787. The app opens locked on Earth.
- **With an xAI key:** open the Guide once and check that it says Grok Voice is available, and allow the microphone.
- **Without a key:** the Guide shows "Offline guide (scripted)". Present it as the scripted fallback, not as Grok.
- Fallback tabs:
  - `http://localhost:8787/?route=earth,mars&mode=light` (Earth → Mars transfer)
  - `http://localhost:8787/?route=earth,polaris&mode=voyager-1`
  - `http://localhost:8787/?view=andromeda` (Andromeda, Explore inside)
  - `http://localhost:8787/?view=universe`
- Close heavy tabs and notifications; the map uses WebGL.

---

## Two-minute demo

| Time | On screen | Say |
| --- | --- | --- |
| 0:00–0:15 | Home: Earth close-up, "Locked on Earth" | "GalaxyMaps is a map app for the universe: search a place, open its card, get directions, using real catalog data." |
| 0:15–0:35 | Drag to orbit Earth, scroll to zoom. Press **Back to explore**, then pick **Solar System** from the region pills | "Locked on an object, dragging orbits it and zoom goes toward it; you can't accidentally pan away. Back to explore gives the free map back." |
| 0:35–1:00 | Search `mars`, open the card, press **Directions** | "Planet to planet, the primary answer is an orbital transfer: an idealized Hohmann ellipse, about 259 days, with the next alignment window. Straight lines are just a benchmark." |
| 1:00–1:20 | Press play on the route preview, then **Play time** on the map | "The preview runs on its own clock. Play time moves every planet; it pauses while I interact and resumes when I stop." |
| 1:20–1:40 | Region **Galaxies → Andromeda**. Show the Explore-inside list | "Andromeda has 21 features here: companions, the central black hole, globular clusters, novae, a supernova, with breadcrumbs back up to the universe." |
| 1:40–2:00 | Region **Observable universe** | "At the largest scale we switch to a schematic: logarithmic distance, labelled as such, no fake linear scale bar. Every number in GalaxyMaps has a source, and every assumption is on screen." |

---

## Four-minute demo

### 0:00–0:20 Hook

"Space distances are numbers nobody can feel, but everyone can read a map, a route and an ETA. GalaxyMaps puts the universe in a map you already know how to use."

### 0:20–1:00 Locked camera and cards

- The app opens **Locked on Earth**: a textured Earth with night lights and clouds.
- Drag (orbit with inertia), scroll (zoom toward Earth), arrow keys (orbit). "No panning while locked; the object stays centred in the part of the map you can see."
- Press **/**, type `black hole`, and choose **Sagittarius A***. "Search covers names, aliases, catalog IDs and type words. Results have thumbnails and real distances."
- Open the **Browse** grid button: "Eight categories with real counts; choosing one emphasizes those markers on the map."

### 1:00–1:50 Directions: Earth → Mars, then Earth → Polaris

- Search `mars` → **Directions**.
  - "Orbital transfer first: an idealized Hohmann transfer, about 259 days (8.5 months), departure and arrival dates for the next window, Δv, and the transfer arc on the map."
  - "Below it is the speed comparison: the straight-line distance today, at light speed. That's a benchmark, not a flight path."
- Change the destination to `polaris`.
  - "Beyond planets we use a straight-line cruise. The Travel mode dropdown has exactly two options."
  - **Light speed**: about 433 years. **Voyager 1** (16.92 km/s, measured by JPL Horizons): about 7.7 million years.
- Press **Back to explore** or **Focus Polaris** to show the route camera and the way back to the lock.

### 1:50–2:30 Play time

- Back to Earth (**H**), pick **Solar System**, and press **Play time** at **1 week / s**.
- "Planets move on JPL Horizons positions and spin on IAU rotation models. Start dragging and it pauses; let go and it resumes. Hide the tab and it pauses."
- Lock on Jupiter while it plays: "A locked moving body stays centred."

### 2:30–3:10 Andromeda and the observable universe

- Region **Galaxies → Andromeda**, then **Explore inside**: breadcrumbs Universe › Local Group › Andromeda Galaxy, with companions, the M31* nucleus and its clusters.
- "Galaxies are drawn as discs at their measured position angle and axis ratio. The features' depth inside Andromeda isn't measured, and the panel says so."
- Region **Observable universe**: "A schematic, logarithmic overview of a sphere about 46 billion light-years in radius. Click any catalog dot and we fly back to its local frame."

### 3:10–3:40 Honest data and the guide

- Search **Alnilam**: "Its parallax is 27% uncertain, so we don't invert it and offer no route; the card explains why."
- Open the Guide.
  - **If Grok is live**: "Take me from Earth to Betelgeuse." Point out the tool calls; Grok reads back our numbers.
  - **If offline**: type `take me to the Death Star`. "It refuses: it's not in the catalog. Live or scripted, the guide can only call validated tools."

### 3:40–4:00 Close

"GalaxyMaps: 374 curated destinations, 919 catalog objects, 109,000 stars, planets at real positions, every number sourced and every assumption visible. Directions across the universe."

---

## Phone (optional, 20 seconds)

Open the same URL on a phone or with device emulation at 390×844: floating search at the top, a bottom sheet you can drag between collapsed, half and full, pinch to zoom and two-finger rotate.

## Likely Q&A

- **Where does the data come from?** NASA/JPL Horizons and SBDB, NASA fact sheets, HYG v4.4, SIMBAD, the NASA Exoplanet Archive, cited papers for galaxy distances, Wikipedia/Wikimedia Commons for text and images. Preprocessed into a bundle so the demo runs offline. See `docs/DATA.md`.
- **Why is Earth → Mars not a straight line?** Spacecraft coast on orbits. The Hohmann ellipse is the textbook minimum-energy transfer between circular, coplanar orbits; the straight line is only a benchmark.
- **Why only light speed and Voyager 1?** One physical limit and one real, measured spacecraft speed. More modes invited invented numbers.
- **Is the Milky Way real?** It's a reconstruction from published spiral-arm models, labelled as such. Nobody has photographed our galaxy from outside.
- **VR?** Enter VR appears on browsers that support immersive WebXR. The code is in place, but headset validation is still pending.
- **What does Grok do?** It talks and chooses tools; GalaxyMaps does every lookup and calculation. The API key never reaches the browser.
