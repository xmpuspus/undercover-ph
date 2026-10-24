import { resolve } from "node:path";
import type { Plugin } from "vite";

const COMPONENTS = ["MapView", "Steps", "Navigate", "About", "RainLayer"];
const MODULE = "virtual:lazy-chunks";
const RESOLVED = `\0${MODULE}`;

/** Rollup supplies the same hashed URLs used by the lazy imports, including in tabs opened before a deploy. */
export function lazyChunks(): Plugin {
  let root: string;
  let base: string;
  let build = false;
  const references = new Map<string, string>();
  return {
    name: "lazy-chunk-urls",
    configResolved(config) { root = config.root; base = config.base; build = config.command === "build"; },
    buildStart() {
      if (!build) return;
      for (const name of COMPONENTS) references.set(name, this.emitFile({
        type: "chunk", id: resolve(root, `src/components/${name}.tsx`), name, preserveSignature: "strict",
      }));
    },
    resolveId(id) { if (id === MODULE) return RESOLVED; },
    load(id) {
      if (id !== RESOLVED) return;
      const entries = COMPONENTS.map((name) => `${JSON.stringify(name)}: ${build
        ? `import.meta.ROLLUP_FILE_URL_${references.get(name)!}`
        : JSON.stringify(`${base}src/components/${name}.tsx`)}`);
      return `export default {${entries.join(",")}};`;
    },
  };
}
