import { test, expect } from "@playwright/test";
import { expectSource } from "./source-helper";

const kinds = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"];
const contents = [
  "Useful information that users should know, even when skimming content.",
  "Helpful advice for doing things better or more easily.",
  "Key information users need to know to achieve their goal.",
  "Urgent info that needs immediate user attention to avoid problems.",
  "Advises about risks or negative outcomes of certain actions.",
];
const syntax = { version: 1, variant: "notdown", extensions: {} };

test("five GitHub-style alerts match the reference and wrap on narrow screens", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const body = kinds.map((kind, i) => `> [!${kind}]\n> ${contents[i]}`).join("\n\n");
  const response = await request.post("/api/pages", { data: { title: "GitHub alerts", body, bodyFormat: "notion-markdown", syntax } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const editor = page.locator(".pm-document");
  const alerts = editor.locator(".pm-alert");
  await expect(alerts).toHaveCount(5);
  const colors = ["rgb(9, 105, 218)", "rgb(26, 127, 55)", "rgb(130, 80, 223)", "rgb(154, 103, 0)", "rgb(207, 34, 46)"];
  for (let i = 0; i < kinds.length; i++) {
    await expect(alerts.nth(i)).toHaveCSS("border-left-color", colors[i]);
    await expect(alerts.nth(i)).toHaveCSS("border-left-width", "4px");
    await expect(alerts.nth(i)).toHaveCSS("border-radius", "0px");
    await expect(alerts.nth(i)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(alerts.nth(i).locator(".pm-alert-title")).toHaveText(kinds[i][0] + kinds[i].slice(1).toLowerCase());
    expect(await alerts.nth(i).locator("svg").evaluate(svg => svg.namespaceURI)).toBe("http://www.w3.org/2000/svg");
  }
  await editor.screenshot({ path: "test-results/github-alerts-desktop.png" });
  await page.setViewportSize({ width: 620, height: 1000 });
  await expect(alerts.first()).toBeVisible();
  expect(await editor.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await editor.screenshot({ path: "test-results/github-alerts-narrow.png" });
  expect(errors).toEqual([]);
});

test("Notdown inserts a titled folding GitHub-style alert and retains Notion callouts", async ({ page, request }) => {
  const response = await request.post("/api/pages", { data: {
    title: "Insert GitHub alert", body: '<callout icon="💡">\n\tNotion callout\n</callout>\n\nTail', bodyFormat: "notion-markdown", syntax,
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const editor = page.locator(".pm-document");
  await editor.locator(":scope > p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/github");
  await page.locator('[data-insert="alert"]').click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(editor.locator(".pm-alert")).toHaveAttribute("data-callout-kind", "NOTE");
  await editor.locator(".pm-alert").getByRole("button", { name: "Change alert type" }).click();
  const menu = page.getByRole("menu", { name: "Alert type" });
  await expect(menu.getByRole("menuitemradio")).toHaveCount(27);
  await menu.screenshot({ path: "test-results/github-alert-type-menu.png" });
  await menu.getByRole("menuitemradio", { name: "Warning", exact: true }).click();
  await editor.locator(".pm-alert").getByRole("textbox", { name: "Alert title" }).fill("Before you continue");
  await editor.locator(".pm-alert").getByRole("button", { name: "Change alert type" }).click();
  await menu.getByRole("menuitemcheckbox", { name: "Collapsible" }).click();
  const alert = editor.locator("details.pm-alert");
  await expect(alert).toHaveAttribute("open");
  await alert.locator("p").fill("Check your input.");
  await alert.locator(".pm-alert-fold").click();
  await expect(alert).not.toHaveAttribute("open");
  await expect(alert.locator("summary")).toHaveText("Before you continue");
  await expect(editor.locator(".pm-callout:not(.pm-alert)")).toContainText("Notion callout");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("> [!WARNING]- Before you continue");
  await alert.locator(".pm-alert-fold").click();
  await expect(alert).toHaveAttribute("open");
  await alert.locator("p").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Carefully.");
  await page.locator('[data-mode="source"]').click();
  await expectSource(page, /\[!WARNING\]\+ Before you continue\n> Check your input\. Carefully\./);
  await page.locator('[data-mode="document"]').click();
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Check your input. Carefully.");
  await page.reload();
  await expect(alert).toHaveAttribute("open");
  await expect(alert).toContainText("Check your input. Carefully.");
  await alert.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(alert).not.toHaveAttribute("open");
  await alert.getByRole("button", { name: "Change alert type" }).click();
  await menu.getByRole("menuitemradio", { name: "Success", exact: true }).click();
  await expect(alert).toHaveAttribute("data-callout-kind", "SUCCESS");
  await expect(alert).toHaveCSS("border-left-color", "rgb(8, 185, 78)");
  await expect(alert.getByRole("textbox", { name: "Alert title" })).toHaveValue("Before you continue");
  await expect(alert).not.toHaveAttribute("open");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("> [!SUCCESS]- Before you continue\n> Check your input. Carefully.");
  await alert.getByRole("button", { name: "Change alert type" }).click();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(alert.getByRole("button", { name: "Change alert type" })).toBeFocused();
});

for (const variant of ["notdown", "obsidian"]) {
  test(`${variant}: alert titles edit in place without folding and survive undo and view switches`, async ({ page, request }) => {
    const body = "> [!NOTE]- Original title\n> Body\n\n> [!TIP]\n> Other body\n\nTail";
    const response = await request.post("/api/pages", { data: {
      title: `Editable alert ${variant}`, body, bodyFormat: variant === "notdown" ? "notion-markdown" : "markdown",
      syntax: { ...syntax, variant },
    } });
    expect(response.status()).toBe(201);
    const note = await response.json();
    await page.goto(`/#page/${note.id}`);
    const editor = page.locator(".pm-document");
    const folded = editor.locator("details.pm-alert");
    const title = folded.getByRole("textbox", { name: "Alert title", exact: true });
    await expect(title).toHaveValue("Original title");
    await expect(folded).not.toHaveAttribute("open");
    await expect(folded.locator("summary")).toHaveCSS("list-style-type", "none");
    await expect(folded.locator(".pm-alert-fold")).toHaveCSS("transform", "matrix(0, -1, 1, 0, 0, 0)");
    const titleBox = await title.boundingBox(), arrowBox = await folded.locator(".pm-alert-fold").boundingBox();
    expect(arrowBox!.x).toBeGreaterThan(titleBox!.x + titleBox!.width);
    expect(titleBox!.width).toBeLessThan(160);
    await title.click();
    await expect(folded).not.toHaveAttribute("open");
    await title.fill("Renamed title");
    await page.keyboard.press("Control+z");
    await expect(title).toHaveValue("Original title");
    await page.keyboard.press("Control+Shift+z");
    await expect(title).toHaveValue("Renamed title");
    await expect(title).toBeFocused();
    await page.keyboard.press("End");
    await page.keyboard.type(" now");
    await page.locator('[data-mode="source"]').click();
    await expectSource(page, /\[!NOTE\]- Renamed title now/);
    await page.locator('[data-mode="document"]').click();
    await expect(title).toHaveValue("Renamed title now");
    await expect(folded).not.toHaveAttribute("open");
    await title.fill("");
    await expect(title).toHaveAttribute("placeholder", "Note");
    await page.keyboard.press("Enter");
    await expect(folded).not.toHaveAttribute("open");
    await folded.locator(".pm-alert-fold").click();
    await expect(folded).toHaveAttribute("open");
    await expect(folded.locator(".pm-alert-fold")).toHaveCSS("transform", "none");
    const plainTitle = editor.locator("aside.pm-alert").getByRole("textbox", { name: "Alert title", exact: true });
    await plainTitle.fill("Custom tip");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("> [!TIP] Custom tip");
    await page.reload();
    await expect(title).toHaveValue("");
    await expect(folded).toHaveAttribute("open");
    await expect(plainTitle).toHaveValue("Custom tip");
    await expect(editor.locator(".pm-alert p")).toHaveText(["Body", "Other body"]);
    if (variant === "notdown") {
      await title.fill("Editable title");
      await page.keyboard.press("Enter");
      await editor.screenshot({ path: "test-results/github-alert-title-expanded.png" });
      await folded.locator(".pm-alert-fold").click();
      await editor.screenshot({ path: "test-results/github-alert-title-collapsed.png" });
    }
  });
}

test("GFM basic alert titles remain static even with alerts explicitly enabled", async ({ page, request }) => {
  const response = await request.post("/api/pages", { data: {
    title: "GFM alert title boundary", body: "> [!NOTE]\n> Body", bodyFormat: "markdown",
    syntax: { version: 1, variant: "gfm", extensions: { alerts: true } },
  } });
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator(".pm-alert-title-text")).toHaveText("Note");
  await expect(page.locator(".pm-alert-title-input")).toHaveCount(0);
  await expect(page.locator(".pm-alert-fold")).toHaveCount(0);
  await page.getByRole("button", { name: "Change alert type" }).click();
  const menu = page.getByRole("menu", { name: "Alert type" });
  await expect(menu.getByRole("menuitemradio")).toHaveCount(5);
  await expect(menu.getByRole("menuitemcheckbox")).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator(".pm-alert")).toHaveAttribute("data-callout-kind", "TIP");
});
