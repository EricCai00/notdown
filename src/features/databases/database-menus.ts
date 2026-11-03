import { setUIText, setUIAttribute } from "../../shared/i18n";
import { Table2, Columns3, LayoutGrid, List, Calendar, SlidersHorizontal, Eye, EyeOff, ListFilter, ArrowDownUp, Layers, Link, Database, AlignLeft, Hash, SquareCheck, Type, CircleChevronDown, Users, FileText, Mail, Phone, ArrowLeftToLine, WrapText, Plus, Trash2, GripVertical, Check, ChevronRight } from "lucide";
import type { IconNode } from "lucide";
import { DatabasePopover, menuButton, menuChoice, menuIcon, menuInput, menuSection, menuToggle } from "./database-popover";
import { databaseViewTypes, type DatabaseDataSource, type DatabaseLayout, type DatabaseProperty, type DatabasePropertyType, type DatabaseView, type DatabaseViewType } from "./database-model";
import { groupable } from "./database-query";
import { readQuerySettings, viewLabel, wireQuerySettings } from "./database-view-settings";
import { routeHash } from "../pages/page-navigation";

const viewIcons = { table: Table2, board: Columns3, gallery: LayoutGrid, list: List, calendar: Calendar };
const propertyIcons: Partial<Record<DatabasePropertyType, IconNode>> = { title: Type, text: AlignLeft, number: Hash, checkbox: SquareCheck, date: Calendar, select: CircleChevronDown, multi_select: List, status: Layers, people: Users, files: FileText, url: Link, email: Mail, phone: Phone };
const labels: Partial<Record<DatabasePropertyType, string>> = { text: "Text", title: "Title", number: "Number", select: "Select", multi_select: "Multi-select", status: "Status", date: "Date", checkbox: "Checkbox", url: "URL", email: "Email", phone: "Phone" };
const colors: Record<string, string> = { default: "#f4f4f2", gray: "#e5e5e3", brown: "#edddd1", orange: "#f8dec6", yellow: "#f4e4b0", green: "#d8e9df", blue: "#d3e6fa", purple: "#e8dcf1", pink: "#f5dce8", red: "#f6d9d5" };
export const propertyMenuIcon = (field: DatabaseProperty) => propertyIcons[field.type] ?? AlignLeft;
export function openGroupMenu(anchor: HTMLElement, hooks: { field: DatabaseProperty; key: string; view: DatabaseView; save(field: DatabaseProperty, view: DatabaseView): Promise<void>; edit(): void; trash(): void }) {
  const pop = new DatabasePopover(anchor, "Group options"), field = structuredClone(hooks.field), view = structuredClone(hooks.view); view.layout ??= {};
  pop.commit = () => hooks.save(field, view);
  const panel = pop.panel("Group options", anchor, 0, 230);
  panel.append(menuButton("Edit groups", Layers, async () => { if (await pop.save()) { pop.destroy(); hooks.edit(); } }));
  const aggregation = menuToggle("Show aggregation", view.layout.showGroupCount !== false, enabled => { view.layout!.showGroupCount = enabled; pop.dirty = true; }); aggregation.prepend(menuIcon(Eye)); panel.append(aggregation);
  panel.append(menuButton("Hide group", Eye, () => { view.layout!.hiddenGroups = [...new Set([...(view.layout!.hiddenGroups ?? []), hooks.key])]; pop.dirty = true; void pop.close(); }));
  panel.append(menuButton("Move to Trash", Trash2, async () => { if (await pop.save()) { pop.destroy(); hooks.trash(); } }));
  const section = menuSection(panel, "Colors"), option = field.options?.find(option => option.id === hooks.key);
  section.classList.add("database-popover-colors");
  for (const [color, background] of Object.entries(colors)) {
    const row = menuChoice(viewLabel(color), color === (view.layout.groupColors?.[hooks.key] ?? option?.color ?? "gray"), () => {
      if (option) { option.color = color; if (view.layout!.groupColors) delete view.layout!.groupColors[hooks.key]; }
      else view.layout!.groupColors = { ...view.layout!.groupColors, [hooks.key]: color };
      pop.dirty = true; void pop.close();
    });
    const swatch = document.createElement("span"); swatch.className = "color-swatch"; swatch.style.background = background; row.prepend(swatch); section.append(row);
  }
  return pop;
}
type ViewMenuHooks = {
  wiki?: boolean;
  surface?: HTMLElement;
  manageSources?(pop: DatabasePopover, anchor: HTMLElement, level: number): void;
  sources: DatabaseDataSource[]; view: DatabaseView; create?: boolean;
  save(view: DatabaseView): Promise<void>; editProperty(field: DatabaseProperty, anchor: HTMLElement): void; addProperty(anchor: HTMLElement): void;
};
export function openViewMenu(anchor: HTMLElement, hooks: ViewMenuHooks, section?: "Filter" | "Sort" | "Group" | "Property visibility" | "Layout" | "Source") {
  const pop = new DatabasePopover(anchor, hooks.create ? "New view" : "View settings", { replace: true, surface: hooks.create ? undefined : hooks.surface });
  const draft = structuredClone(hooks.view); draft.layout ??= {};
  let source = hooks.sources.find(source => source.id === draft.dataSourceId)!;
  const layout = draft.layout;
  let queryPanel: HTMLElement | undefined;
  const collect = () => { if (queryPanel?.isConnected) Object.assign(draft, readQuerySettings(queryPanel)); };
  pop.commit = async () => { collect(); if (!draft.name.trim()) draft.name = viewLabel(draft.type); await hooks.save(draft); };
  if (hooks.create) { pop.dirty = true; pop.saveOnDismiss = false; }
  function choicePanel<T extends string | number>(button: HTMLElement, title: string, choices: [T, string][], selected: T, change: (value: T) => void, level = 2) {
    collect(); const panel = pop.panel(title, button, level);
    for (const [id, label] of choices) panel.append(menuChoice(label, id === selected, () => { change(id); pop.dirty = true; pop.trim(level); const value = button.querySelector(".database-popover-value"); if (value) value.textContent = label; }, undefined, !["Group by", "Calendar by"].includes(title) || id === ""));
  }
  function grid(panel: HTMLElement, redraw: () => void) {
    const host = document.createElement("div"); host.className = "database-popover-grid";
    for (const type of databaseViewTypes) host.append(menuChoice(viewLabel(type), draft.type === type, () => {
      if (hooks.create && (!draft.name || databaseViewTypes.some(type => viewLabel(type) === draft.name))) draft.name = viewLabel(type);
      draft.type = type; pop.dirty = true;
      if (type === "board" && !layout.groupBy) layout.groupBy = source.properties.find(groupable)?.id;
      if (type === "calendar" && !layout.datePropertyId) layout.datePropertyId = source.properties.find(field => field.type === "date")?.id;
      redraw();
    }, viewIcons[type])); panel.append(host);
  }
  function layoutControls(panel: HTMLElement, level: number) {
    const toggle = (label: string, key: "showDataSourceTitle" | "showVerticalLines" | "showPageIcon" | "wrapContent" | "fitImage", fallback: boolean) => panel.append(menuToggle(label, layout[key] ?? fallback, value => { layout[key] = value; pop.dirty = true; }));
    if (!hooks.wiki) toggle("Show data source titles", "showDataSourceTitle", hooks.sources.length > 1);
    if (draft.type === "table") toggle("Show vertical lines", "showVerticalLines", true);
    toggle("Show page icon", "showPageIcon", true); toggle("Wrap all content", "wrapContent", false);
    panel.append(menuButton("Open pages in", undefined, button => choicePanel(button, "Open pages in", [["side", "Side peek"], ["center", "Center peek"], ["full", "Full page"]], layout.openPagesIn ?? "side", value => layout.openPagesIn = value, level + 1), ({ side: "Side peek", center: "Center peek", full: "Full page" })[layout.openPagesIn ?? "side"], true));
    panel.append(menuButton("Load limit", undefined, button => choicePanel(button, "Load limit", [[25, "25"], [50, "50"], [100, "100"], [0, "All"]], layout.loadLimit ?? 0, value => layout.loadLimit = value, level + 1), String(layout.loadLimit || "All"), true));
    if (["gallery", "board"].includes(draft.type)) {
      panel.append(menuButton("Card size", undefined, button => choicePanel(button, "Card size", [["small", "Small"], ["medium", "Medium"], ["large", "Large"]], layout.cardSize ?? "medium", value => layout.cardSize = value, level + 1), viewLabel(layout.cardSize ?? "medium"), true));
      panel.append(menuButton("Card preview", undefined, button => choicePanel(button, "Card preview", [["none", "None"], ["cover", "Page cover"], ["content", "Page content"]], layout.preview ?? (draft.type === "gallery" ? "cover" : "none"), value => layout.preview = value, level + 1), layout.preview === "content" ? "Page content" : layout.preview === "none" ? "None" : "Page cover", true)); toggle("Fit image", "fitImage", false);
    }
    if (draft.type === "calendar") {
      panel.append(menuButton("Calendar by", Calendar, button => choicePanel(button, "Calendar by", source.properties.filter(field => field.type === "date").map(field => [field.id, field.name]), layout.datePropertyId ?? "", value => layout.datePropertyId = value, level + 1), source.properties.find(field => field.id === layout.datePropertyId)?.name ?? "New date property", true));
      panel.append(menuButton("Show calendar as", undefined, button => choicePanel(button, "Show calendar as", [["month", "Month"], ["week", "Week"]], layout.calendarRange ?? "month", value => layout.calendarRange = value, level + 1), viewLabel(layout.calendarRange ?? "month"), true));
    }
    if (draft.type === "board") panel.append(menuButton("Group by", Layers, button => choicePanel(button, "Group by", source.properties.filter(groupable).map(field => [field.id, field.name]), layout.groupBy ?? "", value => layout.groupBy = value, level + 1), source.properties.find(field => field.id === layout.groupBy)?.name ?? "New status property", true));
  }
  function queries(button: HTMLElement, title: "Filter" | "Sort", level = 1) {
    collect(); const panel = pop.panel(title, button, level, 350), content = document.createElement("div"); content.className = "database-popover-query";
    content.innerHTML = `<label ${title === "Sort" ? "hidden" : ""}><span data-i18n="Match">Match</span><select aria-label="Match" data-i18n-aria-label="Match"><option value="and" data-i18n="All conditions">All conditions</option><option value="or" data-i18n="Any condition">Any condition</option></select></label><div data-view-filters ${title === "Sort" ? "hidden" : ""}></div><button type="button" data-add-filter ${title === "Sort" ? "hidden" : ""} data-i18n="+ Add filter">+ Add filter</button><div data-view-sorts ${title === "Filter" ? "hidden" : ""}></div><button type="button" data-add-sort ${title === "Filter" ? "hidden" : ""} data-i18n="+ Add sort">+ Add sort</button>`;
    panel.append(content); wireQuerySettings(content, source, draft); queryPanel = content;
    const mode = content.querySelector<HTMLSelectElement>("[data-i18n-aria-label=Match]")!; mode.value = draft.filterMode ?? "and"; mode.onchange = () => { draft.filterMode = mode.value as "and" | "or"; pop.dirty = true; };
    for (const event of ["click", "input", "change"]) content.addEventListener(event, () => { collect(); pop.dirty = true; }); pop.footer(panel, "Done");
  }
  function visibility(button: HTMLElement) {
    collect(); const panel = pop.panel("Property visibility", button, 1);
    const title = source.properties.find(field => field.type === "title");
    let order = [...new Set([...(title ? [title.id] : []), ...(draft.propertyIds ?? source.properties.map(field => field.id))])].filter(id => source.properties.some(field => field.id === id));
    let query = "";
    const save = () => { draft.propertyIds = [...order]; pop.dirty = true; };
    panel.append(menuInput("Search for a property...", "", value => { query = value.toLocaleLowerCase(); drawProperties(); }));
    const content = document.createElement("div"); panel.append(content);
    function drawProperties() {
      content.replaceChildren();
      for (const shown of [true, false]) {
        const section = menuSection(content, shown ? "Shown in view" : "Hidden in view");
        section.append(menuButton(shown ? "Hide all" : "Show all", undefined, () => {
          order = shown ? (title ? [title.id] : []) : [...order, ...source.properties.filter(field => !order.includes(field.id)).map(field => field.id)]; save(); drawProperties();
        }));
        const fields = shown ? order.map(id => source.properties.find(field => field.id === id)!) : source.properties.filter(field => !order.includes(field.id));
        for (const field of fields.filter(field => field.name.toLocaleLowerCase().includes(query))) {
          const row = document.createElement("div"); row.className = "database-visibility-row"; row.dataset.propertyId = field.id;
          const toggle = menuButton(field.name, propertyMenuIcon(field), () => { order = shown ? order.filter(id => id !== field.id) : [...order, field.id]; save(); drawProperties(); }, "", false, "database-popover-row", false);
          toggle.setAttribute("role", "switch"); toggle.setAttribute("aria-checked", String(shown)); toggle.append(menuIcon(shown ? Eye : EyeOff)); toggle.disabled = field.type === "title"; row.append(toggle);
          if (shown && field.type !== "title") for (const direction of [-1, 1]) {
            const move = menuButton(direction < 0 ? "Move up" : "Move down", undefined, () => {
              const index = order.indexOf(field.id), target = index + direction;
              if (target < 0 || target >= order.length || order[target] === title?.id) return;
              [order[index], order[target]] = [order[target], order[index]]; save(); drawProperties();
            });
            move.textContent = direction < 0 ? "↑" : "↓";
            const index = order.indexOf(field.id); move.disabled = direction < 0 ? index === 0 || order[index - 1] === title?.id : index === order.length - 1;
            row.append(move);
          }
          section.append(row);
        }
      }
    }
    drawProperties();
    pop.footer(panel);
  }
  function grouping(button: HTMLElement) {
    collect(); const panel = pop.panel("Group", button, 1);
    panel.append(menuButton("Group by", Layers, child => choicePanel(child, "Group by", [["", "None"], ...source.properties.filter(groupable).map(field => [field.id, field.name] as [string, string])], layout.groupBy ?? "", value => { layout.groupBy = value; layout.groupOrder = []; layout.hiddenGroups = []; grouping(button); }), source.properties.find(field => field.id === layout.groupBy)?.name ?? "None", true));
    panel.append(menuToggle("Hide empty groups", layout.hideEmptyGroups ?? false, value => { layout.hideEmptyGroups = value; pop.dirty = true; }));
    const field = source.properties.find(field => field.id === layout.groupBy);
    if (field) {
      const groups = field.type === "checkbox" ? [{ id: "true", name: "Checked" }, { id: "false", name: "Unchecked" }] : [...field.options ?? []]; groups.push({ id: "", name: `No ${field.name}` });
      const order = layout.groupOrder ?? groups.map(group => group.id); groups.sort((a,b) => order.indexOf(a.id) - order.indexOf(b.id));
      const section = menuSection(panel, "Groups");
      for (const group of groups) { const row = document.createElement("div"); row.className = "database-option-editor-row"; row.dataset.groupId = group.id;
        row.append(menuToggle(group.name, !layout.hiddenGroups?.includes(group.id), visible => { const hidden = new Set(layout.hiddenGroups); visible ? hidden.delete(group.id) : hidden.add(group.id); layout.hiddenGroups = [...hidden]; pop.dirty = true; }, field.type === "checkbox"));
        for (const direction of [-1, 1]) { const move = menuButton(direction < 0 ? "↑" : "↓", undefined, () => { const sibling = direction < 0 ? row.previousElementSibling : row.nextElementSibling; if (sibling && sibling.hasAttribute("data-group-id")) { direction < 0 ? section.insertBefore(row, sibling) : section.insertBefore(sibling, row); layout.groupOrder = [...section.querySelectorAll<HTMLElement>("[data-group-id]")].map(el => el.dataset.groupId!); pop.dirty = true; } }); move.setAttribute("aria-label", `Move ${group.name} ${direction < 0 ? "up" : "down"}`); row.append(move); } section.append(row);
      }
    } pop.footer(panel);
  }
  function sourceMenu(button: HTMLElement, level: number) {
    collect(); const panel = pop.panel("Source", button, level);
    for (const item of hooks.sources) { const row = menuChoice(item.title, source.id === item.id, () => { if (!hooks.create) return; source = item; draft.dataSourceId = item.id; delete layout.groupBy; delete layout.datePropertyId; pop.dirty = true; draw(); }, Database, false); row.disabled = !hooks.create && source.id !== item.id; panel.append(row); }
    if (hooks.manageSources) menuSection(panel).append(menuButton("Manage data sources", Database, async button => { if (await pop.save()) hooks.manageSources!(pop, button, level + 1); }, "", true));
  }
  function draw() {
    collect(); const panel = pop.panel(hooks.create ? "New view" : "View settings");
    panel.append(menuInput("View name", draft.name, value => draft.name = value, viewIcons[draft.type]));
    if (hooks.create) { grid(panel, draw); layoutControls(panel, 0); if (!hooks.wiki) { const section = menuSection(panel); section.append(menuButton("Source", Database, button => sourceMenu(button, 1), source.title, true)); } }
    else {
      panel.append(menuButton("Layout", viewIcons[draft.type], button => { collect(); const render = () => { const child = pop.panel("Layout", button, 1); grid(child, render); layoutControls(child, 1); pop.footer(child); }; render(); }, viewLabel(draft.type), true));
      panel.append(menuButton("Property visibility", Eye, visibility, String(draft.propertyIds?.length ?? source.properties.length), true));
      panel.append(menuButton("Filter", ListFilter, button => queries(button, "Filter"), "", true), menuButton("Sort", ArrowDownUp, button => queries(button, "Sort"), "", true));
      if (draft.type !== "calendar") panel.append(menuButton("Group", Layers, grouping, "", true));
      panel.append(menuButton("Copy link to view", Link, async button => { try { const url = new URL(location.href); url.hash = routeHash({ kind: "database", id: draft.databaseId, viewId: draft.id }); await navigator.clipboard.writeText(url.href); setUIText(button.querySelector(".database-popover-label")!, "Link copied"); } catch { const p = pop.panel("Link to view", button, 1); const url = new URL(location.href); url.hash = routeHash({ kind: "database", id: draft.databaseId, viewId: draft.id }); const input = menuInput("View link", url.href, () => {}); (input.querySelector("input")!).readOnly = true; p.append(input); input.querySelector("input")!.select(); } }));
      const sourceSection = menuSection(panel, hooks.wiki ? "Page properties" : "Data source settings"); if (!hooks.wiki) sourceSection.append(menuButton("Source", Database, button => sourceMenu(button, 1), source.title, true));
      sourceSection.append(menuButton("Edit properties", List, button => { collect(); const child = pop.panel("Edit properties", button, 1); for (const field of source.properties) child.append(menuButton(field.name, propertyMenuIcon(field), async () => { if (await pop.save()) { const rect = button.getBoundingClientRect(); pop.destroy(); hooks.editProperty(field, anchor); } }, "", true, "database-popover-row", false)); child.append(menuButton("New property", Plus, async () => { if (await pop.save()) { pop.destroy(); hooks.addProperty(anchor); } })); }, "", true));
      if (hooks.manageSources) menuSection(panel).append(menuButton("Manage data sources", Database, async button => { if (await pop.save()) hooks.manageSources!(pop, button, 1); }, "", true));
    }
    pop.footer(panel, hooks.create ? "Done" : "Done");
    setUIAttribute(panel.querySelector(".database-popover-done")!, "aria-label", hooks.create ? "Create view" : "Save view");
    if (section) { const button = [...panel.querySelectorAll<HTMLButtonElement>("button")].find(button => button.getAttribute("data-i18n-aria-label") === section); button?.click(); }
  }
  draw(); return pop;
}

