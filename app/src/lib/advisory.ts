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

const joinAnd = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

const clock = (epoch: number) => {
  const d = new Date(epoch + MANILA_MS);
  const h = d.getUTCHours();
  return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

// mine: the cities of the area being planned. listed is true when the advisory names one of them or all of Metro
// Manila. An advisory that names no Metro Manila city (it covers only nearby provinces) gives no line: null.
export function advisoryLine(issuedAt: string, cities: string[], mine: string[] = ["Makati"]): { text: string; listed: boolean } | null {
  if (!cities.length) return null;
  const metro = cities.includes("Metro Manila");
  const listed = metro || mine.some((c) => cities.includes(c));
  // The planned area's cities first, so a long list never hides them.
  const names = [...cities.filter((c) => mine.includes(c)), ...cities.filter((c) => !mine.includes(c))];
  const where = metro ? "Metro Manila" : names.length <= 4 ? joinAnd(names) : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more cities`;
  const t0 = parseIssued(issuedAt);
  const until = t0 === null ? "" : ` until ${clock(t0 + ADVISORY_HOURS * 3600_000)}`;
  return { listed, text: `PAGASA expects thunderstorms over ${where}${until}.` };
}

// Regional PAGASA pages list places as "#Cebu(Talisay, CebuCity and Mandaue)". Same rules as
// pipeline/fetch_weather.py region_places, so the live line and the build file agree.
// One key for "Cebu City", "CebuCity" and "CityOfCebu": letters only, without "city of" or "city".
export function placeKey(name: string): string {
  const k = name.toLowerCase().replace(/ñ/g, "n").replace(/[^a-z]/g, "");
  return k.replace(/^cityof/, "").replace(/city$/, "") || k;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TAG = /#?[\p{L}\p{N}_.-]+\s*\([^()]*\)/gu;

/** The area cities and whole provinces that a regional advisory block names. */
export function regionPlaces(block: string, cities: string[], provinces: string[]): string[] {
  const cityKeys = new Map(cities.map((c) => [placeKey(c), c]));
  const provKeys = new Map(provinces.map((p) => [placeKey(p), p]));
  const found = new Set<string>();
  for (const m of block.matchAll(/\(([^()]*)\)/g)) {
    for (const item of m[1].split(/,|\band\b/)) {
      const c = cityKeys.get(placeKey(item));
      if (c) found.add(c);
    }
  }
  const bare = block.replace(TAG, " ");
  for (const c of cities) if (new RegExp(`\\b${esc(c)}\\b`, "u").test(bare)) found.add(c);
  for (const m of bare.matchAll(/#([\p{L}\p{N}_.-]+)/gu)) {
    const p = provKeys.get(placeKey(m[1]));
    if (p) found.add(p);
  }
  const plain = bare.replace(/#[\p{L}\p{N}_.-]+/gu, " ");
  for (const p of provinces) if (new RegExp(`\\b${esc(p)}\\b(?!\\s*City)`, "u").test(plain)) found.add(p);
  return [...found].sort();
}

