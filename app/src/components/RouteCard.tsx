import { useEffect, useMemo, useRef, useState } from "react";
import type { Endpoint, Mode, Result, SegKind } from "../types";
import { COLORS } from "../config";
import { hasUnchecked, type DisplayRoute } from "../lib/display";
import { ribbonParts } from "../lib/ribbon";
import { REC_MAX_DETOUR, REC_MIN_CUT } from "../lib/routerClient";
import { fmtDist, fmtKm } from "../lib/time";
import { AlertIcon, ArrowRight, ChevronDown, ListIcon, RainIcon, StepFreeIcon, SunIcon, WalkIcon } from "./Icons";

function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { v: T; label: string; icon: JSX.Element; testid: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 rounded-full border border-slate-200 bg-white p-0.5 shadow-sm">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[13px] md:px-2.5 ${value === o.v ? "bg-blue-50 font-medium text-brand" : "text-slate-600 hover:text-ink"}`}
          data-testid={o.testid}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProfileToggles(p: { stepFree: boolean; onStepFree: (v: boolean) => void; mode: Mode; onMode: (m: Mode) => void }) {
  return (
    // Wraps instead of scrolling sideways, and never shrinks under a capped panel (WCAG 1.4.10).
    <div className="flex shrink-0 flex-wrap gap-2">
      <Seg
        label="Walking profile"
        value={p.stepFree ? "free" : "walk"}
        onChange={(v) => p.onStepFree(v === "free")}
        options={[
          { v: "walk", label: "Walking", icon: <WalkIcon size={15} />, testid: "profile-walk" },
          { v: "free", label: "Step-free", icon: <StepFreeIcon size={15} />, testid: "profile-stepfree" },
        ]}
      />
      <Seg
        label="Route goal"
        value={p.mode}
        onChange={p.onMode}
        options={[
          { v: "shade", label: "Shaded", icon: <SunIcon size={15} />, testid: "goal-cool" },
          { v: "rain", label: "Sheltered", icon: <RainIcon size={15} />, testid: "goal-dry" },
        ]}
      />
    </div>
  );
}

function fmtMin(m: number): string {
  if (m <= 0) return "0";
  // One decimal below 100, so the headline's difference matches the minutes shown under it.
  return m < 100 ? m.toFixed(1).replace(/\.0$/, "") : String(Math.round(m));
}

/** Minutes as text. Under a minute it gives seconds, so 0.2 min reads as the 12 seconds it is. */
export function fmtDuration(m: number): string {
  if (m <= 0) return "0 min";
  if (m < 1) return `${Math.round(m * 60)} sec`;
  return `${fmtMin(m)} min`;
}

export type Highlight = { coords: [number, number][]; color: string } | null;

function kindLook(kind: SegKind, mode: Mode, night: boolean): { label: string; color: string } {
  if (kind === "roof") return { label: "Roof", color: COLORS.roof };
  if (kind === "unchecked") return { label: "Unchecked path", color: COLORS.unchecked };
  if (kind === "building") return { label: "Building shade", color: COLORS.building };
  if (kind === "tree") return { label: "Tree shade", color: COLORS.tree };
  return mode === "shade" && !night ? { label: "Sun", color: COLORS.sun } : { label: "No roof", color: night ? COLORS.nightOpen : COLORS.sun };
}

// The walk from start to end as one bar, each stretch sized by its distance and coloured by its cover.
// The whole bar is one 44 px control: hover, tap, or drag along it, or use the arrow keys, to light a
// stretch up on the map. Stretches can be 2 px wide, too small to tap one by one (WCAG 2.5.8).
function Ribbon({ d, mode, night, onHighlight }: { d: DisplayRoute; mode: Mode; night: boolean; onHighlight: (h: Highlight) => void }) {
  const parts = useMemo(() => ribbonParts(d.route.segments), [d.route.segments]);
  const [active, setActive] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pick = (i: number | null) => {
    setActive(i);
    const x = i === null ? null : parts[i];
    onHighlight(x ? { coords: x.coords, color: kindLook(x.kind, mode, night).color } : null);
  };
  // A new route or hour starts with nothing picked.
  useEffect(() => {
    setActive(null);
    onHighlight(null);
  }, [parts]);
  if (!parts.length) return null;
  const indexAt = (clientX: number) => {
    const box = bar.current?.getBoundingClientRect();
    if (!box?.width) return null;
    const f = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    const i = parts.findIndex((x) => f <= x.to);
    return i < 0 ? parts.length - 1 : i;
  };
  const a = active === null ? null : parts[active];
  const n = parts.length;
  const step = (delta: number) => pick(active === null ? (delta > 0 ? 0 : n - 1) : Math.min(n - 1, Math.max(0, active + delta)));
  return (
    <div onMouseLeave={() => !dragging.current && pick(null)}>
      <div
        ref={bar}
        role="slider"
        tabIndex={0}
        aria-label="The walk from start to end, by cover"
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={(active ?? 0) + 1}
        aria-valuetext={a ? `${kindLook(a.kind, mode, night).label}, ${fmtDist(a.metres)}, stretch ${(active ?? 0) + 1} of ${n}` : `${n} stretches. Use the arrow keys to pick one.`}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const i = indexAt(e.clientX);
          pick(i === active ? null : i);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" || dragging.current) {
            const i = indexAt(e.clientX);
            if (i !== active) pick(i);
          }
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={(e) => {
          const keys: Record<string, () => void> = {
            ArrowRight: () => step(1),
            ArrowUp: () => step(1),
            ArrowLeft: () => step(-1),
            ArrowDown: () => step(-1),
            Home: () => pick(0),
            End: () => pick(n - 1),
          };
          if (!keys[e.key]) return;
          e.preventDefault();
          keys[e.key]();
        }}
        className="flex h-11 cursor-pointer touch-pan-y items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand"
        data-testid="route-ribbon"
      >
        {parts.map((x, i) => (
          <span
            key={i}
            className={`transition-opacity motion-reduce:transition-none ${i === 0 ? "rounded-l-full" : ""} ${i === n - 1 ? "rounded-r-full" : ""} ${
              a && active !== i ? "opacity-35" : ""
            } ${active === i ? "h-4 ring-2 ring-ink" : "h-3"}`}
            style={{ width: `${(x.to - x.from) * 100}%`, background: kindLook(x.kind, mode, night).color }}
            data-testid="ribbon-part"
          />
        ))}
      </div>
      <p className="flex justify-between text-[12px] leading-tight text-slate-600" aria-hidden="true">
        <span>Start</span>
        {a && (
          <span className="font-medium text-ink" data-testid="ribbon-caption">
            {kindLook(a.kind, mode, night).label}, {fmtDist(a.metres)}
          </span>
        )}
        <span>End</span>
      </p>
    </div>
  );
}

