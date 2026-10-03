import type { RouteCapability } from "./types";

/**
 * HYG distances come from Hipparcos parallaxes but HYG does not tabulate their errors.
 * Typical Hipparcos parallax errors are ~1 mas, so we only route to HYG-only stars
 * within 100 pc (parallax ≥ 10 mas, i.e. roughly ≤ 10% error).
 */
export const HYG_ROUTE_LIMIT_PC = 100;

export function hygRouteCapability(distPc: number): RouteCapability {
  if (!(distPc > 0) || distPc >= 100_000) return { supported: false, reason: "This star has no usable parallax in the HYG catalog, so its distance is unknown." };
  if (distPc <= HYG_ROUTE_LIMIT_PC)
    return { supported: true, quality: "approximate", note: "Hipparcos-based distance from HYG v4.4; uncertainty not tabulated (typically under 10% within 100 pc)." };
  return {
    supported: false,
    reason: `HYG lists ${Math.round(distPc)} pc, but beyond ${HYG_ROUTE_LIMIT_PC} pc a Hipparcos parallax without a stated error is too uncertain for a distance-based route.`,
  };
}

/** Effective temperature from B−V colour index (Ballesteros 2012, EPL 97, 34009). */
export function temperatureFromBV(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

/** Approximate sRGB colour of a blackbody at temperature T (K). Visual aid only. */
export function blackbodyRgb(tempK: number): [number, number, number] {
  const t = Math.min(Math.max(tempK, 1000), 40000) / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * (t - 60) ** -0.1332047592;
    g = 288.1221695283 * (t - 60) ** -0.0755148492;
    b = 255;
  }
  const c = (x: number) => Math.min(255, Math.max(0, x)) / 255;
  return [c(r), c(g), c(b)];
}

export function rgbToHex([r, g, b]: [number, number, number]) {
  const h = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

const CLASS_COLOR: Record<string, string> = {
  O: "Blue", B: "Blue-white", A: "White", F: "Yellow-white", G: "Yellow", K: "Orange", M: "Red", L: "Brown", T: "Brown", Y: "Brown",
};

/** Plain-language description of an MK spectral type, e.g. "F7Ib" → "Yellow-white supergiant". */
export function describeSpectralType(sp: string | undefined | null): string | null {
  if (!sp) return null;
  const s = sp.trim();
  if (/^D[ABOQZCX]/.test(s)) return "White dwarf";
  if (/^(sd|d)?M/.test(s) && /^(dM|M\d(\.\d)?V?e?$|M\d(\.\d)?\s*V)/.test(s.replace(/^sd/, ""))) return "Red dwarf";
  const m = s.match(/^(?:sd|d)?([OBAFGKMLTY])/);
  if (!m) return /LBV/.test(s) ? "Luminous blue variable" : null;
  const color = CLASS_COLOR[m[1]];
  const lum = s.match(/(Ia\+|0|Iab|Ia|Ib|III|II|IV|V|I)(?![a-z])/);
  const cls = lum?.[1];
  if (["L", "T", "Y"].includes(m[1])) return "Brown dwarf";
  if (!cls) return m[1] === "M" && /^dM/.test(s) ? "Red dwarf" : `${color} star`;
  if (cls === "V") return m[1] === "M" ? "Red dwarf" : m[1] === "K" ? "Orange dwarf" : `${color} main-sequence star`;
  if (cls === "IV") return `${color} subgiant`;
  if (cls === "III") return `${color} giant`;
  if (cls === "II") return `${color} bright giant`;
  if (cls === "0" || cls === "Ia+") return `${color} hypergiant`;
  return `${color} supergiant`;
}

export const CONSTELLATIONS: Record<string, string> = {
  And: "Andromeda", Ant: "Antlia", Aps: "Apus", Aqr: "Aquarius", Aql: "Aquila", Ara: "Ara", Ari: "Aries", Aur: "Auriga", Boo: "Boötes", Cae: "Caelum", Cam: "Camelopardalis", Cnc: "Cancer", CVn: "Canes Venatici", CMa: "Canis Major", CMi: "Canis Minor", Cap: "Capricornus", Car: "Carina", Cas: "Cassiopeia", Cen: "Centaurus", Cep: "Cepheus", Cet: "Cetus", Cha: "Chamaeleon", Cir: "Circinus", Col: "Columba", Com: "Coma Berenices", CrA: "Corona Australis", CrB: "Corona Borealis", Crv: "Corvus", Crt: "Crater", Cru: "Crux", Cyg: "Cygnus", Del: "Delphinus", Dor: "Dorado", Dra: "Draco", Equ: "Equuleus", Eri: "Eridanus", For: "Fornax", Gem: "Gemini", Gru: "Grus", Her: "Hercules", Hor: "Horologium", Hya: "Hydra", Hyi: "Hydrus", Ind: "Indus", Lac: "Lacerta", Leo: "Leo", LMi: "Leo Minor", Lep: "Lepus", Lib: "Libra", Lup: "Lupus", Lyn: "Lynx", Lyr: "Lyra", Men: "Mensa", Mic: "Microscopium", Mon: "Monoceros", Mus: "Musca", Nor: "Norma", Oct: "Octans", Oph: "Ophiuchus", Ori: "Orion", Pav: "Pavo", Peg: "Pegasus", Per: "Perseus", Phe: "Phoenix", Pic: "Pictor", Psc: "Pisces", PsA: "Piscis Austrinus", Pup: "Puppis", Pyx: "Pyxis", Ret: "Reticulum", Sge: "Sagitta", Sgr: "Sagittarius", Sco: "Scorpius", Scl: "Sculptor", Sct: "Scutum", Ser: "Serpens", Sex: "Sextans", Tau: "Taurus", Tel: "Telescopium", Tri: "Triangulum", TrA: "Triangulum Australe", Tuc: "Tucana", UMa: "Ursa Major", UMi: "Ursa Minor", Vel: "Vela", Vir: "Virgo", Vol: "Volans", Vul: "Vulpecula",
};

const GREEK: Record<string, string> = {
  Alp: "α", Bet: "β", Gam: "γ", Del: "δ", Eps: "ε", Zet: "ζ", Eta: "η", The: "θ", Iot: "ι", Kap: "κ", Lam: "λ", Mu: "μ", Nu: "ν", Xi: "ξ", Omi: "ο", Pi: "π", Rho: "ρ", Sig: "σ", Tau: "τ", Ups: "υ", Phi: "φ", Chi: "χ", Psi: "ψ", Ome: "ω",
};

/** Human label for an HYG row: proper name, Bayer/Flamsteed, or catalog number. */
export function hygLabel(row: { proper?: string; bayer?: string; flam?: string; con?: string; hip?: number; gl?: string; hd?: number; id: number }): string {
  if (row.proper) return row.proper;
  if (row.bayer && row.con) return `${GREEK[row.bayer.replace(/\d+$/, "")] ?? row.bayer}${row.bayer.match(/\d+$/)?.[0] ?? ""} ${row.con}`;
  if (row.flam && row.con) return `${row.flam} ${row.con}`;
  if (row.hip) return `HIP ${row.hip}`;
  if (row.gl) return row.gl;
  if (row.hd) return `HD ${row.hd}`;
  return `HYG ${row.id}`;
}
