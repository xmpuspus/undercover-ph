// Product name, used in the landing card, the About sheet, and the page title.
export const APP_NAME = "undercover.ph";

export const DATA_BASE = `${import.meta.env.BASE_URL}data/`;
export const TZ = "Asia/Manila";

// OpenFreeMap serves positron, liberty, bright, dark and fiord with no key.
// Liberty keeps POI labels, which help people match landmark steps.
export const STYLE_DAY = "https://tiles.openfreemap.org/styles/liberty";
export const STYLE_NIGHT = "https://tiles.openfreemap.org/styles/dark";

export const CBD_CENTER: [number, number] = [121.0225, 14.5545];

export const COLORS = {
  blue: "#2563EB",
  ink: "#0F172A",
  sun: "#FACC15",
  alt: "#64748B",
  roof: "#1D4ED8",
  building: "#60A5FA",
  tree: "#16A34A",
  nightOpen: "#93C5FD",
  unchecked: "#EA580C",
};

// Shown before the user types, if places.json has them.
export const SUGGESTED = ["Ayala MRT Station", "Glorietta", "Greenbelt", "Ayala Triangle Gardens"];

// The router treats the sun at or below this altitude as night. The basemap and hour chips follow it.
export const NIGHT_ALT_DEG = 3;
