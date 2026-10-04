import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { useAnnouncer, announceIfQuiet } from "../state/announcer";
import { useAccessibility } from "../state/accessibility";
import { currentViewDescription, describeCurrentView, stepNearby } from "../state/audioNav";
import { nameWithKind } from "../lib/viewDescription";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, InfoIcon } from "./icons";
import { VoiceSettings } from "./VoiceControls";
import "./a11y.css";

/** Skip links rendered before everything else in the app. */
export function SkipLinks() {
  const focus = (id: string) => (e: React.MouseEvent) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.focus();
  };
  return (
    <nav className="skip-links" aria-label="Skip links">
      <a href="#space-map" onClick={focus("space-map")}>Skip to map</a>
      <a href="#main-search" onClick={(e) => { const el = document.querySelector<HTMLInputElement>(".main-search input"); if (el) { e.preventDefault(); el.focus(); } }}>Skip to search</a>
      <a href="#sidebar-body" onClick={focus("sidebar-body")}>Skip to panel content</a>
    </nav>
  );
}

/** Polite and assertive live regions; written by `announce()`. */
export function LiveRegions() {
  const polite = useAnnouncer((s) => s.polite);
  const assertive = useAnnouncer((s) => s.assertive);
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{polite}</div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">{assertive}</div>
    </>
  );
}

/**
 * Non-live text description of the map, referenced by the map's aria-describedby. Updated after the
 * camera settles, so it never chatters during motion.
 */
export function MapSummary() {
  const viewInfo = useStore((s) => s.viewInfo);
  const selectedId = useStore((s) => s.selectedId);
  const panel = useStore((s) => s.panel);
  const stops = useStore((s) => s.stops);
  const [text, setText] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setText(currentViewDescription()), 700);
    return () => clearTimeout(t);
  }, [viewInfo, selectedId, panel, stops]);
  return <p id="map-summary" className="sr-only">{text}</p>;
}

/** Announces camera lock/unlock and route framing, the meaningful camera state changes. */
export function CameraAnnouncements() {
  const camera = useStore((s) => s.camera);
  const data = useStore((s) => s.data);
  const prev = useRef(camera.mode);
  useEffect(() => {
    const was = prev.current;
    prev.current = camera.mode;
    if (!data || was === camera.mode && camera.mode !== "locked") return;
    if (camera.mode === "locked" && camera.lockedId) {
      const o = data.byId.get(camera.lockedId);
      if (o) announceIfQuiet(`Locked on ${nameWithKind(o)}. Arrow keys orbit, plus and minus zoom, Escape returns to explore.`);
    } else if (camera.mode === "explore" && was === "locked") announceIfQuiet("Returned to explore. The map pans freely.");
  }, [camera.mode, camera.lockedId, data]);
  return null;
}

/** Visible map navigation for keyboard and screen-reader users (Audio navigation setting). */
export function AudioNavBar() {
  const on = useAccessibility((s) => s.audioNav);
  const [last, setLast] = useState("");
  if (!on) return null;
  return (
    <section className="audio-nav" aria-label="Map navigation">
      <div className="audio-nav-buttons">
        <button type="button" onClick={() => setLast(stepNearby(-1) ?? "")} aria-keyshortcuts=","><ChevronLeftIcon size={16} /> Previous nearby</button>
        <button type="button" onClick={() => setLast(describeCurrentView())} aria-keyshortcuts="v">Describe current view</button>
        <button type="button" onClick={() => setLast(stepNearby(1) ?? "")} aria-keyshortcuts=".">Next nearby <ChevronRightIcon size={16} /></button>
        <button type="button" className="audio-nav-close" aria-label="Hide map navigation" onClick={() => useAccessibility.getState().set("audioNav", false)}><CloseIcon size={16} /></button>
      </div>
      {last && <p className="audio-nav-caption">{last}</p>}
    </section>
  );
}

function Toggle({ id, label, hint }: { id: "highContrast" | "largeText" | "reduceMotion" | "audioNav"; label: string; hint: string }) {
  const value = useAccessibility((s) => s[id]);
  return (
    <label className="a11y-toggle">
      <input type="checkbox" role="switch" checked={value} aria-describedby={`${id}-hint`} onChange={(e) => useAccessibility.getState().set(id, e.target.checked)} />
      <span><strong>{label}</strong><small id={`${id}-hint`}>{hint}</small></span>
    </label>
  );
}

export function AccessibilityDialog() {
  const open = useAccessibility((s) => s.open);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    const onClose = () => useAccessibility.getState().setOpen(false);
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={ref} className="about a11y-dialog" aria-labelledby="a11y-h" onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className="about-inner">
        <header>
          <h1 id="a11y-h">Accessibility</h1>
          <button type="button" className="icon-btn" aria-label="Close accessibility settings" onClick={() => ref.current?.close()}><CloseIcon /></button>
        </header>
        <h2>Display and motion</h2>
        <div className="a11y-toggles">
          <Toggle id="highContrast" label="High contrast" hint="Stronger text, borders and focus outlines." />
          <Toggle id="largeText" label="Larger text" hint="Increases text size across panels and controls." />
          <Toggle id="reduceMotion" label="Reduce motion" hint="Instant camera moves; journeys skip the travel animation. Also follows your system setting." />
          <Toggle id="audioNav" label="Map navigation toolbar" hint="Shows Describe current view and Previous / Next nearby object controls on the map." />
        </div>
        <VoiceSettings />
        <h2>Keyboard</h2>
        <ul className="keys">
          <li><kbd>M</kbd> start or end voice control with Grok</li>
          <li><kbd>Tab</kbd> move between controls; the first Tab stop offers skip links</li>
          <li><kbd>/</kbd> search</li>
          <li><kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> pan, or orbit when locked</li>
          <li><kbd>+</kbd> <kbd>−</kbd> zoom</li>
          <li><kbd>,</kbd> <kbd>.</kbd> previous / next nearby object</li>
          <li><kbd>V</kbd> describe the current view</li>
          <li><kbd>H</kbd> home · <kbd>D</kbd> directions · <kbd>F</kbd> fit route · <kbd>L</kbd> switch layer</li>
          <li><kbd>Space</kbd> play / pause time, or pause / resume a journey</li>
          <li><kbd>Esc</kbd> close a menu, leave a locked view, then close panels</li>
        </ul>
        <h2>Accessibility statement</h2>
        <p>GalaxyMaps aims to meet WCAG 2.2 level AA (the Web Content Accessibility Guidelines). We design for keyboard use, screen readers, visible focus, sufficient contrast, reduced motion and text alternatives for the map, and we check these with automated browser tests and keyboard testing.</p>
        <p>Known limitations: the map itself is a visual canvas. Its contents are available as text through the map description, Describe current view, search and the destination cards, but not every visual detail has a text equivalent. Virtual-reality mode uses head direction and hand pinches. Voice control with Grok needs a microphone and a server with Grok configured; without it, typed commands and the browser's read-aloud voice remain available.</p>
        <p>This statement is not a certification of legal compliance. If something is hard to use, please tell us how you were using GalaxyMaps and what went wrong, and we will work on it.</p>
        <p className="muted small"><InfoIcon size={14} /> Settings are saved in this browser only.</p>
      </div>
    </dialog>
  );
}

export function openAccessibilitySettings() {
  useAccessibility.getState().setOpen(true);
}
