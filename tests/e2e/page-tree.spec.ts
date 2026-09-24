import { test, expect } from "@playwright/test";

test("Page tree shows three levels, toggles branches independently and keeps title navigation", async ({ page, request }) => {
  const prefix = `Tree-${Date.now()}`;
  const notes: { id: string; title: string }[] = [];
  for (let level = 1; level <= 5; level++) {
    notes.push(await (await request.post("/api/pages", { data: {
      title: `${prefix} level ${level}`, parent: notes.at(-1)?.id ?? null, body: "Tree content",
    } })).json());
  }
  await page.goto("/#vault/tree");
  await page.getByRole("textbox", { name: "Filter pages" }).fill(prefix);
  const tree = page.locator(".library-tree");
  const title = (level: number) => tree.locator(`[data-open="${notes[level - 1].id}"]`);
  const branch = (level: number) => tree.locator(`details[data-tree-page="${notes[level - 1].id}"]`);
  const toggle = (level: number) => branch(level).locator(":scope > summary");
  for (const level of [1, 2, 3]) await expect(title(level)).toBeVisible();
  for (const level of [4, 5]) await expect(title(level)).toBeHidden();
  await expect(tree.locator(`details[data-tree-page="${notes[4].id}"]`)).toHaveCount(0);
  await toggle(3).locator(".library-tree-chevron").click();
  await expect(title(4)).toBeVisible();
  await expect(title(5)).toBeHidden();
  await toggle(4).focus();
  await page.keyboard.press("Enter");
  await expect(title(5)).toBeVisible();
  await page.keyboard.press("Space");
  await expect(title(5)).toBeHidden();
  await toggle(1).locator(".library-tree-chevron").click();
  await expect(title(2)).toBeHidden();
  await expect(page).toHaveURL(/#vault\/tree$/);
  await toggle(1).focus();
  await page.keyboard.press("Enter");
  await expect(title(4)).toBeVisible();
  await expect(title(5)).toBeHidden();
  await page.locator('[data-library-view="list"]').click();
  await page.locator('[data-library-view="tree"]').click();
  await expect(title(4)).toBeVisible();
  await expect(title(5)).toBeHidden();
  await page.screenshot({ path: "test-results/page-tree-expanded.png" });
  await title(4).click();
  await expect(page).toHaveURL(new RegExp(`#page/${notes[3].id}$`));
  await expect(page.locator("#page-title")).toHaveValue(notes[3].title);
  await page.goto("/#vault/tree");
  await page.reload();
  await expect(title(3)).toBeVisible();
  await expect(title(4)).toBeHidden();
});
