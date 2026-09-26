import { createEditorNode, editorKind } from "../document/node-identity";
import type MarkdownIt from "markdown-it";
import type { Node as PMNode } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { editorSchema as schema } from "../document/editor-schema";
import { enabled, type SyntaxConfig } from "./config";

/** Read balanced command definitions; a malformed definition stays literal. */
function definitionEnd(text: string): number {
  const head = /^\\(?:newcommand|renewcommand|providecommand)\*?\s*(?:\{\\[A-Za-z]+\}|\\[A-Za-z]+)\s*(?:\[[0-9]\]\s*)?(?:\[[^\]\n]*\]\s*)?\{/.exec(text);
  if (!head) return 0;
  let depth = 1;
  for (let i = head[0].length; i < text.length; i++) {
    if (text[i] === "\\") { i++; continue; }
    if (text[i] === "{") depth++;
    if (text[i] === "}" && --depth === 0) return i + 1;
  }
  return 0;
}
export function withLatexMacros(node: PMNode, prefix: { value: string }): PMNode {
  if (node.attrs.data?.latexDefinition) { prefix.value += node.attrs.raw + "\n"; return node; }
  if (["inline_math", "equation"].includes(editorKind(node))) return node.type.create({ ...node.attrs, latexPrefix: prefix.value }, node.content, node.marks);
  if (node.isLeaf) return node;
  const children: PMNode[] = []; node.forEach(n => children.push(withLatexMacros(n, prefix)));
  return node.type.create(node.attrs, children, node.marks);
}
export function installLatexMacros(md: MarkdownIt, config: SyntaxConfig) {
  if (!enabled(config, "latex_macros")) return;
  md.block.ruler.before("fence", "latex_definitions", (s, start, end, silent) => {
    if (s.sCount[start] - s.blkIndent >= 4) return false;
    const tail = s.getLines(start, end, s.blkIndent, false), size = definitionEnd(tail);
    if (!size || tail.slice(size).split("\n")[0].trim()) return false;
    if (silent) return true;
    const next = start + tail.slice(0, size).split("\n").length;
    const raw = tail.slice(0, size), t = s.push("source_node", "", 0); t.block = true; t.map = [start, next];
    t.meta = { node: createEditorNode(schema, "syntax_block", { kind: "raw", raw, config, data: { format: "tex", code: raw, latexDefinition: true } }) };
    s.line = next; return true;
  }, { alt: ["paragraph", "reference", "blockquote", "list"] });
  md.core.ruler.push("latex_macro_scope", s => {
    const prefix = { value: "" };
    for (const t of s.tokens) {
      if (t.meta?.node) t.meta.node = withLatexMacros(t.meta.node, prefix);
      for (const child of t.children || []) {
        if (child.type === "nfm_math") { child.type = "source_inline"; child.meta = { node: schema.nodes["inline.inline_math"].create({ value: child.content, latexPrefix: prefix.value }) }; }
        else if (child.meta?.node) child.meta.node = withLatexMacros(child.meta.node, prefix);
      }
    }
  });
}
/** Recompute render context when a definition is edited, without altering math source. */
export function latexMacroEditing() {
  return new Plugin({ appendTransaction(transactions, _old, state) {
    if (!transactions.some(t => t.docChanged)) return null;
    let prefix = ""; const tr = state.tr;
    state.doc.descendants((node, pos) => {
      if (node.attrs.data?.latexDefinition) prefix += node.attrs.raw + "\n";
      if (["inline_math", "equation"].includes(editorKind(node)) && node.attrs.latexPrefix !== prefix)
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, latexPrefix: prefix });
    });
    return tr.docChanged ? tr : null;
  } });
}
