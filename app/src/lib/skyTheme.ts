// Sky, light and accent colours from the sun's altitude and side of the sky.
// Phases: night below -6 degrees, blue hour -6 to -2, dawn or dusk glow -2 to 6, golden hour 6 to 15, day above 15.
// Colours blend smoothly between key altitudes, so the scene changes a little with every half hour.

export type Phase = "night" | "blue" | "glow" | "golden" | "day";

export interface SkyTheme {
  phase: Phase;
  morning: boolean;
  // The dark basemap is for night only.
  dark: boolean;
  sky: string;
  horizon: string;
  // Fog needs 3D terrain, which this map does not use. It follows the horizon so the style stays consistent.
  fog: string;
  skyHorizonBlend: number;
  light: { anchor: "map" | "viewport"; color: string; intensity: number; position: [number, number, number] };
  building: string;
  // UI accent for the sun dot and live markers. Never used for text.
  accent: string;
  // Card background tint. Every tint is light enough for ink text at WCAG AA.
  tint: string;
  // Haze over the far part of the map (normal blend) and a light colour cast over all of it (multiply).
  wash: string;
  washAlpha: number;
  tone: string;
  toneAlpha: number;
}

interface Key {
  alt: number;
  sky: string;
  horizon: string;
  blend: number;
  light: string;
  intensity: number;
  building: string;
  accent: string;
  tint: string;
  wash: string;
  washAlpha: number;
  tone: string;
  toneAlpha: number;
}

const NIGHT: Omit<Key, "alt"> = {
  sky: "#0B1630",
  horizon: "#23365E",
  blend: 0.6,
  light: "#9FB3E6",
  intensity: 0.2,
  building: "#33435E",
  accent: "#93C5FD",
  tint: "#EFF6FF",
  wash: "#0B1630",
  washAlpha: 0.35,
  tone: "#FFFFFF",
  toneAlpha: 0,
};

const BLUE: Omit<Key, "alt"> = {
  sky: "#1F3C7A",
  horizon: "#7C93C9",
  blend: 0.7,
  light: "#A9BCEB",
  intensity: 0.2,
  building: "#C5CEE2",
  accent: "#60A5FA",
  tint: "#EFF6FF",
  wash: "#2C4A85",
  washAlpha: 0.4,
  tone: "#6F86BF",
  toneAlpha: 0.3,
};

const DAY: Omit<Key, "alt"> = {
  sky: "#3E9BEA",
  horizon: "#DDF0FF",
  blend: 0.6,
  light: "#FFFAF2",
  intensity: 0.38,
  building: "#F8FAFC",
  accent: "#FACC15",
  tint: "#FFFFFF",
  wash: "#E6F3FF",
  washAlpha: 0.3,
  tone: "#FFFFFF",
  toneAlpha: 0,
};

// Sunrise glows pink-orange.
const DAWN: Omit<Key, "alt"> = {
  sky: "#6F95D1",
  horizon: "#FFB199",
  blend: 0.55,
  light: "#FFDCCB",
  intensity: 0.22,
  building: "#FFEDE6",
  accent: "#FB923C",
  tint: "#FFF7ED",
  wash: "#FFB59E",
  washAlpha: 0.34,
  tone: "#FFC2A8",
  toneAlpha: 0.1,
};

// Sunset glows violet above and orange at the horizon.
const DUSK: Omit<Key, "alt"> = {
  sky: "#5D5AA6",
  horizon: "#FF9A5A",
  blend: 0.5,
  light: "#FFD2B8",
  intensity: 0.22,
  building: "#FDE6DA",
  accent: "#F97316",
  tint: "#FFF7ED",
  wash: "#E8957A",
  washAlpha: 0.34,
  tone: "#F9B48C",
  toneAlpha: 0.12,
};

const GOLDEN_AM: Omit<Key, "alt"> = {
  sky: "#8CC4F0",
  horizon: "#FFE7B0",
  blend: 0.7,
  light: "#FFE6BF",
  intensity: 0.24,
  building: "#FFF6E8",
  accent: "#F59E0B",
  tint: "#FFFBEB",
  wash: "#FFE2A6",
  washAlpha: 0.28,
  tone: "#FFE0A8",
  toneAlpha: 0.1,
};

const GOLDEN_PM: Omit<Key, "alt"> = {
  sky: "#86BDEB",
  horizon: "#FFD98F",
  blend: 0.7,
  light: "#FFDDA8",
  intensity: 0.24,
  building: "#FFF1DC",
  accent: "#F59E0B",
  tint: "#FFFBEB",
  wash: "#FFD58A",
  washAlpha: 0.3,
  tone: "#FFD596",
  toneAlpha: 0.12,
};

