import { isListItem } from "../document/list-items";
import { Fragment, type Node as PMNode } from "prosemirror-model";
import {
  Selection,
  TextSelection,
  type Command,
  type EditorState,
  type Transaction,
} from "prosemirror-state";
import { convertListItem } from "./editor-convert";

export interface EditorBlock {
  /** Position immediately before the block, suitable for nodeDOM(). */
  pos: number;
  end: number;
  node: PMNode;
  depth: number;
  path: readonly number[];
  parentPos: number;
  listPos?: number;
  listNode?: PMNode;
}

export type BlockPlacement = "before" | "after" | "inside";

const isList = (node: PMNode) =>
  node.type.name === "bullet_list" || node.type.name === "ordered_list";
const isItem = (node: PMNode) => isListItem(node);
const isGroup = (node: PMNode) => node.type.name === "nested_block";
const hasBlockHead = (node: PMNode) =>
  ["toggle_block", "callout", "synced_block", "blockquote"].includes(
    node.type.name,
  );

function atPath(doc: PMNode, path: readonly number[]) {
  let node = doc;
  let pos = -1;
  let parent = doc;
  let parentPos = -1;
  for (const index of path) {
    parent = node;
    parentPos = pos;
    pos += 1;
    for (let i = 0; i < index; i++) pos += node.child(i).nodeSize;
    node = node.child(index);
  }
  return { node, pos, parent, parentPos };
}

function describe(doc: PMNode, path: number[]): EditorBlock | null {
  if (!path.length) return null;
  const { node, pos, parent, parentPos } = atPath(doc, path);
  if (!node.isBlock) return null;
  for (let i = 1; i <= path.length; i++)
    if (["footnote", "footnote_section", "footnote_anchor"].includes(atPath(doc, path.slice(0, i)).node.type.name)) return null;
  return {
    node,
    pos,
    end: pos + node.nodeSize,
    depth: path.length,
    path,
    parentPos,
    ...(isList(parent) ? { listPos: parentPos, listNode: parent } : {}),
  };
}

/** Resolve a row without treating a whole consecutive list as a single block. */
export function blockAtPos(doc: PMNode, position: number): EditorBlock | null {
  if (!Number.isFinite(position)) return null;
  const pos = Math.max(0, Math.min(position, doc.content.size));
  const $pos = doc.resolve(pos);
  const path = Array.from({ length: $pos.depth + 1 }, (_, d) => $pos.index(d));
  const exact = $pos.nodeAfter;

  // Definitions belong to the document's notes area, never to block drag/menu controls.
  const note = (node: PMNode | null) => node && ["footnote", "footnote_section", "footnote_anchor"].includes(node.type.name);
  if (note(exact)) return null;
  for (let depth = $pos.depth; depth > 0; depth--) if (note($pos.node(depth))) return null;

  // Table cells are editing positions, not independently movable page blocks.
  for (let depth = $pos.depth; depth > 0; depth--)
    if ($pos.node(depth).type.name === "table")
      return describe(doc, path.slice(0, depth));

  if (exact && isList(exact)) {
    if (exact.firstChild) return describe(doc, [...path, 0]);
    return null;
  }
  if (exact && isItem(exact)) return describe(doc, path);
  if (exact?.type.name === "fenced_div") return describe(doc, path);

  // An item's first paragraph is its own editable row. Nested list items have
  // their own nearer list_item ancestor and therefore their own drag handle.
  for (let depth = $pos.depth; depth > 0; depth--) {
    // A Div has no heading row: every child is independently movable. Its
    // exact boundary still resolves to the container for whole-group actions.
    if ($pos.node(depth).type.name === "fenced_div") break;
    if (
      ["definition_list", "line_block"].includes(
        $pos.node(depth).type.name,
      )
    )
      return describe(doc, path.slice(0, depth));
    if (
      (isGroup($pos.node(depth)) || hasBlockHead($pos.node(depth))) &&
      $pos.index(depth) === 0
    )
      return describe(doc, path.slice(0, depth));
    if (!isItem($pos.node(depth))) continue;
    if ($pos.index(depth) === 0) return describe(doc, path.slice(0, depth));
    // A paragraph/attachment below the row is a child block of its own.
    break;
  }

  if (exact?.isBlock) return describe(doc, path);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.isBlock && !isList(node) && node.type.name !== "column")
      return describe(doc, path.slice(0, depth));
  }
  if (pos === doc.content.size && doc.lastChild) {
    return describe(doc, [doc.childCount - 1]);
  }
  return null;
}

