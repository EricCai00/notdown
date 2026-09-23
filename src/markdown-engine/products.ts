import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type { Node as PMNode } from "prosemirror-model";
import multiTable from "markdown-it-multimd-table";
import { parse as parseYaml } from "yaml";
import { parseFragment } from "parse5";
import { editorSchema as schema } from "../document/editor-schema.js";
import { decodeCodeCaption } from "../document/code-caption.js";
import { enabled, type SyntaxConfig } from "./config.js";
import { readAttributes, slug, domAttributes } from "./attributes.js";
import { renderRawHtml } from "./html.js";
import { mmdMetadataKey, readMmdMetadata } from "./mmd-metadata.js";
import { pandocTitleValues } from "./metadata-editing";

type Environment = Record<string, any>;
const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();
const sourceBlock = (
  kind: string,
  raw: string,
  config: SyntaxConfig,
  data: unknown = {},
  html = "",
) => schema.nodes.syntax_block.create({ kind, raw, config, data, html });
const inlineNode = (
  kind: string,
  raw: string,
  label: string,
  title = "",
  target = "",
  html = "",
) =>
  schema.nodes.syntax_inline.create({ kind, raw, label, title, target, html });
export function metadataValues(raw: string, form = ""): Record<string, unknown> {
  try {
    if (form === "mmd") return readMmdMetadata(raw)?.values || {};
    if (form === "yaml" || (!form && raw.startsWith("---"))) {
      const value = parseYaml(
        raw.replace(/^---[^\n]*\n/, "").replace(/\n(?:---|\.\.\.)\s*$/, ""),
      );
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    }
    if (raw.startsWith("%")) return pandocTitleValues(raw);
    return readMmdMetadata(raw)?.values || {};
  } catch {
    return {};
  }
}

