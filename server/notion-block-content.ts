import { attributesXml, escapeXml } from "../src/document/notion-syntax.js";

type Json = Record<string, any>;
const attr = (values: Record<string, string>) => attributesXml(values).replace(/\r/g, "&#13;").replace(/\n/g, "&#10;");
const text = (value: unknown) => escapeXml(typeof value === "string" ? value : "").replace(/([\\`*_$\[\]~])/g, "\\$1").replace(/\r\n|\r|\n/g, "\\\n");

/** Public Block API rich text, expressed only with documented v2 carriers. */
export function notionRichText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts.map((part: Json) => {
    let value = text(part.text?.content ?? part.plain_text);
    if (part.type === "equation") value = `$${String(part.equation?.expression || "").replace(/\$/g, "\\$")}$`;
    else if (part.type === "mention") {
      const mention = part.mention || {}, kind = mention.type, target = mention[kind];
      if (kind === "date" && target?.start) {
        const dateAttrs: Record<string, string> = {};
        for (const key of ["start", "end"]) if (target[key]) {
          let raw = target[key];
          if (!target.time_zone && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(raw) && Number.isFinite(Date.parse(raw))) { raw = new Date(raw).toISOString(); dateAttrs["time-zone"] = "UTC"; }
          const match = /^(\d{4}-\d\d-\d\d)T(\d\d:\d\d)/.exec(raw);
          dateAttrs[key] = match ? match[1] : raw; if (match) dateAttrs[`${key}-time`] = match[2];
        }
        if (target.time_zone) dateAttrs["time-zone"] = target.time_zone;
        value = `<date${attr(dateAttrs)} />`;
      } else if (target?.id && ["page", "database", "user"].includes(kind)) {
        value = `<mention${attr({ url: kind === "user" ? `user://${target.id}` : `https://www.notion.so/${target.id}`, ...(kind === "database" ? { type: "database" } : {}) })}>${escapeXml(part.plain_text || "")}</mention>`;
      }
    } else if (part.annotations?.code) {
      const raw = String(part.text?.content ?? part.plain_text ?? "");
      const fence = "`".repeat(Math.max(0, ...[...raw.matchAll(/`+/g)].map(m => m[0].length)) + 1);
      value = `${fence} ${raw.replace(/\r?\n/g, " ")} ${fence}`;
    }
    const href = part.text?.link?.url || part.href;
    if (typeof href === "string" && part.type !== "mention") value = `[${value}](<${href.replace(/>/g, "%3E").replace(/[\r\n]/g, "")}>)`;
    for (const [key, tag] of [["bold", "b"], ["italic", "i"], ["strikethrough", "s"], ["underline", "u"]]) if (part.annotations?.[key]) value = `<${tag}>${value}</${tag}>`;
    const color = part.annotations?.color;
    if (color && color !== "default") value = `<span${attr({ color: color.replace(/_background$/, "_bg") })}>${value}</span>`;
    return value;
  }).join("");
}

/** Convert a readable public block; undefined means retain an honest placeholder. */
export function notionBlockContent(block: Json, children: string[], local: boolean): string | undefined {
  const kind = block.type, data = block[kind];
  if (!data || typeof data !== "object") return;
  if (["paragraph", "heading_1", "heading_2", "heading_3", "quote", "toggle", "bulleted_list_item", "numbered_list_item", "to_do", "callout", "code"].includes(kind) && !Array.isArray(data.rich_text)) return;
  const body = notionRichText(data.rich_text), nested = children.length ? `\n\n${children.join("\n\n")}` : "";
  const common: Record<string, string> = data.color && data.color !== "default" ? { color: String(data.color).replace(/_background$/, "_bg") } : {};
  const tag = (name: string, content: string, values: Record<string, string> = {}) => `<${name}${attr({ ...common, ...values })}>${content}</${name}>`;
  if (kind === "paragraph") return tag("p", body + nested);
  if (/^heading_[123]$/.test(kind)) return tag(data.is_toggleable ? "toggle" : `h${kind.at(-1)}`, body + nested, data.is_toggleable ? { heading: `h${kind.at(-1)}` } : {});
  if (kind === "quote" || kind === "toggle") return tag(kind, body + nested);
  if (kind === "bulleted_list_item" || kind === "numbered_list_item") return tag(kind === "numbered_list_item" ? "ol" : "ul", tag("li", body + nested));
  if (kind === "to_do") return tag("todo", body + nested, { checked: String(data.checked === true) });
  if (kind === "callout") return tag("callout", body + nested, data.icon?.type === "emoji" ? { icon: data.icon.emoji } : {});
  if (kind === "column_list" || kind === "column") return tag(kind === "column_list" ? "columns" : "column", children.join("\n\n"), kind === "column" && Number.isFinite(data.width_ratio) ? { ratio: String(data.width_ratio * 100) } : {});
  if (kind === "divider") return "---";
  if (kind === "table_of_contents") return `<table-of-contents${attr(common)} />`;
  if (kind === "equation") return tag("equation", escapeXml(data.expression || ""));
  if (kind === "code") {
    const code = Array.isArray(data.rich_text) ? data.rich_text.map((p: Json) => p.plain_text ?? p.text?.content ?? "").join("") : "";
    const fence = "`".repeat(Math.max(2, ...[...code.matchAll(/`+/g)].map(m => m[0].length)) + 1);
    // Code captions have no official v2 carrier. Keep them as adjacent readable text.
    const caption = notionRichText(data.caption);
    return `${fence}${String(data.language || "").replace(/[^\w+#.-]/g, "")}\n${code}\n${fence}${caption ? `\n\n<p>${caption}</p>` : ""}`;
  }
  if (kind === "table_row" && Array.isArray(data.cells)) return `<tr>${data.cells.map((cell: unknown) => `<td>${notionRichText(cell)}</td>`).join("")}</tr>`;
  if (kind === "table") return tag("table", children.join("\n"), { "header-row": String(data.has_column_header === true), "header-column": String(data.has_row_header === true) });
  if (["image", "file", "audio", "video", "pdf"].includes(kind)) {
    const url = data[data.type]?.url;
    if (typeof url === "string") return tag(kind, notionRichText(data.caption), { source: url });
  }
  if (["bookmark", "embed", "link_preview"].includes(kind) && typeof data.url === "string") return kind === "link_preview" ? `<link-preview${attr({ url: data.url })} />` : tag(kind, notionRichText(data.caption), { source: data.url });
  if (kind === "breadcrumb" && local) return "<breadcrumb/>";
  if (kind === "synced_block") return tag(data.synced_from ? "synced-block-reference" : "synced-block", children.join("\n\n"), { url: `https://www.notion.so/${data.synced_from?.block_id || block.id}` });
  if (kind === "template" && local && children.length) return `<button${attr({ label: Array.isArray(data.rich_text) ? data.rich_text.map((p: Json) => p.plain_text ?? p.text?.content ?? "").join("") || "Template" : "Template", actions: JSON.stringify([{ type: "insert-blocks", position: "below", content: children.join("\n\n") }]) })}/>`;
}
