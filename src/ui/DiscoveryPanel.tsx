import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { useDiscoveryStore } from "../state/discovery";
import { useLibrary } from "../state/library";
import { availableTours, getTour, type DiscoveryIntent } from "../lib/discovery";
import { formatDistance, jdToIsoDate } from "../lib/format";
import { focusObject } from "../state/actions";
import { Img, Credit, Lightbox } from "./Gallery";
import { useEscapeLayer } from "./menus";
import { BackIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, SparkleIcon } from "./icons";
import "./discovery.css";

const INTENTS: { id: DiscoveryIntent; label: string }[] = [
  { id: "beautiful", label: "Beautiful" }, { id: "strange", label: "Strange" }, { id: "nearby", label: "Nearby" },
];

export function DiscoveryPrompt() {
  const data = useStore((s) => s.data);
  const selectedId = useStore((s) => s.selectedId);
  const intent = useDiscoveryStore((s) => s.intent);
  const originId = useDiscoveryStore((s) => s.originId);
  const error = useDiscoveryStore((s) => s.error);
  if (!data) return null;
  const originOptions = [...new Set(["earth", originId, ...(selectedId ? [selectedId] : [])])].map((id) => data.byId.get(id)).filter((o) => !!o);
  return (
    <section className="discovery-prompt" aria-labelledby="discovery-title">
      <div className="discovery-prompt-head">
        <span><h2 id="discovery-title">Your next discovery</h2><small>A real destination, chosen for you</small></span>
        <button type="button" className="discovery-surprise" onClick={() => useDiscoveryStore.getState().surpriseMe()}><SparkleIcon size={17} /> Surprise me</button>
      </div>
      <div className="discovery-intents" role="group" aria-label="Discovery preference">
        {INTENTS.map((item) => <button type="button" key={item.id} aria-pressed={intent === item.id} className={intent === item.id ? "active" : ""} onClick={() => useDiscoveryStore.getState().setIntent(item.id)}>{item.label}</button>)}
      </div>
      {intent === "nearby" && <label className="discovery-origin">Physical distance from <select value={originId} onChange={(e) => useDiscoveryStore.getState().setOrigin(e.target.value)}>{originOptions.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}</select></label>}
      {error && <p className="discovery-feedback" role="status">{error}</p>}
    </section>
  );
}

export function GuidedTours() {
  const data = useStore((s) => s.data);
  const [all, setAll] = useState(false);
  if (!data) return null;
  const tours = availableTours(data).filter((tour) => tour.kind === "tour");
  const shown = all ? tours : tours.slice(0, 2);
  return (
    <section aria-labelledby="guided-tours-title" className="explore-section">
      <div className="section-head"><h2 id="guided-tours-title" className="section-title">Guided tours</h2><span className="section-note">At your own pace</span></div>
      <div className="discovery-tour-grid" id="guided-tour-grid">
        {shown.map((tour) => {
          const stop = tour.stops[0];
          // The extremes overview leads with its authentic EHT observation.
          const image = tour.id === "extremes" ? tour.stops[2].image! : stop.image ?? data.byId.get(stop.objectId)!.image!;
          return <button type="button" className="discovery-tour-card" key={tour.id} onClick={() => useDiscoveryStore.getState().openTour(tour.id)}>
            <Img image={image} className="discovery-tour-cover" variant="card" />
            <span className="discovery-tour-copy"><strong>{tour.title}</strong><small>{tour.stops.length} stops · {tour.subtitle}</small></span>
          </button>;
        })}
      </div>
      {tours.length > 2 && <button type="button" className="text-btn show-more" aria-expanded={all} aria-controls="guided-tour-grid" onClick={() => setAll(!all)}>{all ? "Show less" : "Show all tours"}</button>}
    </section>
  );
}

/** Featured Demo-2 story inside the SpaceX & human spaceflight section. */
export function MissionStoryCard() {
  const data = useStore((s) => s.data);
  if (!data) return null;
  const story = availableTours(data).find((tour) => tour.kind === "story");
  if (!story) return null;
  const image = story.stops[1].image!;
  return (
    <button type="button" className="discovery-story-card" onClick={() => useDiscoveryStore.getState().openTour(story.id)}>
      <Img image={image} className="discovery-story-cover" variant="card" />
      <span className="discovery-story-copy"><span className="discovery-eyebrow">Completed mission · 2020</span><strong>{story.title}</strong><small>{story.stops.length} chapters · NASA mission photographs <ChevronRightIcon size={14} /></small></span>
    </button>
  );
}

