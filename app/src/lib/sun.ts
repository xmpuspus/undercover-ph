const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

// 16-point compass word for an azimuth in degrees clockwise from north.
export function compass16(az: number): string {
  return POINTS[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
}

export interface SunView {
  altitude: number;
  azimuth: number;
  compass: string;
  shadySide: string | null;
}

// The chosen date's sun for the dial: sunrise and sunset in minutes, [minute, altitude] per half hour, and the chosen minute.
export interface SunDay {
  sunrise: number;
  sunset: number;
  path: [number, number][];
  minute: number;
}

export function sunDay(riseSet: [string, string] | undefined, buckets: number[], sun: [number, number][] | undefined, minute: number): SunDay | null {
  if (!riseSet) return null;
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  return { sunrise: toMin(riseSet[0]), sunset: toMin(riseSet[1]), path: buckets.map((b, i) => [b, sun?.[i]?.[0] ?? -90]), minute };
}

const RAD = Math.PI / 180;

// Sun altitude and azimuth (degrees) at a Manila wall-clock time, from the NOAA solar equations.
// The manifest's sun table covers only its dates from 06:00 to 18:30; this fills in the live clock outside it.
export function sunPosition(date: string, minute: number, lon: number, lat: number): [number, number] {
  const utcMs = Date.parse(`${date}T00:00:00Z`) + (minute - 8 * 60) * 60_000;
  const t = (utcMs / 86_400_000 + 2440587.5 - 2451545) / 36525;
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t) + Math.sin(3 * m * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps * RAD) / 2) ** 2;
  const eqTime =
    (4 / RAD) *
    (y * Math.sin(2 * l0 * RAD) -
      2 * e * Math.sin(m * RAD) +
      4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) -
      0.5 * y * y * Math.sin(4 * l0 * RAD) -
      1.25 * e * e * Math.sin(2 * m * RAD));
  const utcMin = ((utcMs / 60_000) % 1440 + 1440) % 1440;
  const ha = ((utcMin + eqTime + 4 * lon) / 4 - 180) * RAD;
  const phi = lat * RAD;
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const geo = 90 - Math.acos(Math.min(1, Math.max(-1, cosZ))) / RAD;
  // NOAA refraction correction, which the pipeline's table includes; it lifts the sun about half a degree at the horizon.
  const te = Math.tan(geo * RAD);
  const refr =
    geo > 85 ? 0 : geo > 5 ? 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5 : geo > -0.575 ? 1735 + geo * (-518.2 + geo * (103.4 + geo * (-12.79 + geo * 0.711))) : -20.774 / te;
  const alt = geo + refr / 3600;
  const az = (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / RAD + 180 + 360) % 360;
  return [alt, az];
}
