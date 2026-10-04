# GalaxyMaps --- Final Accessibility, Voice, VR & UX Integration Prompt

## Role and objective

You are finishing an **existing GalaxyMaps application**, not starting
over.

GalaxyMaps is a Google Maps--inspired interactive map of the universe.
The existing app already has a 3D map, object selection/locking, routes,
search/browse, destination cards, journeys, size comparisons, tours,
SpaceX/human-spaceflight content, and other features. **Inspect the
repository and current running app before editing. Preserve working
functionality. Reuse existing data, components, handlers, styling
primitives, and route logic whenever possible.**

The goal of this pass is to make GalaxyMaps feel like a **finished
hackathon-winning product**:

-   visually stunning and immediately understandable;
-   heavily inspired by the clarity, hierarchy, familiarity, and
    interaction patterns of Google Maps without copying proprietary
    assets;
-   genuinely accessible to blind, low-vision, keyboard-only,
    motion-sensitive, and screen-reader users;
-   excellent on desktop and phone;
-   usable in **Apple Vision Pro Safari through WebXR immersive VR**
    when supported;
-   voice-first through **Grok/xAI**, with natural speech-to-speech plus
    reliable text fallbacks;
-   cinematic in VR, including a route-travel experience that moves the
    user through space from origin to destination;
-   scientifically honest about what is observed, reconstructed,
    illustrative, hypothetical, or not-to-scale;
-   polished enough that every visible section has a purpose and no part
    feels like hackathon filler.

Do not merely add features. **Audit, simplify, reorder, integrate, test,
and polish the entire experience.**

------------------------------------------------------------------------

# 0. Non-negotiable implementation rules

1.  **Inspect before changing.**
    -   Read the current architecture, package.json, data models, map
        renderer, camera controls, search implementation, routing logic,
        API layer, environment handling, accessibility implementation,
        and responsive layouts.
    -   Run the app and inspect the actual UI in a browser before making
        major changes.
    -   Identify which requested features already exist and improve them
        instead of duplicating them.
2.  **Do not rewrite the app unnecessarily.**
    -   Prefer targeted refactors.
    -   Preserve stable working behavior.
    -   Do not replace the rendering stack or framework unless there is
        a compelling technical reason and the replacement is clearly
        safer.
3.  **Work in phases.**
    -   Finish and verify each phase before starting the next.
    -   After each phase, run type checking/lint/tests/build as
        available and inspect the app in the browser.
    -   Fix regressions immediately.
4.  **Prioritize demo reliability over speculative breadth.**
    -   A smaller set of features that work beautifully is better than
        many broken features.
    -   No dead buttons, fake controls, placeholder interactions,
        duplicated sections, or misleading "coming soon" UI in the
        primary experience.
5.  **Never expose API secrets.**
    -   No xAI/Grok secret key in client code, `VITE_*` variables,
        source control, or browser bundles.
    -   Use a server/serverless endpoint for long-lived credentials.
    -   For browser realtime voice, use the provider's supported
        short-lived/ephemeral client authentication flow.
    -   Add `.env.example` with names only, never real secrets.
6.  **Ground factual content.**
    -   Do not invent astronomical coordinates, object classifications,
        mission facts, travel times, image credits, or scientific
        claims.
    -   Keep deterministic calculations in code.
    -   AI may explain or summarize those values, but it must not
        silently replace the app's authoritative calculations/catalog.
    -   Clearly label illustrative, reconstructed, AI-generated,
        hypothetical, and not-to-scale visuals.
7.  **Do not claim legal "ADA compliance."**
    -   Build toward **WCAG 2.2 AA** and strong practical accessibility
        for blind and visually impaired users.
    -   Add an accessibility statement describing tested behaviors and
        known limitations rather than making an unsupported legal
        certification claim.

------------------------------------------------------------------------

# 1. First perform a full product audit

Before implementation, create a concise internal checklist of:

-   broken or confusing interactions;
-   visual inconsistencies;
-   poor spacing or typography;
-   overly dense sections;
-   empty states that waste space;
-   duplicate content;
-   image-loading failures;
-   weak mobile behavior;
-   3D controls that are hard to understand;
-   accessibility failures;
-   keyboard traps;
-   unlabeled controls;
-   low-contrast text;
-   motion that ignores reduced-motion preferences;
-   slow rendering or unnecessary re-renders;
-   VR blockers;
-   map states that cannot be represented to a screen reader;
-   places where Grok can add genuine value;
-   places where AI would make the experience less reliable.

Then implement the highest-impact fixes as part of the phases below. Do
not stop at identifying them.

------------------------------------------------------------------------

# 2. Reorder the Explore experience

