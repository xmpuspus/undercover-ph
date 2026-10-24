/// <reference types="node" />
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { copyPublicAssets } from "../../scripts/copy-public";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(fileURLToPath(new URL("../../scripts/.copy-test-", import.meta.url))); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

it("copies every public file to a custom output and preserves generated worker and graph assets", async () => {
  const source = join(dir, "public"), output = join(dir, "custom-output");
  await Promise.all([
    mkdir(join(source, "data/areas/metro-core/shade"), { recursive: true }),
    mkdir(join(source, "empty"), { recursive: true }),
    mkdir(join(output, "data/areas/metro-core"), { recursive: true }),
  ]);
  const files: Record<string, Uint8Array | string> = {
    "shell.js": "shell", "manifest.webmanifest": '{"name":"undercover.ph"}',
    "data/areas/metro-core/graph.json": '{"nodes":[[121,14]],"edges":[]}',
    "data/areas/metro-core/shade/day.bin": Uint8Array.from({ length: 262144 }, (_, i) => i % 256),
  };
  await Promise.all([
    ...Object.entries(files).map(([path, bytes]) => writeFile(join(source, path), bytes)),
    writeFile(join(source, "sw.js"), "placeholder worker"),
    writeFile(join(output, "sw.js"), "built worker with shell hashes"),
    writeFile(join(output, "data/areas/metro-core/graph.cols.json"), "built graph columns"),
  ]);
  await copyPublicAssets(source, output, new Set(["sw.js", "data/areas/metro-core/graph.cols.json"]));
  await Promise.all(Object.keys(files).map(async (path) => {
    const [copied, original] = await Promise.all([readFile(join(output, path)), readFile(join(source, path))]);
    expect(copied).toEqual(original);
  }));
  expect(await readFile(join(output, "sw.js"), "utf8")).toBe("built worker with shell hashes");
  expect(await readFile(join(output, "data/areas/metro-core/graph.cols.json"), "utf8")).toBe("built graph columns");
  expect((await stat(join(output, "empty"))).isDirectory()).toBe(true);
  await writeFile(join(output, "data/areas/metro-core/graph.json"), "changed output");
  expect(await readFile(join(source, "data/areas/metro-core/graph.json"), "utf8")).toBe(files["data/areas/metro-core/graph.json"]);
  await rm(join(source, "shell.js"));
  expect(await readFile(join(output, "shell.js"), "utf8")).toBe("shell");
}, 30_000);

it("copies symlink targets as independent files and rejects directory cycles", async () => {
  const source = join(dir, "public"), output = join(dir, "output");
  await mkdir(join(source, "original"), { recursive: true });
  await writeFile(join(source, "original/icon.svg"), "icon");
  await symlink("original/icon.svg", join(source, "file.svg"));
  await symlink("original", join(source, "linked"));
  await copyPublicAssets(source, output, new Set());
  expect(await readFile(join(output, "file.svg"), "utf8")).toBe("icon");
  expect(await readFile(join(output, "linked/icon.svg"), "utf8")).toBe("icon");
  await symlink("..", join(source, "original/cycle"));
  await expect(copyPublicAssets(source, output, new Set())).rejects.toThrow("symlink cycle");
}, 30_000);

it("rejects empty, overlapping and missing source paths", async () => {
  const source = join(dir, "public");
  for (const [from, to] of [["", dir], [dir, ""], [source, source], [source, join(source, "dist")], [source, dir]]) {
    await expect(copyPublicAssets(from, to, new Set())).rejects.toThrow();
  }
  await expect(copyPublicAssets(source, join(dir, "output"), new Set())).rejects.toThrow();
});
