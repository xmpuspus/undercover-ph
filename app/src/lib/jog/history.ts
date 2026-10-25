import type { Data } from "../router/types";
import { edgeLine, lineLength, pointAlong } from "./geometry";
import type { RunRecord, StreetPoint } from "./types";

function validPoint(p: unknown): p is StreetPoint {
  return Array.isArray(p) && p.length === 4 && p.every(Number.isSafeInteger) && p[0] >= 0 && p[1] >= 0 && p[1] <= 2 && Math.abs(p[2]) <= 18_000_000 && Math.abs(p[3]) <= 9_000_000;
}
export function validRun(raw: unknown): raw is RunRecord {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as RunRecord;
  if (!(typeof r.id === "string" && r.id.length > 0 && r.id.length <= 200 && typeof r.area === "string" && r.area.length <= 100 &&
    typeof r.date === "string" && /^\d{4}-\d\d-\d\d/.test(r.date) && r.date.length <= 40 && Number.isFinite(r.length_m) && r.length_m > 0 &&
    Array.isArray(r.streets) && r.streets.length <= 100_000)) return false;
  // IndexedDB can preserve sparse arrays. Array.every skips their holes; indexed reads reject them.
  for (let i = 0; i < r.streets.length; i++) if (!validPoint(r.streets[i])) return false;
  return true;
}

/** Sample geometry rather than edge ids so history survives edge splits and reorderings. */
export function streetsOf(data: Data, edges: number[]): StreetPoint[] {
  const out: StreetPoint[] = [];
  const done = new Set<number>();
  for (const e of edges) {
    if (!Number.isInteger(e) || e < 0 || e >= data.edgeCount || done.has(e) || data.edgeWay[e] < 0) continue;
    done.add(e);
    const line = edgeLine(data, e);
    const len = lineLength(data, line);
    if (!line.length) continue;
    // Leave room for the rounding error at five decimal places.
    const count = Math.max(1, Math.ceil(len / 23));
    for (let i = 0; i <= count; i++) {
      const [lon, lat] = pointAlong(data, line, len * i / count);
      out.push([data.edgeWay[e], data.edgeSide[e], Math.round(lon * 1e5), Math.round(lat * 1e5)]);
    }
  }
  return out;
}

/** A spatial hash bounds matching to nine nearby cells of the same way and sidewalk. */
export function historyMask(data: Data, runs: RunRecord[]): Uint8Array {
  const mask = new Uint8Array(data.edgeCount);
  if (!Array.isArray(runs) || !runs.length) return mask;
  const cells = new Map<string, [number, number][]>();
  let points = 0;
  for (const r of runs.slice(-10_000)) {
    const size = Array.isArray(r?.streets) ? r.streets.length : 0;
    if (size > 1_000_000 - points) break;
    points += Math.max(1, size);
    if (!validRun(r)) continue;
    for (const [way, side, lon, lat] of r.streets) {
      const x = lon * data.mPerLon / 1e5, y = lat * data.mPerLat / 1e5;
      const key = `${way}/${side}/${Math.floor(x / 30)}/${Math.floor(y / 30)}`;
      const list = cells.get(key) ?? [];
      // Repeated samples from the same run must not grow a bucket without bound.
      if (!list.some((p) => Math.abs(p[0] - x) < 0.5 && Math.abs(p[1] - y) < 0.5)) list.push([x, y]);
      cells.set(key, list);
    }
    if (points >= 1_000_000) break;
  }
  for (let e = 0; e < data.edgeCount; e++) {
    if (data.edgeWay[e] < 0) continue;
    const line = edgeLine(data, e);
    if (!line.length) continue;
    const p = pointAlong(data, line, lineLength(data, line) / 2);
    const x = p[0] * data.mPerLon, y = p[1] * data.mPerLat;
    for (let dx = -1; dx <= 1 && !mask[e]; dx++) for (let dy = -1; dy <= 1; dy++) {
      const key = `${data.edgeWay[e]}/${data.edgeSide[e]}/${Math.floor(x / 30) + dx}/${Math.floor(y / 30) + dy}`;
      if (cells.get(key)?.some(([px, py]) => Math.hypot(x - px, y - py) <= 30)) { mask[e] = 1; break; }
    }
  }
  return mask;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ucph-jog", 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("runs")) request.result.createObjectStore("runs", { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Saved runs could not open on this phone."));
    request.onblocked = () => reject(new Error("Close other tabs of this site to open saved runs."));
  });
}
export interface SavedRuns { runs: RunRecord[]; skipped: boolean; count: number }

