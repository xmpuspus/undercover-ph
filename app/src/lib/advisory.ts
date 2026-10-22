// PAGASA NCR thunderstorm advisories cover the next 2 hours from their issue time (Asia/Manila, UTC+8).
export const ADVISORY_HOURS = 2;
const MANILA_MS = 8 * 3600_000;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// "10:10 PM, 21 October 2026" (Manila time) -> epoch ms, or null when the text does not parse.
export function parseIssued(s: string | null | undefined): number | null {
  const m = /(\d{1,2}):(\d{2})\s*([AP]M)\s*,?\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i.exec(s ?? "");
  if (!m) return null;
  const month = MONTHS.indexOf(m[5].toLowerCase());
  if (month < 0) return null;
  const hour = (Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return Date.UTC(Number(m[6]), month, Number(m[4]), hour, Number(m[2])) - MANILA_MS;
}

// A manifest date ("2026-10-22") plus minutes after midnight, Manila time -> epoch ms.
export function manilaEpoch(date: string, minute: number): number {
  const [y, mo, d] = date.split("-").map(Number);
  return Date.UTC(y, mo - 1, d, 0, minute) - MANILA_MS;
}

// True when the departure falls inside [issued, issued + 2 hours].
export function advisoryCovers(issuedAt: string | null | undefined, date: string, minute: number): boolean {
  const t0 = parseIssued(issuedAt);
  if (t0 === null || !date) return false;
  const t = manilaEpoch(date, minute);
  return t >= t0 && t <= t0 + ADVISORY_HOURS * 3600_000;
}

export function advisoryLine(issuedAt: string, cities: string[]): { text: string; makati: boolean } {
  const time = /(\d{1,2}:\d{2}\s*[AP]M)/i.exec(issuedAt)?.[1] ?? issuedAt;
  const makati = cities.includes("Makati");
  const list = cities.length ? cities.join(", ") : "no Metro Manila city named";
  return {
    makati,
    text: `PAGASA thunderstorm advisory, issued ${time}: ${list}. Makati is ${makati ? "listed" : "not listed"}.`,
  };
}
