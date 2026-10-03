import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { getEngine } from "../map/engineRef";
import type { CatalogObject } from "../lib/types";
import { formatDistance } from "../lib/format";
import { ObjectIcon } from "./ObjectIcon";
import { LightIcon, OrbitIcon, PinIcon, RocketIcon } from "./icons";

const CATEGORIES: { id: string; label: string; test(o: CatalogObject): boolean }[] = [
  { id: "planets", label: "Planets", test: (o) => o.type === "planet" || o.type === "dwarf-planet" },
  { id: "moons", label: "Moons", test: (o) => o.type === "moon" },
  { id: "small", label: "Asteroids & comets", test: (o) => o.type === "asteroid" || o.type === "comet" },
  { id: "spacecraft", label: "Spacecraft", test: (o) => o.type === "spacecraft" },
  { id: "nearby", label: "Nearby stars", test: (o) => o.type === "star" && o.region === "stellar-neighborhood" && !o.exoplanets?.count && o.id !== "sun" },
  { id: "exo", label: "Exoplanet hosts", test: (o) => !!o.exoplanets?.count },
  { id: "deep", label: "Bright & giant stars", test: (o) => o.type === "star" && o.region === "milky-way" },
  { id: "nebula", label: "Nebulae & clusters", test: (o) => o.type === "nebula" || o.type === "star-cluster" || o.type === "black-hole" },
  { id: "galaxy", label: "Galaxies", test: (o) => o.type === "galaxy" || o.type === "quasar" },
];

export function ExplorePanel() {
  const data = useStore((s) => s.data);
  const select = useStore((s) => s.select);
  const setPanel = useStore((s) => s.setPanel);
  const setMode = useStore((s) => s.setMode);
  const [cat, setCat] = useState("planets");

  const items = useMemo(() => {
    if (!data) return [];
    const c = CATEGORIES.find((x) => x.id === cat)!;
    return data.catalog.objects
      .filter((o) => o.featured && c.test(o))
      .sort((a, b) => (a.distance?.valueKm ?? 0) - (b.distance?.valueKm ?? 0));
  }, [data, cat]);

  const trip = (stops: string[], mode: string) => {
    setMode(mode);
    useStore.setState({ stops, progress: 0, playing: false });
    setPanel("directions");
    useStore.getState().requestFit();
  };

  return (
    <div className="panel explore">
      <section className="explore-hero">
        <h1>Explore the universe</h1>
        <p>Search any planet, star or galaxy, then get directions like you would across town.</p>
      </section>

      <section aria-labelledby="trips-h">
        <h2 id="trips-h" className="section-title">Try a trip</h2>
        <div className="trip-grid">
          <button type="button" className="trip-card" onClick={() => trip(["earth", "polaris"], "light")}>
            <LightIcon size={22} />
            <span>
              <strong>Earth → Polaris</strong>
              <small>At the speed of light</small>
            </span>
          </button>
          <button type="button" className="trip-card" onClick={() => trip(["earth", "proxima-centauri"], "voyager-1-speed")}>
            <RocketIcon size={22} />
            <span>
              <strong>Earth → Proxima Centauri</strong>
              <small>At Voyager 1's speed</small>
            </span>
          </button>
          <button type="button" className="trip-card" onClick={() => trip(["earth", "sirius", "vega", "polaris"], "light")}>
            <PinIcon size={22} />
            <span>
              <strong>Multi-stop star tour</strong>
              <small>Sirius, Vega, Polaris</small>
            </span>
          </button>
          <button type="button" className="trip-card" onClick={() => setPanel("transfer")}>
            <OrbitIcon size={22} />
            <span>
              <strong>Why not straight to Mars?</strong>
              <small>Idealized orbital transfer</small>
            </span>
          </button>
        </div>
      </section>

      <section aria-labelledby="cat-h">
        <h2 id="cat-h" className="section-title">Destinations</h2>
        <div className="chip-row wrap" role="tablist" aria-label="Destination categories">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} className={`chip ${cat === c.id ? "selected" : ""}`} onClick={() => setCat(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <ul className="place-list">
          {items.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="place-row"
                onClick={() => {
                  select(o.id);
                  setPanel("place");
                  getEngine()?.flyToObject(o.id);
                }}
              >
                {o.image ? <img src={o.image.src} alt="" loading="lazy" className="thumb" /> : <ObjectIcon obj={o} size={44} />}
                <span className="place-row-text">
                  <span className="place-row-name">{o.name}</span>
                  <span className="place-row-sub">{o.subtitle}</span>
                </span>
                <span className="place-row-dist">{o.distance && o.id !== "sun" ? formatDistance(o.distance.valueKm) : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
