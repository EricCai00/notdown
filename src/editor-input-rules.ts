import { Fragment } from "prosemirror-model";
import { EditorState, type Transaction } from "prosemirror-state";
import {
  InputRule,
  inputRules,
  wrappingInputRule,
} from "prosemirror-inputrules";
import { wrapInList } from "prosemirror-schema-list";
import { editorSchema as schema } from "./editor-schema.js";
import { convertListItem } from "./editor-convert.js";

export function itemAtSelection(state: EditorState) {
  for (let depth = state.selection.$from.depth; depth > 0; depth--) {
    if (state.selection.$from.node(depth).type === schema.nodes.list_item) {
      return {
        node: state.selection.$from.node(depth),
        pos: state.selection.$from.before(depth),
        depth,
      };
    }
  }
  return null;
}

/** The final input has not yet been inserted when an InputRule runs. Insert
 * that suffix first, preserving the existing inline nodes instead of replacing
 * the match with newly created plain text. Composition-end may have no suffix. */
function materializeMatch(
  state: EditorState,
  match: RegExpMatchArray,
  start: number,
  end: number,
): Transaction | null {
  const from = Math.max(start, Math.min(state.selection.from, end));
  const existing = state.doc.textBetween(start, from, "", "\ufffc");
  if (!match[0].startsWith(existing)) return null;
  return state.tr.insertText(match[0].slice(existing.length), from, end);
}

function markInputRule(expression: RegExp, name: string): InputRule {
  return new InputRule(
    expression,
    (state, match, start, end) => {
      const content = match[1];
      if (!content) return null;
      const tr = materializeMatch(state, match, start, end);
      if (!tr) return null;
      const contentStart = start + match[0].indexOf(content);
      const contentEnd = contentStart + content.length;
      if (name === "code") {
        let onlyText = true;
        tr.doc.nodesBetween(contentStart, contentEnd, (node) => {
          if (node.isInline && !node.isText) onlyText = false;
        });
        if (!onlyText) return null;
      }
      tr.delete(contentEnd, start + match[0].length);
      tr.delete(start, contentStart);
      tr.addMark(start, start + content.length, schema.marks[name].create());
      tr.removeStoredMark(schema.marks[name]);
      return tr;
    },
    { inCodeMark: false },
  );
}

function appendTransaction(target: Transaction, change: Transaction): void {
  for (const step of change.steps) target.step(step);
  target.setSelection(change.selection.getBookmark().resolve(target.doc));
}

function blockTypeRule(
  expression: RegExp,
  type: "heading" | "code_block",
): InputRule {
  return new InputRule(
    expression,
    (state, match, start, end) => {
      const tr = state.tr.delete(start, end);
      // Use the same item conversion as the menu. A nested item becomes a
      // sibling block inside its existing parent instead of moving to the root.
      const next = state.apply(tr);
      const item = itemAtSelection(next);
      if (item && next.selection.$from.index(item.depth) === 0) {
        const converted = convertListItem(
          next,
          type === "heading" ? "heading1" : "code",
        );
        if (!converted) return null;
        appendTransaction(tr, converted);
      }
      const position = tr.selection.from;
      const $position = tr.doc.resolve(position);
      const target = schema.nodes[type];
      if (
        !$position
          .node(-1)
          .canReplaceWith($position.index(-1), $position.indexAfter(-1), target)
      )
        return null;
      return tr.setBlockType(
        position,
        position,
        target,
        type === "heading" ? { level: match[1].length } : { params: match[1] },
      );
    },
    { inCodeMark: false },
  );
}

