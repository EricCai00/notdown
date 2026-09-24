import { test, expect } from "@playwright/test";

for (const encoding of ["fenced", "html"] as const) {
  test(`${encoding} Div has no frame, with independent child controls and whole-group dragging`, async ({ page, request }) => {
    const opening = encoding === "fenced" ? '::: {.container custom="keep"}' : '<div class="container" custom="keep">';
    const closing = encoding === "fenced" ? ':::' : '</div>';
    const source = `${opening}\nFirst child\n\nSecond child\n${closing}\n\nTail`;
    const response = await request.post('/api/pages', { data: {
      title: 'Div interaction', body: source, bodyFormat: 'markdown',
      syntax: { version: 1, variant: 'markdown', extensions: { fenced_divs: true, native_divs: true } },
    } });
    expect(response.status()).toBe(201);
    const note = await response.json();
    await page.goto(`/#page/${note.id}`);
    const group = page.locator('.pm-object-fenced_div');
    const content = group.locator(':scope > .pm-fenced-div');
    const children = content.locator(':scope > p');
    const tail = page.locator('.pm-document > p').filter({ hasText: /^Tail$/ });
    const handle = page.locator('.pm-block-handle');
    await expect(children).toHaveText(['First child', 'Second child']);
    await expect(group).toHaveCSS('border-top-width', '0px');
    await expect(content).toHaveCSS('border-top-width', '0px');
    await expect(group).toHaveCSS('padding-left', '0px');
    await expect(group).toHaveCSS('padding-top', '0px');
    const childBounds = (await children.first().boundingBox())!;
    const outsideBounds = (await tail.boundingBox())!;
    expect(Math.abs(childBounds.x - outsideBounds.x)).toBeLessThan(1);
    expect(Math.abs(childBounds.width - outsideBounds.width)).toBeLessThan(1);
    expect(Math.abs(childBounds.y - (await group.boundingBox())!.y)).toBeLessThan(1);
    expect(await content.evaluate(el => getComputedStyle(el, '::before').content)).toBe('none');

    await children.first().hover();
    await expect(handle).toHaveClass(/visible/);
    await expect(handle).toHaveAttribute('data-block-pos', '1');
    const childGripX = (await handle.boundingBox())!.x;
    await expect(page.locator('.pm-block-add')).toHaveClass(/visible/);
    await handle.click();
    await expect(page.locator('.pm-block-menu .pm-block-type')).toHaveText('Paragraph');
    await page.keyboard.press('Escape');
    await children.nth(1).hover();
    await expect(handle).not.toHaveAttribute('data-block-pos', '1');
    await expect(handle).not.toHaveAttribute('data-block-pos', '0');
    // Moving toward the grip must not retarget the surrounding Div.
    const childPos = await handle.getAttribute('data-block-pos');
    await handle.hover();
    await expect(handle).toHaveAttribute('data-block-pos', childPos!);
    await handle.dragTo(children.first(), { targetPosition: { x: 8, y: 2 } });
    await expect(children).toHaveText(['Second child', 'First child']);
    await page.keyboard.press('Control+z');
    await expect(children).toHaveText(['First child', 'Second child']);

    await children.first().hover();
    const tailBounds = (await tail.boundingBox())!;
    await handle.dragTo(tail, { targetPosition: { x: 8, y: tailBounds.height - 2 } });
    await expect(children).toHaveText(['Second child']);
    await expect(page.locator('.pm-document > p')).toHaveText(['Tail', 'First child']);
    await page.keyboard.press('Control+z');
    await expect(children).toHaveText(['First child', 'Second child']);

    await tail.hover();
    const groupBounds = (await group.boundingBox())!;
    await page.mouse.move(groupBounds.x - 72, groupBounds.y + 10);
    await expect(handle).toHaveAttribute('data-block-pos', '0');
    expect(childGripX - (await handle.boundingBox())!.x).toBe(48);
    await children.first().hover();
    await expect(handle).toHaveAttribute('data-block-pos', '1');
    await page.mouse.move(groupBounds.x - 72, groupBounds.y + 10);
    await expect(handle).toHaveAttribute('data-block-pos', '0');
    await handle.click();
    await expect(page.locator('.pm-block-menu .pm-block-type')).toHaveText('Native div');
    await expect(page.getByRole('menuitem', { name: 'Properties…', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.mouse.move(groupBounds.x - 72, groupBounds.y + 10);
    await handle.dragTo(tail, { targetPosition: { x: 8, y: tailBounds.height - 2 } });
    await expect(page.locator('.pm-document > :last-child')).toHaveClass(/pm-object-fenced_div/);
    await expect(children).toHaveText(['First child', 'Second child']);
    const saved = async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body;
    // Existing source separators travel with moved blocks, including a leading
    // separator when Tail becomes the first block.
    await expect.poll(async () => (await saved()).trimStart()).toBe(`Tail\n\n${source.slice(0, source.lastIndexOf('\n\nTail'))}`);
    await page.reload();
    await expect(children).toHaveText(['First child', 'Second child']);
    await expect(group).toHaveCSS('border-top-width', '0px');
    await page.mouse.move(10, 10);
    await group.screenshot({ path: `test-results/div-${encoding}-borderless.png` });
  });
}
