# Cursor Prompt --- Build the PERFECT GalaxyMaps BigRed//Hacks 2026 Pitch Deck

## Mission

Create the final **GalaxyMaps** hackathon presentation deck for
**BigRed//Hacks 2026 at Cornell**.

This is not a generic startup pitch deck. It is a **hackathon judging
deck** whose job is to help us win.

GalaxyMaps is:

> **Google Maps for the universe.**

The product turns astronomical exploration into a familiar navigation
experience: search a destination, get directions through space, compare
scale, explore objects and missions, use Grok-powered voice Mission
Control, and---where supported---enter an immersive Apple Vision
Pro/WebXR experience.

The deck must make a judge understand the project in **5 seconds**, want
to see the demo immediately, and leave remembering one idea:

> **"They built Google Maps for space."**

Do not start designing immediately. First inspect the actual repository
and running product so every claim, screenshot, architecture diagram,
API integration, and feature in the deck is true.

------------------------------------------------------------------------

# 1. Event constraints and judging strategy

Design around the actual BigRed//Hacks judging environment.

Official BigRed//Hacks 2026 main-track criteria are:

-   **Technical skill**
-   **Design**
-   **Creativity**
-   **Impact**
-   **Theme**

The event also has Software, Design, Beginner, and People's Choice
tracks. Our deck should naturally perform well against those criteria
without literally writing "we deserve points for X."

The event theme is **Navigation**. GalaxyMaps must feel like one of the
clearest possible interpretations of that theme.

The team's organizer instructions indicate:

-   preliminary judging is science-fair style;
-   **2-minute presentation + 2-minute Q&A**;
-   finalists receive a longer **4-minute demo + 2-minute Q&A**;
-   a PDF slide deck is part of the Devpost submission.

Therefore:

**The live product demo is the hero. The slides support the demo; they
do not replace it.**

Do not build a 12--20 slide investor deck. Build a short, visual deck
that can work in both a 2-minute preliminary pitch and a 4-minute
finalist demo.

------------------------------------------------------------------------

# 2. Ground truth first

Before writing a single slide:

1.  Inspect the repository.
2.  Read the README and relevant project/spec files, but **do not treat
    specs as proof that a feature is implemented**.
3.  Run the application.
4.  Inspect the actual UI in the browser.
5.  Test the primary demo flow.
6.  Identify which integrations are actually wired up.
7.  Inspect package.json, API routes, environment variable names, data
    sources, map/rendering code, route calculations, Grok/xAI
    integration, accessibility work, and WebXR implementation.
8.  Determine which features are:
    -   implemented and demo-ready;
    -   implemented but fragile;
    -   partially implemented;
    -   planned only.

Only **implemented and defensible** functionality may be presented as
something GalaxyMaps currently does.

Never invent:

-   usage metrics;
-   user counts;
-   benchmark numbers;
-   scientific data;
-   APIs;
-   sponsor integrations;
-   accessibility certifications;
-   Vision Pro testing;
-   AI capabilities;
-   technical architecture;
-   mission data;
-   "real-time" functionality that is not actually real-time.

If a requested slide concept is unsupported by the repository, replace
it with the strongest true story the code supports.

------------------------------------------------------------------------

# 3. Core story

The deck should tell one extremely simple story.

### Problem

Space is full of extraordinary public data, but existing astronomy tools
often expose it as catalogs, disconnected visualizations, or
expert-oriented interfaces. It is difficult for a normal person to build
intuition for **where things are, how far apart they are, and what
traveling between them means**.

### Insight

Everyone already understands maps.

### Solution

GalaxyMaps applies the mental model of Google Maps to the universe:

**Search → select → directions → travel → understand.**

### Differentiator

This is not merely a planet viewer or pretty 3D scene. It combines:

-   navigable astronomical data;
-   deterministic distance/travel calculations;
-   a continuous interactive map;
-   rich destination discovery;
-   Grok-powered conversational/voice control;
-   accessibility;
-   immersive WebXR/Apple Vision Pro support where implemented;
-   transparent labels for observed vs reconstructed/illustrative
    imagery.

### Memorable demo

The default signature journey should be the strongest reliable route in
the current app---preferably **Earth → Polaris** if it is working
beautifully.

A judge should see:

1.  Earth.
2.  Search/select Polaris.
3.  Ask for directions.
4.  GalaxyMaps zooms out and frames the route.
5.  Travel time changes based on the selected travel model.
6.  Grok Mission Control answers or performs a useful action if
    reliable.
7.  One "wow" feature: immersive travel, size comparison, guided tour,
    or observable-universe zoom---whichever is most stable.

