import { test, expect } from "@playwright/test";

for (const variant of ["notdown", "notion-markdown"]) {
  test(`${variant}: page tags keep their types when a referenced child moves`, async ({ page, request }) => {
    const create = async (data: object) => (await request.post("/api/pages", { data })).json();
    const parent = await create({ title: `${variant} ownership`, body: "", syntax: { version: 1, variant, extensions: {} } });
    const child = await create({ title: "Owned child", body: "Child text", parent: parent.id });
    const link = await create({ title: "Other page", body: "Other text" });
    const body = `<page url="#page/${child.id}">Child</page>\r\n\r\n<page-link url="#page/${child.id}">Link to this child</page-link>\r\n\r\n<page role="child" url="#page/${link.id}">Legacy role</page>\r\n\r\nText <mention-page url="#page/${child.id}">Mention</mention-page>\r\n`;
    expect((await request.put(`/api/pages/${parent.id}`, { data: { body, baseRevision: parent.revision } })).ok()).toBeTruthy();
    await page.goto(`/#page/${parent.id}`);
    const entries = page.locator('.ProseMirror [data-pm-node-type="block.child_page"]');
    const references = page.locator('.ProseMirror [data-pm-node-type="block.link_to_page"]');
    await expect(entries).toHaveCount(2);
    await expect(references).toHaveCount(variant === "notdown" ? 1 : 0);
    await expect(page.locator('.ProseMirror [data-pm-node-type="inline.internal_link"]')).toHaveCount(1);
    expect((await (await request.get(`/api/pages/${parent.id}`)).json()).body).toBe(body);
    expect((await request.put(`/api/pages/${child.id}`, { data: { parent: null, baseRevision: child.revision } })).ok()).toBeTruthy();
    await page.reload();
    await expect(entries).toHaveCount(2);
    await expect(references).toHaveCount(variant === "notdown" ? 1 : 0);
    const moved = await (await request.get(`/api/pages/${child.id}`)).json();
    expect((await request.put(`/api/pages/${child.id}`, { data: { parent: parent.id, baseRevision: moved.revision } })).ok()).toBeTruthy();
    await page.reload();
    await expect(entries).toHaveCount(2);
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByRole("button", { name: "Page", exact: true }).click();
    await expect(entries).toHaveCount(2);
    expect((await (await request.get(`/api/pages/${parent.id}`)).json()).body).toBe(body);
    expect((await (await request.get(`/api/pages/${link.id}`)).json()).parent).toBeNull();
  });
}
