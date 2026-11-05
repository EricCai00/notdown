/** A tab's vault is bound by its URL, never by shared mutable server state. */
export const vaultRouteIdPattern = "(?:[a-f0-9]{16}|[a-f0-9]{64})";
const prefixPattern = new RegExp(`^(/v/${vaultRouteIdPattern})(?:/|$)`);
export function vaultPrefix(pathname = typeof location === "undefined" ? "/" : location.pathname) {
  return prefixPattern.exec(pathname)?.[1] ?? "";
}
export const apiUrl = (path: string) => `${vaultPrefix()}/api${path}`;
export function vaultAssetUrl(value: string) {
  const prefix = vaultPrefix();
  return prefix && /^(?:\/?assets\/|\.\.?\/assets\/)/.test(value)
    ? `${prefix}/${value.replace(/^(?:\/|\.\.?\/)/, "")}` : value;
}
export const vaultPageUrl = (page: string) => `${vaultPrefix()}/${page}`;
