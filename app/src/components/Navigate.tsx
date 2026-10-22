import type { Endpoint } from "../types";
import type { DisplayRoute } from "../lib/display";
import { fmtDist, fmtKm } from "../lib/time";
import { ArrowRight, BackIcon, ChevronRight, CloseIcon, ListIcon } from "./Icons";
import { CoverDot, FlagChips, StepsList } from "./Steps";

export function TurnCard({ d, idx, night, onPrev, onNext }: { d: DisplayRoute; idx: number; night: boolean; onPrev: () => void; onNext: () => void }) {
  const steps = d.route.steps;
  const s = steps[idx];
  if (!s) {
    return (
      <div className="pointer-events-auto rounded-card bg-white p-4 text-[14px] text-slate-600 shadow-card" data-testid="turn-card">
        No turn-by-turn steps for this route. Follow the route line on the map.
      </div>
    );
  }
  return (
    // tabIndex -1: focus lands here when navigation starts. aria-live reads each new step aloud.
    <div className="pointer-events-auto rounded-card bg-white p-3 shadow-card outline-none" tabIndex={-1} aria-live="polite" data-testid="turn-card">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1">
          <CoverDot cover={s.cover} night={night} size={36} />
          <span className="text-[12px] font-medium text-slate-600">{fmtDist(s.distance_m)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-medium leading-snug text-ink" data-testid="turn-text">
            {s.text}
          </p>
          {s.textTl && (
            <p className="text-[13px] leading-snug text-slate-500" lang="fil">
              {s.textTl}
            </p>
          )}
          <FlagChips step={s} night={night} />
        </div>
        <span className="shrink-0 text-[13px] text-slate-500">{s.minutes} min</span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <button type="button" onClick={onPrev} disabled={idx === 0} className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-[13px] text-slate-600 hover:bg-slate-100 disabled:opacity-40">
          <BackIcon size={14} />
          Back
        </button>
        <span className="text-[12px] text-slate-500">
          Step {idx + 1} of {steps.length}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={idx >= steps.length - 1}
          className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-brand hover:bg-blue-50 disabled:opacity-40"
          data-testid="next-step"
        >
          Next step
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

interface SheetProps {
  d: DisplayRoute;
  from: Endpoint;
  to: Endpoint;
  night: boolean;
  showSteps: boolean;
  idx: number;
  onSteps: (v: boolean) => void;
  onStep: (i: number) => void;
  onClose: () => void;
}

export function NavSheet({ d, from, to, night, showSteps, idx, onSteps, onStep, onClose }: SheetProps) {
  if (showSteps) {
    return (
      <StepsList
        steps={d.route.steps}
        lengthM={d.route.length_m}
        minutes={d.route.minutes}
        night={night}
        onBack={() => onSteps(false)}
        onFocus={(i) => {
          onStep(i);
          onSteps(false);
        }}
        current={idx}
      />
    );
  }
  return (
    <div className="relative" data-testid="nav-sheet">
      <button
        type="button"
        onClick={onClose}
        className="absolute -top-12 left-0 flex h-11 items-center gap-1.5 rounded-full bg-white pl-3 pr-4 text-[14px] font-medium text-ink shadow-card"
        data-testid="nav-close"
      >
        <CloseIcon size={16} />
        End
      </button>
      <div className="rounded-card bg-white p-3 shadow-card">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-0.5 text-[12.5px] font-medium text-ink">
            <span className={`h-2 w-2 rounded-full ${d.labels.includes("recommended") ? "bg-green-500" : "bg-brand"}`} />
            {d.title}
          </span>
          <span className="font-medium text-brand">
            {d.pct}% {d.pctWord}
          </span>
          <span className="text-slate-600">
            {d.route.minutes} min · {fmtKm(d.route.length_m)}
          </span>
        </div>
        <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[13px] text-slate-600">
          <span className="truncate">{from.label}</span>
          <ArrowRight size={12} className="shrink-0" />
          <span className="truncate">{to.label}</span>
        </p>
        <button
          type="button"
          onClick={() => onSteps(true)}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-card border border-slate-200 text-[14px] text-ink hover:border-slate-300"
          data-testid="nav-show-steps"
        >
          <ListIcon size={16} />
          Show all steps
        </button>
      </div>
    </div>
  );
}
