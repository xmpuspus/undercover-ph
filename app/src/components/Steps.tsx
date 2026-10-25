import { useEffect } from "react";
import type { Step, StepFlag } from "../types";
import { fmtDist, fmtHHMM, fmtKm } from "../lib/time";
import { AlertIcon, BackIcon, BridgeIcon, ClockIcon, CrossingIcon, IndoorIcon, RoofIcon, ShadeIcon, StairsIcon, SunIcon, UnderpassIcon } from "./Icons";

const FLAG: Record<StepFlag, { icon: (p: { size?: number }) => JSX.Element; label: string; tl?: string }> = {
  stairs: { icon: StairsIcon, label: "Stairs", tl: "May hagdan" },
  footbridge: { icon: BridgeIcon, label: "Footbridge" },
  underpass: { icon: UnderpassIcon, label: "Underpass" },
  indoor: { icon: IndoorIcon, label: "Indoor" },
  hours: { icon: ClockIcon, label: "Hours not confirmed" },
  unchecked: { icon: AlertIcon, label: "May be gated or private" },
  crossing: { icon: CrossingIcon, label: "Crossing" },
};

function HalfIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth={1.8} />
      <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" />
    </svg>
  );
}

export function CoverDot({ cover, night, size = 30 }: { cover: Step["cover"]; night: boolean; size?: number }) {
  const map = {
    roof: { cls: "bg-blue-50 text-brand", icon: <RoofIcon size={16} />, label: "Under a roof" },
    shade: { cls: "bg-blue-50 text-blue-600", icon: <ShadeIcon size={16} />, label: "In shade" },
    sun: night
      ? { cls: "bg-slate-100 text-slate-500", icon: <span className="h-2 w-2 rounded-full bg-current" />, label: "No roof" }
      : { cls: "bg-amber-50 text-amber-600", icon: <SunIcon size={16} />, label: "In sun" },
    // A half-filled circle, so a part-covered step never shows the sun icon. "Covered" holds in every mode.
    mixed: { cls: "bg-sky-50 text-sky-700", icon: <HalfIcon />, label: "Part covered, part open" },
  }[cover];
  return (
    <span role="img" className={`grid shrink-0 place-items-center rounded-full ${map.cls}`} style={{ width: size, height: size }} title={map.label} aria-label={map.label}>
      {map.icon}
    </span>
  );
}

export function FlagChips({ step, night }: { step: Step; night: boolean }) {
  // The router writes the side into the step text; the badge repeats it as a quick visual cue.
  const side = step.side;
  if (!step.flags.length && !side) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-1">
      {side && (
        <li className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[12px] text-blue-800" data-testid="side-badge">
          {side.charAt(0).toUpperCase() + side.slice(1)} side
        </li>
      )}
      {side && step.sideMapped === false && (
        // OSM maps no sidewalk here, so the router assumed one from the road class.
        <li
          className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[12px] text-amber-900"
          title="Walang nakamapang bangketa"
          data-testid="side-unmapped"
        >
          <AlertIcon size={12} />
          Sidewalk not mapped
        </li>
      )}
      {step.flags.map((f) => {
        const def = FLAG[f];
        const Icon = def.icon;
        let label = def.label;
        if (f === "hours" && step.closesAt) label = `Closes ${fmtHHMM(step.closesAt)}`;
        // Router night includes a sun up to 3 degrees, so say low light, which holds at dawn and after dark.
        if (f === "underpass" && night) label = "Underpass, low light";
        return (
          <li
            key={f}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] ${
              f === "unchecked" || f === "hours" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-700"
            }`}
            title={def.tl}
          >
            <Icon size={12} />
            {label}
          </li>
        );
      })}
    </ul>
  );
}

interface Props {
  steps: Step[];
  lengthM: number;
  minutes: number;
  night: boolean;
  onBack: () => void;
  onFocus: (i: number) => void;
  current?: number;
}

export function StepsList({ steps, lengthM, minutes, night, onBack, onFocus, current }: Props) {
  // Escape goes back to the route. It marks the event handled, so the same Escape does not end navigation.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onBack();
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onBack]);
  return (
    <div className="flex min-h-0 flex-col rounded-card bg-white shadow-card" data-testid="steps">
      <div className="flex items-center gap-2 border-b border-slate-100 p-2">
        <button type="button" onClick={onBack} autoFocus aria-label="Back to route" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" data-testid="steps-back">
          <BackIcon size={18} />
        </button>
        <div>
          <p className="text-[15px] font-medium text-ink">Steps</p>
          <p className="text-[12px] text-slate-500">
            {steps.length} steps · {fmtKm(lengthM)} · {minutes} min
          </p>
        </div>
      </div>
      {steps.length === 0 ? (
        <p className="p-4 text-[14px] text-slate-600">No turn-by-turn steps for this route.</p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {steps.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onFocus(i)}
                className={`flex w-full items-start gap-3 border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50 ${current === i ? "bg-blue-50" : ""}`}
                data-testid="step-item"
              >
                <CoverDot cover={s.cover} night={night} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] leading-snug text-ink">{s.text}</span>
                  {s.textTl && (
                    <span className="block text-[12px] leading-snug text-slate-600" lang="fil">
                      {s.textTl}
                    </span>
                  )}
                  <span className="mt-0.5 block text-[12px] text-slate-600">
                    {fmtDist(s.distance_m)} · {s.minutes} min
                  </span>
                  <FlagChips step={s} night={night} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
