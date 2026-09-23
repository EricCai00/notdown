import { Compartment, EditorState, Prec } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  scrollPastEnd,
} from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { BlockEditor } from "../editor/prosemirror-editor.js";
import type { Page } from "../shared/types.js";
import { escape as escapeHtml } from "../shared/types.js";
import { DocumentSession } from "./session.js";
import { extensionCategoryHeading } from "../catalog/extension-categories";
import {
  commandEnabled,
  dialects,
  extensions,
  enabled,
  supportsOption,
  syntaxFormat,
  resetExtensions,
  pendingExtensions,
  pandocDefaults,
  type SyntaxConfig,
} from "./config.js";
import { parseNative, serializeNative } from "./codec.js";
import { mapScroll, type Anchor } from "../markdown-lab/scroll.js";
import "./workspace.css";
import "./products.css";
import { groupExtensions, extensionProvenanceHtml, pandocDefaultVersion, isBuiltInSyntax } from "../catalog/extension-provenance";
import "../catalog/extension-provenance.css";

export type EditMode = "document" | "source" | "split";
interface Options {
  metadataHost?: HTMLElement;
  source: string;
  config: SyntaxConfig;
  mode: EditMode;
  pages: () => Page[];
  currentPage?: () => Page | undefined;
  onChange(source: string, config: SyntaxConfig): void;
  onMode(mode: EditMode): void;
  onInsert(): void;
  onError(error: unknown): void;
  onOpenPage?: (id: string) => void;
}
/** Both views share a source draft and a bounded history; mode changes only hide a projection. */
export class MarkdownWorkspace {
  readonly session: DocumentSession;
  readonly blocks: BlockEditor;
  readonly source: EditorView;
  activePane: "source" | "document" = "document";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending = false;
  private projecting = false;
  private destroyed = false;
  private abort = new AbortController();
  private resize: ResizeObserver;
  private readonly scrollExtension = new Compartment();
  private scrollPane: "source" | "document" = "source";
  private mappingSource = "";
  private mappingConfig = "";
  private mappingOffsets = [0];
  private mappingDoc: ReturnType<typeof parseNative>;
  private syncFrame = 0;
  private expected: { pane: string; top: number } | undefined;
  private pageScroll: { outer: number; inner: number } | undefined;
  private readonly pagePane: HTMLElement;
  constructor(
    readonly root: HTMLElement,
    private options: Options,
  ) {
    this.session = new DocumentSession(options.source, options.config);
    this.mappingDoc = this.session.snapshot.doc;
    root.className = "markdown-workspace";
    root.innerHTML = `<div class="editing-toolbar"><div class="editing-modes" role="group" aria-label="Editing view"><button type="button" data-mode="source">Source</button><button type="button" data-mode="split">Split</button><button type="button" data-mode="document">Page</button></div><label class="dialect-label">Dialect <select aria-label="Markdown dialect">${dialects.map((v) => `<option value="${v.id}" ${v.native ? "" : "disabled"}>${v.label}</option>`).join("")}</select></label><details class="syntax-options"><summary>Extensions</summary><div class="syntax-options-panel"></div></details><label class="scroll-toggle"><input type="checkbox" checked aria-label="Sync scrolling">Sync scrolling</label><span class="editing-state" aria-live="polite"></span></div><div class="editing-panes"><section class="source-pane" aria-label="Source pane"><div class="pane-title">Markdown source</div><div class="source-mount"></div></section><section class="page-pane" aria-label="Page pane"><div class="pane-title">Page · Editable</div><div id="editor"></div></section></div>`;
    this.pagePane = root.querySelector(".page-pane")!;
    const newline = options.source.match(/\r\n|\n|\r/)?.[0] ?? "\n";
    this.source = new EditorView({
      parent: root.querySelector(".source-mount")!,
      state: EditorState.create({
        doc: options.source,
        extensions: [
          lineNumbers(),
          drawSelection(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          markdown(),
          syntaxHighlighting(defaultHighlightStyle),
          EditorView.lineWrapping,
          this.scrollExtension.of([]),
          EditorState.lineSeparator.of(newline),
          // Windows clipboard CRLF must not leave literal CR characters in
          // LF documents (or LF inside a single line of CRLF documents).
          EditorView.clipboardInputFilter.of((text, state) =>
            text.replace(/\r\n|\r|\n/g, state.lineBreak),
          ),
          EditorView.contentAttributes.of({
            id: "source-editor",
            "aria-label": "Markdown source",
            spellcheck: "false",
          }),
          Prec.high(
            EditorView.domEventHandlers({
              keydown: (event) => {
                if (
                  !event.isComposing &&
                  !event.altKey &&
                  (event.ctrlKey || event.metaKey) &&
                  event.key.toLowerCase() === "z"
                ) {
                  event.preventDefault();
                  return this.history(event.shiftKey ? "redo" : "undo");
                }
                return false;
              },
            }),
          ),
          keymap.of([
            {
              key: "Mod-z",
              run: () => this.history("undo"),
              shift: () => this.history("redo"),
            },
            { key: "Mod-y", run: () => this.history("redo") },
            indentWithTab,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            // CodeMirror refines estimated heights as wrapped lines enter its viewport.
            if (update.geometryChanged || update.viewportChanged)
              this.scheduleScroll();
            if (this.projecting || !update.docChanged) return;
            try {
              this.session.sourceChanged(update.state.sliceDoc(), true);
              this.scrollPane = "source";
              this.pending = true;
              this.blocks.setEditable(false);
              this.pagePane.setAttribute("aria-busy", "true");
              this.publish();
              clearTimeout(this.timer);
              this.timer = setTimeout(() => this.flush(), 70);
            } catch (error) {
              options.onError(error);
            }
          }),
          EditorView.domEventHandlers({
            focus: () => {
              this.activePane = "source";
            },
            compositionend: () => {
              clearTimeout(this.timer);
              this.timer = setTimeout(() => this.flush(), 0);
            },
          }),
        ],
      }),
    });
    this.blocks = new BlockEditor(root.querySelector("#editor")!, {
      metadataHost: options.metadataHost,
      value: options.source,
      bodyFormat: syntaxFormat(options.config),
      pages: options.pages,
      currentPage: options.currentPage,
      codec: this.codec(),
      onHistory: (direction) => this.history(direction),
      canCommand: (name) => commandEnabled(this.session.snapshot.config, name),
      onOpenPage: options.onOpenPage,
      onDocumentChange: (doc, isolateHistory) => {
        if (this.projecting) return;
        try {
          if (isolateHistory) this.session.breakHistory();
          this.session.documentChanged(doc);
          this.scrollPane = "document";
          if (isolateHistory) this.session.breakHistory();
          this.syncSource();
          this.publish();
        } catch (error) {
          options.onError(error);
        }
      },
      onChange: () => {},
      onInsert: options.onInsert,
      onError: options.onError,
    });
    const { signal } = this.abort;
    this.pagePane.addEventListener(
      "focusin",
      () => {
        this.activePane = "document";
      },
      { signal },
    );
    this.pagePane.addEventListener("pointerdown", () => this.flush(), {
      signal,
      capture: true,
    });
    options.metadataHost?.addEventListener("pointerdown", () => this.flush(), { signal, capture: true });
    options.metadataHost?.addEventListener("focusin", () => { this.activePane = "document"; }, { signal });
    options.metadataHost?.closest("details")?.addEventListener("toggle", () => this.measureLayout(), { signal });
    root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) =>
      button.addEventListener(
        "click",
        () => {
          const mode = button.dataset.mode as EditMode;
          this.setMode(mode);
          options.onMode(mode);
        },
        { signal },
      ),
    );
    root.querySelector("select")!.addEventListener(
      "change",
      (event) => {
        const variant = (event.target as HTMLSelectElement)
          .value as SyntaxConfig["variant"];
        this.configure({
          ...this.session.snapshot.config,
          variant,
          extensions: resetExtensions(this.session.snapshot.config),
        });
      },
      { signal },
    );
    root.querySelector(".syntax-options-panel")!.addEventListener(
      "change",
      (event) => {
        const target = event.target as HTMLInputElement;
        if (!target.dataset.extension) return;
        const config = this.session.snapshot.config;
        this.configure({
          ...config,
          extensions: {
            ...config.extensions,
            [target.dataset.extension]: target.checked,
          },
        });
      },
      { signal },
    );
    root.querySelector(".syntax-options-panel")!.addEventListener(
      "click",
      (event) => {
        if ((event.target as Element).closest("[data-reset-extensions]"))
          this.configure({
            ...this.session.snapshot.config,
            extensions: resetExtensions(this.session.snapshot.config),
          });
      },
      { signal },
    );
    this.source.scrollDOM.addEventListener(
      "scroll",
      () => this.scroll("source"),
      { signal, passive: true },
    );
    this.pagePane.addEventListener("scroll", () => this.scroll("document"), {
      signal,
      passive: true,
    });
    this.pagePane.addEventListener(
      "load",
      () => this.scheduleScroll(),
      { signal, capture: true },
    );
    root.querySelector('[aria-label="Sync scrolling"]')!.addEventListener(
      "change", () => { this.expected = undefined; this.scheduleScroll(); }, { signal },
    );
    this.resize = new ResizeObserver(() => this.scheduleScroll());
    this.resize.observe(this.pagePane);
    this.resize.observe(root.querySelector(".pm-document")!);
    window.addEventListener("resize", () => this.measureLayout(), { signal });
    this.controls();
    this.setMode(options.mode);
  }
  private codec() {
    const config = this.session.snapshot.config;
    return {
      parse: (text: string) => parseNative(text, config),
      serialize: (doc: ReturnType<typeof parseNative>) =>
        serializeNative(doc, config),
      format: syntaxFormat(config),
    };
  }
  private controls() {
    const config = this.session.snapshot.config;
    const panel = this.root.querySelector<HTMLElement>(".syntax-options-panel")!;
    const variantChanged = panel.dataset.variant !== config.variant;
    (this.root.querySelector("select") as HTMLSelectElement).value =
      config.variant;
    panel.innerHTML =
      `<p>Changing rules reinterprets the source. Disabled custom blocks retain their original text and can be edited in source view.</p><p>${config.variant === "notdown" ? "Notdown includes Notion-flavored Markdown syntax and enables all Notdown blocks by default. You can turn individual blocks off below." : "Dialect defaults follow the linked upstream specification. Notdown blocks are optional; choose the Notdown dialect to enable them by default."} ${escapeHtml(pandocDefaultVersion)} badges are comparison data only, not the defaults for other products. Built-in syntax is listed separately without switches.</p>${groupExtensions(extensions.filter(e => supportsOption(config, e.id) || isBuiltInSyntax(config.variant, e.id)), config.variant)
        .map(
          (group) =>
            `<section class="extension-group" data-extension-group="${group.id}"><h3>${group.label} <small>${group.entries.length}</small></h3>${group.entries
              .map(
                (ext, index) =>
                  (group.id === "other" ? extensionCategoryHeading(group.entries, index) : "") + (group.id === "builtin"
                    ? `<div class="extension-choice extension-builtin" data-builtin-extension="${ext.id}"><span><strong>${escapeHtml(ext.label)}</strong><code>${ext.id}</code>${extensionProvenanceHtml(config.variant, ext.id)}<small>Built into this dialect · no configurable switch</small><small>${escapeHtml(ext.description)}</small></span></div>`
                    : `<label class="extension-choice"><input type="checkbox" data-extension="${ext.id}" ${enabled(config, ext.id) ? "checked" : ""}><span><strong>${escapeHtml(ext.label)}</strong><code>${ext.id}</code>${extensionProvenanceHtml(config.variant, ext.id)}<small>${escapeHtml(ext.description)}</small></span></label>`),
              )
              .join("")}</section>`,
        )
        .join(
          "",
        )}<button type="button" data-reset-extensions>Reset dialect defaults</button>${
        pendingExtensions(config).length
          ? `<section class="pending-extensions"><h3>Extensions not yet implemented natively (${pendingExtensions(config).length})</h3><p>These extensions are not active. Their configuration and source are preserved. Compare full Pandoc parsing in Markdown Lab.</p>${pendingExtensions(
              config,
            )
              .map(
                (name) =>
                  `<div><code>${name}</code> · ${(config.extensions[name] ?? pandocDefaults[config.variant][name]) ? "Enabled in config (not implemented)" : "Disabled in config"}</div>`,
              )
              .join("")}</section>`
          : ""
      }<p>Available extensions depend on the dialect. The native reader does not fully reproduce Pandoc. ${config.variant === "markdown_github" ? "Pandoc has deprecated the legacy GitHub reader. Use GFM for new GitHub documents. " : ""}See Markdown Lab for full Pandoc comparison.</p>`;
    panel.dataset.variant = config.variant;
    if (variantChanged) panel.scrollTop = 0;
  }
  private publish() {
    this.scheduleScroll();
    this.root.querySelector(".editing-state")!.textContent = this.pending
      ? "Updating page…"
      : "Editing locally";
    this.options.onChange(
      this.session.snapshot.source,
      this.session.snapshot.config,
    );
  }
  private syncSource() {
    const text = this.session.snapshot.source.replace(/\r\n|\r/g, "\n"),
      old = this.source.state.doc.toString();
    if (text === old) return;
    let from = 0;
    while (from < old.length && from < text.length && old[from] === text[from])
      from++;
    let a = old.length,
      b = text.length;
    while (a > from && b > from && old[a - 1] === text[b - 1]) {
      a--;
      b--;
    }
    this.projecting = true;
    try {
      this.source.dispatch({
        changes: { from, to: a, insert: text.slice(from, b) },
      });
    } finally {
      this.projecting = false;
    }
  }
  flush() {
    if (this.destroyed || !this.pending) return;
    if (this.source.composing) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 70);
      return;
    }
    clearTimeout(this.timer);
    try {
      this.session.project();
      this.blocks.replaceDocument(this.session.snapshot.doc);
      this.pending = false;
      this.blocks.setEditable(true);
      this.pagePane.setAttribute("aria-busy", "false");
      this.scheduleScroll();
      this.root.querySelector(".editing-state")!.textContent = "Editing locally";
    } catch (error) {
      this.options.onError(error);
    }
  }
  capture() {
    this.flush();
    if (!this.pending) {
      this.blocks.getValue();
      this.session.documentChanged(this.blocks.getDocument());
    }
    return this.session.snapshot;
  }
  history(direction: "undo" | "redo") {
    this.flush();
    if (this.pending || this.blocks.isComposing()) return true;
    if (this.session[direction]()) {
      this.blocks.setCodec(this.codec());
      this.blocks.replaceDocument(this.session.snapshot.doc);
      this.syncSource();
      this.controls();
      this.publish();
    }
    return true;
  }
  configure(config: SyntaxConfig) {
    this.capture();
    if (this.pending || this.blocks.isComposing()) return;
    try {
      this.session.configure(config);
      this.blocks.setCodec(this.codec());
      this.blocks.replaceDocument(this.session.snapshot.doc);
      this.controls();
      this.publish();
    } catch (error) {
      this.options.onError(error);
    }
  }
  setMode(mode: EditMode) {
    this.capture();
    const previous = this.root.dataset.mode;
    const location =
      mode === "source" &&
      (previous === "document" || (previous === "split" && this.activePane === "document"))
        ? this.pageSourcePosition()
        : undefined;
    const main = this.root.closest<HTMLElement>("#main");
    if (mode === "source" && previous && previous !== "source")
      this.pageScroll = {
        outer: main?.scrollTop ?? 0,
        inner: this.pagePane.scrollTop,
      };
    cancelAnimationFrame(this.syncFrame);
    this.expected = undefined;
    this.session.breakHistory();
    this.root.dataset.mode = mode;
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-mode]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.mode === mode)),
      );
    this.source.dispatch({
      effects: this.scrollExtension.reconfigure(mode === "split" ? scrollPastEnd() : []),
    });
    if (
      location !== undefined && main &&
      this.root.getBoundingClientRect().top < main.getBoundingClientRect().top
    )
      this.root.scrollIntoView({ block: "start", behavior: "instant" });
    if (previous === "source" && mode !== "source" && this.pageScroll) {
      main?.scrollTo({ top: this.pageScroll.outer, behavior: "instant" });
      this.pagePane.scrollTop = this.pageScroll.inner;
    }
    this.measureLayout();
    this.source.requestMeasure();
    if (location !== undefined) {
      this.source.dispatch({
        selection: { anchor: location },
        effects: EditorView.scrollIntoView(location, { y: "center" }),
      });
    }
  }
  /** Locate the visible caret or reading block before hiding the page projection. */
  private pageSourcePosition(): number | undefined {
    const main = this.root.closest<HTMLElement>("#main")?.getBoundingClientRect();
    const pane = this.pagePane.getBoundingClientRect();
    const top = Math.max(0, main?.top ?? 0, pane.top);
    const bottom = Math.min(window.innerHeight, main?.bottom ?? window.innerHeight, pane.bottom);
    if (bottom <= top) return;
    const blocks = this.blocks.sourceBlocks(this.sourceMapping());
    const elements = blocks.map(block => block.element);
    let index = -1;
    // Ignore the clipped tail of the previous block at the very top edge.
    let y = top + Math.min(12, (bottom - top) / 2);
    const selection = window.getSelection();
    if (selection?.focusNode && this.activePane === "document") {
      const selected = elements.findIndex(element => element.contains(selection.focusNode));
      if (selected >= 0) {
        const range = document.createRange();
        range.setStart(selection.focusNode, selection.focusOffset);
        range.collapse(true);
        const caret = range.getBoundingClientRect();
        if (caret.height && caret.top >= top && caret.bottom <= bottom) {
          index = selected;
          y = caret.top;
        }
      }
    }
    // A stale caret above/below the viewport must not override manual scrolling.
    if (index < 0) {
      let nearestTop = Infinity;
      // Footnotes can be displayed after the body regardless of source order.
      elements.forEach((element, candidate) => {
        const rect = element.getBoundingClientRect();
        if (rect.height > 0 && rect.bottom > y && rect.top < bottom && rect.top < nearestTop) {
          index = candidate;
          nearestTop = rect.top;
        }
      });
    }
    if (index < 0) return;
    const node = blocks[index].node;
    const start = node.attrs.sourceStart, end = node.attrs.sourceEnd;
    if (typeof start !== "number" || typeof end !== "number") return;
    const rect = elements[index].getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (y - rect.top) / Math.max(1, rect.height)));
    // Source ranges use file offsets; CodeMirror counts every newline as one unit.
    const from = this.mappingSource.slice(0, start).replace(/\r\n|\r/g, "\n").length;
    const text = this.mappingSource.slice(start, end).replace(/\r\n|\r/g, "\n").replace(/\n+$/, "");
    const lines = text.split("\n");
    const line = Math.min(lines.length - 1, Math.floor(fraction * lines.length));
    const offset = lines.slice(0, line).reduce((sum, value) => sum + value.length + 1, 0);
    return Math.min(this.source.state.doc.length, from + offset);
  }
  private measureLayout() {
    if (this.root.dataset.mode === "document") return;
    const top = this.root
      .querySelector(".editing-panes")!
      .getBoundingClientRect().top;
    this.root.style.setProperty(
      "--editing-height",
      `${Math.max(300, window.innerHeight - top - 40)}px`,
    );
    this.scheduleScroll();
  }
  insertFootnote() {
    if (!commandEnabled(this.session.snapshot.config, "footnote")) return;
    if (this.activePane === "source") {
      const state = this.source.state, source = state.sliceDoc();
      let label = "note", number = 1;
      while (source.includes("[^" + label + "]")) label = "note" + ++number;
      const reference = `[^${label}]`, newline = state.lineBreak;
      const definition = `${newline}${newline}[^${label}]: Footnote text.${newline}`;
      const { from, to } = state.selection.main;
      this.source.dispatch({
        changes: to === state.doc.length
          ? { from, to, insert: reference + definition }
          : [{ from, to, insert: reference }, { from: state.doc.length, insert: definition }],
        selection: { anchor: from + reference.length },
      });
      this.source.focus();
    } else {
      this.flush();
      this.blocks.insertFootnote();
    }
  }

  insert(text: string) {
    if (this.activePane === "source") {
      this.source.dispatch(this.source.state.replaceSelection(text));
      this.source.focus();
    } else {
      this.flush();
      this.blocks.insertValue(text);
    }
  }
  private anchors(): { points: Anchor[]; pagePadding: number } {
    const points: Anchor[] = [{ source: 0, preview: 0 }];
    let lastBottom = -Infinity, lastHeight = 30;
    this.sourceMapping();
    const offsets = this.mappingOffsets;
    const blocks = this.blocks.sourceBlocks(this.mappingDoc);
    const inset =
      this.source.documentTop -
      this.source.scrollDOM.getBoundingClientRect().top +
      this.source.scrollDOM.scrollTop;
    const pageTop = this.pagePane.getBoundingClientRect().top;
    const lineAt = (offset: number) => {
      let low = 0, high = offsets.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (offsets[mid] <= offset) low = mid + 1;
        else high = mid;
      }
      return this.source.lineBlockAt(
        this.source.state.doc.line(Math.max(1, Math.min(low, this.source.state.doc.lines))).from,
      );
    };
    blocks.forEach(({ node, element }) => {
        const start = node.attrs.sourceStart, end = node.attrs.sourceEnd;
        if (typeof start !== "number" || typeof end !== "number" || !element.getClientRects().length)
          return;
        const rect = element.getBoundingClientRect();
        if (!rect.height) return;
        if (rect.bottom > lastBottom) {
          lastBottom = rect.bottom;
          lastHeight = rect.height;
        }
        const source = inset + lineAt(start).top;
        const preview = rect.top - pageTop + this.pagePane.scrollTop;
        const previous = points.at(-1)!;
        // Keep all content anchors, including blocks below either scroll limit.
        // Hidden/reordered blocks cannot supply a monotonic pair of anchors.
        if (source < previous.source || preview < previous.preview) return;
        points.push({ source, preview });
        // Ends map text to text and source separators to gaps, even when a
        // large source block renders as a compact surface.
        points.push({
          source: inset + lineAt(Math.max(start, end - 1)).bottom,
          preview: rect.bottom - pageTop + this.pagePane.scrollTop,
        });
      });
    // End padding only provides room to bring the final block to the top.
    // It must not scroll the other pane past that block into empty space.
    if (points.length > 1) {
      const end = points.at(-1)!, start = points.at(-2)!;
      end.source = Math.max(start.source, end.source - 1);
      end.preview = Math.max(start.preview, end.preview - 1);
    }
    const document = this.root.querySelector<HTMLElement>(".pm-document")!;
    const padding = Number.parseFloat(getComputedStyle(document).paddingBottom) || 0;
    // Include trailing layout space outside the document too (editor controls
    // and caret space). Round scrollHeight's integer geometry to avoid a
    // subpixel padding/resize feedback loop.
    const trailing = Number.isFinite(lastBottom)
      ? Math.max(0, Math.round(this.pagePane.scrollHeight -
          (lastBottom - pageTop + this.pagePane.scrollTop) - padding))
      : 0;
    return {
      points,
      pagePadding: Math.max(0, this.pagePane.clientHeight - Math.min(30, lastHeight) - trailing),
    };
  }
  private sourceMapping() {
    const configKey = JSON.stringify(this.session.snapshot.config);
    if (this.mappingSource !== this.session.snapshot.source || this.mappingConfig !== configKey) {
      this.mappingSource = this.session.snapshot.source;
      this.mappingConfig = configKey;
      this.mappingDoc = parseNative(this.mappingSource, this.session.snapshot.config);
      this.mappingOffsets = [0];
      for (const match of this.mappingSource.matchAll(/\r\n|\r|\n/g))
        this.mappingOffsets.push(match.index + match[0].length);
    }
    return this.mappingDoc;
  }
  private canSyncScroll() {
    return !this.destroyed && !this.pending && this.root.dataset.mode === "split" &&
      (this.root.querySelector('[aria-label="Sync scrolling"]') as HTMLInputElement).checked;
  }
  private scroll(pane: "source" | "document") {
    // Remember manual scrolling while sync is disabled, so re-enabling it
    // follows the pane the user just read instead of restoring an old offset.
    if (this.destroyed || this.pending || this.root.dataset.mode !== "split") return;
    const from = pane === "source" ? this.source.scrollDOM : this.pagePane;
    if (
      this.expected?.pane === pane &&
      Math.abs(from.scrollTop - this.expected.top) < 2
    ) {
      return;
    }
    this.expected = undefined;
    this.scrollPane = pane;
    this.scheduleScroll();
  }
  private scheduleScroll() {
    if (!this.canSyncScroll()) return;
    cancelAnimationFrame(this.syncFrame);
    this.syncFrame = requestAnimationFrame(() => {
      if (!this.canSyncScroll()) return;
      // Read after CodeMirror has measured its viewport, not while its line
      // heights still describe the previous viewport.
      this.source.requestMeasure({
        key: this,
        read: () => {
          if (!this.canSyncScroll()) return;
          const pane = this.scrollPane;
          const from = pane === "source" ? this.source.scrollDOM : this.pagePane;
          const to = pane === "source" ? this.pagePane : this.source.scrollDOM;
          try {
            const { points, pagePadding } = this.anchors();
            const target = mapScroll(points, from.scrollTop, pane === "source" ? "source" : "preview");
            return { pane, to, pagePadding, top: Math.max(0, Math.min(target, to.scrollHeight - to.clientHeight)) };
          } catch (error) {
            this.options.onError(error);
          }
        },
        write: (result) => {
          if (!result || !this.canSyncScroll() || result.pane !== this.scrollPane) return;
          const { to, top, pane, pagePadding } = result;
          const padding = `${pagePadding}px`;
          if (this.pagePane.style.getPropertyValue("--page-scroll-padding") !== padding) {
            // A short final block (for example a divider) must also reach the
            // top, while a tall final block retains a visible line at the end.
            this.pagePane.style.setProperty("--page-scroll-padding", padding);
            this.scheduleScroll();
            return;
          }
          if (Math.abs(to.scrollTop - top) < 1) return;
          this.expected = { pane: pane === "source" ? "document" : "source", top };
          to.scrollTop = top;
        },
      });
    });
  }
  destroy() {
    this.capture();
    this.destroyed = true;
    clearTimeout(this.timer);
    cancelAnimationFrame(this.syncFrame);
    this.abort.abort();
    this.resize.disconnect();
    this.source.destroy();
    this.blocks.destroy();
  }
}
