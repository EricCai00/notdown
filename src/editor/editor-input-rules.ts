import { editorNodeType, isEditorKind } from "../document/node-identity";
import { isListItem } from "../document/list-items";
import { Fragment, type Node as PMNode } from "prosemirror-model";
import { EditorState, NodeSelection, TextSelection, type Command, type Transaction } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import {
  InputRule,
  inputRules,
  wrappingInputRule,
} from "prosemirror-inputrules";
import { wrapInList } from "prosemirror-schema-list";
import { wrapIn } from "prosemirror-commands";
import { editorSchema as schema } from "../document/editor-schema.js";
import { convertListItem } from "./editor-convert.js";
import { inTableCell } from "./editor-table.js";
import { codeInputMode, lastCodeLanguage, rememberCodeLanguage, type CodeInputMode } from "./code-input-preferences";
import { codeLanguage } from "./code-languages";
import { inlineSyntaxRules, materializeInlineMatch, type InlineSyntaxCodec } from "./inline-syntax-input";

export function itemAtSelection(state: EditorState) {
  for (let depth = state.selection.$from.depth; depth > 0; depth--) {
    if (isEditorKind(state.selection.$from.node(depth), "table_cell")) return null;
    if (isListItem(state.selection.$from.node(depth))) {
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
  return materializeInlineMatch(state, match, start, end);
}

function markInputRule(
  expression: RegExp,
  name: string,
  allow: () => boolean = () => true,
): InputRule {
  return new InputRule(
    expression,
    (state, match, start, end) => {
      const content = match[1];
      if (!allow()) return null;
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

/** Replace a whole typing row, preserving surrounding lists and descendants. */
export function replaceTypingBlock(state: EditorState, start: number, end: number, nodes: PMNode[], cursorOffset: number): Transaction | null {
  const $start = state.doc.resolve(start);
  if (!state.selection.empty || !$start.parent.isTextblock || $start.parent.type.spec.code ||
      start !== $start.start() || end !== $start.end()) return null;
  const tr = state.tr.delete(start, end);
  const next = state.apply(tr), item = itemAtSelection(next);
  if (item && next.selection.$from.index(item.depth) === 0) {
    const converted = convertListItem(next, "code");
    if (!converted) return null;
    appendTransaction(tr, converted);
  }
  const $pos = tr.selection.$from;
  let from = $pos.before(), to = $pos.after();
  let replacement = Fragment.fromArray(nodes);
  let parent = $pos.node(-1), index = $pos.index(-1);
  if (isEditorKind(parent, "nested_block") && index === 0) {
    // The generic nesting wrapper requires a paragraph/heading as its head.
    // A divider/line block takes its place; keep every descendant after it.
    replacement = replacement.append(parent.content.cut($pos.parent.nodeSize));
    from = $pos.before($pos.depth - 1);
    to = $pos.after($pos.depth - 1);
    parent = $pos.node(-2);
    index = $pos.index(-2);
  }
  if (!parent.canReplace(index, index + 1, replacement)) return null;
  tr.replaceWith(from, to, replacement);
  return tr.setSelection(TextSelection.create(tr.doc, from + cursorOffset));
}

/** Enter after a standalone $$ opens the existing block-equation editor. */
export function mathBlockEnter(allow: () => boolean): Command {
  return (state, dispatch, view) => {
    const { selection } = state, { $from } = selection;
    if (!allow() || view?.composing || !(selection instanceof TextSelection) ||
        !selection.empty || !isEditorKind($from.parent, "paragraph") ||
        $from.parent.textContent !== "$$" || $from.parentOffset !== 2 ||
        inTableCell(state)) return false;
    let code = false;
    $from.parent.forEach(node => {
      if (node.marks.some(mark => mark.type.spec.code)) code = true;
    });
    if (code) return false;
    const tr = state.tr.delete($from.start(), $from.end());
    const next = state.apply(tr), item = itemAtSelection(next);
    if (item && next.selection.$from.index(item.depth) === 0) {
      // Code conversion lifts the row without a paragraph-only nested wrapper,
      // keeping its descendants and containing list item in place.
      const converted = convertListItem(next, "code");
      if (!converted) return false;
      appendTransaction(tr, converted);
    }
    const $position = tr.selection.$from;
    const equation = state.schema.nodes["block.math_block"];
    if (!$position.node(-1).canReplaceWith($position.index(-1), $position.indexAfter(-1), equation)) return false;
    const pos = $position.before();
    tr.replaceWith(pos, $position.after(), equation.create());
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    if (dispatch) {
      dispatch(closeHistory(tr).scrollIntoView());
      view?.nodeDOM(pos)?.dispatchEvent(new Event("notdown-edit-equation"));
    }
    return true;
  };
}

function blockTypeTransaction(
  state: EditorState, start: number, end: number,
  type: "heading" | "code_block", attrs: Record<string, unknown>,
): Transaction | null {
  const tr = state.tr.delete(start, end);
  // Keep the same list conversion and subtree preservation as the block menu.
  const next = state.apply(tr), item = itemAtSelection(next);
  if (item && next.selection.$from.index(item.depth) === 0) {
    const converted = convertListItem(next, type === "heading" ? "heading1" : "code");
    if (!converted) return null;
    appendTransaction(tr, converted);
  }
  const position = tr.selection.from, $position = tr.doc.resolve(position);
  const target = editorNodeType(state.schema, type);
  if (!$position.node(-1).canReplaceWith($position.index(-1), $position.indexAfter(-1), target)) return null;
  return tr.setBlockType(position, position, target, attrs);
}

export function codeBlockInput(state: EditorState, start: number, end: number, params: string) {
  return blockTypeTransaction(state, start, end, "code_block", { params });
}

export function codeLanguageParams(query: string): string {
  const id = codeLanguage(query)?.id ?? query;
  return id === "plain text" ? "" : id;
}

function blockTypeRule(
  expression: RegExp,
  type: "heading" | "code_block",
  allow: (command: string) => boolean,
  codeMode: () => CodeInputMode = codeInputMode,
): InputRule {
  return new InputRule(
    expression,
    (state, match, start, end) => {
      if (type === "code_block") {
        if (!allow("backtick_code") ||
            (codeMode() === "markdown" && !match[0].endsWith(" "))) return null;
        const params = match[1] ? codeLanguageParams(match[1]) : lastCodeLanguage();
        const tr = codeBlockInput(state, start, end, params);
        if (tr && match[1]) rememberCodeLanguage(params);
        return tr;
      }
      return blockTypeTransaction(state, start, end, type,
        { level: allow(`heading${match[1].length}`) ? match[1].length : 4 });
    },
    { inCodeMark: false },
  );
}

function toggleHeadingRule(allow: (command: string) => boolean): InputRule {
  return new InputRule(/^(?:(#{1,6}) )?> $/, (state, match, start, end) => {
    const head = state.selection.$from.parent;
    if (!allow("toggle_heading") || inTableCell(state) ||
        (!match[1] && (!isEditorKind(head, "heading") || head.attrs.toggle))) return null;
    // The heading shortcut has already consumed "## " during ordinary typing;
    // composition can deliver the complete prefix in a single text-input event.
    const level = match[1] ? match[1].length : head.attrs.level;
    if (!allow(`heading${level}`)) return null;
    const tr = blockTypeTransaction(state, start, end, "heading", { ...head.attrs, level });
    if (!tr) return null;
    const $head = tr.selection.$from;
    tr.setNodeMarkup($head.before(), editorNodeType(state.schema, "heading", { toggle: true }),
      { ...$head.parent.attrs, toggle: true });
    if (isEditorKind($head.node(-1), "nested_block") && $head.index(-1) === 0) return tr;
    const range = tr.selection.$from.blockRange();
    if (!range) return null;
    tr.wrap(range, [{ type: schema.nodes["structure.nested_block"] }]);
    return tr;
  }, { inCodeMark: false });
}

export function markdownRules(
  allow: (command: string) => boolean = () => true,
  resolvePageTarget: (target: string) => string = target => target,
  codeMode: () => CodeInputMode = codeInputMode,
  inlineCodec?: InlineSyntaxCodec,
) {
  const paragraph = schema.nodes["block.paragraph"], blockquote = schema.nodes["block.quote"],
    bullet_list = schema.nodes["structure.bullet_list"], ordered_list = schema.nodes["structure.ordered_list"],
    page_link = schema.nodes["inline.internal_link"];
  return inputRules({
    rules: [
      ...inlineSyntaxRules(allow, inlineCodec),
      new InputRule(
        /(?<![\\$])\$((?:\\\$|[^$\r\n\ufffc])+)\$$/,
        (state, match, start, end) => {
          const value = match[1];
          // Match dollar-math boundaries without consuming code, inline atoms,
          // display-math delimiters or a currency amount after the closing $.
          if (!allow("inline_equation") || /^\s|\s$/.test(value) || value.endsWith("\\")) return null;
          const $end = state.doc.resolve(end);
          if (/^\d/.test($end.nodeAfter?.text ?? "")) return null;
          return state.tr.replaceWith(
            start,
            end,
            schema.nodes["inline.inline_math"].create({ value }, null, state.doc.resolve(start).marks()),
          );
        },
        { inCodeMark: false },
      ),
      new InputRule(
        /(?<!\\)\[\[([^\[\]\n]+)\]\]$/,
        (state, match, start, end) => {
          if (!allow("link") || /\ufffc/.test(match[1])) return null;
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
              { target: allow("wiki_syntax") ? target : resolvePageTarget(target), label, syntaxForm: allow("wiki_syntax") ? "wiki" : "", labelMode: separator < 0 ? "auto" : "custom" },
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
      new InputRule(/(?<![\\`])`r[ \t]+([^`\r\n\ufffc]+)`$/, (state, match, start, end) => {
        if (!allow("r_inline") || !match[1].trim()) return null;
        const node = schema.nodes["inline.executable_expression"].create(
          { language: "r", raw: match[0], expression: match[1] }, schema.text(match[1]), state.doc.resolve(start).marks(),
        );
        const tr = state.tr.replaceWith(start, end, node);
        return tr.setSelection(TextSelection.create(tr.doc, start + node.nodeSize));
      }, { inCodeMark: false }),
      new InputRule(/(?<![\\`])`\{(r|python|julia|ojs)\}[ \t]+([^`\r\n\ufffc]+)`$/, (state, match, start, end) => {
        if (!allow("quarto_python") || !match[2].trim()) return null;
        const node = schema.nodes["inline.executable_expression"].create({ raw: match[0], language: match[1], expression: match[2] }, schema.text(match[2]), state.doc.resolve(start).marks());
        const tr = state.tr.replaceWith(start, end, node);
        return tr.setSelection(TextSelection.create(tr.doc, start + node.nodeSize));
      }, { inCodeMark: false }),
      markInputRule(/(?<!\\)`([^`]+)`$/, "code"),
      markInputRule(/(?<![\\{])~~([^~]+)~~$/, "strike", () => allow("strike")),
      markInputRule(/(?<![\\={])==([^=\r\n]+)==$/, "highlight", () => allow("highlight")),
      markInputRule(/(?<![\\~])~([^~\r\n]+)~$/, "strike", () => allow("strike") && allow("input_single_strike")),
      new InputRule(
        /^(?:[-+*] )?\[([ xX]?)\] $/,
        (state, match, start, end) => {
          const tr = state.tr.delete(start, end);
          if (!allow("task")) return null;
          const checked = match[1].toLowerCase() === "x";
          const item = itemAtSelection(state);
          if (item &&
              state.selection.$from.node(item.depth - 1).type === ordered_list &&
              !allow("ordered_task")) return null;
          if (item)
            return tr.setNodeMarkup(item.pos, schema.nodes["block.task_list_item"], {
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
          return tr.setNodeMarkup(result.pos, schema.nodes["block.task_list_item"], {
            ...result.node.attrs,
            checked,
          });
        },
        { inCodeMark: false },
      ),
      wrappingInputRule(/^\s*([-+*]) $/, bullet_list),
      new InputRule(
        /^(\d+|a|i)[.)] $/,
        (state, match, start, end) => {
          if (match[0].includes(")") && !allow("ordered_parenthesis")) return null;
          if (!/^\d+$/.test(match[1]) && match[0].includes(")")) return null;
          const tr = state.tr.delete(start, end);
          let wrapped: Transaction | null = null;
          if (!wrapInList(ordered_list, {
            order: /^\d+$/.test(match[1]) ? Number(match[1]) : 1,
            markerStyle: allow("input_fancy_list") && match[1] === "a" ? "alpha" : allow("input_fancy_list") && match[1] === "i" ? "roman" : "decimal",
          })(
            state.apply(tr), (change) => { wrapped = change; },
          ) || !wrapped) return null;
          appendTransaction(tr, wrapped);
          return tr;
        },
        { inCodeMark: false },
      ),
      toggleHeadingRule(allow),
      wrappingInputRule(/^> $/, blockquote),
      new InputRule(/^["|] $/, (state, match, start, end) => {
        if (match[0][0] === "|" && allow("lines")) {
          return replaceTypingBlock(state, start, end, [schema.nodes["block.line_block"].create(null, schema.nodes["structure.line"].create())], 2);
        }
        if (match[0][0] === "|" && !allow("input_pipe_quote")) return null;
        const row = replaceTypingBlock(state, start, end, [blockquote.create(null, paragraph.create())], 2);
        if (row) return row;
        const tr = state.tr.delete(start, end);
        let wrapped: Transaction | undefined;
        if (!wrapIn(blockquote)(state.apply(tr), change => { wrapped = change; }) || !wrapped) return null;
        appendTransaction(tr, wrapped);
        return tr;
      }, { inCodeMark: false }),
      blockTypeRule(/^(#{1,6}) $/, "heading", allow),
      blockTypeRule(/^```(?:([\p{L}\p{N}_+#.-]*) )?$/u, "code_block", allow, codeMode),
      new InputRule(/^---$/, (state, _match, start, end) => {
        return replaceTypingBlock(state, start, end, [schema.nodes["block.divider"].create(), paragraph.create()], 2);
      }, { inCodeMark: false }),
    ],
  });
}
