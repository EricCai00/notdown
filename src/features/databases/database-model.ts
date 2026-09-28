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
export interface Database { id: string; title: string; icon?: string; pageId?: string; parent?: string | null; trashed?: boolean; dataSourceIds: string[]; viewIds: string[]; revision: string; [key: string]: unknown }
export interface DatabaseDataSource { id: string; title: string; ownerDatabaseId?: string; properties: DatabaseProperty[]; revision: string; [key: string]: unknown }
export interface DatabaseView { id: string; databaseId: string; dataSourceId: string; name: string; type: "table"; propertyIds?: string[]; rowOrder?: string[]; filters?: unknown[]; sorts?: unknown[]; revision: string; [key: string]: unknown }
export interface DatabaseResources { databases: Record<string, Database>; dataSources: Record<string, DatabaseDataSource>; views: Record<string, DatabaseView> }
export interface DatabaseSnapshot { database: Database; hostPage?: Page; dataSources: DatabaseDataSource[]; views: DatabaseView[]; pages: Page[] }

export const databasePropertyTypes: DatabasePropertyType[] = ["title", "text", "number", "checkbox", "date", "select", "multi_select", "status", "url", "email", "phone", "people", "relation", "files", "formula", "rollup", "unknown"];
export function databasePropertyReadOnly(property: DatabaseProperty): boolean {
  return property.readOnly === true || ["formula", "rollup", "unknown"].includes(property.type);
}
