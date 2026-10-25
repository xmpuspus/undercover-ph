import { useEffect, useRef, useState } from "react";
import type { Data } from "../lib/routerClient";
import type { Endpoint, Place } from "../types";
import { areaBase } from "../lib/data";
import { JogClient, type LoopReply } from "../lib/jog/client";
import { JOG_COPY } from "../lib/jog/copy";
import { clearRuns, exportRuns, readRuns, saveRun, streetsOf } from "../lib/jog/history";
import type { Loop, RunRecord } from "../lib/jog/types";
import { PlaceList, useCombobox, type DataState } from "./Planner";
import JogCards, { loopKey } from "./JogCards";

interface Props {
  start: Endpoint | null; data: Data | null; ready: boolean; dateIdx: number; bucketIdx: number; departMin: number;
  desktop: boolean; formOpen: boolean; onFormOpen: (open: boolean) => void;
  query: string; onQuery: (q: string) => void; results: Place[]; suggested: Place[]; onPick: (p: Place) => void;
  onLocate: () => void; locating: boolean; notice: string | null; placesState: DataState;
  areaError: string | null; onRetryArea: () => void; where: (p: Place) => string | null; onLoop: (loop: Loop | null) => void;
}
const btn = "min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-brand disabled:opacity-50";
const FORM_IDLE_MS = 750;
export default function JogPanel(p: Props) {
  const [km, setKm] = useState("5"), [custom, setCustom] = useState(false), [pace, setPace] = useState("7");
  const [preferNew, setPreferNew] = useState(true), [seed, setSeed] = useState(1);
  const [runs, setRuns] = useState<RunRecord[]>([]), [historyReady, setHistoryReady] = useState(false);
  const [historyCount, setHistoryCount] = useState(0), [editingStart, setEditingStart] = useState(false);
  const [historyNote, setHistoryNote] = useState<string | null>(null), [storageError, setStorageError] = useState<string | null>(null);
  const [reply, setReply] = useState<LoopReply | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0), [saving, setSaving] = useState(false), [saved, setSaved] = useState(new Set<string>());
  const client = useRef<JogClient | null>(null), request = useRef(0);
  const lastSearch = useRef<RunRecord[]>([]);
  const firstSave = useRef(false);
  const results = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLDivElement>(null), edit = useRef<HTMLButtonElement>(null);
  const focusAfterFold = useRef(false), desktop = useRef(p.desktop), formOpen = useRef(p.formOpen);
  const replyStart = useRef<{ area: string; node: number } | null>(null);
  desktop.current = p.desktop; formOpen.current = p.formOpen;
  const formActivity = useRef(0), formPointerDown = useRef(false), formComposing = useRef(false);
  const noteFormActivity = () => { formActivity.current = performance.now(); };
  const targetM = Number(km) * 1000, paceN = Number(pace);
  const valid = Number.isFinite(targetM) && targetM >= 500 && targetM <= 42_000 && Number.isFinite(paceN) && paceN >= 2 && paceN <= 20;
  const folded = !p.desktop && !p.formOpen;
  const list = p.placesState.status === "ready" ? (p.query.trim() ? p.results : p.start ? [] : p.suggested) : [];
  const combo = useCombobox("jog-places", list, p.onPick, p.query, p.onQuery);
  useEffect(() => {
    let live = true;
    readRuns().then(({ runs, skipped, count }) => {
      if (!live) return;
      setRuns(runs); setHistoryCount(count); lastSearch.current = runs; firstSave.current = count > 0;
      if (skipped) setHistoryNote("Some saved runs could not be read, or the history is too large. Export or clear the history.");
    }).catch((e: Error) => live && setStorageError(e.message)).finally(() => live && setHistoryReady(true));
    return () => { live = false; client.current?.close(); client.current = null; };
  }, []);
  useEffect(() => setEditingStart(false), [p.start]);
  useEffect(() => {
    // A touch can finish outside the form. Release it there too, so results can still appear.
    const release = () => {
      if (!formPointerDown.current) return;
      formPointerDown.current = false; noteFormActivity();
    };
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      window.removeEventListener("blur", release);
    };
  }, []);
  useEffect(() => {
    if (folded && focusAfterFold.current) {
      edit.current?.focus({ preventScroll: true });
      focusAfterFold.current = false;
    }
  }, [folded]);
  // Saving a run keeps the displayed loop in place. Other loops applies the current history.
  useEffect(() => {
    const id = ++request.current;
    setError(null);
    // Keep the folded sheet and its map in place while replacing the results.
    const sameStart = !!p.start && replyStart.current?.area === p.start.area && replyStart.current.node === p.start.node;
    if (p.desktop || p.formOpen || !sameStart) {
      setReply(null); replyStart.current = null; p.onLoop(null); setSelected(0);
    }
    if (!p.start && !p.formOpen) p.onFormOpen(true);
    if (!p.data || !p.start || !p.ready || !historyReady || !valid) { setBusy(false); return; }
    setBusy(true);
    noteFormActivity();
    let publishTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      try {
        client.current ??= new JogClient();
        client.current.query(p.start!.area, p.data!, new URL(areaBase(p.start!.area), window.location.href).href, {
          start: p.start!.node, targetM, dateIdx: p.dateIdx, bucketIdx: p.bucketIdx, departMin: p.departMin,
          paceMinPerKm: paceN, preferNew, seed, history: lastSearch.current,
        }).then((value) => {
          const publish = () => {
            if (id !== request.current) return;
            // Keep the controls still while the runner scrolls to a distance or finishes typing.
            // Publish cards and fold together, after phone input has paused.
            const wait = !desktop.current && p.formOpen && formOpen.current
              ? formPointerDown.current || formComposing.current ? FORM_IDLE_MS : FORM_IDLE_MS - (performance.now() - formActivity.current)
              : 0;
            if (wait > 0) { publishTimer = setTimeout(publish, wait); return; }
            setReply(value); replyStart.current = p.start; setBusy(false); setSelected(0); p.onLoop(value.result.loops[0] ?? null);
            if (value.result.loops.length) {
              // Edit opened during a folded search stays open until the runner starts another search.
              if (p.formOpen || !formOpen.current) {
                focusAfterFold.current = !desktop.current && form.current?.contains(document.activeElement) === true;
                p.onFormOpen(false);
              }
              results.current?.scrollTo(0, 0);
            }
          };
          publish();
        }).catch((e: Error) => {
          if (id !== request.current) return;
          setError(e.message); setBusy(false); client.current?.close(); client.current = null;
        });
      } catch {
        setError("Loop search could not start on this phone. Tap Other loops to try again."); setBusy(false);
        client.current?.close(); client.current = null;
      }
    }, 150);
    return () => { clearTimeout(timer); clearTimeout(publishTimer); request.current++; };
  }, [p.data, p.start?.area, p.start?.node, p.ready, p.dateIdx, p.bucketIdx, p.departMin, historyReady, targetM, paceN, preferNew, seed]);
  const mark = async (loop: Loop) => {
    if (!p.data || !p.start || saving) return;
    setSaving(true); setStorageError(null);
    try {
      if (!firstSave.current) {
        firstSave.current = true;
        try { await navigator.storage?.persist?.(); } catch { /* Storage still works without persistence. */ }
      }
      const indexes = new Map(Array.from(p.data.edgeId, (id, e) => [id, e]));
      const record: RunRecord = { id: crypto.randomUUID(), area: p.start.area, date: new Date().toISOString(), length_m: loop.length_m,
        streets: streetsOf(p.data, loop.edgeIds.map((id) => indexes.get(id)!)) };
      await saveRun(record);
      setHistoryCount((n) => n + 1);
      setRuns((r) => { const next = [...r, record]; lastSearch.current = next; return next; });
      setSaved((s) => new Set([...s, loopKey(loop)]));
    } catch (e) { setStorageError(e instanceof Error ? e.message : "This run could not be saved."); }
    finally { setSaving(false); }
  };
  const exportHistory = async () => {
    try {
      const url = URL.createObjectURL(await exportRuns());
      const a = document.createElement("a"); a.href = url; a.download = "undercover-runs.json"; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setStorageError(e instanceof Error ? e.message : "Saved runs could not be exported."); }
  };
  const safari = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Android|Edg|FxiOS/.test(navigator.userAgent) &&
    !(typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches) && !(navigator as Navigator & { standalone?: boolean }).standalone;
  return <section className={`min-h-0 overflow-y-auto rounded-card bg-white p-3 shadow-card ${folded ? "jog-panel-folded" : ""}`} data-testid="jog-panel" aria-label="Run a loop" onScrollCapture={noteFormActivity}>
    {folded && <div className="mb-2 flex shrink-0 items-center gap-2 md:hidden" data-testid="jog-summary">
      <p className="flex min-w-0 flex-1 items-center gap-1 text-sm">
        <span className="truncate" title={p.start?.label}>{p.start?.label}</span>
        <span className="shrink-0">· {Math.round(Number(km) * 100) / 100} km · {Math.round(paceN * 100) / 100} min/km</span>
      </p>
      <button ref={edit} className={`${btn} shrink-0`} type="button" data-testid="jog-edit" aria-controls="jog-form" aria-expanded={false} onClick={() => p.onFormOpen(true)}>Edit</button>
    </div>}
    <div ref={form} id="jog-form" className={folded ? "hidden md:block" : undefined}
      onPointerDownCapture={() => { formPointerDown.current = true; noteFormActivity(); }}
      onClickCapture={noteFormActivity} onKeyDownCapture={noteFormActivity} onChangeCapture={noteFormActivity}
      onCompositionStartCapture={() => { formComposing.current = true; noteFormActivity(); }}
      onCompositionEndCapture={() => { formComposing.current = false; noteFormActivity(); }}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { formComposing.current = false; noteFormActivity(); } }}>
    <h1 className="text-lg font-medium">Run a loop</h1>
    <label className="mt-2 block text-sm font-medium" htmlFor="jog-start">Start and finish</label>
    <input id="jog-start" data-testid="jog-start-input" className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-[15px] outline-brand"
      value={editingStart ? p.query : p.start?.label ?? p.query} onChange={(e) => { setEditingStart(true); p.onQuery(e.target.value); }} onFocus={(e) => e.currentTarget.select()} placeholder="Pick a place" {...combo.input} />
    {list.length > 0 && <PlaceList id="jog-places" places={list} onPick={p.onPick} active={combo.active} testid="jog-results" where={p.where} />}
    {p.query.trim() && !list.length && <p className="mt-2 text-sm text-slate-600">No place by that name in the areas this app covers. Try another name.</p>}
    {p.placesState.status !== "ready" && <p role="status" className="mt-2 text-sm">Loading places... <button className={btn} onClick={p.placesState.onRetry}>Try again</button></p>}
    <button className={`${btn} mt-2`} type="button" onClick={p.onLocate} disabled={p.locating} data-testid="jog-use-location">{p.locating ? "Finding your location..." : "Use my location"}</button>
    {p.notice && <p role="status" className="mt-2 text-sm text-amber-900">{p.notice}</p>}
    <fieldset className="mt-3"><legend className="text-sm font-medium">Distance</legend>
      <div className="mt-1 flex flex-wrap gap-1.5">{[3, 5, 10].map((n) => <button key={n} type="button" className={`${btn} ${!custom && km === String(n) ? "border-brand bg-blue-50" : ""}`} aria-pressed={!custom && km === String(n)}
        data-testid={`jog-km-${n}`} onClick={() => { setKm(String(n)); setCustom(false); }}>{n} km</button>)}
        <button type="button" className={btn} data-testid="jog-km-custom" aria-pressed={custom} onClick={() => setCustom(true)}>Custom</button>
      </div>
      {custom && <label className="mt-2 flex items-center gap-2 text-sm">Distance in km <input className="h-11 w-24 rounded-xl border border-slate-300 px-2" type="number" min="0.5" max="42" step="0.1" value={km} onChange={(e) => setKm(e.target.value)} /></label>}
    </fieldset>
    <label className="mt-3 flex items-center justify-between gap-2 text-sm">Pace, min/km <input aria-label="Pace in minutes per km" className="h-11 w-24 rounded-xl border border-slate-300 px-2" type="number" min="2" max="20" step="0.5" value={pace} onChange={(e) => setPace(e.target.value)} /></label>
    <label className="my-2 flex min-h-11 items-center gap-2 text-sm"><input className="h-5 w-5 accent-blue-700" type="checkbox" role="switch" data-testid="jog-prefer-new" checked={preferNew} onChange={(e) => setPreferNew(e.target.checked)} />Prefer new streets</label>
    {!valid && <p role="alert" className="mb-3 text-sm text-amber-900">Choose 0.5 to 42 km and a pace of 2 to 20 min/km.</p>}
    </div>
    <div ref={results} className="jog-panel-results">
    {p.areaError && <p role="alert" className="mb-3 text-sm">The walking map did not load. <button className={btn} type="button" onClick={p.onRetryArea}>Try again</button></p>}
    {p.start && !p.ready && !p.areaError && <p role="status" className="mb-3 text-sm">Loading the walking map and shade...</p>}
    {busy && <p role="status" className="mb-3 text-sm">Finding loops...</p>}
    {error && <p role="alert" className="mb-3 text-sm text-amber-900">{error}</p>}
    {reply && <><div role="status" className="mb-3 space-y-1 text-sm text-slate-600">{reply.result.notes.map((n) => <p key={n}>{n}</p>)}</div>
      <JogCards loops={reply.result.loops} selected={selected} onSelect={(n) => { setSelected(n); p.onLoop(reply.result.loops[n]); }} onMark={mark} saved={saved} saving={saving} litShare={reply.litShare} grade={reply.grade} />
    </>}
    <button className={`${btn} my-3 w-full`} type="button" data-testid="jog-again" disabled={busy || !p.start || !valid} onClick={() => { lastSearch.current = runs; setSeed((s) => s + 1); }}>Other loops</button>
    <div className="border-t border-slate-200 pt-3 text-sm">
      <p data-testid="jog-history-count">{historyReady ? `${historyCount} saved ${historyCount === 1 ? "run" : "runs"} on this phone` : "Loading saved runs..."}</p>
      <p className="mt-1 text-slate-600">Mark as run saves the planned loop. Saved runs stay on this phone.</p>
      {safari && <p className="mt-2 text-slate-600">{JOG_COPY.safari}</p>}
      {historyNote && <p className="mt-2 text-amber-900">{historyNote}</p>}
      {storageError && <p role="alert" className="mt-2 text-amber-900">{storageError}</p>}
      <div className="mt-2 flex flex-wrap gap-2"><button className={btn} type="button" data-testid="jog-export" onClick={exportHistory}>Export</button>
        <button className={btn} type="button" data-testid="jog-clear" disabled={saving || !historyReady} onClick={async () => { try { await clearRuns(); setRuns([]); setHistoryCount(0); lastSearch.current = []; setSaved(new Set()); setHistoryNote(null); setStorageError(null); } catch { setStorageError("Saved runs could not be cleared."); } }}>Clear history</button></div>
    </div>
    </div>
  </section>;
}