------------------------------------------------------------------------

# 4. Required deck structure

Create **6 core slides maximum**.

The slides must also make sense as a standalone PDF for Devpost.

## Slide 1 --- HERO

### Headline

**GalaxyMaps**

### Subheadline

**Google Maps for the universe.**

Optional supporting line, only if it improves the slide:

**Explore the universe through a familiar, interactive map.**

### Visual

Use the single most beautiful REAL screenshot of GalaxyMaps.

Prefer:

-   Earth → Polaris route;
-   a gorgeous locked-object view;
-   or another state that instantly communicates "maps + space."

The screenshot should occupy roughly 70--85% of the slide.

Do not clutter this slide with:

-   tech stack;
-   paragraphs;
-   judging criteria;
-   sponsor logos everywhere;
-   feature lists.

The judge should understand the idea before we speak.

------------------------------------------------------------------------

## Slide 2 --- WHY THIS SHOULD EXIST

### Headline

Preferred direction:

**Space has coordinates. It never had directions.**

Use an equally concise line only if the actual product suggests
something clearly better.

### Content

Communicate three ideas at most:

-   astronomy data is abundant;
-   astronomical scale is unintuitive;
-   GalaxyMaps makes it understandable through a navigation interface
    people already know.

Use extremely little text.

### Visual

Prefer a visual contrast:

**raw astronomical complexity → familiar GalaxyMaps navigation**

Do not use generic stock photos.

If useful, use a subtle scale example such as Earth → Polaris, but do
not duplicate Slide 1 exactly.

------------------------------------------------------------------------

## Slide 3 --- THE EXPERIENCE / DEMO MAP

### Headline

**Pick anywhere. Get directions. Go.**

This slide should function as the launchpad for the live demo.

Use a large real screenshot with **3--4 tiny callouts maximum** pointing
to actual implemented features.

Good callouts:

-   Search any supported destination
-   Directions across astronomical scale
-   Compare travel modes
-   Ask Grok Mission Control
-   Explore in 3D / VR

Only show callouts that are genuinely implemented.

The deck should encourage the presenter to transition into the live app
here.

Speaker note must explicitly say:

> **Switch to live demo now.**

Do not waste pitch time explaining every feature before demonstrating
it.

------------------------------------------------------------------------

## Slide 4 --- WHAT MAKES IT TECHNICALLY REAL

### Headline

**Real space data in. A navigable universe out.**

Build a clean, extremely simple architecture diagram from the ACTUAL
repository.

Preferred visual flow:

**Astronomy / mission data**\
↓\
**GalaxyMaps data + physics layer**\
↓\
**3D map + route engine**\
↓\
**Grok Mission Control + WebXR / accessible UI**

Adapt this to the real implementation.

Show only important technologies and sources.

Potential items ONLY if actually used:

-   NASA/JPL data
-   NASA/ESA imagery
-   astronomical catalogs
-   deterministic 3D distance calculations
-   orbital-transfer math
-   Three.js / React Three Fiber
-   Grok/xAI Voice
-   Grok tool/function calling
-   WebXR
-   Apple Vision Pro
-   accessibility layer
-   Next.js/React

### Critical distinction

Make the technical architecture communicate:

**AI explains and controls. Code calculates.**

If this is true in the implementation, this is an excellent
technical-depth line.

Grok should not appear to be hallucinating astronomical distances or
replacing deterministic physics.

Use no more than \~6 nodes in the diagram.

------------------------------------------------------------------------

## Slide 5 --- THE DIFFERENTIATORS

### Headline

**A map you can see, hear, and step inside.**

Show **three** differentiators, not ten.

Choose the strongest three that are actually implemented.

Preferred candidates:

### 1. Conversational navigation

Grok Mission Control can answer questions and, through controlled app
actions/tool calls, perform navigation tasks.

### 2. Accessible exploration

Keyboard/screen-reader/voice/low-vision support that makes a visual
space map meaningfully explorable beyond sight alone.

Do **not** claim "ADA compliant" unless a qualified legal determination
exists. If the app was built toward WCAG 2.2 AA, say that accurately.

### 3. Immersive navigation

Apple Vision Pro / WebXR lets the user enter the map and travel through
space---ONLY if this is actually implemented.

If VR is not sufficiently implemented, replace it with the strongest
working feature, such as:

-   Compare Sizes
-   simulated time
-   Guided Tours
-   observable-universe exploration
-   SpaceX mission story
-   realistic/atlas layers

Use three beautiful visuals/icons/screenshots. Each item gets **one
sentence maximum**.

------------------------------------------------------------------------

