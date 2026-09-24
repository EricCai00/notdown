import type { DOMOutputSpec, Node as PMNode } from "prosemirror-model";
import paths from "../assets/octicons/alerts.json";
import { ChevronDown, Pencil, ClipboardList, Info, CircleCheck, Flame, Check, CircleHelp, TriangleAlert, X, Zap, Bug, List, Quote, type IconNode } from "lucide";

export const alertTypes = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] as const;
const appearances: Record<string, { label: string; color: string; icon: keyof typeof paths }> = {
  NOTE: { label: "Note", color: "#0969da", icon: "info" },
  TIP: { label: "Tip", color: "#1a7f37", icon: "light-bulb" },
  IMPORTANT: { label: "Important", color: "#8250df", icon: "report" },
  WARNING: { label: "Warning", color: "#9a6700", icon: "alert" },
  CAUTION: { label: "Caution", color: "#cf222e", icon: "stop" },
};

// Default light-theme colors and icon families from Obsidian's official Publish
// stylesheet, checked 2026-09-24. Aliases share their canonical type's appearance.
export const obsidianAlertGroups: { types: string[]; color: string; icon: IconNode }[] = [
  { types: ["NOTE"], color: "#086ddd", icon: Pencil },
  { types: ["ABSTRACT", "SUMMARY", "TLDR"], color: "#00bfbc", icon: ClipboardList },
  { types: ["INFO"], color: "#086ddd", icon: Info },
  { types: ["TODO"], color: "#086ddd", icon: CircleCheck },
  { types: ["TIP", "HINT", "IMPORTANT"], color: "#00bfbc", icon: Flame },
  { types: ["SUCCESS", "CHECK", "DONE"], color: "#08b94e", icon: Check },
  { types: ["QUESTION", "HELP", "FAQ"], color: "#ec7500", icon: CircleHelp },
  { types: ["WARNING", "CAUTION", "ATTENTION"], color: "#ec7500", icon: TriangleAlert },
  { types: ["FAILURE", "FAIL", "MISSING"], color: "#e93147", icon: X },
  { types: ["DANGER", "ERROR"], color: "#e93147", icon: Zap },
  { types: ["BUG"], color: "#e93147", icon: Bug },
  { types: ["EXAMPLE"], color: "#7852ee", icon: List },
  { types: ["QUOTE", "CITE"], color: "#9e9e9e", icon: Quote },
];
export const obsidianAlertTypes = obsidianAlertGroups.flatMap(group => group.types);

export function alertColor(kind: string, style = "github"): string {
  const name = kind.toUpperCase();
  if (style !== "obsidian" && Object.hasOwn(appearances, name)) return appearances[name].color;
  return obsidianAlertGroups.find(group => group.types.includes(name))?.color
    || (style === "obsidian" ? "#086ddd" : appearances.NOTE.color);
}

function lucideIcon(icon: IconNode, className: string): DOMOutputSpec {
  return ["http://www.w3.org/2000/svg svg", {
    class: className, xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24",
    width: "16", height: "16", fill: "none", stroke: "currentColor", "stroke-width": "2",
    "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false",
  }, ...icon.map(([tag, attrs]) => [tag, attrs] as DOMOutputSpec)];
}

export function alertIcon(kind: string, style = "github"): DOMOutputSpec {
  const name = kind.toUpperCase();
  const group = obsidianAlertGroups.find(group => group.types.includes(name));
  if (style === "obsidian" || (!Object.hasOwn(appearances, name) && group))
    return lucideIcon(group?.icon || Pencil, "pm-alert-icon");
  const appearance = Object.hasOwn(appearances, name) ? appearances[name] : appearances.NOTE;
  return ["http://www.w3.org/2000/svg svg", {
    class: "pm-alert-icon", xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 16 16",
    width: "16", height: "16", fill: "currentColor", "aria-hidden": "true", focusable: "false",
  }, ["path", { d: paths[appearance.icon] }]];
}

export function alertLabel(kind: string): string {
  return obsidianAlertTypes.includes(kind.toUpperCase())
    ? kind[0].toUpperCase() + kind.slice(1).toLowerCase() : kind || "Note";
}

export function alertDOM(node: PMNode): DOMOutputSpec {
  const kind = String(node.attrs.kind || "NOTE");
  const style = node.attrs.alertStyle || "github";
  const label = alertLabel(kind);
  return [
    node.attrs.fold ? "details" : "aside",
    { class: "pm-callout pm-alert", "data-icon": node.attrs.icon,
      "data-callout-kind": kind, "data-callout-title": node.attrs.title, "data-callout-fold": node.attrs.fold,
      "data-alert-style": style,
      style: `--alert-color:${alertColor(kind, style)}`, open: node.attrs.fold === "+" ? "" : null },
    [node.attrs.fold ? "summary" : "strong", { class: "pm-alert-title", contenteditable: "false" },
      alertIcon(kind, style),
      ["span", { class: "pm-alert-title-text" }, node.attrs.title || label],
      ...(node.attrs.fold ? [lucideIcon(ChevronDown, "pm-alert-fold")] : []),
    ],
    ["div", { class: "pm-alert-content" }, 0],
  ];
}

// Standalone HTML exports have no application stylesheet.
export const alertExportStyles = `
.pm-callout.pm-alert{border-left:4px solid var(--alert-color);border-radius:0;background:transparent;padding:4px 16px;margin:16px 0;color:inherit}
.pm-callout.pm-alert:before{content:none}
.pm-alert-title{display:flex;align-items:center;gap:8px;color:var(--alert-color);font-weight:600;line-height:1.5;margin:0 0 8px}
.pm-alert-icon,.pm-alert-fold{flex:none;width:16px;height:16px}
.pm-alert-title-text{min-width:0;overflow-wrap:anywhere}
.pm-alert-content>:first-child{margin-top:0}.pm-alert-content>:last-child{margin-bottom:0}
details.pm-alert>summary{cursor:pointer;list-style:none}
details.pm-alert>summary::-webkit-details-marker{display:none}
details.pm-alert:not([open]) .pm-alert-fold{transform:rotate(-90deg)}
details.pm-alert:not([open])>summary{margin-bottom:0}`;
