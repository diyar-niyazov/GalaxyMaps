# Presentation deck outline

The PDF is `docs/SpaceMaps-deck.pdf`, generated from `docs/deck/deck.html`. Regenerate it after editing:

```bash
chromium --headless=new --no-sandbox --no-pdf-header-footer --print-to-pdf=docs/SpaceMaps-deck.pdf docs/deck/deck.html
```

Then upload the PDF to Google Drive (link sharing: anyone with the link can view) for the Devpost submission.

1. **SpaceMaps.** "Explore the universe through a familiar, interactive map." BigRed//Hacks 2026, Navigation track. Hero screenshot.
2. **The problem.** Space distances are numbers nobody can feel. Maps are the one spatial interface everyone already knows.
3. **The product.** A Google-Maps-style sidebar plus one continuous map from Earth to nearby galaxies. Search, place cards, directions, travel modes, multi-stop trips. Screenshot: Earth → Polaris.
4. **Directions, honestly.** Earth → Polaris is 433 ly. That is 433 years at light speed, 7.7 million years at Voyager 1's speed, 437 years Earth time (62 years onboard) at 0.99c, and 3.4 months for the Enterprise (fiction). Detours are evaluated: Vega adds 2.3%.
5. **Real data, visible provenance.** JPL Horizons, SIMBAD, HYG v4.4, the NASA Exoplanet Archive and cited papers. Parallaxes are inverted only when σ ≤ 20%, and cosmological objects get no fake routes. Images carry an imagery label. Screenshot: Saturn card.
6. **Why not a straight line to Mars?** The idealized Hohmann transfer takes about 259 days, with a 44° phase angle and a window every ~26 months, shown with its assumptions. Screenshot: transfer.
7. **Technical depth.** Float64 camera-relative rendering across 17 orders of magnitude, smooth zoom flights, 109k batched stars, the ecliptic→galactic plane blend, a reproducible data pipeline, 47 unit tests and a browser smoke test. Screenshot: Milky Way.
8. **A grounded AI guide.** Grok Voice calls validated tools only, and the app computes every number. The key stays server-side behind ephemeral tokens. The offline fallback is clearly labeled. Status: implemented but not yet tested with a live key.
9. **What's next + thanks.** Live Grok narration, Gaia DR3, real mission trajectories, a classroom PWA.
