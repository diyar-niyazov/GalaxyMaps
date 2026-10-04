import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import type { CatalogObject, Fact, ImageRecord } from "../lib/types";
import { positionOf } from "../lib/route";
import { distance } from "../lib/vec";
import { formatDistance, formatDistanceSecondary, formatUncertainty, jdToIsoDate } from "../lib/format";
import { TYPE_LABEL } from "../lib/search";
import { leafLabel } from "../lib/taxonomy";
import { DirectionsIcon, CloseIcon, SparkleIcon, ExternalIcon, WarningIcon, FocusIcon, EnterIcon, ImageIcon, CompareIcon, SpeakerIcon, StopIcon } from "./icons";
import { ObjectIcon } from "./ObjectIcon";
import { useServerStatus } from "./useServerStatus";
import { Img, Lightbox, Credit } from "./Gallery";
import { focusObject, exploreInside, directionsTo } from "../state/actions";
import { useNavigation } from "../state/navigation";
import { locationOf, distanceLabel, imageryLabel, typeLabel } from "./describe";
import { canSpeak, speak, stopSpeaking } from "../lib/speech";
import { DestinationTools } from "./DestinationTools";
import { Breadcrumbs } from "./Breadcrumbs";
import { comparisonSize } from "../lib/comparison";
import { openComparison } from "../state/comparison";
import { LearningInsights } from "./LearningInsights";
import { placedAtHostDistance } from "../lib/hierarchy";
import { SurpriseHighlight } from "./DiscoveryPanel";

interface AiImage {
  image: string;
  prompt: string;
  model: string;
}

const STATUS_LABEL = { active: "Active", retired: "Retired", historic: "Historic", "in-development": "In development", plan: "Plan" } as const;