export function markdownRules() {
  const { paragraph, blockquote, bullet_list, ordered_list, page_link } =
    schema.nodes;
  return inputRules({
    rules: [
      new InputRule(
        /(?<!\\)\[\[([^\[\]\n]+)\]\]$/,
        (state, match, start, end) => {
          if (/\ufffc/.test(match[1])) return null;
          const separator = match[1].indexOf("|");
          const target = (
            separator < 0 ? match[1] : match[1].slice(0, separator)
          ).trim();
          const label =
            separator < 0 ? target : match[1].slice(separator + 1).trim();
          if (!target || /[\u0000-\u001f\u007f]/.test(target)) return null;
          return state.tr.replaceWith(
            start,
            end,
            page_link.create(
              { target, label },
              null,
              state.doc.resolve(start).marks(),
            ),
          );
        },
        { inCodeMark: false },
      ),
      new InputRule(
        /(?<![\\!\[])\[([^\]\n]+)\]\(((?:[^\s()]|\([^\s()]*\))+)(?: "([^"\n]*)")?\)$/,
        (state, match, start, end) => {
          const href = match[2].replace(/^<|>$/g, "");
          if (
            /^(?:javascript|vbscript|data):/i.test(href) ||
            /[\u0000-\u001f\u007f]/.test(href)
          )
            return null;
          const tr = materializeMatch(state, match, start, end);
          if (!tr) return null;
          const labelStart = start + 1;
          const labelEnd = labelStart + match[1].length;
          let nestedPage = false;
          tr.doc.nodesBetween(labelStart, labelEnd, (node) => {
            if (node.type === page_link) nestedPage = true;
          });
          if (nestedPage) return null;
          tr.delete(labelEnd, start + match[0].length).delete(
            start,
            labelStart,
          );
          tr.addMark(
            start,
            start + match[1].length,
            schema.marks.link.create({ href, title: match[3] ?? null }),
          );
          tr.removeStoredMark(schema.marks.link);
          return tr;
        },
        { inCodeMark: false },
      ),
      markInputRule(/(?<!\\)\*\*([^*]+)\*\*$/, "strong"),
      markInputRule(/(?<!\\)__([^_]+)__$/, "strong"),
      markInputRule(/(?<![\\*])\*([^*]+)\*$/, "em"),
      markInputRule(/(?<!\\)`([^`]+)`$/, "code"),
      markInputRule(/(?<!\\)~~([^~]+)~~$/, "strike"),
      new InputRule(
        /^(?:[-+*] )?\[([ xX]?)\] $/,
        (state, match, start, end) => {
          const tr = state.tr.delete(start, end);
          const checked = match[1].toLowerCase() === "x";
          const item = itemAtSelection(state);
          if (item)
            return tr.setNodeMarkup(item.pos, undefined, {
              ...item.node.attrs,
              checked,
            });
          let wrapped: Transaction | undefined;
          if (
            !wrapInList(bullet_list)(state.apply(tr), (change) => {
              wrapped = change;
            }) ||
            !wrapped
          )
            return null;
          appendTransaction(tr, wrapped);
          const result = itemAtSelection(state.apply(tr));
          if (!result) return null;
          return tr.setNodeMarkup(result.pos, undefined, {
            ...result.node.attrs,
            checked,
          });
        },
        { inCodeMark: false },
      ),
      wrappingInputRule(/^\s*([-+*]) $/, bullet_list),
      wrappingInputRule(
        /^(\d+)[.)] $/,
        ordered_list,
        (match) => ({ order: Number(match[1]) }),
        (match, node) =>
          node.childCount + node.attrs.order === Number(match[1]),
      ),
      wrappingInputRule(/^> $/, blockquote),
      blockTypeRule(/^(#{1,6}) $/, "heading"),
      blockTypeRule(/^```([a-zA-Z0-9_-]*) $/, "code_block"),
      new InputRule(/^---$/, (state, _match, start, end) => {
        const $from = state.doc.resolve(start);
        if (
          $from.depth !== 1 ||
          !state.selection.empty ||
          state.selection.$from.parentOffset !== $from.parent.content.size
        )
          return null;
        return state.tr.replaceWith(
          $from.before(),
          $from.after(),
          Fragment.fromArray([
            schema.nodes.horizontal_rule.create(),
            paragraph.create(),
          ]),
        );
      }),
    ],
  });
}
