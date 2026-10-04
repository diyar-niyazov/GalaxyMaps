import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import type { ImageRecord } from "../lib/types";
import { cleanCredit, imageryLabel } from "./describe";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "./icons";
import { useEscapeLayer } from "./menus";

export function Credit({ image }: { image: ImageRecord }) {
  const credit = cleanCredit(image.credit);
  if (image.kind === "ai-reconstruction") return <>Artistic visualization, not an observation. {credit}.</>;
  return (
    <>
      {credit} · {image.licenseUrl ? <a href={image.licenseUrl} target="_blank" rel="noreferrer">{image.license}</a> : image.license}
      {image.sourceUrl && <> · <a href={image.sourceUrl} target="_blank" rel="noreferrer">Source</a></>}
    </>
  );
}

const LOADED_MAX = 300;
const LOAD_TIMEOUT_MS = 20_000;
/** Insertion-ordered, bounded record of images that already loaded, so revisits skip the shimmer. */
const loaded = new Set<string>();
function markLoaded(src: string) {
  loaded.delete(src);
  loaded.add(src);
  if (loaded.size > LOADED_MAX) loaded.delete(loaded.values().next().value!);
}
const withAttempt = (src: string, attempt: number) => (attempt ? `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}` : src);

/**
 * Responsive image with a loading shimmer and a fallback chain: the primary image (retried once),
 * then its bundled thumbnail, then a placeholder. Browse cards ("card") get a quiet placeholder;
 * detail views keep a labelled fallback with Retry (a span, because images often sit inside buttons).
 */
export function Img({ image, className, sizes, variant = "detail", placeholder, priority = false }: {
  image: ImageRecord; className?: string; sizes?: string; variant?: "card" | "detail"; placeholder?: ReactNode; priority?: boolean;
}) {
  const chain = image.thumb && image.thumb !== image.src ? [image.src, image.src, image.thumb] : [image.src, image.src];
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ok" | "error">(() => (loaded.has(image.src) ? "ok" : "loading"));
  useEffect(() => {
    setAttempt(0);
    setState(loaded.has(image.src) ? "ok" : "loading");
  }, [image.src]);
  useEffect(() => {
    if (state !== "loading") return;
    const t = setTimeout(() => fail(), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, image.src, attempt]);
  const fail = () => {
    if (attempt < chain.length - 1) {
      setAttempt(attempt + 1);
      setState("loading");
    } else setState("error");
  };
  const retry = (e: SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAttempt(chain.length);
    setState("loading");
  };
  if (state === "error") {
    if (variant === "card") {
      return <span className={`img-placeholder ${className ?? ""}`} role="img" aria-label={`${image.title} (image unavailable)`}>{placeholder}</span>;
    }
    return (
      <span className={`img-fallback ${className ?? ""}`} role="img" aria-label={`${image.title}: image unavailable`}>
        <span>Image unavailable</span>
        <span className="img-retry" role="button" tabIndex={0} onClick={retry} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") retry(e); }}>Retry</span>
      </span>
    );
  }
  const src = attempt < chain.length ? withAttempt(chain[attempt], attempt === 1 ? 1 : 0) : withAttempt(image.src, attempt);
  return (
    <img
      key={attempt}
      src={src}
      alt={image.alt ?? image.title}
      className={`${className ?? ""} ${state === "loading" ? "is-loading" : ""}`}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      width={image.width || undefined}
      height={image.height || undefined}
      sizes={sizes}
      onLoad={() => { markLoaded(image.src); setState("ok"); }}
      onError={fail}
    />
  );
}

/** Full-screen gallery viewer: arrows, Esc and outside click close; each image keeps its credit. */
export function Lightbox({ images, start, onClose }: { images: ImageRecord[]; start: number; onClose(): void }) {
  const [i, setI] = useState(start);
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  useEscapeLayer(onClose);
  useEffect(() => {
    const previous = opener.current;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      requestAnimationFrame(() => { if (previous?.isConnected) previous.focus(); });
    };
  }, []);
  const img = images[i];
  return (
    <dialog ref={ref} className="lightbox" aria-label={`Image ${i + 1} of ${images.length}: ${img.title}`} onCancel={(e) => { e.preventDefault(); onClose(); }} onKeyDown={(e) => {
      e.stopPropagation();
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        setI((x) => (x + (e.key === "ArrowRight" ? 1 : -1) + images.length) % images.length);
      }
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-inner">
        <button type="button" className="icon-btn lightbox-close" aria-label="Close images" onClick={onClose}>
          <CloseIcon />
        </button>
        <figure>
          <Img image={img} className="lightbox-img" />
          <figcaption>
            <span className={`imagery-badge static kind-${img.kind}`}>{imageryLabel(img)}</span> {img.title}
            <span className="image-credit"><Credit image={img} /></span>
          </figcaption>
        </figure>
        {images.length > 1 && (
          <>
            <button type="button" className="icon-btn lightbox-nav prev" aria-label="Previous image" onClick={() => setI((x) => (x - 1 + images.length) % images.length)}>
              <ChevronLeftIcon />
            </button>
            <button type="button" className="icon-btn lightbox-nav next" aria-label="Next image" onClick={() => setI((x) => (x + 1) % images.length)}>
              <ChevronRightIcon />
            </button>
            <span className="lightbox-count">{i + 1} / {images.length}</span>
          </>
        )}
      </div>
    </dialog>
  );
}
