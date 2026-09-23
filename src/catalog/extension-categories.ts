import workbook from "../../docs/data/extension-workbook.json";
import { canonicalExtensionId } from "../markdown-engine/config";
import { notionFeatureOrigins } from "./extension-feature-origins";

// Keep the existing source-filter keys so saved catalog links continue to work.
export const extensionCategories = {
  pandoc: "Pandoc extensions",
  notion: "Notdown Notion extensions",
  product: "Notdown Markdown extensions",
} as const;
export type ExtensionCategory = keyof typeof extensionCategories;
const pandocIds = new Set(workbook.rows.filter(row => row[1] === "Pandoc 手册").map(row => row[0]));

export function extensionCategory(id: string): ExtensionCategory {
  id = canonicalExtensionId(id);
  return id.startsWith("notion_") || Object.hasOwn(notionFeatureOrigins, id) ? "notion" : pandocIds.has(id) ? "pandoc" : "product";
}

export function extensionCategoryHeading(entries: readonly { id: string }[], index: number) {
  const category = extensionCategory(entries[index].id);
  return index > 0 && extensionCategory(entries[index - 1].id) === category ? ""
    : `<h4 class="extension-category-heading" data-extension-category-heading="${category}">${extensionCategories[category]}</h4>`;
}
