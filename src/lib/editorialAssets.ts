import type { Catalog } from "./types";
import { DEMO2_IMAGES, EHT_IMAGES } from "./discovery";

/** Local, primary-source images audited for this release. Also applied by the data builder. */
export function applyEditorialAssets(catalog: Catalog): void {
  catalog.sources["eht-primary-images"] = { id: "eht-primary-images", title: "Event Horizon Telescope: black-hole images", url: "https://www.eso.org/public/news/eso2208-eht-mw/", license: "CC BY 4.0" };
  catalog.sources["nasa-demo2-history"] = { id: "nasa-demo2-history", title: "NASA: SpaceX Demo-2 mission history", url: "https://www.nasa.gov/news-release/nasa-astronauts-launch-from-america-in-historic-test-flight-of-spacex-crew-dragon/", license: "Public domain" };
  for (const [id, image] of Object.entries(EHT_IMAGES)) {
    const o = catalog.objects.find((object) => object.id === id);
    if (o) { o.image = image; o.sourceIds = [...new Set([...o.sourceIds, "eht-primary-images"])]; }
  }
  for (const id of ["falcon-9", "demo-2"]) {
    const o = catalog.objects.find((object) => object.id === id);
    if (!o) continue;
    const original = [o.image, ...(o.gallery ?? [])].filter((image) => !!image);
    o.image = DEMO2_IMAGES.launch;
    o.gallery = [...new Map([...(id === "demo-2" ? [DEMO2_IMAGES.crew, DEMO2_IMAGES.approach, DEMO2_IMAGES.recovery] : []), ...original].filter((image) => image.src !== o.image!.src).map((image) => [image.src, image])).values()];
    o.sourceIds = [...new Set([...o.sourceIds, "nasa-demo2-history"])];
  }
}
