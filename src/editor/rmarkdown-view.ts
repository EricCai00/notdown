import { executionLanguage, languageLabel, quartoHeader } from "../markdown-engine/quarto";
import { type Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import { isRChunkHeader } from "../markdown-engine/rmarkdown";
import { rExpressionSource } from "../document/r-expression";
import { showEditorPanel } from "./editor-panel";
import { Settings, Play, ArrowDownToLine, Square, RotateCcw } from "lucide";
import { TextSelection } from "prosemirror-state";
import { registerRTarget, requestRAction, type RTarget, type RResult } from "./r-notebook-state";
import { rButton, RNotebookOutput } from "./r-notebook-output";
import "./rmarkdown-view.css";
import { executableLanguageChoices, rememberExecutableLanguage, withExecutionLanguage } from "./executable-language";

/** Shared notebook cell view. Only program text belongs to contentDOM. */
export class RChunkView implements NodeView {
  readonly dom = document.createElement("section");
  readonly contentDOM = document.createElement("code");
  private pre = document.createElement("pre");
  private header = document.createElement("div");
  private label = document.createElement("button");
  private runButton: HTMLButtonElement;
  private aboveButton: HTMLButtonElement;
  private result: RNotebookOutput;
  private target: RTarget;
  private running = false;
  private events = new AbortController();
  private dialog?: HTMLDialogElement;
  private languageMenu?: HTMLElement;
  private languageEvents?: AbortController;

  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined, private multipleLanguages = () => true) {
    this.dom.className = "pm-r-chunk";
    const language = languageLabel(executionLanguage(node));
    this.dom.dataset.executionLanguage = executionLanguage(node);
    this.header.className = "pm-r-chunk-header";
    this.header.contentEditable = "false";
    this.target = { dom: this.dom, kind: "chunk", node: () => this.node, position: getPos, show: state => this.showResult(state) };
    this.result = new RNotebookOutput(() => requestRAction(this.target, "clear"), false, language);
    registerRTarget(this.target);
    const toolbar = document.createElement("div"); toolbar.className = "pm-r-chunk-tools";
    toolbar.setAttribute("role", "toolbar"); toolbar.setAttribute("aria-label", `${language} chunk controls`);
    const options = rButton(`${language} chunk options`, Settings, () => this.editHeader());
    options.setAttribute("aria-haspopup", "dialog");
    this.aboveButton = rButton("Run all chunks above", ArrowDownToLine, () => requestRAction(this.target, "above"));
    this.aboveButton.className = "pm-r-run-above";
    this.runButton = rButton("Run current chunk", Play, () => requestRAction(this.target, this.running ? "stop" : "current"));
    this.runButton.className = "pm-r-run";
    toolbar.append(options, this.aboveButton, this.runButton);
    this.label.className = "pm-r-chunk-label";
    this.label.type = "button";
    this.label.setAttribute("aria-label", "Chunk language");
    this.label.setAttribute("aria-haspopup", "dialog");
    this.label.setAttribute("aria-expanded", "false");
    this.label.onclick = () => this.chooseLanguage();
    this.header.append(this.label, toolbar);
    this.pre.className = "pm-r-code";
    this.pre.append(this.contentDOM);
    this.dom.append(this.header, this.pre, this.result.dom);
    view.dom.addEventListener("keydown", event => {
      const position = getPos(), from = view.state.selection.from;
      if (position !== undefined && from >= position && from < position + this.node.nodeSize &&
          (event.ctrlKey || event.metaKey) && !event.altKey && !event.isComposing && event.key === "Enter") {
        event.preventDefault(); event.stopPropagation(); requestRAction(this.target, "current");
      }
    }, { capture: true, signal: this.events.signal });
    this.update(node);
  }

  private closeLanguageMenu() {
    this.languageEvents?.abort(); this.languageEvents = undefined;
    this.languageMenu?.remove(); this.languageMenu = undefined;
    this.label.setAttribute("aria-expanded", "false");
  }

  private chooseLanguage() {
    if (!this.view.editable || this.running) return;
    if (this.languageMenu) { this.closeLanguageMenu(); return; }
    const menu = this.languageMenu = document.createElement("div");
    menu.className = "pm-executable-language-menu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "Choose execution language");
    const choices = executableLanguageChoices(this.multipleLanguages(), executionLanguage(this.node), language => {
      const pos = this.getPos(), current = pos === undefined ? null : this.view.state.doc.nodeAt(pos);
      if (!this.view.editable || !current || current.type !== this.node.type || this.running) return;
      this.closeLanguageMenu();
      rememberExecutableLanguage(language);
      const next = withExecutionLanguage(current, language);
      const tr = this.view.state.tr;
      if (next !== current) tr.setNodeMarkup(pos!, undefined, next.attrs);
      tr.setSelection(TextSelection.create(tr.doc, pos! + 1));
      this.view.dispatch(closeHistory(tr));
      this.view.focus();
    });
    menu.append(choices); document.body.append(menu);
    this.label.setAttribute("aria-expanded", "true");
    const events = this.languageEvents = new AbortController();
    const position = () => {
      const rect = this.label.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8)) + "px";
      const below = rect.bottom + menu.offsetHeight + 4 <= innerHeight - 8;
      menu.style.top = Math.max(8, below ? rect.bottom + 4 : rect.top - menu.offsetHeight - 4) + "px";
    };
    position();
    window.addEventListener("resize", position, { signal: events.signal });
    window.addEventListener("scroll", position, { capture: true, signal: events.signal });
    document.addEventListener("pointerdown", event => {
      if (!menu.contains(event.target as Node) && !this.label.contains(event.target as Node)) this.closeLanguageMenu();
    }, { signal: events.signal });
    menu.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); this.closeLanguageMenu(); this.label.focus();
      }
      if (event.key === "Tab") this.closeLanguageMenu();
    });
    (choices.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ?? choices.querySelector("button"))?.focus();
  }

  private editHeader() {
    if (!this.view.editable) return;
    const original = this.node;
    const language = languageLabel(executionLanguage(original));
    this.dialog?.remove();
    const dialog = this.dialog = document.createElement("dialog");
    dialog.className = "pm-link-dialog pm-r-chunk-menu";
    const form = document.createElement("form"), label = document.createElement("label"), input = document.createElement("input");
    label.textContent = "Chunk header";
    input.value = String(original.attrs.header);
    input.setAttribute("aria-label", "Chunk header");
    input.spellcheck = false;
    label.append(input);
    const help = document.createElement("p");
    help.textContent = "Cell options are preserved. Run buttons explicitly evaluate code in this window’s language session; publication options (eval, echo, include) do not hide interactive results. Results remain temporary.";
    const output = document.createElement("output");
    output.setAttribute("aria-live", "polite");
    const save = document.createElement("button"), cancel = document.createElement("button");
    save.type = "submit"; save.textContent = "Apply";
    cancel.type = "button"; cancel.textContent = "Cancel";
    cancel.onclick = () => dialog.close();
    form.onsubmit = event => {
      event.preventDefault();
      const pos = this.getPos();
      if (!this.view.editable || pos === undefined || !this.view.state.doc.nodeAt(pos)?.eq(original)) {
        output.textContent = "Chunk changed. Reopen its options."; return;
      }
      const nextLanguage = isRChunkHeader(input.value) ? "r" : quartoHeader(input.value);
      if (!nextLanguage || !this.multipleLanguages() && nextLanguage !== "r") { output.textContent = "Enter a valid header for an available execution language."; return; }
      const next = withExecutionLanguage(original, nextLanguage);
      rememberExecutableLanguage(nextLanguage);
      this.view.dispatch(closeHistory(this.view.state.tr.replaceWith(pos, pos + original.nodeSize, next.type.create({ ...next.attrs, header: input.value.trim() }, next.content, next.marks))));
      dialog.close(); this.view.focus();
    };
    const restart = rButton(`Restart ${language} and clear output`, RotateCcw, () => { requestRAction(this.target, "restart"); dialog.close(); });
    restart.append(document.createTextNode(`Restart ${language} and clear output`));
    form.append(label, help, output, save, cancel, restart); dialog.append(form);
    document.body.append(dialog);
    dialog.onclose = () => dialog.remove();
    showEditorPanel(dialog, `${language} chunk options`, this.header);
    input.focus({ preventScroll: true });
  }

  update(node: PMNode) {
    if (node.type !== this.node.type || executionLanguage(node) !== executionLanguage(this.node)) return false;
    this.node = node;
    const label = /^\{r[ \t]+([\w.-]+)(?=\s*[,}])/.exec(String(node.attrs.header))?.[1];
    const language = languageLabel(executionLanguage(node));
    this.label.textContent = label ? `${language} · ${label}` : language;
    this.label.disabled = !this.view.editable || this.running;
    if (node.attrs.language) this.pre.dataset.quartoChunk = String(node.attrs.header);
    else this.pre.dataset.rChunk = String(node.attrs.header);
    this.pre.dataset.language = executionLanguage(node);
    return true;
  }
  private showResult(state: RResult | undefined) {
    this.result.show(state); this.running = state?.phase === "running";
    this.label.disabled = !this.view.editable || this.running;
    this.dom.classList.toggle("is-running", this.running);
    const label = this.running ? `Stop ${languageLabel(executionLanguage(this.node))} chunk` : "Run current chunk";
    this.runButton.title = label; this.runButton.setAttribute("aria-label", label);
    this.runButton.replaceChildren(rButton(label, this.running ? Square : Play, () => {}).firstChild!);
  }
  stopEvent(event: Event) { return this.header.contains(event.target as Node) || this.result.dom.contains(event.target as Node); }
  ignoreMutation(mutation: { type: string; target: Node }) { return mutation.type !== "selection" && !this.contentDOM.contains(mutation.target); }
  destroy() { this.closeLanguageMenu(); this.dialog?.remove(); this.events.abort(); }
}

