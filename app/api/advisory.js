// Live PAGASA NCR thunderstorm advisory. An advisory covers only 2 hours, so the copy that the
// daily build writes to data/advisory.json is stale for most of the day. The edge cache keeps
// PAGASA at about one request per 10 minutes per region. The request carries no route or location.
// If PAGASA fails, the function answers 502 and the app falls back to data/advisory.json.
import { ADVISORY_URL, manilaNow, parseAdvisory } from "./_pagasa.js";

export default async function handler(req, res) {
  try {
    const r = await fetch(ADVISORY_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (undercover-ph prototype)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`PAGASA answered ${r.status}`);
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=600");
    res.status(200).json(parseAdvisory(await r.text(), manilaNow()));
  } catch (e) {
    // Cache the failure for a minute too, so a PAGASA outage does not turn every page load into a fetch.
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
    res.status(502).json({ status: "unavailable", fetched_at: manilaNow(), reason: String(e).slice(0, 300) });
  }
}
