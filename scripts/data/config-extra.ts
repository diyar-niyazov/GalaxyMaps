/**
 * GalaxyMaps catalog expansion. Identifiers are resolved against SIMBAD / JPL at fetch time;
 * entries that do not resolve are reported and skipped, never filled in by hand.
 *
 * Distance rules (see build-dataset.ts):
 *  - auto:   Galactic objects use a parallax with ≤ 20% error; otherwise the robust median of
 *            SIMBAD's literature distance measurements (mesDistance, redshift-based rows excluded).
 *  - host:   features inside another galaxy are placed at their host's distance; their own depth
 *            is unknown, so the position is for display and internal separations are not routed.
 *  - cosmo:  redshift only; comoving distance (Planck 2018) is shown, no Euclidean position.
 */
import type { SolarBody, CuratedObject } from "./config";

// ---------------------------------------------------------------- Solar System (JPL Horizons)
export const EXTRA_SOLAR: SolarBody[] = [
  // Saturn
  { id: "mimas", name: "Mimas", type: "moon", horizons: "601", parent: "saturn", wiki: "Mimas_(moon)", color: "#c9c6c1", priority: 35, subtitle: "Moon of Saturn" },
  { id: "tethys", name: "Tethys", type: "moon", horizons: "603", parent: "saturn", wiki: "Tethys_(moon)", color: "#dcdad6", priority: 30, subtitle: "Moon of Saturn" },
  { id: "dione", name: "Dione", type: "moon", horizons: "604", parent: "saturn", wiki: "Dione_(moon)", color: "#d5d2cc", priority: 30, subtitle: "Moon of Saturn" },
  { id: "rhea", name: "Rhea", type: "moon", horizons: "605", parent: "saturn", wiki: "Rhea_(moon)", color: "#cfcac2", priority: 35, subtitle: "Moon of Saturn" },
  { id: "iapetus", name: "Iapetus", type: "moon", horizons: "608", parent: "saturn", wiki: "Iapetus_(moon)", color: "#8f7f6c", priority: 35, subtitle: "Two-toned moon of Saturn" },
  { id: "hyperion", name: "Hyperion", type: "moon", horizons: "607", parent: "saturn", wiki: "Hyperion_(moon)", color: "#b5a58f", priority: 25, subtitle: "Sponge-like moon of Saturn" },
  // Uranus
  { id: "miranda", name: "Miranda", type: "moon", horizons: "705", parent: "uranus", wiki: "Miranda_(moon)", color: "#b9b6b1", priority: 30, subtitle: "Moon of Uranus" },
  { id: "ariel", name: "Ariel", type: "moon", horizons: "701", parent: "uranus", wiki: "Ariel_(moon)", color: "#c4c1bc", priority: 25, subtitle: "Moon of Uranus" },
  { id: "umbriel", name: "Umbriel", type: "moon", horizons: "702", parent: "uranus", wiki: "Umbriel_(moon)", color: "#7f7c78", priority: 20, subtitle: "Moon of Uranus" },
  { id: "titania", name: "Titania", type: "moon", horizons: "703", parent: "uranus", wiki: "Titania_(moon)", color: "#b3ada6", priority: 30, subtitle: "Largest moon of Uranus" },
  { id: "oberon", name: "Oberon", type: "moon", horizons: "704", parent: "uranus", wiki: "Oberon_(moon)", color: "#a39c94", priority: 25, subtitle: "Moon of Uranus" },
  // Neptune
  { id: "proteus", name: "Proteus", type: "moon", horizons: "808", parent: "neptune", wiki: "Proteus_(moon)", color: "#7b7671", priority: 20, subtitle: "Moon of Neptune" },
  // Asteroids
  { id: "pallas", name: "Pallas", aliases: ["2 Pallas"], type: "asteroid", horizons: "2;", wiki: "2_Pallas", color: "#9b968f", priority: 35, subtitle: "Asteroid · Asteroid belt" },
  { id: "hygiea", name: "Hygiea", aliases: ["10 Hygiea"], type: "asteroid", horizons: "10;", wiki: "10_Hygiea", color: "#7c7873", priority: 28, subtitle: "Asteroid · Asteroid belt" },
  { id: "psyche", name: "Psyche", aliases: ["16 Psyche"], type: "asteroid", horizons: "16;", wiki: "16_Psyche", color: "#a6a29c", priority: 40, subtitle: "Metal-rich asteroid · target of NASA's Psyche" },
  { id: "eros", name: "Eros", aliases: ["433 Eros"], type: "asteroid", horizons: "433;", wiki: "433_Eros", color: "#9c8b79", priority: 38, subtitle: "Near-Earth asteroid · NEAR Shoemaker landed here" },
  { id: "itokawa", name: "Itokawa", aliases: ["25143 Itokawa"], type: "asteroid", horizons: "25143;", wiki: "25143_Itokawa", color: "#8e8a83", priority: 32, subtitle: "Near-Earth asteroid · Hayabusa sample" },
  { id: "ryugu", name: "Ryugu", aliases: ["162173 Ryugu"], type: "asteroid", horizons: "162173;", wiki: "162173_Ryugu", color: "#5f5b57", priority: 36, subtitle: "Near-Earth asteroid · Hayabusa2 sample" },
  { id: "didymos", name: "Didymos", aliases: ["65803 Didymos", "Dimorphos"], type: "asteroid", horizons: "65803;", wiki: "65803_Didymos", color: "#8a857e", priority: 34, subtitle: "Binary asteroid · DART impact target (moon Dimorphos)" },
  { id: "apophis", name: "Apophis", aliases: ["99942 Apophis"], type: "asteroid", horizons: "99942;", wiki: "99942_Apophis", color: "#8d867c", priority: 36, subtitle: "Near-Earth asteroid · close Earth flyby in 2029" },
  { id: "lutetia", name: "Lutetia", aliases: ["21 Lutetia"], type: "asteroid", horizons: "21;", wiki: "21_Lutetia", color: "#93908a", priority: 22, subtitle: "Asteroid · Rosetta flyby" },
  { id: "ida", name: "Ida", aliases: ["243 Ida", "Dactyl"], type: "asteroid", horizons: "243;", wiki: "243_Ida", color: "#8f8a81", priority: 24, subtitle: "Asteroid with a moon (Dactyl) · Galileo flyby" },
  { id: "gaspra", name: "Gaspra", aliases: ["951 Gaspra"], type: "asteroid", horizons: "951;", wiki: "951_Gaspra", color: "#8f8a81", priority: 18, subtitle: "Asteroid · first spacecraft asteroid flyby" },
  { id: "mathilde", name: "Mathilde", aliases: ["253 Mathilde"], type: "asteroid", horizons: "253;", wiki: "253_Mathilde", color: "#5e5a55", priority: 18, subtitle: "Asteroid · NEAR Shoemaker flyby" },
  { id: "dinkinesh", name: "Dinkinesh", aliases: ["152830 Dinkinesh", "Selam"], type: "asteroid", horizons: "152830;", wiki: "152830_Dinkinesh", color: "#8f8a81", priority: 20, subtitle: "Asteroid with a contact-binary moon · Lucy flyby" },
  // Dwarf planets and trans-Neptunian objects
  { id: "haumea", name: "Haumea", aliases: ["136108 Haumea"], type: "dwarf-planet", horizons: "136108;", wiki: "Haumea", color: "#e3e0da", priority: 45, subtitle: "Dwarf planet · Kuiper belt" },
  { id: "makemake", name: "Makemake", aliases: ["136472 Makemake"], type: "dwarf-planet", horizons: "136472;", wiki: "Makemake", color: "#d8b9a0", priority: 42, subtitle: "Dwarf planet · Kuiper belt" },
  { id: "gonggong", name: "Gonggong", aliases: ["225088 Gonggong", "2007 OR10"], type: "asteroid", horizons: "225088;", wiki: "225088_Gonggong", color: "#b07060", priority: 30, subtitle: "Trans-Neptunian object · Scattered disc" },
  { id: "quaoar", name: "Quaoar", aliases: ["50000 Quaoar"], type: "asteroid", horizons: "50000;", wiki: "50000_Quaoar", color: "#b38d78", priority: 32, subtitle: "Trans-Neptunian object with a distant ring" },
  { id: "sedna", name: "Sedna", aliases: ["90377 Sedna"], type: "asteroid", horizons: "90377;", wiki: "90377_Sedna", color: "#b0503a", priority: 38, subtitle: "Detached object · ~11,000-year orbit" },
  { id: "orcus", name: "Orcus", aliases: ["90482 Orcus", "Vanth"], type: "asteroid", horizons: "90482;", wiki: "90482_Orcus", color: "#a7a39d", priority: 24, subtitle: "Trans-Neptunian object · plutino" },
  // Comets and interstellar objects
  { id: "67p", name: "67P/Churyumov–Gerasimenko", aliases: ["67P", "Comet 67P", "Rosetta comet"], type: "comet", horizons: "DES=67P;CAP;NOFRAG", wiki: "67P/Churyumov–Gerasimenko", color: "#9fc3e6", priority: 50, subtitle: "Jupiter-family comet · Rosetta & Philae" },
  { id: "encke", name: "Comet Encke", aliases: ["2P/Encke"], type: "comet", horizons: "DES=2P;CAP;NOFRAG", wiki: "Comet_Encke", color: "#9fc3e6", priority: 28, subtitle: "Periodic comet · 3.3-year orbit" },
  { id: "tempel-1", name: "Tempel 1", aliases: ["9P/Tempel"], type: "comet", horizons: "DES=9P;CAP;NOFRAG", wiki: "9P/Tempel", color: "#9fc3e6", priority: 26, subtitle: "Comet · Deep Impact target" },
  { id: "wild-2", name: "Wild 2", aliases: ["81P/Wild"], type: "comet", horizons: "DES=81P;CAP;NOFRAG", wiki: "81P/Wild", color: "#9fc3e6", priority: 24, subtitle: "Comet · Stardust sample return" },
  { id: "swift-tuttle", name: "Swift–Tuttle", aliases: ["109P/Swift–Tuttle", "Perseids comet"], type: "comet", horizons: "DES=109P;CAP;NOFRAG", wiki: "109P/Swift–Tuttle", color: "#9fc3e6", priority: 30, subtitle: "Comet · parent of the Perseid meteors" },
  { id: "hale-bopp", name: "Hale–Bopp", aliases: ["C/1995 O1", "Comet Hale-Bopp"], type: "comet", horizons: "DES=C/1995 O1;CAP", wiki: "Comet_Hale–Bopp", color: "#9fc3e6", priority: 40, subtitle: "Great Comet of 1997" },
  { id: "neowise", name: "Comet NEOWISE", aliases: ["C/2020 F3"], type: "comet", horizons: "DES=C/2020 F3;CAP", wiki: "C/2020_F3_(NEOWISE)", color: "#9fc3e6", priority: 30, subtitle: "Great Comet of 2020" },
  { id: "oumuamua", name: "ʻOumuamua", aliases: ["1I/2017 U1", "Oumuamua"], type: "comet", horizons: "DES=A/2017 U1;", wiki: "ʻOumuamua", color: "#c9a27a", priority: 45, subtitle: "First known interstellar object (2017)" },
  { id: "borisov", name: "2I/Borisov", aliases: ["C/2019 Q4", "Borisov"], type: "comet", horizons: "DES=C/2019 Q4;", wiki: "2I/Borisov", color: "#9fc3e6", priority: 35, subtitle: "First known interstellar comet (2019)" },
  { id: "3i-atlas", name: "3I/ATLAS", aliases: ["C/2025 N1"], type: "comet", horizons: "DES=C/2025 N1;", wiki: "3I/ATLAS", color: "#9fc3e6", priority: 40, subtitle: "Third known interstellar object (2025)" },
  // Spacecraft with JPL trajectories
  { id: "parker-solar-probe", name: "Parker Solar Probe", aliases: ["PSP"], type: "spacecraft", horizons: "-96", wiki: "Parker_Solar_Probe", color: "#f2c94c", priority: 50, subtitle: "Spacecraft · closest approaches to the Sun" },
  { id: "lucy", name: "Lucy", type: "spacecraft", horizons: "-49", wiki: "Lucy_(spacecraft)", color: "#f2c94c", priority: 35, subtitle: "Spacecraft · en route to Jupiter's Trojan asteroids" },
  { id: "psyche-probe", name: "Psyche spacecraft", type: "spacecraft", horizons: "-255", wiki: "Psyche_(spacecraft)", color: "#f2c94c", priority: 32, subtitle: "Spacecraft · en route to asteroid Psyche" },
  { id: "juice", name: "JUICE", aliases: ["Jupiter Icy Moons Explorer"], type: "spacecraft", horizons: "-28", wiki: "Jupiter_Icy_Moons_Explorer", color: "#f2c94c", priority: 35, subtitle: "ESA spacecraft · en route to Jupiter" },
  { id: "bepicolombo", name: "BepiColombo", type: "spacecraft", horizons: "-121", wiki: "BepiColombo", color: "#f2c94c", priority: 30, subtitle: "ESA/JAXA spacecraft · Mercury mission" },
  { id: "osiris-apex", name: "OSIRIS-APEX", aliases: ["OSIRIS-REx"], type: "spacecraft", horizons: "-64", wiki: "OSIRIS-REx", color: "#f2c94c", priority: 32, subtitle: "Spacecraft · returned Bennu samples, now heading to Apophis" },
  { id: "pioneer-10", name: "Pioneer 10", type: "spacecraft", horizons: "-23", wiki: "Pioneer_10", color: "#f2c94c", priority: 30, subtitle: "Spacecraft (inactive) · leaving the Solar System" },
  { id: "pioneer-11", name: "Pioneer 11", type: "spacecraft", horizons: "-24", wiki: "Pioneer_11", color: "#f2c94c", priority: 24, subtitle: "Spacecraft (inactive) · leaving the Solar System" },
  { id: "tesla-roadster", name: "Tesla Roadster (Starman)", aliases: ["Starman", "Elon Musk's Tesla Roadster"], type: "spacecraft", horizons: "-143205", wiki: "Elon_Musk's_Tesla_Roadster", color: "#e5484d", priority: 40, subtitle: "Falcon Heavy test payload · orbiting the Sun since 2018" },
];

