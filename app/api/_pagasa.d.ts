import type { AdvisoryOk } from "../src/types";

export const ADVISORY_URL: string;
export function parseAdvisory(page: string, fetchedAt: string): AdvisoryOk & { note?: string };
export function manilaNow(ms?: number): string;
