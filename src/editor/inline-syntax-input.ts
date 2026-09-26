import { Fragment, Mark, type Node as PMNode } from "prosemirror-model";
import { InputRule } from "prosemirror-inputrules";
import { TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import emoji from "markdown-it-emoji/lib/data/full.mjs";
import { editorKind, isEditorKind } from "../document/node-identity";
import { inlineMarkdown } from "../document/editor-markdown";
import { projectFootnotes } from "./footnotes";

export interface InlineSyntaxCodec {
  parse: (source: string) => PMNode;
  context: (doc: PMNode) => string;
}

/** Materialize only the uninserted suffix, retaining existing inline nodes. */
export function materializeInlineMatch(state: EditorState, match: RegExpMatchArray, start: number, end: number): Transaction | null {
  const from = Math.max(start, Math.min(state.selection.from, end));
  const existing = state.doc.textBetween(start, from, "", "\ufffc");
  if (!match[0].startsWith(existing)) return null;
  return state.tr.insertText(match[0].slice(existing.length), from, end);
}

function protectedRange(state: EditorState, start: number, end: number) {
  let code = false;
  state.doc.nodesBetween(start, end, node => { if (node.marks.some(mark => mark.type.spec.code)) code = true; });
  const $start = state.doc.resolve(start);
  const prefix = $start.parent.textBetween(0, $start.parentOffset, "", "\ufffc");
  // Unfinished spans are still text. Match backtick runs of the same length,
  // including double-backtick spans whose content may contain a single tick.
  let delimiter = 0;
  for (let i = 0; i < prefix.length; i++) {
    if (!delimiter && prefix[i] === "\\") { i++; continue; }
    if (prefix[i] !== "`") continue;
    let length = 1;
    while (prefix[i + 1] === "`") { length++; i++; }
    if (!delimiter) delimiter = length;
    else if (length === delimiter) delimiter = 0;
  }
  return code || delimiter !== 0;
}

export function inlineSyntaxRules(allow: (command: string) => boolean, codec?: InlineSyntaxCodec): InputRule[] {
  const rules: InputRule[] = [];
  const mark = (expression: RegExp, command: string, kind: string,
    content: (match: RegExpMatchArray) => { offset: number; text: string; attrs?: Record<string, string> }) => {
    rules.push(new InputRule(expression, (state, match, start, end) => {
      if (!allow(command) || protectedRange(state, start, end)) return null;
      const value = content(match);
      if (!value.text) return null;
      const tr = materializeInlineMatch(state, match, start, end);
      if (!tr) return null;
      const from = start + value.offset, to = from + value.text.length;
      if (value.attrs?.kind === "substitution") {
        const original = tr.doc.slice(start + 3, start + 3 + value.attrs.old.length).content;
        let rich = false;
        original.forEach(node => { if (!node.isText || node.marks.length) rich = true; });
        if (rich) value.attrs.old = inlineMarkdown(state.schema.nodes["block.paragraph"].create(null, original));
      }
      tr.delete(to, start + match[0].length).delete(start, from);
      const type = state.schema.marks[kind];
      tr.addMark(start, start + value.text.length, type.create(value.attrs));
      tr.setSelection(TextSelection.create(tr.doc, start + value.text.length));
      return tr.removeStoredMark(type);
    }, { inCodeMark: false }));
  };
  mark(/(?<![\\^])\^([^\s^\\]+)\^$/, "superscript", "superscript", m => ({ offset: 1, text: m[1] }));
  mark(/(?<![\\~])~((?!>)[^\s~\\]+)~$/, "subscript", "subscript", m => ({ offset: 1, text: m[1] }));
  for (const [open, close, kind] of [["++", "++", "addition"], ["--", "--", "deletion"], ["==", "==", "highlight"], [">>", "<<", "comment"]]) {
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    mark(new RegExp(`(?<!\\\\)\\{${escape(open)}([^{}\\r\\n]+?)${escape(close)}\\}$`), "critic", "critic",
      m => ({ offset: 3, text: m[1], attrs: { kind } }));
  }
  mark(/(?<!\\)\{~~([^{}\r\n]*?)~>([^{}\r\n]+?)~~\}$/, "critic", "critic",
    m => ({ offset: 3 + m[1].length + 2, text: m[2], attrs: { kind: "substitution", old: m[1] } }));

  rules.push(new InputRule(/(?<![\\\w]):([a-zA-Z0-9_+-]+):$/, (state, match, start, end) => {
    if (!allow("emoji_shortcode") || !Object.hasOwn(emoji, match[1]) || protectedRange(state, start, end) ||
        state.doc.resolve(start).marks().some(mark => isEditorKind(mark, "link"))) return null;
    return state.tr.insertText(emoji[match[1] as keyof typeof emoji], start, end);
  }, { inCodeMark: false }));

  rules.push(new InputRule(/(?<!\\)\^\[([^\r\n]+)\]$/, (state, match, start, end) => {
    if (!allow("inline_note") || protectedRange(state, start, end)) return null;
    for (let depth = state.selection.$from.depth; depth > 0; depth--)
      if (["footnote", "inline_note"].includes(editorKind(state.selection.$from.node(depth)))) return null;
    let depth = 0;
    for (let i = 0; i < match[1].length; i++) {
      if (match[1][i] === "\\") { i++; continue; }
      if (match[1][i] === "[") depth++;
      if (match[1][i] === "]" && --depth < 0) return null;
    }
    if (depth) return null;
    const tr = materializeInlineMatch(state, match, start, end);
    if (!tr) return null;
    const note = state.schema.nodes["structure.inline_note"].create(null, tr.doc.slice(start + 2, start + match[0].length - 1).content);
    tr.replaceWith(start, start + match[0].length, note);
    // Include the footer projection in this input transaction so undo/redo
    // records the final prose caret rather than an intermediate inline payload.
    const projected = projectFootnotes(tr.doc);
    tr.replaceWith(0, tr.doc.content.size, projected.content);
    return tr.setSelection(TextSelection.create(tr.doc, start + 1));
  }, { inCodeMark: false }));

  if (!codec) return rules;
  const parsed = (expression: RegExp, command: string, accepts: (nodes: Fragment) => boolean, context = false) => {
    rules.push(new InputRule(expression, (state, match, start, end) => {
      if (!allow(command) || protectedRange(state, start, end)) return null;
      const marks = state.doc.resolve(start).marks();
      if (marks.some(mark => isEditorKind(mark, "link"))) return null;
      let uniform = true;
      state.doc.nodesBetween(start, end, node => {
        if (node.isInline && (!node.isText || !Mark.sameSet(node.marks, marks))) uniform = false;
      });
      if (!uniform) return null;
      // Force an inline parse; reference definitions come from this document,
      // never from an invented definition or a global replacement of its source.
      const doc = codec.parse("x " + match[0] + (context ? "\n\n" + codec.context(state.doc) : ""));
      if (!isEditorKind(doc.firstChild, "paragraph")) return null;
      const first = doc.firstChild!.firstChild;
      const rawHtml = doc.firstChild!.childCount === 1 && first?.type === state.schema.nodes["inline.inline_html"] && first.attrs.raw === "x " + match[0];
      const content = rawHtml
        ? Fragment.from(first!.type.create({ ...first!.attrs, raw: match[0], html: match[0] }))
        : doc.firstChild!.content.cut(2);
      if (!content.size || !accepts(content)) return null;
      const nodes: PMNode[] = [];
      content.forEach(node => nodes.push(node.mark(marks.reduce((set, mark) => mark.addToSet(set), node.marks))));
      const tr = state.tr.replaceWith(start, end, Fragment.fromArray(nodes));
      tr.setSelection(TextSelection.create(tr.doc, start + content.size));
      tr.setStoredMarks(marks);
      return tr;
    }, { inCodeMark: false }));
  };
  parsed(/(?<!\\)<([^<>\s]+)>$/, "autolink", nodes => {
    let valid = true;
    nodes.forEach(node => { if (!node.isText || !node.marks.some(mark => isEditorKind(mark, "link") && !/^(?:javascript|data|vbscript):/i.test(mark.attrs.href))) valid = false; });
    return valid;
  });
  parsed(/(?<!\\)<([a-zA-Z][\w:-]*)\b(?:[^<>"'\r\n]|"[^"\r\n]*"|'[^'\r\n]*')*>[^\r\n]*?<\/\1\s*>$/, "html", nodes => {
    let html = false;
    nodes.forEach(node => { if (isEditorKind(node, "html_inline") || isEditorKind(node, "syntax_inline") || node.marks.length) html = true; });
    return html;
  });
  parsed(/(?<!\\)<(?:br|wbr|img)\b(?:[^<>"'\r\n]|"[^"\r\n]*"|'[^'\r\n]*')*\/?>$/i, "html", nodes => {
    let typed = false; nodes.forEach(node => { if (!node.isText) typed = true; }); return typed;
  });
  parsed(/(?<!\\)\[>(?:\([^\]\r\n]+\)\s*)?[^\[\]\r\n]+\]$/, "abbreviation",
    nodes => nodes.childCount === 1 && nodes.firstChild!.type.name === "inline.abbreviation", true);
  parsed(/(?<![\\\[])\[(?:[^\]\r\n]*@|\^https?:\/\/)[^\[\]\r\n]+\]$/, "citation",
    nodes => nodes.childCount === 1 && nodes.firstChild!.type.name === "inline.citation", true);
  parsed(/(?<![\\\[])(?:\[[^\[\]\r\n]*\])?\[#[^\[\]\r\n]+\]$/, "citation",
    nodes => nodes.childCount === 1 && nodes.firstChild!.type.name === "inline.citation", true);
  return rules;
}
