import type { Data } from "../router/types";
import { loadJog, sightGrade } from "./attrs";
import { findLoops } from "./loops";
import type { JogAttrs, JogQuery } from "./types";

interface Area { data: Data; jog: JogAttrs | null; base: string; seed?: number; loading?: Promise<JogAttrs | null> }
const areas = new Map<string, Promise<Area>>();
type Message = { type: "init"; area: string; data: Data; base: string } | { type: "shade"; area: string; date: number; building: Uint8Array; tree: Uint8Array } | { type: "query"; area: string; id: number; query: JogQuery };
const worker = globalThis as unknown as { onmessage: (e: MessageEvent<Message>) => void; postMessage: (v: unknown) => void };
worker.onmessage = ({ data: m }) => {
  if (m.type === "init") {
    if (areas.size >= 2) areas.delete(areas.keys().next().value!);
    areas.set(m.area, loadJog(m.data, m.base).then((jog) => ({ data: m.data, jog, base: m.base })));
    return;
  }
  const area = areas.get(m.area);
  if (!area) return;
  if (m.type === "shade") {
    void area.then(({ data }) => {
      const s = data.shade;
      if (s) {
        const plane = s.nEdges * s.nBuckets;
        s.building.set(m.building, m.date * plane); s.tree.set(m.tree, m.date * plane); s.loaded[m.date] = 1;
      }
    });
    return;
  }
  void area.then(async (state) => {
    try {
      const seed = m.query.seed ?? 1;
      if (!state.jog && state.seed !== undefined && state.seed !== seed) {
        state.loading ??= loadJog(state.data, state.base);
        state.jog = await state.loading;
        state.loading = undefined;
      }
      state.seed = seed;
      const { data, jog } = state;
      worker.postMessage({ id: m.id, result: findLoops(data, jog, m.query), litShare: jog?.litShare ?? null, grade: jog ? sightGrade(jog, data) : "thin" });
    } catch {
      worker.postMessage({ id: m.id, error: "Could not find loops from this start. Try another place or distance." });
    }
  }).catch(() => worker.postMessage({ id: m.id, error: "The walking map could not load for runs. Try again." }));
};
