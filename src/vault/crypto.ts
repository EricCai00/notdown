import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/** Identical UTF-8 SHA-256 revisions on Node, WebView and browser preview. */
export const hashBytes = (value: string | Uint8Array): string =>
  bytesToHex(sha256(typeof value === "string" ? new TextEncoder().encode(value) : value));
export const randomUUID = (): string => globalThis.crypto.randomUUID();
