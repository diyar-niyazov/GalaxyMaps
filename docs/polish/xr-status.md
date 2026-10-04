# WebXR / visionOS validation status

Upstream documentation and the current repository were reviewed on **2026-10-03**. **Apple Vision Pro, visionOS Simulator, Quest and other physical XR runtimes have not been tested in this Linux workspace.** Desktop Chromium checks validate the ordinary page and unsupported-WebXR fallback, not immersive rendering, tracking, pinch input, stereo quality or headset performance.

## Current primary documentation

Safari has supported WebXR `immersive-vr` on visionOS since Safari 18 / visionOS 2. Its documented input includes `transient-pointer` for look-and-pinch interaction. This is a runtime capability to detect, not an assumption based on the browser's name. [WebKit Safari 18 release notes](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/)

The current Safari 27 release notes add texture-array projection layers to WebXR Layers. GalaxyMaps uses Three.js's existing WebGL XR session integration; this additive feature does not require replacing the application renderer. [WebKit Safari 27 release notes](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/)

Apple documents that immersive sessions hide page DOM and render through WebGL. Its simulator can exercise transient pointers; actual hand-tracking validation needs a device. Simulator success is therefore separate from hardware acceptance. The documented development origins are HTTPS and trusted localhost. [Apple WWDC24 WebXR session](https://developer.apple.com/videos/play/wwdc2024/10066/)

WebXR exposes `navigator.xr` in a secure context, starts immersive sessions through user activation, and applies the `xr-spatial-tracking` permissions policy. Probe `isSessionSupported('immersive-vr')`, and keep `requestSession` in the initiating button event. A cross-origin preview frame must allow the relevant policy; plain LAN HTTP is unsuitable for headset deployment. [W3C WebXR Device API](https://www.w3.org/TR/webxr/)

Vision Pro's transient input sources may exist only during a pinch; enabling hand tracking can put the pinch sources beyond indices 0 and 1. Session-level input events and the event's actual source avoid this index assumption. `targetRaySpace` supplies a selection ray; `gripSpace` is appropriate for an object attached to the pinch. [WebKit natural-input explanation](https://webkit.org/blog/15162/introducing-natural-input-for-webxr-in-apple-vision-pro/)

Three.js's XR camera updates automatically by default. Set the reference-space type before an active session and use the manager's asynchronous `setSession` integration. [Three.js WebXRManager documentation](https://threejs.org/docs/pages/WebXRManager.html)

## Repository review

The following are code-review findings, not hardware results:

| Area | Current implementation |
| --- | --- |
| Availability | `XrButton` probes `navigator.xr.isSessionSupported('immersive-vr')`. An unavailable button explains that a supported headset browser and secure origin are needed; no browser-name guess establishes support. |
| Entry | The button directly requests `immersive-vr`; `local-floor` and `hand-tracking` are optional. Presentation uses `local` reference space. |
| Rendering | `XrPresentation` reuses the map's WebGL renderer, pauses the flat map engine, then installs a Three.js XR animation loop. Catalog time, route playback and app camera orbit are paused. Body orientation stays at the captured epoch. Installed Three.js calls `makeXRCompatible` when needed. |
| Tracking authority | Application code does not write to the runtime viewer pose. Three.js retains `cameraAutoUpdate=true`; the tracked camera supplies head motion. The explicit Recenter control moves scene content in front of the current pose. |
| Transient-pointer selection | The presentation listens on the session's `select` event and calls `event.frame.getPose(event.inputSource.targetRaySpace, referenceSpace)`. It does not assume persistent controllers or indices 0 and 1. A missing pose returns safely. |
| Spatial controls | Focus, Previous/Next, bounded Smaller/Larger, Recenter and Exit VR are pickable scene elements. Active tours use Prev/Next stop with the sourced chapter text and commit the selected stop on exit. Other browsing preserves its cycle across successive Next actions. |
| Ordinary exit | App and runtime exit remove listeners/animation loop and dispose scene resources once. The exact preceding camera, panel, route and epoch return when no new destination was chosen. An intentional different spatial selection opens its destination card while preserving route stops and date. A changed guided stop resumes that tour on return. |
| Startup failure | `ImmersiveEntry` owns acquired sessions through lazy-import and renderer initialization. Failures end the session, then restore the flat renderer after Three.js's own end listeners; this ordering also covers compatibility failures before Three.js saved a pixel ratio. Repeated exit and late acquisition after cancellation are covered by tests. |
| Presentation honesty | Saturn's rings use catalog radii and the existing credited texture. Surface reconstructions, illustrative symbols, schematic related positions/sizes and the NASA/Goddard SVS sky panorama are labeled in the spatial scene. Mission chapters show an explicit context model rather than a fabricated trajectory. |
| Sky chart scope | The new Earth-centered chart is a flat interactive canvas, usable in a visionOS Safari page. Its DOM chart is not presented inside immersive VR; entering it during an active immersive session is rejected with a usable explanation. |
| Remaining immersive scope | Full comparison UI, chapter photography and the Earth-sky chart remain flat-page interfaces. Spatial tour/story controls provide sourced text, context inspection and Prev/Next stop; the ordinary page provides full images and source links on return. |

Automated lifecycle tests cover permission denial, import and renderer failure, late acquisition after cancellation, repeated/system exit, spatial Exit rejection, renderer restoration order, exact map return, intentional destination return, transient-source missing-pose input, related-object cycling and guided-stop boundaries. These checks use mocked sessions and renderer ownership; they do not establish headset rendering or comfort.

## Actual runtime acceptance still required

Record the headset, OS, browser version, HTTPS test URL and date for each run:

1. Enter from a locked Earth or Saturn view; verify stable stereo composition, scene lighting, rings and readable spatial controls. Turn and translate the head naturally; verify that application orbit or framing never overwrites tracking.
2. Use look-and-pinch to select an object and Exit VR. Repeat with optional hand tracking allowed and denied; confirm selection works regardless of source indices and permission outcome.
3. Test app Exit VR and runtime/system exit from a locked view, a route, and a tour's underlying scene. Confirm the preceding useful flat view, orientation and panel return correctly.
4. Exercise session-request denial and a startup failure after session acquisition. Confirm the headset session ends, the map resumes, and a subsequent entry can succeed.
5. Repeat entry/exit and changes of focused object while watching texture/geometry counts and frame timing. Verify no cumulative resources, duplicated render loops, or stale transient-pointer rays.
6. Test the flat phone/window experience independently. Desktop screenshots and a visionOS simulator run do not establish comfortable or performant real-headset behavior.

Until those runs are recorded, report **implemented; hardware validation pending**, not verified Vision Pro compatibility.