Reorganize the Explore sidebar into a polished Google Maps--inspired
discovery experience. Preserve working navigation, routes, tours,
comparisons, and saved places.

Use this section order.

## 2.1 Header and search

Keep:

-   `GalaxyMaps`
-   `Directions across the universe`

Immediately below, provide the main destination search.

Requirements:

-   Search must be one of the first interactive elements in
    keyboard/screen-reader order.
-   Keep existing region chips near search.
-   Keep nested category browsing accessible from the search area.
-   Make the header/search area sticky but compact.
-   Search must work by object name and category.
-   Results should expose object name, object type, region, and
    distance/context where available.
-   Support keyboard navigation through suggestions.
-   Announce result counts and active selection accessibly.
-   Do not make a user scroll to `Browse all categories` to discover
    category filtering.

## 2.2 Your next discovery

Create a compact discovery card:

-   one strong **Surprise me** action;
-   preferences: **Beautiful**, **Strange**, **Nearby**.

Behavior:

-   Beautiful favors visually compelling destinations.
-   Strange favors unusual/extreme objects.
-   Nearby uses the current map origin/reference point, not browser GPS
    unless that is explicitly meaningful to the feature.
-   Do not use a tall marketing banner.
-   Announce the chosen destination through the same selection system
    used by normal search.

## 2.3 Featured destinations

Rename `Highlights` to **Featured destinations**.

Show these six first:

-   Earth
-   Saturn
-   Jupiter
-   Orion Nebula
-   Milky Way
-   Andromeda Galaxy

Presentation:

-   compact two-column image grid on desktop;
-   appropriate single/two-column responsive layout on narrow screens;
-   image, name, object type;
-   strong hover/focus/selected state;
-   `Show all` reveals remaining highlights;
-   `Show less` collapses them;
-   selecting a card opens the destination and existing locked-object
    experience.

## 2.4 Journeys

Order:

1.  Earth → Mars
2.  Earth → Proxima Centauri
3.  Star tour at light speed

Keep `Inside Andromeda` under Guided tours only; remove the duplicated
journey entry without deleting functionality.

Cards must clearly communicate:

-   origin → destination;
-   route/travel mode;
-   duration when known;
-   whether the route is physically modeled, illustrative, hypothetical,
    or straight-line at interstellar scales.

Starting a journey must look visually different from simply opening a
destination.

## 2.5 Compare sizes

Rename `A sense of scale` to **Compare sizes**.

Keep:

-   Earth & Jupiter
-   Earth & Sun
-   Sun & Sirius A
-   Earth & Moon

Requirements:

-   four compact comparison tiles;
-   paired visuals;
-   whole tile clickable;
-   concise copy;
-   support voice command invocation;
-   support an accessible nonvisual description such as "Jupiter's
    diameter is approximately X times Earth's" using existing trusted
    data;
-   if true scale makes an object invisible, provide `True scale` and
    `Fit both` modes and label the distinction.

## 2.6 Guided tours

Rename `Mini-tours` to **Guided tours**.

Keep:

-   Beautiful nebulae
-   Black holes & extremes
-   Inside Andromeda
-   Human spaceflight

Requirements:

-   image-led cards;
-   title;
-   stop count;
-   one-line description;
-   show two initially;
-   `Show all tours` / `Show less`;
-   preserve user-paced exploration;
-   add optional Grok narration;
-   tours must remain usable with audio muted and with screen readers.

## 2.7 SpaceX & human spaceflight

Merge the existing `A SpaceX mission story` and
`SpaceX & human spaceflight` sections.

Feature:

**Demo-2: launch to homecoming**

Show:

-   completed mission label;
-   year;
-   chapter count;
-   real/credited imagery where licensing and source permit;
-   concise story progression.

Below it, prioritize:

-   Falcon 9
-   Starship
-   Dragon
-   International Space Station

Put remaining entries behind `Show all`.

Do not duplicate Demo-2.

Use accurate type labels such as:

-   launch vehicle;
-   spacecraft;
-   space station;
-   mission;
-   payload/object;

rather than calling everything `Mission`.

Keep SpaceX prominent because it is strategically important to this
hackathon, but do not fabricate SpaceX data or imply endorsement.

## 2.8 Browse all categories

Rename `Browse` to **Browse all categories**.

Preserve the existing real catalog counts and categories. Expected
top-level structure includes the existing equivalents of:

-   Solar System bodies
-   Stars and systems
-   Stellar remnants & compact objects
-   Star clusters & associations
-   Nebulae
-   Galaxies
-   Large-scale structures
-   Spacecraft and missions

Use:

-   compact expandable rows;
-   icon;
-   category;
-   count;
-   chevron;
-   nested subcategories;
-   destination results.

