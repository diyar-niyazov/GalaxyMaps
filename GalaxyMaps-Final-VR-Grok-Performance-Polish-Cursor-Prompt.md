# GalaxyMaps --- Final VR Performance, Grok Voice & Travel Polish Prompt

## Objective

Perform a **surgical final-polish pass on the existing GalaxyMaps VR
experience**, with Apple Vision Pro / WebXR as the priority.

**Do not redesign or rewrite the app. We are very close to finished.**
Preserve the current visual design, features, interaction model, data
architecture, and desktop experience unless a small change is necessary
to fix one of the issues below.

The goal is to make the existing VR experience:

-   smoother;
-   less glitchy;
-   faster;
-   more comfortable;
-   more consistent with desktop;
-   better at zooming;
-   better during cinematic travel;
-   and much better at Grok voice navigation.

Work efficiently. Fix the highest-impact problems first. Avoid large
refactors unless profiling proves one is necessary.

------------------------------------------------------------------------

# 1. Inspect and reproduce before changing anything

First inspect the current implementation and run the app.

Specifically reproduce and investigate:

1.  Enter VR.
2.  Navigate to **NGC 55**.
3.  Compare how close/far the user can zoom in VR versus normal
    desktop/3D mode.
4.  In VR, zoom very far in and very far out until the reported
    **TV-static / visual-noise glitch** appears.
5.  Start several VR journeys and observe camera smoothness.
6.  Use Grok Voice to say something like:
    -   "Take me to Saturn."
    -   "Take me to NGC 55."
7.  Measure/observe:
    -   time from finishing the command to Grok understanding it;
    -   time until the navigation action begins;
    -   time until the camera actually arrives;
    -   when Grok speaks relative to those events;
    -   FPS/frame-time behavior before, during, and after Grok;
    -   FPS/frame-time during VR travel;
    -   whether entering/exiting VR leaks resources or leaves duplicate
        loops/sessions/listeners.
8.  Inspect the current Play/simulated-time state and date display in
    desktop and VR.
9.  Inspect all current VR controls and identify obvious friction,
    clipping, jitter, accidental activation, or unnecessary work.

Do not guess at causes. Diagnose them.

------------------------------------------------------------------------

# 2. Priority order

Work in this order:

### P0 --- must fix

1.  VR lag/glitching and obvious performance problems.
2.  TV-static visual corruption at extreme VR zoom.
3.  NGC 55 / object zoom inconsistency between VR and desktop.
4.  Grok navigation timing: action must begin promptly and speech must
    match actual navigation state.
5.  Push-to-talk Grok interaction.
6.  Smooth VR travel/camera movement.
7.  Consistent Play/simulation date/time state.

### P1 --- polish after P0 is stable

8.  VR control placement and interaction smoothness.
9.  Small VR rendering/performance optimizations.
10. Travel comfort and sensible travel-distance behavior.
11. General VR UX issues discovered during testing.

Do **not** spend time adding unrelated features.

------------------------------------------------------------------------

# 3. Change Grok VR voice to push-to-talk

Grok should **not behave like an always-listening, always-active VR
assistant**.

Implement a lightweight **push-to-talk Mission Control** interaction.

## Preferred Vision Pro interaction

Use the existing standards-based WebXR interaction system.

Preferred behavior:

1.  User looks at the Mission Control microphone control.
2.  User **pinches and holds**.
3.  `selectstart` / equivalent begins recording/listening.
4.  While held:
    -   microphone visibly indicates listening;
    -   a small waveform/pulse may animate if cheap;
    -   live transcript may appear if already supported.
5.  User releases the pinch.
6.  `selectend` / equivalent stops recording and sends/finalizes the
    request.
7.  Grok processes it.
8.  GalaxyMaps performs the requested action.
9.  Grok speaks an appropriately timed response.

This should feel like a walkie-talkie:

> **Look → pinch and hold → speak → release.**

### Fallback

If reliable hold/release semantics are not available in the current
Vision Pro/WebXR input path, use:

> **Look + pinch once to start recording → speak → pinch again to
> send.**

Make the state extremely obvious so the user always knows whether the
microphone is:

-   idle;
-   listening;
-   processing;
-   speaking;
-   unavailable/error.

Do not implement fragile device-specific hacks when standard WebXR
events already support the interaction.

------------------------------------------------------------------------

# 4. Grok HUD placement

In VR, make Grok Mission Control a **small head-relative HUD near the
bottom-center of the user's field of view**.

Important: "head-relative" should not mean an uncomfortable panel
rigidly jittering with every tiny head movement.

