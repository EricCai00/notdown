import type { DatabaseProperty, DatabaseView } from "./database-model";
import { placeText } from "./database-place";

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const notionSubitemWarning = "Notion sub-item display and filtering are archived; records are shown without that hierarchy.";

/** Old imports kept Place in an unknown-property envelope. Display it without
 * migrating its schema/value or making the preserved snapshot editable. */
export function importedPlaceText(field: DatabaseProperty, value: unknown): string | undefined {
  if (field.type !== "place" && !(field.type === "unknown" && object(field.notion) && field.notion.type === "place")) return;
  const place = object(value) && value.snapshot === true && value.type === "place" && Object.hasOwn(value, "place") ? value.place : value;
  if (place == null || place === "") return "";
  return placeText(place) || "Preserved value";
}

export function hasNotionSubitemDisplay(config: unknown): boolean {
  if (!object(config) || !object(config.subtasks) || config.subtasks.display_mode === "disabled") return false;
  return Object.keys(config.subtasks).some(key => key !== "toggle_column_id");
}

/** Suppress only the old false positive for a toggle-column-only definition.
 * Unknown/missing evidence and all other compatibility warnings stay available. */
export function databaseImportWarnings(view: DatabaseView | undefined): string[] {
  if (!Array.isArray(view?.importWarnings)) return [];
  const config = object(view.notion) && object(view.notion.configuration) ? view.notion.configuration : undefined;
  const toggleOnly = config && object(config.subtasks) && typeof config.subtasks.toggle_column_id === "string"
    && Object.keys(config.subtasks).every(key => key === "toggle_column_id");
  return view.importWarnings.filter((warning): warning is string => typeof warning === "string" && !(toggleOnly && warning === notionSubitemWarning));
}
