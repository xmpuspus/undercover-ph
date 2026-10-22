import { useRef } from "react";
import type { DisplayRoute } from "../lib/display";
import { fmtKm } from "../lib/time";
import type { Mode } from "../types";
import { AlertIcon, ArrowRight, ListIcon, RainIcon, SunIcon } from "./Icons";

interface Props {
  d: DisplayRoute;
  count: number;
  mode: Mode;
  night: boolean;
  // The card's own headline ("3 min less sun than the shortest walk"), or null when it has none.
  head: { big: string; small: string | null } | null;
  onExpand: () => void;
  onSteps: () => void;
  onNavigate: () => void;
}

// A warning in a few words for the summary line. The full card keeps the whole sentence.
function shortWarning(w: string): string {
  const closes = /^(.*) closes at (\S+ [AP]M)/.exec(w);
  if (closes) return `${closes[1]} closes ${closes[2]}`;
  if (/no marked crossing/i.test(w)) return "unmarked crossing";
  if (/gated or private/i.test(w)) return "may be gated";
  if (/^Uses stairs/i.test(w)) return "stairs";
  if (/raised curb/i.test(w)) return "raised curb";
  if (/Footbridge entrances/i.test(w)) return "footbridge stairs";
  if (/underpass/i.test(w)) return "dim underpass";
  if (/through a building/i.test(w)) return "through a building";
  if (/estimated heights/i.test(w)) return "estimated heights";
  return w.replace(/\.$/, "");
}

// The phone sheet at rest, as in map apps: which route, how covered, how long, and Navigate. The map keeps
// most of the screen. A tap on the summary, or a swipe up on the sheet, opens the full card.
export default function RoutePeek({ d, count, mode, night, head, onExpand, onSteps, onNavigate }: Props) {
  const r = d.route;
  const startY = useRef<number | null>(null);
  return (
    <div
      className="rounded-card bg-white shadow-card"
      data-testid="route-peek"
      onPointerDown={(e) => {
        startY.current = e.clientY;
      }}
      onPointerUp={(e) => {
        if (startY.current !== null && startY.current - e.clientY > 24) onExpand();
        startY.current = null;
      }}
    >
      <button type="button" onClick={onExpand} aria-expanded={false} aria-label="Show route details" className="flex h-6 w-full items-start justify-center pt-2" data-testid="sheet-handle">
        <span className="h-1.5 w-10 rounded-full bg-slate-300" aria-hidden="true" />
      </button>
      <div className="px-4 pb-3">
        <button type="button" onClick={onExpand} className="block w-full text-left" data-testid="peek-summary">
          <span className="flex items-center gap-1.5 text-[13px] text-slate-600">
            <span className={`h-2 w-2 rounded-full ${d.labels.includes("recommended") ? "bg-green-500" : "bg-brand"}`} aria-hidden="true" />
            <span className="font-medium text-ink">{d.title}</span>
            {count > 1 && <span>· {count} routes on the map</span>}
          </span>
          <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <span className="text-[24px] font-semibold leading-tight tracking-tight text-brand">
              {d.pct}% {d.pctWord}
            </span>
            <span className="text-[15px] text-slate-600">
              {r.minutes} min · {fmtKm(r.length_m)}
            </span>
          </span>
          {head ? (
            <span className="mt-0.5 block text-[14px] text-ink" data-testid="peek-headline">
              {head.big}
              {head.small ? ` ${head.small}` : ""}
            </span>
          ) : (
            !night && (
              <span className="mt-0.5 flex items-center gap-1.5 text-[14px] text-slate-700">
                {mode === "shade" ? <SunIcon size={15} className="text-amber-500" /> : <RainIcon size={15} className="text-brand" />}
                {Math.round(r.sun_minutes * 10) / 10} min {mode === "shade" ? "in sun" : "without a roof"}
              </span>
            )
          )}
        </button>
        {/* Safety warnings (stairs, closing times, crossings) show before Navigate, not only in the full card. */}
        {r.warnings.length > 0 && (
          <button type="button" onClick={onExpand} className="mt-1.5 flex w-full items-start gap-1.5 text-left text-[13px] text-amber-900" data-testid="peek-warnings">
            <AlertIcon size={14} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">
              {r.warnings.length === 1 ? "1 warning" : `${r.warnings.length} warnings`}: {r.warnings.map(shortWarning).join(" · ")}
            </span>
          </button>
        )}
        <div className="mt-2.5 grid grid-cols-[auto_1fr] gap-2">
          <button type="button" onClick={onSteps} className="flex h-11 items-center gap-1.5 rounded-card border border-slate-200 px-3 text-[14px] text-ink hover:border-slate-300" data-testid="peek-steps">
            <ListIcon size={16} />
            Steps
          </button>
          <button type="button" onClick={onNavigate} className="flex h-11 items-center justify-center gap-2 rounded-card bg-brand px-4 text-[15px] font-medium text-white hover:bg-blue-700" data-testid="peek-navigate">
            Navigate
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
