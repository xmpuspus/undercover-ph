import { Protocol } from "pmtiles";
import { mapLibre } from "./maplibre";

let added = false;

// Lets map sources read tiles straight from one .pmtiles file with range requests: "pmtiles://" + the file URL.
export function addPmtilesProtocol(): void {
  if (added) return;
  added = true;
  mapLibre().addProtocol("pmtiles", new Protocol().tile);
}
