// Set by vite.config.ts from public/data/areas.json at build time.
declare const __AREA_COUNTS__: { ncr: number; other: number };

declare module "virtual:lazy-chunks" {
  const urls: Record<"MapView" | "Steps" | "Navigate" | "About" | "RainLayer", string>;
  export default urls;
}
