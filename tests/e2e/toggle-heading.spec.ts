import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

async function open(page: Page, request: APIRequestContext, body: string, variant = "notdown") {
  const response = await request.post("/api/pages", { data: {
    title: "Toggle headings", body, syntax: { version: 1, variant, extensions: {} },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator(".pm-document")).toBeVisible();
  return note;
}

async function saved(request: APIRequestContext, id: string) {
  return (await (await request.get(`/api/pages/${id}`)).json()).body as string;
}

test("toggle heading levels have heading spacing and a centered disclosure control", async ({ page, request }) => {
  await open(page, request, 'Synced content\n\n# Toggle heading 1 {toggle="true" open="false"}\n\n## Toggle heading 2 {toggle="true" open="false"}\n\n### Toggle heading 3 {toggle="true" open="false"}\n\nFollowing content');
  const toggles = page.locator(".pm-document > .pm-heading-toggle");
  await expect(toggles).toHaveCount(3);
  await page.locator(".pm-document").screenshot({ path: "test-results/toggle-heading-closed.png" });
  for (const toggle of await toggles.all()) {
    const layout = await toggle.evaluate(dom => {
      const heading = dom.querySelector("h1, h2, h3")!, button = dom.querySelector(".pm-toggle-chevron")!;
      const h = heading.getBoundingClientRect(), b = button.getBoundingClientRect();
      return { gap: dom.getBoundingClientRect().top - dom.previousElementSibling!.getBoundingClientRect().bottom,
        offset: Math.abs(b.top + b.height / 2 - (h.top + h.height / 2)), width: b.width, height: b.height };
    });
    expect(layout.gap).toBe(16);
    expect(layout.offset).toBeLessThan(1);
    expect(layout.width).toBeGreaterThanOrEqual(24);
    expect(layout.height).toBeGreaterThanOrEqual(24);
  }
  await toggles.first().getByRole("button", { name: "Expand content" }).click();
  await page.locator(".pm-document").screenshot({ path: "test-results/toggle-heading-empty.png" });
  const heading = toggles.first().locator("h1");
  await heading.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" with a long title that wraps onto multiple lines");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => toggles.first().evaluate(dom => {
    const heading = dom.querySelector("h1")!, button = dom.querySelector(".pm-toggle-chevron")!;
    const style = getComputedStyle(heading), h = heading.getBoundingClientRect(), b = button.getBoundingClientRect();
    return Math.abs(b.top + b.height / 2 - (h.top + parseFloat(style.paddingTop) + parseFloat(style.lineHeight) / 2));
  })).toBeLessThan(1);
  await page.locator(".pm-document").screenshot({ path: "test-results/toggle-heading-narrow.png" });
});

for (const variant of ["notdown", "notion-markdown"]) {
  test(`${variant}: an empty expanded toggle offers a real editable child and survives reload`, async ({ page, request }) => {
    const original = '## Empty heading {toggle="true"}\n\nTail';
    const note = await open(page, request, original, variant);
    const toggle = page.locator(".pm-heading-toggle");
    await expect(toggle.getByRole("button", { name: "Add content to toggle" })).toBeVisible();
    expect(await saved(request, note.id)).toBe(original);
    await toggle.getByRole("button", { name: "Add content to toggle" }).click();
    await page.keyboard.type("Child content");
    await expect(toggle.locator("p")).toHaveText("Child content");
    await toggle.getByRole("button", { name: "Collapse content" }).click();
    await expect(toggle.locator("p")).toBeHidden();
    // Typing after collapsing must never edit the hidden body.
    await page.keyboard.type(" edited");
    await expect(toggle.locator("h2")).toHaveText("Empty heading edited");
    await expect(toggle.locator("p")).toHaveText("Child content");
    await page.keyboard.press("Control+s");
    await expect.poll(() => saved(request, note.id)).toContain("\tChild content");
    if (variant === "notion-markdown") expect(await saved(request, note.id)).not.toContain("open=");
    await page.reload();
    await expect(toggle.locator("h2")).toHaveText("Empty heading edited");
    if (variant === "notdown") {
      await expect(toggle.locator("p")).toBeHidden();
      await toggle.getByRole("button", { name: "Expand content" }).click();
    }
    await expect(toggle.locator("p")).toHaveText("Child content");
  });

  test(`${variant}: Enter in a collapsed heading inserts a visible sibling without changing its children`, async ({ page, request }) => {
    const note = await open(page, request, '## Heading {toggle="true"}\n\tExisting child\n\nTail', variant);
    const toggle = page.locator(".pm-heading-toggle");
    await toggle.getByRole("button", { name: "Collapse content" }).click();
    await toggle.locator("h2").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Outside toggle");
    await expect(page.locator(".pm-document > p")).toHaveText(["Outside toggle", "Tail"]);
    await expect(toggle.locator("p")).toHaveText("Existing child");
    await page.keyboard.press("Control+s");
    await expect.poll(() => saved(request, note.id)).toContain("\n\nOutside toggle");
    await page.reload();
    await expect(page.locator(".pm-document > p")).toHaveText(["Outside toggle", "Tail"]);
  });
}

test("Enter splits an expanded title into a paragraph before existing children", async ({ page, request }) => {
  const note = await open(page, request, '## Heading tail {toggle="true"}\n\tExisting child\n\nTail');
  const toggle = page.locator(".pm-heading-toggle");
  await toggle.locator("h2").click();
  await page.keyboard.press("Home");
  for (let index = 0; index < 7; index++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(toggle.locator("h2")).toHaveText("Heading");
  await expect(toggle.locator("p")).toHaveText([" tail", "Existing child"]);
  await page.keyboard.press("Control+s");
  await expect.poll(() => saved(request, note.id)).toContain("\t tail");
  await page.reload();
  await expect(toggle.locator("h2")).toHaveText("Heading");
  await expect(toggle.locator("p")).toHaveText([" tail", "Existing child"]);
});

for (const variant of ["notdown", "notion-markdown"]) test(`${variant}: outdenting the last child preserves the toggle and its editable empty state`, async ({ page, request }) => {
  const note = await open(page, request, '## Heading {toggle="true"}\n\tChild\n\nTail', variant);
  const toggle = page.locator(".pm-heading-toggle");
  await toggle.locator("p").click();
  await page.keyboard.press("Shift+Tab");
  await expect(toggle).toBeVisible();
  await expect(toggle.getByRole("button", { name: "Add content to toggle" })).toBeVisible();
  await expect(page.locator(".pm-document > p")).toHaveText(["Child", "Tail"]);
  await page.keyboard.press("Control+z");
  await expect(toggle.locator("p")).toHaveText("Child");
  await page.keyboard.press("Control+y");
  await expect(toggle.getByRole("button", { name: "Add content to toggle" })).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect.poll(() => saved(request, note.id)).toContain('\n\nChild');
  await page.reload();
  await expect(toggle).toBeVisible();
  await expect(toggle.getByRole("button", { name: "Add content to toggle" })).toBeVisible();
  await expect(page.locator(".pm-document > p")).toHaveText(["Child", "Tail"]);
});