interface Branch {
  node: PMNode;
  children: Branch[];
  parent: Branch | null;
}

function branch(node: PMNode, parent: Branch | null = null): Branch {
  const result: Branch = { node, children: [], parent };
  node.forEach((child) => result.children.push(branch(child, result)));
  return result;
}

function getBranch(tree: Branch, path: readonly number[]) {
  return path.reduce((current, index) => current.children[index], tree);
}

function attach(parent: Branch, index: number, child: Branch) {
  child.parent = parent;
  parent.children.splice(index, 0, child);
}

function detach(item: Branch) {
  if (!item.parent) return;
  let parent: Branch = item.parent;
  parent.children.splice(parent.children.indexOf(item), 1);
  item.parent = null;
  // PM lists require at least one item. Removing their last item must remove
  // the wrapper, otherwise a phantom empty bullet appears after a drag.
  while (parent.parent && isList(parent.node) && !parent.children.length) {
    const empty: Branch = parent;
    parent = empty.parent!;
    parent.children.splice(parent.children.indexOf(empty), 1);
    empty.parent = null;
  }
}

function materialize(tree: Branch): PMNode {
  if (tree.node.isLeaf || tree.node.isText) return tree.node;
  let children = tree.children.map(materialize);
  if (!children.length && !tree.node.type.validContent(Fragment.empty)) {
    const paragraph = tree.node.type.schema.nodes.paragraph?.createAndFill();
    if (paragraph) children = [paragraph];
  }
  if (
    children.length === tree.node.childCount &&
    children.every((node, index) => node === tree.node.child(index))
  )
    return tree.node;
  return tree.node.type.createChecked(
    tree.node.attrs,
    children,
    tree.node.marks,
  );
}

function unwrapEmptyGroups(tree: Branch) {
  for (const child of [...tree.children]) {
    unwrapEmptyGroups(child);
    if (isGroup(child.node) && child.children.length === 1) {
      const index = tree.children.indexOf(child);
      const head = child.children[0];
      head.parent = tree;
      tree.children.splice(index, 1, head);
    }
  }
}

function positionOf(target: Branch): number {
  const parent = target.parent;
  if (!parent) return -1;
  let position = positionOf(parent) + 1;
  for (const child of parent.children) {
    if (child === target) break;
    position += materialize(child).nodeSize;
  }
  return position;
}

function transactionFor(
  state: EditorState,
  tree: Branch,
  selected?: Branch,
  fallbackPosition = state.selection.from,
): Transaction | null {
  try {
    if (selected && isGroup(selected.node) && selected.children.length === 1)
      selected = selected.children[0];
    unwrapEmptyGroups(tree);
    const doc = materialize(tree);
    doc.check();
    if (doc.eq(state.doc)) return null;
    const start = state.doc.content.findDiffStart(doc.content)!;
    const ends = state.doc.content.findDiffEnd(doc.content)!;
    let oldEnd = ends.a;
    let newEnd = ends.b;
    const overlap = start - Math.min(oldEnd, newEnd);
    if (overlap > 0) {
      oldEnd += overlap;
      newEnd += overlap;
    }
    let tr: Transaction;
    try {
      tr = state.tr.replace(start, oldEnd, doc.slice(start, newEnd));
      if (!tr.doc.eq(doc)) throw new Error("Block replacement changed content");
    } catch {
      tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
    }
    const position = selected
      ? positionOf(selected) + 1
      : tr.mapping.map(fallbackPosition, -1);
    tr.setSelection(
      Selection.near(
        tr.doc.resolve(Math.max(0, Math.min(position, tr.doc.content.size))),
      ),
    );
    return tr.scrollIntoView();
  } catch {
    // Unsupported extension containers stay untouched rather than being
    // flattened into a shape their schema cannot represent.
    return null;
  }
}

