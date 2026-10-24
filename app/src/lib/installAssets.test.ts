/// <reference types="node" />
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { expect, it } from "vitest";

const publicRoot = new URL("../../public/", import.meta.url);
it("provides PNG install icons and an Apple touch icon with artwork inside the maskable safe circle", () => {
  const manifest = JSON.parse(readFileSync(new URL("manifest.webmanifest", publicRoot), "utf8"));
  for (const size of [192, 512]) {
    expect(manifest.icons.some((i: { sizes: string; type: string }) => i.sizes === `${size}x${size}` && i.type === "image/png")).toBe(true);
  }
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  expect(html).toMatch(/rel="apple-touch-icon"[^>]*href="\/icons\/apple-touch-icon\.png"/);
  for (const [file, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]] as const) {
    const png = readFileSync(new URL(`icons/${file}`, publicRoot));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
    const chunks: Buffer[] = [];
    for (let p = 8; p < png.length;) {
      const n = png.readUInt32BE(p);
      if (png.toString("ascii", p + 4, p + 8) === "IDAT") chunks.push(png.subarray(p + 8, p + 8 + n));
      p += n + 12;
    }
    const pixels = inflateSync(Buffer.concat(chunks));
    let artwork = 0;
    for (let y = 0; y < size; y++) {
      // Our deterministic icon encoder uses RGB scanlines with no PNG filtering.
      expect(pixels[y * (size * 3 + 1)]).toBe(0);
      for (let x = 0; x < size; x++) {
        const p = y * (size * 3 + 1) + 1 + x * 3;
        if (pixels[p] !== 37 || pixels[p + 1] !== 99 || pixels[p + 2] !== 235) {
          artwork++;
          expect(Math.hypot(x + .5 - size / 2, y + .5 - size / 2)).toBeLessThan(size * .4);
        }
      }
    }
    expect(artwork).toBeGreaterThan(size * size * .1);
  }
});
