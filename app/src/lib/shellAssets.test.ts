/// <reference types="node" />
import { expect, it } from "vitest";
import { shellAssets } from "../../scripts/shell-assets";
import type { Rollup } from "vite";

it("precaches the entry and its static dependencies while leaving lazy chunks and unused fonts for runtime", () => {
  const chunk = (fileName: string, imports: string[], facadeModuleId: string, dynamicImports: string[] = []) => ({
    type: "chunk", fileName, imports, dynamicImports, facadeModuleId, isEntry: true,
    viteMetadata: { importedCss: new Set([fileName === "assets/app.js" ? "assets/app.css" : "assets/empty.css"]) },
  } as unknown as Rollup.OutputChunk);
  const bundle = {
    "assets/app.js": chunk("assets/app.js", ["assets/shared.js"], "/app/index.html", ["assets/Navigate.js"]),
    "assets/shared.js": chunk("assets/shared.js", [], "/app/src/shared.ts"),
    "assets/Navigate.js": chunk("assets/Navigate.js", [], "/app/src/components/Navigate.tsx"),
    "assets/app.css": { type: "asset", fileName: "assets/app.css", source: '@font-face{src:url(./jost-latin-400-normal-test.woff2)}' },
    ...Object.fromEntries(["empty.css", "jost-latin-400-normal-test.woff2", "jost-cyrillic-400-normal-test.woff2", "jost-latin-400-normal-test.woff", "poster.png"].map((name) => [`assets/${name}`, { type: "asset", fileName: `assets/${name}`, source: "unused" }])),
  } as unknown as Rollup.OutputBundle;
  const assets = shellAssets(bundle);
  expect(assets).toEqual(expect.arrayContaining(["./assets/app.js", "./assets/shared.js", "./assets/app.css", "./assets/jost-latin-400-normal-test.woff2"]));
  for (const unused of ["Navigate.js", "jost-cyrillic-400-normal-test.woff2", "jost-latin-400-normal-test.woff", "poster.png"]) {
    expect(assets).not.toContain(`./assets/${unused}`);
  }
});
