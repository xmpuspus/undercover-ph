// Parse the PAGASA NCR regional forecast page into the advisory.json shape.
// Same rules as pipeline/fetch_weather.py, so the live function and the build file agree.
// Vercel does not deploy files in api/ whose name starts with "_" as functions.

export const ADVISORY_URL = "https://www.pagasa.dost.gov.ph/regional-forecast/ncrprsd";

const NCR_CITIES = [
  "Caloocan", "Las Piñas", "Las Pinas", "Makati", "Malabon", "Mandaluyong", "Manila", "Marikina",
  "Muntinlupa", "Navotas", "Parañaque", "Paranaque", "Pasay", "Pasig", "Pateros", "Quezon City",
  "San Juan", "Taguig", "Valenzuela",
];
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ntilde: "ñ", Ntilde: "Ñ" };

function unescape(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, k) => {
    if (k[0] === "#") return String.fromCodePoint(k[1].toLowerCase() === "x" ? parseInt(k.slice(2), 16) : Number(k.slice(1)));
    return NAMED[k] ?? m;
  });
}

// Whole words only, and "Manila" never inside "Metro Manila", which names the region, not the city.
function cityPattern(c) {
  return new RegExp(`${c === "Manila" ? "(?<!Metro )" : ""}\\b${c}\\b`);
}

export function parseAdvisory(page, fetchedAt) {
  const text = unescape(page.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const m = /(Thunderstorm Advisory No\.\s*\d+.*?)(?:Thunderstorm Watch|Heavy Rainfall|Rainfall Advisory|Regional Forecast|$)/.exec(text);
  const warning = /(As of today, there is no Heavy Rainfall Warning[^.]*\.)/.exec(text);
  const base = { status: "ok", source_url: ADVISORY_URL, fetched_at: fetchedAt, heavy_rainfall: warning ? warning[1] : null };
  if (!m) return { ...base, issued_at: null, text: null, cities: [], note: "No thunderstorm advisory text found on the page at fetch time." };
  const block = m[1].slice(0, 1200).trim();
  const issued = /Issued at:?\s*([0-9]{1,2}:[0-9]{2}\s*[AP]M,?\s*[0-9]{1,2}\s+\w+\s+[0-9]{4})/.exec(block);
  // An advisory can name the whole region ("Metro Manila", "NCR") instead of its cities. That covers Makati too.
  const region = /\bMetro Manila\b|\bNCR\b|National Capital Region/.test(block.replace(/#NCR_PRSD/g, ""));
  const cities = [...new Set([...NCR_CITIES.filter((c) => cityPattern(c).test(block)), ...(region ? ["Metro Manila"] : [])])].sort();
  return { ...base, issued_at: issued ? issued[1] : null, text: block, cities };
}

// Manila wall-clock time as ISO 8601 with +08:00, like the pipeline's fetched_at.
export function manilaNow(ms = Date.now()) {
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 19) + "+08:00";
}
