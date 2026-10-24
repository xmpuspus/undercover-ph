/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../../../..", import.meta.url));
const DIR = join(REPO, "app/public/data/areas/metro-core");
const PYTHON = join(REPO, "pipeline/shade/.venv/bin/python");

it.skipIf(!existsSync(PYTHON) || !["graph.json", "places.json", "hours.json"].every((f) => existsSync(join(DIR, f))))("runs both checker CLIs with real places and protects reverse, U-turn and road-reset parity", () => {
  const output = execFileSync(PYTHON, ["-B", fileURLToPath(new URL("./checker_probe.py", import.meta.url)), REPO, DIR], {
    cwd: REPO, encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }, timeout: 30000,
  });
  const result = JSON.parse(output) as { matrix_cases: number; uturns: number; reset: boolean; runs: { script: string; args: string[]; length_m: number; edges: number; junctions: number }[] };
  expect(result.matrix_cases).toBe(7168);
  expect(result.uturns).toBe(4);
  expect(result.reset).toBe(true);
  expect(result.runs).toHaveLength(6);
  for (let i = 0; i < 3; i++) {
    const { script: first, ...a } = result.runs[i];
    const { script: second, ...b } = result.runs[i + 3];
    expect(first).not.toBe(second);
    expect(a).toEqual(b);
  }
  console.log("CHECKER_ENTRYPOINTS", JSON.stringify(result));
}, 40000);
