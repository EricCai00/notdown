export interface Anchor {
  source: number;
  preview: number;
}

/** Piecewise interpolation aligns blocks despite different wrapping and heights. */
export function mapScroll(
  anchors: Anchor[],
  value: number,
  from: "source" | "preview",
): number {
  const to = from === "source" ? "preview" : "source";
  if (!anchors.length) return 0;
  let previous = anchors[0];
  for (let i = 1; i < anchors.length; i++) {
    const next = anchors[i];
    if (next[from] <= previous[from]) continue;
    if (value <= next[from]) {
      const progress = Math.max(
        0,
        Math.min(1, (value - previous[from]) / (next[from] - previous[from])),
      );
      return previous[to] + (next[to] - previous[to]) * progress;
    }
    previous = next;
  }
  return previous[to];
}
