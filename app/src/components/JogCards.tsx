import { loopFacts } from "../lib/jog/copy";
import type { Loop, SightGrade } from "../lib/jog/types";

export const loopKey = (loop: Loop) => loop.edgeIds.join(",");
const button = "min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-brand disabled:opacity-50";

export default function JogCards(p: { loops: Loop[]; selected: number; onSelect: (n: number) => void; onMark: (loop: Loop) => void; saved: Set<string>; saving: boolean; litShare: number | null; grade: SightGrade }) {
  return <div className="space-y-3">
    {p.loops.map((loop, i) => {
      const key = loopKey(loop), saved = p.saved.has(key);
      const facts = loopFacts(loop, p);
      return <article key={key} className={`rounded-card border-2 bg-white p-3 shadow-sm ${i === p.selected ? "border-brand" : "border-slate-200"}`}
        data-testid="jog-card" data-length-m={loop.length_m} data-new-pct={loop.new_pct ?? ""} data-shared-m={loop.shared_m} data-loop-key={key}>
        <button type="button" onClick={() => p.onSelect(i)} aria-pressed={i === p.selected} className="min-h-11 w-full text-left text-lg font-medium text-brand">
          Loop {i + 1} · {facts[0]}
        </button>
        <div className="space-y-1.5 text-sm leading-relaxed text-slate-700">{facts.slice(1).map((line) => <p key={line}>{line}</p>)}</div>
        {loop.warnings.length > 0 && <ul className="mt-2 space-y-1 text-sm text-amber-900">{loop.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
        <button type="button" className={`${button} mt-3 bg-blue-50`} data-testid="jog-mark-run" disabled={saved || p.saving} onClick={() => p.onMark(loop)}>
          {saved ? "Saved as run" : "Mark as run"}
        </button>
        <details className="mt-3 text-sm">
          <summary className="min-h-11 cursor-pointer py-3 font-medium text-brand" onClick={() => p.onSelect(i)}>Steps</summary>
          <ol className="space-y-3 border-t border-slate-100 pt-3">{loop.steps.map((s, n) => <li key={n}>
            <p>{n + 1}. {s.text}</p><p lang="fil" className="mt-0.5 text-slate-600">{s.textTl}</p>
            <p className="text-xs text-slate-500">{s.distance_m} m · {s.minutes} min</p>
          </li>)}</ol>
        </details>
      </article>;
    })}
  </div>;
}
