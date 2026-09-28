import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

async function create(request: APIRequestContext, title: string, body: string) {
  return (await (await request.post("/api/pages", { data: { title, body, bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: {} } } })).json());
}
async function open(page: Page, id: string) {
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), id); await page.goto("/");
}

test("AI configuration matches reference states, persists and supplies selected context", async ({ page, request }) => {
  const target = await create(request, "Systematic", "Selected source body");
  const note = await create(request, "Playground", "<ai-block/>\n\nCurrent page text");
  await request.post("/api/people", { data: { name: "Eric Cai", organization: "Local team", notes: "Research lead" } });
  await open(page, note.id);
  const ai = page.locator(".pm-object-ai_block");
  await expect(ai.getByRole("button", { name: "Done", exact: true })).toBeVisible();
  await ai.screenshot({ path: "test-results/ai-custom.png" });
  await ai.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(ai.getByRole("menuitemradio", { name: "Custom output" })).toHaveAttribute("aria-checked", "true");
  await ai.screenshot({ path: "test-results/ai-generate-menu.png" });
  await ai.getByRole("menuitemradio", { name: "Custom output" }).click();
  await ai.getByRole("textbox", { name: "AI prompt" }).fill("Write in Chinese. ");
  await ai.getByRole("button", { name: "Mention people, pages, or dates" }).click();
  await ai.getByRole("button", { name: "Eric Cai", exact: true }).click();
  await expect(ai.getByRole("textbox", { name: "AI prompt" })).toContainText("Eric Cai");
  await ai.getByRole("button", { name: "Using", exact: true }).click();
  await ai.getByRole("menuitemradio", { name: "Specified context" }).click();
  await ai.getByRole("button", { name: "Add context", exact: true }).click();
  await ai.getByRole("textbox", { name: "Search mentions" }).fill("Systematic");
  await ai.getByRole("button", { name: "Systematic", exact: true }).click();
  await ai.screenshot({ path: "test-results/ai-specified.png" });
  await ai.getByRole("button", { name: "Mention people, pages, or dates" }).click();
  await ai.screenshot({ path: "test-results/ai-mentions.png" });
  await page.keyboard.press("Escape");
  await ai.getByRole("button", { name: "Done", exact: true }).click();
  await page.route("**/api/services/generate", async route => {
    const data = route.request().postDataJSON();
    expect(data.prompt).toContain("Write in Chinese");
    expect(data.context).toContain("Selected source body"); expect(data.context).toContain("Research lead"); expect(data.context).not.toContain("Current page text");
    await route.fulfill({ json: { text: "Generated summary" } });
  });
  await ai.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(ai.locator(".pm-object-content")).toHaveText("Generated summary");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Generated summary");
  await page.reload();
  await ai.getByRole("button", { name: "Settings" }).click();
  await expect(ai.getByRole("button", { name: "Generate", exact: true })).toContainText("Custom output");
  await expect(ai.getByRole("textbox", { name: "AI prompt" })).toContainText("Eric Cai");
  await expect(ai.getByRole("button", { name: "Remove Systematic" })).toBeVisible();
  await ai.getByRole("button", { name: "Remove Systematic" }).click();
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).not.toContain(target.id);
});

test("key points use live page context; prompt input survives mode changes and failed requests", async ({ page, request }) => {
  const note = await create(request, "Live AI context", "Live context outside AI\n\n<ai-block/>\n\nTail");
  await open(page, note.id);
  const ai = page.locator(".pm-object-ai_block");
  await ai.getByRole("textbox", { name: "AI prompt" }).fill("Keep this pending instruction");
  // Switch away without Done or blur-to-save behavior.
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Keep this pending instruction");
  await page.getByRole("button", { name: "Page", exact: true }).click();
  if (await ai.getByRole("button", { name: "Settings" }).isVisible()) await ai.getByRole("button", { name: "Settings" }).click();
  await expect(ai.getByRole("textbox", { name: "AI prompt" })).toHaveText("Keep this pending instruction");
  await ai.getByRole("button", { name: "Generate", exact: true }).click();
  await ai.getByRole("menuitemradio", { name: "Key points" }).click();
  await ai.getByRole("button", { name: "Done", exact: true }).click();
  await page.route("**/api/services/generate", async route => {
    expect(route.request().postDataJSON().prompt).toContain("bulleted list");
    expect(route.request().postDataJSON().context).toContain("Live context outside AI");
    await route.fulfill({ status: 400, json: { error: "Configure a model in Settings first" } });
  });
  await ai.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(ai.locator("output")).toContainText("Configure a model");
  await expect(ai.getByRole("button", { name: "Generate", exact: true })).toBeEnabled();
});

