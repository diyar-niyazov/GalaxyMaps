import type { DataBundle } from "../data/bundle";
import type { CatalogObject, ImageRecord } from "./types";
import { positionOf } from "./route";
import { distance } from "./vec";

export type DiscoveryIntent = "beautiful" | "strange" | "nearby";

export interface DiscoveryPick {
  object: CatalogObject;
  reason: string;
  sourceUrl: string;
  /** Only populated for compatible physical positions, never angular proximity. */
  distanceKm?: number;
  originName?: string;
}

// Editorial membership is deliberate; discovery never samples the background star dump.
const BEAUTIFUL_IDS = new Set(["saturn", "jupiter", "neptune", "moon", "europa", "titan", "orion-nebula", "eagle-nebula", "carina-nebula", "ring-nebula", "helix-nebula", "rosette-nebula", "iris-nebula", "butterfly-nebula", "southern-ring-nebula", "tarantula-nebula", "crab-nebula", "andromeda", "m51", "sombrero", "m104", "m81", "m82", "mayall-ii", "omega-centauri"]);
const STRANGE_IDS = new Set(["sirius-b", "crab-pulsar", "rx-j1856", "3c-273", "ton-618", "sagittarius-a-star", "m87-star", "hoags-object", "tabbys-star", "wd-1856", "trappist-1", "uranus", "titan", "europa"]);
const NEARBY_IDS = new Set(["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "ceres", "vesta", "europa", "titan", "triton", "voyager-1", "voyager-2", "proxima-centauri", "alpha-centauri", "sirius", "sirius-b", "vega", "barnards-star", "epsilon-eridani", "tau-ceti", "trappist-1", "andromeda", "m32", "m110", "triangulum", "lmc", "smc", "m81", "m87"]);
const REASONS: Record<string, string> = {
  "sirius-b": "Sirius B is a dense white dwarf beside the much brighter Sirius A. Hubble can separate the two stars in this image.",
  "crab-pulsar": "A neutron star powers the Crab Nebula. This image combines optical and X-ray observations to reveal its energetic surroundings.",
  "europa": "Europa's bright, fractured ice covers a moon with evidence for a subsurface ocean.",
  "saturn": "Saturn's rings are made of countless pieces of ice and rock. Its ring system is unmistakable in both imagery and the map.",
  "andromeda": "Our nearest major galactic neighbor contains real star clouds, globular clusters and satellite galaxies you can explore inside.",
  "hoags-object": "Hoag's Object is an unusual ring galaxy: a nearly circular ring of stars surrounds a separate-looking central core.",
  "3c-273": "An energetic galactic nucleus powers the quasar 3C 273. Its Hubble image reveals a long jet extending from the bright center.",
  "ton-618": "TON 618 is a luminous quasar powered by an extremely massive black hole. The image is an observation of its distant host and nucleus, not a resolved black-hole surface.",
  "rx-j1856": "RX J1856.5−3754 is a nearby isolated neutron star. X-ray observations reveal a compact stellar remnant that is extremely faint in visible light.",
  "trappist-1": "Seven confirmed planets orbit the small, cool star TRAPPIST-1. Their compact system offers a striking contrast with our Solar System.",
  "wd-1856": "WD 1856+534 is a white dwarf with a giant planet candidate on a very close orbit: an unusual system around a stellar remnant.",
  "uranus": "Uranus rotates on a remarkably tilted axis, with its poles almost in the plane of its orbit.",
  "titan": "Saturn's moon Titan has a thick atmosphere and lakes of liquid hydrocarbons on its surface.",
  "tabbys-star": "Tabby's Star shows unusual changes in brightness. It became a focus of research into the dust and other material that may dim its light.",
};

/** Image-rich records that can enter Locked object mode with sourced content. */
export function isDiscoveryEligible(object: CatalogObject): boolean {
  return !!(object.featured && object.position && object.image && object.summary?.text && object.summary.url && object.sourceIds.length);
}

function physicalPosition(data: DataBundle, object: CatalogObject, jd: number) {
  // Host-distance placement is useful for display, but cannot establish proximity.
  if (!object.position || object.cosmo || (object.position.kind === "static" && object.position.depth === "host")) return null;
  const p = positionOf(object, { eph: data.eph, jdTdb: jd });
  return p && p.every(Number.isFinite) ? p : null;
}

/** Nearby uses the same kilometre/ICRF/Sun frame at one epoch for both records. */
export function discoveryCandidates(data: DataBundle, intent: DiscoveryIntent, originId: string, jd: number): DiscoveryPick[] {
  const origin = data.byId.get(originId);
  const originPosition = origin ? physicalPosition(data, origin, jd) : null;
  if (intent === "nearby" && !originPosition) return [];
  const picks: DiscoveryPick[] = [];
  for (const object of data.catalog.objects) {
    if (!isDiscoveryEligible(object) || object.id === originId) continue;
    const scenePosition = positionOf(object, { eph: data.eph, jdTdb: jd });
    if (!scenePosition?.every(Number.isFinite)) continue;
    if (intent === "beautiful" && !BEAUTIFUL_IDS.has(object.id)) continue;
    if (intent === "strange" && !STRANGE_IDS.has(object.id)) continue;
    if (intent === "nearby" && !NEARBY_IDS.has(object.id)) continue;
    const pick: DiscoveryPick = {
      object,
      reason: REASONS[object.id] ?? object.summary!.text,
      sourceUrl: object.summary!.url,
    };
    if (intent === "nearby") {
      const p = physicalPosition(data, object, jd);
      if (!p) continue;
      pick.distanceKm = distance(originPosition!, p);
      pick.originName = origin!.name;
    }
    picks.push(pick);
  }
  return intent === "nearby"
    ? picks.sort((a, b) => a.distanceKm! - b.distanceKm!).slice(0, 12)
    : picks.sort((a, b) => b.object.display.priority - a.object.display.priority);
}

export function chooseDiscovery(picks: DiscoveryPick[], recentIds: string[], random = Math.random): DiscoveryPick | null {
  const fresh = picks.filter((p) => !recentIds.includes(p.object.id));
  const pool = fresh.length ? fresh : picks.filter((p) => p.object.id !== recentIds[0]);
  const choices = pool.length ? pool : picks;
  if (!choices.length) return null;
  const sample = random();
  const unit = Number.isFinite(sample) ? Math.min(0.999999999, Math.max(0, sample)) : 0;
  return choices[Math.floor(unit * choices.length)];
}

export interface TourStop {
  objectId: string;
  title: string;
  highlight: string;
  sourceUrl?: string;
  date?: string;
  /** An explicit context destination, used when mission trajectory data is absent. */
  focusId?: string;
  image?: ImageRecord;
}
export interface DiscoveryTour {
  id: string;
  title: string;
  subtitle: string;
  introduction: string;
  order: string;
  kind: "tour" | "story";
  stops: TourStop[];
}

const NASA_LAUNCH = "https://www.nasa.gov/news-release/nasa-astronauts-launch-from-america-in-historic-test-flight-of-spacex-crew-dragon/";
const NASA_DOCK = "https://www.nasa.gov/image-article/crew-dragon-approaches-international-space-station/";
const NASA_RETURN = "https://www.nasa.gov/news-release/nasa-astronauts-safely-splash-down-after-first-commercial-crew-flight-to-space-station/";
function nasaImage(file: string, title: string, credit: string, sourceUrl: string): ImageRecord {
  return { src: `/media/stories/${file}`, kind: "observed", title, alt: title, credit, license: "Public domain", sourceUrl };
}
export const DEMO2_IMAGES = {
  crew: nasaImage("demo2-crew.jpg", "Bob Behnken and Doug Hurley leave for Launch Complex 39A, 30 May 2020", "NASA/Bill Ingalls", NASA_LAUNCH),
  launch: nasaImage("demo2-launch.jpg", "Falcon 9 launches Crew Dragon Demo-2, 30 May 2020", "NASA/Bill Ingalls", NASA_LAUNCH),
  approach: nasaImage("demo2-approach.jpg", "Dragon Endeavour approaches the ISS over Turkey, 31 May 2020", "NASA", NASA_DOCK),
  recovery: nasaImage("demo2-recovery.jpg", "Recovery teams reach Dragon Endeavour after splashdown, 2 August 2020", "NASA/Bill Ingalls", "https://images.nasa.gov/details/NHQ202008020036"),
};
function ehtImage(file: string, title: string, sourceUrl: string): ImageRecord {
  return { src: `/media/stories/${file}`, kind: "observed", title, alt: title, credit: "EHT Collaboration", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", sourceUrl };
}
export const EHT_IMAGES = {
  "sagittarius-a-star": ehtImage("sagittarius-a-eht.jpg", "EHT radio image of Sagittarius A*, released in 2022", "https://www.eso.org/public/images/eso2208-eht-mwa/"),
  "m87-star": ehtImage("m87-eht.jpg", "EHT radio image of M87*, released in 2019", "https://www.eso.org/public/images/eso1907a/"),
};

export const DISCOVERY_TOURS: DiscoveryTour[] = [
  {
    id: "nebulae", title: "Beautiful nebulae", subtitle: "Where stars begin — and leave their mark", kind: "tour",
    introduction: "Clouds of glowing gas show us star birth and the final chapters of stellar lives.",
    order: "Start with stellar nurseries, then visit the shells left by aging stars. This is a sequence of different objects, not one star's life history.",
    stops: [
      { objectId: "orion-nebula", title: "A nearby stellar nursery", highlight: "The Orion Nebula is a vast star-forming region visible to the unaided eye in Orion's sword." },
      { objectId: "eagle-nebula", title: "Sculpted by young stars", highlight: "The Eagle Nebula contains the Pillars of Creation: dense clouds of gas and dust shaped by the surrounding young stars." },
      { objectId: "carina-nebula", title: "Birth on a grand scale", highlight: "The Carina Nebula surrounds some of the Milky Way's most massive and luminous stars, including Eta Carinae." },
      { objectId: "ring-nebula", title: "A star's departing envelope", highlight: "The Ring Nebula is a planetary nebula: glowing gas expelled during a star's later life, not a place where planets formed." },
      { objectId: "helix-nebula", title: "A final, intricate shell", highlight: "The Helix Nebula is one of the nearest planetary nebulae; its central star has become a white dwarf." },
    ],
  },
  {
    id: "extremes", title: "Black holes & extremes", subtitle: "Dense stars, dark centers, brilliant quasars", kind: "tour",
    introduction: "Meet stellar remnants and the supermassive black holes that power some of the universe's most dramatic sights.",
    order: "Move from a nearby white dwarf to a neutron star, then to galactic black holes and a luminous quasar. This is an editorial progression, not a travel route.",
    stops: [
      { objectId: "sirius-b", title: "A faint companion with a dense heart", highlight: "Sirius B is a white dwarf companion to Sirius A. The Hubble image separates the faint remnant from its much brighter neighbor." },
      { objectId: "crab-pulsar", title: "The engine inside the Crab", highlight: "The Crab Pulsar is the neutron star left by the supernova observed in 1054; the composite image combines optical and X-ray observations." },
      { objectId: "sagittarius-a-star", title: "Our galaxy's dark center", highlight: "The EHT image shows glowing gas and the shadow of Sagittarius A*, the supermassive black hole at the center of the Milky Way.", image: EHT_IMAGES["sagittarius-a-star"], sourceUrl: "https://www.eso.org/public/news/eso2208-eht-mw/" },
      { objectId: "m87-star", title: "The first black-hole image", highlight: "Released in April 2019, the EHT image of M87* was the first direct visual evidence of a supermassive black hole and its shadow.", image: EHT_IMAGES["m87-star"], sourceUrl: "https://www.eso.org/public/news/eso1907/" },
      { objectId: "3c-273", title: "A quasar with a jet", highlight: "3C 273 is a bright quasar at the center of a distant galaxy; the Hubble image reveals the jet extending from its energetic nucleus." },
    ],
  },
  {
    id: "andromeda", title: "Inside Andromeda", subtitle: "A galaxy, a star cloud and its companions", kind: "tour",
    introduction: "Andromeda is a real collection of stars, clusters and neighboring galaxies. Explore catalogued features beyond its familiar silhouette.",
    order: "Begin with the whole galaxy, inspect a star cloud and a globular cluster, then visit two companion galaxies. Companions are not interior features.",
    stops: [
      { objectId: "andromeda", title: "The wider picture", highlight: "Andromeda is the closest major galaxy to the Milky Way, roughly 2.5 million light-years away." },
      { objectId: "ngc-206", title: "A cloud of young stars", highlight: "NGC 206 is a bright star cloud inside Andromeda, visible as a knot in the galaxy's disk." },
      { objectId: "mayall-ii", title: "G1: a halo star cluster", highlight: "Mayall II, also called G1, is a luminous globular cluster orbiting Andromeda." },
      { objectId: "m32", title: "The compact companion", highlight: "Messier 32 is a compact elliptical satellite galaxy of Andromeda, with stars concentrated in its central region." },
      { objectId: "m110", title: "Another neighboring galaxy", highlight: "Messier 110 is a dwarf elliptical satellite of Andromeda. It is a separate companion galaxy, not a star cloud in the disk." },
    ],
  },
  {
    id: "human-spaceflight", title: "Human spaceflight", subtitle: "From the Moon to life in Earth orbit", kind: "tour",
    introduction: "Four documented milestones connect exploration, long-term orbital research and commercial human spaceflight.",
    order: "A chronological selection: Apollo 11, the continuously inhabited ISS, Demo-2, and Polaris Dawn. The map shows destination context; it does not reconstruct mission trajectories.",
    stops: [
      { objectId: "apollo-11", focusId: "moon", title: "First steps on the Moon", date: "20 July 1969", highlight: "Apollo 11 landed humans on the Moon for the first time. Neil Armstrong and Buzz Aldrin walked on the surface while Michael Collins remained in lunar orbit." },
      { objectId: "iss", focusId: "earth", title: "A laboratory with a permanent crew", date: "Continuously crewed since 2 November 2000", highlight: "The International Space Station has maintained a continuous human presence since November 2000 and hosts research in microgravity." },
      { objectId: "demo-2", focusId: "earth", title: "Commercial Crew reaches the station", date: "30 May – 2 August 2020", highlight: "SpaceX's completed Demo-2 test flight carried Bob Behnken and Doug Hurley to the ISS and returned them safely in Dragon Endeavour.", image: DEMO2_IMAGES.launch, sourceUrl: NASA_RETURN },
      { objectId: "polaris-dawn", focusId: "earth", title: "A new kind of spacewalk", date: "September 2024", highlight: "Polaris Dawn completed the first commercial spacewalk. The mission used a Crew Dragon spacecraft in Earth orbit." },
    ],
  },
  {
    id: "spacex-demo-2", title: "Demo-2: launch to homecoming", subtitle: "The completed SpaceX / NASA mission · 2020", kind: "story",
    introduction: "Follow the first crewed Dragon test flight through five chapters, using photographs from the actual mission and NASA's contemporary reports.",
    order: "Historical, image-led chapters from crew departure to splashdown. The Earth scene supplies context; no flight trajectory is claimed.",
    stops: [
      { objectId: "demo-2", focusId: "earth", title: "The crew takes the next step", date: "30 May 2020", highlight: "NASA astronauts Robert Behnken and Douglas Hurley headed to Launch Complex 39A for Crew Dragon's first flight carrying astronauts.", image: DEMO2_IMAGES.crew, sourceUrl: NASA_LAUNCH },
      { objectId: "demo-2", focusId: "earth", title: "Liftoff from Kennedy", date: "30 May 2020 · 19:22 UTC", highlight: "A Falcon 9 rocket launched the astronauts in Crew Dragon from Kennedy Space Center. After reaching orbit, they named the spacecraft Endeavour.", image: DEMO2_IMAGES.launch, sourceUrl: NASA_LAUNCH },
      { objectId: "demo-2", focusId: "earth", title: "Rendezvous with the ISS", date: "31 May 2020 · 14:16 UTC", highlight: "Endeavour docked to the station's Harmony port about 19 hours after launch. Soft capture occurred at 10:16 a.m. EDT, followed by hard capture at 10:27 a.m.", image: DEMO2_IMAGES.approach, sourceUrl: "https://blogs.nasa.gov/commercialcrew/2020/05/31/crew-dragon-completes-historic-trip-to-space-station-with-docking-at-1016-a-m-edt/" },
      { objectId: "iss", focusId: "earth", title: "A working stay in orbit", date: "62 days aboard the station", highlight: "Behnken and Hurley contributed more than 100 hours to the station's investigations. Behnken also joined Chris Cassidy for four spacewalks.", image: DEMO2_IMAGES.approach, sourceUrl: "https://www.nasa.gov/blogs/spacestation/2020/08/02/astronauts-wake-up-prep-crew-dragon-for-splashdown-today/" },
      { objectId: "demo-2", focusId: "earth", title: "Safely home", date: "2 August 2020 · 18:48 UTC", highlight: "Endeavour splashed down off Pensacola, Florida, and SpaceX recovered the crew. Demo-2 ended after 64 days in orbit, completing the crewed test flight.", image: DEMO2_IMAGES.recovery, sourceUrl: NASA_RETURN },
    ],
  },
];

export function getTour(id: string | null): DiscoveryTour | undefined {
  return DISCOVERY_TOURS.find((t) => t.id === id);
}

/** Validate actual catalog membership, content, imagery and every scene destination. */
export function availableTours(data: DataBundle): DiscoveryTour[] {
  return DISCOVERY_TOURS.filter((tour) => tour.stops.every((stop) => {
    const object = data.byId.get(stop.objectId);
    const context = data.byId.get(stop.focusId ?? stop.objectId);
    return !!(object && (stop.image || object.image) && (stop.sourceUrl || object.summary?.url) && context && (context.position || context.cosmo));
  }));
}
