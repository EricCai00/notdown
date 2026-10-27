import { isEditorKind } from "../document/node-identity";
import { createElement, ArrowUpRight } from "lucide";
import { pageIconElement } from "../shared/page-icons";
import { pageReferenceContent } from "../shared/page-reference-content";
import type { Mark, Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import type { NodeView, NodeViewConstructor } from "prosemirror-view";
import { localPageTarget, pageUrl, safeReference } from "../document/notion-syntax";
import { nodeReference, referenceHref, referenceLabel, resolveReferencePage } from "../document/internal-reference";
import { externalIdentity, unknownEntityLabel } from "../features/references/external-entity";
import { externalEntitiesChanged, resolveExternal } from "../features/references/external-client";

export interface LinkedPage {
  id: string;
  title: string;
  icon?: string;
  parent?: string | null;
  trashed?: boolean;
}

export function isOwnedPageEntry(node: ProseMirrorNode): boolean {
  return node.type.name === "block.child_page";
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

class PageLinkView implements NodeView {
  readonly dom: HTMLAnchorElement;
  private events = new AbortController();
  private targetUpdates = new Map<string, LinkedPage>();

  constructor(
    private node: ProseMirrorNode,
    private pages: () => readonly LinkedPage[],
    private currentPage?: () => { id: string } | undefined,
  ) {
    this.dom = document.createElement("a");
    this.dom.contentEditable = "false";
    this.dom.draggable = false;
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const page = detail?.hostPage ?? detail;
      if (!page || typeof page.id !== "string" || typeof page.title !== "string") return;
      this.targetUpdates.set(page.id, page); this.render();
    };
    document.addEventListener("notdown-database-updated", refresh, { signal: this.events.signal });
    document.addEventListener("notdown-database-record-saved", refresh, { signal: this.events.signal });
    document.addEventListener(externalEntitiesChanged, () => this.render(), { signal: this.events.signal });
    this.render();
  }

  private render(): void {
    const target = String(this.node.attrs.target ?? "");
    const pages = [...this.pages().filter(page => !this.targetUpdates.has(page.id)), ...this.targetUpdates.values()];
    const reference = nodeReference(this.node);
    const identity = externalIdentity(this.node.attrs.url || target);
    const entity = identity ? resolveExternal(this.node.attrs.url || target) : undefined;
    const page: LinkedPage | undefined = identity ? entity?.status === "resolved" && entity.localId ? pages.find(page => page.id === entity.localId && !page.trashed) ?? { id: entity.localId, title: entity.label || this.node.attrs.label || "Page" } : undefined
      : reference ? resolveReferencePage(reference, pages, this.currentPage?.()?.id) : undefined;
    const unknown = !!identity && !page || !!reference && reference.addressing !== "url" && reference.addressing !== "current" && !page;
    const label = unknown ? unknownEntityLabel(identity?.kind ?? "page") : reference ? referenceLabel(this.node, reference, page) : String(this.node.attrs.label || target);
    this.dom.className =
      isEditorKind(this.node, "child_page")
        ? "child-page-node child-page"
        : "page-mention wiki-link";
    this.dom.setAttribute(
      "href",
      safeReference(reference ? referenceHref(reference, page?.id) : this.node.attrs.url || pageUrl(target)),
    );
    if (identity && page) this.dom.setAttribute("href", `#page/${page.id}`);
    this.dom.classList.toggle("external-unresolved", unknown);
    if (unknown) { this.dom.removeAttribute("href"); this.dom.setAttribute("aria-disabled", "true"); this.dom.tabIndex = -1; }
    else { this.dom.removeAttribute("aria-disabled"); this.dom.removeAttribute("tabindex"); }
    this.dom.setAttribute("data-page-target", target);
    this.dom.dataset.pmNodeType = this.node.type.name;
    this.dom.setAttribute("data-page-id", page?.id ?? target);
    this.dom.dataset.referenceKind = reference?.kind || "page";
    this.dom.dataset.referenceSyntax = reference?.syntax || "mention";
    this.dom.dataset.referenceUrl = this.node.attrs.url || "";
    this.dom.dataset.referenceAttrs = JSON.stringify(this.node.attrs.nfmAttrs || {});
    this.dom.dataset.labelMode = this.node.attrs.labelMode || "";
    this.dom.setAttribute("aria-label", label);
    this.dom.title = page || !localPageTarget(target) ? label : `Page not found: ${label}`;
    const text = document.createElement("span");
    text.className = "page-link-label";
    text.textContent = label;
    const icon = reference?.kind === "location" ? createElement(ArrowUpRight, { width: 16, height: 16 }) : pageIconElement(page?.icon);
    const isBlock = isEditorKind(this.node, "child_page");
    if (isBlock || reference?.kind === "page") {
      // UI identity must follow the actual PM type, never inferred ownership.
      if (isBlock) this.dom.dataset.pageRelation = isOwnedPageEntry(this.node) ? "child" : "reference";
      this.dom.replaceChildren(...pageReferenceContent(label, page?.icon, !isBlock && !isOwnedPageEntry(this.node)));
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
  destroy() { this.events.abort(); }
}

export function createPageNodeViews(
  pages: () => readonly LinkedPage[],
  currentPage?: () => { id: string } | undefined,
): Record<string, NodeViewConstructor> {
  const create: NodeViewConstructor = (node) => new PageLinkView(node, pages, currentPage);
  return { page_link: create, child_page: create };
}
