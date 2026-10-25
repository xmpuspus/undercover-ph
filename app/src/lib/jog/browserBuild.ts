/// <reference types="node" />
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, loadConfigFromFile, type Plugin, type Rollup } from "vite";
import { encodeGraph } from "../router/columns";
import { searchFiles } from "../../../scripts/build-data";

/** Build the actual app, with the same graph and search encoders, without redundantly encoding
 * all 67 areas while the router timing gates run. These browser cases exercise Metro Core only. */
export async function jogBrowserFiles(root: string, cacheDir: string): Promise<Map<string, Buffer>> {
  const loaded = await loadConfigFromFile({ command: "build", mode: "production" }, resolve(root, "vite.config.ts"), root, undefined, undefined, "runner");
  if (!loaded) throw new Error("The production app configuration did not load.");
  const config = loaded.config;
  const output = await build({ ...config, root, configFile: false, logLevel: "warn", cacheDir,
    plugins: config.plugins?.filter((p) => (p as Plugin)?.name !== "compact-route-data"),
    build: { ...config.build, write: false, copyPublicDir: false } });
  const files = new Map<string, Buffer>();
  for (const result of (Array.isArray(output) ? output : [output]) as Rollup.RollupOutput[]) {
    for (const file of result.output) files.set(file.fileName, Buffer.from(file.type === "chunk" ? file.code : file.source));
  }
  const read = async (name: string) => JSON.parse(await readFile(resolve(root, "public/data", name), "utf8"));
  const [places, index, graph] = await Promise.all([read("places_index.json"), read("areas.json"), read("areas/metro-core/graph.json")]);
  for (const [name, text] of searchFiles(places, index.areas)) files.set(name, Buffer.from(text));
  files.set("data/areas/metro-core/graph.cols.json", Buffer.from(JSON.stringify(encodeGraph(graph))));
  return files;
}
