import {
  createElement,
  FileText,
  BookOpen,
  NotebookPen,
  PenLine,
  Lightbulb,
  Sprout,
  Network,
  Database,
  Calendar,
  Star,
  Folder,
  House,
  Code,
  Link2,
  ArrowUpRight,
  type IconNode,
} from "lucide";
import type { Mark, Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import type { NodeView, NodeViewConstructor } from "prosemirror-view";
import { localPageTarget, pageUrl, safeReference } from "./notion-syntax";

export interface LinkedPage {
  id: string;
  title: string;
  icon?: string;
}

/** The complete normal-link label, including adjacent differently styled spans. */
export function linkRangeAtSelection(
  state: EditorState,
): { from: number; to: number; mark: Mark } | null {
  const { selection } = state;
  const { $from, $to, from, to } = selection;
  const linkType = state.schema.marks.link;
  if (!linkType || !$from.parent.inlineContent || $from.parent !== $to.parent)
    return null;
  const children: { node: ProseMirrorNode; from: number; to: number }[] = [];
  $from.parent.forEach((node, offset) => {
    const start = $from.start() + offset;
    children.push({ node, from: start, to: start + node.nodeSize });
  });
  const linkAt = (index: number) =>
    children[index]?.node.marks.find((mark) => mark.type === linkType);
  // At an exact boundary prefer the following link; at a link's trailing edge
  // the preceding link remains editable even though its mark is noninclusive.
  let index = children.findIndex(
    (child) => child.from <= from && child.to > from,
  );
  let mark = linkAt(index);
  if (!mark) {
    index = children.findIndex((child) => child.to === from);
    mark = linkAt(index);
  }
  if (!mark || index < 0) return null;
  let first = index;
  let last = index;
  while (first > 0 && mark.isInSet(children[first - 1].node.marks)) first--;
  while (
    last + 1 < children.length &&
    mark.isInSet(children[last + 1].node.marks)
  )
    last++;
  const start = children[first].from;
  const end = children[last].to;
  // A selection spanning unrelated text or another URL has no single link.
  return from >= start && to <= end ? { from: start, to: end, mark } : null;
}

const pageIcons: Record<string, IconNode> = {
  "file-text": FileText,
  "book-open": BookOpen,
  "notebook-pen": NotebookPen,
  "pen-line": PenLine,
  lightbulb: Lightbulb,
  sprout: Sprout,
  network: Network,
  database: Database,
  calendar: Calendar,
  star: Star,
  folder: Folder,
  home: House,
  house: House,
  code: Code,
  "link-2": Link2,
};

export function pageIconElement(icon?: string): Element {
  // Workspace icons are either plain emoji or Lucide names. Never interpret
  // icon/title strings as HTML, including metadata written by external tools.
  if (icon && /[^a-z-]/.test(icon)) {
    const span = document.createElement("span");
    span.className = "page-link-icon emoji";
    span.setAttribute("aria-hidden", "true");
    span.textContent = icon;
    return span;
  }
  return createElement(pageIcons[icon ?? ""] ?? FileText, {
    class: "page-link-icon",
    width: 16,
    height: 16,
    "stroke-width": 1.65,
    "aria-hidden": "true",
    focusable: "false",
  });
}

class PageLinkView implements NodeView {
  readonly dom: HTMLAnchorElement;

  constructor(
    private node: ProseMirrorNode,
    private pages: () => readonly LinkedPage[],
  ) {
    this.dom = document.createElement("a");
    this.dom.contentEditable = "false";
    this.dom.draggable = false;
    this.render();
  }

  private render(): void {
    const target = String(this.node.attrs.target ?? "");
    const pages = this.pages();
    const page =
      pages.find((entry) => entry.id === target) ??
      pages.find((entry) => entry.title === target);
    // IDs remain the source of truth. Renaming a linked page updates the label
    // when its node view renders, even if the stored Markdown has an old alias.
    const label =
      page?.title || String(this.node.attrs.label || target || "Untitled page");
    this.dom.className =
      this.node.type.name === "child_page"
        ? "child-page-node child-page"
        : "page-mention wiki-link";
    this.dom.setAttribute(
      "href",
      safeReference(page ? `#page/${encodeURIComponent(page.id)}` : this.node.attrs.url || pageUrl(target)),
    );
    this.dom.setAttribute("data-page-target", target);
    this.dom.setAttribute("data-page-id", page?.id ?? target);
    this.dom.setAttribute("aria-label", label);
    this.dom.title = page || !localPageTarget(target) ? label : `Page not found: ${label}`;
    const text = document.createElement("span");
    text.className = "page-link-label";
    text.textContent = label;
    const icon = pageIconElement(page?.icon);
    if (this.node.type.name === "child_page") {
      const iconSlot = document.createElement("span");
      iconSlot.className = "page-link-icon-slot";
      iconSlot.setAttribute("aria-hidden", "true");
      iconSlot.append(icon);
      // Untyped legacy page blocks are references, just like Link to page.
      // Only an explicit child role denotes the child-page presentation.
      if (this.node.attrs.nfmAttrs?.role !== "child") {
        iconSlot.append(createElement(ArrowUpRight, {
          class: "page-link-reference-arrow",
          width: 18,
          height: 18,
          "stroke-width": 1.8,
          "aria-hidden": "true",
          focusable: "false",
        }));
      }
      this.dom.replaceChildren(iconSlot, text);
    } else {
      this.dom.replaceChildren(icon, text);
    }
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  selectNode(): void {
    this.dom.classList.add("ProseMirror-selectednode");
  }
  deselectNode(): void {
    this.dom.classList.remove("ProseMirror-selectednode");
  }
  stopEvent(event: Event): boolean {
    // The document's existing page-link click handler owns navigation. Events
    // still bubble to it; only ProseMirror's editing handlers ignore them.
    return ["pointerdown", "mousedown", "mouseup", "click"].includes(
      event.type,
    );
  }
  ignoreMutation(mutation: { type: string }): boolean {
    return mutation.type !== "selection";
  }
}

export function createPageNodeViews(
  pages: () => readonly LinkedPage[],
): Record<string, NodeViewConstructor> {
  const create: NodeViewConstructor = (node) => new PageLinkView(node, pages);
  return { page_link: create, child_page: create };
}
