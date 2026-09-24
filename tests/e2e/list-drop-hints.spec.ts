import { expect, test, type Locator, type Page } from "@playwright/test";

async function startDrag(page: Page, source: Locator) {
  await source.hover({ position: { x: 2, y: 10 } });
  const grip = await page.locator(".pm-block-handle").boundingBox();
  expect(grip).not.toBeNull();
  const x = grip!.x + grip!.width / 2;
  const y = grip!.y + grip!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 10, y, { steps: 4 });
}

async function preview(page: Page, target: Locator, inside: boolean, before = false) {
  const box = (await target.boundingBox())!;
  const x = box.x + (inside ? 60 : 8);
  const y = box.y + (before ? 2 : box.height - 2);
  await page.mouse.move(x, y, { steps: 10 });
  // Chrome requires another movement to deliver dragover after dragenter.
  await page.mouse.move(x, y);
  const line = page.locator(".pm-drop-line");
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("data-placement", inside ? "inside" : before ? "before" : "after");
  return line;
}

async function expectHint(line: Locator, target: Locator, inside: boolean, before = false) {
  const targetBox = await target.evaluate((row) => {
    const item = row.closest("li")!;
    const list = item.parentElement!.getBoundingClientRect();
    const bounds = item.getBoundingClientRect();
    return { left: list.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, childLeft: row.getBoundingClientRect().left };
  });
  const hint = await line.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const overlay = getComputedStyle(element, "::after");
    return { left: rect.left, right: rect.right, top: rect.top, color: getComputedStyle(element).backgroundColor,
      overlay: overlay.content, overlayColor: overlay.backgroundColor, indent: parseFloat(overlay.left) };
  });
  expect(hint.left).toBeCloseTo(targetBox.left, 0);
  expect(hint.right).toBeCloseTo(targetBox.right, 0);
  expect(hint.top).toBeCloseTo(before ? targetBox.top : targetBox.bottom, 0);
  expect(hint.color).toBe("rgb(166, 207, 245)");
  if (inside) {
    expect(hint.overlay).toBe('""');
    expect(hint.overlayColor).toBe("rgb(91, 159, 225)");
    expect(hint.left + hint.indent).toBeCloseTo(targetBox.childLeft, 0);
  } else {
    expect(hint.overlay).toBe("none");
  }
}

for (const [name, marker] of [["bullet", "-"], ["numbered", "1."], ["task", "- [ ]"]]) {
  test(`${name} list hints distinguish sibling and child drops and follow existing children`, async ({ page, request }, testInfo) => {
    const response = await request.post("/api/pages", { data: {
      title: `${name} drop hints`, body: `${marker} Parent\n  ${marker} Child\n${marker} Tail\n${marker} Moving\n`,
      syntax: { version: 1, variant: "notdown", extensions: {} },
    } });
    expect(response.status(), await response.text()).toBe(201);
    const note = await response.json();
    await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
    await page.goto("/");
    const editor = page.locator("#editor .pm-document");
    const row = (text: string) => editor.locator("li > .pm-item-content > p").filter({ hasText: new RegExp(`^${text}$`) });
    await expect(row("Moving")).toBeVisible();
    await startDrag(page, row("Moving"));
    let line = await preview(page, row("Parent"), false);
    await expectHint(line, row("Parent"), false);
    // Moving across the same row must toggle the second layer without retaining it.
    line = await preview(page, row("Parent"), true);
    await expectHint(line, row("Parent"), true);
    line = await preview(page, row("Parent"), false);
    await expectHint(line, row("Parent"), false);
    if (name === "bullet") await page.screenshot({ path: testInfo.outputPath("sibling-hint.png") });
    await page.mouse.up();
    await expect(line).toBeHidden();
    await expect(editor.locator(":scope > :is(ul, ol) > li > .pm-item-content > p")).toHaveText(["Parent", "Moving", "Tail"]);
    await expect(row("Parent").locator("..").locator(":scope > :is(ul, ol) > li > .pm-item-content > p")).toHaveText(["Child"]);

    await startDrag(page, row("Moving"));
    line = await preview(page, row("Parent"), true);
    await expectHint(line, row("Parent"), true);
    if (name === "bullet") await page.screenshot({ path: testInfo.outputPath("child-hint.png") });
    await page.mouse.up();
    await expect(line).toBeHidden();
    await expect(row("Parent").locator("..").locator(":scope > :is(ul, ol) > li > .pm-item-content > p")).toHaveText(["Child", "Moving"]);

    // A nested sibling uses its own list edge, rather than the document edge.
    await startDrag(page, row("Tail"));
    line = await preview(page, row("Child"), false, true);
    await expectHint(line, row("Child"), false, true);
    await page.mouse.up();
    await expect(line).toBeHidden();
    await expect(row("Parent").locator("..").locator(":scope > :is(ul, ol) > li > .pm-item-content > p")).toHaveText(["Tail", "Child", "Moving"]);
    await page.keyboard.press("Control+s");
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toMatch(/Parent\n\s+.*Tail\n\s+.*Child\n\s+.*Moving/);
    await page.reload();
    await expect(row("Parent").locator("..").locator(":scope > :is(ul, ol) > li > .pm-item-content > p")).toHaveText(["Tail", "Child", "Moving"]);
  });
}

