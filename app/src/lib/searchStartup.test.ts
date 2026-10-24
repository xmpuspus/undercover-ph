import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeSearch } from "./searchIndex";
import type { Place } from "../types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const greenbelt: Place = { name: "Greenbelt", category: "shopping_area", area: "metro-core", lon: 121.0214001, lat: 14.5529988, node_id: 4352, aliases: [] };
const terminal: Place = { name: "Cebu terminal", category: "bus_station", area: "cebu-city-centre", lon: 123.9, lat: 10.3, node_id: 5, aliases: [] };

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("window", { location: { href: "https://undercover.test/" } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("search startup", () => {
  it("prepares each place once and batches a burst of shards without delaying the first results", async () => {
    const router = await import("./routerClient");
    const keys = vi.spyOn(router, "placeKeys");
    const top = encodeSearch([{ order: 3, place: greenbelt }]);
    top.chunks = Array.from({ length: 67 }, (_, i) => `area-${i}.json`);
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("top.json")) return Response.json(top);
      const n = Number(/area-(\d+)\.json$/.exec(url)![1]);
      return Response.json(encodeSearch(Array.from({ length: 600 }, (_, i) => ({
        order: 10 + n * 600 + i, place: { ...terminal, name: `Place ${n} ${i}`, node_id: n * 600 + i },
      }))));
    });
    vi.stubGlobal("fetch", fetcher);
    const { loadPlaceIndex } = await import("./data");
    const updates: { places: Place[]; placeKeys: ReturnType<typeof router.placeKeys> }[] = [];
    await loadPlaceIndex((index) => updates.push(index));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(68));
    expect(updates[0].places).toEqual([greenbelt]);
    expect(updates[0].placeKeys).toHaveLength(1);
    await vi.waitFor(() => expect(updates.at(-1)?.places).toHaveLength(40_201));
    expect(updates.length).toBeLessThanOrEqual(3);
    expect(keys.mock.calls.reduce((n, [places]) => n + places.length, 0)).toBe(40_201);
    const final = updates.at(-1)!;
    expect(final.placeKeys[0]).toBe(updates[0].placeKeys[0]);
    expect(final.placeKeys).toEqual(router.placeKeys(final.places));
    keys.mockRestore();
  });

  it("fetches the small index once before registering offline support, leaving shards for intent", async () => {
    const response = deferred<Response>();
    const fetcher = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => response.promise);
    vi.stubGlobal("fetch", fetcher);
    const register = vi.fn().mockResolvedValue({});
    vi.stubGlobal("navigator", { serviceWorker: { register, addEventListener: vi.fn(), controller: null } });
    vi.stubEnv("PROD", true);
    const { primePlaceIndex, loadPlaceIndex } = await import("./data");
    const { registerOffline } = await import("./offline");
    const top = encodeSearch([{ order: 0, place: greenbelt }]);
    top.chunks = ["area-cebu.json"];

    const ready = primePlaceIndex();
    registerOffline(ready);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toMatch(/\/data\/search\/top\.json$/);
    expect(register).not.toHaveBeenCalled();
    response.resolve(Response.json(top));
    await ready;
    await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenCalledTimes(1);

    const rest = deferred<Response>();
    fetcher.mockImplementation(() => rest.promise);
    const updates: Place[][] = [];
    await loadPlaceIndex((index) => updates.push(index.places));
    expect(updates).toEqual([[greenbelt]]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toMatch(/\/data\/search\/area-cebu\.json$/);
    rest.resolve(Response.json(encodeSearch([{ order: 1, place: terminal }])));
    await vi.waitFor(() => expect(updates.at(-1)).toEqual([greenbelt, terminal]));
  });

  it("registers on preload failure and lets a later search retry the small file", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(Response.json(encodeSearch([{ order: 0, place: greenbelt }])));
    vi.stubGlobal("fetch", fetcher);
    const register = vi.fn().mockResolvedValue({});
    vi.stubGlobal("navigator", { serviceWorker: { register, addEventListener: vi.fn(), controller: null } });
    vi.stubEnv("PROD", true);
    const { primePlaceIndex, loadPlaceIndex } = await import("./data");
    const { registerOffline } = await import("./offline");
    const first = primePlaceIndex();
    registerOffline(first);
    registerOffline(first);
    await expect(first).rejects.toThrow("Cannot load search/top.json");
    await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    const updates: Place[][] = [];
    await loadPlaceIndex((index) => updates.push(index.places));
    expect(updates).toEqual([[greenbelt]]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
