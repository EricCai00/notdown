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
  await panel.getByLabel("Date format", { exact: true }).selectOption("iso");
  await panel.getByLabel("Time format", { exact: true }).selectOption("24");
  await panel.getByLabel("Timezone", { exact: true }).selectOption("+08:00");
  const chipRect = (await chip.boundingBox())!, panelRect = (await panel.boundingBox())!;
  expect(panelRect.y).toBeGreaterThanOrEqual(chipRect.y + chipRect.height);
  expect(panelRect.y + panelRect.height).toBeLessThanOrEqual(992);
  await page.screenshot({ path: "test-results/date-calendar.png" });
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await expect(chip).toHaveText("@2030-06-15 14:30 → 2030-06-18 09:00");
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).body,
    )
    .toContain('reminder="2030-06-15T06:00:00.000Z"');
  await page.reload();
  await expect(chip).toHaveText("@2030-06-15 14:30 → 2030-06-18 09:00");
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

test.describe("Notion date presentation", () => {
  test.use({ timezoneId: "America/Los_Angeles" });
  for (const variant of ["notdown", "notion-markdown"] as const) test(`${variant}: imported dates retain @, relative text and fields through editing`, async ({ page, request }, testInfo) => {
    await page.clock.setFixedTime(new Date("2026-10-26T19:00:00Z"));
    const source = '<date start="2026-10-23" /> <date start="2026-10-24" start-time="09:00" time-zone="America/Los_Angeles" future="keep" />';
    const note = await (await request.post("/api/pages", { data: { title: "Notion date presentation", body: source, syntax: { version: 1, variant, notionVersion: "v2", extensions: {} } } })).json();
    await page.goto(`/#page/${note.id}`);
    const dates = page.locator(".pm-document .pm-date-mention");
    await expect(dates).toHaveCount(2);
    await expect(dates.first()).toHaveText("@Last Friday");
    await expect(dates.last()).toHaveText("@Last Saturday 9:00 AM");
    await expect(dates.last()).toHaveAttribute("title", /America\/Los_Angeles/);
    await expect(dates.last()).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(dates.last()).toHaveCSS("color", "rgb(124, 122, 118)");
    await expect(dates.last().locator("svg")).toHaveCount(0);
    await page.keyboard.press("Control+s");
    expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(source);
    await page.screenshot({ path: testInfo.outputPath("imported-dates.png") });
    await dates.last().click();
    const panel = page.getByRole("dialog", { name: "Edit date", exact: true });
    await expect(panel.getByLabel("Start time", { exact: true })).toHaveValue("09:00");
    await expect(panel.getByLabel("Start time", { exact: true })).toBeEditable();
    await expect(panel.getByLabel("Timezone", { exact: true })).toHaveValue("America/Los_Angeles");
    await expect(panel.getByLabel("Remind", { exact: true })).toHaveCount(variant === "notdown" ? 1 : 0);
    await panel.getByLabel("Start date", { exact: true }).fill("2026-10-25");
    await panel.getByRole("button", { name: "Done", exact: true }).click();
    await expect(dates.last()).toHaveText("@Yesterday 9:00 AM");
    await page.keyboard.press("Control+s");
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('start="2026-10-25"');
    const saved = (await (await request.get(`/api/pages/${note.id}`)).json()).body;
    for (const attr of ['start-time="09:00"', 'time-zone="America/Los_Angeles"', 'future="keep"']) expect(saved).toContain(attr);
    expect(saved).not.toMatch(/reminder|date-format|time-format/);
    await page.reload();
    await expect(dates.last()).toHaveText("@Yesterday 9:00 AM");
  });

  test("reminders keep @ and trailing alarms; Today and elapsed reminders turn red while plain dates stay gray", async ({ page, request }, testInfo) => {
    await page.clock.setFixedTime(new Date("2026-10-26T19:00:00Z"));
    await open(page, request, [
      '<mention-date start="2026-10-24"/>',
      '<mention-date start="2026-10-24T09:00:00-07:00" reminder="2026-10-24T16:00:00Z"/>',
      '<mention-date start="2026-10-28T09:00:00-07:00" reminder="2026-10-28T16:00:00Z"/>',
      '<mention-date start="2026-10-26T23:00:00-07:00" reminder="2026-10-27T06:00:00Z"/>',
      '<mention-date start="2026-10-24" reminder="invalid"/>',
    ].join("\n\n"));
    const dates = page.locator(".pm-document .pm-date-mention");
    await expect(dates).toHaveCount(5);
    await expect(dates.nth(0)).toHaveText("@Last Saturday");
    await expect(dates.nth(0)).toHaveCSS("color", "rgb(124, 122, 118)");
    await expect(dates.nth(1)).toHaveText("@Last Saturday 9:00 AM");
    await expect(dates.nth(1)).toHaveCSS("color", "rgb(213, 108, 94)");
    await expect(dates.nth(2)).toHaveText("@Next Wednesday 9:00 AM");
    await expect(dates.nth(2)).toHaveCSS("color", "rgb(35, 131, 226)");
    await expect(dates.nth(3)).toHaveText("@Today 11:00 PM");
    await expect(dates.nth(3)).toHaveCSS("color", "rgb(213, 108, 94)");
    await expect(dates.nth(4)).toHaveCSS("color", "rgb(124, 122, 118)");
    for (const index of [1, 2, 3]) {
      await expect(dates.nth(index).locator("svg")).toHaveCount(1);
      expect(await dates.nth(index).evaluate(el => el.firstChild?.nodeType === Node.TEXT_NODE && el.lastChild?.nodeName.toLowerCase() === "svg")).toBe(true);
      expect(await dates.nth(index).locator("svg").evaluate(el => el.namespaceURI)).toBe("http://www.w3.org/2000/svg");
    }
    await page.screenshot({ path: testInfo.outputPath("date-reminder-states.png") });
  });

  test("imported split-field dates expose complete reminder/time controls and save real reminders in their IANA zone", async ({ page, request }, testInfo) => {
    await page.clock.setFixedTime(new Date("2026-10-26T19:00:00Z"));
    const source = '<date start="2026-10-24" start-time="09:00" time-zone="America/Los_Angeles" future="keep" />';
    const note = await (await request.post("/api/pages", { data: { title: "Imported reminder", body: source, syntax: { version: 1, variant: "notdown", notionVersion: "v2", extensions: {} } } })).json();
    await page.goto(`/#page/${note.id}`);
    const chip = page.locator(".pm-document .pm-date-mention"), panel = page.getByRole("dialog", { name: "Edit date", exact: true });
    await chip.click();
    await expect(panel.getByRole("switch", { name: "Include time" })).toBeChecked();
    for (const label of ["Date format", "Time format", "Timezone", "Remind"]) await expect(panel.getByLabel(label, { exact: true })).toBeVisible();
    for (const value of ["0", "5", "10", "15", "30", "60", "120", "1440", "2880"]) await expect(panel.getByLabel("Remind", { exact: true }).locator(`option[value="${value}"]`)).toHaveCount(1);
    await panel.getByLabel("Remind", { exact: true }).selectOption("0");
    await expect(chip).toHaveClass(/pm-date-overdue/);
    await expect(chip.locator("svg")).toHaveCount(1);
    await panel.screenshot({ path: testInfo.outputPath("complete-imported-date-menu.png") });
    await panel.getByLabel("Start date", { exact: true }).fill("2026-11-02");
    await panel.getByLabel("Start time", { exact: true }).fill("10:15");
    await panel.getByLabel("Remind", { exact: true }).selectOption("10");
    await panel.getByLabel("Date format", { exact: true }).selectOption("iso");
    await panel.getByLabel("Time format", { exact: true }).selectOption("24");
    await panel.getByRole("button", { name: "Done", exact: true }).click();
    await expect(chip).toHaveText("@2026-11-02 10:15");
    await page.keyboard.press("Control+s");
    const body = async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body as string;
    await expect.poll(body).toContain('reminder="2026-11-02T18:05:00.000Z"');
    for (const attr of ['start-time="10:15"', 'time-zone="America/Los_Angeles"', 'future="keep"']) expect(await body()).toContain(attr);
    await page.reload(); await expect(chip.locator("svg")).toHaveCount(1); await chip.click();
    await expect(panel.getByLabel("Remind", { exact: true })).toHaveValue("10");
    await panel.getByLabel("Timezone", { exact: true }).selectOption("Asia/Shanghai");
    await panel.getByRole("switch", { name: "End date", exact: true }).check();
    await panel.getByRole("textbox", { name: "End date", exact: true }).fill("2026-11-03");
    await panel.getByLabel("End time", { exact: true }).fill("11:00");
    await panel.getByRole("switch", { name: "Include time" }).uncheck();
    await expect(panel.getByLabel("Start time", { exact: true })).toHaveCount(0);
    await panel.getByRole("switch", { name: "Include time" }).check();
    await panel.getByLabel("Remind", { exact: true }).selectOption("none");
    await panel.getByRole("button", { name: "Done", exact: true }).click();
    await expect(chip.locator("svg")).toHaveCount(0);
    await page.keyboard.press("Control+s");
    await expect.poll(body).not.toContain("reminder=");
    expect(await body()).toContain('time-zone="Asia/Shanghai"');
    expect(await body()).toContain('end-time="09:00"');
    expect(await body()).toContain('future="keep"');
  });

  test("official split-field time edits stay within official syntax and formatting stays session-only", async ({ page, request }) => {
    const note = await (await request.post("/api/pages", { data: { title: "Official date", body: '<date start="2026-10-24" />', syntax: { version: 1, variant: "notion-markdown", notionVersion: "v2", extensions: {} } } })).json();
    await page.goto(`/#page/${note.id}`);
    await page.locator(".pm-date-mention").click();
    const panel = page.getByRole("dialog", { name: "Edit date", exact: true });
    await panel.getByRole("switch", { name: "Include time" }).check();
    await panel.getByLabel("Start time", { exact: true }).fill("13:30");
    await panel.getByLabel("Timezone", { exact: true }).selectOption("Asia/Shanghai");
    await panel.getByLabel("Date format", { exact: true }).selectOption("iso");
    await panel.getByLabel("Time format", { exact: true }).selectOption("24");
    await panel.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.locator(".pm-date-mention")).toHaveText("@2026-10-24 13:30");
    await page.keyboard.press("Control+s");
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('start-time="13:30"');
    const saved = (await (await request.get(`/api/pages/${note.id}`)).json()).body;
    expect(saved).toContain('time-zone="Asia/Shanghai"'); expect(saved).not.toMatch(/date-format|time-format|reminder/);
  });
});
