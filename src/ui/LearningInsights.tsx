import { useMemo } from "react";
import { useStore } from "../state/store";
import type { CatalogObject } from "../lib/types";
import { lightDelay, nearbyDestinations } from "../lib/learning";
import { formatDistance } from "../lib/format";
import { focusObject } from "../state/actions";
import { ObjectIcon } from "./ObjectIcon";

export function LearningInsights({ obj }: { obj: CatalogObject }) {
  const data = useStore((s) => s.data)!, jd = useStore((s) => s.jd);
  const delay = lightDelay(obj, data, jd);
  const nearby = useMemo(() => nearbyDestinations(obj, data, jd), [obj, data, jd]);
  return <div className="learning-insights">
    {delay && <section className="light-delay"><h2>Light delay</h2><p>{delay.text}</p><details><summary>How this is calculated</summary><p>{delay.model}</p><p>Uses this record's distance sources and the selected map epoch; see Sources below.</p></details></section>}
    {nearby.length > 0 && <section><h2 className="section-title">Physically nearby</h2><p className="muted small">Three-dimensional separation from {obj.name}, using compatible positions. Catalog distances may be approximate.</p><ul className="nearby-list">{nearby.map(({ object, km }) => <li key={object.id}><button type="button" onClick={() => focusObject(object.id)}><ObjectIcon obj={object} size={30} /><span>{object.name}<small>{formatDistance(km)} from {obj.name}</small></span></button></li>)}</ul></section>}
  </div>;
}
