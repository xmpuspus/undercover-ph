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

// The routing areas, in the order the landing card and About list them. Each area routes inside itself only.
// Links from before the other areas carry no area and mean metro-core, which holds Makati CBD.
export const DEFAULT_AREA = "metro-core";
export const AREA_LABELS: { id: string; label: string }[] = [
  { id: "metro-core", label: "Makati CBD, Rockwell, BGC, Shaw, Ortigas, Pasig and Greenhills" },
  { id: "pasay-moa", label: "Bay Area and MOA" },
  { id: "cubao-eastwood", label: "Cubao and Eastwood" },
  { id: "qc-north", label: "North Avenue, QC Circle and UP Diliman" },
  { id: "manila", label: "Manila" },
  { id: "alabang", label: "Alabang" },
  { id: "north-coast", label: "Caloocan, Malabon, Navotas and Valenzuela" },
  { id: "marikina", label: "Marikina" },
  { id: "paranaque-airport", label: "Aseana, PITX and NAIA" },
  { id: "las-pinas", label: "Las Piñas and Alabang-Zapote Road" },
  { id: "paranaque-bf-aguirre", label: "BF Homes and Aguirre Avenue" },
  { id: "taguig-pateros", label: "McKinley Hill, Taguig Centre, Arca South and Pateros" },
  { id: "qc-commonwealth-fairview", label: "Commonwealth and Fairview" },
  { id: "qc-banawe", label: "Banawe and Quezon Avenue" },
];

export { SUGGESTED } from "./lib/suggested";

// The router treats the sun at or below this altitude as night. The basemap and hour chips follow it.
export const NIGHT_ALT_DEG = 3;