/** A concise highlight in the destination card after Surprise me focuses its object. */
export function SurpriseHighlight({ objectId }: { objectId: string }) {
  const surprise = useDiscoveryStore((s) => s.surprise);
  const intent = useDiscoveryStore((s) => s.intent);
  const favorites = useLibrary((s) => s.favorites);
  const jd = useStore((s) => s.jd);
  if (!surprise || surprise.object.id !== objectId) return null;
  const saved = favorites.includes(objectId);
  return <section className="discovery-highlight" aria-labelledby="surprise-highlight-title">
    <div className="discovery-highlight-head"><h2 id="surprise-highlight-title">Why this is worth seeing</h2><span>{INTENTS.find((item) => item.id === intent)?.label}</span></div>
    <p>{surprise.reason} <a href={surprise.sourceUrl} target="_blank" rel="noreferrer">Source</a></p>
    {surprise.distanceKm != null && <p className="discovery-proximity">{formatDistance(surprise.distanceKm)} from {surprise.originName} · physical separation on {jdToIsoDate(jd)}. Catalog distances may be approximate.</p>}
    <div className="discovery-highlight-actions">
      <button type="button" onClick={() => useDiscoveryStore.getState().surpriseMe()}><SparkleIcon size={15} /> Another</button>
      <button type="button" aria-pressed={saved} onClick={() => useLibrary.getState().toggleFavorite(objectId)}>{saved ? "Saved" : "Save"}</button>
      <button type="button" onClick={() => useDiscoveryStore.getState().dismissSurprise()}>Explore more</button>
    </div>
    <button type="button" className="discovery-back-link" onClick={() => useDiscoveryStore.getState().exitSurprise()}><BackIcon size={14} /> Back to previous view</button>
  </section>;
}

