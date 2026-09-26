import { editorKind, isEditorKind } from "../document/node-identity";
import type { Node as PMNode } from "prosemirror-model";
import { parseNative } from "../markdown-engine/codec";
import { enabled, type SyntaxConfig } from "../markdown-engine/config";

/** Plain-text export. Gutenberg is an output convention, not a Markdown reader. */
export function plainText(source: string, config: SyntaxConfig): string {
  const gutenberg = enabled(config, "gutenberg");
  const render = (node: PMNode): string => {
    if (node.isText) {
      let text = node.text || "";
      if (gutenberg && node.marks.some(m => isEditorKind(m, "strong"))) text = text.toUpperCase();
      if (gutenberg && node.marks.some(m => isEditorKind(m, "em"))) text = "_" + text + "_";
      return text;
    }
    const children: string[] = []; node.forEach(n => children.push(render(n)));
    const text = children.join(node.inlineContent ? "" : "\n\n");
    switch (editorKind(node)) {
      case "heading": return gutenberg ? "\n\n" + text + "\n" : text;
      case "hard_break": return "\n";
      case "horizontal_rule": return "* * *";
      case "syntax_block": return node.attrs.kind === "comment" || node.attrs.data?.latexDefinition ? "" : String(node.attrs.data?.code || node.attrs.raw || "");
      case "table_row": return children.join("\t");
      case "table": return children.join("\n");
      case "bullet_list_item": return "- " + text;
      case "task_list_item": return (node.attrs.checked ? "[x] " : "[ ] ") + text;
      case "inline_math": return node.attrs.value;
      default: return text || String(node.attrs.label || node.attrs.alt || node.attrs.raw || "");
    }
  };
  return render(parseNative(source, config)).trim() + "\n";
}
