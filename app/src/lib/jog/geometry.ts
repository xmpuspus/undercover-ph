import type { Data } from "../router/types";

export function edgeLine(data: Data, e: number, forward = true): [number, number][] {
  const out: [number, number][] = [];
  for (let i = data.geomOff[e]; i < data.geomOff[e + 1]; i++) out.push([data.geomXY[i * 2], data.geomXY[i * 2 + 1]]);
  if (!forward) out.reverse();
  return out;
}
export const metres = (data: Data, a: number[], b: number[]) => Math.hypot((a[0] - b[0]) * data.mPerLon, (a[1] - b[1]) * data.mPerLat);
export function lineLength(data: Data, line: number[][]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += metres(data, line[i - 1], line[i]);
  return total;
}
export function pointAlong(data: Data, line: [number, number][], distance: number): [number, number] {
  for (let i = 1; i < line.length; i++) {
    const len = metres(data, line[i - 1], line[i]);
    if (distance <= len) {
      const t = len ? distance / len : 0;
      return [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])];
    }
    distance -= len;
  }
  return line[line.length - 1];
}
