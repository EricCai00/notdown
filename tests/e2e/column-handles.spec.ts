import { test, expect } from "@playwright/test";

test("right column blocks expose their own reachable handles beside deeper left blocks", async ({ page, request }) => {
  const body = '<columns>\n<column>\n- **Long left row** with enough text to wrap over several lines and occupy the same height as the file preview on the right. More left column content here.\n- Second left row\n- Third left row\n</column>\n<column>\n<file src="https://example.com/paper.pdf">Paper file</file>\n\n![Preview](https://example.com/preview.png)\n\n<page url="https://example.com/child">Child entry</page>\n\n<page url="https://example.com/next">Next entry</page>\n</column>\n</columns>';
  await page.route('https://example.com/preview.png', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="90"><rect width="500" height="90" fill="#ccc"/></svg>' }));
  const note = await (await request.post('/api/pages', { data: { title: 'Column handles', body, bodyFormat: 'notion-markdown' } })).json();
  await page.goto(`/#page/${note.id}`);
  const column = page.locator('.note-column').nth(1);
  await expect(column).toBeVisible();
  for (const row of await column.locator(':scope > *').all()) {
    const rect = (await row.boundingBox())!;
    if (!rect.height) continue;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + Math.min(rect.height / 2, 12));
    const handle = page.locator('.pm-block-handle');
    await expect(handle).toHaveClass(/visible/);
    const grip = (await handle.boundingBox())!;
    expect(Math.abs(grip.x + grip.width + 12 - rect.x)).toBeLessThan(2);
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2, { steps: 12 });
    await handle.click();
    await expect(page.getByRole('menu', { name: 'Block actions' })).toBeVisible();
    await page.keyboard.press('Escape');
  }
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
});
