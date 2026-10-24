/// <reference types="node" />
import { afterEach, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { routerHistoryAvailable } from "./router-baseline";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it("does not require the old commit to exist in a shallow CI checkout", () => {
  vi.mocked(execFileSync).mockImplementation(() => { throw new Error("fatal: Not a valid object name 9aae1dd"); });
  expect(routerHistoryAvailable()).toBe(false);
});

it("keeps the benchmark enabled when its original implementation is available", () => {
  vi.mocked(execFileSync).mockReturnValue("");
  expect(routerHistoryAvailable()).toBe(true);
  expect(vi.mocked(execFileSync).mock.calls.every(([command, args]) => command === "git" && args?.[0] === "cat-file")).toBe(true);
});

it("skips historical timing but still collects the real trip when the commit is absent", async () => {
  vi.mocked(execFileSync).mockImplementation(() => { throw new Error("fatal: Not a valid object name 9aae1dd"); });
  const actual = await vi.importActual<typeof import("vitest")>("vitest");
  const collected: { name: string; skipped: boolean }[] = [];
  const register = (skipped: boolean) => (name: string) => { collected.push({ name, skipped }); };
  const test = Object.assign(register(false), { each: () => register(false), skipIf: register });
  // Collect callbacks without executing tests or requiring the graph snapshot in this unit test.
  const suite = { skipIf: () => (_name: string, body: () => void) => { body(); } };
  vi.resetModules();
  vi.doMock("vitest", () => ({ ...actual, it: test, describe: suite }));
  try {
    await import("./production-routing.test");
    expect(collected.find((t) => t.name.includes("200 real place pairs"))?.skipped).toBe(true);
    expect(collected.find((t) => t.name.includes("Ayala MRT to Greenbelt"))?.skipped).toBe(false);
    expect(vi.mocked(execFileSync).mock.calls.every(([, args]) => args?.[0] === "cat-file")).toBe(true);
  } finally {
    vi.doUnmock("vitest");
    vi.resetModules();
  }
});
