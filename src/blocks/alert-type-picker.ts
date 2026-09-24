import { DOMSerializer } from "prosemirror-model";
import { alertColor, alertIcon, alertLabel, alertTypes, obsidianAlertTypes } from "../document/alert-presentation";

export function openAlertTypePicker(anchor: HTMLElement, options: { kind: string; style: string; extended: boolean; fold: string }, choose: (patch: { kind?: string; fold?: string }) => void) {
  const menu = document.createElement("div");
  menu.className = "pm-alert-type-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Alert type");
  const heading = document.createElement("div");
  heading.className = "pm-alert-type-heading";
  heading.textContent = "Alert type";
  menu.append(heading);
  const types = options.extended
    ? [...alertTypes, ...obsidianAlertTypes.filter(type => !(alertTypes as readonly string[]).includes(type))]
    : [...alertTypes];
  const events = new AbortController();
  const close = (restoreFocus = false) => {
    events.abort(); menu.remove(); anchor.setAttribute("aria-expanded", "false");
    if (restoreFocus && anchor.isConnected) anchor.focus();
  };
  for (const type of types) {
    const item = document.createElement("button"), label = document.createElement("span"), swatch = document.createElement("span");
    item.type = "button";
    item.className = "pm-alert-type-option";
    item.setAttribute("role", "menuitemradio");
    item.setAttribute("aria-checked", String(type === options.kind.toUpperCase()));
    item.dataset.alertType = type;
    item.style.setProperty("--alert-color", alertColor(type, options.style));
    label.textContent = alertLabel(type);
    swatch.className = "pm-alert-type-swatch";
    swatch.setAttribute("aria-hidden", "true");
    item.append(DOMSerializer.renderSpec(document, alertIcon(type, options.style)).dom, label, swatch);
    item.addEventListener("click", () => { close(true); if (type !== options.kind.toUpperCase()) choose({ kind: type }); });
    menu.append(item);
  }
  if (options.extended) {
    const fold = document.createElement("button");
    fold.type = "button";
    fold.className = "pm-alert-fold-option";
    fold.setAttribute("role", "menuitemcheckbox");
    fold.setAttribute("aria-checked", String(!!options.fold));
    fold.textContent = "Collapsible";
    fold.addEventListener("click", () => { close(); choose({ fold: options.fold ? "" : "+" }); });
    menu.append(fold);
  }
  document.body.append(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - menu.offsetHeight - 8))}px`;
  anchor.setAttribute("aria-expanded", "true");
  const items = Array.from(menu.querySelectorAll("button"));
  items.forEach(item => item.tabIndex = -1);
  const focus = (index: number) => {
    items.forEach(item => item.tabIndex = -1);
    const item = items[(index + items.length) % items.length];
    item.tabIndex = 0; item.focus(); item.scrollIntoView({ block: "nearest" });
  };
  focus(Math.max(0, items.findIndex(item => item.getAttribute("aria-checked") === "true")));
  menu.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      focus(event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : index + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Tab") close();
  });
  document.addEventListener("pointerdown", event => { if (!menu.contains(event.target as Node) && !anchor.contains(event.target as Node)) close(); }, { capture: true, signal: events.signal });
  document.addEventListener("scroll", event => { if (!menu.contains(event.target as Node)) close(); }, { capture: true, signal: events.signal });
  window.addEventListener("resize", () => close(), { signal: events.signal });
  return () => close();
}