export interface Headline {
  big: string;
  small: string | null;
  /** "hero" is the big blue figure, kept for a saving of a minute or more. */
  size: "hero" | "large" | "plain";
}

const HEAD_SIZE: Record<Headline["size"], string> = { hero: "text-[28px] text-brand", large: "text-[24px] text-ink", plain: "text-[20px] text-ink" };

// The card's big figure: how this walk compares with the others on screen.
// Shade mode counts minutes in sun; rain mode counts minutes without a roof. At night it is not shown.
// Every line compares numbers the card shows, so it stays true for any set of routes.
export function headline(d: DisplayRoute, display: DisplayRoute[], result: Result, mode: Mode): Headline | null {
  if (result.state !== "ok") return null;
  const shortest = result.routes.find((x) => x.label === "shortest");
  if (!shortest) return null;
  const word = mode === "shade" ? "sun" : "without a roof";
  // Sun minutes are multiples of 0.1. Rounding the gap drops float noise such as 0.3 - 0.2.
  const gap = (a: number, b: number) => Math.round((a - b) * 10) / 10;
  if (!d.labels.includes("shortest")) {
    const saved = gap(shortest.sun_minutes, d.route.sun_minutes);
    if (saved < 0.1) return null;
    return { big: `${fmtDuration(saved)} less ${word}`, small: "than the shortest walk", size: saved >= 1 ? "hero" : "plain" };
  }
  const others = display.filter((x) => x !== d);
  if (!others.length) return { big: `Shortest walk is also the ${mode === "shade" ? "shadiest" : "most sheltered"}`, small: null, size: "plain" };
  const top = others.reduce((a, b) => (b.route.sun_minutes < a.route.sun_minutes ? b : a));
  const more = gap(shortest.sun_minutes, top.route.sun_minutes);
  const than = `than the ${top.short.toLowerCase()} walk`;
  if (!result.recommendedIsShortest) {
    return more < 0.1 ? null : { big: `${fmtDuration(more)} more ${word}`, small: than, size: more >= 1 ? "large" : "plain" };
  }
  // The shortest walk is recommended because no other walk on screen meets the rule.
  // Say what the shadier walk costs, in the minutes the tabs show.
  const walk = top.route.minutes - shortest.minutes;
  const same = mode === "shade" ? "about the same sun" : "about the same time without a roof";
  if (walk >= 1) return { big: `${walk} min less walking`, small: `${than}, for ${more >= 0.1 ? `${fmtDuration(more)} more ${word}` : same}`, size: "large" };
  if (more >= 0.1) return { big: `Only ${fmtDuration(more)} more ${word}`, small: than, size: "plain" };
  return { big: same[0].toUpperCase() + same.slice(1), small: `as the ${top.short.toLowerCase()} walk`, size: "plain" };
}

