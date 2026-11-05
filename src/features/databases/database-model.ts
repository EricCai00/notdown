import type { Page } from "../../shared/types";

export type DatabasePropertyType = "title" | "text" | "number" | "checkbox" | "date" | "select" | "multi_select" | "status" | "url" | "email" | "phone" | "place" | "people" | "relation" | "files" | "formula" | "rollup" | "unknown";
export interface DatabaseProperty {
  id: string;
  name: string;
  key: string;
  type: DatabasePropertyType;
  options?: { id: string; name: string; color?: string; [key: string]: unknown }[];
  readOnly?: boolean;
  localRelation?: boolean;
  dependencyRole?: "blockedBy" | "blocking";
  inversePropertyId?: string;
  [key: string]: unknown;
}
export interface Database { id: string; title: string; kind?: "database" | "wiki"; icon?: string; pageId?: string; parent?: string | null; trashed?: boolean; dataSourceIds: string[]; viewIds: string[]; revision: string; [key: string]: unknown }
export function isWikiDatabase(database: Database | undefined): boolean { return database?.kind === "wiki" || database?.notionWiki === true; }
export interface DatabaseDataSource { id: string; title: string; ownerDatabaseId?: string; trashed?: boolean; properties: DatabaseProperty[]; dependencyAutoShift?: boolean; dependencyDatePropertyId?: string; revision: string; [key: string]: unknown }
export const databaseViewTypes = ["table", "board", "gallery", "list", "calendar", "timeline", "chart", "feed", "dashboard", "form", "map"] as const;
export type DatabaseViewType = typeof databaseViewTypes[number];
export interface DatabaseView { id: string; databaseId: string; dataSourceId: string; name: string; icon?: string; type: DatabaseViewType; propertyIds?: string[]; rowOrder?: string[]; filters?: unknown[]; filterMode?: "and" | "or"; sorts?: unknown[]; layout?: DatabaseLayout; revision: string; [key: string]: unknown }
export type DashboardViewSettings = Pick<DatabaseView, "name" | "type" | "icon" | "propertyIds" | "filters" | "filterMode" | "sorts" | "layout">;
export interface DashboardWidget { id: string; viewId: string; databaseId: string; width: number; settings?: Partial<DashboardViewSettings>; [key: string]: unknown }
export interface DashboardRow { id: string; height: number; widgets: DashboardWidget[]; [key: string]: unknown }
export interface DashboardFilter { sourceId: string; filters: unknown[]; filterMode?: "and" | "or" }
export interface DatabaseLayout {
  dashboardRows?: DashboardRow[];
  dashboardFilters?: DashboardFilter[];
  mapLatitudeId?: string; mapLongitudeId?: string;
  mapPlaceId?: string; mapColorBy?: string;
  mapHeight?: "small" | "medium" | "large" | "extra-large";
  dashboardViewIds?: string[];
  formRequiredIds?: string[];
  columnWidths?: Record<string, number>;
  groupBy?: string; groupOrder?: string[]; hiddenGroups?: string[]; hideEmptyGroups?: boolean;
  collapsedGroups?: string[]; showGroupCount?: boolean; groupColors?: Record<string, string>;
  datePropertyId?: string; calendarRange?: "month" | "week"; calendarWeekStart?: 0 | 1;
  timelineScale?: "hours" | "day" | "week" | "bi-week" | "month" | "quarter" | "year" | "5-years"; timelineTable?: boolean;
  chartType?: "bar" | "horizontal" | "line" | "donut" | "number";
  chartGroupBy?: string; chartValueId?: string; chartAggregation?: "count" | "sum" | "average" | "min" | "max";
  chartSort?: "natural" | "label" | "ascending" | "descending"; chartDateBucket?: "day" | "week" | "month" | "year";
  chartOmitZero?: boolean; chartLabels?: boolean; chartColor?: "colorful" | "blue" | "green" | "purple";
  chartSeriesBy?: string; chartStacked?: boolean; chartCumulative?: boolean;
  chartHeight?: "small" | "medium" | "large" | "extra-large";
  chartGrid?: boolean; chartAxisNames?: boolean; chartLegend?: boolean; chartCenter?: boolean;
  chartSmooth?: boolean; chartArea?: boolean;
  feedContent?: "preview" | "full"; feedCover?: boolean;
  cardSize?: "small" | "medium" | "large"; preview?: "none" | "cover" | "content" | "first-image" | "first-blocks"; fitImage?: boolean;
  showDataSourceTitle?: boolean; showVerticalLines?: boolean; showPageIcon?: boolean; wrapContent?: boolean;
  openPagesIn?: "side" | "center" | "full"; loadLimit?: number; wrapPropertyIds?: string[]; frozenPropertyId?: string;
  [key: string]: unknown;
}
export interface DatabaseResources { databases: Record<string, Database>; dataSources: Record<string, DatabaseDataSource>; views: Record<string, DatabaseView> }
export interface DatabaseSnapshot { database: Database; hostPage?: Page; dataSources: DatabaseDataSource[]; views: DatabaseView[]; pages: Page[] }
export interface DatabaseSourceSummary {
  id: string; title: string; revision: string; ownerDatabaseId: string; ownerTitle: string; propertyCount: number; recordCount: number;
  ownerRevision?: string; ownerKind?: string; trashed?: boolean;
  databases: { id: string; title: string; isOwner: boolean; views: Pick<DatabaseView, "id" | "name" | "type">[] }[];
}

export const databasePropertyTypes: DatabasePropertyType[] = ["title", "text", "number", "checkbox", "date", "select", "multi_select", "status", "url", "email", "phone", "place", "people", "relation", "files", "formula", "rollup", "unknown"];
export function databasePropertyReadOnly(property: DatabaseProperty): boolean {
  return property.readOnly === true || ["formula", "rollup", "unknown"].includes(property.type);
}
