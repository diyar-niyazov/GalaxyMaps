# Content and source manifest

The canonical catalog remains `public/data/catalog.json`, reproducibly built by `npm run data:build`; it has source IDs, frames, units, epochs, parent relationships and per-image credits. Physical data is independent of marker sizes and the logarithmic universe transform.

- 919 distinct catalog objects, 374 featured destinations, 68 galaxies, 21 Andromeda children.
- 274 catalog hero images, 479 additional gallery references, 65 source records, 109,389 HYG stars in the separate binary catalog. The initial audit had 271 heroes and 475 gallery references; this pass adds audited EHT and NASA imagery to corresponding real cards rather than adding unrelated assets.
- Comparison: `src/lib/comparison.ts` restricts eligibility to audited JPL mean/equivalent radii, the IAU nominal Sun, and primary-paper Sirius A. Black-hole horizons and galaxy extents are excluded. Gas-giant radii use the 1-bar surface; rings are excluded.
- Tours/story: `src/lib/discovery.ts` supplies four editorial sequences and five Demo-2 chapters. Sequences are not physical routes. Mission scenery is explicitly Earth context, not a reconstructed trajectory.
- Six additional local story assets under `public/media/stories`: four NASA Demo-2 mission photographs and two EHT black-hole observations. Exact URLs, dates and credits: [discovery-sources.md](discovery-sources.md).
- `src/lib/editorialAssets.ts` applies the same audited imagery to Sagittarius A*, M87*, Falcon 9 and Demo-2 in both the data builder and bundle loader. Applying it twice preserves gallery uniqueness.
- Original Solar System Scope surface textures remain CC BY 4.0. NASA SVS star panorama is decorative context, separate from catalog positions.

Do not substitute unrelated images for failed providers. UI image fallback keeps the destination name/facts and exports label any schematic fallback.
