import { useEffect, useState } from "react";
import type { ImageRecord } from "../lib/types";
import { IMAGERY_LABEL } from "./describe";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "./icons";
import { useEscapeLayer } from "./menus";

export function Credit({ image }: { image: ImageRecord }) {
  if (image.kind === "ai-reconstruction") return <>Artistic visualization, not an observation. {image.credit}.</>;
  return (
    <>
      {image.credit} · {image.licenseUrl ? <a href={image.licenseUrl} target="_blank" rel="noreferrer">{image.license}</a> : image.license}
      {image.sourceUrl && <> · <a href={image.sourceUrl} target="_blank" rel="noreferrer">Source</a></>}
    </>
  );
}

/** Responsive image with a loading shimmer and a quiet failure fallback. */
export function Img({ image, className, sizes }: { image: ImageRecord; className?: string; sizes?: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  useEffect(() => setState("loading"), [image.src]);
  if (state === "error") return <div className={`img-fallback ${className ?? ""}`}>Image unavailable</div>;
  return (
    <img
      src={image.src}
      alt={image.alt ?? image.title}
      className={`${className ?? ""} ${state === "loading" ? "is-loading" : ""}`}
      loading="lazy"
      decoding="async"
      sizes={sizes}
      onLoad={() => setState("ok")}
      onError={() => setState("error")}
    />
  );
}

/** Full-screen gallery viewer: arrows, Esc and outside click close; each image keeps its credit. */
export function Lightbox({ images, start, onClose }: { images: ImageRecord[]; start: number; onClose(): void }) {
  const [i, setI] = useState(start);
  useEscapeLayer(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((x) => (x + 1) % images.length);
      if (e.key === "ArrowLeft") setI((x) => (x - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length]);
  const img = images[i];
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Image ${i + 1} of ${images.length}: ${img.title}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-inner">
        <button type="button" className="icon-btn lightbox-close" aria-label="Close images" onClick={onClose}>
          <CloseIcon />
        </button>
        <figure>
          <Img image={img} className="lightbox-img" />
          <figcaption>
            <span className={`imagery-badge static kind-${img.kind}`}>{IMAGERY_LABEL[img.kind]}</span> {img.title}
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
    </div>
  );
}
