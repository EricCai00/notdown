import { sha1 } from "@noble/hashes/legacy.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

/** UUIDv5 in the DNS namespace. Callers supply their own identity prefix. */
export function stableUuid(identity: string): string {
  const bytes = sha1.create().update(hexToBytes("6ba7b8109dad11d180b400c04fd430c8"))
    .update(new TextEncoder().encode(identity)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}