/** ProseMirror owns expression text and caret; the language badge opens controls. */
export function rInlineView(node: PMNode, view: EditorView, getPos: () => number | undefined, multipleLanguages = () => true): NodeView {
  const language = languageLabel(executionLanguage(node));
  const dom = document.createElement("code"); dom.className = "pm-r-inline";
  const badge = document.createElement("span"); badge.className = "pm-r-inline-prefix";
  badge.contentEditable = "false";
  badge.textContent = { r: "r", python: "py", julia: "jl", ojs: "ojs" }[executionLanguage(node)];
  badge.tabIndex = 0;
  badge.setAttribute("role", "button"); badge.setAttribute("aria-label", `Inline ${language} controls`);
  badge.setAttribute("aria-haspopup", "dialog"); badge.setAttribute("aria-expanded", "false");
  badge.title = `${language} · Choose execution language · Run expression`;
  const contentDOM = document.createElement("span"); contentDOM.className = "pm-r-inline-code";
  const rendered = document.createElement("span"); rendered.className = "pm-r-inline-value";
  rendered.contentEditable = "false"; rendered.tabIndex = 0;
  rendered.setAttribute("role", "button"); rendered.setAttribute("aria-label", "Inline result controls");
  rendered.setAttribute("aria-haspopup", "dialog"); rendered.setAttribute("aria-expanded", "false");
  dom.append(badge, contentDOM, rendered); dom.dataset[/^`r[ \t]/.test(rExpressionSource(node)) ? "rSource" : "quartoSource"] = rExpressionSource(node);
  const events = new AbortController();
  let opened = false, pinned = false, result: RResult | undefined, mode: "code" | "result" = "code";
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  const popup = document.createElement("div"); popup.className = "pm-r-inline-popover";
  popup.setAttribute("role", "dialog"); popup.setAttribute("aria-label", `Inline ${language} result`);
  const target: RTarget = { dom, kind: "inline", node: () => node, position: getPos, show: state => {
    const previous = result;
    result = state; output.show(state); dom.classList.toggle("has-result", Boolean(state));
    choices.querySelectorAll("button").forEach(button => button.disabled = !view.editable || state?.phase === "running");
    const label = state?.phase === "running" ? `Stop inline ${language}` : `Run inline ${language}`;
    run.title = label; run.setAttribute("aria-label", label);
    run.replaceChildren(rButton(label, state?.phase === "running" ? Square : Play, () => {}).firstChild!);
    layout();
    if (!state) close();
    else if (opened) position();
    else if (mode === "code" && !dom.closest('[data-running-all="true"]') &&
      (!previous || state.phase !== previous.phase || state.text !== previous.text || state.message !== previous.message)) open();
  }, inlineView: () => mode, setInlineView: next => {
    // Never leave a native caret inside a hidden contentDOM.
    const pos = getPos(), selection = view.state.selection;
    if (next === "result" && pos !== undefined && selection.from > pos && selection.to < pos + node.nodeSize)
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + node.nodeSize)));
    mode = next; close(); layout();
    dom.dispatchEvent(new CustomEvent("notdown-inline-view", { bubbles: true }));
  } };
  const output = new RNotebookOutput(() => requestRAction(target, "clear"), true, language);
  const toolbar = document.createElement("div"); toolbar.className = "pm-r-inline-tools";
  const run = rButton(`Run inline ${language}`, Play, () => requestRAction(target, result?.phase === "running" ? "stop" : "inline"));
  const text = document.createElement("span"); text.textContent = `Inline ${language}`;
  const choices = executableLanguageChoices(multipleLanguages(), executionLanguage(node), nextLanguage => {
    const pos = getPos(), current = pos === undefined ? null : view.state.doc.nodeAt(pos);
    if (!view.editable || !current || current.type !== node.type || result?.phase === "running") return;
    close();
    rememberExecutableLanguage(nextLanguage);
    const next = withExecutionLanguage(current, nextLanguage);
    if (next !== current) view.dispatch(closeHistory(view.state.tr.replaceWith(pos!, pos! + current.nodeSize, next)));
    view.focus();
  });
  const toggle = document.createElement("button"); toggle.type = "button";
  toggle.className = "pm-r-inline-view-toggle"; toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-label", "Show inline result");
  toggle.onclick = () => target.setInlineView!(mode === "code" ? "result" : "code");
  toolbar.append(text, run); popup.append(toolbar, choices, toggle, output.dom);
  function layout() {
    dom.dataset.inlineView = mode;
    badge.hidden = mode === "result"; rendered.hidden = mode === "code";
    toggle.setAttribute("aria-checked", String(mode === "result"));
    toggle.textContent = mode === "result" ? "Show code" : "Show result";
    rendered.textContent = !result ? "Not run" : result.phase === "running" ? "Running…" : result.phase === "error" ? "Error" : result.phase === "stopped" ? "Stopped" :
      result.text ?? (result.html ? new DOMParser().parseFromString(result.html, "text/html").body.textContent : "") ?? "";
    if (result?.phase === "done" && !rendered.textContent) rendered.textContent = "No output";
    dom.classList.toggle("is-stale", Boolean(result?.stale));
    dom.dataset.resultState = result?.phase || "empty";
    rendered.title = result?.stale ? "Source changed · result is out of date" : result?.message || "Click to switch between code and result";
  }
  const position = () => {
    if (!opened) return;
    const rect = dom.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(rect.bottom + 7, innerHeight - popup.offsetHeight - 8))}px`;
  };
  function open(controls = true) {
    clearTimeout(hoverTimer); pinned ||= controls;
    toolbar.hidden = choices.hidden = toggle.hidden = !pinned;
    if (!opened) { document.body.append(popup); opened = true; }
    badge.setAttribute("aria-expanded", "true"); rendered.setAttribute("aria-expanded", "true"); position();
  }
  function close() { clearTimeout(hoverTimer); popup.remove(); opened = pinned = false; badge.setAttribute("aria-expanded", "false"); rendered.setAttribute("aria-expanded", "false"); }
  registerRTarget(target);
  layout();
  for (const control of [badge, rendered]) {
    control.addEventListener("mousedown", event => event.preventDefault());
    control.addEventListener("click", () => pinned ? close() : open());
    control.addEventListener("keydown", event => {
      if (!(event.ctrlKey || event.metaKey) && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.stopPropagation(); pinned ? close() : open(); }
    });
  }
  for (const area of [dom, popup]) {
    area.addEventListener("mouseenter", () => { clearTimeout(hoverTimer); if (result && result.phase !== "running") open(false); });
    area.addEventListener("mouseleave", () => { if (!pinned) hoverTimer = setTimeout(close, 160); });
  }
  const keydown = (event: KeyboardEvent) => {
    const pos = getPos(), selection = view.state.selection;
    const inside = pos !== undefined && selection.from > pos && selection.to < pos + node.nodeSize;
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && !event.isComposing && event.key === "Enter" &&
        (inside || event.target === badge || event.target === rendered || opened && popup.contains(event.target as Node))) {
      event.preventDefault(); event.stopPropagation(); requestRAction(target, "inline");
    }
    if (inside && selection.empty && !(event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) && !event.isComposing) {
      const left = event.key === "ArrowLeft" && selection.from === pos! + 1;
      const right = event.key === "ArrowRight" && selection.from === pos! + node.nodeSize - 1;
      if (left || right || event.key === "Enter") {
        event.preventDefault(); event.stopPropagation();
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, left ? pos! : pos! + node.nodeSize)));
      }
    }
    if (event.key === "Escape") close();
  };
  // Capture on the editor covers its native text selection inside contentDOM.
  view.dom.addEventListener("keydown", keydown, { capture: true, signal: events.signal });
  // Native replacement of all text can move Chrome's caret past an inline
  // contentDOM. Commit the replacement as one editor transaction instead.
  view.dom.addEventListener("beforeinput", event => {
    if (event.defaultPrevented || !view.editable || event.isComposing || !["insertText", "insertReplacementText"].includes(event.inputType) || event.data === null) return;
    const pos = getPos(), current = view.state.selection;
    // At a node boundary Chrome may place the DOM caret in the adjacent span.
    // An explicit editor exit (closing backtick / arrow) must stay outside R.
    if (pos !== undefined && current.empty && (current.from === pos || current.from === pos + node.nodeSize)) {
      event.preventDefault();
      view.dispatch(view.state.tr.insertText(event.data));
      return;
    }
    const selection = document.getSelection();
    if (!selection?.anchorNode || !selection.focusNode || !contentDOM.contains(selection.anchorNode) || !contentDOM.contains(selection.focusNode)) return;
    const anchor = view.posAtDOM(selection.anchorNode, selection.anchorOffset), head = view.posAtDOM(selection.focusNode, selection.focusOffset);
    const from = Math.min(anchor, head), to = Math.max(anchor, head);
    if (pos === undefined || from <= pos || to >= pos + node.nodeSize) return;
    event.preventDefault();
    const tr = view.state.tr.insertText(event.data, from, to);
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + event.data.length)));
  }, { capture: true, signal: events.signal });
  popup.addEventListener("keydown", keydown, { signal: events.signal });
  window.addEventListener("resize", position, { signal: events.signal });
  window.addEventListener("scroll", position, { capture: true, signal: events.signal });
  document.addEventListener("pointerdown", event => {
    if (!badge.contains(event.target as Node) && !rendered.contains(event.target as Node) && !popup.contains(event.target as Node)) close();
  }, { signal: events.signal });
  return { dom, contentDOM,
    update(next) { if (next.type !== node.type || executionLanguage(next) !== executionLanguage(node)) return false; node = next; delete dom.dataset.rSource; delete dom.dataset.quartoSource; dom.dataset[/^`r[ \t]/.test(rExpressionSource(node)) ? "rSource" : "quartoSource"] = rExpressionSource(node); return true; },
    stopEvent: event => badge.contains(event.target as Node) || rendered.contains(event.target as Node),
    ignoreMutation: mutation => mutation.type !== "selection" && !contentDOM.contains(mutation.target),
    destroy() { close(); events.abort(); },
  };
}