export function TourPanel() {
  const data = useStore((s) => s.data);
  const activeTourId = useDiscoveryStore((s) => s.activeTourId);
  const stopIndex = useDiscoveryStore((s) => s.stopIndex);
  const started = useDiscoveryStore((s) => s.started);
  const paused = useDiscoveryStore((s) => s.paused);
  const favorites = useLibrary((s) => s.favorites);
  const [lightbox, setLightbox] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tour = getTour(activeTourId);
  useEscapeLayer(() => useDiscoveryStore.getState().exitTour(), false);
  useEffect(() => {
    setLightbox(false);
    if (started) headingRef.current?.focus({ preventScroll: true });
  }, [activeTourId, stopIndex, started]);
  if (!tour || !data) return null;
  const stop = tour.stops[stopIndex];
  const object = data.byId.get(stop.objectId);
  if (!object) return <div className="panel"><p className="empty">This tour destination is unavailable in the current catalog.</p><button type="button" className="text-btn" onClick={() => useDiscoveryStore.getState().exitTour()}>Return to exploration</button></div>;
  const image = stop.image ?? object.image!;
  const sourceUrl = stop.sourceUrl ?? object.summary?.url;
  const context = stop.focusId ? data.byId.get(stop.focusId) : null;
  const last = stopIndex === tour.stops.length - 1;
  const saved = favorites.includes(stop.objectId);
  return <article className="panel discovery-active" aria-label={tour.kind === "story" ? "Mission story" : "Guided mini-tour"}>
    <header className="discovery-active-header">
      <div><span className="discovery-eyebrow">{tour.kind === "story" ? "Completed mission story" : "Guided mini-tour"}</span><h1>{tour.title}</h1></div>
      <button type="button" className="icon-btn" aria-label="Exit tour and return to previous view" onClick={() => useDiscoveryStore.getState().exitTour()}><CloseIcon size={19} /></button>
    </header>
    <figure className="discovery-stop-figure">
      <button type="button" className="discovery-stop-image-button" aria-label={`Enlarge ${image.title}`} onClick={() => setLightbox(true)}><Img image={image} className="discovery-stop-image" /><span className="discovery-image-type">{image.kind === "observed" ? context ? "Mission photograph" : "Actual observation" : "Illustration"}</span></button>
      <figcaption><span>{image.title}</span><span className="image-credit"><Credit image={image} /></span></figcaption>
    </figure>
    {!started ? <div className="discovery-overview">
      <p>{tour.introduction}</p>
      <p className="discovery-order">{tour.order}</p>
      <button type="button" className="discovery-start" onClick={() => useDiscoveryStore.getState().startTour()}>Start {tour.kind === "story" ? "story" : "tour"}<ChevronRightIcon size={17} /></button>
      <p className="discovery-pace">{tour.stops.length} {tour.kind === "story" ? "chapters" : "stops"} · Advance when you're ready</p>
    </div> : <>
      <div className="discovery-progress" aria-label={`Progress: ${stopIndex + 1} of ${tour.stops.length}`}><span>{tour.kind === "story" ? "Chapter" : "Stop"} {stopIndex + 1} of {tour.stops.length}{paused ? " · Paused" : ""}</span><progress value={stopIndex + 1} max={tour.stops.length} /></div>
      <div className="discovery-stop-copy" aria-live="polite">
        {stop.date && <p className="discovery-stop-date">{stop.date}</p>}
        <h2 tabIndex={-1} ref={headingRef}>{stop.title}</h2>
        <p className="discovery-stop-object">{object.name}</p>
        <p>{stop.highlight}</p>
        {sourceUrl && <a className="discovery-fact-source" href={sourceUrl} target="_blank" rel="noreferrer">{sourceUrl.includes("nasa.gov") ? "NASA mission report" : sourceUrl.includes("eso.org") ? "ESO / EHT source" : "Highlight source"} ↗</a>}
        {context && <p className="discovery-scene-note">Map context: {context.name}. Images document the mission; the scene does not show a historical flight trajectory or current spacecraft location.</p>}
        {object.cosmo && <p className="discovery-scene-note">Shown in the observable-universe overview with schematic distance scaling. A physical flight route is unavailable for this quasar.</p>}
        {tour.id === "andromeda" && object.position?.kind === "static" && object.position.depth === "host" && <p className="discovery-scene-note">Placed at Andromeda's distance. Its depth within the galaxy is not measured, so physical routes between its interior features are unavailable.</p>}
      </div>
      <nav className="discovery-stop-controls" aria-label="Tour navigation">
        <button type="button" disabled={stopIndex === 0 || paused} onClick={() => useDiscoveryStore.getState().jumpTo(stopIndex - 1)}><ChevronLeftIcon size={17} /> Previous</button>
        <button type="button" onClick={() => paused ? useDiscoveryStore.getState().resumeTour() : useDiscoveryStore.getState().pauseTour()}>{paused ? "Resume" : "Pause"}</button>
        {last ? <button type="button" className="discovery-next" onClick={() => useDiscoveryStore.getState().exitTour()}>Finish<CloseIcon size={15} /></button> : <button type="button" className="discovery-next" disabled={paused} onClick={() => useDiscoveryStore.getState().jumpTo(stopIndex + 1)}>Next<ChevronRightIcon size={17} /></button>}
      </nav>
      {paused && <p className="discovery-pace" role="status">Paused. Explore the map freely, then Resume to return to this stop.</p>}
      <div className="discovery-stop-extra"><button type="button" className="text-btn" aria-pressed={saved} onClick={() => useLibrary.getState().toggleFavorite(stop.objectId)}>{saved ? "Saved destination" : "Save destination"}</button><button type="button" className="text-btn" onClick={() => { useDiscoveryStore.getState().pauseTour(); focusObject(stop.objectId); useStore.getState().setPanel("place"); }}>Open destination card</button></div>
    </>}
    <details className="discovery-stop-list" open={!started}>
      <summary>{started ? "Jump to a stop" : "The stops"}</summary>
      <ol>{tour.stops.map((item, index) => <li key={`${item.objectId}-${index}`}><button type="button" aria-current={index === stopIndex ? "step" : undefined} onClick={() => useDiscoveryStore.getState().jumpTo(index)}><span>{index + 1}</span><span><strong>{item.title}</strong><small>{item.date ?? data.byId.get(item.objectId)?.name}</small></span>{index === stopIndex && <ChevronRightIcon size={15} />}</button></li>)}</ol>
    </details>
    <button type="button" className="discovery-back-link" onClick={() => useDiscoveryStore.getState().exitTour()}><BackIcon size={14} /> Return to previous view</button>
    {lightbox && <Lightbox images={[image]} start={0} onClose={() => setLightbox(false)} />}
  </article>;
}

/** Keeps an accessible route back to a paused tour while a destination card is open. */
export function PausedTourBanner() {
  const tourId = useDiscoveryStore((s) => s.activeTourId);
  const paused = useDiscoveryStore((s) => s.paused);
  const tour = getTour(tourId);
  if (!tour || !paused) return null;
  return <div className="discovery-paused-banner"><span>{tour.title} · paused</span><button type="button" onClick={() => useDiscoveryStore.getState().resumeTour()}>Resume</button><button type="button" aria-label="Exit paused tour" onClick={() => useDiscoveryStore.getState().exitTour()}><CloseIcon size={16} /></button></div>;
}
