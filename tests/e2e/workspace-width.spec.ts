import { test, expect } from "@playwright/test";

for (const variant of ["commonmark", "notdown"]) {
  test(`${variant}: covered pages use the full editing width in Split and Source`, async ({ page, request }) => {
    const body = "# CommonMark — 默认配置验收\n\n这是正文，用来检查双栏编辑区域的宽度。\n\nTail";
    const response = await request.post("/api/pages", { data: {
      title: "Editing width", body, icon: "📔", bodyFormat: variant === "notdown" ? "notion-markdown" : "markdown",
      syntax: { version: 1, variant, extensions: {} },
      properties: { cover: "/page-covers/artemis_ii_1.jpg" },
    } });
    expect(response.status()).toBe(201);
    const note = await response.json();
    await page.goto(`/#page/${note.id}`);
    await expect(page.locator(".document-wrap")).toHaveClass(/has-page-cover/);
    const article = page.locator(".document");
    const width = () => article.evaluate(el => el.getBoundingClientRect().width);
    const mode = (name: string) => page.locator(`.editing-modes [data-mode="${name}"]`).click();
    await expect.poll(width).toBe(730);
    await mode("split");
    await expect.poll(width).toBeGreaterThan(1000);
    const expectAvailableWidth = async () => {
      const available = await page.locator(".document-wrap").evaluate(el => {
        const style = getComputedStyle(el);
        return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      });
      expect(await width()).toBeCloseTo(available, 0);
    };
    await expectAvailableWidth();
    for (const pane of [".source-pane", ".page-pane"])
      expect((await page.locator(pane).boundingBox())!.width).toBeGreaterThan(450);
    await page.locator(".editing-toolbar").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/workspace-width-${variant}.png` });
    await mode("source");
    await expectAvailableWidth();
    await mode("document");
    await expect.poll(width).toBe(730);
    await mode("split");
    await page.setViewportSize({ width: 950, height: 1000 });
    await expectAvailableWidth();
    await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
    await expect(page.locator("#sidebar")).toBeHidden();
    await expectAvailableWidth();
    expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
  });
}