Use a comfortable HUD behavior:

-   bottom-center;
-   below the primary object/route focus;
-   does not obscure destinations;
-   comfortably readable;
-   subtle when idle;
-   expands only while actively being used;
-   smooth/damped repositioning if necessary to avoid jitter;
-   always reachable without turning around.

The compact HUD should show only what is useful:

-   microphone / push-to-talk state;
-   short live transcript;
-   short Grok response/status;
-   mute/stop if needed;
-   close/dismiss.

Do not put the full desktop chat interface in VR.

Do not let long Grok responses become a giant floating text wall.
Truncate/scroll/expand intelligently and favor concise spoken responses
in VR.

------------------------------------------------------------------------

# 5. Fix Grok saying navigation completed before it actually completes

This is a major UX bug.

Current problem:

> User says "Take me to Saturn."\
> Grok is slow, then says it took the user there before GalaxyMaps has
> actually finished moving there.

Fix the action lifecycle.

## Required lifecycle

For a navigation request:

### Step 1 --- intent/tool call

Grok determines the requested destination and issues the appropriate
GalaxyMaps navigation/tool action.

### Step 2 --- navigation begins immediately

As soon as a valid destination/action is known, GalaxyMaps should begin
the camera/navigation transition.

Do **not** unnecessarily wait for a complete verbose Grok response
before starting the map action.

### Step 3 --- correct in-progress language

While the camera is moving, Grok may say:

-   "Taking you to Saturn."
-   "Heading to NGC 55."
-   "On our way."

It must **not** say:

-   "We're here."
-   "I've taken you to Saturn."
-   "You've arrived."

before the camera has actually arrived.

### Step 4 --- app owns arrival truth

The map/navigation system---not Grok---determines when navigation has
actually completed.

Expose or reuse a deterministic event/state such as:

-   `navigationStarted`
-   `navigationProgress`
-   `navigationCompleted`
-   `navigationCancelled`

Adapt names to the existing architecture.

### Step 5 --- arrival response

Only after the actual navigation-complete event may Grok say:

-   "We've arrived at Saturn."
-   "This is NGC 55."

If the user interrupts/cancels travel, Grok must not later announce
arrival.

## Important architectural principle

> **Grok requests actions. GalaxyMaps owns navigation state. Grok
> describes that state.**

Do not let model-generated wording determine whether the app considers a
route complete.

------------------------------------------------------------------------

# 6. Reduce perceived Grok latency without keeping it "on 24/7"

Optimize the current Grok implementation without building a large new
subsystem.

Desired behavior:

-   microphone is OFF unless the user intentionally activates
    push-to-talk;
-   do not continuously stream microphone audio;
-   do not run unnecessary voice processing every frame;
-   do not let voice UI updates cause expensive 3D scene re-renders;
-   keep voice state isolated from high-frequency XR render state.

Investigate whether the existing integration can cheaply:

-   preload/lazy-load the voice UI;
-   reuse a recently established voice session briefly after first use;
-   avoid repeatedly reconstructing clients/connections;
-   stream tool calls/results as soon as available;
-   begin navigation before a long spoken answer is generated.

If keeping a voice connection warm briefly after use improves
responsiveness without causing meaningful VR performance/API problems,
it is acceptable. The microphone must still be inactive.

Prefer a **short idle timeout** over an always-running voice session.

Do not make speculative architecture changes if the existing
implementation is already close.

------------------------------------------------------------------------

# 7. Fix VR lag and glitching

Profile the actual XR render path.

Look for high-impact problems including:

-   excessive particle/star counts;
-   too many galaxy particles at close range;
-   unnecessary labels;
-   expensive transparent layers;
-   overdraw;
-   high-resolution textures;
-   oversized render targets;
-   post-processing running unnecessarily in XR;
-   duplicated render loops;
-   React state updates every XR frame;
-   excessive object allocations inside animation loops;
-   unnecessary raycasts;
-   repeated catalog filtering;
-   repeated material/geometry creation;
-   expensive shadows;
-   unnecessary lighting;
-   WebXR pixel ratio/render scale;
-   Grok transcript updates triggering large component trees;
-   audio visualization work;
-   event-listener leaks;
-   voice/WebSocket leaks;
-   Three.js objects not disposed;
-   VR session resources not cleaned up;
-   multiple camera/control systems fighting each other.

Make targeted optimizations.

## Important constraint

**Do not noticeably degrade the current appearance unless absolutely
necessary.**

We are almost finished. Preserve the visual quality.