// Golden hour holds from 7 to 13 degrees, so a 16:30 sun still reads warm.
function keys(glow: Omit<Key, "alt">, golden: Omit<Key, "alt">): Key[] {
  return [
    { alt: -6, ...NIGHT },
    { alt: -3, ...BLUE },
    { alt: 1, ...glow },
    { alt: 7, ...golden },
    { alt: 13, ...golden },
    { alt: 19, ...DAY },
  ];
}
const MORNING = keys(DAWN, GOLDEN_AM);
const EVENING = keys(DUSK, GOLDEN_PM);

export function phaseOf(alt: number): Phase {
  if (alt < -6) return "night";
  if (alt < -2) return "blue";
  if (alt < 6) return "glow";
  if (alt < 15) return "golden";
  return "day";
}

export function phaseLabel(phase: Phase, morning: boolean): string {
  if (phase === "glow") return morning ? "Sunrise" : "Sunset";
  return { night: "Night", blue: "Blue hour", golden: "Golden hour", day: "Daylight" }[phase];
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function mixColor(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return hex([lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]);
}

export function rgba(color: string, alpha: number): string {
  const [r, g, b] = rgb(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000})`;
}

const COLOR_KEYS = ["sky", "horizon", "light", "building", "accent", "tint", "wash", "tone"] as const;
const NUM_KEYS = ["blend", "intensity", "washAlpha", "toneAlpha"] as const;

function mixKey(a: Key, b: Key, t: number): Key {
  const out = { ...a, alt: lerp(a.alt, b.alt, t) };
  for (const k of COLOR_KEYS) out[k] = mixColor(a[k], b[k], t);
  for (const k of NUM_KEYS) out[k] = lerp(a[k], b[k], t);
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

// The theme for a sun at this altitude and azimuth (degrees). An azimuth below 180 is the morning sky.
export function skyTheme(alt: number, az: number): SkyTheme {
  const morning = ((az % 360) + 360) % 360 < 180;
  const list = morning ? MORNING : EVENING;
  let k = list[0];
  if (alt >= list[list.length - 1].alt) k = list[list.length - 1];
  else if (alt > list[0].alt) {
    const i = list.findIndex((x) => x.alt > alt);
    const a = list[i - 1];
    const b = list[i];
    k = mixKey(a, b, smooth((alt - a.alt) / (b.alt - a.alt)));
  }
  const dark = alt < -6;
  // MapLibre light: [radial, azimuth, polar], polar measured from straight up. Below the horizon the light grazes.
  const light: SkyTheme["light"] = dark
    ? { anchor: "viewport", color: k.light, intensity: k.intensity, position: [1.15, 210, 30] }
    : { anchor: "map", color: k.light, intensity: k.intensity, position: [1.5, ((az % 360) + 360) % 360, Math.min(89, Math.max(0, 90 - alt))] };
  return {
    phase: phaseOf(alt),
    morning,
    dark,
    sky: k.sky,
    horizon: k.horizon,
    fog: k.horizon,
    skyHorizonBlend: k.blend,
    light,
    building: k.building,
    accent: k.accent,
    tint: k.tint,
    wash: k.wash,
    washAlpha: k.washAlpha,
    tone: k.tone,
    toneAlpha: k.toneAlpha,
  };
}

// Blend two themes for an eased change of hour. Discrete fields (phase, dark, anchor) take the target's value.
export function mixTheme(a: SkyTheme, b: SkyTheme, t: number): SkyTheme {
  if (t >= 1) return b;
  const sameAnchor = a.light.anchor === b.light.anchor;
  const [ar, aa, ap] = a.light.position;
  const [br, ba, bp] = b.light.position;
  const dAz = ((((ba - aa) % 360) + 540) % 360) - 180;
  return {
    ...b,
    sky: mixColor(a.sky, b.sky, t),
    horizon: mixColor(a.horizon, b.horizon, t),
    fog: mixColor(a.fog, b.fog, t),
    skyHorizonBlend: lerp(a.skyHorizonBlend, b.skyHorizonBlend, t),
    light: {
      anchor: b.light.anchor,
      color: mixColor(a.light.color, b.light.color, t),
      intensity: lerp(a.light.intensity, b.light.intensity, t),
      position: sameAnchor ? [lerp(ar, br, t), (((aa + dAz * t) % 360) + 360) % 360, lerp(ap, bp, t)] : b.light.position,
    },
    building: mixColor(a.building, b.building, t),
    accent: mixColor(a.accent, b.accent, t),
    tint: mixColor(a.tint, b.tint, t),
    wash: mixColor(a.wash, b.wash, t),
    washAlpha: lerp(a.washAlpha, b.washAlpha, t),
    tone: mixColor(a.tone, b.tone, t),
    toneAlpha: lerp(a.toneAlpha, b.toneAlpha, t),
  };
}
