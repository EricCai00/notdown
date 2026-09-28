import { expect, type Page } from "@playwright/test";

/** New databases are immediate creations; naming happens in the database itself. */
export async function renameDatabaseTitle(page: Page, title: string, databaseId?: string) {
  const field = page.getByRole("textbox", { name: "Database title", exact: true });
  await expect(field).toBeVisible();
  await field.fill(title);
  await field.press("Enter");
  const id = databaseId ?? new URL(page.url()).hash.match(/^#database\/([^/?]+)/)?.[1];
  expect(id).toBeTruthy();
  await expect.poll(async () => (await (await page.request.get(`/api/databases/${id}`)).json()).database.title).toBe(title);
  return id!;
}
