import { Fragment, Slice, type Node as PMNode } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import { enabled, type SyntaxConfig } from "../markdown-engine/config";
import { metadataValues } from "../markdown-engine/products";

export const inlineObjectCommands = ["citation", "abbreviation", "glossary", "metadata_variable", "addition", "deletion", "substitution"] as const;
export type InlineObjectCommand = typeof inlineObjectCommands[number];
export type InlineEncoding = "notion" | "pandoc" | "mmd" | "php" | "critic";
export interface InlineInsertion { inline: string; definition?: string }
export function inlineEncodings(command: InlineObjectCommand, config: SyntaxConfig): InlineEncoding[] {
  if (command === "citation") return [
    ...(["notdown", "notion-markdown"].includes(config.variant) && enabled(config, "notion_mentions") ? ["notion" as const] : []),
    ...(enabled(config, "mmd_citations") ? ["mmd" as const] : []),
    ...(enabled(config, "citations") ? ["pandoc" as const] : []),
  ];
  if (command === "abbreviation") return [
    ...(enabled(config, "mmd_abbreviations") ? ["mmd" as const] : []),
    ...(enabled(config, "abbreviations") ? ["php" as const] : []),
  ];
  if (["addition", "deletion", "substitution"].includes(command)) return enabled(config, "critic_markup") ? ["critic"] : [];
  return enabled(config, command === "metadata_variable" ? "metadata_variables" : "glossary") ? ["mmd"] : [];
}

/** Read parsed definitions only: never discover references inside code or opaque source. */
export function inlineChoices(doc: PMNode, command: InlineObjectCommand, encoding: InlineEncoding) {
  const result = new Map<string, string>();
  if (command === "abbreviation" && encoding === "php") {
    for (const gap of [...(doc.attrs.sourceGaps || []), doc.attrs.sourceSuffix || ""])
      for (const match of String(gap).matchAll(/^ {0,3}\*\[([^\]\r\n]+)\]:[ \t]*([^\r\n]*)/gm)) result.set(match[1], match[2]);
  }
  const prefix = command === "citation" ? "#" : command === "abbreviation" ? ">" : "?";
  doc.descendants(node => {
    if (encoding === "mmd" && node.type.name === "syntax_block" && node.attrs.kind === "definition" && String(node.attrs.data.key).startsWith(prefix))
      result.set(String(node.attrs.data.key).slice(1), String(node.attrs.data.body));
    if (command === "abbreviation" && encoding === "php" && node.isText) {
      const mark = node.marks.find(m => m.type.name === "abbreviation");
      if (mark) result.set(node.text!, mark.attrs.title);
    }
    if (command === "metadata_variable" && node.type.name === "syntax_block" && node.attrs.kind === "metadata")
      for (const [key, value] of Object.entries(metadataValues(node.attrs.raw, node.attrs.metadataForm))) result.set(key, String(value));
    if (command === "citation" && encoding === "notion" && node.type.name === "citation") result.set(node.attrs.url, node.attrs.url);
  });
  return result;
}

export function buildInlineInsertion(command: InlineObjectCommand, encoding: InlineEncoding, values: Record<string, string>, config: SyntaxConfig, doc: PMNode, bibliography: Record<string, string> = {}): InlineInsertion {
  if (!inlineEncodings(command, config).includes(encoding)) throw new Error("This syntax is unavailable in the current dialect.");
  const key = (values.key || "").trim(), body = (values.body || "").trim(), locator = (values.locator || "").trim();
  const single = (value: string) => { if (/[\r\n]/.test(value)) throw new Error("Use a single line for this inline object."); };
  if (encoding === "critic") {
    const text = values.text || "", old = values.old || "";
    if (!text && command !== "deletion" || command === "deletion" && !old || command === "substitution" && !old) throw new Error("Enter the revision text.");
    for (const value of [text, old]) { single(value); if (/\{\+\+|\+\+\}|\{--|--\}|\{~~|~~\}|~>|\{==|==\}|\{>>|<<\}/.test(value)) throw new Error("Revision text cannot contain CriticMarkup delimiters."); }
    return { inline: command === "addition" ? `{++${text}++}` : command === "deletion" ? `{--${old}--}` : `{~~${old}~>${text}~~}` };
  }
  if (command === "citation" && encoding === "mmd" && values.inline === "true") {
    single(body); single(locator);
    if (!body || !/\s/.test(body) || /[\[\]\\]/.test(body + locator)) throw new Error("Enter inline bibliography text with spaces and no brackets or backslashes.");
    return { inline: `${locator ? `[${locator}]` : ""}[#${body}]` };
  }
  if (!key) throw new Error("Enter a reference or name.");
  single(key); single(body); single(locator);
  if (encoding === "notion") {
    if (!/^[a-z][a-z\d+.-]*:[^\s\[\]<>]+$/i.test(key) || /^(?:javascript|data|vbscript):/i.test(key)) throw new Error("Enter a source URL with a supported scheme.");
    return { inline: `[^${key}]` };
  }
  if (/[\[\]\\]/.test(key) || /[\[\]\\]/.test(locator)) throw new Error("Names and locators cannot contain brackets or backslashes.");
  if (encoding === "pandoc") {
    if (!/^[\p{L}\p{N}_][\p{L}\p{N}_:.#$%&+?<>~/\-]*[\p{L}\p{N}_]$|^[\p{L}\p{N}_]$/u.test(key)) throw new Error("Enter a citation key, without @ or surrounding brackets.");
    return { inline: `[@${key}${locator ? ", " + locator : ""}]` };
  }
  if (command === "metadata_variable") return { inline: `[%${key}]` };
  const existing = inlineChoices(doc, command, encoding).get(key);
  if (command === "citation" && encoding === "mmd" && existing === undefined && !body && Object.hasOwn(bibliography, key))
    return { inline: `${locator ? `[${locator}]` : ""}[#${key}]` };
  if (existing !== undefined && body && body !== existing) throw new Error("This name already has a definition. Reuse it or edit the existing definition.");
  if (existing === undefined && !body) throw new Error("Enter a definition, or reuse an existing reference.");
  const prefix = command === "citation" ? "#" : command === "abbreviation" ? ">" : "?";
  return {
    inline: encoding === "php" ? ` ${key} ` : `${locator && command === "citation" ? `[${locator}]` : ""}[${prefix}${key}]`,
    definition: existing !== undefined ? undefined : encoding === "php" ? `*[${key}]: ${body}` : `[${prefix}${key}]: ${body}`,
  };
}

/** One undoable transaction inserts the inline reference and its supporting definition. */
export function insertInlineObject(state: EditorState, value: InlineInsertion, parse: (source: string) => PMNode) {
  const parsed = parse(value.inline + (value.definition ? "\n\n" + value.definition : ""));
  if (parsed.firstChild?.type.name !== "paragraph") throw new Error("Expected one inline object.");
  const tr = state.tr.replaceSelection(new Slice(parsed.firstChild.content, 0, 0));
  const definitions: PMNode[] = [];
  parsed.forEach((node, _offset, index) => { if (index) definitions.push(node.type.create({ ...node.attrs, sourceKey: null }, node.content, node.marks)); });
  if (definitions.length) tr.insert(tr.doc.content.size, Fragment.fromArray(definitions));
  // PHP abbreviation definitions are preserved in the document suffix, not block nodes.
  if (value.definition && parsed.attrs.sourceSuffix?.trim())
    tr.setDocAttribute("sourceSuffix", (state.doc.attrs.sourceSuffix || "") + "\n\n" + parsed.attrs.sourceSuffix.trim());
  return tr.scrollIntoView();
}