The search-area category control and this section must use the same
source of truth.

## 2.9 Saved & recently explored

Move this to the bottom.

If empty, show only:

> Places you save or explore will appear here.

Remove empty dash placeholders and large empty containers.

When populated:

-   show up to three Saved items;
-   show up to three Recently explored items;
-   `Show all` for more;
-   retain subtle helper text:
    `Saved on this browser. No account needed.`

------------------------------------------------------------------------

# 3. Make the visual system dramatically better

The final UI should feel like a premium navigation product, not a
collection of cards around a Three.js demo.

## 3.1 Global visual hierarchy

Audit and normalize:

-   typography scale;
-   font weights;
-   line heights;
-   spacing;
-   section gaps;
-   card padding;
-   border radii;
-   shadows;
-   dividers;
-   icon size;
-   button height;
-   hover/focus/pressed states;
-   selected states;
-   loading states;
-   empty states;
-   panel widths;
-   map control placement;
-   responsive breakpoints.

Keep the UI calm and map-first.

Do not add excessive gradients, glassmorphism, neon sci-fi styling, or
decorative chrome. Space itself should provide the spectacle.

## 3.2 Locked-object mode

When a user is locked onto an object:

-   disable lateral panning;
-   keep the selected object as the camera target;
-   allow orbit/rotation around it;
-   allow sensible zoom limits;
-   provide an obvious `Back to explore` / unlock action;
-   keep the object centered through responsive layout changes;
-   use a beautiful panoramic starfield / Milky Way backdrop;
-   reduce irrelevant labels and clutter;
-   show only controls relevant to inspecting the object;
-   maintain a Google Maps--like feeling of "I selected a place and now
    I am inspecting it."

For screen-reader users, entering locked-object mode must announce:

-   object name;
-   object type;
-   region;
-   distance/context;
-   that the visual camera is now locked to the object;
-   available actions.

## 3.3 Fix imagery

Investigate all `Image unavailable` / `Retry` failures.

Implement a stable fallback chain:

1.  valid primary real image;
2.  valid bundled fallback;
3.  attractive object-type placeholder.

Rules:

-   never substitute an unrelated photo and present it as the object;
-   preserve aspect ratio and dimensions while loading;
-   browsing cards should not be dominated by error text;
-   retry may remain in detailed views where useful;
-   image credits/licensing must remain accessible but visually
    subordinate;
-   fix encoding artifacts such as `&#x53;pacecraft`;
-   use lazy loading where appropriate;
-   preload only hero/critical imagery;
-   avoid layout shift.

## 3.4 Rich destination cards

For important destinations, make cards information-rich but scannable:

-   large hero image;
-   name;
-   object type;
-   region;
-   distance;
-   3--6 key facts;
-   concise description;
-   `Listen` / voice explanation;
-   route action;
-   compare-size action when meaningful;
-   save action;
-   source/credit information;
-   expandable details rather than dumping all information at once.

Use progressive disclosure.

------------------------------------------------------------------------

# 4. Replace flat galaxy photos with a reusable 2.5D galaxy system

The current galaxy representation must no longer feel like a flat
photograph pasted into 3D space.

Do **not** attempt a physically exact volumetric simulation for every
galaxy. Build a lightweight, reusable **2.5D parametric galaxy
renderer** that is visually convincing, performant, and interchangeable
by morphology.

Support at least:

-   spiral;
-   barred spiral;
-   elliptical;
-   irregular.

Implementation goals:

-   use reusable procedural geometry/particle layers, instanced points,
    sprites, or another efficient approach compatible with the existing
    renderer;
-   give spiral/barred galaxies a visible central bulge, arms,
    dust/color variation, and real depth when viewed at an angle;
-   elliptical galaxies should have a smooth 3D ellipsoidal star
    distribution;
-   irregular galaxies should have asymmetric clumps rather than a
    spiral template;
-   allow parameters such as radius, thickness, arm count, bar length,
    rotation, inclination, density, and color temperature;
-   use actual morphology metadata where the catalog has it;
-   otherwise use a clearly generic representation appropriate to the
    object type;
-   do not imply the rendered morphology is an exact reconstruction when
    it is not;
-   label generic/illustrative galaxy models appropriately in detailed
    information.

Performance:

-   use level of detail;
-   reduce particle count at distance;
-   use impostors/sprites where appropriate;
-   avoid creating thousands of independent React/Three objects;
-   test on a normal laptop and Vision Pro Safari;
-   preserve smooth interaction.

The result should look 3D from nearby angles while remaining far cheaper
than fully volumetric astrophysical rendering.

------------------------------------------------------------------------

