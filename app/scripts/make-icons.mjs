// Rasterize the existing umbrella logo with an inset for circular and rounded home-screen masks.
// PNG RGB scanlines use filter 0 so the safe-zone test can inspect the actual shipped pixels.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const tag = Buffer.from(type);
  const header = Buffer.alloc(4), crc = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, bytes])));
  return Buffer.concat([header, tag, bytes, crc]);
}
function color(x, y) {
  x = (x - 8) / .75;
  y = (y - 8) / .75;
  if (Math.hypot(x - 46, y - 14) <= 5) return [250, 204, 21];
  const canopy = y <= 34 && Math.hypot(x - 32, y - 34) <= 20;
  const stem = Math.abs(x - 32) <= 2 && y >= 34 && y <= 48;
  const hook = y >= 48 && Math.abs(Math.hypot(x - 28, y - 48) - 4) <= 2;
  const tip = Math.hypot(x - 24, y - 48) <= 2;
  return canopy || stem || hook || tip ? [255, 255, 255] : [37, 99, 235];
}
for (const [file, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  const pixels = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const rgb = [0, 0, 0];
    // Four samples per pixel smooth the boundary without a graphics dependency.
    for (const dx of [.25, .75]) for (const dy of [.25, .75]) {
      const sample = color((x + dx) * 64 / size, (y + dy) * 64 / size);
      sample.forEach((v, i) => { rgb[i] += v / 4; });
    }
    const p = y * (size * 3 + 1) + 1 + x * 3;
    rgb.forEach((v, i) => { pixels[p + i] = Math.round(v); });
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 2;
  writeFileSync(new URL(`../public/icons/${file}`, import.meta.url), Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0)),
  ]));
}
