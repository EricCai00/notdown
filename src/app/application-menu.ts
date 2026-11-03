import { setUIAttribute, setUIText } from "../shared/i18n";
import "./application-menu.css";

export type ApplicationMenuGroup = { label: string; items: { action: string; label: string; shortcut?: string; disabled?: boolean }[] };

/** The popover uses the same data-action commands as the rest of the workspace. */
export function mountApplicationMenu(trigger: HTMLButtonElement, groups: () => ApplicationMenuGroup[]) {
  const menu = document.createElement("div");
  menu.id = "application-menu";
  menu.className = "application-menu";
  menu.popover = "auto";
  menu.role = "menu";
  setUIAttribute(menu, "aria-label", "Notdown menu");
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-controls", menu.id);
  trigger.setAttribute("aria-expanded", "false");
  document.body.append(menu);
  const items = () => [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  const open = (last = false) => {
    menu.replaceChildren();
    for (const group of groups()) {
      const section = document.createElement("div"); section.role = "group"; setUIAttribute(section, "aria-label", group.label);
      const heading = document.createElement("div"); heading.className = "application-menu-heading"; setUIText(heading, group.label); section.append(heading);
      for (const item of group.items) {
        const button = document.createElement("button"); button.type = "button"; button.role = "menuitem"; button.tabIndex = -1;
        button.dataset.action = item.action; button.disabled = !!item.disabled;
        setUIAttribute(button, "aria-label", item.label);
        const label = document.createElement("span"); setUIText(label, item.label); button.append(label);
        if (item.shortcut) { const hint = document.createElement("kbd"); hint.textContent = item.shortcut; button.append(hint); }
        section.append(button);
      }
      menu.append(section);
    }
    const rect = trigger.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 268))}px`;
    menu.style.top = `${rect.bottom + 6}px`;
    menu.showPopover();
    (last ? items().at(-1) : items()[0])?.focus();
  };
  trigger.addEventListener("click", () => { if (menu.matches(":popover-open")) menu.hidePopover(); else open(); });
  trigger.addEventListener("keydown", event => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault(); open(event.key === "ArrowUp");
  });
  menu.addEventListener("toggle", () => trigger.setAttribute("aria-expanded", String(menu.matches(":popover-open"))));
  menu.addEventListener("click", event => {
    if (!(event.target as Element).closest("button:not(:disabled)")) return;
    menu.hidePopover(); trigger.focus({ preventScroll: true });
  });
  menu.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); menu.hidePopover(); trigger.focus();
    } else if (event.key === "Tab") menu.hidePopover();
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const buttons = items(), index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  });
  window.addEventListener("resize", () => { if (menu.matches(":popover-open")) menu.hidePopover(); });
  return () => {
    if (!menu.matches(":popover-open")) return;
    const commands = new Map(groups().flatMap(group => group.items).map(item => [item.action, item]));
    menu.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach(button => {
      button.disabled = !!commands.get(button.dataset.action!)?.disabled;
    });
  };
}
