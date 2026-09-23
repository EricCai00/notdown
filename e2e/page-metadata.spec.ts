import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { expectSource } from "./source-helper";

async function open(page: Page, request: APIRequestContext, body: string, extensions = { metadata_values: true }) {
  const note = await (await request.post("/api/pages", { data: {
    title: "Page metadata", icon: "file-text", properties: { status: "Draft", nested: { keep: true } },
    body, bodyFormat: "markdown", syntax: { version: 1, variant: "markdown", extensions },
  } })).json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator("#page-title")).toBeVisible();
  return note;
}

for (const [label, body] of [
  ["YAML metadata", '---\ntitle: Body title\nauthor: Original\nunknown: [1, 2]\n# keep this comment\n---\n\nBody text'],
  ["Pandoc title block", '% Body title\n  continuation\n% Original\n% 2026\n\nBody text'],
]) test(`${label} lives in Properties and retains source, history and page fields`, async ({ page, request }) => {
  const note = await open(page, request, body);
  const panel = page.locator(".page-properties");
  await expect(panel).not.toHaveAttribute("open", "");
  await expect(page.locator(".pm-document [data-syntax-kind=metadata]")).toHaveCount(0);
  await panel.locator("summary").click();
  await expect(panel.locator(".page-metadata-summary")).toContainText("Body title");
  await expect(panel.locator(".page-metadata-section svg")).toHaveCount(1);
  await expect(panel.locator(".md-metadata")).toHaveCount(0);
  await panel.getByRole("button", { name: label + " details", exact: true }).click();
  await page.getByRole("dialog", { name: label, exact: true }).getByRole("button", { name: "Edit fields", exact: true }).click();
  const dialog = page.locator(".pm-block-properties-dialog");
  await dialog.getByLabel("Metadata author", { exact: true }).fill("Changed author");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel).toContainText("Changed author");
  await page.keyboard.press("Control+z");
  await expect(panel).toContainText("Original");
  await page.keyboard.press("Control+Shift+z");
  await expect(panel).toContainText("Changed author");
  await page.locator('[data-mode="source"]').click();
  await expectSource(page, /Changed author/);
  await page.locator("#source-editor").click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(body.replace("Original", "From source"));
  await page.locator('[data-mode="document"]').click();
  await expect(panel).toContainText("From source");
  await panel.getByRole("button", { name: label + " details", exact: true }).click();
  const details = page.getByRole("dialog", { name: label, exact: true });
  const code = details.getByRole("textbox", { name: "Metadata source", exact: true });
  await expect(code).toBeVisible();
  await expect(details.locator(".cm-lineNumbers")).toBeVisible();
  await expect(details.locator(label.startsWith("YAML") ? ".metadata-code-key" : ".metadata-code-marker").first()).toBeVisible();
  await expect(details.locator(label.startsWith("YAML") ? ".metadata-code-key" : ".metadata-code-marker").first()).toHaveCSS("color", label.startsWith("YAML") ? "rgb(139, 62, 159)" : "rgb(163, 90, 18)");
  await code.click();
  await code.press("Control+a");
  await page.keyboard.insertText(body.split("\n\n")[0].replace("Original", "Changed author"));
  await code.press("Control+z");
  await expect(code).toContainText("From source");
  await code.press("Control+Shift+z");
  await expect(code).toContainText("Changed author");
  await details.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Changed author");
  const saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.title).toBe(label.startsWith("YAML") ? note.title : "Body title\ncontinuation");
  expect(saved.properties).toEqual(note.properties);
  expect(saved.body).toContain(label.startsWith("YAML") ? "# keep this comment" : "continuation");
  await page.reload();
  await page.locator(".page-properties > summary").click();
  await expect(page.locator("#page-metadata")).toContainText("Changed author");
  await page.screenshot({ path: `test-results/page-metadata-${label.startsWith("YAML") ? "yaml" : "pandoc"}.png` });
  await page.getByRole("button", { name: label + " details", exact: true }).click();
  await expect(page.getByRole("dialog", { name: label, exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/page-metadata-${label.startsWith("YAML") ? "yaml" : "pandoc"}-details.png` });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: label, exact: true })).not.toBeVisible();
});

test("preserved metadata stays in Properties with Metadata values disabled; fenced text stays in body", async ({ page, request }) => {
  const body = '---\ntitle: Preserved\n---\n\n```yaml\n---\ntitle: Code\n---\n```';
  const note = await open(page, request, body, { metadata_values: false });
  await page.locator(".page-properties > summary").click();
  await page.getByRole("button", { name: "YAML metadata details", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Metadata source", exact: true })).toContainText("title: Preserved");
  await page.keyboard.press("Escape");
  await expect(page.locator(".pm-document")).toContainText("title: Code");
  await page.locator("#page-title").hover();
  await page.getByRole("button", { name: "Add icon", exact: true }).click();
  await page.getByRole("dialog", { name: "Choose page icon" }).getByRole("button", { name: "Rocket 火箭", exact: true }).click();
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).icon).toBe("🚀");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
});

test("body backspace and select-all cannot silently remove collapsed metadata", async ({ page, request }) => {
  const prefix = "% Title\n% Author\n% 2026";
  const note = await open(page, request, prefix + "\n\nBody text");
  await page.locator(".pm-document p").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText("Replacement body");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(prefix + "\n\nReplacement body");
  await page.locator('[data-mode="source"]').click();
  await page.locator("#source-editor").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText("Body without metadata");
  await page.locator('[data-mode="document"]').click();
  await expect(page.locator("#page-metadata .page-metadata-section")).toHaveCount(0);
  await expect(page.locator(".pm-document")).toContainText("Body without metadata");
  await page.locator(".pm-document p").click();
  await page.keyboard.press("Control+z");
  await expect(page.locator("#page-metadata .page-metadata-section")).toHaveCount(1);
});

test("metadata code validates drafts and Cancel preserves the page", async ({ page, request }) => {
  const body = '---\ntitle: Original\ncount: 7\nenabled: true\n# Keep comment\n---\n\nBody';
  const note = await open(page, request, body);
  await page.locator(".page-properties > summary").click();
  await page.getByRole("button", { name: "YAML metadata details" }).click();
  const dialog = page.getByRole("dialog", { name: "YAML metadata", exact: true });
  const code = dialog.getByRole("textbox", { name: "Metadata source" });
  await expect(dialog.locator(".metadata-code-comment")).toHaveText("# Keep comment");
  await expect(dialog.locator(".metadata-code-comment")).toHaveCSS("font-style", "italic");
  await code.press("Control+a");
  await page.keyboard.insertText('---\ntitle: [unfinished\n---');
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog.locator("output")).not.toBeEmpty();
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "YAML metadata details" }).click();
  await expect(code).toContainText("title: Original");
});

test("Pandoc title and page title stay linked through editing, undo, rename and reload", async ({ page, request }) => {
  const body = "% Original\n%   Alice; Bob\n%  2026\n\nBody";
  const note = await open(page, request, body);
  await expect(page.locator("#page-title")).toHaveValue("Original");
  await page.locator("#page-title").fill("From page");
  await page.locator("#page-title").press("Control+z");
  await expect(page.locator("#page-title")).toHaveValue("Original");
  await page.locator("#page-title").press("Control+Shift+z");
  await expect(page.locator("#page-title")).toHaveValue("From page");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body.replace("Original", "From page"));
  await page.locator(".page-properties > summary").click();
  await page.getByRole("button", { name: "Pandoc title block details" }).click();
  const dialog = page.getByRole("dialog", { name: "Pandoc title block", exact: true });
  const code = dialog.getByRole("textbox", { name: "Metadata source" });
  await expect(code).toContainText("% From page");
  await code.press("Control+a");
  await page.keyboard.insertText(body.split("\n\n")[0].replace("Original", "From metadata"));
  await code.press("Control+Enter");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#page-title")).toHaveValue("From metadata");
  await page.keyboard.press("Control+z");
  await expect(page.locator("#page-title")).toHaveValue("From page");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator("#page-title")).toHaveValue("From metadata");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).title).toBe("From metadata");
  await page.reload();
  await expect(page.locator("#page-title")).toHaveValue("From metadata");
  await page.locator("#page-options > summary").click();
  await page.locator("#page-options").getByRole("menuitem", { name: "Rename", exact: true }).click();
  await page.getByLabel("Page name", { exact: true }).fill("From rename");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.locator("#page-title")).toHaveValue("From rename");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body.replace("Original", "From rename"));
});

test("page icon and cover can be added, replaced and removed without losing pending body or undo", async ({ page, request }) => {
  const note = await open(page, request, "Body text");
  await page.mouse.move(0, 0);
  await expect(page.locator(".page-decoration-actions")).toHaveCSS("opacity", "0");
  const initialTitleY = (await page.locator("#page-title").boundingBox())!.y;
  await page.locator("#page-title").hover();
  await expect(page.locator(".page-decoration-actions")).toHaveCSS("opacity", "1");
  expect((await page.locator("#page-title").boundingBox())!.y).toBe(initialTitleY);
  await page.screenshot({ path: "test-results/page-title-actions-hover.png" });
  await page.locator(".pm-document p").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" pending");
  await page.locator("#page-title").hover();
  await page.getByRole("button", { name: "Add icon", exact: true }).click();
  let picker = page.getByRole("dialog", { name: "Choose page icon" });
  await picker.getByRole("button", { name: "Rocket 火箭", exact: true }).click();
  await expect(page.getByRole("button", { name: "Change page icon", exact: true })).toHaveText("🚀");
  await expect(page.locator(".pm-document")).toContainText("pending");
  await page.locator(".pm-document p").click();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".pm-document")).not.toContainText("pending");
  await page.keyboard.press("Control+Shift+z");
  await page.locator("#page-title").hover();
  await page.getByRole("button", { name: "Add cover", exact: true }).click();
  await page.getByLabel("Cover image URL", { exact: true }).fill("assets/test-cover.svg");
  await page.getByRole("button", { name: "Save cover", exact: true }).click();
  await expect(page.locator(".page-cover")).toHaveAttribute("src", "assets/test-cover.svg");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).properties.cover).toBe("assets/test-cover.svg");
  await page.reload();
  await page.getByRole("button", { name: "Change page icon", exact: true }).click();
  picker = page.getByRole("dialog", { name: "Choose page icon" });
  await picker.getByLabel("Custom icon").fill("🌻");
  await picker.getByRole("button", { name: "Use icon" }).click();
  await expect(page.getByRole("button", { name: "Change page icon", exact: true })).toHaveText("🌻");
  await page.getByRole("button", { name: "Change page icon", exact: true }).click();
  await page.getByRole("dialog", { name: "Choose page icon" }).getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("button", { name: "Change cover", exact: true }).click();
  await page.getByRole("button", { name: "Remove cover", exact: true }).click();
  await expect(page.locator(".page-cover")).toHaveCount(0);
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).icon).toBe("");
  await page.reload();
  await expect(page.getByRole("button", { name: "Add icon", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add cover", exact: true })).toBeVisible();
  await expect(page.locator(".pm-document")).toContainText("pending");
  await page.locator(".pm-document p").click();
  await expect(page.locator(".page-decoration-actions")).toHaveCSS("opacity", "0");
});
