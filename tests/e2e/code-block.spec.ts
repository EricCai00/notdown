import { expect, test } from "@playwright/test";

test("code toolbar changes language, copies code, wraps long lines and saves a caption", async ({ page, request }) => {
  const code = 'const longValue = "' + "0123456789".repeat(22) + '";';
  const response = await request.post("/api/pages", {
    data: {
      title: "Code controls",
      body: `Before\n\n\`\`\`javascript\n${code}\n\`\`\`\n\nTail`,
      bodyFormat: "notion-markdown",
      syntax: { version: 1, variant: "notdown", extensions: {} },
    },
  });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/#page/${note.id}`);
  const block = page.locator(".pm-document .pm-code-block");
  await expect(block.locator("code")).toHaveText(code);
  await expect(block.locator(".pm-code-keyword")).toContainText("const");
  const gaps = await page.locator(".pm-document > *").evaluateAll(nodes =>
    nodes.slice(1).map((node, index) => node.getBoundingClientRect().top - nodes[index].getBoundingClientRect().bottom));
  expect(gaps).toEqual([12, 12]);

  const toolbar = block.getByRole("toolbar", { name: "Code block" });
  await page.mouse.move(0, 0);
  await expect(toolbar).toHaveCSS("opacity", "0");
  const restingBounds = await block.boundingBox();
  expect(restingBounds!.height).toBeLessThan(116);
  const padding = await block.locator("pre").evaluate(node => {
    const style = getComputedStyle(node);
    return { top: style.paddingTop, bottom: style.paddingBottom };
  });
  expect(padding.top).toBe(padding.bottom);
  await block.hover();
  await expect(toolbar).toHaveCSS("opacity", "1");
  const toolbarBounds = await toolbar.boundingBox();
  const codeBounds = await block.locator("code").boundingBox();
  expect(toolbarBounds!.y + toolbarBounds!.height).toBeLessThanOrEqual(codeBounds!.y);
  expect(await block.boundingBox()).toEqual(restingBounds);
  await page.mouse.move(0, 0);
  await expect(toolbar).toHaveCSS("opacity", "0");
  await block.hover();

  await block.getByRole("button", { name: "Code language" }).click();
  await page.getByRole("searchbox", { name: "Search for a language" }).fill("python");
  await page.getByRole("button", { name: "Python", exact: true }).click();
  await expect(block.getByRole("button", { name: "Code language" })).toContainText("Python");

  await block.hover();
  await block.getByRole("button", { name: "Copy code" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(code);

  const wrap = block.getByRole("button", { name: "Wrap code" });
  await expect(block.locator("pre")).toHaveCSS("white-space", "pre");
  await wrap.click();
  await expect(wrap).toHaveAttribute("aria-pressed", "true");
  await expect(block.locator("pre")).toHaveCSS("white-space", "pre-wrap");
  await page.mouse.move(0, 0);
  await expect(toolbar).toHaveCSS("opacity", "0");
  await page.keyboard.press("Tab");
  await expect(block.getByRole("button", { name: "Code block options" })).toBeFocused();
  await expect(toolbar).toHaveCSS("opacity", "1");
  await block.hover();

  await block.getByRole("button", { name: "Code block options" }).click();
  await page.getByRole("menuitem", { name: "Add caption" }).click();
  await block.getByRole("textbox", { name: "Code caption" }).fill('Example "quoted" {name} & text');
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body)
    .toContain('```python {caption="Example &quot;quoted&quot; &#123;name&#125; &amp; text"}');
  await page.reload();
  await expect(page.locator(".pm-code-caption")).toHaveValue('Example "quoted" {name} & text');
  await expect(page.locator(".pm-code-pre code")).toHaveText(code);
  await block.hover();
  await page.locator(".pm-code-block").getByRole("button", { name: "Code block options" }).click();
  await page.getByRole("menuitem", { name: "Remove caption" }).click();
  await expect(page.locator(".pm-code-caption")).toBeHidden();
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body)
    .toContain(`\`\`\`python\n${code}\n\`\`\``);
});

test("official Notion code keeps caption controls unavailable", async ({ page, request }) => {
  const response = await request.post("/api/pages", {
    data: { title: "Official code", body: "```python\nprint(1)\n```", bodyFormat: "notion-markdown" },
  });
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const code = page.locator(".pm-code-block code");
  await expect(code.locator(".pm-code-keyword")).toHaveText("print");
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("print(2)");
  await expect(code).toHaveText("print(1)\nprint(2)");
  await page.locator(".pm-code-block").getByRole("button", { name: "Code block options" }).click();
  await expect(page.getByRole("menuitem", { name: "Add caption" })).toBeDisabled();
  await expect(page.getByText("Choose Notdown to add a caption.")).toBeVisible();
});
