import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useStore } from "../state/store";
import { search, browse, TYPE_LABEL } from "../lib/search";
import { CATEGORY_TREE, findNode, leafParent, isLeaf, inCategory } from "../lib/taxonomy";
import type { CatalogObject } from "../lib/types";
import { locationOf, distanceLabel } from "./describe";
import { ObjectIcon } from "./ObjectIcon";
import { CloseIcon, GridIcon, ChevronRightIcon, BackIcon } from "./icons";
import { useMenu } from "./menus";
import { interactionStart, interactionEnd } from "../state/interaction";

interface Props {
  value: CatalogObject | null;
  onSelect(obj: CatalogObject | null): void;
  placeholder: string;
  label: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Suggestions shown when focused with an empty query. */
  suggestions?: CatalogObject[];
  /** Main search: offers the Browse categories tree and the map category filter. */
  browseable?: boolean;
}

type Row = { kind: "obj"; obj: CatalogObject } | { kind: "node"; id: string; label: string; hint?: string; count: number; leaf: boolean };

const PAGE = 60;

export function ObjectSearch({ value, onSelect, placeholder, label, leading, trailing, className, autoFocus, inputRef, suggestions, browseable }: Props) {
  const data = useStore((s) => s.data);
  const category = useStore((s) => (browseable ? s.categoryFilter : null));
  const setCategory = useStore((s) => s.setCategoryFilter);
  const [query, setQuery] = useState(value?.name ?? "");
  const [browsing, setBrowsing] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const menu = useMenu();
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const listId = useId();

  useEffect(() => setQuery(value?.name ?? ""), [value]);
  useEffect(() => { setActive(0); setLimit(PAGE); }, [query, category, browsing]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    if (!data) return m;
    for (const top of CATEGORY_TREE) {
      m.set(top.id, data.catalog.objects.filter((o) => inCategory(o, top.id)).length);
      for (const c of top.children ?? []) m.set(c.id, data.catalog.objects.filter((o) => inCategory(o, c.id)).length);
    }
    return m;
  }, [data]);

  const q = query.trim();
  const typing = !!q && q !== value?.name;
  const view: "tree" | "results" | "category" | "suggest" =
    typing ? "results" : browsing != null ? "tree" : category ? "category" : "suggest";

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    if (view === "results") return search(data.search, q, 12, category).map((r) => ({ kind: "obj" as const, obj: r.obj }));
    if (view === "category") return browse(data.search, category!).slice(0, limit).map((obj) => ({ kind: "obj" as const, obj }));
    if (view === "tree") {
      const nodes = browsing === "" ? CATEGORY_TREE : findNode(browsing!)?.children ?? [];
      return nodes.map((n) => ({ kind: "node" as const, id: n.id, label: n.label, hint: n.hint, count: counts.get(n.id) ?? 0, leaf: isLeaf(n.id) }));
    }
    return (suggestions ?? []).map((obj) => ({ kind: "obj" as const, obj }));
  }, [data, view, q, category, browsing, counts, suggestions, limit]);

  const totalInCategory = category ? counts.get(category) ?? 0 : 0;

  const choose = (obj: CatalogObject) => {
    menu.setOpen(false);
    setBrowsing(null);
    setQuery(obj.name);
    onSelect(obj);
    ref.current?.blur();
  };

  const openNode = (row: Extract<Row, { kind: "node" }>) => {
    if (row.leaf) {
      setCategory(row.id);
      setBrowsing(null);
      setQuery("");
    } else setBrowsing(row.id);
    ref.current?.focus();
  };

  const back = () => {
    if (view === "tree") setBrowsing(browsing === "" ? null : "");
    else if (view === "category") {
      setBrowsing(leafParent(category!)?.id ?? "");
    }
  };

  const activate = (r: Row | undefined) => {
    if (!r) return;
    if (r.kind === "obj") choose(r.obj);
    else openNode(r);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      menu.setOpen(true);
      setActive((a) => Math.min(rows.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "ArrowRight" && view === "tree") {
      e.preventDefault();
      activate(rows[active]);
    } else if ((e.key === "ArrowLeft" && view === "tree") || (e.key === "Backspace" && !query && browseable && (view === "tree" || view === "category"))) {
      e.preventDefault();
      back();
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(rows[active] ?? rows[0]);
    }
  };

  const open = menu.open;
  const crumbs = view === "tree" && browsing ? [findNode(browsing)?.label ?? ""] : view === "category" && category ? [leafParent(category)?.label ?? "", findNode(category)?.label ?? ""] : [];
  const emptyText =
    view === "results" ? `No destination matching “${q}”${category ? ` in ${findNode(category)?.label}` : ""} in the GalaxyMaps catalog.` :
    view === "category" ? `No ${findNode(category!)?.label.toLowerCase()} in the GalaxyMaps catalog yet.` : null;
  const showPanel = open && (rows.length > 0 || emptyText != null || view === "tree");

  return (
    <div className={`osearch ${className ?? ""} ${showPanel ? "is-open" : ""}`} ref={menu.ref}>
      <div className="osearch-field">
        {leading}
        {category && (
          <span className="filter-chip" title="Matching markers are emphasized on the map">
            {findNode(category)?.label}
            <button type="button" aria-label={`Clear filter ${findNode(category)?.label}`} onClick={() => { setCategory(null); ref.current?.focus(); }}>
              <CloseIcon size={14} />
            </button>
          </span>
        )}
        <input
          ref={ref}
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && rows[active] ? `${listId}-${active}` : undefined}
          placeholder={category ? `Search ${findNode(category)?.label.toLowerCase()}` : placeholder}
          value={query}
          autoFocus={autoFocus}
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            menu.setOpen(true);
          }}
          onFocus={(e) => {
            menu.setOpen(true);
            e.target.select();
            interactionStart("search");
          }}
          onBlur={() => interactionEnd("search")}
          onKeyDown={onKey}
        />
        {query && (
          <button type="button" className="icon-btn small" aria-label={`Clear ${label}`} onMouseDown={(e) => e.preventDefault()} onClick={() => { setQuery(""); onSelect(null); ref.current?.focus(); }}>
            <CloseIcon size={18} />
          </button>
        )}
        {browseable && (
          <button type="button" className={`icon-btn small ${view === "tree" ? "active" : ""}`} aria-label="Browse categories" title="Browse categories" aria-expanded={open && view === "tree"} onMouseDown={(e) => e.preventDefault()} onClick={() => { setBrowsing(browsing == null ? "" : null); setQuery(""); menu.setOpen(true); ref.current?.focus(); }}>
            <GridIcon size={18} />
          </button>
        )}
        {trailing}
      </div>
      {showPanel && (
        <div className="osearch-pop">
          {(view === "tree" || view === "category") && (
            <div className="osearch-crumbs">
              <button type="button" className="icon-btn small" aria-label="Back" onMouseDown={(e) => e.preventDefault()} onClick={back} disabled={view === "tree" && browsing === ""}>
                <BackIcon size={16} />
              </button>
              <button type="button" className="crumb" onMouseDown={(e) => e.preventDefault()} onClick={() => setBrowsing("")}>All categories</button>
              {crumbs.map((c, i) => <span key={i} className="crumb-sep">› <span className="crumb-cur">{c}</span></span>)}
              {view === "category" && <span className="crumb-count">{totalInCategory} {totalInCategory === 1 ? "record" : "records"}</span>}
            </div>
          )}
          {view === "suggest" && rows.length > 0 && <div className="osearch-heading">Highlights</div>}
          {rows.length > 0 ? (
            <ul className="osearch-list" id={listId} role={view === "tree" ? "tree" : "listbox"} aria-label={view === "tree" ? "Browse categories" : "Results"}>
              {rows.map((r, i) =>
                r.kind === "node" ? (
                  <li key={r.id} id={`${listId}-${i}`} role="treeitem" aria-selected={i === active} aria-expanded={r.leaf ? undefined : false} className={`node-row ${i === active ? "active" : ""} ${r.count ? "" : "empty"}`} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => openNode(r)}>
                    <span className="osearch-text">
                      <span className="osearch-name">{r.label}</span>
                      {r.hint && <span className="osearch-sub">{r.hint}</span>}
                    </span>
                    <span className="node-count">{r.count ? r.count : "none yet"}</span>
                    <ChevronRightIcon size={18} />
                  </li>
                ) : (
                  <li key={r.obj.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? "active" : ""} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(r.obj)}>
                    <ObjectIcon obj={r.obj} size={36} />
                    <span className="osearch-text">
                      <span className="osearch-name">{r.obj.name}</span>
                      <span className="osearch-sub">{TYPE_LABEL[r.obj.type]} · {data ? locationOf(data, r.obj) : ""}</span>
                    </span>
                    <span className="osearch-meta">
                      {distanceLabel(r.obj)}
                      {!r.obj.route.supported && <span className="tag">No route</span>}
                    </span>
                  </li>
                ),
              )}
            </ul>
          ) : emptyText ? (
            <div className="osearch-empty" role="status">{emptyText}</div>
          ) : null}
          {view === "category" && totalInCategory > limit && (
            <button type="button" className="text-btn osearch-more" onMouseDown={(e) => e.preventDefault()} onClick={() => setLimit((l) => l + PAGE)}>
              Show more ({totalInCategory - limit} more)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