// ---------------------------------------------------------------- Deep sky and stars (SIMBAD)
type C = Omit<CuratedObject, "type"> & { type?: CuratedObject["type"] };
const AUTO = { kind: "auto" } as const;
const HOST = { kind: "host" } as const;
const COSMO = { kind: "cosmo" } as const;
const LOCAL = "local-group" as const, VOL = "local-volume" as const, COS = "cosmological" as const, MW = "milky-way" as const, NB = "stellar-neighborhood" as const;

const gx = (id: string, name: string, simbad: string, wiki: string, category: string, region: CuratedObject["region"], priority: number, extra: Partial<C> = {}): C =>
  ({ id, name, simbad, wiki, category, region, priority, distance: region === COS ? COSMO : AUTO, ...extra });
const neb = (id: string, name: string, simbad: string, wiki: string, category: string, priority: number, extra: Partial<C> = {}): C =>
  ({ id, name, simbad, wiki, category, region: MW, priority, distance: AUTO, ...extra });

export const EXTRA_CURATED: C[] = [
  // ---- Our own galaxy as a destination (frames the disc; not routable as a point)
  { id: "milky-way", name: "Milky Way", aliases: ["Our Galaxy", "The Galaxy"], simbad: "NAME Galactic Center", wiki: "Milky_Way", category: "gx-spiral", region: MW, priority: 99, subtitle: "Barred spiral galaxy · our home",
    distance: { kind: "literature", valuePc: 8178, plusPc: 25, minusPc: 25, bibcode: "2019A&A...625L..10G", citation: "GRAVITY Collaboration 2019, A&A 625, L10 (distance to the Galactic Center)", quality: "precise" } },

  // ---- Local Group galaxies
  gx("m32", "Messier 32", "M 32", "Messier_32", "gx-elliptical", LOCAL, 55, { aliases: ["M32", "NGC 221"], parent: "andromeda", relation: "satellite", subtitle: "Compact elliptical · companion of Andromeda" }),
  gx("m110", "Messier 110", "M 110", "Messier_110", "gx-elliptical", LOCAL, 52, { aliases: ["M110", "NGC 205"], parent: "andromeda", relation: "satellite", subtitle: "Dwarf elliptical · companion of Andromeda" }),
  gx("ngc-147", "NGC 147", "NGC 147", "NGC_147", "gx-dwarf", LOCAL, 30, { parent: "andromeda", relation: "satellite", subtitle: "Dwarf spheroidal · companion of Andromeda" }),
  gx("ngc-185", "NGC 185", "NGC 185", "NGC_185", "gx-dwarf", LOCAL, 30, { parent: "andromeda", relation: "satellite", subtitle: "Dwarf spheroidal · companion of Andromeda" }),
  gx("andromeda-i", "Andromeda I", "And I", "Andromeda_I", "gx-dwarf", LOCAL, 22, { aliases: ["And I"], parent: "andromeda", relation: "satellite", subtitle: "Dwarf spheroidal · companion of Andromeda" }),
  gx("andromeda-ii", "Andromeda II", "And II", "Andromeda_II", "gx-dwarf", LOCAL, 20, { aliases: ["And II"], parent: "andromeda", relation: "satellite", subtitle: "Dwarf spheroidal · companion of Andromeda" }),
  gx("ngc-6822", "Barnard's Galaxy", "NGC 6822", "Barnard's_Galaxy", "gx-dwarf", LOCAL, 40, { aliases: ["NGC 6822"], subtitle: "Barred irregular galaxy · Local Group" }),
  gx("ic-10", "IC 10", "IC 10", "IC_10", "gx-dwarf", LOCAL, 30, { subtitle: "Starburst dwarf irregular · Local Group" }),
  gx("ic-1613", "IC 1613", "IC 1613", "IC_1613", "gx-dwarf", LOCAL, 25, { subtitle: "Dwarf irregular galaxy · Local Group" }),
  gx("wlm", "Wolf–Lundmark–Melotte", "NAME WLM Galaxy", "Wolf–Lundmark–Melotte", "gx-dwarf", LOCAL, 25, { aliases: ["WLM"], subtitle: "Isolated dwarf irregular · Local Group" }),
  gx("sagittarius-dsph", "Sagittarius Dwarf Spheroidal", "NAME Sgr Dwarf Galaxy", "Sagittarius_Dwarf_Spheroidal_Galaxy", "gx-dwarf", LOCAL, 40, { aliases: ["Sgr dSph", "Sagittarius Dwarf"], parent: "milky-way", relation: "satellite", subtitle: "Satellite being torn apart by the Milky Way" }),
  gx("sculptor-dwarf", "Sculptor Dwarf Galaxy", "NAME Sculptor Dwarf Galaxy", "Sculptor_Dwarf_Galaxy", "gx-dwarf", LOCAL, 25, { parent: "milky-way", relation: "satellite", subtitle: "Dwarf spheroidal · satellite of the Milky Way" }),
  gx("fornax-dwarf", "Fornax Dwarf Galaxy", "NAME Fornax Dwarf Spheroidal", "Fornax_Dwarf_Spheroidal_Galaxy", "gx-dwarf", LOCAL, 25, { parent: "milky-way", relation: "satellite", subtitle: "Dwarf spheroidal · satellite of the Milky Way" }),
  gx("draco-dwarf", "Draco Dwarf Galaxy", "NAME Draco Dwarf Galaxy", "Draco_Dwarf", "gx-dwarf", LOCAL, 22, { parent: "milky-way", relation: "satellite", subtitle: "Dark-matter-dominated dwarf · satellite of the Milky Way" }),
  gx("leo-i-dwarf", "Leo I", "NAME Leo I dSph", "Leo_I_(dwarf_galaxy)", "gx-dwarf", LOCAL, 22, { aliases: ["Leo I dwarf"], parent: "milky-way", relation: "satellite", subtitle: "Distant dwarf spheroidal · satellite of the Milky Way" }),
  gx("carina-dwarf", "Carina Dwarf Galaxy", "NAME Carina dSph", "Carina_Dwarf_Spheroidal_Galaxy", "gx-dwarf", LOCAL, 18, { parent: "milky-way", relation: "satellite", subtitle: "Dwarf spheroidal · satellite of the Milky Way" }),
  gx("leo-a", "Leo A", "NAME Leo A", "Leo_A", "gx-dwarf", LOCAL, 18, { subtitle: "Dwarf irregular · Local Group" }),

  // ---- Nearby galaxies (routable when within the local, Euclidean regime)
  gx("m82", "Cigar Galaxy", "M 82", "Messier_82", "gx-other", VOL, 70, { aliases: ["M82", "Messier 82", "NGC 3034"], parent: "m81-group", relation: "member", subtitle: "Starburst galaxy · M81 Group" }),
  gx("m83", "Southern Pinwheel Galaxy", "M 83", "Messier_83", "gx-spiral", VOL, 60, { aliases: ["M83", "Messier 83", "NGC 5236"], subtitle: "Barred spiral galaxy · Hydra" }),
  gx("ngc-253", "Sculptor Galaxy", "NGC 253", "Sculptor_Galaxy", "gx-spiral", VOL, 58, { aliases: ["NGC 253", "Silver Coin Galaxy"], parent: "sculptor-group", relation: "member", subtitle: "Starburst spiral · Sculptor Group" }),
  gx("m94", "Messier 94", "M 94", "Messier_94", "gx-spiral", VOL, 35, { aliases: ["M94", "NGC 4736", "Cat's Eye Galaxy"], subtitle: "Spiral galaxy with a bright inner ring" }),
  gx("m64", "Black Eye Galaxy", "M 64", "Black_Eye_Galaxy", "gx-spiral", VOL, 45, { aliases: ["M64", "Messier 64", "NGC 4826"], subtitle: "Spiral galaxy with a dark dust band" }),
  gx("m63", "Sunflower Galaxy", "M 63", "Sunflower_Galaxy", "gx-spiral", VOL, 40, { aliases: ["M63", "Messier 63", "NGC 5055"], subtitle: "Flocculent spiral galaxy" }),
  gx("m106", "Messier 106", "M 106", "Messier_106", "gx-spiral", VOL, 40, { aliases: ["M106", "NGC 4258"], subtitle: "Spiral galaxy with a water-maser black hole" }),
  gx("ngc-4631", "Whale Galaxy", "NGC 4631", "Whale_Galaxy", "gx-spiral", VOL, 30, { aliases: ["NGC 4631"], subtitle: "Edge-on barred spiral" }),
  gx("ngc-891", "NGC 891", "NGC 891", "NGC_891", "gx-spiral", VOL, 30, { subtitle: "Edge-on spiral · a Milky Way look-alike" }),
  gx("m74", "Phantom Galaxy", "M 74", "Messier_74", "gx-spiral", VOL, 45, { aliases: ["M74", "Messier 74", "NGC 628"], subtitle: "Grand-design spiral · Pisces" }),
  gx("m77", "Messier 77", "M 77", "Messier_77", "gx-other", VOL, 40, { aliases: ["M77", "NGC 1068", "Cetus A"], subtitle: "Barred spiral with an active (Seyfert) nucleus" }),
  gx("m66", "Messier 66", "M 66", "Messier_66", "gx-spiral", VOL, 30, { aliases: ["M66", "NGC 3627"], parent: "leo-triplet", relation: "member", subtitle: "Spiral galaxy · Leo Triplet" }),
  gx("m65", "Messier 65", "M 65", "Messier_65", "gx-spiral", VOL, 25, { aliases: ["M65", "NGC 3623"], parent: "leo-triplet", relation: "member", subtitle: "Spiral galaxy · Leo Triplet" }),
  gx("ngc-3628", "Hamburger Galaxy", "NGC 3628", "NGC_3628", "gx-spiral", VOL, 25, { aliases: ["NGC 3628"], parent: "leo-triplet", relation: "member", subtitle: "Edge-on spiral · Leo Triplet" }),
  gx("ngc-5195", "NGC 5195", "NGC 5195", "NGC_5195", "gx-dwarf", VOL, 28, { aliases: ["M51b"], parent: "whirlpool", relation: "satellite", subtitle: "Companion galaxy of the Whirlpool" }),
  gx("ic-342", "IC 342", "IC 342", "IC_342", "gx-spiral", VOL, 28, { aliases: ["Hidden Galaxy"], subtitle: "Face-on spiral behind the Milky Way's dust" }),
  gx("ngc-300", "NGC 300", "NGC 300", "NGC_300", "gx-spiral", VOL, 25, { parent: "sculptor-group", relation: "member", subtitle: "Spiral galaxy · Sculptor Group" }),
  gx("ngc-55", "NGC 55", "NGC 55", "NGC_55", "gx-dwarf", VOL, 22, { parent: "sculptor-group", relation: "member", subtitle: "Magellanic-type irregular · Sculptor Group" }),
  gx("ngc-2403", "NGC 2403", "NGC 2403", "NGC_2403", "gx-spiral", VOL, 25, { parent: "m81-group", relation: "member", subtitle: "Spiral galaxy · M81 Group outskirts" }),
  gx("ngc-6946", "Fireworks Galaxy", "NGC 6946", "Fireworks_Galaxy", "gx-spiral", VOL, 35, { aliases: ["NGC 6946"], subtitle: "Spiral galaxy with frequent supernovae" }),
  gx("ngc-1300", "NGC 1300", "NGC 1300", "NGC_1300", "gx-spiral", VOL, 35, { subtitle: "Textbook barred spiral · Eridanus" }),
  gx("ngc-4565", "Needle Galaxy", "NGC 4565", "Needle_Galaxy", "gx-spiral", VOL, 30, { aliases: ["NGC 4565"], subtitle: "Edge-on spiral · Coma Berenices" }),
  gx("m49", "Messier 49", "M 49", "Messier_49", "gx-elliptical", VOL, 28, { aliases: ["M49", "NGC 4472"], parent: "virgo-cluster", relation: "member", subtitle: "Giant elliptical · Virgo Cluster" }),
  gx("m60", "Messier 60", "M 60", "Messier_60", "gx-elliptical", VOL, 22, { aliases: ["M60", "NGC 4649"], parent: "virgo-cluster", relation: "member", subtitle: "Giant elliptical · Virgo Cluster" }),
  gx("m84", "Messier 84", "M 84", "Messier_84", "gx-other", VOL, 22, { aliases: ["M84", "NGC 4374"], parent: "virgo-cluster", relation: "member", subtitle: "Lenticular galaxy · Virgo Cluster" }),
  gx("m86", "Messier 86", "M 86", "Messier_86", "gx-other", VOL, 22, { aliases: ["M86", "NGC 4406"], parent: "virgo-cluster", relation: "member", subtitle: "Lenticular galaxy · Virgo Cluster" }),
  gx("m100", "Messier 100", "M 100", "Messier_100", "gx-spiral", VOL, 30, { aliases: ["M100", "NGC 4321"], parent: "virgo-cluster", relation: "member", subtitle: "Grand-design spiral · Virgo Cluster" }),
  gx("m61", "Messier 61", "M 61", "Messier_61", "gx-spiral", VOL, 22, { aliases: ["M61", "NGC 4303"], parent: "virgo-cluster", relation: "member", subtitle: "Barred spiral · Virgo Cluster" }),
  gx("ngc-1316", "Fornax A", "NGC 1316", "Fornax_A", "gx-other", VOL, 30, { aliases: ["NGC 1316"], parent: "fornax-cluster", relation: "member", subtitle: "Lenticular radio galaxy · Fornax Cluster" }),
  gx("ngc-1365", "Great Barred Spiral Galaxy", "NGC 1365", "NGC_1365", "gx-spiral", VOL, 35, { aliases: ["NGC 1365"], parent: "fornax-cluster", relation: "member", subtitle: "Barred spiral · Fornax Cluster" }),
  gx("antennae", "Antennae Galaxies", "NGC 4038", "Antennae_Galaxies", "gx-other", VOL, 45, { aliases: ["NGC 4038", "NGC 4039"], subtitle: "Colliding pair of galaxies · Corvus" }),
  gx("ngc-4449", "NGC 4449", "NGC 4449", "NGC_4449", "gx-dwarf", VOL, 20, { subtitle: "Starburst irregular galaxy" }),

  // ---- Distant highlights (redshift only: exploration, no Euclidean route)
  gx("cartwheel", "Cartwheel Galaxy", "NAME Cartwheel Galaxy", "Cartwheel_Galaxy", "gx-other", COS, 45, { aliases: ["ESO 350-40"], subtitle: "Ring galaxy formed by a collision" }),
  gx("hoags-object", "Hoag's Object", "NAME Hoag's Object", "Hoag's_Object", "gx-other", COS, 35, { subtitle: "Nearly perfect ring galaxy" }),
  gx("arp-220", "APG 220", "APG 220", "Arp_220", "gx-other", COS, 25, { subtitle: "Merging ultraluminous infrared galaxy" }),
  gx("ngc-1275", "Perseus A", "NGC 1275", "NGC_1275", "gx-other", COS, 25, { aliases: ["NGC 1275"], subtitle: "Central galaxy of the Perseus Cluster" }),
  gx("tadpole", "Tadpole Galaxy", "UGC 10214", "Tadpole_Galaxy", "gx-other", COS, 30, { aliases: ["UGC 10214", "Arp 188"], subtitle: "Disrupted spiral with a long tidal tail" }),
  gx("ic-1101", "IC 1101", "IC 1101", "IC_1101", "gx-elliptical", COS, 25, { subtitle: "Supergiant elliptical · Abell 2029" }),
  gx("cygnus-a", "Cygnus A", "NAME Cyg A", "Cygnus_A", "gx-other", COS, 30, { subtitle: "Powerful radio galaxy" }),
  gx("gn-z11", "GN-z11", "[OBV2016] GN-z11", "GN-z11", "gx-other", COS, 40, { subtitle: "One of the most distant galaxies known" }),

  // ---- Large-scale structures
  { id: "virgo-cluster", name: "Virgo Cluster", simbad: "NAME Virgo Cluster", wiki: "Virgo_Cluster", category: "ls-clusters", region: VOL, priority: 50, distance: AUTO, subtitle: "Nearest large galaxy cluster" },
  { id: "fornax-cluster", name: "Fornax Cluster", simbad: "NAME Fornax Cluster", wiki: "Fornax_Cluster", category: "ls-clusters", region: VOL, priority: 30, distance: AUTO, subtitle: "Galaxy cluster · southern sky" },
  { id: "coma-cluster", name: "Coma Cluster", aliases: ["Abell 1656"], simbad: "ACO 1656", wiki: "Coma_Cluster", category: "ls-clusters", region: COS, priority: 35, distance: COSMO, subtitle: "Rich galaxy cluster · where dark matter was inferred" },
  { id: "bullet-cluster", name: "Bullet Cluster", aliases: ["1E 0657-56"], simbad: "NAME Bullet Cluster", wiki: "Bullet_Cluster", category: "ls-clusters", region: COS, priority: 35, distance: COSMO, subtitle: "Colliding clusters · dark-matter evidence" },
  { id: "m81-group", name: "M81 Group", simbad: "NAME M81 Group", wiki: "M81_Group", category: "ls-groups", region: VOL, priority: 30, distance: AUTO, subtitle: "Galaxy group around Bode's Galaxy" },
  { id: "sculptor-group", name: "Sculptor Group", simbad: "NAME Sculptor Group", wiki: "Sculptor_Group", category: "ls-groups", region: VOL, priority: 25, distance: AUTO, subtitle: "Nearest galaxy group to the Local Group" },
  { id: "leo-triplet", name: "Leo Triplet", simbad: "NAME Leo Triplet", wiki: "Leo_Triplet", category: "ls-groups", region: VOL, priority: 30, distance: AUTO, subtitle: "Small group of three spirals" },
  { id: "stephans-quintet", name: "Stephan's Quintet", aliases: ["HCG 92"], simbad: "HCG 92", wiki: "Stephan's_Quintet", category: "ls-groups", region: COS, priority: 45, distance: COSMO, subtitle: "Compact galaxy group · Webb showcase" },

  // ---- Nebulae
  neb("carina-nebula", "Carina Nebula", "NGC 3372", "Carina_Nebula", "nb-emission", 70, { aliases: ["NGC 3372", "Cosmic Cliffs"], subtitle: "Giant star-forming region · Carina",
    distance: { kind: "literature", valuePc: 2350, plusPc: 50, minusPc: 50, bibcode: "2006ApJ...644.1151S", citation: "Smith 2006, ApJ 644, 1151 (distance to the Carina Nebula / η Car)", quality: "good" } }),
  neb("lagoon-nebula", "Lagoon Nebula", "M 8", "Lagoon_Nebula", "nb-emission", 55, { aliases: ["M8", "Messier 8"], subtitle: "Emission nebula · Sagittarius" }),
  neb("trifid-nebula", "Trifid Nebula", "M 20", "Trifid_Nebula", "nb-emission", 45, { aliases: ["M20", "Messier 20"], subtitle: "Emission, reflection and dark nebula · Sagittarius" }),
  neb("omega-nebula", "Omega Nebula", "M 17", "Omega_Nebula", "nb-emission", 40, { aliases: ["M17", "Swan Nebula"], subtitle: "Star-forming region · Sagittarius" }),
  neb("rosette-nebula", "Rosette Nebula", "NAME Rosette Nebula", "Rosette_Nebula", "nb-emission", 45, { aliases: ["NGC 2237", "Caldwell 49"], subtitle: "Emission nebula · Monoceros" }),
  neb("horsehead-nebula", "Horsehead Nebula", "Barnard 33", "Horsehead_Nebula", "nb-dark", 60, { aliases: ["Barnard 33", "B33"], subtitle: "Dark nebula · Orion" }),
  neb("flame-nebula", "Flame Nebula", "NGC 2024", "Flame_Nebula", "nb-emission", 30, { aliases: ["NGC 2024"], subtitle: "Emission nebula · Orion" }),
  neb("north-america-nebula", "North America Nebula", "NGC 7000", "North_America_Nebula", "nb-emission", 30, { aliases: ["NGC 7000"], subtitle: "Emission nebula · Cygnus" }),
  neb("heart-nebula", "Heart Nebula", "IC 1805", "Heart_Nebula", "nb-emission", 30, { aliases: ["IC 1805"], subtitle: "Emission nebula · Cassiopeia" }),
  neb("bubble-nebula", "Bubble Nebula", "NGC 7635", "Bubble_Nebula", "nb-emission", 30, { aliases: ["NGC 7635"], subtitle: "Wind-blown bubble · Cassiopeia" }),
  neb("tarantula-nebula", "Tarantula Nebula", "NAME 30 Dor Nebula", "Tarantula_Nebula", "nb-emission", 60, { aliases: ["30 Doradus", "NGC 2070"], region: LOCAL, parent: "lmc", relation: "feature", distance: HOST, subtitle: "Starburst region · Large Magellanic Cloud" }),
  neb("cats-eye-nebula", "Cat's Eye Nebula", "NGC 6543", "Cat's_Eye_Nebula", "nb-planetary", 45, { aliases: ["NGC 6543"], subtitle: "Planetary nebula · Draco" }),
  neb("dumbbell-nebula", "Dumbbell Nebula", "M 27", "Dumbbell_Nebula", "nb-planetary", 45, { aliases: ["M27", "Messier 27"], subtitle: "Planetary nebula · Vulpecula" }),
  neb("owl-nebula", "Owl Nebula", "M 97", "Owl_Nebula", "nb-planetary", 28, { aliases: ["M97", "Messier 97"], subtitle: "Planetary nebula · Ursa Major" }),
  neb("eskimo-nebula", "Eskimo Nebula", "NGC 2392", "Eskimo_Nebula", "nb-planetary", 28, { aliases: ["NGC 2392", "Clown-face Nebula"], subtitle: "Planetary nebula · Gemini" }),
  neb("butterfly-nebula", "Butterfly Nebula", "NGC 6302", "NGC_6302", "nb-planetary", 35, { aliases: ["NGC 6302", "Bug Nebula"], subtitle: "Bipolar planetary nebula · Scorpius" }),
  neb("southern-ring-nebula", "Southern Ring Nebula", "NGC 3132", "NGC_3132", "nb-planetary", 40, { aliases: ["NGC 3132", "Eight-Burst Nebula"], subtitle: "Planetary nebula · Webb first image" }),
  neb("iris-nebula", "Iris Nebula", "NGC 7023", "Iris_Nebula", "nb-reflection", 25, { aliases: ["NGC 7023"], subtitle: "Reflection nebula · Cepheus" }),
  neb("witch-head-nebula", "Witch Head Nebula", "IC 2118", "IC_2118", "nb-reflection", 25, { aliases: ["IC 2118"], subtitle: "Reflection nebula lit by Rigel" }),
  neb("coalsack", "Coalsack Nebula", "NAME Coalsack Nebula", "Coalsack_Nebula", "nb-dark", 30, { subtitle: "Dark nebula · Crux" }),
  neb("barnard-68", "Barnard 68", "Barnard 68", "Barnard_68", "nb-dark", 30, { aliases: ["B68"], subtitle: "Dark molecular cloud · Ophiuchus" }),
  // Supernova remnants
  neb("veil-nebula", "Veil Nebula", "NAME Cygnus Loop", "Veil_Nebula", "cr-snr", 45, { aliases: ["Cygnus Loop"], type: "supernova-remnant", subtitle: "Supernova remnant · Cygnus" }),
  neb("cassiopeia-a", "Cassiopeia A", "NAME Cassiopeia A", "Cassiopeia_A", "cr-snr", 45, { aliases: ["Cas A"], type: "supernova-remnant", subtitle: "Young supernova remnant · Cassiopeia" }),
  neb("vela-snr", "Vela Supernova Remnant", "NAME Vela SNR", "Vela_supernova_remnant", "cr-snr", 30, { type: "supernova-remnant", subtitle: "Supernova remnant · Vela" }),
  neb("tycho-snr", "Tycho's Supernova Remnant", "NAME Tycho SNR", "SN_1572", "cr-snr", 30, { aliases: ["SN 1572"], type: "supernova-remnant", subtitle: "Remnant of the supernova of 1572" }),
  neb("kepler-snr", "Kepler's Supernova Remnant", "NAME Kepler SNR", "Kepler's_Supernova", "cr-snr", 28, { aliases: ["SN 1604"], type: "supernova-remnant", subtitle: "Remnant of the supernova of 1604" }),
  neb("sn-1987a", "SN 1987A", "SN 1987A", "SN_1987A", "cr-snr", 45, { region: LOCAL, parent: "lmc", relation: "feature", distance: HOST, type: "supernova-remnant", subtitle: "Supernova of 1987 · Large Magellanic Cloud" }),

  // ---- Star clusters & associations
  neb("beehive-cluster", "Beehive Cluster", "M 44", "Beehive_Cluster", "cl-open", 40, { aliases: ["M44", "Praesepe"], region: NB, subtitle: "Open cluster · Cancer" }),
  neb("double-cluster", "Double Cluster", "NGC 869", "Double_Cluster", "cl-open", 35, { aliases: ["NGC 869", "NGC 884", "h and χ Persei"], subtitle: "Pair of open clusters · Perseus" }),
  neb("jewel-box", "Jewel Box", "NGC 4755", "Jewel_Box_(star_cluster)", "cl-open", 30, { aliases: ["NGC 4755", "Kappa Crucis Cluster"], subtitle: "Open cluster · Crux" }),
  neb("wild-duck-cluster", "Wild Duck Cluster", "M 11", "Wild_Duck_Cluster", "cl-open", 25, { aliases: ["M11", "Messier 11"], subtitle: "Rich open cluster · Scutum" }),
  neb("ptolemy-cluster", "Ptolemy Cluster", "M 7", "Ptolemy_Cluster", "cl-open", 25, { aliases: ["M7", "Messier 7"], subtitle: "Open cluster · Scorpius" }),
  neb("m35", "Messier 35", "M 35", "Messier_35", "cl-open", 20, { aliases: ["M35", "NGC 2168"], subtitle: "Open cluster · Gemini" }),
  neb("m67", "Messier 67", "M 67", "Messier_67", "cl-open", 25, { aliases: ["M67", "NGC 2682"], subtitle: "Old open cluster · Cancer" }),
  neb("trapezium", "Trapezium Cluster", "NAME Trapezium Cluster", "Trapezium_Cluster", "cl-open", 40, { aliases: ["Theta1 Orionis"], parent: "orion-nebula", relation: "member", subtitle: "Young cluster lighting the Orion Nebula" }),
  neb("westerlund-1", "Westerlund 1", "Cl Westerlund 1", "Westerlund_1", "cl-open", 30, { subtitle: "Super star cluster · Ara" }),
  neb("westerlund-2", "Westerlund 2", "Cl Westerlund 2", "Westerlund_2", "cl-open", 30, { subtitle: "Young massive cluster · Carina" }),
  neb("arches-cluster", "Arches Cluster", "NAME Arches Cluster", "Arches_Cluster", "cl-open", 25, { subtitle: "Dense young cluster near the Galactic Center" }),
  neb("ngc-3603", "NGC 3603", "NGC 3603", "NGC_3603", "cl-open", 25, { subtitle: "Massive young cluster · Carina" }),
  neb("r136", "R136", "RMC 136", "R136", "cl-open", 40, { region: LOCAL, parent: "tarantula-nebula", relation: "member", distance: HOST, subtitle: "Super star cluster · Tarantula Nebula, LMC" }),
  neb("m3", "Messier 3", "M 3", "Messier_3", "cl-globular", 30, { aliases: ["M3", "NGC 5272"], subtitle: "Globular cluster · Canes Venatici" }),
  neb("m4", "Messier 4", "M 4", "Messier_4", "cl-globular", 28, { aliases: ["M4", "NGC 6121"], subtitle: "Nearby globular cluster · Scorpius" }),
  neb("m5", "Messier 5", "M 5", "Messier_5", "cl-globular", 22, { aliases: ["M5", "NGC 5904"], subtitle: "Globular cluster · Serpens" }),
  neb("m15", "Messier 15", "M 15", "Messier_15", "cl-globular", 25, { aliases: ["M15", "NGC 7078"], subtitle: "Core-collapsed globular cluster · Pegasus" }),
  neb("m22", "Messier 22", "M 22", "Messier_22", "cl-globular", 25, { aliases: ["M22", "NGC 6656"], subtitle: "Globular cluster · Sagittarius" }),
  neb("m92", "Messier 92", "M 92", "Messier_92", "cl-globular", 20, { aliases: ["M92", "NGC 6341"], subtitle: "Ancient globular cluster · Hercules" }),
  neb("ngc-6397", "NGC 6397", "NGC 6397", "NGC_6397", "cl-globular", 20, { subtitle: "One of the nearest globular clusters" }),
  neb("terzan-5", "Cl Terzan 5", "Cl Terzan 5", "Terzan_5", "cl-globular", 20, { subtitle: "Globular cluster rich in millisecond pulsars" }),
  neb("sco-cen", "Scorpius–Centaurus association", "NAME Sco-Cen", "Scorpius–Centaurus_association", "cl-assoc", 25, { aliases: ["Sco-Cen", "Sco OB2"], region: NB, subtitle: "Nearest OB association" }),
  neb("ursa-major-group", "Ursa Major Moving Group", "NAME UMa Moving Group", "Ursa_Major_moving_group", "cl-assoc", 20, { aliases: ["Collinder 285"], region: NB, subtitle: "Stars of the Big Dipper moving together" }),
  neb("cygnus-ob2", "Cygnus OB2", "Ass Cyg OB 2", "Cygnus_OB2", "cl-assoc", 20, { subtitle: "Massive OB association · Cygnus" }),

  // ---- Black holes
  neb("cygnus-x-1", "Cygnus X-1", "HD 226868", "Cygnus_X-1", "cr-black-holes", 60, { type: "black-hole", subtitle: "Stellar-mass black hole with a blue supergiant" }),
  neb("v404-cygni", "V404 Cygni", "V* V404 Cyg", "V404_Cygni", "cr-black-holes", 35, { type: "black-hole", subtitle: "Black hole X-ray binary · Cygnus" }),
  neb("a0620-00", "A0620-00", "V* V616 Mon", "A0620-00", "cr-black-holes", 30, { aliases: ["V616 Monocerotis"], type: "black-hole", region: NB, subtitle: "One of the nearest known black holes" }),
  neb("gaia-bh1", "Gaia BH1", "Gaia DR3 4373465352415301632", "Gaia_BH1", "cr-black-holes", 45, { type: "black-hole", region: NB, subtitle: "Dormant black hole found by Gaia" }),
  neb("gaia-bh3", "Gaia BH3", "Gaia DR3 4318465066420528000", "Gaia_BH3", "cr-black-holes", 45, { type: "black-hole", region: NB, subtitle: "Most massive known stellar black hole in the Milky Way" }),
  neb("grs-1915", "GRS 1915+105", "V* V1487 Aql", "GRS_1915+105", "cr-black-holes", 25, { type: "black-hole", subtitle: "Black hole X-ray binary with relativistic jets" }),
  { id: "m87-star", name: "M87*", aliases: ["M87 black hole", "Pōwehi"], simbad: "M 87", wiki: "", category: "cr-black-holes", region: VOL, priority: 70, type: "black-hole", parent: "m87", relation: "nucleus", distance: HOST, subtitle: "Supermassive black hole · first ever imaged (2019)", image: "Black_hole_-_Messier_87_crop_max_res.jpg",
    blurb: { text: "M87* is the supermassive black hole at the centre of the galaxy Messier 87; in April 2019 the Event Horizon Telescope Collaboration published an image of its shadow, the first image of a black hole.", source: "Event Horizon Telescope Collaboration 2019, ApJL 875, L1", url: "https://doi.org/10.3847/2041-8213/ab0ec7" } },
  { id: "m31-star", name: "M31*", aliases: ["Andromeda's black hole", "Andromeda nucleus"], simbad: "NAME M31*", wiki: "", category: "cr-black-holes", region: LOCAL, priority: 45, type: "black-hole", parent: "andromeda", relation: "nucleus", distance: HOST, subtitle: "Supermassive black hole at Andromeda's centre", image: null,
    blurb: { text: "M31* is the compact radio source marking the supermassive black hole at the centre of the Andromeda Galaxy.", source: "SIMBAD object record NAME M31*", url: "https://simbad.cds.unistra.fr/simbad/sim-id?Ident=NAME+M31*" } },

  // ---- Neutron stars & pulsars
  neb("crab-pulsar", "Crab Pulsar", "PSR B0531+21", "Crab_Pulsar", "cr-neutron", 45, { aliases: ["PSR B0531+21"], type: "neutron-star", parent: "crab-nebula", relation: "member", subtitle: "Pulsar at the heart of the Crab Nebula" }),
  neb("vela-pulsar", "Vela Pulsar", "PSR B0833-45", "Vela_Pulsar", "cr-neutron", 35, { aliases: ["PSR B0833-45"], type: "neutron-star", parent: "vela-snr", relation: "member", subtitle: "Pulsar in the Vela supernova remnant" }),
  neb("geminga", "Geminga", "PSR J0633+1746", "Geminga", "cr-neutron", 30, { type: "neutron-star", region: NB, subtitle: "Nearby radio-quiet pulsar" }),
  neb("psr-b1919", "PSR B1919+21", "PSR B1919+21", "PSR_B1919+21", "cr-neutron", 35, { aliases: ["CP 1919", "First pulsar"], type: "neutron-star", subtitle: "The first pulsar discovered (1967)" }),
  neb("psr-j0437", "PSR J0437−4715", "PSR J0437-4715", "PSR_J0437−4715", "cr-neutron", 25, { type: "neutron-star", region: NB, subtitle: "Nearest millisecond pulsar" }),
  neb("hulse-taylor", "Hulse–Taylor pulsar", "PSR B1913+16", "Hulse–Taylor_binary", "cr-neutron", 30, { aliases: ["PSR B1913+16"], type: "neutron-star", subtitle: "Binary pulsar that confirmed gravitational waves" }),
  neb("double-pulsar", "Double Pulsar", "PSR J0737-3039A", "PSR_J0737−3039", "cr-neutron", 25, { aliases: ["PSR J0737−3039"], type: "neutron-star", subtitle: "The only known double pulsar" }),
  neb("psr-b1257", "Lich (PSR B1257+12)", "PSR B1257+12", "PSR_B1257+12", "cr-neutron", 35, { aliases: ["PSR B1257+12", "Lich"], type: "neutron-star", exoplanetHost: "PSR B1257+12", tags: ["st-exohosts"], subtitle: "Pulsar hosting the first confirmed exoplanets" }),
  neb("rx-j1856", "RX J1856.5−3754", "RX J1856.5-3754", "RX_J1856.5−3754", "cr-neutron", 20, { type: "neutron-star", region: NB, subtitle: "Nearby isolated neutron star" }),
  neb("sgr-1806", "SGR 1806−20", "NAME Sgr 1806-20", "SGR_1806−20", "cr-neutron", 25, { type: "neutron-star", subtitle: "Magnetar with a record 2004 flare" }),

  // ---- White dwarfs
  neb("sirius-b", "Sirius B", "* alf CMa B", "Sirius", "cr-white-dwarfs", 45, { type: "white-dwarf", region: NB, parent: "sirius", relation: "orbits", subtitle: "White dwarf companion of Sirius", image: "Sirius_A_and_B_Hubble_photo.jpg" }),
  neb("40-eridani-b", "40 Eridani B", "* omi02 Eri B", "40_Eridani", "cr-white-dwarfs", 25, { type: "white-dwarf", region: NB, subtitle: "Easily seen white dwarf in a triple system" }),
  neb("van-maanens-star", "Van Maanen's Star", "NAME van Maanen's Star", "Van_Maanen's_Star", "cr-white-dwarfs", 25, { type: "white-dwarf", region: NB, subtitle: "Nearest solitary white dwarf" }),
  neb("wd-1856", "WD 1856+534", "WD 1856+534", "WD_1856+534", "cr-white-dwarfs", 20, { type: "white-dwarf", region: NB, exoplanetHost: "WD 1856+534", tags: ["st-exohosts"], subtitle: "White dwarf with a transiting giant planet" }),

  // ---- More stars and multiple systems
  neb("albireo", "Albireo", "* bet01 Cyg", "Albireo", "st-multiple", 40, { region: NB, subtitle: "Colourful double star · Cygnus" }),
  neb("epsilon-lyrae", "Epsilon Lyrae", "* eps01 Lyr", "Epsilon_Lyrae", "st-multiple", 25, { aliases: ["Double Double"], region: NB, subtitle: "The 'Double Double' · Lyra" }),
  neb("alcor", "Alcor", "* 80 UMa", "Alcor_(star)", "st-multiple", 25, { region: NB, subtitle: "Mizar's naked-eye companion" }),
  neb("mu-cephei", "Mu Cephei", "* mu. Cep", "Mu_Cephei", "st-stars", 30, { aliases: ["Herschel's Garnet Star"], subtitle: "Red supergiant · Cepheus" }),
  neb("uy-scuti", "UY Scuti", "V* UY Sct", "UY_Scuti", "st-stars", 35, { subtitle: "Red supergiant · Scutum" }),
  neb("wr-104", "WR 104", "WR 104", "WR_104", "st-stars", 25, { subtitle: "Wolf–Rayet 'pinwheel' binary" }),
  neb("luhman-16", "Luhman 16", "NAME Luhman 16", "Luhman_16", "st-multiple", 35, { region: NB, subtitle: "Nearest brown-dwarf pair" }),
  neb("wise-0855", "WISE 0855−0714", "WISE J085510.83-071442.5", "WISE_0855−0714", "st-stars", 30, { region: NB, subtitle: "Coldest known brown dwarf" }),
  neb("gliese-710", "Gliese 710", "HD 168442", "Gliese_710", "st-stars", 25, { region: NB, subtitle: "Star predicted to pass near the Sun in ~1.3 Myr" }),
  neb("kapteyns-star", "Kapteyn's Star", "NAME Kapteyn's Star", "Kapteyn's_Star", "st-stars", 22, { region: NB, subtitle: "Fast-moving halo star" }),
  neb("hd-140283", "Methuselah star", "HD 140283", "HD_140283", "st-stars", 25, { aliases: ["HD 140283"], region: NB, subtitle: "One of the oldest known stars" }),
  neb("przybylskis-star", "Przybylski's Star", "HD 101065", "Przybylski's_Star", "st-stars", 18, { aliases: ["HD 101065"], subtitle: "Peculiar star with unusual elements" }),
  // ---- More exoplanet hosts
  neb("hr-8799", "HR 8799", "HR 8799", "HR_8799", "st-exohosts", 45, { region: NB, exoplanetHost: "HR 8799", subtitle: "Star with four directly imaged planets" }),
  neb("beta-pictoris", "Beta Pictoris", "* bet Pic", "Beta_Pictoris", "st-exohosts", 40, { region: NB, exoplanetHost: "bet Pic", subtitle: "Young star with a debris disc and imaged planets" }),
  neb("55-cancri", "55 Cancri", "* rho01 Cnc", "55_Cancri", "st-exohosts", 35, { region: NB, exoplanetHost: "55 Cnc", tags: ["st-multiple"], subtitle: "Binary star with five planets" }),
  neb("wasp-12", "WASP-12", "WASP-12", "WASP-12", "st-exohosts", 25, { exoplanetHost: "WASP-12", subtitle: "Host of a hot Jupiter spiralling inward" }),
  neb("wasp-39", "WASP-39", "WASP-39", "WASP-39", "st-exohosts", 25, { exoplanetHost: "WASP-39", subtitle: "Host of WASP-39b, Webb's first CO₂ detection" }),
  neb("kepler-16", "Kepler-16", "Kepler-16", "Kepler-16", "st-exohosts", 25, { exoplanetHost: "Kepler-16", tags: ["st-multiple"], subtitle: "Binary star with a circumbinary planet" }),
  neb("toi-700", "TOI-700", "TOI-700", "TOI-700", "st-exohosts", 30, { region: NB, exoplanetHost: "TOI-700", subtitle: "Red dwarf with Earth-size planets" }),
  neb("gj-1214", "GJ 1214", "GJ 1214", "Gliese_1214", "st-exohosts", 22, { region: NB, exoplanetHost: "GJ 1214", subtitle: "Host of the sub-Neptune GJ 1214 b" }),
  neb("kepler-90", "Kepler-90", "Kepler-90", "Kepler-90", "st-exohosts", 30, { exoplanetHost: "Kepler-90", subtitle: "Star with eight known planets" }),

  // ---- Andromeda: verified internal features (SIMBAD hierarchy, curated)
  { id: "ngc-206", name: "NGC 206", simbad: "NGC 206", wiki: "NGC_206", category: "cl-assoc", region: LOCAL, priority: 40, parent: "andromeda", relation: "feature", distance: HOST, subtitle: "Bright star cloud in Andromeda's disc" },
  { id: "mayall-ii", name: "Mayall II (G1)", aliases: ["G1", "Mayall II", "Andromeda's Cluster"], simbad: "NAME Mayall II", wiki: "Mayall_II", category: "cl-globular", region: LOCAL, priority: 45, parent: "andromeda", relation: "member", distance: HOST, subtitle: "Massive globular cluster in Andromeda's halo" },
  { id: "s-andromedae", name: "S Andromedae (SN 1885A)", aliases: ["SN 1885A", "S And"], simbad: "V* S And", wiki: "S_Andromedae", category: "cr-snr", region: LOCAL, priority: 35, type: "supernova-remnant", parent: "andromeda", relation: "feature", distance: HOST, subtitle: "First supernova seen in another galaxy (1885)" },
  { id: "m31-rv", name: "M31-RV", aliases: ["M31 RV", "Red Variable of 1988"], simbad: "NAME M31 RV", wiki: "M31-RV", category: "st-stars", region: LOCAL, priority: 25, parent: "andromeda", relation: "feature", distance: HOST, subtitle: "Luminous red nova of 1988 in Andromeda's bulge" },
  { id: "m31n-2008-12a", name: "M31N 2008-12a", aliases: ["Yearly recurrent nova"], simbad: "M31N 2008-12a", wiki: "M31N_2008-12a", category: "cr-white-dwarfs", region: LOCAL, priority: 30, type: "white-dwarf", parent: "andromeda", relation: "feature", distance: HOST, subtitle: "Recurrent nova erupting about once a year" },
  { id: "ae-andromedae", name: "AE Andromedae", simbad: "V* AE And", wiki: "AE_Andromedae", category: "st-stars", region: LOCAL, priority: 22, parent: "andromeda", relation: "member", distance: HOST, subtitle: "Luminous blue variable star in Andromeda" },
  { id: "af-andromedae", name: "AF Andromedae", simbad: "V* AF And", wiki: "AF_Andromedae", category: "st-stars", region: LOCAL, priority: 20, parent: "andromeda", relation: "member", distance: HOST, subtitle: "Luminous blue variable star in Andromeda" },
  { id: "bol-225", name: "Bol 225", aliases: ["G280", "B225-G280"], simbad: "Bol 225", wiki: "", category: "cl-globular", region: LOCAL, priority: 15, parent: "andromeda", relation: "member", distance: HOST, subtitle: "Globular cluster of Andromeda" },
  { id: "bol-158", name: "Bol 158", aliases: ["G213", "B158-G213"], simbad: "Bol 158", wiki: "", category: "cl-globular", region: LOCAL, priority: 14, parent: "andromeda", relation: "member", distance: HOST, subtitle: "Globular cluster of Andromeda" },
  { id: "bol-45", name: "Bol 45", aliases: ["G108", "B045-G108"], simbad: "Bol 45", wiki: "", category: "cl-globular", region: LOCAL, priority: 13, parent: "andromeda", relation: "member", distance: HOST, subtitle: "Globular cluster of Andromeda" },
  { id: "bol-23", name: "Bol 23", aliases: ["G78", "B023-G078"], simbad: "Bol 23", wiki: "", category: "cl-globular", region: LOCAL, priority: 13, parent: "andromeda", relation: "member", distance: HOST, subtitle: "Globular cluster of Andromeda" },
  { id: "bol-386", name: "Bol 386", aliases: ["G322", "B386-G322"], simbad: "Bol 386", wiki: "", category: "cl-globular", region: LOCAL, priority: 12, parent: "andromeda", relation: "member", distance: HOST, subtitle: "Globular cluster of Andromeda" },
  { id: "bol-6", name: "Bol 6", aliases: ["G58", "B006-G058"], simbad: "Bol   6", wiki: "", category: "cl-globular", region: LOCAL, priority: 12, parent: "andromeda", relation: "member", distance: HOST, subtitle: "Globular cluster of Andromeda" },
  { id: "bol-37", name: "Bol 37", aliases: ["B037-V327"], simbad: "Bol  37", wiki: "", category: "cl-globular", region: LOCAL, priority: 14, parent: "andromeda", relation: "member", distance: HOST, subtitle: "Globular cluster of Andromeda" },
  // Triangulum and Magellanic Cloud features
  { id: "ngc-604", name: "NGC 604", simbad: "NGC 604", wiki: "NGC_604", category: "nb-emission", region: LOCAL, priority: 35, parent: "triangulum", relation: "feature", distance: HOST, subtitle: "Giant H II region in the Triangulum Galaxy" },
  { id: "n11", name: "N11", aliases: ["LHA 120-N 11", "Bean Nebula"], simbad: "LHA 120-N 11", wiki: "N11_(emission_nebula)", category: "nb-emission", region: LOCAL, priority: 25, parent: "lmc", relation: "feature", distance: HOST, subtitle: "Star-forming complex in the Large Magellanic Cloud" },
  { id: "ngc-346", name: "NGC 346", simbad: "NGC 346", wiki: "NGC_346", category: "cl-open", region: LOCAL, priority: 30, parent: "smc", relation: "feature", distance: HOST, subtitle: "Star-forming cluster in the Small Magellanic Cloud" },
];

