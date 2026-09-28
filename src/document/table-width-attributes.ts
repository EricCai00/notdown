/** Quarto's explicit relative-width array in Pandoc table attributes. */
export function readTableColumnWidths(value: unknown, count: number): number[] | null {
  if (typeof value !== "string") return null;
  try {
    const widths: unknown = JSON.parse(value);
    return Array.isArray(widths) && widths.length === count && count > 0 &&
      widths.every(v => typeof v === "number" && Number.isFinite(v) && v > 0) &&
      Number.isFinite(widths.reduce((a, b) => a + b, 0)) ? widths : null;
  } catch { return null; }
}

export function normalizedTableWidths(widths: readonly number[]): string {
  const total = widths.reduce((a, b) => a + b, 0);
  return JSON.stringify(widths.map(width => Math.round(width / total * 1000000) / 10000));
}

/** Keep explicit metadata aligned when existing column commands change geometry. */
export function syncTableWidthAttributes(attrs: Record<string, any>, widths: unknown[]) {
  const old = attrs.markdownAttrs?.["tbl-colwidths"];
  if (!readTableColumnWidths(old, attrs.widths?.length ?? 0)) return { ...attrs, widths };
  const positive = widths.map(Number).filter(v => Number.isFinite(v) && v > 0);
  const fallback = positive.length ? positive.reduce((a, b) => a + b, 0) / positive.length : 1;
  const values = widths.map(value => Number(value) > 0 && Number.isFinite(Number(value)) ? Number(value) : fallback);
  return { ...attrs, widths: values.map(String), markdownAttrs: { ...attrs.markdownAttrs, "tbl-colwidths": normalizedTableWidths(values) } };
}
