import { setUIText } from "../shared/i18n";
import { readSidebarTreePreferences, sidebarTreeKey, sidebarTreeChanged } from "./sidebar-tree-state";

const items = [["search", "Search"], ["home", "Vault"], ["databases", "Databases"], ["attachments", "Attachments"], ["people", "People"], ["graph", "Graph"], ["conflicts", "Conflicts and versions"]] as const;
const key = "notdown-sidebar-hidden";
const defaultHidden = ["people", "graph", "conflicts"];
const experiments = [["block-explorer", "Block Explorer"], ["markdown-lab", "Markdown Lab"]] as const;
const experimentsKey = "notdown-experimental-tools";
function hidden(): string[] {
  try { const value = JSON.parse(localStorage.getItem(key) || JSON.stringify(defaultHidden)); return Array.isArray(value) ? value.filter(item => typeof item === "string") : defaultHidden; }
  catch { return defaultHidden; }
}
function enabledExperiments(): string[] {
  try { const value = JSON.parse(localStorage.getItem(experimentsKey) || "[]"); return Array.isArray(value) ? value.filter(item => typeof item === "string") : []; }
  catch { return []; }
}
export function applySidebarPreferences() {
  const selected = hidden();
  for (const [action] of items) document.querySelector(`#sidebar [data-action="${action}"]`)?.toggleAttribute("data-sidebar-hidden", selected.includes(action));
  const enabled = enabledExperiments();
  for (const [id] of experiments) document.querySelector(`#sidebar [data-experimental="${id}"]`)?.toggleAttribute("data-sidebar-hidden", !enabled.includes(id));
}
export function mountSidebarPreferences(dialog: HTMLElement) {
  const section = document.createElement("section");
  section.className = "settings-section sidebar-preferences";
  section.innerHTML = `<h3 data-i18n="Sidebar">Sidebar</h3><p data-i18n="Choose which shortcuts appear. Hidden features remain available; Search also opens with Ctrl/⌘ K. Saved in this browser.">Choose which shortcuts appear. Hidden features remain available; Search also opens with Ctrl/⌘ K. Saved in this browser.</p>`;
  for (const [action, name] of items) {
    const row = document.createElement("label"); row.className = "switch-row";
    const label = document.createElement("span"); setUIText(label, name);
    const input = document.createElement("input"); input.type = "checkbox"; input.checked = !hidden().includes(action);
    input.addEventListener("change", () => {
      const values = new Set(hidden());
      if (input.checked) values.delete(action); else values.add(action);
      localStorage.setItem(key, JSON.stringify([...values])); applySidebarPreferences();
    });
    row.append(label, input); section.append(row);
  }
  const reset = document.createElement("button"); reset.type = "button"; reset.className = "secondary-button"; setUIText(reset, "Show all shortcuts");
  reset.addEventListener("click", () => { localStorage.setItem(key, "[]"); section.querySelectorAll<HTMLInputElement>("input").forEach(input => input.checked = true); applySidebarPreferences(); });
  const defaults = document.createElement("button"); defaults.type = "button"; defaults.className = "secondary-button"; setUIText(defaults, "Restore default shortcuts");
  defaults.addEventListener("click", () => {
    localStorage.removeItem(key);
    section.querySelectorAll<HTMLInputElement>("input").forEach((input, index) => input.checked = !defaultHidden.includes(items[index][0]));
    applySidebarPreferences();
  });
  section.append(reset, defaults);
  const tree = document.createElement("div");
  tree.innerHTML = `<h4 data-i18n="Page tree">Page tree</h4><label class="switch-row"><span data-i18n="Database children">Database children</span><select aria-label="Database children" data-i18n-aria-label="Database children"><option value="pages" data-i18n="Pages">Pages</option><option value="views" data-i18n="Views">Views</option></select></label><label class="switch-row"><span data-i18n="Default expanded levels">Default expanded levels</span><select aria-label="Default expanded levels" data-i18n-aria-label="Default expanded levels"><option value="0" data-i18n="0 — Collapsed">0 — Collapsed</option>${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}<option value="all" data-i18n="All levels">All levels</option></select></label><p data-i18n="0 shows only root pages; 1 also shows their children. Changes apply immediately. Manual expansion lasts until reload or a depth change.">0 shows only root pages; 1 also shows their children. Changes apply immediately. Manual expansion lasts until reload or a depth change.</p>`;
  const children = tree.querySelector<HTMLSelectElement>('[data-i18n-aria-label="Database children"]')!;
  const depth = tree.querySelector<HTMLSelectElement>('[data-i18n-aria-label="Default expanded levels"]')!;
  const preferences = readSidebarTreePreferences();
  children.value = preferences.databaseChildren; depth.value = String(preferences.expandDepth);
  const saveTree = () => {
    localStorage.setItem(sidebarTreeKey, JSON.stringify({ databaseChildren: children.value, expandDepth: depth.value === "all" ? "all" : Number(depth.value) }));
    window.dispatchEvent(new Event(sidebarTreeChanged));
  };
  children.addEventListener("change", saveTree); depth.addEventListener("change", saveTree);
  section.append(tree);
  const actions = dialog.querySelector(".dialog-actions");
  if (actions) actions.before(section); else dialog.append(section);
  const experimental = document.createElement("section");
  experimental.className = "settings-section experimental-preferences";
  experimental.innerHTML = `<h3 data-i18n="Experimental features">Experimental features</h3><p data-i18n="Enable experimental tools to show their sidebar links. Off by default. Saved in this browser.">Enable experimental tools to show their sidebar links. Off by default. Saved in this browser.</p>`;
  for (const [id, name] of experiments) {
    const row = document.createElement("label"); row.className = "switch-row";
    const label = document.createElement("span"); setUIText(label, name);
    const input = document.createElement("input"); input.type = "checkbox"; input.checked = enabledExperiments().includes(id);
    input.addEventListener("change", () => {
      const values = new Set(enabledExperiments());
      if (input.checked) values.add(id); else values.delete(id);
      localStorage.setItem(experimentsKey, JSON.stringify([...values])); applySidebarPreferences();
    });
    row.append(label, input); experimental.append(row);
  }
  if (actions) actions.before(experimental); else dialog.append(experimental);
}
window.addEventListener("storage", event => { if (event.key === key || event.key === experimentsKey || event.key === null) applySidebarPreferences(); });
