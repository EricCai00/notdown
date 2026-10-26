import { vaultAssetUrl } from "./vault-url";
let resolver: (path: string) => string = vaultAssetUrl;
/** Display-only resolution: Markdown and clipboard serialization retain the original path. */
export function setAssetDisplayResolver(value: (path: string) => string) { resolver = value; }
export const assetDisplayUrl = (path: string): string => resolver(path);
