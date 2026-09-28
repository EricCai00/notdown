import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import { createElement, AtSign, Check, ChevronDown, CircleCheck, FileText, Info, Link2, ListOrdered, Quote, User, Calendar, X, ThumbsUp, ThumbsDown, SlidersHorizontal } from "lucide";
import { api, type Page } from "../shared/types";
import { pageIconElement } from "../shared/page-icons";
import { editorSchema as schema } from "../document/editor-schema";
import { escapeXml } from "../document/notion-syntax";
import { allPeople, refreshPeople } from "../features/people/people-client";
import { personId, personMention, searchPeople } from "../features/people/person";
import { pageInputChoices } from "../editor/page-reference-input";
import type { BreadcrumbPage } from "./breadcrumb-view";
import { aiPageText, aiPrompt, aiReferences } from "./ai-context";
import "./ai-block.css";

const modes = ["Custom output", "Page summary", "Key points"];
const modeValues = ["custom", "summary", "key-points"];
const modeIcons = [Link2, Quote, ListOrdered];
const icon = (value: typeof AtSign) => createElement(value, { width: 18, height: 18, "stroke-width": 1.6, "aria-hidden": "true" });
function button(label: string, run: () => void, symbol?: typeof AtSign) {
  const el = document.createElement("button"); el.type = "button"; el.setAttribute("aria-label", label);
  if (symbol) el.append(icon(symbol));
  const text = document.createElement("span"); text.textContent = label; el.append(text);
  el.onclick = run; return el;
}

