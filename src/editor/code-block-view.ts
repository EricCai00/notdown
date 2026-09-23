import { DOMSerializer, type Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import { createElement, Check, ChevronDown, Copy, CornerDownLeft, Ellipsis, type IconNode } from "lucide";
import { codeCaption } from "../document/code-caption";
import "./code-block.css";

const languages = [
  ["plain text", "Plain Text"], ["abap", "ABAP"], ["arduino", "Arduino"],
  ["bash", "Bash"], ["basic", "Basic"], ["c", "C"], ["c#", "C#"],
  ["c++", "C++"], ["clojure", "Clojure"], ["coffeescript", "CoffeeScript"],
  ["css", "CSS"], ["dart", "Dart"], ["diff", "Diff"], ["docker", "Docker"],
  ["elixir", "Elixir"], ["elm", "Elm"], ["erlang", "Erlang"], ["f#", "F#"],
  ["flow", "Flow"], ["fortran", "Fortran"], ["gherkin", "Gherkin"],
  ["glsl", "GLSL"], ["go", "Go"], ["graphql", "GraphQL"],
  ["groovy", "Groovy"], ["haskell", "Haskell"], ["html", "HTML"],
  ["java", "Java"], ["javascript", "JavaScript"], ["json", "JSON"],
  ["julia", "Julia"], ["kotlin", "Kotlin"], ["latex", "LaTeX"],
  ["less", "Less"], ["lisp", "Lisp"], ["livescript", "LiveScript"],
  ["lua", "Lua"], ["makefile", "Makefile"], ["markdown", "Markdown"],
  ["markup", "Markup"], ["matlab", "MATLAB"], ["mermaid", "Mermaid"],
  ["nix", "Nix"], ["objective-c", "Objective-C"], ["ocaml", "OCaml"],
  ["pascal", "Pascal"], ["perl", "Perl"], ["php", "PHP"],
  ["powershell", "PowerShell"], ["prolog", "Prolog"],
  ["protobuf", "Protobuf"], ["python", "Python"], ["r", "R"],
  ["racket", "Racket"], ["reason", "Reason"], ["rocq", "Rocq"],
  ["ruby", "Ruby"], ["rust", "Rust"], ["sass", "Sass"],
  ["scala", "Scala"], ["scheme", "Scheme"], ["scss", "SCSS"],
  ["shell", "Shell"], ["sql", "SQL"], ["swift", "Swift"],
  ["typescript", "TypeScript"], ["vb.net", "VB.NET"],
  ["verilog", "Verilog"], ["vhdl", "VHDL"],
  ["visual basic", "Visual Basic"], ["webassembly", "WebAssembly"],
  ["xml", "XML"], ["yaml", "YAML"],
] as const;

const icon = (glyph: IconNode) => createElement(glyph, {
  width: 16, height: 16, "stroke-width": 1.8, "aria-hidden": "true",
});

function button(label: string, glyph: IconNode): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.title = label;
  element.setAttribute("aria-label", label);
  element.append(icon(glyph));
  return element;
}

function languageLabel(params: string): string {
  if (!params.trim()) return "Plain Text";
  return languages.find(([id, label]) => id.toLowerCase() === params.toLowerCase() || label.toLowerCase() === params.toLowerCase())?.[1] || params;
}

