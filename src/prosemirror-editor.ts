import { Fragment, Slice, type Node as PMNode } from "prosemirror-model";
import {
  EditorState,
  Plugin,
  Selection,
  TextSelection,
  NodeSelection,
  type SelectionBookmark,
  type Transaction,
  type Command,
} from "prosemirror-state";
import {
  EditorView,
  Decoration,
  DecorationSet,
  type NodeView,
} from "prosemirror-view";
import {
  baseKeymap,
  chainCommands,
  setBlockType,
  toggleMark,
  wrapIn,
  lift,
  exitCode,
} from "prosemirror-commands";
import { history, undo, redo, closeHistory } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { undoInputRule } from "prosemirror-inputrules";
import {
  wrapInList,
  splitListItem,
  liftListItem,
} from "prosemirror-schema-list";
import { createElement, GripVertical, type IconNode } from "lucide";
import { editorSchema as schema } from "./editor-schema";
import {
  parseEditorMarkdown,
  serializeEditorMarkdown,
} from "./editor-markdown";
import {
  blockAtPos,
  moveEditorBlock,
  indentEditorBlock,
  backspaceEditorBlock,
  exitEmptyList,
  outdentEditorBlock,
  deleteEditorBlock,
  duplicateEditorBlock,
  type EditorBlock,
  type BlockPlacement,
} from "./editor-blocks";
import {
  createSlashPlugin,
  getSlashState,
  consumeSlash,
  cancelSlash,
  slashPluginKey,
} from "./editor-slash";
import {
  createPageNodeViews,
  linkRangeAtSelection,
  type LinkedPage,
} from "./editor-links";
import { renderMarkdown } from "./markdown";
import { markdownRules, itemAtSelection } from "./editor-input-rules";
import { convertListItem, convertTextblockToCode } from "./editor-convert";
import {
  parseNotionMarkdown,
  serializeNotionMarkdown,
} from "./notion-markdown";
import type { BodyFormat } from "./notion-syntax";
import { notionNodeViews, refreshEmbeddedToc } from "./notion-nodeviews";
import "katex/dist/katex.min.css";
import { moveTableCell, tableAppearance } from "./editor-table";

type BlockType =
  | "text"
  | "heading1"
  | "heading2"
  | "heading3"
  | "list"
  | "number"
  | "task"
  | "quote"
  | "code"
  | "divider";
interface Options {
  value: string;
  bodyFormat?: BodyFormat;
  pages: () => LinkedPage[];
  onChange: (value: string, format: BodyFormat) => void;
  onInsert: () => void;
  onError: (error: unknown) => void;
}

class ListItemView implements NodeView {
  dom = document.createElement("li");
  contentDOM = document.createElement("div");
  private checkbox?: HTMLInputElement;
  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.contentDOM.className = "pm-item-content";
    this.dom.append(this.contentDOM);
    this.render();
  }
  render() {
    if (typeof this.node.attrs.checked === "boolean") {
      this.dom.dataset.checked = String(this.node.attrs.checked);
      if (!this.checkbox) {
        this.checkbox = document.createElement("input");
        this.checkbox.type = "checkbox";
        this.checkbox.contentEditable = "false";
        this.checkbox.setAttribute("aria-label", "完成待办事项");
        this.checkbox.addEventListener("change", () => {
          const pos = this.getPos();
          if (pos === undefined) return;
          this.view.dispatch(
            this.view.state.tr.setNodeMarkup(pos, undefined, {
              ...this.node.attrs,
              checked: this.checkbox!.checked,
            }),
          );
        });
        this.dom.prepend(this.checkbox);
      }
      this.checkbox.checked = this.node.attrs.checked;
    } else {
      delete this.dom.dataset.checked;
      this.checkbox?.remove();
      this.checkbox = undefined;
    }
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }
  stopEvent(event: Event) {
    return event.target === this.checkbox;
  }
  ignoreMutation(mutation: { type: string; target: Node }) {
    return (
      mutation.type !== "selection" &&
      (mutation.target === this.dom || mutation.target === this.checkbox)
    );
  }
}