function CoverBar({ d, mode, night, onHighlight, legend }: { d: DisplayRoute; mode: Mode; night: boolean; onHighlight: (h: Highlight) => void; legend: boolean }) {
  const { roof_m, building_m, tree_m, sun_m } = d.route.split;
  const total = roof_m + building_m + tree_m + sun_m || 1;
  const parts =
    mode === "shade" && !night
      ? [
          { k: "Roof", m: roof_m, c: COLORS.roof },
          { k: "Building shade", m: building_m, c: COLORS.building },
          { k: "Tree shade", m: tree_m, c: COLORS.tree },
          { k: "Sun", m: sun_m, c: COLORS.sun },
        ]
      : [
          { k: "Roof", m: roof_m, c: COLORS.roof },
          { k: "No roof", m: building_m + tree_m + sun_m, c: night ? COLORS.nightOpen : COLORS.sun },
        ];
  return (
    <div className="mt-1" data-testid="cover-split">
      {d.route.segments.length ? (
        <Ribbon d={d} mode={mode} night={night} onHighlight={onHighlight} />
      ) : (
        <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={parts.map((x) => `${x.k} ${Math.round((100 * x.m) / total)}%`).join(", ")}>
          {parts.map((x) => (x.m > 0 ? <span key={x.k} style={{ width: `${(100 * x.m) / total}%`, background: x.c }} /> : null))}
        </div>
      )}
      <ul className={`mt-1 flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-slate-600 ${legend ? "flex" : "sr-only"}`}>
        {parts.map((x) => (
          <li key={x.k} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: x.c }} />
            {x.k} {Math.round((100 * x.m) / total)}%
          </li>
        ))}
      </ul>
    </div>
  );
}

interface CardProps {
  display: DisplayRoute[];
  selected: number;
  onSelect: (i: number) => void;
  result: Result;
  mode: Mode;
  from: Endpoint;
  to: Endpoint;
  onEdit: (f: "from" | "to") => void;
  when: string;
  includeUnchecked: boolean;
  onIncludeUnchecked: (v: boolean) => void;
  onSteps: () => void;
  onNavigate: () => void;
  onAbout: () => void;
  dataDate: string;
  // Phones fold notes, warnings, and options behind a Details row so the map keeps its height.
  compact: boolean;
  toggles: JSX.Element;
  onHighlight: (h: Highlight) => void;
}