function isPrefix(parent: readonly number[], child: readonly number[]) {
  return (
    parent.length <= child.length && parent.every((n, i) => n === child[i])
  );
}

function listAround(item: Branch, originalList: PMNode): Branch {
  const list: Branch = {
    node: originalList,
    children: [],
    parent: null,
  };
  attach(list, 0, item);
  return list;
}

/**
 * Move a single row with its complete descendants. Positions refer to the
 * state before the transaction; a nested descendant cannot become its parent.
 */
export function moveEditorBlock(
  state: EditorState,
  fromPos: number,
  toPos: number,
  placement: BlockPlacement,
): Transaction | null {
  return moveEditorBlocks(state, [fromPos], toPos, placement);
}

/** Move selected rows atomically in document order, retaining descendants. */
export function moveEditorBlocks(
  state: EditorState,
  positions: readonly number[],
  toPos: number,
  placement: BlockPlacement,
): Transaction | null {
  const rows = [...new Set(positions)]
    .sort((a, b) => a - b)
    .map((pos) => blockAtPos(state.doc, pos))
    .filter((row): row is EditorBlock => !!row);
  const selected = rows.filter(
    (row) =>
      !rows.some(
        (other) => other.pos !== row.pos && isPrefix(other.path, row.path),
      ),
  );
  const to = blockAtPos(state.doc, toPos);
  if (
    !selected.length ||
    !to ||
    selected.some((row) => isPrefix(row.path, to.path))
  )
    return null;
  const tree = branch(state.doc);
  const moving = selected.map((row) => getBranch(tree, row.path));
  const target = getBranch(tree, to.path);
  const ordered = placement !== "after" ? moving : [...moving].reverse();
  for (const item of ordered)
    if (!moveBranch(state, item, target, placement)) return null;
  return transactionFor(state, tree, moving[0]);
}

function moveBranch(
  state: EditorState,
  moving: Branch,
  target: Branch,
  placement: BlockPlacement,
): Branch | null {
  const sourceList =
    moving.parent && isList(moving.parent.node) ? moving.parent.node : null;

  if (placement === "inside") {
    if (
      !isItem(target.node) &&
      !isGroup(target.node) &&
      !hasBlockHead(target.node)
    ) {
      if (!state.schema.nodes.nested_block) return null;
      if (
        !["paragraph", "heading"].includes(target.node.type.name) ||
        !target.parent
      )
        return null;
      if (isItem(target.parent.node) && target.parent.children[0] === target)
        return null;
      const head = branch(target.node, target);
      target.node = state.schema.nodes.nested_block.create(null, target.node);
      target.children = [head];
    }
    detach(moving);
    if (isItem(moving.node)) {
      if (!sourceList) return null;
      const last = target.children.at(-1);
      if (last && last.node.type === sourceList.type) {
        attach(last, last.children.length, moving);
      } else {
        attach(target, target.children.length, listAround(moving, sourceList));
      }
    } else {
      attach(target, target.children.length, moving);
    }
    return moving;
  }

  detach(moving);
  const parent = target.parent;
  if (!parent) return null;
  const index =
    parent.children.indexOf(target) + (placement === "after" ? 1 : 0);

  if (isList(parent.node)) {
    if (isItem(moving.node) && parent.node.type.validContent(Fragment.from(materialize(moving)))) {
      attach(parent, index, moving);
    } else {
      // Keep a paragraph/heading's type when it is dropped between list rows:
      // split the surrounding list rather than silently turn it into a bullet.
      const container = parent.parent;
      if (!container) return null;
      const listIndex = container.children.indexOf(parent);
      const before = parent.children.slice(0, index);
      const after = parent.children.slice(index);
      container.children.splice(listIndex, 1);
      parent.parent = null;
      let insertion = listIndex;
      if (before.length) {
        const preceding: Branch = {
          node: parent.node,
          children: before,
          parent: container,
        };
        before.forEach((child) => {
          child.parent = preceding;
        });
        container.children.splice(insertion++, 0, preceding);
      }
      attach(container, insertion++, isItem(moving.node) && sourceList ? listAround(moving, sourceList) : moving);
      if (after.length) {
        let node = parent.node;
        if (node.type.name === "ordered_list") {
          node = node.type.create(
            { ...node.attrs, order: (node.attrs.order ?? 1) + index },
            node.content,
          );
        }
        const following: Branch = { node, children: after, parent: container };
        after.forEach((child) => {
          child.parent = following;
        });
        container.children.splice(insertion, 0, following);
      }
    }
  } else if (isItem(moving.node)) {
    if (!sourceList) return null;
    attach(parent, index, listAround(moving, sourceList));
  } else {
    attach(parent, index, moving);
  }
  return moving;
}

