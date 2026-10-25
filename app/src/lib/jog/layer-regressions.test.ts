import { afterEach, expect, it, vi } from "vitest";
import type { Map as GLMap } from "maplibre-gl";
import JogLayer from "../../components/JogLayer";
import type { Loop } from "./types";

const { effects } = vi.hoisted(() => ({ effects: [] as (() => unknown)[] }));
vi.mock("react", () => ({ useEffect: (effect: () => unknown) => effects.push(effect) }));
afterEach(() => { effects.length = 0; vi.useRealTimers(); });
it("applies the panel insets before fitting even when the map has no inherited padding", () => {
  vi.useFakeTimers();
  const insets = { top: 80, bottom: 550, left: 16, right: 16 };
  const map = { setPadding: vi.fn(), fitBounds: vi.fn(), jumpTo: vi.fn(), getPitch: () => 74, getBearing: () => -28 };
  JogLayer({ map: map as unknown as GLMap, loop: { coords: [[121.02, 14.55], [121.03, 14.56]] } as Loop, styleTick: 1, styleReady: true, insets, onDrawn: vi.fn() });
  effects.at(-1)!();
  vi.advanceTimersByTime(151);
  expect(map.setPadding).toHaveBeenCalledWith(insets);
  expect(map.fitBounds).toHaveBeenCalledOnce();
  expect(map.setPadding.mock.invocationCallOrder[0]).toBeLessThan(map.fitBounds.mock.invocationCallOrder[0]);
  // The landing view's 74 degree tilt made a 5 km loop fit at zoom 12.7, so the fit starts from 25 degrees or less.
  expect(map.jumpTo).toHaveBeenCalledWith({ pitch: 25 });
  expect(map.jumpTo.mock.invocationCallOrder[0]).toBeLessThan(map.fitBounds.mock.invocationCallOrder[0]);
});
