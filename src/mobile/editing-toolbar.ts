import type { MarkdownWorkspace } from "../markdown-engine/workspace";
import { commandEnabled } from "../markdown-engine/config";
import type { SelectionBlockAction } from "../editor/selection-block-actions";
import { refreshIcons } from "../shared/icons";
import { inlineColorNames, type InlineColorKind } from "../editor/inline-colors";
import { colorStyle } from "../document/notion-syntax";

type TouchSelection = NonNullable<ReturnType<MarkdownWorkspace["blocks"]["touchSelection"]>>;
const icon = (name: string) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const button = (action: string, label: string, glyph: string, attrs = "") =>
  `<button type="button" data-tool="${action}" aria-label="${label}" title="${label}" ${attrs}>${glyph}</button>`;
const formats = [
  ["bold", "Bold", "bold"], ["italic", "Italic", "italic"], ["underline", "Underline", "underline"],
  ["strike", "Strikethrough", "strikethrough"], ["inline", "Inline code", "code"],
  ["color", "Text color", "palette"], ["background", "Background color", "paint-bucket"],
] as const;
const blockTypes = [
  ["text", "Text", "type", "\n"], ["heading1", "Heading 1", "heading-1", "# "],
  ["heading2", "Heading 2", "heading-2", "## "], ["heading3", "Heading 3", "heading-3", "### "],
  ["heading4", "Heading 4", "heading-4", "#### "], ["list", "Bulleted list", "list", "- "],
  ["number", "Numbered list", "list-ordered", "1. "], ["task", "To-do list", "square-check", "- [ ] "],
  ["quote", "Quote", "quote", "> "], ["code", "Code block", "code", "```\n\n```"],
  ["divider", "Divider", "minus", "\n---\n"],
] as const;

/** Mobile tool levels stay in the keyboard accessory row; block choices use a docked panel. */
export class MobileEditingToolbar {
  private frame = 0;
  private level: "main" | "format" = "main";
  private panelKind: "insert" | "convert" | InlineColorKind | null = null;
  private readonly main: HTMLElement;
  private readonly formatting: HTMLElement;
  private readonly back: HTMLButtonElement;
  private readonly keyboard: HTMLButtonElement;

  constructor(private root: HTMLElement, private panel: HTMLElement, private options: {
    workspace: () => MarkdownWorkspace | undefined;
    hideKeyboard: () => void;
    image: () => void;
    more: () => void;
    database?: (mode: "full" | "inline") => void;
    error: (error: unknown) => void;
  }) {
    root.dataset.level = "main";
    root.innerHTML = `${button("back", "Back to editing tools", icon("chevrons-left"), "hidden")}
      <div class="mobile-tool-scroll" data-tools-level="main" role="group" aria-label="Block editing tools">
        ${button("outdent", "Decrease indent", icon("indent-decrease"))}
        ${button("indent", "Increase indent", icon("indent-increase"))}
        ${button("up", "Move up", icon("arrow-up-to-line"))}
        ${button("down", "Move down", icon("arrow-down-to-line"))}
        ${button("insert", "Insert block", icon("plus"), 'aria-expanded="false" aria-controls="mobile-tool-panel"')}
        ${button("format", "Text formatting", '<span aria-hidden="true">Aa</span>')}
        ${button("convert", "Turn into", icon("replace"), 'aria-expanded="false" aria-controls="mobile-tool-panel"')}
        ${button("undo", "Undo", icon("undo-2"))}${button("redo", "Redo", icon("redo-2"))}
        ${button("image", "Insert image", icon("image"))}${button("more", "Block actions", icon("ellipsis"))}
      </div>
      <div class="mobile-tool-scroll" data-tools-level="format" role="group" aria-label="Text styles" hidden>
        ${formats.map(([id, label, glyph]) => button(`format:${id}`, label, icon(glyph), `aria-pressed="false"${id === "color" || id === "background" ? ' aria-expanded="false" aria-controls="mobile-tool-panel"' : ""}`)).join("")}
      </div>
      ${button("keyboard", "Hide keyboard", icon("keyboard"))}`;
    this.main = root.querySelector('[data-tools-level="main"]')!;
    this.formatting = root.querySelector('[data-tools-level="format"]')!;
    this.back = root.querySelector('[data-tool="back"]')!;
    this.keyboard = root.querySelector('[data-tool="keyboard"]')!;
    // Cancelling pointer focus keeps the editor's native selection and IME.
    // Horizontal touch panning remains available in each scrollable row.
    root.addEventListener("pointerdown", event => { if ((event.target as Element).closest("button")) event.preventDefault(); });
    root.addEventListener("click", event => {
      const target = (event.target as Element).closest<HTMLButtonElement>("button[data-tool]");
      if (!target || target.disabled) return;
      event.stopPropagation();
      try { this.run(target.dataset.tool!); } catch (error) { options.error(error); }
      this.schedule();
    });
    panel.addEventListener("pointerdown", event => { if ((event.target as Element).closest("button")) event.preventDefault(); });
    panel.addEventListener("click", event => event.stopPropagation());
    document.addEventListener("selectionchange", () => this.schedule());
    refreshIcons();
  }

