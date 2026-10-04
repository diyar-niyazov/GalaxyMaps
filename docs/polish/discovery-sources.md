# Discovery and mission content

The four mini-tours use existing catalog IDs and the image/source metadata delivered with those records. Their ordering is editorial. Andromeda's internal features retain host-distance placement; no route or physical proximity is inferred from their unknown depth. Mission and vehicle stops focus a named Earth or Moon context instead of inventing spacecraft coordinates.

Surprise me uses explicit curated pools. Nearby computes Euclidean separation using compatible ICRF/Sun-centered kilometre positions at the map epoch. It excludes cosmological direction-only records and features placed at a host distance. Recently offered discoveries are avoided before the pool is reused. Opening a tour overview does not focus a stop; Start and chapter navigation are explicit actions.

## Completed Demo-2 mission

Primary sources checked during implementation on 2026-10-03:

- [NASA launch report](https://www.nasa.gov/news-release/nasa-astronauts-launch-from-america-in-historic-test-flight-of-spacex-crew-dragon/): launch on 30 May 2020, 15:22 EDT (19:22 UTC); astronauts Robert Behnken and Douglas Hurley; Falcon 9 and Crew Dragon distinct from the mission.
- [NASA docking report](https://blogs.nasa.gov/commercialcrew/2020/05/31/crew-dragon-completes-historic-trip-to-space-station-with-docking-at-1016-a-m-edt/): 31 May 2020 soft capture at 10:16 EDT (14:16 UTC), hard capture at 10:27 EDT.
- [NASA station work report](https://www.nasa.gov/blogs/spacestation/2020/08/02/astronauts-wake-up-prep-crew-dragon-for-splashdown-today/): 62 days aboard the station, more than 100 research hours, and four spacewalks by Behnken and Cassidy.
- [NASA completed-mission report](https://www.nasa.gov/news-release/nasa-astronauts-safely-splash-down-after-first-commercial-crew-flight-to-space-station/): splashdown on 2 August 2020 at 14:48 EDT (18:48 UTC), off Pensacola; 64 total days in orbit.
- [SpaceX historical update](https://www.spacex.com/updates/reusability): corroborating launch, docking and completed return. Direct SpaceX downloads returned HTTP 403; the story uses official NASA photographs of the actual SpaceX mission. The existing SpaceX-credited Starship asset remains available in the exploration collection.

The story is an image-led chapter sequence. It does not animate or claim a reconstructed flight trajectory. Historical chapter dates do not change the exploration epoch.

## Added local photographs

These are source downloads, not generated or reconstructed images. Visible credits and source links are attached to each image in `src/lib/discovery.ts`.

| File under `public/media/stories/` | Original source | Credit / license |
| --- | --- | --- |
| `demo2-crew.jpg` | [NASA launch-report photograph](https://www.nasa.gov/wp-content/uploads/2020/05/49951967898_2fd7b535d6_k.jpg) | NASA/Bill Ingalls · Public domain |
| `demo2-launch.jpg` | [NASA launch-report photograph](https://www.nasa.gov/wp-content/uploads/2020/05/49953052258_b9a7d6971d_k_0.jpg) | NASA/Bill Ingalls · Public domain |
| `demo2-approach.jpg` | [NASA Dragon approach image article](https://www.nasa.gov/image-article/crew-dragon-approaches-international-space-station/) | NASA · Public domain |
| `demo2-recovery.jpg` | [NASA image NHQ202008020036](https://images.nasa.gov/details/NHQ202008020036) | NASA/Bill Ingalls · Public domain |
| `sagittarius-a-eht.jpg` | [ESO image eso2208-eht-mwa](https://www.eso.org/public/images/eso2208-eht-mwa/) | EHT Collaboration · CC BY 4.0 |
| `m87-eht.jpg` | [ESO image eso1907a](https://www.eso.org/public/images/eso1907a/) | EHT Collaboration · CC BY 4.0 |

ESO's [image copyright policy](https://www.eso.org/public/outreach/copyright/) permits reuse under CC BY 4.0 with visible, complete credits. The black-hole stops use those images of emitting material and shadows, avoiding claims that a black hole's surface was photographed.

## Verification

`npm test -- src/lib/discovery.test.ts src/state/discovery.test.ts` covers curated eligibility, no-repeat choices, physical distance calculations, unavailable proximity, complete tour IDs/images/sources, chapter date/status distinctions, overview versus Start, previous/next/jump state, pause/resume, itinerary restoration, and invalid deep links. Rendered desktop and phone verification belongs to the application-wide polish QA run.
