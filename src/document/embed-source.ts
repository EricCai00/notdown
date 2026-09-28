/** Only vault HTML files may use a local URL in an embed. No traversal or URL schemes. */
export function isHtmlAsset(value: string): boolean {
  return /^assets\/[\w.-]+\.html?$/i.test(value) && !value.slice(7).startsWith(".");
}

export function embedSource(value: string): string {
  return isHtmlAsset(value) ? "/" + value : /^https?:\/\//i.test(value) ? value : "";
}
