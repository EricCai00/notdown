import type { Page } from "../../shared/types";
import type { DatabaseDataSource, DatabaseView } from "./database-model";
import { fieldValue } from "./database-query";
import { readPlace, validCoordinates, type DatabasePlace } from "./database-place";

export const mapHeights = { small: 300, medium: 480, large: 640, "extra-large": 800 } as const;
export const mapColors: Record<string, string> = { gray: "#787774", brown: "#9f6b53", orange: "#d9730d", yellow: "#b58b00", green: "#278567", blue: "#2879d0", purple: "#9065b0", pink: "#c14c8a", red: "#cf5148" };
export const mapPinLimit = 100;
export function mapRecords(source: DatabaseDataSource, rows: Page[], view: DatabaseView) {
  const layout = view.layout ?? {}, places = source.properties.filter(field => field.type === "place");
  // Old coordinate views never silently switch to a newly-added Place field.
  const placeField = places.find(field => field.id === layout.mapPlaceId)
    ?? (layout.mapPlaceId === undefined && !layout.mapLatitudeId && !layout.mapLongitudeId ? places[0] : undefined);
  const latitude = source.properties.find(field => field.id === layout.mapLatitudeId && field.type === "number"), longitude = source.properties.find(field => field.id === layout.mapLongitudeId && field.type === "number");
  const colorField = source.properties.find(field => field.id === layout.mapColorBy && ["select", "status", "multi_select"].includes(field.type));
  let count = 0;
  const records = rows.map(page => {
    let place: DatabasePlace | undefined;
    if (placeField) place = readPlace(fieldValue(page, placeField));
    else if (!layout.mapPlaceId && latitude && longitude) {
      const a = fieldValue(page, latitude), b = fieldValue(page, longitude);
      if (validCoordinates(a, b)) place = { latitude: a as number, longitude: b as number };
    }
    const value = colorField ? fieldValue(page, colorField) : undefined, id = Array.isArray(value) ? value[0] : value;
    const option = colorField?.options?.find(option => option.id === id), color = option?.color && Object.hasOwn(mapColors, option.color) ? option.color : colorField ? "gray" : "blue";
    return { page, place, color, category: option?.name ?? "", categoryId: option?.id ?? "", pinned: !!place && ++count <= mapPinLimit };
  });
  return { placeField, colorField, configured: !!placeField || !layout.mapPlaceId && !!latitude && !!longitude, records, located: count, pinned: Math.min(count, mapPinLimit) };
}