export class AiBlockView implements NodeView {
  dom = document.createElement("section");
  contentDOM = document.createElement("div");
  private controls = document.createElement("div");
  private status = document.createElement("output");
  private prompt = document.createElement("div");
  private preset = document.createElement("div");
  private promptBox = document.createElement("div");
  private context = document.createElement("div");
  private specified = document.createElement("div");
  private panel = document.createElement("div");
  private toolbar = document.createElement("div");
  private generation!: HTMLButtonElement;
  private using!: HTMLButtonElement;
  private search!: HTMLButtonElement;
  private run!: HTMLButtonElement;
  private good!: HTMLButtonElement;
  private bad!: HTMLButtonElement;
  private feedback?: "good" | "bad";
  private popup?: HTMLElement;
  private popupOwner?: HTMLElement;
  private editing: boolean;
  private disposed = false;
  private busy = false;
  private request = 0;
  private local = false;
  private outside = (event: PointerEvent) => { if (!this.popup?.contains(event.target as Node) && !this.popupOwner?.contains(event.target as Node)) this.closePopup(); };

  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined, private pages: () => BreadcrumbPage[], private currentPage?: () => BreadcrumbPage | undefined, private parse?: (source: string) => PMNode) {
    this.editing = !node.attrs.generate && !node.attrs.prompt && !node.textContent.trim();
    this.dom.className = "pm-content-object pm-object-ai_block";
    this.controls.contentEditable = this.status.contentEditable = "false";
    this.controls.className = "ai-controls"; this.panel.className = "ai-settings"; this.toolbar.className = "ai-toolbar";
    this.contentDOM.className = "pm-object-content"; this.status.setAttribute("aria-live", "polite");
    const header = document.createElement("div"); header.className = "ai-header";
    const title = document.createElement("strong"); title.textContent = "AI block";
    const done = button("Done", () => {
      this.closePopup(); this.set({ generate: this.mode(), using: this.node.attrs.using || "current-page" });
      this.editing = false; this.refresh();
    }); done.className = "ai-done";
    header.append(title, done);
    this.generation = this.select("Generate", () => this.menu(this.generation, modes.map((label, i) => ({ label, symbol: modeIcons[i], selected: this.mode() === modeValues[i], run: () => this.set({ generate: modeValues[i] }) }))));
    const promptBox = this.promptBox; promptBox.className = "ai-prompt-box";
    this.preset.className = "ai-preset-description";
    this.prompt.className = "ai-prompt"; this.prompt.contentEditable = String(view.editable);
    this.prompt.setAttribute("role", "textbox"); this.prompt.setAttribute("aria-label", "AI prompt"); this.prompt.setAttribute("aria-multiline", "true");
    this.prompt.dataset.placeholder = "Describe the content that should be generated. Use ‘@’ to mention people, pages, or dates";
    this.prompt.oninput = () => { this.set({ prompt: this.readPrompt() }); this.completeMention(); };
    this.prompt.addEventListener("compositionend", () => { this.set({ prompt: this.readPrompt() }); this.completeMention(); });
    this.prompt.onpaste = event => { event.preventDefault(); document.execCommand("insertText", false, event.clipboardData?.getData("text/plain") || ""); };
    const mention = button("Mention people, pages, or dates", () => { this.prompt.focus(); this.mentions(mention, false); }, AtSign); mention.className = "ai-mention-button";
    promptBox.append(this.prompt, mention);
    this.using = this.select("Using", () => this.menu(this.using, [
      { label: "Current page only", symbol: FileText, selected: this.node.attrs.using !== "specified", run: () => this.set({ using: "current-page" }) },
      { label: "Specified context", symbol: CircleCheck, selected: this.node.attrs.using === "specified", run: () => this.set({ using: "specified" }) },
    ]));
    this.context.className = "ai-context";
    this.search = this.select("Search", () => this.menu(this.search, [
      { label: "Selected context only", selected: this.node.attrs.search !== "vault", run: () => this.set({ search: "selected" }) },
      { label: "Local vault", selected: this.node.attrs.search === "vault", run: () => this.set({ search: "vault" }) },
    ]));
    this.search.title = "Local vault adds up to five pages whose titles match words in your prompt. No web or Notion workspace search.";
    this.specified.append(this.context, this.field("Search", this.search, this.search.title));
    this.panel.append(header, this.field("Generate", this.generation), promptBox, this.preset, this.field("Using", this.using, "Choose which local content is sent to your configured AI service."), this.specified);
    this.run = button("Generate", () => { void this.generate(); });
    this.run.className = "ai-generate";
    const actions = document.createElement("div"); actions.className = "ai-result-actions"; actions.setAttribute("role", "group"); actions.setAttribute("aria-label", "AI result actions");
    const feedback = (value: "good" | "bad") => { this.feedback = this.feedback === value ? undefined : value; this.refresh(); };
    this.good = button("Good response", () => feedback("good"), ThumbsUp);
    this.bad = button("Bad response", () => feedback("bad"), ThumbsDown);
    this.good.title = "Good response — local to this session"; this.bad.title = "Bad response — local to this session";
    const settings = button("Settings", () => { this.editing = true; this.refresh(); }, SlidersHorizontal); settings.title = "Settings";
    actions.append(this.good, this.bad, settings); this.toolbar.append(actions, this.run);
    this.controls.append(this.panel, this.toolbar); this.dom.append(this.controls, this.contentDOM, this.status);
    document.addEventListener("pointerdown", this.outside); this.refresh();
  }
  private field(label: string, input: HTMLElement, help?: string) {
    const row = document.createElement("div"), text = document.createElement("div"); row.className = "ai-field"; text.className = "ai-label"; text.textContent = label;
    if (help) { const info = document.createElement("span"); info.title = help; info.append(icon(Info)); text.append(info); }
    row.append(text, input); return row;
  }
  private select(label: string, run: () => void) {
    const el = button(label, run); el.className = "ai-select"; el.setAttribute("aria-label", label); el.setAttribute("aria-haspopup", "menu"); el.setAttribute("aria-expanded", "false"); return el;
  }
  private mode() { return this.node.attrs.generate || "custom"; }
  private isPreset() { return ["summary", "key-points"].includes(this.mode()); }
  private set(attrs: Record<string, string>) {
    const pos = this.getPos(); if (pos === undefined || this.disposed || !this.view.editable) return;
    this.local = true;
    try { this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...attrs })); }
    finally { this.local = false; }
  }
  private label(select: HTMLButtonElement, text: string, symbol?: typeof AtSign) {
    select.replaceChildren(); if (symbol) select.append(icon(symbol));
    const label = document.createElement("span"); label.textContent = text; select.append(label, icon(ChevronDown));
  }
  private refresh() {
    this.panel.hidden = !this.editing; this.toolbar.hidden = this.editing; this.contentDOM.hidden = this.editing;
    this.dom.classList.toggle("ai-configuring", this.editing);
    this.dom.setAttribute("aria-busy", String(this.busy));
    const preset = this.isPreset();
    this.promptBox.hidden = preset; this.preset.hidden = !preset;
    this.preset.textContent = this.mode() === "summary" ? "Create a summary about this page" : "Create key points about this page";
    const index = modeValues.indexOf(this.mode()); this.label(this.generation, modes[index] || this.mode(), modeIcons[index] || Link2);
    this.label(this.using, !preset && this.node.attrs.using === "specified" ? "Specified context" : `Current page only — ${this.currentPage?.()?.title || "Current page"}`, !preset && this.node.attrs.using === "specified" ? CircleCheck : FileText);
    if (preset || this.node.attrs.using !== "specified") {
      const page = this.currentPage?.(), title = document.createElement("span"); title.className = "ai-current-page";
      title.append(pageIconElement(page?.icon), document.createTextNode(page?.title || "Current page"));
      this.using.querySelector("span")!.replaceChildren(document.createTextNode("Current page only — "), title);
    }
    this.specified.hidden = preset || this.node.attrs.using !== "specified";
    this.label(this.search, this.node.attrs.search === "vault" ? "Local vault" : "Selected context only");
    if (this.readPrompt() !== this.node.attrs.prompt) this.paintPrompt();
    this.paintContext();
    this.controls.querySelectorAll("button").forEach(el => { el.disabled = !this.view.editable; });
    this.using.disabled = !this.view.editable || preset;
    this.good.disabled = this.bad.disabled = !this.view.editable || this.busy || !this.node.textContent.trim();
    this.good.setAttribute("aria-pressed", String(this.feedback === "good")); this.bad.setAttribute("aria-pressed", String(this.feedback === "bad"));
    this.run.disabled = !this.view.editable || this.busy;
    this.run.querySelector("span")!.textContent = this.busy ? "Generating…" : "Generate";
    this.prompt.contentEditable = String(this.view.editable);
  }
  private chip(source: string, label: string, kind: string) {
    const chip = document.createElement("span"); chip.className = "ai-chip"; chip.contentEditable = "false"; chip.dataset.mention = source;
    chip.append(icon(kind === "user" ? User : kind === "date" ? Calendar : FileText), document.createTextNode(label)); return chip;
  }
  private referenceLabel(ref: ReturnType<typeof aiReferences>[number]) {
    return ref.label || this.pages().find(p => ref.target === `#page/${encodeURIComponent(p.id)}`)?.title || ref.target || "Mention";
  }
  private paintPrompt() {
    this.prompt.replaceChildren(); let start = 0; const source = String(this.node.attrs.prompt);
    for (const ref of aiReferences(source)) {
      this.prompt.append(document.createTextNode(source.slice(start, ref.start)), this.chip(ref.source, this.referenceLabel(ref), ref.kind)); start = ref.end;
    }
    this.prompt.append(document.createTextNode(source.slice(start)));
  }
  private readPrompt(): string {
    const read = (node: Node): string => node instanceof HTMLElement && node.dataset.mention !== undefined ? node.dataset.mention
      : node.nodeType === Node.TEXT_NODE ? node.textContent || ""
      : node.nodeName === "BR" ? "\n"
      : Array.from(node.childNodes).map(read).join("") + (node.nodeName === "DIV" && node !== this.prompt ? "\n" : "");
    return read(this.prompt);
  }
  private paintContext() {
    this.context.replaceChildren(); const source = String(this.node.attrs.context); let start = 0;
    for (const ref of aiReferences(source)) {
      if (source.slice(start, ref.start).trim()) this.context.append(document.createTextNode(source.slice(start, ref.start)));
      const chip = this.chip(ref.source, this.referenceLabel(ref), ref.kind);
      const remove = button(`Remove ${this.referenceLabel(ref)}`, () => this.set({ context: source.slice(0, ref.start) + source.slice(ref.end) }), X); remove.className = "ai-chip-remove";
      chip.append(remove); this.context.append(chip); start = ref.end;
    }
    if (source.slice(start).trim()) this.context.append(document.createTextNode(source.slice(start)));
    const add = button("Add context", () => this.mentions(add, true), AtSign); add.className = "ai-mention-button"; this.context.append(add);
  }
  private closePopup() { this.popup?.remove(); this.popup = undefined; this.popupOwner?.setAttribute("aria-expanded", "false"); this.popupOwner = undefined; }
  private menu(owner: HTMLElement, choices: { label: string; symbol?: typeof AtSign; selected?: boolean; run: () => void }[]) {
    const panel = this.openPopup(owner); panel.setAttribute("role", "menu");
    for (const choice of choices) {
      const option = button(choice.label, () => { this.closePopup(); choice.run(); owner.focus(); }, choice.symbol);
      option.setAttribute("role", "menuitemradio"); option.setAttribute("aria-checked", String(!!choice.selected));
      if (choice.selected) option.append(icon(Check)); panel.append(option);
    }
    (panel.querySelector('[aria-checked="true"]') as HTMLElement || panel.querySelector("button"))?.focus();
  }
  private openPopup(owner: HTMLElement) {
    this.closePopup(); const panel = this.popup = document.createElement("div"); this.popupOwner = owner;
    panel.className = "ai-popup"; owner.setAttribute("aria-expanded", "true"); this.controls.append(panel);
    const rect = owner.getBoundingClientRect(), host = this.dom.getBoundingClientRect();
    panel.style.left = `${Math.max(0, Math.min(rect.left - host.left, host.width - 340))}px`;
    panel.style.top = `${rect.bottom - host.top + 4}px`;
    panel.style.width = `${Math.min(Math.max(rect.width, 320), host.width - 16)}px`;
    panel.onkeydown = event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.closePopup(); owner.focus(); }
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault(); const options = [...panel.querySelectorAll("button")]; const current = options.indexOf(document.activeElement as HTMLButtonElement);
        options[(current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
      }
    };
    return panel;
  }
  private completeMention() {
    const selection = window.getSelection();
    if (!selection?.isCollapsed || !selection.anchorNode || !this.prompt.contains(selection.anchorNode) || selection.anchorNode.nodeType !== Node.TEXT_NODE) return;
    const prefix = selection.anchorNode.textContent!.slice(0, selection.anchorOffset), match = /(?:^|\s)@([^@\n]*)$/.exec(prefix);
    if (!match) { this.closePopup(); return; }
    const range = document.createRange(); range.setStart(selection.anchorNode, selection.anchorOffset - match[1].length - 1); range.setEnd(selection.anchorNode, selection.anchorOffset);
    this.mentions(this.prompt, false, range, match[1]);
  }
  private mentions(owner: HTMLElement, context: boolean, replacement?: Range, query = "") {
    const selection = window.getSelection();
    const saved = replacement || (selection?.rangeCount && this.prompt.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : undefined);
    const panel = this.openPopup(owner); panel.classList.add("ai-mentions"); panel.setAttribute("aria-label", "Mention suggestions");
    const search = document.createElement("input"); search.placeholder = "Search people, pages, or dates"; search.setAttribute("aria-label", "Search mentions"); search.value = query;
    const list = document.createElement("div"); panel.append(search, list);
    const choose = (source: string, label: string, kind: string) => {
      this.closePopup(); if (!this.view.editable) return;
      if (context) { this.set({ context: `${this.node.attrs.context}${this.node.attrs.context ? " " : ""}${source}` }); return; }
      this.prompt.focus(); const range = saved && this.prompt.contains(saved.startContainer) ? saved : document.createRange();
      if (range !== saved) { range.selectNodeContents(this.prompt); range.collapse(false); }
      range.deleteContents(); const chip = this.chip(source, label, kind), space = document.createTextNode(" "); range.insertNode(space); range.insertNode(chip);
      range.setStartAfter(space); range.collapse(true); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(range);
      this.set({ prompt: this.readPrompt() });
    };
    const paint = () => {
      if (this.popup !== panel) return; list.replaceChildren();
      const section = (label: string) => { const heading = document.createElement("div"); heading.className = "ai-menu-heading"; heading.textContent = label; list.append(heading); };
      const add = (label: string, source: string, kind: string) => {
        const option = button(label, () => choose(source, label, kind), kind === "user" ? User : kind === "date" ? Calendar : FileText);
        option.onpointerdown = event => event.preventDefault(); list.append(option);
      };
      const q = search.value.trim().toLowerCase();
      section("Dates");
      for (const [label, offset] of [["Today", 0], ["Tomorrow", 1]] as const) {
        if (q && !label.toLowerCase().includes(q)) continue;
        const date = new Date(); date.setDate(date.getDate() + offset); const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        add(label, `<mention-date start="${value}"/>`, "date");
      }
      section("People"); for (const person of searchPeople(allPeople(), q).slice(0, 12)) add(person.name, personMention(person), "user");
      section("Link to page"); for (const page of pageInputChoices(this.pages(), q).slice(0, 20)) add(page.title, `<mention-page url="#page/${encodeURIComponent(page.id)}">${escapeXml(page.title)}</mention-page>`, "page");
      if (!list.querySelector("button")) { const empty = document.createElement("p"); empty.textContent = "No matches"; list.append(empty); }
    };
    search.oninput = paint; paint();
    void refreshPeople().then(paint).catch(() => { if (this.popup === panel) this.status.textContent = "Could not load local contacts. Try again."; });
    if (!replacement) search.focus();
    this.prompt.onkeydown = event => {
      if (this.popup === panel && event.key === "ArrowDown") { event.preventDefault(); list.querySelector("button")?.focus(); }
      if (this.popup === panel && event.key === "Escape") { event.preventDefault(); this.closePopup(); }
    };
  }
  private async generate() {
    if (this.busy || !this.view.editable) return;
    const original = this.node, doc = this.view.state.doc, serial = ++this.request;
    const prompt = aiPrompt(this.mode(), original.attrs.prompt);
    if (!prompt) { this.editing = true; this.status.textContent = "Describe the content to generate, or choose Page summary or Key points."; this.refresh(); this.prompt.focus(); return; }
    this.busy = true; this.status.textContent = "Generating…"; this.refresh();
    try {
      const parts: string[] = [], current = this.currentPage?.(), preset = this.isPreset(), selected = !preset && original.attrs.using === "specified";
      if (!selected) parts.push(`${current?.title || "Current page"}\n${aiPageText(doc)}`);
      // Legacy blocks treated their body as input; preserve that behavior until configured.
      if (!original.attrs.generate && !original.attrs.using) parts.push(original.textContent);
      // Inactive custom settings remain in Markdown but must not leak into a preset request.
      const refs = aiReferences(preset ? "" : `${original.attrs.prompt}\n${selected ? original.attrs.context : ""}`);
      if (refs.some(ref => ref.kind === "user")) await refreshPeople();
      const ids = new Set<string>();
      for (const ref of refs) {
        if (ref.kind === "page" && ref.target.startsWith("#page/")) ids.add(decodeURIComponent(ref.target.slice(6)));
        if (ref.kind === "user") {
          const person = allPeople().find(p => p.id === personId(ref.target) && !p.deleted);
          if (!person) throw new Error(`Contact unavailable: ${ref.label || ref.target}`);
          parts.push(`Person: ${person.name}\n${person.organization}\n${person.notes}`);
        }
        if (ref.kind === "date") parts.push(`Date: ${ref.target}`);
      }
      if (selected && original.attrs.search === "vault") {
        const words = prompt.toLocaleLowerCase().split(/\s+/).filter(word => word.length > 2);
        pageInputChoices(this.pages(), "").filter(page => words.some(word => page.title.toLocaleLowerCase().includes(word))).slice(0, 5).forEach(page => ids.add(page.id));
      }
      for (const id of ids) {
        if (id === current?.id) { if (selected) parts.push(`${current.title}\n${aiPageText(doc)}`); continue; }
        if (!pageInputChoices(this.pages(), "").some(p => p.id === id)) throw new Error("A referenced page is unavailable. Update the specified context.");
        const page = await api<Page>(`/pages/${encodeURIComponent(id)}`); parts.push(`${page.title}\n${page.body}`);
      }
      if (selected && !parts.some(part => part.trim())) throw new Error("Add people, pages, or dates to the specified context.");
      if (this.disposed || serial !== this.request) return;
      if (!this.view.state.doc.eq(doc)) throw new Error("Content changed while loading context. Generate again to use the latest content.");
      const response = await api<{ text: string }>("/services/generate", { method: "POST", body: JSON.stringify({ prompt, model: original.attrs.model, context: parts.filter(Boolean).join("\n\n") }) });
      if (this.disposed || serial !== this.request) return;
      const pos = this.getPos(); if (pos === undefined) return;
      if (!this.view.state.doc.eq(doc)) { this.status.textContent = "Content changed. Generated text: " + response.text; return; }
      const content = this.parse ? this.parse(response.text).content : response.text.split(/\r?\n/).map(line => schema.nodes["block.paragraph"].create(null, line ? schema.text(line) : undefined));
      this.view.dispatch(closeHistory(this.view.state.tr).replaceWith(pos + 1, pos + this.node.nodeSize - 1, content));
      this.status.textContent = "";
    } catch (error) { if (!this.disposed && serial === this.request) this.status.textContent = (error as Error).message; }
    finally { if (!this.disposed && serial === this.request) { this.busy = false; this.refresh(); } }
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    if (!this.local && !node.eq(this.node)) this.closePopup();
    if (!node.content.eq(this.node.content)) this.feedback = undefined;
    this.node = node; this.refresh(); return true;
  }
  stopEvent(event: Event) { return this.controls.contains(event.target as Node) || this.status.contains(event.target as Node); }
  ignoreMutation(m: MutationRecord | { type: "selection"; target: Node }) { return this.controls.contains(m.target) || this.status.contains(m.target) || m.type === "attributes" && m.target === this.contentDOM || m.type !== "selection" && !this.contentDOM.contains(m.target); }
  destroy() { this.disposed = true; this.request++; this.closePopup(); document.removeEventListener("pointerdown", this.outside); }
}
