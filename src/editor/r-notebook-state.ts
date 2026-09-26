import type { Node as PMNode } from "prosemirror-model";

export type RResult = { phase: "running" | "done" | "error" | "stopped"; html?: string; text?: string; message?: string; stale?: boolean; element?: HTMLElement };
export type RTarget = {
  dom: HTMLElement; kind: "chunk" | "inline";
  node: () => PMNode; position: () => number | undefined;
  show: (result: RResult | undefined) => void;
  inlineView?: () => "code" | "result";
  setInlineView?: (mode: "code" | "result") => void;
};
export type RAction = "current" | "above" | "inline" | "stop" | "clear" | "restart";
const targets = new WeakMap<HTMLElement, RTarget>();
export function registerRTarget(target: RTarget) { targets.set(target.dom, target); }
export function rTargets(root: HTMLElement): RTarget[] {
  return [...root.querySelectorAll<HTMLElement>(".pm-r-chunk, .pm-r-inline")].map(dom => targets.get(dom)).filter((target): target is RTarget => Boolean(target));
}
export function requestRAction(target: RTarget, action: RAction) {
  target.dom.dispatchEvent(new CustomEvent("notdown-r-action", { bubbles: true, detail: { target, action } }));
}