export function RouteCard(p: CardProps) {
  const night = p.result.state === "night";
  const d = p.display[p.selected] ?? p.display[0];
  const r = d.route;
  // The router's warnings and notes are the source. The UI adds the Taglish helper where one fits.
  const warnings = r.warnings.map((w) => ({ text: hasUnchecked(r) && /unchecked access/i.test(w) ? `${w} Dashed on the map.` : w, tl: taglish(w) }));
  if (r.steps.some((s) => s.flags.includes("hours") && !s.closesAt)) {
    warnings.push({ text: "Opening hours not confirmed for a passage on this route.", tl: null });
  }
  // The headline, the rule line, and the night box already say these router notes. Say each fact once.
  const said = (n: string) =>
    /^No meaningfully /.test(n) ||
    (p.display.length === 1 && / route is the shortest route\.$/.test(n)) ||
    (night && /after dark|sun is down|too low for shade|shade does not apply/i.test(n));
  const notes = p.result.notes.filter((n) => !said(n));
  const exposedWord = p.mode === "shade" ? "in sun" : "without a roof";
  const pct = (x: number) => Math.round(x * 100);
  const rule = `The recommended walk is at most ${pct(REC_MAX_DETOUR)}% longer than the shortest and has at least ${pct(REC_MIN_CUT)}% less time ${exposedWord}. If no walk meets both, the shortest is recommended.`;
  // Router night starts at 3 degrees. Between 0 and 3 degrees the sun is still up.
  const alt = p.result.sun?.altitude;
  const nightLine = `${alt !== undefined && alt > 0 ? "The sun is too low for shade." : "Shade does not apply after dark."} ${
    p.display.length > 1 ? "These are the shortest and the most sheltered routes." : "The shortest route is also the most sheltered."
  }`;
  const [open, setOpen] = useState(false);
  const showDetails = !p.compact || open;
  const details = (
    <>
        {!night && (
          <p className="mt-2 text-[13px] text-slate-600" data-testid="rec-rule">
            {rule}
          </p>
        )}
        {notes.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[13px] text-slate-600" data-testid="route-notes">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        {warnings.length > 0 && (
          <ul className="mt-2 space-y-1 text-[13px] text-amber-900" data-testid="route-warnings">
            {warnings.map((w) => (
              <Warn key={w.text}>
                {w.text}
                {w.tl && (
                  <span className="text-amber-700" lang="fil">
                    {" "}
                    {w.tl}
                  </span>
                )}
              </Warn>
            ))}
          </ul>
        )}
    </>
  );
  const head = headline(d, p.display, p.result, p.mode);
  return (
    <div className="rounded-card bg-white shadow-card" data-testid="route-card">
      {p.display.length > 1 && (
        <div
          className="flex gap-1 overflow-x-auto border-b border-slate-100 p-2"
          role="tablist"
          aria-label="Routes"
          // Arrow keys move between route tabs, as in the ARIA tabs pattern. Only the selected tab is a Tab stop.
          onKeyDown={(e) => {
            const n = p.display.length;
            const next = e.key === "ArrowRight" ? (p.selected + 1) % n : e.key === "ArrowLeft" ? (p.selected - 1 + n) % n : null;
            if (next === null) return;
            e.preventDefault();
            p.onSelect(next);
            const tabs = e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]');
            tabs[next]?.focus();
          }}
        >
          {p.display.map((x, i) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={i === p.selected}
              tabIndex={i === p.selected ? 0 : -1}
              onClick={() => p.onSelect(i)}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] ${
                i === p.selected ? "border-slate-200 bg-white font-medium text-ink shadow-sm" : "border-transparent text-slate-500 hover:text-ink"
              }`}
              data-testid="route-tab"
            >
              {i === p.selected && <span className={`h-2 w-2 rounded-full ${x.labels.includes("recommended") ? "bg-green-500" : "bg-brand"}`} />}
              {x.title}
            </button>
          ))}
        </div>
      )}
      <div className="px-4 pb-3 pt-3">
        {p.display.length === 1 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-0.5 text-[12.5px] font-medium text-ink">
            <span className={`h-2 w-2 rounded-full ${d.labels.includes("recommended") ? "bg-green-500" : "bg-brand"}`} />
            {d.title}
          </span>
        )}
        {head ? (
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2" data-testid="headline">
            <span className={`font-semibold leading-tight tracking-tight ${HEAD_SIZE[head.size]}`}>{head.big}</span>
            {head.small && <span className="text-[14px] text-slate-600">{head.small}</span>}
          </p>
        ) : null}
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-ink" data-testid="route-summary">
          <span className={head ? "text-[15px] font-medium text-brand" : "text-[22px] font-semibold text-brand"}>
            {d.pct}% {d.pctWord}
          </span>
          <span className="text-[15px] text-slate-600">
            {r.minutes} min · {fmtKm(r.length_m)}
          </span>
        </p>
        {!night && (
          <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-slate-700" data-testid="sun-minutes">
            {p.mode === "shade" ? <SunIcon size={15} className="text-amber-500" /> : <RainIcon size={15} className="text-brand" />}
            {fmtDuration(r.sun_minutes)} {exposedWord}
          </p>
        )}
        {/* Phones keep the legend under Details, so the map keeps more height. The ribbon names a stretch on tap. */}
        <CoverBar d={d} mode={p.mode} night={night} onHighlight={p.onHighlight} legend={showDetails} />

        {night && (
          <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-[13px] text-ink" data-testid="night-note">
            {nightLine}
          </p>
        )}
        {!p.compact && details}

        <div className="mt-1 flex min-w-0 items-center gap-2 text-[14px] text-ink">
          <button type="button" onClick={() => p.onEdit("from")} className="min-h-11 min-w-0 truncate hover:text-brand" data-testid="edit-from">
            {p.from.label}
          </button>
          <ArrowRight size={14} className="shrink-0 text-slate-500" />
          <button type="button" onClick={() => p.onEdit("to")} className="min-h-11 min-w-0 truncate hover:text-brand" data-testid="edit-to">
            {p.to.label}
          </button>
        </div>

        {/* Sticky, so Steps and Navigate stay in reach when the card scrolls inside a short panel. */}
        <div className="sticky bottom-0 -mx-4 mt-3 grid grid-cols-[auto_1fr] gap-2 bg-white px-4 pb-1 pt-2">
          <button
            type="button"
            onClick={p.onSteps}
            className="flex h-11 items-center gap-1.5 rounded-card border border-slate-200 px-3 text-[14px] text-ink hover:border-slate-300"
            data-testid="show-steps"
          >
            <ListIcon size={16} />
            Show all steps
          </button>
          <button
            type="button"
            onClick={p.onNavigate}
            className="flex h-11 items-center justify-center gap-2 rounded-card bg-brand text-[15px] font-medium text-white hover:bg-blue-700"
            data-testid="navigate"
          >
            Navigate
            <ArrowRight size={16} />
          </button>
        </div>

        {p.compact && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="mt-1 flex min-h-11 w-full items-center justify-between gap-2 text-left text-[13px] text-slate-600"
            data-testid="route-details-toggle"
          >
            <span>
              {warnings.length > 0 && (
                <span className="text-amber-800">
                  {warnings.length} {warnings.length === 1 ? "warning" : "warnings"} ·{" "}
                </span>
              )}
              Details and options
            </span>
            <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
        {p.compact && open && details}
        {p.compact && open && <div className="mt-3">{p.toggles}</div>}
        {showDetails && (
          <>
            <UncheckedToggle value={p.includeUnchecked} onChange={p.onIncludeUnchecked} />
            <p className="mt-2 text-[12px] text-slate-500">
              Leaving {p.when}. Data built {p.dataDate}.{" "}
              <button type="button" onClick={p.onAbout} className="inline-flex min-h-11 items-center text-brand hover:underline">
                Method and limits
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function UncheckedToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-slate-700">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-brand"
        data-testid="include-unchecked"
      />
      Include paths with unchecked access
    </label>
  );
}

function taglish(w: string): string | null {
  if (/^uses stairs/i.test(w)) return "May hagdan.";
  if (/after dark/i.test(w)) return "Madilim pag gabi.";
  const m = /closes at ([^,.]+)/i.exec(w);
  return m ? `Sarado ng ${m[1]}.` : null;
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-1.5">
      <AlertIcon size={14} className="mt-0.5 shrink-0 text-amber-600" />
      <span>{children}</span>
    </li>
  );
}

interface StateProps {
  result: Result;
  onEdit: () => void;
  onAbout: () => void;
  includeUnchecked: boolean;
  onIncludeUnchecked: (v: boolean) => void;
  stepFree: boolean;
  from: string;
  to: string;
  // Names of the ends that snap outside the largest routable network, such as inside a gated village.
  gatedEnds: string[];
}

// Router notes that give the cause of a no-route result (route.ts). The card turns each into its fix.
const SAME_PLACE = "Start and end are the same place.";
const ONLY_UNCHECKED = /^A route exists on paths with unchecked access/;
const ONLY_STEPS = "Every route between these points uses steps.";
const CLOSED = "Every route between these points passes through a place that is closed at this time.";
const NO_PATH = "No walking route connects these points at any hour.";
const COMBINED = /^A route exists only at other hours or on paths with unchecked access/;
const COMBINED_STEPS = /^A route exists only with steps, and only at other hours/;
const isCause = (n: string) =>
  n === SAME_PLACE || n === ONLY_STEPS || n === CLOSED || n === NO_PATH || ONLY_UNCHECKED.test(n) || COMBINED.test(n) || COMBINED_STEPS.test(n);

const andList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : (xs[0] ?? ""));

/** The no-route card's title and its one fix, from the router's cause note and any gated end. */
export function noRouteText(notes: string[], from: string, to: string, gatedEnds: string[]): { title: string; fix: string } {
  const title = `No walking route from ${from} to ${to}.`;
  const gate = gatedEnds.length > 0 ? `${andList(gatedEnds)} ${gatedEnds.length > 1 ? "sit" : "sits"} behind a gate or inside a gated village.` : "";
  if (notes.includes(SAME_PLACE)) return { title: SAME_PLACE, fix: "Pick a different start or end." };
  if (notes.includes(ONLY_STEPS)) return { title, fix: "Every route between them uses steps. Turn off Step-free to see them." };
  if (notes.some((n) => ONLY_UNCHECKED.test(n))) {
    return {
      title,
      fix: gate ? `${gate} Include paths with unchecked access, or pick a nearby street.` : "A route exists on paths with unchecked access. Include those paths to see it.",
    };
  }
  if (notes.includes(CLOSED)) return { title, fix: "Every route between them passes through a place that is closed at this time. Try another time." };
  if (notes.some((n) => COMBINED.test(n))) return { title, fix: "A route exists only at other hours and on paths with unchecked access. Try another time, and include those paths." };
  if (notes.some((n) => COMBINED_STEPS.test(n))) {
    return { title, fix: "A route exists only with steps, at other hours or on paths with unchecked access. Turn off Step-free, then try another time or include those paths." };
  }
  return { title, fix: gate ? `${gate} Pick a nearby street.` : "No walking route connects them at any hour. Pick a nearby start or end." };
}

export function StateMessage({ result, onEdit, onAbout, includeUnchecked, onIncludeUnchecked, stepFree, from, to, gatedEnds }: StateProps) {
  const outside = result.state === "outside";
  const text = outside ? null : noRouteText(result.notes, from, to, gatedEnds);
  // The fix line already says the cause note. The step-free note only matters with Step-free on.
  const notes = result.notes.filter((n) => !(text && isCause(n)) && (stepFree || !/step-free/i.test(n)));
  return (
    <div className="rounded-card bg-white p-4 shadow-card" data-testid="route-state" data-state={result.state}>
      <p className="text-[16px] font-medium text-ink">{text ? text.title : "This start or end is outside the covered area."}</p>
      <p className="mt-1 text-[14px] text-slate-600" data-testid="state-fix">
        {text ? text.fix : "Routing works inside the dashed box, the covered area. Pick a place inside it."}
      </p>
      {notes.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[12px] text-slate-500">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {!outside && <UncheckedToggle value={includeUnchecked} onChange={onIncludeUnchecked} />}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onEdit} className="h-11 rounded-card bg-brand px-4 text-[14px] font-medium text-white hover:bg-blue-700">
          Change start or end
        </button>
        <button type="button" onClick={onAbout} className="h-11 rounded-card border border-slate-200 px-4 text-[14px] text-ink">
          Method
        </button>
      </div>
    </div>
  );
}
