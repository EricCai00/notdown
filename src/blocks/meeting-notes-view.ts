import { DOMSerializer, type Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import { createElement, Pencil, SlidersHorizontal, UserRoundPlus, ChevronDown, ChevronRight, Copy, Link2, Upload, Globe, ShieldCheck, Trash2, Check, Sparkles, BriefcaseBusiness, Headphones, Users, Plus, Ellipsis, Pin, CircleMinus, Volume2, Calendar, type IconNode } from "lucide";
import { editorSchema as schema } from "../document/editor-schema";
import { createEditorNode, editorKind } from "../document/node-identity";
import { notionInline } from "../document/notion-markdown";
import { inlineMarkdown, blockMarkdown } from "../document/editor-markdown";
import { referenceLocations } from "../document/reference-locations";
import { routeHash } from "../features/pages/page-navigation";
import { api } from "../shared/types";
import { dateKey } from "../features/dates/date-mention";
import { DateMentionView } from "../features/dates/date-view";
import { allPeople, refreshPeople } from "../features/people/people-client";
import { personMention, searchPeople } from "../features/people/person";
import "./meeting-notes.css";

const languages = [["en", "English (US)", "English (US)"], ["zh", "简体中文", "Simplified Chinese"], ["zh-TW", "繁體中文", "Traditional Chinese"], ["es", "Español (España)", "Spanish (Spain)"], ["fr", "Français (France)", "French (France)"], ["de", "Deutsch", "German"], ["ja", "日本語", "Japanese"], ["ko", "한국어", "Korean"], ["pt", "Português (Brasil)", "Portuguese (Brazil)"], ["ru", "Русский", "Russian"], ["th", "ภาษาไทย", "Thai"], ["vi", "Tiếng Việt", "Vietnamese"]];
const presets = [
  { id: "auto", name: "Auto", prompt: "Summarize the meeting, including key decisions and action items.", symbol: Sparkles },
  { id: "interview", name: "Candidate Interview", prompt: "Summarize the candidate's experience, strengths, concerns, and next steps. Use only evidence from the notes and transcript.", symbol: BriefcaseBusiness },
  { id: "customer", name: "Customer Call", prompt: "Summarize customer needs, feedback, open questions, and follow-up actions.", symbol: Headphones },
  { id: "standup", name: "Stand-Up", prompt: "Summarize progress, plans, blockers, and action owners.", symbol: Users },
];
type Config = Record<string, unknown> & { language?: string; audio?: string; selected?: string; default?: string; hidden?: string[]; custom?: { id: string; name: string; prompt: string }[]; prompts?: Record<string, string> };
const icon = (symbol: IconNode) => createElement(symbol, { width: 20, height: 20, "stroke-width": 1.6, "aria-hidden": "true" });
export class MeetingSectionView implements NodeView {
  dom = document.createElement("section");
  contentDOM = document.createElement("div");
  constructor(private node: PMNode) { this.dom.className = "pm-meeting-section"; this.dom.dataset.section = node.attrs.section; this.dom.append(this.contentDOM); }
  update(node: PMNode) { if (node.type !== this.node.type) return false; this.node = node; this.dom.dataset.section = node.attrs.section; return true; }
  ignoreMutation(m: MutationRecord | { type: "selection"; target: Node }) { return m.type === "attributes" && m.target === this.dom; }
}
function button(label: string, run: () => void, symbol?: IconNode, compact = false) {
  const el = document.createElement("button"); el.type = "button"; el.setAttribute("aria-label", label); el.title = label;
  if (symbol) el.append(icon(symbol));
  if (!compact) { const text = document.createElement("span"); text.textContent = label; el.append(text); }
  el.onclick = run; return el;
}

/** One PM contentDOM owns every section; tabs only hide their existing DOM. */
export class MeetingNotesView implements NodeView {
  dom = document.createElement("section");
  contentDOM = document.createElement("div");
  private header = document.createElement("header");
  private dates = new Map<number, DateMentionView>();
  private toolbar = document.createElement("div");
  private footer = document.createElement("footer");
  private status = document.createElement("output");
  private active = "notes";
  private session: Config = {};
  private popup?: HTMLElement;
  private owner?: HTMLElement;
  private busy = false;
  private disposed = false;
  private local = false;
  private serial = 0;
  private readonly id = "meeting-" + crypto.randomUUID();
  private outside = (e: Event) => { if (!this.popup?.contains(e.target as Node) && !this.owner?.contains(e.target as Node)) this.close(); };
  private reposition = () => this.close();

  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined, private supplemental: () => boolean, private currentPage?: () => { id: string } | undefined) {
    this.dom.className = "pm-content-object pm-object-meeting_notes";
    this.header.contentEditable = this.toolbar.contentEditable = this.footer.contentEditable = this.status.contentEditable = "false";
    this.toolbar.className = "meeting-toolbar"; this.contentDOM.className = "pm-object-content meeting-content";
    this.status.setAttribute("aria-live", "polite");
    this.dom.append(this.header, this.toolbar, this.contentDOM, this.footer, this.status);
    this.dom.addEventListener("notdown-reveal-reference", event => {
      const section = (event.target as HTMLElement).closest<HTMLElement>(".pm-meeting-section");
      if (section && this.contentDOM.contains(section)) { this.active = section.dataset.section || "notes"; this.refresh(); section.hidden = false; }
    });
    document.addEventListener("pointerdown", this.outside); window.addEventListener("resize", this.reposition);
    this.refresh();
  }
  private config(): Config {
    if (!this.supplemental()) return this.session;
    try { const value = JSON.parse(this.node.attrs.nfmAttrs["meeting-config"] || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; }
  }
  private set(attrs: Record<string, unknown>, newHistory = true) {
    const pos = this.getPos(); if (this.disposed || !this.view.editable || pos === undefined || this.view.state.doc.nodeAt(pos) !== this.node) return;
    this.local = true;
    try { const tr = this.view.state.tr; this.view.dispatch((newHistory ? closeHistory(tr) : tr).setNodeMarkup(pos, undefined, { ...this.node.attrs, ...attrs })); } finally { this.local = false; }
  }
  private configure(change: Partial<Config>) {
    if (!this.view.editable) return;
    if (this.supplemental()) {
      // Do not destroy a future or malformed configuration when editing a known field.
      const raw = this.node.attrs.nfmAttrs["meeting-config"];
      if (raw) { try { const value = JSON.parse(raw); if (!value || typeof value !== "object" || Array.isArray(value)) throw Error(); } catch { this.status.textContent = "Existing meeting settings could not be read. Preserve or repair them in source mode first."; return; } }
      this.set({ nfmAttrs: { ...this.node.attrs.nfmAttrs, "meeting-config": JSON.stringify({ ...this.config(), ...change }) } });
    } else { this.session = { ...this.session, ...change }; this.refresh(); }
  }
  private choices() {
    const cfg = this.config();
    const custom = Array.isArray(cfg.custom) ? cfg.custom.filter(p => p && typeof p.id === "string" && typeof p.name === "string" && typeof p.prompt === "string") : [];
    return [...presets, ...custom.map(p => ({ ...p, symbol: Pencil }))].map(p => ({ ...p, prompt: typeof cfg.prompts?.[p.id] === "string" ? cfg.prompts[p.id] : p.prompt }));
  }
  private chosen() { const cfg = this.config(); return this.choices().find(p => p.id === (cfg.selected || cfg.default || "auto")) || presets[0]; }
  private language() { const value = this.config().language; return typeof value === "string" && value ? value : this.node.attrs.language || "en"; }
  private audio() { const value = this.config().audio; return typeof value === "string" && value ? value : this.node.attrs.audio || ""; }
  private titleNodes() { return this.node.attrs.syntaxForm === "notion" ? notionInline(this.node.attrs.title || "Meeting") : [schema.text(this.node.attrs.title || "Meeting")]; }
  private titleChange(index: number, replacement?: PMNode, newHistory = true) {
    const nodes = this.titleNodes(); if (index < nodes.length) nodes.splice(index, 1, ...(replacement ? [replacement] : [])); else if (replacement) nodes.push(schema.text(" "), replacement);
    this.set({ title: inlineMarkdown(schema.nodes["block.paragraph"].create(null, nodes), true) }, newHistory);
  }
  private refresh() {
    const heading = document.createElement("h3");
    const usedDates = new Set<number>();
    this.titleNodes().forEach((node, index) => {
      if (editorKind(node) === "mention" && node.attrs.kind === "date") {
        usedDates.add(index);
        let date = this.dates.get(index);
        if (date && !date.update(node)) { date.destroy(); this.dates.delete(index); date = undefined; }
        if (!date) {
          const current = (original: PMNode) => { const pos = this.getPos(); return !this.disposed && this.view.editable && pos !== undefined && this.view.state.doc.nodeAt(pos) === this.node && this.titleNodes()[index]?.eq(original); };
          date = new DateMentionView(node, this.view, () => undefined, {
            supplemental: () => this.supplemental(),
            write: (original, attrs, firstWrite) => {
              if (!current(original)) return false;
              this.titleChange(index, original.type.create({ ...original.attrs, nfmAttrs: attrs }, original.content, original.marks), firstWrite);
              return true;
            },
            clear: original => { if (current(original)) { this.titleChange(index); this.view.focus(); } },
            finish: () => { this.view.dispatch(closeHistory(this.view.state.tr)); this.view.focus(); },
          });
          this.dates.set(index, date);
        }
        heading.append(date.dom);
      } else heading.append(DOMSerializer.fromSchema(schema).serializeNode(node));
    });
    for (const [index, date] of this.dates) if (!usedDates.has(index)) { date.destroy(); this.dates.delete(index); }
    heading.ondblclick = event => { if (!(event.target as HTMLElement).closest(".pm-date-mention")) this.form(heading, "Meeting title", [{ name: "Title (Markdown)", value: this.node.attrs.title }], values => this.set({ title: values[0] || "Meeting" })); };
    const people = button("Add participants", () => { void this.people(people); }, UserRoundPlus, true); people.className = "meeting-people"; people.disabled = !this.view.editable || this.node.attrs.syntaxForm !== "notion";
    this.header.replaceChildren(heading, people);
    const tabs = document.createElement("div"); tabs.className = "meeting-tabs"; tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Meeting sections");
    const sections = new Set(["notes"]); this.node.forEach(child => { if (editorKind(child) === "meeting_section") sections.add(child.attrs.section); });
    if (!sections.has(this.active)) this.active = "notes";
    for (const section of ["summary", "notes", "transcript"].filter(key => sections.has(key))) {
      const label = section[0].toUpperCase() + section.slice(1);
      const tab = button(label, () => { if (this.active === section) this.tabMenu(tab); else { this.active = section; this.refresh(); this.toolbar.querySelector<HTMLElement>(`[aria-selected="true"]`)?.focus(); } }, section === "notes" ? Pencil : section === "summary" ? Sparkles : Headphones);
      tab.setAttribute("role", "tab"); tab.setAttribute("aria-selected", String(this.active === section)); tab.id = `${this.id}-${section}`; tab.setAttribute("aria-controls", `${this.id}-panel-${section}`);
      tab.tabIndex = this.active === section ? 0 : -1;
      tab.oncontextmenu = e => { e.preventDefault(); this.active = section; this.tabMenu(tab); };
      tab.onkeydown = e => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); const list = [...tabs.querySelectorAll<HTMLButtonElement>("button")], i = list.indexOf(tab); const next = list[e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + list.length) % list.length]; if (next !== tab) next.click(); else tab.focus(); } };
      tabs.append(tab);
    }
    const actions = document.createElement("div"); actions.className = "meeting-actions";
    const settings = button("Meeting settings", () => this.settings(settings), SlidersHorizontal, true); settings.setAttribute("aria-haspopup", "menu");
    const start = button(this.busy ? "Transcribing…" : "Start transcribing", () => this.transcriptionDialog(start)); start.className = "meeting-start"; start.disabled = !this.view.editable || this.busy;
    actions.append(settings, start); this.toolbar.replaceChildren(tabs, actions);
    const instructions = document.createElement("div"); instructions.className = "meeting-instructions"; instructions.append("Instructions:");
    const choose = button(this.chosen().name, () => this.instructions(choose)); choose.append(icon(ChevronDown)); choose.setAttribute("aria-label", "Summary instructions"); choose.setAttribute("aria-haspopup", "menu"); instructions.append(choose);
    const consent = document.createElement("span"); consent.className = "meeting-consent"; consent.textContent = "By starting, you confirm everyone being transcribed has given consent.";
    const sound = button("Read consent notice", () => { if ("speechSynthesis" in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(consent.textContent!)); } else this.status.textContent = consent.textContent; }, Volume2, true);
    const copy = button("Copy meeting contents", () => { void this.copy(this.node.textContent); }, Copy, true);
    this.footer.replaceChildren(instructions, consent, sound, copy);
    if (!this.view.editable) choose.disabled = true;
    this.dom.dataset.activeSection = this.active;
    this.contentDOM.dataset.placeholder = "AI can summarize your notes and transcript";
    queueMicrotask(() => {
      if (this.disposed) return;
      [...this.contentDOM.children].forEach((el, i) => {
        const child = this.node.maybeChild(i); if (!child) return;
        if (editorKind(child) !== "meeting_section") return;
        const section = editorKind(child) === "meeting_section" ? child.attrs.section : "notes";
        const panel = el as HTMLElement; panel.hidden = section !== this.active;
        panel.id = `${this.id}-panel-${section}`; panel.setAttribute("role", "tabpanel"); panel.setAttribute("aria-labelledby", `${this.id}-${section}`);
      });
      const visible = [...this.contentDOM.children].filter(el => !(el as HTMLElement).hidden);
      this.contentDOM.classList.toggle("meeting-empty", visible.length === 0 || visible.every(el => !el.textContent?.trim() && !el.querySelector("img,pre,table,iframe")));
    });
  }
  private close() { this.popup?.remove(); this.popup = undefined; this.owner?.setAttribute("aria-expanded", "false"); this.owner = undefined; }
  private panel(owner: HTMLElement, label: string, role = "menu", nested = false) {
    if (!nested || !this.popup) { this.close(); this.owner = owner; owner.setAttribute("aria-expanded", "true"); }
    const parent = nested ? owner.closest<HTMLElement>(".meeting-menu") || this.popup : undefined;
    if (parent) parent.querySelector(":scope > .meeting-submenu")?.remove();
    const panel = document.createElement("div"); panel.className = "meeting-menu" + (nested ? " meeting-submenu" : ""); panel.setAttribute("role", role); panel.setAttribute("aria-label", label); panel.contentEditable = "false";
    if (parent) parent.append(panel); else { this.popup = panel; document.body.append(panel); }
    panel.onkeydown = e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.close(); owner.focus(); }
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault(); e.stopPropagation(); const items = [...panel.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]; const i = items.indexOf(document.activeElement as HTMLButtonElement);
        items[e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    queueMicrotask(() => {
      if (!panel.isConnected) return;
      const rect = owner.getBoundingClientRect();
      const left = nested ? (rect.right + panel.offsetWidth + 14 <= innerWidth ? rect.right + 6 : (parent?.getBoundingClientRect().left || rect.left) - panel.offsetWidth - 6) : rect.left;
      panel.style.left = `${Math.max(8, Math.min(left, innerWidth - panel.offsetWidth - 8))}px`;
      panel.style.top = `${Math.max(8, Math.min(nested ? rect.top : rect.bottom + 6, innerHeight - panel.offsetHeight - 8))}px`;
      panel.querySelector<HTMLElement>("input,textarea,button")?.focus();
    });
    return panel;
  }
  private item(panel: HTMLElement, label: string, run: () => void, symbol?: IconNode, selected = false, disabled = false) {
    const el = button(label, run, symbol); el.setAttribute("role", selected ? "menuitemradio" : "menuitem"); if (selected) { el.setAttribute("aria-checked", "true"); el.append(icon(Check)); } el.disabled = disabled; panel.append(el); return el;
  }
  private tabMenu(anchor: HTMLElement) {
    const menu = this.panel(anchor, "Section actions");
    this.item(menu, "Copy contents", () => { const parts: string[] = []; this.node.forEach(child => { if (editorKind(child) === "meeting_section" ? child.attrs.section === this.active : this.active === "notes") parts.push(blockMarkdown(child)); }); void this.copy(parts.join("\n\n")); this.close(); }, Copy);
    this.item(menu, "Copy link to tab", () => { void this.copyLink(this.active); this.close(); }, Link2);
  }
  private settings(anchor: HTMLElement) {
    const menu = this.panel(anchor, "Meeting settings");
    this.item(menu, "Upload audio or video", () => { this.close(); this.upload(); }, Upload, false, !this.view.editable || this.busy);
    menu.append(document.createElement("hr"));
    const lang = this.item(menu, "Language  " + (languages.find(l => l[0] === this.language())?.[1] || this.language()), () => this.languageMenu(lang), Globe, false, !this.view.editable); lang.append(icon(ChevronRight));
    const instr = this.item(menu, "Instructions  " + this.chosen().name, () => this.instructions(instr, true), Pencil, false, !this.view.editable); instr.append(icon(ChevronRight));
    const consent = this.item(menu, "Consent", () => { const panel = this.panel(consent, "Consent", "dialog", true); this.hint(panel, "Before uploading or transcribing, get consent from everyone recorded. Audio is sent to the transcription service configured in Settings."); }, ShieldCheck); consent.append(icon(ChevronRight));
    menu.append(document.createElement("hr"));
    this.item(menu, "Copy link to block", () => { void this.copyLink(); this.close(); }, Link2);
    this.item(menu, "Rename meeting", () => this.form(anchor, "Meeting title", [{ name: "Title (Markdown)", value: this.node.attrs.title }], values => this.set({ title: values[0] || "Meeting" })), Pencil, false, !this.view.editable);
    if (this.node.attrs.syntaxForm === "notion" && !this.titleNodes().some(n => editorKind(n) === "mention" && n.attrs.kind === "date")) this.item(menu, "Add date", () => {
      this.close();
      this.titleChange(this.titleNodes().length, createEditorNode(schema, "mention", { kind: "date", nfmAttrs: { start: dateKey(new Date()) } }));
      [...this.dates.values()].at(-1)?.dom.dispatchEvent(new Event("notdown-edit-date"));
    }, Calendar, false, !this.view.editable);
    this.item(menu, "Delete", () => { const pos = this.getPos(); this.close(); if (this.view.editable && pos !== undefined) this.view.dispatch(closeHistory(this.view.state.tr).delete(pos, pos + this.node.nodeSize)); }, Trash2, false, !this.view.editable || this.busy);
    menu.append(document.createElement("hr"));
    this.item(menu, "Generate summary", () => { this.close(); void this.generateSummary(); }, Sparkles, false, !this.view.editable || this.busy || !this.node.textContent.trim());
    this.hint(menu, this.supplemental() ? "Upload-based transcription · configured AI service" : "Language and instructions apply to this session. Notion Markdown keeps only official syntax.");
  }
  private languageMenu(anchor: HTMLElement) {
    const menu = this.panel(anchor, "Transcription language", "menu", true); menu.classList.add("meeting-languages");
    for (const [value, label, detail] of languages) { const el = this.item(menu, label, () => { this.configure({ language: value }); this.close(); }, undefined, this.language() === value); const sub = document.createElement("small"); sub.textContent = detail; el.querySelector("span")?.append(sub); }
  }
  private instructions(anchor: HTMLElement, nested = false) {
    const menu = this.panel(anchor, "Summary instructions", "menu", nested); menu.classList.add("meeting-presets"); this.hint(menu, "Summary instructions");
    const cfg = this.config(), hidden = Array.isArray(cfg.hidden) ? cfg.hidden : [];
    for (const preset of this.choices().filter(p => !hidden.includes(p.id) || p.id === this.chosen().id)) {
      const row = document.createElement("div"); row.className = "meeting-preset-row";
      const select = this.item(row, preset.name, () => { this.configure({ selected: preset.id }); this.close(); }, preset.symbol, this.chosen().id === preset.id, !this.view.editable);
      if (preset.id === (cfg.default || "auto")) { const badge = document.createElement("small"); badge.textContent = "Default"; select.querySelector("span")?.append(badge); }
      const more = button("More options for " + preset.name, () => { const sub = this.panel(more, "Instruction options", "menu", true); this.item(sub, "Set as default", () => { this.configure({ default: preset.id }); this.close(); }, Pin); this.item(sub, "Remove from menu", () => { this.configure({ hidden: [...hidden, preset.id], ...(this.chosen().id === preset.id ? { selected: "auto" } : {}), ...(cfg.default === preset.id ? { default: "auto" } : {}) }); this.close(); }, CircleMinus, false, preset.id === "auto"); }, Ellipsis, true);
      const edit = button("Edit " + preset.name + " instructions", () => this.form(anchor, "Edit instructions", [{ name: "Instructions", value: preset.prompt, multiline: true }], values => this.configure({ prompts: { ...cfg.prompts, [preset.id]: values[0] } })), Pencil, true);
      more.disabled = edit.disabled = !this.view.editable; row.append(more, edit); menu.append(row);
    }
    this.item(menu, "Add custom instructions", () => this.form(anchor, "Custom instructions", [{ name: "Name", value: "" }, { name: "Instructions", value: "", multiline: true }], values => { const id = crypto.randomUUID(); this.configure({ custom: [...(Array.isArray(cfg.custom) ? cfg.custom : []), { id, name: values[0], prompt: values[1] }], selected: id }); }), Plus, false, !this.view.editable);
  }
  private hint(panel: HTMLElement, text: string) { const el = document.createElement("p"); el.className = "meeting-hint"; el.textContent = text; panel.append(el); }
  private form(anchor: HTMLElement, label: string, fields: { name: string; value: string; multiline?: boolean }[], save: (values: string[]) => void) {
    if (!this.view.editable) return;
    const original = this.node, panel = this.panel(anchor, label, "dialog"); this.hint(panel, label);
    const form = document.createElement("form"); const inputs = fields.map(field => { const row = document.createElement("label"); row.textContent = field.name; const input = document.createElement(field.multiline ? "textarea" : "input"); input.value = field.value; input.required = true; input.setAttribute("aria-label", field.name); row.append(input); form.append(row); return input; });
    const submit = button("Save", () => {}); submit.type = "submit"; form.append(submit, button("Cancel", () => this.close()));
    form.onsubmit = e => { e.preventDefault(); if (!this.node.eq(original)) { this.hint(panel, "Content changed. Reopen this dialog to edit the latest version."); return; } save(inputs.map(i => i.value.trim())); this.close(); };
    panel.append(form);
  }
  private async people(anchor: HTMLElement) {
    const panel = this.panel(anchor, "Meeting participants", "dialog"); const original = this.node;
    this.hint(panel, "Mention a local contact. This does not send invitations.");
    const query = document.createElement("input"); query.placeholder = "Search contacts"; query.setAttribute("aria-label", "Search contacts"); const list = document.createElement("div"); panel.append(query, list);
    const paint = () => { list.replaceChildren(); for (const person of searchPeople(allPeople(), query.value)) this.item(list, person.name, () => { if (!this.node.eq(original)) { this.close(); return; } const mention = personMention(person); if (!this.node.attrs.title.includes(`person://${person.id}`)) this.set({ title: this.node.attrs.title + " " + mention }); this.close(); }, Users); if (!list.childElementCount) this.hint(list, "No matching contacts. Add contacts in People first."); };
    query.oninput = paint; paint(); try { await refreshPeople(); if (panel.isConnected) paint(); } catch (error) { if (panel.isConnected) this.hint(panel, (error as Error).message); }
  }
  private transcriptionDialog(anchor: HTMLElement) {
    const panel = this.panel(anchor, "Start transcribing", "dialog");
    this.hint(panel, "Transcribe an uploaded audio or video file using your configured service. Live microphone recording is not available.");
    const row = document.createElement("label"), consent = document.createElement("input"); consent.type = "checkbox"; row.className = "meeting-consent-check"; row.append(consent, "Everyone being transcribed has given consent"); panel.append(row);
    const start = button(this.audio() ? "Transcribe uploaded file" : "Choose audio or video", () => { this.close(); if (this.audio()) void this.transcribe(); else this.upload(true); }); start.disabled = true; consent.onchange = () => start.disabled = !consent.checked; panel.append(start);
    if (this.audio()) this.hint(panel, this.audio());
  }
  private upload(transcribe = false) {
    if (!this.view.editable || this.busy) return;
    const input = document.createElement("input"); input.type = "file"; input.accept = "audio/*,video/*";
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return; const original = this.node; const serial = ++this.serial; this.busy = true; this.refresh(); this.status.textContent = "Uploading…";
      try {
        const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.readAsDataURL(file); });
        const result = await api<{ path: string }>("/assets", { method: "POST", body: JSON.stringify({ name: file.name, contentType: file.type, data }) });
        if (this.disposed || serial !== this.serial) return;
        if (!this.node.eq(original)) { this.status.textContent = "Meeting changed. Uploaded file: " + result.path; return; }
        this.configure({ audio: result.path }); this.status.textContent = "Uploaded " + file.name;
        this.busy = false; if (transcribe) await this.transcribe();
      } catch (error) { if (!this.disposed) this.status.textContent = (error as Error).message; }
      finally { if (!this.disposed) { this.busy = false; this.refresh(); } }
    }; input.click();
  }
  private replaceSection(section: string, text: string) {
    const pos = this.getPos(); if (pos === undefined || !this.view.editable) return;
    const content = text.split(/\r?\n/).map(line => schema.nodes["block.paragraph"].create(null, line ? schema.text(line) : undefined));
    if (this.node.attrs.syntaxForm !== "notion") {
      // The legacy container accepts Markdown children, not official section tags.
      this.view.dispatch(closeHistory(this.view.state.tr).insert(pos + this.node.nodeSize - 1, content)); return;
    }
    const children: PMNode[] = []; let found = false;
    this.node.forEach(child => {
      if (editorKind(child) === "meeting_section") { if (child.attrs.section === section) { children.push(child.copy(schema.nodes["structure.meeting_section"].create(child.attrs, content).content)); found = true; } else children.push(child); }
      else children.push(child);
    });
    if (!found) children.push(schema.nodes["structure.meeting_section"].create({ section }, content));
    this.active = section;
    this.view.dispatch(closeHistory(this.view.state.tr).replaceWith(pos, pos + this.node.nodeSize, this.node.type.create(this.node.attrs, children, this.node.marks)));
  }
  private async transcribe() {
    await this.service("transcribe", { path: this.audio(), language: this.language().split("-")[0] }, "transcript");
  }
  private async generateSummary() {
    const parts: string[] = []; this.node.forEach(child => { if (editorKind(child) !== "meeting_section" || child.attrs.section !== "summary") parts.push(child.textContent); });
    await this.service("generate", { prompt: this.chosen().prompt, context: parts.join("\n\n") }, "summary");
  }
  private async service(action: string, payload: object, section: string) {
    if (this.busy || !this.view.editable) return;
    const original = this.node, serial = ++this.serial; this.busy = true; this.refresh(); this.status.textContent = action === "transcribe" ? "Transcribing…" : "Generating summary…";
    try {
      const result = await api<{ text: string }>("/services/" + action, { method: "POST", body: JSON.stringify(payload) });
      if (this.disposed || serial !== this.serial) return;
      if (!this.node.eq(original)) { this.status.textContent = "Meeting changed. Recoverable result:\n" + result.text; return; }
      this.replaceSection(section, result.text); this.status.textContent = "Done";
    } catch (error) { if (!this.disposed) this.status.textContent = (error as Error).message; }
    finally { if (!this.disposed) { this.busy = false; this.refresh(); } }
  }
  private async copy(text: string) { try { await navigator.clipboard.writeText(text); if (!this.disposed) this.status.textContent = "Copied"; } catch { if (!this.disposed) this.status.textContent = "Could not copy. Select the text and copy it manually."; } }
  private async copyLink(section?: string) {
    const page = this.currentPage?.(); if (!page) return;
    const pos = this.getPos(); if (pos === undefined) return;
    let target = pos;
    if (section) this.node.forEach((child, offset) => { if (editorKind(child) === "meeting_section" && child.attrs.section === section) target = pos + 1 + offset; });
    let reference = referenceLocations(this.view.state.doc).find(ref => ref.pos === target || section && ref.pos === target + 1);
    if (!reference && this.supplemental() && this.view.editable) {
      const id = "meeting-" + crypto.randomUUID();
      const marker = createEditorNode(schema, "syntax_inline", { kind: "block-anchor", target: id, raw: "^" + id });
      let tr = closeHistory(this.view.state.tr);
      const child = this.view.state.doc.nodeAt(target);
      if (section && child && editorKind(child) === "meeting_section") {
        // A standalone Obsidian anchor after the first paragraph gives the tab a durable target.
        const first = child.firstChild!;
        target += 1;
        tr = tr.insert(target + first.nodeSize, schema.nodes["block.paragraph"].create(null, marker));
      } else tr = tr.insert(pos + this.node.nodeSize, schema.nodes["block.paragraph"].create(null, marker));
      this.view.dispatch(tr);
      reference = { pos: target, fragment: "^" + id, kind: "block", label: id };
    }
    await this.copy(`${location.origin}${location.pathname}${routeHash({ kind: "page", id: page.id, fragment: reference?.fragment })}`);
    if (!reference && !this.disposed) this.status.textContent = "Page link copied. Add a block anchor to link to this meeting directly.";
  }
  update(node: PMNode) { if (node.type !== this.node.type) return false; if (!this.local && !node.eq(this.node)) this.close(); this.node = node; this.refresh(); return true; }
  stopEvent(event: Event) { return !this.contentDOM.contains(event.target as Node); }
  ignoreMutation(m: MutationRecord | { type: "selection"; target: Node }) { if (m.type === "selection") return false; return !this.contentDOM.contains(m.target) || m.type === "attributes" && (m.target === this.contentDOM || m.target.parentNode === this.contentDOM) && ["class", "hidden", "id", "role", "aria-labelledby", "data-placeholder"].includes(m.attributeName || ""); }
  destroy() { this.disposed = true; this.serial++; this.close(); for (const date of this.dates.values()) date.destroy(); this.dates.clear(); document.removeEventListener("pointerdown", this.outside); window.removeEventListener("resize", this.reposition); }
}
