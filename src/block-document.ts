import type Token from "markdown-it/lib/token.mjs";
import {
  parseBlocks,
  parseMarkdownTokens,
  type BlockRecord,
} from "./markdown.js";

export interface EditableBlock {
  /** The visible block only: document whitespace and reference definitions stay outside. */
  content: string;
  /** Absolute UTF-16 offsets into the original Markdown. */
  start: number;
  end: number;
  type: string;
}

function assertIndex(index: number, length: number, insertion = false): void {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= length + (insertion ? 1 : 0)
  )
    throw new RangeError(`Block index ${index} is out of range`);
}

function offsetsFor(source: string): number[] {
  const offsets = [0];
  for (const match of source.matchAll(/\r\n|\n|\r/g))
    offsets.push(match.index! + match[0].length);
  return offsets;
}

function contentRange(block: BlockRecord): EditableBlock {
  // Token maps omit actual reference definitions. Use the document's extension
  // parser too: a reference-looking line inside an unknown literal extension
  // must remain visible and editable, just like reference-looking fenced code.
  // Do not trim reference-looking text with regex: it can be literal fenced code.
  const roots = parseMarkdownTokens(block.source).filter(
    (token) => token.level === 0 && token.map && token.nesting !== -1,
  );
  if (!roots.length)
    return {
      content: "",
      start: block.end,
      end: block.end,
      type: block.type,
    };
  const offsets = offsetsFor(block.source);
  const start = offsets[roots[0].map![0]];
  const mappedEnd = offsets[roots.at(-1)!.map![1]] ?? block.source.length;
  // A token's final line ending belongs to the document boundary. Retaining
  // that original suffix prevents a live editor's normalized final newline
  // from rewriting the rest of the document, including CRLF and extra spacing.
  const content = block.source.slice(start, mappedEnd).replace(/[\r\n]+$/, "");
  return {
    content,
    start: block.start + start,
    end: block.start + start + content.length,
    type: block.type,
  };
}

export function editableBlock(source: string, index: number): EditableBlock {
  const blocks = parseBlocks(source);
  assertIndex(index, blocks.length);
  return contentRange(blocks[index]);
}

function newlineFor(source: string): string {
  return source.match(/\r\n|\n|\r/)?.[0] ?? "\n";
}

function editorContent(content: string, newline: string): string {
  return content.replace(/\r\n|\n|\r/g, newline).replace(/[\r\n]+$/, "");
}

/** Keep both original fragments byte-for-byte; add only missing separators. */
function join(left: string, right: string, newline: string): string {
  if (!left || !right || !left.trim() || !right.trim()) return left + right;
  const trailing = left.match(/[ \t\r\n]*$/)![0];
  const leading = right.match(/^[ \t\r\n]*/)![0];
  const count = (value: string) => (value.match(/\r\n|\n|\r/g) ?? []).length;
  return (
    left +
    newline.repeat(Math.max(0, 2 - count(trailing) - count(leading))) +
    right
  );
}

/** Replace one visible block, preserving invisible definitions and other slices. */
export function replaceBlock(
  source: string,
  index: number,
  newMarkdown: string,
): string {
  const blocks = parseBlocks(source);
  assertIndex(index, blocks.length);
  const block = blocks[index];
  const range = contentRange(block);
  const newline = newlineFor(source);
  const content = editorContent(newMarkdown, newline);
  if (content === range.content) return source;
  if (!content.trim()) return deleteBlock(source, index);
  const before = source.slice(0, range.start);
  const after = source.slice(range.end);
  return join(join(before, content, newline), after, newline);
}

/** Insert before index; index === block count appends. Empty input is a no-op. */
export function insertBlock(
  source: string,
  index: number,
  newMarkdown: string,
): string {
  const blocks = parseBlocks(source);
  assertIndex(index, blocks.length, true);
  const newline = newlineFor(source);
  const content = editorContent(newMarkdown, newline);
  if (!content.trim()) return source;
  const position =
    index === blocks.length ? source.length : blocks[index].start;
  return join(
    join(source.slice(0, position), content, newline),
    source.slice(position),
    newline,
  );
}

/** Delete the content and its trailing empty lines, never invisible definitions. */
export function deleteBlock(source: string, index: number): string {
  const blocks = parseBlocks(source);
  assertIndex(index, blocks.length);
  const block = blocks[index];
  const range = contentRange(block);
  if (!range.content) return source.trim() ? source : "";
  const suffix = source.slice(range.end, block.end);
  const end = suffix.trim() ? range.end : block.end;
  return source.slice(0, range.start) + source.slice(end);
}

export function duplicateBlock(source: string, index: number): string {
  const range = editableBlock(source, index);
  return insertBlock(source, index + 1, range.content);
}

/** Backspace at a paragraph boundary removes only its blank separator. Hidden
 * definitions and non-paragraph Markdown make that merge unsafe. */
export function mergeParagraphWithPrevious(
  source: string,
  index: number,
): string | undefined {
  const blocks = parseBlocks(source);
  assertIndex(index, blocks.length);
  if (
    index === 0 ||
    blocks[index].type !== "paragraph" ||
    blocks[index - 1].type !== "paragraph"
  )
    return;
  const previous = contentRange(blocks[index - 1]);
  const current = contentRange(blocks[index]);
  if (source.slice(previous.end, current.start).trim()) return;
  return source.slice(0, previous.end) + source.slice(current.start);
}

/** Toggle the checkbox at its rendered position, changing one source character. */
export function toggleTaskInBlock(
  source: string,
  index: number,
  taskIndex: number,
): string {
  const blocks = parseBlocks(source);
  assertIndex(index, blocks.length);
  const block = blocks[index];
  const offsets = offsetsFor(block.source);
  const markers: number[] = [];
  const collect = (tokens: Token[]): void => {
    for (let position = 0; position < tokens.length; position++) {
      const token = tokens[position];
      if (token.type === "columns") {
        collect(token.meta.left);
        collect(token.meta.right);
      }
      const inline = tokens[position + 2];
      if (
        token.type !== "list_item_open" ||
        tokens[position + 1]?.type !== "paragraph_open" ||
        inline?.type !== "inline" ||
        inline.children?.[0]?.type !== "task_checkbox"
      )
        continue;
      // The parser decides whether this is a checkbox. The source scan is
      // confined to that actual item's first line; fences, escaped markers,
      // prose, and unknown extension literals never reach this branch.
      const line = (token.meta?.sourceLine ?? token.map![0] + 1) - 1;
      const start = offsets[line];
      const end = offsets[line + 1] ?? block.source.length;
      const text = block.source.slice(start, end).replace(/[\r\n]+$/, "");
      const marker = /\[([ xX])\](?=[ \t]|$)/.exec(text);
      if (!marker)
        throw new Error("The task checkbox no longer matches its source");
      markers.push(block.start + start + marker.index + 1);
    }
  };
  collect(parseMarkdownTokens(block.source));
  assertIndex(taskIndex, markers.length);
  const marker = markers[taskIndex];
  const next = source[marker] === " " ? "x" : " ";
  return source.slice(0, marker) + next + source.slice(marker + 1);
}