  get panelOpen() { return this.panelKind !== null; }
  schedule() {
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.refresh(); });
  }
  reset() { this.closePanel(); this.setLevel("main"); this.main.scrollLeft = 0; }
  backOneLevel() {
    if (this.panelOpen) { this.closePanel(); return true; }
    if (this.level === "format") { this.setLevel("main"); return true; }
    return false;
  }
  private setLevel(level: "main" | "format") {
    const changed = this.level !== level;
    this.level = level; this.root.dataset.level = level;
    this.main.hidden = level !== "main"; this.formatting.hidden = level !== "format"; this.back.hidden = level === "main";
    if (changed) (level === "main" ? this.main : this.formatting).scrollLeft = 0;
    this.schedule();
  }
  closePanel() {
    this.panelKind = null; this.panel.hidden = true; this.panel.replaceChildren(); delete this.panel.dataset.kind;
    this.keyboard.setAttribute("aria-label", "Hide keyboard"); this.keyboard.title = "Hide keyboard";
    for (const name of ["insert", "convert"]) this.root.querySelector(`[data-tool="${name}"]`)!.setAttribute("aria-expanded", "false");
    for (const name of ["color", "background"]) this.root.querySelector(`[data-tool="format:${name}"]`)!.setAttribute("aria-expanded", "false");
  }
  refresh() {
    const owner = this.options.workspace();
    if (!owner || this.root.hidden) return;
    const source = owner.activePane === "source", selected = source ? null : owner.blocks.touchSelection(false);
    const composing = owner.blocks.isComposing() || owner.source.composing;
    const enabled = (name: string) => commandEnabled(owner.session.snapshot.config, name);
    for (const item of this.root.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
      const action = item.dataset.tool!;
      if (["up", "down", "indent", "outdent"].includes(action)) item.disabled = !selected?.can(action as SelectionBlockAction);
      else if (action === "convert") item.disabled = !selected?.canConvert;
      else if (action === "more") item.disabled = source || !selected;
      else if (action === "insert") item.disabled = composing || !source && !selected?.canInsert;
      else if (action === "undo" || action === "redo") item.disabled = composing || !(action === "undo" ? owner.session.canUndo : owner.session.canRedo);
      else if (action.startsWith("format:")) {
        const id = action.slice(7);
        item.disabled = composing || !enabled(id) || !source && !selected;
        item.setAttribute("aria-pressed", String(!source && !!selected?.activeFormat(id)));
      } else if (["format", "image"].includes(action)) item.disabled = composing;
    }
  }
  private apply(success: boolean) {
    if (!success) this.options.error("The content changed or this action is unavailable. Tap the content and try again.");
  }
  private run(action: string) {
    const owner = this.options.workspace();
    if (!owner) return;
    if (action === "back") { this.setLevel("main"); return; }
    if (action === "keyboard") {
      if (this.panelOpen) {
        this.closePanel();
        if (owner.activePane === "source") owner.source.focus(); else owner.blocks.focus();
      } else this.options.hideKeyboard();
      return;
    }
    if (action === "format") { this.closePanel(); this.setLevel("format"); return; }
    if (action === "convert" || action === "insert") {
      if (this.panelKind === action) this.closePanel(); else this.openBlocks(action === "convert");
      return;
    }
    if (action === "format:color" || action === "format:background") {
      const kind = action.slice(7) as InlineColorKind;
      if (this.panelKind === kind) this.closePanel(); else this.openColors(kind);
      return;
    }
    this.closePanel();
    if (action === "undo" || action === "redo") { owner.history(action); return; }
    if (action === "image") { this.options.image(); return; }
    if (action === "more") { this.options.more(); return; }
    if (action.startsWith("format:")) {
      const id = action.slice(7);
      if (owner.activePane === "source") owner.insertFormat(id);
      else this.apply(owner.blocks.touchSelection()?.format(id) ?? false);
    } else this.apply(owner.blocks.touchSelection()?.run(action as SelectionBlockAction) ?? false);
  }
  private openColors(kind: InlineColorKind) {
    const owner = this.options.workspace();
    if (!owner || owner.source.composing || owner.blocks.isComposing() || !commandEnabled(owner.session.snapshot.config, kind)) return;
    const sourceMode = owner.activePane === "source";
    const selection = sourceMode ? null : owner.blocks.touchSelection();
    if (!sourceMode && !selection) return;
    const sourceState = owner.source.state;
    this.closePanel();
    this.panelKind = kind; this.panel.dataset.kind = kind;
    this.root.querySelector(`[data-tool="format:${kind}"]`)!.setAttribute("aria-expanded", "true");
    const label = kind === "color" ? "Text color" : "Background color";
    this.panel.setAttribute("aria-label", label);
    this.panel.innerHTML = `<div class="mobile-tool-panel-heading"><h2>${label}</h2>${button("close", "Close editing panel", icon("x"))}</div><div class="mobile-color-choices" role="group" aria-label="${label} choices"></div>`;
    this.panel.querySelector("button")!.onclick = () => this.closePanel();
    const grid = this.panel.querySelector(".mobile-color-choices")!;
    for (const value of ["", ...inlineColorNames]) {
      const name = value ? value[0].toUpperCase() + value.slice(1) : "Default";
      const choice = document.createElement("button"); choice.type = "button";
      choice.setAttribute("aria-label", `${name} ${kind === "background" ? "background" : "text"}`);
      choice.setAttribute("aria-pressed", String(!sourceMode && selection?.activeColor(kind) === value));
      const swatch = document.createElement("span"); swatch.className = "mobile-color-swatch"; swatch.textContent = "A";
      swatch.setAttribute("aria-hidden", "true");
      swatch.style.cssText = colorStyle(value && kind === "background" ? `${value}_bg` : value);
      const text = document.createElement("span"); text.textContent = name;
      choice.append(swatch, text);
      // Source is a literal insertion surface, without an inline character map.
      choice.disabled = sourceMode && !value;
      choice.onclick = () => {
        this.closePanel();
        if (owner !== this.options.workspace() || sourceMode !== (owner.activePane === "source")) return;
        try {
          if (sourceMode) {
            if (owner.source.composing || !owner.source.state.doc.eq(sourceState.doc)) { this.apply(false); return; }
            owner.source.dispatch({ selection: sourceState.selection });
            owner.insertFormat(kind, value);
          } else this.apply(selection!.color(kind, value));
        } catch (error) { this.options.error(error); }
        this.schedule();
      };
      grid.append(choice);
    }
    if (sourceMode) {
      const note = document.createElement("p"); note.className = "mobile-color-note";
      note.textContent = "In Source, choose a color to insert its markup. Use Page to reset existing colors.";
      grid.before(note);
    }
    this.panel.hidden = false; refreshIcons(); this.schedule();
  }
  openBlocks(convert = false, selected?: TouchSelection) {
    const owner = this.options.workspace();
    if (!owner || owner.source.composing || owner.blocks.isComposing()) return;
    const sourceMode = owner.activePane === "source", selection = selected ?? (!sourceMode ? owner.blocks.touchSelection() : null);
    if (!sourceMode && !selection) { this.options.error("Finish the current input before opening editing tools."); return; }
    this.closePanel(); this.setLevel("main");
    this.options.hideKeyboard();
    this.panelKind = convert ? "convert" : "insert";
    this.root.querySelector(`[data-tool="${this.panelKind}"]`)!.setAttribute("aria-expanded", "true");
    this.keyboard.setAttribute("aria-label", "Show keyboard"); this.keyboard.title = "Show keyboard";
    const label = convert ? "Turn into" : "Insert block";
    this.panel.setAttribute("aria-label", label);
    this.panel.innerHTML = `<div class="mobile-tool-panel-heading"><h2>${label}</h2>${button("close", "Close editing panel", icon("x"))}</div><div class="mobile-block-choices"></div>`;
    this.panel.querySelector("button")!.onclick = () => this.closePanel();
    const grid = this.panel.querySelector(".mobile-block-choices")!;
    for (const [type, title, glyph, markdown] of blockTypes) {
      if (convert && type === "divider") continue;
      const choice = document.createElement("button"); choice.type = "button";
      choice.innerHTML = `${icon(glyph)}<span>${title}</span>`;
      choice.disabled = !commandEnabled(owner.session.snapshot.config, type) || !sourceMode && !(convert ? selection?.canConvert : selection?.canInsert);
      choice.onclick = () => {
        this.closePanel();
        if (owner !== this.options.workspace()) return;
        try {
          if (sourceMode) owner.insert(markdown);
          else this.apply(convert ? selection!.convert(type) : selection!.insert(type));
        } catch (error) { this.options.error(error); }
        this.schedule();
      };
      grid.append(choice);
    }
    if (!convert && this.options.database) {
      for (const mode of ["full", "inline"] as const) {
        if (mode === "inline" && !commandEnabled(owner.session.snapshot.config, "database_inline")) continue;
        const choice = document.createElement("button"); choice.type = "button";
        choice.innerHTML = `${icon("table-2")}<span>Database - ${mode === "full" ? "Full page" : "Inline"}</span>`;
        choice.onclick = () => {
          this.closePanel();
          if (owner !== this.options.workspace()) return;
          owner.blocks.captureSelection();
          this.options.database?.(mode);
        };
        grid.append(choice);
      }
    }
    this.panel.hidden = false; refreshIcons(); this.schedule();
  }
}