test("typed mentions support keyboard selection, local search and narrow screens", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await create(request, "Research source", "Retrieved by local title search");
  const note = await create(request, "Keyboard AI", "<ai-block/>");
  await open(page, note.id); const ai = page.locator(".pm-object-ai_block"), prompt = ai.getByRole("textbox", { name: "AI prompt" });
  await prompt.pressSequentially("Research @Tomorrow");
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(prompt.locator(".ai-chip")).toHaveText("Tomorrow");
  await ai.getByRole("button", { name: "Using", exact: true }).click();
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await ai.getByRole("button", { name: "Search", exact: true }).click();
  await ai.getByRole("menuitemradio", { name: "Local vault", exact: true }).click();
  await page.setViewportSize({ width: 600, height: 1000 });
  await ai.screenshot({ path: "test-results/ai-narrow.png" });
  const rect = await ai.boundingBox(); expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.x + rect!.width).toBeLessThanOrEqual(601);
  await ai.getByRole("button", { name: "Done", exact: true }).click();
  await page.route("**/api/services/generate", async route => {
    expect(route.request().postDataJSON().context).toContain("Retrieved by local title search");
    expect(route.request().postDataJSON().context).toContain("Date:");
    await route.fulfill({ json: { text: "- First point\n- Second point" } });
  });
  await ai.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(ai.locator(".pm-object-content li")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("generated result has compact actions and preset settings preserve custom configuration", async ({ page, request }) => {
  const other = await create(request, "Other context", "Hidden custom source");
  const note = await create(request, "Playground", `<ai-block prompt="Hidden custom instruction" using="specified" context="&lt;mention-page url=&quot;#page/${other.id}&quot;/&gt;">\nOld result\n</ai-block>\n\nCurrent page source`);
  await open(page, note.id); const ai = page.locator(".pm-object-ai_block");
  await ai.getByRole("button", { name: "Settings", exact: true }).click();
  await ai.getByRole("button", { name: "Generate", exact: true }).click();
  await ai.getByRole("menuitemradio", { name: "Page summary" }).click();
  await expect(ai.getByText("Create a summary about this page", { exact: true })).toBeVisible();
  await expect(ai.getByRole("textbox", { name: "AI prompt" })).toBeHidden();
  await expect(ai.getByRole("button", { name: "Using", exact: true })).toBeDisabled();
  await expect(ai.getByRole("button", { name: "Using", exact: true })).toContainText("Current page only");
  await ai.screenshot({ path: "test-results/ai-summary-settings.png" });
  await ai.getByRole("button", { name: "Done", exact: true }).click();
  let release!: () => void; const pending = new Promise<void>(resolve => release = resolve);
  const generated = '# Summary of "Playground"\n\nThis page is a **testing/sandbox page** for exploring features.\n\n- **Content blocks:** callouts, toggles, columns and lists\n- **Math:** inline and block formulas\n- **Other:** buttons and bookmarks\n\nUsed for **feature exploration**.';
  await page.route("**/api/services/generate", async route => {
    const data = route.request().postDataJSON();
    expect(data.prompt).toContain("Summarize"); expect(data.prompt).not.toContain("Hidden custom instruction");
    expect(data.context).toContain("Current page source"); expect(data.context).not.toContain("Hidden custom source"); expect(data.context).not.toContain("Old result");
    await pending; await route.fulfill({ json: { text: generated } });
  });
  await ai.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(ai.getByRole("button", { name: "Generate", exact: true })).toBeDisabled();
  await expect(ai.getByRole("button", { name: "Good response" })).toBeDisabled();
  release();
  await expect(ai.locator(".pm-object-content h1")).toHaveText('Summary of "Playground"');
  await expect(ai.locator(".pm-object-content li")).toHaveCount(3);
  await expect(ai.locator("output")).toBeEmpty();
  await ai.getByRole("button", { name: "Good response" }).click();
  await expect(ai.getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "true");
  await ai.getByRole("button", { name: "Bad response" }).click();
  await expect(ai.getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "false");
  await expect(ai.getByRole("button", { name: "Bad response" })).toHaveAttribute("aria-pressed", "true");
  await ai.getByRole("button", { name: "Bad response" }).click();
  await ai.screenshot({ path: "test-results/ai-generated-result.png" });
  const toolbar = await ai.locator(".ai-toolbar").boundingBox(), body = await ai.locator(".pm-object-content").boundingBox();
  expect(toolbar!.y + toolbar!.height).toBeLessThanOrEqual(body!.y);
  await ai.getByRole("button", { name: "Settings", exact: true }).click();
  await ai.getByRole("button", { name: "Generate", exact: true }).click();
  await ai.getByRole("menuitemradio", { name: "Custom output" }).click();
  await expect(ai.getByRole("textbox", { name: "AI prompt" })).toHaveText("Hidden custom instruction");
  await expect(ai.getByRole("button", { name: "Remove Other context" })).toBeVisible();
  await ai.getByRole("button", { name: "Done", exact: true }).click();
  await expect(ai.locator(".pm-object-content h1")).toHaveText('Summary of "Playground"');
  await page.setViewportSize({ width: 390, height: 950 });
  await ai.screenshot({ path: "test-results/ai-generated-narrow.png" });
  const narrowToolbar = await ai.locator(".ai-toolbar").boundingBox(), narrowBody = await ai.locator(".pm-object-content").boundingBox();
  expect(narrowToolbar!.y + narrowToolbar!.height).toBeLessThanOrEqual(narrowBody!.y);
  expect(narrowToolbar!.x).toBeGreaterThanOrEqual(narrowBody!.x);
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('Summary of');
  await page.reload();
  await expect(ai.locator(".pm-object-content h1")).toHaveText('Summary of "Playground"');
  await expect(ai.getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "false");
});