/** Toolbar and caption are outside contentDOM, so code stays one ProseMirror text node. */
export class CodeBlockView implements NodeView {
  readonly dom = document.createElement("div");
  readonly contentDOM: HTMLElement;
  private pre: HTMLElement;
  private toolbar = document.createElement("div");
  private languageButton = document.createElement("button");
  private languageText = document.createElement("span");
  private copyButton = button("Copy code", Copy);
  private wrapButton = button("Wrap code", CornerDownLeft);
  private moreButton = button("Code block options", Ellipsis);
  private captionInput = document.createElement("input");
  private captionVisible = false;
  private wrapped = false;
  private panel?: HTMLElement;
  private panelEvents?: AbortController;
  private menuKind?: "language" | "more";
  private copyTimer?: number;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    private canCaption: () => boolean,
  ) {
    const spec = DOMSerializer.renderSpec(document, node.type.spec.toDOM!(node));
    this.pre = spec.dom as HTMLElement;
    this.contentDOM = spec.contentDOM as HTMLElement;
    this.pre.classList.add("pm-code-pre");
    this.dom.className = "pm-code-block";
    this.toolbar.className = "pm-code-toolbar";
    this.toolbar.contentEditable = "false";
    this.toolbar.setAttribute("role", "toolbar");
    this.toolbar.setAttribute("aria-label", "Code block");
    this.languageButton.type = "button";
    this.languageButton.className = "pm-code-language";
    this.languageButton.setAttribute("aria-label", "Code language");
    this.languageButton.setAttribute("aria-haspopup", "dialog");
    this.languageButton.append(this.languageText, icon(ChevronDown));
    this.languageButton.addEventListener("click", () => this.toggleMenu("language"));
    this.copyButton.addEventListener("click", () => void this.copy());
    this.wrapButton.addEventListener("click", () => {
      this.wrapped = !this.wrapped;
      this.render();
    });
    this.moreButton.setAttribute("aria-haspopup", "menu");
    this.moreButton.addEventListener("click", () => this.toggleMenu("more"));
    this.toolbar.append(this.languageButton, this.copyButton, this.wrapButton, this.moreButton);
    this.captionInput.type = "text";
    this.captionInput.className = "pm-code-caption";
    this.captionInput.contentEditable = "false";
    this.captionInput.placeholder = "Add a caption";
    this.captionInput.setAttribute("aria-label", "Code caption");
    this.captionInput.addEventListener("input", () => this.setCaption(this.captionInput.value));
    this.captionInput.addEventListener("blur", () => {
      if (!this.captionInput.value) { this.captionVisible = false; this.render(); }
    });
    this.captionInput.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); this.view.focus(); }
      if (event.key === "Escape") { event.preventDefault(); this.captionInput.blur(); this.view.focus(); }
    });
    this.dom.append(this.toolbar, this.pre, this.captionInput);
    this.captionVisible = Boolean(codeCaption(node));
    this.render();
  }

  private render() {
    const spec = DOMSerializer.renderSpec(document, this.node.type.spec.toDOM!(this.node));
    for (const attr of Array.from(this.pre.attributes)) this.pre.removeAttribute(attr.name);
    for (const attr of Array.from((spec.dom as HTMLElement).attributes)) this.pre.setAttribute(attr.name, attr.value);
    this.pre.classList.add("pm-code-pre");
    this.languageText.textContent = languageLabel(String(this.node.attrs.params || ""));
    this.dom.classList.toggle("pm-code-wrapped", this.wrapped);
    this.wrapButton.setAttribute("aria-pressed", String(this.wrapped));
    this.wrapButton.title = this.wrapped ? "Don't wrap code" : "Wrap code";
    this.captionVisible ||= Boolean(codeCaption(this.node));
    this.captionInput.hidden = !this.captionVisible;
    if (document.activeElement !== this.captionInput) this.captionInput.value = codeCaption(this.node);
  }

  private updateAttrs(attrs: Record<string, unknown>, separate = true) {
    const pos = this.getPos();
    const current = pos === undefined ? null : this.view.state.doc.nodeAt(pos);
    if (!this.view.editable || current?.type !== this.node.type) return;
    const tr = this.view.state.tr.setNodeMarkup(pos!, undefined, { ...current.attrs, ...attrs });
    this.view.dispatch(separate ? closeHistory(tr) : tr);
  }

  private setCaption(value: string) {
    const attrs = { ...this.node.attrs.markdownAttrs };
    if (value) attrs.caption = value;
    else delete attrs.caption;
    this.updateAttrs({ markdownAttrs: attrs }, false);
  }

  private async copy() {
    try {
      await navigator.clipboard.writeText(this.node.textContent);
      this.copyButton.title = "Copied";
      this.copyButton.setAttribute("aria-label", "Copied");
    } catch {
      this.copyButton.title = "Copy failed";
      this.copyButton.setAttribute("aria-label", "Copy failed");
    }
    clearTimeout(this.copyTimer);
    this.copyTimer = window.setTimeout(() => {
      this.copyButton.title = "Copy code";
      this.copyButton.setAttribute("aria-label", "Copy code");
    }, 1800);
  }

  private closeMenu() {
    this.panelEvents?.abort();
    this.panel?.remove();
    this.panel = undefined;
    this.panelEvents = undefined;
    this.menuKind = undefined;
    this.languageButton.setAttribute("aria-expanded", "false");
    this.moreButton.setAttribute("aria-expanded", "false");
  }

  private toggleMenu(kind: "language" | "more") {
    if (this.menuKind === kind) { this.closeMenu(); return; }
    this.closeMenu();
    const panel = document.createElement("div");
    panel.className = kind === "language" ? "pm-code-language-menu" : "pm-code-more-menu";
    panel.setAttribute("role", kind === "language" ? "dialog" : "menu");
    panel.setAttribute("aria-label", kind === "language" ? "Choose code language" : "Code block options");
    this.panel = panel;
    this.menuKind = kind;
    const anchor = kind === "language" ? this.languageButton : this.moreButton;
    anchor.setAttribute("aria-expanded", "true");
    if (kind === "language") this.buildLanguageMenu(panel);
    else this.buildMoreMenu(panel);
    document.body.append(panel);
    const events = this.panelEvents = new AbortController();
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      panel.style.left = `${Math.max(8, Math.min(rect.right - panel.offsetWidth, innerWidth - panel.offsetWidth - 8))}px`;
      const below = rect.bottom + panel.offsetHeight + 6 <= innerHeight - 8;
      panel.style.top = `${Math.max(8, Math.min(below ? rect.bottom + 6 : rect.top - panel.offsetHeight - 6, innerHeight - panel.offsetHeight - 8))}px`;
    };
    position();
    window.addEventListener("resize", position, { signal: events.signal });
    window.addEventListener("scroll", position, { capture: true, signal: events.signal });
    document.addEventListener("pointerdown", event => {
      if (!panel.contains(event.target as Node) && !anchor.contains(event.target as Node)) this.closeMenu();
    }, { signal: events.signal });
    panel.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); this.closeMenu(); anchor.focus(); }
    });
    if (kind === "language") panel.querySelector("input")?.focus();
  }

  private buildLanguageMenu(panel: HTMLElement) {
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search for a language...";
    search.setAttribute("aria-label", "Search for a language");
    const list = document.createElement("div");
    list.className = "pm-code-language-list";
    const current = String(this.node.attrs.params || "").trim().toLowerCase();
    const choices: [string, string][] = languages.map(([id, label]) => [id, label]);
    if (current && !choices.some(([id]) => id === current))
      choices.unshift([String(this.node.attrs.params).trim(), String(this.node.attrs.params).trim()]);
    const renderList = () => {
      const query = search.value.trim().toLowerCase();
      list.replaceChildren();
      for (const [id, label] of choices.filter(([id, label]) =>
        !query || id.toLowerCase().includes(query) || label.toLowerCase().includes(query))) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "pm-code-language-option";
        option.textContent = label;
        option.setAttribute("aria-label", label);
        if (id.toLowerCase() === current || !current && id === "plain text") {
          option.classList.add("is-current");
          option.append(icon(Check));
        }
        option.addEventListener("click", () => {
          this.closeMenu();
          this.updateAttrs({ params: id === "plain text" ? "" : id });
          this.view.focus();
        });
        list.append(option);
      }
      if (!list.childElementCount) {
        const empty = document.createElement("p");
        empty.textContent = "No languages found";
        list.append(empty);
      }
    };
    search.addEventListener("input", renderList);
    search.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        const first = list.querySelector<HTMLButtonElement>("button");
        if (first) { event.preventDefault(); first.click(); }
      } else if (event.key === "ArrowDown") {
        event.preventDefault(); list.querySelector<HTMLButtonElement>("button")?.focus();
      }
    });
    list.addEventListener("keydown", event => {
      const target = event.target as HTMLElement;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const items = [...list.querySelectorAll<HTMLButtonElement>("button")];
        const index = items.indexOf(target as HTMLButtonElement);
        items[Math.max(0, Math.min(items.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
      }
    });
    panel.append(search, list);
    renderList();
  }

  private buildMoreMenu(panel: HTMLElement) {
    const caption = document.createElement("button");
    caption.type = "button";
    caption.setAttribute("role", "menuitem");
    caption.textContent = codeCaption(this.node) ? "Remove caption" : "Add caption";
    const available = this.canCaption();
    caption.disabled = !available || !this.view.editable;
    if (!available) caption.title = "Captions require Notdown or a Markdown dialect with code attributes enabled";
    caption.addEventListener("click", () => {
      if (codeCaption(this.node)) {
        this.captionVisible = false;
        this.setCaption("");
        this.render();
      } else {
        this.captionVisible = true;
        this.render();
        this.captionInput.focus();
      }
      this.closeMenu();
    });
    panel.append(caption);
    if (!available) {
      const note = document.createElement("p");
      note.textContent = "Choose Notdown to add a caption.";
      panel.append(note);
    }
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  stopEvent(event: Event) {
    const target = event.target as Node;
    return this.toolbar.contains(target) || this.captionInput.contains(target);
  }

  ignoreMutation(mutation: { type: string; target: Node }) {
    return !this.contentDOM.contains(mutation.target);
  }

  destroy() {
    this.closeMenu();
    clearTimeout(this.copyTimer);
  }
}
