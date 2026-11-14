import { test, expect } from "@playwright/test";

for (const width of [1950, 1440, 390]) for (const cover of [true, false]) {
  test(`reference layout at ${width}px, cover: ${cover}`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height: 1016 });
    await page.addInitScript(() => localStorage.removeItem("notdown-markdown-controls"));
    const vault = await (await request.post("/api/vaults/open", { data: { mode: "create", name: `Reference layout ${width} ${cover}` } })).json();
    const api = `${vault.url}api/pages`;
    const create = async (data: object) => (await request.post(api, { data })).json();
    const parent = await create({ title: "Systematic", icon: "👤", body: "", syntax: { version: 1, variant: "notdown", extensions: {} }, properties: cover ? { cover: "/page-covers/nasa_carina_nebula.jpg" } : {} });
    const child = await create({ title: "开发ideas", icon: "💡", parent: parent.id });
    const body = `<page url="#page/${child.id}">开发ideas</page>\n<page-link url="#page/${child.id}">开发ideas</page-link>\n\nA paragraph with an inline <mention-page url="#page/${child.id}"/>.\n`;
    expect((await request.put(`${api}/${parent.id}`, { data: { body, baseRevision: parent.revision } })).ok()).toBeTruthy();
    await page.goto(`${vault.url}#page/${parent.id}`);
    const owned = page.locator('.pm-document [data-pm-node-type="block.child_page"]');
    const linked = page.locator('.pm-document [data-pm-node-type="block.link_to_page"]');
    await expect(linked.locator(".page-link-reference-arrow")).toBeVisible();
    const arrow = linked.locator(".page-link-reference-arrow");
    await expect(arrow).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(arrow).toHaveAttribute("viewBox", "4 4 16 16");
    const strokes = await arrow.locator("path").evaluateAll(paths => paths.map(path => ({ color: getComputedStyle(path).stroke, width: parseFloat(getComputedStyle(path).strokeWidth) })));
    const outline = strokes.find(stroke => stroke.color === "rgb(255, 255, 255)");
    const center = strokes.find(stroke => stroke.color === "rgb(32, 32, 32)");
    expect(outline).toBeTruthy(); expect(center).toBeTruthy();
    expect(outline!.width).toBeGreaterThan(center!.width);
    await linked.hover();
    await expect(arrow).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(owned.locator(".page-link-reference-arrow")).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".pm-document")).toHaveCSS("font-size", "16px");
    await expect(page.locator("#page-title")).toHaveCSS("font-size", width > 720 ? "40px" : "34px");
    // Inspect the actual rendered Latin glyphs, not just the CSS font stack.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument");
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: '.child-page-node .page-link-label' });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    if (process.platform === "win32") expect(fonts.some(font => /^Segoe UI(?: |$)/.test(font.familyName) && font.glyphCount > 0)).toBe(true);
    await cdp.detach();
    const geometry = await page.evaluate(() => {
      const rect = (selector: string) => {
        const el = document.querySelector(selector)!;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, right: r.right, bottom: r.bottom };
      };
      return {
        title: rect('#page-title'), editor: rect('.pm-document'), main: rect('#main'),
        owned: rect('.child-page-node[data-page-relation="child"] .page-link-label'),
        linked: rect('.child-page-node[data-page-relation="reference"] .page-link-label'),
        arrow: rect('.child-page-node .page-link-reference-arrow'),
        icon: rect('.child-page-node[data-page-relation="reference"] .page-link-icon-slot'),
        overflow: document.querySelector('#main')!.scrollWidth - document.querySelector('#main')!.clientWidth,
      };
    });
    expect(geometry.title.x).toBeCloseTo(geometry.editor.x, 0);
    expect(geometry.owned.x).toBeCloseTo(geometry.linked.x, 0);
    expect(geometry.arrow.x).toBeGreaterThan(geometry.icon.x);
    expect(geometry.arrow.right).toBeLessThan(geometry.linked.x);
    expect(geometry.arrow.y).toBeGreaterThan(geometry.icon.y);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    if (width > 720) {
      expect(geometry.editor.width).toBe(708);
      expect(geometry.editor.x - geometry.main.x).toBeCloseTo((geometry.main.width - 708) / 2, 0);
    }
    if (cover) {
      await expect.poll(() => page.locator('.page-cover').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      const region = (await page.locator('.page-cover-region').boundingBox())!;
      const icon = (await page.locator('.page-emblem').boundingBox())!;
      expect(region.x).toBeCloseTo(geometry.main.x, 0);
      expect(region.width).toBeCloseTo(geometry.main.width, 0);
      expect(icon.y).toBeLessThan(region.y + region.height);
      expect(icon.y + icon.height).toBeGreaterThan(region.y + region.height);
    }
    await page.mouse.move(width - 1, 1015);
    await page.screenshot({ path: info.outputPath('reference-layout.png') });
    await linked.click();
    await expect(page.locator('#page-title')).toHaveValue(child.title);
    expect((await (await request.get(`${api}/${parent.id}`)).json()).body).toBe(body);
    expect((await (await request.get(`${api}/${child.id}`)).json()).parent).toBe(parent.id);
  });
}