export function PlaceCard({ obj }: { obj: CatalogObject }) {
  const data = useStore((s) => s.data)!;
  const jd = useStore((s) => s.jd);
  const select = useStore((s) => s.select);
  const openDirections = directionsTo;
  const status = useServerStatus();
  const [ai, setAi] = useState<AiImage | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "error">("idle");
  const [aiError, setAiError] = useState("");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const aiAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    setAi(null);
    setAiState("idle");
    setLightbox(null);
    return () => { aiAbort.current?.abort(); stopSpeaking(); setListening(false); };
  }, [obj.id]);

  const day = jd;
  const ctx = { eph: data.eph, jdTdb: day };
  const p = positionOf(obj, ctx);
  const pe = positionOf(data.byId.get("earth")!, ctx);
  const src = (id?: string) => (id ? data.catalog.sources[id] : undefined);
  const parent = obj.parentId ? data.byId.get(obj.parentId) : undefined;
  const images: ImageRecord[] = useMemo(() => [...(obj.image ? [obj.image] : []), ...(obj.gallery ?? [])], [obj]);
  const children = useMemo(() => data.catalog.objects.filter((o) => o.parentId === obj.id && o.type !== "exoplanet" && o.type !== "mission"), [data, obj.id]);
  const exoChildren = useMemo(() => data.catalog.objects.filter((o) => o.parentId === obj.id && o.type === "exoplanet"), [data, obj.id]);
  const missions = useMemo(() => data.catalog.objects.filter((o) => o.mission?.destinations?.includes(obj.id) && o.id !== obj.id), [data, obj.id]);
  const related = useMemo(() => {
    const pool = children.length ? children : obj.parentId ? data.catalog.objects.filter((o) => o.parentId === obj.parentId && o.id !== obj.id && o.type !== "exoplanet") : data.catalog.objects.filter((o) => o.category === obj.category && o.id !== obj.id && o.featured);
    return [...pool].sort((a, b) => Number(!!b.image) - Number(!!a.image) || b.display.priority - a.display.priority).slice(0, 6);
  }, [data, obj, children]);

  // Fact tiles: a correctly referenced distance first, then the object's own sourced facts.
  const tiles: Fact[] = [];
  if (obj.id === "earth") tiles.push({ label: "Distance from Earth", value: "0 km · you are here" });
  else if (p && pe && obj.region === "solar-system") tiles.push({ label: `From Earth on ${jdToIsoDate(day)}`, value: formatDistance(distance(p, pe)) });
  else if (p && pe && !obj.facts.some((f) => /^distance from the sun/i.test(f.label))) tiles.push({ label: "From Earth", value: formatDistance(distance(p, pe)) });
  const own = obj.facts.filter((f) => !/^distance from (the )?earth/i.test(f.label));
  const shown = own.slice(0, 6 - tiles.length);
  tiles.push(...shown);
  const moreFacts = own.slice(shown.length);

  const generate = async () => {
    aiAbort.current?.abort();
    const ctrl = new AbortController();
    aiAbort.current = ctrl;
    setAiState("loading");
    try {
      const r = await fetch("/api/imagine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objectId: obj.id }), signal: ctrl.signal });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setAi(j);
      setAiState("idle");
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setAiError((e as Error).message);
      setAiState("error");
    }
  };
  const aiDisabledReason = !status ? "Checking availability…" : !status.reachable ? "Artistic views are temporarily unavailable." : !status.grokConfigured ? "Grok artistic views aren't connected for this installation." : null;
  const hero = images[0];
  const comparable = !!comparisonSize(obj);
  const altName = obj.aliases.find((a) => a !== obj.name && !/^(HD|HIP|HR|Gaia|2MASS|TYC|GJ|NGC|IC|M ?\d|\[|NAME|SBDB|PSR|SN |Cl )/.test(a) && a.length < 32);
  const toggleListen = () => {
    if (listening) { stopSpeaking(); setListening(false); return; }
    const where = parent ? `in ${parent.name}` : locationOf(data, obj);
    const dist = distanceLabel(obj);
    const text = [`${obj.name}. ${typeLabel(obj)}, ${where}.`, dist && `${dist}.`, obj.summary?.text, ...tiles.slice(0, 4).map((f) => `${f.label}: ${f.value}.`)].filter(Boolean).join(" ");
    if (speak(text, () => setListening(false))) setListening(true);
  };

  return (
    <article className="panel place" aria-labelledby="place-title">
      <div className={`place-hero ${hero ? "" : "no-image"}`}>
        {hero ? (
          <button type="button" className="hero-btn" onClick={() => setLightbox(0)} aria-label={`View ${images.length} image${images.length > 1 ? "s" : ""} of ${obj.name}`}>
            <Img image={hero} className="hero-img" />
          </button>
        ) : (
          <div className="hero-placeholder">
            <ObjectIcon obj={obj} size={64} preferImage={false} />
            <span>No freely licensed image in our dataset yet</span>
          </div>
        )}
        {hero && <span className={`imagery-badge kind-${hero.kind}`}>{imageryLabel(hero)}</span>}
        {images.length > 1 && <span className="gallery-count"><ImageIcon size={14} /> {images.length}</span>}
        <button type="button" className="icon-btn hero-close" aria-label="Close place card" onClick={() => { if (!useNavigation.getState().back()) select(null); }}>
          <CloseIcon size={20} />
        </button>
      </div>
      {hero && <p className="image-credit"><Credit image={hero} /></p>}

      {(obj.parentId || obj.region !== "cosmological") && <Breadcrumbs obj={obj} />}
      <header className="place-head">
        <h1 id="place-title">{obj.name}</h1>
        {altName && <p className="place-alt">{altName}</p>}
        <p className="place-sub">
          {typeLabel(obj)}
          {parent ? <> · <button type="button" className="link-btn" onClick={() => focusObject(parent.id)}>{parent.name}</button></> : <> · {locationOf(data, obj)}</>}
          {obj.category && <> · <span className="muted">{leafLabel(obj.category)}</span></>}
        </p>
      </header>
      <SurpriseHighlight objectId={obj.id} />

      {obj.summary && (
        <p className="place-lede">
          {obj.summary.text}{" "}
          <a className="src-inline" href={obj.summary.url} target="_blank" rel="noreferrer">{src(obj.summary.sourceId)?.title.startsWith("Wikipedia") || obj.summary.sourceId === "wikipedia" ? "Wikipedia" : "Source"}</a>
        </p>
      )}

      <div className="action-row">
        <button type="button" className="action primary" onClick={() => focusObject(obj.id)} disabled={!obj.position && !obj.cosmo} title={obj.position ? "Lock the view on this object" : obj.cosmo ? "Show in the observable-universe overview" : "No map position"}>
          <span className="action-icon"><FocusIcon /></span>
          Focus
        </button>
        <button type="button" className="action" onClick={() => openDirections(obj.id)} disabled={!obj.route.supported} title={obj.route.supported ? "Directions" : obj.route.reason}>
          <span className="action-icon"><DirectionsIcon /></span>
          Directions
        </button>
        {children.length > 0 && (
          <button type="button" className="action" onClick={() => exploreInside(obj.id)}>
            <span className="action-icon"><EnterIcon /></span>
            Explore inside
          </button>
        )}
        {comparable && (
          <button type="button" className="action" onClick={() => openComparison(obj.id)} title="Compare physical diameters">
            <span className="action-icon"><CompareIcon /></span>
            Compare sizes
          </button>
        )}
        {canSpeak() && (
          <button type="button" className="action" aria-pressed={listening} onClick={toggleListen} title="Read this card aloud (browser voice)">
            <span className="action-icon">{listening ? <StopIcon /> : <SpeakerIcon />}</span>
            {listening ? "Stop" : "Listen"}
          </button>
        )}
        {images.length > 0 && 2 + Number(children.length > 0) + Number(comparable) + Number(canSpeak()) < 4 && (
          <button type="button" className="action" onClick={() => setLightbox(0)}>
            <span className="action-icon"><ImageIcon /></span>
            View images
          </button>
        )}
      </div>

      <DestinationTools obj={obj} />
      <LearningInsights obj={obj} />

      {obj.mission && (
        <div className="mission-box">
          <span className={`status-pill s-${obj.mission.status}`}>{STATUS_LABEL[obj.mission.status]}</span>
          <span><strong>{obj.mission.operator}</strong>{obj.mission.statusNote ? ` · ${obj.mission.statusNote}` : ""}</span>
          {obj.mission.destinations && obj.mission.destinations.length > 0 && (
            <span className="mission-dests">
              Destinations:{" "}
              {obj.mission.destinations.map((d, i) => {
                const o = data.byId.get(d);
                return o ? <span key={d}>{i ? ", " : ""}<button type="button" className="link-btn" onClick={() => focusObject(d)}>{o.name}</button></span> : null;
              })}
            </span>
          )}
          <span className="muted small">Content about vehicles and missions; no endorsement by the operator is implied.</span>
        </div>
      )}

      {!obj.route.supported && (
        <div className="callout subtle" role="note">
          <WarningIcon size={16} />
          <span>{obj.route.reason}</span>
        </div>
      )}
      {placedAtHostDistance(obj) && parent && (
        <div className="callout subtle" role="note">
          <WarningIcon size={16} />
          <span>Approximate placement: measured sky position at {parent.name}'s distance. Its depth inside {parent.name} is unknown, so no internal travel distance is offered.</span>
        </div>
      )}

      {tiles.length > 0 && (
        <dl className="fact-tiles">
          {tiles.map((f) => (
            <div className="tile" key={f.label}>
              <dt>{f.label}</dt>
              <dd>
                {f.value}
                {src(f.sourceId) && (
                  <a className="src-link" href={src(f.sourceId)!.url} target="_blank" rel="noreferrer" title={src(f.sourceId)!.title} aria-label={`Source: ${src(f.sourceId)!.title}`}>
                    <ExternalIcon size={11} />
                  </a>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {obj.summary?.more && obj.summary.more.length > 0 && (
        <section aria-labelledby="why-h">
          <h2 id="why-h" className="section-title">Why it’s interesting</h2>
          <ul className="highlights">
            {obj.summary.more.slice(0, 3).map((t) => <li key={t}>{t}</li>)}
          </ul>
          <p className="source-line">From <a href={obj.summary.url} target="_blank" rel="noreferrer">{obj.summary.sourceId === "wikipedia" ? "Wikipedia" : src(obj.summary.sourceId)?.title ?? "source"}</a>{obj.summary.sourceId === "wikipedia" ? ", CC BY-SA 4.0" : ""}</p>
        </section>
      )}

      {(related.length > 0 || missions.length > 0) && (
        <section aria-labelledby="rel-h">
          <h2 id="rel-h" className="section-title">{children.length ? `Inside ${obj.name}` : "Related destinations"}</h2>
          <ul className="related-grid">
            {[...missions.slice(0, 3), ...related].slice(0, 6).map((o) => (
              <li key={o.id}>
                <button type="button" className="related-card" onClick={() => focusObject(o.id)}>
                  <ObjectIcon obj={o} size={56} />
                  <span className="related-name">{o.name}</span>
                  <span className="related-sub">{TYPE_LABEL[o.type]}</span>
                </button>
              </li>
            ))}
          </ul>
          {children.length > 6 && <button type="button" className="text-btn" onClick={() => exploreInside(obj.id)}>All {children.length} inside {obj.name}</button>}
        </section>
      )}

      <details className="expander">
        <summary>Details</summary>
        {obj.summary?.details && <p className="summary">{obj.summary.details}</p>}
        {moreFacts.length > 0 && (
          <dl className="facts-table">
            {moreFacts.map((f) => (
              <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>
            ))}
          </dl>
        )}
        {(obj.exoplanets?.planets.length ?? 0) > 0 && (
          <>
            <h3 className="mini-title">Confirmed planets</h3>
            <ul className="exo-list">
              {obj.exoplanets!.planets.map((pl) => {
                const rec = exoChildren.find((e) => e.name === pl.name);
                return (
                  <li key={pl.name}>
                    {rec ? <button type="button" className="link-btn" onClick={() => focusObject(rec.id)}><strong>{pl.name}</strong></button> : <strong>{pl.name}</strong>}
                    <span className="muted">
                      {[pl.periodDays != null && `${pl.periodDays < 10 ? pl.periodDays.toFixed(2) : Math.round(pl.periodDays)}-day orbit`, pl.radiusEarth != null && `${pl.radiusEarth.toFixed(2)} R⊕`, pl.massEarth != null && `${pl.massEarth.toFixed(1)} M⊕`, pl.discoveryYear && `found ${pl.discoveryYear}`].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {!obj.summary?.details && !moreFacts.length && !obj.exoplanets?.planets.length && <p className="muted small">No further details in the catalog.</p>}
      </details>

      <details className="expander">
        <summary>Images{images.length ? ` (${images.length})` : ""}</summary>
        {images.length > 0 ? (
          <ul className="gallery-grid">
            {images.map((im, i) => (
              <li key={im.src}>
                <button type="button" onClick={() => setLightbox(i)} aria-label={`Open image: ${im.title}`}>
                  <Img image={{ ...im, src: im.thumb ?? im.src }} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">No freely licensed images in our dataset yet.</p>
        )}
        {obj.featured && obj.type !== "spacecraft" && obj.type !== "mission" && (
          <div className="ai-row">
            <button type="button" className="text-btn" onClick={generate} disabled={!!aiDisabledReason || aiState === "loading"} title={aiDisabledReason ?? "Generate an artistic reconstruction with Grok Imagine"}>
              <SparkleIcon size={16} /> {aiState === "loading" ? "Generating…" : "AI artistic view (Grok Imagine)"}
            </button>
            {aiDisabledReason && <span className="muted small">{aiDisabledReason}</span>}
            {aiState === "error" && <span className="hint error">AI view failed: {aiError}</span>}
            {ai && (
              <figure className="ai-figure">
                <img src={ai.image} alt={`${obj.name}, AI reconstruction`} />
                <figcaption><span className="imagery-badge static kind-ai-reconstruction">AI reconstruction</span> Artistic visualization, not an observation. Generated by {ai.model}. <details><summary>Prompt</summary>{ai.prompt}</details></figcaption>
              </figure>
            )}
          </div>
        )}
      </details>

      <details className="expander">
        <summary>Sources</summary>
        {obj.distance && obj.id !== "sun" && (
          <p className="small">
            <strong>Distance from the Sun:</strong> {distanceLabel(obj).replace(/ from Sun$/, "")}{" "}
            <span className="muted">({formatDistanceSecondary(obj.distance.valueKm)}{obj.position?.kind !== "ephemeris" && formatUncertainty(obj.distance.plusKm, obj.distance.minusKm) ? `, ${formatUncertainty(obj.distance.plusKm, obj.distance.minusKm)}` : ""})</span>
            <br />
            <span className="muted">Basis: {obj.position?.kind === "ephemeris" ? "JPL Horizons ephemeris at the catalog reference epoch" : obj.distance.method ?? obj.distance.type}</span>
            {src(obj.distance.sourceId) && <> · <a href={src(obj.distance.sourceId)!.url} target="_blank" rel="noreferrer">{src(obj.distance.sourceId)!.title}</a></>}
            {obj.distance.note && <span className="note"> {obj.distance.note}</span>}
          </p>
        )}
        {obj.cosmo && (
          <p className="small">
            <strong>Cosmological distance:</strong> redshift z = {obj.cosmo.z}; comoving distance and light-travel time from {obj.cosmo.model}. These are different distance definitions and are not used for routes.
          </p>
        )}
        <ul className="source-list">
          {[...new Set(obj.sourceIds)].map((id) => src(id)).filter(Boolean).map((s) => (
            <li key={s!.id}>
              <a href={s!.url} target="_blank" rel="noreferrer">{s!.title}</a>
              {s!.license && <span className="muted small"> · {s!.license}</span>}
            </li>
          ))}
          {obj.position && <li className="muted">Position: {obj.position.method}{obj.position.kind === "static" && obj.position.depth === "host" ? " (depth not measured)" : ""}</li>}
        </ul>
      </details>

      {lightbox != null && images.length > 0 && <Lightbox images={images} start={lightbox} onClose={() => setLightbox(null)} />}
    </article>
  );
}
