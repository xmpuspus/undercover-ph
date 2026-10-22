import { useEffect, useRef } from "react";
import { APP_NAME, AREA_LABELS, NIGHT_ALT_DEG } from "../config";
import type { Manifest } from "../types";
import { REC_MAX_DETOUR, REC_MIN_CUT } from "../lib/routerClient";
import { fmtStamp } from "../lib/time";
import { CloseIcon } from "./Icons";

// CC BY 4.0 asks for a link to the licence and a note when the data was changed (section 3(a)(1)).
const CC_BY = "https://creativecommons.org/licenses/by/4.0/";

const SOURCES: { name: string; licence: string; text: string; url: string; licenceUrl?: string }[] = [
  {
    name: "OpenStreetMap",
    licence: "ODbL 1.0, © OpenStreetMap contributors",
    licenceUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
    text: "Walk paths, buildings, places, and opening-hours tags.",
    url: "https://www.openstreetmap.org/copyright",
  },
  {
    name: "OpenFreeMap and OpenMapTiles",
    licence: "© OpenMapTiles, data © OpenStreetMap contributors",
    text: "Basemap tiles and style.",
    url: "https://openfreemap.org",
  },
  {
    name: "Meta and WRI canopy height",
    licence: "CC BY 4.0. Source imagery for CHM © 2016 Maxar",
    text: "Meta and World Resources Institute (WRI), 2024. High Resolution Canopy Height Maps (CHM). Clipped to the app's areas for tree shade.",
    url: "https://registry.opendata.aws/dataforgood-fb-forests/",
    licenceUrl: CC_BY,
  },
  {
    name: "Google Open Buildings 2.5D",
    licence: "CC BY 4.0 or ODbL",
    text: "Modelled building heights from 2023 imagery, where OpenStreetMap has none. Clipped and merged with OpenStreetMap footprints.",
    url: "https://sites.research.google/gr/open-buildings/",
    licenceUrl: CC_BY,
  },
  {
    name: "Open-Meteo",
    licence: "CC BY 4.0",
    text: "Hourly forecast for each area.",
    url: "https://open-meteo.com/",
    licenceUrl: CC_BY,
  },
  {
    name: "PAGASA",
    licence: "Credited to PAGASA. No licence is stated on the page",
    text: "Thunderstorm advisories for Metro Manila, shown for the 2 hours they cover.",
    url: "https://www.pagasa.dost.gov.ph/",
  },
];

function longDate(d: string, withYear: boolean): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: withYear ? "numeric" : undefined, timeZone: "UTC" });
}

const linkCls = "inline-flex min-h-11 items-center font-medium text-brand hover:underline";

