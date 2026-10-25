import { afterEach, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import { emitJogScreenshot, waitForJogFrame } from "./browserEvidence";

afterEach(() => vi.unstubAllGlobals());

it("waits while rendered kilometre marks are still hidden before the delayed fit", async () => {
  let exposed = false;
  const map = {
    isMoving: () => false, getLayer: () => ({}), queryRenderedFeatures: () => [{}],
    getContainer: () => ({ getBoundingClientRect: () => ({ x: 0, y: 48, right: 375, bottom: 811 }) }),
    getSource: () => ({ serialize: () => ({ data: { features: [{ geometry: { coordinates: [121.02, 14.55] } }] } }) }),
    project: () => ({ x: 180, y: 200 }),
  };
  vi.stubGlobal("window", { jogTestMap: map });
  vi.stubGlobal("document", {
    elementFromPoint: () => ({ closest: () => exposed ? null : {} }),
    querySelector: () => ({ getBoundingClientRect: () => ({ x: 0, y: 276.90625, width: 375 }) }),
  });
  const checks: boolean[] = [];
  const page = { waitForFunction: async (ready: () => boolean) => {
    checks.push(ready()); exposed = true; checks.push(ready());
  } };
  await waitForJogFrame(page as unknown as Page);
  expect(checks).toEqual([false, true]);
});

it.each([375, 1920])("waits for the original 10 px panel clearance at %i px", async (width) => {
  const point = { x: width < 768 ? 180 : 390, y: width < 768 ? 223 : 200 };
  const map = {
    isMoving: () => false, getLayer: () => ({}), queryRenderedFeatures: () => [{}],
    getContainer: () => ({ getBoundingClientRect: () => ({ x: 0, y: 48, right: width, bottom: 811 }) }),
    getSource: () => ({ serialize: () => ({ data: { features: [{ geometry: { coordinates: [121.02, 14.55] } }] } }) }),
    project: () => point,
  };
  vi.stubGlobal("window", { jogTestMap: map });
  vi.stubGlobal("document", {
    elementFromPoint: () => ({ closest: () => null }),
    querySelector: () => ({ getBoundingClientRect: () => width < 768 ? { x: 0, y: 276.90625, width: 375 } : { x: 16, y: 72, width: 368 } }),
  });
  const checks: boolean[] = [];
  const page = { waitForFunction: async (ready: () => boolean) => {
    checks.push(ready()); point.x += 15; point.y -= 15; checks.push(ready());
  } };
  await waitForJogFrame(page as unknown as Page);
  expect(checks).toEqual([false, true]);
});

it("waits for each rendered loop layer and the camera, rather than elapsed wall time", async () => {
  let moving = false;
  const loaded = new Set<string>(), drawn = new Set<string>();
  const map = {
    getLayer: (id: string) => loaded.has(id), isMoving: () => moving,
    queryRenderedFeatures: ({ layers }: { layers: string[] }) => drawn.has(layers[0]) ? [{}] : [],
    getContainer: () => ({ getBoundingClientRect: () => ({ x: 0, y: 48, right: 375, bottom: 811 }) }),
    getSource: () => ({ serialize: () => ({ data: { features: [{ geometry: { coordinates: [121.02, 14.55] } }] } }) }),
    project: () => ({ x: 180, y: 150 }),
  };
  vi.stubGlobal("window", { jogTestMap: map });
  vi.stubGlobal("document", {
    elementFromPoint: () => ({ closest: () => null }),
    querySelector: () => ({ getBoundingClientRect: () => ({ x: 0, y: 276.90625, width: 375 }) }),
  });
  const checks: boolean[] = [];
  const page = { waitForFunction: async (ready: () => boolean) => {
    checks.push(ready());
    for (const id of ["jog-line", "jog-km-dot", "jog-direction"]) loaded.add(id);
    checks.push(ready());
    for (const id of ["jog-line", "jog-km-dot", "jog-direction"]) { drawn.add(id); checks.push(ready()); }
    moving = true; checks.push(ready());
    moving = false; checks.push(ready());
  } };
  await waitForJogFrame(page as unknown as Page);
  expect(checks).toEqual([false, false, false, false, true, false, true]);
});

it("retains screenshot evidence in captured output without writing source files", async () => {
  const screenshot = vi.fn().mockResolvedValue(Buffer.from("png evidence"));
  const emit = vi.fn();
  await emitJogScreenshot({ screenshot } as unknown as Page, "loop-1920-night", emit);
  expect(screenshot).toHaveBeenCalledWith({ fullPage: true });
  expect(emit).toHaveBeenCalledWith("JOG_SCREENSHOT", "loop-1920-night", Buffer.from("png evidence").toString("base64"));
});

it("retains camera diagnostics when the frame wait fails, and preserves the failure", async () => {
  const failure = new Error("Frame timed out"), state = { moving: true, layers: { "jog-line": 1, "jog-km-dot": 0, "jog-direction": 1 } };
  const page = { waitForFunction: vi.fn().mockRejectedValue(failure), evaluate: vi.fn().mockResolvedValue(state) };
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await expect(waitForJogFrame(page as unknown as Page)).rejects.toBe(failure);
    expect(log).toHaveBeenCalledWith("JOG_FRAME_NOT_READY", JSON.stringify(state));
  } finally { log.mockRestore(); }
});
