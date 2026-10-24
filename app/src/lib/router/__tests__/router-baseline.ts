/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";
import type { findRoutes } from "../route";

export const REPO = fileURLToPath(new URL("../../../../..", import.meta.url));

/** A shallow or squashed checkout need not contain this task's historical benchmark revision. */
export function routerHistoryAvailable(): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", "9aae1dd^{commit}"], { cwd: REPO, stdio: "ignore", timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

/** Load the pinned repository implementation in memory, without writing generated modules. */
export async function routerBaseline(revision: "9aae1dd" | "HEAD"): Promise<typeof findRoutes> {
  if (revision !== "9aae1dd" && revision !== "HEAD") throw new Error("Unknown routing baseline");
  const modules: Record<string, string> = {};
  for (const name of ["hours", "astar", "steps", "route"]) {
    const source = execFileSync("git", ["show", `${revision}:app/src/lib/router/${name}.ts`], { cwd: REPO, encoding: "utf8", timeout: 10000 });
    let js = stripTypeScriptTypes(source, { mode: "strip" });
    for (const [dependency, url] of Object.entries(modules)) js = js.replaceAll(`from "./${dependency}"`, `from "${url}"`);
    modules[name] = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  }
  return (await import(/* @vite-ignore */ modules.route)).findRoutes as typeof findRoutes;
}