## Slide 6 --- CLOSING / WHY IT MATTERS

### Headline

**The universe is hard to comprehend. It shouldn't be hard to explore.**

Then:

**GalaxyMaps --- Directions across the universe.**

Use a gorgeous full-bleed or near-full-bleed product image.

Include only useful final information:

-   live demo URL / QR code if deployed and verified;
-   GitHub QR/link if appropriate;
-   team names in a small footer;
-   BigRed//Hacks 2026;
-   sponsor/technology acknowledgment only where relevant and accurate.

Do not end on a roadmap slide.

Do not end on "Thank you."

End on the product.

------------------------------------------------------------------------

# 5. SpaceX / Grok sponsor story

GalaxyMaps has unusually strong thematic alignment with the SpaceX
challenge. If---and only if---the current implementation satisfies the
sponsor requirements, make that obvious without turning the deck into an
advertisement.

The SpaceX challenge information supplied to the team requires use of
**Cursor** and **Grok Imagine or Voice API**, with Grok use especially
important.

If implemented:

-   show **Grok/xAI Voice** naturally in the technical architecture;
-   show Mission Control in the live demo;
-   make it clear Grok is doing something substantive;
-   mention that GalaxyMaps was built with Cursor in speaker notes /
    technical slide footer if appropriate;
-   show real space/mission data going into a useful experience.

Do not simply place a Grok logo on every slide.

If Grok Imagine is actually used, accurately label generated imagery as
AI-generated/reconstructed and do not present it as observation.

If a SpaceX mission story is polished and demo-ready, it can appear as
an optional demo branch or backup slide, but it should not displace the
core GalaxyMaps story.

------------------------------------------------------------------------

# 6. Visual design system

The deck should visually belong to GalaxyMaps.

## Format

-   **16:9**
-   designed for a projector and laptop screen;
-   readable from the back of a room;
-   export cleanly to PDF;
-   no important content near edges.

## Aesthetic

Think:

**Google Maps clarity + Google Earth scale + NASA imagery + GalaxyMaps
branding**

NOT:

-   sci-fi HUD;
-   neon cyberpunk;
-   startup-template gradients;
-   generic Gamma/Canva aesthetic;
-   giant walls of text;
-   clip art;
-   random space backgrounds;
-   floating glass cards everywhere.

Use the actual product as the visual language.

## Typography

Use the product's actual font or the closest installed/web-safe
equivalent.

Hierarchy:

-   huge, short headlines;
-   minimal body copy;
-   no paragraph smaller than comfortably readable on a projector;
-   consistent alignment;
-   avoid center-aligning dense content.

Aim for:

-   headline: \~36--54 pt equivalent;
-   supporting copy: \~20--28 pt;
-   captions/footer: still readable.

## Color

Derive colors from GalaxyMaps itself.

Prefer:

-   dark space canvas;
-   clean white/light text;
-   restrained GalaxyMaps blue/accent;
-   imagery provides most of the color.

Maintain strong contrast.

## Density rule

Every slide must pass:

> **Can a judge understand the point in 3 seconds?**

If not, simplify it.

Aim for fewer than \~25--35 visible words on most slides, excluding tiny
credits/labels.

------------------------------------------------------------------------

# 7. Screenshots: absolutely critical

Do not use fake product mockups if the actual product can be shown.

Capture screenshots from the running app using the best available
browser automation/manual workflow.

Before each screenshot:

-   use a stable demo state;
-   wait for images/textures to load;
-   close dev UI;
-   hide cursor/selection artifacts where possible;
-   remove broken image states;
-   ensure no console/debug overlays are visible;
-   use a consistent desktop viewport;
-   frame the sidebar and map intentionally;
-   make sure labels are readable;
-   make sure no API keys, localhost secrets, personal information, or
    debug data are visible.

Capture at minimum:

1.  strongest hero view;
2.  Earth → destination directions;
3.  Grok Mission Control state if working;
4.  locked-object view;
5.  size comparison or guided tour;
6.  VR/WebXR view if it can be truthfully captured;
7.  SpaceX mission story if it is strong.

Use the **best**, not all of them.

Do not fill slides with six tiny screenshots.

One strong image beats a collage.

------------------------------------------------------------------------

# 8. Speaker notes and exact timing

Create **two scripts** from the same deck.

## A. Preliminary judging --- EXACTLY 2 minutes maximum

Target **1:40--1:50** in rehearsal so there is safety margin.

The script should roughly follow:

### 0:00--0:15 --- hook

"Space has maps, catalogs, and incredible data---but no familiar way to
navigate it. So we built GalaxyMaps: Google Maps for the universe."

