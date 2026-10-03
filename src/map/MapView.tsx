import { useEffect, useRef } from "react";
import { MapEngine } from "./MapEngine";
import { setEngine } from "./engineRef";
import { useStore } from "../state/store";
import { objectForStar, type DataBundle } from "../data/bundle";

export function MapView({ data }: { data: DataBundle }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current!;
    const s = useStore.getState();
    const engine = new MapEngine(el, data, s.jd, {
      onViewChange: (info) => useStore.getState().setViewInfo({ ...info, view: { ...info.view } }),
      onPick: (t) => {
        const st = useStore.getState();
        if (!t) return;
        const id = t.kind === "object" ? t.id : objectForStar(data, t.index).id;
        st.select(id);
      },
    });
    engine.setLayer(s.layer);
    setEngine(engine);
    return () => {
      setEngine(null);
      engine.dispose();
    };
  }, [data]);

  return <div ref={ref} className="map" data-testid="map" role="application" aria-label="Space map. Drag to pan, scroll to zoom, right-drag to tilt." />;
}