function historyJob<T>(type: "read" | "export"): Promise<T> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try { worker = new Worker(new URL("./historyWorker.ts", import.meta.url), { type: "module" }); }
    catch { reject(new Error("Saved history could not be opened on this phone.")); return; }
    const timer = setTimeout(() => finish(new Error("Saved history took too long to open. You can clear it or try again.")), 10_000);
    const finish = (error?: Error, value?: T) => {
      clearTimeout(timer); worker.terminate();
      if (error) reject(error); else resolve(value!);
    };
    worker.onmessage = ({ data }) => finish(data?.error ? new Error(data.error) : undefined, data);
    worker.onerror = worker.onmessageerror = () => finish(new Error("Saved history could not be opened on this phone."));
    try { worker.postMessage({ type }); }
    catch { finish(new Error("Saved history could not be opened on this phone.")); }
  });
}

export function readRuns(): Promise<SavedRuns> {
  return typeof document !== "undefined" ? historyJob("read") : readRunsLocal();
}

/** Cursor reads stay off the page thread, including cloning a single oversized legacy record. */
export async function readRunsLocal(): Promise<SavedRuns> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const runs: RunRecord[] = [];
    let skipped = false, count = 0, inspected = 0;
    const tx = db.transaction("runs");
    const total = tx.objectStore("runs").count();
    const req = tx.objectStore("runs").openCursor(null, "prev");
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      count++;
      const value: unknown = c.value;
      const points = value && typeof value === "object" && Array.isArray((value as RunRecord).streets) ? (value as RunRecord).streets.length : 0;
      // Charge rejected records too, before any sample validation. One record can exceed the
      // remaining allowance; stop on that record instead of cloning and rejecting the rest.
      if (points > 1_000_000 - inspected || count > 10_000) { skipped = true; return; }
      inspected += Math.max(1, points);
      if (validRun(value)) {
        // Do not send unknown stored properties back to the page. They can contain large payloads
        // outside the sample allowance, including properties attached to arrays and tuples.
        const streets: StreetPoint[] = [];
        for (let i = 0; i < value.streets.length; i++) {
          const p = value.streets[i]; streets.push([p[0], p[1], p[2], p[3]]);
        }
        runs.push({ id: value.id, area: value.area, date: value.date, length_m: value.length_m, streets });
      } else skipped = true;
      if (count >= total.result) return;
      if (count < 10_000 && inspected < 1_000_000) c.continue(); else skipped = true;
    };
    tx.oncomplete = () => { db.close(); resolve({ runs, skipped, count: total.result }); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error("Saved runs could not be read.")); };
  });
}
/** Export all stored records, independently of the smaller set used for scoring. */
export function exportRuns(): Promise<Blob> {
  return typeof document !== "undefined" ? historyJob("export") : exportRunsLocal();
}
export async function exportRunsLocal(): Promise<Blob> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const parts: BlobPart[] = ['{"runs":['];
    let bytes = 0, count = 0, error: Error | null = null;
    const tx = db.transaction("runs");
    const req = tx.objectStore("runs").openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      try {
        const part = new Blob([`${count ? "," : ""}${JSON.stringify(c.value)}`]);
        bytes += part.size;
        if (bytes > 50_000_000) throw new Error("Saved history is too large to export on this phone. No partial file was downloaded.");
        parts.push(part); count++; c.continue();
      } catch (e) { error = e instanceof Error ? e : new Error("Saved history could not be exported."); tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); resolve(new Blob([...parts, "]}"], { type: "application/json" })); };
    tx.onabort = tx.onerror = () => { db.close(); reject(error ?? new Error("Saved runs could not be exported.")); };
  });
}
async function writeRuns(record?: RunRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("runs", "readwrite");
    if (record) tx.objectStore("runs").put(record);
    else tx.objectStore("runs").clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(new Error("Saved runs could not be changed. This phone may be out of storage.")); };
  });
}
export async function saveRun(record: RunRecord): Promise<void> {
  if (!validRun(record)) throw new Error("This run could not be saved.");
  await writeRuns(record);
}
export const clearRuns = () => writeRuns();
