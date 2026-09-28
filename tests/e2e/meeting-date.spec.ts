import { test, expect } from "@playwright/test";

const mention = '<mention-date start="2030-06-15" future="keep">Review</mention-date>';
const body = `<meeting-notes>\n\tMeeting ${mention} and <mention-date start="2031-01-01"/>\n\t<notes>\n\t\tAgenda\n\t</notes>\n</meeting-notes>\n\nInline ${mention}`;

for (const variant of ["notdown", "notion-markdown"] as const) test(`${variant}: meeting dates reuse the mention panel and preserve their title`, async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const note = await (await request.post("/api/pages", { data: { title: "Shared date picker", body, bodyFormat: "notion-markdown", syntax: { version: 1, variant, extensions: {} } } })).json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id); await page.goto("/");
  const card = page.locator(".pm-object-meeting_notes"), date = card.locator("header .pm-date-mention").first();
  const panel = page.getByRole("dialog", { name: "Edit date", exact: true });
  await date.click(); await expect(panel).toHaveClass("pm-date-panel");
  await expect(page.locator(".meeting-calendar")).toHaveCount(0);
  await panel.getByLabel("Start date", { exact: true }).fill("2030-06-16");
  await panel.getByRole("switch", { name: "End date", exact: true }).check();
  await panel.getByRole("textbox", { name: "End date", exact: true }).fill("2030-06-18");
  if (variant === "notdown") {
    await panel.getByRole("switch", { name: "Include time" }).check();
    await panel.getByLabel("Start time", { exact: true }).fill("14:30");
    await panel.getByLabel("Remind", { exact: true }).selectOption("30");
    await panel.locator("summary").click();
    await panel.getByLabel("Date format", { exact: true }).selectOption("iso");
    await panel.getByLabel("Time format", { exact: true }).selectOption("24");
    await panel.getByLabel("Timezone", { exact: true }).selectOption("+08:00");
    await page.screenshot({ path: "test-results/meeting-shared-date.png" });
  } else {
    await expect(panel.getByRole("switch", { name: "Include time" })).toHaveCount(0);
    await expect(panel.getByLabel("Remind", { exact: true })).toHaveCount(0);
  }
  await panel.getByRole("textbox", { name: "End date", exact: true }).fill("2030-06-19");
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await page.keyboard.press("Control+z"); await expect(date).toContainText("18");
  await page.keyboard.press("Control+Shift+z"); await expect(date).toContainText("19");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('end="2030-06-19');
  const saved = (await (await request.get(`/api/pages/${note.id}`)).json()).body;
  expect(saved.split("\n")[1]).toContain('future="keep"'); expect(saved.split("\n")[1]).toContain('>Review</mention-date>'); expect(saved).toContain('start="2031-01-01"'); expect(saved).toContain(`Inline ${mention}`);
  if (variant === "notdown") expect(saved).toContain('reminder="2030-06-16T06:00:00.000Z"');
  else { expect(saved).not.toContain("reminder"); expect(saved).not.toContain("date-format"); }
  await page.reload(); await expect(date).toContainText("→"); await date.click();
  await panel.getByRole("button", { name: "Clear date", exact: true }).click(); await expect(card.locator("header .pm-date-mention")).toHaveCount(1);
  await page.keyboard.press("Control+z"); await expect(card.locator("header .pm-date-mention")).toHaveCount(2);
  await date.click(); await page.keyboard.press("Control+e"); await expect(panel).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("inline and meeting date panels have identical controls and styles", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: { title: "Same calendar", body, bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: {} } } })).json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id); await page.goto("/");
  const chips = page.locator(".pm-date-mention"), panel = page.locator(".pm-date-panel");
  await chips.last().click(); const inline = await panel.innerHTML();
  await panel.screenshot({ path: "test-results/inline-shared-calendar.png" });
  await page.keyboard.press("Escape"); await chips.first().click();
  expect(await panel.innerHTML()).toBe(inline);
  await panel.screenshot({ path: "test-results/meeting-shared-calendar.png" });
  await page.setViewportSize({ width: 420, height: 740 }); const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(8); expect(box.x + box.width).toBeLessThanOrEqual(412);
  await panel.getByRole("button", { name: "Clear date" }).click();
  await page.locator(".pm-object-meeting_notes header .pm-date-mention").click();
  await panel.getByRole("button", { name: "Clear date" }).click();
  await page.locator(".pm-object-meeting_notes").getByRole("button", { name: "Meeting settings", exact: true }).click();
  await page.getByRole("menuitem", { name: "Add date", exact: true }).click();
  await expect(panel).toBeVisible(); await expect(panel.getByLabel("Remind", { exact: true })).toBeVisible();
});
