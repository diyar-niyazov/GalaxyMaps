import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import type { CatalogObject } from "../lib/types";
import { browse } from "../lib/search";
import { CATEGORY_TREE, findNode, inCategory } from "../lib/taxonomy";
import { ObjectIcon } from "./ObjectIcon";
import { ChevronRightIcon, CloseIcon, DirectionsIcon } from "./icons";
import { focusObject } from "../state/actions";
import { groupChildren, placedAtHostDistance } from "../lib/hierarchy";
import { Breadcrumbs } from "./Breadcrumbs";
import { distanceLabel, locationOf, typeLabel } from "./describe";
import { Img } from "./Gallery";
import { DiscoveryPrompt, GuidedTours, MissionStoryCard } from "./DiscoveryPanel";
import { ComparisonPresets } from "./ComparisonPanel";
import { LibraryPanel } from "./LibraryPanel";
import { modesFor, routeFor } from "../state/selectors";
import { formatDuration } from "../lib/format";
import { JOURNEYS, startJourney } from "../state/travel";
import "./explore.css";

function PlaceRow({ o }: { o: CatalogObject }) {
  const data = useStore((s) => s.data)!;
  return (
    <li>
      <button type="button" className="place-row" onClick={() => { focusObject(o.id); useStore.getState().setPanel("place"); }}>
        <ObjectIcon obj={o} size={48} />
        <span className="place-row-text">
          <span className="place-row-name">{o.name}</span>
          <span className="place-row-sub">{typeLabel(o)} · {locationOf(data, o)}</span>
        </span>
        <span className="place-row-dist">{distanceLabel(o)}</span>
      </button>
    </li>
  );
}

