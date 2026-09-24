import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { renderRawHtml } from "./html.js";
import { parseNative, renderGfmSyntax } from "./codec.js";
import { EditorState, Prec } from "@codemirror/state";
import {
  EditorView as SourceView,
  keymap,
  lineNumbers,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
} from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { createElement, CodeXml } from "lucide";

const htmlViews = new WeakMap<HTMLElement, HtmlBlockView>();
let nextSourceId = 0;

export function isHtmlBlock(node: PMNode) {
  return (
    node.type.name === "html_block" ||
    (node.type.name === "syntax_block" &&
      node.attrs.kind === "raw" &&
      node.attrs.data?.format === "html")
  );
}

export class HtmlBlockView implements NodeView {
  dom = document.createElement("div");
  private preview = document.createElement("div");
  private pane = document.createElement("div");
  private source?: SourceView;
  private projecting = false;
  private button = document.createElement("button");
  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.dom.className = "pm-html-block";
    this.dom.contentEditable = "false";
    this.preview.className = "pm-html-preview";
    htmlViews.set(this.dom, this);
    this.pane.className = "pm-html-source";
    this.pane.id = `html-block-source-${++nextSourceId}`;
    this.pane.hidden = true;
    this.button.type = "button";
    this.button.append(
      createElement(CodeXml, { width: 16, height: 16, "aria-hidden": "true" }),
    );
    this.button.setAttribute("aria-label", "HTML source");
    this.button.title = "HTML source";
    this.button.setAttribute("aria-controls", this.pane.id);
    this.button.setAttribute("aria-expanded", "false");
    this.button.className = "pm-html-edit";
    this.button.addEventListener("click", () => {
      this.showSource(this.pane.hidden);
    });
    this.dom.append(this.button, this.preview, this.pane);
    this.update(node);
  }
  private showSource(open: boolean) {
    this.pane.hidden = !open;
    this.button.setAttribute("aria-expanded", String(open));
    if (!open) {
      this.button.focus();
      return;
    }
    if (!this.source) {
      this.source = new SourceView({
        parent: this.pane,
        state: EditorState.create({
          doc: this.node.attrs.raw,
          extensions: [
            lineNumbers(),
            drawSelection(),
            highlightActiveLine(),
            highlightActiveLineGutter(),
            html(),
            syntaxHighlighting(defaultHighlightStyle),
            EditorState.lineSeparator.of(
              this.node.attrs.raw.match(/\r\n|\n|\r/)?.[0] ?? "\n",
            ),
            SourceView.clipboardInputFilter.of((text, state) =>
              text.replace(/\r\n|\r|\n/g, state.lineBreak),
            ),
            SourceView.contentAttributes.of({
              "aria-label": "HTML block source",
              spellcheck: "false",
            }),
            // The outer editor can temporarily lock during source projection.
            EditorState.changeFilter.of(
              () => this.projecting || this.view.editable,
            ),
            Prec.high(
              SourceView.domEventHandlers({
                keydown: (event) => this.handleKeyDown(event),
              }),
            ),
            keymap.of([indentWithTab, ...defaultKeymap]),
            SourceView.updateListener.of((update) => {
              if (update.docChanged && !this.projecting)
                this.writeSource(update.state.sliceDoc());
            }),
          ],
        }),
      });
    }
    this.source.requestMeasure();
    this.source.focus();
  }
  private writeSource(raw: string) {
    if (!this.view.editable) return;
    const pos = this.getPos();
    // Raw attributes retain their complete fenced source. Reparse only this
    // carrier so the format, preview and recoverable source stay in sync.
    if (pos !== undefined && this.node.type.name === "syntax_block") {
      const parsed = parseNative(raw, this.node.attrs.config);
      const first = parsed.firstChild;
      const attrs =
        parsed.childCount === 1 &&
        first?.type === this.node.type &&
        first.attrs.kind === "raw"
          ? first.attrs
          : { ...this.node.attrs, raw, html: "", data: { format: "html" } };
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, undefined, {
          ...attrs,
          source: null,
          sourceFingerprint: null,
          sourceKey: this.node.attrs.sourceKey,
        }),
      );
      return;
    }
    if (pos !== undefined)
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, undefined, {
          ...this.node.attrs,
          raw,
        }),
      );
  }
  private handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && !event.isComposing) {
      event.preventDefault();
      this.showSource(false);
      return true;
    }
    if (
      !event.isComposing &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      ["z", "y"].includes(event.key.toLowerCase())
    ) {
      // The HTML source field participates in the same document history.
      const pos = this.getPos();
      const selection = this.source!.state.selection.main;
      this.view.someProp("handleKeyDown", (handler) =>
        handler(this.view, event),
      );
      event.preventDefault();
      // History may replace the node view. Keep its source editor open and focused.
      const dom = pos === undefined ? null : this.view.nodeDOM(pos);
      if (
        dom instanceof HTMLElement &&
        dom.classList.contains("pm-html-block")
      ) {
        const current = htmlViews.get(dom);
        current?.showSource(true);
        const source = current?.source;
        if (source)
          source.dispatch({
            selection: {
              anchor: Math.min(selection.anchor, source.state.doc.length),
              head: Math.min(selection.head, source.state.doc.length),
            },
          });
      }
      return true;
    }
    return false;
  }
  update(node: PMNode) {
    if (!isHtmlBlock(node)) return false;
    this.node = node;
    const html = renderRawHtml(
      node.type.name === "html_block"
        ? node.attrs.gfmConfig ? renderGfmSyntax(node.attrs.raw, node.attrs.gfmConfig) : node.attrs.raw
        : node.attrs.data?.code || "",
      Boolean(node.attrs.tagfilter),
      Boolean(node.attrs.gfmConfig),
    );
    this.preview.innerHTML = html;
    if (this.source && this.source.state.sliceDoc() !== node.attrs.raw) {
      this.projecting = true;
      try {
        this.source.dispatch({
          changes: {
            from: 0,
            to: this.source.state.doc.length,
            insert: node.attrs.raw,
          },
        });
      } finally {
        this.projecting = false;
      }
    }
    return true;
  }
  stopEvent(event: Event) {
    return (
      event.target instanceof globalThis.Node &&
      (this.pane.contains(event.target) || this.button.contains(event.target))
    );
  }
  ignoreMutation() {
    return true;
  }
  destroy() {
    this.source?.destroy();
    htmlViews.delete(this.dom);
  }
}
export function htmlInlineView(node: PMNode): NodeView {
  const dom = document.createElement("span");
  dom.className = "pm-html-inline";
  dom.contentEditable = "false";
  dom.title = "Edit the HTML fragment in source view";
  dom.innerHTML = renderRawHtml(node.attrs.html);
  return { dom, ignoreMutation: () => true };
}
