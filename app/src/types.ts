// Router-owned shapes come from the router module (docs/data-contract.md, "Router API").
// The UI-only shapes below describe weather.json, advisory.json, and UI state.
export type {
  Manifest,
  Mode,
  Place,
  Query,
  Result,
  Route,
  SegKind,
  Source,
  Step,
  StepFlag,
} from "./lib/router/index";

export interface WeatherOk {
  status: "ok";
  source: string;
  source_url?: string;
  fetched_at: string;
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    apparent_temperature: (number | null)[];
    precipitation_probability: (number | null)[];
    uv_index: (number | null)[];
    weather_code: (number | null)[];
  };
}

export interface Unavailable {
  status: "unavailable";
  fetched_at: string;
  reason?: string;
}

export type Weather = WeatherOk | Unavailable;

export interface AdvisoryOk {
  status: "ok";
  source_url: string;
  fetched_at: string;
  issued_at: string | null;
  text: string | null;
  cities: string[];
  heavy_rainfall?: string | null;
}

export type Advisory = AdvisoryOk | Unavailable;

export interface Endpoint {
  label: string;
  sub: string;
  // The routing area; node is a node of that area's graph.
  area: string;
  node: number;
  lon: number;
  lat: number;
  // Metres from the picked point to the routing node. Null for places, which the pipeline snapped.
  snap_m: number | null;
}

// One routing area from areas.json. graph_rects are the boxes its graph covers; bbox is the core area.
export interface AreaInfo {
  id: string;
  name: string;
  // Absent in data published before the regional areas: those areas are all in Metro Manila.
  // prsd: the PAGASA division page for its advisories. provinces: names an advisory can use for the whole area.
  region?: { id: string; name: string; prsd?: string; provinces?: string[] };
  cities: string[];
  bbox: [number, number, number, number];
  graph_bbox: [number, number, number, number];
  graph_rects: [number, number, number, number][];
  neighbourhoods: { id: string; name: string; bbox: [number, number, number, number] }[];
  center: [number, number];
}

export interface Markers {
  graph: boolean;
  shade: boolean;
  weather: boolean;
}

// manifest.shadow_overlay, written by the shade pipeline with READY.shadows.
// A date lists a bucket only when the sun is above 3 degrees; a missing bucket means no overlay.
export interface ShadowOverlay {
  bbox: [number, number, number, number];
  coords: [[number, number], [number, number], [number, number], [number, number]];
  px_m: number;
  path: string;
  buckets: Record<string, string[]>;
}
