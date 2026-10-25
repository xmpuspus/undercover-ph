import { NCR, regionOf } from "../lib/areas";
import type { AreaInfo, Mode } from "../types";
import { phaseLabel, rgba, type SkyTheme } from "../lib/skyTheme";
import { fmtMinute } from "../lib/time";
import { BrandMark, RainIcon, SunIcon } from "./Icons";

interface Props {
  // The routing areas, once areas.json has loaded. The area line counts them.
  areas: AreaInfo[] | null;
  onPick: (m: Mode) => void;
  // Hover, focus or touch on the card starts loading route data before the tap ends.
  onIntent: () => void;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  theme: SkyTheme;
  // Manila time now, in minutes after midnight.
  minute: number;
  // The route type tapped while the map is still starting.
  picking: Mode | null;
}

export default function Landing({ areas, onPick, onIntent, status, error, theme, minute, picking }: Props) {
  // The area list loads on the first touch. Until then the counts come from the build.
  const ncr = areas ? areas.filter((a) => regionOf(a) === NCR).length : __AREA_COUNTS__.ncr;
  const others = areas ? areas.length - ncr : __AREA_COUNTS__.other;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
      <section
        className="pointer-events-auto w-full max-w-[400px] rounded-card border border-white/60 p-6 shadow-card backdrop-blur-md transition-colors duration-500 motion-reduce:transition-none"
        style={{ backgroundColor: rgba(theme.tint, theme.dark ? 0.86 : 0.78) }}
        aria-labelledby="landing-title"
        // After an error, only a button retries. A retry on pointer-down hid the error block, the card
        // shrank, and the tap then missed the button it was aimed at.
        onPointerEnter={status === "error" ? undefined : onIntent}
        onPointerDown={status === "error" ? undefined : onIntent}
        onFocus={status === "error" ? undefined : onIntent}
        data-testid="landing"
      >
        <h1 id="landing-title" className="flex items-center gap-3 text-[32px] font-semibold leading-none tracking-tight text-ink">
          <BrandMark size={40} sun={theme.accent} />
          <span>
            undercover<span className="text-brand">.ph</span>
          </span>
        </h1>
        <p className="mt-2 text-[16px] font-light leading-relaxed text-slate-700">Plan a walk in the shade on sunny days, or under a roof when it rains.</p>
        {/* One line, so the buttons stay in view on a phone. About lists every area. index.html repeats this line. */}
        <p className="mt-3 text-[13px] text-slate-700" data-testid="landing-areas">
          {others > 0
            ? `${ncr + others} walking areas, ${ncr} in Metro Manila and ${others} in other cities across the Philippines.`
            : `${ncr} walking areas in Metro Manila's busiest centres, from Caloocan to Alabang.`}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <ModeButton mode="shade" onPick={onPick} busy={picking === "shade"} />
          <ModeButton mode="rain" onPick={onPick} busy={picking === "rain"} />
        </div>
        <p className="mt-4 flex items-center gap-2 text-[13px] text-slate-600" data-testid="landing-clock">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: theme.accent }} aria-hidden="true" />
          {fmtMinute(minute)} in Metro Manila · {phaseLabel(theme.phase, theme.morning)}
        </p>
        {status === "error" && (
          <div className="mt-3 text-[13px] text-slate-700" role="alert" data-error={error ?? undefined} data-testid="data-error">
            Route data could not load. Check your connection and try again.
            <button type="button" onClick={onIntent} className="mt-2 flex min-h-11 items-center rounded-card border border-slate-300 bg-white px-4 font-medium text-brand">
              Try again
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function ModeButton({ mode, onPick, busy }: { mode: Mode; onPick: (m: Mode) => void; busy: boolean }) {
  const shade = mode === "shade";
  return (
    <button
      type="button"
      onClick={() => onPick(mode)}
      aria-busy={busy}
      className="flex flex-col items-center gap-0.5 rounded-card border border-slate-200 bg-white/90 px-3 py-3 text-ink shadow-sm transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
      data-testid={shade ? "pick-shade" : "pick-rain"}
    >
      <span className="flex items-center gap-2 text-[16px] font-medium">
        {shade ? <SunIcon size={20} className="text-amber-500" /> : <RainIcon size={20} className="text-brand" />}
        {shade ? "Shaded" : "Sheltered"}
      </span>
      <span className="flex items-center gap-1.5 text-[12px] font-light text-slate-600">
        {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-brand motion-reduce:animate-none" aria-hidden="true" />}
        {busy ? "Loading map" : <span lang="fil">{shade ? "Malilim" : "May bubong"}</span>}
      </span>
    </button>
  );
}
