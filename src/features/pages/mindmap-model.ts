import type { Node as PMNode } from "prosemirror-model";
import { parseNative } from "../../markdown-engine/codec";
import { defaultSyntax, type SyntaxConfig } from "../../markdown-engine/config";
import { editorKind } from "../../document/node-identity";
import { isListItem } from "../../document/list-items";
import { localPageTarget, type BodyFormat } from "../../document/notion-syntax";
import { resolveContentObject } from "../../document/content-objects";
import { isHtmlAsset } from "../../document/embed-source";

export type MindmapKind = "root" | "heading" | "paragraph" | "list" | "task" | "quote" | "code" | "table" | "media" | "block";
export interface MindmapNode {
  id: string;
  kind: MindmapKind;
  text: string;
  detail: string;
  /** Original semantic block and its renderable context; never rebuilt from plain text. */
  block: PMNode;
  preview: PMNode;
  children: MindmapNode[];
  descendants: number;
  hasHeading: boolean;
  level?: number;
  checked?: boolean;
  /** Application-owned type label, separate from the container's authored title. */
  container?: string;
  /** Badge for content summarized rather than rendered on the canvas. */
  typeLabel?: string;
  referenceTarget?: string;
}

const containerLabels: Record<string, string> = {
  blockquote: "Quote", callout: "Callout", toggle_block: "Toggle", synced_block: "Synced block",
  fenced_div: "Container", columns: "Columns", column: "Column", tabs: "Tabs", tab: "Tab",
  meeting_notes: "Meeting notes", meeting_section: "Meeting section", definition_list: "Definition list",
  definition_list_item: "Definition", definition_description: "Description",
};

function typeLabel(node: PMNode): string {
  const kind = editorKind(node);
  if (kind === "unknown_block") {
    // The importer retains these known unavailable types in its placeholder alt.
    // This is a display hint only: the original unsupported node stays in preview.
    const imported = /^(button|ai_block): configuration unavailable(?: \([\s\S]*\))?$/.exec(String(node.attrs.alt || ""));
    if (imported) return imported[1] === "button" ? "Button" : "AI block";
  }
  if (["image", "image_block"].includes(kind) || node.type.name === "block.image_block") return "Image";
  if (node.type.name === "block.web_embed") return kind === "notion_embed" || isHtmlAsset(String(node.attrs.url || node.attrs.data?.src || "")) ? "HTML embed" : "Web embed";
  if (kind === "equation") return "Equation";
  return containerLabels[kind] || resolveContentObject(node)?.name || "Content";
}

/** Resolve reference titles without exposing internal URLs or modifying the source. */
export function mindmapNodeText(node: MindmapNode, pages: readonly { id: string; title: string }[] = []): string {
  return (node.referenceTarget && pages.find(page => page.id === node.referenceTarget)?.title) || node.text;
}

function readable(node: PMNode): string {
  if (node.isText) return node.text || "";
  if (editorKind(node) === "hard_break") return "\n";
  if (node.isLeaf) return String(node.attrs.label || node.attrs.alt || node.attrs.title || node.attrs.value || "");
  const parts: string[] = [];
  node.forEach(child => parts.push(readable(child)));
  return parts.join(node.inlineContent ? "" : "\n");
}

