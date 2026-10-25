import type { Data } from "../router/types";
import type { JogQuery, JogResult, SightGrade } from "./types";

export interface LoopReply { result: JogResult; litShare: number | null; grade: SightGrade }
export class JogClient {
  private worker: Worker;
  private sent = new Map<string, { data: Data; days: Set<number> }>();
  private id = 0;
  private pending = new Map<number, { resolve: (v: LoopReply) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private failed = false;
  constructor() {
    this.worker = new Worker(new URL("./jogWorker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = ({ data: m }) => {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id); clearTimeout(p.timer);
      if (m.error) p.reject(new Error(m.error)); else p.resolve(m);
    };
    this.worker.onerror = () => this.fail();
    this.worker.onmessageerror = () => this.fail();
  }
  private fail() {
    this.failed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error("Loop search could not start on this phone. Tap Other loops to try again.")); }
    this.pending.clear(); this.worker.terminate();
  }
  query(area: string, data: Data, base: string, query: JogQuery): Promise<LoopReply> {
    if (this.failed) return Promise.reject(new Error("Loop search could not start on this phone. Tap Other loops to try again."));
    const old = this.sent.get(area);
    if (!old || old.data !== data) {
      // Functions cannot cross a worker boundary; queries and history never go to fetch.
      this.worker.postMessage({ type: "init", area, data: { ...data, source: null }, base });
      if (this.sent.size >= 2) this.sent.delete(this.sent.keys().next().value!);
      this.sent.set(area, { data, days: new Set(data.shade ? Array.from(data.shade.loaded).flatMap((v, i) => v ? [i] : []) : []) });
    } else if (data.shade?.loaded[query.dateIdx] && !old.days.has(query.dateIdx)) {
      const s = data.shade, plane = s.nEdges * s.nBuckets, start = query.dateIdx * plane;
      const building = s.building.slice(start, start + plane), tree = s.tree.slice(start, start + plane);
      this.worker.postMessage({ type: "shade", area, date: query.dateIdx, building, tree }, [building.buffer, tree.buffer]);
      old.days.add(query.dateIdx);
    }
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(), 25_000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.worker.postMessage({ type: "query", area, id, query }); }
      catch { this.fail(); }
    });
  }
  close() { this.fail(); }
}
