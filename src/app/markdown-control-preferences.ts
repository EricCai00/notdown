const key = "notdown-markdown-controls";
const controls = [
  ["view", "Show view switcher", ".editing-modes"],
  ["dialect", "Show dialect selector", ".dialect-label"],
  ["extensions", "Show extensions button", ".syntax-options"],
] as const;
type Control = (typeof controls)[number][0];

function preferences(): Record<Control, boolean> {
  const defaults = { view: true, dialect: true, extensions: true };
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    for (const [id] of controls) {
      if (typeof value?.[id] === "boolean") defaults[id] = value[id];
    }
  } catch { /* Unreadable preferences use the visible defaults. */ }
  return defaults;
}

export function applyMarkdownControlPreferences() {
  const root = document.querySelector("#editing-workspace");
  if (!root) return;
  const selected = preferences();
  for (const [id, , selector] of controls) {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) element.hidden = !selected[id];
  }
  const extensions = root.querySelector<HTMLDetailsElement>(".syntax-options");
  if (extensions && !selected.extensions) extensions.open = false;
  const scroll = root.querySelector<HTMLElement>(".scroll-toggle");
  if (scroll) scroll.hidden = !selected.view;
  const toolbar = root.querySelector<HTMLElement>(".editing-toolbar");
  if (toolbar) toolbar.hidden = !Object.values(selected).some(Boolean);
}

export function mountMarkdownControlPreferences(dialog: HTMLElement) {
  const section = document.createElement("section");
  section.className = "settings-section markdown-control-preferences";
  section.innerHTML = '<h3>Markdown controls</h3><p>Choose which controls appear above the editor. Shown by default. View switching is also available in Page options and with Ctrl/⌘ E. Saved in this browser.</p>';
  const selected = preferences();
  for (const [id, name] of controls) {
    const row = document.createElement("label");
    row.className = "switch-row";
    const label = document.createElement("span");
    label.textContent = name;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selected[id];
    input.addEventListener("change", () => {
      localStorage.setItem(key, JSON.stringify({ ...preferences(), [id]: input.checked }));
      applyMarkdownControlPreferences();
    });
    row.append(label, input);
    section.append(row);
  }
  const actions = dialog.querySelector(".dialog-actions");
  if (actions) actions.before(section); else dialog.append(section);
}

window.addEventListener("storage", event => {
  if (event.key === key || event.key === null) applyMarkdownControlPreferences();
});
