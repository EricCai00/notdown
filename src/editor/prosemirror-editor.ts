import { vaultAssetUrl } from "../shared/vault-url";
import { editorKind, isEditorKind } from "../document/node-identity";
import { removedChildPages } from "./child-page-deletion";
import { insertFormats } from "./insert-format";
import { inlineColors } from "../document/notion-syntax";
import { localAssetPath } from "../features/assets/asset-model";
import { inlineColorTransaction, selectedInlineColor, type InlineColorKind } from "./inline-colors";
import { internalReference, resolveReferencePage, type InternalReference, type ReferenceSyntax } from "../document/internal-reference";
import { ExternalMentionView } from "../features/references/external-view";
import { referenceOccurrences, type ReferenceOccurrenceTarget } from "../features/references/reference-occurrences";
import { externalLibrary } from "../features/references/external-client";
import { findReferenceLocation } from "../document/reference-locations";
import { showLinkPicker } from "./link-picker";
import { isListItem } from "../document/list-items";
import { hasSupplementalAttributes, needsMarkdownTable } from "../document/notdown-boundary";
import { localObjectPlugins } from "../markdown-engine/presets";
import { officialNotionObject } from "../document/notion-official-blocks";
import { footnotePresentation, projectFootnotes, restoreFootnotes, newFootnote, footnoteChoices, type FootnoteInput } from "./footnotes";
import "./footnotes.css";
import { citationCleanup } from "./citations";
import { PageMetadataView, protectPageMetadata } from "../features/metadata/page-metadata-view";
import { replacePandocTitle } from "../features/metadata/pandoc-page-title";
import { metadataSourceTransaction } from "../features/metadata/metadata-source";
import { preserveSelectionDecorations } from "./block-selection";
import { objectNodeViews } from "./object-views";
import { syncedEditing, wrapSyncedBlocks } from "../blocks/synced-editing";
import { flushSyncedBlocks } from "../blocks/synced-block-view";
import { flushDatabaseViews, databaseViewsDirty } from "../blocks/database-view";
import { LinkPreviewView } from "../features/links/link-preview-view";
import { DateMentionView } from "../features/dates/date-view";
import { dateMentionInput } from "../features/dates/date-input";
import { PersonMentionView } from "../features/people/person-view";
import { personId } from "../features/people/person";
import "../features/people/people.css";
import "../features/dates/date.css";
import { linkPaste } from "../features/links/link-paste";
import { linkTarget } from "../features/links/link-preview";
import { bookmarkUrl } from "../features/bookmarks/bookmark";
import "../features/links/link-preview.css";
import "./object-styles.css";
import "./block-spacing.css";
import "../blocks/breadcrumb.css";
import { contentCommand } from "../document/content-objects";
import { latexMacroEditing } from "../markdown-engine/latex-macros";
import { tableControls } from "./table-controls";
import { tableColumnWidths } from "./table-column-widths";
import { tableSelections } from "./table-selection";
import { imageView } from "./image-view";
import { insertInlineObject, type InlineInsertion } from "../document/inline-objects";
import { objectProperties } from "./object-properties";
import { inlineContextMenu } from "./inline-context-menu";
import { blockProperties, blockPropertyFields, openBlockProperties } from "./block-properties";
import { definitionControls } from "./definition-commands";
import { markProperties } from "./mark-properties";
import { selectionMenu } from "./selection-menu";
import { selectionBlock, selectionBlockAction, type SelectionBlockAction } from "./selection-block-actions";
import { editTable, type TableAction } from "./table-commands";
import { installTouchBlockDrag } from "./touch-block-drag";
import { blockSource, openBlockSource } from "./block-source";
import { exampleLists } from "./example-lists";
import { numberedListDisplayPlugin } from "./numbered-list-display";
import { exampleReferenceInput } from "./example-reference-input";
import "./example-reference-input.css";
import {
  Fragment,
  Slice,
  DOMSerializer,
  type Node as PMNode,
} from "prosemirror-model";
const importSyntaxDOM = (spec: import("prosemirror-model").DOMOutputSpec) =>
  DOMSerializer.renderSpec(document, spec).dom as HTMLElement;
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
import { HtmlBlockView, htmlInlineView, isHtmlBlock } from "../markdown-engine/html-view.js";
import { inTableCell, tableEditing, tableLineBreak } from "./editor-table.js";
import { lineBlockEnter } from "./line-block.js";
import { toggleHeadingEnter } from "./toggle-heading";
import {
  SyntaxBlockView,
  inlineTransclusionView,
  refreshProductViews,
} from "../markdown-engine/product-view.js";
import {
  wrapInList,
  splitListItem,
} from "prosemirror-schema-list";
import { createElement, GripVertical, Plus, type IconNode } from "lucide";
import { blockTypeLabel } from "../catalog/block-catalog-data";
import { editorSchema as schema } from "../document/editor-schema";
import {
  parseEditorMarkdown,
  serializeEditorMarkdown,
} from "../document/editor-markdown";
import {
  blockAtPos,
  moveEditorBlocks,
  indentEditorBlock,
  backspaceEditorBlock,
  exitEmptyList,
  outdentEditorBlock,
  deleteEditorBlock,
  deleteEditorBlocks,
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
import { renderMarkdown } from "../document/markdown";
import { markdownRules, itemAtSelection, mathBlockEnter } from "./editor-input-rules";
import { codeFenceInput } from "./code-fence-input";
import { commentInput } from "./comment-input";
import { pageReferenceInput, type InputPage, type PageInputOptions } from "./page-reference-input";
import "./page-reference-input.css";
import { lastCodeLanguage } from "./code-input-preferences";
import { symbolReplacementPlugin } from "./symbol-replacements";
import { emojiInput } from "./emoji-input";
import "./emoji-input.css";
import { convertListItem, convertTextblockToCode } from "./editor-convert";
import {
  parseNotionMarkdown,
  serializeNotionMarkdown,
} from "../document/notion-markdown";
import type { BodyFormat } from "../document/notion-syntax";
import { notionNodeViews, refreshEmbeddedToc } from "./notion-nodeviews";
import { refreshAlertViews } from "../blocks/alert-view";
import { EmbedView } from "../blocks/embed-view";
import { CodeBlockView, refreshCodeBlockViews } from "./code-block-view";
import { ImageBlockView } from "./image-block-view";
import { RChunkView, rInlineView } from "./rmarkdown-view";
import { codeHighlighting } from "./code-highlighting";
import { inlineMarkNavigation } from "./inline-mark-navigation";
import "./inline-mark-navigation.css";
import "katex/dist/katex.min.css";
import { moveTableCell, tableAppearance } from "./editor-table";

type BlockType =
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
  | "code"
  | "divider";
interface Options {
  interactionMode?: "desktop" | "touch";
  canTouchDrag?: () => boolean;
  metadataHost?: HTMLElement;
  value: string;
  bodyFormat?: BodyFormat;
  pages: () => LinkedPage[];
  recentPages?: () => string[];
  currentPage?: () => import("../blocks/breadcrumb-view").BreadcrumbPage | undefined;
  onChange: (value: string, format: BodyFormat) => void;
  onSavePage?: () => Promise<boolean>;
  onInsert: () => void;
  onError: (error: unknown) => void;
  codec?: {
    parse(source: string): PMNode;
    serialize(doc: PMNode): string;
    format: BodyFormat;
  };
  onDocumentChange?: (doc: PMNode, isolateHistory?: boolean) => void;
  onHistory?: (direction: "undo" | "redo") => boolean;
  canCommand?: (name: string) => boolean;
  onOpenPage?: (id: string, reference?: InternalReference) => void;
  onCreatePage?: (title: string, parent: string | null) => Promise<InputPage | null>;
  onDeleteChildPages?: (ids: string[], isCurrent: () => boolean) => Promise<boolean>;
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
    this.dom.dataset.listItem = editorKind(this.node).replace("_list_item", "");
    if (isEditorKind(this.node, "example_list_item")) {
      this.dom.dataset.exampleLabel = this.node.attrs.label;
      this.dom.value = this.node.attrs.number;
      if (this.node.attrs.referenceId) this.dom.id = this.node.attrs.referenceId;
      else this.dom.removeAttribute("id");
    }
    if (typeof this.node.attrs.checked === "boolean") {
      this.dom.dataset.checked = String(this.node.attrs.checked);
      if (!this.checkbox) {
        this.checkbox = document.createElement("input");
        this.checkbox.type = "checkbox";
        this.checkbox.contentEditable = "false";
        this.checkbox.setAttribute("aria-label", "Complete to-do");
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
  private sourceProjection?: { source: PMNode; doc: PMNode };
  private view: EditorView;
  private bookmark?: SelectionBookmark;
  private abort = new AbortController();
  private handle = document.createElement("button");
  private addButton = document.createElement("button");
  private marquee = document.createElement("div");
  private selectedBlocks = new Set<number>();
  private selectionLayer = document.createElement("div");
  private selectionResize?: ResizeObserver;
  private selectionObserved = new Set<Element>();
  private selectionFrame = 0;
  private boxStart: {
    x: number; y: number;
    pointerX: number; pointerY: number;
    moved: boolean;
  } | null = null;
  private dropLine = document.createElement("div");
  private hovered: EditorBlock | null = null;
  private dragFrom: number | null = null;
  private handlePressed = false;
  private dropTarget: { block: EditorBlock; placement: BlockPlacement } | null =
    null;
  private menu?: HTMLElement;
  private linkDialog?: HTMLDialogElement;
  private sourceDialog?: HTMLDialogElement;
  private destroyed = false;
  private stopTouchDrag?: () => void;
  private confirmingChildDeletion = false;
  private folded = new Set<number>();
  private bodyFormat: BodyFormat;

  constructor(
    private root: HTMLElement,
    private options: Options,
  ) {
    this.bodyFormat = options.bodyFormat || "markdown";
    const pageInput: PageInputOptions = {
      pages: options.pages, currentPage: options.currentPage,
      allow: command => options.canCommand?.(command) ?? false,
      create: options.onCreatePage, onError: options.onError,
    };
    root.classList.add("pm-editor");
    const self = this;
    const placeholder = new Plugin({
      props: {
        decorations(state) {
          const decorations: Decoration[] = [];
          for (const pos of self.selectedBlocks) {
            const node = state.doc.nodeAt(pos);
            if (node)
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: "pm-block-selected",
                }),
              );
          }
          const { $from } = state.selection;
          if (
            $from.parent.type === schema.nodes["block.paragraph"] &&
            !$from.parent.content.size &&
            !inTableCell(state)
          )
            decorations.push(
              Decoration.node($from.before(), $from.after(), {
                "data-placeholder": "Type text, or press / to choose a block",
              }),
            );
          state.doc.forEach((node, pos) => {
            if (!self.folded.has(pos) || !isEditorKind(node, "heading"))
              return;
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: "pm-folded-heading",
                title:
                  "This heading is collapsed. Expand it from the block menu.",
              }),
            );
            let next = pos + node.nodeSize;
            while (next < state.doc.content.size) {
              const following = state.doc.nodeAt(next)!;
              if (
                isEditorKind(following, "heading") &&
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
      if (!item) return false;
      return splitListItem(
        item.node.type,
        item?.node.attrs.checked !== null ? { checked: false } : undefined,
      )(state, dispatch);
    };
    const keys: Record<string, Command> = {
      "Mod-z": (state, dispatch, view) =>
        options.onHistory
          ? options.onHistory("undo")
          : undo(state, dispatch, view),
      "Shift-Mod-z": (state, dispatch, view) =>
        options.onHistory
          ? options.onHistory("redo")
          : redo(state, dispatch, view),
      "Mod-y": (state, dispatch, view) =>
        options.onHistory
          ? options.onHistory("redo")
          : redo(state, dispatch, view),
      "Mod-b": toggleMark(schema.marks.strong),
      "Mod-i": toggleMark(schema.marks.em),
      "Mod-u": (state, dispatch, view) =>
        options.canCommand?.("underline") === false
          ? true
          : toggleMark(schema.marks.underline)(state, dispatch, view),
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
      Enter: chainCommands(
        tableLineBreak,
        mathBlockEnter(() => options.canCommand?.("equation") !== false),
        lineBlockEnter,
        toggleHeadingEnter,
        (state, dispatch, view) => splitListItem(schema.nodes["block.example_list_item"], { label: "", number: (state.selection.$from.node(-1)?.attrs.number || 0) + 1 })(state, dispatch, view),
        exitEmptyList,
        splitItem,
        baseKeymap.Enter,
      ),
      "Shift-Enter": (state, dispatch) => {
        if (!state.selection.$from.parent.isTextblock) return false;
        dispatch?.(
          (state.selection.$from.parent.type.spec.code
            ? state.tr.insertText("\n")
            : state.tr.replaceSelectionWith(schema.nodes["character.line_break"].create())
          ).scrollIntoView(),
        );
        return true;
      },
      Tab: (state, dispatch, view) => {
        if (moveTableCell(1)(state, dispatch, view)) return true;
        if (
          options.canCommand?.("nesting") === false &&
          !itemAtSelection(state)
        )
          return true;
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
        (
          active as unknown as { domObserver: { flush(): void } }
        ).domObserver.flush();
        return chainCommands(
          backspaceEditorBlock,
          undoInputRule,
          baseKeymap.Backspace,
        )(active.state, active.dispatch, active);
      },
    };
    this.view = new EditorView(root, {
      state: EditorState.create({
        schema,
        doc: projectFootnotes(options.codec
          ? options.codec.parse(options.value)
          : this.bodyFormat === "notion-markdown"
            ? parseNotionMarkdown(options.value)
            : parseEditorMarkdown(options.value)),
        plugins: [
          new Plugin({ filterTransaction: tr => {
            if (!tr.docChanged || options.canCommand?.("notion_custom") === true) return true;
            let allowed = true;
            tr.doc.descendants(node => {
              if (localObjectPlugins[editorKind(node)] && !officialNotionObject(node) || hasSupplementalAttributes(node, options.canCommand?.("combined_colors") === true) || needsMarkdownTable(node)) allowed = false;
            });
            return allowed;
          } }),
          footnotePresentation(),
          citationCleanup(),
          ...(options.metadataHost ? [protectPageMetadata()] : []),
          history(),
          syncedEditing(() => options.currentPage?.()?.id, () => options.canCommand?.("notion_custom") === true),
          codeHighlighting(),
          emojiInput(() => options.canCommand?.("emoji_shortcode") === true),
          codeFenceInput(() => options.canCommand?.("backtick_code") !== false),
          commentInput(() => options.canCommand?.("comment") === true,
            source => options.codec?.parse(source) ?? parseNotionMarkdown(source)),
          exampleReferenceInput(() => options.canCommand?.("example_list_item") === true),
          pageReferenceInput(pageInput),
          dateMentionInput(() => options.canCommand?.("date_or_reminder") ?? this.bodyFormat === "notion-markdown", () => options.canCommand?.("mention_person") ?? this.bodyFormat === "notion-markdown", () => options.canCommand?.("notion_custom") === true, pageInput),
          linkPaste(() => options.canCommand?.("link_preview") ?? false, () => options.canCommand?.("web_bookmark") ?? false),
          latexMacroEditing(),
          tableAppearance(),
          tableColumnWidths(),
          ...(options.interactionMode === "touch" ? [] : [tableSelections()]),
          tableEditing(),
          ...(options.interactionMode === "touch" ? [] : [tableControls(options.canCommand)]),
          definitionControls(),
          markProperties(),
          blockProperties(() => options.canCommand?.("notion_custom") === true),
          ...(options.interactionMode === "touch" ? [] : [selectionMenu({
            canCombineColors: () => options.canCommand?.("combined_colors") === true || options.canCommand?.("notion_custom") === true,
            canCommand: name => options.canCommand?.(name) ?? (name !== "color" && name !== "underline" || this.bodyFormat === "notion-markdown"),
            convert: type => { this.bookmark = undefined; this.insertBlockType(type); },
            link: () => this.showLinkEditor(),
          })]),
          exampleLists(),
          numberedListDisplayPlugin(),
          objectProperties(source => options.codec ? options.codec.parse(source) : this.bodyFormat === "notion-markdown" ? parseNotionMarkdown(source) : parseEditorMarkdown(source), () => options.canCommand?.("notion_custom") === true, () => options.canCommand?.("notion_image_caption") === true),
          ...(options.interactionMode === "touch" ? [] : [inlineContextMenu({
            parse: source => options.codec?.parse(source) ?? (this.bodyFormat === "notion-markdown" ? parseNotionMarkdown(source) : parseEditorMarkdown(source)),
            serialize: doc => options.codec?.serialize(doc) ?? (this.bodyFormat === "notion-markdown" ? serializeNotionMarkdown(doc) : serializeEditorMarkdown(doc)),
            canCommand: name => options.canCommand?.(name) ?? false,
            editLink: () => this.showLinkEditor(),
            onError: options.onError,
            pages: options.pages,
            currentPageId: () => options.currentPage?.()?.id,
          })]),
          ...(options.interactionMode === "touch" ? [] : [createSlashPlugin((match) =>
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
          )]),
          markdownRules(options.canCommand, target => {
            const reference = internalReference(target, "wiki");
            const page = reference && resolveReferencePage(reference, options.pages(), options.currentPage?.()?.id);
            return page ? page.id + (reference?.fragment ? "#" + reference.fragment : "") : target;
          }, undefined, {
            parse: source => options.codec?.parse(source) ?? parseNotionMarkdown(source),
            context: doc => options.codec?.serialize(restoreFootnotes(doc)) ?? serializeNotionMarkdown(restoreFootnotes(doc)),
          }),
          symbolReplacementPlugin(() => options.canCommand?.("symbol_replacements") === true),
          inlineMarkNavigation(schema),
          keymap(keys),
          keymap(baseKeymap),
          placeholder,
        ],
      }),
      attributes: {
        class: "pm-document",
        "aria-label": "Note content",
        role: "textbox",
        "aria-multiline": "true",
        spellcheck: "false",
      },
      nodeViews: preserveSelectionDecorations({
        image: (node, view, getPos) => imageView(node, view, getPos, () => options.canCommand?.("notion_image_caption") === true || options.canCommand?.("image_caption") === true, () => options.canCommand?.("image_layout") === true),
        code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos, () => options.canCommand?.("code_caption") === true),
        executable_chunk: (node, view, getPos) => new RChunkView(node, view, getPos, () => options.canCommand?.("quarto_python") !== false),
        executable_inline: (node, view, getPos) => rInlineView(node, view, getPos, () => options.canCommand?.("quarto_python") !== false),
        ...objectNodeViews(options.pages, options.currentPage, source => options.codec ? options.codec.parse(source) : this.bodyFormat === "notion-markdown" ? parseNotionMarkdown(source) : parseEditorMarkdown(source), options.onOpenPage, () => options.canCommand?.("notion_custom") === true, options.onSavePage, options.interactionMode),
        image_block: (node, view, getPos) => new ImageBlockView(node, view, getPos, () => options.canCommand?.("image_layout") === true),
        syntax_block: (node, view, getPos) =>
          options.metadataHost && node.attrs.kind === "metadata"
            ? new PageMetadataView(node, view, getPos, options.metadataHost, source => this.options.codec!.parse(source))
            : isHtmlBlock(node) ? new HtmlBlockView(node, view, getPos)
            : node.attrs.kind === "figure" && node.attrs.data?.image ? new ImageBlockView(node, view, getPos, () => options.canCommand?.("image_layout") === true)
            : node.attrs.kind === "embed" ? new EmbedView(node, view, getPos, options.currentPage) : new SyntaxBlockView(node, view, getPos),
        syntax_inline: (node) =>
          node.attrs.kind === "transclusion"
            ? inlineTransclusionView(node)
            : node.attrs.html
              ? htmlInlineView(node)
              : {
                  dom: (() => {
                    const spec = schema.nodes["structure.preserved_inline"].spec.toDOM!(node);
                    return importSyntaxDOM(spec);
                  })(),
                },
        html_block: (node, view, getPos) =>
          new HtmlBlockView(node, view, getPos),
        html_inline: htmlInlineView,
        ...notionNodeViews(() => options.canCommand?.("notion_custom") === true, () => options.canCommand?.("alert_title") === true),
        ...createPageNodeViews(options.pages, options.currentPage),
        link_preview: (node, view, getPos) => new LinkPreviewView(node, view, getPos),
        link_mention: (node, view, getPos) => new LinkPreviewView(node, view, getPos),
        mention: (node, view, getPos) => node.attrs.kind === "date" ? new DateMentionView(node, view, getPos, undefined, () => options.canCommand?.("notion_custom") === true) : node.attrs.kind === "user" && personId(node.attrs.nfmAttrs.url) ? new PersonMentionView(node) : ["user", "database", "data-source"].includes(node.attrs.kind) ? new ExternalMentionView(node, options.onOpenPage) : { dom: importSyntaxDOM(schema.nodes["inline.mention_page_or_data_source"].spec.toDOM!(node)) },
        bullet_list_item: (node, view, getPos) => new ListItemView(node, view, getPos),
        numbered_list_item: (node, view, getPos) => new ListItemView(node, view, getPos),
        example_list_item: (node, view, getPos) => new ListItemView(node, view, getPos),
        task_list_item: (node, view, getPos) => new ListItemView(node, view, getPos),
        opaque_block: (node, view, getPos) => {
          if (options.metadataHost && node.attrs.metadataForm)
            return new PageMetadataView(node, view, getPos, options.metadataHost, source => this.options.codec!.parse(source));
          const dom = document.createElement("div");
          dom.className = "pm-preserved-block";
          dom.contentEditable = "false";
          // The shared renderer disables raw HTML and escapes custom syntax.
          if (options.codec) {
            const raw = document.createElement("pre");
            raw.textContent = node.attrs.raw;
            dom.append(raw);
          } else
            dom.innerHTML = renderMarkdown(node.attrs.raw, options.pages());
          return { dom, ignoreMutation: () => true };
        },
      }),
      dispatchTransaction: (tr) => this.dispatch(tr),
      handlePaste: (view, event) => {
        const plain = event.clipboardData?.getData("text/plain");
        if (plain && ((linkTarget(plain.trim()) && options.canCommand?.("link_preview")) || (bookmarkUrl(plain.trim()) && options.canCommand?.("web_bookmark")))) return false;
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
    refreshProductViews(this.view);
    this.view.dom.addEventListener(
      "click",
      (event) => {
        if (event.defaultPrevented) return;
        const link = (event.target as Element).closest("a[href]");
        if (!link) return;
        const href = link.getAttribute("href") || "";
        const asset = vaultAssetUrl(href);
        if (asset !== href) {
          event.preventDefault();
          const download = document.createElement("a"); download.href = asset;
          if (link.hasAttribute("download")) download.download = link.getAttribute("download") || "";
          download.target = link.getAttribute("target") || "_self"; download.rel = "noopener noreferrer";
          download.click(); return;
        }
        if (/^(https?:|mailto:)/i.test(href)) {
          event.preventDefault();
          window.open(href, "_blank", "noopener,noreferrer");
          return;
        }
        // Local resources and download links use native browser navigation, not page resolution.
        if (link.hasAttribute("download") || localAssetPath(href.replace(/^\/v\/[a-f0-9]{64}(?=\/)/, ""))) return;
        const reference = internalReference(href, (link.getAttribute("data-reference-syntax") || "markdown") as ReferenceSyntax);
        if (!reference) return;
        const registered = reference.addressing === "id" ? externalLibrary().entities.find(entity => entity.status === "resolved" && entity.localId === reference.address && entity.kind !== "user") : undefined;
        const page = resolveReferencePage(reference, options.pages(), options.currentPage?.()?.id) ?? (registered?.localId ? { id: registered.localId } : undefined);
        if (page || reference.addressing === "current") {
          event.preventDefault();
          event.stopPropagation();
          if (reference.addressing === "current" || page?.id === options.currentPage?.()?.id) {
            if (reference.kind === "location" && !this.scrollToReference(reference))
              options.onError(new Error("Linked location not found."));
          } else if (page) options.onOpenPage?.(page.id, reference);
        } else if (reference.addressing !== "url") {
          event.preventDefault();
          event.stopPropagation();
          options.onError(new Error("Linked page not found or ambiguous."));
        }
      },
      { signal: this.abort.signal },
    );
    // Touch editing uses the host's keyboard toolbar and native text selection.
    // Do not register desktop gutter, marquee or drag handlers on that surface.
    if (options.interactionMode === "touch") {
      this.stopTouchDrag = installTouchBlockDrag(this.view, {
        allowed: () => options.canTouchDrag?.() === true,
        flush: () => { this.getValue(); }, candidate: (x, y) => this.candidate(x, y),
      });
      return;
    }
    this.handle.className = "pm-block-handle";
    this.handle.type = "button";
    this.handle.draggable = true;
    this.handle.setAttribute("aria-label", "Drag block or click to open menu");
    this.handle.title = "Drag to move · Click for menu";
    this.handle.append(
      createElement(GripVertical as IconNode, {
        width: 18,
        height: 18,
        "stroke-width": 1.7,
      }),
    );
    this.dropLine.className = "pm-drop-line";
    this.addButton.className = "pm-block-add";
    this.addButton.type = "button";
    this.addButton.append(
      createElement(Plus as IconNode, {
        width: 18,
        height: 18,
        "stroke-width": 1.7,
      }),
    );
    this.addButton.setAttribute("aria-label", "Add block below");
    this.addButton.title = "Add block below";
    this.marquee.className = "pm-selection-box";
    this.selectionLayer.className = "pm-block-selection-layer";
    this.selectionLayer.setAttribute("aria-hidden", "true");
    this.root.append(this.selectionLayer, this.addButton, this.handle, this.dropLine);
    this.selectionResize = new ResizeObserver(() => this.scheduleSelectionPaint());
    this.selectionResize.observe(this.view.dom);
    this.selectionObserved.add(this.view.dom);
    document.body.append(this.marquee);
    const signal = this.abort.signal;
    this.root.addEventListener("load", () => this.scheduleSelectionPaint(), { capture: true, signal });
    window.addEventListener("resize", () => this.scheduleSelectionPaint(), { signal });
    document.addEventListener("scroll", (event) => {
      // Keep the anchor attached to the document while the pointer stays still.
      // Ignore scrolling inside block widgets and the other editing pane.
      if (event.target === document ||
          (event.target instanceof Element && event.target.contains(this.view.dom)))
        this.paintBox();
      this.scheduleSelectionPaint();
    }, { capture: true, signal });
    this.addButton.addEventListener(
      "pointerdown",
      (event) => event.preventDefault(),
      { signal },
    );
    this.addButton.addEventListener("click", () => this.addBlankBlock(), {
      signal,
    });
    document.addEventListener("pointerdown", (event) => this.startBox(event), {
      signal,
    });
    document.addEventListener("pointermove", (event) => this.updateBox(event), {
      signal,
    });
    document.addEventListener("pointerup", () => {
      if (this.boxStart?.moved && this.selectedBlocks.size) this.view.focus();
      this.cancelBox();
    }, { signal });
    document.addEventListener("pointercancel", () => this.cancelBox(), {
      signal,
    });
    window.addEventListener("blur", () => this.cancelBox(), { signal });
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
        if (!this.selectedBlocks.has(this.dragFrom)) this.selectBlocks([]);
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
        const target = event.target as Element;
        const ownsKey = this.view.dom.contains(target) ||
          this.menu?.contains(target) || this.handle.contains(target);
        if (this.selectedBlocks.size && ownsKey && !event.isComposing &&
          !this.view.composing && !target.closest("input, textarea, select")) {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            this.selectBlocks([]);
            this.view.focus();
          } else if (this.view.editable && !event.ctrlKey && !event.metaKey && !event.altKey &&
            (event.key === "Delete" || event.key === "Backspace")) {
            event.preventDefault();
            event.stopPropagation();
            this.getValue();
            const tr = deleteEditorBlocks(this.view.state, [...this.selectedBlocks]);
            this.cancelBox();
            this.closeMenu();
            if (tr) this.view.dispatch(closeHistory(tr));
            this.view.focus();
            return;
          }
        }
        if (event.key === "Escape") {
          this.cancelBox();
          if (this.selectedBlocks.size) this.selectBlocks([]);
          this.closeMenu();
          this.handle.classList.remove("visible");
          this.addButton.classList.remove("visible");
        }
      },
      { signal, capture: true },
    );
    document.querySelector("#main")?.addEventListener(
      "scroll",
      () => {
        this.closeMenu();
        this.handle.classList.remove("visible");
        this.addButton.classList.remove("visible");
      },
      { signal },
    );
  }

  private dispatch(tr: Transaction, childDeletionConfirmed = false) {
    if (this.destroyed) return;
    try {
      if (tr.docChanged && this.confirmingChildDeletion) return;
      // Respect transaction filters (for example, protected page metadata)
      // before asking to move any referenced pages to Trash.
      const result = this.view.state.applyTransaction(tr);
      if (tr.docChanged && !childDeletionConfirmed && this.options.onDeleteChildPages) {
        const ids = removedChildPages(this.view.state.doc, result.state.doc, this.options.pages(), this.options.currentPage?.()?.id);
        if (ids.length) {
          this.confirmingChildDeletion = true;
          const isCurrent = () => !this.destroyed && this.view.state.doc.eq(tr.before);
          // Keep the original document (including browser-originated deletions)
          // visible until the page action has succeeded.
          this.view.updateState(this.view.state);
          void this.options.onDeleteChildPages(ids, isCurrent).then(confirmed => {
            this.confirmingChildDeletion = false;
            if (confirmed && isCurrent()) this.dispatch(tr, true);
          }).catch(error => this.options.onError(error)).finally(() => {
            this.confirmingChildDeletion = false;
          });
          return;
        }
      }
      if (tr.docChanged) this.selectedBlocks.clear();
      if (this.bookmark) this.bookmark = this.bookmark.map(tr.mapping);
      this.folded = new Set(
        [...this.folded].flatMap((pos) => {
          const mapped = tr.mapping.mapResult(pos);
          return mapped.deleted ? [] : [mapped.pos];
        }),
      );
      this.view.updateState(result.state);
      if (result.transactions.some((change) => change.docChanged))
        refreshEmbeddedToc(this.view);
      refreshProductViews(this.view);
      this.paintBlockSelection();
      if (result.transactions.some((change) => change.docChanged)) {
        if (this.dragFrom !== null) this.resetDrag();
        this.bodyFormat = this.options.codec?.format ?? "notion-markdown";
        if (this.options.onDocumentChange)
          this.options.onDocumentChange(restoreFootnotes(result.state.doc), result.transactions.some(change => change.getMeta("isolateHistory")));
        else
          this.options.onChange(
            this.options.codec?.serialize(restoreFootnotes(result.state.doc)) ??
              serializeNotionMarkdown(restoreFootnotes(result.state.doc)),
            this.bodyFormat,
          );
        this.handle.classList.remove("visible");
        this.addButton.classList.remove("visible");
        this.hovered = null;
      }
      if (this.options.interactionMode === "touch") this.root.dispatchEvent(new Event("editor-selection-change", { bubbles: true }));
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
    if (this.options.codec)
      return this.options.codec.serialize(restoreFootnotes(this.view.state.doc));
    return this.bodyFormat === "notion-markdown"
      ? serializeNotionMarkdown(restoreFootnotes(this.view.state.doc))
      : serializeEditorMarkdown(restoreFootnotes(this.view.state.doc));
  }
  getBodyFormat(): BodyFormat {
    return this.bodyFormat;
  }
  scrollToReference(reference: InternalReference): boolean {
    if (reference.locator === "anchor") {
      const anchor = [...this.view.dom.querySelectorAll<HTMLElement>("[data-md-id]")].find(el => el.dataset.mdId === reference.fragment);
      if (anchor) {
        anchor.scrollIntoView({ block: "center" });
        return true;
      }
    }
    const location = findReferenceLocation(this.view.state.doc, reference);
    if (!location) return false;
    const dom = this.view.nodeDOM(location.pos);
    const element = dom instanceof HTMLElement ? dom : dom?.parentElement;
    if (!element) return false;
    element.dispatchEvent(new Event("notdown-reveal-reference", { bubbles: true }));
    for (let parent = element.parentElement; parent && parent !== this.view.dom; parent = parent.parentElement)
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    element.scrollIntoView({ block: "center" });
    return true;
  }
  scrollToReferenceOccurrence(target: ReferenceOccurrenceTarget): boolean {
    // Resolve against the live projection so edits and footnote layout cannot leave stale positions.
    const ref = referenceOccurrences(this.view.state.doc).find(ref => ref.key === target.key && ref.occurrence === target.occurrence);
    if (!ref) return false;
    const dom = this.view.domAtPos(ref.from).node;
    const element = this.view.nodeDOM(ref.from) ?? (dom instanceof HTMLElement ? dom : dom.parentElement);
    const host = element instanceof HTMLElement ? element : element?.parentElement;
    if (!host) return false;
    host.dispatchEvent(new Event("notdown-reveal-reference", { bubbles: true }));
    for (let parent = host; parent && parent !== this.view.dom; parent = parent.parentElement!)
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    this.revealHeading(host);
    const node = this.view.state.doc.nodeAt(ref.from);
    const selection = node?.isAtom && NodeSelection.isSelectable(node) ? NodeSelection.create(this.view.state.doc, ref.from)
      : TextSelection.between(this.view.state.doc.resolve(ref.from), this.view.state.doc.resolve(ref.to));
    this.view.dispatch(this.view.state.tr.setSelection(selection).scrollIntoView());
    host.scrollIntoView({ block: "center" });
    this.view.focus();
    return true;
  }
  getDocument() {
    return restoreFootnotes(this.view.state.doc);
  }
  async flushSyncedBlocks() { await flushSyncedBlocks(this.view); }
  async flushDatabaseViews() { return flushDatabaseViews(this.view); }
  get databaseViewsDirty() { return databaseViewsDirty(this.view); }
  setPageTitle(title: string) {
    const node = this.view.state.doc.firstChild;
    if (node?.attrs.metadataForm !== "pandoc" || !this.options.codec) return;
    const raw = replacePandocTitle(node.attrs.raw, title);
    const tr = metadataSourceTransaction(this.view.state, 0, node, raw, this.options.codec.parse);
    if (tr) this.view.dispatch(tr);
  }
  setEditable(value: boolean) {
    this.view.setProps({ editable: () => value });
    refreshAlertViews(this.view);
    // Node views can be reused without update() when only editable changes.
    refreshCodeBlockViews(this.view);
  }
  /** Pair fresh file ranges with the same projection used by the live view. */
  sourceBlocks(sourceDoc: PMNode): { node: PMNode; element: HTMLElement }[] {
    if (this.sourceProjection?.source !== sourceDoc)
      this.sourceProjection = { source: sourceDoc, doc: projectFootnotes(sourceDoc) };
    const projected = this.sourceProjection.doc;
    const live = this.view.state.doc;
    if (projected.childCount !== live.childCount) return [];
    const blocks: { node: PMNode; element: HTMLElement }[] = [];
    const add = (node: PMNode, pos: number) => {
      const element = this.view.nodeDOM(pos);
      if (element instanceof HTMLElement && typeof node.attrs.sourceStart === "number")
        blocks.push({ node, element });
    };
    live.forEach((node, pos, index) => {
      const mapped = projected.child(index);
      if (mapped.type !== node.type) return;
      if (isEditorKind(node, "footnote_section")) {
        node.forEach((definition, offset) => {
          // Keys are projection-local. Labels identify the definition after sorting.
          mapped.forEach(candidate => {
            if (candidate.attrs.label === definition.attrs.label)
              add(candidate, pos + 1 + offset);
          });
        });
      } else add(mapped, pos);
    });
    return blocks;
  }
  setCodec(codec: NonNullable<Options["codec"]>) {
    this.options.codec = codec;
    this.bodyFormat = codec.format;
    refreshAlertViews(this.view);
  }
  replaceDocument(doc: PMNode) {
    doc = projectFootnotes(doc);
    this.selectedBlocks.clear();
    this.cancelBox();
    this.resetDrag();
    const previous = this.view.state.doc;
    let tr = this.view.state.tr;
    const from = previous.content.findDiffStart(doc.content);
    if (from !== null) {
      const ends = previous.content.findDiffEnd(doc.content)!;
      const overlap = from - Math.min(ends.a, ends.b);
      if (overlap > 0) {
        ends.a += overlap;
        ends.b += overlap;
      }
      tr = tr.replace(from, ends.a, doc.slice(from, ends.b));
      // Fitting an open slice across a container boundary can keep a sibling
      // inside the Div. History/external projections must match the snapshot.
      if (!tr.doc.content.eq(doc.content))
        tr = this.view.state.tr.replaceWith(0, previous.content.size, doc.content);
    }
    for (const [key, value] of Object.entries(doc.attrs))
      if (previous.attrs[key] !== value) tr.setDocAttribute(key, value);
    tr.setMeta("addToHistory", false).setMeta("pageMetadataProjection", true);
    this.bookmark = undefined;
    this.view.updateState(this.view.state.apply(tr));
    refreshEmbeddedToc(this.view);
    refreshProductViews(this.view);
    this.paintBlockSelection();
  }
  isComposing() {
    return (
      this.view.composing ||
      !!slashPluginKey.getState(this.view.state)?.composing
    );
  }
  headingElements(): HTMLElement[] {
    if (this.destroyed) return [];
    const headings: HTMLElement[] = [];
    this.view.state.doc.descendants((node, pos) => {
      if (!isEditorKind(node, "heading")) return;
      const element = this.view.nodeDOM(pos);
      if (element instanceof HTMLElement) headings.push(element);
    });
    return headings;
  }
  revealHeading(heading: HTMLElement) {
    if (this.destroyed || !this.view.dom.contains(heading)) return;
    for (
      let parent = heading.parentElement;
      parent && parent !== this.view.dom;
      parent = parent.parentElement
    ) {
      if (parent.classList.contains("pm-toggle-closed"))
        parent
          .querySelector<HTMLButtonElement>(":scope > .pm-toggle-chevron")
          ?.dispatchEvent(new Event("reveal-content"));
    }
    const target = this.view.posAtDOM(heading, 0);
    const ancestors: { pos: number; level: number }[] = [];
    this.view.state.doc.forEach((node, pos) => {
      if (pos > target || !isEditorKind(node, "heading")) return;
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
  /** A sheet owns this selection until dismissed; background changes invalidate it. */
  touchSelection(flush = true) {
    if (this.destroyed || !this.view.editable || this.isComposing()) return null;
    if (flush) this.getValue();
    const state = this.view.state, block = selectionBlock(state);
    const restore = () => {
      if (this.destroyed || !this.view.editable || this.isComposing() || !this.view.state.doc.eq(state.doc)) return false;
      this.bookmark = undefined;
      this.view.dispatch(this.view.state.tr.setSelection(state.selection).setStoredMarks(state.storedMarks));
      return true;
    };
    const apply = (tr: Transaction | null) => {
      if (!tr) return false;
      this.view.dispatch(closeHistory(tr).setMeta("isolateHistory", true).scrollIntoView());
      this.view.focus();
      return true;
    };
    const encoding = this.options.canCommand?.("table_grid") ? "grid" : this.options.canCommand?.("table_mmd") ? "mmd" : null;
    const allowed = (action: SelectionBlockAction) => action !== "indent" || this.options.canCommand?.("nesting") !== false || !!itemAtSelection(state);
    return {
      label: block ? blockTypeLabel(block.node, block.listNode) : "Text selection",
      preview: block?.node.textContent.slice(0, 90) || "",
      canConvert: !!block && !inTableCell(state) && state.selection.$from.parent.isTextblock,
      inTable: inTableCell(state),
      activeFormat: (id: string) => {
        const format = insertFormats[id];
        if (!format) return false;
        const mark = schema.marks[format.mark], { from, to, empty, $from } = state.selection;
        const matches = (marks: PMNode["marks"]) => marks.some(value => {
          if (value.type !== mark) return false;
          if (format.mark === "color") {
            const colors = inlineColors(value.attrs);
            return !!colors[id === "background" ? "bg_color" : "color"];
          }
          return !format.attrs || Object.entries(format.attrs).every(([key, expected]) => value.attrs[key] === expected);
        });
        if (empty) return matches(state.storedMarks ?? $from.marks());
        let found = false, all = true;
        state.doc.nodesBetween(from, to, node => { if (node.isText) { found = true; all &&= matches(node.marks); } });
        return found && all;
      },
      activeColor: (kind: InlineColorKind) => selectedInlineColor(state, kind),
      color: (kind: InlineColorKind, value: string) => {
        if (this.options.canCommand?.(kind) === false || !restore()) return false;
        return apply(inlineColorTransaction(this.view.state, kind, value, this.options.canCommand?.("combined_colors") === true || this.options.canCommand?.("notion_custom") === true));
      },
      can: (action: SelectionBlockAction) => allowed(action) && !!selectionBlockAction(state, action),
      run: (action: SelectionBlockAction) => allowed(action) && restore() && apply(selectionBlockAction(this.view.state, action)),
      canTable: (action: TableAction) => editTable(action, encoding)(state),
      table: (action: TableAction) => restore() && editTable(action, encoding)(this.view.state, tr => { apply(tr); }),
      convert: (type: BlockType) => { if (!restore()) return false; this.insertBlockType(type); return true; },
      canInsert: !!block && (isEditorKind(block.node, "paragraph") && !block.node.content.size || !!selectionBlockAction(state, "insert-after")),
      insert: (type: BlockType) => {
        if (!block || !restore()) return false;
        if (!(isEditorKind(block.node, "paragraph") && !block.node.content.size)) {
          if (!apply(selectionBlockAction(this.view.state, "insert-after"))) return false;
        }
        this.insertBlockType(type); return true;
      },
      format: (id: string) => {
        if (!restore()) return false;
        const format = insertFormats[id];
        if (!format || this.options.canCommand?.(id) === false) return false;
        if (format.mark === "color") this.insertFormat(id);
        else { this.run(toggleMark(schema.marks[format.mark], format.attrs)); this.view.focus(); }
        return true;
      },
    };
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
  getSlashAnchor() {
    const match = getSlashState(this.view.state);
    if (!match || this.destroyed) return null;
    const start = this.view.coordsAtPos(match.from);
    const caret = this.view.coordsAtPos(match.to);
    // Keep horizontal alignment at the trigger, but follow the typing line
    // when a long query wraps. ProseMirror also handles empty paragraphs.
    return { left: start.left, top: caret.top, bottom: caret.bottom };
  }
  consumeSlash() {
    consumeSlash(this.view);
  }
  cancelSlash() {
    if (!this.destroyed) cancelSlash(this.view);
  }

  inFootnote() {
    const { $from } = this.view.state.selection;
    for (let depth = $from.depth; depth > 0; depth--)
      if (isEditorKind($from.node(depth), "footnote")) return true;
    return false;
  }

  insertFootnote(input: FootnoteInput) {
    if (this.options.canCommand?.("footnote") === false) return;
    if (this.view.hasFocus()) this.bookmark = undefined;
    else this.restoreSelection();
    const state = this.view.state;
    if (!state.selection.$from.parent.inlineContent || state.selection.$from.parent.type.spec.code) return;
    if (this.inFootnote()) return;
    if ("text" in input && !input.text.trim()) return;
    if ("label" in input && !footnoteChoices(state.doc).some(note => note.label === input.label)) return;
    const definition = "text" in input ? newFootnote(state.doc, input.text) : null;
    const label = definition?.attrs.label ?? (input as { label: string }).label;
    const tr = state.tr.replaceSelectionWith(schema.nodes["inline.footnote"].create({ label }));
    if (definition) tr.insert(tr.doc.content.size, definition);
    this.view.dispatch(tr.scrollIntoView());
    this.bookmark = undefined;
    this.view.focus();
  }

  insertInlineObject(value: InlineInsertion) {
    this.getValue();
    if (this.view.hasFocus()) this.bookmark = undefined;
    else this.restoreSelection();
    this.view.dispatch(insertInlineObject(this.view.state, value, source => this.options.codec?.parse(source) ?? parseNotionMarkdown(source)));
    this.bookmark = undefined;
    this.view.focus();
  }

  insertFormat(id: string) {
    const format = insertFormats[id];
    if (!format || this.options.canCommand?.(id) === false) return;
    this.getValue();
    this.restoreSelection();
    const { state } = this.view;
    const type = schema.marks[format.mark];
    const markFor = (marks: PMNode["marks"]) => {
      const old = marks.find(mark => mark.type === type);
      if (format.mark !== "color") return type.create({ ...old?.attrs, ...format.attrs });
      const nfmAttrs = { ...old?.attrs.nfmAttrs };
      delete nfmAttrs.color; delete nfmAttrs.bg_color; delete nfmAttrs.underline;
      const dual = this.options.canCommand?.("combined_colors") === true || this.options.canCommand?.("notion_custom") === true;
      const colors = dual ? inlineColors(old?.attrs || {}) : { color: "", bg_color: "" };
      if (id === "background" && dual) colors.bg_color = "yellow";
      else colors.color = id === "background" ? "yellow_bg" : "blue";
      return type.create({ ...colors, nfmAttrs });
    };
    const { from, to, empty, $from } = state.selection;
    const tr = state.tr;
    if (empty) tr.addStoredMark(markFor(state.storedMarks ?? $from.marks()));
    else state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.isInline) tr.addMark(Math.max(from, pos), Math.min(to, pos + node.nodeSize), markFor(node.marks));
    });
    this.view.dispatch(tr.scrollIntoView());
    this.view.focus();
  }

  insertValue(markdown: string) {
    if (this.view.hasFocus()) this.bookmark = undefined;
    else this.restoreSelection();
    const doc =
      this.options.codec?.parse(markdown) ?? parseNotionMarkdown(markdown);
    const mediaImage = this.options.canCommand?.("inline_image") === false &&
      doc.childCount === 1 && doc.firstChild?.type === schema.nodes["block.paragraph"] &&
      doc.firstChild.childCount === 1 && doc.firstChild.firstChild?.type === schema.nodes["inline.image"];
    if (
      inTableCell(this.view.state) &&
      (mediaImage || !(doc.childCount === 1 && doc.firstChild?.type === schema.nodes["block.paragraph"]))
    ) {
      const nodes: PMNode[] = [];
      markdown.split(/\r?\n/).forEach((line, index) => {
        if (index) nodes.push(schema.nodes["character.line_break"].create());
        if (line) nodes.push(schema.text(line));
      });
      this.view.dispatch(
        this.view.state.tr
          .replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0))
          .scrollIntoView(),
      );
      this.bookmark = undefined;
      this.view.focus();
      return;
    }
    const inline =
      !mediaImage && doc.childCount === 1 && doc.firstChild?.type === schema.nodes["block.paragraph"];
    const slice = inline
      ? new Slice(doc.firstChild!.content, 0, 0)
      : new Slice(doc.content, 0, 0);
    const tr = this.view.state.tr.replaceSelection(slice).scrollIntoView();
    if (doc.childCount === 1 && doc.firstChild && (isEditorKind(doc.firstChild, "executable_chunk") || (!doc.firstChild.textContent && !doc.firstChild.isAtom))) {
      tr.doc.descendants((node, pos) => {
        if (node === doc.firstChild) tr.setSelection(Selection.near(tr.doc.resolve(pos + 1)));
      });
    }
    if (doc.childCount === 1 && isEditorKind(doc.firstChild, "syntax_block") && doc.firstChild.attrs.kind === "comment") {
      // A hidden atom must never become the typing target: typing would replace
      // the comment. Keep a visible text position immediately after it.
      let end: number | undefined;
      tr.doc.descendants((node, pos) => {
        if (node === doc.firstChild) end = pos + node.nodeSize;
      });
      if (end !== undefined) {
        if (!tr.doc.resolve(end).nodeAfter?.isTextblock)
          tr.insert(end, schema.nodes["block.paragraph"].create());
        tr.setSelection(TextSelection.create(tr.doc, end + 1));
      }
    }
    this.view.dispatch(tr);
    this.bookmark = undefined;
    this.view.focus();
    if (inline && doc.firstChild?.childCount === 1 && isEditorKind(doc.firstChild.firstChild, "mention") && doc.firstChild.firstChild.attrs.kind === "date" && !doc.firstChild.firstChild.attrs.nfmAttrs.start) {
      this.view.state.doc.descendants((node, pos) => {
        if (node === doc.firstChild!.firstChild) this.view.nodeDOM(pos)?.dispatchEvent(new Event("notdown-edit-date"));
      });
    }
    if (doc.childCount === 1 && doc.firstChild?.type === schema.nodes["block.math_block"]) {
      this.view.state.doc.descendants((node, pos) => {
        if (node === doc.firstChild) this.view.nodeDOM(pos)?.dispatchEvent(new Event("notdown-edit-equation"));
      });
    }
    if (doc.childCount === 1 && doc.firstChild?.type === schema.nodes["block.button"] && doc.firstChild.attrs.actions === "[]") {
      const pos = this.view.state.selection.from;
      const buttonPos = this.view.state.doc.nodeAt(pos)?.type === schema.nodes["block.button"] ? pos : pos - 1;
      if (this.view.state.doc.nodeAt(buttonPos)?.type === schema.nodes["block.button"]) openBlockProperties(this.view, buttonPos);
    }
  }

  private run(command: Command) {
    return command(this.view.state, this.view.dispatch, this.view);
  }

  insertBlockType(type: BlockType) {
    if (this.options.canCommand?.(type) === false) return;
    this.restoreSelection();
    this.bookmark = undefined;
    const state = this.view.state;
    if (inTableCell(state)) return;
    const item = itemAtSelection(state);
    if ((item || isEditorKind(blockAtPos(state.doc, state.selection.from)?.node, "definition_list_item")) && type !== "divider") {
      const tr = convertListItem(state, type);
      if (tr && type === "code") tr.setNodeMarkup(tr.selection.$from.before(), undefined,
        { ...tr.selection.$from.parent.attrs, params: lastCodeLanguage() });
      if (tr) this.view.dispatch(tr.scrollIntoView());
      this.view.focus();
      return;
    }
    if (type === "code") {
      const tr = convertTextblockToCode(state);
      if (tr) tr.setNodeMarkup(tr.selection.$from.before(), undefined,
        { ...tr.selection.$from.parent.attrs, params: lastCodeLanguage() });
      if (tr) this.view.dispatch(tr.scrollIntoView());
      this.view.focus();
      return;
    }
    if (["list", "number", "task"].includes(type)) {
      const listType =
        type === "number"
          ? schema.nodes["structure.ordered_list"]
          : schema.nodes["structure.bullet_list"];
      if (!state.selection.$from.parent.isTextblock)
        this.run(setBlockType(schema.nodes["block.paragraph"]));
      this.run(wrapInList(listType));
      const created = itemAtSelection(this.view.state);
      if (created && type === "task")
        this.view.dispatch(
          this.view.state.tr.setNodeMarkup(created.pos, schema.nodes["block.task_list_item"], {
            ...created.node.attrs,
            checked: false,
          }),
        );
    } else {
      if (item) this.run(outdentEditorBlock);
      if (type === "quote") this.run(wrapIn(schema.nodes["block.quote"]));
      else if (type === "divider") {
        const tr = this.view.state.tr
          .replaceSelectionWith(schema.nodes["block.divider"].create())
          .scrollIntoView();
        const after = Math.min(tr.selection.to, tr.doc.content.size);
        if (after === tr.doc.content.size)
          tr.insert(after, schema.nodes["block.paragraph"].create());
        tr.setSelection(
          Selection.near(
            tr.doc.resolve(Math.min(after + 1, tr.doc.content.size)),
          ),
        );
        this.view.dispatch(tr);
      } else {
        const target = type.startsWith("heading")
          ? schema.nodes["block.heading"]
          : schema.nodes["block.paragraph"];
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

  private selectBlocks(positions: number[]) {
    if (positions.length === this.selectedBlocks.size && positions.every(pos => this.selectedBlocks.has(pos))) return;
    this.selectedBlocks = new Set(positions);
    this.view.dispatch(this.view.state.tr.setMeta("addToHistory", false));
  }

  private scheduleSelectionPaint() {
    if (this.destroyed || !this.selectedBlocks.size || this.selectionFrame) return;
    this.selectionFrame = requestAnimationFrame(() => {
      this.selectionFrame = 0;
      this.paintBlockSelection();
    });
  }

  /** Paint above block backgrounds, outside the editable document. An overlay
   * also covers markers/checkboxes and cannot be erased by NodeView renders. */
  private paintBlockSelection() {
    const observed = new Set<Element>([this.view.dom]);
    const origin = this.root.getBoundingClientRect();
    const highlights = [];
    for (const pos of this.selectedBlocks) {
      const block = blockAtPos(this.view.state.doc, pos);
      if (!block || block.pos !== pos) continue;
      const rect = this.selectionRect(block);
      if (!rect) continue;
      const dom = this.view.nodeDOM(pos);
      if (dom instanceof Element) observed.add(dom);
      const highlight = document.createElement("div");
      highlight.className = "pm-block-highlight";
      highlight.dataset.blockPos = String(pos);
      Object.assign(highlight.style, {
        left: `${rect.left - origin.left + this.root.scrollLeft}px`,
        top: `${rect.top - origin.top + this.root.scrollTop}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      if (dom instanceof Element) highlight.style.borderRadius =
        Math.max(4, parseFloat(getComputedStyle(dom).borderTopLeftRadius) || 0) + "px";
      highlights.push(highlight);
    }
    this.selectionLayer.replaceChildren(...highlights);
    for (const dom of this.selectionObserved) if (!observed.has(dom)) this.selectionResize?.unobserve(dom);
    for (const dom of observed) if (!this.selectionObserved.has(dom)) this.selectionResize?.observe(dom);
    this.selectionObserved = observed;
  }

  /** Full block bounds for painting, head-only list bounds for hit testing so
   * a nested child can still be selected without selecting its parent. */
  private selectionRect(block: EditorBlock, hit = false): DOMRect | null {
    const dom = this.view.nodeDOM(block.pos);
    if (!(dom instanceof HTMLElement) || !dom.getClientRects().length) return null;
    let rect = dom.getBoundingClientRect();
    if (hit && (isListItem(block.node) || isEditorKind(block.node, "definition_list_item") || (isEditorKind(block.node, "nested_block") && !dom.classList.contains("pm-toggle")))) {
      const head = this.rowRect(block);
      if (head) rect = new DOMRect(rect.left, head.top, rect.width, head.height);
    }
    if (isListItem(block.node) && dom.parentElement) {
      // List markers and task checkboxes live in the list's padding, outside li.
      const left = dom.parentElement.getBoundingClientRect().left;
      rect = new DOMRect(left, rect.top, rect.right - left, rect.height);
    }
    if (isEditorKind(block.node, "horizontal_rule") && rect.height < 12)
      rect = new DOMRect(rect.left, rect.top - (12 - rect.height) / 2, rect.width, 12);
    return rect.width && rect.height ? rect : null;
  }

  private cancelBox() {
    this.boxStart = null;
    this.marquee.classList.remove("visible");
    this.root.classList.remove("pm-box-selecting");
  }

  private addBlankBlock() {
    if (!this.view.editable) return;
    this.getValue(); // Flush pending DOM input before choosing a position.
    const doc = this.view.state.doc;
    const block = this.hovered && blockAtPos(doc, this.hovered.pos);
    let pos = block ? block.end : doc.content.size;
    const tr = this.view.state.tr;
    const paragraph = schema.nodes["block.paragraph"].create();
    if (isListItem(block?.node)) {
      tr.insert(
        pos,
        block!.node.type.create(
          {
            checked:
              typeof block!.node.attrs.checked === "boolean" ? false : null,
          },
          paragraph,
        ),
      );
      pos++;
    } else if (isEditorKind(block?.node, "definition_list_item") && block.listNode && block.listPos !== undefined) {
      const index = doc.resolve(block.pos).index();
      const before: PMNode[] = [], after: PMNode[] = [];
      block.listNode.forEach((child, _offset, i) => (i <= index ? before : after).push(child));
      const preceding = block.listNode.copy(Fragment.fromArray(before));
      const replacement = [preceding, paragraph];
      if (after.length) replacement.push(block.listNode.copy(Fragment.fromArray(after)));
      tr.replaceWith(block.listPos, block.listPos + block.listNode.nodeSize, replacement);
      pos = block.listPos + preceding.nodeSize;
    } else tr.insert(pos, paragraph);
    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
    this.bookmark = undefined;
    tr.setMeta(slashPluginKey, { type: "open", from: pos + 1 });
    this.view.dispatch(closeHistory(tr).scrollIntoView());
    this.view.focus();
  }

  private focusDocumentTail() {
    this.getValue(); // Flush pending input before deciding whether the tail is empty.
    const { doc } = this.view.state;
    let index = doc.childCount - 1, end = doc.content.size;
    // Footnotes are projected after the body; hidden source anchors and
    // definitions must not hide an existing empty body paragraph from this check.
    while (index >= 0) {
      const node = doc.child(index);
      const dom = this.view.nodeDOM(end - node.nodeSize);
      if (!isEditorKind(node, "footnote_section") &&
          !(dom instanceof HTMLElement && dom.hidden)) break;
      end -= node.nodeSize;
      index--;
    }
    const last = index >= 0 ? doc.child(index) : null;
    const tr = this.view.state.tr;
    const empty = last?.type === schema.nodes["block.paragraph"] && !last.content.size;
    const pos = empty ? end - last.nodeSize : end;
    if (!empty) tr.insert(pos, schema.nodes["block.paragraph"].create());
    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
    this.bookmark = undefined;
    this.view.dispatch(closeHistory(tr).scrollIntoView());
    this.view.focus();
  }

  private startBox(event: PointerEvent) {
    if (event.button !== 0 || !this.view.editable || this.destroyed) return;
    const target = event.target as Element;
    if (this.handle.contains(target) || this.addButton.contains(target)) return;
    const bounds = this.view.dom.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const surface = this.root.closest(".markdown-workspace[data-mode='split']")
      ? this.root.closest(".page-pane")
      : this.root.closest("#main") || this.root.parentElement;
    if (
      !surface?.contains(target) ||
      target.closest("button, input, textarea, a, .cm-editor, .pm-block-menu")
    )
      return;
    if (this.selectedBlocks.size) this.selectBlocks([]);
    if (event.clientX >= bounds.left && event.clientX <= bounds.right) {
      const contentBottom = Array.from(this.root.querySelectorAll(
        ".pm-document > *, .md-bibliography, .md-csl-bibliography",
      )).reduce((bottom, element) => {
        const rect = element.getBoundingClientRect();
        return rect.height ? Math.max(bottom, rect.bottom) : bottom;
      }, bounds.top);
      if (event.clientY > contentBottom &&
          event.clientY <= Math.max(bounds.bottom, surface.getBoundingClientRect().bottom) &&
          !target.closest(".pm-document > *, .md-bibliography, .md-csl-bibliography")) {
        event.preventDefault();
        this.focusDocumentTail();
      }
      return;
    }
    if (
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom ||
      this.view.dom.contains(target)
    )
      return;
    event.preventDefault();
    this.closeMenu();
    this.boxStart = {
      x: event.clientX - bounds.left, y: event.clientY - bounds.top,
      pointerX: event.clientX, pointerY: event.clientY, moved: false,
    };
  }

  private updateBox(event: PointerEvent) {
    const start = this.boxStart;
    if (!start) return;
    start.pointerX = event.clientX;
    start.pointerY = event.clientY;
    this.paintBox();
    if (start.moved) event.preventDefault();
  }

  private paintBox() {
    const start = this.boxStart;
    if (!start) return;
    const bounds = this.view.dom.getBoundingClientRect();
    const anchorX = bounds.left + start.x, anchorY = bounds.top + start.y;
    if (
      !start.moved &&
      Math.hypot(start.pointerX - anchorX, start.pointerY - anchorY) < 4
    )
      return;
    start.moved = true;
    window.getSelection()?.removeAllRanges();
    this.root.classList.add("pm-box-selecting");
    const left = Math.min(anchorX, start.pointerX),
      right = Math.max(anchorX, start.pointerX);
    const top = Math.min(anchorY, start.pointerY),
      bottom = Math.max(anchorY, start.pointerY);
    Object.assign(this.marquee.style, {
      left: left + "px",
      top: top + "px",
      width: right - left + "px",
      height: bottom - top + "px",
    });
    this.marquee.classList.add("visible");
    const rows: number[] = [];
    this.view.state.doc.descendants((node, pos) => {
      if (!node.isBlock) return;
      const block = blockAtPos(this.view.state.doc, pos);
      if (
        !block ||
        block.pos !== pos ||
        ["bullet_list", "ordered_list", "example_list", "definition_list", "definition_description", "column"].includes(editorKind(node))
      )
        return;
      const rect = this.selectionRect(block, true);
      if (
        rect &&
        rect.height &&
        rect.right > left &&
        rect.left < right &&
        rect.bottom > top &&
        rect.top < bottom
      ) {
        rows.push(pos);
        return false;
      }
    });
    this.selectBlocks(rows);
  }

  private rowRect(block: EditorBlock) {
    const dom = this.view.nodeDOM(block.pos);
    if (!(dom instanceof HTMLElement)) return null;
    if (isEditorKind(block.node, "horizontal_rule")) {
      // A rule is only a border. Center its controls and hover area on the
      // visible line without changing the document's block spacing.
      const rect = dom.getBoundingClientRect();
      return rect.height ? new DOMRect(rect.left, rect.top - (24 - rect.height) / 2, rect.width, 24) : rect;
    }
    if (dom.matches(".pm-content-object, .pm-embed")) return dom.getBoundingClientRect();
    if (isEditorKind(block.node, "callout")) {
      // The first content row represents the entire callout. Keep its vertical
      // hit area, but anchor the gutter to the container's outside edge.
      const bounds = dom.getBoundingClientRect();
      const head = dom.querySelector(".pm-callout-content > :first-child") || dom.firstElementChild;
      const line = head?.getBoundingClientRect() || bounds;
      return new DOMRect(bounds.left, bounds.top, bounds.width, Math.max(32, line.bottom - bounds.top));
    }
    const row = [
      "nested_block",
      "definition_list_item",
      "toggle_block",
      "callout",
      "synced_block",
      "blockquote",
    ].includes(editorKind(block.node))
      ? dom.querySelector(".pm-toggle-content > :first-child") ||
        dom.firstElementChild ||
        dom
      : isListItem(block.node)
        ? dom.querySelector(".pm-item-content > p") || dom
        : dom;
    return row.getBoundingClientRect();
  }

  private candidate(x: number, y: number): EditorBlock | null {
    const bounds = this.view.dom.getBoundingClientRect();
    if (
      y < bounds.top - 12 ||
      y > bounds.bottom + 12 ||
      x < bounds.left - 108 ||
      x > bounds.right + 24
    )
      return null;
    // Node-view headers, previews and padding belong to the container itself.
    // posAtCoords can otherwise resolve them to a neighboring content paragraph.
    const target = document.elementFromPoint(x, y);
    const object = target?.closest(".pm-content-object, .pm-embed");
    if (object && this.view.dom.contains(object) && !object.querySelector(":scope > .pm-object-content")?.contains(target)) {
      let container: EditorBlock | null = null;
      this.view.state.doc.descendants((node, pos) => {
        if (container) return false;
        if (node.isBlock && this.view.nodeDOM(pos) === object) { container = blockAtPos(this.view.state.doc, pos); return false; }
      });
      if (container) return container;
    }
    const hit = this.view.posAtCoords({
      left: Math.max(bounds.left + 1, Math.min(x, bounds.right - 1)),
      // The first/last divider's hover area can extend beyond the document.
      top: Math.max(bounds.top, Math.min(y, bounds.bottom - 1)),
    });
    const block = hit ? blockAtPos(this.view.state.doc, hit.pos) : null;
    if (!block) return null;
    // posAtCoords in the indentation gutter may resolve to a parent. Pick the
    // deepest visible row on this line, so a nested child is independently draggable.
    let best = block;
    this.view.state.doc.descendants((node, pos) => {
      if (
        !node.isBlock ||
        ["bullet_list", "ordered_list", "example_list", "definition_list", "definition_description", "column", "doc"].includes(
          editorKind(node),
        )
      )
        return;
      const candidate = blockAtPos(this.view.state.doc, pos);
      if (!candidate || candidate.pos !== pos) return;
      const rect = this.rowRect(candidate);
      // Div controls occupy a second gutter outside the ordinary child
      // controls. The container adds no padding to the rendered content.
      if (isEditorKind(node, "fenced_div") && rect && y >= rect.top && y <= rect.bottom) {
        if (x >= rect.left - 108 && x < rect.left - 60) {
          best = candidate;
          return false;
        }
      }
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
    // Column gutters also host block controls. Give the resize strip priority,
    // including when a previously positioned block handle covers the pointer.
    if (this.view.dom.querySelector(".pm-columns-resizing") ||
      Array.from(this.view.dom.querySelectorAll<HTMLElement>(".pm-column-resizer:not([hidden])")).some(handle => {
        const rect = handle.getBoundingClientRect();
        return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      })) {
      this.handle.classList.remove("visible");
      this.addButton.classList.remove("visible");
      return;
    }
    if (
      !this.view.editable ||
      this.boxStart ||
      this.handlePressed ||
      this.dragFrom !== null ||
      this.menu ||
      this.destroyed
    )
      return;
    if (
      this.handle.contains(event.target as Node) ||
      this.addButton.contains(event.target as Node)
    )
      return;
    if ((event.target as Element).closest?.(".pm-toggle-chevron")) {
      this.handle.classList.remove("visible");
      this.addButton.classList.remove("visible");
      return;
    }
    // Keep the current row while crossing its left gutter. Container padding
    // (e.g. Tabs) can hit an ancestor, and posAtCoords outside a node view can
    // resolve to an adjacent block before the pointer reaches the controls.
    if (this.hovered && this.handle.classList.contains("visible")) {
      const row = this.rowRect(this.hovered);
      const grip = this.handle.getBoundingClientRect();
      const add = this.addButton.getBoundingClientRect();
      if (row && row.width && row.height &&
        event.clientX >= add.left && event.clientX <= (isEditorKind(this.hovered.node, "fenced_div") ? grip.right : row.left) &&
        event.clientY >= Math.min(row.top, grip.top) &&
        event.clientY <= Math.max(row.bottom, grip.bottom)) return;
    }
    const block = this.candidate(event.clientX, event.clientY);
    const rect = block && this.rowRect(block);
    if (
      !block ||
      !rect ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom ||
      event.clientX > rect.right + 4 ||
      event.clientX < rect.left - (isEditorKind(block.node, "fenced_div") ? 112 : 80)
    ) {
      this.handle.classList.remove("visible");
      this.addButton.classList.remove("visible");
      return;
    }
    this.hovered = block;
    const rootRect = this.root.getBoundingClientRect();
    const dom = this.view.nodeDOM(block.pos) as HTMLElement;
    // List markers occupy the list wrapper's padding. Anchor controls outside
    // that wrapper, just as other blocks use their outer edge, not their text.
    // A nested list has its own wrapper, so its gutter retains the indentation.
    const edge = (isListItem(block.node) ? dom.parentElement : dom)!
      .getBoundingClientRect().left;
    const gutterOffset = isEditorKind(block.node, "fenced_div") ? 84 : 36;
    this.handle.style.left = `${edge - rootRect.left - gutterOffset}px`;
    this.handle.style.top = `${rect.top - rootRect.top + Math.max(0, (Math.min(rect.height, 32) - 24) / 2)}px`;
    this.addButton.style.left = parseFloat(this.handle.style.left) - 24 + "px";
    this.addButton.style.top = this.handle.style.top;
    this.addButton.classList.add("visible");
    this.handle.dataset.blockPos = String(block.pos);
    this.handle.classList.add("visible");
  }

  private siblingDropGap(position: number) {
    const doc = this.view.state.doc;
    let boundary = doc.resolve(position);
    // List wrappers are not separate draggable rows. Their first/last item
    // shares the outer gap with the neighboring block outside the list.
    while (["bullet_list", "ordered_list"].includes(editorKind(boundary.parent)) &&
      (boundary.parentOffset === 0 || boundary.parentOffset === boundary.parent.content.size)) {
      position = boundary.parentOffset === 0 ? boundary.before() : boundary.after();
      boundary = doc.resolve(position);
    }
    const before = boundary.nodeBefore;
    const after = boundary.nodeAfter;
    if (!before?.isBlock || !after?.isBlock) return null;
    const beforeDOM = this.view.nodeDOM(position - before.nodeSize);
    const afterDOM = this.view.nodeDOM(position);
    if (!(beforeDOM instanceof HTMLElement) || !(afterDOM instanceof HTMLElement)) return null;
    const upper = beforeDOM.getBoundingClientRect();
    const lower = afterDOM.getBoundingClientRect();
    // Hidden blocks and side-by-side columns do not define a vertical gap.
    if (!upper.height || !lower.height || upper.bottom > lower.top) return null;
    const edge = (node: PMNode, dom: HTMLElement, rect: DOMRect) =>
      isListItem(node) ? dom.parentElement!.getBoundingClientRect().left : rect.left;
    return {
      top: (upper.bottom + lower.top) / 2,
      left: Math.min(edge(before, beforeDOM, upper), edge(after, afterDOM, lower)),
      right: Math.max(upper.right, lower.right),
    };
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
        schema.nodes["block.bullet_list_item"],
        schema.nodes["block.numbered_list_item"],
        schema.nodes["block.task_list_item"],
        schema.nodes["block.definition_list_item"],
        schema.nodes["structure.nested_block"],
        schema.nodes["block.paragraph"],
        schema.nodes["block.heading"],
        schema.nodes["block.toggle"],
        schema.nodes["block.callout"],
        schema.nodes["block.synced_block"],
        schema.nodes["block.quote"],
      ].includes(block.node.type) && event.clientX > rect.left + 36
        ? "inside"
        : event.clientY < rect.top + rect.height / 2
          ? "before"
          : "after";
    this.dropTarget = { block, placement };
    const source = blockAtPos(this.view.state.doc, this.dragFrom);
    if (
      !source ||
      (block.pos >= source.pos && block.pos < source.end) ||
      [...this.selectedBlocks].some((pos) => {
        const row = blockAtPos(this.view.state.doc, pos);
        return row && block.pos >= row.pos && block.pos < row.end;
      }) ||
      (placement === "inside" &&
        this.options.canCommand?.("nesting") === false &&
        !isListItem(block.node) && !isEditorKind(block.node, "definition_list_item"))
    ) {
      this.dropTarget = null;
      this.dropLine.classList.remove("visible");
      return;
    }
    const rootRect = this.root.getBoundingClientRect();
    const dom = this.view.nodeDOM(block.pos) as HTMLElement;
    const bounds = dom.getBoundingClientRect();
    // "After A" and "before B" name the same document boundary. Use its
    // shared gap instead of alternating between A's bottom and B's top.
    const gap = placement === "inside" ? null
      : this.siblingDropGap(placement === "before" ? block.pos : block.end);
    // Include this list level's marker gutter so siblings do not look indented.
    const left = gap?.left ?? (isListItem(block.node)
      ? dom.parentElement!.getBoundingClientRect().left
      : rect.left);
    const childLeft = isListItem(block.node) ? rect.left : left + 24;
    this.dropLine.dataset.placement = placement;
    this.dropLine.style.setProperty("--pm-drop-indent", `${childLeft - left}px`);
    this.dropLine.style.left = `${left - rootRect.left}px`;
    // Both after and inside append after existing descendants, not the head row.
    this.dropLine.style.top = `${(gap?.top ?? (placement === "before" ? bounds.top : bounds.bottom)) - rootRect.top}px`;
    this.dropLine.style.width = `${(gap?.right ?? rect.right) - left}px`;
    this.dropLine.classList.add("visible");
  }

  private finishDrop(event: DragEvent) {
    if (this.dragFrom === null) return;
    event.preventDefault();
    event.stopPropagation();
    this.previewDrop(event);
    if (this.dropTarget) {
      const tr = moveEditorBlocks(
        this.view.state,
        this.selectedBlocks.has(this.dragFrom)
          ? [...this.selectedBlocks]
          : [this.dragFrom],
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
    this.addButton.classList.remove("visible");
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
    const syncPositions = this.selectedBlocks.has(block.pos) ? [...this.selectedBlocks] : [block.pos];
    this.selectBlocks([block.pos]);
    const menu = document.createElement("div");
    menu.className = "pm-block-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Block actions");
    const add = (title: string, action: () => void, hint = "", opensDialog = false) => {
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
        this.closeMenu();
        action();
        if (!opensDialog) this.view.focus();
      });
      menu.append(button);
    };
    const choose = () => {
      const pos = Math.min(
        block.pos + (isListItem(block.node) ? 2 : 1),
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
    const currentType = document.createElement("div");
    currentType.className = "pm-block-type";
    currentType.textContent = blockTypeLabel(block.node, block.listNode);
    menu.append(currentType);
    add("View source", () => {
      try {
        // Collect pending DOM edits before reading the live block.
        if (!this.isComposing())
          (this.view as unknown as { domObserver: { flush(): void } }).domObserver.flush();
        const source = blockSource(this.view.state.doc, block.pos, doc =>
          this.options.codec?.serialize(doc) ??
          (this.bodyFormat === "notion-markdown" ? serializeNotionMarkdown(doc) : serializeEditorMarkdown(doc)),
        );
        this.sourceDialog?.close();
        const dialog = openBlockSource(source, () => {
          if (this.sourceDialog !== dialog) return;
          this.sourceDialog = undefined;
          if (!this.destroyed) this.view.focus();
        }, this.abort.signal);
        this.sourceDialog = dialog;
      } catch (error) {
        this.options.onError(error);
        this.view.focus();
      }
    }, "", true);
    if (blockPropertyFields(block.node).length) {
      add("Properties…", () => openBlockProperties(this.view, block.pos), "", true);
      menu.append(document.createElement("hr"));
    }
    const label = document.createElement("small");
    label.textContent = "Turn into";
    menu.append(label);
    if (this.options.canCommand?.("notion_custom") === true && this.options.canCommand?.("synced_block") !== false && wrapSyncedBlocks(this.view.state, syncPositions))
      add("Synced block", () => {
        const tr = wrapSyncedBlocks(this.view.state, syncPositions);
        if (tr) this.view.dispatch(closeHistory(tr).scrollIntoView());
      });
    for (const [type, title] of [
      ["text", "Text"],
      ["heading1", "Heading 1"],
      ["heading2", "Heading 2"],
      ["heading3", "Heading 3"],
      ["list", "Bulleted list"],
      ["number", "Numbered list"],
      ["task", "To-do list"],
      ["quote", "Quote"],
      ["code", "Code"],
    ] as [BlockType, string][])
      if (this.options.canCommand?.(type) !== false)
        add(contentCommand(type).label || title, () => {
          choose();
          this.insertBlockType(type);
        });
    menu.append(document.createElement("hr"));
    if (isEditorKind(block.node, "heading"))
      add(
        this.folded.has(block.pos) ? "Expand heading" : "Collapse heading",
        () => {
          if (this.folded.has(block.pos)) this.folded.delete(block.pos);
          else this.folded.add(block.pos);
          this.view.dispatch(this.view.state.tr.setMeta("addToHistory", false));
        },
      );
    add("Duplicate block", () => {
      const tr = duplicateEditorBlock(this.view.state, block.pos);
      if (tr) this.view.dispatch(closeHistory(tr));
    });
    add("Delete", () => {
      const tr = deleteEditorBlock(this.view.state, block.pos);
      if (tr) this.view.dispatch(closeHistory(tr));
    });
    document.body.append(menu);
    const rect = this.handle.getBoundingClientRect();
    const margin = 8, gap = 8;
    const width = menu.offsetWidth;
    const left = rect.left - gap - width;
    if (left >= margin) {
      // Open away from the content, with the grip beside the menu's midpoint.
      menu.style.left = `${left}px`;
      menu.style.top = `${Math.max(margin, Math.min(rect.top + rect.height / 2 - menu.offsetHeight / 2, innerHeight - menu.offsetHeight - margin))}px`;
    } else {
      // A narrow viewport has no side gutter: use the larger space above/below
      // the block and scroll the actions instead of covering its text.
      const dom = this.view.nodeDOM(block.pos) as HTMLElement;
      const bounds = dom.getBoundingClientRect();
      const above = Math.max(0, bounds.top - gap - margin);
      const below = Math.max(0, innerHeight - bounds.bottom - gap - margin);
      const placeBelow = below >= above;
      const available = placeBelow ? below : above;
      menu.style.maxHeight = `${Math.min(innerHeight - margin * 2, Math.max(80, available))}px`;
      menu.style.left = `${Math.max(margin, Math.min(rect.left, innerWidth - width - margin))}px`;
      menu.style.top = `${Math.max(margin, Math.min(placeBelow ? bounds.bottom + gap : bounds.top - gap - menu.offsetHeight, innerHeight - menu.offsetHeight - margin))}px`;
    }
    this.menu = menu;
    this.handle.classList.add("menu-open");
    this.addButton.classList.remove("visible");
    menu.querySelector("button")?.focus();
  }

  private showLinkEditor() {
    this.captureSelection();
    this.linkDialog?.remove();
    const { selection } = this.view.state;
    if (!this.view.editable || selection.$from.parent.type.spec.code || selection.$to.parent.type.spec.code) return;
    const original = this.view.state.doc, bookmark = selection.getBookmark();
    const linkRange = linkRangeAtSelection(this.view.state);
    const link = linkRange?.mark;
    const apply = (href: string, label?: string): string | undefined => {
      if (this.destroyed || !this.view.editable || !this.view.state.doc.eq(original)) return "Content changed. Reopen the link editor.";
      this.view.dispatch(this.view.state.tr.setSelection(bookmark.resolve(this.view.state.doc)));
      this.bookmark = undefined;
      const state = this.view.state;
      let { from, to } = state.selection;
      const range = linkRangeAtSelection(state);
      if (from === to && range) {
        from = range.from;
        to = range.to;
      }
      let tr = closeHistory(state.tr).removeMark(from, to, schema.marks.link);
      if (href && from === to)
        tr = tr.replaceSelectionWith(
          schema.text(label || href, [...(state.storedMarks ?? state.selection.$from.marks()).filter(mark => mark.type !== schema.marks.link), schema.marks.link.create({ href })]),
          false,
        );
      else if (href) tr.addMark(from, to, schema.marks.link.create({ href }));
      this.view.dispatch(tr.setMeta("isolateHistory", true));
      this.view.focus();
    };
    this.linkDialog = showLinkPicker({
      href: link?.attrs.href || "",
      pages: this.options.pages,
      recentPages: this.options.recentPages,
      anchor: () => this.view.coordsAtPos(Math.min(selection.from, this.view.state.doc.content.size)),
      apply,
      cancel: () => {
        if (!this.destroyed && this.view.state.doc.eq(original)) {
          this.view.dispatch(this.view.state.tr.setSelection(bookmark.resolve(original)));
          this.view.focus();
        }
      },
    });
  }

  destroy() {
    this.destroyed = true;
    this.stopTouchDrag?.();
    this.selectionResize?.disconnect();
    cancelAnimationFrame(this.selectionFrame);
    this.abort.abort();
    this.closeMenu();
    this.linkDialog?.remove();
    this.view.destroy();
    this.sourceDialog?.remove();
    this.handle.remove();
    this.addButton.remove();
    this.marquee.remove();
    this.selectionLayer.remove();
    this.dropLine.remove();
  }
}
