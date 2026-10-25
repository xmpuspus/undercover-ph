import type { Rollup } from "vite";

/** Only the landing shell and the map needed to reopen a trip belong in the install download.
 * Other views and font subsets enter the asset cache when they are requested. */
export function shellAssets(bundle: Rollup.OutputBundle): string[] {
  const keep = new Set<string>();
  const visit = (name: string) => {
    if (keep.has(name)) return;
    const file = bundle[name];
    if (!file) return;
    keep.add(name);
    if (file.type !== "chunk") return;
    file.imports.forEach(visit);
    const css = (file as Rollup.OutputChunk & { viteMetadata?: { importedCss: Set<string> } }).viteMetadata?.importedCss;
    css?.forEach(visit);
  };
  for (const file of Object.values(bundle)) {
    if (file.type === "chunk" && (file.facadeModuleId?.endsWith("/index.html") || file.facadeModuleId?.endsWith("/components/MapView.tsx"))) visit(file.fileName);
    // The map library is a plain script URL, rather than an ES import.
    if (/^assets\/maplibre-gl-[^/]+\.js$/.test(file.fileName)) visit(file.fileName);
    if (/^assets\/jost-latin-(?:300|400|500|600)-normal-[^/]+\.woff2$/.test(file.fileName)) visit(file.fileName);
  }
  return [...keep].sort().map((name) => `./${name}`);
}