Prefer optimizations such as:

-   reuse/memoization;
-   instancing;
-   LOD;
-   frustum/distance culling;
-   hiding irrelevant labels;
-   avoiding unnecessary React renders;
-   reducing invisible work;
-   reusing geometry/materials;
-   cleaning up leaked resources;
-   lowering detail only for objects too distant to perceive it;
-   pausing nonessential work while traveling or while VR panels are
    hidden.

Do not globally slash star density, texture quality, or galaxy quality
merely to improve a benchmark.

------------------------------------------------------------------------

# 8. Fix the "TV static" glitch at extreme VR zoom

Reproduce the visual-static/noise problem by zooming too far
inward/outward in VR.

Determine the actual cause before fixing it.

Investigate likely XR/3D causes such as:

-   near/far camera clipping planes;
-   insufficient depth-buffer precision;
-   z-fighting;
-   logarithmic-depth behavior;
-   particles/sprites intersecting or passing behind the camera;
-   extreme object/camera scales;
-   floating-point precision at astronomical coordinates;
-   invalid/NaN transforms;
-   shader instability;
-   transparent-particle overdraw;
-   XR-specific render-target/depth behavior;
-   camera crossing inside geometry;
-   incorrect scale-transition thresholds.

Do not simply hide the glitch with a restrictive zoom limit unless that
limit is genuinely the correct UX boundary.

The correct result is:

-   users can zoom through the useful intended range;
-   no TV-static effect;
-   no camera clipping through objects;
-   no visual explosion/noise;
-   no NaN/invalid matrices;
-   transitions remain smooth.

------------------------------------------------------------------------

# 9. Make VR zoom behavior consistent with desktop

Use **NGC 55 as a regression test**.

Current problem:

> In VR, the user cannot zoom as far into NGC 55 as they can in normal
> 2D/desktop 3D mode.

Fix the underlying inconsistency.

Prefer one shared source of truth for:

-   object radius/display radius;
-   minimum camera distance;
-   maximum camera distance;
-   object-specific zoom limits;
-   galaxy zoom limits;
-   camera target;
-   scale transitions.

VR may need a small comfort/safety difference, but it should not
arbitrarily prevent the user from inspecting an object at the useful
level available on desktop.

Test multiple classes:

-   planet;
-   star;
-   nebula;
-   Milky Way;
-   NGC 55;
-   Andromeda;
-   another distant galaxy.

Do not fix NGC 55 with a one-off hardcoded exception if the real problem
is shared camera constraints.

------------------------------------------------------------------------

# 10. Smooth VR zooming

VR zoom should feel deliberate and comfortable rather than jerky.

Improve the existing interaction rather than replacing it.

Check:

-   zoom sensitivity;
-   acceleration;
-   damping;
-   min/max clamp behavior;
-   target interpolation;
-   frame-rate dependence;
-   gesture delta scaling;
-   camera near/far updates;
-   transition between scale regimes.

Requirements:

-   use delta-time/frame-rate-independent interpolation where
    applicable;
-   no abrupt snapping at zoom boundaries;
-   no oscillation;
-   no sudden giant scale jumps;
-   no camera clipping;
-   keep the selected object stable as the focal target.

Preserve the existing gesture/control semantics unless they are clearly
broken.

------------------------------------------------------------------------

# 11. Make VR travel much smoother

The existing "travel through space" feature is important, but do not
turn it into a new game.

Polish the current feature.

## Desired experience

When the user starts travel:

1.  origin is stable and clearly visible;
2.  route/travel begins smoothly;
3.  camera accelerates gently away;
4.  user experiences forward motion through space;
5.  route progresses without jitter or sudden scale jumps;
6.  destination resolves naturally ahead;
7.  camera decelerates;
8.  user arrives at a good inspection distance;
9.  destination becomes the locked target;
10. GalaxyMaps emits `navigationCompleted`;
11. only then may Grok announce arrival.

## Smoothness

Fix:

-   camera interpolation;
-   frame-rate dependence;
-   abrupt FOV changes;
-   zoom jumps;
-   target switching;
-   precision problems over huge distances;
-   camera shake/jitter;
-   sudden rotation;
-   destination overshoot;
-   awkward arrival distance.

Prefer smooth interpolation/easing and camera-relative/local coordinate
techniques already compatible with the codebase.

Avoid unnecessary roll.

Keep the user facing approximately in the direction of travel unless the
current experience intentionally does otherwise.

------------------------------------------------------------------------

# 12. Define a reasonable boundary for cinematic VR travel

