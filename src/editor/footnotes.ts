import { Fragment, type Node as PMNode } from "prosemirror-model";
import { Plugin, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { editorSchema as schema } from "../document/editor-schema";

/** A view projection in the same document. Anchors retain source positions;
 * definitions remain editable, but are presented together in reference order. */
export function projectFootnotes(doc: PMNode): PMNode {
  const definitions: PMNode[] = [], used = new Set<string>();
  doc.descendants(node => { if (node.attrs.footnoteKey) used.add(node.attrs.footnoteKey); });
  let serial = 0;
  const identify = (node: PMNode) => {
    if (node.attrs.footnoteKey) return node;
    let key: string;
    do { key = `footnote-${++serial}`; } while (used.has(key));
    used.add(key);
    return node.type.create({ ...node.attrs, footnoteKey: key }, node.content, node.marks);
  };
  const visit = (node: PMNode): PMNode | null => {
    if (node.type.name === "footnote_section") {
      node.forEach(child => definitions.push(identify(child)));
      return null;
    }
    if (node.type.name === "footnote") {
      const definition = identify(node);
      definitions.push(definition);
      return schema.nodes.footnote_anchor.create({ key: definition.attrs.footnoteKey });
    }
    if (node.isLeaf) return node;
    const children: PMNode[] = [];
    node.forEach(child => { const next = visit(child); if (next) children.push(next); });
    const content = Fragment.from(children);
    return node.content.eq(content) ? node : node.copy(content);
  };
  const body = visit(doc)!;
  if (!definitions.length) return body;
  const order = new Map<string, number>(), sourceOrder = new Map<string, number>();
  body.descendants(node => {
    if (node.type.name === "footnote_anchor") sourceOrder.set(node.attrs.key, sourceOrder.size);
    if (node.type.name === "footnote_reference" && !order.has(node.attrs.label))
      order.set(node.attrs.label, order.size);
  });
  definitions.sort((a, b) => {
    const first = order.get(a.attrs.label), second = order.get(b.attrs.label);
    if (first !== undefined || second !== undefined) return (first ?? Infinity) - (second ?? Infinity);
    return (sourceOrder.get(a.attrs.footnoteKey) ?? Infinity) - (sourceOrder.get(b.attrs.footnoteKey) ?? Infinity);
  });
  return body.copy(body.content.append(Fragment.from(schema.nodes.footnote_section.create(null, definitions))));
}

/** Undo the presentation before passing the document back to the Markdown codec. */
export function restoreFootnotes(doc: PMNode): PMNode {
  const definitions = new Map<string, PMNode>(), anchored = new Set<string>();
  doc.descendants(node => {
    if (node.type.name === "footnote_anchor") anchored.add(node.attrs.key);
    if (node.type.name === "footnote" && node.attrs.footnoteKey)
      definitions.set(node.attrs.footnoteKey, node.type.create({ ...node.attrs, footnoteKey: null }, node.content, node.marks));
  });
  const visit = (node: PMNode): PMNode[] => {
    if (node.type.name === "footnote_anchor") {
      const definition = definitions.get(node.attrs.key);
      return definition ? [definition] : [];
    }
    if (node.type.name === "footnote_section") {
      const remaining: PMNode[] = [];
      node.forEach(child => {
        if (!anchored.has(child.attrs.footnoteKey)) remaining.push(definitions.get(child.attrs.footnoteKey) ?? child);
      });
      return remaining;
    }
    if (node.isLeaf) return [node];
    const children: PMNode[] = [];
    node.forEach(child => children.push(...visit(child)));
    const content = Fragment.from(children);
    return [node.content.eq(content) ? node : node.copy(content)];
  };
  return visit(doc)[0];
}

export function footnotePresentation() {
  return new Plugin({
    props: {
      decorations(state) {
        const order = new Map<string, number>(), decorations: Decoration[] = [];
        const references = new Map<string, number[]>();
        state.doc.descendants((node, pos) => {
          if (node.type.name === "footnote_section") return false;
          if (node.type.name === "footnote_reference") {
            if (!order.has(node.attrs.label)) order.set(node.attrs.label, order.size + 1);
            const positions = references.get(node.attrs.label) ?? [];
            positions.push(pos);
            references.set(node.attrs.label, positions);
          }
        });
        state.doc.descendants((node, pos) => {
          if (!["footnote_reference", "footnote"].includes(node.type.name)) return;
          const number = order.get(node.attrs.label);
          if (number !== undefined) decorations.push(Decoration.node(pos, pos + node.nodeSize, {
            "data-footnote-number": String(number), "aria-label": `Footnote ${number}`,
            style: `--footnote-number: "${number}"`,
          }));
          if (node.type.name !== "footnote" || number === undefined) return;
          let end = pos + node.nodeSize - 1;
          node.descendants((child, offset) => {
            if (child.isTextblock) end = child.type.spec.code ? pos + node.nodeSize - 1 : pos + offset + 2 + child.content.size;
          });
          const label = String(node.attrs.label);
          for (let occurrence = 0; occurrence < (references.get(label)?.length ?? 0); occurrence++) {
            decorations.push(Decoration.widget(end, view => {
              const button = document.createElement("button");
              button.type = "button";
              button.className = "pm-footnote-backref";
              button.contentEditable = "false";
              button.textContent = occurrence ? `↩${occurrence + 1}` : "↩";
              button.dataset.footnoteBackref = label;
              button.setAttribute("aria-label", `Return to footnote ${number} reference ${occurrence + 1}`);
              button.title = `Return to reference ${number}${occurrence ? ` (${occurrence + 1})` : ""}`;
              button.onmousedown = event => event.preventDefault();
              button.onclick = event => {
                event.preventDefault();
                let index = 0, target: number | undefined;
                view.state.doc.descendants((reference, position) => {
                  if (reference.type.name === "footnote_section") return false;
                  if (reference.type.name === "footnote_reference" && reference.attrs.label === label && index++ === occurrence) target = position;
                });
                if (target === undefined) return;
                const dom = view.nodeDOM(target);
                view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(target + 1))));
                view.focus();
                if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "center" });
              };
              return button;
            }, { key: `footnote-return-${node.attrs.footnoteKey}-${number}-${occurrence}`, side: 1, stopEvent: () => true }));
          }
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
    appendTransaction(transactions, _old, state) {
      if (!transactions.some(tr => tr.docChanged)) return null;
      const doc = projectFootnotes(state.doc);
      if (doc.eq(state.doc)) return null;
      // Retained textblocks keep the cursor in the same text even when its
      // definition moves after a reference is inserted or reordered.
      const targets = new Map<PMNode, number>();
      doc.descendants((node, pos) => { if (node.isTextblock) targets.set(node, pos); });
      const map = (position: number) => {
        const resolved = state.doc.resolve(position);
        for (let depth = resolved.depth; depth > 0; depth--) {
          const target = targets.get(resolved.node(depth));
          if (target !== undefined) return target + 1 + position - resolved.start(depth);
        }
        return Math.min(position, doc.content.size);
      };
      const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
      return tr.setSelection(TextSelection.between(tr.doc.resolve(map(state.selection.anchor)), tr.doc.resolve(map(state.selection.head))))
        .setMeta("footnoteProjection", true);
    },
  });
}
