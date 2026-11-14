import { createElement, type IconNode } from "lucide";

const path = "M9 15 17 7M11 7h6v6";
const cornerArrow: IconNode = [
  // A stroke-shaped halo keeps the marker legible over the page artwork.
  ["path", { d: path, stroke: "#fff", "stroke-width": 3.5 }],
  ["path", { d: path, stroke: "currentColor", "stroke-width": 1.5 }],
];

/** Short arrowhead, dark center and white outline; no opaque background tile. */
export function referenceArrow(className: string): SVGElement {
  return createElement(cornerArrow, {
    class: className, viewBox: "4 4 16 16",
    "aria-hidden": "true", focusable: "false",
  });
}
