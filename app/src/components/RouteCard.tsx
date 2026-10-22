import { useEffect, useMemo, useRef, useState } from "react";
import type { Endpoint, Mode, Result, SegKind } from "../types";
import { COLORS } from "../config";
import { hasUnchecked, type DisplayRoute } from "../lib/display";
import { ribbonParts } from "../lib/ribbon";
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
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 md:flex-wrap">
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
          { v: "shade", label: "Stay cool", icon: <SunIcon size={15} />, testid: "goal-cool" },
          { v: "rain", label: "Stay dry", icon: <RainIcon size={15} />, testid: "goal-dry" },
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

export type Highlight = { coords: [number, number][]; color: string } | null;

function kindLook(kind: SegKind, mode: Mode, night: boolean): { label: string; color: string } {
  if (kind === "roof") return { label: "Roof", color: COLORS.roof };
  if (kind === "unchecked") return { label: "Unchecked path", color: COLORS.unchecked };
  if (kind === "building") return { label: "Building shade", color: COLORS.building };
  if (kind === "tree") return { label: "Tree shade", color: COLORS.tree };
  return mode === "shade" && !night ? { label: "Sun", color: COLORS.sun } : { label: "No roof", color: night ? COLORS.nightOpen : COLORS.sun };
}

// The walk from start to end as one bar, each stretch sized by its distance and coloured by its cover.
// Hover or tap a stretch to light it up on the map.
function Ribbon({ d, mode, night, onHighlight }: { d: DisplayRoute; mode: Mode; night: boolean; onHighlight: (h: Highlight) => void }) {
  const parts = useMemo(() => ribbonParts(d.route.segments), [d.route.segments]);
  const [active, setActive] = useState<number | null>(null);
  const pointer = useRef("mouse");
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
  const a = active === null ? null : parts[active];
  return (
    <div onMouseLeave={() => pointer.current === "mouse" && pick(null)}>
      <div className="flex h-7 items-stretch" role="group" aria-label="The walk from start to end, by cover" data-testid="route-ribbon">
        {parts.map((x, i) => {
          const look = kindLook(x.kind, mode, night);
          return (
            <button
              key={i}
              type="button"
              aria-label={`${look.label}, ${fmtDist(x.metres)}`}
              aria-pressed={active === i}
              onPointerDown={(e) => (pointer.current = e.pointerType)}
              onPointerEnter={(e) => e.pointerType === "mouse" && pick(i)}
              onFocus={(e) => e.currentTarget.matches(":focus-visible") && pick(i)}
              onClick={() => pick(pointer.current === "mouse" || active !== i ? i : null)}
              className="flex min-w-0 items-center outline-none focus-visible:ring-2 focus-visible:ring-brand"
              style={{ width: `${(x.to - x.from) * 100}%` }}
              data-testid="ribbon-part"
            >
              <span
                className={`w-full transition-opacity motion-reduce:transition-none ${i === 0 ? "rounded-l-full" : ""} ${i === parts.length - 1 ? "rounded-r-full" : ""} ${
                  a && active !== i ? "opacity-35" : ""
                } ${active === i ? "h-4 ring-2 ring-ink" : "h-3"}`}
                style={{ background: look.color }}
              />
            </button>
          );
        })}
      </div>
      <p className="flex justify-between text-[11.5px] leading-tight text-slate-500" aria-live="polite">
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

// The card's big figure: how much less exposure this walk has than the shortest one.
// Shade mode counts minutes in sun; rain mode counts minutes without a roof. At night it is not shown.
function headline(d: DisplayRoute, display: DisplayRoute[], result: Result, mode: Mode): { big: string; small: string | null; win: boolean } | null {
  if (result.state === "night") return null;
  const word = mode === "shade" ? "sun" : "in the rain";
  const best = mode === "shade" ? "shadiest" : "most sheltered";
  const shortest = result.routes.find((x) => x.label === "shortest");
  if (!shortest) return null;
  if (d.labels.includes("shortest")) {
    const better = display.filter((x) => x !== d && shortest.sun_minutes - x.route.sun_minutes >= 0.1);
    if (result.recommendedIsShortest || !better.length) return { big: `Shortest walk is already the ${best}`, small: null, win: false };
    const top = better.reduce((a, b) => (b.route.sun_minutes < a.route.sun_minutes ? b : a));
    return { big: `${fmtMin(shortest.sun_minutes - top.route.sun_minutes)} min more ${word}`, small: `than the ${top.short.toLowerCase()} walk`, win: false };
  }
  const saved = shortest.sun_minutes - d.route.sun_minutes;
  if (saved < 0.1) return null;
  return { big: `${fmtMin(saved)} min less ${word}`, small: "than the shortest walk", win: true };
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
  // The night box below already says shade does not apply after dark.
  const notes = p.result.notes.filter((n) => !(night && /after dark|sun is down|shade does not apply/i.test(n)));
  const [open, setOpen] = useState(false);
  const showDetails = !p.compact || open;
  const details = (
    <>
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
                {w.tl && <span className="text-amber-700"> {w.tl}</span>}
              </Warn>
            ))}
          </ul>
        )}
    </>
  );
  const exposedWord = p.mode === "shade" ? "in sun" : "without a roof";
  const head = headline(d, p.display, p.result, p.mode);
  return (
    <div className="rounded-card bg-white shadow-card" data-testid="route-card">
      {p.display.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 p-2" role="tablist" aria-label="Routes">
          {p.display.map((x, i) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={i === p.selected}
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
            <span className={`font-semibold leading-tight tracking-tight ${head.win ? "text-[28px] text-brand" : head.small ? "text-[24px] text-ink" : "text-[20px] text-ink"}`}>{head.big}</span>
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
            {fmtMin(r.sun_minutes)} min {exposedWord}
          </p>
        )}
        {/* Phones keep the legend under Details, so the map keeps more height. The ribbon names a stretch on tap. */}
        <CoverBar d={d} mode={p.mode} night={night} onHighlight={p.onHighlight} legend={showDetails} />

        {night && (
          <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-[13px] text-ink" data-testid="night-note">
            Shade does not apply after dark. These are the shortest and the most sheltered routes.
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

        <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
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
  // True when the start or end snaps to a node outside the largest routable network.
  gatedEnd: boolean;
}

const NO_ROUTE = "No open walking route connects these points at this time.";

export function StateMessage({ result, onEdit, onAbout, includeUnchecked, onIncludeUnchecked, stepFree, gatedEnd }: StateProps) {
  const outside = result.state === "outside";
  // The headline already says the router's no-route sentence; the step-free note only matters with Step-free on.
  const notes = result.notes.filter((n) => n !== NO_ROUTE && (stepFree || !/step-free/i.test(n)));
  // Suggest unchecked paths only when neither the gated line nor a router note already does.
  const saysUnchecked = (gatedEnd && !outside) || notes.some((n) => /unchecked/i.test(n));
  const tries = ["Try another time", ...(stepFree ? ["turn off Step-free"] : []), ...(includeUnchecked || saysUnchecked ? [] : ["include unchecked paths"])];
  const hint = tries.length > 1 ? `${tries.slice(0, -1).join(", ")} or ${tries[tries.length - 1]}.` : `${tries[0]}.`;
  return (
    <div className="rounded-card bg-white p-4 shadow-card" data-testid="route-state" data-state={result.state}>
      <p className="text-[16px] font-medium text-ink">{outside ? "This start or end is outside the covered area." : NO_ROUTE}</p>
      <p className="mt-1 text-[14px] text-slate-600">{outside ? "Routing works inside the dashed box, the covered area. Pick a place inside it." : hint}</p>
      {!outside && gatedEnd && (
        <p className="mt-2 text-[14px] text-amber-900" data-testid="gated-note">
          One end sits behind a gate or inside a gated village. Try a nearby street or include unchecked paths.
        </p>
      )}
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