/** Exoplanets to mark as featured highlights (others from curated hosts are explorable records). */
export const NOTABLE_EXOPLANETS = [
  "Proxima Cen b", "TRAPPIST-1 e", "TRAPPIST-1 f", "TRAPPIST-1 d", "51 Peg b", "HD 209458 b", "HD 189733 b", "K2-18 b", "Kepler-452 b",
  "Kepler-186 f", "Kepler-22 b", "LHS 1140 b", "WASP-39 b", "WASP-12 b", "55 Cnc e", "HR 8799 b", "bet Pic b", "Kepler-16 b", "TOI-700 d", "GJ 1214 b",
  "PSR B1257+12 c", "Teegarden's Star b", "Ross 128 b", "eps Eri b", "WD 1856+534 b", "Barnard b",
];

// ---------------------------------------------------------------- Missions and vehicles (content cards)
export interface MissionSpec {
  id: string;
  name: string;
  aliases?: string[];
  wiki: string;
  category: "sc-probes" | "sc-telescopes" | "sc-human" | "sc-spacex";
  parent?: string;
  operator: string;
  status: "active" | "retired" | "historic" | "in-development" | "plan";
  statusNote?: string;
  destinations?: string[];
  subtitle: string;
  priority: number;
  /** Dated facts; each is attributed to the object's Wikipedia article. */
  facts: [string, string][];
  /** Why there is no map position. */
  noPosition: string;
  image?: string | null;
  tags?: string[];
}

