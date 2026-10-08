# GalaxyMaps demo runbook

Use this at the table and on stage. The app runs without an API key. Grok is optional.

## Machine setup

1. Node 22+. From the repo: `npm install && npm run build && npm start`.
2. Open **Chromium** at http://localhost:8787 (production build). Dev (`npm run dev`, :5173) also works.
3. One window, 100% zoom, 1440×900 or native 16:9. Close extra tabs.
4. Notifications off. Fullscreen the browser if the projector is noisy.
5. Confirm Earth is locked (Home). If not, press `H`.
6. Dismiss the gesture hint (X) once.
7. Optional: Accessibility → Voice → Test microphone. Press `M` once, then End, so the audio context is unlocked.
8. Bookmark:
   - Home: http://localhost:8787/
   - Earth → Polaris: http://localhost:8787/?route=earth,polaris
   - Earth → Mars: http://localhost:8787/?route=earth,mars
   - Universe: http://localhost:8787/?view=universe
   - Mission Control: http://localhost:8787/?panel=guide
   - Orion: http://localhost:8787/?place=orion-nebula
   - Saturn: http://localhost:8787/?place=saturn

`/?route=earth,polaris` is the **demo reset**. If anything goes weird, paste it and wait two seconds.

Do not open `galaxies.wiki` unless you have just confirmed it loads. It returned HTTP 500 when this deck was built.

## Starting state

- Layer: Realistic
- Clock: paused
- Sidebar: open
- No comparison, sky, tour, or quiet view
- Mission Control closed
- Voice: off, unless you already unlocked audio

## 2-minute path (default)

| Step | Click / key | You should see |
| --- | --- | --- |
| 1 | `H` | Textured Earth, “Locked on Earth” |
| 2 | `/` then type `Polaris` Enter | Polaris card; gray star model is fine — do not linger |
| 3 | **Directions** | Earth → Polaris, **433 years**, 433 light-years, light-speed mode |
| 4 | Travel mode → **Voyager 1** | Same distance, millions of years |
| 5 | Mode back to **Light speed** | 433 years again |
| 6 | **Mission Control** or `M` | “Grok connected” / Talk to Grok, or the labeled offline guide |
| 7 | Say or type: `What am I looking at?` | A sourced explanation. Tool rows may appear. |
| 8 | Quiet view **or** Observable universe | One wow. Esc restores Quiet view. |

If Begin journey is buttery, use it between 5 and 6. If it stutters on the projector GPU, skip it.

## 4-minute extras (pick, do not stack)

- Earth → Mars: Hohmann **8.5 months**, next alignment, transfer arc. Say “not a straight line.”
- Compare sizes: Earth / Jupiter, “about 11×, true scale.”
- Observable universe → click Andromeda → local frame.
- Orion + Quiet view (the closer screenshot).
- WebXR: only if `Enter VR` is visible **and** a headset is already in the session.

## Voice commands that are safe

- “Take me from Earth to Polaris”
- “What am I looking at?”
- “Switch to Voyager 1”
- “Compare Earth and Jupiter”
- “Zoom out to the observable universe”
- “Goodbye” (ends voice)

Grok may only call app tools. If it talks without moving the map, it still used tools or it failed — glance at “Map action” lines.

## Backup paths

| Failure | What to do |
| --- | --- |
| Grok voice fails / mic silent | Type in Mission Control. If the pill says offline, **call it the offline guide**. Do not say “Grok said.” |
| xAI / internet down | Map still works. Stay on routes. Slide 3 + 4 if needed. |
| Image missing / gray Polaris | That is a schematic star body. Jump to Saturn (`/?place=saturn`) or Orion. |
| Route numbers look wrong | Reload `/?route=earth,polaris`. Do not compute out loud. |
| Play time error / Kepler | Should be fixed (hyperbolic visitors). If the clock throws, pause it and ignore Play time. |
| WebXR missing | `Enter VR` only appears when the browser supports `immersive-vr`. Skip. Do not apologize at length. |
| Deployed URL dead | Use local `npm start`. The catalog is bundled. |
| Laptop GPU melts | Atlas layer (`L`), or stay on Earth / Saturn, or jump to slides 3–6. |
| Demo totally dead | Slides 3, 4, 6. Point at the Polaris screenshot. GitHub QR. |

## If you must jump slides

- Demo broken at the start → stay on slide 3, then 4, then 6.
- Judge asks architecture → backup A (slide 7).
- Judge asks “is this real science?” → backup B (slide 8).
- Judge asks a11y / VR → backup C (slide 9).
- Judge asks Grok / SpaceX → backup D (slide 10).

## Reset in seconds

| Goal | Action |
| --- | --- |
| Home Earth | `H` |
| Signature route | `/?route=earth,polaris` |
| Close overlays | `Esc` until the map is clean |
| End voice | `M` or End voice |
| Leave quiet view | `Esc` or Restore controls |
| Hard reset | Reload `/` |

## Headset (only if already working)

Secure origin (localhost or HTTPS). Quest USB: `adb reverse tcp:8787 tcp:8787`, open http://localhost:8787. Look at an object ~0.5 s, pinch to fly. Do not pair a headset during the 2-minute round.
