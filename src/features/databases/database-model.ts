import type { Page } from "../../shared/types";

export type DatabasePropertyType = "title" | "text" | "number" | "checkbox" | "date" | "select" | "multi_select" | "status" | "url" | "email" | "phone" | "people" | "relation" | "files" | "formula" | "rollup" | "unknown";
export interface DatabaseProperty {
  id: string;
  name: string;
  key: string;
  type: DatabasePropertyType;
  options?: { id: string; name: string; color?: string; [key: string]: unknown }[];
  readOnly?: boolean;
  [key: string]: unknown;
}
export interface Database { id: string; title: string; kind?: "database" | "wiki"; icon?: string; pageId?: string; parent?: string | null; trashed?: boolean; dataSourceIds: string[]; viewIds: string[]; revision: string; [key: string]: unknown }
export function isWikiDatabase(database: Database | undefined): boolean { return database?.kind === "wiki" || database?.notionWiki === true; }
export interface DatabaseDataSource { id: string; title: string; ownerDatabaseId?: string; trashed?: boolean; properties: DatabaseProperty[]; revision: string; [key: string]: unknown }
export const databaseViewTypes = ["table", "board", "gallery", "list", "calendar"] as const;
export type DatabaseViewType = typeof databaseViewTypes[number];
export interface DatabaseView { id: string; databaseId: string; dataSourceId: string; name: string; type: DatabaseViewType; propertyIds?: string[]; rowOrder?: string[]; filters?: unknown[]; filterMode?: "and" | "or"; sorts?: unknown[]; layout?: DatabaseLayout; revision: string; [key: string]: unknown }
export interface DatabaseLayout {
  groupBy?: string; groupOrder?: string[]; hiddenGroups?: string[]; hideEmptyGroups?: boolean;
  collapsedGroups?: string[]; showGroupCount?: boolean; groupColors?: Record<string, string>;
  datePropertyId?: string; calendarRange?: "month" | "week";
  cardSize?: "small" | "medium" | "large"; preview?: "none" | "cover" | "content"; fitImage?: boolean;
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

export const databasePropertyTypes: DatabasePropertyType[] = ["title", "text", "number", "checkbox", "date", "select", "multi_select", "status", "url", "email", "phone", "people", "relation", "files", "formula", "rollup", "unknown"];
export function databasePropertyReadOnly(property: DatabaseProperty): boolean {
  return property.readOnly === true || ["formula", "rollup", "unknown"].includes(property.type);
}
