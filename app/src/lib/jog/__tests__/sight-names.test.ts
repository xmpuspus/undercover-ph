import { expect, it } from "vitest";
import { makeData } from "../../router/__tests__/helpers";
import { parseJog } from "../attrs";
import { rawJog } from "./fixtures";

// Acceptance for SPEC J-U7 (app/src/lib/jog/SPEC.md). OSM names can hold several values separated by ";". On
// 2026-10-24 a Rizal Park card listed "Kilometer Zero (Manila);KM 0". A card shows the first value only.

const data = makeData({ nodes: [[0, 0], [100, 0]], edges: [{ u: 0, v: 1 }] });
const sight = (name: string) => ({ name, kind: "historic", lon: 121.02, lat: 14.55, src: "osm:n1" });

it("keeps the first of several ';'-separated name values, trimmed", () => {
  const jog = parseJog(rawJog(data, { sights: [sight("Kilometer Zero (Manila);KM 0"), sight(" Rizal Monument ; Luneta "), sight("Plain Name")] }), 1)!;
  expect(jog.sights.map((s) => s.name)).toEqual(["Kilometer Zero (Manila)", "Rizal Monument", "Plain Name"]);
});

it("uses the next value when the first is empty, without rejecting the file", () => {
  const jog = parseJog(rawJog(data, { sights: [sight(";KM 0"), sight("Plain Name")] }), 1)!;
  expect(jog).not.toBeNull();
  expect(jog.sights.map((s) => s.name)).toEqual(["KM 0", "Plain Name"]);
});
