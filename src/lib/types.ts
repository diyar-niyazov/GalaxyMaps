/**
 * Shared types for the GalaxyMaps catalog, routing, map and AI tools.
 *
 * Physical frame used everywhere: ICRF axes (equatorial, J2000-aligned),
 * origin at the Sun's center, units in kilometres. Display/projection
 * coordinates are derived from this frame and never feed back into it.
 */

export type Vec3 = [number, number, number];

export type ObjectType =
  | "star"
  | "planet"
  | "dwarf-planet"
  | "moon"
  | "asteroid"
  | "comet"
  | "spacecraft"
  | "star-cluster"
  | "nebula"
  | "galaxy"
  | "black-hole"
  | "quasar"
  | "exoplanet"
  | "white-dwarf"
  | "neutron-star"
  | "supernova-remnant"
  | "galaxy-group"
  | "mission";

export type Region =
  | "solar-system"
  | "stellar-neighborhood"
  | "milky-way"
  | "local-group"
  | "local-volume"
  | "cosmological";

export type DistanceQuality = "precise" | "good" | "approximate" | "uncertain";

export interface SourceInfo {
  id: string;
  title: string;
  url: string;
  license?: string;
  retrieved?: string;
  note?: string;
}

export interface StaticPosition {
  kind: "static";
  frame: "ICRF";
  origin: "Sun";
  /** Epoch of the catalog position (proper motion is not propagated). */
  epoch: string;
  unit: "km";
  xyz: Vec3;
  method: string;
  /**
   * "measured": the object's own distance. "host": sky position placed at its host galaxy's
   * distance because its own depth is unknown (fine for display, not for internal travel).
   */
  depth?: "measured" | "host";
}

export interface EphemerisPosition {
  kind: "ephemeris";
  frame: "ICRF";
  origin: "Sun";
  unit: "km";
  /** Key into Ephemeris.bodies or Ephemeris.satellites. */
  key: string;
  method: string;
}

export type PositionRecord = StaticPosition | EphemerisPosition;

export interface DistanceRecord {
  /** Distance from the Sun in km (for ephemeris bodies: at the dataset reference epoch). */
  valueKm: number;
  plusKm?: number;
  minusKm?: number;
  type: "ephemeris" | "parallax" | "literature" | "catalog";
  quality: DistanceQuality;
  method?: string;
  sourceId: string;
  bibcode?: string;
  note?: string;
}

export type RouteCapability =
  | { supported: true; quality: DistanceQuality; note?: string }
  | { supported: false; reason: string };

export interface Fact {
  label: string;
  value: string;
  sourceId?: string;
}

export type ImageryKind = "observed" | "illustration" | "ai-reconstruction" | "texture";

export interface ImageRecord {
  src: string;
  /** Small local thumbnail for lists and search results. */
  thumb?: string;
  width?: number;
  height?: number;
  kind: ImageryKind;
  title: string;
  credit: string;
  license: string;
  licenseUrl?: string;
  sourceUrl: string;
  alt?: string;
}

/** Distances for objects at cosmological redshift, Planck 2018 flat ΛCDM. Never used for routes. */
export interface CosmoDistance {
  z: number;
  /** Unit sky direction (ICRF); these objects have no 3D position. */
  dir: Vec3;
  comovingLy: number;
  lightTravelYears: number;
  model: string;
  sourceId: string;
}

export interface DisplayInfo {
  color: string;
  /** Higher = more important for labels/search ranking (0..100). */
  priority: number;
  /** Equirectangular texture under /textures, realistic layer only. */
  texture?: string;
  /** North pole direction (ICRF RA/Dec degrees) for orienting textured spheres. */
  pole?: { ra: number; dec: number };
  rings?: { innerKm: number; outerKm: number; texture?: string };
  /** Physical size used for extended objects (galaxies, nebulae), km. */
  extentKm?: number;
  /** Axis ratio (minor/major) for extended-object symbols. */
  axisRatio?: number;
  /** Position angle of the major axis on the sky, degrees east of north (SIMBAD). */
  positionAngle?: number;
  /** Morphology code (e.g. "SA(s)b") used to choose a schematic galaxy glyph. */
  morphology?: string;
}

