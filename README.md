# GalaxyMaps

**Explore the universe like a map.**

GalaxyMaps is an interactive 3D atlas for exploring planets, stars, nebulae, and galaxies. Search for a place, fly there, orbit it, and see how long a journey would take. Distances come from cited astronomy catalogs; the app labels its estimates and assumptions.

[Open GalaxyMaps](https://galaxies.wiki) · [Vercel mirror](https://galaxy-maps.vercel.app)

[![Watch the GalaxyMaps demo](https://img.youtube.com/vi/vTDPDL1xQxg/hqdefault.jpg)](https://www.youtube.com/watch?v=vTDPDL1xQxg)

## Take a look around

- Search or browse destinations across the Solar System, Milky Way, and nearby galaxies.
- Follow guided tours, or explore the five-part SpaceX Demo-2 story.
- Get directions between objects. Planet-to-planet trips use an idealized Hohmann transfer; other trips are simple cruise-time estimates, not mission plans.
- Compare object sizes, inspect the Earth-centered sky chart, and save or share a view.
- Try immersive VR on a supported headset.

## Run it locally

You’ll need Node.js 22 or newer and npm.

```sh
git clone https://github.com/diyar-niyazov/GalaxyMaps.git
cd GalaxyMaps
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The app includes its catalog, so the map works without API keys or a data download.

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm test` | Run the unit tests |
| `npm run build` | Typecheck and build the app |
| `npm start` | Serve the production build and API |
| `npm run smoke` | Run browser checks against a running dev server |
| `npm run data` | Download sources and rebuild the catalog |

## Optional: Grok features

The map and core features work without credentials. To enable Grok chat, voice, speech, and generated images, add an xAI key to a local `.env` file:

```sh
cp .env.example .env
```

Set `XAI_API_KEY` in `.env`, then restart the dev server. Keep the key private; don’t commit `.env`.

## More detail

- [Data sources and rebuilding the catalog](docs/DATA.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Demo runbook](docs/DEMO.md)
- [Project notes and limitations](docs/COMPLETION-REPORT.md)

Built for BigRed//Hacks 2026 (Navigation).