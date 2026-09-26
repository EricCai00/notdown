import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

async function open(page: Page, request: APIRequestContext, body: string, variant = "commonmark") {
  const response = await request.post("/api/pages", { data: {
    title: "Numbered list display", body, syntax: { version: 1, variant, extensions: {} },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator(".pm-document")).toBeVisible();
  return note;
}

async function choose(page: Page, value: "markdown" | "notion") {
  await page.getByRole("button", { name: "Workspace settings", exact: true }).click();
  await page.getByLabel("Numbered list display", { exact: true }).selectOption(value);
  await page.locator("#dialog").getByRole("button", { name: "Done", exact: true }).click();
}

async function styles(page: Page) {
  return page.locator(".pm-document ol").evaluateAll(lists => lists.map(list => getComputedStyle(list).listStyleType));
}

test("numbering cycles at arbitrary depth, persists, and toggles without rewriting source or revision", async ({ page, request }) => {
  const body = Array.from({ length: 7 }, (_, depth) => `${"    ".repeat(depth)}1. Level ${depth + 1}`).join("\n") + "\n";
  const note = await open(page, request, body);
  await expect.poll(() => styles(page)).toEqual(Array(7).fill("decimal"));
  await choose(page, "notion");
  const cycle = ["decimal", "lower-alpha", "lower-roman", "decimal", "lower-alpha", "lower-roman", "decimal"];
  await expect.poll(() => styles(page)).toEqual(cycle);
  await page.reload();
  await expect.poll(() => styles(page)).toEqual(cycle);
  await page.getByRole("button", { name: "Workspace settings", exact: true }).click();
  await expect(page.getByLabel("Numbered list display", { exact: true })).toHaveValue("notion");
  await page.locator("#dialog").getByRole("button", { name: "Done", exact: true }).click();
  await choose(page, "markdown");
  await expect.poll(() => styles(page)).toEqual(Array(7).fill("decimal"));
  await page.keyboard.press("Control+s");
  const saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.body).toBe(body);
  expect(saved.revision).toBe(note.revision);
});

test("explicit alphabetic and Roman lists retain their numbering including nested exceptions", async ({ page, request }) => {
  await open(page, request, "a. Alpha\n    a. Alpha child\n        1. Explicit decimal\n\nParagraph\n\ni. Roman\n    i. Roman child\n\nSeparator\n\n1. Decimal\n    a. Explicit alpha\n        1. Explicit decimal child\n", "notdown");
  const before = await styles(page);
  expect(before).toContain("lower-alpha");
  expect(before).toContain("lower-roman");
  await choose(page, "notion");
  await expect.poll(() => styles(page)).toEqual(before);
  await choose(page, "markdown");
  await expect.poll(() => styles(page)).toEqual(before);
});

test("indent, outdent and undo recompute display while saved lists keep numeric markers", async ({ page, request }) => {
  const note = await open(page, request, "1. Parent\n2. Child\n");
  await choose(page, "notion");
  const child = page.locator(".pm-document li p").filter({ hasText: /^Child$/ });
  await child.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  await expect.poll(() => styles(page)).toEqual(["decimal", "lower-alpha"]);
  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => styles(page)).toEqual(["decimal"]);
  await page.keyboard.press("Control+z");
  await expect.poll(() => styles(page)).toEqual(["decimal", "lower-alpha"]);
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Child edited");
  const saved = (await (await request.get(`/api/pages/${note.id}`)).json()).body;
  expect(saved).not.toMatch(/^\s*[ai]\./m);
  await page.reload();
  await expect.poll(() => styles(page)).toEqual(["decimal", "lower-alpha"]);
});
