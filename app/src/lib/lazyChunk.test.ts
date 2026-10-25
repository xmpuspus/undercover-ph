import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { lazyChunk } from "./lazyChunk";

let events: EventTarget;
const url = "https://undercover.test/assets/Navigate-test.js";
beforeEach(() => {
  events = new EventTarget();
  vi.stubGlobal("window", events);
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubEnv("PROD", true);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("shares one availability check and import between navigation components", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  const importer = vi.fn().mockResolvedValue({ TurnCard: "turn", NavSheet: "sheet" });
  const load = lazyChunk(url, importer);
  const first = load(), second = load();
  expect(second).toBe(first);
  expect(await first).toEqual({ TurnCard: "turn", NavSheet: "sheet" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(url, expect.objectContaining({ method: "HEAD", cache: "no-cache", signal: expect.any(AbortSignal) }));
  expect(importer).toHaveBeenCalledTimes(1);
});

it("starts the import alongside a slow availability check", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
  const importer = vi.fn().mockResolvedValue("module");
  const pending = lazyChunk(url, importer)();
  expect(importer).toHaveBeenCalledTimes(1);
  finish(new Response(null, { status: 200 }));
  expect(await pending).toBe("module");
});

it.each([404, 410])("uses preload recovery for a confirmed missing file (%i)", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
  const importer = vi.fn().mockResolvedValue("cached module");
  const recover = vi.fn((e: Event) => e.preventDefault());
  events.addEventListener("vite:preloadError", recover);
  const result = vi.fn();
  void lazyChunk(url, importer)().then(result, result);
  await vi.waitFor(() => expect(recover).toHaveBeenCalledTimes(1));
  expect(importer).toHaveBeenCalledTimes(1);
  expect(result).not.toHaveBeenCalled();
});

it("rejects into the app boundary when the one-reload handler declines recovery", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
  const importer = vi.fn().mockResolvedValue("cached module");
  await expect(lazyChunk(url, importer)()).rejects.toThrow("removed this file");
  expect(importer).toHaveBeenCalledTimes(1);
});

it.each([200, 405, 503])("allows the cached import for other server responses (%i)", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
  const importer = vi.fn().mockResolvedValue("cached module");
  expect(await lazyChunk(url, importer)()).toBe("cached module");
});

it("uses cached code when offline or the availability check fails", async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError("network unavailable"));
  vi.stubGlobal("fetch", fetcher);
  expect(await lazyChunk(url, async () => "cached module")()).toBe("cached module");
  expect(fetcher).toHaveBeenCalledTimes(1);
  vi.stubGlobal("navigator", { onLine: false });
  expect(await lazyChunk(url, async () => "offline module")()).toBe("offline module");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("keeps development imports independent of deployment probes", async () => {
  vi.stubEnv("PROD", false);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(await lazyChunk(url, async () => "dev module")()).toBe("dev module");
  expect(fetcher).not.toHaveBeenCalled();
});
