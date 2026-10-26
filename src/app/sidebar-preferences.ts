const items = [["search", "Search"], ["home", "Vault"], ["databases", "Databases"], ["attachments", "Attachments"], ["people", "People"], ["graph", "Graph"], ["conflicts", "Conflicts and versions"]] as const;
const key = "notdown-sidebar-hidden";
function hidden(): string[] {
  try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value.filter(item => typeof item === "string") : []; }
  catch { return []; }
}
export function applySidebarPreferences() {
  const selected = hidden();
  for (const [action] of items) document.querySelector(`#sidebar [data-action="${action}"]`)?.toggleAttribute("data-sidebar-hidden", selected.includes(action));
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
  reset.addEventListener("click", () => { localStorage.removeItem(key); section.querySelectorAll<HTMLInputElement>("input").forEach(input => input.checked = true); applySidebarPreferences(); });
  section.append(reset);
  dialog.querySelector(".dialog-actions")?.before(section);
}
window.addEventListener("storage", event => { if (event.key === key || event.key === null) applySidebarPreferences(); });
