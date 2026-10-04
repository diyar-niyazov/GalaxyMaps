import { useEffect, useState } from "react";

export interface ServerStatus {
  reachable: boolean;
  grokConfigured: boolean;
  voiceModel?: string;
  imageModel?: string;
}

let cached: Promise<ServerStatus> | null = null;

export function loadServerStatus(): Promise<ServerStatus> {
  return load();
}

function load(): Promise<ServerStatus> {
  cached ??= fetch("/api/status", { signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j) => ({ reachable: true, grokConfigured: !!j.grok?.configured, voiceModel: j.grok?.voiceModel, imageModel: j.grok?.imageModel }))
    .catch(() => ({ reachable: false, grokConfigured: false }));
  return cached;
}

export function useServerStatus(): ServerStatus | null {
  const [s, setS] = useState<ServerStatus | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((v) => alive && setS(v));
    return () => {
      alive = false;
    };
  }, []);
  return s;
}
