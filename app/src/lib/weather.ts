import type { Weather } from "../types";

// WMO weather interpretation codes, as Open-Meteo documents them.
const WMO: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

export interface HourWeather {
  temp: number | null;
  feels: number | null;
  rain: number | null;
  uv: number | null;
  condition: string | null;
}

// Buckets are 30 minutes; the forecast is hourly, so a 15:30 bucket reads the 15:00 row.
export function weatherAt(w: Weather | null, date: string, minute: number): HourWeather | null {
  if (!w || w.status !== "ok") return null;
  const hh = String(Math.floor(minute / 60)).padStart(2, "0");
  const i = w.hourly.time.indexOf(`${date}T${hh}:00`);
  if (i < 0) return null;
  const code = w.hourly.weather_code[i];
  return {
    temp: w.hourly.temperature_2m[i],
    feels: w.hourly.apparent_temperature[i],
    rain: w.hourly.precipitation_probability[i],
    uv: w.hourly.uv_index[i],
    condition: code == null ? null : (WMO[code] ?? null),
  };
}

export function uvWord(uv: number): string {
  if (uv < 3) return "low";
  if (uv < 6) return "moderate";
  if (uv < 8) return "high";
  if (uv < 11) return "very high";
  return "extreme";
}

// PAGASA heat index bands, in whole degrees Celsius. The app applies them to Open-Meteo's feels-like
// temperature, which is a forecast, not a PAGASA heat index reading.
export interface HeatBand {
  level: 1 | 2 | 3 | 4;
  name: string;
  range: string;
}

export function heatBand(feels: number): HeatBand | null {
  const t = Math.round(feels);
  if (t >= 52) return { level: 4, name: "Extreme danger", range: "52°C and above" };
  if (t >= 42) return { level: 3, name: "Danger", range: "42 to 51°C" };
  if (t >= 33) return { level: 2, name: "Extreme caution", range: "33 to 41°C" };
  if (t >= 27) return { level: 1, name: "Caution", range: "27 to 32°C" };
  return null;
}
