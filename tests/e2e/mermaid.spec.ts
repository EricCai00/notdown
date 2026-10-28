import { test, expect } from "@playwright/test";
import { v2Id, v2MermaidSource } from "../unit/notion-v2-fixture";

for (const variant of ["notdown", "notion-markdown"]) {
  test(`imported ${variant} v2 Mermaid renders, edits, undoes and survives reload`, async ({ page, request }, testInfo) => {
    const previewResponse = await request.post("/api/notion/import/preview", { data: {
      token: "test-mermaid-token", pageId: v2Id(88), variant, includeChildren: false,
      downloadAssets: false, useDesktopCache: false,
    } });
    expect(previewResponse.ok()).toBeTruthy();
    const preview = await previewResponse.json();
    expect(preview.documents[0].source).toBe(v2MermaidSource);
    expect((await request.post("/api/import/commit", { data: { id: preview.id } })).ok()).toBeTruthy();
    const id = preview.documents[0].id;
    const saved = async () => (await (await request.get(`/api/pages/${id}`)).json()).body;
    await page.goto(`/#page/${id}`);
    const diagrams = page.locator('.pm-document [data-syntax-kind="diagram"]');
    await expect(diagrams).toHaveCount(3);
    for (const diagram of await diagrams.all()) {
      const svg = diagram.locator(".pm-syntax-preview > svg");
      await expect(svg).toBeVisible();
      expect((await svg.boundingBox())!.height).toBeGreaterThan(30);
    }
    await expect(page.locator(".pm-code-block")).toHaveCount(1);
    expect(await saved()).toBe(v2MermaidSource);
    await page.screenshot({ path: testInfo.outputPath("imported-mermaid.png") });
    const first = diagrams.first();
    await first.getByRole("button", { name: "Edit source", exact: true }).click();
    const input = first.getByRole("textbox", { name: "Extension block source" });
    const raw = await input.inputValue();
    await input.fill(raw.replace("Imported start", "Changed start"));
    await expect(first.locator("svg")).toContainText("Changed start");
    await page.keyboard.press("Control+z");
    await expect(first.locator("svg")).toContainText("Imported start");
    await page.keyboard.press("Control+Shift+z");
    await expect(first.locator("svg")).toContainText("Changed start");
    await expect.poll(saved).toContain("Changed start");
    await page.reload();
    await expect(first.locator("svg")).toContainText("Changed start");
    await page.locator(".syntax-options summary").click();
    await page.locator('[data-extension="diagrams"]').uncheck();
    await expect(diagrams).toHaveCount(0);
    await expect(page.locator(".pm-code-block")).toHaveCount(4);
    await page.locator('[data-extension="diagrams"]').check();
    await expect(diagrams).toHaveCount(3);
    await expect(first.locator("svg")).toContainText("Changed start");
    expect(await saved()).toBe(v2MermaidSource.replace("Imported start", "Changed start"));
  });

  test(`${variant} v1 Mermaid renders on a normal page`, async ({ page, request }) => {
    const body = "```mermaid\nflowchart LR\nA[Start] --> B[Finish]\n```";
    const response = await request.post("/api/pages", { data: {
      title: "Normal Mermaid", body, syntax: { version: 1, variant, extensions: {} },
    } });
    expect(response.ok()).toBeTruthy();
    const note = await response.json();
    await page.goto(`/#page/${note.id}`);
    await expect(page.locator('[data-syntax-kind="diagram"] svg')).toBeVisible();
    expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
  });
}

test("invalid Mermaid leaves source editable and a corrected diagram renders", async ({ page, request }) => {
  const body = "```mermaid\ninvalidDiagram !!\n```";
  const response = await request.post("/api/pages", { data: {
    title: "Mermaid error recovery", body,
    syntax: { version: 1, variant: "notdown", notionVersion: "v2", extensions: {} },
  } });
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const diagram = page.locator('[data-syntax-kind="diagram"]');
  await expect(diagram.locator(".pm-syntax-preview")).toContainText("Unable to display:");
  await diagram.getByRole("button", { name: "Edit source", exact: true }).click();
  const input = diagram.getByRole("textbox", { name: "Extension block source" });
  await expect(input).toHaveValue(body);
  await input.fill("```mermaid\nflowchart LR\nA[Recovered] --> B[Finish]\n```");
  await expect(diagram.locator("svg")).toContainText("Recovered");
});
