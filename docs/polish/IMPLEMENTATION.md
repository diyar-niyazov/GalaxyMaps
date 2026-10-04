# Final polish implementation checklist

## Audit (2026-10-03)
Existing React / Three.js / Zustand application; no AGENTS.md in this workspace. Preserve existing uncommitted work. No hosting configuration or public deployment. Local dev server for this pass: http://localhost:5174 (5173 already occupied); API http://localhost:8787. Grok has no configured key.

Catalog at audit: 919 distinct records, 374 featured, 271 hero images, 475 gallery references, 68 galaxies, 21 Andromeda children, 109,389 additional HYG stars. Decorative particles are separate. Final audited image coverage: 274 heroes, 479 gallery references and 65 source records.

Baseline: 71 unit tests, typecheck and production build passed. Existing flows include locked Earth, nested category search, image cards, galaxy interiors, schematic universe, educational Hohmann transfer, two travel benchmarks, simulation clock and WebXR code.

## Phase A: foundation
- [x] Audit and independent read-only reviewer.
- [x] Improve initial Earth framing, retain original brand and map.
- [x] Native gallery dialog focus and map shortcut isolation.
- [x] Resilient discovery/gallery thumbnails.
- [x] Mutual exclusion of preview and simulation clocks; hidden preview bounded.
- [x] XR focus pickables and texture ownership fixes.
- [x] Reduced motion double-click zoom.
- [x] 72 unit tests, typecheck/build; desktop/phone browser evidence and independent reviewer gate. Foundation smoke: 17/17.

## Phase B: memorable interactions
Ownership: comparison agent owns comparison modules/UI/CSS; discovery agent owns tours/story/discovery modules/UI/CSS; root owns integration, navigation, persistence and sharing. Review agent owns read-only phase review.
- [x] True-scale comparison and presets.
- [x] Surprise me and three intents.
- [x] Four tours and one completed SpaceX story.
- [x] Favorites/recent views, Back, exact links and discovery-card export.
- [x] Integration, 107 tests, typecheck/build, 16/16 public-UI browser checks and independent review. Exact Saturn view restored in a fresh browser page.

## Phase C: product finishing
- [x] Earth-centered all-sky view; light delay and physical nearby recommendations.
- [x] Presentation mode, hints and hover previews.
- [x] Phone sky stacking, keyboard focus and shortcut isolation, reduced motion and image/clipboard failure paths.
- [x] Current official WebXR docs verification; headset status honest. Acquired-session ownership, exact return and spatial navigation lifecycle tests.
- [x] Production browser inspection, docs, demo and independent review: 165/165 tests, typecheck/build, all 25 public-UI checks resolved with preserved focused rerun reports. Final Andromeda 2/2 and wrapped controls/source text paint check pass. Desktop and phone emulation inspected; physical device/headset and live Grok remain unverified.

Final review corrected projected-image credits, unsuitable nebula spheres, elliptical-galaxy flattening and wrapped clock/control overlap. No blocking defect remains in the tested ordinary-page flows. See [completion report](../COMPLETION-REPORT.md) for actual URLs, evidence, content counts and the remaining hardware/integration limits.