type PropertyHooks = { field: DatabaseProperty; view: DatabaseView; save(field: DatabaseProperty, view: DatabaseView): Promise<void>; insert(side: "left" | "right"): void; query(kind: "Filter" | "Sort" | "Group"): void };
export function openPropertyMenu(anchor: HTMLElement, hooks: PropertyHooks) {
  const pop = new DatabasePopover(anchor, "Property settings"), draft = structuredClone(hooks.field), view = structuredClone(hooks.view); view.layout ??= {};
  pop.commit = () => hooks.save(draft, view);
  const mark = () => pop.dirty = true;
  function optionPanel(button: HTMLElement, id: string) {
    const option = draft.options!.find(option => option.id === id)!;
    const panel = pop.panel("Option settings", button, 2);
    panel.append(menuInput("Option name", option.name, value => { option.name = value; updateTags(id); }, propertyMenuIcon(draft)));
    panel.append(menuButton("Delete option", Trash2, () => { draft.options = draft.options!.filter(item => item.id !== id); mark(); pop.trim(2); drawOptions(); }));
    const section = menuSection(panel, "Colors"); section.classList.add("database-popover-colors");
    for (const [color, background] of Object.entries(colors)) { const row = menuChoice(viewLabel(color), (option.color ?? "default") === color, () => { option.color = color; mark(); updateTags(id); optionPanel(button, id); }); const swatch = document.createElement("span"); swatch.className = "color-swatch"; swatch.style.background = background; row.prepend(swatch); section.append(row); }
    panel.querySelector("input")?.focus();
  }
  function updateTags(id: string) { const option = draft.options!.find(item => item.id === id); for (const panel of pop.panels) for (const tag of panel.querySelectorAll<HTMLElement>("[data-option-tag]")) if (tag.dataset.optionTag === id && option) {
    tag.textContent = option.name; tag.dataset.color = option.color ?? "default";
    const buttons = tag.closest(".database-option-editor-row")?.querySelectorAll("button");
    buttons?.[0]?.setAttribute("aria-label", option.name); buttons?.[1]?.setAttribute("aria-label", `Move ${option.name} up`); buttons?.[2]?.setAttribute("aria-label", `Move ${option.name} down`);
  } }
  let optionAnchor: HTMLElement;
  function drawOptions() {
    const panel = pop.panel("Edit property", optionAnchor, 1);
    panel.append(menuButton("Sort", ArrowDownUp, button => { const child = pop.panel("Option order", button, 2); for (const [label, direction] of [["Ascending", 1], ["Descending", -1]] as const) child.append(menuButton(label, undefined, () => { draft.options!.sort((a,b) => direction * a.name.localeCompare(b.name)); mark(); drawOptions(); })); }, "Manual", true));
    const section = menuSection(panel, "Options");
    section.append(menuButton("Add option", Plus, button => { const id = crypto.randomUUID(); draft.options ??= []; draft.options.push({ id, name: "New option", color: "default" }); mark(); drawOptions(); const row = pop.panels[1].querySelector<HTMLElement>(`[data-option-id="${id}"] button`)!; optionPanel(row, id); const input = pop.panels[2].querySelector("input")!; input.select(); }));
    for (const option of draft.options ?? []) {
      const row = document.createElement("div"); row.className = "database-option-editor-row"; row.dataset.optionId = option.id; row.draggable = true;
      const button = menuButton(option.name, GripVertical, button => optionPanel(button, option.id), "", true, "database-popover-row", false); const label = button.querySelector<HTMLElement>(".database-popover-label")!; label.textContent = ""; const tag = document.createElement("span"); tag.className = "database-tag"; tag.dataset.optionTag = option.id; tag.dataset.color = option.color ?? "default"; tag.textContent = option.name; label.append(tag); row.append(button);
      row.ondragstart = event => event.dataTransfer?.setData("application/x-notdown-option", option.id);
      row.ondragover = event => { if (event.dataTransfer?.types.includes("application/x-notdown-option")) event.preventDefault(); };
      row.ondrop = event => { event.preventDefault(); const id = event.dataTransfer?.getData("application/x-notdown-option"), moved = draft.options!.find(item => item.id === id); if (moved && moved.id !== option.id) { draft.options = draft.options!.filter(item => item !== moved); draft.options.splice(draft.options.findIndex(item => item.id === option.id), 0, moved); mark(); drawOptions(); } };
      for (const direction of [-1,1]) { const move = menuButton(direction < 0 ? "↑" : "↓", undefined, () => { const index = draft.options!.indexOf(option), target = index + direction; if (target >= 0 && target < draft.options!.length) { [draft.options![index], draft.options![target]] = [draft.options![target], draft.options![index]]; mark(); drawOptions(); } }); move.setAttribute("aria-label", `Move ${option.name} ${direction < 0 ? "up" : "down"}`); row.append(move); }
      section.append(row);
    } pop.footer(panel);
  }
  function draw() {
    const panel = pop.panel("Property settings"); panel.append(menuInput("Property name", draft.name, value => draft.name = value, propertyMenuIcon(draft)));
    if (["select", "multi_select", "status"].includes(draft.type)) panel.append(menuButton("Edit property", SlidersHorizontal, button => { optionAnchor = button; drawOptions(); }, "", true));
    if (draft.type !== "title") panel.append(menuButton("Change type", ArrowDownUp, button => { const child = pop.panel("Change type", button, 1); for (const [type, label] of Object.entries(labels)) if (type !== "title") child.append(menuChoice(label!, draft.type === type, () => { draft.type = type as DatabasePropertyType; if (["select", "multi_select", "status"].includes(type)) draft.options ??= []; mark(); draw(); }, propertyIcons[type as DatabasePropertyType])); const hint = document.createElement("p"); hint.className = "database-popover-help"; setUIText(hint, "Populated properties keep their current type. Empty properties can change type."); child.append(hint); }, "", true));
    const section = menuSection(panel);
    for (const [label, icon] of [["Filter", ListFilter], ["Sort", ArrowDownUp], ["Group", Layers]] as const) if (label !== "Group" || groupable(draft)) section.append(menuButton(label, icon, async () => { if (await pop.save()) { pop.destroy(); hooks.query(label); } }, "", true));
    section.append(menuButton(view.layout!.frozenPropertyId === draft.id ? "Unfreeze" : "Freeze", ArrowLeftToLine, () => { view.layout!.frozenPropertyId = view.layout!.frozenPropertyId === draft.id ? "" : draft.id; mark(); draw(); }));
    if (draft.type !== "title") section.append(menuButton("Hide", Eye, () => { view.propertyIds = (view.propertyIds ?? []).filter(id => id !== draft.id); mark(); void pop.close(); }));
    section.append(menuToggle("Wrap content", view.layout!.wrapPropertyIds?.includes(draft.id) ?? false, enabled => { const ids = new Set(view.layout!.wrapPropertyIds); enabled ? ids.add(draft.id) : ids.delete(draft.id); view.layout!.wrapPropertyIds = [...ids]; mark(); }));
    const insert = menuSection(panel);
    for (const side of ["left", "right"] as const) insert.append(menuButton(`Insert ${side}`, Plus, async () => { if (await pop.save()) { pop.destroy(); hooks.insert(side); } }));
    pop.footer(panel); setUIAttribute(panel.querySelector<HTMLButtonElement>(".database-popover-done")!, "aria-label", "Save property");
  }
  draw(); return pop;
}
