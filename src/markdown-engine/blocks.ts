import type MarkdownIt from "markdown-it";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import deflist from "markdown-it-deflist";
import { enabled, markdownFamily, type SyntaxConfig } from "./config.js";

const line = (s: StateBlock, n: number) =>
  s.src.slice(s.bMarks[n] + s.tShift[n], s.eMarks[n]);
const alternatives = { alt: ["paragraph", "reference", "blockquote", "list"] };
/** Rules run inside the Markdown parser, so fenced/indented code remains literal. */
export function installMarkdownBlocks(md: MarkdownIt, config: SyntaxConfig) {
  const divOpening = (text: string) => {
    const match =
      /^(:{3,})[ \t]*(\{[^\r\n]*\}|[A-Za-z][\w-]*)[ \t]*(?::+)?[ \t]*$/.exec(
        text,
      );
    if (!match || /^(nest|columns|column|children|endnest)$/.test(match[2]))
      return null;
    return !markdownFamily(config) && text.trimEnd().endsWith(":")
      ? null
      : match;
  };
  if (enabled(config, "definition_lists")) md.use(deflist);
  if (enabled(config, "footnotes")) {
    md.block.ruler.before(
      "reference",
      "native_footnote",
      (s, start, end, silent) => {
        if (s.sCount[start] - s.blkIndent >= 4) return false;
        const first = /^\[\^([^\s\[\]^]+)\]:[ \t]*(.*)$/.exec(line(s, start));
        if (!first) return false;
        if (silent) return true;
        let finish = start + 1,
          last = finish;
        while (finish < end) {
          if (s.isEmpty(finish)) {
            finish++;
            continue;
          }
          if (s.sCount[finish] < s.blkIndent + 4) break;
          last = ++finish;
        }
        const raw =
          first[2] + "\n" + s.getLines(start + 1, last, s.blkIndent + 4, false);
        const open = s.push("footnote_open", "aside", 1);
        open.block = true;
        open.map = [start, last];
        open.meta = { label: first[1], body: raw };
        (s.env.nativeFootnoteLabels ??= new Set<string>()).add(first[1]);
        // Nested blocks are parsed with the same active reader after inline processing.
        const close = s.push("footnote_close", "aside", -1);
        close.block = true;
        s.line = last;
        return true;
      },
      alternatives,
    );
    md.inline.ruler.before("link", "native_footnote_ref", (s, silent) => {
      const match = /^\[\^([^\s\[\]^]+)\]/.exec(s.src.slice(s.pos));
      if (!match) return false;
      if (config.variant === "typora" && !s.env.nativeFootnoteLabels?.has(match[1])) return false;
      if (!silent) {
        const t = s.push("footnote_reference", "", 0);
        t.meta = { label: match[1] };
      }
      s.pos += match[0].length;
      return true;
    });
  }
  if (enabled(config, "line_blocks"))
    md.block.ruler.before(
      "paragraph",
      "native_lines",
      (s, start, end, silent) => {
        if (
          s.sCount[start] - s.blkIndent >= 4 ||
          !/^\|(?: |$)/.test(line(s, start))
        )
          return false;
        // A valid pipe table has precedence over a line block.
        if (
          enabled(config, "pipe_tables") &&
          start + 1 < end &&
          /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$/.test(
            line(s, start + 1),
          )
        )
          return false;
        let finish = start;
        const values: string[] = [];
        while (finish < end) {
          const text = line(s, finish);
          if (/^\|(?: |$)/.test(text)) {
            values.push(text.slice(text.startsWith("| ") ? 2 : 1));
            finish++;
          } else if (
            values.length &&
            !s.isEmpty(finish) &&
            s.sCount[finish] > s.blkIndent
          ) {
            values[values.length - 1] += " " + text.trim();
            finish++;
          } else break;
        }
        if (silent) return true;
        const open = s.push("line_block_open", "div", 1);
        open.map = [start, finish];
        open.block = true;
        for (const value of values) {
          const t = s.push("inline", "", 0);
          t.content = value;
          t.children = [];
        }
        s.push("line_block_close", "div", -1);
        s.line = finish;
        return true;
      },
    );
  if (enabled(config, "fenced_divs"))
    md.block.ruler.before(
      "fence",
      "native_div",
      (s, start, end, silent) => {
        const opening = divOpening(line(s, start));
        if (markdownFamily(config) && s.parentType === "paragraph")
          return false;
        if (
          s.sCount[start] - s.blkIndent >= 4 ||
          !opening ||
          /^(nest|columns|column|children|endnest)$/.test(opening[2])
        )
          return false;
        if (silent) return true;
        let finish = start + 1,
          depth = 1,
          fence = "";
        for (; finish < end; finish++) {
          if (s.sCount[finish] - s.blkIndent >= 4) continue;
          const text = line(s, finish),
            code = /^(`{3,}|~{3,})(.*)$/.exec(text);
          if (fence) {
            if (
              code &&
              code[1][0] === fence[0] &&
              code[1].length >= fence.length &&
              !code[2].trim()
            )
              fence = "";
            continue;
          }
          if (
            code &&
            (!markdownFamily(config) ||
              enabled(
                config,
                code[1][0] === "`"
                  ? "backtick_code_blocks"
                  : "fenced_code_blocks",
              ))
          ) {
            fence = code[1];
            continue;
          }
          if (/^:{3,}[ \t]*$/.test(text)) {
            if (--depth === 0) break;
          } else if (divOpening(text)) depth++;
        }
        const closed = finish < end,
          last = closed ? finish + 1 : end;
        const open = s.push("fenced_div_open", "div", 1);
        open.map = [start, last];
        open.block = true;
        open.meta = {
          attributes: opening[2],
          body: s.getLines(start + 1, finish, s.blkIndent, false),
          closed,
        };
        s.push("fenced_div_close", "div", -1);
        s.line = last;
        return true;
      },
      alternatives,
    );
}
