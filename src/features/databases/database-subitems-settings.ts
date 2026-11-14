import { ListTree, Settings2, Trash2 } from "lucide";
import { setUIText, t } from "../../shared/i18n";
import type { DatabaseDataSource, DatabaseLayout, DatabaseView } from "./database-model";
import { DatabasePopover, menuButton } from "./database-popover";
import { enableSubitems, subitemFields } from "./database-subitems";
import "./database-subitems.css";

export function subitemSettings(anchor: HTMLElement, surface: HTMLElement, source: DatabaseDataSource, view: DatabaseView, hooks: {
  source(patch: Partial<DatabaseDataSource>): Promise<void>;
  view(patch: Partial<DatabaseLayout>): Promise<void>;
}) {
  const pop = new DatabasePopover(anchor, "Sub-items", { surface, replace: true });
  const panel = pop.panel("Sub-items", anchor, 0, 300, false);
  panel.classList.add("database-subitem-settings");
  const enabled = !!source.subitems?.enabled, supported = ["table", "timeline"].includes(view.type);
  const note = (text: string) => { const p = document.createElement("p"); p.className = "database-subitem-setting-note"; setUIText(p, text); return p; };
  const section = (title: string) => { const section = document.createElement("div"); section.className = "database-subitem-settings-section"; const heading = document.createElement("h4"); setUIText(heading, title); section.append(heading); panel.append(section); return section; };
  const preview = (parentOnly = false) => {
    const box = document.createElement("div"); box.className = "database-subitem-preview";
    box.classList.toggle("is-nested", supported && (view.layout?.subitemDisplay ?? "nested") === "nested");
    for (const [index, text] of ["Parent item", "Sub-item", "Sub-item"].entries()) {
      if (parentOnly && index) continue;
      const row = document.createElement("div"); row.className = index ? "is-child" : "is-parent";
      const icon = document.createElement("span"); icon.textContent = index ? "📄" : "▸"; icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span"); setUIText(label, text); row.append(icon, label);
      if (parentOnly) { const count = document.createElement("span"); count.textContent = "↳ 2"; row.append(count); }
      box.append(row);
    }
    return box;
  };
  const select = (label: string, value: string, options: readonly (readonly [string, string])[], change: (value: string) => Promise<void>) => {
    const input = document.createElement("select"); input.setAttribute("aria-label", t(label));
    for (const [id, name] of options) { const option = document.createElement("option"); option.value = id; option.textContent = t(name); input.append(option); }
    input.value = value; input.onchange = () => { void pop.perform(() => change(input.value)); }; return input;
  };
  if (enabled) {
    const display = section("Display options"); display.append(preview());
    display.append(select("Display options", view.layout?.subitemDisplay === "disabled" ? "disabled" : supported ? view.layout?.subitemDisplay ?? "nested" : "flat", supported ? [["nested", "Nested in toggle"], ["flat", "Flattened list"], ["disabled", "Disabled"]] : [["flat", "Flattened list"], ["disabled", "Disabled"]], value => hooks.view({ subitemDisplay: value as DatabaseLayout["subitemDisplay"] })));
    if (!supported) display.append(note("Nested sub-items are available in Table and Timeline views."));
    const include = section("Include"); include.append(preview(view.layout?.subitemScope === "parents"));
    const scope = select("Include", view.layout?.subitemScope ?? "all", [["parents", "Parents only"], ["all", "Parents and sub-items"], ["children", "Sub-items only"]], value => hooks.view({ subitemScope: value as DatabaseLayout["subitemScope"] }));
    scope.disabled = view.layout?.subitemDisplay === "disabled"; include.append(scope);
    const advanced = menuButton("Advanced settings", Settings2, () => {
      const settings = pop.panel("Advanced settings", advanced, 1, 300, false), pair = subitemFields(source)!;
      for (const [label, field] of [["Parent item", pair.parent], ["Sub-item", pair.children]] as const) {
        const row = document.createElement("p"); row.className = "database-subitem-setting-note"; row.textContent = `${t(label)}: ${field.name}`; settings.append(row);
      }
      if (view.type === "table") {
        const label = document.createElement("label"); label.className = "database-subitem-title-setting";
        const input = document.createElement("input"); input.type = "checkbox"; input.checked = !!view.layout?.subitemToggleOnTitle;
        input.onchange = () => { void pop.perform(() => hooks.view({ subitemToggleOnTitle: input.checked })); };
        const text = document.createElement("span"); setUIText(text, "Show nesting toggle on title"); label.append(input, text); settings.append(label);
      }
      settings.append(note("Edit Parent item on a record to move it in the hierarchy."));
    }, "", true);
    panel.append(advanced);
  }
  panel.append(menuButton(enabled ? "Turn off sub-items" : "Turn on sub-items", enabled ? Trash2 : ListTree, () => {
    void pop.perform(() => hooks.source(enabled ? { subitems: { ...source.subitems!, enabled: false } } : enableSubitems(source, () => crypto.randomUUID())));
  }));
  panel.append(note("Turning off sub-items keeps the existing parent and child relations."));
  return pop;
}