export function deleteEditorBlock(state: EditorState, position: number) {
  return deleteEditorBlocks(state, [position]);
}

/** Delete whole rows (including descendants) in one undoable transaction. */
export function deleteEditorBlocks(state: EditorState, positions: readonly number[]) {
  const rows = [...new Set(positions)]
    .sort((a, b) => a - b)
    .map((pos) => blockAtPos(state.doc, pos))
    .filter((row): row is EditorBlock => !!row);
  const selected = rows.filter((row, index) =>
    !rows.some((other, otherIndex) =>
      (other.pos !== row.pos || otherIndex < index) && isPrefix(other.path, row.path),
    ),
  );
  if (!selected.length) return null;
  const tree = branch(state.doc);
  // Resolve every branch before detaching, since sibling indices then change.
  const removing = selected.map((row) => getBranch(tree, row.path));
  removing.forEach(detach);
  return transactionFor(state, tree, undefined, selected[0].pos);
}

export function duplicateEditorBlock(state: EditorState, position: number) {
  const block = blockAtPos(state.doc, position);
  if (!block) return null;
  const tree = branch(state.doc);
  const target = getBranch(tree, block.path);
  const parent = target.parent;
  if (!parent) return null;
  const duplicate = branch(block.node);
  attach(parent, parent.children.indexOf(target) + 1, duplicate);
  return transactionFor(state, tree, duplicate);
}

export const indentEditorBlock: Command = (state, dispatch, view) => {
  if (state.selection.$from.parent.type.spec.code) return false;
  const block = blockAtPos(state.doc, state.selection.from);
  if (!block) return false;
  const parent = atPath(state.doc, block.path.slice(0, -1)).node;
  const index = block.path.at(-1)!;
  if (index === 0 || ((isGroup(parent) || hasBlockHead(parent)) && index === 1))
    return false;
  let previousPath = [...block.path.slice(0, -1), index - 1];
  let previous = atPath(state.doc, previousPath).node;
  if (isList(previous)) previousPath.push(previous.childCount - 1);
  const tr = moveEditorBlock(
    state,
    block.pos,
    atPath(state.doc, previousPath).pos,
    "inside",
  );
  if (!tr) return false;
  preserveRowCaret(state, tr);
  dispatch?.(tr);
  return true;
};

