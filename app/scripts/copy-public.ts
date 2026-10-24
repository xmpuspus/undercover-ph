import { constants } from "node:fs";
import { copyFile, mkdir, readdir, realpath, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

/** Keep public assets as independent files, with filesystem clones when available and normal copies elsewhere. */
export async function copyPublicAssets(publicDir: string, outputDir: string, generated: ReadonlySet<string>): Promise<void> {
  if (!publicDir || !outputDir) throw new Error("Public asset paths must be nonempty.");
  const source = resolve(publicDir), target = resolve(outputDir);
  if (source === target || source.startsWith(`${target}${sep}`) || target.startsWith(`${source}${sep}`)) {
    throw new Error("Public assets and build output must use separate directories.");
  }
  const files: string[] = [];
  const directories: string[] = [];
  const visit = async (dir: string, ancestors: Set<string>): Promise<void> => {
    const canonical = await realpath(join(source, dir));
    if (ancestors.has(canonical)) throw new Error("Public asset directory contains a symlink cycle.");
    const parents = new Set(ancestors).add(canonical);
    directories.push(dir);
    for (const entry of await readdir(join(source, dir), { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (generated.has(path.split(sep).join("/"))) continue;
      const directory = entry.isDirectory() || (entry.isSymbolicLink() && (await stat(join(source, path))).isDirectory());
      if (directory) await visit(path, parents);
      else files.push(path);
    }
  };
  await visit("", new Set());
  await Promise.all(directories.map((dir) => mkdir(join(target, dir), { recursive: true })));
  // Serial synchronous copies held preview startup behind every small data file's filesystem latency.
  const queue = files.values();
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (const path of queue) await copyFile(join(source, path), join(target, path), constants.COPYFILE_FICLONE);
  }));
}
