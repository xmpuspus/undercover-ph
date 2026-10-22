import { describe, expect, it } from "vitest";
import { heatBand } from "./weather";

describe("heatBand", () => {
  it("follows the PAGASA bands", () => {
    expect(heatBand(26)).toBeNull();
    expect(heatBand(27)?.name).toBe("Caution");
    expect(heatBand(32)?.name).toBe("Caution");
    expect(heatBand(33)?.name).toBe("Extreme caution");
    expect(heatBand(41)?.name).toBe("Extreme caution");
    expect(heatBand(42)?.name).toBe("Danger");
    expect(heatBand(51)?.name).toBe("Danger");
    expect(heatBand(52)?.name).toBe("Extreme danger");
  });

  it("rounds first, so no decimal falls between two bands", () => {
    expect(heatBand(32.4)?.name).toBe("Caution");
    expect(heatBand(32.9)?.name).toBe("Extreme caution");
    expect(heatBand(26.4)).toBeNull();
    expect(heatBand(26.5)?.name).toBe("Caution");
    expect(heatBand(41.6)?.name).toBe("Danger");
  });
});
