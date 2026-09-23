import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { expectSource } from "./source-helper";

async function open(page: Page, request: APIRequestContext, body = "") {
  const response = await request.post("/api/pages", {
    data: {
      title: "Date interactions",
      body,
      bodyFormat: "notion-markdown",
      syntax: { version: 1, variant: "notdown", extensions: {} },
    },
  });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.addInitScript(
    (id) => localStorage.setItem("notdown-page", id),
    note.id,
  );
  await page.goto("/");
  await expect(page.locator(".pm-document")).toBeVisible();
  return note;
}

test("slash date opens the screenshot-style placeholder and choices; date edits survive save and reload", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const note = await open(page, request);
  await page.locator(".pm-document").click();
  await page.keyboard.type("/date");
  await page.locator('[data-insert="date_or_reminder"]').click();
  const quick = page.getByRole("listbox", { name: "Date suggestions" });
  await expect(quick).toBeVisible();
  await expect(page.locator(".pm-date-query")).toBeFocused();
  await expect(quick.getByRole("option")).toHaveCount(2);
  await page.screenshot({ path: "test-results/date-quick.png" });
  await quick.getByRole("option").first().click();
  const chip = page.locator(".pm-date-mention");
  await expect(chip).toContainText("Today");
  await chip.click();
  const panel = page.getByRole("dialog", { name: "Edit date", exact: true });
  await panel
    .getByRole("textbox", { name: "Start date", exact: true })
    .fill("2030-06-15");
  await panel.getByRole("switch", { name: "End date", exact: true }).check();
  await panel
    .getByRole("textbox", { name: "End date", exact: true })
    .fill("2030-06-18");
  await panel.getByRole("switch", { name: "Include time" }).check();
  await panel.getByLabel("Start time", { exact: true }).fill("14:30");
  await panel.getByLabel("Remind", { exact: true }).selectOption("30");
  await panel.locator("summary").click();
  await panel.getByLabel("Date format", { exact: true }).selectOption("iso");
  await panel.getByLabel("Time format", { exact: true }).selectOption("24");
  await panel.getByLabel("Timezone", { exact: true }).selectOption("+08:00");
  const chipRect = (await chip.boundingBox())!, panelRect = (await panel.boundingBox())!;
  expect(panelRect.y).toBeGreaterThanOrEqual(chipRect.y + chipRect.height);
  expect(panelRect.y + panelRect.height).toBeLessThanOrEqual(992);
  await page.screenshot({ path: "test-results/date-calendar.png" });
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await expect(chip).toHaveText("2030-06-15 14:30 → 2030-06-18 09:00");
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).body,
    )
    .toContain('reminder="2030-06-15T06:00:00.000Z"');
  await page.reload();
  await expect(chip).toHaveText("2030-06-15 14:30 → 2030-06-18 09:00");
  expect(errors).toEqual([]);
});

test("@ date keyboard completion, cancellation and code boundaries", async ({
  page,
  request,
}) => {
  await open(page, request);
  await page.locator(".pm-document").click();
  await page.keyboard.type("@remind tomorrow 9am");
  await page.keyboard.press("Enter");
  await expect(page.locator(".pm-date-reminder")).toContainText(
    "Tomorrow 9:00 AM",
  );
  await page.keyboard.type(" tail @today");
  await page.keyboard.press("Escape");
  await page.keyboard.type(" unchanged");
  await expect(page.locator(".pm-document")).toContainText("@today unchanged");
  await page.keyboard.press("Control+e");
  await expectSource(page, /<mention-date/);
  await expect(page.locator(".pm-date-panel")).toHaveCount(0);
});

test("calendar preserves imported attributes, validates ranges, supports undo and fits narrow screens", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 420, height: 740 });
  const note = await open(
    page,
    request,
    'Before <mention-date start="2030-01-15" custom="keep">Original</mention-date> tail\n\n```text\n@today\n<mention-date start="unchanged"/>\n```',
  );
  const chip = page.locator(".pm-date-mention");
  await chip.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "Edit date", exact: true });
  const rect = (await panel.boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(8);
  expect(rect.x + rect.width).toBeLessThanOrEqual(412);
  expect(rect.y + rect.height).toBeLessThanOrEqual(732);
  await panel.getByRole("button", { name: "Next month" }).click();
  await panel.getByRole("button", { name: "2030-02-10", exact: true }).click();
  await panel.getByRole("switch", { name: "End date", exact: true }).check();
  await panel
    .getByRole("textbox", { name: "End date", exact: true })
    .fill("2030-02-01");
  await expect(panel.locator("output")).toContainText("End date must be");
  await panel
    .getByRole("textbox", { name: "End date", exact: true })
    .fill("2030-02-12");
  await page.keyboard.press("Control+e");
  await expectSource(page, /custom="keep"/);
  await expectSource(page, /end="2030-02-12"/);
  await expect(page.locator(".pm-date-panel")).toHaveCount(0);
  await page.keyboard.press("Control+e");
  await chip.click();
  await panel.getByRole("button", { name: "Clear date" }).click();
  await expect(chip).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(chip).toHaveCount(1);
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).body,
    )
    .toContain('<mention-date start="unchanged"/>');
});

test("date keyboard navigation and undo, empty cancellation and code typing stay isolated", async ({
  page,
  request,
}) => {
  await open(
    page,
    request,
    '<mention-date start="2030-01-15"/>\n\n```text\ncode\n```',
  );
  const chip = page.locator(".pm-date-mention");
  await chip.click();
  const panel = page.getByRole("dialog", { name: "Edit date", exact: true });
  await panel.getByRole("button", { name: "2030-01-15", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(
    panel.getByRole("textbox", { name: "Start date", exact: true }),
  ).toHaveValue("2030-01-16");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(chip).toContainText("January 15, 2030");
  await page.locator(".pm-document pre").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" @today");
  await expect(
    page.getByRole("listbox", { name: "Date suggestions" }),
  ).toHaveCount(0);
  await expect(page.locator(".pm-document pre")).toContainText("@today");
});

test("empty date cancellation does not reopen on reload and unknown values remain recoverable", async ({
  page,
  request,
}) => {
  const note = await open(
    page,
    request,
    '<mention-date/>\n\n<mention-date start="not-a-date" reminder="unknown" custom="preserve"/>',
  );
  const empty = page.locator(".pm-date-empty");
  await empty.click();
  await page.locator(".pm-date-query").fill("unrecognized date");
  await expect(
    page.getByRole("listbox", { name: "Date suggestions" }),
  ).toContainText("Try tomorrow");
  await page.keyboard.press("Escape");
  await expect(empty).toContainText("Mention a date");
  const invalid = page.locator(".pm-date-mention").last();
  await invalid.click();
  const panel = page.getByRole("dialog", { name: "Edit date", exact: true });
  await panel
    .getByRole("textbox", { name: "Start date", exact: true })
    .fill("2030-01-15");
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).body,
    )
    .toContain('custom="preserve"');
  await page.reload();
  await expect(empty).toHaveCount(1);
  await expect(page.locator(".pm-date-panel")).toHaveCount(0);
});
