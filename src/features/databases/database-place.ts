/** WGS84 coordinates; unknown keys survive local edits and vault round trips. */
export interface DatabasePlace {
  name?: string;
  address?: string;
  latitude: number;
  longitude: number;
  [key: string]: unknown;
}
export function validCoordinates(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === "number" && Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && typeof longitude === "number" && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}
export function readPlace(value: unknown): DatabasePlace | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const place = value as DatabasePlace;
  if (validCoordinates(place.latitude, place.longitude)) return place;
}
export function placeText(value: unknown): string {
  if (!value || typeof value !== "object") return typeof value === "string" ? value : "";
  const place = value as DatabasePlace;
  return [place.name, place.address].filter(item => typeof item === "string" && item).join(", ")
    || (readPlace(value) ? `${place.latitude}, ${place.longitude}` : "");
}
export function googleMapsUrl(place: DatabasePlace): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.latitude},${place.longitude}`)}`;
}
/** Treat third-party search payloads as untrusted, including their geometry. */
export function photonPlaces(payload: unknown): DatabasePlace[] {
  const features = (payload as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  return features.slice(0, 8).flatMap((feature: any) => {
    const coordinates = feature?.geometry?.coordinates, props = feature?.properties;
    if (feature?.geometry?.type !== "Point" || !Array.isArray(coordinates) || !validCoordinates(coordinates[1], coordinates[0]) || !props || typeof props !== "object") return [];
    const text = (key: string) => typeof props[key] === "string" ? props[key].slice(0, 200) : "";
    const address = [...new Set([`${text("housenumber")} ${text("street")}`.trim(), text("city") || text("town") || text("village"), text("state"), text("country")].filter(Boolean))].join(", ");
    return [{ name: text("name") || address, address, latitude: coordinates[1], longitude: coordinates[0] }];
  });
}
