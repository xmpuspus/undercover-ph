// Browser walking router for shaded and sheltered routes. docs/data-contract.md, "Router API".
export { loadData, loadShadeDate, buildData, placeKeys } from "./data";
export { findRoutes, MAX_SNAP_M, REC_MAX_DETOUR, REC_MIN_CUT } from "./route";
export { snapToNode, searchPlaces } from "./search";
export { openAt } from "./hours";
export { WALK_M_PER_MIN } from "./astar";
export type {
  Data,
  FetchLike,
  FetchResponseLike,
  HoursRow,
  HoursRule,
  Manifest,
  Mode,
  Place,
  Query,
  RawEdge,
  RawFiles,
  RawGraph,
  Result,
  Route,
  SegKind,
  Shade,
  ShadeHeader,
  Source,
  Step,
  StepFlag,
  SunInfo,
} from "./types";