function Journeys() {
  const data = useStore((s) => s.data)!;
  const jd = useStore((s) => s.jd);
  const cards = useMemo(() => JOURNEYS.filter((j) => j.stops.every((s) => data.byId.has(s))).map((j) => {
    const mode = modesFor(data).find((m) => m.id === j.mode) ?? modesFor(data)[0];
    const route = routeFor(data, [...j.stops], mode, jd, "auto");
    const ok = route?.ok ? route : null;
    const model = !ok ? "Route unavailable" : ok.kind === "orbital-transfer" ? "Idealized orbital transfer · physically modeled" : `Straight line at ${mode.label} · constant-speed benchmark`;
    return { ...j, dest: data.byId.get(j.stops[j.stops.length - 1])!, duration: ok ? formatDuration(ok.modeledSeconds) : null, model, via: j.stops.length > 2 ? j.stops.slice(1, -1).map((s) => data.byId.get(s)!.name).join(", ") : null };
  }), [data, jd]);
  return (
    <section aria-labelledby="trips-h" className="explore-section">
      <h2 id="trips-h" className="section-title">Journeys</h2>
      <ul className="journey-list">
        {cards.map((c) => (
          <li key={c.id}>
            <button type="button" className="journey-card" onClick={() => startJourney(c.id)} aria-label={`Start journey: ${c.title}${c.via ? `, via ${c.via}` : ""}. ${c.model}.${c.duration ? ` ${c.duration}.` : ""}`}>
              <span className="journey-thumb">{c.dest.image ? <Img image={{ ...c.dest.image, src: c.dest.image.thumb ?? c.dest.image.src }} variant="card" placeholder={<ObjectIcon obj={c.dest} size={36} />} /> : <ObjectIcon obj={c.dest} size={36} />}</span>
              <span className="journey-text">
                <span className="journey-route" aria-hidden="true"><i className="journey-dot origin" /><i className="journey-line" /><i className="journey-dot dest" /></span>
                <strong>{c.title}</strong>
                {c.via && <small>via {c.via}</small>}
                <small className="journey-model">{c.model}</small>
              </span>
              <span className="journey-go">{c.duration && <b>{c.duration}</b>}<span className="journey-start"><DirectionsIcon size={15} /> Start</span></span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const FEATURED_FIRST = ["earth", "saturn", "jupiter", "orion-nebula", "milky-way", "andromeda"];

function FeaturedDestinations() {
  const data = useStore((s) => s.data)!;
  const selectedId = useStore((s) => s.selectedId);
  const [all, setAll] = useState(false);
  const items = useMemo(() => {
    const first = FEATURED_FIRST.map((id) => data.byId.get(id)).filter((o): o is CatalogObject => !!o?.image);
    const rest = data.catalog.objects.filter((o) => o.highlight && o.image && !o.mission && !o.type.startsWith("space") && !FEATURED_FIRST.includes(o.id)).sort((a, b) => b.display.priority - a.display.priority).slice(0, 12);
    return { first, rest };
  }, [data]);
  const shown = all ? [...items.first, ...items.rest] : items.first;
  return (
    <section aria-labelledby="hl-h" className="explore-section">
      <div className="section-head"><h2 id="hl-h" className="section-title">Featured destinations</h2>
        {items.rest.length > 0 && <button type="button" className="text-btn" aria-expanded={all} aria-controls="featured-grid" onClick={() => setAll(!all)}>{all ? "Show less" : "Show all"}</button>}
      </div>
      <ul className="photo-grid" id="featured-grid">
        {shown.map((o) => (
          <li key={o.id}>
            <button type="button" className={`photo-card ${selectedId === o.id ? "is-selected" : ""}`} aria-current={selectedId === o.id ? "true" : undefined} onClick={() => { focusObject(o.id); useStore.getState().setPanel("place"); }}>
              <Img image={{ ...o.image!, src: o.image!.thumb ?? o.image!.src }} variant="card" placeholder={<ObjectIcon obj={o} size={44} />} />
              <span className="photo-label">
                <strong>{o.name}</strong>
                <small>{typeLabel(o)}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const SPACEFLIGHT_FIRST = ["falcon-9", "starship", "dragon", "iss"];

function Spaceflight() {
  const data = useStore((s) => s.data)!;
  const [all, setAll] = useState(false);
  const { first, rest } = useMemo(() => {
    const pool = data.catalog.objects.filter((o) => o.id !== "demo-2" && (inCategory(o, "sc-spacex") || inCategory(o, "sc-human")));
    const first = SPACEFLIGHT_FIRST.map((id) => data.byId.get(id)).filter((o): o is CatalogObject => !!o);
    return { first, rest: pool.filter((o) => !SPACEFLIGHT_FIRST.includes(o.id)).sort((a, b) => b.display.priority - a.display.priority) };
  }, [data]);
  return (
    <section aria-labelledby="sx-h" className="explore-section">
      <h2 id="sx-h" className="section-title">SpaceX & human spaceflight</h2>
      <MissionStoryCard />
      <ul className="place-list compact">{(all ? [...first, ...rest] : first).map((o) => <PlaceRow key={o.id} o={o} />)}</ul>
      {rest.length > 0 && <button type="button" className="text-btn show-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show less" : `Show all (${first.length + rest.length})`}</button>}
    </section>
  );
}

function InsideView({ id }: { id: string }) {
  const data = useStore((s) => s.data)!;
  const obj = data.byId.get(id);
  const groups = useMemo(() => {
    const host = data.byId.get(id);
    if (!host) return [];
    return groupChildren(data.catalog.objects.filter((o) => o.parentId === id && o.type !== "mission"), host);
  }, [data, id]);
  if (!obj) return null;
  const hostPlaced = groups.some((g) => g.items.some(placedAtHostDistance));
  return (
    <div className="panel explore inside">
      <Breadcrumbs obj={obj} back currentAction={() => { focusObject(id); useStore.getState().setPanel("place"); }} />
      <button type="button" className="inside-head" onClick={() => { focusObject(id); useStore.getState().setPanel("place"); }}>
        <ObjectIcon obj={obj} size={56} />
        <span className="inside-text">
          <strong>{obj.name}</strong>
          <small>{typeLabel(obj)} · open card</small>
        </span>
        <ChevronRightIcon />
      </button>
      {hostPlaced && (
        <p className="callout subtle inside-note" role="note">
          Approximate placement: internal features use their measured sky position at {obj.name}'s distance. Their depth inside the galaxy is unknown, so no internal travel distances are offered.
        </p>
      )}
      {groups.length === 0 && <p className="empty">No catalogued objects inside {obj.name} yet.</p>}
      {groups.map(({ group, items }) => (
        <section key={group.id} aria-label={group.label}>
          <h2 className="section-title">{group.label} <span className="muted">({items.length})</span></h2>
          {group.note && <p className="muted small inside-group-note">{group.note}</p>}
          <ul className="place-list">{items.map((o) => <PlaceRow key={o.id} o={o} />)}</ul>
        </section>
      ))}
    </div>
  );
}

export function ExplorePanel() {
  const data = useStore((s) => s.data);
  const inside = useStore((s) => s.inside);
  const category = useStore((s) => s.categoryFilter);
  const setCategory = useStore((s) => s.setCategoryFilter);

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
      <DiscoveryPrompt />
      <FeaturedDestinations />
      <Journeys />
      <ComparisonPresets />
      <GuidedTours />
      <Spaceflight />
      <section aria-labelledby="cat-h" className="explore-section">
        <h2 id="cat-h" className="section-title">Browse all categories</h2>
        <ul className="category-list">
          {CATEGORY_TREE.filter((t) => counts.get(t.id)).map((t) => (
            <li key={t.id}>
              <button type="button" className="category-row" onClick={() => setCategory(t.id)}>
                <span className="category-icon" aria-hidden="true"><CategoryGlyph id={t.id} /></span>
                <span>
                  <strong>{t.label}</strong>
                  <small>{t.hint}</small>
                </span>
                <span className="node-count" aria-label={`${counts.get(t.id)} destinations`}>{counts.get(t.id)}</span>
                <ChevronRightIcon size={18} />
              </button>
            </li>
          ))}
        </ul>
      </section>
      <LibraryPanel />
    </div>
  );
}

/** A representative catalog object's icon for each top-level category. */
function CategoryGlyph({ id }: { id: string }) {
  const data = useStore((s) => s.data)!;
  const sample = useMemo(() => data.catalog.objects.filter((o) => inCategory(o, id)).sort((a, b) => b.display.priority - a.display.priority)[0], [data, id]);
  return sample ? <ObjectIcon obj={sample} size={30} /> : null;
}
