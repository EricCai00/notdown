import type {
  DatabaseView,
  DashboardRow,
  DashboardWidget,
} from "./database-model";
export const dashboardWidgetLimit = 12;
export const dashboardRowLimit = 4;
/** Legacy references are projected in memory; opening a dashboard never migrates its file. */
export function dashboardRows(
  view: DatabaseView,
  available: DatabaseView[],
): DashboardRow[] {
  if (view.layout?.dashboardRows)
    return structuredClone(view.layout.dashboardRows);
  const ids =
    view.layout?.dashboardViewIds ??
    available
      .filter(
        (item) =>
          item.dataSourceId === view.dataSourceId &&
          !["form", "dashboard"].includes(item.type),
      )
      .slice(0, 4)
      .map((item) => item.id);
  const rows: DashboardRow[] = [];
  for (let i = 0; i < ids.length; i += 2)
    rows.push({
      id: `legacy-row-${i}`,
      height: 360,
      widgets: ids
        .slice(i, i + 2)
        .map((id) => ({
          id: `legacy-${id}`,
          databaseId: view.databaseId,
          viewId: id,
          width: 1,
        })),
    });
  return rows;
}
export function widgetCount(rows: DashboardRow[]) {
  return rows.reduce((sum, row) => sum + row.widgets.length, 0);
}
export function moveDashboardWidget(
  rows: DashboardRow[],
  id: string,
  rowId: string,
  index: number,
): DashboardRow[] {
  const next = structuredClone(rows),
    target = next.find((row) => row.id === rowId),
    origin = next.find((row) => row.widgets.some((widget) => widget.id === id));
  if (
    !target ||
    !origin ||
    (target !== origin && target.widgets.length >= dashboardRowLimit)
  )
    return next;
  const oldIndex = origin.widgets.findIndex((widget) => widget.id === id),
    [widget] = origin.widgets.splice(oldIndex, 1);
  target.widgets.splice(
    Math.max(
      0,
      Math.min(
        index - (target === origin && oldIndex < index ? 1 : 0),
        target.widgets.length,
      ),
    ),
    0,
    widget,
  );
  return next.filter((row) => row.widgets.length);
}
export function dashboardWidgetView(
  base: DatabaseView,
  widget: DashboardWidget,
): DatabaseView {
  return {
    ...base,
    ...widget.settings,
    id: base.id,
    databaseId: base.databaseId,
    dataSourceId: base.dataSourceId,
    revision: base.revision,
    layout: { ...(widget.settings?.layout ?? base.layout) },
  };
}