export const MISSIONS: MissionSpec[] = [
  // SpaceX
  { id: "falcon-9", name: "Falcon 9", wiki: "Falcon_9", category: "sc-spacex", operator: "SpaceX", status: "active", subtitle: "Partially reusable orbital rocket", priority: 60, destinations: ["earth"],
    facts: [["First flight", "4 June 2010"], ["Reuse", "First stage lands for reuse"], ["Role", "Crew, cargo and satellite launches"]], noPosition: "A launch vehicle class, not one object in space with a trajectory." },
  { id: "falcon-heavy", name: "Falcon Heavy", wiki: "Falcon_Heavy", category: "sc-spacex", operator: "SpaceX", status: "active", subtitle: "Heavy-lift rocket built from three Falcon 9 cores", priority: 55, destinations: ["earth", "tesla-roadster"],
    facts: [["First flight", "6 February 2018"], ["First payload", "Tesla Roadster (test mass)"], ["Configuration", "Three first-stage cores"]], noPosition: "A launch vehicle class, not one object in space with a trajectory." },
  { id: "dragon", name: "Dragon", aliases: ["Crew Dragon", "Dragon 2", "Cargo Dragon"], wiki: "SpaceX_Dragon_2", category: "sc-spacex", operator: "SpaceX", status: "active", subtitle: "Crew and cargo spacecraft serving the ISS", priority: 55, destinations: ["earth", "iss"], tags: ["sc-human"],
    facts: [["First crewed flight", "30 May 2020 (Demo-2)"], ["Destination", "International Space Station"], ["Recovery", "Splashes down under parachutes"]], noPosition: "Individual capsules fly short missions in low Earth orbit; there is no single ephemeris for the vehicle class." },
  { id: "starship", name: "Starship", aliases: ["Super Heavy"], wiki: "SpaceX_Starship", category: "sc-spacex", operator: "SpaceX", status: "in-development", statusNote: "Flight-test programme; status per sources available in 2025.", subtitle: "Fully reusable super heavy-lift vehicle in development", priority: 60, destinations: ["earth", "moon", "mars"],
    facts: [["First integrated flight test", "20 April 2023"], ["First booster catch", "13 October 2024 (Flight 5)"], ["Stated goals", "Lunar landings and Mars transport"]], noPosition: "A vehicle in flight testing; no Starship has a long-term trajectory in space." },
  { id: "demo-2", name: "Crew Dragon Demo-2", aliases: ["Demo-2", "DM-2"], wiki: "Crew_Dragon_Demo-2", category: "sc-spacex", operator: "SpaceX / NASA", status: "historic", subtitle: "First crewed orbital flight by a private spacecraft", priority: 45, destinations: ["iss"], tags: ["sc-human"],
    facts: [["Launch", "30 May 2020"], ["Crew", "Doug Hurley, Bob Behnken"], ["Milestone", "First crewed orbital launch from the US since 2011"]], noPosition: "A completed mission, so there is no current trajectory to route to." },
  { id: "inspiration4", name: "Inspiration4", wiki: "Inspiration4", category: "sc-spacex", operator: "SpaceX", status: "historic", subtitle: "First all-civilian orbital spaceflight", priority: 40, destinations: ["earth"], tags: ["sc-human"],
    facts: [["Launch", "16 September 2021 (UTC)"], ["Crew", "Four private citizens"], ["Duration", "About three days in orbit"]], noPosition: "A completed mission, so there is no current trajectory to route to." },
  { id: "polaris-dawn", name: "Polaris Dawn", wiki: "Polaris_Dawn", category: "sc-spacex", operator: "SpaceX", status: "historic", subtitle: "First commercial spacewalk", priority: 40, destinations: ["earth"], tags: ["sc-human"],
    facts: [["Launch", "10 September 2024"], ["Spacewalk", "12 September 2024"], ["Orbit", "Highest crewed Earth orbit since Apollo"]], noPosition: "A completed mission, so there is no current trajectory to route to." },
  // Human spaceflight and NASA/ESA missions without heliocentric ephemerides here
  { id: "iss", name: "International Space Station", aliases: ["ISS"], wiki: "International_Space_Station", category: "sc-human", parent: "earth", operator: "NASA, Roscosmos, ESA, JAXA, CSA", status: "active", subtitle: "Crewed laboratory in low Earth orbit", priority: 70, destinations: ["earth"],
    facts: [["Orbit", "Low Earth orbit, about 400 km up"], ["Continuously crewed since", "2 November 2000"], ["Orbital period", "About 93 minutes"]], noPosition: "The ISS circles Earth every ~93 minutes; at map scale it sits on top of Earth, so it is not drawn as a separate point." },
  { id: "apollo-11", name: "Apollo 11", wiki: "Apollo_11", category: "sc-human", parent: "moon", operator: "NASA", status: "historic", subtitle: "First crewed Moon landing", priority: 60, destinations: ["moon"],
    facts: [["Landing", "20 July 1969"], ["Crew", "Neil Armstrong, Buzz Aldrin, Michael Collins"], ["Landing site", "Mare Tranquillitatis"]], noPosition: "A completed mission, so there is no current trajectory to route to." },
  { id: "hubble", name: "Hubble Space Telescope", aliases: ["HST", "Hubble"], wiki: "Hubble_Space_Telescope", category: "sc-telescopes", parent: "earth", operator: "NASA / ESA", status: "active", subtitle: "Space telescope in low Earth orbit since 1990", priority: 60, destinations: ["earth"],
    facts: [["Launch", "24 April 1990"], ["Orbit", "Low Earth orbit"], ["Mirror", "2.4 m primary mirror"]], noPosition: "Hubble orbits Earth every ~95 minutes, too close to draw apart from Earth at map scale." },
  { id: "chandra", name: "Chandra X-ray Observatory", aliases: ["Chandra"], wiki: "Chandra_X-ray_Observatory", category: "sc-telescopes", parent: "earth", operator: "NASA", status: "active", subtitle: "X-ray space telescope", priority: 35, destinations: ["earth"],
    facts: [["Launch", "23 July 1999"], ["Band", "X-rays"], ["Orbit", "Highly elliptical Earth orbit"]], noPosition: "An Earth-orbiting telescope; not drawn apart from Earth at map scale." },
  { id: "perseverance", name: "Perseverance rover", aliases: ["Perseverance", "Mars 2020"], wiki: "Perseverance_(rover)", category: "sc-probes", parent: "mars", operator: "NASA / JPL", status: "active", subtitle: "Mars rover exploring Jezero Crater", priority: 55, destinations: ["mars"],
    facts: [["Landing", "18 February 2021"], ["Site", "Jezero Crater"], ["Companion", "Ingenuity helicopter (flights ended 2024)"]], noPosition: "On the surface of Mars; focus Mars to visit." },
  { id: "curiosity", name: "Curiosity rover", aliases: ["Curiosity", "Mars Science Laboratory"], wiki: "Curiosity_(rover)", category: "sc-probes", parent: "mars", operator: "NASA / JPL", status: "active", subtitle: "Mars rover climbing Mount Sharp", priority: 45, destinations: ["mars"],
    facts: [["Landing", "6 August 2012"], ["Site", "Gale Crater"], ["Power", "Radioisotope generator"]], noPosition: "On the surface of Mars; focus Mars to visit." },
  { id: "cassini", name: "Cassini–Huygens", aliases: ["Cassini"], wiki: "Cassini–Huygens", category: "sc-probes", parent: "saturn", operator: "NASA / ESA / ASI", status: "historic", subtitle: "Saturn orbiter (1997–2017)", priority: 45, destinations: ["saturn", "titan", "enceladus"],
    facts: [["Arrival at Saturn", "2004"], ["Huygens landing on Titan", "14 January 2005"], ["Mission end", "15 September 2017"]], noPosition: "Mission ended with a plunge into Saturn in 2017." },
  { id: "rosetta", name: "Rosetta", wiki: "Rosetta_(spacecraft)", category: "sc-probes", parent: "67p", operator: "ESA", status: "historic", subtitle: "Comet orbiter and Philae lander", priority: 35, destinations: ["67p"],
    facts: [["Arrival at 67P", "6 August 2014"], ["Philae landing", "12 November 2014"], ["Mission end", "30 September 2016"]], noPosition: "Mission ended on the comet's surface in 2016." },
  { id: "dawn", name: "Dawn", wiki: "Dawn_(spacecraft)", category: "sc-probes", parent: "ceres", operator: "NASA / JPL", status: "retired", subtitle: "Orbited Vesta and Ceres", priority: 30, destinations: ["vesta", "ceres"],
    facts: [["Vesta orbit", "2011–2012"], ["Ceres orbit", "From 2015"], ["Mission end", "2018 (inactive in Ceres orbit)"]], noPosition: "Inactive in orbit around Ceres." },
];
