// Live PAGASA thunderstorm advisory, for Metro Manila or another region. An advisory covers only 2 hours, so the copy that the
// daily build writes to data/advisory.json is stale for most of the day. The edge cache keeps
// PAGASA at about one request per 10 minutes per region. The request carries no route or location.
// If PAGASA fails, the function answers 502 and the app falls back to data/advisory.json.
import { ADVISORY_URL, PRSD, manilaNow, parseAdvisory, parseRegional, prsdUrl } from "./_pagasa.js";

// ?prsd=visprsd reads that region's page. Only the five PAGASA division slugs are accepted.
export default async function handler(req, res) {
  const prsd = PRSD.includes(req.query?.prsd) ? req.query.prsd : "ncrprsd";
  try {
    const r = await fetch(prsd === "ncrprsd" ? ADVISORY_URL : prsdUrl(prsd), {
      headers: { "User-Agent": "Mozilla/5.0 (undercover-ph prototype)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`PAGASA answered ${r.status}`);
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=600");
    const page = await r.text();
    res.status(200).json(prsd === "ncrprsd" ? parseAdvisory(page, manilaNow()) : parseRegional(page, prsd, manilaNow()));
  } catch (e) {
    // Cache the failure for a minute too, so a PAGASA outage does not turn every page load into a fetch.
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
    res.status(502).json({ status: "unavailable", fetched_at: manilaNow(), reason: String(e).slice(0, 300) });
  }
}
