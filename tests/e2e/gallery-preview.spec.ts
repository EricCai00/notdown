import { test, expect, type APIRequestContext } from "@playwright/test";

async function image(request: APIRequestContext) {
  const response = await request.post("/api/assets", { data: { name: "gallery.svg", contentType: "image/svg+xml", data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#5f9e87"/></svg>').toString("base64") } });
  expect(response.status()).toBe(201); return (await response.json()).path as string;
}

test("vault gallery previews first blocks or the first actual image, with icons beside titles", async ({ page, request }, info) => {
  const asset = await image(request);
  const sources = [
    ["Gallery sample · Text first", "🧱", `---\ntitle: Gallery sample · Text first\n---\n\nA **formatted** first block.\n\n![Later](${asset})`],
    ["Gallery sample · Image first", "image", `![First](${asset})\n\nLater paragraph`],
    ["Gallery sample · Code first", "code", `\`\`\`md\n![Fake](assets/fake.png)\n\`\`\`\n\n![Real](${asset})`],
    ["Gallery sample · No image", "", "Text without pictures.\n\nSecond paragraph hidden."],
    ["Gallery sample · Empty page", "", ""],
  ];
  const records = [];
  for (const [title, icon, body] of sources) { const res = await request.post("/api/pages", { data: { title, icon, body } }); expect(res.status()).toBe(201); records.push(await res.json()); }
  await page.goto("/#vault/gallery");
  const card = (index: number) => page.locator(`.gallery-card[data-open="${records[index].id}"]`);
  await expect(page.getByRole("combobox", { name: "Card preview", exact: true })).toHaveValue("first-image");
  await expect(card(0).locator(".page-card-preview>img")).toHaveAttribute("src", asset);
  await page.getByRole("combobox", { name: "Card preview", exact: true }).selectOption("content");
  await expect(card(0).locator(".page-card-preview strong")).toHaveText("formatted");
  await expect(card(0).locator(".page-card-preview img")).toHaveCount(0);
  await expect(card(0).locator("h3 .page-link-icon")).toHaveText("🧱");
  await expect(card(1).locator(".page-card-preview>img")).toHaveAttribute("src", asset);
  await expect(card(2).locator(".page-card-preview pre")).toContainText("Fake");
  await expect(card(3).locator(".page-card-preview")).not.toContainText("Second paragraph");
  await expect(card(4).locator(".page-card-preview")).toBeEmpty();
  await page.getByRole("combobox", { name: "Card preview", exact: true }).selectOption("first-image");
  await expect(card(0).locator(".page-card-preview>img")).toHaveAttribute("src", asset);
  await expect(card(2).locator(".page-card-preview>img")).toHaveAttribute("src", asset);
  await expect(card(3).locator(".page-card-preview")).toHaveText("Text without pictures.");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Card preview", exact: true })).toHaveValue("first-image");
  await page.getByRole("textbox", { name: "Filter pages", exact: true }).fill("Gallery sample");
  await page.getByRole("combobox", { name: "Card preview", exact: true }).selectOption("content");
  await page.screenshot({ path: info.outputPath("vault-gallery.png"), fullPage: true });
  await page.getByRole("combobox", { name: "Card preview", exact: true }).selectOption("none");
  await expect(card(0).locator(".page-card-preview")).toHaveCount(0);
  for (const record of records) expect((await (await request.get(`/api/pages/${record.id}`)).json()).body).toBe(record.body);
});

test("database gallery saves preview modes and independent view icons, including conflict recovery", async ({ page, request }, info) => {
  const asset = await image(request);
  const snapshot = await (await request.post("/api/databases", { data: { title: "Gallery options" } })).json();
  const source = snapshot.dataSources[0], initial = snapshot.views[0];
  const record = await (await request.post(`/api/data-sources/${source.id}/records`, { data: { baseRevision: source.revision, title: "Example card" } })).json();
  const body = `First **block**.\n\n![Later](${asset})`;
  const saved = await request.put(`/api/pages/${record.id}`, { data: { baseRevision: record.revision, body, icon: "🧪" } }); expect(saved.ok()).toBeTruthy();
  expect((await request.put(`/api/database-views/${initial.id}`, { data: { baseRevision: initial.revision, type: "gallery", name: "Gallery" } })).ok()).toBeTruthy();
  await page.goto(`/#database/${snapshot.database.id}`);
  const card = page.locator(`.database-record-card[data-page-id="${record.id}"]`);
  await expect(card.locator(".database-card-preview>img")).toHaveAttribute("src", asset);
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByRole("button", { name: "Card preview", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Card preview", exact: true }).getByRole("button", { name: "First image", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "First block", exact: true }).click();
  await page.getByRole("dialog", { name: "Layout", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
  await expect(card.locator(".database-card-preview strong")).toHaveText("block");
  await expect(card.locator(".database-card-preview img")).toHaveCount(0);
  await expect(card.locator(".database-card-title .page-link-icon")).toHaveText("🧪");
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByRole("button", { name: "Card preview", exact: true }).click();
  await page.getByRole("button", { name: "First image", exact: true }).click();
  await page.getByRole("dialog", { name: "Layout", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
  await expect(card.locator(".database-card-preview>img")).toHaveAttribute("src", asset);
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  await page.getByRole("button", { name: "View icon", exact: true }).click();
  await page.getByRole("textbox", { name: "Search icons", exact: true }).fill("rocket");
  await page.getByRole("button", { name: "rocket", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Gallery", exact: true }).locator("svg")).toHaveAttribute("data-view-icon", "rocket");
  await page.reload();
  await expect(card.locator(".database-card-preview>img")).toHaveAttribute("src", asset);
  const current = await (await request.get(`/api/databases/${snapshot.database.id}`)).json();
  expect(current.views[0].icon).toBe("rocket"); expect(current.views[0].layout.preview).toBe("first-image");
  await page.screenshot({ path: info.outputPath("database-gallery.png"), fullPage: true });
  await page.getByRole("button", { name: "New view", exact: true }).click();
  await page.getByRole("dialog", { name: "New view" }).getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "View icon", exact: true }).click();
  await page.getByRole("textbox", { name: "Search icons", exact: true }).fill("heart");
  await page.getByRole("button", { name: "heart", exact: true }).click();
  await page.getByRole("button", { name: "Create view", exact: true }).click();
  await expect(page.getByRole("tab", { name: "List", exact: true }).locator("svg")).toHaveAttribute("data-view-icon", "heart");
  await expect(page.getByRole("tab", { name: "Gallery", exact: true }).locator("svg")).toHaveAttribute("data-view-icon", "rocket");
  await page.getByRole("tab", { name: "Gallery", exact: true }).click({ button: "right" });
  await page.getByRole("button", { name: "View icon", exact: true }).click();
  await page.getByRole("textbox", { name: "Search icons", exact: true }).fill("star");
  await page.getByRole("button", { name: "star", exact: true }).click();
  const remote = await request.put(`/api/database-views/${initial.id}`, { data: { baseRevision: current.views[0].revision, icon: "heart" } }); expect(remote.ok()).toBeTruthy();
  // Outside dismissal attempts the original revision and leaves the draft recoverable.
  await page.locator(".database-heading h1").click();
  await expect(page.locator(".database-popover-status").filter({ hasText: /both versions|conflict|revision/i })).toBeVisible();
  expect((await (await request.get(`/api/databases/${snapshot.database.id}`)).json()).views[0].icon).toBe("heart");
  expect((await (await request.get(`/api/pages/${record.id}`)).json()).body).toBe(body);
  await page.getByRole("button", { name: "Discard menu changes", exact: true }).click();
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  await page.getByRole("button", { name: "View icon", exact: true }).click();
  await page.getByRole("button", { name: "Use default icon", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("tab", { name: "List", exact: true }).locator("svg")).toHaveAttribute("data-view-icon", "list");
});

test("Page preview fills and clips vault and database previews and persists the choice", async ({ page, request }, info) => {
  const snapshot = await (await request.post("/api/databases", { data: { title: "Multiple block preview" } })).json();
  const source = snapshot.dataSources[0], initial = snapshot.views[0];
  const record = await (await request.post(`/api/data-sources/${source.id}/records`, { data: { baseRevision: source.revision, title: "Multiple blocks" } })).json();
  const body = "---\ntitle: Multiple blocks\n---\n\n" + Array.from({ length: 20 }, (_, index) => `Paragraph ${index + 1}: **formatted** content.`).join("\n\n");
  expect((await request.put(`/api/pages/${record.id}`, { data: { baseRevision: record.revision, body } })).ok()).toBeTruthy();
  expect((await request.put(`/api/database-views/${initial.id}`, { data: { baseRevision: initial.revision, type: "gallery", name: "Gallery" } })).ok()).toBeTruthy();
  const checkClipping = async (selector: string) => {
    const content = page.locator(`${selector} .page-card-preview-content`);
    await expect(content.locator("p").nth(1)).toContainText("Paragraph 2");
    await expect(content.locator("p").first().locator("strong")).toHaveText("formatted");
    const bounds = await content.evaluate(element => {
      const frame = element.getBoundingClientRect(), paragraphs = [...element.querySelectorAll("p")];
      return { visible: paragraphs.filter(p => { const rect = p.getBoundingClientRect(); return rect.top < frame.bottom && rect.bottom > frame.top; }).length, total: paragraphs.length, clipped: element.scrollHeight > element.clientHeight, overflow: getComputedStyle(element).overflowY };
    });
    expect(bounds.visible).toBeGreaterThan(1); expect(bounds.visible).toBeLessThan(bounds.total);
    expect(bounds.clipped).toBe(true); expect(bounds.overflow).toBe("hidden");
  };
  await page.goto("/#vault/gallery");
  await page.getByRole("textbox", { name: "Filter pages", exact: true }).fill("Multiple blocks");
  await page.getByRole("combobox", { name: "Card preview", exact: true }).selectOption("first-blocks");
  const vaultCard = `.gallery-card[data-open="${record.id}"]`;
  await checkClipping(vaultCard);
  await page.screenshot({ path: info.outputPath("vault-first-blocks.png") });
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Card preview", exact: true })).toHaveValue("first-blocks");
  await page.getByRole("textbox", { name: "Filter pages", exact: true }).fill("Multiple blocks");
  await page.setViewportSize({ width: 390, height: 844 });
  await checkClipping(vaultCard);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/#database/${snapshot.database.id}`);
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByRole("button", { name: "Card preview", exact: true }).click();
  await page.getByRole("button", { name: "Page preview", exact: true }).click();
  await page.getByRole("dialog", { name: "Layout", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await checkClipping(`.database-record-card[data-page-id="${record.id}"]`);
  await page.screenshot({ path: info.outputPath("database-first-blocks.png") });
  const saved = await (await request.get(`/api/databases/${snapshot.database.id}`)).json();
  expect(saved.views[0].layout.preview).toBe("first-blocks");
  expect((await (await request.get(`/api/pages/${record.id}`)).json()).body).toBe(body);
});