/** A single ProseMirror document owns selection, history and nested block edits. */
export class BlockEditor {
  private view: EditorView;
  private bookmark?: SelectionBookmark;
  private abort = new AbortController();
  private handle = document.createElement("button");
  private dropLine = document.createElement("div");
  private hovered: EditorBlock | null = null;
  private dragFrom: number | null = null;
  private handlePressed = false;
  private dropTarget: { block: EditorBlock; placement: BlockPlacement } | null =
    null;
  private menu?: HTMLElement;
  private linkDialog?: HTMLDialogElement;
  private destroyed = false;
  private folded = new Set<number>();
  private bodyFormat: BodyFormat;

  constructor(
    private root: HTMLElement,
    private options: Options,
  ) {
    this.bodyFormat = options.bodyFormat || "markdown";
    root.classList.add("pm-editor");
    const self = this;
    const placeholder = new Plugin({
      props: {
        decorations(state) {
          const decorations: Decoration[] = [];
          const { $from } = state.selection;
          if (
            $from.parent.type === schema.nodes.paragraph &&
            !$from.parent.content.size
          )
            decorations.push(
              Decoration.node($from.before(), $from.after(), {
                "data-placeholder": "输入文字，或按「/」选择块类型",
              }),
            );
          state.doc.forEach((node, pos) => {
            if (!self.folded.has(pos) || node.type !== schema.nodes.heading)
              return;
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: "pm-folded-heading",
                title: "此标题已折叠，可从块菜单展开",
              }),
            );
            let next = pos + node.nodeSize;
            while (next < state.doc.content.size) {
              const following = state.doc.nodeAt(next)!;
              if (
                following.type === schema.nodes.heading &&
                following.attrs.level <= node.attrs.level
              )
                break;
              decorations.push(
                Decoration.node(next, next + following.nodeSize, {
                  class: "pm-folded-content",
                }),
              );
              next += following.nodeSize;
            }
          });
          return DecorationSet.create(state.doc, decorations);
        },
      },
    });
    const splitItem: Command = (state, dispatch) => {
      const item = itemAtSelection(state);
      return splitListItem(
        schema.nodes.list_item,
        item?.node.attrs.checked !== null ? { checked: false } : undefined,
      )(state, dispatch);
    };
    const keys: Record<string, Command> = {
      "Mod-z": undo,
      "Shift-Mod-z": redo,
      "Mod-y": redo,
      "Mod-b": toggleMark(schema.marks.strong),
      "Mod-i": toggleMark(schema.marks.em),
      "Mod-u": toggleMark(schema.marks.underline),
      "Mod-`": toggleMark(schema.marks.code),
      "Mod-k": () => {
        this.showLinkEditor();
        return true;
      },
      "Mod-Enter": (state, dispatch) => {
        const item = itemAtSelection(state);
        if (typeof item?.node.attrs.checked !== "boolean")
          return exitCode(state, dispatch);
        dispatch?.(
          state.tr.setNodeMarkup(item.pos, undefined, {
            ...item.node.attrs,
            checked: !item.node.attrs.checked,
          }),
        );
        return true;
      },
      Enter: chainCommands(exitEmptyList, splitItem, baseKeymap.Enter),
      "Shift-Enter": (state, dispatch) => {
        if (!state.selection.$from.parent.isTextblock) return false;
        dispatch?.(
          (state.selection.$from.parent.type.spec.code
            ? state.tr.insertText("\n")
            : state.tr.replaceSelectionWith(schema.nodes.hard_break.create())
          ).scrollIntoView(),
        );
        return true;
      },
      Tab: (state, dispatch, view) => {
        if (moveTableCell(1)(state, dispatch, view)) return true;
        indentEditorBlock(state, dispatch, view);
        return true;
      },
      "Shift-Tab": (state, dispatch, view) => {
        if (moveTableCell(-1)(state, dispatch, view)) return true;
        outdentEditorBlock(state, dispatch, view);
        return true;
      },
      Backspace: (_state, _dispatch, view) => {
        // Native Home/arrow selection may precede selectionchange on Windows.
        // Read it before choosing between removing a marker and joining rows.
        const active = view || this.view;
        (active as unknown as { domObserver: { flush(): void } }).domObserver.flush();
        return chainCommands(backspaceEditorBlock, undoInputRule, baseKeymap.Backspace)(active.state, active.dispatch, active);
      },
    };
    this.view = new EditorView(root, {
      state: EditorState.create({
        schema,
        doc:
          this.bodyFormat === "notion-markdown"
            ? parseNotionMarkdown(options.value)
            : parseEditorMarkdown(options.value),
        plugins: [
          history(),
          tableAppearance(),
          createSlashPlugin((match) =>
            queueMicrotask(() => {
              if (this.destroyed) return;
              if (
                match &&
                getSlashState(this.view.state) &&
                !document.querySelector("#dialog")
              )
                this.options.onInsert();
              this.root.dispatchEvent(
                new CustomEvent("editor-slash-update", { bubbles: true }),
              );
            }),
          ),
          markdownRules(),
          keymap(keys),
          keymap(baseKeymap),
          placeholder,
        ],
      }),
      attributes: {
        class: "pm-document",
        "aria-label": "笔记正文",
        role: "textbox",
        "aria-multiline": "true",
        spellcheck: "false",
      },
      nodeViews: {
        ...notionNodeViews(),
        ...createPageNodeViews(options.pages),
        list_item: (node, view, getPos) => new ListItemView(node, view, getPos),
        opaque_block: (node) => {
          const dom = document.createElement("div");
          dom.className = "pm-preserved-block";
          dom.contentEditable = "false";
          // The shared renderer disables raw HTML and escapes custom syntax.
          dom.innerHTML = renderMarkdown(node.attrs.raw, options.pages());
          return { dom, ignoreMutation: () => true };
        },
      },
      dispatchTransaction: (tr) => this.dispatch(tr),
      handlePaste: (view, event) => {
        const plain = event.clipboardData?.getData("text/plain");
        if (!plain || event.clipboardData?.getData("text/html")) return false;
        if (view.state.selection.$from.parent.type.spec.code) return false;
        this.bookmark = undefined;
        this.insertValue(plain);
        return true;
      },
      handleDrop: (_view, event) => {
        if (this.dragFrom === null) return false;
        this.finishDrop(event);
        return true;
      },
    });
    refreshEmbeddedToc(this.view);
    this.handle.className = "pm-block-handle";
    this.handle.type = "button";
    this.handle.draggable = true;
    this.handle.setAttribute("aria-label", "拖动块，点击打开菜单");
    this.handle.title = "拖动以移动 · 点击打开菜单";
    this.handle.append(
      createElement(GripVertical as IconNode, {
        width: 18,
        height: 18,
        "stroke-width": 1.7,
      }),
    );
    this.dropLine.className = "pm-drop-line";
    this.root.append(this.handle, this.dropLine);
    const signal = this.abort.signal;
    document.addEventListener("pointermove", (event) => this.hover(event), {
      signal,
    });
    this.handle.addEventListener(
      "pointerdown",
      () => {
        this.handlePressed = true;
      },
      { signal },
    );
    document.addEventListener(
      "pointerup",
      () => {
        this.handlePressed = false;
      },
      { signal },
    );
    this.handle.addEventListener("click", () => this.showBlockMenu(), {
      signal,
    });
    this.handle.addEventListener(
      "dragstart",
      (event) => {
        if (!this.hovered || !event.dataTransfer) return;
        this.closeMenu();
        this.dragFrom = this.hovered.pos;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(
          "application/x-notdown-block",
          String(this.dragFrom),
        );
        event.dataTransfer.setData("text/plain", this.hovered.node.textContent);
        const dom = this.view.nodeDOM(this.dragFrom);
        if (dom instanceof HTMLElement)
          event.dataTransfer.setDragImage(dom, 0, 0);
        this.root.classList.add("pm-dragging");
      },
      { signal },
    );
    this.root.addEventListener("dragover", (event) => this.previewDrop(event), {
      signal,
    });
    this.root.addEventListener("drop", (event) => this.finishDrop(event), {
      signal,
    });
    document.addEventListener("dragend", () => this.resetDrag(), { signal });
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (
          !this.menu?.contains(event.target as Node) &&
          !this.handle.contains(event.target as Node)
        )
          this.closeMenu();
      },
      { signal },
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          this.closeMenu();
          this.handle.classList.remove("visible");
        }
      },
      { signal },
    );
    document.querySelector("#main")?.addEventListener(
      "scroll",
      () => {
        this.closeMenu();
        this.handle.classList.remove("visible");
      },
      { signal },
    );
  }

  private dispatch(tr: Transaction) {
    if (this.destroyed) return;
    try {
      if (this.bookmark) this.bookmark = this.bookmark.map(tr.mapping);
      this.folded = new Set(
        [...this.folded].flatMap((pos) => {
          const mapped = tr.mapping.mapResult(pos);
          return mapped.deleted ? [] : [mapped.pos];
        }),
      );
      const result = this.view.state.applyTransaction(tr);
      this.view.updateState(result.state);
      if (result.transactions.some((change) => change.docChanged)) refreshEmbeddedToc(this.view);
      if (result.transactions.some((change) => change.docChanged)) {
        if (this.dragFrom !== null) this.resetDrag();
        this.bodyFormat = "notion-markdown";
        this.options.onChange(
          serializeNotionMarkdown(result.state.doc),
          this.bodyFormat,
        );
        this.handle.classList.remove("visible");
        this.hovered = null;
      }
    } catch (error) {
      this.options.onError(error);
    }
  }

  getValue(): string {
    // Before page/source switches, include DOM input whose MutationObserver
    // callback has not run yet. This is the only pinned PM internal adapter.
    if (!this.isComposing())
      (
        this.view as unknown as { domObserver: { flush(): void } }
      ).domObserver.flush();
    return this.bodyFormat === "notion-markdown"
      ? serializeNotionMarkdown(this.view.state.doc)
      : serializeEditorMarkdown(this.view.state.doc);
  }
  getBodyFormat(): BodyFormat {
    return this.bodyFormat;
  }
  isComposing() {
    return (
      this.view.composing ||
      !!slashPluginKey.getState(this.view.state)?.composing
    );
  }
  revealHeading(heading: HTMLElement) {
    if (this.destroyed || !this.view.dom.contains(heading)) return;
    for (let parent = heading.parentElement; parent && parent !== this.view.dom; parent = parent.parentElement) {
      if (parent.classList.contains("pm-toggle-closed")) parent.querySelector<HTMLButtonElement>(":scope > .pm-toggle-chevron")?.click();
    }
    const target = this.view.posAtDOM(heading, 0);
    const ancestors: { pos: number; level: number }[] = [];
    this.view.state.doc.forEach((node, pos) => {
      if (pos > target || node.type !== schema.nodes.heading) return;
      while (ancestors.length && ancestors.at(-1)!.level >= node.attrs.level)
        ancestors.pop();
      ancestors.push({ pos, level: node.attrs.level });
    });
    let revealed = false;
    for (const ancestor of ancestors)
      if (this.folded.delete(ancestor.pos)) revealed = true;
    if (revealed)
      this.view.dispatch(this.view.state.tr.setMeta("addToHistory", false));
  }
  focus() {
    this.restoreSelection();
    this.view.focus();
  }
  captureSelection() {
    this.bookmark = this.view.state.selection.getBookmark();
  }
  private restoreSelection() {
    if (!this.bookmark) return;
    const bookmark = this.bookmark;
    this.bookmark = undefined;
    try {
      this.view.dispatch(
        this.view.state.tr.setSelection(bookmark.resolve(this.view.state.doc)),
      );
    } catch {
      /* The current selection remains valid if the saved block disappeared. */
    }
  }
  getSlashQuery() {
    return getSlashState(this.view.state)?.query ?? null;
  }
  consumeSlash() {
    consumeSlash(this.view);
  }
  cancelSlash() {
    if (!this.destroyed) cancelSlash(this.view);
  }

  insertValue(markdown: string) {
    if (this.view.hasFocus()) this.bookmark = undefined;
    else this.restoreSelection();
    const doc = parseNotionMarkdown(markdown);
    const inline =
      doc.childCount === 1 && doc.firstChild?.type === schema.nodes.paragraph;
    const slice = inline
      ? new Slice(doc.firstChild!.content, 0, 0)
      : new Slice(doc.content, 0, 0);
    const tr = this.view.state.tr.replaceSelection(slice).scrollIntoView();
    this.view.dispatch(tr);
    this.bookmark = undefined;
    this.view.focus();
  }

  private run(command: Command) {
    return command(this.view.state, this.view.dispatch, this.view);
  }

  insertBlockType(type: BlockType) {
    this.restoreSelection();
    this.bookmark = undefined;
    const state = this.view.state;
    const item = itemAtSelection(state);
    if (item && type !== "divider") {
      const tr = convertListItem(state, type);
      if (tr) this.view.dispatch(tr.scrollIntoView());
      this.view.focus();
      return;
    }
    if (type === "code") {
      const tr = convertTextblockToCode(state);
      if (tr) this.view.dispatch(tr.scrollIntoView());
      this.view.focus();
      return;
    }
    if (["list", "number", "task"].includes(type)) {
      const listType =
        type === "number"
          ? schema.nodes.ordered_list
          : schema.nodes.bullet_list;
      if (!state.selection.$from.parent.isTextblock)
        this.run(setBlockType(schema.nodes.paragraph));
      this.run(wrapInList(listType));
      const created = itemAtSelection(this.view.state);
      if (created && type === "task")
        this.view.dispatch(
          this.view.state.tr.setNodeMarkup(created.pos, undefined, {
            ...created.node.attrs,
            checked: false,
          }),
        );
    } else {
      if (item) this.run(liftListItem(schema.nodes.list_item));
      if (type === "quote") this.run(wrapIn(schema.nodes.blockquote));
      else if (type === "divider") {
        const tr = this.view.state.tr
          .replaceSelectionWith(schema.nodes.horizontal_rule.create())
          .scrollIntoView();
        const after = Math.min(tr.selection.to, tr.doc.content.size);
        if (after === tr.doc.content.size)
          tr.insert(after, schema.nodes.paragraph.create());
        tr.setSelection(
          Selection.near(
            tr.doc.resolve(Math.min(after + 1, tr.doc.content.size)),
          ),
        );
        this.view.dispatch(tr);
      } else {
        const target = type.startsWith("heading")
          ? schema.nodes.heading
          : schema.nodes.paragraph;
        if (
          type === "text" &&
          this.view.state.selection.$from.parent.type === target
        )
          this.run(lift);
        this.run(
          setBlockType(
            target,
            type.startsWith("heading")
              ? { level: Number(type.slice(-1)) }
              : undefined,
          ),
        );
      }
    }
    this.view.focus();
  }

  private rowRect(block: EditorBlock) {
    const dom = this.view.nodeDOM(block.pos);
    if (!(dom instanceof HTMLElement)) return null;
    const row =
      ["nested_block", "toggle_block", "callout", "synced_block", "blockquote"].includes(block.node.type.name)
        ? dom.querySelector(".pm-toggle-content > :first-child") || dom.firstElementChild || dom
        : block.node.type === schema.nodes.list_item
          ? dom.querySelector(".pm-item-content > p") || dom
          : dom;
    return row.getBoundingClientRect();
  }

  private candidate(x: number, y: number): EditorBlock | null {
    const bounds = this.view.dom.getBoundingClientRect();
    if (
      y < bounds.top - 3 ||
      y > bounds.bottom + 3 ||
      x < bounds.left - 52 ||
      x > bounds.right + 24
    )
      return null;
    const hit = this.view.posAtCoords({
      left: Math.max(bounds.left + 1, Math.min(x, bounds.right - 1)),
      top: y,
    });
    const block = hit ? blockAtPos(this.view.state.doc, hit.pos) : null;
    if (!block) return null;
    // posAtCoords in the indentation gutter may resolve to a parent. Pick the
    // deepest visible row on this line, so a nested child is independently draggable.
    let best = block;
    this.view.state.doc.descendants((node, pos) => {
      if (
        !node.isBlock ||
        ["bullet_list", "ordered_list", "column", "doc"].includes(
          node.type.name,
        )
      )
        return;
      const candidate = blockAtPos(this.view.state.doc, pos);
      if (!candidate || candidate.pos !== pos) return;
      const rect = this.rowRect(candidate);
      if (
        rect &&
        rect.height &&
        y >= rect.top &&
        y <= rect.bottom &&
        x >= rect.left - 52 &&
        candidate.depth >= best.depth
      )
        best = candidate;
    });
    return best;
  }

  private hover(event: PointerEvent) {
    if (
      this.handlePressed ||
      this.dragFrom !== null ||
      this.menu ||
      this.destroyed
    )
      return;
    if (this.handle.contains(event.target as Node)) return;
    if ((event.target as Element).closest?.(".pm-toggle-chevron")) {
      this.handle.classList.remove("visible");
      return;
    }
    const block = this.candidate(event.clientX, event.clientY);
    const rect = block && this.rowRect(block);
    if (
      !block ||
      !rect ||
      event.clientX > rect.left + 16 ||
      event.clientX < rect.left - 44
    ) {
      this.handle.classList.remove("visible");
      return;
    }
    this.hovered = block;
    const rootRect = this.root.getBoundingClientRect();
    const toggle = (this.view.nodeDOM(block.pos) as HTMLElement | null)?.classList?.contains("pm-toggle");
    this.handle.style.left = `${rect.left - rootRect.left - (toggle ? 52 : block.node.type === schema.nodes.list_item ? 43 : 28)}px`;
    this.handle.style.top = `${rect.top - rootRect.top + Math.max(0, (Math.min(rect.height, 32) - 24) / 2)}px`;
    this.handle.dataset.blockPos = String(block.pos);
    this.handle.classList.add("visible");
  }

  private previewDrop(event: DragEvent) {
    if (this.dragFrom === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const block = this.candidate(event.clientX, event.clientY);
    const rect = block && this.rowRect(block);
    if (!block || !rect) {
      this.dropTarget = null;
      this.dropLine.classList.remove("visible");
      return;
    }
    const placement: BlockPlacement =
      [
        schema.nodes.list_item,
        schema.nodes.nested_block,
        schema.nodes.paragraph,
        schema.nodes.heading,
        schema.nodes.toggle_block,
        schema.nodes.callout,
        schema.nodes.synced_block,
        schema.nodes.blockquote,
      ].includes(block.node.type) && event.clientX > rect.left + 36
        ? "inside"
        : event.clientY < rect.top + rect.height / 2
          ? "before"
          : "after";
    this.dropTarget = { block, placement };
    const source = blockAtPos(this.view.state.doc, this.dragFrom);
    if (!source || (block.pos >= source.pos && block.pos < source.end)) {
      this.dropTarget = null;
      this.dropLine.classList.remove("visible");
      return;
    }
    const rootRect = this.root.getBoundingClientRect();
    const offset = placement === "inside" ? 24 : 0;
    this.dropLine.style.left = `${rect.left - rootRect.left + offset}px`;
    this.dropLine.style.top = `${(placement === "before" ? rect.top : rect.bottom) - rootRect.top}px`;
    this.dropLine.style.width = `${rect.width - offset}px`;
    this.dropLine.classList.add("visible");
  }

  private finishDrop(event: DragEvent) {
    if (this.dragFrom === null) return;
    event.preventDefault();
    event.stopPropagation();
    this.previewDrop(event);
    if (this.dropTarget) {
      const tr = moveEditorBlock(
        this.view.state,
        this.dragFrom,
        this.dropTarget.block.pos,
        this.dropTarget.placement,
      );
      if (tr) this.view.dispatch(closeHistory(tr).scrollIntoView());
    }
    this.resetDrag();
    this.view.focus();
  }
  private resetDrag() {
    this.handlePressed = false;
    this.dragFrom = null;
    this.dropTarget = null;
    this.dropLine.classList.remove("visible");
    this.root.classList.remove("pm-dragging");
    this.handle.classList.remove("visible");
  }
  private closeMenu() {
    this.menu?.remove();
    this.menu = undefined;
    this.handle.classList.remove("menu-open");
  }

  private showBlockMenu() {
    if (!this.hovered) return;
    this.closeMenu();
    const block = this.hovered;
    const menu = document.createElement("div");
    menu.className = "pm-block-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "块操作");
    const add = (title: string, action: () => void, hint = "") => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.textContent = title;
      if (hint) {
        const kbd = document.createElement("kbd");
        kbd.textContent = hint;
        button.append(kbd);
      }
      button.addEventListener("click", () => {
        action();
        this.closeMenu();
        this.view.focus();
      });
      menu.append(button);
    };
    const choose = () => {
      const pos = Math.min(
        block.pos + (block.node.type === schema.nodes.list_item ? 2 : 1),
        this.view.state.doc.content.size,
      );
      this.view.dispatch(
        this.view.state.tr.setSelection(
          block.node.isAtom
            ? NodeSelection.create(this.view.state.doc, block.pos)
            : Selection.near(this.view.state.doc.resolve(pos)),
        ),
      );
      this.bookmark = undefined;
    };
    const label = document.createElement("small");
    label.textContent = "转换为";
    menu.append(label);
    for (const [type, title] of [
      ["text", "文本"],
      ["heading1", "标题 1"],
      ["heading2", "标题 2"],
      ["heading3", "标题 3"],
      ["list", "项目符号列表"],
      ["number", "编号列表"],
      ["task", "待办事项"],
      ["quote", "引用"],
      ["code", "代码"],
    ] as [BlockType, string][])
      add(title, () => {
        choose();
        this.insertBlockType(type);
      });
    menu.append(document.createElement("hr"));
    if (block.node.type === schema.nodes.heading)
      add(this.folded.has(block.pos) ? "展开标题" : "折叠标题", () => {
        if (this.folded.has(block.pos)) this.folded.delete(block.pos);
        else this.folded.add(block.pos);
        this.view.dispatch(this.view.state.tr.setMeta("addToHistory", false));
      });
    add("复制块", () => {
      const tr = duplicateEditorBlock(this.view.state, block.pos);
      if (tr) this.view.dispatch(closeHistory(tr));
    });
    add("删除", () => {
      const tr = deleteEditorBlock(this.view.state, block.pos);
      if (tr) this.view.dispatch(closeHistory(tr));
    });
    document.body.append(menu);
    const rect = this.handle.getBoundingClientRect();
    menu.style.left = `${Math.max(8, rect.left)}px`;
    menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menu.offsetHeight - 12))}px`;
    this.menu = menu;
    this.handle.classList.add("menu-open");
    menu.querySelector("button")?.focus();
  }

  private showLinkEditor() {
    this.captureSelection();
    this.linkDialog?.remove();
    const { selection } = this.view.state;
    const linkRange = linkRangeAtSelection(this.view.state);
    const link = linkRange?.mark;
    const dialog = document.createElement("dialog");
    dialog.className = "pm-link-dialog";
    const form = document.createElement("form");
    form.method = "dialog";
    const label = document.createElement("label");
    label.textContent = "链接";
    const input = document.createElement("input");
    input.type = "url";
    input.placeholder = "粘贴链接…";
    input.value = link?.attrs.href || "";
    input.setAttribute("aria-label", "链接地址");
    label.append(input);
    form.append(label);
    const submit = document.createElement("button");
    submit.textContent = "应用";
    submit.type = "submit";
    form.append(submit);
    const remove = document.createElement("button");
    remove.textContent = "移除链接";
    remove.type = "button";
    form.append(remove);
    const apply = (href: string) => {
      this.restoreSelection();
      this.bookmark = undefined;
      const state = this.view.state;
      let { from, to } = state.selection;
      const range = linkRangeAtSelection(state);
      if (from === to && range) {
        from = range.from;
        to = range.to;
      }
      let tr = state.tr.removeMark(from, to, schema.marks.link);
      if (href && from === to)
        tr = tr.replaceSelectionWith(
          schema.text(href, [schema.marks.link.create({ href })]),
        );
      else if (href) tr.addMark(from, to, schema.marks.link.create({ href }));
      this.view.dispatch(tr);
      dialog.close();
      this.view.focus();
    };
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (input.value.trim()) apply(input.value.trim());
    });
    remove.addEventListener("click", () => apply(""));
    dialog.addEventListener("close", () => dialog.remove());
    dialog.append(form);
    document.body.append(dialog);
    this.linkDialog = dialog;
    dialog.showModal();
    input.focus();
  }

  destroy() {
    this.destroyed = true;
    this.abort.abort();
    this.closeMenu();
    this.linkDialog?.remove();
    this.view.destroy();
    this.handle.remove();
    this.dropLine.remove();
  }
}
