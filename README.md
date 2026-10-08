# GalaxyMaps

Explore space on an interactive 3D map.

- **Catalog:** 919 objects (374 featured), plus 109,389 HYG stars.
- **Explore:** pan, zoom, and orbit in Realistic or Atlas view.
- **Search:** names, aliases, IDs, and types; browse categories or random destinations.
- **Cards:** sourced facts and related objects.
- **Directions:** idealized planetary transfers, light-speed or Voyager 1 travel times, and up to 5 stops.
- **Time:** change dates and animate orbits at 1 hour–1 year per second.
- **Compare:** object sizes, Earth-centered sky positions, and light-travel delays.
- **Tours:** 4 guided tours and a 5-chapter SpaceX/NASA Demo-2 story.
- **Save and share:** bookmarks, history, view and route links, and credited image exports. No account needed.
- **Grok:** chat, voice control, dictation, read-aloud, and labeled AI images. Requires an xAI key.
- **Controls:** touch, keyboard, reduced motion, and Quiet view.
- **VR:** experimental WebXR with hands or controllers; headset testing pending.

Built for BigRed//Hacks 2026.

**Website:** [https://galaxies.wiki](https://galaxies.wiki)  
**Alternate website:** [https://galaxy-maps.vercel.app](https://galaxy-maps.vercel.app)

## Screenshot

![GalaxyMaps showing Earth](docs/screenshots/desktop-home-earth.png)

## Video demo

[![Watch the GalaxyMaps demo on YouTube](https://img.youtube.com/vi/vTDPDL1xQxg/hqdefault.jpg)](https://www.youtube.com/watch?v=vTDPDL1xQxg)

[Watch the demo on YouTube](https://www.youtube.com/watch?v=vTDPDL1xQxg)

65 source records, including NASA/JPL Horizons, HYG, and SIMBAD. Travel estimates use simplified models.

## Run locally

Requires Node.js 22+ and npm.

```sh
git clone https://github.com/diyar-niyazov/GalaxyMaps.git
cd GalaxyMaps
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Catalog included; no API key needed for the map.

For Grok, copy `.env.example` to `.env`, set `XAI_API_KEY`, and restart the server.

```sh
npm test        # Run unit tests
npm run build   # Create a production build
npm start       # Serve the production build
```

Built with React, TypeScript, Three.js, and Express.

[Architecture](docs/ARCHITECTURE.md) · [Data sources](docs/DATA.md)
