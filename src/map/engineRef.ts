import type { MapEngine } from "./MapEngine";

let current: MapEngine | null = null;

export const setEngine = (e: MapEngine | null) => {
  current = e;
};

/** The live map engine, if mounted. UI and AI tools use this to move the camera. */
export const getEngine = () => current;
