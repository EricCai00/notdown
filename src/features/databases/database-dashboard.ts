import {
  createElement,
  Plus,
  Pencil,
  Check,
  X,
  GripVertical,
  Ellipsis,
  ChevronDown,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  SlidersHorizontal,
  ListFilter,
  ArrowUpRight,
  Maximize2,
} from "lucide";
import type { IconNode } from "lucide";
import { api, type Page } from "../../shared/types";
import { t } from "../../shared/i18n";
import { routeHash } from "../pages/page-navigation";
import type {
  Database,
  DatabaseDataSource,
  DatabaseLayout,
  DatabaseSnapshot,
  DatabaseView,
  DashboardRow,
  DashboardWidget,
  DashboardViewSettings,
} from "./database-model";
import { databaseViewTypes } from "./database-model";
import {
  dashboardRows,
  dashboardWidgetView,
  moveDashboardWidget,
  widgetCount,
} from "./database-dashboard-model";
import { databaseViewIcon } from "./database-view-icon";
import { DatabasePopover, menuButton } from "./database-popover";
import { openViewMenu } from "./database-menus";
import {
  databaseGroups,
  fieldValue,
  queryDatabase,
  valueText,
} from "./database-query";
import {
  disposeDatabaseLayout,
  renderDatabaseLayout,
  type LayoutActions,
} from "./database-layouts";
import "./database-dashboard.css";
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
function button(
  label: string,
  icon: IconNode,
  action: () => void,
  text = false,
) {
  const node = el("button", text ? "dashboard-button" : "dashboard-icon");
  node.type = "button";
  node.title = t(label);
  node.setAttribute("aria-label", t(label));
  node.append(createElement(icon, { width: 16, height: 16 }));
  if (text) node.append(document.createTextNode(t(label)));
  node.onclick = action;
  return node;
}
function settingsOf(view: DatabaseView): DashboardViewSettings {
  return structuredClone({
    name: view.name,
    type: view.type,
    icon: view.icon,
    propertyIds: view.propertyIds,
    filters: view.filters,
    filterMode: view.filterMode,
    sorts: view.sorts,
    layout: view.layout,
  });
}
const widgetTypes = databaseViewTypes.filter(
  (type) => !["dashboard", "form"].includes(type),
);
export function renderDashboard(
  host: HTMLElement,
  source: DatabaseDataSource,
  _rows: Page[],
  view: DatabaseView,
  actions: LayoutActions,
): () => void {
  const bridge = actions.dashboard;
  if (!bridge) {
    host.textContent = t("Dashboard is unavailable.");
    return () => {};
  }
  const key = `notdown-dashboard:${bridge.vaultKey}:${view.id}`;
  let savedView = structuredClone(view),
    layout = structuredClone(view.layout ?? {}),
    baseRevision = view.revision;
  let editing = !layout.dashboardRows && !layout.dashboardViewIds,
    busy = false,
    dead = false,
    generation = 0;
  let toolbarTools: HTMLElement | undefined;
  const mainToolbar = host
    .closest(".database-workspace")
    ?.querySelector<HTMLElement>(".database-toolbar-actions");
  let popup: DatabasePopover | undefined,
    mounts: HTMLElement[] = [],
    search = "",
    fullscreen = false;
  const local = new Map<string, Partial<DashboardViewSettings>>(),
    calendarAnchors = new Map<string, string>();
  let temporaryFilters: DatabaseLayout["dashboardFilters"];
  const snapshots = new Map<string, DatabaseSnapshot>([
      [view.databaseId, bridge.snapshot],
    ]),
    pending = new Map<string, Promise<DatabaseSnapshot>>(),
    errors = new Map<string, string>();
  let dragId: string | undefined;
  layout.dashboardRows = dashboardRows(view, bridge.snapshot.views);
  try {
    const draft = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (
      Array.isArray(draft?.layout?.dashboardRows) &&
      typeof draft.baseRevision === "string"
    ) {
      layout = draft.layout;
      baseRevision = draft.baseRevision;
      editing = true;
    }
  } catch {}
  try {
    const temporary = JSON.parse(
      sessionStorage.getItem(key + ":temporary") ?? "null",
    );
    if (temporary) {
      for (const [id, settings] of temporary.widgets ?? [])
        local.set(id, settings);
      temporaryFilters = temporary.filters;
      search = temporary.search ?? "";
    }
  } catch {}
  const rememberLocal = () => {
    try {
      sessionStorage.setItem(
        key + ":temporary",
        JSON.stringify({
          widgets: [...local],
          filters: temporaryFilters,
          search,
        }),
      );
    } catch {}
  };
  const remember = () => {
    try {
      sessionStorage.setItem(key, JSON.stringify({ baseRevision, layout }));
    } catch {}
  };
  const closePopup = () => {
    popup?.destroy();
    popup = undefined;
  };
  const clearMounts = () => {
    mounts.forEach(disposeDatabaseLayout);
    mounts = [];
  };
  const message = (error: unknown) => {
    const target = host.querySelector<HTMLElement>(".dashboard-status");
    if (target) {
      target.textContent =
        error instanceof Error ? error.message : String(error);
      target.setAttribute("role", "alert");
    }
  };
  const changed = () => {
    remember();
    void draw();
  };
  async function getSnapshot(id: string) {
    if (snapshots.has(id)) return snapshots.get(id)!;
    if (!pending.has(id))
      pending.set(
        id,
        api<DatabaseSnapshot>(`/databases/${encodeURIComponent(id)}`)
          .then((snapshot) => {
            snapshots.set(id, snapshot);
            return snapshot;
          })
          .finally(() => pending.delete(id)),
      );
    return pending.get(id)!;
  }
  async function save() {
    if (busy || (popup && !(await popup.save()))) return;
    closePopup();
    busy = true;
    void draw();
    try {
      if (!(await bridge!.prepare()))
        throw new Error(t("Save pending changes first"));
      const { dashboardViewIds: _legacy, ...payload } = layout;
      const result = await bridge!.save(payload, baseRevision);
      if (dead) return;
      savedView = structuredClone(result);
      baseRevision = result.revision;
      layout = structuredClone(result.layout ?? {});
      editing = false;
      try {
        sessionStorage.removeItem(key);
      } catch {}
      busy = false;
      await draw();
    } catch (error) {
      busy = false;
      remember();
      await draw();
      message(error);
    }
  }
  async function enterEdit() {
    if (!(await bridge!.prepare()) || dead) return;
    editing = true;
    for (const row of layout.dashboardRows!)
      for (const widget of row.widgets)
        if (local.has(widget.id)) widget.settings = local.get(widget.id);
    local.clear();
    if (temporaryFilters) {
      layout.dashboardFilters = temporaryFilters;
      temporaryFilters = undefined;
    }
    rememberLocal();
    changed();
  }
  function cancel() {
    closePopup();
    layout = {
      ...structuredClone(savedView.layout),
      dashboardRows: dashboardRows(savedView, bridge!.snapshot.views),
    };
    baseRevision = savedView.revision;
    editing = false;
    try {
      sessionStorage.removeItem(key);
    } catch {}
    void draw();
  }
  function configure(
    anchor: HTMLElement,
    widget: DashboardWidget,
    current: DatabaseView,
    ds: DatabaseDataSource,
    section?: "Filter" | "Sort" | "Layout",
  ) {
    closePopup();
    popup = openViewMenu(
      anchor,
      {
        sources: [ds],
        view: current,
        allowedTypes: widgetTypes,
        save: async (draft) => {
          if (editing) {
            widget.settings = settingsOf(draft);
            remember();
          } else {
            local.set(widget.id, settingsOf(draft));
            rememberLocal();
          }
          await draw();
        },
        editProperty: () =>
          message(t("Edit property definitions in the source database.")),
        addProperty: () =>
          message(t("Edit property definitions in the source database.")),
      },
      section,
    );
  }
  function widgetMenu(
    anchor: HTMLElement,
    widget: DashboardWidget,
    row: DashboardRow,
    effective?: DatabaseView,
    ds?: DatabaseDataSource,
  ) {
    closePopup();
    popup = new DatabasePopover(anchor, "Widget options");
    popup.saveOnDismiss = false;
    const panel = popup.panel("Widget options", anchor, 0, 250, false);
    if (effective && ds)
      panel.append(
        menuButton("Configure widget", SlidersHorizontal, () =>
          configure(anchor, widget, effective, ds),
        ),
      );
    if (effective)
      panel.append(
        menuButton("Open source view", ArrowUpRight, () => {
          closePopup();
          if (widget.databaseId === view.databaseId)
            actions.openView?.(widget.viewId);
          else location.hash = routeHash({ kind: "database", id: widget.databaseId, viewId: widget.viewId });
        }),
      );
    if (!editing) return;
    panel.append(
      menuButton("Replace widget", SlidersHorizontal, () => {
        void addWidget(anchor, row.id, widget.id);
      }),
    );
    const duplicate = menuButton("Duplicate widget", Copy, () => {
      if (widgetCount(layout.dashboardRows!) >= 12) return;
      const copy = { ...structuredClone(widget), id: crypto.randomUUID() };
      if (row.widgets.length < 4)
        row.widgets.splice(row.widgets.indexOf(widget) + 1, 0, copy);
      else
        layout.dashboardRows!.splice(
          layout.dashboardRows!.indexOf(row) + 1,
          0,
          { id: crypto.randomUUID(), height: row.height, widgets: [copy] },
        );
      closePopup();
      changed();
    });
    duplicate.disabled = widgetCount(layout.dashboardRows!) >= 12;
    panel.append(duplicate);
    const index = row.widgets.indexOf(widget),
      rowIndex = layout.dashboardRows!.indexOf(row);
    for (const [label, icon, destination, at] of [
      ["Move left", ArrowLeft, row, index - 1],
      ["Move right", ArrowRight, row, index + 2],
      ["Move to previous row", ArrowUp, layout.dashboardRows![rowIndex - 1], 4],
      ["Move to next row", ArrowDown, layout.dashboardRows![rowIndex + 1], 4],
    ] as const) {
      const move = menuButton(label, icon, () => {
        layout.dashboardRows = moveDashboardWidget(
          layout.dashboardRows!,
          widget.id,
          destination!.id,
          at,
        );
        closePopup();
        changed();
      });
      move.disabled =
        !destination ||
        (destination !== row && destination.widgets.length >= 4) ||
        (label === "Move left" && index === 0) ||
        (label === "Move right" && index === row.widgets.length - 1);
      panel.append(move);
    }
    panel.append(
      menuButton("Move to new row", ArrowDown, () => {
        const target = {
          id: crypto.randomUUID(),
          height: row.height,
          widgets: [] as DashboardWidget[],
        };
        layout.dashboardRows!.push(target);
        layout.dashboardRows = moveDashboardWidget(
          layout.dashboardRows!,
          widget.id,
          target.id,
          0,
        );
        closePopup();
        changed();
      }),
    );
    panel.append(
      menuButton("Remove widget", Trash2, () => {
        row.widgets = row.widgets.filter((item) => item.id !== widget.id);
        layout.dashboardRows = layout.dashboardRows!.filter(
          (item) => item.widgets.length,
        );
        closePopup();
        changed();
      }),
    );
  }
  async function addWidget(
    anchor: HTMLElement,
    rowId?: string,
    replaceId?: string,
  ) {
    if (!replaceId && widgetCount(layout.dashboardRows!) >= 12) return;
    closePopup();
    const pop = new DatabasePopover(anchor, "Add widget");
    popup = pop;
    pop.saveOnDismiss = false;
    const panel = pop.panel("Add widget", anchor, 0, 340, false);
    const input = el("input", "dashboard-picker-search");
    input.type = "search";
    input.placeholder = t("Search databases");
    input.setAttribute("aria-label", t("Search databases"));
    panel.append(input);
    const list = el("div", "dashboard-picker-list", t("Loading…"));
    panel.append(list);
    function choose(
      base: DatabaseView,
      snapshot: DatabaseSnapshot,
      type?: DatabaseView["type"],
    ) {
      const row = layout.dashboardRows!.find((row) => row.id === rowId),
        widget: DashboardWidget = {
          id: replaceId ?? crypto.randomUUID(),
          databaseId: snapshot.database.id,
          viewId: base.id,
          width: 1,
        };
      if (type) {
        const ds = snapshot.dataSources.find(
          (ds) => ds.id === base.dataSourceId,
        )!;
        widget.settings = {
          name: t(type.charAt(0).toUpperCase() + type.slice(1)),
          type,
          filters: [],
          sorts: [],
          propertyIds: ds.properties.map((p) => p.id),
          layout: {
            ...(type === "chart" ? { chartType: "number" as const } : {}),
            ...(type === "board"
              ? {
                  groupBy: ds.properties.find((p) =>
                    ["select", "status", "checkbox"].includes(p.type),
                  )?.id,
                }
              : {}),
            ...(["calendar", "timeline"].includes(type)
              ? {
                  datePropertyId: ds.properties.find((p) => p.type === "date")
                    ?.id,
                }
              : {}),
          },
        };
      }
      if (replaceId && row) {
        const index = row.widgets.findIndex((item) => item.id === replaceId);
        widget.width = row.widgets[index].width;
        row.widgets[index] = widget;
      } else if (row && row.widgets.length < 4) row.widgets.push(widget);
      else
        layout.dashboardRows!.push({
          id: crypto.randomUUID(),
          height: type === "chart" ? 240 : 360,
          widgets: [widget],
        });
      closePopup();
      changed();
    }
    async function showViews(database: Database) {
      list.textContent = t("Loading…");
      try {
        const snapshot = await getSnapshot(database.id);
        if (!panel.isConnected) return;
        list.replaceChildren();
        list.append(
          el("p", "dashboard-picker-caption", snapshot.database.title),
        );
        const views = snapshot.views.filter((item) =>
          widgetTypes.includes(item.type),
        );
        for (const item of views)
          list.append(
            menuButton(
              item.name,
              databaseViewIcon(item),
              () => choose(item, snapshot),
              "",
              false,
              "database-popover-row",
              false,
            ),
          );
        if (views.length) {
          list.append(
            el(
              "p",
              "dashboard-picker-caption",
              t("New view for this dashboard"),
            ),
          );
          for (const ds of snapshot.dataSources.filter(
            (ds) => !ds.trashed && !ds.unavailable,
          )) {
            const base = views.find((item) => item.dataSourceId === ds.id);
            if (!base) continue;
            if (snapshot.dataSources.length > 1)
              list.append(el("p", "dashboard-picker-caption", ds.title));
            for (const type of [
              "chart",
              "table",
              "list",
              "board",
              "calendar",
              "timeline",
            ] as const)
              list.append(
                menuButton(
                  type.charAt(0).toUpperCase() + type.slice(1),
                  databaseViewIcon({ ...base, type }),
                  () => choose(base, snapshot, type),
                ),
              );
          }
        }
      } catch (error) {
        list.textContent = String(error);
      }
    }
    try {
      const databases = await api<Database[]>("/databases");
      if (!panel.isConnected) return;
      const drawList = () => {
        list.replaceChildren();
        for (const database of databases.filter((item) =>
          item.title
            .toLocaleLowerCase()
            .includes(input.value.toLocaleLowerCase()),
        ))
          list.append(
            menuButton(
              database.title,
              undefined,
              () => {
                void showViews(database);
              },
              "",
              true,
              "database-popover-row",
              false,
            ),
          );
      };
      input.oninput = drawList;
      drawList();
      input.focus();
    } catch (error) {
      list.textContent = String(error);
    }
  }
  function globalFilters(anchor: HTMLElement) {
    closePopup();
    popup = new DatabasePopover(anchor, "Global filters");
    popup.saveOnDismiss = false;
    const panel = popup.panel("Global filters", anchor, 0, 300, false),
      sources = new Map<string, DatabaseDataSource>();
    for (const row of layout.dashboardRows!)
      for (const widget of row.widgets) {
        const snapshot = snapshots.get(widget.databaseId),
          base = snapshot?.views.find((item) => item.id === widget.viewId),
          ds = snapshot?.dataSources.find(
            (item) => item.id === base?.dataSourceId,
          );
        if (ds) sources.set(ds.id, ds);
      }
    for (const ds of sources.values())
      panel.append(
        menuButton(
          ds.title,
          ListFilter,
          () => {
            const filter = (
                temporaryFilters ??
                layout.dashboardFilters ??
                []
              ).find((item) => item.sourceId === ds.id),
              fake: DatabaseView = {
                ...view,
                dataSourceId: ds.id,
                type: "table",
                filters: filter?.filters ?? [],
                filterMode: filter?.filterMode,
                layout: {},
                propertyIds: undefined,
                sorts: [],
              };
            closePopup();
            popup = openViewMenu(
              anchor,
              {
                sources: [ds],
                view: fake,
                allowedTypes: ["table"],
                save: async (draft) => {
                  const filters = (
                    temporaryFilters ??
                    layout.dashboardFilters ??
                    []
                  ).filter((item) => item.sourceId !== ds.id);
                  filters.push({
                    sourceId: ds.id,
                    filters: draft.filters ?? [],
                    filterMode: draft.filterMode,
                  });
                  if (editing) {
                    layout.dashboardFilters = filters;
                    remember();
                  } else {
                    temporaryFilters = filters;
                    rememberLocal();
                  }
                  await draw();
                },
                editProperty: () => {},
                addProperty: () => {},
              },
              "Filter",
            );
          },
          "",
          true,
          "database-popover-row",
          false,
        ),
      );
  }
  function dragTarget(target: HTMLElement, row: DashboardRow, index: number) {
    target.ondragover = (event) => {
      if (!editing || !dragId) return;
      event.preventDefault();
      event.stopPropagation();
      target.classList.add("is-drop-target");
    };
    target.ondragleave = () => target.classList.remove("is-drop-target");
    target.ondrop = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!dragId) return;
      layout.dashboardRows = moveDashboardWidget(
        layout.dashboardRows!,
        dragId,
        row.id,
        index,
      );
      dragId = undefined;
      changed();
    };
  }
  function resizeHandle(
    row: DashboardRow,
    wrapper: HTMLElement,
    index?: number,
  ) {
    const horizontal = index !== undefined,
      handle = el(
        "div",
        horizontal ? "dashboard-column-resize" : "dashboard-row-resize",
      );
    handle.tabIndex = 0;
    handle.setAttribute("role", "separator");
    handle.setAttribute(
      "aria-orientation",
      horizontal ? "vertical" : "horizontal",
    );
    handle.setAttribute(
      "aria-label",
      t(horizontal ? "Resize widget widths" : "Resize row height"),
    );
    const update = (delta: number) => {
      if (horizontal) {
        const a = row.widgets[index!],
          b = row.widgets[index! + 1],
          total = a.width + b.width;
        a.width = Math.max(
          total * 0.15,
          Math.min(total * 0.85, a.width + delta),
        );
        b.width = total - a.width;
        wrapper.style.gridTemplateColumns = row.widgets
          .map((widget) => `${widget.width}fr`)
          .join(" ");
      } else {
        row.height = Math.max(
          180,
          Math.min(900, Math.round(row.height + delta)),
        );
        wrapper.style.setProperty("--dashboard-row-height", `${row.height}px`);
      }
      handle.setAttribute(
        "aria-valuenow",
        String(
          horizontal ? Math.round(row.widgets[index!].width * 100) : row.height,
        ),
      );
    };
    handle.onkeydown = (event) => {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      update(
        (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) *
          (horizontal ? 0.1 : 20),
      );
      remember();
    };
    handle.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      let coordinate = horizontal ? event.clientX : event.clientY;
      const move = (next: PointerEvent) => {
        const value = horizontal ? next.clientX : next.clientY,
          delta = value - coordinate;
        coordinate = value;
        update(
          horizontal
            ? (delta / Math.max(1, wrapper.clientWidth)) *
                row.widgets.reduce((sum, item) => sum + item.width, 0)
            : delta,
        );
      };
      const finish = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", finish);
        handle.removeEventListener("pointercancel", finish);
        remember();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    };
    return handle;
  }
  function renderWidget(
    row: DashboardRow,
    widget: DashboardWidget,
    wrapper: HTMLElement,
  ) {
    const section = el("section", "database-dashboard-widget");
    section.dataset.widgetId = widget.id;
    section.style.gridColumn = String(row.widgets.indexOf(widget) + 1);
    const snapshot = snapshots.get(widget.databaseId),
      base = snapshot?.views.find((item) => item.id === widget.viewId),
      ds = snapshot?.dataSources.find((item) => item.id === base?.dataSourceId);
    const configured = base ? dashboardWidgetView(base, widget) : undefined,
      effective = configured
        ? { ...configured, ...local.get(widget.id) }
        : undefined;
    const header = el("header", "dashboard-widget-header"),
      title = el("button", "dashboard-widget-title");
    title.type = "button";
    if (effective)
      title.append(
        createElement(databaseViewIcon(effective), { width: 15, height: 15 }),
        document.createTextNode(effective.name),
        createElement(ChevronDown, { width: 12, height: 12 }),
      );
    else title.textContent = t("View unavailable");
    title.onclick = () => widgetMenu(title, widget, row, effective, ds);
    section.oncontextmenu = (event) => {
      event.preventDefault();
      widgetMenu(title, widget, row, effective, ds);
    };
    if (editing) {
      const grip = button("Drag widget", GripVertical, () =>
        widgetMenu(title, widget, row, effective, ds),
      );
      grip.draggable = true;
      grip.ondragstart = (event) => {
        dragId = widget.id;
        event.dataTransfer?.setData("application/x-notdown-widget", widget.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      };
      grip.ondragend = () => {
        dragId = undefined;
        host
          .querySelectorAll(".is-drop-target")
          .forEach((node) => node.classList.remove("is-drop-target"));
      };
      header.append(grip);
    }
    header.append(title);
    const tools = el("div", "dashboard-widget-tools");
    if (effective && ds)
      tools.append(
        button("Filter widget", ListFilter, () =>
          configure(title, widget, effective, ds, "Filter"),
        ),
        button("Configure widget", SlidersHorizontal, () =>
          configure(title, widget, effective, ds),
        ),
      );
    tools.append(
      button("Widget options", Ellipsis, () =>
        widgetMenu(title, widget, row, effective, ds),
      ),
    );
    header.append(tools);
    section.append(header);
    const card = el("div", "dashboard-widget-card"),
      mount = el("div", "dashboard-widget-content");
    card.append(mount);
    section.append(card);
    wrapper.append(section);
    mounts.push(mount);
    if (editing) dragTarget(section, row, row.widgets.indexOf(widget));
    if (
      !effective ||
      !ds ||
      !snapshot ||
      !widgetTypes.includes(effective.type) ||
      ds.unavailable ||
      ds.trashed
    ) {
      mount.append(
        el(
          "p",
          "dashboard-empty",
          errors.get(widget.databaseId) ??
            t(
              "This view is unavailable. Replace or remove the widget in Edit mode.",
            ),
        ),
      );
      return;
    }
    let records = queryDatabase(snapshot.pages, ds, effective, search);
    if (ds.id === source.id)
      records = queryDatabase(records, ds, {
        ...view,
        sorts: [],
        rowOrder: undefined,
      });
    const filter = (temporaryFilters ?? layout.dashboardFilters ?? []).find(
      (item) => item.sourceId === ds.id,
    );
    if (filter)
      records = queryDatabase(records, ds, {
        ...effective,
        filters: filter.filters,
        filterMode: filter.filterMode,
        sorts: [],
        rowOrder: undefined,
      });
    const fields = effective.propertyIds
      ? effective.propertyIds
          .map((id) => ds.properties.find((field) => field.id === id)!)
          .filter(Boolean)
      : ds.properties;
    const scoped: LayoutActions = {
      ...actions,
      dashboard: undefined,
      views: () => snapshot.views,
      pages: () => snapshot.pages,
      configure: async (patch) => {
        if (editing) {
          widget.settings = {
            ...settingsOf(effective),
            layout: { ...effective.layout, ...patch },
          };
          remember();
        } else {
          local.set(widget.id, {
            ...settingsOf(effective),
            layout: { ...effective.layout, ...patch },
          });
          rememberLocal();
        }
        await draw();
      },
      settings: () => configure(title, widget, effective, ds, "Layout"),
      add: () => actions.openView?.(widget.viewId),
      writable: () => false,
      move: () => {},
      titleEditor: undefined,
      dependencies: undefined,
      dependencySettings: undefined,
      calendar: undefined,
      reference: undefined,
      createSuccessor: undefined,
      groupMenu: () => configure(title, widget, effective, ds),
      collapseGroup: (group) => {
        const collapsed = effective.layout?.collapsedGroups ?? [];
        void scoped.configure!({
          collapsedGroups: collapsed.includes(group)
            ? collapsed.filter((id) => id !== group)
            : [...collapsed, group],
        });
      },
      month: calendarAnchors.get(widget.id) ?? actions.month,
      navigate: (day) => {
        calendarAnchors.set(widget.id, day);
        void draw();
      },
    };
    if (effective.type === "table") {
      const table = el("table", "dashboard-record-table"),
        thead = el("thead"),
        heading = el("tr");
      fields.forEach((field) => heading.append(el("th", "", field.name)));
      thead.append(heading);
      table.append(thead);
      const body = el("tbody"),
        limit = effective.layout?.loadLimit || 50;
      const groupField = ds.properties.find(
        (field) => field.id === effective.layout?.groupBy,
      );
      const groups = groupField
        ? databaseGroups(records, groupField, effective)
        : [{ key: "", name: "", pages: records }];
      let shown = 0;
      for (const group of groups) {
        if (groupField) {
          const tr = el("tr"),
            cell = el("td");
          cell.colSpan = Math.max(1, fields.length);
          const toggle = el(
            "button",
            "dashboard-record-title",
            group.name + " · " + group.pages.length,
          );
          toggle.type = "button";
          const collapsed =
            effective.layout?.collapsedGroups?.includes(group.key) ?? false;
          toggle.setAttribute("aria-expanded", String(!collapsed));
          toggle.onclick = () => scoped.collapseGroup(group.key);
          cell.append(toggle);
          tr.append(cell);
          body.append(tr);
          if (collapsed) continue;
        }
        for (const page of group.pages.slice(0, Math.max(0, limit - shown))) {
          shown++;
          const tr = el("tr");
          for (const field of fields) {
            const cell = el("td");
            if (field.type === "title") {
              const open = el("button", "dashboard-record-title", page.title);
              open.type = "button";
              open.onclick = () => actions.open(page);
              cell.append(open);
            } else {
              const value = fieldValue(page, field);
              if (["select", "status", "multi_select"].includes(field.type)) {
                for (const id of Array.isArray(value) ? value : [value]) {
                  if (id == null) continue;
                  const option = field.options?.find(
                      (option) => option.id === id,
                    ),
                    tag = el(
                      "span",
                      "database-tag",
                      option?.name ?? String(id),
                    );
                  tag.dataset.color = option?.color ?? "gray";
                  cell.append(tag);
                }
              } else
                cell.textContent =
                  field.type === "checkbox"
                    ? value
                      ? "☑"
                      : "☐"
                    : valueText(field, value);
            }
            tr.append(cell);
          }
          body.append(tr);
        }
      }
      table.append(body);
      mount.append(table);
      if (records.length > limit)
        mount.append(
          el(
            "p",
            "dashboard-picker-caption",
            t("Showing {shown} of {total} records", {
              shown: limit,
              total: records.length,
            }),
          ),
        );
      if (!records.length)
        mount.append(
          el("p", "dashboard-empty", t("No pages match this view.")),
        );
    } else
      renderDatabaseLayout(
        mount,
        ds,
        effective.type === "chart"
          ? records
          : records.slice(0, effective.layout?.loadLimit || 100),
        fields,
        effective,
        scoped,
      );
    card.dataset.type = effective.type;
  }
  async function draw() {
    if (dead) return;
    const token = ++generation;
    clearMounts();
    toolbarTools?.remove();
    host.replaceChildren();
    host.classList.toggle("is-editing", editing);
    host.classList.toggle("is-fullscreen", fullscreen);
    host.setAttribute("aria-busy", String(busy));
    host.inert = busy;
    const toolbar = el("div", "dashboard-toolbar"),
      status = el(
        "span",
        "dashboard-status",
        editing
          ? t("Drag widgets or resize the dividers. Save when finished.")
          : "",
      );
    status.setAttribute("role", "status");
    toolbar.append(status);
    const tools = el("div", "dashboard-toolbar-tools");
    const searchBox = el("input", "dashboard-search");
    searchBox.type = "search";
    searchBox.placeholder = t("Search all widgets");
    searchBox.setAttribute("aria-label", t("Search all widgets"));
    searchBox.value = search;
    searchBox.onchange = () => {
      search = searchBox.value;
      rememberLocal();
      void draw();
    };
    tools.append(searchBox);
    const filters = button("Global filters", ListFilter, () =>
      globalFilters(filters),
    );
    tools.append(
      filters,
      button("Full screen", Maximize2, () => {
        fullscreen = !fullscreen;
        void draw();
      }),
    );
    if (editing) {
      const add = button(
        "Add widget",
        Plus,
        () => {
          void addWidget(add);
        },
        true,
      );
      add.disabled = widgetCount(layout.dashboardRows!) >= 12;
      tools.append(
        add,
        button("Cancel editing", X, cancel),
        button(
          "Save layout",
          Check,
          () => {
            void save();
          },
          true,
        ),
      );
    } else {
      if (local.size || temporaryFilters)
        tools.append(
          button(
            "Save widget settings",
            Check,
            () => {
              void enterEdit().then(() => save());
            },
            true,
          ),
          button("Reset temporary filters", X, () => {
            local.clear();
            temporaryFilters = undefined;
            rememberLocal();
            void draw();
          }),
        );
      tools.append(
        button(
          "Edit dashboard",
          Pencil,
          () => {
            void enterEdit();
          },
          true,
        ),
      );
    }
    toolbarTools = tools;
    if (mainToolbar && !fullscreen) {
      mainToolbar.classList.add("dashboard-toolbar-host");
      mainToolbar.append(tools);
    } else toolbar.append(tools);
    host.append(toolbar);
    if (busy)
      tools
        .querySelectorAll<HTMLInputElement | HTMLButtonElement>("button,input")
        .forEach((control) => (control.disabled = true));
    const grid = el("div", "database-dashboard-grid");
    host.append(grid);
    const ids = [
      ...new Set(
        layout.dashboardRows!.flatMap((row) =>
          row.widgets.map((widget) => widget.databaseId),
        ),
      ),
    ];
    await Promise.all(
      ids.map(async (id) => {
        try {
          await getSnapshot(id);
        } catch (error) {
          errors.set(
            id,
            error instanceof Error ? error.message : String(error),
          );
        }
      }),
    );
    if (dead || token !== generation) return;
    for (const row of layout.dashboardRows!) {
      const rowHost = el("div", "dashboard-row");
      rowHost.dataset.rowId = row.id;
      rowHost.style.gridTemplateColumns = row.widgets
        .map((widget) => `${widget.width}fr`)
        .join(" ");
      rowHost.style.setProperty("--dashboard-row-height", `${row.height}px`);
      grid.append(rowHost);
      row.widgets.forEach((widget, index) => {
        renderWidget(row, widget, rowHost);
        if (editing && index < row.widgets.length - 1) {
          const handle = resizeHandle(row, rowHost, index);
          handle.style.gridColumn = String(index + 1);
          handle.style.gridRow = "1";
          rowHost.append(handle);
        }
      });
      if (editing) {
        rowHost.append(resizeHandle(row, rowHost));
        if (row.widgets.length < 4) {
          const add = button("Add widget to row", Plus, () => {
            void addWidget(add, row.id);
          });
          add.classList.add("dashboard-row-add");
          add.disabled = widgetCount(layout.dashboardRows!) >= 12;
          rowHost.append(add);
          dragTarget(rowHost, row, row.widgets.length);
        }
      }
    }
    if (!layout.dashboardRows!.length) {
      const empty = el("div", "dashboard-empty-state");
      empty.append(
        createElement(SlidersHorizontal, { width: 32, height: 32 }),
        el("h3", "", t("Build your dashboard")),
        el(
          "p",
          "",
          t(
            "Bring charts, tables and other views together. Add a widget to get started.",
          ),
        ),
      );
      grid.append(empty);
    }
    if (editing) {
      const add = button(
        "Add a new row",
        Plus,
        () => {
          void addWidget(add);
        },
        true,
      );
      add.classList.add("dashboard-add-row");
      add.disabled = widgetCount(layout.dashboardRows!) >= 12;
      add.ondragover = (event) => {
        if (dragId) event.preventDefault();
      };
      add.ondrop = (event) => {
        event.preventDefault();
        if (!dragId) return;
        const row = {
          id: crypto.randomUUID(),
          height: 360,
          widgets: [] as DashboardWidget[],
        };
        layout.dashboardRows!.push(row);
        layout.dashboardRows = moveDashboardWidget(
          layout.dashboardRows!,
          dragId,
          row.id,
          0,
        );
        dragId = undefined;
        changed();
      };
      grid.append(add);
    }
  }
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape" && fullscreen) {
      fullscreen = false;
      void draw();
    }
  };
  document.addEventListener("keydown", escape);
  void draw();
  return () => {
    dead = true;
    generation++;
    document.removeEventListener("keydown", escape);
    closePopup();
    clearMounts();
    toolbarTools?.remove();
    mainToolbar?.classList.remove("dashboard-toolbar-host");
    host.classList.remove("is-fullscreen", "is-editing");
    host.inert = false;
  };
}