# 5. Grok/xAI becomes GalaxyMaps Mission Control

Grok should be deeply integrated, not a decorative chatbot.

Create a single coherent **Mission Control** assistant that can accept
text or voice and can control the app through a strict tool/action
layer.

## 5.1 Core interaction

Users should be able to say or type requests such as:

-   "Take me to Saturn."
-   "Show me Andromeda."
-   "How far away is Polaris?"
-   "How long would Voyager 1 take to get there?"
-   "Compare Earth and Jupiter."
-   "Show me something strange."
-   "Take me on a tour of black holes."
-   "What am I looking at?"
-   "Tell me about this nebula."
-   "Go back to Earth."
-   "Start the Earth to Mars journey."
-   "Play the simulation."
-   "Pause."
-   "Zoom out to the observable universe."
-   "What is the closest destination in this category?"
-   "Explain this like I'm five."
-   "Give me the technical explanation."
-   "Read this card aloud."

## 5.2 Use tool/function calling, not free-form UI guessing

Expose a constrained app action layer such as:

-   `searchObjects(query, category?, region?)`
-   `selectObject(objectId)`
-   `startRoute(originId, destinationId, vehicleId)`
-   `startJourney(journeyId)`
-   `startTour(tourId)`
-   `compareSizes(objectAId, objectBId, mode)`
-   `setRegion(regionId)`
-   `setCategory(categoryId)`
-   `setZoomTarget(objectId | universeView)`
-   `lockObject(objectId)`
-   `unlockObject()`
-   `playSimulation()`
-   `pauseSimulation()`
-   `getSelectedObjectContext()`
-   `getRouteContext()`
-   `getCatalogFacts(objectId)`
-   `savePlace(objectId)`
-   `openAccessibilitySettings()`

Adapt names to the existing architecture.

Grok must select from valid IDs returned by the app. Never let a model
hallucinate an object ID and mutate state directly.

## 5.3 Voice

Use xAI/Grok voice capabilities heavily.

Preferred experience:

-   microphone button in Mission Control;
-   press/tap to start;
-   clear listening state;
-   live transcript;
-   natural spoken Grok response;
-   tool call can trigger map movement while the response explains what
    is happening;
-   interruption/cancel;
-   mute;
-   text fallback;
-   captions always available;
-   no autoplaying speech on page load.

Prefer realtime speech-to-speech for the conversational mode where
reliable.

Also support:

-   speech-to-text as a fallback/input mode;
-   text-to-speech for one-shot narration and `Listen` actions where
    simpler than a realtime session.

Use provider-supported ephemeral browser authentication for realtime
sessions; keep the long-lived xAI key server-side.

## 5.4 Voice accessibility

Voice is an enhancement, not the only control method.

Every voice action must also be possible through:

-   keyboard;
-   pointer/touch;
-   accessible controls.

Every spoken response should have a text transcript.

Provide:

-   replay;
-   stop;
-   mute;
-   captions/transcript;
-   voice volume using normal browser/device controls;
-   clear microphone permission handling;
-   clear error state when permission is denied.

Do not require a blind user to locate a moving visual control to stop
speech.

## 5.5 Grounding and answer architecture

When the user asks about the selected object:

1.  retrieve current object/route context from GalaxyMaps;
2.  send only relevant structured facts to Grok;
3.  ask Grok to explain them naturally;
4.  retain citations/source labels in the UI where available;
5.  never overwrite authoritative deterministic values with
    model-generated numbers.

For current/fresh facts, use a supported retrieval/search capability
only if configured and clearly distinguish fresh external information
from the bundled catalog.

## 5.6 Grok Imagine --- use selectively

If xAI/Grok Imagine credentials and API access are available, use it
only where it materially improves the experience.

Good uses:

-   optional illustrative reconstruction for objects without suitable
    real imagery;
-   stylized but scientifically prompted educational reconstruction;
-   optional share-card background generation.

Requirements:

-   never replace a real NASA/ESA/observatory image when a good real
    image is available merely to use AI;
-   label generated imagery **AI Reconstruction** or **AI
    Illustration**;
-   do not present generated imagery as observation;
-   cache generated assets;
-   never generate images synchronously in the critical navigation path;
-   graceful fallback if the API is unavailable.

------------------------------------------------------------------------

# 6. Accessibility-first navigation for blind and low-vision users

Treat accessibility as a core product mode, not a checklist.

Target **WCAG 2.2 AA** where applicable and perform practical
screen-reader/keyboard testing.

## 6.1 Semantic structure

Ensure:

-   one clear page title;
-   logical heading hierarchy;
-   landmarks (`header`, `nav`, `main`, complementary panels as
    appropriate);
