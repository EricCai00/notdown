import { Fragment, type Node as PMNode } from "prosemirror-model";
import { Plugin, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { editorSchema as schema } from "../document/editor-schema";
import { createBacklinkIcon } from "../shared/icons";

export type FootnoteInput = { text: string } | { label: string };

export function footnoteChoices(doc: PMNode) {
  const notes = new Map<string, string>();
  doc.descendants(node => {
    if (node.type.name === "footnote" && !notes.has(node.attrs.label))
      notes.set(node.attrs.label, node.textBetween(0, node.content.size, "\n", " "));
  });
  return [...notes].map(([label, text]) => ({ label, text }));
}

export function newFootnote(doc: PMNode, text: string): PMNode {
  const used = new Set<string>();
  doc.descendants(node => {
    if (["footnote", "footnote_reference"].includes(node.type.name)) used.add(node.attrs.label);
  });
  let label = "note", serial = 1;
  while (used.has(label)) label = "note" + ++serial;
  return schema.nodes.footnote.create({ label }, text.split(/\r\n|\r|\n/).map(line =>
    schema.nodes.paragraph.create(null, line ? schema.text(line) : undefined)));
}

// Only collect definitions whose references were removed by this edit. Loading
// an existing unreferenced definition must never silently erase user content.
function removedFootnotes(before: PMNode, after: PMNode): Set<string> {
  const labels = new Set<string>();
  before.descendants(node => { if (node.type.name === "footnote_reference") labels.add(node.attrs.label); });
  after.descendants(node => { if (node.type.name === "footnote_reference") labels.delete(node.attrs.label); });
  return labels;
}

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
    view(view) {
      const tooltip = document.createElement("div");
      tooltip.className = "pm-footnote-tooltip";
      tooltip.setAttribute("role", "tooltip");
      tooltip.hidden = true;
      document.body.append(tooltip);
      const hide = () => { tooltip.hidden = true; };
      const show = (event: Event) => {
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>(".pm-footnote-ref") : null;
        if (!target || !view.dom.contains(target)) { hide(); return; }
        const node = view.state.doc.nodeAt(view.posAtDOM(target, 0));
        if (node?.type.name !== "footnote_reference") { hide(); return; }
        const note = footnoteChoices(view.state.doc).find(note => note.label === node.attrs.label);
        tooltip.textContent = note?.text || (note ? "Empty footnote" : "Footnote definition not found: " + node.attrs.label);
        tooltip.hidden = false;
        const rect = target.getBoundingClientRect();
        tooltip.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - tooltip.offsetWidth - 8))}px`;
        tooltip.style.top = `${Math.max(8, rect.top >= tooltip.offsetHeight + 12 ? rect.top - tooltip.offsetHeight - 8 : rect.bottom + 8)}px`;
      };
      view.dom.addEventListener("mouseover", show);
      view.dom.addEventListener("focusin", show);
      view.dom.addEventListener("mouseleave", hide);
      view.dom.addEventListener("focusout", hide);
      view.dom.addEventListener("keydown", hide);
      window.addEventListener("scroll", hide, true);
      return { update: hide, destroy() {
        tooltip.remove();
        view.dom.removeEventListener("mouseover", show);
        view.dom.removeEventListener("focusin", show);
        view.dom.removeEventListener("mouseleave", hide);
        view.dom.removeEventListener("focusout", hide);
        view.dom.removeEventListener("keydown", hide);
        window.removeEventListener("scroll", hide, true);
      } };
    },
    props: {
      handleDOMEvents: {
        click(view, event) {
          const target = event.target instanceof Element ? event.target.closest(".pm-footnote-ref a") : null;
          if (!target || !view.dom.contains(target)) return false;
          const reference = view.state.doc.nodeAt(view.posAtDOM(target.closest(".pm-footnote-ref")!, 0));
          if (reference?.type.name !== "footnote_reference") return false;
          event.preventDefault();
          event.stopPropagation();
          let position: number | undefined;
          view.state.doc.descendants((node, pos) => {
            if (position === undefined && node.type.name === "footnote" && node.attrs.label === reference.attrs.label) position = pos;
          });
          if (position !== undefined) {
            view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position + 1))));
            view.focus();
            const definition = view.nodeDOM(position);
            if (definition instanceof HTMLElement) definition.scrollIntoView({ block: "center" });
          }
          return true;
        },
      },
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
              button.append(createBacklinkIcon());
              if (occurrence) button.append(String(occurrence + 1));
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
    appendTransaction(transactions, old, state) {
      if (!transactions.some(tr => tr.docChanged)) return null;
      const tr = state.tr;
      const removed = removedFootnotes(old.doc, state.doc);
      if (removed.size) {
        const keys = new Set<string>(), ranges: { from: number; to: number }[] = [];
        state.doc.descendants((node, pos) => {
          if (node.type.name === "footnote_section") {
            const children: PMNode[] = [];
            node.forEach(child => children.push(child));
            if (children.every(child => removed.has(child.attrs.label))) {
              children.forEach(child => keys.add(child.attrs.footnoteKey));
              ranges.push({ from: pos, to: pos + node.nodeSize });
              return false;
            }
          }
          if (node.type.name === "footnote" && removed.has(node.attrs.label)) {
            keys.add(node.attrs.footnoteKey);
            ranges.push({ from: pos, to: pos + node.nodeSize });
            return false;
          }
        });
        state.doc.descendants((node, pos) => {
          if (node.type.name === "footnote_anchor" && keys.has(node.attrs.key)) ranges.push({ from: pos, to: pos + node.nodeSize });
        });
        if (ranges.length) {
          for (const range of ranges.sort((a, b) => b.from - a.from)) tr.delete(range.from, range.to);
        }
      }
      const working = tr.doc, selection = tr.selection;
      const doc = projectFootnotes(working);
      if (doc.eq(working)) return tr.docChanged ? tr.setMeta("footnoteProjection", true) : null;
      // Retained textblocks keep the cursor in the same text even when its
      // definition moves after a reference is inserted or reordered.
      const targets = new Map<PMNode, number>();
      doc.descendants((node, pos) => { if (node.isTextblock) targets.set(node, pos); });
      const map = (position: number) => {
        const resolved = working.resolve(position);
        for (let depth = resolved.depth; depth > 0; depth--) {
          const target = targets.get(resolved.node(depth));
          if (target !== undefined) return target + 1 + position - resolved.start(depth);
        }
        return Math.min(position, doc.content.size);
      };
      tr.replaceWith(0, working.content.size, doc.content);
      return tr.setSelection(TextSelection.between(tr.doc.resolve(map(selection.anchor)), tr.doc.resolve(map(selection.head))))
        .setMeta("footnoteProjection", true);
    },
  });
}
