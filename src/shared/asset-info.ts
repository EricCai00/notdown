import { api } from "./types";
import { localAssetPath } from "../features/assets/asset-model";

export type AssetInfo = { path: string; name: string | null; size: number | null };
/** Read only one attachment's metadata; never scan all pages or download its bytes. */
export async function assetInfo(source: string, signal?: AbortSignal): Promise<AssetInfo | undefined> {
  const path = localAssetPath(source);
  if (!path) return;
  return api<AssetInfo>(`/assets/info?path=${encodeURIComponent(path)}`, { signal });
}
