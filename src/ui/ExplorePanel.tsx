import { useMemo } from "react";
import { useStore } from "../state/store";
import type { CatalogObject } from "../lib/types";
import { TYPE_LABEL, browse } from "../lib/search";
import { CATEGORY_TREE, findNode, inCategory } from "../lib/taxonomy";
import { ObjectIcon } from "./ObjectIcon";
import { ChevronRightIcon, CloseIcon, BackIcon } from "./icons";
import { focusObject, exploreInside, goRegion } from "../state/actions";
import { distanceLabel, locationOf } from "./describe";

function PlaceRow({ o }: { o: CatalogObject }) {
  const data = useStore((s) => s.data)!;
  return (
    <li>
      <button type="button" className="place-row" onClick={() => { focusObject(o.id); useStore.getState().setPanel("place"); }}>
        <ObjectIcon obj={o} size={48} />
        <span className="place-row-text">
          <span className="place-row-name">{o.name}</span>
          <span className="place-row-sub">{TYPE_LABEL[o.type]} · {locationOf(data, o)}</span>
        </span>
        <span className="place-row-dist">{distanceLabel(o)}</span>
      </button>
    </li>
  );
}

function Journeys() {
  const data = useStore((s) => s.data)!;
  const setMode = useStore((s) => s.setMode);
  const setRouteModel = useStore((s) => s.setRouteModel);
  const img = (id: string) => data.byId.get(id)?.image;
  const trip = (stops: string[], mode: string) => {
    setMode(mode);
    setRouteModel("auto");
    useStore.setState({ stops, progress: 0, playing: false });
    useStore.getState().setPanel("directions");
    useStore.getState().requestFit();
  };
  const cards = [
    { id: "mars", title: "Earth → Mars", sub: "Orbital transfer · about 259 days", go: () => trip(["earth", "mars"], "light") },
    { id: "proxima-centauri", title: "Earth → Proxima Centauri", sub: "At Voyager 1's speed", go: () => trip(["earth", "proxima-centauri"], "voyager-1") },
    { id: "andromeda", title: "Inside Andromeda", sub: "Clusters, nucleus and companions", go: () => { goRegion("andromeda"); exploreInside("andromeda"); } },
    { id: "polaris", title: "Star tour at light speed", sub: "Sirius, Vega, Polaris", go: () => trip(["earth", "sirius", "vega", "polaris"], "light") },
  ].filter((c) => data.byId.has(c.id));
  return (
    <section aria-labelledby="trips-h">
      <h2 id="trips-h" className="section-title">Journeys</h2>
      <div className="journey-grid">
        {cards.map((c) => {
          const im = img(c.id);
          return (
            <button key={c.title} type="button" className="journey-card" onClick={c.go}>
              {im ? <img src={im.thumb ?? im.src} alt="" loading="lazy" /> : <span className="journey-ph" />}
              <span className="journey-text">
                <strong>{c.title}</strong>
                <small>{c.sub}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PhotoGrid({ items, title, id }: { items: CatalogObject[]; title: string; id: string }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="section-title">{title}</h2>
      <ul className="photo-grid">
        {items.map((o) => (
          <li key={o.id}>
            <button type="button" className="photo-card" onClick={() => { focusObject(o.id); useStore.getState().setPanel("place"); }}>
              <img src={o.image!.thumb ?? o.image!.src} alt={o.image!.alt ?? ""} loading="lazy" />
              <span className="photo-label">
                <strong>{o.name}</strong>
                <small>{TYPE_LABEL[o.type]}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InsideView({ id }: { id: string }) {
  const data = useStore((s) => s.data)!;
  const setInside = useStore((s) => s.setInside);
  const obj = data.byId.get(id);
  const groups = useMemo(() => {
    const kids = data.catalog.objects.filter((o) => o.parentId === id && o.type !== "mission");
    const label = (o: CatalogObject) =>
      o.relation === "satellite" ? "Companion galaxies" : o.relation === "nucleus" ? "Nucleus" : o.type === "exoplanet" ? "Planets" : o.type === "moon" ? "Moons" : o.relation === "member" ? "Members" : "Features and clusters";
    const m = new Map<string, CatalogObject[]>();
    for (const k of kids) m.set(label(k), [...(m.get(label(k)) ?? []), k]);
    for (const v of m.values()) v.sort((a, b) => Number(!!b.image) - Number(!!a.image) || b.display.priority - a.display.priority);
    return [...m.entries()];
  }, [data, id]);
  if (!obj) return null;
  // Breadcrumb from the universe down through parents.
  const chain: CatalogObject[] = [];
  for (let p: CatalogObject | undefined = obj; p; p = p.parentId ? data.byId.get(p.parentId) : undefined) chain.unshift(p);
  const regionCrumb = obj.region === "local-group" ? "Local Group" : obj.region === "local-volume" ? "Nearby galaxies" : obj.region === "solar-system" ? "Solar System" : obj.region === "milky-way" ? "Milky Way" : "Universe";
  return (
    <div className="panel explore inside">
      <nav className="breadcrumbs" aria-label="Location">
        <button type="button" className="icon-btn small" aria-label="Back" onClick={() => setInside(chain.length > 1 ? chain[chain.length - 2].id : null)}>
          <BackIcon size={16} />
        </button>
        <button type="button" className="crumb" onClick={() => { setInside(null); goRegion("universe"); }}>Universe</button>
        <span className="crumb-sep">›</span>
        <span className="crumb">{regionCrumb}</span>
        {chain.map((c) => (
          <span key={c.id} className="crumb-sep">› <button type="button" className={`crumb ${c.id === id ? "crumb-cur" : ""}`} onClick={() => (c.id === id ? focusObject(c.id) : exploreInside(c.id))}>{c.name}</button></span>
        ))}
      </nav>
      <button type="button" className="inside-head" onClick={() => { focusObject(id); useStore.getState().setPanel("place"); }}>
        <ObjectIcon obj={obj} size={56} />
        <span className="inside-text">
          <strong>{obj.name}</strong>
          <small>{TYPE_LABEL[obj.type]} · open card</small>
        </span>
        <ChevronRightIcon />
      </button>
      {groups.length === 0 && <p className="empty">No catalogued objects inside {obj.name} yet.</p>}
      {groups.map(([label, items]) => (
        <section key={label} aria-label={label}>
          <h2 className="section-title">{label} <span className="muted">({items.length})</span></h2>
          <ul className="place-list">{items.map((o) => <PlaceRow key={o.id} o={o} />)}</ul>
        </section>
      ))}
      {obj.type === "galaxy" && <p className="muted small">Features are placed at {obj.name}'s distance; their depth within the galaxy is not measured, so no routes are offered between them.</p>}
    </div>
  );
}

export function ExplorePanel() {
  const data = useStore((s) => s.data);
  const inside = useStore((s) => s.inside);
  const category = useStore((s) => s.categoryFilter);
  const setCategory = useStore((s) => s.setCategoryFilter);

  const highlights = useMemo(() => (data ? data.catalog.objects.filter((o) => o.highlight && o.image && !o.mission && !o.type.startsWith("space")).sort((a, b) => b.display.priority - a.display.priority).slice(0, 12) : []), [data]);
  const spaceflight = useMemo(() => (data ? data.catalog.objects.filter((o) => o.image && (inCategory(o, "sc-spacex") || inCategory(o, "sc-human"))).sort((a, b) => b.display.priority - a.display.priority).slice(0, 8) : []), [data]);
  const counts = useMemo(() => new Map(CATEGORY_TREE.map((t) => [t.id, data ? data.catalog.objects.filter((o) => inCategory(o, t.id)).length : 0])), [data]);
  const results = useMemo(() => (data && category ? browse(data.search, category).slice(0, 80) : []), [data, category]);
  if (!data) return null;
  if (inside && data.byId.has(inside)) return <InsideView id={inside} />;

  if (category) {
    const node = findNode(category);
    const total = counts.get(category) ?? data.catalog.objects.filter((o) => inCategory(o, category)).length;
    return (
      <div className="panel explore">
        <div className="category-head">
          <h2 className="section-title">{node?.label} <span className="muted">({total})</span></h2>
          <button type="button" className="text-btn" onClick={() => setCategory(null)}>
            <CloseIcon size={16} /> Clear filter
          </button>
        </div>
        <p className="muted small">Matching markers are emphasized on the map; the selected object and any route stay visible.</p>
        {results.length ? <ul className="place-list">{results.map((o) => <PlaceRow key={o.id} o={o} />)}</ul> : <p className="empty">No {node?.label.toLowerCase()} in the GalaxyMaps catalog yet.</p>}
        {total > results.length && <p className="muted small">Showing the first {results.length}; type in the search box to narrow down.</p>}
      </div>
    );
  }

  return (
    <div className="panel explore">
      <Journeys />
      <PhotoGrid items={highlights} title="Highlights" id="hl-h" />
      <PhotoGrid items={spaceflight} title="SpaceX & human spaceflight" id="sx-h" />
      <section aria-labelledby="cat-h">
        <h2 id="cat-h" className="section-title">Browse</h2>
        <ul className="category-list">
          {CATEGORY_TREE.map((t) => (
            <li key={t.id}>
              <button type="button" className="category-row" onClick={() => setCategory(t.id)} disabled={!counts.get(t.id)}>
                <span>
                  <strong>{t.label}</strong>
                  <small>{t.hint}</small>
                </span>
                <span className="node-count">{counts.get(t.id) || "none yet"}</span>
                <ChevronRightIcon size={18} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
