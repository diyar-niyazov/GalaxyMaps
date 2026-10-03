import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useStore } from "../state/store";
import { search } from "../lib/search";
import { formatDistance } from "../lib/format";
import type { CatalogObject } from "../lib/types";
import { ObjectIcon } from "./ObjectIcon";
import { CloseIcon } from "./icons";

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
}

export function ObjectSearch({ value, onSelect, placeholder, label, leading, trailing, className, autoFocus, inputRef, suggestions }: Props) {
  const data = useStore((s) => s.data);
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const listId = useId();

  useEffect(() => setQuery(value?.name ?? ""), [value]);

  const results = useMemo(() => {
    if (!data) return [];
    const q = query.trim();
    if (!q || q === value?.name) return (suggestions ?? []).map((obj) => ({ obj }));
    return search(data.search, q, 8);
  }, [data, query, value, suggestions]);

  const choose = (obj: CatalogObject) => {
    setOpen(false);
    setQuery(obj.name);
    onSelect(obj);
    ref.current?.blur();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      const r = results[active] ?? results[0];
      if (r) choose(r.obj);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery(value?.name ?? "");
      ref.current?.blur();
    }
  };

  const showList = open && results.length > 0;
  const noMatch = open && query.trim() && query !== value?.name && results.length === 0;

  return (
    <div className={`osearch ${className ?? ""} ${showList || noMatch ? "is-open" : ""}`}>
      <div className="osearch-field">
        {leading}
        <input
          ref={ref}
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          placeholder={placeholder}
          value={query}
          autoFocus={autoFocus}
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={(e) => {
            setOpen(true);
            e.target.select();
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
        />
        {query && (
          <button
            type="button"
            className="icon-btn small"
            aria-label={`Clear ${label}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery("");
              onSelect(null);
              ref.current?.focus();
            }}
          >
            <CloseIcon size={18} />
          </button>
        )}
        {trailing}
      </div>
      {showList && (
        <ul className="osearch-list" id={listId} role="listbox">
          {results.map((r, i) => (
            <li
              key={r.obj.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(r.obj)}
            >
              <ObjectIcon obj={r.obj} size={28} />
              <span className="osearch-text">
                <span className="osearch-name">{r.obj.name}</span>
                <span className="osearch-sub">{r.obj.subtitle}</span>
              </span>
              <span className="osearch-meta">
                {r.obj.distance && r.obj.id !== "sun" ? formatDistance(r.obj.distance.valueKm) : ""}
                {!r.obj.route.supported && <span className="tag warn">No route</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {noMatch && (
        <div className="osearch-list osearch-empty" role="status">
          No destination named “{query.trim()}” in the SpaceMaps catalog.
        </div>
      )}
    </div>
  );
}
