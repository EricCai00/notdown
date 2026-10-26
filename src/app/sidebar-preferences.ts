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
  section.innerHTML = '<h3>Sidebar</h3><p>Choose which shortcuts appear. Hidden features remain available; Search also opens with Ctrl/⌘ K. Saved in this browser.</p>';
  for (const [action, name] of items) {
    const row = document.createElement("label"); row.className = "switch-row";
    const label = document.createElement("span"); label.textContent = name;
    const input = document.createElement("input"); input.type = "checkbox"; input.checked = !hidden().includes(action);
    input.addEventListener("change", () => {
      const values = new Set(hidden());
      if (input.checked) values.delete(action); else values.add(action);
      localStorage.setItem(key, JSON.stringify([...values])); applySidebarPreferences();
    });
    row.append(label, input); section.append(row);
  }
  const reset = document.createElement("button"); reset.type = "button"; reset.className = "secondary-button"; reset.textContent = "Show all shortcuts";
  reset.addEventListener("click", () => { localStorage.setItem(key, "[]"); section.querySelectorAll<HTMLInputElement>("input").forEach(input => input.checked = true); applySidebarPreferences(); });
  const defaults = document.createElement("button"); defaults.type = "button"; defaults.className = "secondary-button"; defaults.textContent = "Restore default shortcuts";
  defaults.addEventListener("click", () => {
    localStorage.removeItem(key);
    section.querySelectorAll<HTMLInputElement>("input").forEach((input, index) => input.checked = !defaultHidden.includes(items[index][0]));
    applySidebarPreferences();
  });
  section.append(reset, defaults);
  const actions = dialog.querySelector(".dialog-actions");
  if (actions) actions.before(section); else dialog.append(section);
  const experimental = document.createElement("section");
  experimental.className = "settings-section experimental-preferences";
  experimental.innerHTML = '<h3>Experimental features</h3><p>Enable experimental tools to show their sidebar links. Off by default. Saved in this browser.</p>';
  for (const [id, name] of experiments) {
    const row = document.createElement("label"); row.className = "switch-row";
    const label = document.createElement("span"); label.textContent = name;
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
