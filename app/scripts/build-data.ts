import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import type { AreaInfo, Place } from "../src/types";
import type { RawGraph } from "../src/lib/router/types";
import { encodeGraph } from "../src/lib/router/columns";
import { encodeSearch } from "../src/lib/searchIndex";
import { wellKnown } from "../src/lib/wellKnown";
import { SUGGESTED } from "../src/lib/suggested";
import { copyPublicAssets } from "./copy-public";
import { shellAssets } from "./shell-assets";

export function searchFiles(places: Place[], areas: AreaInfo[]): Map<string, string> {
  const selected = new Set<Place>();
  for (const p of places) {
    if (["station", "mall", "bus_station", "hospital", "landmark"].includes(p.category)) selected.add(p);
  }
  for (const a of areas) {
    for (const p of wellKnown(places, a.id, 6)) selected.add(p);
    for (const name of SUGGESTED[a.id] ?? []) {
      const p = places.find((p) => p.area === a.id && p.name.toLowerCase() === name.toLowerCase());
      if (p) selected.add(p);
    }
  }
  const entries = places.map((place, order) => ({ place, order }));
  const files = new Map<string, string>();
  const top = encodeSearch(entries.filter((e) => selected.has(e.place)));
  top.chunks = [];
  for (const a of areas) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.id)) throw new Error("Invalid area id in areas.json.");
    const rest = entries.filter((e) => e.place.area === a.id && !selected.has(e.place));
    if (!rest.length) continue;
    const file = `area-${a.id}.json`;
    top.chunks.push(file);
    files.set(`data/search/${file}`, JSON.stringify(encodeSearch(rest)));
  }
  const json = JSON.stringify(top);
  if (Buffer.byteLength(json) > 300_000) throw new Error("Search top.json exceeds 300 KB.");
  files.set("data/search/top.json", json);
  return files;
}

/** Generate transport files in the build output or in memory for dev. Never write public/data. */
export function compactData(): Plugin {
  let dataDir: string;
  let publicDir: string;
  let outputDir: string;
  let areas: AreaInfo[];
  let search: Map<string, string> | undefined;
  const read = <T,>(file: string): T => JSON.parse(readFileSync(join(dataDir, file), "utf8")) as T;
  const getSearch = () => search ??= searchFiles(read<Place[]>("places_index.json"), areas);
  const graph = (id: string) => JSON.stringify(encodeGraph(read<RawGraph>(`areas/${id}/graph.json`)));
  return {
    name: "compact-route-data",
    config() {
      return { build: { copyPublicDir: false } };
    },
    configResolved(config) {
      publicDir = config.publicDir;
      outputDir = resolve(config.root, config.build.outDir);
      dataDir = join(config.publicDir, "data");
      areas = read<{ areas: AreaInfo[] }>("areas.json").areas;
    },
    generateBundle(_options, bundle) {
      for (const [fileName, source] of getSearch()) this.emitFile({ type: "asset", fileName, source });
      for (const a of areas) this.emitFile({ type: "asset", fileName: `data/areas/${a.id}/graph.cols.json`, source: graph(a.id) });
      const shell = ["./", "./index.html", "./shell.js", "./manifest.webmanifest", "./favicon.svg", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
        ...shellAssets(bundle)];
      const version = createHash("sha256").update(JSON.stringify(shell)).digest("hex").slice(0, 16);
      const worker = readFileSync(join(dataDir, "../sw.js"), "utf8")
        .replace('"__BUILD_VERSION__"', JSON.stringify(version))
        .replace('["__BUILD_SHELL__"]', JSON.stringify(shell));
      this.emitFile({ type: "asset", fileName: "sw.js", source: worker });
    },
    async writeBundle(options, bundle) {
      // Copy after emission, preserving the generated worker and honoring CLI output directories.
      await copyPublicAssets(publicDir, options.dir ?? outputDir, new Set(Object.keys(bundle)));
    },
    configureServer(server) {
      server.watcher.on("change", (file) => { if (file.startsWith(dataDir)) search = undefined; });
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0].replace(/^\//, "");
        const match = /^data\/areas\/([a-z0-9-]+)\/graph\.cols\.json$/.exec(path);
        try {
          const source = path.startsWith("data/search/") ? getSearch().get(path) :
            match && areas.some((a) => a.id === match[1]) ? graph(match[1]) : undefined;
          if (source === undefined) return next();
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Content-Length", Buffer.byteLength(source));
          res.end(req.method === "HEAD" ? undefined : source);
        } catch (error) { next(error); }
      });
    },
  };
}
