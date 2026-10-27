import { stableUuid } from "../shared/stable-uuid";
export const isPageUuid = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
/** UUIDv5 in the DNS namespace, identical on every platform. */
export function stablePageUuid(identity: string): string {
  return stableUuid("notdown/page/" + identity);
}
