import { isListItem } from "./list-items";
import {
  Fragment,
  type Node as PMNode,
  type ResolvedPos,
} from "prosemirror-model";
import {
  NodeSelection,
  Selection,
  TextSelection,
  type EditorState,
  type Transaction,
} from "prosemirror-state";

export type ListItemConversion =
  | "text"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "list"
  | "number"
  | "task"
  | "quote"
  | "code";

function itemDepth($pos: ResolvedPos): number {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (isListItem($pos.node(depth))) return depth;
  }
  return -1;
}

function leafText(node: PMNode): string {
  if (node.type.name === "hard_break") return "\n";
  if (node.type.name === "page_link") {
    const { target, label } = node.attrs;
    return `[[${target}${label && label !== target ? `|${label}` : ""}]]`;
  }
  if (node.type.name === "image") {
    const label = String(
      node.attrs.alt || "",
    ).replace(/([\\\[\]])/g, "\\$1");
    const src = String(node.attrs.src || "").replace(/([\\()])/g, "\\$1");
    return `![${label}](${src})`;
  }
  return node.textContent;
}

/** Unlike setBlockType(code), this keeps inline atoms as readable Markdown. */
export function convertTextblockToCode(state: EditorState): Transaction | null {
  const { selection, schema } = state;
  const { $from, $to } = selection;
  const block = $from.parent;
  const code = schema.nodes.code_block;
  if (
    !code ||
    !block.isTextblock ||
    block.type.spec.code ||
    block !== $to.parent ||
    !$from.depth
  )
    return null;
  const parent = $from.node(-1);
  if (!parent.canReplaceWith($from.index(-1), $from.indexAfter(-1), code))
    return null;
  const text = block.textBetween(0, block.content.size, "\n", leafText);
  const converted = code.create(
    { ...block.attrs, params: "" },
    text ? schema.text(text) : undefined,
  );
  const start = $from.before();
  const textStart = $from.start();
  const position = (old: number) =>
    start + 1 + block.textBetween(0, old - textStart, "\n", leafText).length;
  try {
    const tr = state.tr.replaceWith(start, $from.after(), converted);
    tr.doc.check();
    return tr.setSelection(
      TextSelection.create(
        tr.doc,
        position(selection.anchor),
        position(selection.head),
      ),
    );
  } catch {
    return null;
  }
}

/** Convert only the selected item, keeping its siblings and descendants intact. */
export function convertListItem(
  state: EditorState,
  type: ListItemConversion,
): Transaction | null {
  const { selection, schema } = state;
  const selectedItem =
    selection instanceof NodeSelection &&
    isListItem(selection.node);
  const $from = selectedItem
    ? state.doc.resolve(selection.from + 1)
    : selection.$from;
  const depth = itemDepth($from);
  if (depth < 2) return null;

  const item = $from.node(depth);
  const itemPos = $from.before(depth);
  if (!selectedItem) {
    const endDepth = itemDepth(selection.$to);
    if (endDepth !== depth || selection.$to.before(endDepth) !== itemPos)
      return null;
  }
  const list = $from.node(depth - 1);
  if (list.type.name !== "bullet_list" && list.type.name !== "ordered_list")
    return null;
  const first = item.firstChild;
  if (!first || first.type.name !== "paragraph") return null;

  const listPos = $from.before(depth - 1);
  const index = $from.index(depth - 1);
  const before: PMNode[] = [];
  const after: PMNode[] = [];
  list.forEach((child, _offset, childIndex) => {
    if (childIndex < index) before.push(child);
    if (childIndex > index) after.push(child);
  });

  const listType =
    type === "number" ? schema.nodes.ordered_list : schema.nodes.bullet_list;
  const isListConversion =
    type === "list" || type === "number" || type === "task";
  const checked = type === "task" ? (item.attrs.checked ?? false) : null;
  const itemType = schema.nodes[type === "task" ? "task_list_item" : type === "number" ? "numbered_list_item" : "bullet_list_item"];
  if (isListConversion && list.type === listType) {
    return state.tr.setNodeMarkup(itemPos, itemType, {
      ...item.attrs,
      checked,
    });
  }

  const replacement: PMNode[] = [];
  if (before.length) replacement.push(list.copy(Fragment.fromArray(before)));
  const targetPos =
    listPos + replacement.reduce((size, node) => size + node.nodeSize, 0);
  const remaining: PMNode[] = [];
  item.forEach((child, _offset, childIndex) => {
    if (childIndex > 0) remaining.push(child);
  });
  let mapItemOffset: (offset: number) => number;

  if (isListConversion) {
    const converted = itemType.create(
      { ...item.attrs, checked },
      item.content,
      item.marks,
    );
    replacement.push(listType.create({ ...list.attrs, order: 1 }, converted));
    mapItemOffset = (offset) => targetPos + 2 + offset;
  } else if (type === "quote") {
    replacement.push(schema.nodes.blockquote.create(null, item.content));
    mapItemOffset = (offset) => targetPos + 1 + offset;
  } else {
    let converted: PMNode;
    if (type === "code") {
      const text = first.textBetween(0, first.content.size, "\n", leafText);
      converted = schema.nodes.code_block.create(
        { ...first.attrs, params: "" },
        text ? schema.text(text) : undefined,
      );
      mapItemOffset = (offset) => {
        if (offset <= first.nodeSize) {
          const textOffset = Math.max(
            0,
            Math.min(offset - 1, first.content.size),
          );
          const prefix = first.textBetween(0, textOffset, "\n", leafText);
          return targetPos + 1 + prefix.length;
        }
        return targetPos + offset + converted.nodeSize - first.nodeSize;
      };
    } else {
      const heading = /^heading([1-3])$/.exec(type);
      const targetType = heading
        ? schema.nodes.heading
        : schema.nodes.paragraph;
      converted = targetType.create(
        { ...first.attrs, ...(heading ? { level: Number(heading[1]) } : {}) },
        first.content,
        first.marks,
      );
      mapItemOffset = (offset) => targetPos + offset;
    }
    if (type !== "code" && remaining.length && schema.nodes.nested_block) {
      replacement.push(
        schema.nodes.nested_block.create(null, [converted, ...remaining]),
      );
      const originalMap = mapItemOffset;
      mapItemOffset = (offset) => originalMap(offset) + 1;
    } else replacement.push(converted, ...remaining);
  }

  if (after.length) {
    replacement.push(
      list.type.create(
        {
          ...list.attrs,
          ...(list.type.name === "ordered_list"
            ? { order: list.attrs.order + index + 1 }
            : {}),
        },
        after,
        list.marks,
      ),
    );
  }

  const tr = state.tr;
  try {
    tr.replaceWith(
      listPos,
      listPos + list.nodeSize,
      Fragment.fromArray(replacement),
    );
    tr.doc.check();
    const resolve = (position: number) =>
      tr.doc.resolve(Math.max(0, Math.min(position, tr.doc.content.size)));
    if (selectedItem) {
      tr.setSelection(Selection.near(resolve(mapItemOffset(1))));
    } else {
      const anchor = mapItemOffset(selection.anchor - itemPos - 1);
      const head = mapItemOffset(selection.head - itemPos - 1);
      tr.setSelection(TextSelection.between(resolve(anchor), resolve(head)));
    }
    return tr;
  } catch {
    // A restrictive parent must never make conversion discard or relocate content.
    return null;
  }
}