export const outdentEditorBlock: Command = (state, dispatch, view) => {
  if (state.selection.$from.parent.type.spec.code) return false;
  const block = blockAtPos(state.doc, state.selection.from);
  if (!block) return false;
  if (isItem(block.node)) {
    const container = atPath(state.doc, block.path.slice(0, -2));
    if (isItem(container.node)) {
      const tree = branch(state.doc);
      const moving = getBranch(tree, block.path);
      const sourceList = moving.parent!;
      const after = sourceList.children.slice(sourceList.children.indexOf(moving) + 1);
      if (after.length) {
        const last = moving.children.at(-1);
        const tail: Branch = last?.node.type === sourceList.node.type ? last : { node: sourceList.node, children: [], parent: null };
        for (const child of after) { detach(child); attach(tail, tail.children.length, child); }
        if (tail !== last) attach(moving, moving.children.length, tail);
      }
      const target = getBranch(tree, block.path.slice(0, -2));
      if (!moveBranch(state, moving, target, "after")) return false;
      const tr = transactionFor(state, tree, moving);
      if (!tr) return false;
      preserveRowCaret(state, tr);
      dispatch?.(tr);
      return true;
    }
    if (isGroup(container.node) || isItem(container.node) || hasBlockHead(container.node)) {
      const tr = moveEditorBlock(state, block.pos, container.pos, "after");
      if (!tr) return false;
      preserveRowCaret(state, tr);
      dispatch?.(tr);
      return true;
    }
    const tr = convertListItem(state, "text");
    if (!tr) return false;
    dispatch?.(tr);
    return true;
  }
  const parentPath = block.path.slice(0, -1);
  const parent = atPath(state.doc, parentPath);
  if (
    !isGroup(parent.node) &&
    !isItem(parent.node) &&
    !hasBlockHead(parent.node)
  )
    return false;
  if (block.path.at(-1) === 0) return false;
  if (isGroup(parent.node) || hasBlockHead(parent.node)) {
    const tree = branch(state.doc);
    const moving = getBranch(tree, block.path);
    const owner = moving.parent!;
    const container = owner.parent!;
    const following = owner.children.splice(owner.children.indexOf(moving) + 1);
    if (following.length) {
      if (!isGroup(moving.node)) {
        if (!["paragraph", "heading"].includes(moving.node.type.name))
          return false;
        const head = branch(moving.node, moving);
        moving.node = state.schema.nodes.nested_block.create(null, moving.node);
        moving.children = [head];
      }
      for (const child of following)
        attach(moving, moving.children.length, child);
    }
    detach(moving);
    attach(container, container.children.indexOf(owner) + 1, moving);
    const tr = transactionFor(state, tree, moving);
    if (!tr) return false;
    preserveRowCaret(state, tr);
    dispatch?.(tr);
    return true;
  }
  const tr = moveEditorBlock(state, block.pos, parent.pos, "after");
  if (!tr) return false;
  preserveRowCaret(state, tr);
  dispatch?.(tr);
  return true;
};

function preserveRowCaret(state: EditorState, tr: Transaction) {
  if (!state.selection.empty || !tr.selection.$from.parent.isTextblock) return;
  tr.setSelection(
    TextSelection.create(
      tr.doc,
      Math.min(
        tr.selection.$from.start() + state.selection.$from.parentOffset,
        tr.selection.$from.end(),
      ),
    ),
  );
}

/** At a row start, remove its list format before joining it to another row. */
export const backspaceEditorBlock: Command = (state, dispatch, view) => {
  const { selection } = state;
  if (
    !selection.empty ||
    !selection.$from.parent.isTextblock ||
    selection.$from.parentOffset !== 0 ||
    selection.$from.parent.type.spec.code
  )
    return false;
  const block = blockAtPos(state.doc, selection.from);
  if (!block) return false;
  if (isItem(block.node)) {
    const tr = convertListItem(state, "text");
    if (!tr) return false;
    dispatch?.(tr);
    return true;
  }
  const parent = atPath(state.doc, block.path.slice(0, -1)).node;
  if ((isGroup(parent) || isItem(parent)) && block.path.at(-1)! > 0)
    return outdentEditorBlock(state, dispatch, view);
  const previous = state.doc.resolve(block.pos).nodeBefore;
  if (block.node.type.name !== "paragraph" || !previous || !isList(previous))
    return false;
  let end = block.pos - 1;
  const before = block.pos - previous.nodeSize;
  previous.descendants((node, pos) => {
    if (node.isTextblock) end = before + pos + 2 + node.content.size;
  });
  const tr = state.tr.delete(block.pos, block.end);
  const join = end;
  if (block.node.content.size) tr.insert(join, block.node.content);
  tr.setSelection(TextSelection.create(tr.doc, join));
  dispatch?.(tr.scrollIntoView());
  return true;
};

/** Enter on an empty list row exits that row, rather than lifting its bullet. */
export const exitEmptyList: Command = (state, dispatch, view) => {
  if (!state.selection.empty || state.selection.$from.parent.content.size)
    return false;
  const block = blockAtPos(state.doc, state.selection.from);
  if (!block || !isItem(block.node)) return false;
  const container = atPath(state.doc, block.path.slice(0, -2)).node;
  if (isGroup(container) || isItem(container))
    return outdentEditorBlock(state, dispatch, view);
  const tr = convertListItem(state, "text");
  if (!tr) return false;
  dispatch?.(tr);
  return true;
};
