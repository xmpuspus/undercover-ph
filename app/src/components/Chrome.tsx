import { useState } from "react";
import type { Advisory, Mode } from "../types";
import { advisoryCovers, advisoryLine } from "../lib/advisory";
import { AlertIcon, CloseIcon } from "./Icons";

export function TopBanner({ onClose, onAbout }: { onClose: () => void; onAbout: () => void }) {
  return (
    <div className="flex items-center gap-1 bg-ink py-0.5 pl-4 pr-1 text-[13px] leading-snug text-white" role="note" data-testid="prototype-banner">
      <p className="min-w-0 flex-1 py-1.5">Prototype. Routes and data can be wrong. Independent project, not affiliated with any government agency.</p>
      <button type="button" onClick={onAbout} className="h-11 shrink-0 rounded px-2 underline underline-offset-2 hover:bg-white/10">
        About
      </button>
      <button type="button" onClick={onClose} aria-label="Close banner" className="grid h-11 w-11 shrink-0 place-items-center rounded hover:bg-white/10">
        <CloseIcon size={16} />
      </button>
    </div>
  );
}

// PAGASA thunderstorm advisory. It covers 2 hours from its issue time, so the app shows it only
// when the chosen departure falls inside that window. Outside it, nothing about PAGASA appears.
export function AdvisoryBar({
  advisory,
  date,
  minute,
  mode,
  onRain,
}: {
  advisory: Advisory | null;
  date: string;
  minute: number;
  mode: Mode;
  onRain: () => void;
}) {
  const [hidden, setHidden] = useState(false);
  if (hidden || !advisory || advisory.status !== "ok" || !advisory.text || !advisory.issued_at) return null;
  if (!advisoryCovers(advisory.issued_at, date, minute)) return null;
  const { text, makati } = advisoryLine(advisory.issued_at, advisory.cities);
  return (
    <div
      className={`flex items-start gap-2 px-4 py-1.5 text-[12px] leading-snug ${makati ? "bg-amber-300 text-ink" : "bg-amber-50 text-amber-950"}`}
      role="status"
      data-testid="advisory"
    >
      <AlertIcon size={14} className="mt-0.5 shrink-0" />
      <p className="min-w-0 flex-1">
        {text}{" "}
        {makati &&
          (mode === "rain" ? (
            <span className="font-semibold">Rain mode first.</span>
          ) : (
            <button type="button" onClick={onRain} className="font-semibold underline underline-offset-2">
              Rain mode first.
            </button>
          ))}{" "}
        <a href={advisory.source_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          Source
        </a>
      </p>
      <button type="button" onClick={() => setHidden(true)} aria-label="Hide advisory" className="-my-1.5 grid h-11 w-11 shrink-0 place-items-center rounded hover:bg-black/5">
        <CloseIcon size={14} />
      </button>
    </div>
  );
}

// Each link is a 44 px tall row for touch. Phones get slightly smaller text so the credits fit one row from 390 px.
const link = "inline-flex min-h-11 items-center hover:underline";

// Basemap attribution stays visible at every size and in every stage. Data credits live in About.
export function Footer({ onAbout }: { onAbout: () => void }) {
  return (
    <footer
      className="z-30 flex flex-wrap items-center gap-x-2 border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] text-[11.5px] leading-snug text-slate-600 md:gap-x-3 md:px-3 md:text-[12px]"
      data-testid="attribution"
    >
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className={`${link} font-medium text-ink`}>
        © OpenStreetMap contributors
      </a>
      <a href="https://openfreemap.org" target="_blank" rel="noreferrer" className={link}>
        OpenFreeMap
      </a>
      <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer" className={link}>
        © OpenMapTiles
      </a>
      <button type="button" onClick={onAbout} className={`${link} min-w-11 font-medium text-brand`} data-testid="footer-sources">
        Sources
      </button>
    </footer>
  );
}
