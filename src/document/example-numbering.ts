import type { Attrs, Node as PMNode } from "prosemirror-model";
import { isEditorKind } from "./node-identity";

/** New menu insertions must not accidentally repeat an existing example. */
export function nextExampleLabel(doc: PMNode): string {
  const labels = new Set<string>();
  doc.descendants(node => {
    if (isEditorKind(node, "example_list_item")) labels.add(String(node.attrs.label));
    if (node.attrs.kind === "example-reference") labels.add(String(node.attrs.raw).replace(/^@/, ""));
  });
  let label = "example", suffix = 1;
  while (labels.has(label)) label = `example-${++suffix}`;
  return label;
}

/** Repeated labels reuse the first occurrence; only new/anonymous examples advance. */
export function exampleNumbering(doc: PMNode): Map<number, Attrs> {
  const updates = new Map<number, Attrs>(), labels = new Map<string, number>();
  let counter = 0;
  const update = (node: PMNode, pos: number, attrs: Attrs) => {
    if (Object.entries(attrs).some(([key, value]) => node.attrs[key] !== value))
      updates.set(pos, { ...node.attrs, ...attrs });
  };
  const numbers = new Map<number, number>();
  doc.descendants((node, pos) => {
    if (!isEditorKind(node, "example_list_item")) return;
    const label = String(node.attrs.label), repeated = !!label && labels.has(label);
    const number = repeated ? labels.get(label)! : ++counter;
    if (label && !repeated) labels.set(label, number);
    numbers.set(pos, number);
    update(node, pos, { number, referenceId: label && !repeated ? "md-example-" + label : null });
  });
  doc.descendants((node, pos) => {
    if (isEditorKind(node, "example_list"))
      update(node, pos, { start: numbers.get(pos + 1) ?? 1 });
    if (isEditorKind(node, "syntax_inline") && node.attrs.kind === "example-reference")
      update(node, pos, { label: String(labels.get(String(node.attrs.raw).replace(/^@/, "")) ?? node.attrs.raw) });
  });
  return updates;
}

export function normalizeExampleNumbering(doc: PMNode): PMNode {
  const updates = exampleNumbering(doc);
  if (!updates.size) return doc;
  const walk = (node: PMNode, pos: number): PMNode => {
    if (node.isText) return node;
    const content: PMNode[] = [];
    let changed = updates.has(pos);
    node.forEach((child, offset) => {
      const next = walk(child, pos + 1 + offset);
      changed ||= next !== child;
      content.push(next);
    });
    if (!changed) return node;
    return node.type.create(updates.get(pos) ?? node.attrs, content, node.marks);
  };
  return walk(doc, -1);
}