-   descriptive button names;
-   form labels;
-   meaningful link text;
-   no clickable `div` where a semantic button/link is appropriate;
-   accessible names for icon-only controls;
-   correct expanded/collapsed state;
-   correct selected state;
-   correct modal/dialog semantics;
-   focus management when opening/closing dialogs and destination
    panels.

## 6.2 Keyboard navigation

The entire non-VR application must be usable without a mouse.

Support:

-   Tab / Shift+Tab;
-   Enter / Space;
-   Escape to close overlays;
-   arrow-key navigation where appropriate for listbox/menu patterns;
-   skip-to-main-content;
-   visible focus indicators;
-   no keyboard traps;
-   sensible focus restoration.

Do not hijack arrow keys globally when focus is in text fields or
assistive controls.

## 6.3 Screen-reader alternative to the visual map

A canvas/WebGL scene cannot be the only representation of the map state.

Maintain an accessible DOM representation of:

-   selected object;
-   nearby/relevant objects;
-   current region;
-   route origin;
-   route destination;
-   distance;
-   travel time;
-   active vehicle;
-   route status;
-   tour stop;
-   simulation state.

When the camera moves because of a user action, announce only meaningful
state changes. Do not flood the live region with continuous camera
coordinates.

Use polite live regions for:

-   destination selected;
-   route started;
-   route completed;
-   tour stop changed;
-   voice listening/processing status;
-   errors.

Use assertive announcements only for truly urgent interaction errors.

## 6.4 Blind-navigation mode

Add an optional **Audio / Screen Reader Navigation Mode** or similarly
clear accessibility setting.

When enabled:

-   prioritize spoken/textual object context;
-   expose `Previous nearby object` / `Next nearby object`;
-   expose route and tour steps as structured lists;
-   allow voice command navigation;
-   announce orientation conceptually using real app data rather than
    meaningless pixel coordinates;
-   provide a concise `Describe current view` action;
-   avoid dependence on color, size, or spatial position alone.

## 6.5 Low vision

Provide:

-   strong contrast;
-   readable text;
-   browser zoom support up to at least 200% without losing essential
    functionality;
-   no fixed text containers that clip enlarged text;
-   optional high-contrast mode if the existing palette cannot satisfy
    contrast everywhere;
-   large touch targets;
-   clear selected states beyond color;
-   no tiny gray-on-black metadata;
-   user preference for larger UI text if practical.

## 6.6 Motion and vestibular accessibility

Respect `prefers-reduced-motion`.

When reduced motion is enabled:

-   replace long camera flights with short fades/cuts;
-   disable automatic background camera motion by default;
-   disable or greatly reduce starfield streaks;
-   keep the Play simulation opt-in;
-   provide `Skip travel animation`;
-   do not use forced acceleration/deceleration effects.

In VR, show a comfort prompt/settings option before the first cinematic
flight.

## 6.7 Images and charts

-   Meaningful images require useful alt text.
-   Decorative starfields should not pollute screen-reader output.
-   Credits should be reachable but not read before the image
    description.
-   Size comparisons need textual equivalents.
-   Do not write alt text such as `image of image`.

## 6.8 Automated + manual checks

Use automated accessibility tooling available in the project ecosystem
(for example axe-based checks) as a supplement, not proof.

Manually test at minimum:

-   keyboard-only desktop flow;
-   browser zoom;
-   reduced motion;
-   VoiceOver on macOS/iOS if available;
-   screen-reader flow through search → destination → route → details;
-   microphone denied;
-   API offline;
-   image failure.

Document known limitations.

------------------------------------------------------------------------

# 7. Apple Vision Pro / WebXR

GalaxyMaps should remain a normal responsive website first, with a
high-quality immersive mode on supported Apple Vision Pro Safari/WebXR.

Do not assume unsupported browser capabilities.

## 7.1 Feature detection and fallback

-   Detect WebXR support at runtime.
-   Detect whether an immersive VR session mode is available.
-   Show `Enter VR` only when supported.
-   If unavailable, keep the complete desktop/mobile 3D experience.
-   Never block the main site behind VR.
-   Use HTTPS in deployed environments.
-   Do not claim passthrough AR if the browser/platform only exposes
    immersive VR for this experience.

## 7.2 Vision Pro interaction

Design VR controls for:

-   gaze/look targeting where exposed through standard WebXR input;
-   pinch/select through standard input events;
-   large comfortable targets;
-   minimal floating UI;
-   no tiny dense desktop sidebar floating in front of the user;
-   readable panels at comfortable depth;
-   recenter;
-   exit VR;
-   mute/voice controls;
-   route controls;
-   destination info;
-   skip animation.

