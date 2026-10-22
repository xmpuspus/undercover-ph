import { describe, expect, it } from "vitest";
import { manilaNow, parseAdvisory } from "../../api/_pagasa.js";

// Hand-built page in the shape of the PAGASA NCR page, with the advisory text seen on 2026-10-21.
const PAGE = `<html><body><div class="panel"><h3>Thunderstorm Advisory No. 8 #NCR_PRSD</h3>
<p>Issued at: 7:37 PM, 21 October 2026</p><p>Moderate to heavy rainshowers with lightning and strong winds
are expected over Caloocan, Quezon City, Valenzuela, and Marikina within the next 2 hours.</p></div>
<div><h3>Heavy Rainfall Warning</h3><p>As of today, there is no Heavy Rainfall Warning Issued.</p></div>
<div><h3>Regional Forecast</h3><p>Makati: partly cloudy.</p></div></body></html>`;

describe("PAGASA page parser", () => {
  it("reads the advisory number, issue time, and cities", () => {
    const a = parseAdvisory(PAGE, "2026-10-21T20:12:18+08:00");
    expect(a.status).toBe("ok");
    expect(a.issued_at).toBe("7:37 PM, 21 October 2026");
    expect(a.cities).toEqual(["Caloocan", "Marikina", "Quezon City", "Valenzuela"]);
    expect(a.text).toMatch(/^Thunderstorm Advisory No\. 8/);
    expect(a.heavy_rainfall).toBe("As of today, there is no Heavy Rainfall Warning Issued.");
  });

  it("stops the advisory text before the next section, so Makati in the forecast does not count", () => {
    expect(parseAdvisory(PAGE, "").cities).not.toContain("Makati");
  });

  it("reports no advisory when the page has none", () => {
    const a = parseAdvisory("<p>As of today, there is no Heavy Rainfall Warning Issued.</p>", "");
    expect(a).toMatchObject({ status: "ok", issued_at: null, text: null, cities: [] });
  });

  it("decodes entities in city names", () => {
    const a = parseAdvisory("<p>Thunderstorm Advisory No. 2 Issued at: 3:05 PM, 22 October 2026. Las Pi&ntilde;as and Para&#241;aque.</p>", "");
    expect(a.cities).toEqual(["Las Piñas", "Parañaque"]);
  });

  it("writes Manila time with a +08:00 offset", () => {
    expect(manilaNow(Date.UTC(2026, 9, 21, 12, 12, 18))).toBe("2026-10-21T20:12:18+08:00");
  });
});
