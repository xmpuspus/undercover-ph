/** Share the original ten-second wait between the high-accuracy request and one retry.
 * Permission denial and an exhausted time budget are final. */
export function locate(geo: Geolocation, success: PositionCallback, failure: PositionErrorCallback): void {
  const deadline = Date.now() + 10000;
  geo.getCurrentPosition(success, (error) => {
    if (error.code !== error.TIMEOUT && error.code !== error.POSITION_UNAVAILABLE) return failure(error);
    const remaining = Math.min(10000, deadline - Date.now());
    if (remaining <= 0) return failure(error);
    geo.getCurrentPosition(success, failure, { enableHighAccuracy: false, timeout: remaining, maximumAge: 60000 });
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}
