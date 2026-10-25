import { expect, it, vi } from "vitest";
import { locate } from "./location";

const point = { coords: { latitude: 14.54923, longitude: 121.02791 } } as GeolocationPosition;
const error = (code: number) => ({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);

it.each([2, 3])("recovers from transient location error %i before giving up the trip", (code) => {
  const success = vi.fn(), failure = vi.fn();
  const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>()
    .mockImplementationOnce((_ok, fail) => fail!(error(code)))
    .mockImplementationOnce((ok) => ok(point));
  locate({ getCurrentPosition } as unknown as Geolocation, success, failure);
  expect(success).toHaveBeenCalledWith(point);
  expect(failure).not.toHaveBeenCalled();
  expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  expect(getCurrentPosition.mock.calls[1][2]).toMatchObject({ enableHighAccuracy: false, maximumAge: 60000 });
  expect(getCurrentPosition.mock.calls[1][2]!.timeout).toBeGreaterThan(0);
  expect(getCurrentPosition.mock.calls[1][2]!.timeout).toBeLessThanOrEqual(10000);
});

it("reports denied permission without asking again", () => {
  const success = vi.fn(), failure = vi.fn(), denied = error(1);
  const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>((_ok, fail) => fail!(denied));
  locate({ getCurrentPosition } as unknown as Geolocation, success, failure);
  expect(getCurrentPosition).toHaveBeenCalledOnce();
  expect(success).not.toHaveBeenCalled();
  expect(failure).toHaveBeenCalledWith(denied);
});

it("bounds repeated location failures to two attempts", () => {
  const success = vi.fn(), failure = vi.fn(), timeout = error(3);
  const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>((_ok, fail) => fail!(timeout));
  locate({ getCurrentPosition } as unknown as Geolocation, success, failure);
  expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  expect(success).not.toHaveBeenCalled();
  expect(failure).toHaveBeenCalledOnce();
});

it("finishes a full location timeout within the original ten-second wait", async () => {
  vi.useFakeTimers();
  const success = vi.fn(), failure = vi.fn();
  const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>((_ok, fail, options) => {
    setTimeout(() => fail!(error(3)), options!.timeout);
  });
  try {
    locate({ getCurrentPosition } as unknown as Geolocation, success, failure);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(success).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(failure).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});

it("gives a late location retry only the time remaining in the ten-second budget", async () => {
  vi.useFakeTimers();
  const failure = vi.fn();
  const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>()
    .mockImplementationOnce((_ok, fail) => { setTimeout(() => fail!(error(2)), 6000); })
    .mockImplementationOnce((_ok, fail, options) => { setTimeout(() => fail!(error(3)), options!.timeout); });
  try {
    locate({ getCurrentPosition } as unknown as Geolocation, vi.fn(), failure);
    await vi.advanceTimersByTimeAsync(6000);
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(getCurrentPosition.mock.calls[1][2]!.timeout).toBe(4000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(failure).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});