/** A read-only projection of the active dialect, never a second Markdown parser. */
export function buildMindmap(title: string, source: string, format: BodyFormat = "markdown", syntax?: SyntaxConfig): MindmapNode {
  const doc = parseNative(source, syntax ?? defaultSyntax(format));
  let sequence = 0;
  const make = (kind: MindmapKind, text: string, block: PMNode, detail = text, preview = block): MindmapNode => ({
    id: `map-${sequence++}`, kind, text: text.replace(/\s+/g, " ").trim(), detail: detail.trim(),
    block, preview,
    children: [], descendants: 0, hasHeading: kind === "heading",
  });
  const root = make("root", title, doc);
  const children = (node: PMNode) => { const result: PMNode[] = []; node.forEach(child => result.push(child)); return result; };
  function blocks(nodes: PMNode[], target: MindmapNode, list?: PMNode) {
    const headings: MindmapNode[] = [];
    const contentParent = () => headings.at(-1) ?? target;
    // Only ordinary headings create implicit sections. Toggle heading levels
    // control presentation; ownership comes exclusively from explicit nesting.
    const appendHeading = (item: MindmapNode, level: number, acceptsFollowingContent: boolean) => {
      item.level = level;
      if (acceptsFollowingContent)
        while (headings.length && headings.at(-1)!.level! >= level) headings.pop();
      contentParent().children.push(item);
      if (acceptsFollowingContent) headings.push(item);
    };
    for (const [index, node] of nodes.entries()) {
      const kind = editorKind(node);
      if (node.attrs.metadataForm || ["footnote_anchor", "metadata_block"].includes(kind) ||
        kind === "syntax_block" && (node.attrs.kind === "comment" || node.attrs.data?.latexDefinition)) continue;
      if (["bullet_list", "ordered_list"].includes(kind)) {
        blocks(children(node), contentParent(), node);
        continue;
      }
      if (kind === "heading") {
        const item = make("heading", readable(node), node);
        appendHeading(item, Number(node.attrs.level) || 1, !node.attrs.toggle);
        continue;
      }
      const parent = contentParent();
      if (isListItem(node) || kind === "nested_block") {
        const first = node.firstChild;
        const text = first ? readable(first) : "";
        const preview = list ? list.type.create({ ...list.attrs, ...(editorKind(list) === "ordered_list" ? { order: list.attrs.order + index } : {}) }, [node], list.marks) : node;
        const item = make(isListItem(node) ? kind === "task_list_item" ? "task" : "list" : first && editorKind(first) === "heading" ? "heading" : "paragraph", text, node, text, preview);
        if (item.kind === "task") item.checked = !!node.attrs.checked;
        if (item.kind === "heading") appendHeading(item, Number(first?.attrs.level) || 1, !first?.attrs.toggle);
        else parent.children.push(item);
        blocks(children(node).slice(1), item);
        continue;
      }
      if (containerLabels[kind] || kind !== "table" && !node.inlineContent && node.childCount > 0 && !node.isTextblock) {
        const summary = kind === "toggle_block" ? node.firstChild : null;
        const item = make(kind === "blockquote" || kind === "callout" ? "quote" : "block", summary ? readable(summary) : String(node.attrs.title || ""), node);
        item.container = containerLabels[kind] || typeLabel(node);
        parent.children.push(item);
        blocks(children(node).slice(summary ? 1 : 0), item);
        continue;
      }
      const media = ["block.image_block", "block.web_embed"].includes(node.type.name) || ["media_block", "audio", "video", "pdf", "web_bookmark", "link_preview"].includes(kind) ||
        kind === "paragraph" && node.childCount === 1 && editorKind(node.firstChild!) === "image";
      const detail = readable(node) || String(node.attrs.raw || node.attrs.url || node.attrs.src || node.attrs.source || "");
      // Ignore the parser's empty-document placeholder, but retain authored <p />.
      if (kind === "paragraph" && !detail.trim()) continue;
      if (kind === "code_block" || kind === "executable_chunk") {
        parent.children.push({ ...make("code", String(node.attrs.params || node.attrs.language || ""), node, node.textContent), typeLabel: kind === "code_block" ? "Code" : typeLabel(node) });
      } else if (kind === "table") {
        const rows = children(node).filter(row => editorKind(row) === "table_row");
        parent.children.push({ ...make("table", `${rows.length} × ${Math.max(0, ...rows.map(row => row.childCount))}`, node, rows.map(row => children(row).map(readable).join(" | ")).join("\n")), typeLabel: "Table" });
      } else {
        const content = kind !== "equation" && !["syntax_block", "html_block", "opaque_block", "unknown_block"].includes(kind)
          ? readable(node) || String(node.attrs.caption || "") : "";
        const item = make(media ? "media" : kind === "paragraph" ? "paragraph" : "block", content, node, detail);
        if (media || !content || !node.isTextblock) item.typeLabel = typeLabel(media && kind === "paragraph" ? node.firstChild! : node);
        if (["database", "child_page"].includes(kind)) {
          item.referenceTarget = localPageTarget(String(node.attrs.url || "")) || (kind === "child_page" ? String(node.attrs.target || "") : undefined);
          if (item.text === node.attrs.url || item.text === item.referenceTarget) item.text = "";
        }
        parent.children.push(item);
      }
    }
  }
  blocks(children(doc), root);
  function count(node: MindmapNode) {
    node.children.forEach(count);
    node.descendants = node.children.reduce((sum, child) => sum + 1 + child.descendants, 0);
    node.hasHeading ||= node.children.some(child => child.hasHeading);
  }
  count(root);
  return root;
}

export type MindmapExpansion = "headings" | "expanded" | "collapsed";

/** Opening a branch also opens its container wrappers, including nested wrappers. */
export function expandMindmapNode(node: MindmapNode, states: Map<string, MindmapExpansion>) {
  states.set(node.id, "expanded");
  for (const child of node.children) if (child.container) expandMindmapNode(child, states);
}

export function visibleMindmapChildren(node: MindmapNode, states: Map<string, MindmapExpansion>): MindmapNode[] {
  const state = states.get(node.id) ?? "headings";
  if (state === "collapsed") return [];
  if (state === "expanded") return node.children;
  return node.kind === "root" && !node.hasHeading ? node.children : node.children.filter(child => child.hasHeading);
}

export function hiddenMindmapCount(node: MindmapNode, states: Map<string, MindmapExpansion>): number {
  const visible = visibleMindmapChildren(node, states);
  return node.descendants - visible.reduce((sum, child) => sum + 1 + child.descendants - hiddenMindmapCount(child, states), 0);
}
