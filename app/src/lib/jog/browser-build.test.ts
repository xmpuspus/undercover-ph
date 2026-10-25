import { expect, it, vi } from "vitest";
import { jogBrowserFiles } from "./browserBuild";

const { build, encodeGraph, searchFiles } = vi.hoisted(() => ({
  build: vi.fn().mockResolvedValue({ output: [{ type: "chunk", fileName: "assets/app.js", code: "production app" }] }),
  encodeGraph: vi.fn().mockReturnValue({ graph: "metro-core" }),
  searchFiles: vi.fn().mockReturnValue(new Map([["data/search/top.json", "search top"]])),
}));
vi.mock("vite", () => ({ build, loadConfigFromFile: vi.fn().mockResolvedValue({ config: { plugins: [{ name: "react" }, { name: "lazy-chunks" }, { name: "compact-route-data" }] } }) }));
vi.mock("../router/columns", () => ({ encodeGraph }));
vi.mock("../../../scripts/build-data", () => ({ searchFiles }));
vi.mock("node:fs/promises", () => ({ readFile: vi.fn(async () => "{}") }));

it("builds production app code without regenerating every area's transport beside timed tests", async () => {
  const files = await jogBrowserFiles("/app", "/app/src/lib/jog/qa/cache");
  expect(build).toHaveBeenCalledOnce();
  const config = build.mock.calls[0][0];
  expect(config.configFile).toBe(false);
  expect(config.build.write).toBe(false);
  expect(config.plugins.map((p: { name: string }) => p.name)).toEqual(["react", "lazy-chunks"]);
  expect(encodeGraph).toHaveBeenCalledOnce();
  expect(searchFiles).toHaveBeenCalledOnce();
  expect([...files.keys()].sort()).toEqual(["assets/app.js", "data/areas/metro-core/graph.cols.json", "data/search/top.json"]);
});