Do not literally fly a camera through enormous astronomical world
coordinates if that causes precision/performance problems.

Use the following product rule:

## A. Local / Solar System scale

Where the existing route has a meaningful spatial/orbital path:

-   visually follow that path;
-   preserve curved transfer trajectories where implemented;
-   allow nearby planets/moons/objects to provide spatial context.

## B. Stellar / galactic scale

For enormous distances:

Use a **compressed cinematic journey**, not literal traversal of every
world-space meter.

The experience may:

1.  depart from the origin normally;
2.  transition into a stable high-speed cruise/starfield phase;
3.  interpolate route progress in normalized/local coordinates;
4.  transition into the destination's local coordinate frame;
5.  approach and arrive.

This prevents astronomical coordinate precision from destroying VR
smoothness.

Clearly separate:

-   **physical calculated travel time** shown in the UI;
-   **visual demo travel duration** used for the cinematic experience.

The visual trip should take only a few seconds regardless of whether the
real/hypothetical trip is years or millions of years.

## C. Extremely large-scale / observable-universe transitions

Do not attempt a long first-person "rocket flight" across the entire
universe.

Use a short cinematic zoom/scale transition or fade between scale
regimes.

### Recommended practical boundary

Do not define the boundary purely as an arbitrary number of light-years
unless the current coordinate system makes that useful.

Instead, choose the transition based on the renderer's existing **scale
regime**:

-   same local/Solar-System scene → continuous spatial flight;
-   cross-system/interstellar/galactic scene → compressed cinematic
    flight;
-   cross-universe/overview regime → scale transition/fade.

This is more robust than forcing one travel technique across radically
different coordinate systems.

------------------------------------------------------------------------

# 13. Preserve comfort in VR travel

Do not over-engineer this, but fix obvious discomfort.

Prefer:

-   gentle acceleration/deceleration;
-   no sudden roll;
-   minimal forced rotation;
-   stable forward direction;
-   smooth destination approach;
-   immediate `Skip` / `Stop`;
-   pause if already supported;
-   reduced-motion alternative;
-   no aggressive FOV pulsing.

If a vignette/comfort effect already exists, make sure it works.

Do not add a large new comfort system unless needed.

------------------------------------------------------------------------

# 14. Play / simulated-time date consistency

Inspect the current **Play / simulated time** implementation.

There must be one authoritative simulation clock/state shared by desktop
and VR.

Fix any inconsistency where:

-   entering VR resets the simulated date;
-   leaving VR changes the date;
-   desktop and VR show different dates;
-   Play/Pause state diverges;
-   objects use one simulated time while the UI displays another;
-   route/travel temporarily corrupts simulation time.

Requirements:

-   same simulation date/time before and after entering VR;
-   same Play/Pause state;
-   one source of truth;
-   entering/exiting VR does not silently reset time;
-   date label updates consistently;
-   travel-animation duration is separate from simulated astronomical
    time unless explicitly designed otherwise.

If the user pauses simulated time, entering VR must not silently resume
it.

If the user plays simulated time, VR should reflect the same state.

------------------------------------------------------------------------

# 15. Improve VR controls without redesigning them

Audit the existing controls and make only high-value tweaks.

Check:

-   hit target size;
-   gaze target size;
-   pinch/select reliability;
-   control spacing;
-   accidental activation;
-   overlap;
-   clipping;
-   distance from viewer;
-   readability;
-   selected/hover state;
-   whether controls follow the user too aggressively;
-   whether panels obscure the object;
-   whether controls remain reachable after travel;
-   whether exit/reset/skip controls are obvious.

Keep the interface minimal.

Primary VR controls should be easy to reach:

-   Mission Control push-to-talk;
-   zoom/travel controls as currently appropriate;
-   Play/Pause;
-   route/travel action;
-   Skip/Stop during travel;
-   Back/Unlock;
-   Exit VR.

Do not move every desktop control into VR.

------------------------------------------------------------------------

# 16. Prevent UI and voice from hurting XR rendering

Keep high-frequency systems separate.

In particular:

-   XR camera/animation state should not be pushed through React state
    every frame;
-   live transcripts should not rerender the full map;
-   audio levels/waveforms should not cause expensive scene updates;
-   Grok status changes should update only the small HUD;
-   avoid recreating Three.js objects when transcript text changes;
-   do not run hidden desktop UI effects while immersive VR is active if
    unnecessary.

If the existing architecture already handles this well, leave it alone.

------------------------------------------------------------------------

# 17. Efficient implementation strategy

Time is limited.

