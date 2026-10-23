import { sha1 } from "@noble/hashes/legacy.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
export const isPageUuid = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
/** UUIDv5 in the DNS namespace, identical on every platform. */
export function stablePageUuid(identity: string): string {
  const bytes = sha1.create().update(hexToBytes("6ba7b8109dad11d180b400c04fd430c8"))
    .update(new TextEncoder().encode("notdown/page/"+identity)).digest().subarray(0,16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join("-");
}
