import { DOMSerializer, type Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import { createElement, Settings, Plus, ArrowUp, ArrowDown, Copy, Trash2, MousePointer2, Smile, type IconNode } from "lucide";
import { openCalloutIconPicker } from "./callout-icon-picker";
import { buttonActionNames, buttonPositions, buttonTarget, buttonTransaction, readButtonActions, validateButtonActions, type ButtonAction } from "./button-actions";
import type { BreadcrumbPage } from "./breadcrumb-view";
import "./button.css";

const svg = (icon: IconNode) => createElement(icon, { width: 16, height: 16, "aria-hidden": "true" });
function control(label: string, click: () => void, icon?: IconNode) {
  const button = document.createElement("button"); button.type = "button";
  button.setAttribute("aria-label", label); button.title = label;
  if (icon) button.append(svg(icon)); else button.textContent = label;
  button.onclick = click; return button;
}
function field(label: string, input: HTMLElement) {
  const row = document.createElement("label"), name = document.createElement("span");
  name.textContent = label; input.setAttribute("aria-label", label); row.append(name, input); return row;
}
function select(values: Record<string, string>, value: string, change: (value: string) => void) {
  const input = document.createElement("select");
  for (const [key, label] of Object.entries(values)) input.add(new Option(label, key));
  input.value = value; input.onchange = () => change(input.value); return input;
}

/** Configuration stays a draft until Done; only the main document transaction persists it. */
export class ButtonView implements NodeView {
  dom = document.createElement("div");
  private row = document.createElement("div");
  private run: HTMLButtonElement;
  private settings: HTMLButtonElement;
  private status = document.createElement("output");
  private panel?: HTMLFormElement;
  private original?: PMNode;
  private save?: HTMLButtonElement;
  private feedback?: HTMLOutputElement;
  private closePicker?: () => void;
  private confirmation?: HTMLDialogElement;
  private busy = false;
  private disposed = false;
  private draftAppearance?: { label: string; icon: string; variant: string };

  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined, private parse: (source: string) => PMNode, private pages: () => BreadcrumbPage[], private onOpenPage?: (id: string) => void) {
    this.dom.className = "pm-button-block pm-object-button";
    this.dom.contentEditable = "false";
    this.row.className = "pm-button-row";
    this.run = control("Button", () => { void this.execute(); }); this.run.className = "pm-action-button";
    this.settings = control("Configure button", () => this.configure(), Settings); this.settings.className = "pm-button-settings";
    this.settings.setAttribute("aria-expanded", "false");
    this.status.setAttribute("aria-live", "polite");
    this.row.append(this.run, this.settings); this.dom.append(this.row, this.status);
    this.dom.addEventListener("notdown-configure-button", () => this.configure());
    this.refresh();
  }

  private refresh() {
    const appearance = this.draftAppearance || this.node.attrs;
    this.run.replaceChildren();
    if (appearance.icon) { const icon = document.createElement("span"); icon.className = "pm-button-emoji"; icon.textContent = appearance.icon; icon.setAttribute("aria-hidden", "true"); this.run.append(icon); }
    const label = document.createElement("span"); label.textContent = appearance.label || "Button"; this.run.append(label);
    this.run.setAttribute("aria-label", appearance.label || "Button"); this.run.title = appearance.label || "Button";
    this.run.dataset.variant = ["default", "gray", "blue"].includes(appearance.variant) ? appearance.variant : "default";
    this.run.disabled = !this.view.editable || this.busy; this.run.setAttribute("aria-busy", String(this.busy));
    this.settings.disabled = !this.view.editable || this.busy;
    if (this.original && (!this.node.eq(this.original) || !this.view.editable)) {
      if (this.save) this.save.disabled = true;
      if (this.feedback) this.feedback.textContent = "This button changed. Cancel and reopen its settings. Your draft is still shown below.";
    }
  }

  configure() {
    if (!this.view.editable || this.busy || this.disposed) return;
    if (this.panel) { this.panel.querySelector("input")?.focus(); return; }
    let actions: ButtonAction[];
    try { actions = readButtonActions(this.node.attrs); } catch (error) { this.status.textContent = (error as Error).message; return; }
    this.status.textContent = "";
    this.original = this.node;
    this.dom.classList.add("pm-button-configuring");
    let icon = String(this.node.attrs.icon || ""), variant = String(this.node.attrs.variant || "default");
    const form = this.panel = document.createElement("form"); form.className = "pm-button-config"; form.setAttribute("aria-label", "Button settings");
    this.settings.setAttribute("aria-expanded", "true");
    const header = document.createElement("div"); header.className = "pm-button-config-header";
    const iconButton = control("Button icon", () => {
      this.closePicker?.(); this.closePicker = openCalloutIconPicker(iconButton, value => { icon = value; paintIcon(); validate(); }, "Button icon");
    });
    const paintIcon = () => { iconButton.replaceChildren(); if (icon) iconButton.textContent = icon; else iconButton.append(svg(Smile)); };
    paintIcon();
    const name = document.createElement("input"); name.value = this.node.attrs.label; name.placeholder = "Button name"; name.setAttribute("aria-label", "Button name");
    const done = this.save = document.createElement("button"); done.type = "submit"; done.textContent = "Done"; done.className = "pm-button-done";
    header.append(iconButton, name, done);
    const style = select({ default: "Default", gray: "Gray", blue: "Blue" }, variant, value => { variant = value; validate(); });
    const trigger = document.createElement("div"); trigger.className = "pm-button-trigger"; trigger.append(svg(MousePointer2), "When button is clicked");
    const steps = document.createElement("div"); steps.className = "pm-button-steps";
    const feedback = this.feedback = document.createElement("output"); feedback.setAttribute("aria-live", "polite");
    const validate = () => {
      this.draftAppearance = { label: name.value, icon, variant }; this.refresh();
      const stale = !this.original?.eq(this.node) || !this.view.editable;
      const error = !name.value.trim() ? "Give this button a name." : validateButtonActions(actions);
      done.disabled = stale || !!error;
      feedback.textContent = stale ? "This button changed. Cancel and reopen its settings." : error || "";
    };
    name.oninput = validate;
    const renderSteps = () => {
      steps.replaceChildren();
      actions.forEach((action, index) => {
        const card = document.createElement("section"); card.className = "pm-button-step"; card.setAttribute("aria-label", `Step ${index + 1}`);
        const top = document.createElement("div"); top.className = "pm-button-step-header";
        const number = document.createElement("span"); number.className = "pm-button-step-number"; number.textContent = String(index + 1);
        const choices = { "insert-blocks": "Insert blocks", "open-url": "Open page or URL", confirmation: "Show confirmation", ...(action.type === "insert-text" ? { "insert-text": "Insert text (legacy)" } : {}), ...(action.type === "toggle-tasks" ? { "toggle-tasks": "Toggle tasks (local)" } : {}) };
        const kind = select(choices, action.type, value => {
          // Changing type is explicit; unrelated extension fields are retained.
          actions[index] = { ...action, type: value, ...(value === "insert-blocks" ? { content: action.content ?? "", position: action.position ?? "below" } : value === "confirmation" ? { message: action.message ?? "Are you sure?" } : { target: action.target ?? "" }) };
          renderSteps();
        }); kind.setAttribute("aria-label", `Action ${index + 1}`);
        if (!Object.hasOwn(buttonActionNames, action.type)) { kind.add(new Option("Unsupported: " + action.type, action.type)); kind.value = action.type; }
        const tools = document.createElement("div"); tools.className = "pm-button-step-tools";
        const move = (offset: number) => { [actions[index], actions[index + offset]] = [actions[index + offset], actions[index]]; renderSteps(); };
        const up = control(`Move step ${index + 1} up`, () => move(-1), ArrowUp); up.disabled = index === 0;
        const down = control(`Move step ${index + 1} down`, () => move(1), ArrowDown); down.disabled = index === actions.length - 1;
        const duplicate = control(`Duplicate step ${index + 1}`, () => { actions.splice(index + 1, 0, structuredClone(action)); renderSteps(); }, Copy); duplicate.disabled = actions.length >= 50;
        tools.append(up, down, duplicate, control(`Delete step ${index + 1}`, () => { actions.splice(index, 1); renderSteps(); }, Trash2));
        top.append(number, kind, tools); card.append(top);
        if (action.type === "insert-blocks") {
          card.append(field("Insert position", select(buttonPositions, action.position || "below", value => { action.position = value; validate(); })));
          const input = document.createElement("textarea"); input.value = action.content || ""; input.placeholder = "## Meeting notes\n\n- [ ] First task"; input.rows = 4;
          const preview = document.createElement("div"); preview.className = "pm-button-template-preview"; preview.setAttribute("aria-label", "Blocks preview"); preview.inert = true;
          const render = () => {
            preview.replaceChildren();
            try {
              if (input.value.trim()) preview.append(DOMSerializer.fromSchema(this.view.state.schema).serializeFragment(this.parse(input.value).content));
              preview.querySelectorAll("li[data-checked]").forEach(item => {
                const check = document.createElement("input"); check.type = "checkbox"; check.checked = item.getAttribute("data-checked") === "true"; check.disabled = true; item.prepend(check);
              });
            } catch { preview.textContent = "Unable to preview these blocks."; }
          };
          input.oninput = () => { action.content = input.value; validate(); render(); };
          card.append(field("Blocks (Markdown)", input), preview); render();
        } else if (action.type === "open-url") {
          const input = document.createElement("input"); input.value = action.target || ""; input.placeholder = "https://example.com";
          input.oninput = () => { action.target = input.value; validate(); };
          const pageChoices: Record<string, string> = { "": "Choose a page…" };
          for (const page of this.pages()) pageChoices["#page/" + encodeURIComponent(page.id)] = page.title || "Untitled";
          const pageSelect = select(pageChoices, action.target || "", value => { if (value) { action.target = value; input.value = value; validate(); } });
          card.append(field("Page", pageSelect), field("Page link or URL", input));
        } else if (action.type === "confirmation" || action.type === "insert-text") {
          const key = action.type === "confirmation" ? "message" : "target";
          const input = document.createElement("textarea"); input.value = String(action[key] || ""); input.rows = 2;
          input.oninput = () => { action[key] = input.value; validate(); };
          card.append(field(action.type === "confirmation" ? "Confirmation message" : "Text", input));
        } else {
          const note = document.createElement("p"); note.textContent = action.type === "toggle-tasks" ? "Toggles all to-dos on this page. This is a local legacy action." : "This action is preserved but cannot run in Notdown."; card.append(note);
        }
        steps.append(card);
      });
      validate();
    };
    const add = control("Add another step", () => { if (actions.length < 50) { actions.push({ type: "insert-blocks", position: "below", content: "" }); renderSteps(); steps.lastElementChild?.querySelector("textarea")?.focus(); } });
    add.prepend(svg(Plus)); add.className = "pm-button-add-step";
    const footer = document.createElement("div"); footer.className = "pm-button-config-footer";
    const help = document.createElement("small"); help.textContent = "Insert blocks, show a confirmation, or open a page or URL.";
    footer.append(help, control("Cancel", () => this.closeSettings()));
    form.append(header, field("Style", style), trigger, steps, add, feedback, footer);
    form.onsubmit = event => {
      event.preventDefault(); validate(); if (done.disabled) return;
      const pos = this.getPos(); if (pos === undefined || !this.view.state.doc.nodeAt(pos)?.eq(this.original!)) return;
      try {
        // Parse and validate every template before saving, without changing the document.
        buttonTransaction(this.view.state, pos, this.node, actions, this.parse);
        const attrs = { ...this.node.attrs, label: name.value.trim(), icon, variant, actions: JSON.stringify(actions) };
        const unchanged = attrs.label === this.node.attrs.label && attrs.icon === this.node.attrs.icon && attrs.variant === this.node.attrs.variant && JSON.stringify(actions) === JSON.stringify(readButtonActions(this.node.attrs));
        this.closeSettings(false);
        if (!unchanged) { this.view.dispatch(closeHistory(this.view.state.tr).setNodeMarkup(pos, undefined, attrs).setMeta("isolateHistory", true)); this.view.dispatch(closeHistory(this.view.state.tr).setMeta("addToHistory", false)); }
        this.run.focus();
      } catch (error) { feedback.textContent = (error as Error).message; }
    };
    form.onkeydown = event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.closeSettings(); } };
    this.dom.append(form); renderSteps(); name.focus(); name.select();
  }

  private closeSettings(focus = true) {
    this.closePicker?.(); this.closePicker = undefined; this.panel?.remove(); this.panel = undefined; this.original = undefined;
    this.draftAppearance = undefined; this.dom.classList.remove("pm-button-configuring"); this.refresh();
    this.settings.setAttribute("aria-expanded", "false"); if (focus && !this.disposed) this.settings.focus();
  }

  private confirm(message: string) {
    return new Promise<boolean>(resolve => {
      const dialog = this.confirmation = document.createElement("dialog"); dialog.className = "pm-button-confirm"; dialog.setAttribute("aria-label", "Confirm button action");
      const heading = document.createElement("h3"); heading.textContent = this.node.attrs.label || "Button";
      const text = document.createElement("p"); text.textContent = message;
      const footer = document.createElement("footer"); let accepted = false;
      const proceed = control("Continue", () => { accepted = true; dialog.close(); }); proceed.className = "pm-button-done";
      footer.append(control("Cancel", () => dialog.close()), proceed); dialog.append(heading, text, footer);
      dialog.onclose = () => { dialog.remove(); this.confirmation = undefined; resolve(accepted); };
      document.body.append(dialog); dialog.showModal();
    });
  }

  private async execute() {
    if (this.busy || this.disposed || !this.view.editable) return;
    if (this.panel) { this.panel.querySelector("input")?.focus(); return; }
    try {
      const actions = readButtonActions(this.node.attrs);
      if (!actions.length) { this.configure(); return; }
      const pos = this.getPos(); if (pos === undefined) return;
      const doc = this.view.state.doc, original = this.node;
      buttonTransaction(this.view.state, pos, original, actions, this.parse);
      for (const action of actions) if (action.type === "open-url") {
        const target = buttonTarget(action.target!)!;
        if ("pageId" in target && !this.pages().some(page => page.id === target.pageId)) throw new Error("This page is no longer available. Choose another page in button settings.");
      }
      this.busy = true; this.status.textContent = ""; this.refresh();
      for (const action of actions) if (action.type === "confirmation") {
        if (!await this.confirm(action.message!)) return;
        if (this.disposed || !this.view.editable) return;
        if (!this.view.state.doc.eq(doc)) throw new Error("The page changed while waiting for confirmation. Run the button again.");
      }
      const tr = buttonTransaction(this.view.state, pos, original, actions, this.parse);
      if (tr.docChanged) { this.view.dispatch(tr); this.view.dispatch(closeHistory(this.view.state.tr).setMeta("addToHistory", false)); }
      const open = actions.find(action => action.type === "open-url");
      if (open) {
        const target = buttonTarget(open.target!)!;
        if ("pageId" in target) { if (this.onOpenPage) this.onOpenPage(target.pageId); else location.hash = "#page/" + encodeURIComponent(target.pageId); }
        else {
          window.open(target.url, "_blank", "noopener,noreferrer");
          const link = document.createElement("a"); link.href = target.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Open link";
          this.status.append("If the new tab did not open: ", link);
        }
      }
    } catch (error) { if (!this.disposed) this.status.textContent = (error as Error).message; }
    finally { this.busy = false; if (!this.disposed) { this.refresh(); this.run.focus(); } }
  }
  update(node: PMNode) { if (node.type !== this.node.type) return false; this.node = node; this.refresh(); return true; }
  stopEvent(event: Event) {
    // Preserve editor undo shortcuts when the execution button has keyboard focus.
    if (event instanceof KeyboardEvent && (event.ctrlKey || event.metaKey) && /^(z|y)$/i.test(event.key) && this.row.contains(event.target as Node)) return false;
    return true;
  }
  ignoreMutation() { return true; }
  destroy() { this.disposed = true; this.closeSettings(false); this.confirmation?.close(); }
}