Do **not** embark on a broad refactor.

Use this sequence:

### Phase 1 --- reproduce + profile

Find the actual causes of: - static; - NGC 55 zoom restriction; - VR
frame drops; - Grok/navigation timing problem.

### Phase 2 --- fix correctness

Fix: - zoom/clipping/static; - navigation lifecycle; - simulation clock
consistency.

### Phase 3 --- interaction polish

Implement: - push-to-talk; - bottom-center Grok HUD; - smoother zoom; -
smoother travel.

### Phase 4 --- targeted optimization

Fix only measured/high-confidence bottlenecks.

### Phase 5 --- regression test

Test the complete demo flow in VR and desktop.

Do not spend time producing a long audit document before fixing things.

------------------------------------------------------------------------

# 18. Regression checklist

Before finishing, verify:

## VR entry/exit

-   Enter VR.
-   Exit VR.
-   Re-enter VR.
-   No duplicate rendering loops.
-   No duplicated voice listeners.
-   No broken controls.
-   No obvious memory leak.

## NGC 55

-   Select NGC 55 on desktop.
-   Record useful closest/farthest zoom behavior.
-   Enter VR.
-   Confirm equivalent useful inspection range.
-   Zoom close.
-   Zoom far.
-   No TV static.
-   No clipping explosion.

## Other objects

Repeat basic zoom test for: - Earth; - Saturn; - a star; - a nebula; -
Andromeda; - Milky Way.

## Grok push-to-talk

-   Idle microphone is off.
-   Hold/pinch begins listening.
-   Release sends.
-   Visual state is obvious.
-   Command transcript appears.
-   "Take me to Saturn" begins navigation promptly.
-   Grok says "Taking you..." while moving.
-   Grok does not say "arrived" early.
-   Arrival event occurs.
-   Grok may then announce arrival.
-   Cancel travel and verify no false arrival announcement.
-   Voice failure does not break VR.

## Grok HUD

-   Bottom-center.
-   Does not obscure target.
-   Does not jitter badly.
-   Readable.
-   Compact when idle.
-   Transcript does not cause VR frame drops.

## Travel

Test: - Earth → Mars or another local route; - Earth → a star; - Earth →
NGC 55 / another galaxy if supported.

Verify: - smooth departure; - smooth cruise; - smooth arrival; - no huge
zoom jumps; - no static; - no camera shake; - Skip/Stop works; - arrival
distance is useful; - destination becomes locked correctly.

## Simulation time

-   Note date/time.
-   Play.
-   Enter VR.
-   Same simulation state.
-   Pause.
-   Exit VR.
-   Same state/date.
-   Travel does not unexpectedly reset it.

## Performance

Compare before/after: - idle VR; - zooming; - traveling; - Grok
listening; - Grok speaking; - galaxy close-up.

Use whatever browser/performance instrumentation is practical.

Do not invent FPS numbers if they cannot be measured reliably.

------------------------------------------------------------------------

# 19. Definition of done

This pass is complete when:

-   VR feels materially smoother;
-   obvious intermittent glitching is reduced/fixed;
-   extreme zoom no longer produces TV-static corruption;
-   NGC 55 has a useful VR zoom range comparable to desktop;
-   Grok is push-to-talk rather than effectively always listening;
-   Grok HUD sits unobtrusively near bottom-center of the VR view;
-   navigation begins as soon as the valid Grok action is available;
-   Grok no longer announces arrival before actual arrival;
-   VR travel is smoother;
-   enormous-distance travel uses a stable compressed cinematic approach
    rather than forcing literal huge-coordinate traversal;
-   simulation Play/Pause/date is consistent across desktop and VR;
-   controls are slightly more comfortable/reliable without a redesign;
-   the current visual look has not been unnecessarily changed;
-   desktop behavior has not regressed;
-   production build passes;
-   no new obvious console errors are introduced.

------------------------------------------------------------------------

# 20. Final instruction

This is a **final stabilization pass, not a feature sprint**.

Do not chase perfection through major rewrites.

Preserve what already looks good. Fix the actual VR pain points.
Optimize measured bottlenecks. Make Grok feel responsive by aligning its
speech with real app state. Make zoom and travel feel smooth. Remove the
visual corruption. Keep the interface familiar.

When finished, provide only a concise report with:

1.  fixes made;
2.  performance optimizations made;
3.  files changed;
4.  tests performed;
5.  anything that specifically still requires testing on the physical
    Apple Vision Pro;
6.  any remaining known issue that is too risky to change this close to
    the deadline.
