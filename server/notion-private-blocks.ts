import { attributesXml, escapeXml } from "../src/document/notion-syntax.js";
import { notionRichText } from "./notion-block-content.js";
import type { CachedNotionBlock, NotionCacheSnapshot } from "./notion-desktop-cache.js";

type Json = Record<string, any>;
const attributes = (values: Record<string, string>) => attributesXml(values).replace(/\r/g, "&#13;").replace(/\n/g, "&#10;");
const tag = (name: string, body: string, values: Record<string, string> = {}) => `<${name}${attributes(values)}>${body}</${name}>`;

/** An edit minute is the strongest comparison available for minute-only public timestamps. */
export function matchesNotionCache(api: Json, cached: CachedNotionBlock): boolean {
  const edited = Date.parse(api.last_edited_time);
  return api.object === "block" && api.id === cached.id && !api.archived && !api.in_trash &&
    Number.isFinite(edited) && Number.isFinite(cached.lastEdited) &&
    (edited % 60000 ? edited === cached.lastEdited : Math.floor(edited / 60000) === Math.floor(cached.lastEdited / 60000));
}

/** Internal rich text is deliberately a small, checked vocabulary. Unknown marks fail closed. */
export function cachedNotionText(value: unknown): string | undefined {
  if (!Array.isArray(value)) return;
  const output: string[] = [];
  for (const part of value) {
    if (!Array.isArray(part) || typeof part[0] !== "string" || part.length > 2 || part[1] !== undefined && !Array.isArray(part[1])) return;
    const marks = part[1] || [];
    let text = notionRichText([{ type: "text", text: { content: part[0] } }]);
    if (marks.some((mark: any) => Array.isArray(mark) && mark[0] === "c")) {
      if (/[\r\n]/.test(part[0])) return;
      const fence = "`".repeat(Math.max(0, ...[...part[0].matchAll(/`+/g)].map(m => m[0].length)) + 1);
      text = `${fence} ${part[0]} ${fence}`;
    }
    for (const mark of marks) {
      if (!Array.isArray(mark)) return;
      if (["b", "i", "s", "_"].includes(mark[0]) && mark.length === 1) text = tag(mark[0] === "_" ? "u" : mark[0], text);
      else if (mark[0] === "c" && mark.length === 1) continue;
      else if (mark[0] === "h" && mark.length === 2 && typeof mark[1] === "string" && /^(?:gray|brown|orange|yellow|green|blue|purple|pink|red)(?:_background)?$/.test(mark[1])) text = tag("span", text, { color: mark[1].replace(/_background$/, "_bg") });
      else if (mark[0] === "a" && mark.length === 2 && typeof mark[1] === "string" && /^https?:\/\/[^\s<>]+$/.test(mark[1])) text = `[${text}](<${mark[1]}>)`;
      else return;
    }
    output.push(text);
  }
  return output.join("");
}

/** Convert an entire owned subtree, or retain the source placeholder; never drop a child. */
export function cachedNotionContent(root: CachedNotionBlock, records: ReadonlyMap<string, CachedNotionBlock>): string | undefined {
  const visited = new Set<string>();
  const render = (block: CachedNotionBlock, depth: number): string | undefined => {
    if (depth > 30 || visited.has(block.id) || visited.size >= 1000) return;
    visited.add(block.id);
    const children: string[] = [];
    for (const id of block.content || []) {
      const child = records.get(id);
      if (!child || child.parentId !== block.id || child.parentTable !== "block") return;
      const result = render(child, depth + 1);
      if (result === undefined) return;
      children.push(result);
    }
    if (block === root) return children.join("\n\n");
    const title = cachedNotionText(block.properties.title || []);
    if (title === undefined) return;
    const body = title + (children.length ? `\n\n${children.join("\n\n")}` : "");
    const names: Record<string, string> = { text: "p", header: "h1", sub_header: "h2", sub_sub_header: "h3", header_4: "h4", quote: "quote", toggle: "toggle", callout: "callout" };
    const color = block.format?.block_color;
    const attrs: Record<string, string> = {};
    if (color && color !== "default") {
      if (!/^(?:gray|brown|orange|yellow|green|blue|purple|pink|red)(?:_background)?$/.test(color)) return;
      attrs.color = color.replace(/_background$/, "_bg");
    }
    if (names[block.type]) {
      if (block.format?.toggleable && /^h[1-4]$/.test(names[block.type])) return tag("toggle", body, { ...attrs, heading: names[block.type] });
      if (block.type === "callout" && typeof block.format?.page_icon === "string") attrs.icon = block.format.page_icon;
      return tag(names[block.type], body, attrs);
    }
    if (block.type === "bulleted_list" || block.type === "numbered_list") return tag(block.type === "bulleted_list" ? "ul" : "ol", tag("li", body, attrs));
    if (block.type === "to_do") return tag("todo", body, { ...attrs, checked: String(block.properties.checked?.[0]?.[0] === "Yes") });
    if (block.type === "divider" && !title && !children.length) return "---";
    if (block.type === "equation" && !children.length) return tag("equation", escapeXml((block.properties.title || []).map((part: any) => part[0]).join("")), attrs);
    if (block.type === "code" && !children.length && (block.properties.title || []).every((part: any) => part.length === 1)) {
      const code = (block.properties.title || []).map((part: any) => part[0]).join("");
      const fence = "`".repeat(Math.max(2, ...[...code.matchAll(/`+/g)].map((m: RegExpMatchArray) => m[0].length)) + 1);
      const language = block.properties.language?.[0]?.[0] || "";
      if (typeof language !== "string" || /[^\w+#.-]/.test(language) || block.properties.caption) return;
      return `${fence}${language}\n${code}\n${fence}`;
    }
  };
  return render(root, 0);
}

export function recoverCachedNotionBlock(api: Json, snapshot: NotionCacheSnapshot) {
  const warnings: string[] = [];
  const records = new Map((snapshot.privateBlocks || []).map(block => [block.id, block]));
  if (records.size !== snapshot.privateBlocks?.length) return { warnings };
  const cached = records.get(api.id);
  const kind = api.type === "unsupported" ? api.unsupported?.block_type : api.type;
  if (!cached || cached.type !== kind || !matchesNotionCache(api, cached)) return { warnings };
  if (kind === "button") {
    warnings.push(`Button ${api.id}: ${typeof cached.format?.automation_id === "string" ? "its desktop cache contains an automation pointer, but " : ""}no verified action definition is available; the source placeholder was retained.`);
    return { warnings };
  }
  if (kind !== "ai_block") return { warnings };
  const configuration = cached.format?.ai_block_configuration_menu;
  if (configuration?.type !== "custom" || configuration.version !== 3 || Object.keys(configuration).some(key => !["type", "version", "autofillInstructions"].includes(key))) {
    warnings.push(`AI block ${api.id}: unrecognized configuration; source was retained for review.`);
    return { warnings };
  }
  const promptParts = configuration.autofillInstructions ?? [];
  // Prompt mentions need context mapping; do not silently turn them into plain text.
  if (!Array.isArray(promptParts) || promptParts.some(part => !Array.isArray(part) || part.length !== 1 || typeof part[0] !== "string")) {
    warnings.push(`AI block ${api.id}: prompt mentions or formatting require review; source was retained.`);
    return { warnings };
  }
  const body = cachedNotionContent(cached, records);
  if (body === undefined) {
    warnings.push(`AI block ${api.id}: cached output has missing, cyclic or unsupported content; source was retained.`);
    return { warnings };
  }
  const source = `<ai-block${attributes({ prompt: promptParts.map(part => part[0]).join(""), generate: "custom", using: "current-page" })}>\n${body || "<p />"}\n</ai-block>`;
  const adopted: CachedNotionBlock[] = [];
  const collect = (block: CachedNotionBlock) => { adopted.push(block); for (const id of block.content || []) collect(records.get(id)!); };
  collect(cached);
  warnings.push(`AI block ${api.id}: restored prompt and output from a matching desktop cache snapshot. Generate uses the locally configured service and current page; Notion AI execution and automatic updates are not transferred.`);
  return { source, warnings, evidence: { blockId: api.id, source: "Notion desktop SQLite cache", blocks: adopted } };
}