Use standard WebXR APIs and the existing rendering stack's supported XR
integration.

Do not hardcode device-specific private behavior if standards-based
input works.

## 7.3 VR scene design

In immersive mode:

-   the user should feel located inside the map;
-   selected objects should have clear depth and scale cues;
-   labels should face/read toward the viewer where appropriate;
-   avoid placing important text at extreme peripheral angles;
-   keep stars visually rich but not so dense that labels disappear;
-   preserve orientation and a stable horizon/reference where useful;
-   do not make the user physically turn repeatedly to access core
    controls.

------------------------------------------------------------------------

# 8. Cinematic "Travel through space" route mode

This is a major feature.

When a user starts a journey from origin to destination, provide a
**Travel** / **Begin journey** action that animates the camera along the
route.

It should work on desktop and become especially compelling in VR.

## 8.1 Route behavior

For Solar System / nearby routes where existing code can model a curved
transfer:

-   use the existing/implemented physically motivated trajectory;
-   show the route curve;
-   animate along that curve.

For extremely distant routes:

-   a literal orbital transfer is not meaningful;
-   use the app's existing straight/interstellar path model or a gently
    curved cinematic path;
-   clearly label it illustrative/hypothetical;
-   never pretend a cinematic curve is a physically calculated
    trajectory.

## 8.2 VR travel experience

On `Begin journey`:

1.  show origin and destination;
2.  announce route mode, vehicle, estimated duration, and whether the
    visualization is real-time, accelerated, hypothetical, or
    not-to-scale;
3.  offer `Start`, `Cancel`, and comfort options;
4.  smoothly leave the origin;
5.  travel through the starfield/space environment;
6.  pass meaningful intermediate landmarks only when they are actually
    relevant;
7.  optionally narrate with Grok;
8.  arrive with the destination centered and locked;
9.  open the destination card;
10. announce arrival through voice and accessible text.

Provide:

-   pause/resume;
-   skip to destination;
-   speed control for visualization only, clearly separate from physical
    vehicle speed;
-   mute narration;
-   exit journey;
-   reduced-motion alternative.

Never make the demo wait the real calculated travel duration. The
animation is a compressed visualization of the calculated journey.

## 8.3 Motion comfort

VR flight can cause discomfort.

Default to:

-   gentle acceleration;
-   no unnecessary roll;
-   limited sudden rotation;
-   stable forward orientation;
-   optional vignette/comfort mode if straightforward in the current
    renderer;
-   immediate skip/stop control;
-   reduced-motion teleport/fade alternative.

------------------------------------------------------------------------

# 9. Play simulation / passage of time

Preserve and polish the Play feature.

The Play button represents **simulated time**, not merely camera
auto-rotation.

When enabled:

-   supported planets move along their orbits;
-   supported objects rotate when the app has a reasonable model;
-   simulation speed is clearly labeled;
-   selected/locked objects remain trackable;
-   routes update appropriately or pause if their model cannot safely
    update;
-   user interaction may temporarily pause camera automation without
    silently changing simulation time.

Keep camera auto-orbit, if present, as a separate visual option.

For reduced-motion users, do not auto-start.

------------------------------------------------------------------------

# 10. Search, catalog, and discovery polish

Keep the large catalog but make it navigable.

Search must support:

-   exact object names;
-   fuzzy name matching;
-   aliases where available;
-   category names;
-   region names;
-   object types.

Nested category browsing should expose all existing major categories.

For very large result sets:

-   virtualize or paginate;
-   do not render hundreds of heavy image cards simultaneously;
-   prioritize visual quality for top/highlight destinations;
-   simpler cards are acceptable for long-tail catalog entries.

When entering another galaxy such as Andromeda:

-   allow the user to zoom into supported internal objects/features;
-   distinguish real cataloged objects from decorative particles;
-   do not make every rendered star searchable unless it corresponds to
    real data.

------------------------------------------------------------------------

# 11. Directions and vehicle UX

Keep the vehicle selector inside Directions as a compact dropdown.

Primary options:

-   **Light speed**
-   **Voyager 1**

Do not reintroduce Custom Speed unless it already exists for a necessary
technical reason.

For each vehicle:

-   use deterministic speed/travel calculations;
-   show the assumptions;
-   label light-speed travel appropriately;
-   do not imply Voyager 1 is actually headed to the selected
    destination.

If a 3D vehicle model already exists or can be added cheaply and
reliably, it may appear during travel as a visual flourish. Do not spend
core implementation time on it before route animation, VR, voice,
accessibility, and UI polish work.

------------------------------------------------------------------------

# 12. Observable universe view

At the furthest zoom level:

-   transition into a large-scale universe overview;
-   show the galaxy/structure catalog that GalaxyMaps actually has;
-   surround/contain the view with a subtle boundary labeled
    **Observable Universe**;
-   explain that this is the observable region from our location, not
    necessarily the entire universe;
-   use a logarithmic/not-to-scale visual layout if necessary to keep
    known nearby structures legible;
-   clearly label the scale representation;
-   do not alter actual distance calculations merely to make the
    visualization fit.

Voice command examples:

-   "Zoom all the way out."
-   "Show me the observable universe."
-   "Where is the Milky Way in this view?"

------------------------------------------------------------------------

# 13. Responsive behavior

## Desktop

-   map remains dominant;
-   sidebar independently scrolls;
-   map controls never overlap critical panel actions;
-   locked-object mode can collapse nonessential discovery UI.

## Phone

-   use a bottom sheet / responsive panel pattern appropriate to the
    existing app;
-   preserve search, directions, voice, and destination details;
-   avoid tiny two-column cards when they become unreadable;
-   keep touch targets comfortable;
-   do not let the on-screen keyboard permanently obscure search
    results.

## Vision Pro

-   do not reuse the dense desktop sidebar unchanged in immersive mode;
-   use a simplified immersive control surface;
-   keep the full standard site available outside immersive mode.

------------------------------------------------------------------------

# 14. Error handling and offline/degraded behavior

The core map must not become unusable if AI APIs fail.

Handle:

-   Grok unavailable;
-   voice session fails;
-   microphone denied;
-   no network;
-   image host failure;
-   WebXR unsupported;
-   VR session rejected;
-   missing catalog image;
-   unknown voice command;
-   destination not found.

Use concise, actionable errors.

Examples:

-   `Voice is unavailable right now. You can still type your request.`
-   `Immersive VR isn't available in this browser. Continue in 3D mode.`
-   `I couldn't find that destination. Try a name or browse categories.`

Never show raw stack traces or provider JSON to users.

------------------------------------------------------------------------

# 15. Performance

This app is visually heavy. Optimize deliberately.

Audit:

-   initial JS bundle;
-   texture sizes;
-   duplicate image requests;
-   particle counts;
-   React render frequency;
-   Three.js object count;
-   label count;
-   catalog filtering;
-   image decoding;
-   voice websocket lifecycle;
-   memory leaks after entering/exiting VR;
-   route animation frame allocations.

Use:

-   lazy loading;
-   code splitting where appropriate;
-   LOD;
-   instancing;
-   texture compression/appropriate resolutions;
-   memoization only where measured/useful;
-   cleanup of event listeners and XR/voice sessions.

Maintain visual quality while ensuring the demo does not stutter.

------------------------------------------------------------------------

# 16. Final UI/UX critique pass

After all requested functionality works, perform a final design review
as if you were a senior product designer reviewing a Google
Maps--quality consumer product.

Inspect every major state:

-   initial Earth view;
-   Explore sidebar;
-   search open;
-   search results;
-   category browsing;
-   destination selected;
-   locked object;
-   directions;
-   route active;
-   journey/travel animation;
-   size comparison;
-   guided tour;
-   SpaceX mission story;
-   observable universe;
-   Mission Control idle/listening/thinking/speaking/error;
-   mobile;
-   reduced motion;
-   high zoom;
-   VR entry;
-   immersive VR;
-   image failure;
-   API failure.

For each state, fix:

-   unnecessary text;
-   ambiguous icons;
-   weak hierarchy;
-   misalignment;
-   inconsistent spacing;
-   ugly wrapping;
-   clipping;
-   overlap;
-   contrast;
-   poor empty states;
-   excessive borders;
-   visual noise;
-   unreadable labels;
-   confusing button hierarchy;
-   inconsistent verbs;
-   controls that appear clickable but are not;
-   animation that feels cheap or abrupt.

Do not merely write a review document. **Implement the improvements.**

------------------------------------------------------------------------

# 17. Verification matrix

Before considering the work complete, verify these flows.

## Core desktop

-   Search Earth → select Earth → locked-object view.
-   Search Saturn → start route from Earth.
-   Switch vehicle between Light speed and Voyager 1.
-   Start and skip a journey.
-   Compare Earth & Jupiter.
-   Start a guided tour.
-   Use Surprise me.
-   Save a destination and verify Saved state.
-   Zoom to the observable universe.
-   Return to Earth.

## Grok text

-   "Take me to Saturn."
-   "How far away is it?"
-   "How long would Voyager 1 take?"
-   "Compare Earth and Jupiter."
-   "Show me something strange."
-   "Start the black holes tour."
-   "Zoom out to the observable universe."