export interface ExoplanetInfo {
  count: number;
  planets: { name: string; periodDays?: number; radiusEarth?: number; massEarth?: number; discoveryYear?: number; method?: string }[];
  sourceId: string;
}

export interface CatalogObject {
  id: string;
  name: string;
  aliases: string[];
  type: ObjectType;
  /** Primary taxonomy leaf (see src/lib/taxonomy.ts). */
  category: string;
  /** Additional taxonomy leaves. */
  tags?: string[];
  /** Short human readable category, e.g. "Yellow-white supergiant · Ursa Minor". */
  subtitle: string;
  region: Region;
  parentId?: string;
  /** How this object relates to its parent, e.g. a companion galaxy vs. an internal feature. */
  relation?: "orbits" | "member" | "satellite" | "nucleus" | "feature" | "planet";
  position?: PositionRecord;
  distance?: DistanceRecord;
  cosmo?: CosmoDistance;
  route: RouteCapability;
  radiusKm?: number;
  facts: Fact[];
  /**
   * Sourced text. `text` is one sentence; `more` holds up to three further sentences from the same
   * source (shown as highlights); `details` is the remaining lead section. Never AI-generated.
   */
  summary?: { text: string; more?: string[]; details?: string; sourceId: string; url: string };
  image?: ImageRecord;
  /** Additional real images (remote Wikimedia Commons thumbnails), each with its own credit. */
  gallery?: ImageRecord[];
  /** Mission/vehicle content: operator, status and dates, kept separate from astronomical facts. */
  mission?: { operator: string; status: "active" | "retired" | "historic" | "in-development" | "plan"; statusNote?: string; destinations?: string[] };
  exoplanets?: ExoplanetInfo;
  /** HYG id, so the star point cloud can highlight it. */
  hygId?: number;
  hasRings?: boolean;
  display: DisplayInfo;
  sourceIds: string[];
  /** True for curated destination cards (vs. lightweight catalog entries). */
  featured: boolean;
  /** Image-rich highlight shown prominently in browse lists. */
  highlight?: boolean;
}

export interface SpeedReference {
  id: string;
  label: string;
  speedKmS: number;
  frame: string;
  epoch: string;
  description: string;
  sourceId: string;
}

export interface Catalog {
  version: string;
  generated: string;
  referenceEpoch: string;
  frame: string;
  objects: CatalogObject[];
  sources: Record<string, SourceInfo>;
  speedReferences: SpeedReference[];
  stars: { file: string; count: number; columns: string[]; sourceId: string; maxDistancePc: number };
}

/** Daily state vectors (km, km/s), ICRF, Sun-centered, for cubic Hermite interpolation. */
export interface EphemerisBody {
  startJdTdb: number;
  stepDays: number;
  /** Flat [x,y,z,vx,vy,vz] per sample. */
  states: number[];
}

/** Osculating elements relative to a parent body, ICRF frame. */
export interface SatelliteElements {
  parentKey: string;
  /** Element sets ordered by epoch; propagate from the nearest. */
  sets: {
    epochJdTdb: number;
    e: number;
    aKm: number;
    iDeg: number;
    omDeg: number;
    wDeg: number;
    maDeg: number;
    nDegS: number;
  }[];
}

export interface OrbitElements {
  epochJdTdb: number;
  e: number;
  aKm: number;
  qKm: number;
  iDeg: number;
  omDeg: number;
  wDeg: number;
  maDeg: number;
  nDegS: number;
}

export interface Ephemeris {
  frame: "ICRF";
  center: "Sun (body center)";
  timeScale: "TDB";
  startJdTdb: number;
  endJdTdb: number;
  bodies: Record<string, EphemerisBody>;
  satellites: Record<string, SatelliteElements>;
  /** Heliocentric osculating elements at the reference epoch, used only to draw orbit lines. */
  orbits: Record<string, OrbitElements>;
  sourceId: string;
}
