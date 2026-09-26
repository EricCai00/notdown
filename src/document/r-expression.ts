import type { Node as PMNode } from "prosemirror-model";

/** Preserve the original delimiters and whitespace until the expression changes. */
export function rExpressionSource(node: PMNode): string {
  const expression = node.textContent;
  if (expression === node.attrs.expression && node.attrs.raw) return node.attrs.raw;
  if (node.attrs.language && !(node.attrs.language === "r" && /^`r[ \t]/.test(String(node.attrs.raw)))) {
    const separator = /^`\{\w+\}([ \t]+)/.exec(String(node.attrs.raw || ""))?.[1] || " ";
    return "`{" + node.attrs.language + "}" + separator + expression + "`";
  }
  const separator = /^`r([ \t]+)/.exec(String(node.attrs.raw || ""))?.[1] || " ";
  return "`r" + separator + expression + "`";
}
