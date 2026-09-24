import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";

async function open(
  page: Page,
  request: APIRequestContext,
  variant = "notdown",
  extensions = {},
  body = "",
) {
  const status = await (await request.get("/api/status")).json();
  expect(status.vaultPath).toMatch(/[\\/]notdown-e2e-[^\\/]+$/);
  const response = await request.post("/api/pages", {
    data: {
      title: "Symbol replacements",
      body,
      syntax: { version: 1, variant, extensions },
    },
  });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.addInitScript(
    (id) => localStorage.setItem("notdown-page", id),
    note.id,
  );
  await page.goto("/");
  const editor = page.locator("#editor .pm-document[contenteditable='true']");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Control+End");
  return { editor, id: note.id };
}

test("typed symbols, Backspace, saving and reloading in Chrome", async ({
  page,
  request,
}) => {
  const { editor, id } = await open(page, request);
  await page.keyboard.type("Plan ->");
  await expect(editor).toHaveText("Plan →");
  await page.keyboard.press("Backspace");
  await expect(editor).toHaveText("Plan ->");
  await page.keyboard.type(" -> <- <-> => <=> <= >= != +/- ... (c) (r) (tm)");
  const expected = "Plan -> → ← ↔ ⇒ ⇔ ≤ ≥ ≠ ± … © ® ™";
  await expect(editor).toHaveText(expected);
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () => (await (await request.get(`/api/pages/${id}`)).json()).body,
    )
    .toContain("→ ← ↔ ⇒ ⇔ ≤ ≥ ≠ ± … © ® ™");
  await page.reload();
  await expect(editor).toHaveText(expected);
});

for (const variant of ["notdown", "notion-markdown", "commonmark"]) {
  test(`${variant} respects replacement configuration and keeps loaded text`, async ({
    page,
    request,
  }) => {
    const { editor } = await open(
      page,
      request,
      variant,
      { symbol_replacements: variant !== "notdown" },
      "Existing ->",
    );
    await page.keyboard.type(" -> ...");
    await expect(editor).toHaveText("Existing -> -> ...");
  });
}

test("typing in inline code keeps ASCII", async ({ page, request }) => {
  const { editor } = await open(page, request);
  await page.keyboard.type("`code -> <= ...`");
  await expect(editor.locator("code")).toHaveText("code -> <= ...");
});

test("paste stays literal and the extension switch takes effect immediately", async ({
  page,
  request,
}) => {
  const { editor, id } = await open(page, request);
  await editor.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/plain", "Pasted -> ... (c)");
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(editor).toHaveText("Pasted -> ... (c)");
  await page.locator(".syntax-options summary").click();
  const panel = page.locator(".syntax-options-panel");
  await panel
    .getByRole("searchbox", { name: "Search extensions" })
    .fill("symbol_replacements");
  const toggle = panel.locator('input[data-extension="symbol_replacements"]');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.locator(".syntax-options summary").click();
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" ->");
  await expect(editor).toHaveText("Pasted -> ... (c) ->");
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${id}`)).json()).syntax.extensions
          .symbol_replacements,
    )
    .toBe(false);
});