export default function About({ manifest, onClose }: { manifest: Manifest | null; onClose: () => void }) {
  const box = useRef<HTMLElement>(null);
  // Escape closes. Tab stays inside the dialog while it is open.
  useEffect(() => {
    // Capture phase, and the event marked handled, so one Escape closes About and not the sheet under it.
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        return onClose();
      }
      if (e.key !== "Tab" || !box.current) return;
      // Links inside a closed <details> are not rendered, so they cannot be the first or last stop.
      const els = [...box.current.querySelectorAll<HTMLElement>('a[href], button, summary, [tabindex]:not([tabindex="-1"])')].filter((el) => el.getClientRects().length > 0);
      if (!els.length) return;
      const [first, last] = [els[0], els[els.length - 1]];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", k, true);
    return () => document.removeEventListener("keydown", k, true);
  }, [onClose]);
  const dates = manifest?.dates ?? [];
  // The mall-hours guide is a manifest source; show it with the other data sources when present.
  const hoursSource = manifest?.sources?.find((s) => /hours/i.test(s.used_for) && !/openstreetmap/i.test(s.name));
  const limits = [
    "Nobody has checked the shade on the street yet.",
    "Building heights come from OpenStreetMap and Google's 2023 estimates. New towers can be missing.",
    "OpenStreetMap shows few covered walkways, so sheltered routes undercount real cover.",
    "Paths behind gates and building entrances stay out of routes unless you include them.",
    "Mall opening hours come from a February 2026 guide. Hours can change.",
    ...(dates.length
      ? [`Shade covers ${longDate(dates[0], false)} to ${longDate(dates[dates.length - 1], true)}. Other days have no shade data yet.`]
      : []),
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 md:items-center" onClick={onClose} data-testid="about">
      <section
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88dvh] w-full max-w-[640px] overflow-y-auto rounded-t-card bg-white p-5 text-[14px] leading-relaxed text-slate-700 shadow-card md:rounded-card"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="about-title" className="text-[22px] font-semibold text-ink">
            About {APP_NAME}
          </h2>
          <button type="button" onClick={onClose} autoFocus aria-label="Close" className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-slate-100">
            <CloseIcon size={18} />
          </button>
        </div>
        <p className="mt-2">
          {APP_NAME} finds walking routes that stay in shade or under a roof. It is a prototype by an independent developer. It is not affiliated with any
          government agency.
        </p>
        <p className="mt-2">It covers {AREA_LABELS.length} walking areas around Metro Manila's busiest centres. A trip that starts or ends outside them gets no route:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5" data-testid="about-areas">
          {AREA_LABELS.map((a) => (
            <li key={a.id}>{a.label}</li>
          ))}
        </ul>
        <p className="mt-2">A route starts and ends in the same area.</p>

        <h3 className="mt-4 font-semibold text-ink">How it works</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Shade comes from building heights and tree canopy, computed every 30 minutes for each path.</li>
          <li>Each path uses the shade at the time you reach it, from your departure time and walking speed.</li>
          <li>Roofed, indoor, and underground paths count as covered. When the sun is {NIGHT_ALT_DEG} degrees up or lower, only a roof counts.</li>
          <li data-testid="about-rule">
            The recommended walk is at most {Math.round(REC_MAX_DETOUR * 100)}% longer than the shortest walk and has at least {Math.round(REC_MIN_CUT * 100)}% less
            time in sun (with Sheltered, less time without a roof). If no walk meets both, the shortest walk is recommended.
          </li>
        </ul>

        <h3 className="mt-4 font-semibold text-ink">Privacy</h3>
        <p className="mt-1">
          Routes are computed in your browser. Your start and end points are not sent to a server. Map tiles come from OpenFreeMap, which receives the map area you
          view. The app asks for your location only when you tap Use my location. No analytics or trackers.
        </p>

        <h3 className="mt-4 font-semibold text-ink">Limits</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5" data-testid="about-limits">
          {limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {manifest && <p className="mt-2">Data updated {fmtStamp(manifest.generated_at)}.</p>}

        <h3 className="mt-4 font-semibold text-ink">Data sources</h3>
        <ul className="mt-1 space-y-2" data-testid="about-sources">
          {[...SOURCES, ...(hoursSource ? [{ name: hoursSource.name, licence: hoursSource.licence, text: "Mall opening hours.", url: hoursSource.url }] : [])].map(
            (c) => (
              <li key={c.name}>
                <a href={c.url} target="_blank" rel="noreferrer" className={linkCls}>
                  {c.name}
                </a>
                <span className="block text-[13px] text-slate-600">
                  {"licenceUrl" in c && c.licenceUrl ? (
                    <a href={c.licenceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      {c.licence.replace(/\.+$/, "")}
                    </a>
                  ) : (
                    c.licence.replace(/\.+$/, "")
                  )}
                  .
                </span>
                <span className="block">{c.text}</span>
              </li>
            ),
          )}
        </ul>

        {manifest && (
          <details className="mt-4 rounded-xl border border-slate-200 px-3" data-testid="about-dev">
            <summary className="flex min-h-11 cursor-pointer items-center font-medium text-ink">Method details (for developers)</summary>
            <div className="pb-3 text-[13px] text-slate-600">
              {manifest.osm_extract && <p>OpenStreetMap extract: {manifest.osm_extract}.</p>}
              {manifest.limits && manifest.limits.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {manifest.limits.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
              {manifest.sources && manifest.sources.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {manifest.sources.map((s) => (
                    <li key={s.name}>
                      <a href={s.url} target="_blank" rel="noreferrer" className={linkCls}>
                        {s.name}
                      </a>
                      <span className="block">
                        {s.licence.replace(/\.+$/, "")}. {s.used_for}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
