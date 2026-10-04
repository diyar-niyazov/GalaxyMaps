/// <reference lib="webworker" />
/** Builds particle galaxies and clouds off the render thread (a 40k galaxy takes tens of ms). */
import { buildGalaxyParticles, type GalaxyParams } from "../map/galaxyModel";
import { buildCloudParticles, type CloudKind } from "./cloudModel";
import type { CatalogObject } from "../lib/types";

export type ParticleJob =
  | { id: string; kind: "galaxy"; params: GalaxyParams; count: number }
  | { id: string; kind: "cloud"; obj: CatalogObject; cloud: CloudKind; count: number };

self.onmessage = (e: MessageEvent<ParticleJob>) => {
  const job = e.data;
  const parts = job.kind === "galaxy" ? buildGalaxyParticles(job.params, job.count) : buildCloudParticles(job.obj, job.cloud, job.count);
  const { light, dust } = parts;
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id: job.id, parts }, [light.positions.buffer, light.colors.buffer, light.sizes.buffer, dust.positions.buffer, dust.sizes.buffer]);
};
