import { useEffect, useState, type KeyboardEvent } from "react";
import type { Endpoint, Mode, Place } from "../types";
import { BackIcon, CloseIcon, LocateIcon, PinIcon, RainIcon, SunIcon, TargetIcon } from "./Icons";

export function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const item = (m: Mode, label: string) => {
    const on = mode === m;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => onChange(m)}
        className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[14px] transition ${
          on ? "bg-white font-medium text-brand shadow-sm" : "text-slate-600 hover:text-ink"
        }`}
        data-testid={`mode-${m}`}
      >
        {m === "shade" ? <SunIcon size={17} /> : <RainIcon size={17} />}
        {label}
      </button>
    );
  };
  return (
    <div role="radiogroup" aria-label="Route type" className="flex gap-1 rounded-card bg-slate-200/80 p-1">
      {item("shade", "Shaded")}
      {item("rain", "Sheltered")}
    </div>
  );
}

// One message for every search with no match: the list cannot tell a missing place from a place outside the areas.
const NO_MATCH = "No place by that name in the six covered areas. Try another name, or tap the map.";

function categoryLabel(c: string): string {
  const s = c.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Search box and place list as a combobox: focus stays in the box, arrow keys move through the places,
// Enter picks the highlighted one (or the first), Escape clears the box.
function useCombobox(id: string, places: Place[], onPick: (p: Place) => void, query: string, onQuery: (q: string) => void) {
  const [active, setActive] = useState(-1);
  const key = places.map((pl) => pl.node_id).join(",");
  useEffect(() => setActive(-1), [key]);
  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [id, active]);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && query) {
      e.preventDefault();
      onQuery("");
      return;
    }
    if (!places.length) return;
    // Enter on an empty box must not pick a suggestion by accident, least of all over a kept start or end.
    if (e.key === "Enter" && active < 0 && !query.trim()) {
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % places.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? places.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      onPick(places[Math.max(0, active)]);
    }
  };
  return {
    active,
    input: {
      role: "combobox" as const,
      "aria-expanded": places.length > 0,
      "aria-controls": id,
      "aria-autocomplete": "list" as const,
      "aria-activedescendant": active >= 0 ? `${id}-${active}` : undefined,
      onKeyDown,
    },
  };
}

// where names the neighbourhood or area of a place, so a name found in several areas reads apart.
type Where = (p: Place) => string | null;

export function PlaceList({ id, places, onPick, testid, active, where }: { id: string; places: Place[]; onPick: (p: Place) => void; testid: string; active: number; where?: Where }) {
  return (
    <ul className="divide-y divide-slate-100" role="listbox" id={id} aria-label="Places" data-testid={testid}>
      {places.map((pl, i) => (
        <li
          key={`${pl.area ?? ""}-${pl.name}-${pl.node_id}`}
          id={`${id}-${i}`}
          role="option"
          aria-selected={i === active}
          onClick={() => onPick(pl)}
          className={`flex min-h-11 w-full cursor-pointer items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50 ${i === active ? "bg-blue-50" : ""}`}
          data-testid="place-option"
        >
          <PinIcon size={16} className="mt-0.5 shrink-0 text-brand" />
          <span className="min-w-0">
            <span className="block truncate text-[15px] text-ink">{pl.name}</span>
            {/* detail tells apart places that share a name, for example "Muji, in Greenbelt 3". */}
            <span className="block truncate text-[12px] text-slate-600">
              {[`${categoryLabel(pl.category)}${pl.detail ? `, ${pl.detail}` : ""}`, where?.(pl)].filter(Boolean).join(" · ")}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// Route data loads after the first tap; until then the place list says so.
export type DataState = { status: "idle" | "loading" | "ready" | "error"; onRetry: () => void };

function DataNote({ data }: { data: DataState }) {
  if (data.status === "error") {
    return (
      <div className="px-3 pb-3 pt-1 text-[13px] text-slate-700" role="alert" data-testid="data-error">
        Places could not load. Check your connection.
        <button type="button" onClick={data.onRetry} className="ml-2 inline-flex min-h-11 items-center font-medium text-brand underline underline-offset-2">
          Try again
        </button>
      </div>
    );
  }
  return (
    <p className="flex items-center gap-2 px-3 pb-3 pt-1 text-[13px] text-slate-600" role="status" data-testid="data-loading">
      <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-brand motion-reduce:animate-none" aria-hidden="true" />
      Loading places...
    </p>
  );
}

interface SearchProps {
  data: DataState;
  mode: Mode;
  query: string;
  onQuery: (q: string) => void;
  results: Place[];
  suggested: Place[];
  onPick: (p: Place) => void;
  onBack: (() => void) | null;
  where?: Where;
}

export function DestinationSearch({ data, mode, query, onQuery, results, suggested, onPick, onBack, where }: SearchProps) {
  const list = data.status === "ready" ? (query.trim() ? results : suggested) : [];
  const combo = useCombobox("dest-places", list, onPick, query, onQuery);
  return (
    <div className="rounded-card bg-white shadow-card" data-testid="destination-panel">
      <div className="flex items-center gap-2 border-b border-slate-100 p-2">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100">
            <BackIcon size={18} />
          </button>
        )}
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 pl-3 focus-within:border-brand">
          <PinIcon size={18} className="shrink-0 text-brand" />
          <input
            autoFocus
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={mode === "shade" ? "Find shaded routes to..." : "Find sheltered routes to..."}
            className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-slate-500"
            aria-label="Destination"
            data-testid="destination-input"
            {...combo.input}
          />
          {query && (
            <button type="button" onClick={() => onQuery("")} aria-label="Clear" className="grid h-11 w-11 shrink-0 place-items-center text-slate-500 hover:text-ink">
              <CloseIcon size={16} />
            </button>
          )}
        </label>
      </div>
      <p className="px-3 pt-2 text-[12px] text-slate-600">{query.trim() ? "Places" : <><span lang="fil">Saan ka papunta?</span> Suggested places</>}</p>
      {data.status !== "ready" ? (
        <DataNote data={data} />
      ) : list.length ? (
        <PlaceList id="dest-places" places={list} onPick={onPick} testid="destination-results" active={combo.active} where={where} />
      ) : (
        <p className="px-3 pb-3 pt-1 text-[13px] text-slate-500">
          {query.trim() ? NO_MATCH : "Type a place name, or tap the map."}
        </p>
      )}
    </div>
  );
}

interface TripProps {
  data: DataState;
  from: Endpoint | null;
  to: Endpoint | null;
  active: "from" | "to";
  query: string;
  onQuery: (q: string) => void;
  onActivate: (f: "from" | "to") => void;
  results: Place[];
  suggested: Place[];
  onPick: (p: Place) => void;
  onLocate: () => void;
  locating: boolean;
  notice: string | null;
  onBack: () => void;
  where?: Where;
}

export function TripFields(p: TripProps) {
  const list = p.data.status === "ready" ? (p.query.trim() ? p.results : p.suggested) : [];
  const combo = useCombobox("trip-places", list, p.onPick, p.query, p.onQuery);
  const field = (key: "from" | "to") => {
    const ep = p[key];
    const on = p.active === key;
    const Icon = key === "from" ? TargetIcon : PinIcon;
    return (
      <div className={`flex items-center gap-3 rounded-xl px-2 ${on ? "bg-blue-50" : ""}`}>
        <Icon size={18} className="shrink-0 text-brand" />
        {on ? (
          <input
            autoFocus
            value={p.query}
            onChange={(e) => p.onQuery(e.target.value)}
            placeholder={ep ? ep.label : key === "from" ? "Where are you now?" : "Where to?"}
            className={`h-11 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none ${ep ? "placeholder:text-ink" : "placeholder:text-slate-500"}`}
            aria-label={key === "from" ? "Start" : "Destination"}
            data-testid={`${key}-input`}
            {...combo.input}
          />
        ) : (
          <button type="button" onClick={() => p.onActivate(key)} className="h-11 min-w-0 flex-1 truncate text-left text-[15px] text-ink" data-testid={`${key}-field`}>
            {ep ? ep.label : <span className="text-slate-500">{key === "from" ? "Start from" : "End at"}</span>}
          </button>
        )}
      </div>
    );
  };
  return (
    <div className="rounded-card bg-white shadow-card" data-testid="trip-panel">
      <div className="flex items-start gap-1 p-2">
        <button type="button" onClick={p.onBack} aria-label="Back" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100">
          <BackIcon size={18} />
        </button>
        <div className="relative min-w-0 flex-1">
          {field("from")}
          <div className="ml-[17px] h-3 border-l-2 border-dotted border-slate-300" aria-hidden="true" />
          {field("to")}
        </div>
      </div>
      <div className="border-t border-slate-100 px-3 py-2">
        <p className="text-[12px] text-slate-500"><span lang="fil">{p.active === "from" ? "Nasaan ka ngayon?" : "Saan ka papunta?"}</span> Pick a place or tap the map.</p>
        {p.active === "from" && (
          <button
            type="button"
            onClick={p.onLocate}
            disabled={p.locating}
            className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[14px] text-brand hover:border-brand disabled:opacity-60"
            data-testid="use-location"
          >
            <LocateIcon size={16} />
            {p.locating ? "Finding you..." : "Use my location"}
          </button>
        )}
        {p.notice && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[13px] text-amber-900" role="status" data-testid="trip-notice">
            {p.notice}
          </p>
        )}
      </div>
      {p.data.status !== "ready" && <DataNote data={p.data} />}
      {p.data.status === "ready" && list.length > 0 && (
        // Focusable, so keyboard users can scroll the list too (WCAG 2.1.1).
        <div className="max-h-[38vh] overflow-y-auto border-t border-slate-100" tabIndex={0} aria-label="Places">
          <PlaceList id="trip-places" places={list} onPick={p.onPick} testid={`${p.active}-results`} active={combo.active} where={p.where} />
        </div>
      )}
      {p.data.status === "ready" && p.query.trim() && !list.length && <p className="px-3 pb-3 text-[13px] text-slate-500">{NO_MATCH}</p>}
    </div>
  );
}