### 0:15--0:30 --- problem/solution

Explain the scale/intuitiveness problem in one breath.

### 0:30--1:25 --- LIVE DEMO

Spend the majority of time showing the product.

Preferred sequence:

1.  start at Earth;
2.  choose/search a destination;
3.  directions;
4.  route/travel calculation;
5.  one Grok voice/action moment;
6.  one wow feature.

Do not demo six unrelated features.

### 1:25--1:42 --- technical credibility

One concise architecture explanation: real data + deterministic
calculations + 3D rendering + Grok control/voice + WebXR/accessibility,
as actually implemented.

### 1:42--1:50 --- close

Return to the one-line idea:

> "GalaxyMaps makes the universe navigable using an interface we already
> understand."

No rambling thank-you.

## B. Finalist demo --- EXACTLY 4 minutes maximum

Target **3:30--3:40**.

Use the extra time for:

-   richer live demo;
-   one additional wow interaction;
-   deeper technical explanation;
-   accessibility/VR demonstration if reliable;
-   why the project matters.

Still keep slides secondary to the live app.

------------------------------------------------------------------------

# 9. Q&A preparation

Create `presentation/Q&A-Cheat-Sheet.md`.

Prepare concise, technically defensible answers for likely judge
questions:

1.  Where does the astronomical data come from?
2.  How do you calculate distances?
3.  How do you calculate travel times?
4.  Are the routes physically accurate?
5.  Why is this different from Google Earth / NASA Eyes / Stellarium /
    Universe Sandbox?
6.  What exactly does Grok do?
7.  Why use AI at all?
8.  How do you prevent Grok hallucinations?
9.  What did your team actually build during the hackathon?
10. What was technically hardest?
11. How does Apple Vision Pro / WebXR work?
12. Did you test it on actual Vision Pro hardware?
13. How is this accessible to a blind user?
14. Is it ADA compliant?
15. What happens if the AI API is down?
16. What is real imagery versus reconstruction?
17. How do you represent galaxies at huge differences in scale?
18. What would you build next?
19. Who is the target user?
20. Why does this fit the Navigation theme?
21. How did you use Cursor?
22. How did you use Grok/xAI?
23. What is the most impressive technical component?
24. How much of this is AI-generated versus deterministic code?
25. What did each team member contribute?

Answers must come from repository evidence and team-provided facts. Mark
anything that the repository cannot establish as **TEAM MUST CONFIRM**
rather than inventing an answer.

------------------------------------------------------------------------

# 10. Backup slides

Create **up to 4 backup slides** after the six core slides.

These are NOT part of the normal live presentation.

Recommended backup topics:

### Backup A --- Architecture

A slightly deeper technical diagram.

### Backup B --- Data + scientific integrity

Data sources, coordinate systems, assumptions, observed vs reconstructed
imagery.

### Backup C --- Accessibility + VR

WCAG-oriented design decisions, nonvisual map representation,
WebXR/Vision Pro architecture.

### Backup D --- Grok / sponsor implementation

Exact xAI/Grok integration and tool-call flow, plus Cursor usage, if
implemented.

Backup slides should exist primarily for Q&A.

------------------------------------------------------------------------

# 11. Judging-criteria audit

Before finalizing, internally score the deck against BigRed//Hacks.

## Technical skill

Does the deck prove that GalaxyMaps is more than a UI wrapper?

Show real rendering, data transformation, coordinate/scale handling,
physics/calculations, tool calling, WebXR, and accessibility engineering
as applicable.

## Design

Does the deck itself look as polished as the product? Does it showcase
clear information hierarchy, visual quality, usability, and accessible
design?

## Creativity

Is the "Google Maps for the universe" insight unmistakable?

## Impact

Does the judge understand why making astronomical scale intuitive and
accessible matters? Avoid fake market-size claims.

## Theme

Could anyone possibly miss that this is a **Navigation** project? If
yes, fix the deck.

## Software track

Make technical depth obvious enough to survive questions.

## Design track

Make screenshots and the deck itself exceptional.

## Beginner track

Do not undersell the accomplishment, but do not make "we are beginners"
the central argument.

## People's Choice

Make the concept instantly explainable and memorable.

------------------------------------------------------------------------

# 12. Demo reliability

Create `presentation/Demo-Runbook.md`.

It must include:

-   exact browser/tab setup;
-   exact starting app state;
-   exact demo clicks/voice command;
-   which route/object to use;
-   what should appear after each action;
-   backup path if Grok voice fails;
-   backup path if internet fails;
-   backup path if an image fails;
-   backup path if WebXR/Vision Pro is unavailable;
-   a local fallback if deployed app fails;
-   which slides to jump to if the live demo breaks.

