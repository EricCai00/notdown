import type MarkdownIt from "markdown-it";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import fence from "markdown-it/lib/rules_block/fence.mjs";
import blockquote from "markdown-it/lib/rules_block/blockquote.mjs";
import list from "markdown-it/lib/rules_block/list.mjs";
import escape from "markdown-it/lib/rules_inline/escape.mjs";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import abbr from "markdown-it-abbr";
import { full as emoji } from "markdown-it-emoji";
import { enabled, markdownFamily, commandEnabled, type SyntaxConfig } from "./config.js";
import { editorSchema as schema } from "../editor-schema.js";
import { readMmdMetadata } from "./mmd-metadata.js";

const textAt = (s: StateBlock, n: number) =>
  s.src.slice(s.bMarks[n] + s.tShift[n], s.eMarks[n]);

/** Pandoc's markdown* family and CommonMark family have different base rules.
 * Keep the adaptations in parser rules; never rewrite the source before parsing. */
export function installDialectRules(md: MarkdownIt, config: SyntaxConfig) {
  if (enabled(config, "smart")) md.enable(["replacements", "smartquotes"]);
  if (enabled(config, "subscript")) md.use(sub);
  if (enabled(config, "superscript")) md.use(sup);
  if (enabled(config, "abbreviations")) md.use(abbr);
  if (enabled(config, "emoji")) md.use(emoji, { shortcuts: {} });

  md.block.ruler.before("fence", "native_metadata", (s, start, end, silent) => {
    if (
      start !== 0 ||
      s.env.nativeDepth > 0 ||
      s.blkIndent !== 0 ||
      s.parentType === "list" ||
      s.parentType === "blockquote"
    )
      return false;
    const first = s.src.slice(s.bMarks[start], s.eMarks[start]);
    let finish = start;
    let metadataForm = "";
    const preferMmd = enabled(config, "mmd_title_block") &&
      (first !== "---" || config.variant === "markdown_mmd" || !enabled(config, "yaml_metadata_block"));
    const mmd = preferMmd ? readMmdMetadata(s.src) : null;
    if (mmd) {
      finish = Math.min(mmd.endLine, end);
      metadataForm = "mmd";
    } else if (preferMmd && first === "---") return false;
    else if (enabled(config, "yaml_metadata_block") && first === "---") {
      metadataForm = "yaml";
      for (finish = start + 1; finish < end; finish++)
        if (/^(---|\.\.\.)\s*$/.test(textAt(s, finish))) break;
      if (finish === end) return false;
      // A Setext heading is not a metadata mapping. Leave it to the base reader.
      if (!/^[\w\p{L}][^\n]*:/mu.test(s.getLines(start + 1, finish, 0, false)))
        return false;
      finish++;
    } else if (
      enabled(config, "pandoc_title_block") &&
      /^%($|\s)/.test(first)
    ) {
      metadataForm = "pandoc";
      let fields = 0;
      while (finish < end) {
        const text = s.src.slice(s.bMarks[finish], s.eMarks[finish]);
        if (/^%($|\s)/.test(text)) { if (fields === 3) break; fields++; }
        else if (!/^\s+\S/.test(text)) break;
        finish++;
      }
    } else return false;
    if (silent) return true;
    const token = s.push("source_node", "", 0);
    token.map = [start, finish];
    token.block = true;
    token.meta = {
      node: schema.nodes.opaque_block.create({
        metadataForm,
        raw: s.getLines(start, finish, 0, false).replace(/\n$/, ""),
      }),
    };
    s.line = finish;
    return true;
  });

  if (!markdownFamily(config)) return;
  // Pandoc's legacy list-interruption rule also recognizes definition markers
  // when definition_lists itself is disabled (notably markdown_github).
  if (
    enabled(config, "lists_without_preceding_blankline") &&
    !enabled(config, "definition_lists")
  )
    md.block.ruler.before(
      "paragraph",
      "legacy_definition_boundary",
      (s, start, _end, silent) =>
        !!silent &&
        s.parentType === "paragraph" &&
        /^[:~][ \t]+/.test(textAt(s, start)),
      { alt: ["paragraph"] },
    );
  md.block.ruler.at(
    "fence",
    (s, start, end, silent) => {
      const marker = textAt(s, start)[0];
      if (marker === "`" && !enabled(config, "backtick_code_blocks"))
        return false;
      if (marker === "~" && !enabled(config, "fenced_code_blocks"))
        return false;
      return fence(s, start, end, silent);
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );
  md.block.ruler.at(
    "heading",
    (s, start, _end, silent) => {
      if (s.sCount[start] - s.blkIndent >= 4) return false;
      if (
        s.parentType === "paragraph" &&
        enabled(config, "blank_before_header")
      )
        return false;
      const match = /^(#{1,6})(?!#)(.*)$/.exec(textAt(s, start));
      if (
        !match ||
        (enabled(config, "space_in_atx_header") &&
          match[2] &&
          !/^[ \t]/.test(match[2]))
      )
        return false;
      if (silent) return true;
      const level = match[1].length;
      const opening = s.push("heading_open", "h" + level, 1);
      opening.markup = match[1];
      opening.map = [start, start + 1];
      const content = s.push("inline", "", 0);
      content.content = match[2].replace(/[ \t]+#+[ \t]*$/, "").trim();
      content.map = [start, start + 1];
      content.children = [];
      s.push("heading_close", "h" + level, -1).markup = match[1];
      s.line = start + 1;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote"] },
  );
  md.block.ruler.at(
    "blockquote",
    (s, start, end, silent) => {
      if (
        s.parentType === "paragraph" &&
        enabled(config, "blank_before_blockquote")
      )
        return false;
      return blockquote(s, start, end, silent);
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );
  md.block.ruler.at(
    "list",
    (s, start, end, silent) => {
      if (!commandEnabled(config, "ordered_parenthesis") && /^\d+\)[ \t]/.test(textAt(s, start)))
        return false;
      if (
        s.parentType === "paragraph" &&
        s.sCount[start] >= s.blkIndent &&
        !enabled(config, "lists_without_preceding_blankline")
      )
        return false;
      const before = s.tokens.length;
      if (enabled(config, "four_space_rule")) {
        for (let line = start + 1; line < end; line++) {
          if (s.isEmpty(line - 1) && !s.isEmpty(line) && s.sCount[line] > s.blkIndent && s.sCount[line] < s.blkIndent + 4) { end = line; break; }
        }
      }
      const result = list(s, start, end, silent);
      if (result && !silent && !enabled(config, "startnum"))
        for (const token of s.tokens.slice(before))
          if (token.type === "ordered_list_open") token.attrSet("start", "1");
      return result;
    },
    { alt: ["paragraph", "reference", "blockquote"] },
  );
  md.inline.ruler.at("escape", (s, silent) => {
    if (s.src[s.pos] !== "\\") return false;
    const next = s.src[s.pos + 1];
    const allowed =
      next === "\n"
        ? enabled(config, "escaped_line_breaks")
        : enabled(config, "all_symbols_escapable") ||
          (config.variant === "markdown_phpextra" && ":|".includes(next ?? "\u0000")) ||
          (config.variant === "typora"
            ? "\\`*_{}[]()<>#+-.!$=^|~"
            : "\\`*_{}[]()>#+-.!"
          ).includes(next ?? "\u0000");
    if (allowed) return escape(s, silent);
    if (!silent) s.push("text", "", 0).content = "\\";
    s.pos++;
    return true;
  });
  if (!enabled(config, "intraword_underscores"))
    md.inline.ruler.before("emphasis", "native_intraword", (s, silent) => {
      if (s.src[s.pos] !== "_" || !/[\p{L}\p{N}]/u.test(s.src[s.pos - 1] ?? ""))
        return false;
      const match = /^(_{1,2})([^_\n]+)\1(?=[\p{L}\p{N}])/u.exec(
        s.src.slice(s.pos),
      );
      if (!match) return false;
      if (!silent) {
        const name = match[1].length === 2 ? "strong" : "em";
        s.push(name + "_open", name, 1);
        s.tokens.push(...(s.md.parseInline(match[2], s.env)[0]?.children ?? []));
        s.push(name + "_close", name, -1);
      }
      s.pos += match[0].length;
      return true;
    });
}

/** New/edited code must use a spelling accepted by the active reader. */
export function dialectCodeBlock(
  node: import("prosemirror-model").Node,
  config: SyntaxConfig,
): string {
  const backticks =
    !markdownFamily(config) || enabled(config, "backtick_code_blocks");
  const tildes =
    !markdownFamily(config) || enabled(config, "fenced_code_blocks");
  if (!backticks && !tildes)
    return node.textContent
      .split("\n")
      .map((line) => "    " + line)
      .join("\n");
  const params = String(node.attrs.params || "").replace(/[\r\n]/g, "");
  const character = backticks && (!params.includes("`") || !tildes) ? "`" : "~";
  const longest = Math.max(
    2,
    ...[...node.textContent.matchAll(character === "`" ? /`+/g : /~+/g)].map(
      (m) => m[0].length,
    ),
  );
  const fence = character.repeat(longest + 1);
  return (
    fence +
    (character === "`" ? params.replace(/`/g, "") : params) +
    "\n" +
    node.textContent +
    "\n" +
    fence
  );
}
