import { setUIAttribute, setUIText } from "../shared/i18n";
import { refreshIcons } from "../shared/icons";
import "./settings-layout.css";

const categories = [
  ["workspace", "Workspace", "folder-open", "Your knowledge base and local preferences."],
  ["appearance", "Appearance", "palette", "Make reading and navigation feel right for you."],
  ["editing", "Editing", "notebook-pen", "Choose how you write and which controls you see."],
  ["sync", "Sync & history", "git-branch", "Connect your devices and keep recoverable versions."],
  ["connections", "Connections", "globe", "Configure the services you choose to use."],
  ["advanced", "Advanced", "sliders-horizontal", "Code execution, experimental tools and integrations."],
] as const;
type Category = (typeof categories)[number][0];

/** Keep all sections mounted so navigation never discards unsaved form input. */
export function mountSettingsLayout(dialog: HTMLElement, body: HTMLElement) {
  const shell = document.createElement("div");
  shell.className = "settings-layout";
  const nav = document.createElement("nav");
  nav.className = "settings-navigation";
  setUIAttribute(nav, "aria-label", "Settings sections");
  const groups = {} as Record<Category, HTMLElement>;
  for (const [id, name, icon, description] of categories) {
    const group = document.createElement("section");
    group.className = "settings-category";
    group.id = `settings-${id}`;
    group.setAttribute("aria-labelledby", `${group.id}-title`);
    group.innerHTML = `<header class="settings-category-heading"><h2 id="${group.id}-title" tabindex="-1" data-i18n="${name}">${name}</h2><p data-i18n="${description}">${description}</p></header>`;
    groups[id] = group;
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-controls", group.id);
    button.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i><span data-i18n="${name}">${name}</span>`;
    button.addEventListener("click", () => {
      const heading = group.querySelector<HTMLElement>("h2")!;
      heading.scrollIntoView({ block: "start", behavior: "instant" });
      heading.focus({ preventScroll: true });
      syncNavigation();
    });
    nav.append(button);
  }
  const actions = body.querySelector<HTMLElement>(".dialog-actions")!;
  const exportButton = actions.querySelector<HTMLElement>('[data-action="mybase-export"]');
  if (exportButton) body.querySelector('[data-settings-category="advanced"]')?.append(exportButton);
  const hint = document.createElement("p");
  setUIText(hint, "Preferences save automatically. Use Save for connection and history settings.");
  actions.prepend(hint);
  for (const child of Array.from(body.children)) {
    if (child === actions) continue;
    const category = (child as HTMLElement).dataset.settingsCategory as Category | undefined;
    groups[category ?? "workspace"].append(child);
  }
  body.replaceChildren(...Object.values(groups));
  shell.append(nav, body);
  dialog.append(shell, actions);
  function syncNavigation() {
    const top = body.getBoundingClientRect().top + 60;
    let active: Category = "workspace";
    for (const [id] of categories) if (groups[id].getBoundingClientRect().top <= top) active = id;
    for (const button of nav.querySelectorAll("button")) {
      if (button.getAttribute("aria-controls") === groups[active].id) button.setAttribute("aria-current", "location");
      else button.removeAttribute("aria-current");
    }
  }
  body.addEventListener("scroll", syncNavigation, { passive: true });
  syncNavigation();
  refreshIcons();
  return groups;
}
