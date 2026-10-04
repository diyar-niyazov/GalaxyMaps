# GalaxyMaps · Speaker notes (BigRed//Hacks 2026)

TWRD: Teddy Lampert, Yijun Wang, Raj Iyer, Diyar Niyazov · https://www.galaxies.wiki/

The same narration is in each deck's presenter notes. Backup slides come after the closing slide and are for Q&A only. Q&A (about two minutes) happens after the pitch and isn't part of the timing.

## Round one: 5 slides, target 1:50, hard stop 2:00

182 spoken words. At 125–135 words per minute that leaves room for visual pauses. Rehearse with a stopwatch, including clicks.

| Slide | Slot | Say |
|---|---:|---|
| 1. GalaxyMaps | 0:00–0:14 | We’re TWRD. We thought it would be cool to navigate through space. So we built GalaxyMaps: a familiar map that helps people explore space and understand what they’re looking at. |
| 2. Earth to Polaris | 0:14–0:42 | Search for a destination and get directions. Here’s Earth to Polaris. At light speed, this distance takes about 433 years. At Voyager 1’s speed, it takes millions. You can compare the trips and watch the journey. That’s how we make scale easier to grasp. |
| 3. “Show me Saturn.” | 0:42–1:08 | Grok lets you control the map by voice. Ask it to show Saturn, compare planets, or start a tour. It calls validated tools in our Three.js app, while our code calculates the distances and travel times. We built the app with Cursor. |
| 4. Space, from your classroom | 1:08–1:37 | The same map runs in compatible WebXR headsets. Here’s our Vision Pro demo. You can also explore in a browser, with keyboard controls, spoken descriptions, high contrast, and reduced motion. That gives more students a way in, even without a headset. |
| 5. Where would you go? | 1:37–1:50 | We want a student to ask a question about space and explore the answer. That’s our take on navigation. We’re TWRD, and this is GalaxyMaps. |
| Buffer | 1:50–2:00 | Transitions or a short delay. |

If you're running behind, skip the Voyager mode switch. Keep the classroom point and the closing line, and don't speed-read to catch up.

## Finalist: 6 slides, target 3:45, hard stop 4:00

| Slide | Slot | Say |
|---|---:|---|
| 1. GalaxyMaps | 0:00–0:25 | We’re TWRD — Towards a new frontier: Teddy, Yijun, Raj, and Diyar. We thought it would be cool to navigate through space. We wanted a way for people to explore space and understand what they’re looking at. This is GalaxyMaps. Navigate the universe. |
| 2. Space is vast. | 0:25–1:05 | Space is vast. Now it’s yours to explore. Whether you're a student or just curious, GalaxyMaps guides you through the stars. Plot a course from Earth to Mars, or venture beyond. Let Grok guide you, or explore with your own hands — in a browser, or inside VR. |
| 3. Bring the universe into the classroom. | 1:05–1:50 | Bring the universe into the classroom. Explore in a browser, or step into the stars with any WebXR headset. Ask questions, navigate by voice, and learn as you go. We designed GalaxyMaps so more people can get in: keyboard and voice, larger text, high contrast, and reduced motion. |
| 4. Grok, take me to Saturn… | 1:50–2:40 | Ask Grok to take you to Saturn and tell you more. Grok is your navigator and your astronomy tutor. It can fly the map and explain what you’re looking at — why Mars is red, how the Sun produces energy, why light can’t escape a black hole. |
| 5. Space should be accessible to everyone. | 2:40–3:20 | Space should be accessible to everyone. Voice, keyboard, mouse, touch, or spatial interaction. You can explore hands-free, and the same universe is there in a browser or a headset. |
| 6. Where would you go? | 3:20–3:45 | We want a student to ask a question about space and explore the answer. That’s our take on navigation. We’re TWRD — Towards a new frontier, and this is GalaxyMaps. |
| Buffer | 3:45–4:00 | |

The classroom scenario is a proposed use and evaluation plan. It isn't a claim of deployment or of measured learning gains.

## Facts behind the slides (captured from the app on 2026-10-04)

- **Earth → Polaris:** 433 light-years (133 pc). That's 433 years at light speed, about 5.4 eighty-year lifetimes. At Voyager 1's 16.9 km/s it's 7.7 million years. Distance uncertainty is ±6.4 ly, from Polaris's parallax of 7.54 ± 0.11 mas. The model is a straight line at constant speed, with positions frozen at the map date.
- **Engineering:** positions are float64 ICRF kilometres, projected relative to the camera every frame. Route math is in TypeScript, separate from rendering. The straight-line benchmark and the idealized Hohmann transfer are separate models. Grok can act only through the validated app tools.
- **Accessibility panel:** high contrast, larger text, reduced motion, a map navigation toolbar, Describe current view, keyboard shortcuts, and read-aloud. The app aims toward WCAG 2.2 AA and lists its known limitations. Don't claim full conformance.
- **Vision Pro images:**
  - The Earth and galaxy captures are GalaxyMaps in the Vision Pro *spatial browser*.
  - The Saturn capture is the *immersive* WebXR view with the Grok mic HUD.
  - The Andromeda capture is the *immersive* WebXR view with the destination card and Grok HUD.
  - These are stills: they show no motion and no completed voice command.
  - Only Apple Vision Pro has device evidence, so don't call other headsets tested.
- **Demo-2:** five chapters, with NASA photographs (credited) and NASA source links. The story says it doesn't reconstruct a flight trajectory.

## Backup slides (after the close, not timed)

1. **Under the map** — sources panel and how route math stays separate from the display.
2. **Demo-2** — five NASA-sourced mission chapters.
3. **More of GalaxyMaps** — eight real app screenshots: Explore, Earth→Polaris, Earth→Mars Hohmann, size compare, Grok, accessibility, nebulae tour, Demo-2. Details stay in presenter notes.

## Before judging

- **Typed Grok "Show me Saturn." didn't work when this deck was built.** In three runs, Grok only called `searchObjects` and then *said* it had flown to Saturn, while the map stayed on Earth. Don't demo that exact typed command live until it's fixed or re-tested. Use a command you've confirmed moves the map, or describe the Vision Pro still.
- Preload `/?route=earth,polaris`, turn off notifications, keep the laptop awake, and leave the closing slide (QR code) up during Q&A.
- Prepare one true sentence about each teammate's work.
