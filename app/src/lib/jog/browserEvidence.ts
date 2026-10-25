import type { Page } from "@playwright/test";

/** GeoJSON parsing and camera animation can outlast the loop worker, especially under suite load. */
export async function waitForJogFrame(page: Page): Promise<void> {
  try {
    await page.waitForFunction(() => {
      const map = (window as unknown as { jogTestMap?: import("maplibre-gl").Map }).jogTestMap;
      if (!map || map.isMoving() || !["jog-line", "jog-km-dot", "jog-direction"].every((id) =>
        !!map.getLayer(id) && map.queryRenderedFeatures({ layers: [id] }).length > 0)) return false;
      const source = map.getSource("jog-km") as import("maplibre-gl").GeoJSONSource | undefined;
      const data = source?.serialize().data as GeoJSON.FeatureCollection<GeoJSON.Point> | undefined;
      const rect = map.getContainer().getBoundingClientRect();
      const panel = document.querySelector('[data-testid="panel"]')?.getBoundingClientRect();
      // Layer data may be ready during the 150 ms before JogLayer starts its camera fit.
      return !!data?.features.length && data.features.every((f) => {
        const point = map.project(f.geometry.coordinates as [number, number]);
        const x = point.x + rect.x, y = point.y + rect.y;
        const el = document.elementFromPoint(x, y);
        return x > rect.x + 10 && x < rect.right - 10 && y > rect.y + 10 && y < rect.bottom - 10 &&
          (!panel || (rect.right - rect.x < 768 ? y < panel.y - 10 : x > panel.x + panel.width + 10)) &&
          !!el && !el.closest('[data-testid="panel"]') && !el.closest('[data-testid="top-banner"]');
      });
    }, undefined, { timeout: 60_000 });
  } catch (error) {
    const state = await page.evaluate(() => {
      const map = (window as unknown as { jogTestMap?: import("maplibre-gl").Map }).jogTestMap;
      if (!map) return { map: false };
      const layers = Object.fromEntries(["jog-line", "jog-km-dot", "jog-direction"].map((id) => [id,
        map.getLayer(id) ? map.queryRenderedFeatures({ layers: [id] }).length : null]));
      return { moving: map.isMoving(), styleLoaded: map.isStyleLoaded(), layers, padding: map.getPadding(), bounds: map.getBounds().toArray() };
    }).catch((diagnosticError: unknown) => ({ diagnosticsUnavailable: String(diagnosticError) }));
    console.log("JOG_FRAME_NOT_READY", JSON.stringify(state));
    throw error;
  }
}

/** The controller retains native output. Evidence must not change files inside its source snapshot. */
export async function emitJogScreenshot(page: Page, name: string, emit: (...args: string[]) => void = console.log): Promise<void> {
  const png = await page.screenshot({ fullPage: true });
  emit("JOG_SCREENSHOT", name, png.toString("base64"));
}