for (const fixture of [
  { name: "paragraphs", body: "Upper\n\nLower", upper: ":scope > p", lower: ":scope > p" },
  { name: "paragraph then code", body: "Upper\n\n```html\nLower\n```", upper: ":scope > p", lower: ":scope > .pm-code-block" },
  { name: "code then paragraph", body: "```html\nUpper\n```\n\nLower", upper: ":scope > .pm-code-block", lower: ":scope > p" },
  { name: "heading margin", body: "Upper\n\n## Lower", upper: ":scope > p", lower: ":scope > h2" },
  { name: "list start", body: "Upper\n\n- Lower", upper: ":scope > p", lower: "li > .pm-item-content > p" },
  { name: "list end", body: "- Upper\n\nLower", upper: "li > .pm-item-content > p", lower: ":scope > p" },
  { name: "inside a container", body: '<callout icon="❗">\n\tHeader\n\n\tUpper\n\n\tLower\n</callout>', upper: ".pm-callout-content > p", lower: ".pm-callout-content > p" },
]) {
  test(`${fixture.name}: both sides of a gap show one stable drop position`, async ({ page, request }, testInfo) => {
    const response = await request.post("/api/pages", { data: {
      title: `Shared drop gap: ${fixture.name}`, body: `${fixture.body}\n\nMoving`,
      syntax: { version: 1, variant: "notdown", extensions: {} },
    } });
    expect(response.status(), await response.text()).toBe(201);
    const note = await response.json();
    await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
    await page.goto("/");
    const editor = page.locator("#editor .pm-document");
    const upper = editor.locator(fixture.upper).filter({ hasText: "Upper" });
    const lower = editor.locator(fixture.lower).filter({ hasText: "Lower" });
    const moving = editor.locator("p").filter({ hasText: /^Moving$/ });
    await expect(moving).toBeVisible();
    let saved = "";
    for (const finishBefore of [false, true]) {
      await startDrag(page, moving);
      const line = await preview(page, upper, false);
      const afterBox = (await line.boundingBox())!;
      const upperBox = (await upper.boundingBox())!;
      const lowerBox = (await lower.boundingBox())!;
      expect(afterBox.y).toBeCloseTo((upperBox.y + upperBox.height + lowerBox.y) / 2, 0);
      await preview(page, lower, false, true);
      expect(await line.boundingBox()).toEqual(afterBox);
      // Crossing the whitespace in either direction must not make the hint jump.
      for (const y of [upperBox.y + upperBox.height + 1, lowerBox.y - 1]) {
        await page.mouse.move(upperBox.x + 8, y);
        await expect(line).toBeVisible();
        expect(await line.boundingBox()).toEqual(afterBox);
      }
      await preview(page, finishBefore ? lower : upper, false, finishBefore);
      if (fixture.name === "paragraph then code" && finishBefore) {
        await page.screenshot({ path: testInfo.outputPath("shared-gap.png") });
      }
      await page.mouse.up();
      await expect(line).toBeHidden();
      await page.keyboard.press("Control+s");
      await expect.poll(async () => {
        const body = (await (await request.get(`/api/pages/${note.id}`)).json()).body as string;
        return body.indexOf("Upper") < body.indexOf("Moving") && body.indexOf("Moving") < body.indexOf("Lower");
      }).toBe(true);
      const body = (await (await request.get(`/api/pages/${note.id}`)).json()).body as string;
      if (finishBefore) expect(body).toBe(saved);
      else {
        saved = body;
        await page.keyboard.press("Control+z");
        await expect(editor.locator(":scope > p").last()).toHaveText("Moving");
      }
    }
  });
}