/** Product syntax operates on parser tokens, never on the document with a global replacement. */
export function installProductRules(
  md: MarkdownIt,
  config: SyntaxConfig,
  parse: (source: string, env: Environment) => PMNode,
) {
  if (config.variant === "typora") {
    // Runs only after the native link reader has failed to resolve a definition.
    md.inline.ruler.after("link", "typora_unresolved_reference", (s, silent) => {
      if ((s as typeof s & { linkLevel: number }).linkLevel > 0 || s.src[s.pos] !== "[") return false;
      const end = md.helpers.parseLinkLabel(s, s.pos, false);
      if (end < 0 || s.src[end + 1] !== "[") return false;
      const refEnd = md.helpers.parseLinkLabel(s, end + 1, true);
      if (refEnd < 0) return false;
      const label = s.src.slice(s.pos + 1, end);
      if (!label || label.startsWith("^")) return false;
      const reference = s.src.slice(end + 2, refEnd) || label;
      if (!silent) {
        const t = s.push("source_inline", "", 0);
        t.meta = { node: inlineNode("unresolved_reference", s.src.slice(s.pos, refEnd + 1), label, "Undefined reference: " + reference) };
      }
      s.pos = refEnd + 1;
      return true;
    });
  }
  if (enabled(config, "mmd_tables"))
    md.use(multiTable, {
      multiline: true,
      rowspan: true,
      headerless: false,
      multibody: true,
      autolabel: true,
    });
  md.block.ruler.before(
    "reference",
    "product_definitions",
    (s, start, end, silent) => {
      if (s.sCount[start] - s.blkIndent >= 4) return false;
      const line = s.getLines(start, start + 1, s.blkIndent, false).trimEnd();
      const special = /^\[([>#?])([^\]]+)\]:\s*(.*)$/.exec(line);
      if (
        special &&
        enabled(
          config,
          { ">": "mmd_abbreviations", "#": "mmd_citations", "?": "glossary" }[
            special[1]
          ]!,
        )
      ) {
        if (silent) return true;
        let last = start + 1,
          body = special[3];
        while (last < end && !s.isEmpty(last) && s.sCount[last] > s.blkIndent) {
          body += "\n" + s.getLines(last, last + 1, s.blkIndent, false).trim();
          last++;
        }
        s.env.productDefs ??= {};
        s.env.productDefs[special[1] + special[2]] = body;
        const raw = s.getLines(start, last, s.blkIndent, false).trimEnd(),
          token = s.push("source_node", "", 0);
        token.block = true;
        token.map = [start, last];
        token.meta = {
          node: sourceBlock(
            "definition",
            raw,
            config,
            { key: special[1] + special[2], body },
            `<dl id="md-def-${escape(slug(special[1] + special[2]))}"><dt>${escape(special[2])}</dt><dd>${md.renderInline(body, s.env)}</dd></dl>`,
          ),
        };
        s.line = last;
        return true;
      }
      const ref =
        /^\[([^\]]+)\]:\s*(\S+)(?:\s+"([^"]*)")?\s+(\{.*\}|[\w-]+=[\s\S]+)$/.exec(
          line,
        );
      if (
        ref &&
        (enabled(config, "attributes") || enabled(config, "link_attributes") ||
          enabled(config, "mmd_link_attributes"))
      ) {
        if (silent) return true;
        s.env.references ??= {};
        s.env.references[normalize(ref[1])] = {
          href: ref[2],
          title: ref[3] || "",
        };
        s.env.referenceAttrs ??= {};
        s.env.referenceAttrs[ref[2]] = readAttributes(ref[4]);
        // Reference definitions live in source gaps, matching the base reader's contract.
        s.line = start + 1;
        return true;
      }
      return false;
    },
  );
  md.block.ruler.before(
    "fence",
    "product_blocks",
    (s, start, end, silent) => {
      if (s.sCount[start] - s.blkIndent >= 4) return false;
      const line = s.getLines(start, start + 1, s.blkIndent, false).trimEnd();
      let last = start + 1,
        node: PMNode | undefined;
      const listStart = /^(\d+\.|[-+*])\s+(.*)$/.exec(line);
      if (enabled(config, "typora_loose_lists") && listStart) {
        const lines = [line];
        while (last < end) {
          const next = s
            .getLines(last, last + 1, s.blkIndent, false)
            .replace(/\n$/, "");
          if (!next.trim() || !/^(?:\d+\.|[-+*])\s|^\s+\S/.test(next)) break;
          lines.push(next);
          last++;
        }
        if (lines.some((v) => /^ {2}(?:\d+\.|[-+*])\s/.test(v))) {
          const items: PMNode[] = [];
          let at = 0;
          while (at < lines.length) {
            const first = /^(\d+\.|[-+*])\s+(.*)$/.exec(lines[at]);
            if (!first) break;
            at++;
            const continuation: string[] = [];
            while (at < lines.length && /^\s/.test(lines[at]))
              continuation.push(lines[at++].replace(/^ {2}/, ""));
            // Parse the list marker too, so task detection and inline rules use
            // the same path as a standalone list item.
            const head = parse(first[0], s.env).firstChild!.firstChild!;
            const body = continuation.length
              ? parse(continuation.join("\n"), s.env)
              : null;
            items.push(
              head.type.create(head.attrs, [
                ...head.content.content,
                ...(body?.content.content || []),
              ]),
            );
          }
          node = schema.nodes[
            /\d/.test(listStart[1]) ? "ordered_list" : "bullet_list"
          ].create(
            /\d/.test(listStart[1])
              ? { order: Number.parseInt(listStart[1]) }
              : null,
            items,
          );
        } else last = start + 1;
      }
      if (enabled(config, "comments") && line.trim() === "%%") {
        const tail = s.getLines(start, end, s.blkIndent, false),
          close = tail.indexOf("%%", 2);
        if (close < 0) return false;
        const raw = tail.slice(0, close + 2);
        last = start + raw.split("\n").length;
        // An inline comment followed by prose belongs to the inline reader.
        if (
          tail
            .slice(close + 2)
            .split("\n")[0]
            .trim()
        )
          return false;
        node = sourceBlock("comment", raw, config, {}, "");
      }
      const toc = /^(?:\[toc\]|\{\{TOC(?::(\d+)(?:-(\d+))?)?\}\})$/i.exec(
        line.trim(),
      );
      if (toc && enabled(config, "toc_directives") && (config.variant !== "typora" || line.trim().startsWith("[")) && (config.variant !== "markdown_mmd" || line.trim().startsWith("{{")))
        node = schema.nodes.table_of_contents.create({
          syntaxForm: line.trim().startsWith("{{") ? "mmd" : "directive",
          minLevel: Number(toc[1] || 1),
          maxLevel: Number(toc[2] || toc[1] || 6),
        });
      const include =
        /^(?:\{\{(?!TOC(?:[:}]|$))([^{}]+)\}\}|!\[\[([^\]]+)\]\])$/.exec(
          line.trim(),
        );
      if (include && enabled(config, "transclusion") && (config.variant !== "obsidian" || !!include[2]) && (config.variant !== "markdown_mmd" || !!include[1]))
        node = sourceBlock("transclusion", line, config, {
          path: include[1] || include[2],
        });
      const alert = /^>\s*\[!([\w-]+)\]([+-]?)(?:\s+(.*))?$/.exec(line);
      if (alert && enabled(config, "alerts") && (!["gfm", "typora", "commonmark_x", "markdown_github"].includes(config.variant) || (/^(NOTE|TIP|IMPORTANT|WARNING|CAUTION)$/.test(alert[1]) && !alert[2] && !alert[3]))) {
        const body: string[] = [];
        while (last < end) {
          const next = s.getLines(last, last + 1, s.blkIndent, false);
          if (!/^>/.test(next)) break;
          body.push(next.replace(/^> ?/, "").replace(/\n$/, ""));
          last++;
        }
        const inner = parse(body.join("\n"), s.env);
        node = schema.nodes.callout.create(
          { syntaxForm: "alert", icon: "", kind: alert[1], title: alert[3] || "", fold: alert[2] },
          inner.content,
        );
      }
      if (
        enabled(config, "tex_math_double_backslash") &&
        /^\\\\\[/.test(line)
      ) {
        const tail = s.getLines(start, end, s.blkIndent, false),
          close = tail.indexOf("\\\\]", 3);
        if (close >= 0) {
          const raw = tail.slice(0, close + 3);
          last = start + raw.split("\n").length;
          const value = raw.slice(3, -3).trim();
          node = schema.nodes.equation.create(
            { markdownAttrs: { mathDelimiter: "double" } },
            value ? schema.text(value) : null,
          );
        }
      }
      if (!node) return false;
      if (silent) return true;
      const token = s.push("source_node", "", 0);
      token.block = true;
      token.map = [start, last];
      token.meta = { node };
      s.line = last;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );

  md.core.ruler.before("inline", "product_prepare", (s) => {
    s.env.productDefs ??= {};
    s.env.productMeta ??= {};
    s.env.productHeadings ??= [];
    const ids = new Map<string, number>();
    for (let i = 0; i < s.tokens.length; i++) {
      const t = s.tokens[i];
      if (
        t.type === "source_node" &&
        t.meta?.node?.type.name === "opaque_block" &&
        t.meta.node.attrs.metadataForm &&
        enabled(config, "metadata_values")
      ) {
        const raw = t.meta.node.attrs.raw;
        const metadataForm = t.meta.node.attrs.metadataForm;
        const values = metadataValues(raw, metadataForm);
        if (!Object.keys(values).length) continue;
        Object.assign(s.env.productMeta, values);
        const node = sourceBlock("metadata", raw, config, s.env.productMeta);
        t.meta.node = node.type.create({ ...node.attrs, metadataForm });
      }
      if (t.type === "heading_open") {
        const content = s.tokens[i + 1];
        let attrs: Record<string, string> = {};
        const explicit = /\s+(\{[^{}]+\})\s*$/.exec(content.content);
        if (explicit && (enabled(config, "header_attributes") || enabled(config, "attributes"))) {
          attrs = readAttributes(explicit[1]);
          content.content = content.content
            .slice(0, explicit.index)
            .replace(/\s+#+\s*$/, "");
        }
        const mmd = /\s+\[([^\]]+)\]\s*#*\s*$/.exec(content.content);
        if (mmd && enabled(config, "mmd_header_identifiers")) {
          attrs.id = mmd[1];
          content.content = content.content.slice(0, mmd.index);
        }
        if (!attrs.id && enabled(config, "auto_identifiers")) {
          const base = slug(content.content),
            n = ids.get(base) || 0;
          ids.set(base, n + 1);
          attrs.id = base + (n ? "-" + n : "");
          attrs.generated = "true";
        }
        t.meta = { ...t.meta, markdownAttrs: attrs };
        if (attrs.id) {
          s.env.productHeadings.push({
            id: attrs.id,
            title: content.content,
            level: Number(t.tag.slice(1)),
          });
          if (enabled(config, "implicit_header_references")) {
            s.env.references ??= {};
            for (const key of [attrs.id, content.content])
              s.env.references[normalize(key)] = {
                href: "#" + attrs.id,
                title: "",
              };
          }
        }
      }
      if (t.type === "fence" && (enabled(config, "fenced_code_attributes") || enabled(config, "attributes"))) {
        const attr = /\{([^}]+)\}\s*$/.exec(t.info);
        if (attr && !attr[1].startsWith("=")) {
          const markdownAttrs = readAttributes(attr[0]);
          if (markdownAttrs.caption !== undefined)
            markdownAttrs.caption = decodeCodeCaption(markdownAttrs.caption);
          t.meta = { ...t.meta, markdownAttrs };
          t.info =
            t.info.slice(0, attr.index).trim() ||
            t.meta.markdownAttrs.class?.split(" ")[0] ||
            "";
        } else if (/^\.[\w-]+$/.test(t.info.trim())) {
          t.meta = {
            ...t.meta,
            markdownAttrs: { class: t.info.trim().slice(1) },
          };
          t.info = t.info.trim().slice(1);
        }
      }
    }
  });

  md.inline.ruler.before("escape", "product_inline", (s, silent) => {
    const rest = s.src.slice(s.pos);
    let match: RegExpExecArray | null = null,
      node: PMNode | undefined,
      consumed = 0;
    if (enabled(config, "comments") && (match = /^%%([\s\S]*?)%%/.exec(rest)))
      node = inlineNode("comment", match[0], "", match[1]);
    else if (
      enabled(config, "tex_math_double_backslash") &&
      (match = /^\\\\\(([\s\S]*?)\\\\\)/.exec(rest))
    )
      node = schema.nodes.inline_math.create({ value: match[1] });
    else if (
      enabled(config, "metadata_variables") &&
      (match = /^\[%([^\]]+)\]/.exec(rest))
    )
      node = inlineNode(
        "variable",
        match[0],
        String(
          s.env.productMeta?.[mmdMetadataKey(match[1])] ?? "Undefined: " + match[1],
        ),
      );
    else if (
      enabled(config, "transclusion") && config.variant !== "obsidian" &&
      (match = /^\{\{(?!TOC[:}])([^{}]+)\}\}/.exec(rest))
    )
      node = schema.nodes.syntax_inline.create({
        kind: "transclusion",
        raw: match[0],
        label: match[1],
        title: "Included file: " + match[1],
        config,
      });
    else if (
      (enabled(config, "mmd_abbreviations") || enabled(config, "glossary")) &&
      (match = /^\[([>?])(?:\(([^)]+)\)\s*([^\]]+)|([^\]]+))\]/.exec(rest)) &&
      enabled(config, match[1] === ">" ? "mmd_abbreviations" : "glossary")
    ) {
      const term = match[2] || match[4],
        body =
          match[3] || s.env.productDefs?.[match[1] + term] || "Undefined: " + term;
      if (match[3]) {
        s.env.productDefs ??= {};
        s.env.productDefs[match[1] + term] = body;
      }
      node = inlineNode(
        match[1] === ">" ? "abbreviation" : "glossary",
        match[0],
        term,
        body,
        match[1] === "?" ? "md-def-" + slug("?" + term) : "",
      );
    } else if (
      enabled(config, "mmd_citations") &&
      (match = /^(?:\[([^\]]*)\])?\[#([^\]]+)\](?:\[\])?/.exec(rest))
    ) {
      const locator = match[1] || "",
        key = match[2].replace(/;$/, "");
      const body = s.env.productDefs?.["#" + key];
      const inline = /\s/.test(key) && !body;
      const label = inline ? key : body || "Unresolved citation: " + key;
      node = inlineNode(
        "citation",
        match[0],
        locator === "Not cited"
          ? ""
          : "[" + (locator ? locator + ", " : "") + key + "]",
        label,
        body ? "md-def-" + slug("#" + key) : "",
      );
    }
    if (node && match) {
      if (!silent) {
        const t = s.push("source_inline", "", 0);
        t.meta = { node };
      }
      s.pos += match[0].length;
      return true;
    }
    if (
      enabled(config, "critic_markup") &&
      (match = /^\{(\+\+|--|==|>>|~~)([\s\S]*?)(\+\+|--|==|<<|~~)\}/.exec(rest))
    ) {
      const expected: Record<string, string> = {
        "++": "++",
        "--": "--",
        "==": "==",
        ">>": "<<",
        "~~": "~~",
      };
      if (expected[match[1]] !== match[3]) return false;
      const kind: Record<string, string> = {
        "++": "addition",
        "--": "deletion",
        "==": "highlight",
        ">>": "comment",
        "~~": "substitution",
      };
      let value = match[2],
        old = "";
      if (match[1] === "~~") {
        const split = value.indexOf("~>");
        if (split < 0) return false;
        old = value.slice(0, split);
        value = value.slice(split + 2);
      }
      if (!silent) {
        const t = s.push("critic_open", "span", 1);
        t.meta = { kind: kind[match[1]], old };
        s.tokens.push(...(s.md.parseInline(value, s.env)[0]?.children ?? []));
        s.push("critic_close", "span", -1);
      }
      s.pos += match[0].length;
      return true;
    }
    if (enabled(config, "highlight") && (match = /^==([^=\n]+)==/.exec(rest))) {
      if (!silent) {
        s.push("highlight_open", "mark", 1);
        s.tokens.push(...(s.md.parseInline(match[1], s.env)[0]?.children ?? []));
        s.push("highlight_close", "mark", -1);
      }
      s.pos += match[0].length;
      return true;
    }
    if (
      enabled(config, "short_subsuperscripts") &&
      (match = /^([~^])([\p{L}\p{N}]+)/u.exec(rest)) &&
      rest[match[0].length] !== match[1]
    ) {
      if (!silent) {
        const tag = match[1] === "~" ? "sub" : "sup";
        s.push(tag + "_open", tag, 1);
        s.push("text", "", 0).content = match[2];
        s.push(tag + "_close", tag, -1);
      }
      s.pos += match[0].length;
      return true;
    }
    if (
      enabled(config, "mmd_link_attributes") &&
      (match = /^(!?)\[([^\]]*)\]\((\S+)\s+"([^"]*)"\s+([\w-]+=[^)]+)\)/.exec(
        rest,
      ))
    ) {
      const attrs = readAttributes(match[5]);
      node = match[1]
        ? schema.nodes.image.create({
            src: match[3],
            alt: match[2],
            title: match[4],
            markdownAttrs: attrs,
          })
        : schema.text(match[2] || match[3], [
            schema.marks.link.create({
              href: match[3],
              title: match[4],
              markdownAttrs: attrs,
            }),
          ]);
      if (!silent) {
        const t = s.push("source_inline", "", 0);
        t.meta = { node };
      }
      s.pos += match[0].length;
      return true;
    }
    if (
      enabled(config, "raw_attribute") &&
      (match = /^(`+)([\s\S]*?)\1\{=([\w-]+)\}/.exec(rest))
    ) {
      if (!silent) {
        const t = s.push("source_inline", "", 0);
        t.meta = {
          node: inlineNode(
            "raw",
            match[0],
            match[3] === "html" ? "" : match[2],
            match[3],
            "",
            match[3] === "html" ? renderRawHtml(match[2]) : "",
          ),
        };
      }
      s.pos += match[0].length;
      return true;
    }
    return false;
  });

  md.core.ruler.after("inline", "product_project", (s) => {
    const tokens = s.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === "inline") {
        const children = t.children || [],
          stack: Token[] = [];
        for (let j = 0; j < children.length; j++) {
          const child = children[j];
          if (child.type === "link_open") stack.push(child);
          let target: Token | undefined =
            child.type === "image"
              ? child
              : child.type === "link_close"
                ? stack.pop()
                : undefined;
          if (
            target &&
            (enabled(config, "attributes") || enabled(config, "link_attributes") ||
              enabled(config, "mmd_link_attributes"))
          ) {
            const next = children[j + 1],
              m =
                next?.type === "text"
                  ? /^\{([^{}]+)\}/.exec(next.content)
                  : null;
            const attrs = {
              ...s.env.referenceAttrs?.[
                target.attrGet("href") || target.attrGet("src") || ""
              ],
              ...(m ? readAttributes(m[0]) : {}),
            };
            if (Object.keys(attrs).length)
              target.meta = { ...target.meta, markdownAttrs: attrs };
            if (m) next.content = next.content.slice(m[0].length);
          }
        }
      }
      let node: PMNode | undefined,
        last = i;
      const raw = t.map
        ? s.src.split("\n").slice(t.map[0], t.map[1]).join("\n")
        : t.content;
      if (t.type === "fence") {
        const language = t.info.trim().split(/\s/)[0];
        if (
          enabled(config, "diagrams") &&
          (config.variant === "obsidian" || config.variant === "gfm" ? ["mermaid"] : ["mermaid", "sequence", "flow"]).includes(language)
        )
          node = sourceBlock("diagram", raw, config, {
            language,
            code: t.content,
          });
        const format = /^\{=([\w-]+)\}$/.exec(t.info.trim());
        if (format && enabled(config, "raw_attribute"))
          node = sourceBlock(
            "raw",
            raw,
            config,
            { format: format[1], code: t.content },
            format[1] === "html"
              ? renderRawHtml(t.content)
              : `<pre>${escape(t.content)}</pre>`,
          );
      }
      if (t.type === "html_block") {
        const fragment = parseFragment(t.content);
        const element = fragment.childNodes.find((n) => "tagName" in n);
        if (element && "attrs" in element) {
          const attrs = Object.fromEntries(
            element.attrs.map((a) => [a.name, a.value]),
          );
          if (element.tagName === "iframe" && enabled(config, "html_embed"))
            node = sourceBlock("embed", raw, config, attrs);
          else if (enabled(config, "markdown_attribute") && attrs.markdown) {
            const inner = t.content
              .replace(/^\s*<[^>]+>/, "")
              .replace(/<\/[^>]+>\s*$/, "");
            node = sourceBlock(
              "html-markdown",
              raw,
              config,
              { tag: element.tagName, attrs },
              renderRawHtml(
                md.render(inner, {
                  ...s.env,
                  nativeDepth: (s.env.nativeDepth || 0) + 1,
                }),
              ),
            );
          }
        }
      }
      if (t.type === "paragraph_open" && enabled(config, "implicit_figures")) {
        const inline = tokens[i + 1];
        const parts = inline?.children?.filter(part => part.type !== "text" || part.content.trim());
        const attributeText = parts?.[1]?.type === "text" ? parts[1].content.trim() : "";
        const attributes = enabled(config, "link_attributes") && /^\{[^{}]+\}$/.test(attributeText)
          ? readAttributes(attributeText) : undefined;
        if (
          parts && (parts.length === 1 || parts.length === 2 && attributes) &&
          parts[0].type === "image" && !!parts[0].content.trim()
        ) {
          const img = parts[0];
          const extras = { ...s.env.referenceAttrs?.[img.attrGet("src") || ""], ...img.meta?.markdownAttrs, ...attributes };
          const imageAttrs = { ...Object.fromEntries(img.attrs || []), alt: extras.alt ?? img.content,
            ...domAttributes(extras) };
          const imageHtml = `<img ${Object.entries(imageAttrs).map(([key, value]) => `${key}="${escape(String(value))}"`).join(" ")}>`;
          node = sourceBlock(
            "figure",
            raw,
            config,
            {},
            renderRawHtml(
              `<figure>${imageHtml}<figcaption>${escape(img.content)}</figcaption></figure>`,
            ),
          );
          last = i + 2;
        }
      }
      if (node) {
        t.type = "source_node";
        t.nesting = 0;
        t.meta = { node };
        tokens.splice(i + 1, last - i);
      }
    }
  });
}
