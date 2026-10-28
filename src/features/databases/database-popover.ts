import { createElement, X, ChevronLeft, ChevronRight, Check, type IconNode } from "lucide";
import "./database-popover.css";

export const menuIcon = (icon: IconNode) => createElement(icon, { width: 17, height: 17, "stroke-width": 1.65, "aria-hidden": "true" });
/** One anchored family of panels. Dirty state is committed before outside dismissal. */
export class DatabasePopover {
  readonly panels: HTMLElement[] = [];
  dirty = false;
  saveOnDismiss = true;
  private busy?: Promise<boolean>;
  private events = new AbortController();
  private dead = false;
  commit?: () => Promise<void>;
  constructor(readonly anchor: HTMLElement, readonly title: string) {
    anchor.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", event => {
      if (!this.panels.some(panel => panel.contains(event.target as Node)) && !anchor.contains(event.target as Node)) void this.dismiss();
    }, { capture: true, signal: this.events.signal });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (this.panels.length > 1) this.trim(this.panels.length - 1); else void this.dismiss(); }
      if (["ArrowDown", "ArrowUp"].includes(event.key) && event.target instanceof HTMLButtonElement && this.panels.some(panel => panel.contains(event.target as Node))) {
        const panel = (event.target as HTMLElement).closest<HTMLElement>(".database-popover")!;
        const buttons = [...panel.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const index = buttons.indexOf(event.target), next = buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length];
        event.preventDefault(); next?.focus();
      }
    }, { capture: true, signal: this.events.signal });
    window.addEventListener("resize", () => this.position(), { signal: this.events.signal });
  }
  panel(title: string, anchor = this.anchor, level = 0, width = 292): HTMLElement {
    this.trim(level);
    const panel = document.createElement("section"); panel.className = "database-popover"; panel.style.width = `${width}px`; panel.dataset.level = String(level); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", title);
    const header = document.createElement("header"); header.className = "database-popover-header";
    if (level) header.append(menuButton("Back", ChevronLeft, () => this.trim(level), "", false, "database-popover-back"));
    const label = document.createElement("span"); label.textContent = title; header.append(label);
    const close = menuButton("Close", X, () => { if (level) this.trim(level); else void this.dismiss(); }, "", false, "database-popover-close"); header.append(close); panel.append(header);
    const status = document.createElement("p"); status.className = "database-popover-status"; status.setAttribute("role", "status"); panel.append(status);
    panel.addEventListener("input", () => this.dirty = true);
    panel.addEventListener("change", () => this.dirty = true);
    document.body.append(panel); this.panels.push(panel);
    (panel as any).anchor = anchor;
    this.position(); requestAnimationFrame(() => { if (!this.dead) this.position(); });
    return panel;
  }
  private position() {
    for (let index = 0; index < this.panels.length; index++) {
      const panel = this.panels[index], anchor = (panel as any).anchor as HTMLElement, rect = anchor.getBoundingClientRect();
      const width = Math.min(parseInt(panel.style.width), innerWidth - 16);
      const parent = this.panels[index - 1]?.getBoundingClientRect();
      let left = index && parent ? parent.right + 4 : rect.left;
      if (index && parent && left + width > innerWidth - 8) left = parent.left - width - 4;
      const top = index ? rect.top : rect.bottom + 6;
      Object.assign(panel.style, { left: `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`, top: `${Math.max(8, Math.min(top, innerHeight - Math.min(panel.scrollHeight, innerHeight - 16) - 8))}px`, maxHeight: `${innerHeight - 16}px`, zIndex: String(1100 + index) });
    }
  }
  trim(length: number) { for (const panel of this.panels.splice(length)) panel.remove(); }
  async save(): Promise<boolean> {
    if (this.busy) return this.busy;
    if (!this.dirty || !this.commit) return true;
    this.busy = (async () => {
      this.panels.forEach(panel => panel.setAttribute("aria-busy", "true"));
      try { await this.commit!(); this.dirty = false; return true; }
      catch (error) { const status = this.panels.at(-1)?.querySelector<HTMLElement>("[role=status]"); if (status) { status.textContent = error instanceof Error ? error.message : String(error); status.append(menuButton("Discard menu changes", undefined, () => this.destroy())); status.scrollIntoView({ block: "nearest" }); } return false; }
      finally { this.panels.forEach(panel => panel.removeAttribute("aria-busy")); this.busy = undefined; }
    })(); return this.busy;
  }
  async close() { if (await this.save()) this.destroy(); }
  async dismiss() { if (this.saveOnDismiss) await this.close(); else this.destroy(); }
  destroy() { this.dead = true; this.dirty = false; this.anchor.setAttribute("aria-expanded", "false"); this.events.abort(); this.trim(0); }
  footer(panel: HTMLElement, commitLabel = "Done") {
    const footer = document.createElement("footer"); footer.className = "database-popover-footer";
    const done = menuButton(commitLabel, undefined, () => void this.close()); done.className = "database-popover-done"; footer.append(done); panel.append(footer);
  }
}
export function menuButton(label: string, icon?: IconNode, action?: (button: HTMLButtonElement) => void, value = "", submenu = false, className = "database-popover-row") {
  const button = document.createElement("button"); button.type = "button"; button.className = className; button.setAttribute("aria-label", label);
  if (icon) button.append(menuIcon(icon));
  const text = document.createElement("span"); text.className = "database-popover-label"; text.textContent = label; button.append(text);
  if (value) { const hint = document.createElement("span"); hint.className = "database-popover-value"; hint.textContent = value; button.append(hint); }
  if (submenu) { button.append(menuIcon(ChevronRight)); button.setAttribute("aria-haspopup", "dialog"); }
  button.onclick = () => action?.(button); return button;
}
export function menuToggle(label: string, checked: boolean, change: (checked: boolean) => void) {
  const button = menuButton(label); button.setAttribute("role", "switch"); button.setAttribute("aria-checked", String(checked));
  const track = document.createElement("span"); track.className = "database-popover-switch"; button.append(track);
  button.onclick = () => { checked = !checked; button.setAttribute("aria-checked", String(checked)); change(checked); }; return button;
}
export function menuInput(label: string, value: string, change: (value: string) => void, icon?: IconNode) {
  const row = document.createElement("div"); row.className = "database-popover-name"; if (icon) row.append(menuIcon(icon));
  const input = document.createElement("input"); input.setAttribute("aria-label", label); input.placeholder = label; input.value = value; input.maxLength = 500;
  input.oninput = () => change(input.value); row.append(input); return row;
}
export function menuSection(panel: HTMLElement, label?: string) { const section = document.createElement("div"); section.className = "database-popover-section"; if (label) { const title = document.createElement("p"); title.className = "database-popover-caption"; title.textContent = label; section.append(title); } panel.append(section); return section; }
export function menuChoice(label: string, chosen: boolean, select: () => void, icon?: IconNode) { const button = menuButton(label, icon, select); if (chosen) button.append(menuIcon(Check)); button.setAttribute("aria-pressed", String(chosen)); return button; }