Confirm the map changes only through valid tool calls.

## Grok voice

-   microphone permission granted;
-   permission denied;
-   speech-to-speech conversation;
-   live transcript;
-   interrupt/cancel;
-   mute;
-   voice triggers destination selection;
-   voice triggers comparison;
-   voice triggers route;
-   voice asks for distance/travel time;
-   fallback to typed chat when voice fails.

## Accessibility

-   keyboard-only search → select → directions → back;
-   skip link;
-   visible focus;
-   screen-reader labels for map controls;
-   destination selection announcement;
-   route announcement;
-   200% browser zoom;
-   reduced motion;
-   meaningful image alt text;
-   no inaccessible canvas-only critical information.

## Mobile

-   search;
-   destination card;
-   directions;
-   voice;
-   browse;
-   bottom-sheet behavior;
-   no horizontal overflow.

## VR / Vision Pro

When hardware is available, test on the actual Apple Vision Pro rather
than relying only on desktop emulation:

-   WebXR feature detection;
-   enter immersive mode;
-   select an object;
-   open/close immersive controls;
-   start Earth → destination travel;
-   pause/skip;
-   voice input if browser permission allows;
-   destination arrival;
-   exit VR;
-   re-enter VR;
-   no major memory/session leak.

If hardware testing reveals a platform limitation, implement the best
graceful fallback and document it honestly.

------------------------------------------------------------------------

# 18. Acceptance criteria

Do not call this complete until:

-   the Explore sidebar follows the new hierarchy;
-   duplicate/empty sections are cleaned up;
-   image failures no longer dominate the interface;
-   destination cards look premium;
-   locked-object mode is polished;
-   galaxy representations have convincing depth and morphology rather
    than flat photo planes;
-   Grok Mission Control can answer and perform core navigation actions;
-   speech-to-speech works when configured, with text/caption fallback;
-   blind and low-vision users have a meaningful nonvisual route through
    the core app;
-   keyboard navigation works;
-   reduced motion works;
-   desktop and phone are polished;
-   WebXR is feature-detected and immersive mode is usable on supported
    Vision Pro Safari;
-   VR travel moves the user through space and can be paused/skipped;
-   route physics/assumptions remain honest;
-   observable-universe view is clear and labeled;
-   SpaceX content is prominent, accurate, and visually strong;
-   no secrets are exposed;
-   production build succeeds;
-   no obvious console errors remain in the primary demo flow;
-   the app still works if Grok is unavailable.

------------------------------------------------------------------------

# 19. Implementation priority if time becomes constrained

Do not attempt everything equally. Use this order:

### P0 --- must be demo-perfect

1.  UI/UX audit and Explore reordering
2.  image reliability and rich destination cards
3.  locked-object visual polish
4.  Grok Mission Control text + tool calling
5.  Grok realtime voice / speech interaction
6.  accessibility of core search → destination → directions flow
7.  responsive desktop/mobile cleanup
8.  Vision Pro WebXR entry + basic immersive controls
9.  cinematic VR route travel with skip/comfort controls
10. galaxy 2.5D renderer for the most visible galaxy types

### P1 --- high-value polish

11. Compare sizes improvements
12. Guided tours + Grok narration
13. SpaceX Demo-2 story polish
14. Play/simulated-time polish
15. observable-universe view polish
16. saved/recently explored refinement
17. performance pass
18. accessibility settings / high-contrast refinements

### P2 --- only after P0/P1 are stable

19. Grok Imagine optional reconstructions
20. extra vehicle 3D model flourishes
21. additional long-tail visual assets
22. advanced VR comfort effects beyond the basic safe implementation

If a P2 feature threatens a P0 feature, drop the P2 feature.

------------------------------------------------------------------------

# 20. Final deliverables

At the end:

1.  leave the repository in a working state;
2.  run the production build;
3.  run available tests/lint/type checks;
4.  inspect the actual app in the browser;
5.  test the main demo flow;
6.  provide a concise summary of:
    -   what changed;
    -   what was verified;
    -   environment variables required;
    -   how to run locally;
    -   how to enter VR;
    -   how to test Grok voice;
    -   any known limitations;
    -   anything that still requires actual Vision Pro hardware
        verification.

Do not spend the final response describing ideas that were not
implemented. Clearly separate **implemented**, **verified**, and
**remaining/blocked** items.

------------------------------------------------------------------------

# Final product standard

The target feeling is:

> **Google Maps for the universe --- beautiful enough to explore for
> fun, accurate enough to teach from, accessible enough to use without
> sight, conversational enough to navigate by voice, and immersive
> enough to feel extraordinary in Apple Vision Pro.**

Every implementation decision should serve that product.