Also create a **demo reset** mechanism if the existing app makes this
easy:

-   URL/query state;
-   reset button;
-   deterministic start route;
-   or documented reset steps.

The presenter should be able to restore the demo in seconds.

------------------------------------------------------------------------

# 13. Deliverables

Create a `/presentation` directory if it does not exist.

Produce:

1.  **`GalaxyMaps-BigRedHacks-2026-Deck.pptx`** --- preferred editable
    presentation format if the environment can generate it reliably.
2.  **`GalaxyMaps-BigRedHacks-2026-Deck.pdf`** --- polished PDF suitable
    for Devpost / Google Drive.
3.  **`GalaxyMaps-BigRedHacks-2026-Deck.html`** --- optional but
    strongly preferred if HTML is the most reliable way to create a
    pixel-perfect deck from the existing web stack. It must render at
    fixed 16:9 and print/export correctly to PDF.
4.  **`Speaker-Notes.md`** --- slide notes, 2-minute preliminary script,
    4-minute finalist script, explicit LIVE DEMO transition.
5.  **`Q&A-Cheat-Sheet.md`**
6.  **`Demo-Runbook.md`**
7.  **`assets/`** --- only screenshots/diagrams actually used, with
    descriptive filenames.

If generating both PPTX and HTML would materially reduce quality,
prioritize:

**PDF quality → editable source → everything else.**

Do not produce a low-quality PPTX merely to satisfy the format list.

------------------------------------------------------------------------

# 14. Technical deck-generation rules

Use the strongest presentation-generation path available in this
repository/environment.

If using HTML:

-   fixed 16:9 slide canvas;
-   page-break-safe print CSS;
-   no scrollbars;
-   no web animations required for comprehension;
-   all assets local or reliably embedded for PDF export;
-   verify every exported page visually.

If using PowerPoint generation:

-   preserve aspect ratios;
-   do not stretch screenshots;
-   avoid unsupported fonts;
-   ensure objects do not move between exported PPTX and PDF;
-   inspect the PDF after export.

For diagrams:

-   create clean vector/SVG diagrams where possible;
-   no Mermaid source code visible in final slides;
-   no dense architecture spaghetti.

For QR codes:

-   only create them for a verified working URL;
-   test them before including them.

------------------------------------------------------------------------

# 15. Final visual QA

Render/export every slide and inspect it visually.

Check:

-   no clipping;
-   no overflowing text;
-   no stretched images;
-   no blurry screenshots;
-   no tiny labels;
-   no inconsistent margins;
-   no accidental localhost URLs unless intentionally used;
-   no missing fonts;
-   no broken external images;
-   no placeholder text;
-   no TODOs;
-   no unsupported claims;
-   no duplicated screenshots without purpose;
-   no slide that takes more than a few seconds to parse.

Then inspect the full deck as a sequence.

Ask:

1.  Do I understand GalaxyMaps by Slide 1?
2.  Do I understand the problem by Slide 2?
3.  Do I desperately want to see the demo by Slide 3?
4.  Does Slide 4 prove technical depth?
5.  Does Slide 5 give me memorable differentiation?
6.  Does Slide 6 make the project stick in my head?

If not, revise.

------------------------------------------------------------------------

# 16. Final content QA

Before delivery, create a claim checklist.

For every substantive claim in the deck, identify one of:

-   **verified in running app**
-   **verified in repository**
-   **verified by bundled/project data**
-   **team-provided event fact**
-   **external factual claim with source**
-   **remove / cannot verify**

Delete unsupported marketing claims.

Do not describe planned features as completed.

Do not claim actual Apple Vision Pro testing unless it happened.

Do not claim WCAG/ADA certification.

Do not imply Google, NASA, SpaceX, xAI, MLH, or Cornell endorses
GalaxyMaps.

------------------------------------------------------------------------

# 17. The standard

The deck should look like it came from a world-class product team that
happened to have only a weekend to build the product.

It should be:

-   visually exceptional;
-   almost aggressively concise;
-   demo-first;
-   technically credible;
-   scientifically honest;
-   accessible;
-   memorable;
-   unmistakably about Navigation.

Avoid the common hackathon-deck failure mode of trying to show
everything.

The judge should leave able to repeat exactly one sentence:

> **"GalaxyMaps is Google Maps for the universe."**

And remember exactly one moment:

> **watching GalaxyMaps actually navigate through space.**

Now inspect the repository and running app, determine the strongest true
story, and build the finished presentation assets---not just an outline.
