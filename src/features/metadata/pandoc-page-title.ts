import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../markdown-engine/codec";
import { enabled, type SyntaxConfig } from "../../markdown-engine/config";
import { pandocTitleValues } from "../../markdown-engine/metadata-editing";
import { metadataSourceTransaction } from "./metadata-source";
import { documentMetadata } from "./document-metadata";
import { editMetadata } from "../../markdown-engine/metadata-editing";

export function documentPageTitle(source: string, _config?: SyntaxConfig): string | undefined {
  try {
    const title = documentMetadata(source).values.title;
    return typeof title === "string" && title.trim() && title.length <= 500 ? title : undefined;
  } catch { return undefined; }
}

export function renameDocumentPageSource(source: string, config: SyntaxConfig, title: string): string {
  if (source.startsWith("\uFEFF")) return "\uFEFF" + renameDocumentPageSource(source.slice(1), config, title);
  const metadata = documentMetadata(source);
  if (typeof metadata.values.title !== "string") return source;
  if (metadata.form === "yaml") {
    const prefix = /^(?:\uFEFF)?---[^\n]*\n[\s\S]*?\r?\n(?:---|\.\.\.)[\t ]*(?=\r?\n|$)/.exec(source);
    if (prefix) return editMetadata(prefix[0], "yaml", "title", title) + source.slice(prefix[0].length);
  }
  if (metadata.form === "pandoc") {
    const prefix = /^(?:\uFEFF)?%(?:[^\n]*)(?:\r?\n(?:%[^\n]*|[\t ]+\S[^\n]*))*/.exec(source);
    if (prefix) return replacePandocTitle(prefix[0], title) + source.slice(prefix[0].length);
  }
  return source;
}

export function pandocPageTitle(source: string, config: SyntaxConfig): string | undefined {
  if (!enabled(config, "pandoc_title_block") || !source.startsWith("%")) return;
  const node = parseNative(source, config).firstChild;
  if (node?.attrs.metadataForm === "pandoc") return pandocTitleValues(node.attrs.raw).title;
}

/** Change only the first field of an already recognized title block. */
export function replacePandocTitle(raw: string, title: string): string {
  const newline = raw.match(/\r\n|\n|\r/)?.[0] || "\n";
  const nextField = /\r?\n(?=%(?:\s|$))/.exec(raw);
  const marker = /^%[\t ]+/.exec(raw)?.[0] || "% ";
  return marker + title.replace(/\r\n|\r|\n/g, newline + "  ") + (nextField ? raw.slice(nextField.index) : "");
}

export function renamePandocPageSource(source: string, config: SyntaxConfig, title: string): string {
  if (pandocPageTitle(source, config) === undefined) return source;
  const doc = parseNative(source, config), node = doc.firstChild!;
  const state = EditorState.create({ doc });
  const tr = metadataSourceTransaction(state, 0, node, replacePandocTitle(node.attrs.raw, title), raw => parseNative(raw, config));
  return tr ? serializeNative(state.apply(tr).doc, config) : source;
}
