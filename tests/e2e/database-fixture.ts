import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";
import type { DatabaseDataSource, DatabaseProperty, DatabaseSnapshot } from "../../src/features/databases/database-model";
import type { Page } from "../../src/shared/types";

/** Test-only collection for realistic table/peek layout; never touches the user's vault. */
export async function createBlockDatabase(request: APIRequestContext) {
  const created = await request.post("/api/databases", { data: { title: "Notion Blocks" } });
  expect(created.status()).toBe(201);
  const snapshot: DatabaseSnapshot = await created.json();
  const source = snapshot.dataSources[0];
  const property = (name: string, key: string, type: DatabaseProperty["type"], options?: DatabaseProperty["options"]): DatabaseProperty => ({ id: randomUUID(), name, key, type, ...(options ? { options } : {}) });
  const fields = [
    ...source.properties,
    property("In Markdown", "inMarkdown", "select", [{ id: "yes", name: "Available", color: "green" }, { id: "extension", name: "Sometime Available", color: "yellow" }, { id: "no", name: "Not Available", color: "red" }]),
    property("Markdown Syntax", "markdownSyntax", "select", [{ id: "same", name: "Same", color: "green" }, { id: "different", name: "Different", color: "red" }, { id: "pasting", name: "Same (Pasting)", color: "blue" }]),
    property("Class", "class", "select", [{ id: "basic", name: "Basic blocks", color: "brown" }, { id: "media", name: "Media", color: "orange" }]),
    property("Notion Syntax", "notionSyntax", "text"),
    property("AFFINE", "affine", "checkbox"),
  ];
  const updated = await request.put(`/api/data-sources/${source.id}`, { data: { baseRevision: source.revision, properties: fields } });
  expect(updated.ok()).toBeTruthy();
  const schema: DatabaseDataSource = await updated.json();
  const examples = [
    ["Text", "yes", "same", "basic", "Plain text", "yes"],
    ["Page", "no", "different", "basic", "<page>…</page>", "no"],
    ["To-do List", "yes", "same", "basic", "- [ ] Task", "yes"],
    ["Heading 1", "yes", "same", "basic", "# Heading", "yes"],
    ["Heading 2", "yes", "same", "basic", "## Heading", "yes"],
    ["Heading 3", "yes", "same", "basic", "### Heading", "yes"],
    ["Table", "yes", "pasting", "basic", "<table>…</table>", "yes"],
    ["Bulleted List", "yes", "same", "basic", "- List item", "yes"],
    ["Numbered List", "yes", "same", "basic", "1. List item", "yes"],
    ["Toggle List", "no", "different", "basic", "<details>…</details>", "no"],
    ["Quote", "yes", "same", "basic", "> Quoted text", "yes"],
    ["Divider", "yes", "same", "basic", "---", "yes"],
    ["Link to page", "no", "different", "basic", "<page-link>…</page-link>", "no"],
    ["Callout", "extension", "different", "basic", '<callout icon="💡">', "yes"],
    ["Image", "yes", "same", "media", "![caption](image.png)", "yes"],
  ];
  const records: Page[] = [];
  for (const [title, inMarkdown, markdownSyntax, kind, notionSyntax, affine] of examples) {
    const result = await request.post(`/api/data-sources/${source.id}/records`, { data: { baseRevision: schema.revision, title, properties: { inMarkdown, markdownSyntax, class: kind, notionSyntax, affine: affine === "yes" } } });
    expect(result.status()).toBe(201);
    records.push(await result.json());
  }
  const callout = records.find(record => record.title === "Callout")!;
  const body = "## Callout\n\nUse a callout to make a useful detail easy to notice. A record can hold a complete Markdown page below its properties.\n\n### Writing notes\n\n- Keep the message short and specific.\n- Add context, examples, and links as the note grows.\n\n> The table and this page share the same properties.\n";
  const saved = await request.put(`/api/pages/${callout.id}`, { data: { baseRevision: callout.revision, body } });
  expect(saved.ok()).toBeTruthy();
  Object.assign(callout, await saved.json());
  const view = snapshot.views[0];
  const ordered = await request.put(`/api/database-views/${view.id}`, { data: { baseRevision: view.revision, rowOrder: records.map(record => record.id) } });
  expect(ordered.ok()).toBeTruthy();
  return { database: snapshot.database, schema, fields, records, callout };
}
